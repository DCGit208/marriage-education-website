/**
 * Operator Network campaign attribution.
 * Captures flyer/QR/social campaign parameters and carries them into the
 * existing registration and Foundation Access pathways without changing
 * referral-code logic.
 */
(function () {
  'use strict';

  var KEYS = ['campaign', 'source', 'medium', 'flyer', 'creative', 'utm_campaign', 'utm_source', 'utm_medium', 'utm_content', 'ref', 'senior', 'rd'];
  var params = new URLSearchParams(window.location.search);
  var captured = {};

  KEYS.forEach(function (key) {
    var value = params.get(key);
    if (value) captured[key] = value;
  });

  try {
    var existing = JSON.parse(sessionStorage.getItem('me_operator_campaign') || '{}');
    Object.keys(captured).forEach(function (key) { existing[key] = captured[key]; });
    sessionStorage.setItem('me_operator_campaign', JSON.stringify(existing));
    captured = existing;
  } catch (e) {}

  function decorate(url) {
    if (!url || url.indexOf('#') === 0 || url.indexOf('mailto:') === 0 || url.indexOf('tel:') === 0) return url;
    try {
      var u = new URL(url, window.location.origin);
      if (u.origin !== window.location.origin) return url;
      Object.keys(captured).forEach(function (key) {
        if (captured[key] && !u.searchParams.has(key)) u.searchParams.set(key, captured[key]);
      });
      return u.pathname + (u.search ? u.search : '') + (u.hash || '');
    } catch (e) {
      return url;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('a[href]').forEach(function (link) {
      var href = link.getAttribute('href');
      if (!href) return;
      link.setAttribute('href', decorate(href));
    });
  });

  window.MEOperatorCampaign = {
    get: function () { return Object.assign({}, captured); },
    decorate: decorate
  };
})();
