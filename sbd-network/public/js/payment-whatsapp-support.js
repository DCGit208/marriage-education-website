/**
 * Inline WhatsApp support for payment pages (SBD Network copy).
 * See marriage-education public/js/payment-whatsapp-support.js for full docs.
 */
(function (global) {
  'use strict';

  var WA_NUMBER = '237677604100';

  function buildUrl(opts) {
    opts = opts || {};
    var lines = ['Hi, I need help with a payment.', ''];
    lines.push('Page: ' + (opts.page || document.title || location.pathname));
    if (opts.code) lines.push('Code: ' + opts.code);
    if (opts.reference) lines.push('Reference: ' + opts.reference);
    if (opts.email) lines.push('Email: ' + opts.email);
    if (opts.method) lines.push('Method: ' + opts.method);
    if (opts.product) lines.push('Product: ' + opts.product);
    if (opts.amount) lines.push('Amount: ' + opts.amount);
    lines.push('', 'Issue: ');
    return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(lines.join('\n'));
  }

  function contextFromElement(el) {
    if (!el || !el.dataset) return {};
    return {
      page: el.dataset.waPage || '',
      code: el.dataset.waCode || '',
      email: el.dataset.waEmail || '',
      method: el.dataset.waMethod || '',
      product: el.dataset.waProduct || '',
      reference: el.dataset.waReference || '',
      amount: el.dataset.waAmount || ''
    };
  }

  function openSupport(opts) {
    var url = buildUrl(opts);
    window.open(url, '_blank', 'noopener,noreferrer');
    return url;
  }

  function wire(selector, getContext) {
    var nodes = document.querySelectorAll(selector || '.js-wa-payment-support');
    nodes.forEach(function (el) {
      if (el.dataset.waWired === '1') return;
      el.dataset.waWired = '1';
      if (!el.getAttribute('href') || el.getAttribute('href') === '#') {
        el.setAttribute('href', buildUrl(contextFromElement(el)));
      }
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var base = contextFromElement(el);
        var extra = typeof getContext === 'function' ? (getContext(el) || {}) : {};
        var merged = {};
        Object.keys(base).forEach(function (k) { if (base[k]) merged[k] = base[k]; });
        Object.keys(extra).forEach(function (k) { if (extra[k]) merged[k] = extra[k]; });
        if (!merged.page) merged.page = document.title || location.pathname;
        openSupport(merged);
      });
    });
  }

  function ensureStyles() {
    if (document.getElementById('payment-wa-support-styles')) return;
    var style = document.createElement('style');
    style.id = 'payment-wa-support-styles';
    style.textContent =
      '.payment-wa-support{margin:14px 0 0;text-align:center;font-size:14px;line-height:1.5;color:#6b7280;}' +
      '.payment-wa-support a{color:#0f766e;font-weight:600;text-decoration:underline;text-underline-offset:2px;}' +
      '.payment-wa-support a:hover{color:#115e59;}' +
      '.payment-wa-support.payment-wa-support--left{text-align:left;}' +
      '.payment-wa-support.payment-wa-support--dark{color:#9ca3af;}' +
      '.payment-wa-support.payment-wa-support--dark a{color:#7dd3c0;}';
    document.head.appendChild(style);
  }

  function autoInit() {
    ensureStyles();
    wire('.js-wa-payment-support');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

  global.PaymentWhatsAppSupport = {
    number: WA_NUMBER,
    buildUrl: buildUrl,
    openSupport: openSupport,
    wire: wire,
    ensureStyles: ensureStyles
  };
})(window);
