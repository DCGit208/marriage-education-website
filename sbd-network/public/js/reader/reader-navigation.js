/**
 * SBD Book Reader — chapter navigation + TOC + end-of-chapter CTA (Milestone 1).
 * Window: SBDReader.Navigation
 */
(function (global) {
  'use strict';

  var state = {
    chapters: [],
    chapterIndex: 0,
    bookTitle: '',
    onChapterChange: null,
  };

  function qs(id) {
    return document.getElementById(id);
  }

  function getChapters() {
    return state.chapters;
  }

  function getIndex() {
    return state.chapterIndex;
  }

  function currentChapter() {
    return state.chapters[state.chapterIndex] || null;
  }

  function setChapters(list, bookTitle) {
    state.chapters = Array.isArray(list) ? list : [];
    state.bookTitle = bookTitle || '';
    state.chapterIndex = 0;
  }

  function renderToc() {
    var Config = global.SBDReader && global.SBDReader.Config;
    var list = qs(Config.SELECTORS.tocList);
    if (!list) return;
    var esc = global.SBDReader.Renderer.esc;
    list.innerHTML = state.chapters
      .map(function (c, i) {
        return (
          '<li><button type="button" class="br-toc-item' +
          (i === state.chapterIndex ? ' is-active' : '') +
          '" data-idx="' +
          i +
          '">' +
          esc(c.title || 'Chapter ' + (i + 1)) +
          '</button></li>'
        );
      })
      .join('');
    list.querySelectorAll('[data-idx]').forEach(function (btn) {
      btn.onclick = function () {
        openChapter(Number(btn.getAttribute('data-idx')));
        closeToc();
      };
    });
  }

  function openToc() {
    var Config = global.SBDReader.Config;
    var toc = qs(Config.SELECTORS.toc);
    var backdrop = qs(Config.SELECTORS.tocBackdrop);
    if (toc) {
      toc.classList.add('open');
      toc.setAttribute('aria-hidden', 'false');
    }
    if (backdrop) backdrop.hidden = false;
  }

  function closeToc() {
    var Config = global.SBDReader.Config;
    var toc = qs(Config.SELECTORS.toc);
    var backdrop = qs(Config.SELECTORS.tocBackdrop);
    if (toc) {
      toc.classList.remove('open');
      toc.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) backdrop.hidden = true;
  }

  function updateEndOfChapter() {
    var Config = global.SBDReader.Config;
    var end = qs(Config.SELECTORS.chapterEnd);
    var nextBtn = qs(Config.SELECTORS.nextChapterBtn);
    if (!end) return;

    var hasNext = state.chapterIndex < state.chapters.length - 1;
    end.hidden = false;
    if (nextBtn) {
      nextBtn.hidden = !hasNext;
      nextBtn.disabled = !hasNext;
      if (hasNext) {
        var next = state.chapters[state.chapterIndex + 1];
        nextBtn.textContent = 'Next Chapter →';
        nextBtn.setAttribute(
          'aria-label',
          'Continue to next chapter: ' + (next && next.title ? next.title : '')
        );
      }
    }
  }

  function openChapterById(chapterId, opts) {
    opts = opts || {};
    var idx = -1;
    for (var i = 0; i < state.chapters.length; i++) {
      if (state.chapters[i] && state.chapters[i].id === chapterId) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return false;
    if (opts.progressRatio != null) {
      var Position = global.SBDReader && global.SBDReader.Position;
      if (Position && Position.setPendingRatio) {
        Position.setPendingRatio(opts.progressRatio);
      }
    }
    return openChapter(idx);
  }

  function openChapter(idx) {
    if (idx < 0 || idx >= state.chapters.length) return false;
    state.chapterIndex = idx;
    if (typeof state.onChapterChange === 'function') {
      state.onChapterChange(state.chapters[idx], idx);
    }
    renderToc();
    updateEndOfChapter();
    return true;
  }

  function goNextChapter() {
    if (state.chapterIndex >= state.chapters.length - 1) return false;
    return openChapter(state.chapterIndex + 1);
  }

  function bindEndOfChapter() {
    var Config = global.SBDReader.Config;
    var nextBtn = qs(Config.SELECTORS.nextChapterBtn);
    if (nextBtn) {
      nextBtn.onclick = function () {
        goNextChapter();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
    }
  }

  function init(opts) {
    opts = opts || {};
    state.onChapterChange = opts.onChapterChange || null;
    bindEndOfChapter();
  }

  global.SBDReader = global.SBDReader || {};
  global.SBDReader.Navigation = {
    init: init,
    setChapters: setChapters,
    getChapters: getChapters,
    getIndex: getIndex,
    currentChapter: currentChapter,
    openChapter: openChapter,
    openChapterById: openChapterById,
    goNextChapter: goNextChapter,
    renderToc: renderToc,
    openToc: openToc,
    closeToc: closeToc,
    updateEndOfChapter: updateEndOfChapter,
  };
})(window);
