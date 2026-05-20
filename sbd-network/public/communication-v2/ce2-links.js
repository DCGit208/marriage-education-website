/**
 * CE2 Phase 3 — link validation for message content
 */
(function (global) {
  'use strict';

  var ALLOWED_HOSTS = [
    'sbd-network.web.app',
    'sbd-network.firebaseapp.com',
    'marriageducation.com',
    'www.marriageducation.com',
    'localhost',
    '127.0.0.1',
  ];

  var URL_RE = /https?:\/\/[^\s<>"']+/gi;

  function hostAllowed(hostname) {
    if (!hostname) return false;
    var h = hostname.toLowerCase();
    return ALLOWED_HOSTS.some(function (allowed) {
      return h === allowed || h.endsWith('.' + allowed);
    });
  }

  function extractUrls(text) {
    if (!text) return [];
    var m = String(text).match(URL_RE);
    return m ? m.slice() : [];
  }

  /**
   * @returns {{ ok: boolean, blocked: string[], external: string[] }}
   */
  function validateMessageLinks(text) {
    var urls = extractUrls(text);
    var blocked = [];
    var external = [];
    urls.forEach(function (raw) {
      try {
        var u = new URL(raw);
        if (hostAllowed(u.hostname)) return;
        external.push(raw);
        blocked.push(raw);
      } catch (_) {
        blocked.push(raw);
      }
    });
    return { ok: blocked.length === 0, blocked: blocked, external: external };
  }

  function linkifyHtml(escapedText) {
    if (!escapedText) return '';
    return escapedText.replace(URL_RE, function (url) {
      try {
        var u = new URL(url);
        var safe = hostAllowed(u.hostname);
        var cls = safe ? 'ce2-link ce2-link-safe' : 'ce2-link ce2-link-external';
        return (
          '<a href="' +
          url.replace(/"/g, '&quot;') +
          '" class="' +
          cls +
          '" target="_blank" rel="noopener noreferrer">' +
          url +
          '</a>'
        );
      } catch (_) {
        return url;
      }
    });
  }

  global.Ce2Links = {
    validateMessageLinks: validateMessageLinks,
    linkifyHtml: linkifyHtml,
    extractUrls: extractUrls,
    VERSION: 1,
  };
})(typeof window !== 'undefined' ? window : global);
