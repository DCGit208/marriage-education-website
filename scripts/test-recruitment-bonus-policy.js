#!/usr/bin/env node
/**
 * Unit tests for recruitment bonus policy v2026-03-v3.
 * Run: node scripts/test-recruitment-bonus-policy.js
 * See: docs/RECRUITMENT-BONUS-POLICY.md
 */

const {
  computeUplineShareAmounts,
  normalizeReferralCode,
  resolveRecruitmentUplines,
  buildRecruitmentBonusPlan,
  POLICY_VERSION
} = require('../functions/recruitment-bonus-policy');
const { isExcludedUplineCode } = require('../functions/upline-exclusions');

let passed = 0;
let failed = 0;

function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`✅ ${name}`);
  } else {
    failed++;
    console.error(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

ok('policy version set', POLICY_VERSION === '2026-03-v3');
ok('normalize underscores', normalizeReferralCode('AMB_KONI_8321') === 'AMB-KONI-8321');
ok('normalize lowercase', normalizeReferralCode('rd-gust-4230') === 'RD-GUST-4230');
ok('RD-GUST excluded from uplines', isExcludedUplineCode('RD-GUST-4230'));

const n0 = computeUplineShareAmounts(0);
ok('N=0 org retains 1500', n0.orgRetained === 1500 && n0.totalUpline === 0);

const n1 = computeUplineShareAmounts(1);
ok('N=1 upline 750', n1.shares[0] === 750 && n1.orgRetained === 750);

const n2 = computeUplineShareAmounts(2);
ok('N=2 two 750s', n2.shares.join('+') === '750+750' && n2.totalUpline === 1500);

const n3 = computeUplineShareAmounts(3);
ok('N=3 three 500s', n3.shares.every((s) => s === 500) && n3.totalUpline === 1500);

const n4 = computeUplineShareAmounts(4);
ok('N=4 four 375s', n4.shares.every((s) => s === 375) && n4.totalUpline === 1500);

const n5 = computeUplineShareAmounts(5);
ok('N=5 sums to 1500', n5.shares.reduce((a, b) => a + b, 0) === 1500);

// Nyuyshu scenario totals
const direct = 1500;
const nyuy = direct + n3.totalUpline;
ok('Nyuyshu example total 3000', nyuy === 3000);

function mockDb(docs) {
  return {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              const key = `${name}/${id}`;
              const data = docs[key];
              return data ? { exists: true, data: () => data } : { exists: false };
            }
          };
        }
      };
    }
  };
}

(async () => {
  const db = mockDb({
    'ambassadors/AMB-VENE-5251': { recruitedBy: 'RD-AYIN-5087', fullName: 'Venessa Epie' },
    'regional_directors/RD-AYIN-5087': { name: 'Ayinwi Promise Imbih' }
  });
  const uplines = await resolveRecruitmentUplines(db, 'AMB-VENE-5251');
  ok('AMB direct → RD upline resolves', uplines.length === 1 && uplines[0].code === 'RD-AYIN-5087');
  const plan = await buildRecruitmentBonusPlan(db, 'AMB-VENE-5251');
  const uplinePayout = plan.payouts.find((p) => p.bonus_tier === 'upline');
  ok('AMB direct → RD gets 750', uplinePayout && uplinePayout.amount === 750);
  ok('AMB direct → org retains 750', plan.org_retained_fcfa === 750);

  console.log(`\n--- ${passed}/${passed + failed} passed ---`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
