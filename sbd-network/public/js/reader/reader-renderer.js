/**
 * SBD Book Reader — markdown → sanitized HTML → article (Milestone 1).
 * Pipeline: parse → sanitize → render into <article> body.
 * Window: SBDReader.Renderer
 */
(function (global) {
  'use strict';

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  /**
   * Lightweight sanitize for trusted-ish markdown HTML.
   * Strips scripts/handlers; keeps semantic reading tags.
   */
  function sanitizeHtml(html) {
    var wrap = document.createElement('div');
    wrap.innerHTML = html || '';

    wrap.querySelectorAll('script, iframe, object, embed, link, meta').forEach(function (el) {
      el.remove();
    });

    wrap.querySelectorAll('*').forEach(function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (attr) {
        var name = attr.name.toLowerCase();
        if (name.indexOf('on') === 0) el.removeAttribute(attr.name);
        if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) {
          el.removeAttribute(attr.name);
        }
      });
    });

    return wrap.innerHTML;
  }

  function markdownToHtml(md) {
    if (global.LessonRenderer && typeof global.LessonRenderer.renderMarkdown === 'function') {
      return global.LessonRenderer.renderMarkdown(md || '');
    }
    var text = String(md || '').trim();
    if (!text) return '';
    return '<p>' + esc(text).replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
  }

  /**
   * Render chapter markdown into the article body element.
   * Does not attach end-of-chapter UI (navigation owns that).
   */
  function renderChapterContent(md, bodyEl) {
    if (!bodyEl) {
      return { ok: false, error: 'missing-body' };
    }
    var raw = String(md == null ? '' : md).trim();
    if (!raw) {
      bodyEl.innerHTML = '';
      return { ok: true, empty: true };
    }
    try {
      var html = markdownToHtml(raw);
      bodyEl.innerHTML = sanitizeHtml(html);
      return { ok: true, empty: false };
    } catch (err) {
      console.error('[SBDReader.Renderer]', err);
      bodyEl.innerHTML =
        '<p class="br-error-inline">This chapter could not be displayed.</p>';
      return { ok: false, error: 'malformed', detail: err };
    }
  }

  function signalReady(rootEl) {
    if (!rootEl) return;
    rootEl.setAttribute('data-reader-ready', 'true');
    try {
      rootEl.dispatchEvent(new CustomEvent('sbd-reader:ready', { bubbles: true }));
    } catch (_) {
      /* IE not required */
    }
  }

  global.SBDReader = global.SBDReader || {};
  global.SBDReader.Renderer = {
    esc: esc,
    sanitizeHtml: sanitizeHtml,
    markdownToHtml: markdownToHtml,
    renderChapterContent: renderChapterContent,
    signalReady: signalReady,
  };
})(window);
