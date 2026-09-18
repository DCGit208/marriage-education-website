/**
 * CE2 push helpers — shared by the page, service worker, and unit tests.
 * No tokens, no Firebase, no logging of secrets.
 */
(function (root) {
  'use strict';

  var VERSION = 1;
  var OPEN_MESSAGE_TYPE = 'CE2_OPEN_THREAD';
  var CE2_PATH = '/communication-v2';
  var BODY_MAX = 80;

  function inboxPrefId(kind, threadId) {
    var id = String(threadId || '').trim();
    if (!id) return '';
    return (kind === 'group' ? 'g__' : 'd__') + id;
  }

  function looksLikePayloadDump(text) {
    var s = String(text || '').trim();
    if (!s) return false;
    if (s.charAt(0) === '{' || s.charAt(0) === '[') return true;
    if (/^data:(image|audio|video)\//i.test(s)) return true;
    if (/^https?:\/\/\S+$/i.test(s) && s.length > 80) return true;
    return false;
  }

  function clip(text, max) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    max = max || BODY_MAX;
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)).replace(/\s+\S*$/, '').trim() + '…';
  }

  function buildThreadUrl(opts) {
    opts = opts || {};
    var path = '/communication-v2/';
    var parts = [];
    var groupId = String(opts.groupId || '').trim();
    var convId = String(opts.convId || '').trim();
    var messageId = String(opts.messageId || '').trim();
    if (groupId) parts.push('group=' + encodeURIComponent(groupId));
    else if (convId) parts.push('conv=' + encodeURIComponent(convId));
    if (messageId) parts.push('msg=' + encodeURIComponent(messageId));
    return parts.length ? path + '?' + parts.join('&') : path;
  }

  function readQuery(href) {
    var out = { convId: '', groupId: '', messageId: '', pathname: '', url: '' };
    if (!href) return out;
    try {
      var base =
        typeof location !== 'undefined' && location.origin
          ? location.origin
          : 'https://sbd.marriageducation.com';
      var u = href instanceof URL ? href : new URL(String(href), base);
      out.pathname = u.pathname || '';
      out.convId = u.searchParams.get('conv') || '';
      out.groupId = u.searchParams.get('group') || '';
      out.messageId = u.searchParams.get('msg') || '';
      out.url = u.pathname + u.search;
      return out;
    } catch (_) {
      return out;
    }
  }

  function parseThreadTarget(urlOrData) {
    var convId = '';
    var groupId = '';
    var messageId = '';
    var url = '';
    var type = '';
    if (!urlOrData) {
      return { convId: '', groupId: '', messageId: '', url: '/communication-v2/', type: '', kind: '' };
    }
    if (typeof urlOrData === 'string' || (typeof URL !== 'undefined' && urlOrData instanceof URL)) {
      var fromUrl = readQuery(urlOrData);
      convId = fromUrl.convId;
      groupId = fromUrl.groupId;
      messageId = fromUrl.messageId;
      url = fromUrl.url || String(urlOrData);
    } else {
      var data = urlOrData.data || urlOrData;
      type = String(data.type || '');
      convId = String(data.convId || '');
      groupId = String(data.groupId || '');
      messageId = String(data.messageId || '');
      url = String(data.url || '');
      if (!url && data.notification && data.notification.click_action) {
        url = String(data.notification.click_action);
      }
      if (url) {
        var parsed = readQuery(url);
        if (!convId) convId = parsed.convId;
        if (!groupId) groupId = parsed.groupId;
        if (!messageId) messageId = parsed.messageId;
        if (parsed.url) url = parsed.url;
      }
    }
    if (type === 'dm') type = 'direct_message';
    if (type === 'group') type = 'group_message';
    if (!groupId && type === 'group_message') groupId = convId;
    if (!url) url = buildThreadUrl({ convId: convId, groupId: groupId, messageId: messageId });
    var kind = groupId ? 'group' : convId ? 'direct' : '';
    if (!type) {
      type = kind === 'group' ? 'group_message' : kind === 'direct' ? 'direct_message' : '';
    }
    return {
      convId: convId,
      groupId: groupId,
      messageId: messageId,
      url: url,
      type: type,
      kind: kind,
    };
  }

  function isCe2Path(pathname) {
    var p = String(pathname || '');
    if (p.length > 1 && p.charAt(p.length - 1) === '/') p = p.slice(0, -1);
    return p === CE2_PATH || p.indexOf(CE2_PATH + '/') === 0;
  }

  function normalizePushPayload(payload) {
    payload = payload || {};
    var data = payload.data || payload;
    var notif = payload.notification || {};
    var type = String(data.type || '');
    if (type === 'dm') type = 'direct_message';
    if (type === 'group') type = 'group_message';
    var convId = String(data.convId || '');
    var groupId = String(data.groupId || '');
    var messageId = String(data.messageId || '');
    if (type === 'group_message' && !groupId) groupId = convId;
    var url = String(data.url || notif.click_action || '');
    var target = parseThreadTarget({
      type: type,
      convId: convId,
      groupId: groupId,
      messageId: messageId,
      url: url,
    });
    var title = String(notif.title || data.title || '').trim();
    var body = String(notif.body || data.body || '').trim();
    if (looksLikePayloadDump(title)) title = '';
    if (looksLikePayloadDump(body)) body = '';
    if (!title) {
      title =
        target.kind === 'group'
          ? String(data.groupName || 'Group').trim() || 'Group'
          : String(data.senderName || 'New message').trim() || 'New message';
    }
    if (!body) body = 'New message';
    return {
      type: target.type,
      convId: target.convId,
      groupId: target.groupId,
      messageId: target.messageId,
      url: target.url,
      title: title,
      body: clip(body, BODY_MAX),
      senderId: String(data.senderId || ''),
      tag:
        String(data.tag || '') ||
        (target.groupId
          ? 'group-' + target.groupId
          : target.convId
            ? 'dm-' + target.convId
            : 'sbd-notification'),
    };
  }

  function shouldSuppressForeground(opts) {
    opts = opts || {};
    if (opts.isSender) return true;
    if (opts.muted) return true;
    if (opts.permissionDenied) return true;
    if (opts.threadOpen && opts.documentVisible) return true;
    return false;
  }

  function applyAppBadge(nav, count) {
    if (!nav) return;
    var n = typeof count === 'number' && isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    try {
      if (n > 0 && typeof nav.setAppBadge === 'function') {
        return nav.setAppBadge(n);
      }
      if (typeof nav.clearAppBadge === 'function') {
        return nav.clearAppBadge();
      }
    } catch (_) {}
  }

  function shoutingUnreadTotal(rows) {
    var total = 0;
    (rows || []).forEach(function (row) {
      if (!row || row.muted) return;
      var n = row.unread || 0;
      if (n > 0) total += n;
    });
    return total;
  }

  function clientOrigin(clientUrl, fallbackOrigin) {
    try {
      return new URL(clientUrl).origin;
    } catch (_) {
      return fallbackOrigin || '';
    }
  }

  function clientPathname(clientUrl) {
    try {
      return new URL(clientUrl).pathname;
    } catch (_) {
      return '';
    }
  }

  function absoluteUrl(url, origin) {
    var s = String(url || '/communication-v2/');
    if (/^https?:\/\//i.test(s)) return s;
    var base = String(origin || '').replace(/\/$/, '');
    if (s.charAt(0) !== '/') s = '/' + s;
    return base + s;
  }

  function notificationClickPlan(windowClients, targetUrl, origin) {
    var target = parseThreadTarget(targetUrl);
    var abs = absoluteUrl(target.url || targetUrl || '/communication-v2/', origin);
    var targetPath = '';
    try {
      targetPath = new URL(abs).pathname;
    } catch (_) {}
    var ce2 = null;
    var other = null;
    (windowClients || []).forEach(function (client) {
      if (!client || !client.url) return;
      if (clientOrigin(client.url, origin) !== origin) return;
      if (!other) other = client;
      if (!ce2 && isCe2Path(clientPathname(client.url))) ce2 = client;
    });
    if (ce2 && isCe2Path(targetPath)) {
      return {
        action: 'focus-message',
        client: ce2,
        url: abs,
        message: {
          type: OPEN_MESSAGE_TYPE,
          convId: target.convId,
          groupId: target.groupId,
          messageId: target.messageId,
          url: target.url,
        },
      };
    }
    if (other) {
      return { action: 'navigate', client: other, url: abs };
    }
    return { action: 'open', url: abs };
  }

  function pushCopy(opts) {
    opts = opts || {};
    var kind = opts.kind === 'group' ? 'group' : 'direct';
    var title = String(opts.title || '').trim();
    if (looksLikePayloadDump(title)) title = '';
    if (!title) {
      title =
        kind === 'group'
          ? String(opts.groupName || 'Group').trim() || 'Group'
          : String(opts.senderName || 'New message').trim() || 'New message';
    }
    var body = String(opts.body || '').trim();
    if (looksLikePayloadDump(body)) body = '';
    if (!body) body = 'New message';
    return { title: title, body: clip(body, opts.max || BODY_MAX) };
  }

  var api = {
    VERSION: VERSION,
    OPEN_MESSAGE_TYPE: OPEN_MESSAGE_TYPE,
    inboxPrefId: inboxPrefId,
    looksLikePayloadDump: looksLikePayloadDump,
    clip: clip,
    buildThreadUrl: buildThreadUrl,
    parseThreadTarget: parseThreadTarget,
    isCe2Path: isCe2Path,
    normalizePushPayload: normalizePushPayload,
    shouldSuppressForeground: shouldSuppressForeground,
    applyAppBadge: applyAppBadge,
    shoutingUnreadTotal: shoutingUnreadTotal,
    notificationClickPlan: notificationClickPlan,
    absoluteUrl: absoluteUrl,
    pushCopy: pushCopy,
  };

  root.Ce2Push = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(
  typeof self !== 'undefined'
    ? self
    : typeof window !== 'undefined'
      ? window
      : typeof globalThis !== 'undefined'
        ? globalThis
        : this
);
