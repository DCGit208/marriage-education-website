/**
 * CE2 — per-thread composer drafts (localStorage).
 */
(function (global) {
  'use strict';

  var MAX_LEN = 8000;
  var saveTimers = {};
  var pendingText = {};

  function storageKey(uid, threadKey) {
    return 'ce2_draft_' + String(uid || '') + '_' + String(threadKey || '');
  }

  function save(uid, threadKey, text) {
    if (!uid || !threadKey) return;
    var val = String(text || '');
    try {
      if (!val.trim()) {
        global.localStorage.removeItem(storageKey(uid, threadKey));
        return;
      }
      global.localStorage.setItem(storageKey(uid, threadKey), val.slice(0, MAX_LEN));
    } catch (_) {}
  }

  function load(uid, threadKey) {
    if (!uid || !threadKey) return '';
    try {
      return global.localStorage.getItem(storageKey(uid, threadKey)) || '';
    } catch (_) {
      return '';
    }
  }

  function clear(uid, threadKey) {
    if (!uid || !threadKey) return;
    try {
      global.localStorage.removeItem(storageKey(uid, threadKey));
    } catch (_) {}
  }

  function has(uid, threadKey) {
    return !!load(uid, threadKey).trim();
  }

  function preview(uid, threadKey, max) {
    var t = load(uid, threadKey).trim();
    if (!t) return '';
    max = max || 48;
    return t.length > max ? t.slice(0, max) + '…' : t;
  }

  function scheduleSave(uid, threadKey, text, delayMs) {
    if (!uid || !threadKey) return;
    var id = storageKey(uid, threadKey);
    pendingText[id] = text;
    if (saveTimers[id]) clearTimeout(saveTimers[id]);
    saveTimers[id] = setTimeout(function () {
      saveTimers[id] = null;
      save(uid, threadKey, pendingText[id]);
      delete pendingText[id];
    }, typeof delayMs === 'number' ? delayMs : 80);
  }

  function flush(uid, threadKey) {
    if (!uid || !threadKey) return;
    var id = storageKey(uid, threadKey);
    if (saveTimers[id]) {
      clearTimeout(saveTimers[id]);
      saveTimers[id] = null;
    }
    if (Object.prototype.hasOwnProperty.call(pendingText, id)) {
      save(uid, threadKey, pendingText[id]);
      delete pendingText[id];
    }
  }

  function flushAll() {
    Object.keys(saveTimers).forEach(function (id) {
      clearTimeout(saveTimers[id]);
      saveTimers[id] = null;
    });
    Object.keys(pendingText).forEach(function (id) {
      var rest = id.slice('ce2_draft_'.length);
      var marker = rest.indexOf('_d:');
      if (marker < 0) marker = rest.indexOf('_g:');
      if (marker < 0) return;
      save(rest.slice(0, marker), rest.slice(marker + 1), pendingText[id]);
      delete pendingText[id];
    });
  }

  global.Ce2Drafts = {
    save: save,
    load: load,
    clear: clear,
    has: has,
    preview: preview,
    scheduleSave: scheduleSave,
    flush: flush,
    flushAll: flushAll,
    VERSION: 2,
  };
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof window !== 'undefined'
      ? window
      : self
);
