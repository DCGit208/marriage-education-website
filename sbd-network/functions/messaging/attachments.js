const perms = require('./permissions');

function filterAttachmentsForConversation(attachments, conversationSecurityLevel) {
  return (attachments || []).filter(function (a) {
    return perms.canSendContentToConversation(a.minimumTier || 'foundation', conversationSecurityLevel);
  });
}

module.exports = { filterAttachmentsForConversation };
