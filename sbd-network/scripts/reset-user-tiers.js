#!/usr/bin/env node
/**
 * reset-user-tiers.js
 * Resets SBD Network ambassador users to free tier.
 *
 * Background: The backfill script provisioned ALL ambassadors with Foundation-tier
 * access. Only the EXEMPT accounts below should keep active access.
 * Everyone else is reset to free (subscription.status = 'inactive').
 *
 * Run: node scripts/reset-user-tiers.js
 */

const admin = require('firebase-admin');
const path  = require('path');

const serviceAccountPath = path.resolve(__dirname, '../../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });

const db   = admin.firestore();
const auth = admin.auth();

// These accounts keep their current tier — everyone else goes to free
const EXEMPT_EMAILS = new Set([
  'promimbih2025@gmail.com',
  'ayinwifaithful@gmail.com',
  'adelachu@email.com',
  'sbdpursuit@gmail.com',   // administrator
]);

async function run() {
  console.log('Fetching ambassadors…');
  const ambSnap = await db.collection('ambassadors').get();
  console.log(`Found ${ambSnap.size} ambassadors.`);

  let reset = 0, skipped = 0, notFound = 0, errors = 0;

  for (const ambDoc of ambSnap.docs) {
    const data   = ambDoc.data();
    const email  = (data.email || '').trim().toLowerCase();
    const code   = data.code || data.ambassadorCode || ambDoc.id;

    if (!email) { console.log(`  SKIP ${code} — no email`); skipped++; continue; }
    if (EXEMPT_EMAILS.has(email)) {
      console.log(`  EXEMPT ${code} (${email})`);
      skipped++;
      continue;
    }

    // Find the users/ doc by email via Auth UID
    try {
      let uid;
      try {
        const userRecord = await auth.getUserByEmail(email);
        uid = userRecord.uid;
      } catch (_) {
        console.log(`  NOT FOUND in Auth: ${code} (${email})`);
        notFound++;
        continue;
      }

      const userRef  = db.collection('users').doc(uid);
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        console.log(`  NO users/ doc: ${code} (${email})`);
        notFound++;
        continue;
      }

      await userRef.update({
        'subscription.status': 'inactive',
        'subscription.tier':   'free',
      });

      console.log(`  RESET ${code} (${email})`);
      reset++;
    } catch (err) {
      console.error(`  ERROR ${code} (${email}):`, err.message);
      errors++;
    }
  }

  console.log('\n──────────────────────────────');
  console.log(`Reset:     ${reset}`);
  console.log(`Exempted:  ${skipped}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Errors:    ${errors}`);
}

run().catch(err => { console.error(err); process.exit(1); });
