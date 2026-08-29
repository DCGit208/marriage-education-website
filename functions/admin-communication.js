/**
 * Admin Communication Center — operator dashboard messages + optional customer email.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const RECIPIENT_TYPES = new Set(['all', 'ambassadors', 'rds', 'referrals']);

const RECIPIENT_LABELS = {
  all: 'All Customers',
  ambassadors: 'All Ambassadors',
  rds: 'All Regional Directors',
  referrals: 'All Referral Users'
};

const AUDIENCE_BY_RECIPIENT_TYPE = {
  all: 'customers',
  ambassadors: 'ambassadors',
  rds: 'regional_directors',
  referrals: 'referrals'
};

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function displayName(data) {
  if (data.name) return data.name;
  const first = data.firstName || data.first_name || '';
  const last = data.lastName || data.last_name || '';
  const full = `${first} ${last}`.trim();
  return full || 'Member';
}

function addRecipient(map, rawEmail, meta) {
  const email = normalizeEmail(rawEmail);
  if (!email || !isValidEmail(email)) return;
  if (!map.has(email)) {
    map.set(email, { email, ...meta });
  }
}

function isOperatorAudience(recipientType) {
  return recipientType !== 'all';
}

async function resolveRecipients(db, recipientType) {
  const recipients = new Map();

  if (recipientType === 'all') {
    const customersSnap = await db.collection('customers').get();
    customersSnap.forEach((doc) => {
      const data = doc.data();
      addRecipient(recipients, data.email, {
        name: displayName(data),
        sourceId: doc.id,
        sourceType: 'customer'
      });
    });

    const paymentsSnap = await db.collection('pending_payments').get();
    paymentsSnap.forEach((doc) => {
      const data = doc.data();
      addRecipient(recipients, data.email, {
        name: data.name || data.fullName || 'Customer',
        sourceId: doc.id,
        sourceType: 'pending_payment'
      });
    });
  }

  if (recipientType === 'ambassadors') {
    const snap = await db.collection('ambassadors').get();
    snap.forEach((doc) => {
      const data = doc.data();
      addRecipient(recipients, data.email, {
        name: displayName(data),
        sourceId: doc.id,
        sourceType: 'ambassador',
        operatorCode: doc.id
      });
    });
  }

  if (recipientType === 'rds') {
    const snap = await db.collection('regional_directors').get();
    snap.forEach((doc) => {
      const data = doc.data();
      const status = String(data.status || 'active').toLowerCase();
      if (status === 'rejected' || status === 'inactive') return;
      addRecipient(recipients, data.email, {
        name: displayName(data),
        sourceId: doc.id,
        sourceType: 'regional_director',
        operatorCode: data.code || doc.id
      });
    });
  }

  if (recipientType === 'referrals') {
    const snap = await db.collection('referral_codes').get();
    snap.forEach((doc) => {
      const data = doc.data();
      addRecipient(recipients, data.email, {
        name: data.name || data.code || 'Referral User',
        sourceId: doc.id,
        sourceType: 'referral_code',
        operatorCode: data.code || doc.id
      });
    });
  }

  return [...recipients.values()];
}

function buildEmailHtml(subject, message, recipientName) {
  const safeSubject = escapeHtml(subject);
  const safeBody = escapeHtml(message).replace(/\n/g, '<br>');
  const greeting = recipientName ? `<p>Hello ${escapeHtml(recipientName)},</p>` : '';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 24px; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0; font-size: 22px;">Marriage Education</h1>
        <p style="margin: 8px 0 0; opacity: 0.9;">${safeSubject}</p>
      </div>
      <div style="background: #f8f9fa; padding: 24px; border-radius: 0 0 10px 10px; line-height: 1.6;">
        ${greeting}
        <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e9ecef;">
          ${safeBody}
        </div>
        <p style="margin-top: 20px; font-size: 13px; color: #636e72;">
          Sent from the Marriage Education admin Communication Center.
        </p>
      </div>
    </div>
  `;
}

async function sendEmails(transporter, smtpFrom, recipients, subject, message) {
  let sent = 0;
  let failed = 0;
  const failures = [];

  if (!transporter) {
    return {
      sent: 0,
      failed: recipients.length,
      failures: recipients.map((r) => ({ email: r.email, error: 'SMTP not configured' }))
    };
  }

  for (const recipient of recipients) {
    try {
      await transporter.sendMail({
        from: `"Marriage Education" <${smtpFrom}>`,
        to: recipient.email,
        subject,
        text: message,
        html: buildEmailHtml(subject, message, recipient.name)
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      failures.push({ email: recipient.email, error: err.message || 'Send failed' });
      console.error('[Communication] Email failed for', recipient.email, err.message);
    }
  }

  return { sent, failed, failures };
}

async function publishDashboardAnnouncement(db, payload) {
  const ref = db.collection('announcements').doc();
  await ref.set({
    title: payload.subject,
    body: payload.message,
    message: payload.message,
    audience: payload.audience,
    recipientType: payload.recipientType,
    recipientLabel: payload.recipientLabel,
    recipientCodes: payload.recipientCodes || [],
    delivery: 'operator_dashboard',
    sentBy: payload.sentBy,
    sentByUid: payload.sentByUid,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return ref.id;
}

function registerAdminCommunication(db, exports, deps) {
  const assertAdmin = deps.assertAdmin;
  const transporter = deps.transporter;
  const smtpFrom = deps.smtpFrom || 'orders@marriageducation.com';

  exports.sendAdminCommunication = functions
    .runWith({ timeoutSeconds: 540, memory: '512MB' })
    .https.onCall(async (data, context) => {
      const adminUser = await assertAdmin(db, context);

      const recipientType = String((data && data.recipientType) || '').trim();
      const subject = String((data && data.subject) || '').trim();
      const message = String((data && data.message) || '').trim();
      const sendEmail = data && data.sendEmail === true;

      if (!RECIPIENT_TYPES.has(recipientType)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid recipient type');
      }
      if (!subject) {
        throw new functions.https.HttpsError('invalid-argument', 'Subject is required');
      }
      if (!message) {
        throw new functions.https.HttpsError('invalid-argument', 'Message is required');
      }

      const recipients = await resolveRecipients(db, recipientType);
      const audience = AUDIENCE_BY_RECIPIENT_TYPE[recipientType] || recipientType;
      const operatorAudience = isOperatorAudience(recipientType);

      if (!operatorAudience && !recipients.length) {
        throw new functions.https.HttpsError('failed-precondition', 'No recipients found for this audience');
      }

      let announcementId = null;
      let emailResult = { sent: 0, failed: 0, failures: [] };

      if (operatorAudience) {
        announcementId = await publishDashboardAnnouncement(db, {
          subject,
          message,
          audience,
          recipientType,
          recipientLabel: RECIPIENT_LABELS[recipientType] || recipientType,
          recipientCodes: recipients.map((r) => r.operatorCode).filter(Boolean),
          sentBy: adminUser.email || adminUser.uid,
          sentByUid: adminUser.uid
        });
      }

      if (!operatorAudience || sendEmail) {
        if (!recipients.length) {
          throw new functions.https.HttpsError('failed-precondition', 'No email recipients found for this audience');
        }
        emailResult = await sendEmails(transporter, smtpFrom, recipients, subject, message);
      }

      const logRef = db.collection('admin_communications').doc();
      const logPayload = {
        recipientType,
        recipientLabel: RECIPIENT_LABELS[recipientType] || recipientType,
        audience,
        subject,
        message,
        totalRecipients: recipients.length,
        announcementId,
        dashboardDelivered: !!announcementId,
        emailsSent: emailResult.sent,
        emailsFailed: emailResult.failed,
        sentBy: adminUser.email || adminUser.uid,
        sentByUid: adminUser.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        failures: emailResult.failures.slice(0, 25)
      };
      await logRef.set(logPayload);

      if (!announcementId && emailResult.sent === 0) {
        throw new functions.https.HttpsError(
          'internal',
          emailResult.failures[0]?.error || 'Could not deliver message to dashboard or email'
        );
      }

      return {
        success: true,
        communicationId: logRef.id,
        announcementId,
        recipientType,
        recipientLabel: logPayload.recipientLabel,
        audience,
        totalRecipients: recipients.length,
        dashboardDelivered: !!announcementId,
        emailsSent: emailResult.sent,
        emailsFailed: emailResult.failed
      };
    });
}

module.exports = {
  registerAdminCommunication,
  resolveRecipients,
  RECIPIENT_LABELS,
  AUDIENCE_BY_RECIPIENT_TYPE
};
