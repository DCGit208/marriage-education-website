/**
 * SBD Network Book Reader — bootstrap (M1–M6).
 * Spec: docs/BOOK-READER-V1.md
 */
(function () {
  'use strict';

  var bookMeta = null;
  var userData = null;
  var fromOffline = false;
  var pdfProductId = null;
  var resumeTarget = null;

  var Config = window.SBDReader && window.SBDReader.Config;
  var Renderer = window.SBDReader && window.SBDReader.Renderer;
  var Navigation = window.SBDReader && window.SBDReader.Navigation;
  var Settings = window.SBDReader && window.SBDReader.Settings;
  var Chrome = window.SBDReader && window.SBDReader.Chrome;
  var Progress = window.SBDReader && window.SBDReader.Progress;
  var Position = window.SBDReader && window.SBDReader.Position;
  var Bookmarks = window.SBDReader && window.SBDReader.Bookmarks;
  var Sync = window.SBDReader && window.SBDReader.Sync;
  var Annotations = window.SBDReader && window.SBDReader.Annotations;
  var Search = window.SBDReader && window.SBDReader.Search;
  var Define = window.SBDReader && window.SBDReader.Define;
  var syncUid = null;

  function qs(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return Renderer ? Renderer.esc(s) : String(s == null ? '' : s);
  }

  function bookIdFromUrl() {
    return new URLSearchParams(window.location.search).get('id') || '';
  }

  function userOwnsBook(bookId) {
    if (!bookId) return false;
    if (window.CourseAccess && CourseAccess.hasFullCatalogAccess(userData)) return true;
    var products = (userData && userData.ownedProducts) || [];
    if (products.indexOf(bookId) !== -1) return true;
    if (bookId === 'sbd-dummies' && products.indexOf('sbd-for-dummies') !== -1) return true;
    if (bookId === 'sbd-dummies' && products.indexOf('sbd-dummies-digital-print') !== -1) return true;
    var ownedCourses = window.CourseAccess ? CourseAccess.ownedCourseIds(userData) : [];
    var hints = (Config && Config.BOOK_FROM_COURSE[bookId]) || [];
    if (hints.some(function (cid) { return ownedCourses.indexOf(cid) !== -1; })) return true;
    if (window.CourseAccess && CourseAccess.userOwnsCourse(userData, bookId)) return true;
    return false;
  }

  function setStatus(msg) {
    var el = qs('brStatus');
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function flashStatus(msg) {
    setStatus(msg);
    window.setTimeout(function () {
      setStatus('');
    }, 1800);
  }

  async function initPersistence(bookId) {
    if (Position) Position.init(bookId);
    if (Bookmarks) {
      Bookmarks.init({
        bookId: bookId,
        chapters: Navigation.getChapters(),
        onAdd: addBookmarkAtCurrent,
        onGoTo: goToBookmark,
      });
    }
    if (Sync && syncUid) {
      Sync.init({ uid: syncUid, bookId: bookId });
      await Sync.pullAndMerge(bookId, syncUid);
    }
    if (Annotations) {
      Annotations.init({
        bookId: bookId,
        chapters: Navigation.getChapters(),
        onGoTo: goToAnnotation,
        onSaved: flashStatus,
      });
    }
    if (Search) Search.init();
    if (Define) Define.init();
    resumeTarget = Position ? Position.resumeTarget(Navigation.getChapters(), bookId) : null;
  }

  function updateResumeUi() {
    var resumeBtn = qs('brResumeBtn');
    var beginBtn = qs('brBeginBtn');
    if (!resumeBtn) return;
    if (resumeTarget && resumeTarget.chapter) {
      resumeBtn.hidden = false;
      var label = resumeTarget.chapter.title || 'Chapter';
      if (label.length > 36) label = label.slice(0, 34) + '…';
      resumeBtn.textContent = 'Continue · ' + label;
      resumeBtn.setAttribute(
        'aria-label',
        'Continue reading ' + (resumeTarget.chapter.title || 'chapter')
      );
      if (beginBtn) {
        beginBtn.textContent = 'Start from beginning';
        beginBtn.classList.add('br-begin--secondary');
      }
    } else {
      resumeBtn.hidden = true;
      if (beginBtn) {
        beginBtn.textContent = 'Begin reading';
        beginBtn.classList.remove('br-begin--secondary');
      }
    }
  }

  function openAtResume() {
    if (!resumeTarget) return;
    if (Position) Position.setPendingRatio(resumeTarget.progressRatio);
    Navigation.openChapter(resumeTarget.index);
  }

  function addBookmarkAtCurrent() {
    if (!document.body.classList.contains('is-reading')) {
      flashStatus('Open a chapter to save your place.');
      return;
    }
    var chapter = Navigation.currentChapter();
    if (!chapter || !Bookmarks || !Progress) return;
    if (Chrome) Chrome.show();
    Bookmarks.addAtCurrent(chapter.id, Progress.getRatio());
    flashStatus('Place saved');
  }

  function goToBookmark(bookmark) {
    if (!bookmark || !Navigation) return;
    if (Chrome) Chrome.show();
    Navigation.openChapterById(bookmark.chapterId, {
      progressRatio: bookmark.progressRatio,
    });
  }

  function goToAnnotation(mark) {
    if (!mark || !Navigation) return;
    if (Chrome) Chrome.show();
    var current = Navigation.currentChapter();
    if (current && current.id === mark.chapterId && Annotations && Annotations.scrollToMarkId(mark.id)) {
      return;
    }
    if (Annotations) Annotations.requestScrollTo(mark.id);
    Navigation.openChapterById(mark.chapterId);
  }

  function showDenied() {
    document.body.classList.remove('is-reading');
    if (Chrome) Chrome.setReadingMode(false);
    if (Progress) Progress.stop();
    if (Position) Position.stop();
    if (Annotations) Annotations.stop();
    if (Search) Search.stop();
    if (Define) Define.stop();
    qs('brCover').hidden = true;
    qs('brArticle').hidden = true;
    qs('brDenied').hidden = false;
    setStatus('');
  }

  function showMessage(title, detail) {
    document.body.classList.remove('is-reading');
    if (Chrome) Chrome.setReadingMode(false);
    if (Progress) Progress.stop();
    if (Position) Position.stop();
    if (Annotations) Annotations.stop();
    if (Search) Search.stop();
    if (Define) Define.stop();
    qs('brCover').hidden = true;
    qs('brArticle').hidden = true;
    qs('brDenied').hidden = true;
    setStatus((title || 'Unable to open book') + (detail ? ' — ' + detail : ''));
  }

  function updateOfflineBtn() {
    var btn = qs('brOfflineBtn');
    if (!btn || !bookMeta) return;
    if (!window.BookOffline) {
      btn.hidden = true;
      return;
    }
    BookOffline.hasBook(bookMeta.id)
      .then(function (has) {
        btn.textContent = has ? 'Saved offline' : 'Save offline';
        btn.classList.toggle('is-saved', !!has);
      })
      .catch(function () {});
  }

  function updatePdfBtn() {
    var btn = qs('brPdfBtn');
    if (!btn) return;
    btn.hidden = !pdfProductId;
  }

  function buildOfflinePack() {
    return {
      id: bookMeta.id,
      title: bookMeta.title,
      subtitle: bookMeta.subtitle || '',
      description: bookMeta.description || '',
      coverImage: bookMeta.coverImage || '',
      pdfProductId: pdfProductId || '',
      chapters: Navigation.getChapters().map(function (c) {
        return { id: c.id, title: c.title, content: c.content || '' };
      }),
    };
  }

  async function saveOffline() {
    if (!window.BookOffline || !bookMeta) return;
    var btn = qs('brOfflineBtn');
    if (btn) btn.textContent = 'Saving…';
    try {
      await BookOffline.saveBook(buildOfflinePack());
      if (btn) {
        btn.textContent = 'Saved offline';
        btn.classList.add('is-saved');
      }
    } catch (err) {
      alert('Could not save offline: ' + (err.message || err));
      updateOfflineBtn();
    }
  }

  function presentChapter(chapter, index) {
    var article = qs('brArticle');
    var body = qs('brArticleBody');
    var titleEl = qs('brArticleTitle');
    var emptyMsg = qs('brEmptyMsg');
    var end = qs('brChapterEnd');

    document.body.classList.add('is-reading');
    if (Chrome) Chrome.setReadingMode(true);
    qs('brCover').hidden = true;
    qs('brDenied').hidden = true;
    article.hidden = false;
    article.removeAttribute('data-reader-ready');
    setStatus('');

    qs('brTitle').textContent = bookMeta.title || 'Book';
    qs('brChapterLabel').textContent = chapter.title || '';
    if (titleEl) titleEl.textContent = chapter.title || ('Chapter ' + (index + 1));
    document.title = (chapter.title || bookMeta.title || 'Book') + ' — SBD Network';

    var result = Renderer.renderChapterContent(chapter.content || '', body);
    if (emptyMsg) {
      emptyMsg.hidden = !(result.empty || (result.ok && !(chapter.content || '').trim()));
    }
    if (end) end.hidden = false;

    window.scrollTo(0, 0);
    Renderer.signalReady(article);
    if (Progress) Progress.startChapter(body);
    if (Position) {
      Position.setActiveChapter(bookMeta.id, chapter.id);
      Position.applyPendingScroll();
    }
    if (Annotations) {
      Annotations.startChapter(bookMeta.id, chapter.id, body);
    }
    if (Search) Search.startChapter(body);
  }

  function showCover() {
    // Persist scroll before tearing down progress (avoids writing 0%)
    if (Position) Position.flush();
    document.body.classList.remove('is-reading');
    if (Chrome) Chrome.setReadingMode(false);
    if (Progress) Progress.stop();
    if (Position) Position.stop();
    if (Annotations) Annotations.stop();
    if (Search) Search.stop();
    if (Define) Define.stop();
    qs('brDenied').hidden = true;
    qs('brArticle').hidden = true;
    qs('brCover').hidden = false;
    qs('brTitle').textContent = bookMeta.title || 'Book';
    qs('brCoverTitle').textContent = bookMeta.title || '';
    var subBits = [
      bookMeta.subtitle,
      bookMeta.author ? 'by ' + bookMeta.author : '',
      bookMeta.description,
    ].filter(Boolean);
    qs('brCoverSub').textContent = subBits.join(' · ') || '';
    var art = qs('brCoverArt');
    var cover =
      (window.BookCovers && BookCovers.resolve(bookMeta.id, bookMeta.coverImage)) ||
      bookMeta.coverImage;
    if (cover) {
      var src = String(cover).replace(/"/g, '');
      art.classList.add('has-image');
      art.innerHTML = '<img src="' + src + '" alt="' + esc(bookMeta.title || 'Cover') + '">';
    } else {
      art.classList.remove('has-image');
      art.innerHTML = '';
    }
    updatePdfBtn();
    var metaLine = qs('brCoverMeta');
    var chapters = Navigation.getChapters();
    if (metaLine) {
      metaLine.textContent = chapters.length
        ? chapters.length + ' chapters · Library edition'
        : 'Library edition';
    }
    qs('brChapterLabel').textContent = '';
    if (bookMeta && Position) {
      resumeTarget = Position.resumeTarget(chapters, bookMeta.id);
    }
    updateResumeUi();
    if (Annotations) Annotations.updateMarksButton();
  }

  async function loadFromPublishedPack(id) {
    var res = await fetch('/data/books/' + encodeURIComponent(id) + '.json?v=6');
    if (!res.ok) return false;
    var pack = await res.json();
    if (!pack || !Array.isArray(pack.chapters) || !pack.chapters.length) return false;
    bookMeta = {
      id: pack.id || id,
      title: pack.title || id,
      subtitle: pack.subtitle || '',
      description: pack.description || '',
      coverImage: pack.coverImage || '',
      author: pack.author || '',
    };
    pdfProductId = pack.pdfProductId || id;
    var chapters = pack.chapters
      .slice()
      .sort(function (a, b) {
        return (a.order || 0) - (b.order || 0);
      })
      .map(function (c) {
        return { id: c.id, title: c.title, content: c.content || '' };
      });
    Navigation.setChapters(chapters, bookMeta.title);
    return true;
  }

  async function loadFromFirestore(id) {
    var bookSnap = await db.collection('books').doc(id).get();
    var chapters = [];
    if (bookSnap.exists) {
      var b = bookSnap.data() || {};
      bookMeta = {
        id: id,
        title: b.title || id,
        subtitle: b.subtitle || '',
        description: b.description || '',
        coverImage:
          (window.BookCovers && BookCovers.resolve(id, b.coverImage)) || b.coverImage || '',
        author: b.author || '',
      };
      pdfProductId = b.pdfProductId || id;
      if (b.manuscript && String(b.manuscript).trim()) {
        chapters = [{ id: 'manuscript', title: b.title || 'Manuscript', content: b.manuscript }];
      }
    }

    var courseId = (bookSnap.exists && bookSnap.data().courseId) || id;
    var modulesSnap = await db.collection('modules').where('courseId', '==', courseId).get();
    if (!modulesSnap.empty) {
      var mods = modulesSnap.docs
        .map(function (d) {
          return Object.assign({ id: d.id }, d.data() || {});
        })
        .sort(function (a, b) {
          return (a.order || a.week || 0) - (b.order || b.week || 0);
        });
      var loaded = [];
      for (var mi = 0; mi < mods.length; mi++) {
        var mod = mods[mi];
        var parts = Array.isArray(mod.parts)
          ? mod.parts.slice().sort(function (a, b) {
              return (a.order || 0) - (b.order || 0);
            })
          : [{ id: 'body' }];
        for (var pi = 0; pi < parts.length; pi++) {
          var p = parts[pi];
          var partSnap = await db
            .collection('modules')
            .doc(mod.id)
            .collection('parts')
            .doc(p.id)
            .get();
          var pdata = partSnap.exists ? partSnap.data() : {};
          var content = pdata.content || pdata.draftContent || mod.content || '';
          if (!String(content).trim() && parts.length > 1) continue;
          loaded.push({
            id: mod.id + ':' + p.id,
            title: mod.title || p.title || 'Chapter',
            content:
              content ||
              '# ' + (mod.title || 'Chapter') + '\n\nContent for this chapter is being prepared.',
          });
        }
      }
      if (loaded.length) chapters = loaded;
    }

    if (!bookMeta) {
      var res = await fetch('/data/shop-catalog.json?v=6');
      var data = await res.json();
      var product = (data.products || []).find(function (p) {
        return p.id === id;
      });
      if (product) {
        bookMeta = {
          id: id,
          title: product.name,
          subtitle: '',
          description: product.description || '',
          coverImage:
            (window.BookCovers && BookCovers.resolve(id, product.coverImage)) ||
            product.coverImage ||
            '',
        };
        pdfProductId = id;
      }
    }

    if (!chapters.length && bookMeta) {
      chapters = [
        {
          id: 'intro',
          title: bookMeta.title || 'Opening',
          content:
            '# ' +
            (bookMeta.title || 'Book') +
            '\n\n' +
            (bookMeta.description ||
              'This title is on your shelf. Full manuscript content will appear here as it is published.') +
            '\n\n---\n\n*Owned in SBD Network — save offline when the full text is available.*\n',
        },
      ];
    }

    if (bookMeta) Navigation.setChapters(chapters, bookMeta.title);
  }

  async function loadFromOffline(id) {
    if (!window.BookOffline) return false;
    var pack = await BookOffline.getBook(id);
    if (!pack) return false;
    bookMeta = {
      id: pack.id,
      title: pack.title,
      subtitle: pack.subtitle || '',
      description: pack.description || '',
      coverImage: pack.coverImage || '',
    };
    pdfProductId = pack.pdfProductId || id;
    var chapters = Array.isArray(pack.chapters) ? pack.chapters : [];
    Navigation.setChapters(chapters, bookMeta.title);
    fromOffline = true;
    return chapters.length > 0;
  }

  function afterBookReady() {
    initPersistence(bookMeta.id).then(function () {
      document.title = (bookMeta.title || 'Book') + ' — SBD Network';
      showCover();
      setStatus('');
      updateOfflineBtn();
      Navigation.renderToc();
    });
  }

  function bindUi() {
    qs('brBack').onclick = function () {
      if (Position) Position.flush();
      if (Sync) Sync.flush();
      if (history.length > 1) history.back();
      else window.location.href = '/library.html?tab=books';
    };
    qs('brTocBtn').onclick = function () {
      if (Chrome) Chrome.show();
      if (Bookmarks) Bookmarks.closePanel();
      if (Annotations) Annotations.closeMarksPanel();
      Navigation.openToc();
    };
    qs('brTocClose').onclick = function () {
      Navigation.closeToc();
    };
    qs('brTocBackdrop').onclick = function () {
      Navigation.closeToc();
    };
    qs('brBeginBtn').onclick = function () {
      Navigation.openChapter(0);
    };
    var resumeBtn = qs('brResumeBtn');
    if (resumeBtn) {
      resumeBtn.onclick = openAtResume;
    }
    qs('brOfflineBtn').onclick = saveOffline;

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        Navigation.closeToc();
        if (Bookmarks) Bookmarks.closePanel();
        if (Annotations) {
          Annotations.closeMarksPanel();
          Annotations.hideToolbar();
        }
        if (Search) Search.closeBar();
        if (Define) Define.closePanel();
      }
    });
  }

  async function boot() {
    if (!Config || !Renderer || !Navigation) {
      setStatus('Reader modules failed to load.');
      return;
    }

    if (Settings) Settings.init();
    if (Chrome) Chrome.init();
    if (Progress) Progress.init();

    Navigation.init({
      onChapterChange: presentChapter,
    });
    bindUi();

    var id = bookIdFromUrl();
    if (!id) {
      showMessage('Missing book id', 'Open a book from your Library.');
      return;
    }

    setStatus('Opening book…');

    if (navigator.onLine === false) {
      var okOff = await loadFromOffline(id);
      if (!okOff) {
        showMessage('Offline', 'This book is not saved offline on this device.');
        return;
      }
      afterBookReady();
      if (fromOffline) qs('brCoverKicker').textContent = 'Offline · SBD Network';
      return;
    }

    firebase.auth().onAuthStateChanged(async function (user) {
      if (!user) {
        var ok = await loadFromOffline(id);
        if (ok) {
          afterBookReady();
          setStatus('Offline copy');
          return;
        }
        window.location.href =
          '/auth?next=' + encodeURIComponent('/book.html?id=' + id);
        return;
      }
      try {
        var snap = await db.collection('users').doc(user.uid).get();
        userData = snap.exists ? snap.data() : {};
        syncUid = user.uid;
        if (!userOwnsBook(id)) {
          var ownedOffline = await loadFromOffline(id);
          if (ownedOffline) {
            afterBookReady();
            setStatus('Offline copy');
            return;
          }
          showDenied();
          return;
        }

        var loaded = await loadFromPublishedPack(id);
        if (!loaded) await loadFromFirestore(id);

        if (!bookMeta) {
          showMessage('Book not found', 'This title is unavailable.');
          return;
        }
        if (!Navigation.getChapters().length) {
          showMessage('No chapters', 'This book has no readable chapters yet.');
          return;
        }

        afterBookReady();
      } catch (err) {
        console.error('[BookReader]', err);
        var fallback = await loadFromOffline(id);
        if (fallback) {
          afterBookReady();
          setStatus('Loaded offline after network error');
        } else {
          showMessage('Could not open book', err.message || String(err));
        }
      }
    });
  }

  boot();
})();
