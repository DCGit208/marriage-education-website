/**
 * Resend ambassador welcome email with book download link (MoMo / manual approvals).
 *
 * Usage:
 *   node scripts/resend-ambassador-access-email.js <ambassador-code> [email]
 */

const path = require('path');
const { Resend } = require(path.join(__dirname, '../functions/node_modules/resend'));
const admin = require('firebase-admin');
const axios = require('axios');

const serviceAccount = require(path.join(__dirname, '../serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function getResendKey() {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  try {
    const { execSync } = require('child_process');
    const out = execSync('firebase functions:config:get resend', {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8'
    });
    const cfg = JSON.parse(out);
    return cfg.key || cfg.api_key;
  } catch {
    return null;
  }
}

async function sendTelegram(text) {
  const bot = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!bot || !chat) return;
  await axios.post(`https://api.telegram.org/bot${bot}/sendMessage`, {
    chat_id: chat,
    text
  });
}

async function main() {
  const ambassadorCode = process.argv[2];
  let email = process.argv[3];

  if (!ambassadorCode) {
    console.error('Usage: node scripts/resend-ambassador-access-email.js <code> [email]');
    process.exit(1);
  }

  const resendKey = await getResendKey();
  if (!resendKey) {
    console.error('Set RESEND_API_KEY or firebase functions:config resend.key');
    process.exit(1);
  }

  const ambDoc = await db.collection('ambassadors').doc(ambassadorCode).get();
  if (!ambDoc.exists) {
    console.error('Ambassador not found:', ambassadorCode);
    process.exit(1);
  }

  const amb = ambDoc.data();
  email = (email || amb.email || '').trim().toLowerCase();
  if (!email) {
    console.error('No email on file');
    process.exit(1);
  }

  const ambassadorName = amb.fullName || amb.name || 'Ambassador';
  const bookUrl = `https://us-central1-marriage-education.cloudfunctions.net/downloadBook?ref=${ambassadorCode}`;
  const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString();

  const resend = new Resend(resendKey);
  await resend.emails.send({
    to: email,
    from: 'Marriage Education <orders@marriageducation.com>',
    subject: `Account Activated: ${ambassadorCode}`,
    html: `
      <motion.div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
          <h1 style="margin: 0;">Welcome, Ambassador!</h1>
        </motion.div>
        <motion.div style="padding: 30px; background: #f9f9f9;">
          <p>Dear ${ambassadorName},</p>
          <p>Your ambassador account is active.</p>
          <p><strong>Code:</strong> ${ambassadorCode}</p>
          <p><strong>Email:</strong> ${email}</p>
          <div style="background: #fff; border: 2px solid #00b894; border-radius: 5px; padding: 15px; margin: 20px 0;">
            <h3 style="color: #00b894;">Your Welcome Book</h3>
            <p>Download (expires ${expiryDate}):</p>
            <a href="${bookUrl}" style="display: inline-block; background: #00b894; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">Download Book</a>
            <p style="font-size: 11px; word-break: break-all; margin-top: 12px;">${bookUrl}</p>
          </motion.div>
          <a href="https://marriageducation.com/ambassador-login.html">Ambassador Dashboard</a>
        </motion.div>
      </motion.div>
    `.replace(/<motion\./g, '<').replace(/<\/motion\./g, '</')
  });

  console.log('✅ Email sent to', email);
  console.log('📥 Book link:', bookUrl);

  await sendTelegram(
    `✅ AMBASSADOR ACCESS EMAIL RESENT\n\n` +
      `🎯 Code: ${ambassadorCode}\n` +
      `👤 Name: ${ambassadorName}\n` +
      `📧 Email: ${email}\n\n` +
      `📥 Book Download (expires ${expiryDate}):\n${bookUrl}\n\n` +
      `🔐 Dashboard: https://marriageducation.com/ambassador-login.html`
  );
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
