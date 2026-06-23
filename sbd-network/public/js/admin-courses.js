/**
 * Course Studio v3 — Phase 2 catalog/edit + Phase 3 draft/publish, toolbar, linter, reorder
 */
(function () {
  'use strict';

  const DEFAULT_PARTS = [
    { id: 'part-1', order: 1, track: 'formation', title: 'Ontology — What This Week Is', estimatedMinutes: 25 },
    { id: 'part-2', order: 2, track: 'formation', title: 'Consciousness — What You Must See', estimatedMinutes: 20 },
    { id: 'part-3', order: 3, track: 'formation', title: 'Discipline — What You Must Train', estimatedMinutes: 20 },
    { id: 'part-4', order: 4, track: 'formation', title: 'Practice — Covenant Action', estimatedMinutes: 20 },
    { id: 'part-5', order: 5, track: 'formation', title: 'Reading, Definitions & Scripture', estimatedMinutes: 25 },
    { id: 'part-6', order: 6, track: 'formation', title: 'Reflection & Exercises', estimatedMinutes: 25 },
    { id: 'part-7', order: 7, track: 'formation', title: 'Discussion, Assessment & Prayer', estimatedMinutes: 20 },
  ];

  const PART_TEMPLATES = {
    'part-1': '## I. Ontology — What This Week Is\n\n',
    'part-2': '## II. Consciousness — What You Must See\n\n',
    'part-3': '## III. Discipline — What You Must Train\n\n',
    'part-4': '## IV. Practice — Covenant Action\n\n',
    'part-5': '## Reading Assignment\n\n## Core Definitions\n\n| Term | Definition |\n|------|------------|\n| | |\n\n## Scripture Study\n\n',
    'part-6': '## Reflection Questions\n\n1. \n\n## Formation Exercises\n\n',
    'part-7': '## Couple Discussion\n\n## Week Assessment\n\n## Prayer / Liturgy\n\n',
  };

  let allCourses = [];
  let modulesByCourse = {};
  let query = '';
  let editorCtx = null;
  let previewTimer = null;
  let autosaveTimer = null;
  let modalWeekCourseId = null;
  let modalPartModuleId = null;
  let editorDirty = false;
  let lastSavedDraft = '';
  let currentUser = null;
  let dragPartId = null;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function attrEsc(s) {
    return String(s == null ? '' : s).replace(/"/g, '&quot;');
  }

  function moduleIdPrefix(courseId, weeks) {
    if (weeks.length) {
      const sample = weeks[0].id;
      const m = sample.match(/^(.+-)week-\d+$/i);
      if (m) return m[1];
    }
    const slug = courseId.replace(/^course-\d+-/, '').split('-')[0] || 'mod';
    return slug + '-week-';
  }

  function nextWeekNumber(weeks) {
    if (!weeks.length) return 1;
    return Math.max.apply(null, weeks.map(function (w) { return w.week || w.order || 0; })) + 1;
  }

  function wordCount(text) {
    return window.StudioDoctrineLinter
      ? StudioDoctrineLinter.wordCount(text)
      : String(text || '').split(/\s+/).filter(Boolean).length;
  }

  function readMinutes(text) {
    return Math.max(1, Math.round(wordCount(text) / 220));
  }

  async function loadCatalog() {
    const [coursesSnap, modulesSnap] = await Promise.all([
      db.collection('courses').get(),
      db.collection('modules').get(),
    ]);

    allCourses = coursesSnap.docs
      .map(function (d) { return { id: d.id, ...d.data() }; })
      .filter(function (c) { return c.isActive !== false; })
      .sort(function (a, b) {
        const ao = a.schoolId || 'zzz';
        const bo = b.schoolId || 'zzz';
        if (ao !== bo) return ao.localeCompare(bo);
        return (a.courseNo ?? 999) - (b.courseNo ?? 999);
      });

    modulesByCourse = {};
    modulesSnap.docs.forEach(function (d) {
      const m = { id: d.id, ...d.data() };
      if (!m.courseId) return;
      if (!modulesByCourse[m.courseId]) modulesByCourse[m.courseId] = [];
      modulesByCourse[m.courseId].push(m);
    });

    Object.keys(modulesByCourse).forEach(function (cid) {
      modulesByCourse[cid].sort(function (a, b) {
        return (a.order ?? a.week ?? 0) - (b.order ?? b.week ?? 0);
      });
    });
  }

  function matchesQuery(course, weeks) {
    if (!query) return true;
    const q = query.toLowerCase();
    if ((course.title || '').toLowerCase().includes(q)) return true;
    if ((course.id || '').toLowerCase().includes(q)) return true;
    return weeks.some(function (w) {
      return (w.title || '').toLowerCase().includes(q) ||
        (w.id || '').toLowerCase().includes(q);
    });
  }

  function renderPreview(md) {
    const pane = document.getElementById('acsPreviewPane');
    if (!pane) return;
    if (window.LessonRenderer && typeof LessonRenderer.renderMarkdown === 'function') {
      pane.innerHTML = '<div class="lesson-body-inner">' + LessonRenderer.renderMarkdown(md || '') + '</div>';
    } else {
      pane.innerHTML = '<p style="color:#666">Preview unavailable — lesson-renderer not loaded.</p>';
    }
  }

  function runLinter(md) {
    if (!window.StudioDoctrineLinter || !editorCtx) return;
    const panel = document.getElementById('acsLintPanel');
    const issues = StudioDoctrineLinter.lintMarkdown(md, {
      courseId: editorCtx.courseId,
      moduleId: editorCtx.moduleId,
      partId: editorCtx.partId,
      weekWordCount: editorCtx.weekWordCount,
    });
    StudioDoctrineLinter.renderLintPanel(issues, panel);
    editorCtx.lintErrors = StudioDoctrineLinter.countBySeverity(issues).error;
  }

  function updateMetaRail(md, partMeta) {
    const wc = wordCount(md);
    const railWords = document.getElementById('acsRailWords');
    const railRead = document.getElementById('acsRailRead');
    const railStatus = document.getElementById('acsRailStatus');
    if (railWords) railWords.textContent = wc.toLocaleString();
    if (railRead) railRead.textContent = readMinutes(md) + ' min';
    if (railStatus && editorCtx) {
      if (partMeta && partMeta.hasDraft) {
        railStatus.innerHTML = '<span class="acs-status-draft">Draft (unpublished changes)</span>';
      } else if (wc > 0) {
        railStatus.innerHTML = '<span class="acs-status-published">Published</span>';
      } else {
        railStatus.textContent = 'Empty';
      }
    }
    if (editorCtx) {
      const c = document.getElementById('acsRailCourse');
      const m = document.getElementById('acsRailModule');
      const p = document.getElementById('acsRailPart');
      if (c) c.textContent = editorCtx.courseId || '—';
      if (m) m.textContent = editorCtx.moduleId || '—';
      if (p) p.textContent = editorCtx.partId || '—';
    }
    const pubWeek = document.getElementById('acsPublishWeekBtn');
    if (pubWeek) pubWeek.disabled = !editorCtx;
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      const ta = document.getElementById('acsEditorTextarea');
      const md = ta ? ta.value : '';
      renderPreview(md);
      runLinter(md);
      updateMetaRail(md, editorCtx);
      editorDirty = md !== lastSavedDraft;
      scheduleAutosave();
    }, 280);
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(function () {
      if (editorDirty && editorCtx) saveEditor(true);
    }, 30000);
  }

  async function loadPartDoc(moduleId, partId) {
    const snap = await db.collection('modules').doc(moduleId)
      .collection('parts').doc(partId).get();
    if (!snap.exists) {
      const tpl = PART_TEMPLATES[partId] || '## New Section\n\n';
      return { draft: tpl, published: '', hasDraft: false };
    }
    const data = snap.data();
    const published = data.content || '';
    const hasDraft = !!data.hasDraft && data.draftContent != null;
    const draft = hasDraft ? data.draftContent : published;
    return { draft: draft || PART_TEMPLATES[partId] || '## New Section\n\n', published: published, hasDraft: hasDraft };
  }

  async function loadPartMarkdown(moduleId, partId) {
    const doc = await loadPartDoc(moduleId, partId);
    return doc.draft;
  }

  async function weekWordCount(moduleId) {
    const mod = findModule(moduleId);
    if (!mod || !Array.isArray(mod.parts)) return 0;
    let total = 0;
    for (const p of mod.parts) {
      const md = await loadPartMarkdown(moduleId, p.id);
      total += wordCount(md);
    }
    return total;
  }

  function isMobileStudio() {
    return window.matchMedia && window.matchMedia('(max-width: 1100px)').matches;
  }

  function closeMobileRail() {
    const rail = document.getElementById('acsMetaRail');
    const backdrop = document.getElementById('acsMobileRailBackdrop');
    if (rail) {
      rail.classList.remove('acs-meta-rail--sheet-open');
      if (isMobileStudio()) rail.style.display = 'none';
    }
    if (backdrop) backdrop.classList.remove('open');
  }

  function openMobileRail() {
    const rail = document.getElementById('acsMetaRail');
    const backdrop = document.getElementById('acsMobileRailBackdrop');
    if (rail) {
      rail.style.display = 'block';
      rail.classList.add('acs-meta-rail--sheet-open');
    }
    if (backdrop) {
      backdrop.classList.add('open');
      backdrop.setAttribute('aria-hidden', 'false');
    }
  }

  function showEditorShell(show) {
    document.getElementById('acsStudioEmpty').style.display = show ? 'none' : 'flex';
    document.getElementById('acsStudioEditor').style.display = show ? 'flex' : 'none';
    const rail = document.getElementById('acsMetaRail');
    const fab = document.getElementById('acsMobileToolsBtn');
    if (rail) {
      if (show && !isMobileStudio()) {
        rail.style.display = 'block';
        rail.classList.remove('acs-meta-rail--sheet-open');
      } else {
        rail.style.display = 'none';
        closeMobileRail();
      }
    }
    if (fab) fab.classList.toggle('is-visible', show && isMobileStudio());
  }

  function setPreviewLinks(moduleId, partId) {
    const lms = document.getElementById('acsLmsPreviewLink');
    const draft = document.getElementById('acsDraftPreviewLink');
    const base = '/lesson.html?moduleId=' + encodeURIComponent(moduleId) +
      '&part=' + encodeURIComponent(partId);
    if (lms) lms.href = base;
    if (draft) {
      draft.href = base + '&preview=draft';
      draft.style.display = 'inline-flex';
    }
  }

  async function openEditor(moduleId, partId, partTitle, courseId) {
    if (editorDirty && !confirm('You have unsaved draft changes. Discard and open another part?')) return;

    editorCtx = { moduleId: moduleId, partId: partId, courseId: courseId, lintErrors: 0 };
    showEditorShell(true);
    setPreviewLinks(moduleId, partId);

    document.getElementById('acsEditorTitle').textContent = partTitle || partId;
    const ta = document.getElementById('acsEditorTextarea');
    const status = document.getElementById('acsEditorStatus');
    ta.value = '';
    status.textContent = 'Loading…';
    editorDirty = false;

    document.querySelectorAll('.acs-chip--edit').forEach(function (c) {
      c.classList.toggle('acs-chip--active',
        c.getAttribute('data-edit-part') === partId &&
        c.getAttribute('data-edit-module') === moduleId);
    });

    try {
      editorCtx.weekWordCount = await weekWordCount(moduleId);
      const doc = await loadPartDoc(moduleId, partId);
      ta.value = doc.draft;
      lastSavedDraft = doc.draft;
      editorDirty = false;
      status.textContent = doc.hasDraft ? 'Draft loaded' : 'Published loaded';
      renderPreview(ta.value);
      runLinter(ta.value);
      updateMetaRail(ta.value, doc);
      if (window.StudioVersionHistory) {
        StudioVersionHistory.renderPanel(moduleId, partId);
      }
    } catch (err) {
      status.textContent = 'Load failed: ' + (err.message || err);
    }
  }

  function partWritePayload(md, isPublish) {
    const payload = {
      id: editorCtx.partId,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (isPublish) {
      payload.content = md;
      payload.draftContent = md;
      payload.hasDraft = false;
      payload.publishedAt = firebase.firestore.FieldValue.serverTimestamp();
    } else {
      payload.draftContent = md;
      payload.hasDraft = true;
      payload.draftUpdatedAt = firebase.firestore.FieldValue.serverTimestamp();
    }
    return payload;
  }

  async function saveVersionSnapshot(moduleId, partId, content) {
    if (!currentUser) return;
    const vid = 'v-' + Date.now();
    await db.collection('modules').doc(moduleId)
      .collection('parts').doc(partId)
      .collection('versions').doc(vid)
      .set({
        content: content,
        savedAt: firebase.firestore.FieldValue.serverTimestamp(),
        savedBy: currentUser.uid,
      });
  }

  async function saveEditor(silent) {
    if (!editorCtx) return;
    const ta = document.getElementById('acsEditorTextarea');
    const status = document.getElementById('acsEditorStatus');
    const btn = document.getElementById('acsEditorSaveBtn');
    if (btn) btn.disabled = true;
    if (!silent) status.textContent = 'Saving draft…';

    try {
      await db.collection('modules').doc(editorCtx.moduleId)
        .collection('parts').doc(editorCtx.partId)
        .set(partWritePayload(ta.value, false), { merge: true });
      lastSavedDraft = ta.value;
      editorDirty = false;
      status.textContent = silent
        ? 'Autosaved ' + new Date().toLocaleTimeString()
        : 'Draft saved ' + new Date().toLocaleTimeString();
      updateMetaRail(ta.value, { hasDraft: true });
    } catch (err) {
      status.textContent = 'Save failed: ' + (err.message || err);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function publishEditor() {
    if (!editorCtx) return;
    const ta = document.getElementById('acsEditorTextarea');
    const status = document.getElementById('acsEditorStatus');
    const btn = document.getElementById('acsEditorPublishBtn');

    if (editorCtx.lintErrors > 0) {
      if (!confirm('Doctrine linter found ' + editorCtx.lintErrors + ' error(s). Publish anyway?')) return;
    }

    btn.disabled = true;
    status.textContent = 'Publishing…';

    try {
      const md = ta.value;
      await db.collection('modules').doc(editorCtx.moduleId)
        .collection('parts').doc(editorCtx.partId)
        .set(partWritePayload(md, true), { merge: true });
      await saveVersionSnapshot(editorCtx.moduleId, editorCtx.partId, md);
      lastSavedDraft = md;
      editorDirty = false;
      status.textContent = 'Published ' + new Date().toLocaleTimeString();
      updateMetaRail(md, { hasDraft: false });
      runLinter(md);
      if (window.StudioVersionHistory) {
        StudioVersionHistory.renderPanel(editorCtx.moduleId, editorCtx.partId);
      }
    } catch (err) {
      status.textContent = 'Publish failed: ' + (err.message || err);
    } finally {
      btn.disabled = false;
    }
  }

  async function publishWeek() {
    if (!editorCtx) return;
    const mod = findModule(editorCtx.moduleId);
    if (!mod || !Array.isArray(mod.parts)) return;
    if (!confirm('Publish all parts in this week to learners?')) return;

    const status = document.getElementById('acsEditorStatus');
    status.textContent = 'Publishing week…';

    for (const p of mod.parts) {
      const doc = await loadPartDoc(editorCtx.moduleId, p.id);
      const md = doc.draft;
      await db.collection('modules').doc(editorCtx.moduleId)
        .collection('parts').doc(p.id)
        .set({
          id: p.id,
          content: md,
          draftContent: md,
          hasDraft: false,
          publishedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      await saveVersionSnapshot(editorCtx.moduleId, p.id, md);
    }

    status.textContent = 'Week published';
    if (editorCtx.partId) {
      const ta = document.getElementById('acsEditorTextarea');
      updateMetaRail(ta ? ta.value : '', { hasDraft: false });
    }
  }

  async function duplicatePart() {
    if (!editorCtx) return;
    const mod = findModule(editorCtx.moduleId);
    if (!mod || !Array.isArray(mod.parts)) return;

    const src = mod.parts.find(function (p) { return p.id === editorCtx.partId; });
    const md = document.getElementById('acsEditorTextarea').value;
    const newId = 'part-' + (mod.parts.length + 1);
    const newPart = {
      id: newId,
      order: mod.parts.length + 1,
      track: 'formation',
      title: (src ? src.title : 'Part') + ' (copy)',
      estimatedMinutes: src ? src.estimatedMinutes : 20,
    };

    const parts = mod.parts.concat([newPart]);
    await db.collection('modules').doc(editorCtx.moduleId).update({
      parts: parts,
      hasPartSubcollection: true,
      courseFormat: 'formation',
    });
    await db.collection('modules').doc(editorCtx.moduleId)
      .collection('parts').doc(newId)
      .set({
        id: newId,
        content: md,
        draftContent: md,
        hasDraft: false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

    await loadCatalog();
    renderTree();
    openEditor(editorCtx.moduleId, newId, newPart.title, editorCtx.courseId);
  }

  function findModule(moduleId) {
    for (const cid of Object.keys(modulesByCourse)) {
      const m = modulesByCourse[cid].find(function (x) { return x.id === moduleId; });
      if (m) return m;
    }
    return null;
  }

  function partDraftBadge(moduleId, partId) {
    return '<span class="acs-draft-dot" data-draft-for="' + attrEsc(moduleId + ':' + partId) + '" title="Checking draft…">·</span>';
  }

  async function hydrateDraftBadges() {
    const dots = document.querySelectorAll('.acs-draft-dot');
    const checks = Array.from(dots).map(async function (el) {
      const key = el.getAttribute('data-draft-for');
      if (!key) return;
      const parts = key.split(':');
      const moduleId = parts[0];
      const partId = parts.slice(1).join(':');
      try {
        const snap = await db.collection('modules').doc(moduleId)
          .collection('parts').doc(partId).get();
        if (snap.exists && snap.data().hasDraft) {
          el.textContent = '◐';
          el.title = 'Unpublished draft';
          el.style.color = '#f0a050';
        } else {
          el.remove();
        }
      } catch (e) {
        el.remove();
      }
    });
    await Promise.all(checks);
  }

  function renderTree() {
    const tree = document.getElementById('acsTree');
    let courseCount = 0;
    let weekCount = 0;

    const html = allCourses.map(function (course) {
      const weeks = modulesByCourse[course.id] || [];
      if (!matchesQuery(course, weeks)) return '';
      courseCount++;
      weekCount += weeks.length;

      const weeksHtml = weeks.map(function (mod) {
        const parts = Array.isArray(mod.parts) ? mod.parts.slice().sort(function (a, b) {
          return (a.order || 0) - (b.order || 0);
        }) : [];
        const partsHtml = parts.map(function (p) {
          return `<div class="acs-part-row" draggable="true" data-drag-module="${attrEsc(mod.id)}" data-drag-part="${attrEsc(p.id)}">
            <span class="acs-chip acs-chip--drag" title="Drag to reorder">⠿</span>
            <button type="button" class="acs-chip acs-chip--edit" data-edit-module="${attrEsc(mod.id)}"
              data-edit-part="${attrEsc(p.id)}" data-edit-title="${attrEsc(p.title)}"
              data-course-id="${attrEsc(course.id)}">${esc(p.title || p.id)}</button>
            ${partDraftBadge(mod.id, p.id)}
            <a class="acs-chip acs-chip--sm" href="/lesson.html?moduleId=${encodeURIComponent(mod.id)}&part=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">↗</a>
          </div>`;
        }).join('');

        return `
          <div class="acs-week" data-module-id="${esc(mod.id)}">
            <p class="acs-week-title">${esc(mod.title || mod.id)} <span class="acs-course-id">${esc(mod.id)}</span></p>
            <div class="acs-week-actions">
              <a class="acs-chip" href="/lesson.html?moduleId=${encodeURIComponent(mod.id)}" target="_blank" rel="noopener">Parts index</a>
              <button type="button" class="acs-chip" data-add-part="${attrEsc(mod.id)}">+ Part</button>
              <button type="button" class="acs-chip" data-dup-week="${attrEsc(mod.id)}" data-course-id="${attrEsc(course.id)}">Duplicate week</button>
            </div>
            <div class="acs-part-links" data-parts-module="${attrEsc(mod.id)}">${partsHtml || '<span class="acs-course-id">No parts — add one</span>'}</div>
          </div>`;
      }).join('');

      return `
        <div class="acs-course" data-course-id="${esc(course.id)}">
          <div class="acs-course-head" data-toggle-course>
            <span class="acs-chevron">▶</span>
            <span class="acs-course-title">${esc(course.title || course.id)}</span>
            <span class="acs-course-id">${weeks.length} wks</span>
          </div>
          <div class="acs-weeks">
            <button type="button" class="acs-chip acs-chip--gold" data-add-week="${attrEsc(course.id)}" style="margin-bottom:10px">+ Add week</button>
            ${weeksHtml || '<p class="acs-course-id">No weeks yet</p>'}
          </div>
        </div>`;
    }).join('');

    tree.innerHTML = html || '<p class="acs-course-id">No courses match.</p>';
    document.getElementById('acsMeta').textContent = courseCount + ' courses · ' + weekCount + ' weeks';

    bindTreeEvents();
    hydrateDraftBadges();
  }

  async function reorderParts(moduleId, fromPartId, toPartId) {
    if (fromPartId === toPartId) return;
    const mod = findModule(moduleId);
    if (!mod || !Array.isArray(mod.parts)) return;

    const parts = mod.parts.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    const fromIdx = parts.findIndex(function (p) { return p.id === fromPartId; });
    const toIdx = parts.findIndex(function (p) { return p.id === toPartId; });
    if (fromIdx < 0 || toIdx < 0) return;

    const moved = parts.splice(fromIdx, 1)[0];
    parts.splice(toIdx, 0, moved);
    parts.forEach(function (p, i) { p.order = i + 1; });

    await db.collection('modules').doc(moduleId).update({ parts: parts });
    await loadCatalog();
    renderTree();
  }

  function bindTreeEvents() {
    document.querySelectorAll('[data-toggle-course]').forEach(function (head) {
      head.onclick = function () {
        const course = head.closest('.acs-course');
        course.classList.toggle('open');
        const chev = head.querySelector('.acs-chevron');
        if (chev) chev.textContent = course.classList.contains('open') ? '▼' : '▶';
      };
    });

    document.querySelectorAll('[data-edit-module]').forEach(function (btn) {
      btn.onclick = function () {
        openEditor(
          btn.getAttribute('data-edit-module'),
          btn.getAttribute('data-edit-part'),
          btn.getAttribute('data-edit-title'),
          btn.getAttribute('data-course-id')
        );
      };
    });

    document.querySelectorAll('[data-add-week]').forEach(function (btn) {
      btn.onclick = function () {
        modalWeekCourseId = btn.getAttribute('data-add-week');
        const weeks = modulesByCourse[modalWeekCourseId] || [];
        const n = nextWeekNumber(weeks);
        const prefix = moduleIdPrefix(modalWeekCourseId, weeks);
        document.getElementById('acsWeekTitle').value = 'Week ' + n + ': ';
        document.getElementById('acsWeekModuleId').value = prefix + n;
        openModal('acsWeekModal');
      };
    });

    document.querySelectorAll('[data-add-part]').forEach(function (btn) {
      btn.onclick = function () {
        modalPartModuleId = btn.getAttribute('data-add-part');
        const mod = findModule(modalPartModuleId);
        const n = (mod && mod.parts ? mod.parts.length : 0) + 1;
        document.getElementById('acsPartTitle').value = 'New section';
        document.getElementById('acsPartId').value = 'part-' + n;
        openModal('acsPartModal');
      };
    });

    document.querySelectorAll('[data-dup-week]').forEach(function (btn) {
      btn.onclick = function () {
        duplicateWeek(btn.getAttribute('data-dup-week'), btn.getAttribute('data-course-id'));
      };
    });

    document.querySelectorAll('.acs-part-row[draggable]').forEach(function (row) {
      row.addEventListener('dragstart', function (e) {
        dragPartId = row.getAttribute('data-drag-part');
        row.classList.add('acs-part-row--dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', function () {
        row.classList.remove('acs-part-row--dragging');
        document.querySelectorAll('.acs-part-row--drag-over').forEach(function (el) {
          el.classList.remove('acs-part-row--drag-over');
        });
      });
      row.addEventListener('dragover', function (e) {
        e.preventDefault();
        row.classList.add('acs-part-row--drag-over');
      });
      row.addEventListener('dragleave', function () {
        row.classList.remove('acs-part-row--drag-over');
      });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        row.classList.remove('acs-part-row--drag-over');
        const moduleId = row.getAttribute('data-drag-module');
        const toPartId = row.getAttribute('data-drag-part');
        if (dragPartId && moduleId) reorderParts(moduleId, dragPartId, toPartId);
      });
    });
  }

  function openModal(id) {
    const el = document.getElementById(id);
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
  }

  function closeModals() {
    document.querySelectorAll('.acs-modal-backdrop').forEach(function (m) {
      m.classList.remove('open');
      m.setAttribute('aria-hidden', 'true');
    });
  }

  function writePartDoc(ref, p, tpl, batch) {
    batch.set(ref.collection('parts').doc(p.id), {
      id: p.id,
      order: p.order,
      title: p.title,
      content: tpl,
      draftContent: tpl,
      hasDraft: false,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  async function createWeek() {
    const courseId = modalWeekCourseId;
    const title = document.getElementById('acsWeekTitle').value.trim();
    let moduleId = document.getElementById('acsWeekModuleId').value.trim();
    const weeks = modulesByCourse[courseId] || [];
    const weekNum = nextWeekNumber(weeks);
    if (!moduleId) moduleId = moduleIdPrefix(courseId, weeks) + weekNum;

    const course = allCourses.find(function (c) { return c.id === courseId; });
    const data = {
      id: moduleId,
      courseId: courseId,
      schoolId: course ? course.schoolId : 'standalone',
      week: weekNum,
      weekNumber: weekNum,
      totalWeeks: (course && course.moduleCount) || weeks.length + 1,
      title: title || ('Week ' + weekNum),
      duration: '1 week',
      accessLevel: course ? (course.accessLevel || 'elite') : 'elite',
      requiredTier: course ? (course.requiredTier || course.accessLevel || 'elite') : 'elite',
      purchaseOnly: !!(course && course.purchaseOnly),
      order: weekNum,
      parts: DEFAULT_PARTS,
      courseFormat: 'formation',
      hasPartSubcollection: true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    const batch = db.batch();
    const modRef = db.collection('modules').doc(moduleId);
    batch.set(modRef, data, { merge: true });

    DEFAULT_PARTS.forEach(function (p) {
      const tpl = PART_TEMPLATES[p.id] || ('## ' + p.title + '\n\n');
      writePartDoc(modRef, p, tpl, batch);
    });

    await batch.commit();
    await db.collection('courses').doc(courseId).set({
      moduleCount: weekNum,
      totalModules: weekNum,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    closeModals();
    await loadCatalog();
    renderTree();
    openEditor(moduleId, 'part-1', DEFAULT_PARTS[0].title, courseId);
  }

  async function createPart() {
    const moduleId = modalPartModuleId;
    const mod = findModule(moduleId);
    if (!mod) return;

    const partId = document.getElementById('acsPartId').value.trim() || ('part-' + Date.now());
    const title = document.getElementById('acsPartTitle').value.trim() || 'New section';
    const parts = Array.isArray(mod.parts) ? mod.parts.slice() : [];
    const tpl = '## ' + title + '\n\n';
    parts.push({
      id: partId,
      order: parts.length + 1,
      track: 'formation',
      title: title,
      estimatedMinutes: 20,
    });

    await db.collection('modules').doc(moduleId).update({
      parts: parts,
      hasPartSubcollection: true,
      courseFormat: 'formation',
    });
    await db.collection('modules').doc(moduleId).collection('parts').doc(partId).set({
      id: partId,
      content: tpl,
      draftContent: tpl,
      hasDraft: false,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    closeModals();
    await loadCatalog();
    renderTree();
    openEditor(moduleId, partId, title, mod.courseId);
  }

  async function duplicateWeek(sourceModuleId, courseId) {
    const src = findModule(sourceModuleId);
    if (!src) return;
    const weeks = modulesByCourse[courseId] || [];
    const weekNum = nextWeekNumber(weeks);
    const newId = moduleIdPrefix(courseId, weeks) + weekNum;

    const data = Object.assign({}, src, {
      id: newId,
      week: weekNum,
      weekNumber: weekNum,
      order: weekNum,
      title: (src.title || 'Week') + ' (copy)',
    });
    delete data.content;

    await db.collection('modules').doc(newId).set(data, { merge: true });

    const parts = Array.isArray(src.parts) ? src.parts : [];
    for (const p of parts) {
      const md = await loadPartMarkdown(sourceModuleId, p.id);
      await db.collection('modules').doc(newId).collection('parts').doc(p.id).set({
        id: p.id,
        content: md,
        draftContent: md,
        hasDraft: false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await loadCatalog();
    renderTree();
    alert('Week duplicated as ' + newId);
  }

  async function createCourse() {
    const courseId = document.getElementById('acsCourseId').value.trim().toLowerCase().replace(/\s+/g, '-');
    const title = document.getElementById('acsCourseTitle').value.trim();
    const schoolId = document.getElementById('acsCourseSchool').value;
    const accessLevel = document.getElementById('acsCourseAccess').value;
    const purchaseOnly = document.getElementById('acsCoursePurchaseOnly').checked;
    const weekCount = parseInt(document.getElementById('acsCourseWeeks').value, 10) || 1;

    if (!courseId || !title) {
      alert('Course ID and title required.');
      return;
    }

    await db.collection('courses').doc(courseId).set({
      id: courseId,
      courseId: courseId,
      title: title,
      schoolId: schoolId,
      accessLevel: accessLevel,
      requiredTier: accessLevel,
      purchaseOnly: purchaseOnly,
      published: true,
      isActive: true,
      moduleCount: weekCount,
      totalModules: weekCount,
      duration: weekCount + ' weeks',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const prefix = courseId.split('-')[0] + '-week-';
    for (let w = 1; w <= weekCount; w++) {
      const moduleId = prefix + w;
      const modRef = db.collection('modules').doc(moduleId);
      await modRef.set({
        id: moduleId,
        courseId: courseId,
        schoolId: schoolId,
        week: w,
        weekNumber: w,
        title: 'Week ' + w,
        accessLevel: accessLevel,
        requiredTier: accessLevel,
        purchaseOnly: purchaseOnly,
        order: w,
        parts: DEFAULT_PARTS,
        courseFormat: 'formation',
        hasPartSubcollection: true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      for (const p of DEFAULT_PARTS) {
        const tpl = PART_TEMPLATES[p.id] || '';
        await modRef.collection('parts').doc(p.id).set({
          id: p.id,
          content: tpl,
          draftContent: tpl,
          hasDraft: false,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }

    closeModals();
    await loadCatalog();
    renderTree();
    const el = document.querySelector('.acs-course[data-course-id="' + courseId + '"]');
    if (el) {
      el.classList.add('open');
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }

  function setEditorView(mode) {
    const split = document.getElementById('acsSplit');
    split.classList.remove('preview-only');
    if (mode === 'source') {
      split.style.gridTemplateColumns = '1fr';
      split.querySelector('.acs-preview-pane').style.display = 'none';
    } else if (mode === 'preview') {
      split.classList.add('preview-only');
    } else {
      split.style.gridTemplateColumns = '';
      split.querySelector('.acs-preview-pane').style.display = '';
    }
    document.querySelectorAll('.acs-tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-view') === mode);
    });
  }

  firebase.auth().onAuthStateChanged(async function (user) {
    if (!user) {
      window.location.href = '/auth?next=/admin-courses.html';
      return;
    }
    currentUser = user;
    const snap = await db.collection('users').doc(user.uid).get();
    const data = snap.exists ? snap.data() : {};

    if (!CourseAccess.isContentDesigner(data)) {
      document.getElementById('acsDenied').style.display = 'block';
      return;
    }

    document.getElementById('acsApp').style.display = 'block';

    const draftBanner = document.getElementById('acsDraftBanner');
    const dismissBtn = document.getElementById('acsDraftBannerDismiss');
    if (localStorage.getItem('acsDraftBannerDismissed') === '1') {
      draftBanner.classList.add('hidden');
    }
    if (dismissBtn) {
      dismissBtn.onclick = function () {
        draftBanner.classList.add('hidden');
        localStorage.setItem('acsDraftBannerDismissed', '1');
      };
    }

    await loadCatalog();
    renderTree();

    document.getElementById('acsSearch').oninput = function (e) {
      query = e.target.value.trim();
      renderTree();
    };

    const ta = document.getElementById('acsEditorTextarea');
    ta.oninput = schedulePreview;
    document.getElementById('acsEditorSaveBtn').onclick = function () { saveEditor(false); };
    document.getElementById('acsEditorPublishBtn').onclick = publishEditor;
    document.getElementById('acsPublishWeekBtn').onclick = publishWeek;
    document.getElementById('acsDupPartBtn').onclick = duplicatePart;

    if (window.StudioToolbar) StudioToolbar.bindToolbar(document.getElementById('acsMdToolbar'));

    document.querySelectorAll('.acs-tab').forEach(function (t) {
      t.onclick = function () { setEditorView(t.getAttribute('data-view')); };
    });

    function toggleVision() {
      const v = document.getElementById('acsVision');
      v.classList.toggle('open');
      const chev = document.getElementById('acsVisionChevron');
      if (chev) chev.textContent = v.classList.contains('open') ? '▼' : '▶';
    }
    document.getElementById('acsVisionHead').onclick = toggleVision;
    const visionToggle = document.getElementById('acsVisionToggle');
    if (visionToggle) visionToggle.onclick = toggleVision;

    document.getElementById('acsNewCourseBtn').onclick = function () { openModal('acsCourseModal'); };
    document.getElementById('acsWeekSaveBtn').onclick = createWeek;
    document.getElementById('acsPartSaveBtn').onclick = createPart;
    document.getElementById('acsCourseSaveBtn').onclick = createCourse;

    document.querySelectorAll('[data-close-modal]').forEach(function (b) {
      b.onclick = closeModals;
    });
    document.querySelectorAll('.acs-modal-backdrop').forEach(function (m) {
      m.onclick = function (e) { if (e.target === m) closeModals(); };
    });

    if (window.StudioRepoSync) {
      StudioRepoSync.init({
        db: db,
        getModulesForCourse: function (courseId) { return modulesByCourse[courseId] || []; },
      });
    }

    if (window.StudioVersionHistory) {
      StudioVersionHistory.init({
        db: db,
        onRestoreDraft: function (content) {
          if (!editorCtx) return;
          const ta = document.getElementById('acsEditorTextarea');
          const status = document.getElementById('acsEditorStatus');
          if (ta) {
            ta.value = content;
            editorDirty = true;
            lastSavedDraft = content;
          }
          if (status) status.textContent = 'Snapshot restored to draft — Publish to go live';
          renderPreview(content);
          runLinter(content);
          updateMetaRail(content, { hasDraft: true });
        },
      });
    }

    const mobileFab = document.getElementById('acsMobileToolsBtn');
    const mobileBackdrop = document.getElementById('acsMobileRailBackdrop');
    if (mobileFab) mobileFab.onclick = openMobileRail;
    if (mobileBackdrop) {
      mobileBackdrop.onclick = closeMobileRail;
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMobileRail();
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveEditor(false);
      }
    });

    window.addEventListener('beforeunload', function (e) {
      if (editorDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    const openId = new URLSearchParams(window.location.search).get('course');
    if (openId) {
      const el = document.querySelector('.acs-course[data-course-id="' + openId + '"]');
      if (el) {
        el.classList.add('open');
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });
})();
