#!/usr/bin/env node
/**
 * Backfill authorId on Telegram-imported posts (have sourceMsgId, missing authorId).
 *
 *   node scripts/fix-imported-posts-authorid.js --dry-run
 *   node scripts/fix-imported-posts-authorid.js
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 400;

const serviceAccountCandidates = [
  path.resolve(__dirname, '../../serviceAccountKey.json'),
  path.resolve(__dirname, '../../../serviceAccountKey.json'),
];

const serviceAccountPath = serviceAccountCandidates.find((p) => fs.existsSync(p));
if (!serviceAccountPath) {
  console.error('Missing serviceAccountKey.json');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });
const db = admin.firestore();

const nameToId = new Map();

async function buildNameIndex() {
  const snap = await db.collection('users').get();
  for (const doc of snap.docs) {
    const u = doc.data();
    const name = (u.name || '').trim();
    if (name) nameToId.set(name.toLowerCase(), doc.id);
    const norm = name.toLowerCase().replace(/\s+/g, '');
    if (norm) nameToId.set(norm, doc.id);
    const email = (u.email || '').split('@')[0].toLowerCase();
    if (email) nameToId.set(email, doc.id);
  }
  console.log(`Indexed ${nameToId.size} name keys from ${snap.size} users`);
}

function resolveAuthorId(data) {
  if (data.authorId) return data.authorId;
  const name = (data.authorName || '').trim();
  if (!name) return null;
  return nameToId.get(name.toLowerCase()) || nameToId.get(name.toLowerCase().replace(/\s+/g, '')) || null;
}

async function main() {
  await buildNameIndex();

  const snap = await db.collection('posts').where('sourceMsgId', '>', 0).get();
  console.log(`Found ${snap.size} imported posts (sourceMsgId present)`);

  let missing = 0;
  let fixed = 0;
  let unresolved = 0;
  let batch = db.batch();
  let ops = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.authorId) continue;
    missing++;

    const authorId = resolveAuthorId(data);
    if (!authorId) {
      unresolved++;
      if (unresolved <= 10) {
        console.warn(`  unresolved: ${doc.id} authorName="${data.authorName || ''}"`);
      }
      continue;
    }

    if (DRY_RUN) {
      console.log(`[DRY] ${doc.id} -> authorId ${authorId} (${data.authorName})`);
      fixed++;
      continue;
    }

    batch.update(doc.ref, {
      authorId,
      authorIdBackfilledAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    ops++;
    fixed++;

    if (ops >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (!DRY_RUN && ops > 0) await batch.commit();

  console.log('\nDone');
  console.log(`missing authorId=${missing} fixed=${fixed} unresolved=${unresolved} dryRun=${DRY_RUN}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
