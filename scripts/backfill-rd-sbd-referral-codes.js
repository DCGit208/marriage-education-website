#!/usr/bin/env node
/**
 * backfill-rd-sbd-referral-codes.js
 * Provisions SBD referral codes for all regional_directors missing sbdReferralCode.
 * RD-XXXX-NNNN → SBD-XXXX-NNNN (same pairing as ambassadors).
 *
 * Run: node scripts/backfill-rd-sbd-referral-codes.js [--dry-run]
 * Requires serviceAccountKey.json at repo root.
 */

const admin = require('firebase-admin');
const path = require('path');

const dryRun = process.argv.includes('--dry-run');
const serviceAccountPath = path.resolve(__dirname, '../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });

const db = admin.firestore();
const auth = admin.auth();

function deriveSbdCode(rdCode) {
  const c = String(rdCode || '').trim().toUpperCase();
  if (!c.startsWith('RD-')) return null;
  return c.replace(/^RD-/, 'SBD-');
}

async function getOrCreateAuthUser(email, fullName) {
  const emailLower = email.toLowerCase().trim();
  try {
    const existing = await auth.getUserByEmail(emailLower);
    return { uid: existing.uid, created: false };
  } catch (_) {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    const tempPassword = Array.from({ length: 14 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join('');
    const record = await auth.createUser({
      email: emailLower,
      password: tempPassword,
      displayName: fullName || emailLower,
      emailVerified: false,
    });
    return { uid: record.uid, created: true };
  }
}

async function run() {
  const snap = await db.collection('regional_directors').get();
  if (snap.empty) {
    console.log('No regional directors found.');
    return;
  }

  let skipped = 0;
  let processed = 0;
  let errors = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const rdCode = doc.id;
    const sbdCode = deriveSbdCode(data.code || data.rd_code || rdCode);
    if (!sbdCode) {
      console.log(`  SKIP  ${rdCode} — not an RD- code`);
      skipped++;
      continue;
    }

    if (data.sbdReferralCode === sbdCode && data.sbdAccessProvisioned) {
      console.log(`  SKIP  ${rdCode} — already has ${sbdCode}`);
      skipped++;
      continue;
    }

    const email = (data.email || '').trim().toLowerCase();
    const fullName = data.fullName || data.name || email;
    if (!email) {
      console.log(`  SKIP  ${rdCode} — no email on record`);
      skipped++;
      continue;
    }

    console.log(`  ${dryRun ? 'DRY' : 'PROC'} ${rdCode} → ${sbdCode} (${email})`);
    if (dryRun) {
      processed++;
      continue;
    }

    try {
      const { uid } = await getOrCreateAuthUser(email, fullName);
      const existingRefs = data.sbdReferrals || { signups: 0, subscribers: 0 };

      await db.collection('regional_directors').doc(rdCode).set({
        sbdReferralCode: sbdCode,
        sbdAccessProvisioned: true,
        sbdUid: uid,
        sbdReferrals: existingRefs,
      }, { merge: true });

      const ambCode = rdCode.replace(/^RD-/, 'AMB-');
      const ambRef = db.collection('ambassadors').doc(ambCode);
      const ambSnap = await ambRef.get();
      if (ambSnap.exists) {
        await ambRef.set({
          sbdReferralCode: sbdCode,
          sbdAccessProvisioned: true,
          sbdUid: uid,
        }, { merge: true });
      }

      const userRef = db.collection('users').doc(uid);
      const userSnap = await userRef.get();
      const existingRole = userSnap.exists ? userSnap.data().role : null;
      if (existingRole !== 'admin') {
        await userRef.set({
          uid,
          name: fullName,
          email,
          tier: 'foundation',
          subscription: {
            tier: 'foundation',
            status: 'active',
            source: 'ambassador',
            rdCode,
          },
          role: 'member',
          sbdReferralCode: sbdCode,
          lastActive: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      processed++;
    } catch (err) {
      console.error(`  ERR   ${rdCode}:`, err.message);
      errors++;
    }
  }

  console.log(`\nDone. processed=${processed} skipped=${skipped} errors=${errors}${dryRun ? ' (dry-run)' : ''}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
