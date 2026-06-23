/**
 * MY LIBRARY — purchased courses + subscription formation access
 */
(function () {
  'use strict';

  let userData = null;
  let allCourses = [];
  let userProgress = null;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function schoolIcon(schoolId) {
    const map = {
      'school-1-teleios': '🧠',
      'school-2-sexual-literacy': '📐',
      'school-3-marriage-systems': '💍',
      'school-4-civilization-leadership': '🌍',
      standalone: '📖',
    };
    return map[schoolId] || '📖';
  }

  function courseCard(course, badgeClass, badgeLabel) {
    const meta = [
      course.totalModules ? course.totalModules + ' weeks' : null,
      course.duration || null,
      course.school_name || null,
    ].filter(Boolean).join(' · ');
    const thumb = window.CourseAccess
      ? CourseAccess.libraryThumbHtml(course.id, schoolIcon(course.schoolId))
      : '<span class="library-card-icon">' + schoolIcon(course.schoolId) + '</span>';
  return `
      <div class="library-card" data-course-id="${esc(course.id)}" onclick="Library.openCourse('${esc(course.id)}')">
        ${thumb}
        <div class="library-card-body">
          <span class="library-badge library-badge--${badgeClass}">${esc(badgeLabel)}</span>
          <p class="library-card-title">${esc(course.title)}</p>
          ${meta ? `<p class="library-card-meta">${esc(meta)}</p>` : ''}
        </div>
        <span style="color:#666">→</span>
      </div>`;
  }

  function filterCourses(list, query) {
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter(function (c) {
      return (c.title || '').toLowerCase().includes(q) ||
        (c.id || '').toLowerCase().includes(q) ||
        (c.school_name || '').toLowerCase().includes(q);
    });
  }

  async function loadData(uid) {
    const [userSnap, coursesSnap] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('courses').get(),
    ]);
    userData = userSnap.exists ? userSnap.data() : {};
    userProgress = userData.progress || {};
    allCourses = coursesSnap.docs
      .map(function (d) { return { id: d.id, ...d.data() }; })
      .filter(function (c) { return c.isActive !== false; })
      .sort(function (a, b) { return (a.title || '').localeCompare(b.title || ''); });
  }

  function render(query) {
    const opts = {
      unlockedCourses: userProgress.unlockedCourses || [],
      completedCourses: userProgress.completedCourses || [],
    };

    const purchasedIds = new Set();
    const planIds = new Set();
    const shopLocked = [];

    allCourses.forEach(function (course) {
      const access = CourseAccess.getCourseAccess(userData, course, opts);
      const owned = CourseAccess.userOwnsCourse(userData, course.id);
      const purchaseOnly = CourseAccess.isPurchaseOnlyCourse(course);

      if (CourseAccess.hasFullCatalogAccess(userData)) {
        if (purchaseOnly && !owned) planIds.add(course.id);
        else if (owned || purchaseOnly) purchasedIds.add(course.id);
        else planIds.add(course.id);
        return;
      }

      if (owned && purchaseOnly) {
        purchasedIds.add(course.id);
        return;
      }
      if (access.canAccess && !purchaseOnly) {
        planIds.add(course.id);
        return;
      }
      if (purchaseOnly && !access.canAccess) {
        shopLocked.push({ course: course, access: access });
      }
    });

    const purchased = allCourses.filter(function (c) { return purchasedIds.has(c.id); });
    const plan = allCourses.filter(function (c) {
      return planIds.has(c.id) && !purchasedIds.has(c.id);
    });

    const designerBanner = document.getElementById('libraryDesignerBanner');
    if (CourseAccess.isContentDesigner(userData)) {
      designerBanner.style.display = 'block';
      designerBanner.className = 'library-designer-banner';
      designerBanner.innerHTML =
        '<strong>Content Designer</strong> — full catalog access. ' +
        '<a href="/admin-courses.html">Open Course Studio →</a>';
    } else {
      designerBanner.style.display = 'none';
    }

    renderContinue();

    const purchasedEl = document.getElementById('libraryPurchased');
    const planEl = document.getElementById('libraryPlan');
    const shopEl = document.getElementById('libraryShop');

    const fp = filterCourses(purchased, query);
    const fpl = filterCourses(plan, query);
    const fshop = filterCourses(shopLocked.map(function (x) { return x.course; }), query);

    purchasedEl.innerHTML = fp.length
      ? fp.map(function (c) { return courseCard(c, 'owned', 'Owned'); }).join('')
      : '<div class="library-empty">No purchased courses yet. Flagship programs appear here after Shop checkout.</div>';

    planEl.innerHTML = fpl.length
      ? fpl.map(function (c) { return courseCard(c, 'plan', 'Your plan'); }).join('')
      : '<div class="library-empty">No subscription courses unlocked yet. Upgrade your tier or start formation on the catalog page.</div>';

    shopEl.innerHTML = fshop.length
      ? fshop.map(function (c) {
        return courseCard(c, 'shop', 'Shop') +
          '<div class="library-cta-row" style="margin:-4px 0 12px 52px">' +
          '<a class="library-cta" href="/shop.html">View in Shop →</a></div>';
      }).join('')
      : '<div class="library-empty">You own all available flagship programs, or none are listed yet.</div>';

    document.getElementById('libraryPurchasedSection').style.display =
      fp.length || !query ? '' : 'none';
    document.getElementById('libraryPlanSection').style.display =
      fpl.length || !query ? '' : 'none';
    document.getElementById('libraryShopSection').style.display =
      fshop.length || !query ? '' : 'none';
  }

  function renderContinue() {
    const wrap = document.getElementById('libraryContinue');
    const modId = userProgress.currentModuleId;
    if (!modId) {
      wrap.innerHTML = '';
      return;
    }
    db.collection('modules').doc(modId).get().then(function (snap) {
      if (!snap.exists) { wrap.innerHTML = ''; return; }
      const mod = snap.data();
      wrap.innerHTML = `
        <section class="library-section" style="border-top:none;padding-top:0">
          <h2 class="library-section-title">Continue</h2>
          <div class="library-card" onclick="window.location.href='/lesson.html?moduleId=${esc(modId)}'">
            <span class="library-card-icon">▶</span>
            <div class="library-card-body">
              <p class="library-card-title">${esc(mod.title || 'Resume lesson')}</p>
              <p class="library-card-meta">Pick up where you left off</p>
            </div>
            <span style="color:#00bcd4">→</span>
          </div>
        </section>`;
    }).catch(function () { wrap.innerHTML = ''; });
  }

  function openCourse(courseId) {
    if (window.CourseAccess && CourseAccess.isContentDesigner(userData)) {
      window.location.href = '/admin-courses.html?course=' + encodeURIComponent(courseId);
      return;
    }
    window.location.href = '/courses.html?course=' + encodeURIComponent(courseId);
  }

  firebase.auth().onAuthStateChanged(async function (user) {
    if (!user) {
      window.location.href = '/auth?next=/library.html';
      return;
    }
    try {
      await loadData(user.uid);
      render('');
      document.getElementById('librarySearch').addEventListener('input', function (e) {
        render(e.target.value.trim());
      });
    } catch (err) {
      console.error('[Library]', err);
    }
  });

  window.Library = { openCourse: openCourse };
})();
