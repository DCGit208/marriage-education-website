/**
 * DOS Phase 3 — Subscriber pipeline, retention, recurring commissions view.
 */
(function (global) {
  'use strict';

  var STAGES = [
    { id: 'prospect', label: 'Prospect', order: 1 },
    { id: 'contacted', label: 'Contacted', order: 2 },
    { id: 'interested', label: 'Interested', order: 3 },
    { id: 'subscribed', label: 'Subscribed', order: 4 },
    { id: 'active', label: 'Active', order: 5 },
    { id: 'retained', label: 'Retained', order: 6 },
    { id: 'leadership', label: 'Leadership candidate', order: 7 }
  ];

  function stageMeta(id) {
    return STAGES.find(function (s) { return s.id === id; }) || STAGES[0];
  }

  function inferStageFromSale(sale) {
    if (sale.tier || sale.productId) return 'subscribed';
    return 'active';
  }

  function recordFromSale(doc, code) {
    var s = doc.data();
    var d = s.sale_date && s.sale_date.toDate ? s.sale_date.toDate() : new Date();
    return {
      ambassadorCode: code,
      name: s.customer_name || s.customer_email || 'Customer',
      email: s.customer_email || '',
      stage: 'active',
      source: 'sale',
      sourceId: doc.id,
      lastActivityAt: d.toISOString(),
      createdAt: d.toISOString(),
      notes: s.product_name || '',
      atRisk: false
    };
  }

  function recordFromSbdSale(doc, code) {
    var s = doc.data();
    var d = s.createdAt && s.createdAt.toDate ? s.createdAt.toDate() : new Date();
    var stage = s.status === 'cancelled' ? 'interested' : 'subscribed';
    return {
      ambassadorCode: code,
      name: s.subscriberUid ? ('SBD ' + String(s.subscriberUid).slice(0, 8)) : 'SBD subscriber',
      email: '',
      stage: stage,
      source: 'sbd_sale',
      sourceId: doc.id,
      lastActivityAt: d.toISOString(),
      createdAt: d.toISOString(),
      notes: (s.tier || 'foundation') + ' tier',
      atRisk: false
    };
  }

  async function seedFromFirestore(db, code) {
    var records = [];
    var seen = {};

    try {
      var sales = await db.collection('sales')
        .where('source_ambassador', '==', code).limit(40).get();
      sales.forEach(function (doc) {
        var key = 'sale_' + doc.id;
        if (!seen[key]) {
          seen[key] = true;
          records.push(recordFromSale(doc, code));
        }
      });
    } catch (e) {
      try {
        var sales2 = await db.collection('sales')
          .where('ambassador_code', '==', code).limit(40).get();
        sales2.forEach(function (doc) {
          var key = 'sale_' + doc.id;
          if (!seen[key]) {
            seen[key] = true;
            records.push(recordFromSale(doc, code));
          }
        });
      } catch (e2) { /* ignore */ }
    }

    try {
      var sbd = await db.collection('sbd_sales')
        .where('ambassadorCode', '==', code).limit(40).get();
      sbd.forEach(function (doc) {
        var key = 'sbd_' + doc.id;
        if (!seen[key]) {
          seen[key] = true;
          records.push(recordFromSbdSale(doc, code));
        }
      });
    } catch (e) { /* collection may be empty */ }

    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var id = r.source + '_' + r.sourceId;
      await db.collection('dos_pipeline').doc(id).set(r, { merge: true });
    }
    return records.length;
  }

  async function loadPipeline(db, code, noReseed) {
    var list = [];
    try {
      var snap = await db.collection('dos_pipeline')
        .where('ambassadorCode', '==', code).get();
      snap.forEach(function (doc) {
        list.push(Object.assign({ id: doc.id }, doc.data()));
      });
    } catch (e) {
      console.warn('[DOSPipeline] load', e);
      if (e && (e.code === 'permission-denied' || String(e.message || '').indexOf('permission') !== -1)) {
        return [];
      }
    }

    if (!list.length && !noReseed) {
      try {
        await seedFromFirestore(db, code);
        return loadPipeline(db, code, true);
      } catch (seedErr) {
        console.warn('[DOSPipeline] seed skipped', seedErr);
        return [];
      }
    }

    list.sort(function (a, b) {
      return (b.lastActivityAt || '').localeCompare(a.lastActivityAt || '');
    });
    return list;
  }

  async function updateStage(db, recordId, stage) {
    await db.collection('dos_pipeline').doc(recordId).set({
      stage: stage,
      lastActivityAt: new Date().toISOString(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  async function addProspect(db, code, data) {
    var id = 'manual_' + Date.now();
    var payload = {
      ambassadorCode: code,
      name: data.name || 'Prospect',
      email: data.email || '',
      phone: data.phone || '',
      stage: 'prospect',
      source: 'manual',
      sourceId: id,
      lastActivityAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      notes: data.notes || '',
      atRisk: false
    };
    await db.collection('dos_pipeline').doc(id).set(payload);
    return id;
  }

  function computeRetentionStats(list) {
    var now = Date.now();
    var day30 = 30 * 24 * 60 * 60 * 1000;
    var counts = {};
    STAGES.forEach(function (s) { counts[s.id] = 0; });

    var atRisk = [];
    list.forEach(function (r) {
      counts[r.stage] = (counts[r.stage] || 0) + 1;
      var last = r.lastActivityAt ? new Date(r.lastActivityAt).getTime() : 0;
      var stale = last && (now - last > day30);
      var subscribedPlus = ['subscribed', 'active', 'retained', 'leadership'].indexOf(r.stage) >= 0;
      if (r.atRisk || (subscribedPlus && stale)) {
        atRisk.push(r);
      }
    });

    var deployed = (counts.subscribed || 0) + (counts.active || 0) + (counts.retained || 0) + (counts.leadership || 0);
    var retained = (counts.retained || 0) + (counts.leadership || 0);
    var retentionPct = deployed ? Math.round((retained / deployed) * 100) : 0;

    return { counts: counts, atRisk: atRisk, retentionPct: retentionPct, deployed: deployed };
  }

  function renderAlertsBanner(container, stats) {
    if (!container) return;
    var atRisk = stats.atRisk.length;
    var prospects = (stats.counts.prospect || 0) + (stats.counts.contacted || 0);
    if (!atRisk && !prospects) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }
    container.style.display = 'block';
    container.innerHTML =
      '<div class="dos-alert-banner">' +
      (atRisk ? '<span><i class="fa-solid fa-triangle-exclamation"></i> <strong>' + atRisk +
        '</strong> subscriber(s) at risk — see Retention</span>' : '') +
      (prospects ? '<span><i class="fa-solid fa-user-clock"></i> <strong>' + prospects +
        '</strong> prospect(s) need follow-up</span>' : '') +
      '</div>';
  }

  function renderPipeline(container, code, list, db, onUpdate) {
    if (!container) return;
    var stats = computeRetentionStats(list);

    var funnel = STAGES.map(function (s) {
      var n = stats.counts[s.id] || 0;
      return '<div class="dos-funnel-step"><div class="dos-funnel-count">' + n + '</div>' +
        '<div class="dos-funnel-label">' + s.label + '</div></div>';
    }).join('');

    var rows = list.length ? list.map(function (r) {
      var opts = STAGES.map(function (s) {
        return '<option value="' + s.id + '"' + (r.stage === s.id ? ' selected' : '') + '>' + s.label + '</option>';
      }).join('');
      var risk = r.atRisk ? ' <span class="dos-risk-tag">at risk</span>' : '';
      return '<tr><td><strong>' + (r.name || '—') + '</strong>' + risk +
        '<br><span style="font-size:11px;color:#71717a">' + (r.email || r.source) + '</span></td>' +
        '<td><select class="dos-stage-select" data-record-id="' + r.id + '">' + opts + '</select></td>' +
        '<td>' + (r.lastActivityAt ? new Date(r.lastActivityAt).toLocaleDateString() : '—') + '</td></tr>';
    }).join('') : '<tr><td colspan="3" class="dos-empty">No pipeline records yet.</td></tr>';

    container.innerHTML =
      '<div class="dos-card"><h3><i class="fa-solid fa-filter"></i> Acquisition pipeline</h3>' +
      '<p style="font-size:13px;color:#71717a">Seven stages from prospect → leadership candidate. Imported from your sales &amp; SBD records; edit stages as you work the field.</p>' +
      '<div class="dos-funnel">' + funnel + '</div></div>' +
      '<div class="dos-card"><h3><i class="fa-solid fa-user-plus"></i> Add prospect</h3>' +
      '<div class="dos-daily-form-grid">' +
      '<label>Name<input type="text" id="dosProspectName" placeholder="Full name"></label>' +
      '<label>Email<input type="email" id="dosProspectEmail" placeholder="email@example.com"></label>' +
      '</div>' +
      '<button type="button" class="dos-btn dos-btn-primary" id="dosAddProspect" style="margin-top:10px"><i class="fa-solid fa-plus"></i> Add to pipeline</button></div>' +
      '<div class="dos-card"><h3><i class="fa-solid fa-list"></i> Pipeline list</h3>' +
      '<div class="dos-table-wrap"><table class="dos-table"><thead><tr><th>Contact</th><th>Stage</th><th>Last activity</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';

    container.querySelectorAll('.dos-stage-select').forEach(function (sel) {
      sel.addEventListener('change', async function () {
        await updateStage(db, sel.getAttribute('data-record-id'), sel.value);
        if (onUpdate) onUpdate();
      });
    });

    var addBtn = document.getElementById('dosAddProspect');
    if (addBtn) {
      addBtn.addEventListener('click', async function () {
        await addProspect(db, code, {
          name: document.getElementById('dosProspectName').value,
          email: document.getElementById('dosProspectEmail').value
        });
        if (onUpdate) onUpdate();
      });
    }
  }

  function renderRetention(container, list, metrics) {
    if (!container) return;
    var stats = computeRetentionStats(list);
    var activeSubs = metrics && metrics.subscribers ? metrics.subscribers.active : 0;
    var mrr = global.DOSEconomics ? global.DOSEconomics.monthlyCommissionUsd(activeSubs) : 0;
    var mrrFmt = global.DOSEconomics ? global.DOSEconomics.formatUsd(mrr) : '$' + mrr;

    var atRiskRows = stats.atRisk.length ? stats.atRisk.map(function (r) {
      return '<tr><td>' + (r.name || '—') + '</td><td>' + stageMeta(r.stage).label + '</td>' +
        '<td>' + (r.lastActivityAt ? new Date(r.lastActivityAt).toLocaleDateString() : '—') + '</td></tr>';
    }).join('') : '<tr><td colspan="3" class="dos-empty">No at-risk subscribers flagged.</td></tr>';

    container.innerHTML =
      '<div class="dos-kpi-grid">' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Retention rate</div><div class="dos-kpi-value">' + stats.retentionPct + '%</div>' +
      '<div class="dos-kpi-sub">Retained ÷ deployed (subscribed+)</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Active SBD subs</div><div class="dos-kpi-value">' + activeSubs + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Est. MRR (10%)</div><div class="dos-kpi-value">' + mrrFmt + '</div>' +
      '<div class="dos-kpi-sub">$9/mo × active × 10%</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">At risk</div><div class="dos-kpi-value" style="color:#e11d48">' + stats.atRisk.length + '</div></div>' +
      '</div>' +
      '<div class="dos-card"><h3><i class="fa-solid fa-heart-pulse"></i> At-risk &amp; renewals</h3>' +
      '<p style="font-size:13px;color:#71717a">Contacts with no activity in 30+ days after subscribe, or manually flagged.</p>' +
      '<div class="dos-table-wrap"><table class="dos-table"><thead><tr><th>Name</th><th>Stage</th><th>Last activity</th></tr></thead>' +
      '<tbody>' + atRiskRows + '</tbody></table></div></div>';
  }

  function renderRecurringCommissions(container, metrics, stats) {
    if (!container) return;
    var active = metrics && metrics.subscribers ? metrics.subscribers.active : 0;
    var pendingXaf = (stats && stats.sbdReferrals && stats.sbdReferrals.commissionPending) || 0;
    var earnedXaf = (stats && stats.sbdReferrals && stats.sbdReferrals.commissionEarned) || 0;
    var mrr = global.DOSEconomics ? global.DOSEconomics.monthlyCommissionUsd(active) : 0;
    var fmt = global.DOSEconomics ? global.DOSEconomics.formatUsd.bind(global.DOSEconomics) : function (n) { return '$' + n; };
    var fmtXaf = global.DOSEconomics ? global.DOSEconomics.formatStoredXafAsUsd.bind(global.DOSEconomics) : function (n) { return String(n); };

    var month10 = fmt(mrr * 10);
    var doctrine = global.DOSEconomics ? global.DOSEconomics.DOCTRINE : { subscriptionMonthlyUsd: 9 };

    container.innerHTML =
      '<div class="dos-card dos-recurring-card">' +
      '<h3><i class="fa-solid fa-rotate"></i> Recurring commission center</h3>' +
      '<p style="font-size:13px;color:#71717a">DOS doctrine: <strong>' + fmt(doctrine.subscriptionMonthlyUsd) +
      '/mo</strong> Foundation access · <strong>10%</strong> ambassador recurring share.</p>' +
      '<div class="dos-kpi-grid">' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Active subscribers</div><div class="dos-kpi-value">' + active + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Est. monthly recurring</div><div class="dos-kpi-value">' + fmt(mrr) + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">10-month projection</div><div class="dos-kpi-value">' + month10 + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">SBD pending (ledger)</div><div class="dos-kpi-value">' + fmtXaf(pendingXaf) + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">SBD earned (ledger)</div><div class="dos-kpi-value">' + fmtXaf(earnedXaf) + '</div></div>' +
      '</div></div>';
  }

  global.DOSPipeline = {
    STAGES: STAGES,
    loadPipeline: loadPipeline,
    computeRetentionStats: computeRetentionStats,
    renderAlertsBanner: renderAlertsBanner,
    renderPipeline: renderPipeline,
    renderRetention: renderRetention,
    renderRecurringCommissions: renderRecurringCommissions
  };
})(typeof window !== 'undefined' ? window : global);
