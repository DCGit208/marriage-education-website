/**
 * Course Studio — collaboration / review queue
 * Part fields: reviewStatus (draft|in_review|approved), reviewNotes[]
 * Approve ≠ Publish — publishing remains a separate action.
 */
(function (global) {
  'use strict';

  const STATUSES = ['draft', 'in_review', 'approved'];
  const LABELS = {
    draft: 'Draft',
    in_review: 'In review',
    approved: 'Approved',
  };

  let bound = false;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fmtTime(ts) {
    if (!ts) return '';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleString();
    } catch (_) {
      return '';
    }
  }

  function flash(msg, isError) {
    const meta = document.getElementById('acsReviewMeta');
    const status = document.getElementById('acsEditorStatus');
    if (meta) {
      meta.textContent = msg;
      meta.classList.toggle('acs-panel-status--error', !!isError);
      meta.classList.toggle('acs-panel-status--ok', !isError);
    }
    if (status && !isError) status.textContent = msg;
  }

  function requirePartCtx() {
    const ctx = global.CourseStudio && global.CourseStudio.getEditorCtx
      ? global.CourseStudio.getEditorCtx() : null;
    if (!ctx || !ctx.moduleId || !ctx.partId) {
      flash('Open a part in the catalog first, then use Review.', true);
      return null;
    }
    return ctx;
  }

  function currentUser() {
    return global.CourseStudio && global.CourseStudio.getCurrentUser
      ? global.CourseStudio.getCurrentUser() : null;
  }

  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) {
      console.error('[StudioReview] Missing modal', id);
      return;
    }
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
  }

  async function loadPartReview(moduleId, partId) {
    const snap = await db.collection('modules').doc(moduleId)
      .collection('parts').doc(partId).get();
    if (!snap.exists) {
      return { reviewStatus: 'draft', reviewNotes: [] };
    }
    const data = snap.data() || {};
    return {
      reviewStatus: STATUSES.includes(data.reviewStatus) ? data.reviewStatus : 'draft',
      reviewNotes: Array.isArray(data.reviewNotes) ? data.reviewNotes : [],
      reviewedBy: data.reviewedBy || null,
      reviewedAt: data.reviewedAt || null,
      submittedForReviewAt: data.submittedForReviewAt || null,
      hasDraft: !!data.hasDraft,
    };
  }

  function renderNotes(notes) {
    const list = document.getElementById('acsReviewNotes');
    if (!list) return;
    if (!notes.length) {
      list.innerHTML = '<p class="acs-lint-muted">No review notes yet.</p>';
      return;
    }
    const sorted = notes.slice().sort(function (a, b) {
      const ta = a.at && a.at.toMillis ? a.at.toMillis() : 0;
      const tb = b.at && b.at.toMillis ? b.at.toMillis() : 0;
      return tb - ta;
    });
    list.innerHTML = sorted.map(function (n) {
      return '<div class="acs-review-note">' +
        '<div class="acs-review-note-meta">' + esc(n.byName || n.by || 'Editor') +
        (n.at ? ' · ' + esc(fmtTime(n.at)) : '') + '</div>' +
        '<div class="acs-review-note-body">' + esc(n.text || '') + '</div></div>';
    }).join('');
  }

  async function refreshPanel(moduleId, partId) {
    const statusEl = document.getElementById('acsReviewStatus');
    const metaEl = document.getElementById('acsReviewMeta');
    if (!statusEl || !moduleId || !partId) return;

    const data = await loadPartReview(moduleId, partId);
    statusEl.value = data.reviewStatus;
    renderNotes(data.reviewNotes);

    const bits = ['Status: ' + (LABELS[data.reviewStatus] || data.reviewStatus)];
    if (data.reviewStatus === 'in_review' && data.submittedForReviewAt) {
      bits.push('Submitted ' + fmtTime(data.submittedForReviewAt));
    }
    if (data.reviewStatus === 'approved' && data.reviewedAt) {
      bits.push('Approved ' + fmtTime(data.reviewedAt));
    }
    bits.push('Learners unchanged until Publish');
    if (metaEl) {
      metaEl.textContent = bits.join(' · ');
      metaEl.classList.remove('acs-panel-status--error');
      metaEl.classList.add('acs-panel-status--ok');
    }
  }

  async function setStatus(moduleId, partId, status, extra) {
    const payload = Object.assign({
      reviewStatus: status,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, extra || {});
    await db.collection('modules').doc(moduleId)
      .collection('parts').doc(partId)
      .set(payload, { merge: true });
  }

  async function addNote(moduleId, partId, text, user) {
    const note = {
      text: String(text || '').trim(),
      by: user && user.uid,
      byName: (user && (user.displayName || user.email)) || 'Editor',
      at: firebase.firestore.Timestamp.now(),
    };
    if (!note.text) return;
    await db.collection('modules').doc(moduleId)
      .collection('parts').doc(partId)
      .set({
        reviewNotes: firebase.firestore.FieldValue.arrayUnion(note),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
  }

  async function scanReviewQueue() {
    const modulesSnap = await db.collection('modules').get();
    const items = [];
    for (const modDoc of modulesSnap.docs) {
      const mod = modDoc.data() || {};
      let partsSnap;
      try {
        partsSnap = await modDoc.ref.collection('parts')
          .where('reviewStatus', '==', 'in_review')
          .get();
      } catch (err) {
        continue;
      }
      partsSnap.forEach(function (partDoc) {
        const p = partDoc.data() || {};
        items.push({
          moduleId: modDoc.id,
          partId: partDoc.id,
          courseId: mod.courseId || '',
          title: p.title || partDoc.id,
          moduleTitle: mod.title || modDoc.id,
          week: mod.week || mod.order || null,
          submittedForReviewAt: p.submittedForReviewAt || null,
          hasDraft: !!p.hasDraft,
        });
      });
    }
    items.sort(function (a, b) {
      const ta = a.submittedForReviewAt && a.submittedForReviewAt.toMillis
        ? a.submittedForReviewAt.toMillis() : 0;
      const tb = b.submittedForReviewAt && b.submittedForReviewAt.toMillis
        ? b.submittedForReviewAt.toMillis() : 0;
      return tb - ta;
    });
    return items;
  }

  async function renderQueue() {
    const body = document.getElementById('acsReviewQueueBody');
    const status = document.getElementById('acsReviewQueueStatus');
    if (!body) return;
    if (status) status.textContent = 'Loading queue…';
    body.innerHTML = '';
    try {
      const items = await scanReviewQueue();
      if (status) {
        status.textContent = items.length
          ? items.length + ' part(s) awaiting review'
          : 'Queue empty — nothing in review.';
      }
      if (!items.length) {
        body.innerHTML = '<p class="acs-lint-muted">Submit a part for review from the right-hand Editorial review panel.</p>';
        return;
      }
      body.innerHTML = items.map(function (it) {
        return '<button type="button" class="acs-queue-item" data-module="' + esc(it.moduleId) +
          '" data-part="' + esc(it.partId) + '" data-course="' + esc(it.courseId) +
          '" data-title="' + esc(it.title) + '">' +
          '<strong>' + esc(it.title) + '</strong>' +
          '<span>' + esc(it.moduleTitle) +
          (it.week != null ? ' · Week ' + esc(it.week) : '') +
          (it.courseId ? ' · ' + esc(it.courseId) : '') +
          (it.hasDraft ? ' · has draft' : '') +
          '</span></button>';
      }).join('');
      body.querySelectorAll('.acs-queue-item').forEach(function (btn) {
        btn.onclick = function () {
          closeModal('acsReviewQueueModal');
          if (global.CourseStudio && typeof global.CourseStudio.openEditor === 'function') {
            global.CourseStudio.openEditor(
              btn.getAttribute('data-module'),
              btn.getAttribute('data-part'),
              btn.getAttribute('data-title'),
              btn.getAttribute('data-course')
            );
          }
        };
      });
    } catch (err) {
      if (status) status.textContent = 'Queue failed: ' + (err.message || err);
    }
  }

  function openQueue() {
    openModal('acsReviewQueueModal');
    renderQueue();
  }

  async function submitForReview() {
    const ctx = requirePartCtx();
    const user = currentUser();
    if (!ctx) return;
    try {
      await setStatus(ctx.moduleId, ctx.partId, 'in_review', {
        submittedForReviewAt: firebase.firestore.FieldValue.serverTimestamp(),
        submittedBy: user && user.uid,
      });
      await refreshPanel(ctx.moduleId, ctx.partId);
      flash('Submitted for review — still not live for learners');
    } catch (err) {
      flash('Could not submit: ' + (err.message || err), true);
    }
  }

  async function approvePart() {
    const ctx = requirePartCtx();
    const user = currentUser();
    if (!ctx) return;
    try {
      await setStatus(ctx.moduleId, ctx.partId, 'approved', {
        reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
        reviewedBy: user && user.uid,
      });
      await refreshPanel(ctx.moduleId, ctx.partId);
      flash('Approved — click Publish when ready for learners');
    } catch (err) {
      flash('Could not approve: ' + (err.message || err), true);
    }
  }

  function bind() {
    if (bound) return;
    bound = true;

    const statusEl = document.getElementById('acsReviewStatus');
    if (statusEl) {
      statusEl.onchange = async function () {
        const ctx = requirePartCtx();
        const user = currentUser();
        if (!ctx) {
          statusEl.value = 'draft';
          return;
        }
        const next = statusEl.value;
        const extra = {};
        if (next === 'in_review') {
          extra.submittedForReviewAt = firebase.firestore.FieldValue.serverTimestamp();
          extra.submittedBy = user && user.uid;
        }
        if (next === 'approved') {
          extra.reviewedAt = firebase.firestore.FieldValue.serverTimestamp();
          extra.reviewedBy = user && user.uid;
        }
        try {
          await setStatus(ctx.moduleId, ctx.partId, next, extra);
          await refreshPanel(ctx.moduleId, ctx.partId);
          flash('Review → ' + (LABELS[next] || next));
        } catch (err) {
          flash('Could not update status: ' + (err.message || err), true);
        }
      };
    }

    const addBtn = document.getElementById('acsReviewAddNoteBtn');
    if (addBtn) {
      addBtn.onclick = async function () {
        const ctx = requirePartCtx();
        const user = currentUser();
        const ta = document.getElementById('acsReviewNoteInput');
        if (!ctx || !ta) return;
        const text = ta.value.trim();
        if (!text) {
          flash('Write a note first.', true);
          return;
        }
        addBtn.disabled = true;
        try {
          await addNote(ctx.moduleId, ctx.partId, text, user);
          ta.value = '';
          await refreshPanel(ctx.moduleId, ctx.partId);
          flash('Note added');
        } catch (err) {
          flash('Could not add note: ' + (err.message || err), true);
        } finally {
          addBtn.disabled = false;
        }
      };
    }

    const submitBtn = document.getElementById('acsReviewSubmitBtn');
    if (submitBtn) submitBtn.onclick = submitForReview;

    const approveBtn = document.getElementById('acsReviewApproveBtn');
    if (approveBtn) approveBtn.onclick = approvePart;

    const queueBtn = document.getElementById('acsReviewQueueBtn');
    if (queueBtn) queueBtn.onclick = openQueue;

    document.querySelectorAll('[data-close-review-queue]').forEach(function (btn) {
      btn.onclick = function () { closeModal('acsReviewQueueModal'); };
    });
  }

  global.StudioReview = {
    bind: bind,
    refreshPanel: refreshPanel,
    renderQueue: renderQueue,
    openQueue: openQueue,
    LABELS: LABELS,
  };
})(window);
