/**
 * DOS economics doctrine — single source for UI + metrics (Phase 0).
 * Ledger remains XAF in Firestore; dashboards display USD via MEMoney.
 */
(function (global) {
  'use strict';

  var XAF_PER_USD = 600;

  var DOCTRINE = {
    subscriptionMonthlyUsd: 9,
    foundationYearlyUsd: 144.17,
    ambassadorRecurringPercent: 0.1,
    seniorOverridePercent: 0.05,
    rdOverridePercent: 0.05,
    ambassadorMonthlyTargetUsd: 28834,
    seniorMonthlyTargetUsd: 14417,
    rdMonthlyTargetUsd: 720850,
    dailyTargets: {
      newSubscribers: 10,
      foundationYearly: 10,
      conversations: 20,
      followUps: 10,
      recruitConversations: 1,
      socialPosts: 1
    },
    yearlyDeployment: {
      dailyTarget: 10,
      activeDaysPerMonth: 20,
      monthlyTarget: 200,
      ambassadorDailyCommissionUsd: 144.17,
      ambassadorMonthlyCommissionUsd: 28834,
      seniorMonthlyCommissionUsd: 14417,
      ambassadorAnnualCommissionUsd: 346008,
      seniorAnnualCommissionUsd: 173004,
      rdMonthlyCommissionUsd: 720850,
      rdAnnualCommissionUsd: 8650200
    },
    promotion: {
      seniorRecruits: 10,
      rdSeniors: 50,
      ambassadorsPerSenior: 10
    },
    unitMilestones: [50, 150, 300, 500]
  };

  function monthlyCommissionUsd(activeSubscribers) {
    var n = Number(activeSubscribers) || 0;
    return n * DOCTRINE.subscriptionMonthlyUsd * DOCTRINE.ambassadorRecurringPercent;
  }

  function yearlyDeploymentCommissionUsd(deployments) {
    var n = Number(deployments) || 0;
    return n * DOCTRINE.foundationYearlyUsd * DOCTRINE.ambassadorRecurringPercent;
  }

  function xafToUsd(xaf) {
    if (global.MEMoney && global.MEMoney.toUsd) {
      return global.MEMoney.toUsd(xaf, { storedAs: 'xaf' });
    }
    return (Number(xaf) || 0) / XAF_PER_USD;
  }

  function formatUsd(usd) {
    if (global.MEMoney && global.MEMoney.formatUSD) {
      return global.MEMoney.formatUSD(usd);
    }
    return '$' + Math.round(Number(usd) || 0).toLocaleString();
  }

  function formatStoredXafAsUsd(xaf) {
    return formatUsd(xafToUsd(xaf));
  }

  global.DOSEconomics = {
    DOCTRINE: DOCTRINE,
    monthlyCommissionUsd: monthlyCommissionUsd,
    yearlyDeploymentCommissionUsd: yearlyDeploymentCommissionUsd,
    xafToUsd: xafToUsd,
    formatUsd: formatUsd,
    formatStoredXafAsUsd: formatStoredXafAsUsd
  };
})(typeof window !== 'undefined' ? window : global);
