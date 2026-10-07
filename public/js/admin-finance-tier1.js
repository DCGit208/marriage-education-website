/**
 * Admin Finance — SBD subscription commission manual payout desk.
 * Mirrors Recruitment Bonuses: line-level pending queue, Mark paid, paid history.
 */
(function () {
  'use strict';

  var SHARE_KEYS = ['direct', 'senior', 'rd'];
  var payeeContactCache = Object.create(null);
  var subscriberCache = Object.create(null);
  var lastRows = [];
  var lastPayeeGroups = [];
  var lastPaidRows = [];
  var sbdView = 'pending';
  var paidPayeeFilter = '';

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

  function fmtWhen(ts) {
    if (!ts) return 'N/A';
    try {
      return ts.toDate ? ts.toDate().toLocaleString() : new Date(ts).toLocaleString();
    } catch (e) {
      return 'N/A';
    }
  }

  function dayKeyFromTs(ts) {
    if (!ts) return 'unknown';
    try {
      var d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toISOString().slice(0, 10);
    } catch (e) {
      return 'unknown';
    }
  }

  function filterRowsByDays(rows, days, dateField) {
    if (!days || days >= 365) return rows;
    var cutoff;
    if (days === 1) {
      var start = new Date();
      start.setHours(0, 0, 0, 0);
      cutoff = start.getTime();
    } else {
      cutoff = Date.now() - days * 86400000;
    }
    return rows.filter(function (r) {
      var ts = r[dateField];
      if (!ts) return false;
      var t = ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
      return t >= cutoff;
    });
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
    if (!c || c === 'N/A') return { phone: '', momo: '', source: '', email: '', name: '' };
    if (payeeContactCache[c]) return payeeContactCache[c];

    var db = firebase.firestore();
    var collection = c.startsWith('RD-') ? 'regional_directors' : 'ambassadors';
    var docId = c;
    if (c.startsWith('SNR-')) docId = c.replace(/^SNR-/, 'AMB-');
    if (c.startsWith('SBD-')) docId = c.replace(/^SBD-/, 'AMB-');

    try {
      var snap = await db.collection(collection).doc(docId).get();
      if (!snap.exists && collection === 'ambassadors') {
        var q = await db.collection('ambassadors').where('code', '==', c).limit(1).get();
        if (q.empty) {
          q = await db.collection('ambassadors').where('sbdReferralCode', '==', c).limit(1).get();
        }
        if (!q.empty) snap = q.docs[0];
      }
      if (!snap.exists && c.startsWith('SBD-')) {
        var rdId = c.replace(/^SBD-/, 'RD-');
        snap = await db.collection('regional_directors').doc(rdId).get();
      }
      if (!snap.exists) {
        payeeContactCache[c] = { phone: '', momo: '', source: '', email: '', name: '' };
        return payeeContactCache[c];
      }
      var data = snap.data();
      var contact = resolvePhoneFromData(data);
      contact.email = data.email || '';
      contact.name = data.name || data.fullName || '';
      payeeContactCache[c] = contact;
      return contact;
    } catch (e) {
      console.warn('[SbdCommissions] contact lookup failed:', c, e);
      return { phone: '', momo: '', source: '', email: '', name: '' };
    }
  }

  async function fetchSubscriberLabel(uid) {
    if (!uid) return '—';
    if (subscriberCache[uid]) return subscriberCache[uid];
    try {
      var snap = await firebase.firestore().collection('users').doc(uid).get();
      if (!snap.exists) {
        subscriberCache[uid] = uid.slice(0, 8) + '…';
        return subscriberCache[uid];
      }
      var d = snap.data() || {};
      var label = d.email || d.name || uid.slice(0, 8) + '…';
      subscriberCache[uid] = label;
      return label;
    } catch (e) {
      subscriberCache[uid] = uid.slice(0, 8) + '…';
      return subscriberCache[uid];
    }
  }

  function deriveShares(sale) {
    if (sale.commissionShares && typeof sale.commissionShares === 'object') {
      return sale.commissionShares;
    }
    var shares = {};
    var directPayee = sale.ambassadorCode || (!sale.ambassadorCode && sale.rdCode ? sale.rdCode : null);
    var directAmt = Number(sale.ambassadorCommission) || 0;
    if (directPayee && directAmt > 0) {
      shares.direct = {
        payeeCode: normCode(directPayee),
        amount: directAmt,
        status: sale.status === 'paid' ? 'paid' : 'pending',
        role: 'direct'
      };
    }
    var seniorAmt = Number(sale.seniorAmbassadorCommission) || 0;
    if (sale.seniorAmbassadorCode && seniorAmt > 0) {
      shares.senior = {
        payeeCode: normCode(sale.seniorAmbassadorCode),
        amount: seniorAmt,
        status: sale.status === 'paid' ? 'paid' : 'pending',
        role: 'senior'
      };
    }
    var rdAmt = Number(sale.rdCommission) || 0;
    if (sale.rdOverrideCode && rdAmt > 0) {
      shares.rd = {
        payeeCode: normCode(sale.rdOverrideCode),
        amount: rdAmt,
        status: sale.status === 'paid' ? 'paid' : 'pending',
        role: 'rd'
      };
    }
    return shares;
  }

  function productLabel(sale) {
    if (sale.productId === 'foundation-yearly' || sale.program === 'foundation_yearly_deployment') {
      return 'Foundation Access $144.17';
    }
    if (sale.productId) return String(sale.productId);
    if (sale.tier) return String(sale.tier);
    return 'SBD subscription';
  }

  function productBadge(sale) {
    var yearly = sale.productId === 'foundation-yearly' || sale.program === 'foundation_yearly_deployment';
    if (yearly) {
      return '<span style="display:inline-block;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:600;">Foundation Access $144.17</span>';
    }
    return '<span>' + esc(productLabel(sale)) + '</span>';
  }

  function roleLabel(shareKey) {
    if (shareKey === 'direct') return 'Direct 10%';
    if (shareKey === 'senior') return 'Senior 5%';
    if (shareKey === 'rd') return 'RD 5%';
    return shareKey;
  }

  function roleBadge(shareKey) {
    var cls = shareKey === 'rd' ? 'rb-badge-rd' : (shareKey === 'senior' ? 'rb-badge-senior' : 'rb-badge-amb');
    return '<span class="rb-badge ' + cls + '">' + esc(roleLabel(shareKey)) + '</span>';
  }

  function phoneCell(row) {
    if (!row.phone) return '<span style="color:#94a3b8">—</span>';
    var tel = telHref(row.phone);
    var wa = whatsappHref(row.phone);
    return '<div style="white-space:nowrap">' +
      '<strong>' + esc(row.phone) + '</strong>' +
      (tel ? ' <a href="' + tel + '" title="Call">📞</a>' : '') +
      (wa ? ' <a href="' + wa + '" target="_blank" rel="noopener" title="WhatsApp">💬</a>' : '') +
      '</div>';
  }

  function buildPayeeGroups(rows) {
    var map = Object.create(null);
    rows.forEach(function (r) {
      var code = r.payeeCode;
      if (!map[code]) {
        map[code] = {
          code: code,
          name: r.payeeName || code,
          phone: r.phone || '',
          email: r.email || '',
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

  function setStatus(msg) {
    var el = document.getElementById('sbdPanelStatus');
    if (el) el.textContent = msg;
  }

  function updateSummary(rows) {
    var countEl = document.getElementById('sbdPendingCount');
    var totalEl = document.getElementById('sbdPendingTotal');
    var payeeEl = document.getElementById('sbdPayeeCount');
    var total = rows.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
    if (countEl) countEl.textContent = String(rows.length);
    if (totalEl) totalEl.textContent = fcfa(total);
    if (payeeEl) payeeEl.textContent = String(lastPayeeGroups.length);
  }

  function updatePaidTodaySummary() {
    var el = document.getElementById('sbdPaidTodayTotal');
    if (!el) return;
    var today = new Date().toISOString().slice(0, 10);
    var sum = lastPaidRows.reduce(function (s, r) {
      return r.paidDayKey === today ? s + (Number(r.amount) || 0) : s;
    }, 0);
    el.textContent = fcfa(sum);
  }

  function populatePayeeLookup(groups) {
    var list = document.getElementById('sbdPayeeLookupList');
    if (!list) return;
    list.innerHTML = groups.map(function (g) {
      return '<option value="' + esc(g.name + ' (' + g.code + ')') + '"></option>';
    }).join('');
  }

  function renderPayeeTotalsStrip(groups) {
    var strip = document.getElementById('sbdPayeeTotalsStrip');
    if (!strip) return;
    if (!groups.length) {
      strip.hidden = true;
      strip.innerHTML = '';
      return;
    }
    strip.hidden = false;
    strip.innerHTML = groups.slice(0, 12).map(function (g) {
      return '<button type="button" class="rb-payee-chip sbd-payee-chip" data-payee="' + esc(g.code) + '">' +
        '<strong>' + esc(g.name) + '</strong> · ' + fcfa(g.total) +
        ' <small>(' + g.items.length + ')</small></button>';
    }).join('');
    strip.querySelectorAll('.sbd-payee-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        alert(
          btn.getAttribute('data-payee') + '\n' +
          groups.filter(function (g) { return g.code === btn.getAttribute('data-payee'); })
            .map(function (g) {
              return g.name + '\nPhone: ' + (g.phone || '—') + '\nOwed: ' + fcfa(g.total) +
                '\nLines: ' + g.items.length;
            })[0]
        );
      });
    });
  }

  function filteredPendingRows() {
    var q = (document.getElementById('sbdSearchInput') || {}).value || '';
    q = String(q).trim().toLowerCase();
    if (!q) return lastRows;
    return lastRows.filter(function (r) {
      return [
        r.payeeCode, r.payeeName, r.sellerCode, r.sellerName,
        r.productLabel, r.subscriberLabel, r.shareKey, r.saleId
      ].join(' ').toLowerCase().indexOf(q) !== -1;
    });
  }

  function getSelectedPendingRows() {
    var ids = [];
    document.querySelectorAll('#sbdCommissionTableBody .sbd-row-check:checked').forEach(function (cb) {
      ids.push(cb.getAttribute('data-row-id'));
    });
    return lastRows.filter(function (r) { return ids.indexOf(r.rowId) !== -1; });
  }

  function renderPendingTable() {
    var tbody = document.getElementById('sbdCommissionTableBody');
    if (!tbody) return;
    var rows = filteredPendingRows();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#64748b">No pending SBD commission lines.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      return '<tr data-row-id="' + esc(r.rowId) + '">' +
        '<td><input type="checkbox" class="sbd-row-check" data-row-id="' + esc(r.rowId) + '"></td>' +
        '<td>' + esc(r.dateLabel) + '</td>' +
        '<td>' + r.productHtml + '</td>' +
        '<td><small>' + esc(r.subscriberLabel) + '</small></td>' +
        '<td><code>' + esc(r.sellerCode) + '</code><br><small>' + esc(r.sellerName) + '</small></td>' +
        '<td><code>' + esc(r.payeeCode) + '</code><br><small>' + esc(r.payeeName) + '</small></td>' +
        '<td>' + roleBadge(r.shareKey) + '</td>' +
        '<td>' + phoneCell(r) + '</td>' +
        '<td><strong>' + fcfa(r.amount) + '</strong></td>' +
        '<td><button type="button" class="btn btn-success btn-sm sbd-mark-one" data-row-id="' + esc(r.rowId) + '">Mark paid</button></td>' +
        '</tr>';
    }).join('');

    tbody.querySelectorAll('.sbd-mark-one').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = lastRows.find(function (r) { return r.rowId === btn.getAttribute('data-row-id'); });
        if (row) markSelectedRows([row], 'Single line');
      });
    });
  }

  async function expandSaleToPendingRows(doc) {
    var sale = doc.data() || {};
    var shares = deriveShares(sale);
    var created = sale.createdAt;
    var dateLabel = fmtWhen(created);
    var sellerCode = normCode(sale.ambassadorCode || sale.sbdReferralCode || sale.rdCode || '—');
    var sellerName = sale.ambassadorName || '';
    var subscriberLabel = await fetchSubscriberLabel(sale.subscriberUid);
    var out = [];

    for (var i = 0; i < SHARE_KEYS.length; i++) {
      var key = SHARE_KEYS[i];
      var share = shares[key];
      if (!share || share.status === 'paid' || !(Number(share.amount) > 0)) continue;
      var payeeCode = normCode(share.payeeCode);
      var contact = await fetchPayeeContact(payeeCode);
      out.push({
        rowId: doc.id + ':' + key,
        saleId: doc.id,
        shareKey: key,
        amount: Number(share.amount) || 0,
        payeeCode: payeeCode,
        payeeName: contact.name || payeeCode,
        phone: contact.momo || contact.phone,
        email: contact.email,
        sellerCode: sellerCode,
        sellerName: sellerName,
        subscriberUid: sale.subscriberUid || '',
        subscriberLabel: subscriberLabel,
        productId: sale.productId || '',
        productLabel: productLabel(sale),
        productHtml: productBadge(sale),
        dateLabel: dateLabel,
        createdAt: created,
        revenueUsd: sale.revenueUsd || null
      });
    }
    return out;
  }

  async function loadSbdCommissionQueue() {
    var tbody = document.getElementById('sbdCommissionTableBody');
    var panel = document.getElementById('sbdCommissionPanel');
    if (!tbody) return;
    if (panel) panel.setAttribute('aria-busy', 'true');
    tbody.innerHTML = '<tr><td colspan="10">Loading pending SBD commissions…</td></tr>';
    setStatus('Loading…');

    try {
      var snap = await firebase.firestore().collection('sbd_sales')
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get();

      var pending = [];
      var docs = [];
      snap.forEach(function (doc) { docs.push(doc); });

      for (var i = 0; i < docs.length; i++) {
        var rows = await expandSaleToPendingRows(docs[i]);
        pending = pending.concat(rows);
      }

      lastRows = pending;
      lastPayeeGroups = buildPayeeGroups(pending);
      populatePayeeLookup(lastPayeeGroups);
      renderPayeeTotalsStrip(lastPayeeGroups);
      updateSummary(pending);
      renderPendingTable();
      setStatus(pending.length
        ? pending.length + ' pending line(s) · ' + lastPayeeGroups.length + ' payee(s)'
        : 'No pending SBD commission lines');
    } catch (e) {
      console.error('[SbdCommissions] load error:', e);
      tbody.innerHTML = '<tr><td colspan="10" style="color:#d63031">Error: ' + esc(e.message) + '</td></tr>';
      setStatus('Failed to load');
    } finally {
      if (panel) panel.setAttribute('aria-busy', 'false');
    }
  }

  async function markOneShare(row) {
    var fn = firebase.functions().httpsCallable('markSbdCommissionSharePaid');
    await fn({
      sale_id: row.saleId,
      share: row.shareKey,
      note: 'manual-momo'
    });
    return true;
  }

  async function markSelectedRows(rows, contextLabel) {
    if (!rows.length) {
      if (typeof showAlert === 'function') showAlert('Select at least one commission line', 'warning');
      else alert('Select at least one commission line');
      return;
    }
    var total = rows.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
    var payeeCodes = [];
    rows.forEach(function (r) {
      if (payeeCodes.indexOf(r.payeeCode) === -1) payeeCodes.push(r.payeeCode);
    });
    var lines = rows.slice(0, 12).map(function (r) {
      return '• ' + r.payeeCode + ' / ' + r.productLabel + ' / ' + roleLabel(r.shareKey) + ' — ' + fcfa(r.amount);
    }).join('\n');
    var more = rows.length > 12 ? '\n… and ' + (rows.length - 12) + ' more' : '';
    if (!confirm(
      'Mark ' + rows.length + ' SBD commission line(s) as PAID?\n\n' +
      (contextLabel ? contextLabel + '\n\n' : '') +
      payeeCodes.length + ' payee(s) · Total: ' + fcfa(total) + '\n\n' + lines + more +
      '\n\nOnly continue after MoMo is sent.'
    )) return;

    var ok = 0;
    var fail = 0;
    var errors = [];
    for (var i = 0; i < rows.length; i++) {
      try {
        await markOneShare(rows[i]);
        ok++;
      } catch (e) {
        fail++;
        errors.push(rows[i].rowId + ': ' + (e.message || e));
      }
    }
    await loadSbdCommissionQueue();
    if (sbdView === 'paid') await loadPaidHistory();
    var msg = ok + ' marked paid' + (fail ? ', ' + fail + ' failed' : '');
    if (fail && errors.length) msg += '\n' + errors.slice(0, 3).join('\n');
    if (typeof showAlert === 'function') showAlert(msg, fail ? 'warning' : 'success');
    else alert(msg);
  }

  function markSelectedPending() {
    markSelectedRows(getSelectedPendingRows(), 'From pending queue');
  }

  function markAllPending() {
    if (!lastRows.length) {
      if (typeof showAlert === 'function') showAlert('No pending SBD commissions', 'warning');
      else alert('No pending SBD commissions');
      return;
    }
    markSelectedRows(lastRows.slice(), 'Entire pending queue');
  }

  function copyAllPhones() {
    var nums = lastPayeeGroups.map(function (g) { return g.phone; }).filter(Boolean);
    var unique = nums.filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (!unique.length) {
      if (typeof showAlert === 'function') showAlert('No phone numbers on file', 'warning');
      else alert('No phone numbers on file');
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(unique.join('\n')).then(function () {
        if (typeof showAlert === 'function') showAlert('Copied ' + unique.length + ' number(s)', 'success');
      });
    }
  }

  function onPayeeLookup() {
    var input = document.getElementById('sbdPayeeLookup');
    if (!input) return;
    var q = String(input.value || '').trim().toLowerCase();
    if (!q) return;
    var group = lastPayeeGroups.find(function (g) {
      return g.code.toLowerCase() === q ||
        (g.name + ' (' + g.code + ')').toLowerCase() === q ||
        g.name.toLowerCase().indexOf(q) !== -1;
    });
    if (!group) {
      if (typeof showAlert === 'function') showAlert('No payee match', 'warning');
      return;
    }
    alert(group.name + ' (' + group.code + ')\nPhone: ' + (group.phone || '—') + '\nOwed: ' + fcfa(group.total) + '\nLines: ' + group.items.length);
  }

  function openAllPayeesOverlay() {
    if (!lastPayeeGroups.length) {
      alert('No payees with pending SBD commissions.');
      return;
    }
    var text = lastPayeeGroups.map(function (g) {
      return g.code + ' · ' + g.name + ' · ' + fcfa(g.total) + ' · ' + (g.phone || 'no phone') + ' · ' + g.items.length + ' line(s)';
    }).join('\n');
    alert('Payee totals\n\n' + text);
  }

  function mapPaidEvent(doc) {
    var d = doc.data() || {};
    return {
      id: doc.id,
      payeeCode: normCode(d.payee_code),
      amount: Number(d.amount_fcfa) || 0,
      shareKey: d.share || '',
      productLabel: d.productId === 'foundation-yearly' ? 'Foundation Access $144.17' : (d.productId || d.program || 'SBD'),
      subscriberUid: d.subscriberUid || '',
      subscriberLabel: d.subscriberUid || '—',
      sellerCode: normCode(d.seller_code || ''),
      paidAt: d.created_at || null,
      paidLabel: fmtWhen(d.created_at),
      paidDayKey: dayKeyFromTs(d.created_at),
      admin: d.created_by_admin || ''
    };
  }

  function renderPaidDailySummary(rows) {
    var el = document.getElementById('sbdPaidDailySummary');
    if (!el) return;
    var byDay = Object.create(null);
    rows.forEach(function (r) {
      var k = r.paidDayKey || 'unknown';
      if (!byDay[k]) byDay[k] = { count: 0, total: 0 };
      byDay[k].count++;
      byDay[k].total += Number(r.amount) || 0;
    });
    var days = Object.keys(byDay).sort().reverse();
    if (!days.length) {
      el.innerHTML = '<p style="font-size:14px;color:#64748b;margin:0">No paid shares in this period.</p>';
      return;
    }
    var grand = rows.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
    el.innerHTML =
      '<p style="margin:0 0 8px;font-size:14px;color:#64748b">' + rows.length + ' paid line(s) · <strong>' + fcfa(grand) + '</strong></p>' +
      '<div class="table-container"><table><thead><tr><th>Date</th><th>Lines</th><th>Total sent</th></tr></thead><tbody>' +
      days.map(function (d) {
        return '<tr><td><strong>' + esc(d) + '</strong></td><td>' + byDay[d].count + '</td><td><strong>' + fcfa(byDay[d].total) + '</strong></td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function populatePaidPayeeFilter(rows) {
    var sel = document.getElementById('sbdPaidPayeeFilter');
    if (!sel) return;
    var codes = [];
    rows.forEach(function (r) {
      if (r.payeeCode && codes.indexOf(r.payeeCode) === -1) codes.push(r.payeeCode);
    });
    codes.sort();
    sel.innerHTML = '<option value="">All payees</option>' + codes.map(function (c) {
      return '<option value="' + esc(c) + '"' + (paidPayeeFilter === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
  }

  function renderPaidHistoryTable(rows) {
    var tbody = document.getElementById('sbdPaidHistoryBody');
    if (!tbody) return;
    var filtered = paidPayeeFilter
      ? rows.filter(function (r) { return r.payeeCode === paidPayeeFilter; })
      : rows;
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="7">No paid SBD commissions in this period.</td></tr>';
      return;
    }
    tbody.innerHTML = filtered.map(function (r) {
      return '<tr>' +
        '<td>' + esc(r.paidLabel) + '</td>' +
        '<td><code>' + esc(r.payeeCode) + '</code></td>' +
        '<td>' + esc(r.productLabel) + '</td>' +
        '<td><small>' + esc(r.subscriberLabel) + '</small></td>' +
        '<td><code>' + esc(r.sellerCode || '—') + '</code></td>' +
        '<td>' + roleBadge(r.shareKey) + '</td>' +
        '<td><strong>' + fcfa(r.amount) + '</strong></td>' +
        '</tr>';
    }).join('');
  }

  async function loadPaidHistory() {
    var tbody = document.getElementById('sbdPaidHistoryBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7">Loading paid history…</td></tr>';
    try {
      var snap = await firebase.firestore().collection('payout_events')
        .where('type', '==', 'sbd_commission_share')
        .orderBy('created_at', 'desc')
        .limit(300)
        .get();

      lastPaidRows = [];
      snap.forEach(function (doc) {
        lastPaidRows.push(mapPaidEvent(doc));
      });

      // Resolve subscriber labels
      var uids = [];
      lastPaidRows.forEach(function (r) {
        if (r.subscriberUid && uids.indexOf(r.subscriberUid) === -1) uids.push(r.subscriberUid);
      });
      await Promise.all(uids.map(async function (uid) {
        var label = await fetchSubscriberLabel(uid);
        lastPaidRows.forEach(function (r) {
          if (r.subscriberUid === uid) r.subscriberLabel = label;
        });
      }));

      var daysEl = document.getElementById('sbdPaidDays');
      var days = daysEl ? Number(daysEl.value) || 30 : 30;
      var periodRows = filterRowsByDays(lastPaidRows, days, 'paidAt');
      populatePaidPayeeFilter(periodRows);
      renderPaidDailySummary(periodRows);
      renderPaidHistoryTable(periodRows);
      updatePaidTodaySummary();
    } catch (e) {
      console.error('[SbdCommissions] paid history error:', e);
      // Fallback without composite index
      try {
        var snap2 = await firebase.firestore().collection('payout_events')
          .orderBy('created_at', 'desc')
          .limit(300)
          .get();
        lastPaidRows = [];
        snap2.forEach(function (doc) {
          var d = doc.data() || {};
          if (d.type === 'sbd_commission_share') lastPaidRows.push(mapPaidEvent(doc));
        });
        var daysEl2 = document.getElementById('sbdPaidDays');
        var days2 = daysEl2 ? Number(daysEl2.value) || 30 : 30;
        var periodRows2 = filterRowsByDays(lastPaidRows, days2, 'paidAt');
        populatePaidPayeeFilter(periodRows2);
        renderPaidDailySummary(periodRows2);
        renderPaidHistoryTable(periodRows2);
        updatePaidTodaySummary();
      } catch (e2) {
        tbody.innerHTML = '<tr><td colspan="7">Error loading paid history. A Firestore index may be required.</td></tr>';
      }
    }
  }

  function switchSbdView(view) {
    sbdView = view;
    var pendingView = document.getElementById('sbdPendingView');
    var paidView = document.getElementById('sbdPaidView');
    var tabPending = document.getElementById('sbdTabPending');
    var tabPaid = document.getElementById('sbdTabPaid');
    if (pendingView) pendingView.hidden = view !== 'pending';
    if (paidView) paidView.hidden = view !== 'paid';
    if (tabPending) {
      tabPending.classList.toggle('btn-primary', view === 'pending');
      tabPending.classList.toggle('btn-secondary', view !== 'pending');
      tabPending.setAttribute('aria-selected', view === 'pending' ? 'true' : 'false');
    }
    if (tabPaid) {
      tabPaid.classList.toggle('btn-primary', view === 'paid');
      tabPaid.classList.toggle('btn-secondary', view !== 'paid');
      tabPaid.setAttribute('aria-selected', view === 'paid' ? 'true' : 'false');
    }
    if (view === 'paid') loadPaidHistory();
  }

  function bindSelectAll() {
    var selectAll = document.getElementById('sbdSelectAll');
    if (!selectAll || selectAll.dataset.bound) return;
    selectAll.dataset.bound = '1';
    selectAll.addEventListener('change', function () {
      document.querySelectorAll('.sbd-row-check').forEach(function (cb) {
        cb.checked = selectAll.checked;
      });
    });
  }

  function initFinanceSection() {
    bindSelectAll();

    var search = document.getElementById('sbdSearchInput');
    if (search && !search.dataset.bound) {
      search.dataset.bound = '1';
      search.addEventListener('input', renderPendingTable);
    }
    var lookup = document.getElementById('sbdPayeeLookup');
    if (lookup && !lookup.dataset.bound) {
      lookup.dataset.bound = '1';
      lookup.addEventListener('change', onPayeeLookup);
      lookup.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); onPayeeLookup(); }
      });
    }
    var totalsBtn = document.getElementById('sbdPayeeTotalsBtn');
    if (totalsBtn && !totalsBtn.dataset.bound) {
      totalsBtn.dataset.bound = '1';
      totalsBtn.addEventListener('click', openAllPayeesOverlay);
    }
    var copyAll = document.getElementById('sbdCopyAllPhones');
    if (copyAll && !copyAll.dataset.bound) {
      copyAll.dataset.bound = '1';
      copyAll.addEventListener('click', copyAllPhones);
    }
    var refresh = document.getElementById('sbdRefreshBtn');
    if (refresh && !refresh.dataset.bound) {
      refresh.dataset.bound = '1';
      refresh.addEventListener('click', loadSbdCommissionQueue);
    }
    var markAll = document.getElementById('sbdMarkAllPendingBtn');
    if (markAll && !markAll.dataset.bound) {
      markAll.dataset.bound = '1';
      markAll.addEventListener('click', markAllPending);
    }
    var markSelected = document.getElementById('sbdMarkSelectedBtn');
    if (markSelected && !markSelected.dataset.bound) {
      markSelected.dataset.bound = '1';
      markSelected.addEventListener('click', markSelectedPending);
    }
    var tabPending = document.getElementById('sbdTabPending');
    if (tabPending && !tabPending.dataset.bound) {
      tabPending.dataset.bound = '1';
      tabPending.addEventListener('click', function () { switchSbdView('pending'); });
    }
    var tabPaid = document.getElementById('sbdTabPaid');
    if (tabPaid && !tabPaid.dataset.bound) {
      tabPaid.dataset.bound = '1';
      tabPaid.addEventListener('click', function () { switchSbdView('paid'); });
    }
    var paidRefresh = document.getElementById('sbdPaidRefreshBtn');
    if (paidRefresh && !paidRefresh.dataset.bound) {
      paidRefresh.dataset.bound = '1';
      paidRefresh.addEventListener('click', loadPaidHistory);
    }
    var paidDays = document.getElementById('sbdPaidDays');
    if (paidDays && !paidDays.dataset.bound) {
      paidDays.dataset.bound = '1';
      paidDays.addEventListener('change', loadPaidHistory);
    }
    var paidPayee = document.getElementById('sbdPaidPayeeFilter');
    if (paidPayee && !paidPayee.dataset.bound) {
      paidPayee.dataset.bound = '1';
      paidPayee.addEventListener('change', function (e) {
        paidPayeeFilter = e.target.value || '';
        var daysEl = document.getElementById('sbdPaidDays');
        var days = daysEl ? Number(daysEl.value) || 30 : 30;
        var periodRows = filterRowsByDays(lastPaidRows, days, 'paidAt');
        renderPaidHistoryTable(periodRows);
      });
    }
  }

  // Back-compat API used by admin-dashboard nav
  window.AdminFinanceTier1 = {
    loadFinanceQueue: loadSbdCommissionQueue,
    loadFinanceHistory: loadPaidHistory,
    loadSbdCommissionQueue: loadSbdCommissionQueue,
    init: initFinanceSection
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFinanceSection);
  } else {
    initFinanceSection();
  }
})();
