/**
 * Admin — Recruitment Bonuses panel (Payments tab).
 * Shows payee MoMo/phone numbers, summary stats, search, and mark-paid actions.
 */
(function () {
  'use strict';

  var payeeContactCache = Object.create(null);
  var lastRows = [];

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function normCode(raw) {
    return String(raw || '').trim().toUpperCase();
  }

  function fcfa(n) {
    return (Number(n) || 0).toLocaleString() + ' FCFA';
  }

  function digitsOnly(phone) {
    return String(phone || '').replace(/[^\d+]/g, '');
  }

  function formatPhoneDisplay(phone) {
    var d = digitsOnly(phone);
    if (!d) return '';
    if (d.startsWith('+')) return d;
    if (d.startsWith('237') && d.length >= 12) return '+' + d;
    if (d.length === 9) return '+237' + d;
    return d;
  }

  function telHref(phone) {
    var d = digitsOnly(phone).replace(/^\+/, '');
    return d ? 'tel:+' + d.replace(/^237237/, '237') : '';
  }

  function whatsappHref(phone) {
    var d = digitsOnly(phone).replace(/^\+/, '');
    if (!d) return '';
    if (!d.startsWith('237') && d.length === 9) d = '237' + d;
    return 'https://wa.me/' + d;
  }

  function resolvePhoneFromData(data) {
    if (!data) return { phone: '', momo: '', source: '' };
    var profile = data.payout_profile || {};
    var momo = String(profile.momo_number || '').trim();
    var phone = String(
      momo ||
      data.phoneE164 ||
      data.phone ||
      data.mobile ||
      data.customer_phone ||
      ''
    ).trim();
    var source = momo ? 'MoMo profile' : (data.phoneE164 ? 'E.164' : (data.phone ? 'Registration' : ''));
    return { phone: formatPhoneDisplay(phone), momo: formatPhoneDisplay(momo || phone), source: source };
  }

  async function fetchPayeeContact(code) {
    var c = normCode(code);
    if (!c || c === 'N/A') return { phone: '', momo: '', source: '', email: '' };
    if (payeeContactCache[c]) return payeeContactCache[c];

    var db = firebase.firestore();
    var collection = c.startsWith('RD-') ? 'regional_directors' : 'ambassadors';
    var docId = c;
    if (c.startsWith('SNR-')) docId = c.replace(/^SNR-/, 'AMB-');

    try {
      var snap = await db.collection(collection).doc(docId).get();
      if (!snap.exists && collection === 'ambassadors') {
        var q = await db.collection('ambassadors').where('code', '==', c).limit(1).get();
        if (!q.empty) snap = q.docs[0];
      }
      if (!snap.exists) {
        payeeContactCache[c] = { phone: '', momo: '', source: '', email: '' };
        return payeeContactCache[c];
      }
      var data = snap.data();
      var contact = resolvePhoneFromData(data);
      contact.email = data ? (data.email || '') : '';
      payeeContactCache[c] = contact;
      return contact;
    } catch (e) {
      console.warn('[RecruitmentBonuses] contact lookup failed:', c, e);
      return { phone: '', momo: '', source: '', email: '' };
    }
  }

  function roleBadge(recruiterType, recruiterCode) {
    if (recruiterType === 'executive_upline') {
      return '<span class="rb-badge rb-badge-exec">Executive upline</span>';
    }
    if (recruiterType === 'upline_share') {
      return '<span class="rb-badge rb-badge-upline">Upline share</span>';
    }
    if (recruiterType === 'direct_recruiter') {
      return '<span class="rb-badge rb-badge-direct">Direct · 1,500</span>';
    }
    if (recruiterType === 'rd_network_override') {
      return '<span class="rb-badge rb-badge-legacy">RD override (legacy)</span>';
    }
    if (recruiterType === 'regional_director' || String(recruiterCode).startsWith('RD-')) {
      return '<span class="rb-badge rb-badge-rd">Regional Director</span>';
    }
    if (recruiterType === 'senior') {
      return '<span class="rb-badge rb-badge-senior">Senior</span>';
    }
    return '<span class="rb-badge rb-badge-amb">Ambassador</span>';
  }

  function phoneCellHtml(contact, payeeCode) {
    var phone = contact.momo || contact.phone;
    if (!phone) {
      return '<div class="rb-phone rb-phone-missing">' +
        '<i class="fas fa-exclamation-triangle" aria-hidden="true"></i> ' +
        '<span>No number on file</span>' +
        '<small>Add MoMo in payee profile</small>' +
        '</div>';
    }
    var tel = telHref(phone);
    var wa = whatsappHref(phone);
    return '<div class="rb-phone">' +
      '<a class="rb-phone-number" href="' + esc(tel) + '" aria-label="Call ' + esc(payeeCode) + ' at ' + esc(phone) + '">' +
      '<i class="fas fa-mobile-alt" aria-hidden="true"></i> ' + esc(phone) + '</a>' +
      (contact.source ? '<small class="rb-phone-source">' + esc(contact.source) + '</small>' : '') +
      '<div class="rb-phone-actions">' +
      '<button type="button" class="rb-icon-btn" data-copy-phone="' + esc(phone) + '" title="Copy number" aria-label="Copy phone number for ' + esc(payeeCode) + '">' +
      '<i class="fas fa-copy" aria-hidden="true"></i></button>' +
      (wa ? '<a class="rb-icon-btn" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer" title="WhatsApp" aria-label="Open WhatsApp for ' + esc(payeeCode) + '">' +
      '<i class="fab fa-whatsapp" aria-hidden="true"></i></a>' : '') +
      '</div></div>';
  }

  function updateSummary(rows) {
    var countEl = document.getElementById('rbPendingCount');
    var totalEl = document.getElementById('rbPendingTotal');
    var statusEl = document.getElementById('rbPanelStatus');
    var count = rows.length;
    var total = rows.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
    if (countEl) countEl.textContent = count.toLocaleString();
    if (totalEl) totalEl.textContent = fcfa(total);
    if (statusEl) {
      statusEl.textContent = count
        ? count + ' payment' + (count !== 1 ? 's' : '') + ' awaiting MoMo send'
        : 'All recruitment bonuses paid — nothing pending';
    }
    var legacyBonusEl = document.getElementById('legacyRDBonusCount');
    if (legacyBonusEl) legacyBonusEl.textContent = count.toLocaleString();
  }

  function renderTable(rows) {
    var tbody = document.getElementById('rdPaymentsTableBody');
    if (!tbody) return;

    var query = (document.getElementById('rbSearchInput') || {}).value || '';
    var q = query.trim().toLowerCase();
    var filtered = q
      ? rows.filter(function (r) {
          return [r.recruiterCode, r.recruiterName, r.ambassadorCode, r.ambassadorName, r.phone, r.email]
            .join(' ').toLowerCase().indexOf(q) !== -1;
        })
      : rows;

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="rb-empty">' +
        (q ? 'No matches for “' + esc(query) + '”' : 'No pending recruitment bonus payments') +
        '</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(function (r) {
      var viaTeam = r.recruitingAmbassador
        ? '<br><small class="rb-meta">via ' + esc(r.recruitingAmbassador) + '</small>'
        : (r.directRecruiter && r.bonusTier === 'upline'
          ? '<br><small class="rb-meta">team: ' + esc(r.directRecruiter) + '</small>'
          : '');
      var policyTag = r.policyVersion
        ? '<br><small class="rb-meta">' + esc(r.policyVersion) + '</small>'
        : '';

      return '<tr data-rb-id="' + esc(r.id) + '">' +
        '<td><strong class="rb-code">' + esc(r.recruiterCode) + '</strong></td>' +
        '<td>' + esc(r.recruiterName) + '</td>' +
        '<td>' + roleBadge(r.recruiterType, r.recruiterCode) + '</td>' +
        '<td class="rb-phone-col">' + phoneCellHtml(r.contact, r.recruiterCode) + '</td>' +
        '<td><span class="rb-badge rb-badge-recruit">' + esc(r.ambassadorCode) + '</span>' + viaTeam + policyTag + '</td>' +
        '<td>' + esc(r.ambassadorName) + '</td>' +
        '<td><strong class="rb-amount">' + fcfa(r.amount) + '</strong></td>' +
        '<td><time class="rb-date" datetime="' + esc(r.isoDate) + '">' + esc(r.dateLabel) + '</time></td>' +
        '<td>' +
        '<button type="button" class="btn btn-success btn-sm rb-pay-btn" ' +
        'data-notification-id="' + esc(r.id) + '" ' +
        'data-rd-code="' + esc(r.recruiterCode) + '" ' +
        'data-amount="' + esc(String(r.amount)) + '" ' +
        'aria-label="Mark ' + fcfa(r.amount) + ' paid to ' + esc(r.recruiterCode) + '">' +
        '<i class="fas fa-check" aria-hidden="true"></i> Mark paid</button>' +
        '</td></tr>';
    }).join('');

    tbody.querySelectorAll('.rb-pay-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        markRDPaymentPaid(
          btn.getAttribute('data-notification-id'),
          btn.getAttribute('data-rd-code'),
          Number(btn.getAttribute('data-amount') || 0)
        );
      });
    });

    tbody.querySelectorAll('[data-copy-phone]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var num = btn.getAttribute('data-copy-phone') || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(num).then(function () {
            if (typeof showAlert === 'function') showAlert('Copied ' + num, 'success');
          });
        } else {
          window.prompt('Copy number:', num);
        }
      });
    });
  }

  async function loadRDPaymentsTable() {
    var tbody = document.getElementById('rdPaymentsTableBody');
    if (!tbody) return;

    var panel = document.getElementById('recruitmentBonusPanel');
    if (panel) panel.setAttribute('aria-busy', 'true');
    tbody.innerHTML = '<tr><td colspan="9" class="loading"><div class="spinner"></div><p>Loading recruitment bonus payments…</p></td></tr>';

    try {
      var snapshot = await firebase.firestore().collection('admin_notifications')
        .where('type', '==', 'rd_recruitment_bonus')
        .where('status', '==', 'pending')
        .orderBy('created_at', 'desc')
        .get();

      if (snapshot.empty) {
        lastRows = [];
        updateSummary(lastRows);
        tbody.innerHTML = '<tr><td colspan="9" class="rb-empty rb-empty-success">' +
          '<i class="fas fa-check-circle" aria-hidden="true"></i> No pending recruitment bonus payments</td></tr>';
        return;
      }

      var docs = [];
      snapshot.forEach(function (doc) { docs.push({ id: doc.id, data: doc.data() }); });

      var uniqueCodes = [];
      docs.forEach(function (item) {
        var code = normCode(item.data.rd_code || item.data.recruiter_code);
        if (code && uniqueCodes.indexOf(code) === -1) uniqueCodes.push(code);
      });
      await Promise.all(uniqueCodes.map(fetchPayeeContact));

      lastRows = docs.map(function (item) {
        var data = item.data;
        var recruiterCode = normCode(data.rd_code || data.recruiter_code || 'N/A');
        var created = data.created_at && data.created_at.toDate ? data.created_at.toDate() : null;
        var contact = payeeContactCache[recruiterCode] || { phone: '', momo: '', source: '', email: '' };
        return {
          id: item.id,
          recruiterCode: recruiterCode,
          recruiterName: data.rd_name || data.recruiter_name || 'Unknown',
          recruiterType: data.recruiter_type || (recruiterCode.startsWith('RD-') ? 'regional_director' : 'ambassador'),
          ambassadorCode: data.ambassador_code || 'N/A',
          ambassadorName: data.ambassador_name || 'N/A',
          amount: data.amount || 0,
          bonusTier: data.bonus_tier,
          directRecruiter: data.direct_recruiter_code,
          recruitingAmbassador: data.recruiting_ambassador_code,
          policyVersion: data.policy_version,
          dateLabel: created ? created.toLocaleString() : 'N/A',
          isoDate: created ? created.toISOString() : '',
          contact: contact,
          phone: contact.momo || contact.phone,
          email: contact.email
        };
      });

      updateSummary(lastRows);
      renderTable(lastRows);
    } catch (error) {
      console.error('[RecruitmentBonuses] load error:', error);
      tbody.innerHTML = '<tr><td colspan="9" class="rb-empty rb-empty-error">' +
        '<i class="fas fa-exclamation-circle" aria-hidden="true"></i> Error loading recruitment bonuses. Check Firestore rules/indexes.</td></tr>';
    } finally {
      if (panel) panel.setAttribute('aria-busy', 'false');
    }
  }

  async function markRDPaymentPaid(notificationId, rdCode, amount) {
    if (!confirm('Mark ' + fcfa(amount) + ' payment to ' + rdCode + ' as PAID?')) return;
    try {
      var markFn = firebase.functions().httpsCallable('markRDPaymentPaid');
      var result = await markFn({
        notification_id: notificationId,
        rd_code: rdCode,
        amount: amount
      });
      if (result.data && result.data.success) {
        if (typeof showAlert === 'function') showAlert('Payment marked as paid', 'success');
        delete payeeContactCache[normCode(rdCode)];
        await loadRDPaymentsTable();
        if (typeof loadPaymentParitySummary === 'function') loadPaymentParitySummary();
      } else if (typeof showAlert === 'function') {
        showAlert('Failed to mark payment as paid', 'error');
      }
    } catch (error) {
      console.error('[RecruitmentBonuses] mark paid error:', error);
      if (typeof showAlert === 'function') showAlert('Error: ' + error.message, 'error');
    }
  }

  function copyAllPhones() {
    var nums = lastRows
      .map(function (r) { return r.phone; })
      .filter(Boolean);
    var unique = nums.filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (!unique.length) {
      if (typeof showAlert === 'function') showAlert('No phone numbers in current list', 'warning');
      return;
    }
    var text = unique.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        if (typeof showAlert === 'function') showAlert('Copied ' + unique.length + ' number(s)', 'success');
      });
    }
  }

  function bindPanelControls() {
    var search = document.getElementById('rbSearchInput');
    if (search && !search.dataset.bound) {
      search.dataset.bound = '1';
      search.addEventListener('input', function () { renderTable(lastRows); });
    }
    var copyAll = document.getElementById('rbCopyAllPhones');
    if (copyAll && !copyAll.dataset.bound) {
      copyAll.dataset.bound = '1';
      copyAll.addEventListener('click', copyAllPhones);
    }
    var refresh = document.getElementById('rbRefreshBtn');
    if (refresh && !refresh.dataset.bound) {
      refresh.dataset.bound = '1';
      refresh.addEventListener('click', loadRDPaymentsTable);
    }
  }

  window.loadRDPaymentsTable = loadRDPaymentsTable;
  window.markRDPaymentPaid = markRDPaymentPaid;

  document.addEventListener('DOMContentLoaded', bindPanelControls);
  bindPanelControls();

  window.AdminRecruitmentBonuses = {
    load: loadRDPaymentsTable,
    markPaid: markRDPaymentPaid
  };
})();
