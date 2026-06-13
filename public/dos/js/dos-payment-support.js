/**
 * Ambassador payment support — ledger detail, payout history, inquiries (Tier A + B).
 */
(function (global) {
  'use strict';

  var PAYOUT_REQUEST_THRESHOLD_FCFA = 15000;
  var lastContext = null;

  function num(v) {
    var n = Number(v);
    return n === n ? n : 0;
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function fmtFcfa(n) {
    return num(n).toLocaleString() + ' FCFA';
  }

  function fmtXaf(n) {
    if (global.DOSEconomics && global.DOSEconomics.formatStoredXafAsUsd) {
      return global.DOSEconomics.formatStoredXafAsUsd(n);
    }
    return fmtFcfa(n);
  }

  function fmtDate(isoOrTs) {
    if (!isoOrTs) return '—';
    try {
      if (isoOrTs.toDate) return isoOrTs.toDate().toLocaleDateString();
      return new Date(isoOrTs).toLocaleDateString();
    } catch (e) {
      return '—';
    }
  }

  function statusBadge(status) {
    var s = (status || 'pending').toLowerCase();
    var color = s === 'paid' || s === 'resolved' ? '#16a34a'
      : s === 'open' ? '#ea580c' : '#71717a';
    return '<span style="color:' + color + ';font-weight:600">' + esc(s) + '</span>';
  }

  function db() {
    return typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null;
  }

  function ensureSupportContainer(walletBody) {
    if (!walletBody || !walletBody.parentNode) return null;
    var el = document.getElementById('dosPaymentSupportBody');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dosPaymentSupportBody';
      walletBody.parentNode.insertBefore(el, walletBody.nextSibling);
    }
    return el;
  }

  function renderRecruitmentLedger(history) {
    var rows = (history || []).slice().sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
    if (!rows.length) {
      return '<p class="dos-empty" style="font-size:13px;color:#71717a;margin:12px 0 0">No recruitment bonuses recorded yet.</p>';
    }
    var body = rows.map(function (row) {
      var recruit = row.ambassador_code || '—';
      var tier = row.bonus_tier || row.type || '—';
      return '<tr>' +
        '<td>' + fmtDate(row.date) + '</td>' +
        '<td><code>' + esc(recruit) + '</code></td>' +
        '<td>' + esc(row.ambassador_name || '') + '</td>' +
        '<td>' + esc(tier) + '</td>' +
        '<td>' + fmtXaf(row.amount) + '</td>' +
        '<td>' + statusBadge(row.status) + '</td>' +
        '</tr>';
    }).join('');
    return '<h4 style="font-size:14px;margin:20px 0 8px"><i class="fa-solid fa-list"></i> Recruitment ledger</h4>' +
      '<div class="dos-table-wrap"><table class="dos-table">' +
      '<thead><tr><th>Date</th><th>Recruit</th><th>Name</th><th>Tier</th><th>Amount</th><th>Status</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  function renderPayoutHistoryPlaceholder() {
    return '<h4 style="font-size:14px;margin:20px 0 8px"><i class="fa-solid fa-clock-rotate-left"></i> Payout history</h4>' +
      '<p id="dosPayoutHistoryStatus" style="font-size:13px;color:#71717a">Loading payout history…</p>' +
      '<div id="dosPayoutHistoryTable"></div>';
  }

  async function loadPayoutHistory(payeeCode) {
    var statusEl = document.getElementById('dosPayoutHistoryStatus');
    var tableEl = document.getElementById('dosPayoutHistoryTable');
    if (!tableEl || !payeeCode) return;
    var firestore = db();
    if (!firestore) {
      if (statusEl) statusEl.textContent = 'Firestore unavailable.';
      return;
    }
    try {
      var snap = await firestore.collection('payout_events')
        .where('payee_code', '==', payeeCode)
        .orderBy('created_at', 'desc')
        .limit(25)
        .get();
      if (snap.empty) {
        if (statusEl) statusEl.textContent = 'No cash payouts recorded yet. Payouts appear here after admin marks them paid.';
        return;
      }
      if (statusEl) statusEl.textContent = '';
      var rows = '';
      snap.forEach(function (doc) {
        var d = doc.data();
        rows += '<tr data-related-ref="payout:' + esc(doc.id) + '">' +
          '<td>' + fmtDate(d.created_at) + '</td>' +
          '<td>' + fmtXaf(d.amount_fcfa) + '</td>' +
          '<td>' + esc(d.method) + '</td>' +
          '<td>' + esc(d.external_reference) + '</td>' +
          '<td>' + statusBadge(d.status || 'completed') + '</td>' +
          '</tr>';
      });
      tableEl.innerHTML =
        '<div class="dos-table-wrap"><table class="dos-table">' +
        '<thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    } catch (e) {
      if (statusEl) {
        statusEl.textContent = 'Could not load payout history. If this persists, contact support.';
      }
      console.warn('[DOSPaymentSupport] payout history', e);
    }
  }

  function buildRelatedOptions(stats, payeeCode) {
    var opts = '<option value="">— Optional: link to a ledger item —</option>';
    (stats.recruitment_history || []).forEach(function (row, i) {
      var ref = 'recruit:' + (row.ambassador_code || i) + ':' + num(row.amount);
      var label = 'Recruitment ' + (row.ambassador_code || '') + ' · ' + fmtFcfa(row.amount) +
        ' (' + (row.status || 'pending') + ')';
      opts += '<option value="' + esc(ref) + '">' + esc(label) + '</option>';
    });
    opts += '<option value="wallet:total_pending">Total pending balance</option>';
    opts += '<option value="wallet:profile">Payout profile</option>';
    return opts;
  }

  function renderPaymentSupportCard(stats, payeeCode, walletSummary) {
    var container = document.getElementById('dosPaymentSupportBody');
    if (!container || !payeeCode) return;

    var profileOk = walletSummary.payout_profile && walletSummary.payout_profile.profile_complete === true;
    var canRequestPayout = profileOk &&
      num(walletSummary.total_pending_fcfa) >= PAYOUT_REQUEST_THRESHOLD_FCFA;

    container.innerHTML =
      '<div class="dos-card dos-payment-support-card">' +
      '<h3><i class="fa-solid fa-headset"></i> Payment support</h3>' +
      '<p style="font-size:13px;color:#71717a">Question about a missing or incorrect payout? Submit an inquiry — finance will respond on this dashboard.</p>' +
      (canRequestPayout
        ? '<p style="font-size:13px;color:#16a34a;margin:0 0 12px"><i class="fa-solid fa-circle-check"></i> ' +
          'Your pending balance qualifies for payout review (' + fmtFcfa(walletSummary.total_pending_fcfa) + ').</p>'
        : '') +
      '<div class="dos-form-grid" style="display:grid;gap:10px;max-width:520px">' +
      '<label>Type<select id="psiType">' +
      '<option value="missing_payment">Missing payment</option>' +
      '<option value="wrong_amount">Wrong amount</option>' +
      '<option value="delayed_payout">Delayed payout</option>' +
      '<option value="profile_issue">Payout profile issue</option>' +
      '<option value="payout_request"' + (canRequestPayout ? '' : ' disabled') + '>Request payout review</option>' +
      '<option value="other">Other</option>' +
      '</select></label>' +
      '<label>Related item<select id="psiRelated">' + buildRelatedOptions(stats, payeeCode) + '</select></label>' +
      '<label>Amount expected (FCFA, optional)<input type="number" id="psiAmount" min="0" step="1" placeholder="e.g. 15000"></label>' +
      '<label>Describe the issue<textarea id="psiNotes" rows="4" placeholder="Include recruit code, payment date, or reference if known…" style="width:100%;resize:vertical"></textarea></label>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      '<button type="button" class="dos-btn dos-btn-primary" id="psiSubmitBtn">' +
      '<i class="fa-solid fa-paper-plane"></i> Submit inquiry</button>' +
      (canRequestPayout
        ? '<button type="button" class="dos-btn" id="psiRequestPayoutBtn">' +
          '<i class="fa-solid fa-hand-holding-dollar"></i> Request payout review</button>'
        : '') +
      '</div>' +
      '<p id="psiSubmitMsg" style="font-size:13px;margin-top:8px"></p>' +
      '<h4 style="font-size:14px;margin:24px 0 8px"><i class="fa-solid fa-inbox"></i> My inquiries</h4>' +
      '<div id="dosMyInquiries"><p style="font-size:13px;color:#71717a">Loading…</p></div>' +
      '</div>';

    var submitBtn = document.getElementById('psiSubmitBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        submitInquiry(payeeCode, null);
      });
    }
    var reqBtn = document.getElementById('psiRequestPayoutBtn');
    if (reqBtn) {
      reqBtn.addEventListener('click', function () {
        var typeEl = document.getElementById('psiType');
        if (typeEl) typeEl.value = 'payout_request';
        var notesEl = document.getElementById('psiNotes');
        if (notesEl && !notesEl.value.trim()) {
          notesEl.value = 'Please review my pending balance for payout. Profile is complete.';
        }
        submitInquiry(payeeCode, 'payout_request');
      });
    }

    loadMyInquiries(payeeCode);
  }

  async function submitInquiry(payeeCode, forceType) {
    var msg = document.getElementById('psiSubmitMsg');
    var btn = document.getElementById('psiSubmitBtn');
    if (typeof firebase === 'undefined' || !firebase.functions) {
      if (msg) msg.textContent = 'Firebase Functions not available.';
      return;
    }
    var typeEl = document.getElementById('psiType');
    var notesEl = document.getElementById('psiNotes');
    var relatedEl = document.getElementById('psiRelated');
    var amountEl = document.getElementById('psiAmount');
    var payload = {
      payee_code: payeeCode,
      inquiry_type: forceType || (typeEl && typeEl.value) || 'other',
      related_ref: relatedEl && relatedEl.value ? relatedEl.value : null,
      amount_expected_fcfa: amountEl && amountEl.value ? Number(amountEl.value) : null,
      notes: notesEl ? notesEl.value.trim() : ''
    };
    if (btn) btn.disabled = true;
    if (msg) msg.textContent = 'Sending…';
    try {
      var fn = firebase.functions().httpsCallable('submitPaymentInquiry');
      var res = await fn(payload);
      if (msg) {
        msg.style.color = '#16a34a';
        msg.textContent = 'Inquiry submitted. Reference: ' + (res.data && res.data.inquiry_id || 'OK');
      }
      if (notesEl) notesEl.value = '';
      loadMyInquiries(payeeCode);
    } catch (e) {
      if (msg) {
        msg.style.color = '#e11d48';
        msg.textContent = e.message || 'Submit failed';
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function loadMyInquiries(payeeCode) {
    var el = document.getElementById('dosMyInquiries');
    if (!el || !payeeCode) return;
    var firestore = db();
    if (!firestore) {
      el.innerHTML = '<p style="font-size:13px;color:#71717a">Firestore unavailable.</p>';
      return;
    }
    try {
      var snap = await firestore.collection('payment_inquiries')
        .where('payee_code', '==', payeeCode)
        .orderBy('created_at', 'desc')
        .limit(15)
        .get();
      if (snap.empty) {
        el.innerHTML = '<p style="font-size:13px;color:#71717a">No inquiries yet.</p>';
        return;
      }
      var rows = '';
      snap.forEach(function (doc) {
        var d = doc.data();
        rows += '<tr>' +
          '<td>' + fmtDate(d.created_at) + '</td>' +
          '<td>' + esc(d.inquiry_label || d.inquiry_type) + '</td>' +
          '<td>' + statusBadge(d.status) + '</td>' +
          '<td style="max-width:220px;font-size:12px">' + esc((d.notes || '').slice(0, 120)) +
          ((d.notes || '').length > 120 ? '…' : '') + '</td>' +
          '<td style="font-size:12px;color:#52525b">' + esc(d.admin_note || '—') + '</td>' +
          '</tr>';
      });
      el.innerHTML =
        '<div class="dos-table-wrap"><table class="dos-table">' +
        '<thead><tr><th>Date</th><th>Type</th><th>Status</th><th>Your note</th><th>Admin response</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    } catch (e) {
      el.innerHTML = '<p style="font-size:13px;color:#71717a">Could not load inquiries.</p>';
      console.warn('[DOSPaymentSupport] inquiries', e);
    }
  }

  /**
   * Called after wallet card renders — injects ledger sections and payment support.
   */
  function onWalletRendered(stats, payeeCode, collection, walletSummary) {
    lastContext = { stats: stats, payeeCode: payeeCode, collection: collection };
    var walletCard = document.querySelector('.dos-wallet-card');
    if (!walletCard) return;

    var ledgerHost = document.getElementById('dosWalletLedgerHost');
    if (!ledgerHost) {
      ledgerHost = document.createElement('div');
      ledgerHost.id = 'dosWalletLedgerHost';
      var profileForm = document.getElementById('dosPayoutProfileForm');
      if (profileForm) {
        walletCard.insertBefore(ledgerHost, profileForm);
      } else {
        walletCard.appendChild(ledgerHost);
      }
    }

    ledgerHost.innerHTML = renderRecruitmentLedger(stats && stats.recruitment_history) +
      renderPayoutHistoryPlaceholder();

    loadPayoutHistory(payeeCode);

    var walletBody = document.getElementById('dosWalletBody');
    ensureSupportContainer(walletBody);
    renderPaymentSupportCard(stats, payeeCode, walletSummary || {});
  }

  global.DOSPaymentSupport = {
    onWalletRendered: onWalletRendered,
    PAYOUT_REQUEST_THRESHOLD_FCFA: PAYOUT_REQUEST_THRESHOLD_FCFA
  };
})(typeof window !== 'undefined' ? window : global);
