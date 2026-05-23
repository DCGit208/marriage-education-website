/**
 * DOS metrics — Phase 0: build + load dos_metrics/{ambassadorCode}.
 */
(function (global) {
  'use strict';

  function monthKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function buildFromAmbassador(code, stats) {
    stats = stats || {};
    var mk = monthKey();
    var sbd = stats.sbdReferrals || {};
    var activeSubs = Number(sbd.subscribers) || 0;
    var units = stats.accessUnitsDeployed || stats.sales_count || stats.booksSold || 0;
    var recruits = stats.recruits_count != null ? stats.recruits_count : 0;
    var earningsXaf = stats.commission_earned || stats.commissionEarned || 0;
    var monthlyXaf = (stats.monthly_earnings && stats.monthly_earnings[mk])
      ? stats.monthly_earnings[mk].total : 0;
    var econ = global.DOSEconomics;
    var mrrUsd = econ ? econ.monthlyCommissionUsd(activeSubs) : activeSubs * 0.9;

    return {
      ambassadorCode: code,
      phase: 0,
      updatedAt: new Date().toISOString(),
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
        estimatedMrrUsd: mrrUsd
      },
      network: {
        recruits: recruits,
        seniorTarget: (global.DOSConfig && global.DOSConfig.SENIOR_RECRUIT_TARGET) || 10
      },
      retention: {
        percent: stats.retention_percent != null ? stats.retention_percent : null
      },
      formation: {
        credentialStatus: stats.credentialStatus || 'in-progress',
        level: stats.level || 'Starter'
      },
      revenueStacks: stats.revenueStacks || stats.revenue_stacks || null,
      source: 'ambassadors_doc_v0'
    };
  }

  function mergeMetrics(metrics, stats) {
    if (!metrics) return buildFromAmbassador(null, stats);
    var built = buildFromAmbassador(metrics.ambassadorCode, stats);
    return {
      ambassadorCode: metrics.ambassadorCode || built.ambassadorCode,
      phase: metrics.phase != null ? metrics.phase : built.phase,
      updatedAt: metrics.updatedAt || built.updatedAt,
      subscribers: Object.assign({}, built.subscribers, metrics.subscribers || {}),
      deployment: Object.assign({}, built.deployment, metrics.deployment || {}),
      commissions: Object.assign({}, built.commissions, metrics.commissions || {}),
      network: Object.assign({}, built.network, metrics.network || {}),
      retention: Object.assign({}, built.retention, metrics.retention || {}),
      formation: Object.assign({}, built.formation, metrics.formation || {}),
      source: metrics.source || built.source
    };
  }

  async function load(db, code, stats) {
    var built = buildFromAmbassador(code, stats);
    if (!db || !code) return built;
    try {
      var snap = await db.collection('dos_metrics').doc(code).get();
      if (snap.exists) {
        return mergeMetrics(snap.data(), stats);
      }
    } catch (e) {
      console.warn('[DOSMetrics] load', e);
    }
    return built;
  }

  async function persist(db, code, stats) {
    if (!db || !code) return null;
    var payload = buildFromAmbassador(code, stats);
    if (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue) {
      payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    }
    try {
      await db.collection('dos_metrics').doc(code).set(payload, { merge: true });
      var snap = await db.collection('dos_metrics').doc(code).get();
      return snap.exists ? mergeMetrics(snap.data(), stats) : buildFromAmbassador(code, stats);
    } catch (e) {
      console.warn('[DOSMetrics] persist', e);
      return buildFromAmbassador(code, stats);
    }
  }

  global.DOSMetrics = {
    buildFromAmbassador: buildFromAmbassador,
    mergeMetrics: mergeMetrics,
    load: load,
    persist: persist,
    monthKey: monthKey
  };
})(typeof window !== 'undefined' ? window : global);
