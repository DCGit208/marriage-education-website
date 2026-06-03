/**
 * Scheduled / threshold payout processor — CamPay disbursements with retry.
 */

const paymentGateway = require('./paymentGateway');
const { COLLECTIONS, PAYOUT_STATUS, COMMISSION_STATUS, SANDBOX_MODE } = require('./config');

const MAX_RETRIES = 3;

/**
 * Process queued payouts (sandbox: simulates success when CamPay not configured).
 */
async function processPayoutBatch(db, admin, { limit = 20 } = {}) {
  if (SANDBOX_MODE) {
    console.log('[commerce-v1] processPayoutBatch — sandbox mode');
  }

  const snap = await db
    .collection(COLLECTIONS.payouts)
    .where('status', 'in', [PAYOUT_STATUS.QUEUED, PAYOUT_STATUS.RETRY])
    .orderBy('createdAt', 'asc')
    .limit(limit)
    .get();

  const results = [];

  for (const doc of snap.docs) {
    const payout = doc.data();
    const payoutRef = doc.ref;

    try {
      await payoutRef.update({
        status: PAYOUT_STATUS.PROCESSING,
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      const disbursement = await paymentGateway.processPayout({
        gateway: payout.gateway || 'campay',
        amount: payout.amount,
        momoNumber: payout.momoNumber,
        externalReference: payout.payoutId
      });

      const success = disbursement.status === 'SUCCESS';

      await payoutRef.update({
        status: success ? PAYOUT_STATUS.SUCCESS : PAYOUT_STATUS.FAILED,
        gatewayReference: disbursement.gatewayReference,
        gatewayResponse: disbursement.raw || null,
        completedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (success) {
        await db.collection(COLLECTIONS.wallets).doc(payout.uid).set(
          {
            totalWithdrawn: admin.firestore.FieldValue.increment(payout.amount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );

        await markCommissionsPaid(db, admin, payout.uid, payout.amount);
      } else {
        await handlePayoutFailure(db, admin, payoutRef, payout);
      }

      results.push({ payoutId: payout.payoutId, status: success ? 'SUCCESS' : 'FAILED' });
    } catch (err) {
      console.error('[commerce-v1] payout error', payout.payoutId, err.message);
      await handlePayoutFailure(db, admin, payoutRef, payout, err.message);
      results.push({ payoutId: payout.payoutId, status: 'ERROR', error: err.message });
    }
  }

  return { processed: results.length, results };
}

async function handlePayoutFailure(db, admin, payoutRef, payout, errorMessage) {
  const retryCount = (payout.retryCount || 0) + 1;
  const status = retryCount >= MAX_RETRIES ? PAYOUT_STATUS.FAILED : PAYOUT_STATUS.RETRY;

  const updates = {
    status,
    retryCount,
    lastError: errorMessage || 'disbursement_failed',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  if (status === PAYOUT_STATUS.FAILED) {
    await db.collection(COLLECTIONS.wallets).doc(payout.uid).set(
      {
        availableBalance: admin.firestore.FieldValue.increment(payout.amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }

  await payoutRef.update(updates);
}

async function markCommissionsPaid(db, admin, uid, amount) {
  const snap = await db
    .collection(COLLECTIONS.commissions)
    .where('beneficiaryUid', '==', uid)
    .where('status', '==', COMMISSION_STATUS.APPROVED)
    .limit(50)
    .get();

  let remaining = amount;
  const batch = db.batch();

  for (const doc of snap.docs) {
    if (remaining <= 0) break;
    const com = doc.data();
    batch.update(doc.ref, {
      status: COMMISSION_STATUS.PAID,
      paidAt: admin.firestore.FieldValue.serverTimestamp()
    });
    remaining -= com.amount;
  }

  if (snap.size > 0) await batch.commit();
}

module.exports = {
  processPayoutBatch
};
