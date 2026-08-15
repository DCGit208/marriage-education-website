/**
 * CE2 Phase 3 — board post share tokens
 */
(function (global) {
  'use strict';

  function parseBoardPostUrl(raw) {
    if (!raw) return null;
    try {
      var u = new URL(raw.trim(), global.location ? global.location.origin : 'https://sbd-network.web.app');
      var boardId = u.searchParams.get('boardId');
      var postId = u.searchParams.get('post');
      if (boardId && postId) return { boardId: boardId, postId: postId };
    } catch (_) {}
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
    return (
      '<a class="ce2-board-share" href="' +
      href.replace(/"/g, '&quot;') +
      '">' +
      '<span class="ce2-board-share-kicker">Board share</span>' +
      '<span class="ce2-board-share-title">' +
      title +
      '</span>' +
      (excerpt
        ? '<span class="ce2-board-share-excerpt">' + excerpt + '</span>'
        : '') +
      '<span class="ce2-board-share-cta">Open post →</span></a>'
    );
  }

  global.Ce2Share = {
    parseBoardPostUrl: parseBoardPostUrl,
    mintBoardShareToken: mintBoardShareToken,
    shareHref: shareHref,
    renderBoardShareHtml: renderBoardShareHtml,
    VERSION: 1,
  };
})(typeof window !== 'undefined' ? window : global);
