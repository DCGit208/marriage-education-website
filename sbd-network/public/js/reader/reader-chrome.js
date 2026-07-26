/**
 * SBD Book Reader — immersive chrome + center-tap (Milestone 4).
 * Frozen conflict rules: tap≠pan; ignore selection; ignore interactive targets.
 * Window: SBDReader.Chrome
 */
(function (global) {
  'use strict';

  var TAP_SLOP_PX = 10;
  var ZONE_TOP = 0.2;
  var ZONE_BOTTOM = 0.8;
  var HINT_MS = 2200;

  var state = {
    visible: true,
    reading: false,
    pointer: null,
    hintTimer: null,
  };

  function root() {
    return document.body;
  }

  function isReading() {
    return !!(root() && root().classList.contains('is-reading'));
  }

  function hasSelection() {
    var sel = global.getSelection && global.getSelection();
    return !!(sel && String(sel.toString() || '').trim());
  }

  function isInteractive(target) {
    if (!target || !target.closest) return false;
    return !!target.closest(
      'a, button, input, textarea, select, label, [data-no-chrome-toggle], .br-chrome, .br-toc, .br-toc-backdrop, .br-bookmarks, .br-bookmark-backdrop, .br-marks, .br-marks-backdrop, .br-selection-bar, .br-selection-note, .br-note-popover, .br-note-marker, .br-search-bar, .br-define-panel'
    );
  }

  function inCenterZone(clientY) {
    var h = global.innerHeight || document.documentElement.clientHeight || 0;
    if (!h) return false;
    var ratio = clientY / h;
    return ratio >= ZONE_TOP && ratio <= ZONE_BOTTOM;
  }

  function setVisible(visible) {
    state.visible = !!visible;
    var body = root();
    if (!body) return state.visible;

    if (!state.reading) {
      body.classList.add('br-chrome-visible');
      body.classList.remove('br-chrome-hidden');
      state.visible = true;
    } else if (state.visible) {
      body.classList.add('br-chrome-visible');
      body.classList.remove('br-chrome-hidden');
    } else {
      body.classList.add('br-chrome-hidden');
      body.classList.remove('br-chrome-visible');
    }

    var chrome = document.getElementById('brChrome');
    if (chrome) {
      chrome.setAttribute('aria-hidden', state.reading && !state.visible ? 'true' : 'false');
    }
    var Progress = global.SBDReader && global.SBDReader.Progress;
    if (Progress && typeof Progress.repaint === 'function') Progress.repaint();
    return state.visible;
  }

  function show() {
    clearHint();
    return setVisible(true);
  }

  function hide() {
    if (!state.reading) return setVisible(true);
    return setVisible(false);
  }

  function toggle() {
    if (!state.reading) return show();
    clearHint();
    return setVisible(!state.visible);
  }

  function clearHint() {
    if (state.hintTimer) {
      clearTimeout(state.hintTimer);
      state.hintTimer = null;
    }
    var hint = document.getElementById('brChromeHint');
    if (hint) {
      hint.hidden = true;
      hint.classList.remove('is-shown');
    }
  }

  function flashHint() {
    clearHint();
    var hint = document.getElementById('brChromeHint');
    if (!hint || !state.reading || state.visible) return;
    hint.hidden = false;
    // Force reflow so opacity transition runs
    void hint.offsetWidth;
    hint.classList.add('is-shown');
    state.hintTimer = setTimeout(function () {
      hint.classList.remove('is-shown');
      state.hintTimer = setTimeout(function () {
        hint.hidden = true;
        state.hintTimer = null;
      }, 280);
    }, HINT_MS);
  }

  function setReadingMode(reading) {
    state.reading = !!reading;
    if (state.reading) {
      // Spec: chrome hidden by default while reading
      setVisible(false);
      flashHint();
    } else {
      clearHint();
      setVisible(true);
    }
  }

  function onPointerDown(e) {
    if (!state.reading) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    state.pointer = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      target: e.target,
    };
  }

  function onPointerUp(e) {
    if (!state.reading || !state.pointer) return;
    if (e.pointerId !== state.pointer.id) return;

    var start = state.pointer;
    state.pointer = null;

    var dx = Math.abs(e.clientX - start.x);
    var dy = Math.abs(e.clientY - start.y);
    if (dx > TAP_SLOP_PX || dy > TAP_SLOP_PX) return; // pan / drag, not tap

    if (hasSelection()) return;
    if (isInteractive(start.target) || isInteractive(e.target)) return;
    if (!inCenterZone(start.y)) return; // top/bottom 20%: scroll only

    toggle();
  }

  function onPointerCancel() {
    state.pointer = null;
  }

  function onKeyDown(e) {
    if (!state.reading) return;
    if (e.key === 'Escape') {
      show();
      return;
    }
    // First Tab while chrome hidden reveals chrome for keyboard users
    if (e.key === 'Tab' && !state.visible) {
      show();
    }
  }

  function init() {
    setReadingMode(false);
    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.addEventListener('pointerup', onPointerUp, { passive: true });
    document.addEventListener('pointercancel', onPointerCancel, { passive: true });
    document.addEventListener('keydown', onKeyDown);
  }

  global.SBDReader = global.SBDReader || {};
  global.SBDReader.Chrome = {
    init: init,
    show: show,
    hide: hide,
    toggle: toggle,
    setReadingMode: setReadingMode,
    isVisible: function () { return state.visible; },
  };
})(window);
