/**
 * Manual SBD subscription commission payouts (line-level, like recruitment bonuses).
 * Marks individual shares on sbd_sales as paid and decrements payee pending balances.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const SHARE_KEYS = ['direct', 'senior', 'rd'];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function deriveShares(sale) {
  const existing = sale.commissionShares || null;
  if (existing && typeof existing === 'object') {
    return existing;
  }

  const shares = {};
  const directPayee = sale.ambassadorCode || (sale.rdCode && !sale.ambassadorCode ? sale.rdCode : null);
  const directAmt = num(sale.ambassadorCommission);
  if (directPayee && directAmt > 0) {
    shares.direct = {
      payeeCode: String(directPayee).toUpperCase(),
      amount: directAmt,
      status: sale.status === 'paid' ? 'paid' : 'pending',
      role: 'direct'
    };
  }

  const seniorPayee = sale.seniorAmbassadorCode;
  const seniorAmt = num(sale.seniorAmbassadorCommission);
  if (seniorPayee && seniorAmt > 0) {
    shares.senior = {
      payeeCode: String(seniorPayee).toUpperCase(),
      amount: seniorAmt,
      status: sale.status === 'paid' ? 'paid' : 'pending',
      role: 'senior'
    };
  }

  const rdPayee = sale.rdOverrideCode;
  const rdAmt = num(sale.rdCommission);
  if (rdPayee && rdAmt > 0) {
    shares.rd = {
      payeeCode: String(rdPayee).toUpperCase(),
      amount: rdAmt,
      status: sale.status === 'paid' ? 'paid' : 'pending',
      role: 'rd'
    };
  }

  return shares;
}

function overallSaleStatus(shares) {
  const list = SHARE_KEYS.map((k) => shares[k]).filter(Boolean);
  if (!list.length) return 'paid';
  const paid = list.filter((s) => s.status === 'paid').length;
  if (paid === 0) return 'pending';
  if (paid === list.length) return 'paid';
  return 'partial';
}

async function resolvePayeeRef(db, payeeCode) {
  const code = String(payeeCode || '').trim().toUpperCase();
  if (!code) {
    throw new functions.https.HttpsError('invalid-argument', 'payeeCode is required');
  }

  if (code.startsWith('RD-')) {
    const ref = db.collection('regional_directors').doc(code);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', `Regional director ${code} not found`);
    }
    return { ref, data: snap.data(), collection: 'regional_directors', code };
  }

  let ambId = code.startsWith('SNR-') ? code.replace(/^SNR-/, 'AMB-') : code;
  let ref = db.collection('ambassadors').doc(ambId);
  let snap = await ref.get();
  if (!snap.exists && code.startsWith('SBD-')) {
    ambId = code.replace(/^SBD-/, 'AMB-');
    ref = db.collection('ambassadors').doc(ambId);
    snap = await ref.get();
  }
  if (!snap.exists) {
    const q = await db.collection('ambassadors').where('code', '==', code).limit(1).get();
    if (!q.empty) {
      return {
        ref: q.docs[0].ref,
        data: q.docs[0].data(),
        collection: 'ambassadors',
        code: q.docs[0].id
      };
    }
    throw new functions.https.HttpsError('not-found', `Ambassador ${code} not found`);
  }
  return { ref, data: snap.data(), collection: 'ambassadors', code: ambId };
}

function pendingFieldForShare(shareKey) {
  if (shareKey === 'direct') return 'commissionPending';
  if (shareKey === 'senior') return 'overrideCommissionPending';
  if (shareKey === 'rd') return 'rdOverrideCommissionPending';
  return null;
}

function paidFieldForShare(shareKey) {
  if (shareKey === 'direct') return 'commissionPaid';
  if (shareKey === 'senior') return 'overrideCommissionPaid';
  if (shareKey === 'rd') return 'rdOverrideCommissionPaid';
  return null;
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} exports
 * @param {{ assertAdmin: Function }} helpers
 */
function registerSbdCommissionPayout(db, exports, helpers) {
  const assertAdmin = helpers.assertAdmin;

  /**
   * Mark one commission share on an sbd_sales doc as manually paid.
   * data: { sale_id, share: 'direct'|'senior'|'rd', note?: string }
   */
  exports.markSbdCommissionSharePaid = functions.https.onCall(async (data, context) => {
    const adminUser = await assertAdmin(db, context);
    const saleId = String((data && data.sale_id) || '').trim();
    const shareKey = String((data && data.share) || '').trim().toLowerCase();
    const note = String((data && data.note) || '').trim();

    if (!saleId) {
      throw new functions.https.HttpsError('invalid-argument', 'sale_id is required');
    }
    if (!SHARE_KEYS.includes(shareKey)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'share must be direct, senior, or rd'
      );
    }

    const saleRef = db.collection('sbd_sales').doc(saleId);
    const saleSnap = await saleRef.get();
    if (!saleSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'SBD sale not found');
    }

    const sale = saleSnap.data() || {};
    const shares = deriveShares(sale);
    const share = shares[shareKey];
    if (!share || !(share.amount > 0)) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `No ${shareKey} commission on this sale`
      );
    }
    if (share.status === 'paid') {
      return { success: true, duplicate: true, sale_id: saleId, share: shareKey };
    }

    const amount = num(share.amount);
    const payeeCode = share.payeeCode;
    const { ref: payeeRef, data: payeeData, collection } = await resolvePayeeRef(db, payeeCode);

    const pendingField = pendingFieldForShare(shareKey);
    const paidField = paidFieldForShare(shareKey);
    const sr = Object.assign({}, payeeData.sbdReferrals || {});
    const currentPending = num(sr[pendingField]);
    sr[pendingField] = Math.max(0, currentPending - amount);
    sr[paidField] = num(sr[paidField]) + amount;

    const eventId = `sbd-share-${saleId}-${shareKey}`;
    const eventRef = db.collection('payout_events').doc(eventId);
    const existingEvent = await eventRef.get();
    if (existingEvent.exists) {
      // Event already written but sale share may still be pending — sync sale
      shares[shareKey] = Object.assign({}, share, {
        status: 'paid',
        paidAt: existingEvent.data().created_at || admin.firestore.FieldValue.serverTimestamp(),
        paidBy: existingEvent.data().created_by_admin || 'system'
      });
      await saleRef.update({
        commissionShares: shares,
        status: overallSaleStatus(shares),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return { success: true, duplicate: true, sale_id: saleId, share: shareKey, event_id: eventId };
    }

    const batch = db.batch();
    batch.update(payeeRef, {
      sbdReferrals: sr,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    const paidAt = admin.firestore.FieldValue.serverTimestamp();
    shares[shareKey] = Object.assign({}, share, {
      status: 'paid',
      paidAt,
      paidBy: adminUser.email || adminUser.uid,
      note: note || null
    });

    batch.update(saleRef, {
      commissionShares: shares,
      status: overallSaleStatus(shares),
      updatedAt: paidAt
    });

    batch.set(eventRef, {
      type: 'sbd_commission_share',
      sale_id: saleId,
      share: shareKey,
      payee_code: payeeCode,
      payee_collection: collection,
      amount_fcfa: amount,
      currency_paid: 'XAF',
      method: 'manual',
      external_reference: note || `SBD-${saleId}-${shareKey}`,
      status: 'completed',
      productId: sale.productId || null,
      program: sale.program || null,
      revenueUsd: sale.revenueUsd || null,
      subscriberUid: sale.subscriberUid || null,
      seller_code: sale.ambassadorCode || sale.sbdReferralCode || null,
      policy_version: sale.policy_version || null,
      created_at: paidAt,
      created_by_admin: adminUser.email || adminUser.uid
    });

    await batch.commit();

    return {
      success: true,
      sale_id: saleId,
      share: shareKey,
      amount_fcfa: amount,
      payee_code: payeeCode,
      event_id: eventId,
      sale_status: overallSaleStatus(shares)
    };
  });

  return { deriveShares, overallSaleStatus };
}

module.exports = {
  registerSbdCommissionPayout,
  deriveShares,
  overallSaleStatus,
  SHARE_KEYS
};
