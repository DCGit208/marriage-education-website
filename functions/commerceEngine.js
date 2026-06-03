/**
 * Commerce Engine V1 — Cloud Function exports (SANDBOX).
 * Wired separately from production checkout / ambassador dashboards.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const commerce = require('./commerce/commerceService');
const { processPayoutBatch } = require('./commerce/payoutEngine');
const { SANDBOX_MODE, COLLECTIONS } = require('./commerce/config');

function getDb() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

function assertSandboxCallable() {
  if (!SANDBOX_MODE) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'This endpoint is disabled outside sandbox mode.'
    );
  }
}

/** Callable: start CamPay checkout (sandbox UI) */
exports.commerceV1InitiateCheckout = functions.https.onCall(async (data, context) => {
  assertSandboxCallable();
  try {
    const db = getDb();
    const result = await commerce.initiateCheckout(db, admin, {
      uid: data.uid || context.auth?.uid || `sandbox_${Date.now()}`,
      amount: Number(data.amount || 5200),
      currency: data.currency || 'XAF',
      productType: data.productType || 'foundation_subscription',
      productId: data.productId || 'foundation-monthly',
      phone: data.phone || '',
      referrerUid: data.referrerUid || null,
      seniorUid: data.seniorUid || null,
      gateway: data.gateway || 'campay'
    });
    return { success: true, ...result, sandbox: true };
  } catch (err) {
    console.error('[commerceV1] initiateCheckout', err);
    throw new functions.https.HttpsError('internal', err.message);
  }
});

/** Callable: simulate successful webhook (sandbox only) */
exports.commerceV1SimulatePayment = functions.https.onCall(async (data, context) => {
  assertSandboxCallable();
  if (!data?.transactionId) {
    throw new functions.https.HttpsError('invalid-argument', 'transactionId required');
  }
  try {
    const db = getDb();
    const result = await commerce.simulateSandboxPayment(db, admin, {
      transactionId: data.transactionId
    });
    return { success: true, result };
  } catch (err) {
    throw new functions.https.HttpsError('internal', err.message);
  }
});

/** Callable: sandbox dashboard data */
exports.commerceV1GetDashboard = functions.https.onCall(async () => {
  assertSandboxCallable();
  const db = getDb();
  return commerce.getSandboxDashboard(db);
});

/** HTTP: CamPay webhook (isolated path) */
exports.commerceV1CampayWebhook = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const db = getDb();
    const rawBody =
      req.rawBody?.toString('utf8') ||
      (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));

    const outcome = await commerce.handleCampayWebhook(db, admin, {
      headers: req.headers,
      rawBody
    });

    if (!outcome.ok) {
      return res.status(400).json(outcome);
    }
    return res.status(200).json(outcome);
  } catch (err) {
    console.error('[commerceV1] campayWebhook', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Scheduled: process payout queue (sandbox uses simulated CamPay) */
exports.commerceV1ProcessPayoutBatch = functions.pubsub
  .schedule('every 24 hours')
  .timeZone('Africa/Douala')
  .onRun(async () => {
    if (!SANDBOX_MODE) {
      console.log('[commerceV1] payout batch skipped — not in sandbox mode');
      return null;
    }
    const db = getDb();
    const result = await processPayoutBatch(db, admin, { limit: 50 });
    console.log('[commerceV1] payout batch', result);
    return result;
  });

/** Callable: manual payout batch trigger (sandbox admin) */
exports.commerceV1RunPayoutBatch = functions.https.onCall(async () => {
  assertSandboxCallable();
  const db = getDb();
  const result = await processPayoutBatch(db, admin, { limit: 50 });
  return { success: true, result };
});

module.exports.SANDBOX_COLLECTIONS = COLLECTIONS;
