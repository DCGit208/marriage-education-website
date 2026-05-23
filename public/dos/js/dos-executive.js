/**
 * DOS Phase 6 — Executive global command.
 */
(function (global) {
  'use strict';

  async function loadGlobalStats(db) {
    var out = { ambassadors: 0, seniors: 0, rds: 0, active: 0, totalUnits: 0 };
    try {
      var amb = await db.collection('ambassadors').where('status', 'in', ['active', 'approved']).get();
      amb.forEach(function (doc) {
        var d = doc.data();
        out.ambassadors++;
        out.totalUnits += d.sales_count || d.accessUnitsDeployed || 0;
        if (d.ambassador_type === 'senior') out.seniors++;
        if (d.ambassador_type === 'regional_director') out.rds++;
      });
      out.active = out.ambassadors;
    } catch (e) {
      console.warn('Global stats ambassadors', e);
    }
    try {
      var rdSnap = await db.collection('regional_directors').get();
      if (rdSnap.size > out.rds) out.rds = rdSnap.size;
    } catch (e2) {
      console.warn('Global stats RD', e2);
    }
    return out;
  }

  function renderGlobalCommand(container, stats, globalStats) {
    if (!container) return;
    var g = globalStats || {};
    container.innerHTML =
      '<div class="dos-card dos-recurring-card" style="background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff">' +
      '<h3 style="color:#FFD700"><i class="fa-solid fa-earth-americas"></i> Executive global command</h3>' +
      '<p style="opacity:0.9;font-size:14px">Network-wide deployment operations — Marriage Education hub.</p>' +
      '<div class="dos-kpi-grid">' +
      '<div class="dos-kpi"><div class="dos-kpi-label" style="color:#a1a1aa">Active ambassadors</div>' +
      '<div class="dos-kpi-value" style="color:#fff">' + g.ambassadors + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label" style="color:#a1a1aa">Senior ambassadors</div>' +
      '<div class="dos-kpi-value" style="color:#fff">' + g.seniors + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label" style="color:#a1a1aa">Regional directors</div>' +
      '<div class="dos-kpi-value" style="color:#fff">' + g.rds + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label" style="color:#a1a1aa">Network units</div>' +
      '<div class="dos-kpi-value" style="color:#fff">' + g.totalUnits + '</div></div>' +
      '</div></div>' +
      '<div class="dos-card"><h3><i class="fa-solid fa-check-double"></i> Executive actions</h3>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
      '<a class="dos-btn dos-btn-primary" href="../admin-dashboard.html"><i class="fa-solid fa-shield"></i> Admin dashboard</a>' +
      '<a class="dos-btn" href="dashboard.html"><i class="fa-solid fa-crown"></i> Live executive dashboard</a>' +
      '<button type="button" class="dos-btn" data-dos-nav="region"><i class="fa-solid fa-globe"></i> Regional command</button>' +
      '<button type="button" class="dos-btn" data-dos-nav="reporting"><i class="fa-solid fa-file-export"></i> Reports</button>' +
      '</div></div>';
    container.querySelectorAll('[data-dos-nav]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (global.DOSRouter) global.DOSRouter.setSection(btn.getAttribute('data-dos-nav'));
      });
    });
  }

  global.DOSExecutive = {
    loadGlobalStats: loadGlobalStats,
    renderGlobalCommand: renderGlobalCommand
  };
})(typeof window !== 'undefined' ? window : global);
