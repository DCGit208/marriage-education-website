/**
 * Course Studio — learner analytics for the selected / focused course
 * Uses users.ownedCourses + users.progress (progressPercent, completedCourses, completedModules)
 */
(function (global) {
  'use strict';

  let bound = false;
  let lastCourseId = null;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function openModal() {
    const el = document.getElementById('acsAnalyticsModal');
    if (!el) return;
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    const el = document.getElementById('acsAnalyticsModal');
    if (!el) return;
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
  }

  function courseOptionsHtml(selectedId) {
    const courses = (global.CourseStudio && global.CourseStudio.getAllCourses)
      ? global.CourseStudio.getAllCourses() : [];
    return courses.map(function (c) {
      const id = c.id || '';
      const title = c.title || id;
      return '<option value="' + esc(id) + '"' +
        (id === selectedId ? ' selected' : '') + '>' +
        esc(title) + '</option>';
    }).join('');
  }

  async function loadStats(courseId) {
    if (!courseId) {
      return {
        enrolled: 0, started: 0, completed: 0, avgProgress: 0, sample: [],
      };
    }

    const ownedSnap = await db.collection('users')
      .where('ownedCourses', 'array-contains', courseId)
      .limit(500)
      .get();

    let enrolled = ownedSnap.size;
    let started = 0;
    let completed = 0;
    let progressSum = 0;
    let progressN = 0;
    const sample = [];

    ownedSnap.forEach(function (doc) {
      const u = doc.data() || {};
      const progress = u.progress || {};
      const pctMap = progress.progressPercent || {};
      const pct = Number(pctMap[courseId] || 0);
      const doneList = progress.completedCourses || [];
      const isDone = doneList.indexOf(courseId) !== -1;
      if (pct > 0 || isDone) started += 1;
      if (isDone || pct >= 100) completed += 1;
      if (pct > 0 || isDone) {
        progressSum += isDone ? 100 : pct;
        progressN += 1;
      }
      if (sample.length < 12) {
        sample.push({
          name: u.displayName || u.name || u.email || doc.id.slice(0, 8),
          pct: isDone ? 100 : pct,
          done: isDone,
        });
      }
    });

    // Also catch learners with progress but no ownedCourses (subscription path)
    // Limited scan — only when owned set is small to avoid heavy reads.
    if (enrolled < 50) {
      try {
        const recent = await db.collection('users').orderBy('updatedAt', 'desc').limit(200).get();
        const seen = {};
        ownedSnap.forEach(function (d) { seen[d.id] = true; });
        recent.forEach(function (doc) {
          if (seen[doc.id]) return;
          const u = doc.data() || {};
          const progress = u.progress || {};
          const pctMap = progress.progressPercent || {};
          const pct = Number(pctMap[courseId] || 0);
          const doneList = progress.completedCourses || [];
          const isDone = doneList.indexOf(courseId) !== -1;
          const completedMods = progress.completedModules || [];
          const modulesByCourse = global.CourseStudio && global.CourseStudio.getModulesByCourse
            ? global.CourseStudio.getModulesByCourse() : {};
          const weeks = modulesByCourse[courseId] || [];
          const weekIds = weeks.map(function (w) { return w.id; });
          const touchedWeek = weekIds.some(function (id) {
            return completedMods.indexOf(id) !== -1;
          });
          if (!pct && !isDone && !touchedWeek) return;
          enrolled += 1;
          started += 1;
          if (isDone || pct >= 100) completed += 1;
          progressSum += isDone ? 100 : pct;
          progressN += 1;
          if (sample.length < 12) {
            sample.push({
              name: u.displayName || u.name || u.email || doc.id.slice(0, 8),
              pct: isDone ? 100 : pct,
              done: isDone,
            });
          }
        });
      } catch (_) {
        // updatedAt index may be missing — ownedCourses stats still useful
      }
    }

    return {
      enrolled: enrolled,
      started: started,
      completed: completed,
      avgProgress: progressN ? Math.round(progressSum / progressN) : 0,
      sample: sample,
    };
  }

  async function render(courseId) {
    lastCourseId = courseId;
    const select = document.getElementById('acsAnalyticsCourse');
    const status = document.getElementById('acsAnalyticsStatus');
    const grid = document.getElementById('acsAnalyticsGrid');
    const list = document.getElementById('acsAnalyticsSample');
    if (select && !select.options.length) {
      select.innerHTML = courseOptionsHtml(courseId);
    } else if (select && courseId) {
      select.value = courseId;
    }
    if (status) status.textContent = 'Loading learner stats…';
    if (grid) grid.innerHTML = '';
    if (list) list.innerHTML = '';

    try {
      const stats = await loadStats(courseId || (select && select.value));
      if (status) {
        status.textContent = 'Based on ownedCourses + progress (up to 500 enrolled).';
      }
      if (grid) {
        grid.innerHTML =
          '<div class="acs-stat"><span class="acs-stat-n">' + stats.enrolled + '</span><span class="acs-stat-l">Enrolled / owned</span></div>' +
          '<div class="acs-stat"><span class="acs-stat-n">' + stats.started + '</span><span class="acs-stat-l">Started</span></div>' +
          '<div class="acs-stat"><span class="acs-stat-n">' + stats.completed + '</span><span class="acs-stat-l">Completed</span></div>' +
          '<div class="acs-stat"><span class="acs-stat-n">' + stats.avgProgress + '%</span><span class="acs-stat-l">Avg progress</span></div>';
      }
      if (list) {
        if (!stats.sample.length) {
          list.innerHTML = '<p class="acs-lint-muted">No learner sample yet for this course.</p>';
        } else {
          list.innerHTML = '<p class="acs-meta-rail-title">Sample learners</p>' +
            stats.sample.map(function (s) {
              return '<div class="acs-analytics-row"><span>' + esc(s.name) + '</span>' +
                '<span>' + (s.done ? 'Done' : s.pct + '%') + '</span></div>';
            }).join('');
        }
      }
    } catch (err) {
      if (status) status.textContent = 'Analytics failed: ' + (err.message || err);
    }
  }

  function openAnalytics() {
    const ctx = global.CourseStudio && global.CourseStudio.getEditorCtx
      ? global.CourseStudio.getEditorCtx() : null;
    const select = document.getElementById('acsAnalyticsCourse');
    if (select) select.innerHTML = courseOptionsHtml(ctx && ctx.courseId);
    openModal();
    render((ctx && ctx.courseId) || (select && select.value) || '');
  }

  function bind() {
    if (bound) return;
    bound = true;

    const openBtn = document.getElementById('acsAnalyticsBtn');
    if (openBtn) {
      openBtn.onclick = function (e) {
        if (e) e.preventDefault();
        openAnalytics();
      };
    }

    const select = document.getElementById('acsAnalyticsCourse');
    if (select) {
      select.onchange = function () { render(select.value); };
    }

    const refresh = document.getElementById('acsAnalyticsRefresh');
    if (refresh) {
      refresh.onclick = function () {
        const sel = document.getElementById('acsAnalyticsCourse');
        render((sel && sel.value) || lastCourseId || '');
      };
    }

    document.querySelectorAll('[data-close-analytics]').forEach(function (btn) {
      btn.onclick = closeModal;
    });
  }

  global.StudioAnalytics = {
    bind: bind,
    render: render,
    open: openAnalytics,
  };
})(window);
