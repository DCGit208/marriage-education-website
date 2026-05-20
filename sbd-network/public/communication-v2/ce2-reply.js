/**
 * CE2 Phase 6 — reply / quote
 */
(function (global) {
  'use strict';

  function buildReplyPayload(message, senderName) {
    if (!message) return null;
    var preview = (message.content || '').slice(0, 120);
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
    return (
      '<div class="ce2-reply-quote">' +
      '<span class="ce2-reply-quote-name">' +
      escapeHtml(replyTo.senderName || 'Member') +
      '</span>' +
      '<span class="ce2-reply-quote-text">' +
      escapeHtml(replyTo.preview || '') +
      '</span></div>'
    );
  }

  global.Ce2Reply = {
    buildReplyPayload: buildReplyPayload,
    renderReplyQuoteHtml: renderReplyQuoteHtml,
    VERSION: 1,
  };
})(typeof window !== 'undefined' ? window : global);
