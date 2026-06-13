// Board rich composer — WYSIWYG editing, markdown storage (boards only).
(function () {
  'use strict';

  function escText(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function applyInlineRichFormatting(escapedText) {
    if (!escapedText) return '';
    let text = escapedText;

    const codeTokens = [];
    text = text.replace(/`([^`\n]+)`/g, (_, code) => {
      const token = `__RT_CODE_${codeTokens.length}__`;
      codeTokens.push(`<code>${code}</code>`);
      return token;
    });

    text = text.replace(/\*\*([^*\n][^*\n]*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_\n][^_\n]*?)__/g, '<u>$1</u>');
    text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

    return text.replace(/__RT_CODE_(\d+)__/g, (_, idx) => codeTokens[parseInt(idx, 10)] || '');
  }

  function markdownToEditorHtml(markdown) {
    if (!markdown) return '';
    const lines = markdown.split('\n');
    return lines
      .map((line) => applyInlineRichFormatting(escText(line)) || '<br>')
      .join('<br>');
  }

  function nodeToMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    const inner = () => Array.from(node.childNodes).map(nodeToMarkdown).join('');

    switch (tag) {
      case 'br':
        return '\n';
      case 'strong':
      case 'b':
        return `**${inner()}**`;
      case 'em':
      case 'i':
        return `*${inner()}*`;
      case 'u':
        return `__${inner()}__`;
      case 'code':
        return `\`${inner()}\``;
      case 'div':
      case 'p':
        return `${inner()}\n`;
      default:
        return inner();
    }
  }

  function htmlToMarkdown(root) {
    if (!root) return '';
    let md = Array.from(root.childNodes).map(nodeToMarkdown).join('');
    md = md.replace(/\n{3,}/g, '\n\n');
    return md.trim();
  }

  function initBoardRichEditor(textarea, options = {}) {
    if (!textarea) return null;
    if (textarea._boardRichEditor) return textarea._boardRichEditor;

    const { compact = false, placeholder = '' } = options;

    textarea.classList.add('board-rich-editor__source');
    textarea.tabIndex = -1;

    const host = document.createElement('div');
    host.className = `board-rich-editor${compact ? ' board-rich-editor--compact' : ''}`;

    const toolbar = document.createElement('div');
    toolbar.className = 'rt-toolbar';
    toolbar.innerHTML = `
      <button type="button" class="rt-btn" data-cmd="bold" aria-label="Bold" title="Bold"><strong>B</strong></button>
      <button type="button" class="rt-btn" data-cmd="italic" aria-label="Italic" title="Italic"><em>I</em></button>
      <button type="button" class="rt-btn" data-cmd="underline" aria-label="Underline" title="Underline"><u>U</u></button>
    `;

    const surface = document.createElement('div');
    surface.className = 'board-rich-editor__surface';
    surface.contentEditable = 'true';
    surface.setAttribute('role', 'textbox');
    surface.setAttribute('aria-multiline', 'true');
    surface.spellcheck = true;
    if (placeholder) {
      surface.dataset.placeholder = placeholder;
      surface.setAttribute('aria-label', placeholder);
    }

    host.appendChild(toolbar);
    host.appendChild(surface);

    const wrap = textarea.closest('.comment-input-wrap');
    if (wrap) {
      wrap.insertBefore(host, textarea);
    } else {
      textarea.insertAdjacentElement('afterend', host);
    }

    function sync() {
      textarea.value = htmlToMarkdown(surface);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function setMarkdown(md) {
      const value = md || '';
      textarea.value = value;
      surface.innerHTML = markdownToEditorHtml(value);
    }

    function getMarkdown() {
      sync();
      return textarea.value;
    }

    function focus() {
      surface.focus();
    }

    toolbar.addEventListener('mousedown', (e) => {
      if (e.target.closest('button[data-cmd]')) e.preventDefault();
    });

    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-cmd]');
      if (!btn) return;
      surface.focus();
      const cmd = btn.dataset.cmd;
      if (cmd === 'bold') document.execCommand('bold');
      else if (cmd === 'italic') document.execCommand('italic');
      else if (cmd === 'underline') document.execCommand('underline');
      sync();
    });

    surface.addEventListener('input', sync);
    surface.addEventListener('blur', sync);

    surface.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
      sync();
    });

    setMarkdown(textarea.value);

    const api = { surface, host, setMarkdown, getMarkdown, focus, sync };
    textarea._boardRichEditor = api;
    textarea.dataset.boardRichEditor = '1';
    return api;
  }

  window.initBoardRichEditor = initBoardRichEditor;

  window.getBoardFieldMarkdown = function (field) {
    if (!field) return '';
    let md = '';
    if (field._boardRichEditor) {
      field._boardRichEditor.sync();
      md = field._boardRichEditor.getMarkdown();
    } else {
      md = field.value || '';
    }
    return md.replace(/\u200b/g, '').trim();
  };
})();
