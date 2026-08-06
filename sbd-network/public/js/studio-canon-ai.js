'use strict';

/**
 * Course Studio — SBD Canon AI writing agent (client).
 * Calls Cloud Function studioCanonAssist; inserts into draft only.
 */
(function (global) {
  'use strict';

  let busy = false;
  let indexMeta = null;

  const FN_TIMEOUT_MS = 540000;
  const FN_REGION = 'us-central1';

  function callable(name) {
    const fns = firebase.app().functions(FN_REGION);
    return fns.httpsCallable(name, { timeout: FN_TIMEOUT_MS });
  }

  function formatCallableError(err) {
    if (!err) return 'Request failed';
    const code = String(err.code || '').replace(/^functions\//, '');
    const details = err.details;
    if (typeof details === 'string' && details) return details;
    if (details && typeof details === 'object' && details.message) return details.message;
    const raw = (err.message || '').trim();
    if (raw && raw !== 'internal' && raw !== code && raw.toLowerCase() !== 'internal') {
      return raw.replace(/^INTERNAL:?\s*/i, '').replace(/^functions\/internal:?\s*/i, '') || raw;
    }
    if (code === 'permission-denied') return 'Permission denied — Content Designer access required.';
    if (code === 'unauthenticated') return 'Sign in required.';
    if (code === 'failed-precondition') return raw || 'Setup incomplete (check Gemini API key).';
    if (code === 'deadline-exceeded') return 'Timed out — click Reindex again to resume batches.';
    if (code === 'resource-exhausted') return 'Canon AI is rate-limited right now. Wait 30-60 seconds, then try again.';
    if (code === 'internal') return raw && raw !== 'internal'
      ? raw
      : 'Server error during reindex — try again in a moment.';
    return raw || code || 'Request failed';
  }

  function el(id) {
    return document.getElementById(id);
  }

  function setStatus(msg, isError) {
    const node = el('acsCanonStatus');
    if (!node) return;
    node.textContent = msg || '';
    node.classList.toggle('acs-canon-status--error', !!isError);
  }

  function getSelectionOrDraft() {
    const ta = el('acsEditorTextarea');
    if (!ta) return { selection: '', full: '' };
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start !== end && start >= 0) {
      return { selection: ta.value.slice(start, end), full: ta.value };
    }
    return { selection: '', full: ta.value };
  }

  function insertMarkdown(markdown, mode) {
    const ta = el('acsEditorTextarea');
    if (!ta || !markdown) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    if (mode === 'replace' || !ta.value.trim()) {
      ta.value = markdown;
    } else if (start !== end) {
      ta.value = ta.value.slice(0, start) + markdown + ta.value.slice(end);
    } else {
      ta.value = ta.value + (ta.value.endsWith('\n') ? '' : '\n\n') + markdown;
    }

    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
  }

  let getEditorCtx = function () { return null; };


  function isRateLimitedError(err) {
    const code = String(err && err.code || '').replace(/^functions\//, '');
    const msg = String((err && err.message) || '') + ' ' + String((err && err.details && err.details.message) || err && err.details || '');
    return code === 'resource-exhausted' || /429|rate.?limit|quota|resource exhausted|too many requests/i.test(msg);
  }

  async function invokeAssist(fn, payload) {
    const waits = [8000, 16000, 28000];
    let lastErr = null;
    for (let attempt = 0; attempt <= waits.length; attempt++) {
      try {
        return await fn(payload);
      } catch (err) {
        lastErr = err;
        if (!isRateLimitedError(err) || attempt === waits.length) throw err;
        const waitMs = waits[attempt];
        setStatus('Rate-limited (429). Auto-retry ' + (attempt + 1) + '/' + waits.length + ' in ' + Math.round(waitMs / 1000) + 's…', true);
        await new Promise(function (resolve) { setTimeout(resolve, waitMs); });
      }
    }
    throw lastErr || new Error('Canon assist failed');
  }

  async function callAssist(action) {
    if (busy) return;
    const editorCtx = getEditorCtx();
    if (!editorCtx) {
      setStatus('Open a part to edit first.', true);
      return;
    }
    if (!firebase.functions) {
      setStatus('Firebase Functions SDK not loaded.', true);
      return;
    }

    busy = true;
    setStatus('Canon agent thinking…');
    document.querySelectorAll('[data-canon-action]').forEach(function (btn) {
      btn.disabled = true;
    });

    const sel = getSelectionOrDraft();
    const instruction = (el('acsCanonInstruction') && el('acsCanonInstruction').value.trim()) || '';

    try {
      const fn = callable('studioCanonAssist');
      const res = await invokeAssist(fn, {
        action: action,
        courseId: editorCtx.courseId,
        moduleId: editorCtx.moduleId,
        partId: editorCtx.partId,
        partTitle: el('acsEditorTitle') ? el('acsEditorTitle').textContent : '',
        selection: sel.selection,
        currentDraft: sel.full,
        instruction: instruction,
      });

      const data = res.data || {};
      const md = data.markdown || '';
      if (!md) throw new Error('Empty response from canon agent');

      const replace = action === 'align' || action === 'rewrite' || (action === 'draft' && !sel.full.trim());
      insertMarkdown(md, replace ? 'replace' : 'append');

      const cites = el('acsCanonCitations');
      if (cites && data.citations && data.citations.length) {
        cites.innerHTML = data.citations.map(function (c) {
          return '<li>' + esc(c) + '</li>';
        }).join('');
      } else if (cites) {
        cites.innerHTML = '';
      }

      let statusMsg = 'Done — review draft, then Save. Citations: ' + (data.chunkCount || 0) + ' canon excerpts.';
      if (data.note) statusMsg += ' ' + data.note;
      setStatus(statusMsg);
    } catch (err) {
      setStatus(formatCallableError(err), true);
    } finally {
      busy = false;
      document.querySelectorAll('[data-canon-action]').forEach(function (btn) {
        btn.disabled = false;
      });
    }
  }

  async function refreshIndexStatus() {
    if (!firebase.functions) return;
    try {
      const fn = callable('getCanonIndexStatus');
      const res = await fn({});
      indexMeta = res.data || {};
      const node = el('acsCanonIndexMeta');
      if (!node) return;
      if (!indexMeta.hasChunks) {
        node.textContent = 'Index empty — run Reindex corpus.';
        return;
      }
      const m = indexMeta.meta || {};
      node.textContent = (m.chunkCount || '?') + ' chunks · last index ' + (m.lastFullIndex || '—');
    } catch (e) {
      const node = el('acsCanonIndexMeta');
      if (node) node.textContent = 'Index status unavailable';
    }
  }

  async function runReindex() {
    if (!firebase.functions) return;
    if (busy) return;
    if (!confirm('Canon reindex runs in batches (bundled canon, then all LMS weeks). Continue?')) return;

    busy = true;
    const reindexBtn = el('acsCanonReindexBtn');
    if (reindexBtn) reindexBtn.disabled = true;

    const fn = callable('reindexSbdCanon');
    const totals = { indexed: 0, skipped: 0, chunks: 0, errors: 0, sources: 0 };
    let cursor = 0;
    let moduleIndex = 0;
    let moduleIds = null;

    try {
      setStatus('Phase 1/2 — bundled canon…');
      while (true) {
        const res = await fn({ phase: 'bundled', cursor: cursor, batchSize: 1, force: false });
        const r = res.data || {};
        totals.indexed += r.indexed || 0;
        totals.skipped += r.skipped || 0;
        totals.chunks += r.chunks || 0;
        totals.errors += (r.errors && r.errors.length) || 0;
        totals.sources += (r.indexed || 0) + (r.skipped || 0);
        cursor = r.nextCursor || 0;
        setStatus('Phase 1/2 — bundled ' + cursor + ' / ' + (r.totalSources || '?'));
        if (r.done) break;
      }

      setStatus('Phase 2/2 — Firestore LMS weeks…');
      let partIndex = 0;
      while (true) {
        const payload = {
          phase: 'firestore',
          moduleIndex: moduleIndex,
          partIndex: partIndex,
          force: false,
          courseId: 'the-woman-the-wife-the-mother',
        };
        if (moduleIds) payload.moduleIds = moduleIds;
        const res = await fn(payload);
        const r = res.data || {};
        if (!moduleIds && r.moduleIds) moduleIds = r.moduleIds;
        totals.indexed += r.indexed || 0;
        totals.skipped += r.skipped || 0;
        totals.chunks += r.chunks || 0;
        totals.errors += (r.errors && r.errors.length) || 0;
        totals.sources += (r.indexed || 0) + (r.skipped || 0);
        moduleIndex = typeof r.nextModuleIndex === 'number' ? r.nextModuleIndex : moduleIndex + 1;
        partIndex = typeof r.nextPartIndex === 'number' ? r.nextPartIndex : 0;
        const label = r.currentSource
          ? r.currentSource
          : ('week ' + moduleIndex + (partIndex ? ' part ' + partIndex : ''));
        setStatus('Phase 2/2 — ' + label + ' · ' + moduleIndex + '/' + (r.totalModules || '?'));
        if (r.errors && r.errors.length) {
          console.warn('[Canon reindex] part errors', r.errors);
        }
        if (r.done) {
          await fn({
            phase: 'firestore',
            moduleIndex: moduleIndex,
            partIndex: 0,
            moduleIds: moduleIds,
            finalize: true,
            totals: totals,
            courseId: 'the-woman-the-wife-the-mother',
          });
          break;
        }
      }

      setStatus('Done — ' + totals.chunks + ' chunks from ' + totals.indexed + ' indexed sources (' + totals.errors + ' errors).');
      await refreshIndexStatus();
    } catch (err) {
      const msg = formatCallableError(err);
      setStatus(msg.indexOf('deadline') >= 0 || msg.indexOf('Timed out') >= 0
        ? 'Timed out — wait a moment and click Reindex again (batches resume).'
        : msg, true);
    } finally {
      busy = false;
      if (reindexBtn) reindexBtn.disabled = false;
    }
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function bind() {
    document.querySelectorAll('[data-canon-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        callAssist(btn.getAttribute('data-canon-action'));
      });
    });
    const reindexBtn = el('acsCanonReindexBtn');
    if (reindexBtn) reindexBtn.addEventListener('click', runReindex);
    refreshIndexStatus();
  }

  function init(opts) {
    if (opts && typeof opts.getEditorCtx === 'function') {
      getEditorCtx = opts.getEditorCtx;
    }
  }

  global.StudioCanonAi = {
    init: init,
    bind: bind,
    refreshIndexStatus: refreshIndexStatus,
  };
})(window);
