/**
 * Course Studio Phase 4 — Firestore ↔ repo markdown sync (export + diff).
 * Import remains CLI: seed-wwm-course.js
 */
(function (global) {
  'use strict';

  const WWM_COURSE_ID = 'the-woman-the-wife-the-mother';

  let db = null;
  let getModulesForCourse = null;

  function wordCount(text) {
    return String(text || '').split(/\s+/).filter(Boolean).length;
  }

  function hashText(text) {
    const norm = String(text || '').replace(/\r\n/g, '\n').trim();
    let h = 0;
    for (let i = 0; i < norm.length; i++) {
      h = ((h << 5) - h + norm.charCodeAt(i)) | 0;
    }
    return 'djb2-' + (h >>> 0).toString(16);
  }

  function weekNumFromModule(mod) {
    if (mod.weekNumber) return mod.weekNumber;
    if (mod.week) return mod.week;
    const m = String(mod.id || '').match(/week-(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
  }

  async function loadManifest() {
    const res = await fetch('/data/wwm-repo-manifest.json?v=' + Date.now());
    if (!res.ok) throw new Error('Could not load repo manifest');
    return res.json();
  }

  async function assembleWeekPublished(moduleId) {
    const modSnap = await db.collection('modules').doc(moduleId).get();
    if (!modSnap.exists) throw new Error('Module not found: ' + moduleId);
    const mod = modSnap.data();
    const parts = Array.isArray(mod.parts) ? mod.parts.slice() : [];
    parts.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

    if (!parts.length) {
      return mod.content || '';
    }

    const chunks = [];
    for (const p of parts) {
      const partSnap = await db.collection('modules').doc(moduleId)
        .collection('parts').doc(p.id).get();
      const data = partSnap.exists ? partSnap.data() : {};
      const md = data.content || '';
      if (md.trim()) chunks.push(md.trim());
    }

    const weekTitle = mod.title || moduleId;
    const header = weekTitle.startsWith('#') ? weekTitle : '# ' + weekTitle;
    const body = chunks.join('\n\n');
    if (body.startsWith('#')) return body;
    return header + '\n\n' + body.replace(/^# Week \d+:[^\n]*\n+/i, '');
  }

  async function compareWeeks(useDraft) {
    const manifest = await loadManifest();
    const modules = (getModulesForCourse(WWM_COURSE_ID) || []).slice()
      .sort(function (a, b) { return weekNumFromModule(a) - weekNumFromModule(b); });

    const rows = [];
    for (const mod of modules) {
      const weekNum = weekNumFromModule(mod);
      let md = '';
      try {
        if (useDraft) {
          md = await assembleWeekDraft(mod.id);
        } else {
          md = await assembleWeekPublished(mod.id);
        }
      } catch (err) {
        rows.push({
          weekNum,
          moduleId: mod.id,
          status: 'error',
          error: err.message || String(err),
        });
        continue;
      }

      const words = wordCount(md);
      const hash = hashText(md);
      const repo = manifest.weeks && manifest.weeks[String(weekNum)];
      let status = 'missing';
      if (repo) {
        status = repo.hash === hash ? 'synced' : 'drift';
      }
      rows.push({
        weekNum,
        moduleId: mod.id,
        words,
        hash,
        repoWords: repo ? repo.words : null,
        repoHash: repo ? repo.hash : null,
        repoFile: repo ? repo.file : 'week-' + String(weekNum).padStart(2, '0') + '.md',
        status,
        markdown: md,
      });
    }
    return { manifest, rows };
  }

  async function assembleWeekDraft(moduleId) {
    const modSnap = await db.collection('modules').doc(moduleId).get();
    if (!modSnap.exists) throw new Error('Module not found: ' + moduleId);
    const mod = modSnap.data();
    const parts = Array.isArray(mod.parts) ? mod.parts.slice() : [];
    parts.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

    const chunks = [];
    for (const p of parts) {
      const partSnap = await db.collection('modules').doc(moduleId)
        .collection('parts').doc(p.id).get();
      const data = partSnap.exists ? partSnap.data() : {};
      let md = '';
      if (data.hasDraft && data.draftContent != null) {
        md = data.draftContent;
      } else {
        md = data.content || data.draftContent || '';
      }
      if (md.trim()) chunks.push(md.trim());
    }

    const weekTitle = mod.title || moduleId;
    const header = weekTitle.startsWith('#') ? weekTitle : '# ' + weekTitle;
    const body = chunks.join('\n\n');
    if (body.startsWith('#')) return body;
    return header + '\n\n' + body.replace(/^# Week \d+:[^\n]*\n+/i, '');
  }

  function downloadFile(filename, content) {
    const blob = new Blob([content.endsWith('\n') ? content : content + '\n'], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function statusLabel(status) {
    if (status === 'synced') return '<span class="acs-sync-pill acs-sync-pill--ok">Synced</span>';
    if (status === 'drift') return '<span class="acs-sync-pill acs-sync-pill--warn">Drift</span>';
    if (status === 'missing') return '<span class="acs-sync-pill acs-sync-pill--miss">No repo file</span>';
    return '<span class="acs-sync-pill acs-sync-pill--err">Error</span>';
  }

  function renderSummary(rows) {
    const synced = rows.filter(function (r) { return r.status === 'synced'; }).length;
    const drift = rows.filter(function (r) { return r.status === 'drift'; }).length;
    const missing = rows.filter(function (r) { return r.status === 'missing'; }).length;
    const err = rows.filter(function (r) { return r.status === 'error'; }).length;
    const parts = [];
    parts.push(synced + ' synced');
    if (drift) parts.push(drift + ' drift');
    if (missing) parts.push(missing + ' missing in repo');
    if (err) parts.push(err + ' errors');
    return parts.join(' · ');
  }

  function renderTable(rows) {
    const tbody = rows.map(function (r) {
      if (r.status === 'error') {
        return '<tr><td>Week ' + r.weekNum + '</td><td colspan="4">' + esc(r.error) + '</td></tr>';
      }
      const wordDelta = r.repoWords != null && r.repoWords !== r.words
        ? ' <span class="acs-sync-delta">(repo ' + r.repoWords + ')</span>'
        : '';
      return '<tr data-week="' + r.weekNum + '">' +
        '<td>Week ' + r.weekNum + '</td>' +
        '<td>' + statusLabel(r.status) + '</td>' +
        '<td>' + r.words + wordDelta + '</td>' +
        '<td class="acs-mono">' + esc(r.repoFile) + '</td>' +
        '<td><button type="button" class="acs-btn acs-btn--sm acs-sync-export-week" data-week="' + r.weekNum + '">Export</button></td>' +
        '</tr>';
    }).join('');
    return '<table class="acs-sync-table"><thead><tr>' +
      '<th>Week</th><th>Status</th><th>Words (Firestore)</th><th>Repo file</th><th></th>' +
      '</tr></thead><tbody>' + tbody + '</tbody></table>';
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  let lastCompare = null;

  async function refreshModal(opts) {
    const statusEl = document.getElementById('acsSyncStatus');
    const tableEl = document.getElementById('acsSyncTable');
    const useDraft = !!(opts && opts.useDraft);
    if (statusEl) statusEl.textContent = 'Comparing Firestore → repo manifest…';
    if (tableEl) tableEl.innerHTML = '';

    try {
      lastCompare = await compareWeeks(useDraft);
      if (statusEl) {
        statusEl.innerHTML = '<strong>' + (useDraft ? 'Draft' : 'Published') + ':</strong> ' +
          renderSummary(lastCompare.rows) +
          ' · Manifest generated ' + new Date(lastCompare.manifest.generatedAt).toLocaleString();
      }
      if (tableEl) tableEl.innerHTML = renderTable(lastCompare.rows);

      tableEl.querySelectorAll('.acs-sync-export-week').forEach(function (btn) {
        btn.onclick = function () {
          const w = parseInt(btn.getAttribute('data-week'), 10);
          const row = lastCompare.rows.find(function (r) { return r.weekNum === w; });
          if (row && row.markdown) downloadFile(row.repoFile, row.markdown);
        };
      });
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Sync check failed: ' + (err.message || err);
    }
  }

  function exportAll() {
    if (!lastCompare) return;
    lastCompare.rows.forEach(function (r) {
      if (r.markdown) downloadFile(r.repoFile, r.markdown);
    });
  }

  function openModal() {
    const modal = document.getElementById('acsSyncModal');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    refreshModal({ useDraft: false });
  }

  function closeModal() {
    const modal = document.getElementById('acsSyncModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function init(options) {
    db = options.db;
    getModulesForCourse = options.getModulesForCourse;

    const btn = document.getElementById('acsRepoSyncBtn');
    if (btn) btn.onclick = openModal;

    const refresh = document.getElementById('acsSyncRefresh');
    if (refresh) {
      refresh.onclick = function () {
        const draftToggle = document.getElementById('acsSyncUseDraft');
        refreshModal({ useDraft: draftToggle && draftToggle.checked });
      };
    }

    const draftToggle = document.getElementById('acsSyncUseDraft');
    if (draftToggle) {
      draftToggle.onchange = function () {
        refreshModal({ useDraft: draftToggle.checked });
      };
    }

    const exportAllBtn = document.getElementById('acsSyncExportAll');
    if (exportAllBtn) exportAllBtn.onclick = exportAll;
  }

  global.StudioRepoSync = {
    init,
    openModal,
    closeModal,
    refreshModal,
    compareWeeks,
    downloadFile,
    WWM_COURSE_ID,
  };
})(typeof window !== 'undefined' ? window : global);
