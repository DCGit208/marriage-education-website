/**
 * Commerce OS orchestrator — routes verified customer payments to production engines.
 */
const { PILOT_PRODUCT_TYPES, CAMPAY_AUTO_FULFILL, COLLECTIONS } = require('./config');

function normalizeProductType(payment) {
  if (payment.product_id === 'ambassador-registration' || payment.type === 'ambassador') {
    return 'ambassador_registration';
  }
  if (payment.product_id === 'rd-registration' || payment.type === 'rd') {
    return 'rd_registration';
  }
  if (payment.product_id === 'foundation-subscription' || payment.type === 'sbd_subscription') {
    return 'foundation_subscription';
  }
  return 'product_sale';
}

function isPilotProduct(productType) {
  return PILOT_PRODUCT_TYPES.includes(productType);
}

/**
 * @param {object} deps - { db, admin, fulfillPendingPayment, creditSbdFromCampay? }
 */
function createOrchestrator(deps) {
  const { db, admin, fulfillPendingPayment } = deps;

  async function paymentSucceeded({
    reference,
    gatewayReference,
    gateway = 'campay',
    webhookPayload = null
  }) {
    const ref = String(reference || '').trim();
    const campayRef = db.collection(COLLECTIONS.campayPayments).doc(ref);
    const campaySnap = await campayRef.get();
    const campayData = campaySnap.exists ? campaySnap.data() : {};

    const paymentDoc = await db.collection('pending_payments').doc(ref).get();
    if (!paymentDoc.exists) {
      throw new Error(`pending_payments/${ref} not found`);
    }

    const payment = paymentDoc.data();
    const productType = campayData.productType || normalizeProductType(payment);

    if (!isPilotProduct(productType)) {
      await campayRef.set({
        status: 'SUCCESS_UNFULFILLED',
        note: 'Product type not in campay pilot list — admin must approve manually',
        productType,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return {
        ok: true,
        action: 'pilot_skip',
        productType,
        message: 'CamPay confirmed; manual approval required for this product type'
      };
    }

    await campayRef.set({
      status: 'SUCCESS',
      gatewayReference: gatewayReference || campayData.gatewayReference,
      fulfilled: false,
      webhookPayload: webhookPayload || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    if (!CAMPAY_AUTO_FULFILL) {
      await db.collection('pending_payments').doc(ref).update({
        campay_status: 'paid_unfulfilled',
        campay_reference: gatewayReference,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
      return { ok: true, action: 'await_manual_fulfill', productType };
    }

    const result = await fulfillPendingPayment(ref, {
      channel: gateway,
      payment_method: 'campay_momo',
      gateway_reference: gatewayReference,
      skipIfApproved: false
    });

    await campayRef.set({
      fulfilled: true,
      fulfillment: result,
      fulfilledAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { ok: true, action: 'fulfilled', productType, result };
  }

  return { paymentSucceeded, normalizeProductType, isPilotProduct };
}

module.exports = { createOrchestrator };
