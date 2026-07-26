/**
 * SBD Book Reader — text highlights + notes (Milestone 8).
 * Anchor: character offsets in chapter article body (textContent).
 * Window: SBDReader.Annotations
 */
(function (global) {
  'use strict';

  var KEY_PREFIX = 'sbd-reader:highlights:';
  var KEY_UPDATED_PREFIX = 'sbd-reader:highlights-updated:';
  var MAX_HIGHLIGHTS = 200;

  var state = {
    bookId: '',
    chapterId: '',
    chapters: [],
    bodyEl: null,
    toolbar: null,
    notePanel: null,
    lastRange: null,
    pendingOffsets: null,
    noteOpen: false,
    notePopoverOpen: false,
    notePopoverAnchor: null,
    selTimer: null,
    pendingScrollId: '',
    onGoTo: null,
    onSaved: null,
  };

  function qs(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    var Renderer = global.SBDReader && global.SBDReader.Renderer;
    return Renderer ? Renderer.esc(s) : String(s == null ? '' : s);
  }

  function inferKind(h) {
    if (h && (h.kind === 'note' || h.kind === 'highlight')) return h.kind;
    return h && String(h.note || '').trim() ? 'note' : 'highlight';
  }

  function storageKey(bookId) {
    return KEY_PREFIX + String(bookId || '');
  }

  function updatedKey(bookId) {
    return KEY_UPDATED_PREFIX + String(bookId || '');
  }

  function updatedAt(bookId) {
    try {
      var n = Number(localStorage.getItem(updatedKey(bookId)));
      return isFinite(n) ? n : 0;
    } catch (_) {
      return 0;
    }
  }

  function readAll(bookId) {
    try {
      var raw = localStorage.getItem(storageKey(bookId));
      if (!raw) return [];
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function writeAll(bookId, list, ts) {
    try {
      localStorage.setItem(storageKey(bookId), JSON.stringify(list.slice(0, MAX_HIGHLIGHTS)));
      localStorage.setItem(updatedKey(bookId), String(ts || Date.now()));
    } catch (_) {}
    if (global.SBDReader && global.SBDReader.Sync && global.SBDReader.Sync.onHighlightsChanged) {
      global.SBDReader.Sync.onHighlightsChanged(bookId);
    }
    renderMarksPanel();
    updateMarksButton();
  }

  function replaceAll(bookId, list, ts) {
    writeAll(bookId, normalizeList(list), ts || Date.now());
  }

  function normalizeList(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map(function (h) {
        if (!h || !h.chapterId) return null;
        var start = Number(h.start);
        var end = Number(h.end);
        if (!isFinite(start) || !isFinite(end) || end <= start) return null;
        var note = String(h.note || '');
        var kind = inferKind(h);
        if (kind === 'highlight') note = '';
        return {
          id: String(h.id || ''),
          chapterId: String(h.chapterId),
          start: start,
          end: end,
          text: String(h.text || ''),
          kind: kind,
          note: note,
          createdAt: Number(h.createdAt) || Date.now(),
          updatedAt: Number(h.updatedAt) || Date.now(),
        };
      })
      .filter(Boolean)
      .slice(0, MAX_HIGHLIGHTS);
  }

  function forChapter(bookId, chapterId) {
    return readAll(bookId).filter(function (h) {
      return h.chapterId === chapterId;
    });
  }

  function getOffsets(root, range) {
    if (!root || !range || range.collapsed) return null;
    try {
      var pre = document.createRange();
      pre.selectNodeContents(root);
      pre.setEnd(range.startContainer, range.startOffset);
      var start = pre.toString().length;
      pre.setEnd(range.endContainer, range.endOffset);
      var end = pre.toString().length;
      var text = range.toString();
      if (!text || !text.trim()) return null;
      // Trim whitespace so the note anchors to the first real character,
      // not inter-element newlines that sit as direct children of the body.
      var lead = (text.match(/^\s*/) || [''])[0].length;
      var trail = (text.match(/\s*$/) || [''])[0].length;
      if (lead + trail >= text.length) return null;
      return {
        start: start + lead,
        end: end - trail,
        text: text.slice(lead, text.length - trail),
      };
    } catch (_) {
      return null;
    }
  }

  function offsetsToRange(root, start, end) {
    if (!root) return null;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var pos = 0;
    var startNode = null;
    var startOff = 0;
    var endNode = null;
    var endOff = 0;
    var node;

    while ((node = walker.nextNode())) {
      var len = node.textContent.length;
      if (!startNode && pos + len >= start) {
        startNode = node;
        startOff = Math.max(0, start - pos);
      }
      if (pos + len >= end) {
        endNode = node;
        endOff = Math.max(0, end - pos);
        break;
      }
      pos += len;
    }

    if (!startNode || !endNode) return null;
    try {
      var range = document.createRange();
      range.setStart(startNode, startOff);
      range.setEnd(endNode, endOff);
      return range;
    } catch (_) {
      return null;
    }
  }

  function isWhitespaceText(node) {
    return !!(node && node.nodeType === 3 && !/\S/.test(node.textContent || ''));
  }

  function isArticleFlowRoot(el) {
    return !!(
      el &&
      (el.id === 'brArticleBody' ||
        (el.classList &&
          (el.classList.contains('br-article-body') || el.classList.contains('br-article'))))
    );
  }

  /** Collapsed range at first non-whitespace character inside `range`. */
  function noteInsertPoint(root, range) {
    if (!root || !range) return null;
    var at = document.createRange();
    try {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      var node;
      while ((node = walker.nextNode())) {
        if (isWhitespaceText(node)) continue;
        try {
          if (!range.intersectsNode(node)) continue;
        } catch (_) {
          continue;
        }
        var off = 0;
        if (node === range.startContainer) {
          off = range.startOffset;
          while (off < node.textContent.length && /\s/.test(node.textContent.charAt(off))) off += 1;
        }
        if (off >= node.textContent.length) continue;
        at.setStart(node, off);
        at.collapse(true);
        return at;
      }
    } catch (_) {}
    at = range.cloneRange();
    at.collapse(true);
    return at;
  }

  function findRangeByExcerpt(root, entry) {
    if (!root || !entry || !entry.text) return null;
    var needle = String(entry.text).replace(/\s+/g, ' ').trim();
    if (needle.length < 8) return null;
    var short = needle.slice(0, Math.min(80, needle.length));
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var node;
    var chunks = [];
    var full = '';
    while ((node = walker.nextNode())) {
      if (isWhitespaceText(node)) continue;
      chunks.push({ node: node, start: full.length, text: node.textContent });
      full += node.textContent;
    }
    var norm = '';
    var map = [];
    for (var i = 0; i < full.length; i++) {
      var ch = full.charAt(i);
      if (/\s/.test(ch)) {
        if (norm && norm.charAt(norm.length - 1) !== ' ') {
          map.push(i);
          norm += ' ';
        }
      } else {
        map.push(i);
        norm += ch;
      }
    }
    var idx = norm.indexOf(short);
    if (idx < 0) idx = norm.indexOf(needle.slice(0, 40));
    if (idx < 0) return null;
    var absStart = map[idx];
    var absEnd = map[Math.min(map.length - 1, idx + short.length - 1)] + 1;
    return offsetsToRange(root, absStart, absEnd);
  }

  function placeNoteMarker(root, range, entry) {
    if (!root || !entry) return false;
    var useRange = range;
    // If excerpt doesn't sit at this range start, trust the stored text (fixes bad offsets).
    if (entry.text && useRange) {
      var startSample = String(useRange.toString() || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 24);
      var want = String(entry.text).replace(/\s+/g, ' ').trim().slice(0, 24);
      if (want && startSample && startSample.indexOf(want.slice(0, 12)) !== 0) {
        var byText = findRangeByExcerpt(root, entry);
        if (byText) useRange = byText;
      }
    }
    if (!useRange && entry.text) useRange = findRangeByExcerpt(root, entry);
    if (!useRange) return false;

    var marker = createNoteMarker(entry);
    var at = noteInsertPoint(root, useRange);
    if (!at) return false;
    try {
      at.insertNode(marker);
    } catch (_) {
      return false;
    }

    if (marker.parentNode && isArticleFlowRoot(marker.parentNode)) {
      var host = useRange.commonAncestorContainer;
      if (host && host.nodeType === 3) host = host.parentNode;
      while (
        host &&
        host !== root &&
        host.nodeType === 1 &&
        !/^(P|H1|H2|H3|H4|LI|BLOCKQUOTE)$/i.test(host.tagName)
      ) {
        host = host.parentNode;
      }
      if (host && host !== root) {
        if (marker.parentNode) marker.parentNode.removeChild(marker);
        var tw = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, null);
        var tn;
        var placed = false;
        while ((tn = tw.nextNode())) {
          if (isWhitespaceText(tn)) continue;
          tn.parentNode.insertBefore(marker, tn);
          placed = true;
          break;
        }
        if (!placed) host.insertBefore(marker, host.firstChild);
      }
    }

    if (marker.parentNode && isArticleFlowRoot(marker.parentNode)) {
      if (marker.parentNode) marker.parentNode.removeChild(marker);
      return false;
    }
    return !!marker.parentNode;
  }

  function surroundRange(range, el) {
    try {
      range.surroundContents(el);
      return true;
    } catch (_) {
      try {
        var frag = range.extractContents();
        el.appendChild(frag);
        range.insertNode(el);
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  function unwrapEl(el) {
    if (!el || !el.parentNode) return;
    var parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }

  function createNoteMarker(entry) {
    var marker = document.createElement('span');
    marker.className = 'br-note-marker';
    marker.setAttribute('data-hl-id', entry.id);
    marker.setAttribute('data-kind', 'note');
    marker.setAttribute('data-no-chrome-toggle', '');
    marker.setAttribute('role', 'button');
    marker.setAttribute('tabindex', '0');
    marker.setAttribute('aria-label', 'Note on “' + excerpt(entry.text, 48) + '”');
    bindNoteEl(marker, entry.id);
    return marker;
  }

  function applyHighlightRange(range, entry) {
    if (!range || range.collapsed || !entry) return false;
    var mark = document.createElement('mark');
    mark.className = 'br-highlight br-highlight--highlight';
    mark.setAttribute('data-hl-id', entry.id);
    mark.setAttribute('data-kind', 'highlight');
    mark.setAttribute('data-no-chrome-toggle', '');
    return surroundRange(range, mark);
  }

  function bindNoteEl(el, entryId) {
    function openFromEl() {
      var item = readAll(state.bookId).find(function (h) {
        return h.id === entryId;
      });
      openNotePopover(el, item ? item.note : '');
    }
    el.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
    });
    el.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openFromEl();
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        openFromEl();
      }
    });
  }

  function applyNoteRange(range, entry) {
    if (!range || range.collapsed || !entry || !state.bodyEl) return false;
    return placeNoteMarker(state.bodyEl, range, entry);
  }

  function applyAnnotationRange(range, entry) {
    if (!entry) return false;
    if (inferKind(entry) === 'note') return applyNoteRange(range, entry);
    return applyHighlightRange(range, entry);
  }

  function applyStored(bodyEl, chapterId) {
    if (!bodyEl || !state.bookId) return;
    var items = forChapter(state.bookId, chapterId)
      .slice()
      .sort(function (a, b) {
        return b.start - a.start;
      });
    items.forEach(function (hl) {
      var range = offsetsToRange(bodyEl, hl.start, hl.end);
      if (range) applyAnnotationRange(range, hl);
    });
  }

  function chapterTitle(chapterId) {
    for (var i = 0; i < state.chapters.length; i++) {
      if (state.chapters[i] && state.chapters[i].id === chapterId) {
        return state.chapters[i].title || 'Chapter';
      }
    }
    return 'Chapter';
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

  function excerpt(text, max) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return 'Passage';
    if (s.length <= (max || 72)) return s;
    return s.slice(0, max || 72) + '…';
  }

  function notifySaved(msg) {
    if (typeof state.onSaved === 'function') state.onSaved(msg);
  }

  function updateMarksButton() {
    var openBtn = qs('brMarksOpenBtn');
    if (!openBtn) return;
    var items = readAll(state.bookId);
    openBtn.hidden = items.length === 0;
    openBtn.textContent =
      items.length === 1 ? '1 highlight & note' : items.length + ' highlights & notes';
  }

  function renderMarksPanel() {
    var listEl = qs('brMarkList');
    if (!listEl) return;
    var items = readAll(state.bookId);
    if (!items.length) {
      listEl.innerHTML =
        '<li class="br-mark-empty">No highlights or notes yet. Select text while reading, then tap Highlight or Note.</li>';
      return;
    }
    listEl.innerHTML = items
      .map(function (h) {
        var kind = inferKind(h);
        var kindLabel = kind === 'note' ? 'Note' : 'Highlight';
        var noteHtml =
          kind === 'note' && h.note
            ? '<span class="br-mark-note">' + esc(h.note) + '</span>'
            : '';
        return (
          '<li class="br-mark-item">' +
          '<button type="button" class="br-mark-go" data-id="' +
          esc(h.id) +
          '" data-no-chrome-toggle>' +
          '<span class="br-mark-kind br-mark-kind--' +
          kind +
          '">' +
          esc(kindLabel) +
          '</span>' +
          '<span class="br-mark-excerpt">' +
          esc(excerpt(h.text)) +
          '</span>' +
          noteHtml +
          '<span class="br-mark-meta">' +
          esc(chapterTitle(h.chapterId)) +
          ' · ' +
          esc(formatWhen(h.createdAt)) +
          '</span></button>' +
          '<button type="button" class="br-mark-remove" data-id="' +
          esc(h.id) +
          '" data-no-chrome-toggle aria-label="Remove">×</button>' +
          '</li>'
        );
      })
      .join('');

    listEl.querySelectorAll('.br-mark-go').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-id');
        var item = readAll(state.bookId).find(function (h) {
          return h.id === id;
        });
        if (item && typeof state.onGoTo === 'function') {
          state.onGoTo(item);
          closeMarksPanel();
        }
      };
    });

    listEl.querySelectorAll('.br-mark-remove').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        removeById(btn.getAttribute('data-id'));
      };
    });
  }

  function openMarksPanel() {
    var panel = qs('brMarks');
    var backdrop = qs('brMarksBackdrop');
    renderMarksPanel();
    if (panel) {
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
    }
    if (backdrop) backdrop.hidden = false;
  }

  function closeMarksPanel() {
    var panel = qs('brMarks');
    var backdrop = qs('brMarksBackdrop');
    if (panel) {
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) backdrop.hidden = true;
  }

  function findEntry(id) {
    return readAll(state.bookId).find(function (h) {
      return h.id === id;
    });
  }

  function scrollToAnnotation(bodyEl, id) {
    if (!bodyEl || !id) return;
    global.setTimeout(function () {
      var entry = findEntry(id);
      var kind = entry ? inferKind(entry) : 'highlight';
      var target;
      if (kind === 'note') {
        target = bodyEl.querySelector('.br-note-marker[data-hl-id="' + id + '"]');
      } else {
        target = bodyEl.querySelector('mark[data-hl-id="' + id + '"]');
      }
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      var pulseClass = kind === 'note' ? 'br-note-marker--pulse' : 'br-highlight--pulse';
      target.classList.add(pulseClass);
      global.setTimeout(function () {
        target.classList.remove(pulseClass);
      }, 2000);
    }, 80);
  }

  function removeDomById(hlId) {
    if (!state.bodyEl || !hlId) return;
    var marker = state.bodyEl.querySelector('.br-note-marker[data-hl-id="' + hlId + '"]');
    if (marker) {
      marker.remove();
      return;
    }
    var legacy = state.bodyEl.querySelector('.br-note[data-hl-id="' + hlId + '"]');
    if (legacy) {
      unwrapEl(legacy);
      return;
    }
    var mark = state.bodyEl.querySelector('mark[data-hl-id="' + hlId + '"]');
    if (mark) unwrapEl(mark);
  }

  function removeById(hlId) {
    if (!hlId || !state.bookId) return false;
    var list = readAll(state.bookId).filter(function (h) {
      return h.id !== hlId;
    });
    writeAll(state.bookId, list);
    removeDomById(hlId);
    renderMarksPanel();
    updateMarksButton();
    return true;
  }

  function openNotePopover(anchorEl, noteText) {
    var pop = qs('brNotePopover');
    var body = qs('brNotePopoverBody');
    if (!pop || !anchorEl) return;
    closeNotePanel();
    var bar = state.toolbar || qs('brSelectionBar');
    if (bar) bar.hidden = true;
    state.lastRange = null;
    state.pendingOffsets = null;
    if (body) body.textContent = String(noteText || '');
    pop.hidden = false;
    state.notePopoverOpen = true;
    state.notePopoverAnchor = anchorEl;
    global.requestAnimationFrame(function () {
      positionNotePopover(anchorEl);
      var closeBtn = qs('brNotePopoverClose');
      if (closeBtn) closeBtn.focus();
    });
  }

  function positionNotePopover(anchorEl) {
    var pop = qs('brNotePopover');
    if (!pop || !anchorEl) return;
    var rect = anchorEl.getBoundingClientRect();
    var pad = 8;
    pop.style.left = Math.max(pad, Math.min(rect.left, global.innerWidth - pop.offsetWidth - pad)) + 'px';
    var top = rect.bottom + pad;
    if (top + pop.offsetHeight > global.innerHeight - pad) {
      top = Math.max(pad, rect.top - pop.offsetHeight - pad);
    }
    pop.style.top = top + 'px';
  }

  function closeNotePopover() {
    state.notePopoverOpen = false;
    state.notePopoverAnchor = null;
    var pop = qs('brNotePopover');
    if (pop) pop.hidden = true;
  }

  function isAnnotationUi(target) {
    return !!(
      target &&
      target.closest &&
      target.closest(
        '.br-selection-bar, .br-selection-note, .br-marks, .br-marks-backdrop, .br-note-popover, .br-note-marker'
      )
    );
  }

  function closeNotePanel() {
    state.noteOpen = false;
    var note = state.notePanel || qs('brSelectionNote');
    if (note) note.hidden = true;
    var input = qs('brSelectionNoteInput');
    if (input) input.value = '';
  }

  function hideToolbar() {
    closeNotePanel();
    var bar = state.toolbar || qs('brSelectionBar');
    if (bar) bar.hidden = true;
    state.lastRange = null;
    state.pendingOffsets = null;
  }

  function positionToolbar(rect) {
    var bar = state.toolbar || qs('brSelectionBar');
    if (!bar || bar.hidden) return;
    var pad = 8;
    var top = rect.top - bar.offsetHeight - pad;
    var left = rect.left + rect.width / 2 - bar.offsetWidth / 2;
    if (top < 12) top = rect.bottom + pad;
    left = Math.max(8, Math.min(left, global.innerWidth - bar.offsetWidth - 8));
    bar.style.top = top + 'px';
    bar.style.left = left + 'px';
  }

  function findAnnotationIdFromSelection() {
    var sel = global.getSelection && global.getSelection();
    if (!sel || !sel.rangeCount) return '';
    var node = sel.anchorNode;
    if (!node) return '';
    var el = node.nodeType === 1 ? node : node.parentElement;
    if (el && el.closest) {
      var hit = el.closest('.br-note-marker, mark.br-highlight');
      if (hit) return hit.getAttribute('data-hl-id') || '';
    }

    var body = state.bodyEl;
    if (!body || !state.chapterId || !state.bookId) return '';
    var range = sel.getRangeAt(0);
    if (!body.contains(range.commonAncestorContainer)) return '';
    var offsets = getOffsets(body, range);
    if (!offsets) return '';

    var items = forChapter(state.bookId, state.chapterId);
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (inferKind(item) !== 'note') continue;
      if (offsets.start >= item.start && offsets.end <= item.end) return item.id;
      if (offsets.start <= item.start && offsets.end >= item.end) return item.id;
    }
    return '';
  }

  function onSelectionChange() {
    if (state.selTimer) clearTimeout(state.selTimer);
    state.selTimer = setTimeout(function () {
      state.selTimer = null;
      updateToolbarForSelection();
    }, 80);
  }

  function updateToolbarForSelection() {
    var body = state.bodyEl;
    var bar = state.toolbar || qs('brSelectionBar');
    var removeBtn = qs('brSelRemove');
    if (!bar || !body) return;

    if (!document.body.classList.contains('is-reading')) {
      hideToolbar();
      return;
    }

    // User is composing a note — keep toolbar + snapshot; selection may collapse on focus
    if (state.noteOpen) {
      if (bar) bar.hidden = false;
      return;
    }

    if (state.notePopoverOpen) return;

    var sel = global.getSelection && global.getSelection();
    if (!sel || sel.isCollapsed) {
      hideToolbar();
      return;
    }

    var range = sel.getRangeAt(0);
    if (!body.contains(range.commonAncestorContainer)) {
      hideToolbar();
      return;
    }

    var offsets = getOffsets(body, range);
    if (!offsets) {
      hideToolbar();
      return;
    }

    state.lastRange = range.cloneRange();
    state.pendingOffsets = offsets;
    var hlId = findAnnotationIdFromSelection();
    if (removeBtn) removeBtn.hidden = !hlId;

    bar.hidden = false;
    var rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      hideToolbar();
      return;
    }
    positionToolbar(rect);
  }

  function addMark(kind, noteText) {
    var body = state.bodyEl;
    if (!body || !state.bookId || !state.chapterId) return false;

    var offsets = state.pendingOffsets;
    if (!offsets && state.lastRange) {
      offsets = getOffsets(body, state.lastRange);
    }
    if (!offsets) return false;

    var kindResolved = kind === 'note' ? 'note' : 'highlight';
    var note = kindResolved === 'note' ? String(noteText || '').trim() : '';
    if (kindResolved === 'note' && !note) {
      notifySaved('Write something in the note box to save.');
      return false;
    }

    var id = 'hl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    var entry = {
      id: id,
      chapterId: state.chapterId,
      start: offsets.start,
      end: offsets.end,
      text: offsets.text,
      kind: kindResolved,
      note: note,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    var list = readAll(state.bookId);
    list.unshift(entry);
    writeAll(state.bookId, list);

    var range = offsetsToRange(body, offsets.start, offsets.end);
    if (range) applyAnnotationRange(range, entry);
    if (global.getSelection) global.getSelection().removeAllRanges();
    hideToolbar();
    notifySaved(kindResolved === 'note' ? 'Note saved' : 'Highlighted');
    return true;
  }

  function removeHighlightAtSelection() {
    var hlId = findAnnotationIdFromSelection();
    if (!hlId) return false;
    var ok = removeById(hlId);
    if (ok) {
      global.getSelection().removeAllRanges();
      hideToolbar();
      notifySaved('Removed');
    }
    return ok;
  }

  function showNotePanel() {
    var note = state.notePanel || qs('brSelectionNote');
    var bar = state.toolbar || qs('brSelectionBar');
    var body = state.bodyEl;
    if (!note || !bar || bar.hidden || !body) return;

    if (!state.pendingOffsets && state.lastRange) {
      state.pendingOffsets = getOffsets(body, state.lastRange);
    }
    if (!state.pendingOffsets) return;

    state.noteOpen = true;
    note.hidden = false;
    var input = qs('brSelectionNoteInput');
    if (input) {
      input.value = '';
      global.setTimeout(function () {
        input.focus();
      }, 0);
    }
    var rect = bar.getBoundingClientRect();
    note.style.top = rect.bottom + 6 + 'px';
    note.style.left = Math.max(8, rect.left) + 'px';
  }

  function bindUi() {
    var hiBtn = qs('brSelHighlight');
    if (hiBtn) {
      hiBtn.addEventListener('click', function () {
        addMark('highlight');
      });
    }
    var noteBtn = qs('brSelNote');
    if (noteBtn) {
      noteBtn.addEventListener('click', function () {
        showNotePanel();
      });
    }
    var saveNote = qs('brSelectionNoteSave');
    if (saveNote) {
      saveNote.addEventListener('click', function () {
        var input = qs('brSelectionNoteInput');
        if (addMark('note', input ? input.value : '')) {
          closeNotePanel();
        }
      });
    }
    var cancelNote = qs('brSelectionNoteCancel');
    if (cancelNote) {
      cancelNote.addEventListener('click', function () {
        closeNotePanel();
      });
    }
    var removeBtn = qs('brSelRemove');
    if (removeBtn) {
      removeBtn.addEventListener('click', function () {
        removeHighlightAtSelection();
      });
    }
    var marksOpen = qs('brMarksOpenBtn');
    if (marksOpen) {
      marksOpen.addEventListener('click', function () {
        openMarksPanel();
      });
    }
    var marksClose = qs('brMarksClose');
    if (marksClose) marksClose.onclick = closeMarksPanel;
    var marksBackdrop = qs('brMarksBackdrop');
    if (marksBackdrop) marksBackdrop.onclick = closeMarksPanel;
    var popClose = qs('brNotePopoverClose');
    if (popClose) popClose.onclick = closeNotePopover;
  }

  function bindSelection() {
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener(
      'scroll',
      function () {
        if (state.notePopoverOpen && state.notePopoverAnchor) {
          positionNotePopover(state.notePopoverAnchor);
        } else if (!state.noteOpen) {
          hideToolbar();
        }
      },
      { passive: true, capture: true }
    );
    document.addEventListener('mousedown', function (e) {
      if (isAnnotationUi(e.target)) return;
      if (state.noteOpen) closeNotePanel();
      if (state.notePopoverOpen) closeNotePopover();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (state.notePopoverOpen) {
          closeNotePopover();
          return;
        }
        if (state.noteOpen) {
          closeNotePanel();
          return;
        }
        hideToolbar();
      }
    });
  }

  function startChapter(bookId, chapterId, bodyEl) {
    state.bookId = bookId || '';
    state.chapterId = chapterId || '';
    state.bodyEl = bodyEl || null;
    closeNotePopover();
    hideToolbar();
    if (bodyEl && chapterId) {
      global.setTimeout(function () {
        applyStored(bodyEl, chapterId);
        if (state.pendingScrollId) {
          var scrollId = state.pendingScrollId;
          state.pendingScrollId = '';
          scrollToAnnotation(bodyEl, scrollId);
        }
      }, 0);
    }
  }

  function requestScrollTo(id) {
    state.pendingScrollId = String(id || '');
  }

  function scrollToMarkId(id) {
    if (!id || !state.bodyEl) return false;
    scrollToAnnotation(state.bodyEl, id);
    state.pendingScrollId = '';
    return true;
  }

  function stop() {
    hideToolbar();
    closeNotePopover();
    state.bodyEl = null;
    state.chapterId = '';
  }

  function init(opts) {
    opts = opts || {};
    state.bookId = opts.bookId || '';
    state.chapters = opts.chapters || [];
    state.onGoTo = opts.onGoTo || null;
    state.onSaved = opts.onSaved || null;
    state.toolbar = qs('brSelectionBar');
    state.notePanel = qs('brSelectionNote');
    bindUi();
    bindSelection();
    renderMarksPanel();
    updateMarksButton();
  }

  function setChapters(chapters) {
    state.chapters = Array.isArray(chapters) ? chapters : [];
  }

  function getPendingText() {
    if (state.pendingOffsets && state.pendingOffsets.text) {
      return String(state.pendingOffsets.text);
    }
    if (state.lastRange) {
      try {
        return String(state.lastRange.toString() || '');
      } catch (_) {}
    }
    return '';
  }

  global.SBDReader = global.SBDReader || {};
  global.SBDReader.Annotations = {
    init: init,
    setChapters: setChapters,
    stop: stop,
    startChapter: startChapter,
    readAll: readAll,
    replaceAll: replaceAll,
    updatedAt: updatedAt,
    forChapter: forChapter,
    applyStored: applyStored,
    hideToolbar: hideToolbar,
    requestScrollTo: requestScrollTo,
    scrollToMarkId: scrollToMarkId,
    openMarksPanel: openMarksPanel,
    closeMarksPanel: closeMarksPanel,
    closeNotePopover: closeNotePopover,
    renderMarksPanel: renderMarksPanel,
    updateMarksButton: updateMarksButton,
    getPendingText: getPendingText,
  };
})(window);
