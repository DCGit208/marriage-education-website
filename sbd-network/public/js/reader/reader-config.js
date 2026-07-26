/**
 * SBD Book Reader — shared config (Milestone 1).
 * Window: SBDReader.Config
 */
(function (global) {
  'use strict';

  var Config = {
    CONTENT_MAX_DEFAULT: '620px',
    BOOK_FROM_COURSE: {
      'sbd-dummies': [
        'sbd-dummies-course',
        'sex-by-design-for-dummies',
        'course-14-sex-by-design-for-dummies',
      ],
      'sbd-dummies-digital-print': [
        'sbd-dummies-course',
        'sex-by-design-for-dummies',
        'course-14-sex-by-design-for-dummies',
      ],
      'the-woman-the-wife-the-mother-book': ['the-woman-the-wife-the-mother'],
    },
    SELECTORS: {
      article: 'brArticle',
      articleBody: 'brArticleBody',
      articleTitle: 'brArticleTitle',
      chapterEnd: 'brChapterEnd',
      nextChapterBtn: 'brNextChapter',
      cover: 'brCover',
      denied: 'brDenied',
      status: 'brStatus',
      title: 'brTitle',
      chapterLabel: 'brChapterLabel',
      toc: 'brToc',
      tocList: 'brTocList',
      tocBackdrop: 'brTocBackdrop',
      emptyMsg: 'brEmptyMsg',
      progress: 'brProgress',
      progressFill: 'brProgressFill',
      progressPct: 'brProgressPct',
      progressEta: 'brProgressEta',
    },
    WPM_DEFAULT: 220,
  };

  global.SBDReader = global.SBDReader || {};
  global.SBDReader.Config = Config;
})(window);
