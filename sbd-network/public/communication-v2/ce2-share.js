/**
 * CE2 Phase 3 — board post share tokens + messenger return links.
 * Also the share-into-thread payload helpers (formation / board moments).
 */
(function (global) {
  'use strict';

  var FROM_MESSENGER = 'ce2';
  var MESSENGER_PATH = '/communication-v2/';
  var BOARDS_PATH = '/boards.html';
  var BOARD_RETURN_KEY = 'sbd.ce2.boardReturn';
  var DEFAULT_SHARE_CONTENT = 'Shared a board post';
  var CARD_KICKER = 'Board share';
  var ID_RE = /^[A-Za-z0-9._-]{1,200}$/;
  var SBD_RETURN_SURFACES = [
    '/communication-v2',
    '/board',
    '/boards',
    '/dashboard',
    '/group',
    '/learn',
  ];

  function originBase() {
    return global.location ? global.location.origin : 'https://sbd-network.web.app';
  }

  function safeId(value) {
    var s = String(value || '').trim();
    return ID_RE.test(s) ? s : '';
  }

  function parseBoardPostUrl(raw) {
    if (!raw) return null;
    var text = String(raw);
    var matches = text.match(/https?:\/\/[^\s<>"']+|\/board(?:\.html)?\?[^\s<>"']+/gi) || [text];
    for (var i = 0; i < matches.length; i += 1) {
      try {
        var u = new URL(matches[i].trim(), originBase());
        var boardId = u.searchParams.get('boardId') || u.searchParams.get('id');
        var postId = u.searchParams.get('post');
        if (boardId && postId) return { boardId: boardId, postId: postId, url: u.href };
      } catch (_) {}
    }
    return null;
  }

  function shareHref(boardId, postId, token) {
    return (
      originBase() +
      '/board.html?boardId=' +
      encodeURIComponent(boardId) +
      '&post=' +
      encodeURIComponent(postId) +
      (token ? '&ce2token=' + encodeURIComponent(token) : '')
    );
  }

  /**
   * Normalize conversation or query-param shapes into a messenger return payload.
   * Stored share URLs stay clean; return params are added only at click/render time.
   */
  function normalizeMessengerReturn(info) {
    if (!info) return null;
    var conv = '';
    var group = '';
    if (info.type === 'group') {
      group = safeId(info.id || info.group);
    } else if (info.type === 'direct') {
      conv = safeId(info.id || info.conv);
    } else {
      conv = safeId(info.conv);
      group = safeId(info.group);
      if (!conv && !group) conv = safeId(info.id);
    }
    if (info.from && info.from !== FROM_MESSENGER) return null;
    return { from: FROM_MESSENGER, conv: conv, group: group };
  }

  function withMessengerReturn(href, info) {
    if (!href) return href;
    var ret = arguments.length < 2 ? { from: FROM_MESSENGER, conv: '', group: '' } : normalizeMessengerReturn(info);
    if (!ret) return href;
    try {
      var u = new URL(String(href), originBase());
      u.searchParams.set('from', FROM_MESSENGER);
      if (ret.group) {
        u.searchParams.set('group', ret.group);
        u.searchParams.delete('conv');
      } else if (ret.conv) {
        u.searchParams.set('conv', ret.conv);
        u.searchParams.delete('group');
      } else {
        u.searchParams.delete('conv');
        u.searchParams.delete('group');
      }
      return u.href;
    } catch (_) {
      return href;
    }
  }

  function messengerReturnHref(info) {
    var ret = normalizeMessengerReturn(info) || { from: FROM_MESSENGER, conv: '', group: '' };
    if (ret.group) return MESSENGER_PATH + '?group=' + encodeURIComponent(ret.group);
    if (ret.conv) return MESSENGER_PATH + '?conv=' + encodeURIComponent(ret.conv);
    return MESSENGER_PATH;
  }

  function parseMessengerReturnFromSearch(search) {
    var params;
    try {
      if (search && typeof search.get === 'function') {
        params = search;
      } else {
        params = new URLSearchParams(search || '');
      }
    } catch (_) {
      return null;
    }
    if (params.get('from') !== FROM_MESSENGER) return null;
    return {
      from: FROM_MESSENGER,
      conv: safeId(params.get('conv')),
      group: safeId(params.get('group')),
    };
  }

  function storageApi() {
    try {
      if (global.sessionStorage) return global.sessionStorage;
    } catch (_) {}
    return null;
  }

  function persistMessengerReturn(info) {
    var store = storageApi();
    if (!store) return false;
    try {
      var ret = normalizeMessengerReturn(info);
      if (ret && ret.from === FROM_MESSENGER) {
        store.setItem(BOARD_RETURN_KEY, JSON.stringify(ret));
        return true;
      }
      store.removeItem(BOARD_RETURN_KEY);
      return false;
    } catch (_) {
      return false;
    }
  }

  function readStoredMessengerReturn() {
    var store = storageApi();
    if (!store) return null;
    try {
      var raw = store.getItem(BOARD_RETURN_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return normalizeMessengerReturn(parsed);
    } catch (_) {
      return null;
    }
  }

  function clearStoredMessengerReturn() {
    var store = storageApi();
    if (!store) return;
    try {
      store.removeItem(BOARD_RETURN_KEY);
    } catch (_) {}
  }

  function shouldKeepStoredReturn(pathname) {
    var path = String(pathname || '');
    try {
      if (/^https?:\/\//i.test(path)) path = new URL(path).pathname || '';
    } catch (_) {}
    var i;
    for (i = 0; i < SBD_RETURN_SURFACES.length; i += 1) {
      if (path.indexOf(SBD_RETURN_SURFACES[i]) === 0) return true;
    }
    return false;
  }

  function shareThreadTarget(info) {
    var ret = normalizeMessengerReturn(info);
    if (!ret) return null;
    if (ret.group) return { type: 'group', id: ret.group };
    if (ret.conv) return { type: 'direct', id: ret.conv };
    return { type: '', id: '' };
  }

  function isPreferredShareTarget(target, returnInfo) {
    var pref = shareThreadTarget(returnInfo);
    if (!pref || !pref.id || !target) return false;
    return String(pref.type) === String(target.type) && String(pref.id) === String(target.id);
  }

  function sortShareTargets(targets, returnInfo) {
    var list = Array.isArray(targets) ? targets.slice() : [];
    list.sort(function (a, b) {
      var ap = isPreferredShareTarget(a, returnInfo) ? 0 : 1;
      var bp = isPreferredShareTarget(b, returnInfo) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      var at = a && a.lastActivityAt ? Number(a.lastActivityAt) : 0;
      var bt = b && b.lastActivityAt ? Number(b.lastActivityAt) : 0;
      if (bt !== at) return bt - at;
      return String((a && a.name) || '').localeCompare(String((b && b.name) || ''));
    });
    return list;
  }

  function boardsHrefWithReturn(info) {
    var ret = normalizeMessengerReturn(info) || { from: FROM_MESSENGER, conv: '', group: '' };
    var href = BOARDS_PATH + '?from=' + encodeURIComponent(FROM_MESSENGER);
    if (ret.group) return href + '&group=' + encodeURIComponent(ret.group);
    if (ret.conv) return href + '&conv=' + encodeURIComponent(ret.conv);
    return href;
  }

  function clipText(value, max) {
    var s = String(value == null ? '' : value).trim();
    if (!s) return '';
    max = max || 200;
    return s.length > max ? s.slice(0, max) : s;
  }

  function shareContentFromNote(note) {
    var s = clipText(note, 240);
    return s || DEFAULT_SHARE_CONTENT;
  }

  /**
   * Normalize a board-share card payload for ce2_messages.boardShare.
   * Stored URLs stay clean (no from/conv); return params are added at render time.
   */
  function buildBoardSharePayload(opts) {
    opts = opts || {};
    var boardId = String(opts.boardId || '').trim();
    var postId = String(opts.postId || '').trim();
    var token = String(opts.token || '').trim();
    var title = clipText(opts.title, 120);
    var excerpt = clipText(opts.excerpt, 200);
    var note = clipText(opts.note, 240);
    var thumbnailUrl = String(opts.thumbnailUrl || opts.thumbUrl || opts.imageUrl || '').trim();
    var mediaType = String(opts.mediaType || '').trim();
    var mediaUrl = String(opts.mediaUrl || '').trim();
    var url = String(opts.url || '').trim() || (boardId && postId ? shareHref(boardId, postId, token) : '');
    return {
      boardId: boardId,
      postId: postId,
      token: token,
      url: url,
      thumbnailUrl: thumbnailUrl,
      mediaType: mediaType,
      mediaUrl: mediaUrl,
      selectedMedia: !!opts.selectedMedia,
      note: note,
      title: title || excerpt || note || 'Board post',
      excerpt: excerpt,
    };
  }

  function isValidBoardSharePayload(bs) {
    return !!(
      bs &&
      String(bs.boardId || '').trim() &&
      String(bs.postId || '').trim() &&
      typeof bs.token === 'string'
    );
  }

  function newTokenId() {
    return 'bs_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /**
   * @param {firebase.firestore.Firestore} db
   * @param {string} uid
   * @param {string} boardId
   * @param {string} postId
   * @param {string} [title]
   */
  async function mintBoardShareToken(db, uid, boardId, postId, title) {
    var token = newTokenId();
    await db
      .collection('ce2_share_tokens')
      .doc(token)
      .set({
        boardId: boardId,
        postId: postId,
        title: title || '',
        createdBy: uid,
        createdAt: firebase.firestore.Timestamp.now(),
      });
    return token;
  }

  function boardShareThumbUrl(bs) {
    if (!bs) return '';
    return String(bs.thumbnailUrl || bs.thumbUrl || bs.imageUrl || '').trim();
  }

  function renderBoardShareHtml(m, escapeHtml, returnInfo) {
    var bs = m.boardShare;
    if (!bs || !bs.boardId || !bs.postId) return '';
    var href = withMessengerReturn(bs.url || shareHref(bs.boardId, bs.postId, bs.token), returnInfo || { from: FROM_MESSENGER });
    var title = escapeHtml(bs.title || 'Board post');
    var excerpt = escapeHtml((bs.excerpt || m.content || '').slice(0, 120));
    var note = bs.note ? escapeHtml(String(bs.note).slice(0, 240)) : '';
    var thumb = boardShareThumbUrl(bs);
    var safeThumb = thumb ? escapeHtml(thumb).replace(/"/g, '&quot;') : '';
    // Keep the thumbnail outside the <a>. Wrapping it in the link made
    // long-press/click-to-reply a no-op: isInteractiveMsgTarget skipped the
    // message menu, and iOS often stole the image gesture (save/open sheet).
    var thumbHtml =
      '<button type="button" class="ce2-board-share-thumb' +
      (thumb ? ' is-deferred' : ' is-fallback') +
      '" aria-label="Reply to this message">' +
      '<span class="ce2-board-share-thumb-ph" aria-hidden="true"></span>' +
      (thumb
        ? '<img class="ce2-board-share-thumb-img" data-ce2-src="' +
          safeThumb +
          '" alt="" loading="lazy" decoding="async" draggable="false">'
        : '') +
      '</button>';
    var bodyHtml =
      '<a class="ce2-board-share-body" href="' +
      href.replace(/"/g, '&quot;') +
      '">' +
      '<span class="ce2-board-share-kicker">' +
      CARD_KICKER +
      '</span>' +
      '<span class="ce2-board-share-title">' +
      title +
      '</span>' +
      (excerpt
        ? '<span class="ce2-board-share-excerpt">' + excerpt + '</span>'
        : '') +
      (note ? '<span class="ce2-board-share-note">' + note + '</span>' : '') +
      '<span class="ce2-board-share-cta">Open post</span></a>';
    return '<div class="ce2-board-share">' + thumbHtml + bodyHtml + '</div>';
  }

  global.Ce2Share = {
    parseBoardPostUrl: parseBoardPostUrl,
    mintBoardShareToken: mintBoardShareToken,
    shareHref: shareHref,
    withMessengerReturn: withMessengerReturn,
    messengerReturnHref: messengerReturnHref,
    parseMessengerReturnFromSearch: parseMessengerReturnFromSearch,
    normalizeMessengerReturn: normalizeMessengerReturn,
    persistMessengerReturn: persistMessengerReturn,
    readStoredMessengerReturn: readStoredMessengerReturn,
    clearStoredMessengerReturn: clearStoredMessengerReturn,
    shouldKeepStoredReturn: shouldKeepStoredReturn,
    shareThreadTarget: shareThreadTarget,
    isPreferredShareTarget: isPreferredShareTarget,
    sortShareTargets: sortShareTargets,
    boardsHrefWithReturn: boardsHrefWithReturn,
    buildBoardSharePayload: buildBoardSharePayload,
    isValidBoardSharePayload: isValidBoardSharePayload,
    shareContentFromNote: shareContentFromNote,
    boardShareThumbUrl: boardShareThumbUrl,
    renderBoardShareHtml: renderBoardShareHtml,
    FROM_MESSENGER: FROM_MESSENGER,
    BOARD_RETURN_KEY: BOARD_RETURN_KEY,
    DEFAULT_SHARE_CONTENT: DEFAULT_SHARE_CONTENT,
    CARD_KICKER: CARD_KICKER,
    VERSION: 5,
  };
})(typeof window !== 'undefined' ? window : global);
