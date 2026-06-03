#!/usr/bin/env node
/**
 * Unit tests for SBD subscription commission policy 2026-04-v1.
 * Run: node scripts/test-sbd-subscription-commission.js
 */

const {
  POLICY_VERSION,
  DIRECT_COMMISSION_FCFA,
  SENIOR_OVERRIDE_FCFA,
  RD_OVERRIDE_FCFA,
  REVENUE_BASE_FCFA,
  resolveSeniorOverrideCode
} = require('../functions/sbd-subscription-commission');

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

ok('policy version', POLICY_VERSION === '2026-04-v1');
ok('direct 500', DIRECT_COMMISSION_FCFA === 500);
ok('senior 250', SENIOR_OVERRIDE_FCFA === 250);
ok('rd 250', RD_OVERRIDE_FCFA === 250);
ok('base 5000', REVENUE_BASE_FCFA === 5000);
ok('full stack 1000', DIRECT_COMMISSION_FCFA + SENIOR_OVERRIDE_FCFA + RD_OVERRIDE_FCFA === 1000);

const ambSeller = {
  type: 'ambassador',
  id: 'AMB-KONI-8321',
  data: { recruitedBy: 'AMB-GLOR-1135', ambassador_type: 'ambassador', role_level: 1 }
};
ok('senior from recruitedBy', resolveSeniorOverrideCode(ambSeller) === 'AMB-GLOR-1135');

const seniorSeller = {
  type: 'ambassador',
  id: 'AMB-GLOR-1135',
  data: { recruitedBy: 'AMB-EVEL-6730', ambassador_type: 'senior', role_level: 2 }
};
ok('senior seller no upline senior cut', resolveSeniorOverrideCode(seniorSeller) === null);

const rdSeller = { type: 'rd', id: 'RD-GUST-4230', data: {} };
ok('rd seller no senior override', resolveSeniorOverrideCode(rdSeller) === null);

console.log(`\n--- ${passed}/${passed + failed} passed ---`);
process.exit(failed ? 1 : 0);
