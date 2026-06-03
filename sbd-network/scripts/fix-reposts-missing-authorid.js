#!/usr/bin/env node
/**
 * One-time cleanup: fix repost documents missing authorId.
 *
 * Usage:
 *   node scripts/fix-reposts-missing-authorid.js --dry-run
 *   node scripts/fix-reposts-missing-authorid.js
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const BATCH_SIZE = 400;

const serviceAccountCandidates = [
  path.resolve(__dirname, '../../serviceAccountKey.json'),
  path.resolve(__dirname, '../../../serviceAccountKey.json'),
];

const serviceAccountPath = serviceAccountCandidates.find((p) => fs.existsSync(p));
if (!serviceAccountPath) {
  console.error('Missing serviceAccountKey.json. Checked:');
  serviceAccountCandidates.forEach((p) => console.error(' -', p));
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
});

const db = admin.firestore();

function hasAuthorId(data) {
  return typeof data.authorId === 'string' && data.authorId.trim().length > 0;
}

function deriveFallbackAuthorId(data) {
  const nestedAuthorId = data?.repostedFrom?.authorId;
  if (typeof nestedAuthorId === 'string' && nestedAuthorId.trim()) return nestedAuthorId.trim();
  return null;
}

async function main() {
  console.log(`\n[fix-reposts-missing-authorid] starting (dryRun=${DRY_RUN})`);

  const repostSnap = await db.collection('posts')
    .where('repostedFrom', '!=', null)
    .get();

  if (repostSnap.empty) {
    console.log('No repost documents found.');
    return;
  }

  let scanned = 0;
  let missingAuthor = 0;
  let fixed = 0;
  let skipped = 0;
  let batch = db.batch();
  let ops = 0;

  for (const doc of repostSnap.docs) {
    scanned++;
    const data = doc.data() || {};

    if (hasAuthorId(data)) continue;

    missingAuthor++;
    const fallbackAuthorId = deriveFallbackAuthorId(data);
    if (!fallbackAuthorId) {
      skipped++;
      console.warn(`Skipping ${doc.id}: no fallback authorId available`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`[DRY] would set authorId for ${doc.id} -> ${fallbackAuthorId}`);
      fixed++;
      continue;
    }

    batch.update(doc.ref, {
      authorId: fallbackAuthorId,
      fixedAuthorIdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    ops++;
    fixed++;

    if (ops >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (!DRY_RUN && ops > 0) {
    await batch.commit();
  }

  console.log('\n[fix-reposts-missing-authorid] done');
  console.log(`scanned=${scanned}`);
  console.log(`missingAuthorId=${missingAuthor}`);
  console.log(`fixed=${fixed}`);
  console.log(`skipped=${skipped}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Cleanup failed:', err);
    process.exit(1);
  });
