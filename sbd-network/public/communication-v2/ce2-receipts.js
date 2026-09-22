/**
 * CE2 Phase 6 — unread counts and read receipts
 *
 * Nested map writes MUST use update() or FieldPath. Firestore set({merge:true})
 * treats string keys like "lastRead.uid" as literal field names (with a dot),
 * which fails ce2ConvMetaUpdateKeysOnly and leaves inbox lastPreview stuck.
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

  /** Dot-path patch for update() — never pass these keys to set({merge:true}). */
  function markReadPatch(uid) {
    var patch = {};
    patch['lastRead.' + uid] = firebase.firestore.Timestamp.now();
    patch['unreadCount.' + uid] = 0;
    return patch;
  }

  /**
   * Apply a nested-field patch. Prefer update() so "map.uid" is a field path.
   * On missing docs, expand dots into nested maps then set(merge).
   */
  function expandDottedPatch(patch) {
    var out = {};
    Object.keys(patch || {}).forEach(function (key) {
      var parts = String(key).split('.');
      if (parts.length === 1) {
        out[key] = patch[key];
        return;
      }
      var cur = out;
      for (var i = 0; i < parts.length - 1; i++) {
        if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = patch[key];
    });
    return out;
  }

  function applyNestedPatch(docRef, patch) {
    if (!docRef || !patch) return Promise.resolve();
    return docRef.update(patch).catch(function (err) {
      if (err && err.code === 'not-found') {
        return docRef.set(expandDottedPatch(patch), { merge: true });
      }
      return Promise.reject(err);
    });
  }

  function markRead(docRef, uid) {
    if (!docRef || !uid) return Promise.resolve();
    return applyNestedPatch(docRef, markReadPatch(uid)).catch(function () {});
  }

  /**
   * Build merge patch to bump unread for recipients (not sender).
   * Uses plain integers (not FieldValue.increment) so Firestore rules can evaluate the write.
   * Dot-path keys are for update() only.
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
   * @returns {'pending'|'queued'|'sent'|'delivered'|'read'|'failed'|''}
   */
  function deliveryStatus(message, selfUid, otherLastReadTs, extras) {
    extras = extras || {};
    if (!message || message.senderId !== selfUid) return '';
    if (message._failed || message.uploadState === 'failed') return 'failed';
    if (message._queued || message.uploadState === 'queued') return 'queued';
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
    if (status === 'queued') return 'Queued';
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
    applyNestedPatch: applyNestedPatch,
    deliveryStatus: deliveryStatus,
    statusLabel: statusLabel,
    tsSeconds: tsSeconds,
    VERSION: 6,
  };
})(typeof window !== 'undefined' ? window : global);
