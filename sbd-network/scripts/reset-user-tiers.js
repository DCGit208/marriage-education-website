#!/usr/bin/env node
/**
 * reset-user-tiers.js
 * ONE-TIME MIGRATION — removes the stale `tier` field from all user documents.
 *
 * Why: The old system wrote `tier: 'elite'` (or another tier) directly onto user docs.
 * The new system determines tier ONLY from `subscription.status + subscription.endDate`.
 * Having a bare `tier` field on user docs bypasses subscription gating.
 *
 * What this script does:
 *   - Reads every doc in the `users` collection
 *   - Deletes the `tier` field from every doc (using FieldValue.delete())
 *   - Sets `role: 'admin'` on the admin account (sbdpursuit@gmail.com) so they retain elite access
 *   - Does NOT touch the `subscription` object
 *
 * Safe to re-run — deleting a non-existent field is a no-op.
 *
 * Run: node scripts/reset-user-tiers.js
 */

const admin = require('firebase-admin');
const path  = require('path');

const serviceAccountPath = path.resolve(__dirname, '../../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });

const db = admin.firestore();
const ADMIN_EMAIL = 'sbdpursuit@gmail.com';

async function run() {
  const snap = await db.collection('users').get();
  if (snap.empty) { console.log('No users found.'); return; }

  const batch = db.batch();
  let count = 0;

  snap.forEach(doc => {
    const data = doc.data();
    const update = { tier: admin.firestore.FieldValue.delete() };

    // Ensure the admin account always has `role: 'admin'`
    if (data.email === ADMIN_EMAIL) {
      update.role = 'admin';
    }

    batch.update(doc.ref, update);
    count++;
  });

  await batch.commit();
  console.log(`✅ Removed stale 'tier' field from ${count} user doc(s).`);
  console.log(`   ${ADMIN_EMAIL} has been set to role: 'admin' — elite access via code, no subscription required.`);
}

run().catch(err => { console.error(err); process.exit(1); });
