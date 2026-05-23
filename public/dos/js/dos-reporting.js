/**
 * DOS §10 — Reporting & exports (Phase 7).
 */
(function (global) {
  'use strict';

  function downloadCsv(filename, rows) {
    var csv = rows.map(function (row) {
      return row.map(function (cell) {
        var s = (cell == null ? '' : String(cell)).replace(/"/g, '""');
        return '"' + s + '"';
      }).join(',');
    }).join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function fmtUsd(xaf) {
    return global.MEMoney ? global.MEMoney.formatStoredAsUSD(xaf) : String(xaf);
  }

  function exportPipeline(pipeline) {
    var rows = [['Stage', 'Name', 'Email', 'Updated']];
    (pipeline || []).forEach(function (p) {
      rows.push([p.stage || '', p.name || '', p.email || '', p.updated || '']);
    });
    downloadCsv('dos-pipeline-' + Date.now() + '.csv', rows);
  }

  function exportCommissions(rows) {
    var out = [['Date', 'Source', 'Product', 'Commission']];
    (rows || []).forEach(function (r) {
      out.push([
        r.date ? r.date.toLocaleDateString() : '',
        r.source || '',
        r.product || '',
        fmtUsd(r.commission || 0)
      ]);
    });
    downloadCsv('dos-commissions-' + Date.now() + '.csv', out);
  }

  function exportSummary(state) {
    var s = state.stats || {};
    var m = state.metrics || {};
    var rows = [
      ['Field', 'Value'],
      ['Code', state.code || ''],
      ['Name', state.name || ''],
      ['Rank', s.ambassador_type || 'ambassador'],
      ['Active SBD subs', (m.subscribers && m.subscribers.active) || 0],
      ['Units deployed', (m.deployment && m.deployment.unitsDeployed) || 0],
      ['All-time commission', fmtUsd((m.commissions && m.commissions.allTimeXaf) || 0)],
      ['Recruits', (m.network && m.network.recruits) || 0],
      ['Generated', new Date().toISOString()]
    ];
    downloadCsv('dos-summary-' + state.code + '.csv', rows);
  }

  function renderReporting(container, state, helpers) {
    if (!container) return;
    helpers = helpers || {};

    container.innerHTML =
      '<div class="dos-card">' +
      '<h3><i class="fa-solid fa-file-export"></i> Operations reports</h3>' +
      '<p style="font-size:13px;color:#71717a;margin:0 0 16px">Export your deployment data for coaching, tax records, or regional reviews.</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="dos-btn dos-btn-primary" id="dosExportSummary"><i class="fa-solid fa-file-lines"></i> Account summary</button>' +
      '<button type="button" class="dos-btn" id="dosExportPipeline"><i class="fa-solid fa-filter"></i> Pipeline CSV</button>' +
      '<button type="button" class="dos-btn" id="dosExportCommissions"><i class="fa-solid fa-coins"></i> Commissions CSV</button>' +
      (helpers.exportTeam ? '<button type="button" class="dos-btn" id="dosExportTeam"><i class="fa-solid fa-users"></i> Team CSV</button>' : '') +
      '</div></div>' +
      '<div class="dos-card"><h3><i class="fa-solid fa-calendar"></i> Reporting periods</h3>' +
      '<p style="font-size:13px;margin:0 0 12px">Use <strong>Daily ops</strong> for day-level discipline; this export captures account-level snapshot now.</p>' +
      '<div class="dos-kpi-grid">' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Today</div><div class="dos-kpi-value">' + new Date().toLocaleDateString() + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Metrics source</div><div class="dos-kpi-value" style="font-size:14px">' +
      ((state.metrics && state.metrics.source) || 'ambassadors') + '</div></div></div></div>';

    var sumBtn = document.getElementById('dosExportSummary');
    if (sumBtn) sumBtn.addEventListener('click', function () { exportSummary(state); });

    var pipeBtn = document.getElementById('dosExportPipeline');
    if (pipeBtn) pipeBtn.addEventListener('click', function () {
      if (helpers.getPipeline) exportPipeline(helpers.getPipeline());
      else alert('Pipeline not loaded yet.');
    });

    var commBtn = document.getElementById('dosExportCommissions');
    if (commBtn) commBtn.addEventListener('click', function () {
      if (helpers.getCommissions) exportCommissions(helpers.getCommissions());
      else alert('Commission history not loaded yet.');
    });

    var teamBtn = document.getElementById('dosExportTeam');
    if (teamBtn && helpers.exportTeam) {
      teamBtn.addEventListener('click', helpers.exportTeam);
    }
  }

  global.DOSReporting = {
    renderReporting: renderReporting,
    downloadCsv: downloadCsv,
    exportSummary: exportSummary
  };
})(typeof window !== 'undefined' ? window : global);
