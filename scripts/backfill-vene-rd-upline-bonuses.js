#!/usr/bin/env node
/**
 * Backfill missed RD upline recruitment bonuses for AMB-VENE-5251 recruits.
 *
 * Root cause: resolveRecruitmentUplines added RD to `seen` before appendRdUpline,
 * so appendRdUpline skipped the payout (upline_count stayed 0).
 *
 * Usage:
 *   node scripts/backfill-vene-rd-upline-bonuses.js --dry-run
 *   node scripts/backfill-vene-rd-upline-bonuses.js
 */

const admin = require('firebase-admin');
const path = require('path');
const {
  POLICY_VERSION,
  buildRecruitmentBonusPlan
} = require('../functions/recruitment-bonus-policy');

const dryRun = process.argv.includes('--dry-run');

const DIRECT_RECRUITER = 'AMB-VENE-5251';
const RD_CODE = 'RD-AYIN-5087';
const RECRUITS = [
  {
    code: 'AMB-MARG-2867',
    name: 'Margaret  Bama',
    activatedAt: '2026-06-26T11:15:38.446Z',
    directNotificationId: 'LGi67NAtinHN7MfI8qWj'
  },
  {
    code: 'AMB-MBIH-0894',
    name: 'Mbih',
    activatedAt: '2026-07-01T09:39:04.074Z',
    directNotificationId: 'kYIS3XwPeRaXhZ70YfwH'
  }
];

const serviceAccountPath = path.resolve(__dirname, '../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

function log(msg) {
  console.log(dryRun ? `[DRY] ${msg}` : msg);
}

async function findUplineNotification(ambassadorCode) {
  const snap = await db
    .collection('admin_notifications')
    .where('ambassador_code', '==', ambassadorCode)
    .where('type', '==', 'rd_recruitment_bonus')
    .get();

  return snap.docs.find((doc) => {
    const d = doc.data();
    return d.bonus_tier === 'upline' && (d.rd_code === RD_CODE || d.recruiter_code === RD_CODE);
  });
}

function hasUplineHistoryEntry(history, ambassadorCode) {
  return (history || []).some((entry) => {
    return (
      entry.ambassador_code === ambassadorCode &&
      (entry.type === 'upline_share' || entry.bonus_tier === 'upline') &&
      Number(entry.amount) === 750 &&
      (entry.direct_recruiter_code === DIRECT_RECRUITER || !entry.direct_recruiter_code)
    );
  });
}

async function backfillRecruit(recruit, uplinePayout) {
  const existing = await findUplineNotification(recruit.code);
  if (existing) {
    log(`${recruit.code}: upline notification already exists (${existing.id}) — skip`);
    return { skipped: true };
  }

  const rdRef = db.collection('regional_directors').doc(RD_CODE);
  const rdSnap = await rdRef.get();
  if (!rdSnap.exists) throw new Error(`${RD_CODE} not found`);

  const rdData = rdSnap.data();
  const amount = uplinePayout.amount;
  const history = rdData.recruitment_history || [];

  if (!hasUplineHistoryEntry(history, recruit.code)) {
    history.push({
      type: 'upline_share',
      ambassador_code: recruit.code,
      ambassador_name: recruit.name,
      direct_recruiter_code: DIRECT_RECRUITER,
      recruiting_ambassador_code: DIRECT_RECRUITER,
      recruiting_ambassador_name: 'Venessa  Epie',
      amount,
      upline_index: uplinePayout.upline_index,
      date: recruit.activatedAt,
      status: 'pending',
      policy_version: POLICY_VERSION,
      correction_note: 'backfill_missed_rd_upline_seen_set_bug'
    });
  }

  log(
    `${recruit.code}: credit ${RD_CODE} +${amount} FCFA pending (upline) + admin notification`
  );

  if (!dryRun) {
    await rdRef.update({
      recruitment_bonus_earned: FieldValue.increment(amount),
      recruitment_bonus_pending: FieldValue.increment(amount),
      network_recruitment_override_earned: FieldValue.increment(amount),
      network_recruitment_override_pending: FieldValue.increment(amount),
      recruitment_history: history,
      updated_at: FieldValue.serverTimestamp()
    });

    await db.collection('admin_notifications').add({
      type: 'rd_recruitment_bonus',
      policy_version: POLICY_VERSION,
      bonus_tier: 'upline',
      recruiter_type: 'regional_director',
      rd_code: RD_CODE,
      rd_name: rdData.name || rdData.fullName || RD_CODE,
      ambassador_code: recruit.code,
      ambassador_name: recruit.name,
      direct_recruiter_code: DIRECT_RECRUITER,
      recruiting_ambassador_code: DIRECT_RECRUITER,
      recruiting_ambassador_name: 'Venessa  Epie',
      upline_index: uplinePayout.upline_index,
      upline_count: 1,
      org_retained_fcfa: 750,
      amount,
      status: 'pending',
      correction_note: 'backfill_missed_rd_upline_seen_set_bug',
      created_at: FieldValue.serverTimestamp()
    });

    const directRef = db.collection('admin_notifications').doc(recruit.directNotificationId);
    const directSnap = await directRef.get();
    if (directSnap.exists) {
      await directRef.update({
        upline_count: 1,
        org_retained_fcfa: 750,
        correction_note: 'upline_count_fixed_after_seen_set_bug',
        corrected_at: FieldValue.serverTimestamp()
      });
    }
  }

  return { skipped: false, amount };
}

async function run() {
  console.log(`\n=== backfill-vene-rd-upline-bonuses ${dryRun ? '(DRY RUN)' : '(LIVE)'} ===\n`);

  const plan = await buildRecruitmentBonusPlan(db, DIRECT_RECRUITER);
  const uplinePayout = plan.payouts.find((p) => p.bonus_tier === 'upline' && p.code === RD_CODE);
  if (!uplinePayout || uplinePayout.amount !== 750) {
    throw new Error(
      `Expected ${RD_CODE} upline payout of 750 — got ${JSON.stringify(uplinePayout)}`
    );
  }

  log(`Plan OK: direct=${DIRECT_RECRUITER}, upline=${RD_CODE} @ ${uplinePayout.amount} FCFA`);

  let total = 0;
  for (const recruit of RECRUITS) {
    const result = await backfillRecruit(recruit, uplinePayout);
    if (!result.skipped) total += result.amount || 0;
  }

  log(`Total RD upline credited: ${total} FCFA across ${RECRUITS.length} recruit(s)`);
  console.log('\nDone.\n');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
