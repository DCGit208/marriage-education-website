/**
 * SBD subscription commission policy 2026-04-v1
 * Recurring 500 + 250 + 250 FCFA on 5,000 base per qualifying charge.
 * See docs/SBD-SUBSCRIPTION-COMMISSION-POLICY.md
 */

const POLICY_VERSION = '2026-04-v1';
const REVENUE_BASE_FCFA = 5000;
const DIRECT_COMMISSION_FCFA = 500;
const SENIOR_OVERRIDE_FCFA = 250;
const RD_OVERRIDE_FCFA = 250;

const RECURRING_TIER_PRODUCTS = ['foundation-monthly', 'premium-monthly', 'elite-monthly'];

function normalizeCode(raw) {
  let c = String(raw || '').trim().toUpperCase();
  if (!c) return '';
  if (/^(AMB|RD|SNR|SBD)([_-]|$)/.test(c)) c = c.replace(/_/g, '-');
  return c.replace(/-+/g, '-');
}

function pickRdCode(...candidates) {
  for (const code of candidates) {
    const n = normalizeCode(code);
    if (n.startsWith('RD-')) return n;
  }
  return null;
}

function isSeniorAmbassador(data) {
  const type = String(data?.ambassador_type || '').toLowerCase();
  return type === 'senior' || Number(data?.role_level) >= 2;
}

/**
 * Senior override only when a downline ambassador (not senior/RD) made the referral sale.
 */
function resolveSeniorOverrideCode(seller) {
  if (!seller || seller.type !== 'ambassador') return null;
  if (isSeniorAmbassador(seller.data)) return null;

  const recruitedBy = normalizeCode(seller.data.recruitedBy || seller.data.recruited_by || '');
  const seniorCode = normalizeCode(seller.data.senior_code || seller.data.recruited_by_senior || '');

  let candidate = '';
  if (recruitedBy.startsWith('AMB-') || recruitedBy.startsWith('SNR-')) {
    candidate = recruitedBy;
  } else if (seniorCode.startsWith('AMB-') || seniorCode.startsWith('SNR-')) {
    candidate = seniorCode;
  }

  if (!candidate || candidate === seller.id) return null;
  return candidate;
}

async function resolveRdOverrideCode(db, seller) {
  if (!seller) return null;
  if (seller.type === 'rd') return null;

  const d = seller.data || {};
  const direct = pickRdCode(d.rdCode, d.regional_director_code, d.recruited_by_rd);
  if (direct) return direct;

  if (seller.type !== 'ambassador') return null;

  const seniorCode = normalizeCode(d.senior_code || d.recruited_by_senior || '');
  if (seniorCode.startsWith('AMB-')) {
    const seniorSnap = await db.collection('ambassadors').doc(seniorCode).get();
    if (seniorSnap.exists) {
      const sd = seniorSnap.data();
      return pickRdCode(sd.rdCode, sd.regional_director_code, sd.recruited_by_rd, sd.recruitedBy);
    }
  }

  let current = normalizeCode(d.recruitedBy || d.recruited_by || '');
  const seen = new Set([seller.id]);
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current.startsWith('RD-')) return current;
    if (!current.startsWith('AMB-') && !current.startsWith('SNR-')) break;
    const snap = await db.collection('ambassadors').doc(current).get();
    if (!snap.exists) break;
    const ad = snap.data();
    const rd = pickRdCode(ad.rdCode, ad.regional_director_code, ad.recruited_by_rd);
    if (rd) return rd;
    current = normalizeCode(ad.recruitedBy || ad.recruited_by || '');
  }

  return null;
}

/**
 * @returns {Promise<{ direct: object, senior: object|null, rd: object|null }>}
 */
async function buildSubscriptionCommissionPlan(db, seller) {
  const directCollection = seller.type === 'rd' ? 'regional_directors' : 'ambassadors';
  const plan = {
    direct: {
      code: seller.id,
      amount: DIRECT_COMMISSION_FCFA,
      collection: directCollection,
      role: seller.type === 'rd' ? 'regional_director' : 'direct_referrer'
    },
    senior: null,
    rd: null
  };

  const seniorCode = resolveSeniorOverrideCode(seller);
  if (seniorCode) {
    plan.senior = {
      code: seniorCode,
      amount: SENIOR_OVERRIDE_FCFA,
      collection: 'ambassadors',
      role: 'senior_override'
    };
  }

  const rdCode = await resolveRdOverrideCode(db, seller);
  if (rdCode && rdCode !== seller.id) {
    plan.rd = {
      code: rdCode,
      amount: RD_OVERRIDE_FCFA,
      collection: 'regional_directors',
      role: 'rd_override'
    };
  }

  return plan;
}

async function applySellerCommissionUpdates(ref, amount, tierKey, isInitial, role) {
  const admin = require('firebase-admin');
  let updates = {};

  if (role === 'direct_referrer' || role === 'regional_director') {
    updates = {
      'sbdReferrals.commissionPending': admin.firestore.FieldValue.increment(amount),
      'sbdReferrals.commissionEarned': admin.firestore.FieldValue.increment(amount)
    };
    if (isInitial) {
      updates['sbdReferrals.subscribers'] = admin.firestore.FieldValue.increment(1);
      updates[`sbdReferrals.${tierKey}`] = admin.firestore.FieldValue.increment(1);
    }
  } else if (role === 'senior_override') {
    updates = {
      'sbdReferrals.overrideCommissionPending': admin.firestore.FieldValue.increment(amount),
      'sbdReferrals.overrideCommissionEarned': admin.firestore.FieldValue.increment(amount)
    };
    if (isInitial) {
      updates['sbdReferrals.overrideSubscribers'] = admin.firestore.FieldValue.increment(1);
    }
  } else if (role === 'rd_override') {
    updates = {
      'sbdReferrals.rdOverrideCommissionPending': admin.firestore.FieldValue.increment(amount),
      'sbdReferrals.rdOverrideCommissionEarned': admin.firestore.FieldValue.increment(amount)
    };
    if (isInitial) {
      updates['sbdReferrals.rdOverrideSubscribers'] = admin.firestore.FieldValue.increment(1);
    }
  }

  if (Object.keys(updates).length) {
    await ref.update(updates);
  }
}

/**
 * @param {object} opts
 * @param {FirebaseFirestore.Firestore} opts.db
 * @param {Function} opts.findSellerByReferralCode
 * @param {string} opts.uid
 * @param {string} opts.referralCode
 * @param {string} opts.productId
 * @param {string} opts.tierKey
 * @param {string} opts.idempotencyKey
 * @param {'initial'|'renewal'} opts.chargeKind
 */
async function creditSbdSubscriptionCommissions(opts) {
  const db = opts.db;
  const findSeller = opts.findSellerByReferralCode;
  const uid = opts.uid;
  const referralCode = normalizeCode(opts.referralCode);
  const productId = opts.productId;
  const tierKey = opts.tierKey;
  const idempotencyKey = String(opts.idempotencyKey || '').trim();
  const chargeKind = opts.chargeKind === 'renewal' ? 'renewal' : 'initial';
  const isInitial = chargeKind === 'initial';

  const emptyMeta = {
    credited: false,
    referralSkipReason: null,
    ambassadorCommissionFCFA: null,
    seniorCommissionFCFA: null,
    rdCommissionFCFA: null,
    referrerAmbassadorCode: null,
    seniorAmbassadorCode: null,
    rdCode: null
  };

  if (!idempotencyKey) {
    return Object.assign({}, emptyMeta, { referralSkipReason: 'missing_idempotency_key' });
  }

  const dupSnap = await db.collection('sbd_sales')
    .where('idempotencyKey', '==', idempotencyKey)
    .limit(1)
    .get();
  if (!dupSnap.empty) {
    return Object.assign({}, emptyMeta, { referralSkipReason: 'duplicate_charge', idempotencyKey });
  }

  if (!referralCode) {
    return Object.assign({}, emptyMeta, { referralSkipReason: 'no_referral_code' });
  }

  const seller = await findSeller(referralCode);
  if (!seller) {
    return Object.assign({}, emptyMeta, { referralSkipReason: 'no_matching_seller' });
  }

  const plan = await buildSubscriptionCommissionPlan(db, seller);
  const ambData = seller.data || {};
  const sellerDisplayName = ambData.fullName || ambData.name || seller.id;

  await applySellerCommissionUpdates(
    seller.ref,
    plan.direct.amount,
    tierKey,
    isInitial,
    plan.direct.role
  );
  console.log(`[SBD] ${seller.type} ${seller.id} +${plan.direct.amount} FCFA direct (${chargeKind}, tier=${tierKey})`);

  let seniorCode = null;
  if (plan.senior) {
    seniorCode = plan.senior.code;
    const seniorRef = db.collection('ambassadors').doc(seniorCode);
    const seniorSnap = await seniorRef.get();
    if (seniorSnap.exists) {
      await applySellerCommissionUpdates(seniorRef, plan.senior.amount, tierKey, isInitial, 'senior_override');
      console.log(`[SBD] Senior ${seniorCode} +${plan.senior.amount} FCFA override (${chargeKind})`);
    }
  }

  let rdCode = null;
  if (plan.rd) {
    rdCode = plan.rd.code;
    const rdRef = db.collection('regional_directors').doc(rdCode);
    const rdSnap = await rdRef.get();
    if (rdSnap.exists) {
      await applySellerCommissionUpdates(rdRef, plan.rd.amount, tierKey, isInitial, 'rd_override');
      console.log(`[SBD] RD ${rdCode} +${plan.rd.amount} FCFA override (${chargeKind})`);
    }
  }

  await db.collection('sbd_sales').add({
    policy_version: POLICY_VERSION,
    idempotencyKey,
    chargeKind,
    ambassadorCode: seller.type === 'ambassador'
      ? (ambData.ambassadorCode || ambData.code || seller.id)
      : (ambData.ambassador_code || null),
    rdCode: seller.type === 'rd' ? seller.id : rdCode,
    ambassadorName: sellerDisplayName,
    sbdReferralCode: referralCode,
    subscriberUid: uid,
    productId,
    tier: tierKey,
    revenueBaseFCFA: REVENUE_BASE_FCFA,
    ambassadorCommission: plan.direct.amount,
    seniorAmbassadorCode: seniorCode,
    seniorAmbassadorCommission: plan.senior ? plan.senior.amount : 0,
    rdOverrideCode: rdCode,
    rdCommission: plan.rd ? plan.rd.amount : 0,
    status: 'pending',
    createdAt: require('firebase-admin').firestore.FieldValue.serverTimestamp()
  });

  return {
    credited: true,
    referralSkipReason: null,
    referralCredited: true,
    referrerAmbassadorCode: seller.type === 'ambassador' ? (ambData.code || seller.id) : seller.id,
    referrerFullName: sellerDisplayName,
    seniorAmbassadorCode: seniorCode,
    ambassadorCommissionFCFA: plan.direct.amount,
    seniorCommissionFCFA: plan.senior ? plan.senior.amount : null,
    rdCode,
    rdCommissionFCFA: plan.rd ? plan.rd.amount : null,
    tierKeyed: tierKey,
    chargeKind,
    policyVersion: POLICY_VERSION
  };
}

module.exports = {
  POLICY_VERSION,
  REVENUE_BASE_FCFA,
  DIRECT_COMMISSION_FCFA,
  SENIOR_OVERRIDE_FCFA,
  RD_OVERRIDE_FCFA,
  RECURRING_TIER_PRODUCTS,
  normalizeCode,
  resolveSeniorOverrideCode,
  buildSubscriptionCommissionPlan,
  creditSbdSubscriptionCommissions
};
