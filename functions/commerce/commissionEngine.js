/**
 * Commission calculation — financial event records only (no instant MoMo payout).
 */

const {
  COMMISSION_RULES,
  COMMISSION_STATUS,
  COLLECTIONS
} = require('./config');

/**
 * @param {{ productType: string, transactionId: string, uid: string, referrerUid?: string, seniorUid?: string }} ctx
 * @returns {{ entries: Array<object>, totalCommissionFCFA: number, commissionableFCFA: number }}
 */
function calculateCommissions(ctx) {
  const rule = COMMISSION_RULES[ctx.productType];
  if (!rule) {
    throw new Error(`No commission rules for productType: ${ctx.productType}`);
  }

  const commissionableFCFA = rule.commissionableFCFA;
  const entries = [];

  if (ctx.referrerUid && rule.roles.ambassador) {
    const amb = rule.roles.ambassador;
    entries.push({
      transactionId: ctx.transactionId,
      beneficiaryUid: ctx.referrerUid,
      sourceUid: ctx.uid,
      role: 'ambassador',
      percentage: amb.percentOfCommissionable,
      amount: amb.amountFCFA,
      status: COMMISSION_STATUS.PENDING,
      productType: ctx.productType,
      commissionableFCFA
    });
  }

  if (ctx.seniorUid && rule.roles.senior_ambassador) {
    const sen = rule.roles.senior_ambassador;
    entries.push({
      transactionId: ctx.transactionId,
      beneficiaryUid: ctx.seniorUid,
      sourceUid: ctx.uid,
      role: 'senior_ambassador',
      percentage: sen.percentOfCommissionable,
      amount: sen.amountFCFA,
      status: COMMISSION_STATUS.PENDING,
      productType: ctx.productType,
      commissionableFCFA
    });
  }

  const totalCommissionFCFA = entries.reduce((sum, e) => sum + e.amount, 0);

  return { entries, totalCommissionFCFA, commissionableFCFA, opexFCFA: rule.opexFCFA || 0 };
}

/**
 * Persist commission docs + credit wallet pending balances (batch).
 */
async function applyCommissions(db, admin, { entries, transactionId }) {
  const batch = db.batch();
  const walletUpdates = new Map();

  for (const entry of entries) {
    const commissionId = `com_${transactionId}_${entry.role}`;
    const ref = db.collection(COLLECTIONS.commissions).doc(commissionId);
    batch.set(
      ref,
      {
        commissionId,
        transactionId: entry.transactionId,
        beneficiaryUid: entry.beneficiaryUid,
        sourceUid: entry.sourceUid,
        role: entry.role,
        percentage: entry.percentage,
        amount: entry.amount,
        status: entry.status,
        productType: entry.productType,
        commissionableFCFA: entry.commissionableFCFA,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    const prev = walletUpdates.get(entry.beneficiaryUid) || 0;
    walletUpdates.set(entry.beneficiaryUid, prev + entry.amount);
  }

  for (const [uid, amount] of walletUpdates.entries()) {
    const walletRef = db.collection(COLLECTIONS.wallets).doc(uid);
    batch.set(
      walletRef,
      {
        uid,
        pendingBalance: admin.firestore.FieldValue.increment(amount),
        totalEarned: admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }

  await batch.commit();
  return { commissionCount: entries.length, walletUpdates: Object.fromEntries(walletUpdates) };
}

module.exports = {
  calculateCommissions,
  applyCommissions
};
