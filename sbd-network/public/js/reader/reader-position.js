/**
 * SBD Book Reader — reading position restore (Milestone 6).
 * Local-first: chapterId + progressRatio in localStorage.
 * Window: SBDReader.Position
 */
(function (global) {
  'use strict';

  var KEY_PREFIX = 'sbd-reader:position:';
  var SAVE_MS = 800;

  var state = {
    bookId: '',
    chapterId: '',
    saveTimer: null,
    onScroll: null,
    pendingRatio: null,
    lastRatio: null,
  };

  function storageKey(bookId) {
    return KEY_PREFIX + String(bookId || '');
  }

  function readRaw(bookId) {
    try {
      var raw = localStorage.getItem(storageKey(bookId));
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.chapterId) return null;
      var ratio = Number(data.progressRatio);
      if (!isFinite(ratio)) ratio = 0;
      return {
        chapterId: String(data.chapterId),
        progressRatio: Math.min(1, Math.max(0, ratio)),
        updatedAt: data.updatedAt || 0,
      };
    } catch (_) {
      return null;
    }
  }

  function writeRaw(bookId, chapterId, progressRatio, opts) {
    opts = opts || {};
    if (!bookId || !chapterId) return;
    var ratio = Math.min(1, Math.max(0, Number(progressRatio) || 0));
    try {
      localStorage.setItem(
        storageKey(bookId),
        JSON.stringify({
          chapterId: chapterId,
          progressRatio: ratio,
          updatedAt: Number(opts.updatedAt) || Date.now(),
        })
      );
    } catch (_) {
      /* private mode */
    }
    if (bookId === state.bookId) state.lastRatio = ratio;
    if (!opts.silent && global.SBDReader && global.SBDReader.Sync && global.SBDReader.Sync.onPositionSaved) {
      global.SBDReader.Sync.onPositionSaved(bookId, chapterId, ratio);
    }
  }

  function findChapterIndex(chapters, chapterId) {
    if (!chapterId || !Array.isArray(chapters)) return -1;
    for (var i = 0; i < chapters.length; i++) {
      if (chapters[i] && chapters[i].id === chapterId) return i;
    }
    return -1;
  }

  function load(bookId) {
    return readRaw(bookId);
  }

  function saveNow(bookId, chapterId, progressRatio, opts) {
    if (!bookId || !chapterId) return;
    writeRaw(bookId, chapterId, progressRatio, opts);
  }

  function scheduleSave() {
    if (!state.bookId || !state.chapterId) return;
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () {
      state.saveTimer = null;
      var Progress = global.SBDReader && global.SBDReader.Progress;
      var ratio = Progress && Progress.getRatio ? Progress.getRatio() : 0;
      saveNow(state.bookId, state.chapterId, ratio);
    }, SAVE_MS);
  }

  function bindAutoSave() {
    if (state.onScroll) return;
    state.onScroll = scheduleSave;
    global.addEventListener('scroll', state.onScroll, { passive: true });
    global.addEventListener('beforeunload', flush);
    global.addEventListener('pagehide', flush);
  }

  function unbindAutoSave() {
    if (state.onScroll) {
      global.removeEventListener('scroll', state.onScroll);
      state.onScroll = null;
    }
    global.removeEventListener('beforeunload', flush);
    global.removeEventListener('pagehide', flush);
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
    }
  }

  function flush() {
    if (!state.bookId || !state.chapterId) return;
    var Progress = global.SBDReader && global.SBDReader.Progress;
    var article = document.getElementById('brArticle');
    var articleHidden = !!(article && article.hidden);
    var ratio = null;
    if (!articleHidden && Progress && Progress.getRatio) {
      ratio = Progress.getRatio();
    }
    if (ratio == null || !isFinite(ratio)) {
      ratio = state.lastRatio;
    }
    // Avoid overwriting a real save with 0 when chrome is tearing down
    if ((ratio == null || ratio === 0) && state.lastRatio != null && state.lastRatio > 0.02) {
      ratio = state.lastRatio;
    }
    if (ratio == null) return;
    saveNow(state.bookId, state.chapterId, ratio);
  }

  function setActiveChapter(bookId, chapterId) {
    flush();
    state.bookId = bookId || '';
    state.chapterId = chapterId || '';
    var existing = readRaw(state.bookId);
    if (existing && existing.chapterId === state.chapterId) {
      state.lastRatio = existing.progressRatio;
    } else {
      state.lastRatio = 0;
    }
    bindAutoSave();
  }

  function clear(bookId) {
    try {
      localStorage.removeItem(storageKey(bookId));
    } catch (_) {}
  }

  function setPendingRatio(ratio) {
    state.pendingRatio = ratio == null ? null : Math.min(1, Math.max(0, Number(ratio) || 0));
  }

  function consumePendingRatio() {
    var ratio = state.pendingRatio;
    state.pendingRatio = null;
    return ratio;
  }

  function applyPendingScroll() {
    var ratio = consumePendingRatio();
    if (ratio == null) return;
    var Progress = global.SBDReader && global.SBDReader.Progress;
    if (!Progress || !Progress.scrollToRatio) return;
    Progress.scrollToRatio(ratio, 'auto');
    global.setTimeout(function () {
      Progress.scrollToRatio(ratio, 'auto');
      if (Progress.repaint) Progress.repaint();
      flush();
    }, 50);
    global.setTimeout(function () {
      Progress.scrollToRatio(ratio, 'auto');
      if (Progress.repaint) Progress.repaint();
    }, 300);
  }

  function resumeTarget(chapters, bookId) {
    var saved = load(bookId);
    if (saved) {
      var idx = findChapterIndex(chapters, saved.chapterId);
      if (idx >= 0) {
        return {
          index: idx,
          chapterId: saved.chapterId,
          progressRatio: saved.progressRatio,
          chapter: chapters[idx],
        };
      }
    }

    // Fallback: most recent saved place
    var Bookmarks = global.SBDReader && global.SBDReader.Bookmarks;
    if (Bookmarks && Bookmarks.list) {
      var places = Bookmarks.list(bookId) || [];
      if (places.length) {
        var place = places[0];
        var pIdx = findChapterIndex(chapters, place.chapterId);
        if (pIdx >= 0) {
          return {
            index: pIdx,
            chapterId: place.chapterId,
            progressRatio: Math.min(1, Math.max(0, Number(place.progressRatio) || 0)),
            chapter: chapters[pIdx],
          };
        }
      }
    }

    // Fallback: chapter of newest highlight/note
    var Annotations = global.SBDReader && global.SBDReader.Annotations;
    if (Annotations && Annotations.readAll) {
      var marks = Annotations.readAll(bookId) || [];
      if (marks.length) {
        var mark = marks[0];
        var mIdx = findChapterIndex(chapters, mark.chapterId);
        if (mIdx >= 0) {
          return {
            index: mIdx,
            chapterId: mark.chapterId,
            progressRatio: 0,
            chapter: chapters[mIdx],
          };
        }
      }
    }

    return null;
  }

  function init(bookId) {
    state.bookId = bookId || '';
    state.chapterId = '';
    state.pendingRatio = null;
    var existing = readRaw(state.bookId);
    state.lastRatio = existing ? existing.progressRatio : null;
    unbindAutoSave();
  }

  function stop() {
    flush();
    state.chapterId = '';
    unbindAutoSave();
  }

  global.SBDReader = global.SBDReader || {};
  global.SBDReader.Position = {
    init: init,
    stop: stop,
    load: load,
    saveNow: saveNow,
    clear: clear,
    setActiveChapter: setActiveChapter,
    setPendingRatio: setPendingRatio,
    applyPendingScroll: applyPendingScroll,
    resumeTarget: resumeTarget,
    findChapterIndex: findChapterIndex,
    flush: flush,
  };
})(window);
