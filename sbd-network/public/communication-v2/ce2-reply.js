/**
 * CE2 Phase 6 — reply / quote
 */
(function (global) {
  'use strict';

  function plainPreview(text) {
    var t = String(text || '');
    if (global.Ce2Format && global.Ce2Format.stripFormattingForPreview) {
      t = global.Ce2Format.stripFormattingForPreview(t);
    }
    return t.slice(0, 120);
  }

  function buildReplyPayload(message, senderName) {
    if (!message) return null;
    var preview = plainPreview(message.content || '');
    if (!preview && message.imageUrl) preview = 'Photo';
    if (!preview && message.videoUrl) preview = 'Video';
    if (!preview && message.audioUrl) preview = 'Voice message';
    if (!preview && message.messageType === 'board_share') preview = 'Board post';
    return {
      messageId: message.id || '',
      senderId: message.senderId || '',
      senderName: senderName || 'Member',
      preview: preview || 'Message',
    };
  }

  function renderReplyQuoteHtml(replyTo, escapeHtml) {
    if (!replyTo) return '';
    var mid = replyTo.messageId ? ' data-reply-to-id="' + escapeHtml(replyTo.messageId) + '"' : '';
    return (
      '<button type="button" class="ce2-reply-quote"' +
      mid +
      ' aria-label="Replied to ' +
      escapeHtml(replyTo.senderName || 'Member') +
      '">' +
      '<span class="ce2-reply-quote-bar" aria-hidden="true"></span>' +
      '<span class="ce2-reply-quote-body">' +
      '<span class="ce2-reply-quote-name">' +
      escapeHtml(replyTo.senderName || 'Member') +
      '</span>' +
      '<span class="ce2-reply-quote-text">' +
      escapeHtml(replyTo.preview || '') +
      '</span></span></button>'
    );
  }

  function cssAttrEscape(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function queryMessageRow(root, messageId) {
    if (!root || !root.querySelector || !messageId) return null;
    var safe = cssAttrEscape(messageId);
    return (
      root.querySelector('.ce2-row[data-message-id="' + safe + '"]') ||
      root.querySelector('[data-message-id="' + safe + '"]')
    );
  }

  function findReplyJumpFocus(row) {
    if (!row || !row.querySelector) return row || null;
    return (
      row.querySelector('.ce2-media-tap--video') ||
      row.querySelector('.ce2-msg-video-wrap') ||
      row.querySelector('.ce2-msg-video') ||
      row.querySelector('.ce2-media-tap') ||
      row.querySelector('.ce2-msg-audio-wrap') ||
      row.querySelector('.ce2-bubble') ||
      row
    );
  }

  /**
   * Align the quoted target to the top of #ce2MessageScroll (not the window).
   * Tall video cards stay above the composer so tap-to-play remains reachable.
   */
  function computeThreadScrollTop(scrollRect, focusRect, scrollTop, opts) {
    opts = opts || {};
    var padTop = opts.padTop != null ? Number(opts.padTop) : 12;
    if (!isFinite(padTop)) padTop = 12;
    var current = Number(scrollTop) || 0;
    if (!scrollRect || !focusRect) return current < 0 ? 0 : current;
    var next = current + (Number(focusRect.top) - Number(scrollRect.top)) - padTop;
    return next < 0 ? 0 : next;
  }

  function applyThreadScrollTop(scroll, top) {
    if (!scroll) return 0;
    var max = Math.max(0, (scroll.scrollHeight || 0) - (scroll.clientHeight || 0));
    var next = Number(top);
    if (!isFinite(next)) next = 0;
    if (next < 0) next = 0;
    if (next > max) next = max;
    scroll.scrollTop = next;
    return next;
  }

  function messageTimeMsFallback(m) {
    if (!m) return 0;
    if (typeof m.createdAtMs === 'number' && isFinite(m.createdAtMs)) return m.createdAtMs;
    var c = m.createdAt;
    if (!c) return 0;
    if (typeof c.toMillis === 'function') {
      try {
        return c.toMillis();
      } catch (_) {}
    }
    if (typeof c.seconds === 'number') return c.seconds * 1000;
    if (typeof c === 'number') return c;
    return 0;
  }

  /**
   * Union a jump slice with the live tail so later messages stay reachable.
   * A 16-message after-window must never replace the rest of the thread.
   */
  function connectJumpToLatest(jumpMsgs, liveMsgs, timeMsFn) {
    timeMsFn = timeMsFn || messageTimeMsFallback;
    var byId = {};
    var ids = [];
    function add(list) {
      (list || []).forEach(function (m) {
        if (!m || !m.id) return;
        if (!byId[m.id]) ids.push(m.id);
        byId[m.id] = Object.assign({}, byId[m.id] || {}, m);
      });
    }
    add(jumpMsgs);
    add(liveMsgs);
    return ids
      .map(function (id) {
        return byId[id];
      })
      .sort(function (a, b) {
        return timeMsFn(a) - timeMsFn(b);
      });
  }

  function laterMessagesUnreachable(rendered, jumpedId, laterIds) {
    var have = {};
    (rendered || []).forEach(function (m) {
      var id = m && typeof m === 'object' ? m.id : m;
      if (id) have[id] = true;
    });
    if (jumpedId && !have[jumpedId]) return true;
    for (var i = 0; i < (laterIds || []).length; i++) {
      if (!have[laterIds[i]]) return true;
    }
    return false;
  }

  function isScrolledToLatest(scroll, threshold) {
    threshold = threshold == null ? 56 : Number(threshold);
    if (!isFinite(threshold)) threshold = 56;
    if (!scroll) return true;
    var room =
      (Number(scroll.scrollHeight) || 0) -
      (Number(scroll.scrollTop) || 0) -
      (Number(scroll.clientHeight) || 0);
    return room < threshold;
  }

  function shouldShowLatestControl(opts) {
    opts = opts || {};
    if (!opts.threadOpen) return false;
    if (opts.atLatest) return false;
    return true;
  }

  global.Ce2Reply = {
    buildReplyPayload: buildReplyPayload,
    renderReplyQuoteHtml: renderReplyQuoteHtml,
    cssAttrEscape: cssAttrEscape,
    queryMessageRow: queryMessageRow,
    findReplyJumpFocus: findReplyJumpFocus,
    computeThreadScrollTop: computeThreadScrollTop,
    applyThreadScrollTop: applyThreadScrollTop,
    connectJumpToLatest: connectJumpToLatest,
    laterMessagesUnreachable: laterMessagesUnreachable,
    isScrolledToLatest: isScrolledToLatest,
    shouldShowLatestControl: shouldShowLatestControl,
    VERSION: 4,
  };
})(typeof window !== 'undefined' ? window : global);
