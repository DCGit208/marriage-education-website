/**
 * SBD Book Reader — settings (Milestone 2 themes + Milestone 3 typography).
 * Window: SBDReader.Settings
 */
(function (global) {
  'use strict';

  var KEY_THEME = 'sbd-reader:theme';
  var KEY_FONT = 'sbd-reader:font';
  var KEY_SIZE = 'sbd-reader:size';

  var THEMES = ['light', 'sepia', 'dark'];
  var FONTS = ['serif', 'sans'];
  var SIZES = ['small', 'normal', 'large', 'xlarge'];

  var META_COLORS = {
    light: '#FCFAF6',
    sepia: '#F2E7CF',
    dark: '#161616',
  };

  var FONT_LABELS = { serif: 'Serif', sans: 'Sans' };
  var SIZE_LABELS = {
    small: 'Small',
    normal: 'Normal',
    large: 'Large',
    xlarge: 'XL',
  };

  var state = {
    theme: 'light',
    font: 'serif',
    size: 'normal',
  };

  function pick(list, value, fallback) {
    var v = String(value || '').toLowerCase();
    return list.indexOf(v) !== -1 ? v : fallback;
  }

  function readKey(key, list, fallback) {
    try {
      return pick(list, localStorage.getItem(key), fallback);
    } catch (_) {
      return fallback;
    }
  }

  function writeKey(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {
      /* private mode */
    }
  }

  function applyTheme(theme) {
    state.theme = pick(THEMES, theme, 'light');
    if (document.body) document.body.setAttribute('data-br-theme', state.theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', META_COLORS[state.theme] || META_COLORS.light);
    var btn = document.getElementById('brThemeBtn');
    if (btn) {
      var label = state.theme.charAt(0).toUpperCase() + state.theme.slice(1);
      btn.textContent = 'Theme: ' + label;
      btn.setAttribute('aria-label', 'Reading theme: ' + label + '. Activate to change.');
    }
    return state.theme;
  }

  function applyFont(font) {
    state.font = pick(FONTS, font, 'serif');
    if (document.body) document.body.setAttribute('data-br-font', state.font);
    var btn = document.getElementById('brFontBtn');
    if (btn) {
      btn.textContent = 'Font: ' + FONT_LABELS[state.font];
      btn.setAttribute(
        'aria-label',
        'Reading font: ' + FONT_LABELS[state.font] + '. Activate to change.'
      );
    }
    return state.font;
  }

  function applySize(size) {
    state.size = pick(SIZES, size, 'normal');
    if (document.body) document.body.setAttribute('data-br-size', state.size);
    var btn = document.getElementById('brSizeBtn');
    if (btn) {
      btn.textContent = 'Size: ' + SIZE_LABELS[state.size];
      btn.setAttribute(
        'aria-label',
        'Reading size: ' + SIZE_LABELS[state.size] + '. Activate to change.'
      );
    }
    return state.size;
  }

  function setTheme(theme) {
    var next = applyTheme(theme);
    writeKey(KEY_THEME, next);
    return next;
  }

  function setFont(font) {
    var next = applyFont(font);
    writeKey(KEY_FONT, next);
    return next;
  }

  function setSize(size) {
    var next = applySize(size);
    writeKey(KEY_SIZE, next);
    return next;
  }

  function cycle(list, current) {
    var i = list.indexOf(current);
    return list[(i + 1) % list.length];
  }

  function cycleTheme() {
    return setTheme(cycle(THEMES, state.theme));
  }

  function cycleFont() {
    return setFont(cycle(FONTS, state.font));
  }

  function cycleSize() {
    return setSize(cycle(SIZES, state.size));
  }

  function init() {
    applyTheme(readKey(KEY_THEME, THEMES, 'light'));
    applyFont(readKey(KEY_FONT, FONTS, 'serif'));
    applySize(readKey(KEY_SIZE, SIZES, 'normal'));

    var themeBtn = document.getElementById('brThemeBtn');
    if (themeBtn) themeBtn.addEventListener('click', cycleTheme);
    var fontBtn = document.getElementById('brFontBtn');
    if (fontBtn) fontBtn.addEventListener('click', cycleFont);
    var sizeBtn = document.getElementById('brSizeBtn');
    if (sizeBtn) sizeBtn.addEventListener('click', cycleSize);
  }

  global.SBDReader = global.SBDReader || {};
  global.SBDReader.Settings = {
    THEMES: THEMES.slice(),
    FONTS: FONTS.slice(),
    SIZES: SIZES.slice(),
    init: init,
    getTheme: function () { return state.theme; },
    getFont: function () { return state.font; },
    getSize: function () { return state.size; },
    setTheme: setTheme,
    setFont: setFont,
    setSize: setSize,
    cycleTheme: cycleTheme,
    cycleFont: cycleFont,
    cycleSize: cycleSize,
  };
})(window);
