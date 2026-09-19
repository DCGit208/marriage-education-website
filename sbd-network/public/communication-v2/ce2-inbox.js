/**
 * CE2 inbox — conversation-list preview, unread merge, mute/pin sort.
 * Per-user prefs live in users/{uid}/ce2_inbox/{prefId}; never on the shared conv doc.
 */
(function (global) {
  'use strict';

  var PREVIEW_MAX = 72;
  var QUOTE_MAX = 36;
  var VERSION = 3;

  function clip(text, max) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    max = max || PREVIEW_MAX;
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)).replace(/\s+\S*$/, '').trim() + '…';
  }

  function tsMs(ts) {
    if (!ts && ts !== 0) return 0;
    if (typeof ts === 'number' && isFinite(ts)) {
      if (ts > 1e12) return ts;
      if (ts > 1e9) return ts * 1000;
      return ts;
    }
    try {
      if (typeof ts.toMillis === 'function') return ts.toMillis();
      if (typeof ts.toDate === 'function') return ts.toDate().getTime();
      if (typeof ts.seconds === 'number') return ts.seconds * 1000;
      if (ts instanceof Date) return ts.getTime();
    } catch (_) {}
    return 0;
  }

  function prefId(kind, threadId) {
    var id = String(threadId || '').trim();
    if (!id) return '';
    return (kind === 'group' ? 'g__' : 'd__') + id;
  }

  function parsePrefId(id) {
    var s = String(id || '');
    if (s.indexOf('g__') === 0) return { kind: 'group', threadId: s.slice(3) };
    if (s.indexOf('d__') === 0) return { kind: 'direct', threadId: s.slice(3) };
    return null;
  }

  function looksLikeBareLink(text) {
    var s = String(text || '').trim();
    if (!s) return false;
    var urls = s.match(/https?:\/\/[^\s<>"']+/gi);
    if (!urls || !urls.length) return false;
    var rest = s;
    urls.forEach(function (u) {
      rest = rest.split(u).join(' ');
    });
    return rest.replace(/\s+/g, ' ').trim() === '';
  }

  function looksLikePayloadDump(text) {
    var s = String(text || '').trim();
    if (!s) return false;
    if (s.charAt(0) === '{' || s.charAt(0) === '[') return true;
    if (/^data:(image|audio|video)\//i.test(s)) return true;
    if (/^https?:\/\/\S+$/i.test(s) && s.length > 80) return true;
    return false;
  }

  function stripText(text, stripFn) {
    var s = String(text || '');
    if (typeof stripFn === 'function') {
      try {
        s = stripFn(s);
      } catch (_) {}
    }
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (looksLikePayloadDump(s)) return '';
    return s;
  }

  function mediaKind(meta) {
    meta = meta || {};
    var type = String(meta.messageType || meta.lastMessageType || '').toLowerCase();
    if (
      type === 'voice' ||
      type === 'audio' ||
      meta.audioUrl ||
      meta._localAudioUrl
    ) {
      return 'voice';
    }
    if (type === 'image' || type === 'photo' || meta.imageUrl) return 'photo';
    if (type === 'video' || meta.videoUrl) return 'video';
    if (type === 'board_share' || meta.boardShare) return 'board';
    return '';
  }

  function normalizeMediaLabel(body) {
    var s = String(body || '').trim();
    if (/^voice(\s+note|\s+message)?$/i.test(s)) return { kind: 'voice', body: '' };
    if (/^photo$/i.test(s) || /^image$/i.test(s)) return { kind: 'photo', body: '' };
    if (/^video$/i.test(s)) return { kind: 'video', body: '' };
    if (/^(shared\s+a\s+)?board(\s+post)?$/i.test(s)) return { kind: 'board', body: '' };
    return { kind: '', body: s };
  }

  function boardTitle(meta, body, stripFn) {
    var bs = meta && meta.boardShare;
    var title = '';
    if (bs && (bs.title || bs.note)) {
      title = stripText(bs.title || bs.note, stripFn);
    }
    if (!title) title = stripText(meta && meta.lastBoardTitle, stripFn);
    if (!title && body) title = body;
    if (!title || /^board post$/i.test(title) || /^shared a board post$/i.test(title)) {
      return 'Board post';
    }
    return clip(title, PREVIEW_MAX);
  }

  /**
   * One-line inbox preview. Never dumps raw payloads or long bodies.
   * @param {object} meta message patch or conversation meta
   * @param {{strip?: function, max?: number}} [opts]
   */
  function formatLastPreview(meta, opts) {
    meta = meta || {};
    opts = opts || {};
    if (meta.deleted) return 'Message removed';

    var stripFn = opts.strip;
    var raw = meta.content != null ? meta.content : meta.lastPreview;
    var body = stripText(raw, stripFn);
    var labeled = normalizeMediaLabel(body);
    var kind = mediaKind(meta) || labeled.kind;
    body = labeled.body;

    var label = '';
    if (kind === 'voice') label = 'Voice note';
    else if (kind === 'photo') label = 'Photo';
    else if (kind === 'video') label = 'Video';
    else if (kind === 'board') label = boardTitle(meta, body, stripFn);
    else if (looksLikeBareLink(raw) || looksLikeBareLink(body)) label = 'Link';
    else label = clip(body, opts.max || PREVIEW_MAX);

    var reply = meta.replyTo;
    if (reply) {
      var quote = stripText(reply.preview, stripFn);
      if (quote) quote = clip(quote, QUOTE_MAX);
      if (quote) {
        if (label && label !== quote) return '↩ ' + quote + ' · ' + label;
        return '↩ ' + quote;
      }
    }
    return label || '';
  }

  function unreadBadgeMode(unread, muted) {
    if (!unread || unread <= 0) return 'none';
    if (muted) return 'dot';
    return 'count';
  }

  function formatUnreadCount(n) {
    var x = typeof n === 'number' ? n : 0;
    if (x <= 0) return '';
    if (x > 99) return '99+';
    return String(x);
  }

  function shoutingUnread(row) {
    if (!row || row.muted) return 0;
    var n = row.unread || 0;
    return n > 0 ? n : 0;
  }

  function normalizePref(data) {
    data = data || {};
    var sortAt = 0;
    if (typeof data.sortAt === 'number' && isFinite(data.sortAt)) sortAt = data.sortAt;
    else sortAt = tsMs(data.sortAt);
    return {
      muted: !!data.muted,
      pinned: !!data.pinned,
      sortAt: sortAt > 0 ? sortAt : 0,
    };
  }

  function prefWritePayload(kind, threadId, pref) {
    pref = normalizePref(pref);
    return {
      muted: !!pref.muted,
      pinned: !!pref.pinned,
      sortAt: pref.muted && pref.sortAt > 0 ? pref.sortAt : 0,
      threadType: kind === 'group' ? 'group' : 'direct',
      threadId: String(threadId || ''),
    };
  }

  /**
   * Muted incoming messages keep the previous sort key so they do not bump.
   * Own sends and unmuted threads follow last activity.
   */
  function sortAtForIncoming(pref, lastActivityAt, fromSelf) {
    var activity = tsMs(lastActivityAt);
    pref = pref || {};
    if (fromSelf || !pref.muted) return activity;
    if (typeof pref.sortAt === 'number' && pref.sortAt > 0) return pref.sortAt;
    return activity;
  }

  function compareInboxRows(a, b) {
    a = a || {};
    b = b || {};
    var ap = a.pinned ? 1 : 0;
    var bp = b.pinned ? 1 : 0;
    if (bp !== ap) return bp - ap;
    var at = typeof a.sortAt === 'number' && a.sortAt > 0 ? a.sortAt : tsMs(a.lastActivityAt);
    var bt = typeof b.sortAt === 'number' && b.sortAt > 0 ? b.sortAt : tsMs(b.lastActivityAt);
    if (bt !== at) return bt - at;
    return String(a.name || a.label || '').localeCompare(String(b.name || b.label || ''));
  }

  function sortInboxRows(rows) {
    return (rows || []).slice().sort(compareInboxRows);
  }

  function applyLocalRead(row, atMs) {
    if (!row) return row;
    row.unread = 0;
    row._localReadAt = atMs || Date.now();
    return row;
  }

  /**
   * Merge server unread onto a list row without restoring a count the user just cleared.
   */
  function mergeUnreadFromMeta(row, meta, uid, unreadCountFn) {
    if (!row) return row;
    var derived = 0;
    if (typeof unreadCountFn === 'function') {
      derived = unreadCountFn(meta, uid) || 0;
    }
    var localAt = row._localReadAt || 0;
    if (localAt) {
      var lastReadMs = tsMs(meta && meta.lastRead && meta.lastRead[uid]);
      if (derived === 0 && lastReadMs && lastReadMs >= localAt - 2000) {
        row._localReadAt = 0;
        row.unread = 0;
        return row;
      }
      if (derived > 0 && (!lastReadMs || lastReadMs < localAt)) {
        row.unread = 0;
        return row;
      }
      row._localReadAt = 0;
    }
    row.unread = derived;
    return row;
  }

  function applyPrefToRow(row, pref, lastSenderId, selfUid) {
    if (!row) return row;
    pref = normalizePref(pref);
    row.muted = !!pref.muted;
    row.pinned = !!pref.pinned;
    row.sortAt = sortAtForIncoming(pref, row.lastActivityAt, lastSenderId === selfUid);
    return row;
  }

  function truncatedUidLabel(uid) {
    var s = String(uid || '').trim();
    if (!s) return 'Direct';
    if (s.length <= 8) return s;
    return s.slice(0, 8) + '…';
  }

  function isPlaceholderPeerLabel(label, otherUid) {
    var s = String(label || '').trim();
    if (!s) return true;
    if (s === 'Direct' || s === 'Conversation' || s === 'Member') return true;
    return s === truncatedUidLabel(otherUid);
  }

  /**
   * Name for a DM row from list data only. Prefer a cached real name;
   * otherwise a short uid so the row can paint before users/{uid} returns.
   */
  function peerLabelFromList(otherUid, cached) {
    cached = cached || {};
    var name = String(cached.name || cached.label || '').trim();
    if (name && !isPlaceholderPeerLabel(name, otherUid)) return name;
    return truncatedUidLabel(otherUid);
  }

  /**
   * Sidebar list mode. App boot and this list's Firestore snap may block;
   * mute/pin prefs, presence, and peer-profile hydrates must not.
   */
  function listPaintMode(opts) {
    opts = opts || {};
    if (opts.appLoading || opts.listPending) return 'loading';
    if (!opts.rowCount) return 'empty';
    return 'rows';
  }

  function connectionPrefersLitePaint(conn) {
    if (!conn) return false;
    if (conn.saveData) return true;
    var t = String(conn.effectiveType || '').toLowerCase();
    return t === 'slow-2g' || t === '2g';
  }

  global.Ce2Inbox = {
    VERSION: VERSION,
    PREVIEW_MAX: PREVIEW_MAX,
    prefId: prefId,
    parsePrefId: parsePrefId,
    tsMs: tsMs,
    clip: clip,
    formatLastPreview: formatLastPreview,
    unreadBadgeMode: unreadBadgeMode,
    formatUnreadCount: formatUnreadCount,
    shoutingUnread: shoutingUnread,
    normalizePref: normalizePref,
    prefWritePayload: prefWritePayload,
    sortAtForIncoming: sortAtForIncoming,
    compareInboxRows: compareInboxRows,
    sortInboxRows: sortInboxRows,
    applyLocalRead: applyLocalRead,
    mergeUnreadFromMeta: mergeUnreadFromMeta,
    applyPrefToRow: applyPrefToRow,
    looksLikePayloadDump: looksLikePayloadDump,
    truncatedUidLabel: truncatedUidLabel,
    isPlaceholderPeerLabel: isPlaceholderPeerLabel,
    peerLabelFromList: peerLabelFromList,
    listPaintMode: listPaintMode,
    connectionPrefersLitePaint: connectionPrefersLitePaint,
  };
})(typeof window !== 'undefined' ? window : global);
