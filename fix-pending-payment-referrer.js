/**
 * Attach missing recruiter to a pending ambassador payment and resend
 * the "NEW PAYMENT PENDING APPROVAL" Telegram (same format as submitManualPayment).
 *
 * Usage:
 *   node fix-pending-payment-referrer.js <reference> <recruiter-code> [options]
 *
 * Example:
 *   node fix-pending-payment-referrer.js AMB-ACHA-0252 AMB-NGON-4524
 */

const admin = require('firebase-admin');
const axios = require('axios');

function telegramFromEnv() {
  const bot_token = process.env.TELEGRAM_BOT_TOKEN;
  const chat_id = process.env.TELEGRAM_CHAT_ID;
  if (!bot_token || !chat_id) return null;
  return { bot_token: bot_token.trim(), chat_id: String(chat_id).trim() };
}

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'marriage-education.firebasestorage.app'
});

const db = admin.firestore();

function parseArgs(argv) {
  const args = { positional: [], flags: {} };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-telegram') args.flags.noTelegram = true;
    else if (a.startsWith('--')) {
      console.error('Unknown flag:', a);
      process.exit(1);
    } else args.positional.push(a);
  }
  return args;
}

async function sendTelegram(botToken, chatId, text) {
  await axios.post(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    { chat_id: chatId, text },
    { timeout: 20000 }
  );
}

function buildPendingApprovalMessage(payment) {
  const type = payment.type || '';
  const typeLabel =
    type === 'ambassador'
      ? '🎯 Ambassador Registration'
      : type === 'rd'
        ? '👑 RD Registration'
        : '📚 Book Purchase';

  const reference = payment.reference || '';
  const product_name = payment.product_name || '';
  const amount = payment.amount ?? '';
  const currency = payment.currency || 'XAF';
  const email = payment.email || '';
  const phone = payment.phone || 'N/A';
  const ambassador_code = payment.ambassador_code || '';
  const regional_director = payment.regional_director || '';
  const ambassador_ref = payment.ambassador_ref || '';
  const referral_code = payment.referral_code || '';
  const rd_code = payment.rd_code || '';

  return (
    `🔔 NEW PAYMENT PENDING APPROVAL\n\n` +
    `📋 Reference: ${reference}\n` +
    `📚 Type: ${typeLabel}\n` +
    `📦 Product: ${product_name}\n` +
    `💰 Amount: ${amount} ${currency}\n` +
    `👤 Customer: ${email}\n` +
    `📱 Phone: ${phone}\n` +
    `${ambassador_code ? `🎯 Ambassador Code: ${ambassador_code}\n` : ''}` +
    `${regional_director ? `👑 Recruited By: ${regional_director}\n` : ''}` +
    `${ambassador_ref ? `🎯 Ambassador: ${ambassador_ref}\n` : ''}` +
    `${referral_code ? `🔗 Referral: ${referral_code}\n` : ''}` +
    `${rd_code ? `👑 RD: ${rd_code}\n` : ''}\n` +
    `👉 Review: https://marriageducation.com/admin-dashboard.html`
  );
}

function normalizeReferralCode(raw) {
  let c = String(raw || '').trim().toUpperCase();
  if (!c) return '';
  if (/^(AMB|RD|SNR)([_-]|$)/.test(c)) c = c.replace(/_/g, '-');
  return c.replace(/-+/g, '-');
}

function recruiterFields(recruiterCode) {
  const recruitedBy = normalizeReferralCode(recruiterCode);
  const recruited_by_type = recruitedBy.startsWith('RD-')
    ? 'regional_director'
    : recruitedBy.startsWith('AMB-')
      ? 'senior_ambassador'
      : 'ambassador';

  const ambassadorDataPatch = {
    recruitedBy,
    recruited_by_type,
    regional_director: recruitedBy.startsWith('RD-') ? recruitedBy : '',
    regional_director_code: recruitedBy.startsWith('RD-') ? recruitedBy : '',
    senior_code: recruitedBy.startsWith('AMB-') ? recruitedBy : null
  };

  return {
    regional_director: recruitedBy,
    referral_code: recruitedBy,
    ambassadorDataPatch
  };
}

async function main() {
  const { positional, flags } = parseArgs(process.argv);
  const [reference, recruiterCode] = positional;

  if (!reference || !recruiterCode) {
    console.error('Usage: node fix-pending-payment-referrer.js <reference> <recruiter-code>');
    process.exit(1);
  }

  if (!/^(AMB-|RD-|SNR-)/.test(recruiterCode)) {
    console.error('Recruiter code should start with AMB-, RD-, or SNR-');
    process.exit(1);
  }

  const recruiterSnap = await db.collection('ambassadors').doc(recruiterCode).get();
  const rdSnap = await db.collection('regional_directors').doc(recruiterCode).get();
  if (!recruiterSnap.exists && !rdSnap.exists) {
    console.warn(`⚠️  Warning: ${recruiterCode} not found in ambassadors or regional_directors`);
  }

  const paymentRef = db.collection('pending_payments').doc(reference);
  const snap = await paymentRef.get();
  if (!snap.exists) {
    console.error(`No pending_payments document: ${reference}`);
    process.exit(1);
  }

  const before = snap.data();
  if (before.status && before.status !== 'pending') {
    console.error(`Payment status is "${before.status}" — only pending payments can be patched.`);
    process.exit(1);
  }

  console.log('\n--- Before ---');
  console.log({
    regional_director: before.regional_director || '(empty)',
    ambassador_data_recruitedBy: before.ambassador_data?.recruitedBy || '(empty)'
  });

  const { regional_director, referral_code, ambassadorDataPatch } = recruiterFields(recruiterCode);
  const ambassador_data = {
    ...(before.ambassador_data || {}),
    ...ambassadorDataPatch
  };

  await paymentRef.update({
    ambassador_code: reference,
    regional_director,
    referral_code,
    ambassador_data,
    recruiter_corrected_at: admin.firestore.FieldValue.serverTimestamp(),
    recruiter_corrected_from: before.regional_director || ''
  });
  console.log('\n✅ pending_payments updated');

  const ledgerId = `manual_payment__${reference.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const ledgerRef = db.collection('payments').doc(ledgerId);
  const ledgerSnap = await ledgerRef.get();
  if (ledgerSnap.exists) {
    await ledgerRef.update({
      recruiter_code: regional_director,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`✅ payments/${ledgerId} recruiter_code updated`);
  }

  const regRef = db.collection('ambassador_registrations').doc(reference);
  const regSnap = await regRef.get();
  if (regSnap.exists) {
    await regRef.update({
      recruitedBy: regional_director,
      regional_director,
      senior_code: ambassadorDataPatch.senior_code || ''
    });
    console.log('✅ ambassador_registrations updated');
  }

  const afterSnap = await paymentRef.get();
  const payment = afterSnap.data();

  console.log('\n--- After ---');
  console.log({
    regional_director: payment.regional_director,
    ambassador_data_recruitedBy: payment.ambassador_data?.recruitedBy
  });

  const tg = flags.noTelegram ? null : telegramFromEnv();
  if (!tg) {
    console.log('\nℹ️  Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to resend Telegram notification.');
    process.exit(0);
  }

  const msg = buildPendingApprovalMessage(payment);
  await sendTelegram(tg.bot_token, tg.chat_id, msg);
  console.log('\n✅ Telegram pending-approval message sent (with Recruited By)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
