/**
 * CE2 Phase 6 — typing presence
 */
(function (global) {
  'use strict';

  var TYPING_TTL_SEC = 8;
  var typingMutedUntil = 0;

  function isTypingActive(ts) {
    if (!ts) return false;
    try {
      var sec = ts.toDate ? ts.toDate().getTime() / 1000 : ts.seconds || 0;
      return Date.now() / 1000 - sec < TYPING_TTL_SEC;
    } catch (_) {
      return false;
    }
  }

  function setTypingMuted(ms) {
    typingMutedUntil = Date.now() + (ms || 3000);
  }

  function isTypingMuted() {
    return Date.now() < typingMutedUntil;
  }

  function pulseTyping(docRef, uid) {
    if (!docRef || !uid || isTypingMuted()) return Promise.resolve();
    var patch = {};
    patch['typing.' + uid] = firebase.firestore.FieldValue.serverTimestamp();
    return docRef.set(patch, { merge: true }).catch(function () {});
  }

  function clearTyping(docRef, uid) {
    if (!docRef || !uid) return Promise.resolve();
    var patch = {};
    patch['typing.' + uid] = firebase.firestore.FieldValue.delete();
    return docRef.set(patch, { merge: true }).catch(function () {});
  }

  function watchTyping(docRef, selfUid, onActive) {
    if (!docRef || !selfUid) return function () {};
    return docRef.onSnapshot(
      function (snap) {
        if (!snap.exists) {
          onActive([]);
          return;
        }
        var typing = snap.data().typing || {};
        var active = Object.keys(typing).filter(function (uid) {
          return uid !== selfUid && isTypingActive(typing[uid]);
        });
        onActive(active);
      },
      function () {
        onActive([]);
      }
    );
  }

  function bindTypingInput(inputEl, docRef, uid, clearAfterMs) {
    var timer = null;
    var pulseTimer = null;
    var lastPulseMs = 0;
    var PULSE_GAP_MS = 450;
    if (!inputEl || !docRef || !uid) return function () {};
    function schedulePulse() {
      if (isTypingMuted()) return;
      if (!(inputEl.value || '').trim()) {
        clearTyping(docRef, uid);
        return;
      }
      var now = Date.now();
      if (now - lastPulseMs >= PULSE_GAP_MS) {
        lastPulseMs = now;
        pulseTyping(docRef, uid);
        return;
      }
      if (pulseTimer) return;
      pulseTimer = setTimeout(function () {
        pulseTimer = null;
        lastPulseMs = Date.now();
        pulseTyping(docRef, uid);
      }, PULSE_GAP_MS);
    }
    function onInput() {
      clearTimeout(timer);
      if (!(inputEl.value || '').trim()) {
        clearTyping(docRef, uid);
        return;
      }
      schedulePulse();
      timer = setTimeout(function () {
        clearTyping(docRef, uid);
      }, clearAfterMs || 5000);
    }
    function onBlur() {
      clearTimeout(timer);
      if (pulseTimer) {
        clearTimeout(pulseTimer);
        pulseTimer = null;
      }
      clearTyping(docRef, uid);
    }
    inputEl.addEventListener('input', onInput);
    inputEl.addEventListener('blur', onBlur);
    return function () {
      clearTimeout(timer);
      if (pulseTimer) clearTimeout(pulseTimer);
      inputEl.removeEventListener('input', onInput);
      inputEl.removeEventListener('blur', onBlur);
      clearTyping(docRef, uid);
    };
  }

  global.Ce2Presence = {
    pulseTyping: pulseTyping,
    clearTyping: clearTyping,
    watchTyping: watchTyping,
    bindTypingInput: bindTypingInput,
    isTypingActive: isTypingActive,
    setTypingMuted: setTypingMuted,
    isTypingMuted: isTypingMuted,
    VERSION: 3,
  };
})(typeof window !== 'undefined' ? window : global);
