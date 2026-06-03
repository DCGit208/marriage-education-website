/**
 * Internal wallet ledger — pending vs available balances.
 */

const { COLLECTIONS, COMMISSION_STATUS, PAYOUT_STATUS } = require('./config');

async function getWallet(db, uid) {
  const doc = await db.collection(COLLECTIONS.wallets).doc(uid).get();
  if (!doc.exists) {
    return {
      uid,
      availableBalance: 0,
      pendingBalance: 0,
      totalEarned: 0,
      totalWithdrawn: 0
    };
  }
  return doc.data();
}

/**
 * Move commission from pending → available (admin approval or scheduled job).
 */
async function approvePendingCommissions(db, admin, { uid, commissionIds }) {
  const batch = db.batch();
  let total = 0;

  for (const commissionId of commissionIds) {
    const ref = db.collection(COLLECTIONS.commissions).doc(commissionId);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const data = snap.data();
    if (data.status !== COMMISSION_STATUS.PENDING) continue;
    if (data.beneficiaryUid !== uid) continue;

    total += data.amount;
    batch.update(ref, {
      status: COMMISSION_STATUS.APPROVED,
      approvedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  if (total > 0) {
    const walletRef = db.collection(COLLECTIONS.wallets).doc(uid);
    batch.set(
      walletRef,
      {
        pendingBalance: admin.firestore.FieldValue.increment(-total),
        availableBalance: admin.firestore.FieldValue.increment(total),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }

  await batch.commit();
  return { movedFCFA: total };
}

/**
 * Queue payout request — does NOT call CamPay until batch processor runs.
 */
async function queuePayout(db, admin, { uid, amount, momoNumber }) {
  const wallet = await getWallet(db, uid);
  if ((wallet.availableBalance || 0) < amount) {
    throw new Error('Insufficient available balance');
  }

  const payoutId = `po_${uid}_${Date.now()}`;
  const payoutRef = db.collection(COLLECTIONS.payouts).doc(payoutId);

  const batch = db.batch();
  batch.set(payoutRef, {
    payoutId,
    uid,
    amount,
    momoNumber,
    gateway: 'campay',
    gatewayReference: null,
    status: PAYOUT_STATUS.QUEUED,
    retryCount: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  batch.set(
    db.collection(COLLECTIONS.wallets).doc(uid),
    {
      availableBalance: admin.firestore.FieldValue.increment(-amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  await batch.commit();
  return { payoutId };
}

module.exports = {
  getWallet,
  approvePendingCommissions,
  queuePayout
};
