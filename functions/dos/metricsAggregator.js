/**
 * DOS metrics aggregator (Phase 0) — roll up ambassador doc → dos_metrics.
 */
const admin = require('firebase-admin');

const SENIOR_RECRUIT_TARGET = 10;

function monthKey(d) {
  d = d || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function buildDosMetrics(ambassadorCode, stats) {
  if (!stats) stats = {};
  const mk = monthKey();
  const sbd = stats.sbdReferrals || {};
  const activeSubs = Number(sbd.subscribers) || 0;
  const units = stats.accessUnitsDeployed || stats.sales_count || stats.booksSold || 0;
  const recruits = stats.recruits_count != null ? stats.recruits_count : 0;
  const earningsXaf = stats.commission_earned || stats.commissionEarned || 0;
  const monthlyXaf = stats.monthly_earnings?.[mk]?.total || 0;
  const subscriptionMonthlyUsd = 9;
  const ambassadorPct = 0.1;

  return {
    ambassadorCode,
    phase: 0,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    subscribers: {
      active: activeSubs,
      signups: Number(sbd.signups) || 0,
      foundation: Number(sbd.foundation) || 0,
      premium: Number(sbd.premium) || 0,
      elite: Number(sbd.elite) || 0
    },
    deployment: {
      unitsDeployed: Number(units) || 0,
      dailyDeployToday: Number(stats.daily_deployments_today) || 0
    },
    commissions: {
      allTimeXaf: Number(earningsXaf) || 0,
      monthlyXaf: Number(monthlyXaf) || 0,
      estimatedMrrUsd: activeSubs * subscriptionMonthlyUsd * ambassadorPct
    },
    network: {
      recruits,
      seniorTarget: SENIOR_RECRUIT_TARGET
    },
    retention: {
      percent: stats.retention_percent != null ? stats.retention_percent : null
    },
    formation: {
      credentialStatus: stats.credentialStatus || 'in-progress',
      level: stats.level || 'Starter'
    },
    source: 'cloud_function_v0'
  };
}

async function syncDosMetrics(db, ambassadorCode, stats) {
  const payload = buildDosMetrics(ambassadorCode, stats);
  await db.collection('dos_metrics').doc(ambassadorCode).set(payload, { merge: true });
  return payload;
}

module.exports = {
  buildDosMetrics,
  syncDosMetrics,
  monthKey
};
