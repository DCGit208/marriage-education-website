/**
 * Correct customer email on a pending payment (and related Firestore docs),
 * then optionally resend the same "NEW PAYMENT PENDING APPROVAL" Telegram
 * used by submitManualPayment (functions/index.js).
 *
 * Usage:
 *   node fix-pending-payment-email.js <reference> <new-email> [options]
 *
 * Telegram (optional): export TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID for the same
 * bot/chat as production, or pass --no-telegram.
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

function resolveTelegramCredentials(flags) {
  if (flags.noTelegram) return null;
  return telegramFromEnv();
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

async function main() {
  const { positional, flags } = parseArgs(process.argv);
  const [reference, newEmail] = positional;

  if (!reference || !newEmail) {
    console.error('Usage: node fix-pending-payment-email.js <reference> <new-email> [options]');
    process.exit(1);
  }

  const normalizedEmail = String(newEmail).trim();
  if (!normalizedEmail.includes('@')) {
    console.error('Invalid email:', newEmail);
    process.exit(1);
  }

  const paymentRef = db.collection('pending_payments').doc(reference);
  const snap = await paymentRef.get();
  if (!snap.exists) {
    console.error(`No pending_payments document: ${reference}`);
    process.exit(1);
  }

  const before = snap.data();
  console.log('\n--- Current pending_payments (subset) ---');
  console.log({
    email: before.email,
    ambassador_code: before.ambassador_code,
    regional_director: before.regional_director,
    type: before.type,
    status: before.status
  });

  const updates = {
    email: normalizedEmail,
    'ambassador_data.email': normalizedEmail
  };

  await paymentRef.update(updates);
  console.log('\n✅ pending_payments updated (email + ambassador_data.email)');

  const regRef = db.collection('ambassador_registrations').doc(reference);
  const regSnap = await regRef.get();
  if (regSnap.exists) {
    await regRef.update({ email: normalizedEmail });
    console.log('✅ ambassador_registrations updated');
  } else {
    console.log('ℹ️  ambassador_registrations doc not found (skipped)');
  }

  const ledgerId = `manual_payment__${reference.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const ledgerRef = db.collection('payments').doc(ledgerId);
  const ledgerSnap = await ledgerRef.get();
  if (ledgerSnap.exists) {
    await ledgerRef.update({
      customer_email: normalizedEmail,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`✅ payments/${ledgerId} customer_email updated`);
  } else {
    console.log(`ℹ️  payments/${ledgerId} not found (skipped)`);
  }

  const afterSnap = await paymentRef.get();
  const payment = afterSnap.data();

  const tg = resolveTelegramCredentials(flags);
  if (!tg) {
    if (!flags.noTelegram) {
      console.log(
        '\nℹ️  Telegram not sent (set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID, or use --no-telegram).'
      );
    }
    process.exit(0);
  }

  const msg = buildPendingApprovalMessage(payment);
  try {
    await sendTelegram(tg.bot_token, tg.chat_id, msg);
    console.log('\n✅ Telegram pending-approval message sent');
  } catch (e) {
    const status = e.response?.status;
    const desc = e.response?.data?.description || e.message;
    console.warn('\n⚠️  Firestore updates succeeded; Telegram send failed:', status || '', desc);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
