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

  const BOOK_CHAPTER_PARTS = [
    { id: 'body', order: 1, track: 'formation', title: 'Chapter body', estimatedMinutes: 45 },
  ];

  const BOOK_CHAPTER_TEMPLATE =
    '# Chapter title\n\n' +
    'Write this chapter in the Studio editor. Use the Markdown toolbar and **Canon AI** in the right rail to draft, expand, rewrite, or align to the SBD canon.\n\n';


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
    const editor = document.getElementById('acsStudioEditor');
    if (editor) {
      if (show) editor.removeAttribute('hidden');
      else editor.setAttribute('hidden', '');
    }
    if (show) {
      const vision = document.getElementById('acsVision');
      const chev = document.getElementById('acsVisionChevron');
      if (vision && vision.classList.contains('open')) {
        vision.classList.remove('open');
        if (chev) chev.textContent = '▶';
      }
    }
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
      if (window.StudioCanonAi) StudioCanonAi.refreshIndexStatus();
      if (window.StudioReview) StudioReview.refreshPanel(moduleId, partId);
      updatePartNav(moduleId, partId);
      resetEditorScroll();
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

  function sortedModuleParts(moduleId) {
    const mod = findModule(moduleId);
    if (!mod || !Array.isArray(mod.parts)) return [];
    return mod.parts.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }

  function resetEditorScroll() {
    const ta = document.getElementById('acsEditorTextarea');
    const preview = document.getElementById('acsPreviewPane');
    if (ta) ta.scrollTop = 0;
    if (preview) preview.scrollTop = 0;
  }

  function updatePartNav(moduleId, partId) {
    const parts = sortedModuleParts(moduleId);
    const idx = parts.findIndex(function (p) { return p.id === partId; });
    const prevBtn = document.getElementById('acsPartPrevBtn');
    const nextBtn = document.getElementById('acsPartNextBtn');
    const label = document.getElementById('acsPartNavLabel');
    if (!prevBtn || !nextBtn || !label) return;

    if (idx < 0 || !parts.length) {
      label.textContent = 'Part — / —';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      prevBtn._navPart = null;
      nextBtn._navPart = null;
      return;
    }

    label.textContent = 'Part ' + (idx + 1) + ' / ' + parts.length;
    prevBtn.disabled = idx <= 0;
    nextBtn.disabled = idx >= parts.length - 1;
    prevBtn._navPart = idx > 0 ? parts[idx - 1] : null;
    nextBtn._navPart = idx < parts.length - 1 ? parts[idx + 1] : null;
  }

  async function navigateToAdjacentPart(part) {
    if (!part || !editorCtx) return;
    if (editorDirty) {
      try {
        await saveEditor(true);
      } catch (e) { /* saveEditor handles status */ }
      if (editorDirty && !confirm('Unsaved changes remain. Switch part anyway?')) return;
    }
    await openEditor(editorCtx.moduleId, part.id, part.title, editorCtx.courseId);
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

  function isBookCourse(course) {
    return !!(course && (course.contentKind === 'book' || course.type === 'book'));
  }

  function renderCourseBlock(course, unitLabel, addUnitLabel) {
    const weeks = modulesByCourse[course.id] || [];
    if (!matchesQuery(course, weeks)) return '';
    const isBook = isBookCourse(course);

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
              <button type="button" class="acs-chip" data-dup-week="${attrEsc(mod.id)}" data-course-id="${attrEsc(course.id)}">Duplicate ${esc(unitLabel)}</button>
            </div>
            <div class="acs-part-links" data-parts-module="${attrEsc(mod.id)}">${partsHtml || '<span class="acs-course-id">No parts — add one</span>'}</div>
          </div>`;
    }).join('');

    return `
        <div class="acs-course${isBook ? ' acs-course--book' : ''}" data-course-id="${esc(course.id)}">
          <div class="acs-course-head" data-toggle-course>
            <span class="acs-chevron">▶</span>
            ${course.coverImage
              ? '<img class="acs-course-cover-thumb" src="' + attrEsc(course.coverImage) + '" alt="">'
              : '<span class="acs-course-cover-placeholder" aria-hidden="true">▣</span>'}
            <span class="acs-course-title">${esc(course.title || course.id)}</span>
            ${isBook ? '<span class="acs-kind-badge">Book</span>' : ''}
            ${course.linkedCourseId ? '<span class="acs-kind-badge acs-kind-badge--link">+ Course</span>' : ''}
            ${course.linkedBookId ? '<span class="acs-kind-badge acs-kind-badge--link">← Book</span>' : ''}
            <span class="acs-course-id">${weeks.length} ${esc(unitLabel)}${weeks.length === 1 ? '' : 's'}</span>
            <button type="button" class="acs-chip acs-chip--sm" data-course-cover="${attrEsc(course.id)}" title="Edit cover">Cover</button>
          </div>
          <div class="acs-weeks">
            <button type="button" class="acs-chip acs-chip--gold" data-add-week="${attrEsc(course.id)}" style="margin-bottom:10px">${esc(addUnitLabel)}</button>
            ${weeksHtml || '<p class="acs-course-id">No ' + esc(unitLabel) + 's yet</p>'}
          </div>
        </div>`;
  }

  function renderTree() {
    const tree = document.getElementById('acsTree');
    const books = allCourses.filter(isBookCourse);
    const courses = allCourses.filter(function (c) { return !isBookCourse(c); });

    let courseCount = 0;
    let weekCount = 0;
    let bookCount = 0;
    let chapterCount = 0;

    const booksHtml = books.map(function (course) {
      const weeks = modulesByCourse[course.id] || [];
      if (!matchesQuery(course, weeks)) return '';
      bookCount++;
      chapterCount += weeks.length;
      return renderCourseBlock(course, 'chapter', '+ Add chapter');
    }).join('');

    const coursesHtml = courses.map(function (course) {
      const weeks = modulesByCourse[course.id] || [];
      if (!matchesQuery(course, weeks)) return '';
      courseCount++;
      weekCount += weeks.length;
      return renderCourseBlock(course, 'week', '+ Add week');
    }).join('');

    let html = '';
    if (booksHtml) {
      html += '<div class="acs-tree-section"><p class="acs-tree-section-title">Books</p>' + booksHtml + '</div>';
    }
    if (coursesHtml) {
      html += '<div class="acs-tree-section"><p class="acs-tree-section-title">Courses</p>' + coursesHtml + '</div>';
    }

    tree.innerHTML = html || '<p class="acs-course-id">No courses or books match.</p>';
    document.getElementById('acsMeta').textContent =
      bookCount + ' books · ' + chapterCount + ' chapters · ' +
      courseCount + ' courses · ' + weekCount + ' weeks';

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
      head.onclick = function (e) {
        if (e.target.closest('[data-course-cover]')) return;
        const course = head.closest('.acs-course');
        course.classList.toggle('open');
        const chev = head.querySelector('.acs-chevron');
        if (chev) chev.textContent = course.classList.contains('open') ? '▼' : '▶';
      };
    });

    document.querySelectorAll('[data-course-cover]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        openCourseCoverSettings(btn.getAttribute('data-course-cover'));
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
        const course = allCourses.find(function (c) { return c.id === modalWeekCourseId; });
        const book = isBookCourse(course);
        const prefix = book
          ? (modalWeekCourseId + '-ch-')
          : moduleIdPrefix(modalWeekCourseId, weeks);
        document.getElementById('acsWeekTitle').value = book
          ? ('Chapter ' + n + ': ')
          : ('Week ' + n + ': ');
        document.getElementById('acsWeekModuleId').value = prefix + n;
        const weekModalTitle = document.querySelector('#acsWeekModal h3');
        if (weekModalTitle) weekModalTitle.textContent = book ? 'Add chapter' : 'Add week';
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


  async function createBook(opts) {
    const id = String(opts.id || '').trim();
    const title = String(opts.title || '').trim();
    if (!id || !title) throw new Error('Book id and title are required');

    const existing = await db.collection('courses').doc(id).get();
    if (existing.exists) throw new Error('A course or book with this ID already exists');

    const createFormation = !!opts.createFormationCourse;
    const linkedCourseId = createFormation ? (id + '-course') : null;
    if (linkedCourseId) {
      const linkedExists = await db.collection('courses').doc(linkedCourseId).get();
      if (linkedExists.exists) {
        throw new Error('Linked course id already exists: ' + linkedCourseId);
      }
    }

    const priceUsd = Number(opts.priceUsd || 0);
    const priceDisplay = '$' + (priceUsd % 1 === 0 ? priceUsd.toFixed(0) : priceUsd.toFixed(2));
    const coverImage = opts.coverImage || '';
    const bonusCourseId = opts.bonusCourseId || null;
    const moduleId = id + '-ch-1';
    const chapterTitle = 'Chapter 1: Opening';

    const courseDoc = {
      id: id,
      title: title,
      subtitle: opts.subtitle || '',
      description: opts.description || '',
      contentKind: 'book',
      type: 'book',
      schoolId: 'standalone',
      accessLevel: 'elite',
      requiredTier: 'elite',
      purchaseOnly: true,
      isActive: true,
      coverImage: coverImage,
      moduleCount: 1,
      totalModules: 1,
      shopPriceUsd: priceUsd,
      bonusCourseId: bonusCourseId,
      linkedCourseId: linkedCourseId,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    const bookMeta = {
      id: id,
      title: title,
      subtitle: opts.subtitle || '',
      description: opts.description || '',
      coverImage: coverImage,
      priceUsd: priceUsd,
      priceDisplay: priceDisplay,
      courseId: id,
      linkedCourseId: linkedCourseId,
      bonusCourseId: bonusCourseId,
      status: 'draft',
      studioManaged: true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser && currentUser.uid,
    };

    const unlockCourseIds = [id];
    if (linkedCourseId) unlockCourseIds.push(linkedCourseId);
    if (bonusCourseId) unlockCourseIds.push(bonusCourseId);

    const unlocks = {
      type: 'products',
      productIds: [id],
      courseIds: unlockCourseIds,
    };

    const shopDoc = {
      id: id,
      name: title,
      category: 'books_standalone',
      section: 'books_magazine',
      phase: 1,
      stripeReady: true,
      type: 'book',
      priceUsd: priceUsd,
      priceDisplay: priceDisplay,
      description: opts.description || opts.subtitle || '',
      icon: '📘',
      format: 'digital',
      coverImage: coverImage,
      status: 'inactive',
      source: 'course-studio',
      unlocks: unlocks,
      studioPublished: false,
      checkoutEnabled: false,
      studioManaged: true,
      bookId: id,
      linkedCourseId: linkedCourseId,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    const modData = {
      id: moduleId,
      courseId: id,
      schoolId: 'standalone',
      week: 1,
      weekNumber: 1,
      chapter: 1,
      totalWeeks: 1,
      title: chapterTitle,
      duration: 'chapter',
      accessLevel: 'elite',
      requiredTier: 'elite',
      purchaseOnly: true,
      order: 1,
      parts: BOOK_CHAPTER_PARTS,
      courseFormat: 'book',
      hasPartSubcollection: true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    const batch = db.batch();
    batch.set(db.collection('courses').doc(id), courseDoc, { merge: true });
    batch.set(db.collection('books').doc(id), bookMeta, { merge: true });
    batch.set(db.collection('shopProducts').doc(id), shopDoc, { merge: true });
    const modRef = db.collection('modules').doc(moduleId);
    batch.set(modRef, modData, { merge: true });
    writePartDoc(modRef, BOOK_CHAPTER_PARTS[0], BOOK_CHAPTER_TEMPLATE.replace('Chapter title', chapterTitle), batch);

    // Linked formation course: Week 1 + full 7-part shells (empty templates)
    if (linkedCourseId) {
      const weekModuleId = linkedCourseId + '-week-1';
      const formationCourse = {
        id: linkedCourseId,
        title: title + ' — Formation',
        subtitle: opts.subtitle || '',
        description: (opts.description || '') + (opts.description ? ' ' : '') +
          'Formation courseware linked to the book “' + title + '”.',
        contentKind: 'course',
        type: 'course',
        schoolId: 'standalone',
        accessLevel: 'elite',
        requiredTier: 'elite',
        purchaseOnly: true,
        isActive: true,
        coverImage: coverImage,
        moduleCount: 1,
        totalModules: 1,
        linkedBookId: id,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      const weekData = {
        id: weekModuleId,
        courseId: linkedCourseId,
        schoolId: 'standalone',
        week: 1,
        weekNumber: 1,
        totalWeeks: 1,
        title: 'Week 1: Foundations',
        duration: '1 week',
        accessLevel: 'elite',
        requiredTier: 'elite',
        purchaseOnly: true,
        order: 1,
        parts: DEFAULT_PARTS,
        courseFormat: 'formation',
        hasPartSubcollection: true,
        linkedBookId: id,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      batch.set(db.collection('courses').doc(linkedCourseId), formationCourse, { merge: true });
      const weekRef = db.collection('modules').doc(weekModuleId);
      batch.set(weekRef, weekData, { merge: true });
      DEFAULT_PARTS.forEach(function (p) {
        const tpl = PART_TEMPLATES[p.id] || ('## ' + p.title + '\n\n');
        writePartDoc(weekRef, p, tpl, batch);
      });
    }

    await batch.commit();

    await loadCatalog();
    renderTree();
    const el = document.querySelector('.acs-course[data-course-id="' + id + '"]');
    if (el) el.classList.add('open');
    if (linkedCourseId) {
      const courseEl = document.querySelector('.acs-course[data-course-id="' + linkedCourseId + '"]');
      if (courseEl) courseEl.classList.add('open');
    }
    openEditor(moduleId, 'body', BOOK_CHAPTER_PARTS[0].title, id);
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
      parts: isBookCourse(course) ? BOOK_CHAPTER_PARTS : DEFAULT_PARTS,
      courseFormat: isBookCourse(course) ? 'book' : 'formation',
      hasPartSubcollection: true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    const batch = db.batch();
    const modRef = db.collection('modules').doc(moduleId);
    batch.set(modRef, data, { merge: true });

    const partsDef = isBookCourse(course) ? BOOK_CHAPTER_PARTS : DEFAULT_PARTS;
    partsDef.forEach(function (p) {
      const tpl = isBookCourse(course)
        ? BOOK_CHAPTER_TEMPLATE.replace('Chapter title', title || ('Chapter ' + weekNum))
        : (PART_TEMPLATES[p.id] || ('## ' + p.title + '\n\n'));
      writePartDoc(modRef, p, tpl, batch);
    });

    // Fix parts array on module for books
    if (isBookCourse(course)) {
      batch.set(modRef, { parts: BOOK_CHAPTER_PARTS, courseFormat: 'book' }, { merge: true });
    }

    await batch.commit();
    await db.collection('courses').doc(courseId).set({
      moduleCount: weekNum,
      totalModules: weekNum,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    closeModals();
    await loadCatalog();
    renderTree();
    const openPart = partsDef[0];
    openEditor(moduleId, openPart.id, openPart.title, courseId);
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

  function setCoverPreview(previewId, url, clearBtnId) {
    const preview = document.getElementById(previewId);
    const clearBtn = clearBtnId ? document.getElementById(clearBtnId) : null;
    if (!preview) return;
    if (url) {
      preview.innerHTML = '<img src="' + attrEsc(url) + '" alt="Cover preview">';
      preview.setAttribute('aria-hidden', 'false');
      if (clearBtn) clearBtn.style.display = '';
    } else {
      preview.innerHTML = '';
      preview.setAttribute('aria-hidden', 'true');
      if (clearBtn) clearBtn.style.display = 'none';
    }
  }

  async function uploadCoverFromInput(fileInput, urlInputId, previewId, statusId, clearBtnId) {
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) return;
    const status = document.getElementById(statusId);
    if (status) status.textContent = 'Uploading cover…';
    try {
      if (typeof uploadCourseCover !== 'function') {
        throw new Error('Upload helper not loaded');
      }
      const url = await uploadCourseCover(file);
      const urlInput = document.getElementById(urlInputId);
      if (urlInput) urlInput.value = url || '';
      setCoverPreview(previewId, url, clearBtnId);
      if (status) status.textContent = 'Cover ready';
    } catch (err) {
      if (status) status.textContent = err.message || String(err);
    } finally {
      fileInput.value = '';
    }
  }

  function bindCoverPickers() {
    const pairs = [
      {
        fileId: 'acsCourseCoverFile',
        urlId: 'acsCourseCoverUrl',
        previewId: 'acsCourseCoverPreview',
        statusId: 'acsCourseCoverStatus',
        clearId: 'acsCourseCoverClearBtn',
      },
      {
        fileId: 'acsSettingsCoverFile',
        urlId: 'acsSettingsCoverUrl',
        previewId: 'acsSettingsCoverPreview',
        statusId: 'acsSettingsCoverStatus',
        clearId: 'acsSettingsCoverClearBtn',
      },
    ];

    pairs.forEach(function (p) {
      const fileInput = document.getElementById(p.fileId);
      const clearBtn = document.getElementById(p.clearId);
      if (fileInput && !fileInput._acsCoverBound) {
        fileInput._acsCoverBound = true;
        fileInput.addEventListener('change', function () {
          uploadCoverFromInput(fileInput, p.urlId, p.previewId, p.statusId, p.clearId);
        });
      }
      if (clearBtn && !clearBtn._acsCoverBound) {
        clearBtn._acsCoverBound = true;
        clearBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          const urlInput = document.getElementById(p.urlId);
          if (urlInput) urlInput.value = '';
          if (fileInput) fileInput.value = '';
          setCoverPreview(p.previewId, '', p.clearId);
          const status = document.getElementById(p.statusId);
          if (status) status.textContent = '';
        });
      }
    });
  }

  function openCourseCoverSettings(courseId) {
    const course = allCourses.find(function (c) { return c.id === courseId; });
    if (!course) return;
    document.getElementById('acsSettingsCourseId').value = courseId;
    document.getElementById('acsCourseSettingsTitle').textContent = (course.title || courseId) + ' · cover art';
    const url = course.coverImage || '';
    document.getElementById('acsSettingsCoverUrl').value = url;
    setCoverPreview('acsSettingsCoverPreview', url, 'acsSettingsCoverClearBtn');
    const status = document.getElementById('acsSettingsCoverStatus');
    if (status) status.textContent = '';
    openModal('acsCourseSettingsModal');
  }

  async function saveCourseCoverSettings() {
    const courseId = document.getElementById('acsSettingsCourseId').value;
    const coverImage = (document.getElementById('acsSettingsCoverUrl').value || '').trim();
    if (!courseId) return;
    const status = document.getElementById('acsSettingsCoverStatus');
    if (status) status.textContent = 'Saving…';
    try {
      await db.collection('courses').doc(courseId).set({
        coverImage: coverImage || firebase.firestore.FieldValue.delete(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      closeModals();
      await loadCatalog();
      renderTree();
    } catch (err) {
      if (status) status.textContent = err.message || String(err);
    }
  }

  async function createCourse() {
    const courseId = document.getElementById('acsCourseId').value.trim().toLowerCase().replace(/\s+/g, '-');
    const title = document.getElementById('acsCourseTitle').value.trim();
    const schoolId = document.getElementById('acsCourseSchool').value;
    const accessLevel = document.getElementById('acsCourseAccess').value;
    const purchaseOnly = document.getElementById('acsCoursePurchaseOnly').checked;
    const weekCount = parseInt(document.getElementById('acsCourseWeeks').value, 10) || 1;
    const coverImage = (document.getElementById('acsCourseCoverUrl').value || '').trim();

    if (!courseId || !title) {
      alert('Course ID and title required.');
      return;
    }

    const coursePayload = {
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
    };
    if (coverImage) coursePayload.coverImage = coverImage;

    await db.collection('courses').doc(courseId).set(coursePayload, { merge: true });

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

    // Reset cover picker for next create
    const urlInput = document.getElementById('acsCourseCoverUrl');
    if (urlInput) urlInput.value = '';
    setCoverPreview('acsCourseCoverPreview', '', 'acsCourseCoverClearBtn');

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

    document.getElementById('acsApp').removeAttribute('hidden');

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

    window.CourseStudio = {
      openEditor: openEditor,
      createBook: createBook,
      getEditorCtx: function () { return editorCtx; },
      getCurrentUser: function () { return currentUser; },
      getAllCourses: function () { return allCourses; },
      getModulesByCourse: function () { return modulesByCourse; },
      findModule: findModule,
      isBookCourse: isBookCourse,
    };

    if (window.StudioReview) StudioReview.bind();
    if (window.StudioAnalytics) StudioAnalytics.bind();
    if (window.StudioBooks) StudioBooks.bind();

    // Hard-wire header CTAs (survives module load order / stale caches)
    const bookBtn = document.getElementById('acsBookBtn');
    if (bookBtn) {
      bookBtn.onclick = function (e) {
        e.preventDefault();
        if (window.StudioBooks && typeof StudioBooks.open === 'function') {
          StudioBooks.open();
        } else {
          openModal('acsBookModal');
        }
      };
    }
    const reviewQueueBtn = document.getElementById('acsReviewQueueBtn');
    if (reviewQueueBtn) {
      reviewQueueBtn.onclick = function (e) {
        e.preventDefault();
        if (window.StudioReview && typeof StudioReview.openQueue === 'function') {
          StudioReview.openQueue();
        } else {
          openModal('acsReviewQueueModal');
        }
      };
    }
    const analyticsBtn = document.getElementById('acsAnalyticsBtn');
    if (analyticsBtn) {
      analyticsBtn.onclick = function (e) {
        e.preventDefault();
        if (window.StudioAnalytics && typeof StudioAnalytics.open === 'function') {
          StudioAnalytics.open();
        } else {
          openModal('acsAnalyticsModal');
        }
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

    const partPrevBtn = document.getElementById('acsPartPrevBtn');
    const partNextBtn = document.getElementById('acsPartNextBtn');
    if (partPrevBtn) {
      partPrevBtn.onclick = function () { navigateToAdjacentPart(partPrevBtn._navPart); };
    }
    if (partNextBtn) {
      partNextBtn.onclick = function () { navigateToAdjacentPart(partNextBtn._navPart); };
    }

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

    document.getElementById('acsNewCourseBtn').onclick = function () {
      const urlInput = document.getElementById('acsCourseCoverUrl');
      if (urlInput) urlInput.value = '';
      setCoverPreview('acsCourseCoverPreview', '', 'acsCourseCoverClearBtn');
      const status = document.getElementById('acsCourseCoverStatus');
      if (status) status.textContent = '';
      openModal('acsCourseModal');
    };
    document.getElementById('acsWeekSaveBtn').onclick = createWeek;
    document.getElementById('acsPartSaveBtn').onclick = createPart;
    document.getElementById('acsCourseSaveBtn').onclick = createCourse;
    const saveSettings = document.getElementById('acsCourseSettingsSaveBtn');
    if (saveSettings) saveSettings.onclick = saveCourseCoverSettings;
    bindCoverPickers();

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

    if (window.StudioCanonAi) {
      StudioCanonAi.init({ getEditorCtx: function () { return editorCtx; } });
      StudioCanonAi.bind();
    }

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
