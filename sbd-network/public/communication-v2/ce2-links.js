/**
 * CE2 Phase 3 — link validation + compact in-bubble previews.
 * Previews are catalog/route-based for allowlisted hosts only.
 * No fetch of user-supplied URLs (no SSRF, no open-web scrape).
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
  var ORIGIN_FALLBACK = 'https://sbd-network.web.app';
  var EXCERPT_MAX = 96;
  var VERSION = 2;

  /**
   * Known in-app routes → title + one line of context.
   * Paths are matched after stripping a trailing slash and `.html`.
   */
  var ROUTE_META = {
    '/': { title: 'SBD Network', excerpt: 'Home for formation, boards, and messages' },
    '/dashboard': { title: 'Home', excerpt: 'SBD Network dashboard' },
    '/index': { title: 'Home', excerpt: 'SBD Network dashboard' },
    '/communication-v2': { title: 'Messages', excerpt: 'Formation-gated messenger' },
    '/messaging-v2': { title: 'Messages', excerpt: 'SBD messenger' },
    '/dm': { title: 'Messages', excerpt: 'Direct messages' },
    '/dm-v2': { title: 'Messages', excerpt: 'Direct messages' },
    '/learn': { title: 'Formation', excerpt: 'Courses and weekly lessons' },
    '/courses': { title: 'Courses', excerpt: 'Marriage Education catalogue' },
    '/lesson': { title: 'Lesson', excerpt: 'Open this formation lesson' },
    '/quiz': { title: 'Quiz', excerpt: 'Formation quiz' },
    '/entry-quiz': { title: 'Entry quiz', excerpt: 'Placement quiz' },
    '/assignment': { title: 'Assignment', excerpt: 'Course assignment' },
    '/board': { title: 'Discussion board', excerpt: 'Open this formation board' },
    '/boards': { title: 'Boards', excerpt: 'The Salon Floor' },
    '/group': { title: 'Group', excerpt: 'Formation group' },
    '/shop': { title: 'Shop', excerpt: 'Books and resources' },
    '/library': { title: 'Library', excerpt: 'Formation library' },
    '/resources': { title: 'Resources', excerpt: 'Library of formation resources' },
    '/book': { title: 'Book', excerpt: 'SBD reading' },
    '/profile': { title: 'Profile', excerpt: 'Your SBD profile' },
    '/member': { title: 'Member', excerpt: 'Member profile' },
    '/mv-house': { title: 'MV House', excerpt: 'Marriage Vision House' },
    '/dating': { title: 'Dating', excerpt: 'Dating in the SBD network' },
    '/pricing': { title: 'Membership', excerpt: 'SBD membership and pricing' },
    '/tier': { title: 'Membership', excerpt: 'Covenant access' },
    '/certificates': { title: 'Certifications', excerpt: 'Your formation certificates' },
    '/schools': { title: 'Schools', excerpt: 'Marriage Education schools' },
    '/explore': { title: 'Explore', excerpt: 'Explore the SBD network' },
    '/search': { title: 'Search', excerpt: 'Search the network' },
    '/auth': { title: 'Sign in', excerpt: 'SBD Network sign in' },
    '/start-here': { title: 'Start here', excerpt: 'Begin formation' },
    '/what-is': { title: 'What is SBD', excerpt: 'Sex by Design' },
    '/checkout': { title: 'Checkout', excerpt: 'Complete your order' },
    '/payment': { title: 'Payment', excerpt: 'Membership payment' },
    '/admin': { title: 'Admin', excerpt: 'SBD Network admin' },
  };

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

  function parseUrl(raw) {
    if (!raw) return null;
    try {
      return new URL(String(raw).trim(), ORIGIN_FALLBACK);
    } catch (_) {
      return null;
    }
  }

  function normPath(pathname) {
    var p = String(pathname || '/').split('?')[0].split('#')[0];
    p = p.replace(/\/+$/, '') || '/';
    p = p.replace(/\.html$/i, '');
    if (p === '/communication-v2/index') p = '/communication-v2';
    if (p === '/messaging-v2/index') p = '/messaging-v2';
    return p.toLowerCase() || '/';
  }

  function isBoardPostUrl(raw) {
    var u = parseUrl(raw);
    if (!u) return false;
    var path = normPath(u.pathname);
    if (path !== '/board') return false;
    var boardId = u.searchParams.get('boardId') || u.searchParams.get('id');
    var postId = u.searchParams.get('post');
    return !!(boardId && postId);
  }

  function humanizeSegment(seg) {
    var s = String(seg || '')
      .replace(/[+_]+/g, ' ')
      .replace(/-/g, ' ')
      .replace(/\.html$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return '';
    try {
      s = decodeURIComponent(s);
    } catch (_) {}
    return s.replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  function clip(text, max) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    max = max || EXCERPT_MAX;
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)).replace(/\s+\S*$/, '').trim() + '…';
  }

  function queryExcerpt(u, fallback) {
    if (!u || !u.searchParams) return fallback || '';
    var title = u.searchParams.get('title');
    var course = u.searchParams.get('course') || u.searchParams.get('courseId');
    var week = u.searchParams.get('week') || u.searchParams.get('weekId');
    var module = u.searchParams.get('module') || u.searchParams.get('moduleId');
    var board = u.searchParams.get('boardId');
    var parts = [];
    if (title) parts.push(humanizeSegment(title));
    if (course) parts.push(humanizeSegment(course));
    if (week) {
      var w = String(week).replace(/^week-?/i, '');
      parts.push(/^[\d.]+$/.test(w) ? 'Week ' + w : humanizeSegment(week));
    }
    if (module) parts.push(humanizeSegment(module));
    if (board && normPath(u.pathname) === '/board') parts.push('Discussion board');
    if (parts.length) return clip(parts.join(' · '));
    return fallback || '';
  }

  function fallbackTitle(u) {
    var path = normPath(u.pathname);
    if (path === '/' || !path) return 'SBD Network';
    var segs = path.split('/').filter(Boolean);
    var last = segs[segs.length - 1] || '';
    return humanizeSegment(last) || 'SBD page';
  }

  function previewFromUrl(raw) {
    var u = parseUrl(raw);
    if (!u) return null;
    if (!hostAllowed(u.hostname)) return null;
    if (isBoardPostUrl(u.href)) return null;
    var path = normPath(u.pathname);
    var meta = ROUTE_META[path] || null;
    var title = (meta && meta.title) || fallbackTitle(u);
    var excerpt = queryExcerpt(u, (meta && meta.excerpt) || '');
    if (!excerpt) excerpt = 'Open this SBD page';
    return {
      href: u.href,
      host: u.hostname.replace(/^www\./i, ''),
      title: title,
      excerpt: clip(excerpt),
      thumbnailUrl: '',
    };
  }

  function firstPreviewableUrl(text) {
    var urls = extractUrls(text);
    for (var i = 0; i < urls.length; i += 1) {
      if (previewFromUrl(urls[i])) return urls[i];
    }
    return '';
  }

  function looksLikeBareLink(text) {
    var s = String(text || '').trim();
    if (!s) return false;
    var urls = extractUrls(s);
    if (!urls.length) return false;
    var rest = s;
    urls.forEach(function (u) {
      rest = rest.split(u).join(' ');
    });
    return rest.replace(/\s+/g, ' ').trim() === '';
  }

  function stripPreviewedUrls(text, previewUrl) {
    var s = String(text || '');
    if (!s) return '';
    if (previewUrl) s = s.split(previewUrl).join(' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  function defaultEscape(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderLinkPreviewHtml(raw, escapeHtml) {
    var preview = previewFromUrl(raw);
    if (!preview) return '';
    var esc = typeof escapeHtml === 'function' ? escapeHtml : defaultEscape;
    var href = String(preview.href || '').replace(/"/g, '&quot;');
    var title = esc(preview.title || 'SBD page');
    var excerpt = esc(preview.excerpt || '');
    var host = esc(preview.host || '');
    var thumb = String(preview.thumbnailUrl || '').trim();
    var safeThumb = thumb ? esc(thumb).replace(/"/g, '&quot;') : '';
    // Keep the thumbnail outside the <a>. Wrapping it in the link made
    // tap/long-press-to-reply a no-op (PR #8). Card body opens the URL.
    var thumbHtml =
      '<button type="button" class="ce2-link-preview-thumb' +
      (thumb ? '' : ' is-fallback') +
      '" aria-label="Reply to this message">' +
      '<span class="ce2-link-preview-thumb-ph" aria-hidden="true"></span>' +
      (thumb
        ? '<img class="ce2-link-preview-thumb-img" src="' +
          safeThumb +
          '" alt="" loading="lazy" decoding="async" draggable="false">'
        : '') +
      '</button>';
    var bodyHtml =
      '<a class="ce2-link-preview-body" href="' +
      href +
      '" rel="noopener noreferrer">' +
      (host ? '<span class="ce2-link-preview-kicker">' + host + '</span>' : '') +
      '<span class="ce2-link-preview-title">' +
      title +
      '</span>' +
      (excerpt ? '<span class="ce2-link-preview-excerpt">' + excerpt + '</span>' : '') +
      '</a>';
    return '<div class="ce2-link-preview">' + thumbHtml + bodyHtml + '</div>';
  }

  function renderPreviewHtmlForMessage(text, escapeHtml) {
    var url = firstPreviewableUrl(text);
    if (!url) return '';
    return renderLinkPreviewHtml(url, escapeHtml);
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
    hostAllowed: hostAllowed,
    isBoardPostUrl: isBoardPostUrl,
    previewFromUrl: previewFromUrl,
    firstPreviewableUrl: firstPreviewableUrl,
    looksLikeBareLink: looksLikeBareLink,
    stripPreviewedUrls: stripPreviewedUrls,
    renderLinkPreviewHtml: renderLinkPreviewHtml,
    renderPreviewHtmlForMessage: renderPreviewHtmlForMessage,
    ALLOWED_HOSTS: ALLOWED_HOSTS.slice(),
    VERSION: VERSION,
  };
})(typeof window !== 'undefined' ? window : global);
