/**
 * DOS Phase 5 — Regional Director command.
 */
(function (global) {
  'use strict';

  var RD_SENIOR_TARGET = 50;

  function fmtUsd(xafOrUsd, alreadyUsd) {
    if (global.DOSEconomics) {
      return alreadyUsd
        ? global.DOSEconomics.formatUsd(xafOrUsd)
        : global.DOSEconomics.formatStoredXafAsUsd(xafOrUsd);
    }
    return '$' + Math.round(xafOrUsd);
  }

  function seniorTeamSize(d) {
    return d.team_count || d.recruits_count || 0;
  }

  function seniorTeamUnits(d) {
    return d.team_units_deployed || d.team_units || 0;
  }

  function seniorNetworkRevenue(d) {
    var stored = d.team_revenue || d.network_revenue || 0;
    if (stored) return stored;
    return seniorTeamUnits(d) * 15000;
  }

  function isSeniorInactive(d) {
    var team = seniorTeamSize(d);
    if (!team) return true;
    var updated = d.updated_at && d.updated_at.toDate ? d.updated_at.toDate() : null;
    if (!updated) return team < 5;
    var days = (Date.now() - updated.getTime()) / (24 * 60 * 60 * 1000);
    return days > 45 || team < 5;
  }

  async function loadRegionSeniors(db, rdCode) {
    var seniors = [];
    var seen = {};
    try {
      var snap = await db.collection('ambassadors')
        .where('regional_director_code', '==', rdCode)
        .where('ambassador_type', '==', 'senior')
        .get();
      snap.forEach(function (doc) {
        seen[doc.id] = true;
        seniors.push({ id: doc.id, data: doc.data() });
      });
    } catch (e) {
      console.warn('RD senior query (typed)', e);
    }
    if (!seniors.length) {
      try {
        var snap2 = await db.collection('ambassadors')
          .where('regional_director_code', '==', rdCode)
          .get();
        snap2.forEach(function (doc) {
          if (seen[doc.id]) return;
          var d = doc.data();
          if (d.ambassador_type === 'senior') {
            seen[doc.id] = true;
            seniors.push({ id: doc.id, data: d });
          }
        });
      } catch (e2) {
        console.warn('RD senior query (fallback)', e2);
      }
    }
    return seniors;
  }

  function computeRegionStats(seniors, rdDoc) {
    var totalAmbassadors = 0;
    var totalUnits = 0;
    var networkOverrideXaf = (rdDoc && rdDoc.network_override_earned) || 0;
    var activeSeniors = 0;
    var inactiveSeniors = 0;
    var teamSubs = 0;

    seniors.forEach(function (s) {
      var d = s.data;
      var team = seniorTeamSize(d);
      var units = seniorTeamUnits(d);
      totalAmbassadors += team;
      totalUnits += units;
      if (!networkOverrideXaf) {
        networkOverrideXaf += Math.round(seniorNetworkRevenue(d) * 0.05);
      }
      if (isSeniorInactive(d)) inactiveSeniors++;
      else activeSeniors++;
      teamSubs += (d.sbdReferrals && d.sbdReferrals.subscribers) || 0;
    });

    if (rdDoc && rdDoc.network_override_earned) {
      networkOverrideXaf = rdDoc.network_override_earned;
    }

    var overrideUsd = global.DOSEconomics
      ? global.DOSEconomics.xafToUsd(networkOverrideXaf)
      : networkOverrideXaf / 600;

    return {
      seniorCount: seniors.length,
      totalAmbassadors: totalAmbassadors,
      totalUnits: totalUnits,
      networkOverrideXaf: networkOverrideXaf,
      networkOverrideUsd: overrideUsd,
      activeSeniors: activeSeniors,
      inactiveSeniors: inactiveSeniors,
      teamSubs: teamSubs,
      seniorTarget: RD_SENIOR_TARGET,
      seniorPct: Math.min(100, Math.round((seniors.length / RD_SENIOR_TARGET) * 100))
    };
  }

  function renderRegionalCommand(container, stats, rdDoc) {
    if (!container) return;
    var ledgerOverride = (rdDoc && (rdDoc.network_override_earned || rdDoc.team_override_earned)) || 0;
    var mrrNetwork = global.DOSEconomics
      ? global.DOSEconomics.monthlyCommissionUsd(stats.teamSubs) * 0.05
      : 0;

    var alertHtml = '';
    if (stats.inactiveSeniors > 0) {
      alertHtml =
        '<div class="dos-overview-hint" style="background:#fff7ed;border-color:#fed7aa;color:#9a3412;margin-bottom:16px">' +
        '<strong>' + stats.inactiveSeniors + ' senior(s)</strong> need attention — low team activity or stale updates. ' +
        'Coach them to re-activate ambassador teams.</div>';
    }

    container.innerHTML = alertHtml +
      '<div class="dos-card dos-recurring-card">' +
      '<h3><i class="fa-solid fa-globe"></i> Regional command center</h3>' +
      '<p style="font-size:13px;color:#71717a">You earn <strong>5% network override</strong> on Senior Ambassador team volume across your region.</p>' +
      '<div class="dos-kpi-grid">' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Senior ambassadors</div><div class="dos-kpi-value">' + stats.seniorCount + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Active seniors</div><div class="dos-kpi-value" style="color:#00b894">' + stats.activeSeniors + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Needs coaching</div><div class="dos-kpi-value" style="color:#e11d48">' + stats.inactiveSeniors + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Network ambassadors</div><div class="dos-kpi-value">' + stats.totalAmbassadors + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Network units</div><div class="dos-kpi-value">' + stats.totalUnits + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Est. network override</div><div class="dos-kpi-value">' + fmtUsd(stats.networkOverrideUsd, true) + '</div></div>' +
      '</div></div>' +
      '<div class="dos-card"><h3><i class="fa-solid fa-crown"></i> Regional development target</h3>' +
      '<p style="font-size:13px;color:#71717a;margin:0 0 12px">Full regional network: <strong>50 Senior Ambassadors</strong> (each developing 10 ambassadors).</p>' +
      '<div class="dos-progress"><div class="dos-progress-fill" style="width:' + stats.seniorPct + '%"></div></div>' +
      '<p style="font-size:13px;color:#71717a;margin-top:8px">' + stats.seniorCount + ' / ' + stats.seniorTarget +
      ' seniors (' + stats.seniorPct + '%)</p></div>' +
      '<div class="dos-card"><h3><i class="fa-solid fa-chart-pie"></i> Network override economics (5%)</h3>' +
      '<div class="dos-kpi-grid">' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Ledger network override</div><div class="dos-kpi-value">' +
      fmtUsd(ledgerOverride || stats.networkOverrideXaf) + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Est. recurring (network)</div><div class="dos-kpi-value">' + fmtUsd(mrrNetwork, true) + '</div>' +
      '<div class="dos-kpi-sub">5% on senior-team SBD MRR (est.)</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Avg team / senior</div><div class="dos-kpi-value">' +
      (stats.seniorCount ? Math.round(stats.totalAmbassadors / stats.seniorCount) : 0) + '</div></div>' +
      '</div></div>';
  }

  function renderSeniorOversightTable(container, seniors) {
    if (!container) return;
    if (!seniors.length) {
      container.innerHTML =
        '<div class="dos-empty">No Senior Ambassadors linked with <code>regional_director_code</code> yet. ' +
        'Recruit seniors to build your regional network.</div>';
      return;
    }

    var rows = seniors.map(function (s) {
      var d = s.data;
      var name = d.fullName || d.name || d.email || s.id;
      var team = seniorTeamSize(d);
      var units = seniorTeamUnits(d);
      var override = Math.round(seniorNetworkRevenue(d) * 0.05);
      var flag = isSeniorInactive(d)
        ? '<span class="dos-risk-tag">needs coaching</span>'
        : '<span style="color:#00b894;font-size:12px;font-weight:600">on track</span>';
      return '<tr><td><strong>' + name + '</strong><br><code style="font-size:11px">' + s.id + '</code></td>' +
        '<td>' + team + '</td><td>' + units + '</td><td>' + fmtUsd(override) + '</td><td>' + flag + '</td></tr>';
    }).join('');

    container.innerHTML =
      '<div class="dos-table-wrap"><table class="dos-table"><thead><tr>' +
      '<th>Senior ambassador</th><th>Team size</th><th>Team units</th><th>Your 5%</th><th>Status</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  global.DOSRegion = {
    RD_SENIOR_TARGET: RD_SENIOR_TARGET,
    loadRegionSeniors: loadRegionSeniors,
    computeRegionStats: computeRegionStats,
    renderRegionalCommand: renderRegionalCommand,
    renderSeniorOversightTable: renderSeniorOversightTable
  };
})(typeof window !== 'undefined' ? window : global);
