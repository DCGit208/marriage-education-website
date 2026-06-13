/**
 * Admin — payment inquiries inbox (Finance section).
 */
(function () {
  'use strict';

  var cache = [];

  function fcfa(n) {
    return (Number(n) || 0).toLocaleString() + ' FCFA';
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function fmtWhen(ts) {
    if (!ts) return '—';
    try {
      return ts.toDate ? ts.toDate().toLocaleString() : new Date(ts).toLocaleString();
    } catch (e) {
      return '—';
    }
  }

  async function loadPaymentInquiries() {
    var tbody = document.getElementById('paymentInquiriesBody');
    var status = document.getElementById('paymentInquiriesStatus');
    if (!tbody || typeof db === 'undefined') return;

    var filterEl = document.getElementById('paymentInquiriesFilter');
    var filter = filterEl ? filterEl.value : 'open';

    tbody.innerHTML = '<tr><td colspan="9">Loading…</td></tr>';
    try {
      var query = db.collection('payment_inquiries');
      if (filter === 'open') {
        query = query.where('status', '==', 'open');
      } else if (filter === 'resolved') {
        query = query.where('status', 'in', ['resolved', 'closed']);
      }
      var snap = await query.orderBy('created_at', 'desc').limit(50).get();
      cache = [];
      snap.forEach(function (doc) {
        cache.push({ id: doc.id, data: doc.data() });
      });

      if (status) {
        var openCount = cache.filter(function (r) { return r.data.status === 'open'; }).length;
        status.textContent = filter === 'open'
          ? openCount + ' open inquiry(ies)'
          : cache.length + ' record(s)';
      }

      if (!cache.length) {
        tbody.innerHTML = '<tr><td colspan="9">No payment inquiries.</td></tr>';
        return;
      }

      tbody.innerHTML = cache.map(function (row) {
        var d = row.data;
        var pending = d.wallet_snapshot && d.wallet_snapshot.total_pending_fcfa;
        return '<tr>' +
          '<td>' + fmtWhen(d.created_at) + '</td>' +
          '<td><code>' + esc(d.payee_code) + '</code><br><small>' + esc(d.payee_name) + '</small></td>' +
          '<td>' + esc(d.inquiry_label || d.inquiry_type) + '</td>' +
          '<td style="max-width:200px;font-size:13px">' + esc((d.notes || '').slice(0, 160)) +
          ((d.notes || '').length > 160 ? '…' : '') + '</td>' +
          '<td>' + (d.amount_expected_fcfa ? fcfa(d.amount_expected_fcfa) : '—') + '</td>' +
          '<td>' + (pending != null ? fcfa(pending) : '—') + '</td>' +
          '<td>' + esc(d.status) + '</td>' +
          '<td style="font-size:12px">' + esc(d.admin_note || '—') + '</td>' +
          '<td>' +
          (d.status === 'open'
            ? '<button type="button" class="btn btn-success btn-sm pi-resolve" data-id="' + esc(row.id) + '">Resolve</button> ' +
              '<button type="button" class="btn btn-secondary btn-sm pi-close" data-id="' + esc(row.id) + '">Close</button>'
            : '—') +
          '</td></tr>';
      }).join('');

      bindInquiryActions();
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="9">Error: ' + esc(e.message) + '</td></tr>';
    }
  }

  function bindInquiryActions() {
    document.querySelectorAll('.pi-resolve').forEach(function (btn) {
      btn.addEventListener('click', function () {
        resolveInquiry(btn.getAttribute('data-id'), 'resolved');
      });
    });
    document.querySelectorAll('.pi-close').forEach(function (btn) {
      btn.addEventListener('click', function () {
        resolveInquiry(btn.getAttribute('data-id'), 'closed');
      });
    });
  }

  async function resolveInquiry(inquiryId, status) {
    if (!inquiryId) return;
    var note = prompt('Admin response (visible to ambassador on their dashboard):', '');
    if (note === null) return;
    try {
      var fn = firebase.functions().httpsCallable('resolvePaymentInquiry');
      await fn({ inquiry_id: inquiryId, status: status, admin_note: note });
      loadPaymentInquiries();
    } catch (e) {
      alert('Resolve failed: ' + (e.message || e));
    }
  }

  function initPaymentInquiries() {
    document.getElementById('paymentInquiriesRefreshBtn')?.addEventListener('click', loadPaymentInquiries);
    document.getElementById('paymentInquiriesFilter')?.addEventListener('change', loadPaymentInquiries);
  }

  window.AdminPaymentInquiries = {
    load: loadPaymentInquiries,
    init: initPaymentInquiries
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPaymentInquiries);
  } else {
    initPaymentInquiries();
  }
})();
