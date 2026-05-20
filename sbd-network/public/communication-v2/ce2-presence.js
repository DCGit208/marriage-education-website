/**
 * CE2 Phase 6 — typing presence
 */
(function (global) {
  'use strict';

  var TYPING_TTL_SEC = 8;

  function isTypingActive(ts) {
    if (!ts) return false;
    try {
      var sec = ts.toDate ? ts.toDate().getTime() / 1000 : ts.seconds || 0;
      return Date.now() / 1000 - sec < TYPING_TTL_SEC;
    } catch (_) {
      return false;
    }
  }

  function pulseTyping(docRef, uid) {
    if (!docRef || !uid) return Promise.resolve();
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

  /**
   * @param {firebase.firestore.DocumentReference} docRef
   * @param {string} selfUid
   * @param {function(string|null)} onLabel — human label or null
   * @returns {function} unsubscribe
   */
  function watchTyping(docRef, selfUid, onLabel) {
    if (!docRef || !selfUid) return function () {};
    return docRef.onSnapshot(
      function (snap) {
        if (!snap.exists) {
          onLabel(null);
          return;
        }
        var typing = snap.data().typing || {};
        var active = Object.keys(typing).filter(function (uid) {
          return uid !== selfUid && isTypingActive(typing[uid]);
        });
        if (!active.length) {
          onLabel(null);
          return;
        }
        onLabel(active.length === 1 ? 'typing…' : active.length + ' people typing…');
      },
      function () {
        onLabel(null);
      }
    );
  }

  function bindTypingInput(inputEl, docRef, uid, clearAfterMs) {
    var timer = null;
    if (!inputEl || !docRef || !uid) return function () {};
    function onInput() {
      clearTimeout(timer);
      pulseTyping(docRef, uid);
      timer = setTimeout(function () {
        clearTyping(docRef, uid);
      }, clearAfterMs || 5000);
    }
    function onBlur() {
      clearTimeout(timer);
      clearTyping(docRef, uid);
    }
    inputEl.addEventListener('input', onInput);
    inputEl.addEventListener('blur', onBlur);
    return function () {
      clearTimeout(timer);
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
    VERSION: 1,
  };
})(typeof window !== 'undefined' ? window : global);
