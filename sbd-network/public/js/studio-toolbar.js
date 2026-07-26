/**
 * Course Studio markdown toolbar — wrap selection or insert blocks.
 */
(function (global) {
  'use strict';

  function getTextarea() {
    return document.getElementById('acsEditorTextarea');
  }

  function wrapSelection(before, after) {
    const ta = getTextarea();
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = ta.value;
    const sel = val.slice(start, end);
    const insert = before + (sel || 'text') + after;
    ta.value = val.slice(0, start) + insert + val.slice(end);
    const cursor = start + before.length + (sel ? sel.length : 4);
    ta.setSelectionRange(sel ? start + before.length : cursor - 4, sel ? end + before.length : cursor);
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function insertBlock(block) {
    const ta = getTextarea();
    if (!ta) return;
    const start = ta.selectionStart;
    const val = ta.value;
    const prefix = start > 0 && val[start - 1] !== '\n' ? '\n\n' : '';
    const text = prefix + block;
    ta.value = val.slice(0, start) + text + val.slice(start);
    ta.setSelectionRange(start + text.length, start + text.length);
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function linePrefix(prefix) {
    const ta = getTextarea();
    if (!ta) return;
    const start = ta.selectionStart;
    const val = ta.value;
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    ta.value = val.slice(0, lineStart) + prefix + val.slice(lineStart);
    ta.setSelectionRange(start + prefix.length, start + prefix.length);
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const ACTIONS = {
    bold: function () { wrapSelection('**', '**'); },
    italic: function () { wrapSelection('*', '*'); },
    h2: function () { linePrefix('## '); },
    ul: function () { insertBlock('- \n- \n- \n'); },
    table: function () {
      insertBlock('| Term | Definition |\n|------|------------|\n| | |\n');
    },
    scripture: function () {
      insertBlock('## Scripture Study\n\n> *"…"* — **Book 0:00 (KJV)**\n\n');
    },
    code: function () { wrapSelection('```\n', '\n```'); },
    ontology: function () { insertBlock('## I. Ontology — What This Week Is\n\n'); },
    reflection: function () { insertBlock('## Reflection Questions\n\n1. \n\n'); },
    f1Spine: function () { insertBlock('[[f1-spine]]\n'); },
    f1Recall: function () { insertBlock('[[f1-spine:recall]]\n'); },
    integrationLaw: function () { insertBlock('[[integration-law]]\n'); },
  };

  function bindToolbar(root) {
    if (!root) return;
    root.querySelectorAll('[data-md-action]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        const action = ACTIONS[btn.getAttribute('data-md-action')];
        if (action) action();
      });
    });
  }

  global.StudioToolbar = { bindToolbar: bindToolbar, ACTIONS: ACTIONS };
})(typeof window !== 'undefined' ? window : global);
