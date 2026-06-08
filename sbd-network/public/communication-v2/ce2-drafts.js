/**
 * CE2 — per-thread composer drafts (localStorage).
 */
(function (global) {
  'use strict';

  var MAX_LEN = 8000;
  var saveTimers = {};

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
    if (saveTimers[id]) clearTimeout(saveTimers[id]);
    saveTimers[id] = setTimeout(function () {
      saveTimers[id] = null;
      save(uid, threadKey, text);
    }, typeof delayMs === 'number' ? delayMs : 400);
  }

  global.Ce2Drafts = {
    save: save,
    load: load,
    clear: clear,
    has: has,
    preview: preview,
    scheduleSave: scheduleSave,
    VERSION: 1,
  };
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof window !== 'undefined'
      ? window
      : self
);
