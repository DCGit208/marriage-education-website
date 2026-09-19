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
  var VERSION = 4;

  /**
   * Same-origin stills already used on the live site (heroes, covers, board art).
   * Never scrape user URLs; if a route has no picture, use DEFAULT_THUMB.
   */
  var DEFAULT_THUMB = '/assets/background/dashboard-main.jpg';
  var THUMB_HOME = '/assets/background/dashboard-main.jpg';
  var THUMB_LEARN = '/images/the-woman-the-wife-the-mother-cover.png';
  var THUMB_COURSES = '/images/course-covers/anthropology-of-wholeness-cover.png';
  var THUMB_SHOP = '/assets/book-covers/sbd-canonical.png';
  var THUMB_MESSAGES = '/assets/images/hands-chiaroscuro.png';
  var THUMB_BOARDS = '/images/SBD-Real-Couples.jpg';
  var THUMB_MV = '/assets/background/mv-house-video-poster.jpg';

  /**
   * Known in-app routes → title + one line of context + site image.
   * Paths are matched after stripping a trailing slash and `.html`.
   */
  var ROUTE_META = {
    '/': { title: 'SBD Network', excerpt: 'Home for formation, boards, and messages', thumb: THUMB_HOME },
    '/dashboard': { title: 'Home', excerpt: 'SBD Network dashboard', thumb: THUMB_HOME },
    '/index': { title: 'Home', excerpt: 'SBD Network dashboard', thumb: THUMB_HOME },
    '/communication-v2': { title: 'Messages', excerpt: 'Formation-gated messenger', thumb: THUMB_MESSAGES },
    '/messaging-v2': { title: 'Messages', excerpt: 'SBD messenger', thumb: THUMB_MESSAGES },
    '/dm': { title: 'Messages', excerpt: 'Direct messages', thumb: THUMB_MESSAGES },
    '/dm-v2': { title: 'Messages', excerpt: 'Direct messages', thumb: THUMB_MESSAGES },
    '/learn': { title: 'Formation', excerpt: 'Courses and weekly lessons', thumb: THUMB_LEARN },
    '/courses': { title: 'Courses', excerpt: 'Marriage Education catalogue', thumb: THUMB_COURSES },
    '/lesson': { title: 'Lesson', excerpt: 'Open this formation lesson', thumb: THUMB_LEARN },
    '/quiz': { title: 'Quiz', excerpt: 'Formation quiz', thumb: THUMB_LEARN },
    '/entry-quiz': { title: 'Entry quiz', excerpt: 'Placement quiz', thumb: THUMB_LEARN },
    '/assignment': { title: 'Assignment', excerpt: 'Course assignment', thumb: THUMB_LEARN },
    '/board': { title: 'Discussion board', excerpt: 'Open this formation board', thumb: THUMB_BOARDS },
    '/boards': { title: 'Boards', excerpt: 'The Salon Floor', thumb: THUMB_BOARDS },
    '/group': { title: 'Group', excerpt: 'Formation group', thumb: THUMB_BOARDS },
    '/shop': { title: 'Shop', excerpt: 'Books and resources', thumb: THUMB_SHOP },
    '/library': { title: 'Library', excerpt: 'Formation library', thumb: THUMB_SHOP },
    '/resources': { title: 'Resources', excerpt: 'Library of formation resources', thumb: THUMB_SHOP },
    '/book': { title: 'Book', excerpt: 'SBD reading', thumb: THUMB_SHOP },
    '/profile': { title: 'Profile', excerpt: 'Your SBD profile', thumb: THUMB_HOME },
    '/member': { title: 'Member', excerpt: 'Member profile', thumb: THUMB_HOME },
    '/mv-house': { title: 'MV House', excerpt: 'Marriage Vision House', thumb: THUMB_MV },
    '/dating': { title: 'Dating', excerpt: 'Dating in the SBD network', thumb: '/assets/images/mv/female-1.jpg' },
    '/pricing': { title: 'Membership', excerpt: 'SBD membership and pricing', thumb: THUMB_HOME },
    '/tier': { title: 'Membership', excerpt: 'Covenant access', thumb: THUMB_HOME },
    '/certificates': { title: 'Certifications', excerpt: 'Your formation certificates', thumb: THUMB_HOME },
    '/schools': { title: 'Schools', excerpt: 'Marriage Education schools', thumb: THUMB_COURSES },
    '/explore': { title: 'Explore', excerpt: 'Explore the SBD network', thumb: THUMB_HOME },
    '/search': { title: 'Search', excerpt: 'Search the network', thumb: THUMB_HOME },
    '/auth': { title: 'Sign in', excerpt: 'SBD Network sign in', thumb: THUMB_HOME },
    '/start-here': { title: 'Start here', excerpt: 'Begin formation', thumb: THUMB_LEARN },
    '/what-is': { title: 'What is SBD', excerpt: 'Sex by Design', thumb: THUMB_SHOP },
    '/checkout': { title: 'Checkout', excerpt: 'Complete your order', thumb: THUMB_SHOP },
    '/payment': { title: 'Payment', excerpt: 'Membership payment', thumb: THUMB_SHOP },
    '/admin': { title: 'Admin', excerpt: 'SBD Network admin', thumb: THUMB_HOME },
  };

  function siteThumb(url) {
    var s = String(url || '').trim();
    if (!s) return DEFAULT_THUMB;
    if (s.charAt(0) !== '/') return DEFAULT_THUMB;
    if (s.indexOf('/assets/') !== 0 && s.indexOf('/images/') !== 0) return DEFAULT_THUMB;
    return s;
  }

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
      thumbnailUrl: siteThumb(meta && meta.thumb),
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
    var thumb = siteThumb(preview.thumbnailUrl);
    var safeThumb = esc(thumb).replace(/"/g, '&quot;');
    var safeFallback = esc(DEFAULT_THUMB).replace(/"/g, '&quot;');
    var errAttr =
      thumb === DEFAULT_THUMB
        ? ''
        : " onerror=\"this.onerror=null;this.src='" + safeFallback + "'\"";
    // Keep the thumbnail outside the <a>. Wrapping it in the link made
    // tap/long-press-to-reply a no-op (PR #8). Card body opens the URL.
    var thumbHtml =
      '<button type="button" class="ce2-link-preview-thumb is-deferred" aria-label="Reply to this message">' +
      '<span class="ce2-link-preview-thumb-ph" aria-hidden="true"></span>' +
      '<img class="ce2-link-preview-thumb-img" data-ce2-src="' +
      safeThumb +
      '" alt="" loading="lazy" decoding="async" draggable="false"' +
      errAttr +
      '>' +
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
    siteThumb: siteThumb,
    ALLOWED_HOSTS: ALLOWED_HOSTS.slice(),
    DEFAULT_THUMB: DEFAULT_THUMB,
    VERSION: VERSION,
  };
})(typeof window !== 'undefined' ? window : global);
