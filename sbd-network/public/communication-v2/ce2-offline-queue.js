/**
 * CE2 — device send queue (localStorage).
 * Text payloads live here. Voice blobs stay in Ce2AudioOutbox; this store
 * keeps only metadata so flush can run in order after a reload.
 */
(function (global) {
  'use strict';

  var KEY = 'ce2_offline_queue_v1';
  var MAX = 20;
  var VERSION = 2;

  var FATAL_CODES = {
    'permission-denied': true,
    unauthenticated: true,
    'already-exists': true,
    'invalid-argument': true,
    'failed-precondition': true,
    'out-of-range': true,
    'data-loss': true,
    unimplemented: true,
  };

  function read() {
    try {
      var raw = global.localStorage ? global.localStorage.getItem(KEY) : null;
      var list = JSON.parse(raw || '[]');
      return Array.isArray(list) ? list.filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }

  function write(list) {
    try {
      if (!global.localStorage) return;
      var next = (list || []).filter(Boolean);
      if (next.length > MAX) next = next.slice(next.length - MAX);
      global.localStorage.setItem(KEY, JSON.stringify(next));
    } catch (_) {}
  }

  function newId() {
    return 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function normalize(item) {
    if (!item || typeof item !== 'object') return null;
    var next = Object.assign({}, item);
    if (!next.id) next.id = newId();
    if (!next.createdAt) next.createdAt = Date.now();
    if (!next.kind) {
      next.kind = next.voiceLocalId || next.messageType === 'voice' ? 'voice' : 'text';
    }
    if (!next.status) next.status = 'queued';
    if (next.retryable === undefined) next.retryable = true;
    return next;
  }

  function enqueue(item) {
    var next = normalize(item);
    if (!next) return null;
    var list = read();
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === next.id) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      list[idx] = Object.assign({}, list[idx], next);
    } else {
      list.push(next);
    }
    write(list);
    return next;
  }

  function remove(id) {
    if (!id) return;
    write(
      read().filter(function (x) {
        return x && x.id !== id;
      })
    );
  }

  function removeMatching(pred) {
    write(
      read().filter(function (x) {
        return !x || !pred(x);
      })
    );
  }

  function get(id) {
    if (!id) return null;
    var list = read();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }

  function update(id, patch) {
    if (!id || !patch) return null;
    var list = read();
    var found = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) {
        list[i] = Object.assign({}, list[i], patch, { id: id });
        found = list[i];
        break;
      }
    }
    if (found) write(list);
    return found;
  }

  function list() {
    return read();
  }

  function listForConversation(convId) {
    if (!convId) return [];
    return read().filter(function (x) {
      return x && x.convId === convId;
    });
  }

  function errorCode(err) {
    if (!err) return '';
    return String(err.code || err.name || '').toLowerCase();
  }

  function errorMessage(err) {
    if (!err) return '';
    return String(err.message || err) || '';
  }

  function isFatalPermissionError(err) {
    var code = errorCode(err);
    if (FATAL_CODES[code]) return true;
    if (code === 'storage/unauthorized') return true;
    var msg = errorMessage(err).toLowerCase();
    if (msg.indexOf('missing or insufficient permissions') >= 0) return true;
    if (msg.indexOf('permission-denied') >= 0) return true;
    if (msg.indexOf('permission denied') >= 0) return true;
    return false;
  }

  function isRetryableError(err) {
    if (err && err._blobMissing) return false;
    if (isFatalPermissionError(err)) return false;
    var code = errorCode(err);
    if (
      code === 'unavailable' ||
      code === 'deadline-exceeded' ||
      code === 'aborted' ||
      code === 'cancelled' ||
      code === 'resource-exhausted' ||
      code === 'internal'
    ) {
      return true;
    }
    var msg = errorMessage(err).toLowerCase();
    if (
      /offline|network|failed to fetch|fetch failed|timeout|timed out|unavailable|internet|connection|err_internet|networkerror/.test(
        msg
      )
    ) {
      return true;
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    } catch (_) {}
    return true;
  }

  global.Ce2OfflineQueue = {
    enqueue: enqueue,
    remove: remove,
    removeMatching: removeMatching,
    get: get,
    update: update,
    list: list,
    listForConversation: listForConversation,
    isRetryableError: isRetryableError,
    isFatalPermissionError: isFatalPermissionError,
    KEY: KEY,
    MAX: MAX,
    VERSION: VERSION,
  };
})(typeof window !== 'undefined' ? window : global);
