/**
 * Commerce Engine V1 — orchestration (payment → webhook → commission → wallet → access).
 */

const paymentGateway = require('./paymentGateway');
const { calculateCommissions, applyCommissions } = require('./commissionEngine');
const { activatePurchaseAccess } = require('./accessActivation');
const {
  COLLECTIONS,
  TX_STATUS,
  SANDBOX_MODE
} = require('./config');

function newTransactionId() {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Step 1–3: Initiate checkout (customer payment collection).
 */
async function initiateCheckout(db, admin, params) {
  const {
    uid,
    amount,
    currency = 'XAF',
    productType,
    productId,
    phone,
    referrerUid = null,
    seniorUid = null,
    gateway = 'campay'
  } = params;

  const transactionId = newTransactionId();

  const paymentResult = await paymentGateway.processPayment({
    gateway,
    amount,
    currency,
    externalReference: transactionId,
    phone,
    description: `${productType}:${productId}`
  });

  await db
    .collection(COLLECTIONS.transactions)
    .doc(transactionId)
    .set({
      transactionId,
      uid,
      amount,
      currency,
      productType,
      productId,
      gateway,
      gatewayReference: paymentResult.gatewayReference,
      status: TX_STATUS.PENDING,
      commissionProcessed: false,
      referrerUid,
      seniorUid,
      sandbox: SANDBOX_MODE,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

  return {
    transactionId,
    gatewayReference: paymentResult.gatewayReference,
    status: paymentResult.status,
    checkoutUrl: paymentResult.checkoutUrl,
    mode: paymentResult.mode
  };
}

/**
 * Idempotent success handler — webhook or manual verify.
 */
async function completeSuccessfulTransaction(db, admin, { transactionId, gatewayReference, webhookPayload }) {
  const txRef = db.collection(COLLECTIONS.transactions).doc(transactionId);
  const txSnap = await txRef.get();

  if (!txSnap.exists) {
    throw new Error(`Transaction not found: ${transactionId}`);
  }

  const tx = txSnap.data();

  if (tx.commissionProcessed === true) {
    return {
      duplicate: true,
      transactionId,
      message: 'Already processed (idempotent skip)'
    };
  }

  if (tx.status === TX_STATUS.SUCCESS && tx.commissionProcessed) {
    return { duplicate: true, transactionId };
  }

  await txRef.update({
    status: TX_STATUS.SUCCESS,
    gatewayReference: gatewayReference || tx.gatewayReference,
    webhookPayload: webhookPayload || null,
    paidAt: admin.firestore.FieldValue.serverTimestamp()
  });

  const access = await activatePurchaseAccess(db, admin, {
    uid: tx.uid,
    productType: tx.productType,
    productId: tx.productId,
    transactionId
  });

  const commissionPlan = calculateCommissions({
    productType: tx.productType,
    transactionId,
    uid: tx.uid,
    referrerUid: tx.referrerUid || null,
    seniorUid: tx.seniorUid || null
  });

  const commissionResult = await applyCommissions(db, admin, {
    entries: commissionPlan.entries,
    transactionId
  });

  await txRef.update({
    commissionProcessed: true,
    commissionSummary: {
      totalCommissionFCFA: commissionPlan.totalCommissionFCFA,
      commissionableFCFA: commissionPlan.commissionableFCFA,
      entryCount: commissionPlan.entries.length
    },
    accessGrantId: access.grantId || null,
    completedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    duplicate: false,
    transactionId,
    access,
    commissions: commissionResult,
    commissionPlan
  };
}

async function logWebhook(db, admin, entry) {
  const id = `wh_${Date.now()}`;
  await db.collection(COLLECTIONS.webhookLogs).doc(id).set({
    ...entry,
    sandbox: SANDBOX_MODE,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return id;
}

/**
 * Handle CamPay webhook event.
 */
async function handleCampayWebhook(db, admin, { headers, rawBody }) {
  const verification = await paymentGateway.verifyWebhook({
    gateway: 'campay',
    headers,
    rawBody
  });

  const logId = await logWebhook(db, admin, {
    gateway: 'campay',
    verified: verification.valid,
    verificationMode: verification.mode,
    error: verification.error || null,
    bodyPreview: typeof rawBody === 'string' ? rawBody.slice(0, 500) : JSON.stringify(rawBody).slice(0, 500)
  });

  if (!verification.valid) {
    return { ok: false, logId, error: verification.error || 'invalid_signature' };
  }

  const event = await paymentGateway.parseWebhook({
    gateway: 'campay',
    body: typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody
  });

  if (event.status !== 'SUCCESS') {
    return { ok: true, logId, action: 'ignored_non_success', status: event.status };
  }

  const externalRef = event.externalReference;
  if (!externalRef) {
    return { ok: false, logId, error: 'missing_external_reference' };
  }

  const result = await completeSuccessfulTransaction(db, admin, {
    transactionId: externalRef,
    gatewayReference: event.gatewayReference,
    webhookPayload: event.raw
  });

  return { ok: true, logId, result };
}

/**
 * Sandbox: simulate successful payment without CamPay.
 */
async function simulateSandboxPayment(db, admin, { transactionId }) {
  if (!SANDBOX_MODE) {
    throw new Error('simulateSandboxPayment only available in sandbox mode');
  }
  return completeSuccessfulTransaction(db, admin, {
    transactionId,
    gatewayReference: `CAMPAY-SIM-${transactionId}`,
    webhookPayload: { simulated: true }
  });
}

async function getSandboxDashboard(db) {
  const [tx, com, wallets, payouts, logs] = await Promise.all([
    db.collection(COLLECTIONS.transactions).orderBy('createdAt', 'desc').limit(25).get(),
    db.collection(COLLECTIONS.commissions).orderBy('createdAt', 'desc').limit(25).get(),
    db.collection(COLLECTIONS.wallets).limit(50).get(),
    db.collection(COLLECTIONS.payouts).orderBy('createdAt', 'desc').limit(25).get(),
    db.collection(COLLECTIONS.webhookLogs).orderBy('createdAt', 'desc').limit(15).get()
  ]);

  return {
    sandbox: SANDBOX_MODE,
    collections: COLLECTIONS,
    transactions: tx.docs.map((d) => ({ id: d.id, ...d.data() })),
    commissions: com.docs.map((d) => ({ id: d.id, ...d.data() })),
    wallets: wallets.docs.map((d) => ({ id: d.id, ...d.data() })),
    payouts: payouts.docs.map((d) => ({ id: d.id, ...d.data() })),
    webhookLogs: logs.docs.map((d) => ({ id: d.id, ...d.data() }))
  };
}

module.exports = {
  initiateCheckout,
  completeSuccessfulTransaction,
  handleCampayWebhook,
  simulateSandboxPayment,
  getSandboxDashboard,
  logWebhook
};
