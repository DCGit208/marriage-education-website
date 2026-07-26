/**
 * SBD Book Reader — bookmarks (Milestone 6).
 * Local-first: chapterId + progressRatio per bookmark.
 * Window: SBDReader.Bookmarks
 */
(function (global) {
  'use strict';

  var KEY_PREFIX = 'sbd-reader:bookmarks:';
  var KEY_UPDATED_PREFIX = 'sbd-reader:places-updated:';
  var MAX_BOOKMARKS = 50;

  var state = {
    bookId: '',
    chapters: [],
    onGoTo: null,
  };

  function qs(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    var Renderer = global.SBDReader && global.SBDReader.Renderer;
    return Renderer ? Renderer.esc(s) : String(s == null ? '' : s);
  }

  function storageKey(bookId) {
    return KEY_PREFIX + String(bookId || '');
  }

  function readList(bookId) {
    try {
      var raw = localStorage.getItem(storageKey(bookId));
      if (!raw) return [];
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function placesUpdatedKey(bookId) {
    return KEY_UPDATED_PREFIX + String(bookId || '');
  }

  function placesUpdatedAt(bookId) {
    try {
      var raw = localStorage.getItem(placesUpdatedKey(bookId));
      var n = Number(raw);
      return isFinite(n) ? n : 0;
    } catch (_) {
      return 0;
    }
  }

  function touchPlacesUpdated(bookId) {
    var ts = Date.now();
    try {
      localStorage.setItem(placesUpdatedKey(bookId), String(ts));
    } catch (_) {}
    return ts;
  }

  function writeList(bookId, list) {
    try {
      localStorage.setItem(storageKey(bookId), JSON.stringify(list));
      touchPlacesUpdated(bookId);
    } catch (_) {}
    if (global.SBDReader && global.SBDReader.Sync && global.SBDReader.Sync.onPlacesChanged) {
      global.SBDReader.Sync.onPlacesChanged(bookId);
    }
  }

  function normalizePlacesList(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, MAX_BOOKMARKS);
  }

  function replaceAll(bookId, list, updatedAt) {
    var items = normalizePlacesList(list);
    try {
      localStorage.setItem(storageKey(bookId), JSON.stringify(items));
      localStorage.setItem(placesUpdatedKey(bookId), String(Number(updatedAt) || Date.now()));
    } catch (_) {}
    renderPanel();
    updateButton();
  }

  function chapterTitle(chapterId) {
    for (var i = 0; i < state.chapters.length; i++) {
      if (state.chapters[i] && state.chapters[i].id === chapterId) {
        return state.chapters[i].title || 'Chapter';
      }
    }
    return 'Chapter';
  }

  function formatPct(ratio) {
    return Math.round(Math.min(1, Math.max(0, Number(ratio) || 0)) * 100) + '%';
  }

  function formatWhen(ts) {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    } catch (_) {
      return '';
    }
  }

  function list(bookId) {
    return readList(bookId || state.bookId);
  }

  function add(bookId, chapterId, progressRatio, label) {
    if (!bookId || !chapterId) return null;
    var items = readList(bookId);
    var ratio = Math.min(1, Math.max(0, Number(progressRatio) || 0));
    var entry = {
      id: 'bm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      chapterId: chapterId,
      progressRatio: ratio,
      label: String(label || chapterTitle(chapterId) + ' · ' + formatPct(ratio)),
      createdAt: Date.now(),
    };
    items.unshift(entry);
    if (items.length > MAX_BOOKMARKS) items = items.slice(0, MAX_BOOKMARKS);
    writeList(bookId, items);
    renderPanel();
    updateButton();
    return entry;
  }

  function remove(bookId, bookmarkId) {
    var items = readList(bookId).filter(function (b) {
      return b.id !== bookmarkId;
    });
    writeList(bookId, items);
    renderPanel();
    updateButton();
  }

  function updateButton() {
    var btn = qs('brBookmarkBtn');
    var openBtn = qs('brBookmarksOpenBtn');
    var count = readList(state.bookId).length;
    if (btn) {
      btn.textContent = 'Save place';
      btn.setAttribute('aria-label', 'Save place at current scroll position');
    }
    if (openBtn) {
      openBtn.hidden = count === 0;
      openBtn.textContent = count === 1 ? '1 saved place' : count + ' saved places';
    }
  }

  function renderPanel() {
    var listEl = qs('brBookmarkList');
    if (!listEl) return;
    var items = readList(state.bookId);
    if (!items.length) {
      listEl.innerHTML = '<li class="br-bookmark-empty">No saved places yet. Tap Save place while reading to pin your scroll position.</li>';
      return;
    }
    listEl.innerHTML = items
      .map(function (b) {
        return (
          '<li class="br-bookmark-item">' +
          '<button type="button" class="br-bookmark-go" data-id="' +
          esc(b.id) +
          '" data-no-chrome-toggle>' +
          esc(b.label || chapterTitle(b.chapterId)) +
          '<span class="br-bookmark-when">' +
          esc(formatWhen(b.createdAt)) +
          '</span></button>' +
          '<button type="button" class="br-bookmark-remove" data-id="' +
          esc(b.id) +
          '" data-no-chrome-toggle aria-label="Remove saved place">×</button>' +
          '</li>'
        );
      })
      .join('');

    listEl.querySelectorAll('.br-bookmark-go').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-id');
        var bm = readList(state.bookId).find(function (b) {
          return b.id === id;
        });
        if (bm && typeof state.onGoTo === 'function') {
          state.onGoTo(bm);
          closePanel();
        }
      };
    });

    listEl.querySelectorAll('.br-bookmark-remove').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        remove(state.bookId, btn.getAttribute('data-id'));
      };
    });
  }

  function openPanel() {
    var panel = qs('brBookmarks');
    var backdrop = qs('brBookmarkBackdrop');
    renderPanel();
    if (panel) {
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
    }
    if (backdrop) backdrop.hidden = false;
  }

  function closePanel() {
    var panel = qs('brBookmarks');
    var backdrop = qs('brBookmarkBackdrop');
    if (panel) {
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) backdrop.hidden = true;
  }

  function togglePanel() {
    var panel = qs('brBookmarks');
    if (panel && panel.classList.contains('open')) closePanel();
    else openPanel();
  }

  function addAtCurrent(chapterId, progressRatio) {
    if (!state.bookId || !chapterId) return null;
    return add(state.bookId, chapterId, progressRatio, chapterTitle(chapterId) + ' · ' + formatPct(progressRatio));
  }

  function bindUi() {
    var addBtn = qs('brBookmarkBtn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        if (typeof state.onAdd === 'function') state.onAdd();
      });
    }
    var openBtn = qs('brBookmarksOpenBtn');
    if (openBtn) {
      openBtn.addEventListener('click', function () {
        openPanel();
      });
    }
    var closeBtn = qs('brBookmarkClose');
    if (closeBtn) closeBtn.onclick = closePanel;
    var backdrop = qs('brBookmarkBackdrop');
    if (backdrop) backdrop.onclick = closePanel;
  }

  function init(opts) {
    opts = opts || {};
    state.bookId = opts.bookId || '';
    state.chapters = opts.chapters || [];
    state.onGoTo = opts.onGoTo || null;
    state.onAdd = opts.onAdd || null;
    bindUi();
    renderPanel();
    updateButton();
  }

  function setChapters(chapters) {
    state.chapters = Array.isArray(chapters) ? chapters : [];
  }

  global.SBDReader = global.SBDReader || {};
  global.SBDReader.Bookmarks = {
    init: init,
    setChapters: setChapters,
    list: list,
    add: add,
    remove: remove,
    addAtCurrent: addAtCurrent,
    replaceAll: replaceAll,
    placesUpdatedAt: placesUpdatedAt,
    openPanel: openPanel,
    closePanel: closePanel,
    togglePanel: togglePanel,
    renderPanel: renderPanel,
    updateButton: updateButton,
  };
})(window);
