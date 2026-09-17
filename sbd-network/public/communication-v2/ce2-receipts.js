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
    if (meta.lastSenderId && meta.lastSenderId === uid) return 0;
    var lastRead = (meta.lastRead || {})[uid];
    var lastAt = meta.lastMessageAt;
    if (lastRead && lastAt) {
      var readSec = tsSeconds(lastRead);
      var msgSec = tsSeconds(lastAt);
      if (readSec > 0 && msgSec > 0 && readSec >= msgSec) return 0;
    }
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
   * Per-bubble send state for the author.
   * @returns {'pending'|'sent'|'delivered'|'read'|'failed'|''}
   */
  function deliveryStatus(message, selfUid, otherLastReadTs, extras) {
    extras = extras || {};
    if (!message || message.senderId !== selfUid) return '';
    if (message._failed || message.uploadState === 'failed') return 'failed';
    if (
      message._pending ||
      message.uploadState === 'uploading' ||
      message.uploadState === 'retrying'
    ) {
      return 'pending';
    }
    var msgSec = tsSeconds(message.createdAt);
    var readSec = tsSeconds(otherLastReadTs);
    if (msgSec > 0 && readSec >= msgSec) return 'read';
    if (extras.otherOnline) return 'delivered';
    var activeMs = extras.otherLastActiveMs;
    if (typeof activeMs === 'number' && activeMs > 0 && msgSec > 0 && activeMs / 1000 >= msgSec) {
      return 'delivered';
    }
    return 'sent';
  }

  function statusLabel(status) {
    if (status === 'pending') return 'Sending…';
    if (status === 'sent') return 'Sent';
    if (status === 'delivered') return 'Delivered';
    if (status === 'read') return 'Read';
    if (status === 'failed') return 'Failed to send';
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
    VERSION: 4,
  };
})(typeof window !== 'undefined' ? window : global);
