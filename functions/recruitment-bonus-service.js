/**
 * Credits recruitment bonuses per docs/RECRUITMENT-BONUS-POLICY.md (v2026-03-v3).
 */

const admin = require('firebase-admin');
const {
  POLICY_VERSION,
  buildRecruitmentBonusPlan,
  classifyAmbassadorRole
} = require('./recruitment-bonus-policy');

/**
 * @param {object} opts
 * @param {FirebaseFirestore.Firestore} opts.db
 * @param {string} opts.newAmbassadorCode
 * @param {string} opts.newAmbassadorName
 * @param {string} opts.directRecruiterCode
 * @param {Function} [opts.sendTelegram]
 */
async function creditRecruitmentBonusesV2(opts) {
  const db = opts.db;
  const newAmbassadorCode = opts.newAmbassadorCode;
  const newAmbassadorName = opts.newAmbassadorName;
  const directRecruiterCode = opts.directRecruiterCode;
  const sendTelegram = opts.sendTelegram || (async () => {});

  const plan = await buildRecruitmentBonusPlan(db, directRecruiterCode);
  if (!plan.direct_recruiter_code || !plan.payouts.length) {
    console.warn('[RECRUITMENT] No recruiter on payment — skipping bonuses');
    return plan;
  }

  const directPayout = plan.payouts.find((p) => p.bonus_tier === 'direct');
  let directRecruiterName = directPayout?.name || 'Unknown';

  for (const payout of plan.payouts) {
    if (payout.bonus_tier === 'direct' && payout.collection === 'ambassadors') {
      const snap = await db.collection('ambassadors').doc(payout.code).get();
      if (snap.exists) {
        const d = snap.data();
        directRecruiterName = d.fullName || d.name || directRecruiterName;
        payout.name = directRecruiterName;

        const currentRecruits = d.recruits_count || 0;
        const updatedRecruits = currentRecruits + 1;
        const ambUpdates = {
          recruits_count: admin.firestore.FieldValue.increment(1),
          directAmbassadorCount: admin.firestore.FieldValue.increment(1),
          recruitment_bonus_earned: admin.firestore.FieldValue.increment(payout.amount),
          recruitment_bonus_pending: admin.firestore.FieldValue.increment(payout.amount),
          recruitment_count: admin.firestore.FieldValue.increment(1),
          'deployment_by_category.recruitment': admin.firestore.FieldValue.increment(1),
          'revenue_by_category.recruitment': admin.firestore.FieldValue.increment(payout.amount),
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        if (
          updatedRecruits >= 10 &&
          d.ambassador_type !== 'senior' &&
          d.ambassador_type !== 'regional_director' &&
          classifyAmbassadorRole(d) !== 'executive'
        ) {
          ambUpdates.ambassador_type = 'senior';
          ambUpdates.role_level = Math.max(d.role_level || 1, 2);
          ambUpdates.level = d.level || 'Senior Ambassador';
          ambUpdates.promotion_date = admin.firestore.FieldValue.serverTimestamp();
        }

        await snap.ref.update(ambUpdates);

        const recruitmentHistory = d.recruitment_history || [];
        recruitmentHistory.push({
          ambassador_code: newAmbassadorCode,
          ambassador_name: newAmbassadorName,
          amount: payout.amount,
          date: new Date().toISOString(),
          status: 'pending',
          bonus_tier: 'direct',
          policy_version: POLICY_VERSION
        });
        await snap.ref.update({ recruitment_history: recruitmentHistory });
      }
    } else if (payout.bonus_tier === 'direct' && payout.collection === 'regional_directors') {
      const rdRef = db.collection('regional_directors').doc(payout.code);
      const rdDoc = await rdRef.get();
      if (rdDoc.exists) {
        const rdData = rdDoc.data();
        directRecruiterName = rdData.name || rdData.fullName || directRecruiterName;
        payout.name = directRecruiterName;

        await rdRef.update({
          downline_count: admin.firestore.FieldValue.increment(1),
          team_ambassadors: admin.firestore.FieldValue.increment(1),
          recruitment_bonus_earned: admin.firestore.FieldValue.increment(payout.amount),
          recruitment_bonus_pending: admin.firestore.FieldValue.increment(payout.amount),
          recruitment_count: admin.firestore.FieldValue.increment(1),
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });

        const recruitmentHistory = rdData.recruitment_history || [];
        recruitmentHistory.push({
          ambassador_code: newAmbassadorCode,
          ambassador_name: newAmbassadorName,
          amount: payout.amount,
          date: new Date().toISOString(),
          status: 'pending',
          bonus_tier: 'direct',
          policy_version: POLICY_VERSION
        });
        await rdRef.update({ recruitment_history: recruitmentHistory });
      }
    } else if (payout.bonus_tier === 'upline' && payout.amount > 0) {
      if (payout.collection === 'regional_directors') {
        const rdRef = db.collection('regional_directors').doc(payout.code);
        const rdDoc = await rdRef.get();
        if (rdDoc.exists) {
          const rdData = rdDoc.data();
          payout.name = rdData.name || rdData.fullName || payout.name;
          await rdRef.update({
            recruitment_bonus_earned: admin.firestore.FieldValue.increment(payout.amount),
            recruitment_bonus_pending: admin.firestore.FieldValue.increment(payout.amount),
            network_recruitment_override_earned: admin.firestore.FieldValue.increment(payout.amount),
            network_recruitment_override_pending: admin.firestore.FieldValue.increment(payout.amount),
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          });
          const recruitmentHistory = rdData.recruitment_history || [];
          recruitmentHistory.push({
            type: 'upline_share',
            ambassador_code: newAmbassadorCode,
            ambassador_name: newAmbassadorName,
            direct_recruiter_code: plan.direct_recruiter_code,
            amount: payout.amount,
            upline_index: payout.upline_index,
            date: new Date().toISOString(),
            status: 'pending',
            policy_version: POLICY_VERSION
          });
          await rdRef.update({ recruitment_history: recruitmentHistory });
        }
      } else {
        const ambRef = db.collection('ambassadors').doc(payout.code);
        const ambDoc = await ambRef.get();
        if (ambDoc.exists) {
          const ambData = ambDoc.data();
          payout.name = ambData.fullName || ambData.name || payout.name;
          await ambRef.update({
            recruitment_bonus_earned: admin.firestore.FieldValue.increment(payout.amount),
            recruitment_bonus_pending: admin.firestore.FieldValue.increment(payout.amount),
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          });
          const recruitmentHistory = ambData.recruitment_history || [];
          recruitmentHistory.push({
            type: 'upline_share',
            ambassador_code: newAmbassadorCode,
            ambassador_name: newAmbassadorName,
            direct_recruiter_code: plan.direct_recruiter_code,
            amount: payout.amount,
            upline_index: payout.upline_index,
            date: new Date().toISOString(),
            status: 'pending',
            policy_version: POLICY_VERSION
          });
          await ambRef.update({ recruitment_history: recruitmentHistory });
        }
      }
    }

    if (payout.amount <= 0) continue;

    await db.collection('admin_notifications').add({
      type: 'rd_recruitment_bonus',
      policy_version: POLICY_VERSION,
      bonus_tier: payout.bonus_tier,
      recruiter_type: payout.recruiter_type,
      rd_code: payout.code,
      rd_name: payout.name || payout.code,
      ambassador_code: newAmbassadorCode,
      ambassador_name: newAmbassadorName,
      direct_recruiter_code: plan.direct_recruiter_code,
      upline_index: payout.upline_index != null ? payout.upline_index : null,
      upline_count: payout.upline_count != null ? payout.upline_count : plan.uplines.length,
      org_retained_fcfa: plan.org_retained_fcfa,
      amount: payout.amount,
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  const lines = plan.payouts
    .filter((p) => p.amount > 0)
    .map((p) => `• ${p.code}: ${p.amount.toLocaleString()} FCFA (${p.bonus_tier})`)
    .join('\n');

  const msg =
    `💰 RECRUITMENT BONUSES (${POLICY_VERSION})\n\n` +
    `New: ${newAmbassadorCode} (${newAmbassadorName})\n` +
    `Direct recruiter: ${plan.direct_recruiter_code}\n` +
    `Uplines: ${plan.uplines.length}\n` +
    `Total paid: ${plan.total_paid_fcfa.toLocaleString()} FCFA\n` +
    (plan.org_retained_fcfa ? `Org retains: ${plan.org_retained_fcfa.toLocaleString()} FCFA\n` : '') +
    `\n${lines}\n\n` +
    `👉 Admin Dashboard: https://marriageducation.com/admin-dashboard.html`;

  await sendTelegram(msg, false);
  console.log(`[RECRUITMENT] ${POLICY_VERSION} credited for ${newAmbassadorCode}`, plan.total_paid_fcfa);

  return plan;
}

module.exports = {
  creditRecruitmentBonusesV2
};
