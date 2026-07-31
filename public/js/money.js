/**
 * Marriage Education — dashboard money display (USD primary).
 * Ledger / commerce engine stores amounts in XAF (FCFA); dashboards show USD.
 */
(function (global) {
  'use strict';

  var XAF_PER_USD = 600;

  var TARGETS = {
    ambassadorMonthlyUsd: 2360,
    seniorMonthlyUsd: 11800,
    rdMonthlyUsd: 750000,
    contestBonusUsd: 17
  };

  function normalizeCurrency(currency) {
    var c = (currency || 'xaf').toString().toLowerCase();
    if (c === 'usd' || c === 'us') return 'usd';
    if (c === 'xaf' || c === 'fcfa' || c === 'cfa') return 'xaf';
    return 'xaf';
  }

  /** Convert a stored amount to USD for display. Default: stored as XAF. */
  function toUsd(amount, options) {
    var n = Number(amount) || 0;
    if (!n) return 0;
    options = options || {};
    if (options.alreadyUsd) return n;
    var cur = normalizeCurrency(options.currency || options.storedAs);
    if (cur === 'usd') return n;
    return n / XAF_PER_USD;
  }

  function usdToXaf(usd) {
    return Math.round((Number(usd) || 0) * XAF_PER_USD);
  }

  function xafToUsd(xaf) {
    return toUsd(xaf, { storedAs: 'xaf' });
  }

  function formatUSD(usd, options) {
    options = options || {};
    var n = Number(usd) || 0;
    var decimals = options.decimals;
    if (decimals === undefined) {
      decimals = Math.abs(n) < 100 && n % 1 !== 0 ? 2 : 0;
    }
    if (options.compact && Math.abs(n) >= 1000) {
      if (Math.abs(n) >= 1000000) {
        return '$' + (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
      }
      return '$' + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K';
    }
    return (
      '$' +
      n.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      })
    );
  }

  /** Format amount from Firestore/commerce (XAF unless options say otherwise). */
  function formatStoredAsUSD(amount, options) {
    return formatUSD(toUsd(amount, options), options);
  }

  /** Primary label + optional FCFA reference in smaller contexts */
  function formatStoredPrimary(amount, options) {
    options = options || {};
    var primary = formatStoredAsUSD(amount, options);
    if (!options.showXafReference) return primary;
    var xaf = options.alreadyUsd ? usdToXaf(amount) : Math.round(Number(amount) || 0);
    return primary + ' (~' + xaf.toLocaleString('en-US') + ' FCFA)';
  }

  function fromSaleAmount(amount, sale) {
    var cur = sale && (sale.currency || sale.paymentCurrency);
    return toUsd(amount, { currency: cur });
  }

  function formatSaleUSD(amount, sale, options) {
    return formatUSD(fromSaleAmount(amount, sale), options);
  }

  global.MEMoney = {
    XAF_PER_USD: XAF_PER_USD,
    TARGETS: TARGETS,
    toUsd: toUsd,
    usdToXaf: usdToXaf,
    xafToUsd: xafToUsd,
    formatUSD: formatUSD,
    formatStoredAsUSD: formatStoredAsUSD,
    formatStoredPrimary: formatStoredPrimary,
    fromSaleAmount: fromSaleAmount,
    formatSaleUSD: formatSaleUSD
  };
})(typeof window !== 'undefined' ? window : global);
