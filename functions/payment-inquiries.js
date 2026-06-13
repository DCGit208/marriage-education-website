/**
 * Ambassador payment inquiries — submit + admin resolve.
 * @see docs/WALLET-DATA-MODEL.md
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { resolvePayeeRef, buildWalletSummary } = require('./wallet-payout-tier1');

const INQUIRY_TYPES = new Set([
  'missing_payment',
  'wrong_amount',
  'delayed_payout',
  'profile_issue',
  'payout_request',
  'other'
]);

const INQUIRY_LABELS = {
  missing_payment: 'Missing payment',
  wrong_amount: 'Wrong amount',
  delayed_payout: 'Delayed payout',
  profile_issue: 'Payout profile issue',
  payout_request: 'Request payout review',
  other: 'Other'
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function registerPaymentInquiries(db, exports, deps) {
  const assertAdmin = deps.assertAdmin;
  const sendTelegram = deps.sendTelegram || (async () => {});

  exports.submitPaymentInquiry = functions.https.onCall(async (data) => {
    const payeeCode = (data && data.payee_code || '').toString().trim();
    const inquiryType = (data && data.inquiry_type || '').toString().trim();
    const notes = (data && data.notes || '').toString().trim();
    const relatedRef = (data && data.related_ref || '').toString().trim() || null;
    const amountExpected = num(data && data.amount_expected_fcfa);

    if (!payeeCode) {
      throw new functions.https.HttpsError('invalid-argument', 'payee_code is required');
    }
    if (!INQUIRY_TYPES.has(inquiryType)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid inquiry_type');
    }
    if (notes.length < 10) {
      throw new functions.https.HttpsError('invalid-argument', 'Please describe the issue (at least 10 characters).');
    }
    if (notes.length > 2000) {
      throw new functions.https.HttpsError('invalid-argument', 'Notes must be under 2000 characters.');
    }

    const { data: payeeData, collection } = await resolvePayeeRef(db, payeeCode);
    const wallet = buildWalletSummary(payeeData, payeeCode, collection);
    const payeeName = payeeData.name || payeeData.fullName || payeeCode;

    const recentSnap = await db.collection('payment_inquiries')
      .where('payee_code', '==', payeeCode)
      .where('status', '==', 'open')
      .limit(5)
      .get();
    if (recentSnap.size >= 3) {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'You already have open payment inquiries. Please wait for admin response before submitting more.'
      );
    }

    const inquiryRef = db.collection('payment_inquiries').doc();
    const inquiryDoc = {
      payee_code: payeeCode,
      payee_name: payeeName,
      payee_collection: collection,
      inquiry_type: inquiryType,
      inquiry_label: INQUIRY_LABELS[inquiryType] || inquiryType,
      related_ref: relatedRef,
      amount_expected_fcfa: amountExpected > 0 ? amountExpected : null,
      notes,
      status: 'open',
      admin_note: null,
      wallet_snapshot: {
        total_pending_fcfa: wallet.total_pending_fcfa,
        recruitment_pending_fcfa: wallet.recruitment.pending_fcfa,
        sbd_pending_fcfa: wallet.sbd.pending_fcfa,
        profile_complete: !!(wallet.payout_profile && wallet.payout_profile.profile_complete)
      },
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      resolved_at: null,
      resolved_by: null
    };

    await inquiryRef.set(inquiryDoc);

    await db.collection('admin_notifications').add({
      type: 'payment_inquiry',
      inquiry_id: inquiryRef.id,
      payee_code: payeeCode,
      payee_name: payeeName,
      inquiry_type: inquiryType,
      inquiry_label: inquiryDoc.inquiry_label,
      amount_expected_fcfa: inquiryDoc.amount_expected_fcfa,
      notes: notes.slice(0, 300),
      status: 'open',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });

    const tgMsg =
      `📩 PAYMENT INQUIRY\n\n` +
      `Payee: ${payeeCode} (${payeeName})\n` +
      `Type: ${inquiryDoc.inquiry_label}\n` +
      (amountExpected > 0 ? `Expected: ${amountExpected.toLocaleString()} FCFA\n` : '') +
      `Pending: ${wallet.total_pending_fcfa.toLocaleString()} FCFA\n` +
      `Notes: ${notes.slice(0, 400)}\n\n` +
      `👉 Admin: https://marriageducation.com/admin-dashboard.html#finance`;

    try {
      await sendTelegram(tgMsg, false);
    } catch (err) {
      console.warn('[PAYMENT_INQUIRY] Telegram failed:', err.message);
    }

    return { success: true, inquiry_id: inquiryRef.id };
  });

  exports.resolvePaymentInquiry = functions.https.onCall(async (data, context) => {
    const adminUser = await assertAdmin(db, context);
    const inquiryId = (data && data.inquiry_id || '').toString().trim();
    const status = (data && data.status || 'resolved').toString().trim();
    const adminNote = (data && data.admin_note || '').toString().trim();

    if (!inquiryId) {
      throw new functions.https.HttpsError('invalid-argument', 'inquiry_id is required');
    }
    if (!['resolved', 'closed'].includes(status)) {
      throw new functions.https.HttpsError('invalid-argument', 'status must be resolved or closed');
    }

    const inquiryRef = db.collection('payment_inquiries').doc(inquiryId);
    const snap = await inquiryRef.get();
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Inquiry not found');
    }

    await inquiryRef.update({
      status,
      admin_note: adminNote || null,
      resolved_at: admin.firestore.FieldValue.serverTimestamp(),
      resolved_by: adminUser.email || adminUser.uid,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    const notifSnap = await db.collection('admin_notifications')
      .where('type', '==', 'payment_inquiry')
      .where('inquiry_id', '==', inquiryId)
      .limit(5)
      .get();

    try {
      const batch = db.batch();
      notifSnap.forEach((doc) => {
        batch.update(doc.ref, {
          status,
          resolved_at: admin.firestore.FieldValue.serverTimestamp(),
          resolved_by: adminUser.email || adminUser.uid
        });
      });
      await batch.commit();
    } catch (err) {
      console.warn('[PAYMENT_INQUIRY] admin_notifications update skipped:', err.message);
    }

    return { success: true, inquiry_id: inquiryId, status };
  });
}

module.exports = { registerPaymentInquiries, INQUIRY_TYPES, INQUIRY_LABELS };
