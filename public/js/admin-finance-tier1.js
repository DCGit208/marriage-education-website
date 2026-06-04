/**
 * Admin Finance section — Tier 1 payout queue, Wise CSV, mark paid.
 */
(function () {
  'use strict';

  var queueCache = [];

  function fcfa(n) {
    return (Number(n) || 0).toLocaleString() + ' FCFA';
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
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
    } catch (e) {
      var hint = (e.message || '').indexOf('Admin access') !== -1
        ? ' Sign in as admin@marriageducation.com or set users/{uid}.role=admin / custom claim admin:true.'
        : '';
      tbody.innerHTML = '<tr><td colspan="10">Error: ' + esc(e.message) + esc(hint) + '</td></tr>';
    }
  }

  function bindFinanceRowActions() {
    document.querySelectorAll('.finance-mark-one').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-idx'));
        openMarkPaidModal(queueCache[idx]);
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

  function openMarkPaidModal(row) {
    if (!row) return;
    var ref = prompt('External reference (Wise transfer ID, MoMo ref):', 'WISE-');
    if (!ref) return;
    var key = 'payout-' + row.payee_code + '-' + Date.now();
    var b = row.sbd.pending_breakdown || {};
    var payload = {
      idempotency_key: key,
      payee_code: row.payee_code,
      amount_fcfa: row.total_pending_fcfa,
      external_reference: ref,
      method: (row.payout_profile && row.payout_profile.method) || 'manual',
      breakdown: {
        recruitment: row.recruitment.pending_fcfa,
        sbd_direct: b.direct || 0,
        sbd_senior_override: b.seniorOverride || 0,
        sbd_rd_override: b.rdOverride || 0
      }
    };
    markPaid(payload);
  }

  async function markPaid(payload) {
    try {
      var fn = firebase.functions().httpsCallable('markPayoutBatchPaid');
      var res = await fn(payload);
      alert(res.data && res.data.duplicate ? 'Already recorded.' : 'Marked paid successfully.');
      loadFinanceQueue();
      loadFinanceHistory();
    } catch (e) {
      alert('Mark paid failed: ' + (e.message || e));
    }
  }

  async function loadFinanceHistory() {
    var tbody = document.getElementById('financeHistoryBody');
    if (!tbody || typeof db === 'undefined') return;
    try {
      var snap = await db.collection('payout_events').orderBy('created_at', 'desc').limit(50).get();
      if (snap.empty) {
        tbody.innerHTML = '<tr><td colspan="6">No payout events yet.</td></tr>';
        return;
      }
      tbody.innerHTML = '';
      snap.forEach(function (doc) {
        var d = doc.data();
        var when = d.created_at && d.created_at.toDate
          ? d.created_at.toDate().toLocaleString() : '—';
        tbody.innerHTML += '<tr>' +
          '<td>' + when + '</td>' +
          '<td><code>' + esc(d.payee_code) + '</code></td>' +
          '<td>' + fcfa(d.amount_fcfa) + '</td>' +
          '<td>' + esc(d.method) + '</td>' +
          '<td>' + esc(d.external_reference) + '</td>' +
          '<td>' + esc(d.created_by_admin) + '</td></tr>';
      });
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="6">Error loading history.</td></tr>';
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
    document.getElementById('financeCampayDryBtn')?.addEventListener('click', function () { runCampayDisburse(true); });
    document.getElementById('financeCampayLiveBtn')?.addEventListener('click', function () { runCampayDisburse(false); });
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
