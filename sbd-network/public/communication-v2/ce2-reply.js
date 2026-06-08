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

  global.Ce2Reply = {
    buildReplyPayload: buildReplyPayload,
    renderReplyQuoteHtml: renderReplyQuoteHtml,
    VERSION: 2,
  };
})(typeof window !== 'undefined' ? window : global);
