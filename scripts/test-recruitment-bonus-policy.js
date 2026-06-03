#!/usr/bin/env node
/**
 * Unit tests for recruitment bonus policy v2026-03-v3.
 * Run: node scripts/test-recruitment-bonus-policy.js
 * See: docs/RECRUITMENT-BONUS-POLICY.md
 */

const {
  computeUplineShareAmounts,
  normalizeReferralCode,
  POLICY_VERSION
} = require('../functions/recruitment-bonus-policy');

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

console.log(`\n--- ${passed}/${passed + failed} passed ---`);
process.exit(failed ? 1 : 0);
