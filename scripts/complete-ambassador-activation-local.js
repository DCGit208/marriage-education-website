/**
 * Local recovery: run ambassador activation + recruitment bonuses from pending_payments.
 * Usage: node scripts/complete-ambassador-activation-local.js AMB-ACHA-0252
 */

const admin = require('firebase-admin');
const axios = require('axios');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const { creditRecruitmentBonusesV2 } = require('../functions/recruitment-bonus-service');
const { normalizeReferralCode } = require('../functions/recruitment-bonus-policy');

function pickRdCode(...candidates) {
  for (const code of candidates) {
    const n = String(code || '').trim();
    if (n.startsWith('RD-')) return n;
  }
  return null;
}

function normalizePayment(payment, reference) {
  const ref = payment.reference || reference;
  const ambassadorCode = payment.ambassador_code || ref;
  const regional_director = normalizeReferralCode(
    payment.regional_director || payment.referral_code || payment.ambassador_data?.recruitedBy || ''
  );
  let ambassadorData = { ...(payment.ambassador_data || {}) };
  if (regional_director) {
    ambassadorData.recruitedBy = regional_director;
    if (regional_director.startsWith('AMB-')) ambassadorData.senior_code = regional_director;
    if (regional_director.startsWith('RD-')) ambassadorData.regional_director_code = regional_director;
  }
  if (!ambassadorData.fullName) {
    const token = ambassadorCode.replace(/^AMB-/, '').split('-')[0] || 'Ambassador';
    const pretty = token.length > 1 ? token.charAt(0) + token.slice(1).toLowerCase() : token;
    ambassadorData.fullName = pretty;
    ambassadorData.firstName = pretty;
    ambassadorData.lastName = '';
  }
  ambassadorData.code = ambassadorCode;
  if (!ambassadorData.recruitedBy && regional_director) ambassadorData.recruitedBy = regional_director;
  if (!ambassadorData.senior_code && regional_director.startsWith('AMB-')) {
    ambassadorData.senior_code = regional_director;
  }
  return {
    ...payment,
    reference: ref,
    ambassador_code: ambassadorCode,
    regional_director,
    ambassador_data: ambassadorData
  };
}

async function resolveRdUpline(ambData) {
  const direct = pickRdCode(
    ambData.rdCode,
    ambData.recruited_by_rd,
    ambData.regional_director_code,
    ambData.recruitedBy,
    ambData.recruited_by
  );
  if (direct) return direct;
  const senior = ambData.senior_code;
  if (senior && senior.startsWith('AMB-')) {
    const s = await db.collection('ambassadors').doc(senior).get();
    if (s.exists) {
      const d = s.data();
      return pickRdCode(d.rdCode, d.recruited_by_rd, d.regional_director_code, d.recruitedBy);
    }
  }
  return null;
}

async function sendTelegram(text) {
  const bot = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!bot || !chat) {
    console.log('ℹ️  Telegram skipped (set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)');
    return;
  }
  await axios.post(
    `https://api.telegram.org/bot${bot}/sendMessage`,
    { chat_id: chat, text },
    { timeout: 20000 }
  );
}

async function main() {
  const reference = process.argv[2];
  if (!reference) {
    console.error('Usage: node scripts/complete-ambassador-activation-local.js <reference>');
    process.exit(1);
  }

  const snap = await db.collection('pending_payments').doc(reference).get();
  if (!snap.exists) {
    console.error('Payment not found');
    process.exit(1);
  }

  const payment = normalizePayment(snap.data(), reference);
  const { ambassador_code: code, ambassador_data: data, email, phone, regional_director } = payment;

  let rdForNew = regional_director;
  if (rdForNew.startsWith('AMB-')) {
    const recruiter = await db.collection('ambassadors').doc(rdForNew).get();
    if (recruiter.exists) {
      const upl = await resolveRdUpline(recruiter.data());
      if (upl) rdForNew = upl;
    }
  }

  const ambRef = db.collection('ambassadors').doc(code);
  if (!(await ambRef.get()).exists) {
    await ambRef.set({
      ...data,
      ambassadorCode: code,
      code,
      email,
      phone,
      recruitedBy: regional_director.startsWith('AMB-') ? regional_director : data.recruitedBy || '',
      senior_code: data.senior_code || (regional_director.startsWith('AMB-') ? regional_director : ''),
      rdCode: rdForNew.startsWith('RD-') ? rdForNew : '',
      status: 'active',
      booksSold: 0,
      commissionEarned: 0,
      level: 'Starter',
      role_level: 1,
      activated_at: admin.firestore.FieldValue.serverTimestamp(),
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('✅ Ambassador created:', code);
  } else {
    console.log('ℹ️  Ambassador already exists:', code);
  }

  const bonusExists = await db
    .collection('admin_notifications')
    .where('ambassador_code', '==', code)
    .where('type', '==', 'rd_recruitment_bonus')
    .limit(1)
    .get();

  const recruiterCode = normalizeReferralCode(
    regional_director || data.recruitedBy || payment.ambassador_data?.recruitedBy || ''
  );

  if (!bonusExists.empty) {
    console.log('ℹ️  Recruitment bonuses already recorded');
  } else if (recruiterCode) {
    const plan = await creditRecruitmentBonusesV2({
      db,
      newAmbassadorCode: code,
      newAmbassadorName: data.fullName,
      directRecruiterCode: recruiterCode,
      sendTelegram
    });
    console.log(
      `✅ Recruitment bonuses (${plan.policy_version}): ${plan.total_paid_fcfa} FCFA across ${plan.payouts.length} payee(s)`
    );
  }

  const bookUrl = `https://us-central1-marriage-education.cloudfunctions.net/downloadBook?ref=${code}`;
  const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString();

  console.log('\n📧 Sending welcome email with book link...');
  try {
    const { execSync } = require('child_process');
    execSync(
      `node "${path.join(__dirname, 'resend-ambassador-access-email.js')}" ${code} ${email}`,
      { stdio: 'inherit', env: process.env }
    );
  } catch (emailErr) {
    console.warn('⚠️  Email send failed — run manually:');
    console.warn(`   node scripts/resend-ambassador-access-email.js ${code} ${email}`);
    await sendTelegram(
      `✅ AMBASSADOR REGISTRATION APPROVED (RECOVERY)\n\n` +
        `🎯 Code: ${code}\n` +
        `📧 Email: ${email}\n` +
        `⚠️ Welcome email failed — resend book link manually.\n` +
        `📥 Book: ${bookUrl}`
    );
  }

  console.log('\nDone. Refresh admin dashboard → Recruitment Bonuses.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
