/**
 * SBD Book Reader — Define selection (Milestone 9).
 * Free Dictionary API: https://api.dictionaryapi.dev
 * Window: SBDReader.Define
 */
(function (global) {
  'use strict';

  var API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

  var state = {
    open: false,
    abort: null,
    pendingPhrase: '',
  };

  function qs(id) {
    return document.getElementById(id);
  }

  function normalizePhrase(raw) {
    raw = String(raw || '').trim();
    if (!raw) return '';
    var cleaned = raw.replace(/[^a-zA-ZÀ-ÿ'’-]+/g, ' ').trim();
    if (!cleaned) cleaned = raw.replace(/[^\w'’-]+/g, ' ').trim();
    var parts = cleaned.split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    if (parts.length > 4) return parts.slice(0, 4).join(' ');
    return parts.join(' ');
  }

  function selectedWord() {
    var sel = global.getSelection && global.getSelection();
    if (!sel || sel.isCollapsed) return '';
    return normalizePhrase(sel.toString());
  }

  /** Keep a snapshot — tapping Define collapses the selection on mobile. */
  function capturePending() {
    var live = selectedWord();
    if (live) {
      state.pendingPhrase = live;
      return live;
    }
    var Ann = global.SBDReader && global.SBDReader.Annotations;
    if (Ann && typeof Ann.getPendingText === 'function') {
      var fromAnn = normalizePhrase(Ann.getPendingText());
      if (fromAnn) {
        state.pendingPhrase = fromAnn;
        return fromAnn;
      }
    }
    return state.pendingPhrase || '';
  }

  function phraseForLookup() {
    return capturePending() || state.pendingPhrase || '';
  }

  function closePanel() {
    state.open = false;
    if (state.abort) {
      try {
        state.abort.abort();
      } catch (_) {}
      state.abort = null;
    }
    var panel = qs('brDefinePanel');
    if (panel) panel.hidden = true;
  }

  function positionPanel() {
    var panel = qs('brDefinePanel');
    var bar = qs('brSelectionBar');
    if (!panel || panel.hidden) return;
    var pad = 8;
    var rect = bar && !bar.hidden ? bar.getBoundingClientRect() : null;
    if (!rect) {
      panel.style.top = '20%';
      panel.style.left = '50%';
      panel.style.transform = 'translateX(-50%)';
      return;
    }
    panel.style.transform = '';
    var top = rect.bottom + 6;
    var left = Math.max(pad, Math.min(rect.left, global.innerWidth - panel.offsetWidth - pad));
    if (top + panel.offsetHeight > global.innerHeight - pad) {
      top = Math.max(pad, rect.top - panel.offsetHeight - 6);
    }
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';
  }

  function showPanel(title, bodyHtml) {
    var panel = qs('brDefinePanel');
    var titleEl = qs('brDefineTitle');
    var bodyEl = qs('brDefineBody');
    if (!panel || !bodyEl) return;
    if (titleEl) titleEl.textContent = title || 'Define';
    bodyEl.innerHTML = bodyHtml || '';
    panel.hidden = false;
    state.open = true;
    global.requestAnimationFrame(positionPanel);
  }

  function esc(s) {
    var Renderer = global.SBDReader && global.SBDReader.Renderer;
    return Renderer ? Renderer.esc(s) : String(s == null ? '' : s);
  }

  function formatEntry(json, word) {
    if (!Array.isArray(json) || !json.length) {
      return '<p class="br-define-empty">No definition found for “' + esc(word) + '”.</p>';
    }
    var entry = json[0];
    var bits = [];
    var phon = entry.phonetic || (entry.phonetics && entry.phonetics[0] && entry.phonetics[0].text) || '';
    bits.push('<p class="br-define-word">' + esc(entry.word || word) + (phon ? ' <span class="br-define-phon">' + esc(phon) + '</span>' : '') + '</p>');
    var meanings = entry.meanings || [];
    var shown = 0;
    for (var i = 0; i < meanings.length && shown < 3; i++) {
      var m = meanings[i];
      var defs = m.definitions || [];
      if (!defs.length) continue;
      bits.push('<p class="br-define-pos">' + esc(m.partOfSpeech || '') + '</p>');
      bits.push('<p class="br-define-def">' + esc(defs[0].definition || '') + '</p>');
      if (defs[0].example) {
        bits.push('<p class="br-define-ex">“' + esc(defs[0].example) + '”</p>');
      }
      shown += 1;
    }
    if (shown === 0) {
      return '<p class="br-define-empty">No definition found for “' + esc(word) + '”.</p>';
    }
    return bits.join('');
  }

  function lookup() {
    var word = phraseForLookup();
    if (!word) {
      showPanel('Define', '<p class="br-define-empty">Select a word to define.</p>');
      return;
    }
    if (!navigator.onLine) {
      showPanel(word, '<p class="br-define-empty">You’re offline. Connect to look up definitions.</p>');
      return;
    }

    showPanel(word, '<p class="br-define-empty">Looking up…</p>');
    if (state.abort) {
      try {
        state.abort.abort();
      } catch (_) {}
    }
    state.abort = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var term = word.split(/\s+/)[0].replace(/^[''-]+|[''-]+$/g, '');
    fetch(API + encodeURIComponent(term.toLowerCase()), {
      signal: state.abort ? state.abort.signal : undefined,
    })
      .then(function (res) {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error('lookup-failed');
        return res.json();
      })
      .then(function (data) {
        showPanel(word, formatEntry(data, term));
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;
        showPanel(word, '<p class="br-define-empty">Definition unavailable right now.</p>');
      });
  }

  function bindUi() {
    var btn = qs('brSelDefine');
    if (btn) {
      // Capture before the tap collapses the selection (iOS/Android)
      btn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        capturePending();
      });
      btn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        capturePending();
      });
      btn.addEventListener('touchstart', function () {
        capturePending();
      }, { passive: true });
      btn.addEventListener('click', function () {
        lookup();
      });
    }
    var closeBtn = qs('brDefineClose');
    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    document.addEventListener('selectionchange', function () {
      var live = selectedWord();
      if (live) state.pendingPhrase = live;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.open) closePanel();
    });
    document.addEventListener('mousedown', function (e) {
      if (!state.open) return;
      var t = e.target;
      if (t && t.closest && t.closest('.br-define-panel, .br-selection-bar')) return;
      closePanel();
    });
  }

  function init() {
    bindUi();
  }

  function stop() {
    closePanel();
  }

  global.SBDReader = global.SBDReader || {};
  global.SBDReader.Define = {
    init: init,
    stop: stop,
    closePanel: closePanel,
    lookup: lookup,
  };
})(window);
