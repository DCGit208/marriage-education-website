/**
 * DOS Phase 4 — Senior Team command.
 */
(function (global) {
  'use strict';

  var RD_SENIOR_TARGET = 50;

  function memberUnits(m) {
    return m.accessUnitsDeployed || m.sales_count || m.booksSold || m.units_deployed || 0;
  }

  function memberRevenue(m) {
    var cats = m.revenue_by_category || {};
    var sum = Object.keys(cats).reduce(function (s, k) { return s + (Number(cats[k]) || 0); }, 0);
    if (sum) return sum;
    return memberUnits(m) * 15000;
  }

  function isInactive(m) {
    var units = memberUnits(m);
    if (!units) return true;
    var updated = m.updated_at && m.updated_at.toDate ? m.updated_at.toDate() : null;
    if (!updated) return false;
    var days = (Date.now() - updated.getTime()) / (24 * 60 * 60 * 1000);
    return days > 45;
  }

  async function loadTeamMembers(db, seniorCode) {
    var members = [];
    var seen = {};
    var queries = [
      db.collection('ambassadors').where('senior_code', '==', seniorCode).get(),
      db.collection('ambassadors').where('rdCode', '==', seniorCode).get(),
      db.collection('ambassadors').where('recruitedBy', '==', seniorCode).get()
    ];
    var snaps = await Promise.all(queries);
    snaps.forEach(function (snap) {
      snap.forEach(function (doc) {
        if (seen[doc.id] || doc.id === seniorCode) return;
        seen[doc.id] = true;
        members.push({ id: doc.id, data: doc.data() });
      });
    });
    return members;
  }

  function computeTeamStats(members) {
    var totalUnits = 0;
    var totalOverrideXaf = 0;
    var active = 0;
    var inactive = 0;
    var teamSubs = 0;

    members.forEach(function (m) {
      var d = m.data;
      var units = memberUnits(d);
      totalUnits += units;
      totalOverrideXaf += Math.round(memberRevenue(d) * 0.05);
      if (isInactive(d)) inactive++;
      else active++;
      teamSubs += (d.sbdReferrals && d.sbdReferrals.subscribers) || 0;
    });

    var overrideUsd = global.DOSEconomics
      ? global.DOSEconomics.xafToUsd(totalOverrideXaf)
      : totalOverrideXaf / 600;

    return {
      count: members.length,
      totalUnits: totalUnits,
      totalOverrideXaf: totalOverrideXaf,
      totalOverrideUsd: overrideUsd,
      active: active,
      inactive: inactive,
      teamSubs: teamSubs,
      avgUnits: members.length ? Math.round(totalUnits / members.length) : 0
    };
  }

  function fmtUsd(xafOrUsd, alreadyUsd) {
    if (global.DOSEconomics) {
      return alreadyUsd
        ? global.DOSEconomics.formatUsd(xafOrUsd)
        : global.DOSEconomics.formatStoredXafAsUsd(xafOrUsd);
    }
    return '$' + Math.round(xafOrUsd);
  }

  function renderTeamCommand(container, stats, statsDoc) {
    if (!container) return;
    var seniorsRecruited = (statsDoc && statsDoc.seniors_recruited) || 0;
    var rdPct = Math.min(100, Math.round((seniorsRecruited / RD_SENIOR_TARGET) * 100));
    var mrrTeam = global.DOSEconomics
      ? global.DOSEconomics.monthlyCommissionUsd(stats.teamSubs) * 0.05
      : 0;

    container.innerHTML =
      '<div class="dos-card dos-recurring-card">' +
      '<h3><i class="fa-solid fa-bolt"></i> Team command center</h3>' +
      '<p style="font-size:13px;color:#71717a">You earn <strong>5% override</strong> on team deployment revenue. Mentor inactive ambassadors to restore team velocity.</p>' +
      '<div class="dos-kpi-grid">' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Team ambassadors</div><div class="dos-kpi-value">' + stats.count + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Active</div><div class="dos-kpi-value" style="color:#00b894">' + stats.active + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Needs attention</div><div class="dos-kpi-value" style="color:#e11d48">' + stats.inactive + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Team units</div><div class="dos-kpi-value">' + stats.totalUnits + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Est. team override</div><div class="dos-kpi-value">' + fmtUsd(stats.totalOverrideUsd, true) + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Team SBD subs</div><div class="dos-kpi-value">' + stats.teamSubs + '</div></div>' +
      '</div></div>' +
      '<div class="dos-card"><h3><i class="fa-solid fa-globe"></i> Path to Regional Director</h3>' +
      '<p style="font-size:13px;color:#71717a;margin:0 0 12px">RD rank: develop <strong>50 Senior Ambassadors</strong> (each with 10 ambassadors).</p>' +
      '<div class="dos-progress"><div class="dos-progress-fill" style="width:' + rdPct + '%"></div></div>' +
      '<p style="font-size:13px;color:#71717a;margin-top:8px">' + seniorsRecruited + ' / ' + RD_SENIOR_TARGET + ' seniors in network (' + rdPct + '%)</p></div>' +
      '<div class="dos-card"><h3><i class="fa-solid fa-rotate"></i> Override economics (5%)</h3>' +
      '<div class="dos-kpi-grid">' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Ledger override (est.)</div><div class="dos-kpi-value">' + fmtUsd(stats.totalOverrideXaf) + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Recurring on team subs</div><div class="dos-kpi-value">' + fmtUsd(mrrTeam, true) + '</div>' +
      '<div class="dos-kpi-sub">5% of team SBD MRR (est.)</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Avg units / ambassador</div><div class="dos-kpi-value">' + stats.avgUnits + '</div></div>' +
      '</div>' +
      '<p style="font-size:13px;color:#71717a;margin-top:12px">At full team target (10 ambassadors × $30K/mo volume): <strong>$15,000/mo</strong> override potential per DOS doctrine.</p></div>';
  }

  function renderTeamTable(container, members) {
    if (!container) return;
    if (!members.length) {
      container.innerHTML = '<div class="dos-empty">No team ambassadors linked yet. Recruits appear when ambassadors use your code as recruiter.</div>';
      return;
    }

    var rows = members.map(function (m) {
      var d = m.data;
      var name = d.fullName || d.name || d.email || m.id;
      var units = memberUnits(d);
      var rev = memberRevenue(d);
      var override = Math.round(rev * 0.05);
      var status = isInactive(d)
        ? '<span class="dos-risk-tag">inactive</span>'
        : '<span style="color:#00b894;font-size:12px;font-weight:600">active</span>';
      var type = d.ambassador_type === 'senior' ? 'Senior' : 'Ambassador';
      return '<tr><td><strong>' + name + '</strong><br><code style="font-size:11px">' + m.id + '</code></td>' +
        '<td>' + type + '</td><td>' + units + '</td><td>' + fmtUsd(override) + '</td><td>' + status + '</td></tr>';
    }).join('');

    container.innerHTML =
      '<div class="dos-table-wrap"><table class="dos-table"><thead><tr>' +
      '<th>Ambassador</th><th>Rank</th><th>Units</th><th>Your 5%</th><th>Status</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  global.DOSTeam = {
    RD_SENIOR_TARGET: RD_SENIOR_TARGET,
    loadTeamMembers: loadTeamMembers,
    computeTeamStats: computeTeamStats,
    renderTeamCommand: renderTeamCommand,
    renderTeamTable: renderTeamTable
  };
})(typeof window !== 'undefined' ? window : global);
