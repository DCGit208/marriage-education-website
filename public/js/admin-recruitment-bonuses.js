/**
 * Admin — Recruitment Bonuses panel (Payments tab).
 * Payee phones, totals owed per payee, printable/saveable statements.
 */
(function () {
  'use strict';

  var payeeContactCache = Object.create(null);
  var lastRows = [];
  var lastPayeeGroups = [];
  var activeStatementCode = null;

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
      momo || data.phoneE164 || data.phone || data.mobile || data.customer_phone || ''
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

  function buildPayeeGroups(rows) {
    var map = Object.create(null);
    rows.forEach(function (r) {
      var code = r.recruiterCode;
      if (!map[code]) {
        map[code] = {
          code: code,
          name: r.recruiterName,
          phone: r.phone || '',
          email: r.email || '',
          contact: r.contact,
          total: 0,
          items: []
        };
      }
      map[code].total += Number(r.amount) || 0;
      map[code].items.push(r);
      if (!map[code].phone && r.phone) map[code].phone = r.phone;
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) {
        return b.total - a.total || a.name.localeCompare(b.name);
      });
  }

  function findPayeeGroup(query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return null;
    var byCode = lastPayeeGroups.find(function (g) { return g.code.toLowerCase() === q; });
    if (byCode) return byCode;
    var matches = lastPayeeGroups.filter(function (g) {
      return g.name.toLowerCase().indexOf(q) !== -1 || g.code.toLowerCase().indexOf(q) !== -1;
    });
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      var exact = matches.find(function (g) { return g.name.toLowerCase() === q; });
      return exact || matches[0];
    }
    return null;
  }

  function roleLabelPlain(recruiterType) {
    if (recruiterType === 'direct_recruiter') return 'Direct recruiter';
    if (recruiterType === 'upline_share') return 'Upline share';
    if (recruiterType === 'regional_director') return 'Regional Director';
    if (recruiterType === 'senior') return 'Senior';
    if (recruiterType === 'rd_network_override') return 'RD override (legacy)';
    if (recruiterType === 'executive_upline') return 'Executive upline';
    return 'Ambassador';
  }

  function roleBadge(recruiterType, recruiterCode) {
    var label = roleLabelPlain(recruiterType);
    var cls = 'rb-badge-amb';
    if (recruiterType === 'direct_recruiter') cls = 'rb-badge-direct';
    else if (recruiterType === 'upline_share') cls = 'rb-badge-upline';
    else if (recruiterType === 'regional_director' || String(recruiterCode).startsWith('RD-')) cls = 'rb-badge-rd';
    else if (recruiterType === 'senior') cls = 'rb-badge-senior';
    else if (recruiterType === 'rd_network_override') cls = 'rb-badge-legacy';
    else if (recruiterType === 'executive_upline') cls = 'rb-badge-exec';
    return '<span class="rb-badge ' + cls + '">' + esc(label) + '</span>';
  }

  function phoneCellHtml(contact, payeeCode) {
    var phone = contact.momo || contact.phone;
    if (!phone) {
      return '<div class="rb-phone rb-phone-missing">' +
        '<i class="fas fa-exclamation-triangle" aria-hidden="true"></i> ' +
        '<span>No number on file</span><small>Add MoMo in payee profile</small></div>';
    }
    var tel = telHref(phone);
    var wa = whatsappHref(phone);
    return '<div class="rb-phone">' +
      '<a class="rb-phone-number" href="' + esc(tel) + '">' +
      '<i class="fas fa-mobile-alt" aria-hidden="true"></i> ' + esc(phone) + '</a>' +
      (contact.source ? '<small class="rb-phone-source">' + esc(contact.source) + '</small>' : '') +
      '<div class="rb-phone-actions">' +
      '<button type="button" class="rb-icon-btn" data-copy-phone="' + esc(phone) + '">' +
      '<i class="fas fa-copy" aria-hidden="true"></i></button>' +
      (wa ? '<a class="rb-icon-btn" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer">' +
      '<i class="fab fa-whatsapp" aria-hidden="true"></i></a>' : '') +
      '</div></div>';
  }

  function ensureOverlay() {
    if (document.getElementById('rbPayeeOverlay')) return;

    var el = document.createElement('div');
    el.id = 'rbPayeeOverlay';
    el.className = 'rb-overlay';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'rbOverlayTitle');
    el.innerHTML =
      '<div class="rb-overlay-dialog">' +
        '<div class="rb-overlay-header">' +
          '<div><h3 id="rbOverlayTitle">Payee statement</h3><p class="rb-overlay-sub" id="rbOverlaySub"></p></div>' +
          '<button type="button" class="rb-overlay-close" id="rbOverlayClose" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="rb-overlay-actions">' +
          '<button type="button" class="btn btn-success btn-sm" id="rbOverlayMarkAllPaid"><i class="fas fa-check-double"></i> Mark all for payee paid</button>' +
          '<button type="button" class="btn btn-primary btn-sm" id="rbOverlayPrint"><i class="fas fa-print"></i> Print</button>' +
          '<button type="button" class="btn btn-secondary btn-sm" id="rbOverlayCsv"><i class="fas fa-file-csv"></i> Save CSV</button>' +
          '<button type="button" class="btn btn-secondary btn-sm" id="rbOverlayCopyTotal"><i class="fas fa-copy"></i> Copy total</button>' +
        '</div>' +
        '<div class="rb-overlay-body" id="rbOverlayBody"></div>' +
      '</div>';
    document.body.appendChild(el);

    var printRoot = document.createElement('div');
    printRoot.id = 'rbPrintRoot';
    printRoot.hidden = true;
    document.body.appendChild(printRoot);

    el.addEventListener('click', function (e) {
      if (e.target === el) closeOverlay();
    });
    document.getElementById('rbOverlayClose').addEventListener('click', closeOverlay);
    document.getElementById('rbOverlayMarkAllPaid').addEventListener('click', markAllForActivePayee);
    document.getElementById('rbOverlayPrint').addEventListener('click', printActiveStatement);
    document.getElementById('rbOverlayCsv').addEventListener('click', downloadActiveStatementCsv);
    document.getElementById('rbOverlayCopyTotal').addEventListener('click', copyActiveTotal);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.hidden) closeOverlay();
    });
  }

  function statementHtmlForGroup(group, title) {
    var rows = group.items.map(function (r) {
      return '<tr><td>' + esc(r.ambassadorCode) + '</td><td>' + esc(r.ambassadorName) + '</td>' +
        '<td>' + esc(roleLabelPlain(r.recruiterType)) + '</td><td>' + fcfa(r.amount) + '</td>' +
        '<td>' + esc(r.dateLabel) + '</td></tr>';
    }).join('');

    return '<div class="rb-statement-doc">' +
      '<p style="margin:0 0 0.5rem;color:#64748b;font-size:0.85rem">' + esc(title) + ' · ' + new Date().toLocaleString() + '</p>' +
      '<dl class="rb-statement-meta">' +
        '<div><dt>Payee</dt><dd>' + esc(group.name) + '</dd></div>' +
        '<div><dt>Code</dt><dd>' + esc(group.code) + '</dd></div>' +
        '<div><dt>MoMo / phone</dt><dd>' + esc(group.phone || '—') + '</dd></div>' +
        '<div><dt>Line items</dt><dd>' + group.items.length + '</dd></div>' +
      '</dl>' +
      '<div class="rb-statement-total">' +
        '<span class="rb-statement-total-label">Total owed to ' + esc(group.name) + '</span>' +
        '<span class="rb-statement-total-amt">' + fcfa(group.total) + '</span>' +
      '</div>' +
      '<table class="rb-statement-table"><thead><tr>' +
        '<th>Recruit code</th><th>Recruit name</th><th>Role</th><th>Amount</th><th>Date</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function allPayeesHtml(groups) {
    var rows = groups.map(function (g) {
      return '<tr data-payee-code="' + esc(g.code) + '">' +
        '<td><strong>' + esc(g.name) + '</strong></td>' +
        '<td>' + esc(g.code) + '</td>' +
        '<td>' + esc(g.phone || '—') + '</td>' +
        '<td>' + g.items.length + '</td>' +
        '<td><strong style="color:#059669">' + fcfa(g.total) + '</strong></td>' +
        '<td><button type="button" class="btn btn-primary btn-sm rb-open-payee" data-code="' + esc(g.code) + '">Statement</button></td>' +
      '</tr>';
    }).join('');
    var grand = groups.reduce(function (s, g) { return s + g.total; }, 0);

    return '<div class="rb-all-payees-table">' +
      '<div class="rb-statement-total" style="margin-bottom:1.25rem">' +
        '<span class="rb-statement-total-label">Grand total — all payees</span>' +
        '<span class="rb-statement-total-amt">' + fcfa(grand) + '</span></div>' +
      '<table class="rb-statement-table"><thead><tr>' +
        '<th>Payee name</th><th>Code</th><th>Phone</th><th>Items</th><th>Total owed</th><th></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function openPayeeStatement(code) {
    ensureOverlay();
    var group = lastPayeeGroups.find(function (g) { return g.code === normCode(code); });
    if (!group) return;

    activeStatementCode = group.code;
    var overlay = document.getElementById('rbPayeeOverlay');
    document.getElementById('rbOverlayTitle').textContent = 'Owed to ' + group.name;
    document.getElementById('rbOverlaySub').textContent = group.code + ' · ' + group.items.length + ' pending bonus(es)';
    document.getElementById('rbOverlayBody').innerHTML = statementHtmlForGroup(group, 'Recruitment bonus statement');
    overlay.hidden = false;
    document.getElementById('rbOverlayClose').focus();
  }

  function openAllPayeesOverlay() {
    ensureOverlay();
    activeStatementCode = '__ALL__';
    var overlay = document.getElementById('rbPayeeOverlay');
    document.getElementById('rbOverlayTitle').textContent = 'All payee totals';
    document.getElementById('rbOverlaySub').textContent = lastPayeeGroups.length + ' payee(s) with pending recruitment bonuses';
    document.getElementById('rbOverlayBody').innerHTML = allPayeesHtml(lastPayeeGroups);
    overlay.hidden = false;

    document.querySelectorAll('.rb-open-payee').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openPayeeStatement(btn.getAttribute('data-code'));
      });
    });
    document.querySelectorAll('.rb-all-payees-table tbody tr[data-payee-code]').forEach(function (tr) {
      tr.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        openPayeeStatement(tr.getAttribute('data-payee-code'));
      });
    });
  }

  function closeOverlay() {
    var overlay = document.getElementById('rbPayeeOverlay');
    if (overlay) overlay.hidden = true;
    activeStatementCode = null;
  }

  function getActiveGroup() {
    if (!activeStatementCode || activeStatementCode === '__ALL__') return null;
    return lastPayeeGroups.find(function (g) { return g.code === activeStatementCode; });
  }

  function printActiveStatement() {
    var printRoot = document.getElementById('rbPrintRoot');
    var body = document.getElementById('rbOverlayBody');
    if (!printRoot || !body) return;

    var title = document.getElementById('rbOverlayTitle').textContent;
    printRoot.innerHTML = '<h1 style="font-family:sans-serif;margin:0 0 1rem">' + esc(title) + '</h1>' + body.innerHTML;
    printRoot.hidden = false;
    document.body.classList.add('rb-printing');
    window.print();
    setTimeout(function () {
      document.body.classList.remove('rb-printing');
      printRoot.hidden = true;
    }, 500);
  }

  function csvEscape(v) {
    return '"' + String(v || '').replace(/"/g, '""') + '"';
  }

  function downloadCsv(filename, content) {
    var blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadActiveStatementCsv() {
    if (activeStatementCode === '__ALL__') {
      var csv = 'Payee Name,Code,Phone,Line Items,Total FCFA\n';
      lastPayeeGroups.forEach(function (g) {
        csv += [g.name, g.code, g.phone, g.items.length, g.total].map(csvEscape).join(',') + '\n';
      });
      downloadCsv('recruitment-bonus-payee-totals-' + new Date().toISOString().slice(0, 10) + '.csv', csv);
      return;
    }
    var group = getActiveGroup();
    if (!group) return;
    var csv = 'Payee,' + csvEscape(group.name) + '\nCode,' + csvEscape(group.code) + '\nPhone,' + csvEscape(group.phone) + '\nTotal FCFA,' + group.total + '\n\n';
    csv += 'Recruit Code,Recruit Name,Role,Amount FCFA,Date\n';
    group.items.forEach(function (r) {
      csv += [r.ambassadorCode, r.ambassadorName, roleLabelPlain(r.recruiterType), r.amount, r.dateLabel].map(csvEscape).join(',') + '\n';
    });
    downloadCsv('recruitment-statement-' + group.code + '.csv', csv);
  }

  function copyActiveTotal() {
    var group = getActiveGroup();
    var text;
    if (activeStatementCode === '__ALL__') {
      var grand = lastPayeeGroups.reduce(function (s, g) { return s + g.total; }, 0);
      text = 'All payees total: ' + fcfa(grand);
    } else if (group) {
      text = group.name + ' (' + group.code + '): ' + fcfa(group.total);
    } else return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        if (typeof showAlert === 'function') showAlert('Copied: ' + text, 'success');
      });
    }
  }

  function renderPayeeTotalsStrip(groups) {
    var strip = document.getElementById('rbPayeeTotalsStrip');
    var datalist = document.getElementById('rbPayeeLookupList');
    if (!strip) return;

    if (!groups.length) {
      strip.hidden = true;
      strip.innerHTML = '';
      if (datalist) datalist.innerHTML = '';
      return;
    }

    strip.hidden = false;
    strip.innerHTML = '<h3>Owed by payee — tap for statement</h3><div class="rb-payee-chips">' +
      groups.map(function (g) {
        return '<button type="button" class="rb-payee-chip" data-code="' + esc(g.code) + '" title="View statement for ' + esc(g.name) + '">' +
          '<span class="rb-payee-chip-name">' + esc(g.name) + '</span>' +
          '<span class="rb-payee-chip-amt">' + fcfa(g.total) + '</span>' +
          '<span class="rb-meta">(' + g.items.length + ')</span></button>';
      }).join('') + '</div>';

    strip.querySelectorAll('.rb-payee-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openPayeeStatement(btn.getAttribute('data-code'));
      });
    });

    if (datalist) {
      datalist.innerHTML = groups.map(function (g) {
        return '<option value="' + esc(g.name) + '">' + esc(g.code) + ' — ' + fcfa(g.total) + '</option>';
      }).join('');
    }
  }

  function updateSummary(rows, groups) {
    var countEl = document.getElementById('rbPendingCount');
    var totalEl = document.getElementById('rbPendingTotal');
    var payeeEl = document.getElementById('rbPayeeCount');
    var statusEl = document.getElementById('rbPanelStatus');
    var count = rows.length;
    var total = rows.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
    if (countEl) countEl.textContent = count.toLocaleString();
    if (totalEl) totalEl.textContent = fcfa(total);
    if (payeeEl) payeeEl.textContent = groups.length.toLocaleString();
    if (statusEl) {
      statusEl.textContent = count
        ? count + ' payment(s) · ' + groups.length + ' payee(s) · ' + fcfa(total) + ' total owed'
        : 'All recruitment bonuses paid — nothing pending';
    }
    var legacyBonusEl = document.getElementById('legacyRDBonusCount');
    if (legacyBonusEl) legacyBonusEl.textContent = count.toLocaleString();
  }

  function bindCopyPhoneHandlers(root) {
    (root || document).querySelectorAll('[data-copy-phone]').forEach(function (btn) {
      if (btn.dataset.copyBound) return;
      btn.dataset.copyBound = '1';
      btn.addEventListener('click', function () {
        var num = btn.getAttribute('data-copy-phone') || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(num).then(function () {
            if (typeof showAlert === 'function') showAlert('Copied ' + num, 'success');
          });
        }
      });
    });
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
      var policyTag = r.policyVersion ? '<br><small class="rb-meta">' + esc(r.policyVersion) + '</small>' : '';

      return '<tr data-rb-id="' + esc(r.id) + '">' +
        '<td><strong class="rb-code">' + esc(r.recruiterCode) + '</strong></td>' +
        '<td><button type="button" class="rb-payee-name-btn" data-code="' + esc(r.recruiterCode) + '" title="View total owed to ' + esc(r.recruiterName) + '">' +
        esc(r.recruiterName) + '</button></td>' +
        '<td>' + roleBadge(r.recruiterType, r.recruiterCode) + '</td>' +
        '<td class="rb-phone-col">' + phoneCellHtml(r.contact, r.recruiterCode) + '</td>' +
        '<td><span class="rb-badge rb-badge-recruit">' + esc(r.ambassadorCode) + '</span>' + viaTeam + policyTag + '</td>' +
        '<td>' + esc(r.ambassadorName) + '</td>' +
        '<td><strong class="rb-amount">' + fcfa(r.amount) + '</strong></td>' +
        '<td><time class="rb-date" datetime="' + esc(r.isoDate) + '">' + esc(r.dateLabel) + '</time></td>' +
        '<td><button type="button" class="btn btn-success btn-sm rb-pay-btn" ' +
        'data-notification-id="' + esc(r.id) + '" data-rd-code="' + esc(r.recruiterCode) + '" data-amount="' + esc(String(r.amount)) + '">' +
        '<i class="fas fa-check" aria-hidden="true"></i> Mark paid</button></td></tr>';
    }).join('');

    tbody.querySelectorAll('.rb-pay-btn').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var success = await markRDPaymentPaid(
          btn.getAttribute('data-notification-id'),
          btn.getAttribute('data-rd-code'),
          Number(btn.getAttribute('data-amount') || 0)
        );
        if (success) {
          if (typeof showAlert === 'function') showAlert('Payment marked as paid', 'success');
          closeOverlay();
          await loadRDPaymentsTable();
          if (typeof loadPaymentParitySummary === 'function') loadPaymentParitySummary();
        }
      });
    });
    tbody.querySelectorAll('.rb-payee-name-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openPayeeStatement(btn.getAttribute('data-code'));
      });
    });
    bindCopyPhoneHandlers(tbody);
  }

  async function loadRDPaymentsTable() {
    var tbody = document.getElementById('rdPaymentsTableBody');
    if (!tbody) return;

    var panel = document.getElementById('recruitmentBonusPanel');
    if (panel) panel.setAttribute('aria-busy', 'true');
    tbody.innerHTML = '<tr><td colspan="9" class="loading"><div class="spinner"></div><p>Loading…</p></td></tr>';

    try {
      var snapshot = await firebase.firestore().collection('admin_notifications')
        .where('type', '==', 'rd_recruitment_bonus')
        .where('status', '==', 'pending')
        .orderBy('created_at', 'desc')
        .get();

      if (snapshot.empty) {
        lastRows = [];
        lastPayeeGroups = [];
        updateSummary(lastRows, lastPayeeGroups);
        renderPayeeTotalsStrip(lastPayeeGroups);
        tbody.innerHTML = '<tr><td colspan="9" class="rb-empty rb-empty-success">No pending recruitment bonus payments</td></tr>';
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

      lastPayeeGroups = buildPayeeGroups(lastRows);
      updateSummary(lastRows, lastPayeeGroups);
      renderPayeeTotalsStrip(lastPayeeGroups);
      renderTable(lastRows);
    } catch (error) {
      console.error('[RecruitmentBonuses] load error:', error);
      tbody.innerHTML = '<tr><td colspan="9" class="rb-empty rb-empty-error">Error loading recruitment bonuses.</td></tr>';
    } finally {
      if (panel) panel.setAttribute('aria-busy', 'false');
    }
  }

  async function markRDPaymentPaid(notificationId, rdCode, amount, skipConfirm) {
    if (!skipConfirm && !confirm('Mark ' + fcfa(amount) + ' payment to ' + rdCode + ' as PAID?')) return false;
    try {
      var result = await firebase.functions().httpsCallable('markRDPaymentPaid')({
        notification_id: notificationId,
        rd_code: rdCode,
        amount: amount
      });
      if (result.data && result.data.success) {
        delete payeeContactCache[normCode(rdCode)];
        return true;
      }
      if (typeof showAlert === 'function') showAlert('Failed to mark payment as paid', 'error');
      return false;
    } catch (error) {
      if (typeof showAlert === 'function') showAlert('Error: ' + error.message, 'error');
      return false;
    }
  }

  async function markAllForActivePayee() {
    var group = getActiveGroup();
    if (!group || !group.items.length) {
      if (typeof showAlert === 'function') showAlert('Open a payee statement first', 'warning');
      return;
    }
    var lines = group.items.map(function (r) {
      return '• ' + r.ambassadorCode + ' — ' + fcfa(r.amount);
    }).join('\n');
    if (!confirm(
      'Mark ALL ' + group.items.length + ' recruitment bonus(es) as PAID for ' + group.name +
      ' (' + group.code + ')?\n\nTotal: ' + fcfa(group.total) + '\n\n' + lines +
      '\n\nOnly continue after MoMo is sent.'
    )) return;

    var ok = 0;
    var fail = 0;
    for (var i = 0; i < group.items.length; i++) {
      var r = group.items[i];
      var success = await markRDPaymentPaid(r.id, r.recruiterCode, r.amount, true);
      if (success) ok++; else fail++;
    }
    closeOverlay();
    await loadRDPaymentsTable();
    if (typeof loadPaymentParitySummary === 'function') loadPaymentParitySummary();
    if (typeof showAlert === 'function') {
      showAlert('Payee batch: ' + ok + ' marked paid' + (fail ? ', ' + fail + ' failed' : ''), fail ? 'warning' : 'success');
    }
  }

  async function markAllPendingRecruitmentBonuses() {
    if (!lastRows.length) {
      if (typeof showAlert === 'function') showAlert('No pending recruitment bonuses', 'warning');
      return;
    }
    var total = lastRows.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
    if (!confirm(
      'Mark ALL ' + lastRows.length + ' pending recruitment bonus line(s) as PAID?\n\n' +
      lastPayeeGroups.length + ' payee(s) · Grand total: ' + fcfa(total) +
      '\n\nOnly continue after all MoMo transfers are complete.'
    )) return;

    var ok = 0;
    var fail = 0;
    var rows = lastRows.slice();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var success = await markRDPaymentPaid(r.id, r.recruiterCode, r.amount, true);
      if (success) ok++; else fail++;
    }
    await loadRDPaymentsTable();
    if (typeof loadPaymentParitySummary === 'function') loadPaymentParitySummary();
    if (typeof showAlert === 'function') {
      showAlert('All pending: ' + ok + ' marked paid' + (fail ? ', ' + fail + ' failed' : ''), fail ? 'warning' : 'success');
    }
  }

  function copyAllPhones() {
    var nums = lastPayeeGroups.map(function (g) { return g.phone; }).filter(Boolean);
    var unique = nums.filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (!unique.length && typeof showAlert === 'function') showAlert('No phone numbers on file', 'warning');
    else if (navigator.clipboard) {
      navigator.clipboard.writeText(unique.join('\n')).then(function () {
        if (typeof showAlert === 'function') showAlert('Copied ' + unique.length + ' number(s)', 'success');
      });
    }
  }

  function onPayeeLookup() {
    var input = document.getElementById('rbPayeeLookup');
    if (!input) return;
    var group = findPayeeGroup(input.value);
    if (group) openPayeeStatement(group.code);
    else if (input.value.trim() && typeof showAlert === 'function') {
      showAlert('No payee match for “' + input.value.trim() + '”', 'warning');
    }
  }

  function bindPanelControls() {
    ensureOverlay();
    var search = document.getElementById('rbSearchInput');
    if (search && !search.dataset.bound) {
      search.dataset.bound = '1';
      search.addEventListener('input', function () { renderTable(lastRows); });
    }
    var lookup = document.getElementById('rbPayeeLookup');
    if (lookup && !lookup.dataset.bound) {
      lookup.dataset.bound = '1';
      lookup.addEventListener('change', onPayeeLookup);
      lookup.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); onPayeeLookup(); }
      });
    }
    var totalsBtn = document.getElementById('rbPayeeTotalsBtn');
    if (totalsBtn && !totalsBtn.dataset.bound) {
      totalsBtn.dataset.bound = '1';
      totalsBtn.addEventListener('click', openAllPayeesOverlay);
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
    var markAll = document.getElementById('rbMarkAllPendingBtn');
    if (markAll && !markAll.dataset.bound) {
      markAll.dataset.bound = '1';
      markAll.addEventListener('click', markAllPendingRecruitmentBonuses);
    }
  }

  window.loadRDPaymentsTable = loadRDPaymentsTable;
  window.markRDPaymentPaid = markRDPaymentPaid;

  document.addEventListener('DOMContentLoaded', bindPanelControls);
  bindPanelControls();

  window.AdminRecruitmentBonuses = {
    load: loadRDPaymentsTable,
    markPaid: markRDPaymentPaid,
    openPayeeStatement: openPayeeStatement,
    openAllPayees: openAllPayeesOverlay
  };
})();
