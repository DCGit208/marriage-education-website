#!/usr/bin/env node
/**
 * backfill-sbd-referral-codes.js
 * ONE-TIME backfill — generates SBD referral codes for all existing active ambassadors
 * who don't have one yet, and ensures they have a Foundation-tier users/ doc on
 * sbd-network.web.app.
 *
 * What it does per ambassador:
 *   1. Skips if `sbdReferralCode` already set
 *   2. Derives sbdReferralCode from ambassadorCode (AMB-XXXX-NNNN → SBD-XXXX-NNNN)
 *   3. Writes sbdReferralCode + sbdReferrals + sbdAccessProvisioned back to ambassadors/ doc
 *   4. Finds the Firebase Auth UID by email (creates the auth user if missing)
 *   5. Merges Foundation-tier subscription into users/ doc
 *
 * Run from sbd-network/scripts/: node backfill-sbd-referral-codes.js
 * Safe to re-run — already-processed ambassadors are skipped.
 */

const admin = require('firebase-admin');
const path  = require('path');

const serviceAccountPath = path.resolve(__dirname, '../../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });

const db   = admin.firestore();
const auth = admin.auth();

// ── Helpers ───────────────────────────────────────────────────────

function deriveSBDCode(ambassadorCode) {
  // AMB-MAKO-0599 → SBD-MAKO-0599
  return ambassadorCode.replace(/^AMB-/, 'SBD-');
}

async function getOrCreateAuthUser(email, fullName) {
  try {
    const existing = await auth.getUserByEmail(email.toLowerCase());
    return { uid: existing.uid, created: false };
  } catch (_) {
    // Not found — create with random temp password
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    const tempPassword = Array.from({ length: 14 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join('');

    const record = await auth.createUser({
      email: email.toLowerCase(),
      password: tempPassword,
      displayName: fullName || email,
      emailVerified: false,
    });
    return { uid: record.uid, created: true };
  }
}

// ── Main ──────────────────────────────────────────────────────────

async function run() {
  const snap = await db.collection('ambassadors').get();
  if (snap.empty) { console.log('No ambassadors found.'); return; }

  let skipped = 0;
  let processed = 0;
  let errors = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const ambassadorCode = data.code || data.ambassadorCode || doc.id;
    const email = (data.email || '').trim().toLowerCase();
    const fullName = data.fullName || data.name || email;

    // Derive the correct SBD code from the AMB- code
    const correctSBDCode = ambassadorCode.startsWith('AMB-')
      ? ambassadorCode.replace(/^AMB-/, 'SBD-')
      : null;

    // Skip if already has the CORRECT SBD- format code
    if (data.sbdReferralCode && data.sbdReferralCode === correctSBDCode) {
      console.log(`  SKIP  ${ambassadorCode} — already has ${data.sbdReferralCode}`);
      skipped++;
      continue;
    }

    // If sbdReferralCode is set but wrong (e.g. a Firestore doc ID), overwrite it
    if (data.sbdReferralCode && data.sbdReferralCode !== correctSBDCode) {
      console.log(`  FIX   ${ambassadorCode} — bad code "${data.sbdReferralCode}" → will set "${correctSBDCode}"`);
    }

    // Skip inactive / suspended
    if (data.status && data.status !== 'active') {
      console.log(`  SKIP  ${ambassadorCode} — status: ${data.status}`);
      skipped++;
      continue;
    }

    if (!email) {
      console.warn(`  WARN  ${ambassadorCode} — no email, skipping`);
      skipped++;
      continue;
    }

    if (!correctSBDCode) {
      console.warn(`  WARN  ${ambassadorCode} — not an AMB- code, skipping`);
      skipped++;
      continue;
    }

    try {
      const sbdReferralCode = correctSBDCode;

      // 1. Get or create Firebase Auth user
      const { uid, created } = await getOrCreateAuthUser(email, fullName);
      console.log(`  ${created ? 'CREATED' : 'FOUND  '} auth user ${uid} for ${email}`);

      // 2. Merge Foundation-tier users/ doc — never downgrade an existing admin
      const existingDoc = await db.collection('users').doc(uid).get();
      const existingRole = existingDoc.exists ? existingDoc.data().role : null;
      if (existingRole === 'admin') {
        console.log(`  ADMIN ${ambassadorCode} — skipping users/ write to protect admin role`);
      } else {
        await db.collection('users').doc(uid).set({
          uid,
          name: fullName,
          email: email,
          tier: 'foundation',
          subscription: {
            tier: 'foundation',
            status: 'active',
            source: 'ambassador',
            ambassadorCode,
          },
          role: 'member',
          sbdReferralCode,
          groups: [],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastActive: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      // 3. Write sbdReferralCode onto the ambassadors/ doc (use the actual Firestore doc.id)
      await db.collection('ambassadors').doc(doc.id).update({
        sbdReferralCode,
        sbdAccessProvisioned: true,
        sbdUid: uid,
        sbdReferrals: { signups: 0, subscribers: 0 },
      });

      console.log(`  OK    ${ambassadorCode} (${doc.id}) → ${sbdReferralCode}  uid:${uid}`);
      processed++;

    } catch (err) {
      console.error(`  ERROR ${ambassadorCode}: ${err.message}`);
      errors++;
    }
  }

  console.log('\n─────────────────────────────');
  console.log(`Done. Processed: ${processed}  Skipped: ${skipped}  Errors: ${errors}`);
  process.exit(errors > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
