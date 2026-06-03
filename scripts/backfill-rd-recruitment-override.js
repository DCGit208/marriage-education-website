/**
 * @deprecated Legacy v1 backfill — RD 750 FCFA network override only.
 * New activations use creditRecruitmentBonusesV2 (docs/RECRUITMENT-BONUS-POLICY.md v2026-03-v2).
 * Use scripts/complete-ambassador-activation-local.js for recovery under the new policy.
 *
 * Usage:
 *   node scripts/backfill-rd-recruitment-override.js <new-ambassador-code> <recruiting-ambassador-code>
 *
 * Example:
 *   node scripts/backfill-rd-recruitment-override.js AMB-ACHA-0252 AMB-NGON-4524
 */

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const OVERRIDE = 750;

function pickRdCode(...candidates) {
  for (const code of candidates) {
    const normalized = String(code || '').trim();
    if (normalized.startsWith('RD-')) return normalized;
  }
  return null;
}

async function resolveAmbassadorRdUpline(ambData) {
  const directRd = pickRdCode(
    ambData.rdCode,
    ambData.recruited_by_rd,
    ambData.regional_director_code,
    ambData.recruitedBy,
    ambData.recruited_by
  );
  if (directRd) return directRd;

  const seniorCode = ambData.senior_code || ambData.recruited_by_senior;
  if (seniorCode && seniorCode.startsWith('AMB-')) {
    const seniorDoc = await db.collection('ambassadors').doc(seniorCode).get();
    if (seniorDoc.exists) {
      const s = seniorDoc.data();
      return pickRdCode(s.rdCode, s.recruited_by_rd, s.regional_director_code, s.recruitedBy, s.recruited_by);
    }
  }
  return null;
}

async function main() {
  const [newCode, recruiterCode] = process.argv.slice(2);
  if (!newCode || !recruiterCode) {
    console.error('Usage: node scripts/backfill-rd-recruitment-override.js <new-code> <recruiting-amb-code>');
    process.exit(1);
  }

  const existing = await db.collection('admin_notifications')
    .where('type', '==', 'rd_recruitment_bonus')
    .where('recruiter_type', '==', 'rd_network_override')
    .where('ambassador_code', '==', newCode)
    .where('status', '==', 'pending')
    .limit(1)
    .get();

  if (!existing.empty) {
    console.log('Override notification already exists — skipping.');
    process.exit(0);
  }

  const recruiterDoc = await db.collection('ambassadors').doc(recruiterCode).get();
  if (!recruiterDoc.exists) {
    console.error('Recruiting ambassador not found:', recruiterCode);
    process.exit(1);
  }

  const recruiterData = recruiterDoc.data();
  const rdCode = await resolveAmbassadorRdUpline(recruiterData);
  if (!rdCode) {
    console.error('No RD upline found on', recruiterCode);
    process.exit(1);
  }

  const newDoc = await db.collection('ambassadors').doc(newCode).get();
  const newName = newDoc.exists
    ? (newDoc.data().fullName || newDoc.data().name || newCode)
    : newCode;

  const rdDoc = await db.collection('regional_directors').doc(rdCode).get();
  if (!rdDoc.exists) {
    console.error('RD not found:', rdCode);
    process.exit(1);
  }

  const rdData = rdDoc.data();
  const rdRef = db.collection('regional_directors').doc(rdCode);

  await rdRef.update({
    recruitment_bonus_earned: admin.firestore.FieldValue.increment(OVERRIDE),
    recruitment_bonus_pending: admin.firestore.FieldValue.increment(OVERRIDE),
    network_recruitment_override_earned: admin.firestore.FieldValue.increment(OVERRIDE),
    network_recruitment_override_pending: admin.firestore.FieldValue.increment(OVERRIDE),
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  });

  const history = rdData.recruitment_history || [];
  history.push({
    type: 'network_override',
    recruiting_ambassador_code: recruiterCode,
    recruiting_ambassador_name: recruiterData.fullName || recruiterData.name || recruiterCode,
    ambassador_code: newCode,
    ambassador_name: newName,
    amount: OVERRIDE,
    date: new Date().toISOString(),
    status: 'pending'
  });
  await rdRef.update({ recruitment_history: history });

  const notifRef = await db.collection('admin_notifications').add({
    type: 'rd_recruitment_bonus',
    recruiter_type: 'rd_network_override',
    rd_code: rdCode,
    rd_name: rdData.name || 'Unknown',
    recruiting_ambassador_code: recruiterCode,
    recruiting_ambassador_name: recruiterData.fullName || recruiterData.name || recruiterCode,
    ambassador_code: newCode,
    ambassador_name: newName,
    amount: OVERRIDE,
    status: 'pending',
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    backfilled: true
  });

  console.log(`✅ ${rdCode} +${OVERRIDE} FCFA pending (via ${recruiterCode} → ${newCode})`);
  console.log(`   admin_notifications/${notifRef.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
