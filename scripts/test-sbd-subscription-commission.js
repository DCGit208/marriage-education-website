#!/usr/bin/env node
/**
 * Unit tests for SBD subscription commission policy (monthly + Foundation Yearly).
 * Run: node scripts/test-sbd-subscription-commission.js
 */

const {
  POLICY_VERSION,
  DIRECT_COMMISSION_FCFA,
  SENIOR_OVERRIDE_FCFA,
  RD_OVERRIDE_FCFA,
  REVENUE_BASE_FCFA,
  YEARLY_DIRECT_FCFA,
  YEARLY_SENIOR_FCFA,
  YEARLY_RD_FCFA,
  YEARLY_REVENUE_BASE_FCFA,
  FOUNDATION_YEARLY_USD,
  XAF_PER_USD,
  resolveSeniorOverrideCode,
  commissionAmountsForProduct,
  isFoundationYearly
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

ok('policy version', POLICY_VERSION === '2026-07-v2');
ok('monthly direct 500', DIRECT_COMMISSION_FCFA === 500);
ok('monthly senior 250', SENIOR_OVERRIDE_FCFA === 250);
ok('monthly rd 250', RD_OVERRIDE_FCFA === 250);
ok('monthly base 5000', REVENUE_BASE_FCFA === 5000);
ok('monthly full stack 1000', DIRECT_COMMISSION_FCFA + SENIOR_OVERRIDE_FCFA + RD_OVERRIDE_FCFA === 1000);

ok('yearly product $144.17', FOUNDATION_YEARLY_USD === 144.17);
ok('xaf rate 600', XAF_PER_USD === 600);
ok('yearly direct 8650', YEARLY_DIRECT_FCFA === 8650);
ok('yearly senior 4325', YEARLY_SENIOR_FCFA === 4325);
ok('yearly rd 4325', YEARLY_RD_FCFA === 4325);
ok('yearly base 86502', YEARLY_REVENUE_BASE_FCFA === 86502);
ok('yearly full stack 17300', YEARLY_DIRECT_FCFA + YEARLY_SENIOR_FCFA + YEARLY_RD_FCFA === 17300);
ok('daily amb target $1441.7', YEARLY_DIRECT_FCFA / XAF_PER_USD * 10 === 144.17);
ok('monthly amb target $28834', YEARLY_DIRECT_FCFA / XAF_PER_USD * 200 === 28834);

ok('isFoundationYearly true', isFoundationYearly('foundation-yearly') === true);
ok('isFoundationYearly false monthly', isFoundationYearly('foundation-monthly') === false);

const monthlyAmounts = commissionAmountsForProduct('foundation-monthly');
ok('monthly amounts program', monthlyAmounts.program === 'foundation_monthly');
ok('monthly amounts direct', monthlyAmounts.direct === 500);

const yearlyAmounts = commissionAmountsForProduct('foundation-yearly');
ok('yearly amounts program', yearlyAmounts.program === 'foundation_yearly_deployment');
ok('yearly amounts direct', yearlyAmounts.direct === 8650);

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
