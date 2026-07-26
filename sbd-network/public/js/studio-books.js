/**
 * Course Studio — new book wizard (prelim only).
 * Writing happens in the main Studio editor (toolbar, Canon AI, preview, review).
 */
(function (global) {
  'use strict';

  let bound = false;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function slugify(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function openModal() {
    const el = document.getElementById('acsBookModal');
    if (!el) return;
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    const el = document.getElementById('acsBookModal');
    if (!el) return;
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
  }

  function setStatus(msg, isError) {
    const status = document.getElementById('acsBookFormStatus');
    if (!status) return;
    status.textContent = msg || '';
    status.classList.toggle('acs-panel-status--error', !!isError);
    status.classList.toggle('acs-panel-status--ok', !isError && !!msg);
  }

  function val(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function resetForm() {
    document.getElementById('acsBookTitle').value = '';
    const idEl = document.getElementById('acsBookId');
    if (idEl) {
      idEl.value = '';
      idEl.readOnly = false;
    }
    document.getElementById('acsBookSubtitle').value = '';
    document.getElementById('acsBookDesc').value = '';
    document.getElementById('acsBookPrice').value = '24.99';
    document.getElementById('acsBookCoverUrl').value = '';
    const preview = document.getElementById('acsBookCoverPreview');
    if (preview) {
      preview.style.backgroundImage = '';
      preview.setAttribute('aria-hidden', 'true');
    }
    const createCourse = document.getElementById('acsBookCreateCourseToggle');
    if (createCourse) createCourse.checked = false;
    const bonusToggle = document.getElementById('acsBookBonusToggle');
    const bonusWrap = document.getElementById('acsBookBonusWrap');
    if (bonusToggle) bonusToggle.checked = false;
    if (bonusWrap) bonusWrap.hidden = true;
    fillCourseOptions();
    const bonus = document.getElementById('acsBookBonusCourse');
    if (bonus) bonus.value = '';
    setStatus('');
  }

  function fillCourseOptions() {
    const sel = document.getElementById('acsBookBonusCourse');
    if (!sel) return;
    const courses = (global.CourseStudio && global.CourseStudio.getAllCourses)
      ? global.CourseStudio.getAllCourses().filter(function (c) {
        return c.contentKind !== 'book';
      }) : [];
    sel.innerHTML = '<option value="">None — book only</option>' +
      courses.map(function (c) {
        return '<option value="' + esc(c.id) + '">' + esc(c.title || c.id) + '</option>';
      }).join('');
  }

  async function handleCoverUpload(file) {
    const coverStatus = document.getElementById('acsBookCoverStatus');
    if (!file) return;
    if (coverStatus) coverStatus.textContent = 'Uploading…';
    try {
      if (typeof uploadCourseCover !== 'function') throw new Error('Upload helper missing');
      const url = await uploadCourseCover(file);
      document.getElementById('acsBookCoverUrl').value = url;
      const preview = document.getElementById('acsBookCoverPreview');
      if (preview) {
        preview.style.backgroundImage = 'url("' + url.replace(/"/g, '') + '")';
        preview.setAttribute('aria-hidden', 'false');
      }
      if (coverStatus) coverStatus.textContent = 'Cover uploaded';
    } catch (err) {
      if (coverStatus) coverStatus.textContent = 'Upload failed: ' + (err.message || err);
    }
  }

  async function createAndOpen() {
    if (!global.CourseStudio || typeof global.CourseStudio.createBook !== 'function') {
      throw new Error('Studio book creator not ready — refresh the page');
    }
    const title = val('acsBookTitle');
    let id = val('acsBookId') || slugify(title);
    id = slugify(id);
    const priceUsd = Number(val('acsBookPrice') || 0);
    const createFormation = !!(document.getElementById('acsBookCreateCourseToggle') &&
      document.getElementById('acsBookCreateCourseToggle').checked);
    const bonusOn = !!(document.getElementById('acsBookBonusToggle') &&
      document.getElementById('acsBookBonusToggle').checked);
    const bonusCourse = bonusOn ? val('acsBookBonusCourse') : '';

    if (!title) throw new Error('Title is required');
    if (!id) throw new Error('Book ID is required');
    if (!(priceUsd >= 0)) throw new Error('Price must be a number ≥ 0');

    setStatus(createFormation
      ? 'Creating book + linked formation course…'
      : 'Creating book in Studio…');
    await global.CourseStudio.createBook({
      id: id,
      title: title,
      subtitle: val('acsBookSubtitle'),
      description: val('acsBookDesc'),
      priceUsd: priceUsd,
      coverImage: val('acsBookCoverUrl'),
      bonusCourseId: bonusCourse || null,
      createFormationCourse: createFormation,
    });
    closeModal();
  }

  function openBookModal() {
    resetForm();
    openModal();
    setStatus('Fill details, then Create — writing opens in the Studio editor with Canon AI.');
  }

  function bind() {
    if (bound) return;
    bound = true;

    const openBtn = document.getElementById('acsBookBtn');
    if (openBtn) {
      openBtn.onclick = function (e) {
        if (e) e.preventDefault();
        openBookModal();
      };
    }

    document.querySelectorAll('[data-close-book]').forEach(function (btn) {
      btn.onclick = closeModal;
    });

    const title = document.getElementById('acsBookTitle');
    const idEl = document.getElementById('acsBookId');
    if (title && idEl) {
      title.addEventListener('input', function () {
        if (idEl.readOnly) return;
        idEl.value = slugify(title.value);
      });
    }

    const bonusToggle = document.getElementById('acsBookBonusToggle');
    const bonusWrap = document.getElementById('acsBookBonusWrap');
    if (bonusToggle && bonusWrap) {
      bonusToggle.onchange = function () {
        bonusWrap.hidden = !bonusToggle.checked;
        if (bonusToggle.checked) fillCourseOptions();
      };
    }

    const coverFile = document.getElementById('acsBookCoverFile');
    if (coverFile) {
      coverFile.onchange = function () {
        if (coverFile.files && coverFile.files[0]) handleCoverUpload(coverFile.files[0]);
      };
    }

    const createBtn = document.getElementById('acsBookCreateBtn');
    if (createBtn) {
      createBtn.onclick = async function () {
        createBtn.disabled = true;
        try {
          await createAndOpen();
        } catch (err) {
          setStatus(err.message || String(err), true);
        } finally {
          createBtn.disabled = false;
        }
      };
    }
  }

  global.StudioBooks = {
    bind: bind,
    open: openBookModal,
  };
})(window);
