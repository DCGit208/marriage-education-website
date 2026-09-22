/**
 * CE2 Phase 6 — typing presence + online / last-seen (users.lastActive)
 *
 * Online feel uses the existing `users/{uid}.lastActive` field (same as legacy /dm).
 * Typing pulses `typing.{uid}` on the open conversation / group doc (own key only).
 * Last-seen copy is bucketed (not clock-time) and omitted after a week.
 */
(function (global) {
  'use strict';

  var TYPING_TTL_SEC = 8;
  var PULSE_GAP_MS = 1800;
  var HEARTBEAT_MS = 40000;
  var MIN_WRITE_GAP_MS = 20000;
  var ONLINE_MS = 120000;
  var AWAY_MS = 8 * 60 * 1000;
  var RECENT_MS = 60 * 60 * 1000;
  var LAST_SEEN_MAX_MS = 7 * 24 * 60 * 60 * 1000;
  var typingMutedUntil = 0;

  function isTypingActive(ts, nowMs) {
    if (!ts) return false;
    try {
      var sec = ts.toDate ? ts.toDate().getTime() / 1000 : ts.seconds || 0;
      var now = (nowMs != null ? nowMs : Date.now()) / 1000;
      return now - sec < TYPING_TTL_SEC;
    } catch (_) {
      return false;
    }
  }

  function firstName(label) {
    var s = String(label || '').trim();
    if (!s) return '';
    return s.split(/\s+/)[0];
  }

  function formatTypingLabel(uids, nameForUid) {
    if (!uids || !uids.length) return '';
    function nameAt(i) {
      var raw = '';
      try {
        raw = typeof nameForUid === 'function' ? nameForUid(uids[i], i) : nameForUid;
      } catch (_) {}
      return firstName(raw) || 'Someone';
    }
    if (uids.length === 1) return nameAt(0) + ' is typing';
    if (uids.length === 2) return nameAt(0) + ' and ' + nameAt(1) + ' are typing';
    return nameAt(0) + ', ' + nameAt(1) + ' and others are typing';
  }

  function activeTypingUids(typing, selfUid, nowMs) {
    typing = typing || {};
    return Object.keys(typing).filter(function (uid) {
      return uid && uid !== selfUid && isTypingActive(typing[uid], nowMs);
    });
  }

  function setTypingMuted(ms) {
    typingMutedUntil = Date.now() + (ms || 3000);
  }

  function isTypingMuted() {
    return Date.now() < typingMutedUntil;
  }

  /** update() so "typing.uid" is a nested path; set(merge) would write a literal dotted key. */
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

  function applyTypingPatch(docRef, patch) {
    if (!docRef || !patch) return Promise.resolve();
    return docRef.update(patch).catch(function (err) {
      if (err && err.code === 'not-found') {
        return docRef.set(expandDottedPatch(patch), { merge: true });
      }
      return Promise.reject(err);
    });
  }

  function pulseTyping(docRef, uid) {
    if (!docRef || !uid || isTypingMuted()) return Promise.resolve();
    var patch = {};
    patch['typing.' + uid] = firebase.firestore.FieldValue.serverTimestamp();
    return applyTypingPatch(docRef, patch).catch(function () {});
  }

  function clearTyping(docRef, uid) {
    if (!docRef || !uid) return Promise.resolve();
    var patch = {};
    patch['typing.' + uid] = firebase.firestore.FieldValue.delete();
    return applyTypingPatch(docRef, patch).catch(function () {});
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

  function tsToMs(ts) {
    if (ts == null || ts === '') return 0;
    try {
      if (typeof ts.toMillis === 'function') return ts.toMillis();
      if (typeof ts.toDate === 'function') return ts.toDate().getTime();
      if (typeof ts.seconds === 'number') {
        return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
      }
      if (ts instanceof Date) return ts.getTime();
      if (typeof ts === 'number' && isFinite(ts)) {
        return ts < 1e12 ? ts * 1000 : ts;
      }
    } catch (_) {}
    return 0;
  }

  function startOfLocalDay(ms) {
    var d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function labelForRecord(rec, nowMs) {
    if (!rec || rec.state === 'unknown' || !rec.atMs) return '';
    if (rec.state === 'online') return 'Online';
    if (rec.state === 'away') return 'Away';
    var age = rec.ageMs;
    if (!isFinite(age) || age > LAST_SEEN_MAX_MS) return '';
    if (age < RECENT_MS) return 'Active recently';
    var nowDay = startOfLocalDay(nowMs);
    var thenDay = startOfLocalDay(rec.atMs);
    var dayDiff = Math.round((nowDay - thenDay) / 86400000);
    if (dayDiff <= 0) return 'Last seen today';
    if (dayDiff === 1) return 'Last seen yesterday';
    if (dayDiff < 7) return 'Last seen this week';
    return '';
  }

  function applyState(rec, nowMs) {
    nowMs = nowMs || Date.now();
    var prev = rec.state;
    var prevLabel = rec.label;
    if (!rec.atMs) {
      rec.state = 'unknown';
      rec.ageMs = Infinity;
      rec.label = '';
      return prev !== rec.state || prevLabel !== rec.label;
    }
    rec.ageMs = Math.max(0, nowMs - rec.atMs);
    if (rec.ageMs < ONLINE_MS) rec.state = 'online';
    else if (rec.ageMs < AWAY_MS) rec.state = 'away';
    else rec.state = 'offline';
    rec.label = labelForRecord(rec, nowMs);
    return prev !== rec.state || prevLabel !== rec.label;
  }

  function recordFromUserData(data, nowMs) {
    nowMs = nowMs || Date.now();
    var src = data || {};
    var ts = src.lastActive || src.ce2PresenceAt || src.lastSeen || null;
    var rec = {
      atMs: tsToMs(ts),
      ts: ts,
      name: String(src.name || src.displayName || '').trim(),
    };
    applyState(rec, nowMs);
    return rec;
  }

  function statusFromTs(ts, nowMs) {
    return recordFromUserData({ lastActive: ts }, nowMs);
  }

  function formatLabel(rec, nowMs) {
    if (!rec) return '';
    if (nowMs) applyState(rec, nowMs);
    return rec.label || '';
  }

  function refreshRecords(map, nowMs) {
    if (!map) return false;
    nowMs = nowMs || Date.now();
    var changed = false;
    Object.keys(map).forEach(function (uid) {
      if (applyState(map[uid], nowMs)) changed = true;
    });
    return changed;
  }

  function writeLastActive(db, uid) {
    if (!db || !uid || typeof firebase === 'undefined' || !firebase.firestore) {
      return Promise.resolve();
    }
    var stamp = firebase.firestore.FieldValue.serverTimestamp();
    return db
      .collection('users')
      .doc(uid)
      .update({ lastActive: stamp })
      .catch(function () {
        return db
          .collection('users')
          .doc(uid)
          .set({ lastActive: stamp }, { merge: true })
          .catch(function () {});
      });
  }

  function startHeartbeat(db, uid, opts) {
    opts = opts || {};
    var intervalMs = opts.intervalMs || HEARTBEAT_MS;
    var timer = null;
    var stopped = false;
    var lastWrite = 0;
    var doc = typeof document !== 'undefined' ? document : null;
    var win = typeof window !== 'undefined' ? window : null;

    function write(force) {
      if (stopped || !db || !uid) return Promise.resolve();
      var now = Date.now();
      if (!force && now - lastWrite < MIN_WRITE_GAP_MS) return Promise.resolve();
      lastWrite = now;
      return writeLastActive(db, uid);
    }

    function isHidden() {
      return !!(doc && doc.visibilityState === 'hidden');
    }

    function onVisible() {
      if (stopped || isHidden()) return;
      write(true);
      if (!timer) {
        timer = setInterval(function () {
          if (!isHidden()) write(false);
        }, intervalMs);
      }
    }

    function onHidden() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function onVis() {
      if (isHidden()) onHidden();
      else onVisible();
    }

    if (doc) doc.addEventListener('visibilitychange', onVis);
    if (win) win.addEventListener('online', onVisible);
    if (!isHidden()) onVisible();

    return function stop() {
      stopped = true;
      onHidden();
      if (doc) doc.removeEventListener('visibilitychange', onVis);
      if (win) win.removeEventListener('online', onVisible);
    };
  }

  function watchUser(db, uid, onChange) {
    if (!db || !uid || typeof onChange !== 'function') return function () {};
    return db.collection('users').doc(uid).onSnapshot(
      function (snap) {
        onChange(uid, recordFromUserData(snap.exists ? snap.data() : null));
      },
      function () {
        onChange(uid, recordFromUserData(null));
      }
    );
  }

  function createWatchSet(db, onChange) {
    var unsubs = {};
    function sync(uids) {
      var want = {};
      (uids || []).forEach(function (u) {
        if (u) want[u] = true;
      });
      Object.keys(unsubs).forEach(function (u) {
        if (!want[u]) {
          try {
            unsubs[u]();
          } catch (_) {}
          delete unsubs[u];
        }
      });
      Object.keys(want).forEach(function (u) {
        if (unsubs[u]) return;
        unsubs[u] = watchUser(db, u, onChange);
      });
    }
    function stop() {
      Object.keys(unsubs).forEach(function (u) {
        try {
          unsubs[u]();
        } catch (_) {}
      });
      unsubs = {};
    }
    function watched() {
      return Object.keys(unsubs);
    }
    return { sync: sync, stop: stop, watched: watched };
  }

  function applyDot(el, rec) {
    if (!el) return;
    var state = (rec && rec.state) || 'unknown';
    var show = state === 'online' || state === 'away';
    el.hidden = !show;
    el.setAttribute('data-state', show ? state : '');
    if (show) el.setAttribute('title', rec.label || state);
    else el.removeAttribute('title');
  }

  global.Ce2Presence = {
    pulseTyping: pulseTyping,
    clearTyping: clearTyping,
    watchTyping: watchTyping,
    bindTypingInput: bindTypingInput,
    isTypingActive: isTypingActive,
    activeTypingUids: activeTypingUids,
    firstName: firstName,
    formatTypingLabel: formatTypingLabel,
    setTypingMuted: setTypingMuted,
    isTypingMuted: isTypingMuted,
    tsToMs: tsToMs,
    recordFromUserData: recordFromUserData,
    statusFromTs: statusFromTs,
    formatLabel: formatLabel,
    refreshRecords: refreshRecords,
    startHeartbeat: startHeartbeat,
    writeLastActive: writeLastActive,
    watchUser: watchUser,
    createWatchSet: createWatchSet,
    applyDot: applyDot,
    ONLINE_MS: ONLINE_MS,
    AWAY_MS: AWAY_MS,
    RECENT_MS: RECENT_MS,
    LAST_SEEN_MAX_MS: LAST_SEEN_MAX_MS,
    HEARTBEAT_MS: HEARTBEAT_MS,
    TYPING_TTL_SEC: TYPING_TTL_SEC,
    PULSE_GAP_MS: PULSE_GAP_MS,
    VERSION: 7,
  };
})(typeof window !== 'undefined' ? window : global);
