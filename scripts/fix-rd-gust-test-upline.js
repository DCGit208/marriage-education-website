#!/usr/bin/env node
/**
 * Remove test RD-GUST-4230 from production upline chains and correct AMB-ITA-5271 bonuses.
 *
 * Usage:
 *   node scripts/fix-rd-gust-test-upline.js --dry-run
 *   node scripts/fix-rd-gust-test-upline.js
 */

const admin = require('firebase-admin');
const path = require('path');
const { normalizeExcludedCode } = require('../functions/upline-exclusions');
const { buildRecruitmentBonusPlan } = require('../functions/recruitment-bonus-policy');

const dryRun = process.argv.includes('--dry-run');
const TEST_RD = 'RD-GUST-4230';
const EVEL = 'AMB-EVEL-6730';
const NEW_RECRUIT = 'AMB-ITA-5271';
const DIRECT_RECRUITER = 'AMB-YAHE-0978';
const UPLINE_FIX = [
  { code: 'AMB-SAMK-1965', oldAmount: 375, newAmount: 500 },
  { code: 'AMB-FUAM-6598', oldAmount: 375, newAmount: 500 },
  { code: 'AMB-EVEL-6730', oldAmount: 375, newAmount: 500 }
];
const RD_REVERSE_AMOUNT = 375;
const TOPUP_DELTA = 125;

const LINK_FIELDS = [
  'recruitedBy',
  'recruited_by',
  'regional_director_code',
  'rdCode',
  'recruited_by_rd',
  'senior_code',
  'recruited_by_senior'
];

const serviceAccountPath = path.resolve(__dirname, '../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

function norm(c) {
  return normalizeExcludedCode(c);
}

function log(msg) {
  console.log(dryRun ? `[DRY] ${msg}` : msg);
}

async function auditRdGustReferences() {
  const hits = [];

  const ambSnap = await db.collection('ambassadors').get();
  for (const doc of ambSnap.docs) {
    const data = doc.data();
    const fields = {};
    for (const f of LINK_FIELDS) {
      if (norm(data[f]) === TEST_RD) fields[f] = data[f];
    }
    if (Object.keys(fields).length) hits.push({ collection: 'ambassadors', id: doc.id, fields });
  }

  const rdSnap = await db.collection('regional_directors').doc(TEST_RD).get();
  if (rdSnap.exists) {
    hits.push({ collection: 'regional_directors', id: TEST_RD, exists: true, is_test: rdSnap.data().is_test });
  }

  return hits;
}

function buildClearUpdates(data) {
  const updates = {};
  for (const f of LINK_FIELDS) {
    if (norm(data[f]) === TEST_RD) updates[f] = admin.firestore.FieldValue.delete();
  }
  return updates;
}

async function clearEvelParent() {
  const ref = db.collection('ambassadors').doc(EVEL);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`${EVEL} not found`);

  const data = snap.data();
  const updates = buildClearUpdates(data);

  // Top of network — no recruitedBy parent at all
  if (data.recruitedBy) updates.recruitedBy = admin.firestore.FieldValue.delete();
  if (data.recruited_by) updates.recruited_by = admin.firestore.FieldValue.delete();

  if (!Object.keys(updates).length) {
    log(`${EVEL}: already clean`);
    return false;
  }

  log(`${EVEL}: clear fields → ${Object.keys(updates).join(', ')}`);
  if (!dryRun) await ref.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
  return true;
}

async function clearRdGustFromAllAmbassadors() {
  const snap = await db.collection('ambassadors').get();
  let count = 0;

  for (const doc of snap.docs) {
    if (doc.id === EVEL) continue;
    const updates = buildClearUpdates(doc.data());
    if (!Object.keys(updates).length) continue;
    log(`${doc.id}: clear RD-GUST fields → ${Object.keys(updates).join(', ')}`);
    if (!dryRun) {
      await doc.ref.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
    }
    count++;
  }
  return count;
}

async function markTestRd() {
  const ref = db.collection('regional_directors').doc(TEST_RD);
  const snap = await ref.get();
  if (!snap.exists) {
    log(`${TEST_RD}: regional_directors doc not found (skip mark test)`);
    return false;
  }
  log(`${TEST_RD}: mark is_test=true, status=inactive`);
  if (!dryRun) {
    await ref.update({
      is_test: true,
      status: 'inactive',
      updated_at: FieldValue.serverTimestamp()
    });
  }
  return true;
}

function patchRecruitmentHistory(history, ambassadorCode, matcher, patch) {
  return (history || []).map((entry) => {
    if (entry.ambassador_code !== ambassadorCode) return entry;
    if (matcher(entry)) return { ...entry, ...patch };
    return entry;
  });
}

async function fixIta5271Bonuses() {
  const notifSnap = await db.collection('admin_notifications')
    .where('type', '==', 'rd_recruitment_bonus')
    .where('ambassador_code', '==', NEW_RECRUIT)
    .get();

  if (notifSnap.empty) {
    log(`No admin_notifications for ${NEW_RECRUIT}`);
    return { notifications: 0 };
  }

  let changed = 0;

  for (const doc of notifSnap.docs) {
    const n = doc.data();
    const payee = norm(n.rd_code);

    if (payee === TEST_RD && Number(n.amount) === RD_REVERSE_AMOUNT) {
      log(`Reverse notification ${doc.id}: ${TEST_RD} ${RD_REVERSE_AMOUNT} → reversed`);
      if (!dryRun) {
        await doc.ref.update({
          status: 'reversed',
          reversal_reason: 'test_rd_removed_from_upline_chain',
          reversed_at: FieldValue.serverTimestamp()
        });
      }
      changed++;

      const rdRef = db.collection('regional_directors').doc(TEST_RD);
      const rdSnap = await rdRef.get();
      if (rdSnap.exists) {
        const rdData = rdSnap.data();
        log(`${TEST_RD}: -${RD_REVERSE_AMOUNT} pending/earned`);
        if (!dryRun) {
          await rdRef.update({
            recruitment_bonus_pending: FieldValue.increment(-RD_REVERSE_AMOUNT),
            recruitment_bonus_earned: FieldValue.increment(-RD_REVERSE_AMOUNT),
            network_recruitment_override_pending: FieldValue.increment(-RD_REVERSE_AMOUNT),
            network_recruitment_override_earned: FieldValue.increment(-RD_REVERSE_AMOUNT),
            recruitment_history: patchRecruitmentHistory(
              rdData.recruitment_history,
              NEW_RECRUIT,
              (e) => e.type === 'upline_share' && Number(e.amount) === RD_REVERSE_AMOUNT,
              { status: 'reversed', amount: 0, reversal_reason: 'test_rd_removed' }
            ),
            updated_at: FieldValue.serverTimestamp()
          });
        }
      }
      continue;
    }

    const fix = UPLINE_FIX.find((u) => u.code === payee && Number(n.amount) === u.oldAmount);
    if (fix && n.bonus_tier === 'upline') {
      log(`Top up notification ${doc.id}: ${payee} ${fix.oldAmount} → ${fix.newAmount}`);
      if (!dryRun) {
        await doc.ref.update({
          amount: fix.newAmount,
          upline_count: 3,
          correction_note: 'upline_count_4_to_3_after_test_rd_removal',
          corrected_at: FieldValue.serverTimestamp()
        });
      }
      changed++;

      const ambRef = db.collection('ambassadors').doc(payee);
      const ambSnap = await ambRef.get();
      if (ambSnap.exists) {
        const ambData = ambSnap.data();
        log(`${payee}: +${TOPUP_DELTA} pending/earned`);
        if (!dryRun) {
          await ambRef.update({
            recruitment_bonus_pending: FieldValue.increment(TOPUP_DELTA),
            recruitment_bonus_earned: FieldValue.increment(TOPUP_DELTA),
            recruitment_history: patchRecruitmentHistory(
              ambData.recruitment_history,
              NEW_RECRUIT,
              (e) => e.type === 'upline_share' && Number(e.amount) === fix.oldAmount,
              { amount: fix.newAmount, correction_note: 'test_rd_removed_upline_rebalance' }
            ),
            updated_at: FieldValue.serverTimestamp()
          });
        }
      }
    }
  }

  return { notifications: changed };
}

async function verifyChain() {
  const plan = await buildRecruitmentBonusPlan(db, DIRECT_RECRUITER);
  const codes = plan.uplines.map((u) => u.code);
  log(`Verify ${DIRECT_RECRUITER} uplines: [${codes.join(', ')}] (count=${codes.length})`);
  const ok =
    codes.length === 3 &&
    codes[0] === 'AMB-SAMK-1965' &&
    codes[1] === 'AMB-FUAM-6598' &&
    codes[2] === EVEL &&
    !codes.includes(TEST_RD);
  if (!ok) {
    console.warn('⚠️  Chain verification failed — review Firestore data manually');
  } else {
    log('✅ Upline chain verified (3 uplines, EVEL on top, no RD-GUST)');
  }
  const shares = plan.payouts.filter((p) => p.bonus_tier === 'upline').map((p) => `${p.code}:${p.amount}`);
  log(`Upline shares: ${shares.join(', ')}`);
  return ok;
}

async function run() {
  console.log(`\n=== fix-rd-gust-test-upline ${dryRun ? '(DRY RUN)' : '(LIVE)'} ===\n`);

  const audit = await auditRdGustReferences();
  console.log('Audit — RD-GUST references:', audit.length);
  audit.forEach((h) => console.log(' ', JSON.stringify(h)));

  await clearEvelParent();
  const clearedOthers = await clearRdGustFromAllAmbassadors();
  log(`Cleared RD-GUST from ${clearedOthers} other ambassador(s)`);
  await markTestRd();
  const bonusResult = await fixIta5271Bonuses();
  log(`Bonus corrections touched: ${bonusResult.notifications} notification(s)`);

  await verifyChain();

  console.log('\nDone.\n');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
