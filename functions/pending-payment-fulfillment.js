/**
 * Shared pending_payments → approved fulfillment (manual admin, CamPay webhook, etc.).
 */

function createPendingPaymentFulfillment(deps) {
  const {
    db,
    admin,
    writeUnifiedPaymentRecord,
    normalizeAmbassadorPayment,
    activateAmbassador,
    activateRD,
    trackAmbassadorSale,
    trackReferralSale,
    generateDownloadURL,
    sendDownloadEmail,
    sendTelegram,
    TELEGRAM_BOT_TOKEN
  } = deps;

  async function fulfillPendingPayment(reference, options = {}) {
    const ref = String(reference || '').trim();
    if (!ref) {
      throw new Error('reference is required');
    }

    const channel = options.channel || 'manual';
    const paymentMethod = options.payment_method || (channel === 'campay' ? 'campay_momo' : 'momo');
    const gatewayReference = options.gateway_reference || null;

    const paymentRef = db.collection('pending_payments').doc(ref);
    const paymentDoc = await paymentRef.get();

    if (!paymentDoc.exists) {
      throw new Error(`Payment not found: ${ref}`);
    }

    const payment = paymentDoc.data();
    const isAmbassadorRegistration =
      payment.product_id === 'ambassador-registration' || payment.type === 'ambassador';
    const ambassadorCode = payment.ambassador_code || ref;
    let ambassadorExists = false;

    if (isAmbassadorRegistration) {
      const ambSnap = await db.collection('ambassadors').doc(ambassadorCode).get();
      ambassadorExists = ambSnap.exists;
    }

    if (payment.status === 'approved' && options.skipIfApproved !== false) {
      if (isAmbassadorRegistration && !ambassadorExists) {
        console.warn(
          `[fulfill] ${ref} approved but ambassador ${ambassadorCode} missing — retrying activation`
        );
      } else {
        return {
          success: true,
          duplicate: true,
          message: 'Payment already approved',
          reference: ref
        };
      }
    }

    if (payment.status !== 'approved') {
      await paymentRef.update({
        status: 'approved',
        approved_at: admin.firestore.FieldValue.serverTimestamp(),
        payment_channel: channel,
        campay_reference: gatewayReference || payment.campay_reference || null
      });
    } else if (gatewayReference || channel !== 'manual') {
      await paymentRef.update({
        payment_channel: channel,
        campay_reference: gatewayReference || payment.campay_reference || null,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    await writeUnifiedPaymentRecord({
      source: channel === 'campay' ? 'campay_webhook' : 'manual_payment',
      reference: ref,
      external_reference: gatewayReference || ref,
      record_type: 'customer_payment',
      channel,
      payment_method: paymentMethod,
      payment_category: payment.type || payment.product_id || 'book-purchase',
      product_id: payment.product_id || '',
      product_name: payment.product_name || '',
      amount: Number(payment.amount || 0),
      currency: payment.currency || 'XAF',
      customer_email: payment.email || '',
      customer_phone: payment.phone || '',
      ambassador_code: payment.ambassador_code || '',
      recruiter_code: payment.regional_director || payment.rd_code || '',
      status: 'approved',
      action_required: false,
      approved_at: admin.firestore.FieldValue.serverTimestamp()
    });

    if (payment.product_id === 'rd-registration' && payment.rd_code) {
      await activateRD(payment);
      if (TELEGRAM_BOT_TOKEN) {
        const rdMsg = `✅ RD REGISTRATION APPROVED (${channel})\n\n` +
          `👑 Code: ${payment.rd_code}\n` +
          `📧 Email: ${payment.email}\n` +
          `💰 Fee: ${payment.amount} ${payment.currency}`;
        await sendTelegram(rdMsg, false);
      }
      return {
        success: true,
        message: 'RD registration approved',
        rd_code: payment.rd_code,
        channel
      };
    }

    if (payment.product_id === 'ambassador-registration' || payment.type === 'ambassador') {
      const normalized = normalizeAmbassadorPayment(payment, ref);
      try {
        await activateAmbassador(normalized, ref);
      } catch (activationError) {
        if (TELEGRAM_BOT_TOKEN) {
          await sendTelegram(
            `🚨 Ambassador activation failed (${channel})\n\nReference: ${ref}\nError: ${activationError.message}`,
            false
          );
        }
        throw activationError;
      }
      return {
        success: true,
        message: 'Ambassador registration approved',
        ambassador_code: normalized.ambassador_code,
        channel
      };
    }

    if (payment.ambassador_ref) {
      await trackAmbassadorSale(payment.ambassador_ref, payment.amount);
    }
    if (payment.referral_code) {
      await trackReferralSale(payment.referral_code, payment.amount);
    }

    const downloadUrl = await generateDownloadURL(payment.product_id);
    const emailSent = await sendDownloadEmail(
      payment.email,
      payment.product_name,
      downloadUrl,
      ref
    );

    if (TELEGRAM_BOT_TOKEN) {
      const adminMsg = `✅ PAYMENT APPROVED (${channel})\n\n` +
        `📋 Reference: ${payment.reference}\n` +
        `👤 Customer: ${payment.email}\n` +
        `📚 Product: ${payment.product_name}\n` +
        `💰 Amount: ${payment.amount} ${payment.currency}`;
      await sendTelegram(adminMsg, false);
    }

    return {
      success: true,
      message: 'Payment approved successfully',
      download_url: downloadUrl,
      email_sent: emailSent,
      channel
    };
  }

  return { fulfillPendingPayment };
}

module.exports = { createPendingPaymentFulfillment };
