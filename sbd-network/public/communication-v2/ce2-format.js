/**
 * CE2 — markdown-lite formatting, mirror preview, emoji picker.
 */
(function (global) {
  'use strict';

  var EMOJI_REACTIONS = [
    '👍', '❤️', '🙏', '✨', '😂', '😮', '😊', '🤗', '👏', '🙌', '🔥', '💯',
    '🫶', '😢', '🥲', '😇', '💪', '🤝', '👀', '✅', '😍', '🤩', '💚', '🙋',
  ];

  var EMOJI_ALL = [
    '👍', '❤️', '🙏', '✨', '😂', '😮', '😊', '🤗', '😀', '🥲', '😢', '😇',
    '🤩', '😍', '🥰', '😎', '🤔', '😅', '🙃', '😆', '🫶', '👏', '🙌', '💪',
    '🤝', '🙋', '🙇', '🤲', '✌️', '🫂', '🔥', '💯', '👀', '✅', '⏳', '💡',
    '🎉', '🏆', '⚡', '🌈', '🌟', '☀️', '🌿', '🌍', '💐', '🕯️', '🕊️', '📖',
    '✝️', '📿', '🛡️', '👑', '🔔', '📌', '🎯', '📝', '💬', '🎵', '🤍', '💙',
    '💚', '💜', '🧡', '💛',
  ];

  var COLOR_NAMES = ['gold', 'blue', 'green'];
  var RECENT_KEY = 'ce2_emoji_recent';
  var RECENT_MAX = 12;
  var PLACEHOLDER = 'Message…';
  var EDIT_PLACEHOLDER = 'Edit message…';

  var composerInput = null;
  var composerMirror = null;
  var onInputChange = null;
  var uiBound = false;
  var emojiTab = 'reactions';

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatMessageHtml(escaped) {
    if (!escaped) return '';
    var s = String(escaped);
    s = s.replace(/`([^`\n]*?)`/g, '<code class="ce2-msg-code">$1</code>');
    COLOR_NAMES.forEach(function (name) {
      var re = new RegExp('\\[' + name + '\\]([^\\n]*?)\\[\\/' + name + '\\]', 'gi');
      s = s.replace(re, '<span class="ce2-msg-color ce2-msg-color--' + name + '">$1</span>');
    });
    s = s.replace(/\*\*([^*\n]*?)\*\*/g, '<strong class="ce2-msg-strong">$1</strong>');
    s = s.replace(/\*([^*\n]+?)\*/g, '<em class="ce2-msg-em">$1</em>');
    s = s.replace(/__([^_\n]*?)__/g, '<span class="ce2-msg-under">$1</span>');
    s = s.replace(/~~([^~\n]*?)~~/g, '<span class="ce2-msg-strike">$1</span>');
    return s;
  }

  function stripFormattingForPreview(text) {
    if (!text) return '';
    var s = String(text);
    s = s.replace(/`([^`\n]*?)`/g, '$1');
    COLOR_NAMES.forEach(function (name) {
      var re = new RegExp('\\[' + name + '\\]([^\\n]*?)\\[\\/' + name + '\\]', 'gi');
      s = s.replace(re, '$1');
    });
    s = s.replace(/\*\*([^*\n]*?)\*\*/g, '$1');
    s = s.replace(/\*([^*\n]+?)\*/g, '$1');
    s = s.replace(/__([^_\n]*?)__/g, '$1');
    s = s.replace(/~~([^~\n]*?)~~/g, '$1');
    return s.replace(/\s+/g, ' ').trim();
  }

  function getRecent() {
    try {
      var raw = localStorage.getItem(RECENT_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter(Boolean).slice(0, RECENT_MAX) : [];
    } catch (_) {
      return [];
    }
  }

  function pushRecent(emoji) {
    if (!emoji) return;
    var list = getRecent().filter(function (e) {
      return e !== emoji;
    });
    list.unshift(emoji);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
    } catch (_) {}
  }

  function getActiveField() {
    var edit = document.getElementById('ce2EditInput');
    if (edit && document.activeElement === edit) {
      return {
        input: edit,
        mirror: document.getElementById('ce2EditMirror'),
        placeholder: EDIT_PLACEHOLDER,
      };
    }
    return {
      input: composerInput || document.getElementById('ce2Input'),
      mirror: composerMirror || document.getElementById('ce2InputMirror'),
      placeholder: PLACEHOLDER,
    };
  }

  function syncMirrorFor(field) {
    if (!field || !field.input || !field.mirror) return;
    var val = field.input.value || '';
    if (!val) {
      field.mirror.innerHTML =
        '<span class="ce2-input-mirror-ph">' + escapeHtml(field.placeholder) + '</span>';
    } else {
      field.mirror.innerHTML = formatMessageHtml(escapeHtml(val));
    }
    field.mirror.scrollTop = field.input.scrollTop;
  }

  function syncInputMirror() {
    syncMirrorFor({
      input: composerInput || document.getElementById('ce2Input'),
      mirror: composerMirror || document.getElementById('ce2InputMirror'),
      placeholder: PLACEHOLDER,
    });
  }

  function syncEditMirror() {
    syncMirrorFor({
      input: document.getElementById('ce2EditInput'),
      mirror: document.getElementById('ce2EditMirror'),
      placeholder: EDIT_PLACEHOLDER,
    });
  }

  function notifyComposerChange() {
    syncInputMirror();
    if (onInputChange) onInputChange();
  }

  function insertAtCursor(text) {
    var field = getActiveField();
    var textarea = field.input;
    if (!textarea || !text) return;
    var start = textarea.selectionStart || 0;
    var end = textarea.selectionEnd || 0;
    var val = textarea.value || '';
    textarea.value = val.slice(0, start) + text + val.slice(end);
    var pos = start + text.length;
    textarea.setSelectionRange(pos, pos);
    textarea.focus();
    if (textarea.id === 'ce2EditInput') syncEditMirror();
    else notifyComposerChange();
  }

  function wrapMarkers(open, close) {
    var field = getActiveField();
    var textarea = field.input;
    if (!textarea) return;
    var start = textarea.selectionStart || 0;
    var end = textarea.selectionEnd || 0;
    var val = textarea.value || '';
    var sel = val.slice(start, end);
    var out = sel ? open + sel + close : open + close;
    var newStart = start + open.length;
    var newEnd = sel ? newStart + sel.length : newStart;
    textarea.value = val.slice(0, start) + out + val.slice(end);
    textarea.setSelectionRange(newStart, newEnd);
    textarea.focus();
    if (textarea.id === 'ce2EditInput') syncEditMirror();
    else notifyComposerChange();
  }

  function wrapColor(colorName) {
    if (COLOR_NAMES.indexOf(colorName) < 0) return;
    wrapMarkers('[' + colorName + ']', '[/' + colorName + ']');
  }

  function emojiBaseList(tab) {
    return tab === 'all' ? EMOJI_ALL.slice() : EMOJI_REACTIONS.slice();
  }

  function appendEmojiSection(grid, label, list) {
    if (!list.length) return;
    var heading = document.createElement('div');
    heading.className = 'ce2-emoji-section-label';
    heading.textContent = label;
    grid.appendChild(heading);
    list.forEach(function (emoji) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ce2-emoji-btn';
      btn.textContent = emoji;
      btn.setAttribute('aria-label', 'Insert ' + emoji);
      btn.addEventListener('click', function () {
        pushRecent(emoji);
        insertAtCursor(emoji);
        closeEmojiSheet();
      });
      grid.appendChild(btn);
    });
  }

  function renderEmojiGrid() {
    var grid = document.getElementById('ce2EmojiGrid');
    if (!grid) return;
    grid.innerHTML = '';
    var recent = getRecent();
    var base = emojiBaseList(emojiTab);
    var seen = {};
    var recentPick = recent.filter(function (e) {
      if (seen[e]) return false;
      seen[e] = true;
      return true;
    }).slice(0, 8);
    appendEmojiSection(grid, 'Recent', recentPick);
    base.forEach(function (e) {
      if (!seen[e]) seen[e] = true;
    });
    var rest = base.filter(function (e) {
      return recentPick.indexOf(e) < 0;
    });
    appendEmojiSection(grid, emojiTab === 'all' ? 'All' : 'Reactions', rest);
  }

  function setEmojiTab(tab) {
    emojiTab = tab === 'all' ? 'all' : 'reactions';
    document.querySelectorAll('.ce2-emoji-tab').forEach(function (btn) {
      var on = btn.getAttribute('data-emoji-tab') === emojiTab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    renderEmojiGrid();
  }

  function openEmojiSheet() {
    setEmojiTab(emojiTab);
    var sheet = document.getElementById('ce2EmojiSheet');
    if (sheet) sheet.hidden = false;
  }

  function closeEmojiSheet() {
    var sheet = document.getElementById('ce2EmojiSheet');
    if (sheet) sheet.hidden = true;
  }

  function bindFormatButton(btn, handler) {
    if (!btn || btn.__ce2FormatBtn) return;
    btn.__ce2FormatBtn = true;
    btn.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      handler();
    });
  }

  function bindMirrorScroll(textarea, mirror, onInput) {
    if (!textarea || textarea.__ce2MirrorScroll) return;
    textarea.__ce2MirrorScroll = true;
    textarea.addEventListener('scroll', function () {
      if (mirror) mirror.scrollTop = textarea.scrollTop;
    });
    if (onInput) textarea.addEventListener('input', onInput);
  }

  function wireFormatControls() {
    bindFormatButton(document.getElementById('ce2FmtBold'), function () {
      wrapMarkers('**', '**');
    });
    bindFormatButton(document.getElementById('ce2FmtItalic'), function () {
      wrapMarkers('*', '*');
    });
    bindFormatButton(document.getElementById('ce2FmtUnderline'), function () {
      wrapMarkers('__', '__');
    });
    bindFormatButton(document.getElementById('ce2FmtEmoji'), openEmojiSheet);
    bindFormatButton(document.getElementById('ce2FmtStrike'), function () {
      wrapMarkers('~~', '~~');
    });
    bindFormatButton(document.getElementById('ce2FmtCode'), function () {
      wrapMarkers('`', '`');
    });

    document.querySelectorAll('[data-ce2-color]').forEach(function (btn) {
      bindFormatButton(btn, function () {
        wrapColor(btn.getAttribute('data-ce2-color'));
      });
    });

    var editBtns = [
      ['ce2EditFmtBold', '**', '**'],
      ['ce2EditFmtItalic', '*', '*'],
      ['ce2EditFmtUnderline', '__', '__'],
      ['ce2EditFmtStrike', '~~', '~~'],
      ['ce2EditFmtCode', '`', '`'],
    ];
    editBtns.forEach(function (row) {
      bindFormatButton(document.getElementById(row[0]), function () {
        var edit = document.getElementById('ce2EditInput');
        if (edit) edit.focus();
        wrapMarkers(row[1], row[2]);
      });
    });
    bindFormatButton(document.getElementById('ce2EditFmtEmoji'), function () {
      var edit = document.getElementById('ce2EditInput');
      if (edit) edit.focus();
      openEmojiSheet();
    });
    document.querySelectorAll('[data-ce2-edit-color]').forEach(function (btn) {
      bindFormatButton(btn, function () {
        var edit = document.getElementById('ce2EditInput');
        if (edit) edit.focus();
        wrapColor(btn.getAttribute('data-ce2-edit-color'));
      });
    });

    document.querySelectorAll('.ce2-emoji-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setEmojiTab(btn.getAttribute('data-emoji-tab'));
      });
    });

    var closeBtn = document.getElementById('ce2EmojiClose');
    if (closeBtn) closeBtn.addEventListener('click', closeEmojiSheet);
    var sheet = document.getElementById('ce2EmojiSheet');
    if (sheet) {
      var backdrop = sheet.querySelector('.ce2-sheet-backdrop');
      if (backdrop) backdrop.addEventListener('click', closeEmojiSheet);
    }
  }

  function init(opts) {
    opts = opts || {};
    composerInput = opts.getInput ? opts.getInput() : document.getElementById('ce2Input');
    composerMirror = document.getElementById('ce2InputMirror');
    onInputChange = opts.onInputChange || null;
    if (composerInput) {
      bindMirrorScroll(composerInput, composerMirror, null);
      syncInputMirror();
    }

    var editInput = document.getElementById('ce2EditInput');
    var editMirror = document.getElementById('ce2EditMirror');
    if (editInput) {
      bindMirrorScroll(editInput, editMirror, syncEditMirror);
    }

    if (uiBound) return;
    uiBound = true;
    wireFormatControls();
  }

  function onEditOpen() {
    syncEditMirror();
    var edit = document.getElementById('ce2EditInput');
    if (edit) {
      window.setTimeout(syncEditMirror, 0);
    }
  }

  global.Ce2Format = {
    formatMessageHtml: formatMessageHtml,
    stripFormattingForPreview: stripFormattingForPreview,
    syncInputMirror: syncInputMirror,
    syncEditMirror: syncEditMirror,
    onEditOpen: onEditOpen,
    init: init,
    VERSION: 3,
  };
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof window !== 'undefined'
      ? window
      : self
);
