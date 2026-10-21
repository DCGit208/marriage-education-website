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
  YEARLY_COMMISSION_BASE_FCFA,
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

ok('policy version', POLICY_VERSION === '2026-10-v3');
ok('monthly direct 500', DIRECT_COMMISSION_FCFA === 500);
ok('monthly senior 250', SENIOR_OVERRIDE_FCFA === 250);
ok('monthly rd 250', RD_OVERRIDE_FCFA === 250);
ok('monthly base 5000', REVENUE_BASE_FCFA === 5000);
ok('monthly full stack 1000', DIRECT_COMMISSION_FCFA + SENIOR_OVERRIDE_FCFA + RD_OVERRIDE_FCFA === 1000);

ok('Foundation Access product $145', FOUNDATION_YEARLY_USD === 145);
ok('xaf rate 600', XAF_PER_USD === 600);
ok('yearly retail payment is 87000 XAF', YEARLY_REVENUE_BASE_FCFA === 87000);
ok('7000 XAF is reserved outside commission basis', YEARLY_REVENUE_BASE_FCFA - YEARLY_COMMISSION_BASE_FCFA === 7000);
ok('yearly retail payment matches $145 at policy rate', YEARLY_REVENUE_BASE_FCFA === Math.round(FOUNDATION_YEARLY_USD * XAF_PER_USD));
ok('yearly commission base 80000', YEARLY_COMMISSION_BASE_FCFA === 80000);
ok('yearly direct 8000', YEARLY_DIRECT_FCFA === 8000);
ok('yearly senior 4000', YEARLY_SENIOR_FCFA === 4000);
ok('yearly rd 4000', YEARLY_RD_FCFA === 4000);
ok('yearly full stack 16000', YEARLY_DIRECT_FCFA + YEARLY_SENIOR_FCFA + YEARLY_RD_FCFA === 16000);
ok('daily Ambassador target $133.33', Math.round(YEARLY_DIRECT_FCFA / XAF_PER_USD * 10 * 100) / 100 === 133.33);
ok('monthly Ambassador target $2666.67', Math.round(YEARLY_DIRECT_FCFA / XAF_PER_USD * 200 * 100) / 100 === 2666.67);
ok('monthly Senior team target $13333.33', Math.round(YEARLY_SENIOR_FCFA / XAF_PER_USD * 10 * 200 * 100) / 100 === 13333.33);
ok('monthly RD region target $666666.67', Math.round(YEARLY_RD_FCFA / XAF_PER_USD * 50 * 10 * 200 * 100) / 100 === 666666.67);

ok('isFoundationYearly true', isFoundationYearly('foundation-yearly') === true);
ok('isFoundationYearly false monthly', isFoundationYearly('foundation-monthly') === false);

const monthlyAmounts = commissionAmountsForProduct('foundation-monthly');
ok('monthly amounts program', monthlyAmounts.program === 'foundation_monthly');
ok('monthly amounts base remains 5000', monthlyAmounts.revenueBaseFCFA === 5000);
ok('monthly amounts direct', monthlyAmounts.direct === 500);
ok('monthly amounts senior remains 250', monthlyAmounts.senior === 250);
ok('monthly amounts rd remains 250', monthlyAmounts.rd === 250);

const yearlyAmounts = commissionAmountsForProduct('foundation-yearly');
ok('yearly amounts program', yearlyAmounts.program === 'foundation_yearly_deployment');
ok('yearly amounts base uses commission basis', yearlyAmounts.revenueBaseFCFA === 80000);
ok('yearly amounts direct', yearlyAmounts.direct === 8000);
ok('yearly amounts senior', yearlyAmounts.senior === 4000);
ok('yearly amounts rd', yearlyAmounts.rd === 4000);

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
