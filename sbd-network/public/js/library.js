/**
 * MY LIBRARY — Courses (LMS) + Bookshelf (owned books, offline-capable)
 */
(function () {
  'use strict';

  let userData = null;
  let allCourses = [];
  let userProgress = null;
  let catalogBooks = [];
  let studioBooks = [];
  let offlineIds = {};
  let activeTab = 'all';
  let searchQuery = '';
  let pageOwned = 1;
  let pageShop = 1;

  const PAGE_OWNED = 12;
  const PAGE_SHOP = 12;
  const PAGE_PREVIEW = 8;

  /** Legacy: owning these courses implies the related book product is owned. */
  const BOOK_FROM_COURSE = {
    'sbd-dummies': ['sbd-dummies-course', 'sex-by-design-for-dummies', 'course-14-sex-by-design-for-dummies'],
    'the-woman-the-wife-the-mother-book': ['the-woman-the-wife-the-mother'],
  };

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function attrEsc(s) {
    return String(s == null ? '' : s).replace(/"/g, '&quot;');
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

  function isBookCourse(course) {
    return !!(course && (course.contentKind === 'book' || course.type === 'book'));
  }

  function ownedProductIds() {
    const set = new Set();
    (userData && userData.ownedProducts || []).forEach(function (id) { set.add(id); });
    return set;
  }

  function ownedCourseIds() {
    return window.CourseAccess ? CourseAccess.ownedCourseIds(userData) : [];
  }

  function userOwnsBook(bookId) {
    if (!bookId) return false;
    if (CourseAccess.hasFullCatalogAccess(userData)) return true;
    const products = ownedProductIds();
    if (products.has(bookId)) return true;
    const hints = BOOK_FROM_COURSE[bookId];
    if (hints) {
      const courses = ownedCourseIds();
      if (hints.some(function (cid) { return courses.indexOf(cid) !== -1; })) return true;
    }
    // Studio book stored as course id
    if (CourseAccess.userOwnsCourse(userData, bookId)) return true;
    return false;
  }

  function filterByQuery(list, query, fields) {
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter(function (item) {
      return fields.some(function (f) {
        return String(item[f] || '').toLowerCase().includes(q);
      });
    });
  }

  function courseCard(course, badgeClass, badgeLabel) {
    const meta = [
      course.totalModules ? course.totalModules + ' weeks' : null,
      course.duration || null,
      course.school_name || null,
    ].filter(Boolean).join(' · ');
    const thumb = window.CourseAccess
      ? CourseAccess.libraryThumbHtml(course.id, schoolIcon(course.schoolId), course.coverImage)
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

  function bookVolumeHtml(book, opts) {
    opts = opts || {};
    const owned = !!opts.owned;
    const title = book.name || book.title || book.id;
    const offline = !!offlineIds[book.id];
    const coverUrl = (window.BookCovers && BookCovers.resolve(book)) || book.coverImage || '';
    const face = coverUrl
      ? '<span class="bv-slot"><img class="bv-cover" src="' + attrEsc(coverUrl) + '" alt="' + attrEsc(title) + '" loading="lazy" decoding="async"></span>'
      : '<span class="bv-placeholder"><span class="bv-placeholder-title">' + esc(String(title).slice(0, 42)) + '</span></span>';
    const chip = offline
      ? '<span class="bv-chip bv-chip--offline">Offline</span>'
      : (owned ? '<span class="bv-chip">Owned</span>' : '<span class="bv-chip bv-chip--shop">Shop</span>');
    const priceBit = book.priceDisplay ? ' · ' + esc(book.priceDisplay) : '';
    return `
      <button type="button" class="book-volume${coverUrl ? ' book-volume--has-cover' : ''}"
        data-book-id="${attrEsc(book.id)}" data-owned="${owned ? '1' : '0'}">
        ${face}
        <span class="bv-meta">
          ${chip}
          <strong class="bv-title">${esc(title)}</strong>
          <span class="bv-sub">${esc(book.format || 'Digital')}${priceBit}</span>
        </span>
      </button>`;
  }

  function paginate(list, page, size) {
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / size) || 1);
    const p = Math.min(Math.max(1, page || 1), pages);
    const start = (p - 1) * size;
    const items = list.slice(start, start + size);
    return {
      items: items,
      page: p,
      pages: pages,
      total: total,
      from: total ? start + 1 : 0,
      to: Math.min(start + size, total),
      size: size,
    };
  }

  function renderPager(el, pageInfo, which) {
    if (!el) return;
    if (!pageInfo || pageInfo.total <= pageInfo.size) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.innerHTML =
      '<button type="button" data-pager-dir="prev" data-pager-which="' + which + '"' +
      (pageInfo.page <= 1 ? ' disabled' : '') + '>← Prev</button>' +
      '<span>' + pageInfo.from + '–' + pageInfo.to + ' of ' + pageInfo.total + '</span>' +
      '<button type="button" data-pager-dir="next" data-pager-which="' + which + '"' +
      (pageInfo.page >= pageInfo.pages ? ' disabled' : '') + '>Next →</button>';
    el.querySelectorAll('button[data-pager-dir]').forEach(function (btn) {
      btn.onclick = function () {
        const dir = btn.getAttribute('data-pager-dir');
        const w = btn.getAttribute('data-pager-which');
        if (w === 'owned') pageOwned += dir === 'next' ? 1 : -1;
        if (w === 'shop') pageShop += dir === 'next' ? 1 : -1;
        renderBookshelf();
      };
    });
  }

  async function loadShopBooks() {
    const res = await fetch('/data/shop-catalog.json?v=6');
    if (!res.ok) throw new Error('Could not load shop catalog');
    const data = await res.json();
    catalogBooks = (data.products || []).filter(function (p) {
      return p.type === 'book' && p.status !== 'inactive';
    });
  }

  async function loadStudioBooks() {
    try {
      const snap = await db.collection('books').where('studioManaged', '==', true).limit(100).get();
      studioBooks = snap.docs.map(function (d) {
        const b = d.data() || {};
        return {
          id: d.id,
          name: b.title || d.id,
          title: b.title || d.id,
          description: b.description || '',
          coverImage: b.coverImage || '',
          priceDisplay: b.priceDisplay || '',
          format: 'Digital',
          type: 'book',
          studioManaged: true,
          status: b.status || 'draft',
        };
      });
    } catch (_) {
      studioBooks = [];
    }
  }

  async function refreshOfflineMap() {
    offlineIds = {};
    if (!window.BookOffline) return;
    try {
      const rows = await BookOffline.listBooks();
      rows.forEach(function (r) { if (r && r.id) offlineIds[r.id] = true; });
    } catch (_) {}
  }

  function mergedBookCatalog() {
    const map = {};
    catalogBooks.forEach(function (b) { map[b.id] = Object.assign({}, b); });
    studioBooks.forEach(function (b) {
      if (b.status === 'published' || userOwnsBook(b.id) || CourseAccess.hasFullCatalogAccess(userData)) {
        map[b.id] = Object.assign({}, map[b.id] || {}, b, { name: b.name || b.title });
      }
    });
    // contentKind books from courses collection
    allCourses.filter(isBookCourse).forEach(function (c) {
      map[c.id] = Object.assign({}, map[c.id] || {}, {
        id: c.id,
        name: c.title || c.id,
        title: c.title || c.id,
        description: c.description || '',
        coverImage: c.coverImage || (map[c.id] && map[c.id].coverImage) || '',
        format: 'Digital',
        type: 'book',
        contentKind: 'book',
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) {
        return String(a.name || a.title || '').localeCompare(String(b.name || b.title || ''));
      });
  }

  function ownedBooksList() {
    return mergedBookCatalog().filter(function (b) { return userOwnsBook(b.id); });
  }

  function shopBooksList() {
    return mergedBookCatalog().filter(function (b) { return !userOwnsBook(b.id); });
  }

  function formationCoursesOnly() {
    return allCourses.filter(function (c) { return !isBookCourse(c); });
  }

  function setTab(tab) {
    activeTab = tab || 'all';
    document.querySelectorAll('.library-tab').forEach(function (btn) {
      const on = btn.getAttribute('data-lib-tab') === activeTab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.library-panel').forEach(function (panel) {
      const match = panel.getAttribute('data-lib-panel') === activeTab;
      panel.hidden = !match;
    });
    const heroTitle = document.getElementById('libraryHeroTitle');
    const heroSub = document.getElementById('libraryHeroSub');
    if (activeTab === 'books') {
      if (heroTitle) heroTitle.textContent = 'Your bookshelf';
      if (heroSub) heroSub.textContent = 'Owned titles. Download for offline — never courses.';
    } else if (activeTab === 'courses') {
      if (heroTitle) heroTitle.textContent = 'Your courses';
      if (heroSub) heroSub.textContent = 'Formation programs in the LMS. Online only.';
    } else {
      if (heroTitle) heroTitle.textContent = 'Your library';
      if (heroSub) heroSub.textContent = 'Courses for formation. Books for the shelf.';
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', activeTab);
      history.replaceState({}, '', url.pathname + url.search);
    } catch (_) {}
    render(searchQuery);
  }

  function bindBookshelfClicks(root) {
    if (!root) return;
    root.querySelectorAll('.book-volume').forEach(function (btn) {
      btn.onclick = function () {
        const id = btn.getAttribute('data-book-id');
        const owned = btn.getAttribute('data-owned') === '1';
        if (!owned && !CourseAccess.hasFullCatalogAccess(userData)) {
          window.location.href = '/shop.html';
          return;
        }
        window.location.href = '/book.html?id=' + encodeURIComponent(id);
      };
    });
  }

  function renderBookshelf() {
    const ownedAll = filterByQuery(ownedBooksList(), searchQuery, ['name', 'title', 'id', 'description']);
    const shopAll = filterByQuery(shopBooksList(), searchQuery, ['name', 'title', 'id', 'description']);
    const ownedPage = paginate(ownedAll, pageOwned, PAGE_OWNED);
    const shopPage = paginate(shopAll, pageShop, PAGE_SHOP);
    pageOwned = ownedPage.page;
    pageShop = shopPage.page;
    const preview = ownedAll.slice(0, PAGE_PREVIEW);

    const shelfOwned = document.getElementById('bookshelfOwned');
    const shelfEmpty = document.getElementById('bookshelfOwnedEmpty');
    const shelfShop = document.getElementById('bookshelfShop');
    const previewEl = document.getElementById('libraryBooksPreview');
    const previewSection = document.getElementById('libraryBooksPreviewSection');

    if (shelfOwned) {
      shelfOwned.innerHTML = ownedPage.items.map(function (b) { return bookVolumeHtml(b, { owned: true }); }).join('');
      bindBookshelfClicks(shelfOwned);
    }
    renderPager(document.getElementById('bookshelfOwnedPager'), ownedPage, 'owned');
    if (shelfEmpty) shelfEmpty.hidden = ownedAll.length > 0;
    if (shelfShop) {
      shelfShop.innerHTML = shopAll.length
        ? shopPage.items.map(function (b) { return bookVolumeHtml(b, { owned: false }); }).join('')
        : '<div class="library-empty">You already own the listed catalog books.</div>';
      bindBookshelfClicks(shelfShop);
    }
    renderPager(document.getElementById('bookshelfShopPager'), shopPage, 'shop');
    if (previewEl) {
      previewEl.innerHTML = preview.length
        ? preview.map(function (b) { return bookVolumeHtml(b, { owned: true }); }).join('')
        : '<div class="library-empty">No books on your shelf yet.</div>';
      bindBookshelfClicks(previewEl);
    }
    if (previewSection) {
      previewSection.style.display = (!searchQuery || preview.length) ? '' : 'none';
    }
  }

  function renderCoursesInto(purchasedEl, planEl, shopEl, purchasedSec, planSec, shopSec) {
    const opts = {
      unlockedCourses: userProgress.unlockedCourses || [],
      completedCourses: userProgress.completedCourses || [],
    };
    const formation = formationCoursesOnly();
    const purchasedIds = new Set();
    const planIds = new Set();
    const shopLocked = [];

    formation.forEach(function (course) {
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
        shopLocked.push(course);
      }
    });

    const purchased = formation.filter(function (c) { return purchasedIds.has(c.id); });
    const plan = formation.filter(function (c) {
      return planIds.has(c.id) && !purchasedIds.has(c.id);
    });

    const fp = filterByQuery(purchased, searchQuery, ['title', 'id', 'school_name']);
    const fpl = filterByQuery(plan, searchQuery, ['title', 'id', 'school_name']);
    const fshop = filterByQuery(shopLocked, searchQuery, ['title', 'id', 'school_name']);

    if (purchasedEl) {
      purchasedEl.innerHTML = fp.length
        ? fp.map(function (c) { return courseCard(c, 'owned', 'Owned'); }).join('')
        : '<div class="library-empty">No purchased courses yet.</div>';
    }
    if (planEl) {
      planEl.innerHTML = fpl.length
        ? fpl.map(function (c) { return courseCard(c, 'plan', 'Your plan'); }).join('')
        : '<div class="library-empty">No subscription courses unlocked yet.</div>';
    }
    if (shopEl) {
      shopEl.innerHTML = fshop.length
        ? fshop.map(function (c) {
          return courseCard(c, 'shop', 'Shop') +
            '<div class="library-cta-row" style="margin:-4px 0 12px 52px">' +
            '<a class="library-cta" href="/shop.html">View in Shop →</a></div>';
        }).join('')
        : '<div class="library-empty">You own all available flagship programs, or none are listed yet.</div>';
    }
    if (purchasedSec) purchasedSec.style.display = fp.length || !searchQuery ? '' : 'none';
    if (planSec) planSec.style.display = fpl.length || !searchQuery ? '' : 'none';
    if (shopSec) shopSec.style.display = fshop.length || !searchQuery ? '' : 'none';
  }

  function renderContinue(targetId) {
    const wrap = document.getElementById(targetId || 'libraryContinue');
    if (!wrap) return;
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

  function render(query) {
    const next = query || '';
    if (next !== searchQuery) {
      searchQuery = next;
      pageOwned = 1;
      pageShop = 1;
    } else {
      searchQuery = next;
    }
    const offlineBanner = document.getElementById('libraryOfflineBanner');
    if (offlineBanner) offlineBanner.hidden = navigator.onLine !== false;

    const designerBanner = document.getElementById('libraryDesignerBanner');
    if (designerBanner) {
      if (CourseAccess.isContentDesigner(userData)) {
        designerBanner.style.display = 'block';
        designerBanner.className = 'library-designer-banner';
        designerBanner.innerHTML =
          '<strong>Content Designer</strong> — full catalog access. ' +
          '<a href="/admin-courses.html">Open Course Studio →</a>';
      } else {
        designerBanner.style.display = 'none';
      }
    }

    if (activeTab === 'all' || activeTab === 'courses') {
      renderContinue(activeTab === 'courses' ? 'libraryContinueCourses' : 'libraryContinue');
    }

    if (activeTab === 'all') {
      renderBookshelf();
      renderCoursesInto(
        document.getElementById('libraryPurchased'),
        document.getElementById('libraryPlan'),
        document.getElementById('libraryShop'),
        document.getElementById('libraryPurchasedSection'),
        document.getElementById('libraryPlanSection'),
        document.getElementById('libraryShopSection')
      );
    } else if (activeTab === 'courses') {
      renderCoursesInto(
        document.getElementById('libraryPurchasedC'),
        document.getElementById('libraryPlanC'),
        document.getElementById('libraryShopC'),
        document.getElementById('libraryPurchasedSectionC'),
        document.getElementById('libraryPlanSectionC'),
        document.getElementById('libraryShopSectionC')
      );
    } else {
      renderBookshelf();
    }
  }

  function openCourse(courseId) {
    if (window.CourseAccess && CourseAccess.isContentDesigner(userData)) {
      window.location.href = '/admin-courses.html?course=' + encodeURIComponent(courseId);
      return;
    }
    window.location.href = '/courses.html?course=' + encodeURIComponent(courseId);
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

    await Promise.all([loadShopBooks(), loadStudioBooks(), refreshOfflineMap()]);
  }

  firebase.auth().onAuthStateChanged(async function (user) {
    if (!user) {
      // Offline: still show bookshelf from IndexedDB if possible
      if (navigator.onLine === false && window.BookOffline) {
        try {
          const rows = await BookOffline.listBooks();
          if (rows.length) {
            userData = { ownedProducts: rows.map(function (r) { return r.id; }) };
            catalogBooks = rows.map(function (r) {
              return {
                id: r.id,
                name: r.title || r.id,
                title: r.title || r.id,
                coverImage: r.coverImage || '',
                format: 'Digital',
                priceDisplay: '',
                type: 'book',
              };
            });
            rows.forEach(function (r) { offlineIds[r.id] = true; });
            allCourses = [];
            document.querySelectorAll('.library-tab').forEach(function (btn) {
              btn.onclick = function () { setTab(btn.getAttribute('data-lib-tab')); };
            });
            setTab('books');
            return;
          }
        } catch (_) {}
      }
      window.location.href = '/auth?next=/library.html';
      return;
    }

    try {
      await loadData(user.uid);
      document.querySelectorAll('.library-tab').forEach(function (btn) {
        btn.onclick = function () { setTab(btn.getAttribute('data-lib-tab')); };
      });
      document.querySelectorAll('[data-goto-tab]').forEach(function (btn) {
        btn.onclick = function () { setTab(btn.getAttribute('data-goto-tab')); };
      });
      document.getElementById('librarySearch').addEventListener('input', function (e) {
        render(e.target.value.trim());
      });
      const params = new URLSearchParams(window.location.search);
      setTab(params.get('tab') || 'all');
    } catch (err) {
      console.error('[Library]', err);
    }
  });

  window.Library = { openCourse: openCourse, setTab: setTab };
})();
