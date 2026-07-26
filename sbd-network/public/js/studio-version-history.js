/**
 * Course Studio — publish version history, restore to draft, diff vs draft.
 */
(function (global) {
  'use strict';

  let db = null;
  let onRestoreDraft = null;
  let previewVersions = [];
  let activePreviewVersion = null;

  function wordCount(text) {
    return String(text || '').split(/\s+/).filter(Boolean).length;
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatWhen(ts) {
    if (!ts) return 'Unknown time';
    const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
  }

  async function fetchVersions(moduleId, partId, limit) {
    const snap = await db.collection('modules').doc(moduleId)
      .collection('parts').doc(partId)
      .collection('versions')
      .orderBy('savedAt', 'desc')
      .limit(limit || 20)
      .get();
    return snap.docs.map(function (d) {
      return Object.assign({ id: d.id }, d.data());
    });
  }

  function bindPanelEvents(moduleId, partId, versions) {
    const panel = document.getElementById('acsVersionPanel');
    if (!panel) return;

    panel.querySelectorAll('.acs-version-preview').forEach(function (btn) {
      btn.onclick = function () {
        const vid = btn.getAttribute('data-vid');
        const ver = versions.find(function (v) { return v.id === vid; });
        if (ver) openPreviewModal(moduleId, partId, ver);
      };
    });

    panel.querySelectorAll('.acs-version-diff').forEach(function (btn) {
      btn.onclick = function () {
        const vid = btn.getAttribute('data-vid');
        const ver = versions.find(function (v) { return v.id === vid; });
        if (ver) openDiffModal(ver);
      };
    });

    panel.querySelectorAll('.acs-version-restore').forEach(function (btn) {
      btn.onclick = function () {
        const vid = btn.getAttribute('data-vid');
        const ver = versions.find(function (v) { return v.id === vid; });
        if (ver) restoreToDraft(moduleId, partId, ver);
      };
    });
  }

  function openPreviewModal(moduleId, partId, version) {
    const modal = document.getElementById('acsVersionModal');
    const meta = document.getElementById('acsVersionPreviewMeta');
    const body = document.getElementById('acsVersionPreviewBody');
    if (!modal || !body) return;

    activePreviewVersion = version;
    if (meta) {
      meta.textContent = formatWhen(version.savedAt) + ' · ' + wordCount(version.content) + ' words · ' + version.id;
    }

    if (global.LessonRenderer && typeof LessonRenderer.renderMarkdown === 'function') {
      body.innerHTML = LessonRenderer.renderMarkdown(version.content || '');
      body.classList.add('formation-reader', 'lesson-editorial');
    } else {
      body.textContent = version.content || '';
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    modal.setAttribute('data-module-id', moduleId || '');
    modal.setAttribute('data-part-id', partId || '');

    const restoreBtn = document.getElementById('acsVersionModalRestore');
    if (restoreBtn) {
      restoreBtn.onclick = function () {
        closePreviewModal();
        if (moduleId && partId) restoreToDraft(moduleId, partId, version);
      };
    }

    const diffBtn = document.getElementById('acsVersionModalDiff');
    if (diffBtn) {
      diffBtn.onclick = function () {
        openDiffModal(version);
      };
    }
  }

  function closePreviewModal() {
    const modal = document.getElementById('acsVersionModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function currentDraftText() {
    const ta = document.getElementById('acsEditorTextarea');
    return ta ? ta.value : '';
  }

  function openDiffModal(version) {
    const modal = document.getElementById('acsDiffModal');
    const meta = document.getElementById('acsDiffMeta');
    const left = document.getElementById('acsDiffLeft');
    const right = document.getElementById('acsDiffRight');
    if (!modal || !left || !right) return;

    const snap = String(version.content || '');
    const draft = currentDraftText();
    if (meta) {
      meta.textContent = formatWhen(version.savedAt) + ' · snapshot ' + wordCount(snap) + ' words · draft ' + wordCount(draft) + ' words';
    }
    left.textContent = snap;
    right.textContent = draft;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeDiffModal() {
    const modal = document.getElementById('acsDiffModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function restoreToDraft(moduleId, partId, version) {
    if (!version || !version.content) return;
    if (!confirm('Restore this publish snapshot to your draft? Learners will not see it until you click Publish.')) return;

    await db.collection('modules').doc(moduleId)
      .collection('parts').doc(partId)
      .set({
        draftContent: version.content,
        hasDraft: true,
        draftUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        restoredFromVersion: version.id,
      }, { merge: true });

    if (typeof onRestoreDraft === 'function') {
      onRestoreDraft(version.content);
    }
    closePreviewModal();
    closeDiffModal();
  }

  async function renderPanel(moduleId, partId) {
    const panel = document.getElementById('acsVersionPanel');
    const modal = document.getElementById('acsVersionModal');
    if (modal) {
      modal.setAttribute('data-module-id', moduleId || '');
      modal.setAttribute('data-part-id', partId || '');
    }
    if (!panel) return;

    if (!moduleId || !partId) {
      panel.innerHTML = '<p class="acs-lint-muted">Open a part to view publish history</p>';
      return;
    }

    panel.innerHTML = '<p class="acs-lint-muted">Loading versions…</p>';

    try {
      const versions = await fetchVersions(moduleId, partId);
      previewVersions = versions;

      if (!versions.length) {
        panel.innerHTML = '<p class="acs-lint-muted">No snapshots yet. Each <strong>Publish</strong> saves a version you can restore here.</p>';
        return;
      }

      panel.innerHTML = versions.map(function (v, i) {
        const wc = wordCount(v.content);
        const label = i === 0 ? ' <span class="acs-version-latest">latest</span>' : '';
        return '<div class="acs-version-row">' +
          '<div class="acs-version-meta">' + esc(formatWhen(v.savedAt)) + label + '<br><span class="acs-mono">' + wc + ' words</span></div>' +
          '<div class="acs-version-actions">' +
          '<button type="button" class="acs-btn acs-btn--sm acs-version-preview" data-vid="' + esc(v.id) + '">Preview</button>' +
          '<button type="button" class="acs-btn acs-btn--sm acs-version-diff" data-vid="' + esc(v.id) + '">Diff</button>' +
          '<button type="button" class="acs-btn acs-btn--sm acs-version-restore" data-vid="' + esc(v.id) + '">Restore</button>' +
          '</div></div>';
      }).join('');

      bindPanelEvents(moduleId, partId, versions);
    } catch (err) {
      panel.innerHTML = '<p class="acs-lint-muted">Could not load versions: ' + esc(err.message || err) + '</p>';
    }
  }

  function init(options) {
    db = options.db;
    onRestoreDraft = options.onRestoreDraft || null;

    const modal = document.getElementById('acsVersionModal');
    if (modal) {
      modal.querySelectorAll('[data-close-version]').forEach(function (btn) {
        btn.onclick = closePreviewModal;
      });
      modal.onclick = function (e) {
        if (e.target === modal) closePreviewModal();
      };
    }

    const diffModal = document.getElementById('acsDiffModal');
    if (diffModal) {
      diffModal.querySelectorAll('[data-close-diff]').forEach(function (btn) {
        btn.onclick = closeDiffModal;
      });
      diffModal.onclick = function (e) {
        if (e.target === diffModal) closeDiffModal();
      };
    }
  }

  global.StudioVersionHistory = {
    init: init,
    renderPanel: renderPanel,
    fetchVersions: fetchVersions,
    closePreviewModal: closePreviewModal,
    openDiffModal: openDiffModal,
  };
})(typeof window !== 'undefined' ? window : global);
