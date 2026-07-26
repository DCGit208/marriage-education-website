/**
 * SBD Book Reader — Firestore sync (Milestone 7+8).
 * Position, saved places, highlights — local-first merge.
 * Window: SBDReader.Sync
 */
(function (global) {
  'use strict';

  var COLLECTION = 'bookReader';
  var PUSH_MS = 1200;

  var state = {
    uid: '',
    bookId: '',
    pushTimer: null,
    enabled: false,
  };

  function db() {
    return typeof firebase !== 'undefined' && firebase.firestore
      ? firebase.firestore()
      : null;
  }

  function docRef(uid, bookId) {
    var firestore = db();
    if (!firestore || !uid || !bookId) return null;
    return firestore.collection('users').doc(uid).collection(COLLECTION).doc(bookId);
  }

  function clampRatio(n) {
    var ratio = Number(n);
    if (!isFinite(ratio)) return 0;
    return Math.min(1, Math.max(0, ratio));
  }

  function normalizePlace(item) {
    if (!item || !item.chapterId) return null;
    return {
      id: String(item.id || ''),
      chapterId: String(item.chapterId),
      progressRatio: clampRatio(item.progressRatio),
      label: String(item.label || ''),
      createdAt: Number(item.createdAt) || Date.now(),
    };
  }

  function normalizePlaces(list) {
    if (!Array.isArray(list)) return [];
    return list.map(normalizePlace).filter(Boolean);
  }

  function normalizeHighlight(item) {
    if (!item || !item.chapterId) return null;
    var start = Number(item.start);
    var end = Number(item.end);
    if (!isFinite(start) || !isFinite(end) || end <= start) return null;
    return {
      id: String(item.id || ''),
      chapterId: String(item.chapterId),
      start: start,
      end: end,
      text: String(item.text || ''),
      kind: item.kind === 'note' || item.kind === 'highlight' ? item.kind : String(item.note || '').trim() ? 'note' : 'highlight',
      note: String(item.note || ''),
      createdAt: Number(item.createdAt) || Date.now(),
      updatedAt: Number(item.updatedAt) || Date.now(),
    };
  }

  function normalizeHighlights(list) {
    if (!Array.isArray(list)) return [];
    return list.map(normalizeHighlight).filter(Boolean);
  }

  function canSync() {
    return !!(state.enabled && state.uid && state.bookId && db() && navigator.onLine !== false);
  }

  function schedulePush() {
    if (!canSync()) return;
    if (state.pushTimer) clearTimeout(state.pushTimer);
    state.pushTimer = setTimeout(function () {
      state.pushTimer = null;
      pushAll().catch(function (err) {
        console.warn('[SBDReader.Sync] push failed', err);
      });
    }, PUSH_MS);
  }

  async function pushAll() {
    if (!canSync()) return false;
    var Position = global.SBDReader && global.SBDReader.Position;
    var Bookmarks = global.SBDReader && global.SBDReader.Bookmarks;
    var Annotations = global.SBDReader && global.SBDReader.Annotations;
    if (!Position || !Bookmarks) return false;

    var localPos = Position.load(state.bookId);
    var places = Bookmarks.list(state.bookId);
    var highlights = Annotations ? Annotations.readAll(state.bookId) : [];
    var ref = docRef(state.uid, state.bookId);
    if (!ref) return false;

    var payload = {
      bookId: state.bookId,
      savedPlaces: normalizePlaces(places),
      placesUpdatedAt: Bookmarks.placesUpdatedAt
        ? Bookmarks.placesUpdatedAt(state.bookId)
        : Date.now(),
      highlights: normalizeHighlights(highlights),
      highlightsUpdatedAt: Annotations
        ? Annotations.updatedAt(state.bookId)
        : Date.now(),
    };

    if (localPos && localPos.chapterId) {
      payload.chapterId = localPos.chapterId;
      payload.progressRatio = clampRatio(localPos.progressRatio);
      payload.positionUpdatedAt = localPos.updatedAt || Date.now();
    }

    await ref.set(payload, { merge: true });
    return true;
  }

  async function pullAndMerge(bookId, uid) {
    state.bookId = bookId || '';
    state.uid = uid || '';
    state.enabled = !!(bookId && uid && db());

    if (!state.enabled || navigator.onLine === false) return false;

    var Position = global.SBDReader && global.SBDReader.Position;
    var Bookmarks = global.SBDReader && global.SBDReader.Bookmarks;
    var Annotations = global.SBDReader && global.SBDReader.Annotations;
    if (!Position || !Bookmarks) return false;

    var ref = docRef(uid, bookId);
    if (!ref) return false;

    var localPos = Position.load(bookId);
    var localPlaces = Bookmarks.list(bookId);
    var localPlacesUpdated = Bookmarks.placesUpdatedAt(bookId);
    var localHlUpdated = Annotations ? Annotations.updatedAt(bookId) : 0;

    try {
      var snap = await ref.get();
      if (!snap.exists) {
        var hasHl = Annotations && Annotations.readAll(bookId).length;
        if (localPos || localPlaces.length || hasHl) await pushAll();
        return true;
      }

      var remote = snap.data() || {};
      var remotePosTime = Number(remote.positionUpdatedAt) || 0;
      var localPosTime = localPos && localPos.updatedAt ? localPos.updatedAt : 0;

      if (remote.chapterId && remotePosTime >= localPosTime) {
        Position.saveNow(bookId, remote.chapterId, clampRatio(remote.progressRatio), {
          updatedAt: remotePosTime || Date.now(),
          silent: true,
        });
      }

      var remotePlacesTime = Number(remote.placesUpdatedAt) || 0;
      if (remotePlacesTime >= localPlacesUpdated && Array.isArray(remote.savedPlaces)) {
        Bookmarks.replaceAll(bookId, normalizePlaces(remote.savedPlaces), remotePlacesTime);
      } else if (localPlaces.length && localPlacesUpdated > remotePlacesTime) {
        await pushAll();
      } else if (!remote.savedPlaces && localPlaces.length) {
        await pushAll();
      }

      var remoteHlTime = Number(remote.highlightsUpdatedAt) || 0;
      if (Annotations) {
        if (remoteHlTime >= localHlUpdated && Array.isArray(remote.highlights)) {
          Annotations.replaceAll(bookId, normalizeHighlights(remote.highlights), remoteHlTime);
        } else if (Annotations.readAll(bookId).length && localHlUpdated > remoteHlTime) {
          await pushAll();
        } else if (!remote.highlights && Annotations.readAll(bookId).length) {
          await pushAll();
        }
      }

      return true;
    } catch (err) {
      console.warn('[SBDReader.Sync] pull failed', err);
      return false;
    }
  }

  function onPositionSaved(bookId, chapterId, progressRatio) {
    if (!bookId || bookId !== state.bookId) return;
    schedulePush();
  }

  function onPlacesChanged(bookId) {
    if (!bookId || bookId !== state.bookId) return;
    schedulePush();
  }

  function onHighlightsChanged(bookId) {
    if (!bookId || bookId !== state.bookId) return;
    schedulePush();
  }

  function flush() {
    if (state.pushTimer) {
      clearTimeout(state.pushTimer);
      state.pushTimer = null;
    }
    if (!canSync()) return Promise.resolve(false);
    return pushAll().catch(function (err) {
      console.warn('[SBDReader.Sync] flush failed', err);
      return false;
    });
  }

  function init(opts) {
    opts = opts || {};
    state.uid = opts.uid || '';
    state.bookId = opts.bookId || '';
    state.enabled = !!(state.uid && state.bookId && db());
  }

  function stop() {
    return flush().finally(function () {
      state.uid = '';
      state.bookId = '';
      state.enabled = false;
    });
  }

  global.SBDReader = global.SBDReader || {};
  global.SBDReader.Sync = {
    init: init,
    stop: stop,
    flush: flush,
    pullAndMerge: pullAndMerge,
    onPositionSaved: onPositionSaved,
    onPlacesChanged: onPlacesChanged,
    onHighlightsChanged: onHighlightsChanged,
  };
})(window);
