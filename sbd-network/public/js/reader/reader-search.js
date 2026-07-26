/**
 * SBD Book Reader — chapter search (Milestone 9).
 * Window: SBDReader.Search
 */
(function (global) {
  'use strict';

  var MAX_HITS = 200;

  var state = {
    bodyEl: null,
    query: '',
    hits: [],
    index: -1,
    open: false,
  };

  function qs(id) {
    return document.getElementById(id);
  }

  function unwrapHits(root) {
    if (!root) return;
    root.querySelectorAll('mark.br-search-hit').forEach(function (mark) {
      var parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });
  }

  function clearResults() {
    unwrapHits(state.bodyEl);
    state.hits = [];
    state.index = -1;
    state.query = '';
    updateChrome();
  }

  function updateChrome() {
    var count = qs('brSearchCount');
    var prev = qs('brSearchPrev');
    var next = qs('brSearchNext');
    var n = state.hits.length;
    if (count) {
      if (!state.query) count.textContent = '';
      else if (!n) count.textContent = 'No matches';
      else count.textContent = state.index + 1 + ' / ' + n;
    }
    if (prev) prev.disabled = n < 2;
    if (next) next.disabled = n < 2;
  }

  function setActive(i) {
    state.hits.forEach(function (el) {
      el.classList.remove('br-search-hit--active');
    });
    if (i < 0 || i >= state.hits.length) {
      state.index = -1;
      updateChrome();
      return;
    }
    state.index = i;
    var el = state.hits[i];
    el.classList.add('br-search-hit--active');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    updateChrome();
  }

  function collectTextNodes(root) {
    var nodes = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node || !node.nodeValue || !node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        var p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest('mark.br-search-hit, script, style')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  function wrapMatch(textNode, start, end) {
    var range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    var mark = document.createElement('mark');
    mark.className = 'br-search-hit';
    mark.setAttribute('data-no-chrome-toggle', '');
    try {
      range.surroundContents(mark);
      return mark;
    } catch (_) {
      try {
        var frag = range.extractContents();
        mark.appendChild(frag);
        range.insertNode(mark);
        return mark;
      } catch (e2) {
        return null;
      }
    }
  }

  function runSearch(raw) {
    var body = state.bodyEl;
    if (!body) return;
    unwrapHits(body);
    state.hits = [];
    state.index = -1;
    var q = String(raw || '').trim();
    state.query = q;
    if (!q) {
      updateChrome();
      return;
    }

    var lower = q.toLowerCase();
    var nodes = collectTextNodes(body);
    // Walk backwards so earlier wraps don't invalidate later node offsets
    for (var i = nodes.length - 1; i >= 0; i--) {
      var node = nodes[i];
      var text = node.nodeValue;
      var hay = text.toLowerCase();
      var from = hay.length;
      var matches = [];
      while (from > 0) {
        var at = hay.lastIndexOf(lower, from - 1);
        if (at < 0) break;
        matches.push(at);
        from = at;
      }
      matches.forEach(function (at) {
        if (state.hits.length >= MAX_HITS) return;
        var mark = wrapMatch(node, at, at + q.length);
        if (mark) state.hits.unshift(mark);
      });
    }

    if (state.hits.length) setActive(0);
    else updateChrome();
  }

  function go(delta) {
    if (!state.hits.length) return;
    var next = (state.index + delta + state.hits.length) % state.hits.length;
    setActive(next);
  }

  function openBar() {
    var bar = qs('brSearchBar');
    if (!bar) return;
    state.open = true;
    bar.hidden = false;
    var input = qs('brSearchInput');
    if (input) {
      input.focus();
      input.select();
    }
  }

  function closeBar() {
    state.open = false;
    var bar = qs('brSearchBar');
    if (bar) bar.hidden = true;
    clearResults();
    var input = qs('brSearchInput');
    if (input) input.value = '';
  }

  function toggleBar() {
    if (state.open) closeBar();
    else openBar();
  }

  function bindUi() {
    var openBtn = qs('brSearchBtn');
    if (openBtn) {
      openBtn.addEventListener('click', function () {
        toggleBar();
      });
    }
    var closeBtn = qs('brSearchClose');
    if (closeBtn) closeBtn.addEventListener('click', closeBar);
    var input = qs('brSearchInput');
    if (input) {
      var timer = null;
      input.addEventListener('input', function () {
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
          runSearch(input.value);
        }, 120);
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) go(-1);
          else go(1);
        } else if (e.key === 'Escape') {
          closeBar();
        }
      });
    }
    var prev = qs('brSearchPrev');
    if (prev) prev.addEventListener('click', function () { go(-1); });
    var next = qs('brSearchNext');
    if (next) next.addEventListener('click', function () { go(1); });
  }

  function startChapter(bodyEl) {
    clearResults();
    state.bodyEl = bodyEl || null;
    if (state.open) {
      var input = qs('brSearchInput');
      if (input && input.value.trim()) runSearch(input.value);
    }
  }

  function stop() {
    clearResults();
    state.bodyEl = null;
    closeBar();
  }

  function init() {
    bindUi();
  }

  global.SBDReader = global.SBDReader || {};
  global.SBDReader.Search = {
    init: init,
    startChapter: startChapter,
    stop: stop,
    openBar: openBar,
    closeBar: closeBar,
    clearResults: clearResults,
  };
})(window);
