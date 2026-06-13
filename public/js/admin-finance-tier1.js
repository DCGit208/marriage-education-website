/**
 * Admin Finance section — Tier 1 payout queue, Wise CSV, mark paid, payout history.
 */
(function () {
  'use strict';

  var queueCache = [];
  var historyCache = [];
  var historyPayeeFilter = '';

  function fcfa(n) {
    return (Number(n) || 0).toLocaleString() + ' FCFA';
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function dayKey(ts) {
    if (!ts) return 'unknown';
    try {
      var d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toISOString().slice(0, 10);
    } catch (e) {
      return 'unknown';
    }
  }

  function fmtWhen(ts) {
    if (!ts) return '—';
    try {
      return ts.toDate ? ts.toDate().toLocaleString() : new Date(ts).toLocaleString();
    } catch (e) {
      return '—';
    }
  }

  async function loadFinanceQueue() {
    var tbody = document.getElementById('financeQueueBody');
    var status = document.getElementById('financeQueueStatus');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="10">Loading…</td></tr>';
    try {
      var minEl = document.getElementById('financeMinPending');
      var minPending = minEl ? Number(minEl.value) || 25000 : 25000;
      var fn = firebase.functions().httpsCallable('listPayoutQueue');
      var res = await fn({ min_pending_fcfa: minPending });
      queueCache = (res.data && res.data.payees) || [];
      if (status) {
        status.textContent = queueCache.length + ' payee(s) at or above ' + fcfa(res.data.threshold_fcfa);
      }
      if (!queueCache.length) {
        tbody.innerHTML = '<tr><td colspan="10">No payees above threshold.</td></tr>';
        return;
      }
      tbody.innerHTML = queueCache.map(function (row, i) {
        var prof = row.payout_profile || {};
        var method = prof.method || '—';
        var country = prof.country || '—';
        var ok = row.profile_complete ? 'yes' : 'no';
        return '<tr data-queue-idx="' + i + '">' +
          '<td><input type="checkbox" class="finance-row-check" data-idx="' + i + '"></td>' +
          '<td><code>' + esc(row.payee_code) + '</code></td>' +
          '<td>' + esc(row.name) + '</td>' +
          '<td>' + esc(country) + '</td>' +
          '<td>' + esc(method) + '</td>' +
          '<td>' + fcfa(row.recruitment.pending_fcfa) + '</td>' +
          '<td>' + fcfa(row.sbd.pending_fcfa) + '</td>' +
          '<td><strong>' + fcfa(row.total_pending_fcfa) + '</strong></td>' +
          '<td>' + ok + '</td>' +
          '<td><button type="button" class="btn btn-success btn-sm finance-mark-one" data-idx="' + i + '">Mark paid</button></td>' +
          '</tr>';
      }).join('');
      bindFinanceRowActions();
      bindSelectAll();
    } catch (e) {
      var hint = (e.message || '').indexOf('Admin access') !== -1
        ? ' Sign in as admin@marriageducation.com or set users/{uid}.role=admin / custom claim admin:true.'
        : '';
      tbody.innerHTML = '<tr><td colspan="10">Error: ' + esc(e.message) + esc(hint) + '</td></tr>';
    }
  }

  function bindSelectAll() {
    var selectAll = document.getElementById('financeSelectAll');
    if (!selectAll || selectAll.dataset.bound) return;
    selectAll.dataset.bound = '1';
    selectAll.addEventListener('change', function () {
      document.querySelectorAll('.finance-row-check').forEach(function (cb) {
        cb.checked = selectAll.checked;
      });
    });
  }

  function bindFinanceRowActions() {
    document.querySelectorAll('.finance-mark-one').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-idx'));
        openMarkPaidModal([queueCache[idx]]);
      });
    });
  }

  function selectedPayees() {
    var out = [];
    document.querySelectorAll('.finance-row-check:checked').forEach(function (cb) {
      var idx = Number(cb.getAttribute('data-idx'));
      if (queueCache[idx]) out.push(queueCache[idx]);
    });
    return out;
  }

  function exportWiseCsv() {
    var rows = selectedPayees().length ? selectedPayees() : queueCache.filter(function (r) {
      return r.payout_profile && r.payout_profile.method === 'wise_bank';
    });
    if (!rows.length) {
      alert('Select payees with Wise/bank method, or select rows first.');
      return;
    }
    var csv = 'name,email_or_iban,amount_fcfa,currency,reference,payee_code,country\n';
    rows.forEach(function (r) {
      var p = r.payout_profile || {};
      var email = p.wise_email || p.iban || '';
      csv += '"' + (r.name || '').replace(/"/g, '""') + '",';
      csv += '"' + String(email).replace(/"/g, '""') + '",';
      csv += r.total_pending_fcfa + ',';
      csv += (p.currency_preference || 'GBP') + ',';
      csv += '"PAYOUT-' + r.payee_code + '",';
      csv += '"' + r.payee_code + '",';
      csv += '"' + (p.country || '') + '"\n';
    });
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'wise_payout_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function buildMarkPaidPayload(row, externalRef) {
    var b = row.sbd.pending_breakdown || {};
    return {
      idempotency_key: 'payout-' + row.payee_code + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      payee_code: row.payee_code,
      amount_fcfa: row.total_pending_fcfa,
      external_reference: externalRef,
      method: (row.payout_profile && row.payout_profile.method) || 'manual',
      breakdown: {
        recruitment: row.recruitment.pending_fcfa,
        sbd_direct: b.direct || 0,
        sbd_senior_override: b.seniorOverride || 0,
        sbd_rd_override: b.rdOverride || 0
      }
    };
  }

  function openMarkPaidModal(payees) {
    if (!payees || !payees.length) return;
    var total = payees.reduce(function (s, r) { return s + (r.total_pending_fcfa || 0); }, 0);
    var summary = payees.length === 1
      ? payees[0].payee_code + ' · ' + fcfa(total)
      : payees.length + ' payees · ' + fcfa(total) + ' total';
    if (!confirm('Mark as PAID:\n' + summary + '\n\nOnly continue after funds are sent.')) return;

    var ref = prompt('External reference (Wise ID, MoMo ref, batch note):', 'BATCH-' + new Date().toISOString().slice(0, 10));
    if (!ref) return;
    markMultiplePaid(payees, ref);
  }

  async function markPaid(payload) {
    var fn = firebase.functions().httpsCallable('markPayoutBatchPaid');
    return fn(payload);
  }

  async function markMultiplePaid(payees, refBase) {
    var ok = 0;
    var fail = 0;
    var errors = [];
    for (var i = 0; i < payees.length; i++) {
      var row = payees[i];
      var ref = payees.length === 1
        ? refBase
        : refBase + '/' + row.payee_code;
      try {
        await markPaid(buildMarkPaidPayload(row, ref));
        ok++;
      } catch (e) {
        fail++;
        errors.push(row.payee_code + ': ' + (e.message || e));
      }
    }
    var msg = 'Marked paid: ' + ok + ' succeeded';
    if (fail) msg += ', ' + fail + ' failed.\n' + errors.slice(0, 5).join('\n');
    alert(msg);
    loadFinanceQueue();
    loadFinanceHistory();
  }

  function markSelectedPaid() {
    var rows = selectedPayees();
    if (!rows.length) {
      alert('Select one or more payees in the queue first (checkboxes).');
      return;
    }
    openMarkPaidModal(rows);
  }

  function markAllQueuedPaid() {
    if (!queueCache.length) {
      alert('Queue is empty. Refresh first.');
      return;
    }
    openMarkPaidModal(queueCache.slice());
  }

  function historyDaysLimit() {
    var el = document.getElementById('financeHistoryDays');
    var v = el ? Number(el.value) : 30;
    return v > 0 ? v : 365;
  }

  function filterHistoryByDays(events, days) {
    if (!days || days >= 365) return events;
    var cutoff;
    if (days === 1) {
      var start = new Date();
      start.setHours(0, 0, 0, 0);
      cutoff = start.getTime();
    } else {
      cutoff = Date.now() - days * 86400000;
    }
    return events.filter(function (ev) {
      if (!ev.created_at) return false;
      var t = ev.created_at.toDate ? ev.created_at.toDate().getTime() : new Date(ev.created_at).getTime();
      return t >= cutoff;
    });
  }

  function renderDailySummary(events) {
    var el = document.getElementById('financeDailySummary');
    if (!el) return;
    var byDay = Object.create(null);
    events.forEach(function (ev) {
      var k = ev._dayKey || 'unknown';
      if (!byDay[k]) byDay[k] = { count: 0, total: 0 };
      byDay[k].count++;
      byDay[k].total += Number(ev.amount_fcfa) || 0;
    });
    var days = Object.keys(byDay).sort().reverse();
    if (!days.length) {
      el.innerHTML = '<p style="font-size:14px;color:#636e72;margin:0">No payouts in selected period.</p>';
      return;
    }
    var grandTotal = events.reduce(function (s, e) { return s + (Number(e.amount_fcfa) || 0); }, 0);
    var rows = days.map(function (d) {
      var g = byDay[d];
      return '<tr><td><strong>' + esc(d) + '</strong></td><td>' + g.count + '</td><td><strong>' + fcfa(g.total) + '</strong></td></tr>';
    }).join('');
    el.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:8px;margin-bottom:8px">' +
      '<p style="margin:0;font-size:14px;color:#636e72">' + events.length + ' payout(s) · <strong>' + fcfa(grandTotal) + '</strong> in period</p>' +
      '</div>' +
      '<div class="table-container"><table><thead><tr><th>Date</th><th>Payouts</th><th>Total sent</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>';
  }

  function populateHistoryPayeeFilter(events) {
    var sel = document.getElementById('financeHistoryPayee');
    if (!sel) return;
    var codes = [];
    events.forEach(function (ev) {
      if (ev.payee_code && codes.indexOf(ev.payee_code) === -1) codes.push(ev.payee_code);
    });
    codes.sort();
    var html = '<option value="">All payees</option>';
    codes.forEach(function (c) {
      html += '<option value="' + esc(c) + '"' + (historyPayeeFilter === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    });
    sel.innerHTML = html;
  }

  function renderHistoryTable(events) {
    var tbody = document.getElementById('financeHistoryBody');
    if (!tbody) return;
    var filtered = historyPayeeFilter
      ? events.filter(function (ev) { return ev.payee_code === historyPayeeFilter; })
      : events;
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="7">No payout events in selected period.</td></tr>';
      return;
    }
    tbody.innerHTML = filtered.map(function (ev) {
      var d = ev;
      var breakdown = d.breakdown || {};
      var detail = [
        breakdown.recruitment ? 'rec ' + fcfa(breakdown.recruitment) : '',
        breakdown.sbd_direct ? 'sbd ' + fcfa(breakdown.sbd_direct) : ''
      ].filter(Boolean).join(' · ');
      return '<tr>' +
        '<td>' + fmtWhen(d.created_at) + '</td>' +
        '<td><code>' + esc(d.payee_code) + '</code></td>' +
        '<td><strong>' + fcfa(d.amount_fcfa) + '</strong></td>' +
        '<td style="font-size:12px;color:#64748b">' + esc(detail || '—') + '</td>' +
        '<td>' + esc(d.method) + '</td>' +
        '<td>' + esc(d.external_reference) + '</td>' +
        '<td>' + esc(d.created_by_admin) + '</td></tr>';
    }).join('');
  }

  async function loadFinanceHistory() {
    var tbody = document.getElementById('financeHistoryBody');
    if (!tbody || typeof db === 'undefined') return;
    tbody.innerHTML = '<tr><td colspan="7">Loading…</td></tr>';
    try {
      var snap = await db.collection('payout_events').orderBy('created_at', 'desc').limit(300).get();
      historyCache = [];
      snap.forEach(function (doc) {
        var d = doc.data();
        d._id = doc.id;
        d._dayKey = dayKey(d.created_at);
        historyCache.push(d);
      });

      var days = historyDaysLimit();
      var periodEvents = filterHistoryByDays(historyCache, days);
      populateHistoryPayeeFilter(periodEvents);
      renderDailySummary(periodEvents);
      renderHistoryTable(periodEvents);
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="7">Error loading history.</td></tr>';
    }
  }

  async function runCampayDisburse(dryRun) {
    if (!confirm(dryRun
      ? 'Dry run CamPay disburse for all momo_cm payees above threshold?'
      : 'LIVE CamPay disburse will send MoMo and mark paid. Continue?')) {
      return;
    }
    try {
      var fn = firebase.functions().httpsCallable('runCampayDisburseBatch');
      var res = await fn({ dry_run: dryRun === true });
      alert('CamPay batch: ' + JSON.stringify(res.data && res.data.results ? res.data.results.slice(0, 5) : res.data, null, 2));
      loadFinanceQueue();
      loadFinanceHistory();
    } catch (e) {
      alert('CamPay disburse failed: ' + (e.message || e));
    }
  }

  function initFinanceSection() {
    document.getElementById('financeRefreshBtn')?.addEventListener('click', loadFinanceQueue);
    document.getElementById('financeExportWiseBtn')?.addEventListener('click', exportWiseCsv);
    document.getElementById('financeLoadHistoryBtn')?.addEventListener('click', loadFinanceHistory);
    document.getElementById('financeMarkSelectedBtn')?.addEventListener('click', markSelectedPaid);
    document.getElementById('financeMarkAllBtn')?.addEventListener('click', markAllQueuedPaid);
    document.getElementById('financeCampayDryBtn')?.addEventListener('click', function () { runCampayDisburse(true); });
    document.getElementById('financeCampayLiveBtn')?.addEventListener('click', function () { runCampayDisburse(false); });
    document.getElementById('financeHistoryDays')?.addEventListener('change', loadFinanceHistory);
    document.getElementById('financeHistoryPayee')?.addEventListener('change', function (e) {
      historyPayeeFilter = e.target.value || '';
      var days = historyDaysLimit();
      var periodEvents = filterHistoryByDays(historyCache, days);
      renderHistoryTable(periodEvents);
    });
  }

  window.AdminFinanceTier1 = {
    loadFinanceQueue: loadFinanceQueue,
    loadFinanceHistory: loadFinanceHistory,
    init: initFinanceSection
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFinanceSection);
  } else {
    initFinanceSection();
  }
})();
