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
  TIER2_POLICY_VERSION
} = require('./commerce-os/config');
const {
  buildWalletSummary,
  DEFAULT_MIN_PAYOUT_FCFA
} = require('./wallet-payout-tier1');

function registerCommerceOsTier2(db, admin, exports, deps) {
  const { fulfillPendingPayment, assertAdmin, markPayoutBatchPaidCore } = deps;
  const orchestrator = createOrchestrator({ db, admin, fulfillPendingPayment });

  exports.getCampayPilotStatus = functions.https.onCall(async () => {
    return {
      success: true,
      campay_live_enabled: CAMPAY_LIVE_ENABLED,
      auto_fulfill: CAMPAY_AUTO_FULFILL,
      pilot_products: PILOT_PRODUCT_TYPES,
      policy_version: TIER2_POLICY_VERSION,
      credentials_configured: campayGateway.hasCredentials()
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
    const productType = String(data.product_type || 'ambassador_registration').trim();

    if (!reference || !phone) {
      throw new functions.https.HttpsError('invalid-argument', 'reference and phone are required');
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
      throw new functions.https.HttpsError('not-found', 'pending payment not found — submit registration first');
    }

    const pending = pendingDoc.data();
    const amount = Number(pending.amount || data.amount || 0);
    if (amount <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'invalid payment amount');
    }

    const collect = await campayGateway.collectPayment({
      amount,
      currency: pending.currency || 'XAF',
      externalReference: reference,
      phone,
      description: `${productType}:${reference}`
    });

    await db.collection(COLLECTIONS.campayPayments).doc(reference).set({
      reference,
      productType,
      amount,
      currency: pending.currency || 'XAF',
      phone,
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
      campay_status: 'pending',
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      reference,
      gatewayReference: collect.gatewayReference,
      status: collect.status,
      mode: collect.mode,
      checkoutUrl: collect.checkoutUrl || null
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

      const reference = String(event.externalReference || '').trim();
      if (!reference) {
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
