/**
 * CE2 Phase 3 — board post share tokens + messenger return links
 */
(function (global) {
  'use strict';

  var FROM_MESSENGER = 'ce2';
  var MESSENGER_PATH = '/communication-v2/';
  var ID_RE = /^[A-Za-z0-9._-]{1,200}$/;

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
      (thumb ? '' : ' is-fallback') +
      '" aria-label="Reply to this message">' +
      '<span class="ce2-board-share-thumb-ph" aria-hidden="true"></span>' +
      (thumb
        ? '<img class="ce2-board-share-thumb-img" src="' +
          safeThumb +
          '" alt="" loading="lazy" decoding="async" draggable="false">'
        : '') +
      '</button>';
    var bodyHtml =
      '<a class="ce2-board-share-body" href="' +
      href.replace(/"/g, '&quot;') +
      '">' +
      '<span class="ce2-board-share-kicker">Board share</span>' +
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
    boardShareThumbUrl: boardShareThumbUrl,
    renderBoardShareHtml: renderBoardShareHtml,
    FROM_MESSENGER: FROM_MESSENGER,
    VERSION: 3,
  };
})(typeof window !== 'undefined' ? window : global);
