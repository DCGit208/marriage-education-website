/**
 * Commerce OS Tier 2 — production CamPay collect, webhook, disburse batch.
 */
const functions = require('firebase-functions');
const campayGateway = require('./commerce-os/gateways/campay');
const { createOrchestrator } = require('./commerce-os/orchestrator');
const {
  CAMPAY_LIVE_ENABLED,
  CAMPAY_AUTO_FULFILL,
  PILOT_PRODUCT_TYPES,
  COLLECTIONS,
  TIER2_POLICY_VERSION,
  CAMPAY
} = require('./commerce-os/config');

/** CamPay demo API enforces 25 XAF max per collect (their message, not ours). */
const CAMPAY_DEMO_MAX_XAF = 25;
const {
  buildWalletSummary,
  DEFAULT_MIN_PAYOUT_FCFA
} = require('./wallet-payout-tier1');

function registerCommerceOsTier2(db, admin, exports, deps) {
  const {
    fulfillPendingPayment,
    assertAdmin,
    markPayoutBatchPaidCore,
    normalizeAmbassadorRecruiterPaymentFields,
    writeUnifiedPaymentRecord
  } = deps;
  const orchestrator = createOrchestrator({ db, admin, fulfillPendingPayment });

  async function resolveCampayWebhookReference(event) {
    let reference = String(event.externalReference || '').trim();
    if (reference) return reference;

    const gatewayReference = String(event.gatewayReference || '').trim();
    if (!gatewayReference) return null;

    const byGateway = await db
      .collection(COLLECTIONS.campayPayments)
      .where('gatewayReference', '==', gatewayReference)
      .limit(1)
      .get();
    if (!byGateway.empty) {
      return byGateway.docs[0].id;
    }

    const directDoc = await db.collection(COLLECTIONS.campayPayments).doc(gatewayReference).get();
    if (directDoc.exists) {
      return directDoc.id;
    }

    return null;
  }

  async function fulfillCampayIfPaid(reference, gatewayReference) {
    const ref = String(reference || '').trim();
    if (!ref) {
      throw new Error('reference is required');
    }

    const paymentDoc = await db.collection('pending_payments').doc(ref).get();
    if (!paymentDoc.exists) {
      throw new Error(`pending_payments/${ref} not found`);
    }
    if (paymentDoc.data().status === 'approved') {
      return { ok: true, action: 'already_approved', reference: ref };
    }

    const campayDoc = await db.collection(COLLECTIONS.campayPayments).doc(ref).get();
    // Only the gateway transaction the server recorded for this payment counts.
    // A caller-supplied transaction id could belong to someone else's payment.
    const gwRef = campayDoc.exists ? campayDoc.data().gatewayReference : null;

    if (!gwRef) {
      return { ok: false, action: 'no_gateway_reference', reference: ref };
    }

    const verified = await campayGateway.verifyTransaction(gwRef);
    if (verified.status !== 'SUCCESS') {
      return {
        ok: true,
        action: 'awaiting_payment',
        reference: ref,
        campay_status: verified.status
      };
    }

    // The successful transaction must be for this payment and for the full amount.
    const raw = verified.raw || {};
    const paidAmount = Number(raw.amount);
    const expectedAmount = Number(paymentDoc.data().amount);
    const gatewayExternalRef = String(raw.external_reference || '').trim();
    if (
      (gatewayExternalRef && gatewayExternalRef !== ref) ||
      (Number.isFinite(paidAmount) && Number.isFinite(expectedAmount) && paidAmount < expectedAmount)
    ) {
      console.error('[CamPay] transaction does not match payment', { ref, gatewayExternalRef, paidAmount, expectedAmount });
      return { ok: false, action: 'transaction_mismatch', reference: ref };
    }

    const result = await orchestrator.paymentSucceeded({
      reference: ref,
      gatewayReference: gwRef,
      gateway: 'campay',
      webhookPayload: verified.raw || null
    });

    return { ok: true, action: 'fulfilled', reference: ref, result };
  }

  async function upsertCampayPendingPayment(data) {
    const {
      reference,
      product_id,
      product_name,
      amount,
      currency,
      email,
      phone,
      type,
      ambassador_code,
      regional_director,
      ambassador_data
    } = data;

    let paymentData = {
      reference,
      product_id: product_id || 'ambassador-registration',
      product_name: product_name || `Ambassador Registration - ${reference}`,
      amount,
      currency: currency || 'XAF',
      email,
      phone,
      type: type || 'ambassador',
      status: 'pending',
      payment_channel: 'campay',
      campay_status: 'initiated',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };

    if (type === 'ambassador' || product_id === 'ambassador-registration') {
      paymentData.ambassador_code = ambassador_code || reference;
      paymentData.regional_director =
        regional_director ||
        ambassador_data?.regional_director_code ||
        ambassador_data?.recruitedBy ||
        '';
      paymentData.ambassador_data = ambassador_data || {
        code: ambassador_code || reference,
        recruitedBy: paymentData.regional_director
      };
      if (typeof normalizeAmbassadorRecruiterPaymentFields === 'function') {
        paymentData = normalizeAmbassadorRecruiterPaymentFields(paymentData);
      }
    }

    await db.collection('pending_payments').doc(reference).set(paymentData, { merge: true });

    if (typeof writeUnifiedPaymentRecord === 'function') {
      await writeUnifiedPaymentRecord({
        source: 'campay_collect',
        reference,
        external_reference: reference,
        record_type: 'customer_payment',
        channel: 'campay',
        payment_method: 'campay_momo',
        payment_category: paymentData.type || 'ambassador',
        product_id: paymentData.product_id,
        product_name: paymentData.product_name,
        amount: Number(amount || 0),
        currency: paymentData.currency,
        customer_email: email || '',
        customer_phone: phone || '',
        ambassador_code: paymentData.ambassador_code || '',
        recruiter_code: paymentData.regional_director || '',
        status: 'pending_collect',
        action_required: false,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  exports.getCampayPilotStatus = functions.https.onCall(async () => {
    return {
      success: true,
      campay_live_enabled: CAMPAY_LIVE_ENABLED,
      auto_fulfill: CAMPAY_AUTO_FULFILL,
      pilot_products: PILOT_PRODUCT_TYPES,
      policy_version: TIER2_POLICY_VERSION,
      credentials_configured: campayGateway.hasCredentials(),
      api_base: CAMPAY.apiBase,
      demo_amount_limit_xaf: CAMPAY_LIVE_ENABLED ? null : CAMPAY_DEMO_MAX_XAF
    };
  });

  /**
   * Start CamPay MoMo collection for a pending_payments reference (pilot: ambassador registration).
   */
  exports.initiateCampayCheckout = functions.https.onCall(async (data) => {
    if (!CAMPAY_LIVE_ENABLED && !campayGateway.hasCredentials()) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'CamPay live mode is off. Set commerce.campay_live_enabled=true and campay.* credentials.'
      );
    }

    const reference = String(data.reference || '').trim();
    const phone = String(data.phone || '').trim();
    const email = String(data.email || '').trim();
    const productType = String(data.product_type || 'ambassador_registration').trim();

    if (!reference || !phone) {
      throw new functions.https.HttpsError('invalid-argument', 'reference and phone are required');
    }
    if (!email) {
      throw new functions.https.HttpsError('invalid-argument', 'email is required for ambassador activation');
    }

    if (!PILOT_PRODUCT_TYPES.includes(productType)) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Product type not in pilot: ${productType}`
      );
    }

    const pendingRef = db.collection('pending_payments').doc(reference);
    const pendingDoc = await pendingRef.get();
    if (!pendingDoc.exists) {
      await upsertCampayPendingPayment({
        reference,
        product_id: data.product_id || 'ambassador-registration',
        product_name: data.product_name,
        amount: data.amount,
        currency: data.currency || 'XAF',
        email,
        phone,
        type: data.type || 'ambassador',
        ambassador_code: data.ambassador_code || reference,
        regional_director: data.regional_director || '',
        ambassador_data: data.ambassador_data || null
      });
    } else if (email || phone) {
      await pendingRef.set(
        {
          email: email || pendingDoc.data().email,
          phone: phone || pendingDoc.data().phone,
          payment_channel: 'campay',
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    const pendingSnap = await pendingRef.get();
    const pending = pendingSnap.data() || {};
    const listedAmount = Number(pending.amount || data.amount || 0);
    if (listedAmount <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'invalid payment amount');
    }

    let collectAmount = listedAmount;
    let demoCollectClamped = false;
    if (!CAMPAY_LIVE_ENABLED && collectAmount > CAMPAY_DEMO_MAX_XAF) {
      collectAmount = CAMPAY_DEMO_MAX_XAF;
      demoCollectClamped = true;
      await pendingRef.set(
        {
          campay_demo_collect_amount: collectAmount,
          campay_demo_listed_amount: listedAmount,
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    let collect;
    try {
      collect = await campayGateway.collectPayment({
        amount: collectAmount,
        currency: pending.currency || 'XAF',
        externalReference: reference,
        phone,
        description: `${productType}:${reference}`
      });
    } catch (apiErr) {
      console.error('[initiateCampayCheckout] CamPay collect failed:', apiErr.response?.data || apiErr.message);
      const detail =
        apiErr.response?.data?.detail ||
        apiErr.response?.data?.message ||
        apiErr.message ||
        'CamPay collect request failed';
      throw new functions.https.HttpsError('failed-precondition', detail);
    }

    await db.collection(COLLECTIONS.campayPayments).doc(reference).set({
      reference,
      productType,
      amount: collectAmount,
      listedAmount,
      demoCollectClamped,
      currency: pending.currency || 'XAF',
      phone,
      email,
      gateway: 'campay',
      gatewayReference: collect.gatewayReference,
      status: collect.status || 'PENDING',
      mode: collect.mode,
      policy_version: TIER2_POLICY_VERSION,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await pendingRef.update({
      payment_channel: 'campay',
      campay_reference: collect.gatewayReference,
      campay_status: collect.status === 'SUCCESS' ? 'paid' : 'pending',
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    let fulfillResult = null;
    if (collect.status === 'SUCCESS' && CAMPAY_AUTO_FULFILL) {
      fulfillResult = await orchestrator.paymentSucceeded({
        reference,
        gatewayReference: collect.gatewayReference,
        gateway: 'campay',
        webhookPayload: collect.raw || null
      });
    }

    return {
      success: true,
      reference,
      gatewayReference: collect.gatewayReference,
      status: collect.status,
      mode: collect.mode,
      checkoutUrl: collect.checkoutUrl || null,
      fulfilled: collect.status === 'SUCCESS' && !!fulfillResult,
      fulfillResult,
      collectAmount,
      listedAmount,
      demoCollectClamped
    };
  });

  /** Production CamPay webhook (separate from commerceV1CampayWebhook sandbox path). */
  exports.campayProductionWebhook = functions.https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).send('Method not allowed');
    }

    try {
      const rawBody = req.rawBody
        ? (Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : String(req.rawBody))
        : JSON.stringify(req.body || {});

      const verification = campayGateway.verifyWebhook(req.headers, rawBody);
      const logRef = db.collection(COLLECTIONS.webhookLogs).doc();
      await logRef.set({
        verified: verification.valid,
        error: verification.error || null,
        bodyPreview: rawBody.slice(0, 800),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (!verification.valid) {
        return res.status(401).json({ ok: false, error: verification.error || 'invalid_signature' });
      }

      const event = campayGateway.parseWebhook(
        typeof req.body === 'object' && Object.keys(req.body || {}).length
          ? req.body
          : JSON.parse(rawBody)
      );

      if (event.status !== 'SUCCESS') {
        return res.status(200).json({ ok: true, action: 'ignored', status: event.status });
      }

      const reference = await resolveCampayWebhookReference(event);
      if (!reference) {
        await logRef.set(
          {
            verified: verification.valid,
            error: 'missing_external_reference',
            gatewayReference: event.gatewayReference || null,
            bodyPreview: rawBody.slice(0, 800)
          },
          { merge: true }
        );
        return res.status(400).json({ ok: false, error: 'missing_external_reference' });
      }

      const idempotencyRef = db.collection('campay_webhook_processed').doc(
        `${reference}_${event.gatewayReference || 'success'}`
      );
      const idem = await idempotencyRef.get();
      if (idem.exists) {
        return res.status(200).json({ ok: true, duplicate: true });
      }

      const result = await orchestrator.paymentSucceeded({
        reference,
        gatewayReference: event.gatewayReference,
        gateway: 'campay',
        webhookPayload: event.raw
      });

      await idempotencyRef.set({
        reference,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        result
      });

      return res.status(200).json({ ok: true, result });
    } catch (err) {
      console.error('[campayProductionWebhook]', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  /**
   * Poll CamPay + auto-fulfill when user paid on phone but webhook was delayed/missed.
   */
  exports.confirmCampayPayment = functions.https.onCall(async (data) => {
    const reference = String(data.reference || '').trim();
    if (!reference) {
      throw new functions.https.HttpsError('invalid-argument', 'reference is required');
    }
    try {
      const result = await fulfillCampayIfPaid(reference, data.gateway_reference || null);
      return { success: true, ...result };
    } catch (err) {
      console.error('[confirmCampayPayment]', err);
      throw new functions.https.HttpsError('internal', err.message);
    }
  });

  /**
   * Admin: CamPay disburse for momo_cm payees (calls CamPay withdraw, then ledger mark paid).
   */
  exports.runCampayDisburseBatch = functions.https.onCall(async (data, context) => {
    const adminUser = await assertAdmin(db, context);

    if (!CAMPAY_LIVE_ENABLED && !campayGateway.hasCredentials()) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'CamPay live not enabled or credentials missing'
      );
    }

    const payeeCodes = Array.isArray(data.payee_codes) ? data.payee_codes : [];
    const dryRun = data.dry_run === true;
    const minPending = Number(data.min_pending_fcfa) || DEFAULT_MIN_PAYOUT_FCFA;
    const results = [];

    const { resolvePayeeRef } = require('./wallet-payout-tier1');
    let targets = payeeCodes;

    if (!targets.length) {
      const queue = [];
      for (const coll of ['ambassadors', 'regional_directors']) {
        const snap = await db.collection(coll).get();
        snap.forEach((doc) => {
          const summary = buildWalletSummary(doc.data(), doc.id, coll);
          const profile = summary.payout_profile || {};
          if (profile.method !== 'momo_cm' || profile.profile_complete !== true) return;
          if (doc.data().payout_profile_review_required === true) return;
          if (summary.total_pending_fcfa < minPending) return;
          queue.push({ code: doc.id, summary, collection: coll });
        });
      }
      targets = queue.map((q) => q.code);
    }

    for (const code of targets) {
      const { ref, data: payeeData, collection } = await resolvePayeeRef(db, code);
      const wallet = buildWalletSummary(payeeData, code, collection);
      const profile = wallet.payout_profile || {};
      const amount = wallet.total_pending_fcfa;

      if (payeeData.payout_profile_review_required === true) {
        results.push({ payee_code: code, status: 'skipped', reason: 'payout_profile_under_review' });
        continue;
      }
      if (profile.method !== 'momo_cm' || !profile.momo_number) {
        results.push({ payee_code: code, status: 'skipped', reason: 'not_momo_cm' });
        continue;
      }
      if (amount < minPending) {
        results.push({ payee_code: code, status: 'skipped', reason: 'below_threshold' });
        continue;
      }

      const idempotencyKey = `campay-disburse-${code}-${Date.now()}`;
      if (dryRun) {
        results.push({ payee_code: code, status: 'dry_run', amount_fcfa: amount });
        continue;
      }

      const b = wallet.sbd.pending_breakdown;
      const breakdown = {
        recruitment: wallet.recruitment.pending_fcfa,
        sbd_direct: b.direct || 0,
        sbd_senior_override: b.seniorOverride || 0,
        sbd_rd_override: b.rdOverride || 0
      };

      try {
        const disburse = await campayGateway.disbursePayment({
          amount,
          currency: 'XAF',
          momoNumber: profile.momo_number,
          externalReference: idempotencyKey
        });

        if (disburse.status !== 'SUCCESS' && disburse.mode !== 'sandbox_simulated') {
          results.push({
            payee_code: code,
            status: 'failed',
            gateway_status: disburse.status,
            gatewayReference: disburse.gatewayReference
          });
          continue;
        }

        const markResult = await deps.markPayoutBatchPaidCore(
          {
            idempotency_key: idempotencyKey,
            payee_code: code,
            amount_fcfa: amount,
            external_reference: disburse.gatewayReference || idempotencyKey,
            method: 'campay',
            breakdown
          },
          adminUser
        );

        results.push({
          payee_code: code,
          status: 'completed',
          amount_fcfa: amount,
          gatewayReference: disburse.gatewayReference,
          mark: markResult
        });
      } catch (err) {
        results.push({ payee_code: code, status: 'error', error: err.message });
      }
    }

    return {
      success: true,
      dry_run: dryRun,
      processed: results.length,
      results,
      admin: adminUser.email
    };
  });
}

module.exports = { registerCommerceOsTier2 };
