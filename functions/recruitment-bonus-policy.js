/**
 * Recruitment bonus policy v2026-03-v3 — pure logic + Firestore upline resolution.
 * See docs/RECRUITMENT-BONUS-POLICY.md and docs/COMMISSION-MASTER-PRINCIPLES.md
 */

const POLICY_VERSION = '2026-03-v3';

const DIRECT_RECRUITMENT_BONUS_FCFA = 1500;
const UPLINE_POOL_FCFA = 1500;
const UPLINE_SINGLE_SHARE_FCFA = 750;

function normalizeReferralCode(raw) {
  let c = String(raw || '').trim().toUpperCase();
  if (!c) return '';
  if (/^(AMB|RD|SNR)([_-]|$)/.test(c)) {
    c = c.replace(/_/g, '-');
  }
  return c.replace(/-+/g, '-');
}

/**
 * @param {number} uplineCount
 * @returns {{ shares: number[], orgRetained: number, totalUpline: number }}
 */
function computeUplineShareAmounts(uplineCount) {
  const n = Math.max(0, Number(uplineCount) || 0);
  if (n === 0) {
    return { shares: [], orgRetained: UPLINE_POOL_FCFA, totalUpline: 0 };
  }
  if (n === 1) {
    return {
      shares: [UPLINE_SINGLE_SHARE_FCFA],
      orgRetained: UPLINE_POOL_FCFA - UPLINE_SINGLE_SHARE_FCFA,
      totalUpline: UPLINE_SINGLE_SHARE_FCFA
    };
  }
  if (n === 2) {
    return {
      shares: [UPLINE_SINGLE_SHARE_FCFA, UPLINE_SINGLE_SHARE_FCFA],
      orgRetained: 0,
      totalUpline: UPLINE_POOL_FCFA
    };
  }
  const base = Math.floor(UPLINE_POOL_FCFA / n);
  const remainder = UPLINE_POOL_FCFA - base * n;
  const shares = Array(n).fill(base);
  if (remainder > 0) shares[0] += remainder;
  return { shares, orgRetained: 0, totalUpline: UPLINE_POOL_FCFA };
}

function recruiterTypeForUpline(upline) {
  if (upline.role === 'regional_director') return 'regional_director';
  if (upline.role === 'senior') return 'senior';
  return 'upline_share';
}

function classifyAmbassadorRole(data) {
  const type = String(data?.ambassador_type || '').toLowerCase();
  if (type === 'executive' || Number(data?.role_level) === 4) return 'executive';
  if (type === 'senior' || Number(data?.role_level) === 2) return 'senior';
  if (type === 'regional_director' || Number(data?.role_level) === 3) return 'regional_director';
  return 'ambassador';
}

/**
 * Walk uplines above direct recruiter (closest first).
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} directRecruiterCode
 */
async function resolveRecruitmentUplines(db, directRecruiterCode) {
  const direct = normalizeReferralCode(directRecruiterCode);
  if (!direct || direct.startsWith('RD-')) {
    return [];
  }

  const uplines = [];
  const seen = new Set([direct]);
  let current = direct;

  const firstAmb = await db.collection('ambassadors').doc(current).get();
  if (!firstAmb.exists) return [];
  let nextCode = normalizeReferralCode(
    firstAmb.data().recruitedBy || firstAmb.data().recruited_by || ''
  );

  while (nextCode && !seen.has(nextCode)) {
    seen.add(nextCode);

    if (nextCode.startsWith('AMB-') || nextCode.startsWith('SNR-')) {
      const snap = await db.collection('ambassadors').doc(nextCode).get();
      if (!snap.exists) break;
      const data = snap.data();
      uplines.push({
        code: nextCode,
        name: data.fullName || data.name || nextCode,
        role: classifyAmbassadorRole(data),
        collection: 'ambassadors'
      });
      const following = normalizeReferralCode(data.recruitedBy || data.recruited_by || '');
      if (following.startsWith('RD-')) {
        await appendRdUpline(db, uplines, following, seen);
        break;
      }
      nextCode = following;
      continue;
    }

    if (nextCode.startsWith('RD-')) {
      await appendRdUpline(db, uplines, nextCode, seen);
      break;
    }

    break;
  }

  return uplines;
}

/** Append RD to upline list; stop — Executive is not a recruitment payee (v2026-03-v3). */
async function appendRdUpline(db, uplines, rdCode, seen) {
  const rd = normalizeReferralCode(rdCode);
  if (!rd || seen.has(rd)) return;
  seen.add(rd);

  const rdSnap = await db.collection('regional_directors').doc(rd).get();
  const rdData = rdSnap.exists ? rdSnap.data() : {};
  uplines.push({
    code: rd,
    name: rdData.name || rdData.fullName || rd,
    role: 'regional_director',
    collection: 'regional_directors'
  });
}

/**
 * Build full payout plan (amounts only; no Firestore writes).
 */
async function buildRecruitmentBonusPlan(db, directRecruiterCode) {
  const directCode = normalizeReferralCode(directRecruiterCode);
  const uplines = await resolveRecruitmentUplines(db, directCode);
  const { shares, orgRetained, totalUpline } = computeUplineShareAmounts(uplines.length);

  const payouts = [];
  if (directCode) {
    payouts.push({
      code: directCode,
      name: null,
      amount: DIRECT_RECRUITMENT_BONUS_FCFA,
      bonus_tier: 'direct',
      recruiter_type: directCode.startsWith('RD-') ? 'regional_director' : 'direct_recruiter',
      collection: directCode.startsWith('RD-') ? 'regional_directors' : 'ambassadors',
      upline_index: null,
      upline_count: uplines.length
    });
  }

  uplines.forEach((u, i) => {
    payouts.push({
      code: u.code,
      name: u.name,
      amount: shares[i] || 0,
      bonus_tier: 'upline',
      recruiter_type: recruiterTypeForUpline(u),
      collection: u.collection,
      role: u.role,
      upline_index: i,
      upline_count: uplines.length
    });
  });

  const totalPaid = payouts.reduce((s, p) => s + p.amount, 0);

  return {
    policy_version: POLICY_VERSION,
    direct_recruiter_code: directCode,
    uplines,
    payouts,
    org_retained_fcfa: orgRetained,
    total_paid_fcfa: totalPaid,
    direct_pool_fcfa: directCode ? DIRECT_RECRUITMENT_BONUS_FCFA : 0,
    upline_pool_fcfa: totalUpline
  };
}

module.exports = {
  POLICY_VERSION,
  DIRECT_RECRUITMENT_BONUS_FCFA,
  UPLINE_POOL_FCFA,
  UPLINE_SINGLE_SHARE_FCFA,
  normalizeReferralCode,
  computeUplineShareAmounts,
  resolveRecruitmentUplines,
  buildRecruitmentBonusPlan,
  classifyAmbassadorRole
};
