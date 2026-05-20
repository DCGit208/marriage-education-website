/**
 * CE2 Phase 6 — unread counts and read receipts
 */
(function (global) {
  'use strict';

  function tsSeconds(ts) {
    if (!ts) return 0;
    try {
      return ts.toDate ? ts.toDate().getTime() / 1000 : ts.seconds || 0;
    } catch (_) {
      return 0;
    }
  }

  function unreadCount(meta, uid) {
    if (!meta || !uid) return 0;
    var map = meta.unreadCount || {};
    var n = map[uid];
    return typeof n === 'number' && n > 0 ? n : 0;
  }

  function hasUnread(meta, uid) {
    return unreadCount(meta, uid) > 0;
  }

  function markReadPatch(uid) {
    var patch = {};
    patch['lastRead.' + uid] = firebase.firestore.Timestamp.now();
    patch['unreadCount.' + uid] = 0;
    return patch;
  }

  function markRead(docRef, uid) {
    if (!docRef || !uid) return Promise.resolve();
    return docRef.set(markReadPatch(uid), { merge: true }).catch(function () {});
  }

  /**
   * Build merge patch to bump unread for recipients (not sender).
   * Uses plain integers (not FieldValue.increment) so Firestore rules can evaluate the write.
   * @param {string} senderUid
   * @param {string[]} recipientUids
   * @param {Object<string, number>} [existingUnread]
   */
  function incrementUnreadPatch(senderUid, recipientUids, existingUnread) {
    var patch = {};
    var base = existingUnread || {};
    (recipientUids || []).forEach(function (uid) {
      if (uid && uid !== senderUid) {
        var cur = base[uid];
        var n = typeof cur === 'number' && cur > 0 ? cur : 0;
        patch['unreadCount.' + uid] = n + 1;
      }
    });
    patch['lastSenderId'] = senderUid;
    return patch;
  }

  /**
   * @returns {'pending'|'sent'|'read'|''}
   */
  function deliveryStatus(message, selfUid, otherLastReadTs) {
    if (!message || message.senderId !== selfUid) return '';
    if (message._pending) return 'pending';
    if (!otherLastReadTs) return 'sent';
    var msgSec = tsSeconds(message.createdAt);
    var readSec = tsSeconds(otherLastReadTs);
    if (readSec >= msgSec) return 'read';
    return 'sent';
  }

  function statusLabel(status) {
    if (status === 'pending') return 'Sending…';
    if (status === 'read') return 'Read';
    if (status === 'sent') return 'Delivered';
    return '';
  }

  global.Ce2Receipts = {
    unreadCount: unreadCount,
    hasUnread: hasUnread,
    markRead: markRead,
    markReadPatch: markReadPatch,
    incrementUnreadPatch: incrementUnreadPatch,
    deliveryStatus: deliveryStatus,
    statusLabel: statusLabel,
    tsSeconds: tsSeconds,
    VERSION: 2,
  };
})(typeof window !== 'undefined' ? window : global);
