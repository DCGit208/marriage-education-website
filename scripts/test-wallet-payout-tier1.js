#!/usr/bin/env node
/**
 * Unit tests for Tier 1 wallet aggregation (no Firestore).
 */
const assert = require('assert');
const {
  buildWalletSummary,
  sbdPendingTotal,
  DEFAULT_MIN_PAYOUT_FCFA
} = require('../functions/wallet-payout-tier1');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓', name);
  } catch (e) {
    failed++;
    console.error('  ✗', name, e.message);
  }
}

test('DEFAULT_MIN_PAYOUT_FCFA is 25000', () => {
  assert.strictEqual(DEFAULT_MIN_PAYOUT_FCFA, 25000);
});

test('sbdPendingTotal sums three pending fields', () => {
  assert.strictEqual(sbdPendingTotal({
    commissionPending: 500,
    overrideCommissionPending: 250,
    rdOverrideCommissionPending: 250
  }), 1000);
});

test('buildWalletSummary aggregates recruitment + SBD', () => {
  const w = buildWalletSummary({
    name: 'Test User',
    recruitment_bonus_pending: 5000,
    recruitment_bonus_paid: 10000,
    sbdReferrals: {
      commissionPending: 500,
      overrideCommissionPending: 250,
      rdOverrideCommissionPending: 250
    },
    commission_earned: 20000
  }, 'AMB-TEST', 'ambassadors');
  assert.strictEqual(w.recruitment.pending_fcfa, 5000);
  assert.strictEqual(w.sbd.pending_fcfa, 1000);
  assert.strictEqual(w.total_pending_fcfa, 6000);
  assert.strictEqual(w.payee_code, 'AMB-TEST');
});

test('buildWalletSummary handles missing fields as zero', () => {
  const w = buildWalletSummary({}, 'RD-TEST', 'regional_directors');
  assert.strictEqual(w.total_pending_fcfa, 0);
});

test('buildWalletSummary includes payout_profile when present', () => {
  const w = buildWalletSummary({
    payout_profile: { method: 'wise_bank', profile_complete: true }
  }, 'AMB-X', 'ambassadors');
  assert.strictEqual(w.payout_profile.method, 'wise_bank');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
