/**
 * Commerce OS Tier 1 — wallet aggregation, payout profiles, payout_events audit.
 * @see docs/WALLET-DATA-MODEL.md, docs/PAYOUT-OPERATIONS.md
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const DEFAULT_MIN_PAYOUT_FCFA = 25000;
const TIER1_POLICY_VERSION = '2026-05-tier1-v1';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sbdPendingBreakdown(sbdReferrals) {
  const sr = sbdReferrals || {};
  return {
    direct: num(sr.commissionPending),
    seniorOverride: num(sr.overrideCommissionPending),
    rdOverride: num(sr.rdOverrideCommissionPending)
  };
}

function sbdPendingTotal(sbdReferrals) {
  const b = sbdPendingBreakdown(sbdReferrals);
  return b.direct + b.seniorOverride + b.rdOverride;
}

/**
 * @param {object} data - ambassador or RD document fields
 * @param {string} payeeCode
 * @param {'ambassadors'|'regional_directors'} collection
 */
function buildWalletSummary(data, payeeCode, collection) {
  const sr = data.sbdReferrals || {};
  const sbdBreakdown = sbdPendingBreakdown(sr);
  const recruitmentPending = num(data.recruitment_bonus_pending);
  const sbdPending = sbdBreakdown.direct + sbdBreakdown.seniorOverride + sbdBreakdown.rdOverride;

  return {
    payee_code: payeeCode,
    payee_collection: collection,
    name: data.name || data.fullName || payeeCode,
    recruitment: {
      pending_fcfa: recruitmentPending,
      paid_fcfa: num(data.recruitment_bonus_paid),
      earned_fcfa: num(data.recruitment_bonus_earned)
    },
    sbd: {
      pending_fcfa: sbdPending,
      pending_breakdown: sbdBreakdown,
      earned_fcfa: num(sr.commissionEarned) + num(sr.overrideCommissionEarned) + num(sr.rdOverrideCommissionEarned)
    },
    product: {
      commission_earned_fcfa: num(data.commission_earned) || num(data.commissionEarned) || 0,
      team_override_fcfa: num(data.team_override_earned) || 0,
      network_override_fcfa: num(data.network_override_earned) || 0
    },
    total_pending_fcfa: recruitmentPending + sbdPending,
    payout_profile: data.payout_profile || null,
    policy_version: TIER1_POLICY_VERSION
  };
}

function validatePayoutProfileInput(profile) {
  if (!profile || typeof profile !== 'object') {
    throw new functions.https.HttpsError('invalid-argument', 'payout_profile is required');
  }
  const country = (profile.country || '').toString().trim().toUpperCase();
  const method = (profile.method || '').toString().trim();
  const allowedMethods = ['momo_cm', 'wise_bank', 'paypal', 'manual'];
  if (!country) {
    throw new functions.https.HttpsError('invalid-argument', 'country is required');
  }
  if (!allowedMethods.includes(method)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid payout method');
  }

  let complete = !!(profile.account_holder_name || '').toString().trim();
  if (method === 'momo_cm') {
    complete = complete && !!(profile.momo_number || '').toString().trim();
  } else if (method === 'wise_bank') {
    complete = complete && !!(profile.wise_email || profile.iban || '').toString().trim();
  } else if (method === 'paypal') {
    complete = complete && !!(profile.wise_email || profile.paypal_email || '').toString().trim();
  }

  return {
    country,
    method,
    currency_preference: (profile.currency_preference || 'XAF').toString().trim().toUpperCase(),
    momo_number: (profile.momo_number || '').toString().trim(),
    account_holder_name: (profile.account_holder_name || '').toString().trim(),
    wise_email: (profile.wise_email || '').toString().trim(),
    iban: (profile.iban || '').toString().trim(),
    sort_code: (profile.sort_code || '').toString().trim(),
    routing_number: (profile.routing_number || '').toString().trim(),
    paypal_email: (profile.paypal_email || '').toString().trim(),
    profile_complete: complete,
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  };
}

async function resolvePayeeRef(db, payeeCode) {
  const code = (payeeCode || '').toString().trim();
  if (!code) {
    throw new functions.https.HttpsError('invalid-argument', 'payee_code is required');
  }
  if (code.startsWith('RD-')) {
    const ref = db.collection('regional_directors').doc(code);
    const doc = await ref.get();
    if (!doc.exists) {
      throw new functions.https.HttpsError('not-found', 'Payee not found');
    }
    return { ref, data: doc.data(), collection: 'regional_directors' };
  }
  const ref = db.collection('ambassadors').doc(code);
  const doc = await ref.get();
  if (!doc.exists) {
    throw new functions.https.HttpsError('not-found', 'Payee not found');
  }
  return { ref, data: doc.data(), collection: 'ambassadors' };
}

function adminEmailAllowlist() {
  const fromConfig = (functions.config().admin && functions.config().admin.emails) || '';
  const parsed = fromConfig.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (parsed.length) return parsed;
  return ['admin@marriageducation.com'];
}

/**
 * Match admin-dashboard-test hasAdminAccess + production admin inboxes.
 * Checks: custom claim admin, users/{uid}.role|isAdmin, config/default email allowlist.
 */
async function assertAdmin(db, context) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const tokenEmail = (context.auth.token.email || '').toLowerCase();

  if (context.auth.token.admin === true) {
    return { uid: context.auth.uid, email: tokenEmail };
  }

  const callerSnap = await db.collection('users').doc(context.auth.uid).get();
  const callerData = callerSnap.exists ? callerSnap.data() : {};
  const role = String(callerData.role || '').toLowerCase();
  if (role === 'admin' || callerData.isAdmin === true) {
    return {
      uid: context.auth.uid,
      email: tokenEmail || (callerData.email || '')
    };
  }

  if (tokenEmail && adminEmailAllowlist().includes(tokenEmail)) {
    return { uid: context.auth.uid, email: tokenEmail };
  }

  throw new functions.https.HttpsError(
    'permission-denied',
    'Admin access required. Use an admin account (custom claim admin:true, users/{uid}.role=admin, or configured admin email).'
  );
}

async function scanPayoutQueue(db, minPendingFcfa) {
  const threshold = num(minPendingFcfa) > 0 ? num(minPendingFcfa) : DEFAULT_MIN_PAYOUT_FCFA;
  const rows = [];

  async function scanCollection(collectionName) {
    const snap = await db.collection(collectionName).get();
    snap.forEach((doc) => {
      const data = doc.data();
      const summary = buildWalletSummary(data, doc.id, collectionName);
      if (summary.total_pending_fcfa < threshold) return;
      rows.push({
        ...summary,
        profile_complete: !!(summary.payout_profile && summary.payout_profile.profile_complete)
      });
    });
  }

  await scanCollection('ambassadors');
  await scanCollection('regional_directors');
  rows.sort((a, b) => b.total_pending_fcfa - a.total_pending_fcfa);
  return { threshold_fcfa: threshold, payees: rows, count: rows.length };
}

function registerWalletPayoutTier1(db, exports) {
  exports.getWalletSummary = functions.https.onCall(async (data, context) => {
    const payeeCode = (data && data.payee_code) || (data && data.code) || '';
    const { data: payeeData, collection } = await resolvePayeeRef(db, payeeCode);

    if (context.auth) {
      try {
        await assertAdmin(db, context);
      } catch (adminErr) {
        if (adminErr.code !== 'permission-denied' && adminErr.code !== 'unauthenticated') {
          throw adminErr;
        }
      }
    }

    return { success: true, wallet: buildWalletSummary(payeeData, payeeCode, collection) };
  });

  exports.updatePayoutProfile = functions.https.onCall(async (data) => {
    const payeeCode = (data && data.payee_code) || '';
    const profile = validatePayoutProfileInput(data && data.payout_profile);
    const { ref } = await resolvePayeeRef(db, payeeCode);
    await ref.update({ payout_profile: profile });
    return { success: true, payout_profile: profile };
  });

  exports.listPayoutQueue = functions.https.onCall(async (data, context) => {
    await assertAdmin(db, context);
    const minPending = (data && data.min_pending_fcfa) || DEFAULT_MIN_PAYOUT_FCFA;
    return { success: true, ...(await scanPayoutQueue(db, minPending)) };
  });

  exports.markPayoutBatchPaid = functions.https.onCall(async (data, context) => {
    const adminUser = await assertAdmin(db, context);
    const payeeCode = (data && data.payee_code) || '';
    const idempotencyKey = (data && data.idempotency_key) || '';
    const externalRef = (data && data.external_reference) || '';
    const method = (data && data.method) || 'manual';
    const amountFcfa = num(data && data.amount_fcfa);

    if (!idempotencyKey) {
      throw new functions.https.HttpsError('invalid-argument', 'idempotency_key is required');
    }
    if (!payeeCode || amountFcfa <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'payee_code and amount_fcfa are required');
    }
    if (!externalRef) {
      throw new functions.https.HttpsError('invalid-argument', 'external_reference is required');
    }

    const eventRef = db.collection('payout_events').doc(idempotencyKey);
    const existing = await eventRef.get();
    if (existing.exists) {
      return { success: true, duplicate: true, event_id: eventRef.id };
    }

    const breakdown = {
      recruitment: num(data && data.breakdown && data.breakdown.recruitment),
      sbd_direct: num(data && data.breakdown && data.breakdown.sbd_direct),
      sbd_senior_override: num(data && data.breakdown && data.breakdown.sbd_senior_override),
      sbd_rd_override: num(data && data.breakdown && data.breakdown.sbd_rd_override)
    };
    const breakdownSum = breakdown.recruitment + breakdown.sbd_direct +
      breakdown.sbd_senior_override + breakdown.sbd_rd_override;
    if (breakdownSum !== amountFcfa) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'breakdown must sum to amount_fcfa'
      );
    }

    const { ref, data: payeeData, collection } = await resolvePayeeRef(db, payeeCode);
    const walletBefore = buildWalletSummary(payeeData, payeeCode, collection);
    if (amountFcfa > walletBefore.total_pending_fcfa) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'amount exceeds total pending balance'
      );
    }

    const profile = payeeData.payout_profile || {};
    if (profile.profile_complete !== true && method !== 'manual') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Payout profile must be complete before batch mark paid'
      );
    }

    const updates = { updated_at: admin.firestore.FieldValue.serverTimestamp() };
    if (breakdown.recruitment > 0) {
      updates.recruitment_bonus_pending = admin.firestore.FieldValue.increment(-breakdown.recruitment);
      updates.recruitment_bonus_paid = admin.firestore.FieldValue.increment(breakdown.recruitment);
      if (collection === 'ambassadors') {
        updates.commission_earned = admin.firestore.FieldValue.increment(breakdown.recruitment);
      }
    }
    const sr = payeeData.sbdReferrals || {};
    const sbdFieldUpdates = {};
    if (breakdown.sbd_direct > 0) {
      sbdFieldUpdates.commissionPending = num(sr.commissionPending) - breakdown.sbd_direct;
    }
    if (breakdown.sbd_senior_override > 0) {
      sbdFieldUpdates.overrideCommissionPending = num(sr.overrideCommissionPending) - breakdown.sbd_senior_override;
    }
    if (breakdown.sbd_rd_override > 0) {
      sbdFieldUpdates.rdOverrideCommissionPending = num(sr.rdOverrideCommissionPending) - breakdown.sbd_rd_override;
    }
    if (Object.keys(sbdFieldUpdates).length) {
      updates.sbdReferrals = { ...sr, ...sbdFieldUpdates };
    }

    await ref.update(updates);
    await eventRef.set({
      payee_code: payeeCode,
      payee_collection: collection,
      amount_fcfa: amountFcfa,
      currency_paid: (data && data.currency_paid) || profile.currency_preference || 'XAF',
      method,
      external_reference: externalRef,
      status: 'completed',
      breakdown,
      policy_version: TIER1_POLICY_VERSION,
      wallet_before: {
        total_pending_fcfa: walletBefore.total_pending_fcfa,
        recruitment_pending_fcfa: walletBefore.recruitment.pending_fcfa,
        sbd_pending_fcfa: walletBefore.sbd.pending_fcfa
      },
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      created_by_admin: adminUser.email || adminUser.uid
    });

    const afterDoc = await ref.get();
    const walletAfter = buildWalletSummary(afterDoc.data(), payeeCode, collection);

    return {
      success: true,
      event_id: eventRef.id,
      wallet_after: walletAfter
    };
  });
}

module.exports = {
  DEFAULT_MIN_PAYOUT_FCFA,
  TIER1_POLICY_VERSION,
  buildWalletSummary,
  sbdPendingTotal,
  registerWalletPayoutTier1
};
