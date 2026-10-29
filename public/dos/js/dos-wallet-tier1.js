/**
 * Tier 1 wallet UI — aggregates existing ledger fields (no client-side commission math).
 */
(function (global) {
  'use strict';

  /** Last render context so KPI updates after save without full page reload. */
  var lastWalletRender = null;

  function num(v) {
    var n = Number(v);
    return n === n ? n : 0;
  }

  function summarizeFromStats(stats, payeeCode, collection) {
    var sr = (stats && stats.sbdReferrals) || {};
    var recruitmentPending = num(stats && stats.recruitment_bonus_pending);
    var sbdDirect = num(sr.commissionPending);
    var sbdSenior = num(sr.overrideCommissionPending);
    var sbdRd = num(sr.rdOverrideCommissionPending);
    var sbdPending = sbdDirect + sbdSenior + sbdRd;
    return {
      payee_code: payeeCode || '',
      payee_collection: collection || 'ambassadors',
      recruitment_pending_fcfa: recruitmentPending,
      recruitment_paid_fcfa: num(stats && stats.recruitment_bonus_paid),
      sbd_pending_fcfa: sbdPending,
      sbd_pending_breakdown: { direct: sbdDirect, seniorOverride: sbdSenior, rdOverride: sbdRd },
      total_pending_fcfa: recruitmentPending + sbdPending,
      payout_profile: (stats && stats.payout_profile) || null
    };
  }

  function fmtFcfa(n) {
    return (num(n)).toLocaleString() + ' FCFA';
  }

  function renderWalletCard(container, stats, payeeCode, collection) {
    if (!container) return;
    lastWalletRender = {
      container: container,
      stats: stats,
      payeeCode: payeeCode,
      collection: collection
    };
    var w = summarizeFromStats(stats, payeeCode, collection);
    var profile = w.payout_profile || {};
    var profileOk = profile.profile_complete === true;
    var fmtXaf = global.DOSEconomics && global.DOSEconomics.formatStoredXafAsUsd
      ? global.DOSEconomics.formatStoredXafAsUsd.bind(global.DOSEconomics)
      : fmtFcfa;

    container.innerHTML =
      '<div class="dos-card dos-wallet-card">' +
      '<h3><i class="fa-solid fa-wallet"></i> Payout wallet</h3>' +
      '<p style="font-size:13px;color:#71717a">Pending balances are credited automatically when customers pay. ' +
      'Cash is sent via MoMo (Cameroon) or Wise (international) after admin payout runs.</p>' +
      '<div class="dos-kpi-grid">' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Total pending</div><div class="dos-kpi-value">' +
      fmtXaf(w.total_pending_fcfa) + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Recruitment pending</div><div class="dos-kpi-value">' +
      fmtXaf(w.recruitment_pending_fcfa) + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">SBD pending</div><div class="dos-kpi-value">' +
      fmtXaf(w.sbd_pending_fcfa) + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Recruitment paid (lifetime)</div><div class="dos-kpi-value">' +
      fmtXaf(w.recruitment_paid_fcfa) + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Payout profile</div><div class="dos-kpi-value" style="font-size:14px">' +
      (profileOk ? '<span style="color:#16a34a">Complete</span>' : '<span style="color:#e11d48">Incomplete</span>') +
      '</div></div>' +
      '</div>' +
      '<div id="dosWalletLedgerHost"></div>' +
      '<div id="dosPayoutProfileForm" class="dos-payout-profile-form" style="margin-top:16px"></div>' +
      '</div>';

    renderPayoutProfileForm(document.getElementById('dosPayoutProfileForm'), profile, payeeCode);

    if (global.DOSPaymentSupport && global.DOSPaymentSupport.onWalletRendered) {
      global.DOSPaymentSupport.onWalletRendered(stats, payeeCode, collection, w);
    }
  }

  function renderPayoutProfileForm(el, profile, payeeCode) {
    if (!el || !payeeCode) return;
    var p = profile || {};
    el.innerHTML =
      '<h4 style="font-size:14px;margin:0 0 12px"><i class="fa-solid fa-building-columns"></i> Payout details</h4>' +
      '<div class="dos-form-grid" style="display:grid;gap:10px;max-width:480px">' +
      '<label>Country (ISO)<input type="text" id="ppCountry" value="' + esc(p.country || '') + '" placeholder="CM, GB, US"></label>' +
      '<label>Method<select id="ppMethod">' +
      '<option value="momo_cm"' + sel(p.method, 'momo_cm') + '>MoMo (Cameroon)</option>' +
      '<option value="wise_bank"' + sel(p.method, 'wise_bank') + '>Wise / bank</option>' +
      '<option value="paypal"' + sel(p.method, 'paypal') + '>PayPal</option>' +
      '</select></label>' +
      '<label>Account holder<input type="text" id="ppHolder" value="' + esc(p.account_holder_name || '') + '"></label>' +
      '<label>MoMo number<input type="text" id="ppMomo" value="' + esc(p.momo_number || '') + '" placeholder="+237…"></label>' +
      '<label>Wise email / PayPal<input type="email" id="ppWiseEmail" value="' + esc(p.wise_email || p.paypal_email || '') + '"></label>' +
      '<label>IBAN (optional)<input type="text" id="ppIban" value="' + esc(p.iban || '') + '"></label>' +
      '</div>' +
      '<button type="button" class="dos-btn dos-btn-primary" id="ppSaveBtn" style="margin-top:12px">' +
      '<i class="fa-solid fa-floppy-disk"></i> Save payout profile</button>' +
      '<p id="ppSaveMsg" style="font-size:13px;margin-top:8px"></p>';

    var btn = document.getElementById('ppSaveBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        savePayoutProfile(payeeCode);
      });
    }
  }

  function sel(current, value) {
    return current === value ? ' selected' : '';
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  async function savePayoutProfile(payeeCode) {
    var msg = document.getElementById('ppSaveMsg');
    if (typeof firebase === 'undefined' || !firebase.functions) {
      if (msg) msg.textContent = 'Firebase Functions not available.';
      return;
    }
    var payload = {
      payee_code: payeeCode,
      email: (function () { try { return localStorage.getItem('ambassadorEmail') || ''; } catch (e) { return ''; } })(),
      payout_profile: {
        country: (document.getElementById('ppCountry') || {}).value,
        method: (document.getElementById('ppMethod') || {}).value,
        account_holder_name: (document.getElementById('ppHolder') || {}).value,
        momo_number: (document.getElementById('ppMomo') || {}).value,
        wise_email: (document.getElementById('ppWiseEmail') || {}).value,
        iban: (document.getElementById('ppIban') || {}).value,
        currency_preference: 'XAF'
      }
    };
    try {
      var fn = firebase.functions().httpsCallable('updatePayoutProfile');
      var res = await fn(payload);
      var savedProfile = res.data && res.data.payout_profile;
      if (msg) {
        msg.style.color = '#16a34a';
        msg.textContent = savedProfile && savedProfile.profile_complete
          ? 'Profile saved and complete.'
          : 'Profile saved — add required fields to mark complete.';
      }
      if (
        savedProfile &&
        lastWalletRender &&
        lastWalletRender.payeeCode === payeeCode
      ) {
        lastWalletRender.stats = Object.assign({}, lastWalletRender.stats, {
          payout_profile: savedProfile
        });
        renderWalletCard(
          lastWalletRender.container,
          lastWalletRender.stats,
          payeeCode,
          lastWalletRender.collection
        );
        var msgAfter = document.getElementById('ppSaveMsg');
        if (msgAfter) {
          msgAfter.style.color = '#16a34a';
          msgAfter.textContent = savedProfile.profile_complete
            ? 'Profile saved and complete.'
            : 'Profile saved — add required fields to mark complete.';
        }
      }
    } catch (e) {
      if (msg) {
        msg.style.color = '#e11d48';
        msg.textContent = (e.message || 'Save failed');
      }
    }
  }

  function ensureWalletContainer() {
    var rec = document.getElementById('dosRecurringBody');
    if (!rec || !rec.parentNode) return null;
    var w = document.getElementById('dosWalletBody');
    if (!w) {
      w = document.createElement('div');
      w.id = 'dosWalletBody';
      rec.parentNode.insertBefore(w, rec);
    }
    return w;
  }

  global.DOSWalletTier1 = {
    summarizeFromStats: summarizeFromStats,
    renderWalletCard: renderWalletCard,
    ensureWalletContainer: ensureWalletContainer
  };
})(typeof window !== 'undefined' ? window : global);
