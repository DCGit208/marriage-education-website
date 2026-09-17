/**
 * CE2 Phase 3 — board post share tokens
 */
(function (global) {
  'use strict';

  function parseBoardPostUrl(raw) {
    if (!raw) return null;
    var text = String(raw);
    var matches = text.match(/https?:\/\/[^\s<>"']+|\/board(?:\.html)?\?[^\s<>"']+/gi) || [text];
    for (var i = 0; i < matches.length; i += 1) {
      try {
        var u = new URL(matches[i].trim(), global.location ? global.location.origin : 'https://sbd-network.web.app');
        var boardId = u.searchParams.get('boardId') || u.searchParams.get('id');
        var postId = u.searchParams.get('post');
        if (boardId && postId) return { boardId: boardId, postId: postId, url: u.href };
      } catch (_) {}
    }
    return null;
  }

  function shareHref(boardId, postId, token) {
    var origin = global.location ? global.location.origin : 'https://sbd-network.web.app';
    return (
      origin +
      '/board.html?boardId=' +
      encodeURIComponent(boardId) +
      '&post=' +
      encodeURIComponent(postId) +
      (token ? '&ce2token=' + encodeURIComponent(token) : '')
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

  function renderBoardShareHtml(m, escapeHtml) {
    var bs = m.boardShare;
    if (!bs || !bs.boardId || !bs.postId) return '';
    var href = bs.url || shareHref(bs.boardId, bs.postId, bs.token);
    var title = escapeHtml(bs.title || 'Board post');
    var excerpt = escapeHtml((bs.excerpt || m.content || '').slice(0, 120));
    var note = bs.note ? escapeHtml(String(bs.note).slice(0, 240)) : '';
    var thumb = bs.thumbnailUrl || bs.thumbUrl || bs.imageUrl || '';
    // Keep the thumbnail outside the <a>. Wrapping it in the link made
    // long-press/click-to-reply a no-op: isInteractiveMsgTarget skipped the
    // message menu, and iOS often stole the image gesture (save/open sheet).
    var thumbHtml = thumb
      ? '<button type="button" class="ce2-board-share-thumb" aria-label="Reply to this message">' +
        '<img class="ce2-board-share-thumb-img" src="' +
        escapeHtml(thumb).replace(/"/g, '&quot;') +
        '" alt="" loading="lazy" draggable="false"></button>'
      : '';
    var bodyHtml =
      '<a class="ce2-board-share-body" href="' +
      href.replace(/"/g, '&quot;') +
      '">' +
      (note ? '<span class="ce2-board-share-note">' + note + '</span>' : '') +
      '<span class="ce2-board-share-kicker">Board share</span>' +
      '<span class="ce2-board-share-title">' +
      title +
      '</span>' +
      (excerpt
        ? '<span class="ce2-board-share-excerpt">' + excerpt + '</span>'
        : '') +
      '<span class="ce2-board-share-cta">Open post →</span></a>';
    return '<div class="ce2-board-share">' + thumbHtml + bodyHtml + '</div>';
  }

  global.Ce2Share = {
    parseBoardPostUrl: parseBoardPostUrl,
    mintBoardShareToken: mintBoardShareToken,
    shareHref: shareHref,
    renderBoardShareHtml: renderBoardShareHtml,
    VERSION: 2,
  };
})(typeof window !== 'undefined' ? window : global);
