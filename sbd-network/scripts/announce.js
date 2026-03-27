#!/usr/bin/env node
// ================================================================
// POST-DEPLOY ANNOUNCEMENT SCRIPT
// ================================================================
// Reads changelog.json and writes a Firestore notification for every
// user in the database, so they all see "What's New" in their
// notification bell on next open.
//
// Usage:
//   node scripts/announce.js
//
// Run after: firebase deploy --only hosting
//
// Requires serviceAccountKey.json one level above the repo root:
//   ../../serviceAccountKey.json
//
// ================================================================

const admin  = require('firebase-admin');
const fs     = require('fs');
const path   = require('path');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');
const CHANGELOG_PATH  = path.resolve(__dirname, '../public/changelog.json');

// ── Init Firebase Admin ──────────────────────────────────────────
if (!fs.existsSync(SERVICE_ACCOUNT)) {
  console.error('❌  serviceAccountKey.json not found at:', SERVICE_ACCOUNT);
  console.error('    Download it from Firebase Console → Project Settings → Service accounts.');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Load changelog ───────────────────────────────────────────────
if (!fs.existsSync(CHANGELOG_PATH)) {
  console.error('❌  public/changelog.json not found');
  process.exit(1);
}

const log = JSON.parse(fs.readFileSync(CHANGELOG_PATH, 'utf8'));
const current = String(log.current || '');
const entry   = (log.versions || []).find(v => String(v.version) === current);

if (!entry) {
  console.error(`❌  No entry in changelog.json for version "${current}"`);
  process.exit(1);
}

const notifTitle = `${entry.emoji || '🚀'} v${current} — ${entry.title}`;
const notifBody  = (entry.changes || [])
  .map(c => c.replace(/^[\p{Emoji}\p{Emoji_Presentation}]+\s*/u, ''))
  .join(' · ');

console.log(`\n📢  Broadcasting release notes for version ${current}:`);
console.log(`    Title : ${notifTitle}`);
console.log(`    Body  : ${notifBody.slice(0, 120)}…\n`);

// ── Fetch all user IDs ───────────────────────────────────────────
async function run() {
  const usersSnap = await db.collection('users').get();
  const uids = usersSnap.docs.map(d => d.id);
  console.log(`    Found ${uids.length} users — writing notifications…`);

  const BATCH_SIZE = 400; // Firestore batch limit is 500
  let written = 0;

  for (let i = 0; i < uids.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = uids.slice(i, i + BATCH_SIZE);

    chunk.forEach(uid => {
      const ref = db.collection('notifications').doc();
      batch.set(ref, {
        type:      'announcement',
        title:     notifTitle,
        body:      notifBody,
        userId:    uid,
        version:   current,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        read:      false,
      });
    });

    await batch.commit();
    written += chunk.length;
    process.stdout.write(`    ✓ ${written}/${uids.length} notifications written\r`);
  }

  console.log(`\n\n✅  Release notes for v${current} sent to ${written} users.\n`);
  process.exit(0);
}

run().catch(err => {
  console.error('\n❌  Error:', err.message);
  process.exit(1);
});
