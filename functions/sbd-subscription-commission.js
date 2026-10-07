/**
 * SBD subscription commission policy
 * - Monthly tiers: 500 + 250 + 250 FCFA on 5,000 base (2026-04-v1)
 * - Foundation Access ($144.17 one-time / 12 months): 10% / 5% / 5% of $144.17 @ 600 XAF/USD (2026-07-v2)
 * See docs/SBD-SUBSCRIPTION-COMMISSION-POLICY.md
 */

const { isExcludedUplineCode } = require('./upline-exclusions');

const POLICY_VERSION = '2026-07-v2';
const REVENUE_BASE_FCFA = 5000;
const DIRECT_COMMISSION_FCFA = 500;
const SENIOR_OVERRIDE_FCFA = 250;
const RD_OVERRIDE_FCFA = 250;

const XAF_PER_USD = 600;
const FOUNDATION_YEARLY_PRODUCT = 'foundation-yearly';
const FOUNDATION_YEARLY_USD = 144.17;
const YEARLY_REVENUE_BASE_FCFA = FOUNDATION_YEARLY_USD * XAF_PER_USD; // 86,502
const YEARLY_DIRECT_FCFA = Math.round(FOUNDATION_YEARLY_USD * 0.1 * XAF_PER_USD); // 8,650
const YEARLY_SENIOR_FCFA = Math.round(FOUNDATION_YEARLY_USD * 0.05 * XAF_PER_USD); // 4,325
const YEARLY_RD_FCFA = Math.round(FOUNDATION_YEARLY_USD * 0.05 * XAF_PER_USD); // 4,325

const RECURRING_TIER_PRODUCTS = [
  'foundation-monthly',
  'foundation-1year',
  'foundation-2year',
  'premium-monthly',
  'elite-monthly'
];

const MONTHLY_TIER_PRODUCTS = ['foundation-monthly', 'premium-monthly', 'elite-monthly'];

function isFoundationYearly(productId) {
  return String(productId || '').trim() === FOUNDATION_YEARLY_PRODUCT;
}

/** Africa/Douala is UTC+1 year-round (no DST). */
function challengeDayKey(date) {
  const d = date instanceof Date ? date : new Date();
  const shifted = new Date(d.getTime() + 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function commissionAmountsForProduct(productId) {
  if (isFoundationYearly(productId)) {
    return {
      revenueBaseFCFA: YEARLY_REVENUE_BASE_FCFA,
      direct: YEARLY_DIRECT_FCFA,
      senior: YEARLY_SENIOR_FCFA,
      rd: YEARLY_RD_FCFA,
      program: 'foundation_yearly_deployment'
    };
  }
  return {
    revenueBaseFCFA: REVENUE_BASE_FCFA,
    direct: DIRECT_COMMISSION_FCFA,
    senior: SENIOR_OVERRIDE_FCFA,
    rd: RD_OVERRIDE_FCFA,
    program: 'foundation_monthly'
  };
}

function normalizeCode(raw) {
  let c = String(raw || '').trim().toUpperCase();
  if (!c) return '';
  if (/^(AMB|RD|SNR|SBD)([_-]|$)/.test(c)) c = c.replace(/_/g, '-');
  return c.replace(/-+/g, '-');
}

function pickRdCode(...candidates) {
  for (const code of candidates) {
    const n = normalizeCode(code);
    if (n.startsWith('RD-') && !isExcludedUplineCode(n)) return n;
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
    if (current.startsWith('RD-') && !isExcludedUplineCode(current)) return current;
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
 * @param {object} db
 * @param {object} seller
 * @param {string} [productId]
 * @returns {Promise<{ direct: object, senior: object|null, rd: object|null, amounts: object }>}
 */
async function buildSubscriptionCommissionPlan(db, seller, productId) {
  const amounts = commissionAmountsForProduct(productId);
  const directCollection = seller.type === 'rd' ? 'regional_directors' : 'ambassadors';
  const plan = {
    amounts,
    direct: {
      code: seller.id,
      amount: amounts.direct,
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
      amount: amounts.senior,
      collection: 'ambassadors',
      role: 'senior_override'
    };
  }

  const rdCode = await resolveRdOverrideCode(db, seller);
  if (rdCode && rdCode !== seller.id) {
    plan.rd = {
      code: rdCode,
      amount: amounts.rd,
      collection: 'regional_directors',
      role: 'rd_override'
    };
  }

  return plan;
}

async function applySellerCommissionUpdates(ref, amount, tierKey, isInitial, role, opts) {
  const admin = require('firebase-admin');
  opts = opts || {};
  let updates = {};

  if (role === 'direct_referrer' || role === 'regional_director') {
    updates = {
      'sbdReferrals.commissionPending': admin.firestore.FieldValue.increment(amount),
      'sbdReferrals.commissionEarned': admin.firestore.FieldValue.increment(amount)
    };
    if (isInitial) {
      updates['sbdReferrals.subscribers'] = admin.firestore.FieldValue.increment(1);
      updates[`sbdReferrals.${tierKey}`] = admin.firestore.FieldValue.increment(1);
      if (isFoundationYearly(opts.productId)) {
        const dayKey = opts.dayKey || challengeDayKey();
        const monthKey = dayKey.slice(0, 7);
        updates['sbdReferrals.foundationYearly'] = admin.firestore.FieldValue.increment(1);
        updates[`sbdReferrals.yearlyByDay.${dayKey}`] = admin.firestore.FieldValue.increment(1);
        updates[`sbdReferrals.yearlyByMonth.${monthKey}`] = admin.firestore.FieldValue.increment(1);
      }
    }
  } else if (role === 'senior_override') {
    updates = {
      'sbdReferrals.overrideCommissionPending': admin.firestore.FieldValue.increment(amount),
      'sbdReferrals.overrideCommissionEarned': admin.firestore.FieldValue.increment(amount)
    };
    if (isInitial) {
      updates['sbdReferrals.overrideSubscribers'] = admin.firestore.FieldValue.increment(1);
      if (isFoundationYearly(opts.productId)) {
        const dayKey = opts.dayKey || challengeDayKey();
        const monthKey = dayKey.slice(0, 7);
        updates['sbdReferrals.overrideFoundationYearly'] = admin.firestore.FieldValue.increment(1);
        updates[`sbdReferrals.overrideYearlyByDay.${dayKey}`] = admin.firestore.FieldValue.increment(1);
        updates[`sbdReferrals.overrideYearlyByMonth.${monthKey}`] = admin.firestore.FieldValue.increment(1);
      }
    }
  } else if (role === 'rd_override') {
    updates = {
      'sbdReferrals.rdOverrideCommissionPending': admin.firestore.FieldValue.increment(amount),
      'sbdReferrals.rdOverrideCommissionEarned': admin.firestore.FieldValue.increment(amount)
    };
    if (isInitial) {
      updates['sbdReferrals.rdOverrideSubscribers'] = admin.firestore.FieldValue.increment(1);
      if (isFoundationYearly(opts.productId)) {
        const dayKey = opts.dayKey || challengeDayKey();
        const monthKey = dayKey.slice(0, 7);
        updates['sbdReferrals.rdOverrideFoundationYearly'] = admin.firestore.FieldValue.increment(1);
        updates[`sbdReferrals.rdOverrideYearlyByDay.${dayKey}`] = admin.firestore.FieldValue.increment(1);
        updates[`sbdReferrals.rdOverrideYearlyByMonth.${monthKey}`] = admin.firestore.FieldValue.increment(1);
      }
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
  const dayKey = challengeDayKey();
  const amounts = commissionAmountsForProduct(productId);

  const emptyMeta = {
    credited: false,
    referralSkipReason: null,
    ambassadorCommissionFCFA: null,
    seniorCommissionFCFA: null,
    rdCommissionFCFA: null,
    referrerAmbassadorCode: null,
    seniorAmbassadorCode: null,
    rdCode: null,
    program: amounts.program,
    productId: productId || null
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

  const plan = await buildSubscriptionCommissionPlan(db, seller, productId);
  const ambData = seller.data || {};
  const sellerDisplayName = ambData.fullName || ambData.name || seller.id;
  const trackOpts = { productId, dayKey };

  await applySellerCommissionUpdates(
    seller.ref,
    plan.direct.amount,
    tierKey,
    isInitial,
    plan.direct.role,
    trackOpts
  );
  console.log(
    `[SBD] ${seller.type} ${seller.id} +${plan.direct.amount} FCFA direct ` +
    `(${chargeKind}, tier=${tierKey}, product=${productId}, program=${amounts.program})`
  );

  let seniorCode = null;
  if (plan.senior) {
    seniorCode = plan.senior.code;
    const seniorRef = db.collection('ambassadors').doc(seniorCode);
    const seniorSnap = await seniorRef.get();
    if (seniorSnap.exists) {
      await applySellerCommissionUpdates(seniorRef, plan.senior.amount, tierKey, isInitial, 'senior_override', trackOpts);
      console.log(`[SBD] Senior ${seniorCode} +${plan.senior.amount} FCFA override (${chargeKind})`);
    }
  }

  let rdCode = null;
  if (plan.rd) {
    rdCode = plan.rd.code;
    const rdRef = db.collection('regional_directors').doc(rdCode);
    const rdSnap = await rdRef.get();
    if (rdSnap.exists) {
      await applySellerCommissionUpdates(rdRef, plan.rd.amount, tierKey, isInitial, 'rd_override', trackOpts);
      console.log(`[SBD] RD ${rdCode} +${plan.rd.amount} FCFA override (${chargeKind})`);
    }
  }

  const directPayeeCode = seller.type === 'ambassador'
    ? (ambData.ambassadorCode || ambData.code || seller.id)
    : seller.id;
  const commissionShares = {
    direct: {
      payeeCode: String(directPayeeCode).toUpperCase(),
      amount: plan.direct.amount,
      status: 'pending',
      role: 'direct'
    }
  };
  if (plan.senior && seniorCode) {
    commissionShares.senior = {
      payeeCode: String(seniorCode).toUpperCase(),
      amount: plan.senior.amount,
      status: 'pending',
      role: 'senior'
    };
  }
  if (plan.rd && rdCode) {
    commissionShares.rd = {
      payeeCode: String(rdCode).toUpperCase(),
      amount: plan.rd.amount,
      status: 'pending',
      role: 'rd'
    };
  }

  await db.collection('sbd_sales').add({
    policy_version: POLICY_VERSION,
    idempotencyKey,
    chargeKind,
    program: amounts.program,
    ambassadorCode: seller.type === 'ambassador'
      ? (ambData.ambassadorCode || ambData.code || seller.id)
      : (ambData.ambassador_code || null),
    rdCode: seller.type === 'rd' ? seller.id : rdCode,
    ambassadorName: sellerDisplayName,
    sbdReferralCode: referralCode,
    subscriberUid: uid,
    productId,
    tier: tierKey,
    revenueBaseFCFA: amounts.revenueBaseFCFA,
    revenueUsd: isFoundationYearly(productId) ? FOUNDATION_YEARLY_USD : null,
    ambassadorCommission: plan.direct.amount,
    seniorAmbassadorCode: seniorCode,
    seniorAmbassadorCommission: plan.senior ? plan.senior.amount : 0,
    rdOverrideCode: rdCode,
    rdCommission: plan.rd ? plan.rd.amount : 0,
    commissionShares,
    challengeDayKey: isFoundationYearly(productId) ? dayKey : null,
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
    policyVersion: POLICY_VERSION,
    program: amounts.program,
    productId,
    revenueUsd: isFoundationYearly(productId) ? FOUNDATION_YEARLY_USD : null
  };
}

module.exports = {
  POLICY_VERSION,
  REVENUE_BASE_FCFA,
  DIRECT_COMMISSION_FCFA,
  SENIOR_OVERRIDE_FCFA,
  RD_OVERRIDE_FCFA,
  XAF_PER_USD,
  FOUNDATION_YEARLY_PRODUCT,
  FOUNDATION_YEARLY_USD,
  YEARLY_REVENUE_BASE_FCFA,
  YEARLY_DIRECT_FCFA,
  YEARLY_SENIOR_FCFA,
  YEARLY_RD_FCFA,
  RECURRING_TIER_PRODUCTS,
  MONTHLY_TIER_PRODUCTS,
  normalizeCode,
  resolveSeniorOverrideCode,
  buildSubscriptionCommissionPlan,
  creditSbdSubscriptionCommissions,
  commissionAmountsForProduct,
  isFoundationYearly,
  challengeDayKey
};
