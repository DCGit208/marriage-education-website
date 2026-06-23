/**
 * Ambient formation chapter transitions — scroll mood, section reveal, part crossfade.
 */
(function (global) {
  'use strict';

  const MOOD_BY_SLUG = {
    ontology: 'gold',
    consciousness: 'violet',
    discipline: 'amber',
    practice: 'teal',
    reading: 'slate',
    definitions: 'slate',
    scripture: 'blue',
    reflection: 'violet',
    exercises: 'teal',
    action: 'amber',
    journal: 'slate',
    couple: 'rose',
    assessment: 'gold',
    challenge: 'gold',
    prayer: 'gold',
    week: 'gold',
  };

  let sectionObserver = null;
  let indicatorEl = null;
  let reduceMotion = false;
  let boundArticle = null;

  function slugFromSection(section) {
    const list = section.classList;
    for (let i = 0; i < list.length; i++) {
      const cls = list[i];
      if (cls.indexOf('formation-chapter--') === 0) {
        return cls.replace('formation-chapter--', '');
      }
    }
    return 'default';
  }

  function setMood(slug) {
    const mood = MOOD_BY_SLUG[slug] || 'gold';
    document.body.setAttribute('data-chapter-mood', mood);
  }

  function ensureIndicator() {
    if (indicatorEl && document.body.contains(indicatorEl)) return indicatorEl;
    indicatorEl = document.getElementById('formationChapterIndicator');
    if (!indicatorEl) {
      indicatorEl = document.createElement('div');
      indicatorEl.id = 'formationChapterIndicator';
      indicatorEl.className = 'formation-chapter-indicator';
      indicatorEl.setAttribute('aria-live', 'polite');
      indicatorEl.setAttribute('aria-atomic', 'true');
      document.body.appendChild(indicatorEl);
    }
    return indicatorEl;
  }

  function updateIndicator(section) {
    const el = ensureIndicator();
    const label = section.getAttribute('data-chapter') || 'Reading';
    el.textContent = label;
    el.classList.add('is-visible');
  }

  function pickActiveSection(entries, sections) {
    const visible = entries.filter(function (e) { return e.isIntersecting; });
    if (!visible.length) return null;

    let best = visible[0];
    let bestScore = -Infinity;
    visible.forEach(function (entry) {
      const rect = entry.boundingClientRect;
      const center = rect.top + rect.height * 0.35;
      const score = entry.intersectionRatio * 2 - Math.abs(center - window.innerHeight * 0.28) / window.innerHeight;
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    });
    return best ? best.target : sections[0];
  }

  function bind(articleRoot) {
    teardown({ keepIndicator: true });
    if (!articleRoot) return;

    boundArticle = articleRoot;
    reduceMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const sections = articleRoot.querySelectorAll('.formation-chapter');
    if (!sections.length) return;

    ensureIndicator();

    if (reduceMotion) {
      sections.forEach(function (s) { s.classList.add('is-visible'); });
      setMood(slugFromSection(sections[0]));
      updateIndicator(sections[0]);
      return;
    }

    sections.forEach(function (s) { s.classList.add('is-visible'); });

    sectionObserver = new IntersectionObserver(function (entries) {
      const active = pickActiveSection(entries, sections);
      if (!active) return;
      entries.forEach(function (entry) {
        if (entry.isIntersecting) entry.target.classList.add('is-visible');
      });
      setMood(slugFromSection(active));
      updateIndicator(active);
    }, {
      root: null,
      rootMargin: '-12% 0px -50% 0px',
      threshold: [0, 0.12, 0.25, 0.4, 0.6],
    });

    sections.forEach(function (s) { sectionObserver.observe(s); });
    setMood(slugFromSection(sections[0]));
    updateIndicator(sections[0]);
  }

  function teardown(opts) {
    if (sectionObserver) {
      sectionObserver.disconnect();
      sectionObserver = null;
    }
    boundArticle = null;
    document.body.removeAttribute('data-chapter-mood');
    if (indicatorEl) indicatorEl.classList.remove('is-visible');
    if (!opts || !opts.keepIndicator) {
      /* keep DOM node for reuse */
    }
  }

  function partTransition(bodyEl, renderFn) {
    if (!bodyEl || typeof renderFn !== 'function') {
      return Promise.resolve(renderFn && renderFn());
    }

    reduceMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      teardown();
      return Promise.resolve(renderFn());
    }

    return new Promise(function (resolve) {
      bodyEl.classList.add('lesson-body--out');
      window.setTimeout(function () {
        teardown();
        Promise.resolve(renderFn()).then(function () {
          bodyEl.classList.remove('lesson-body--out');
          bodyEl.classList.add('lesson-body--in');
          global.scrollTo({ top: 0, behavior: 'smooth' });
          window.setTimeout(function () {
            bodyEl.classList.remove('lesson-body--in');
            resolve();
          }, 360);
        });
      }, 200);
    });
  }

  global.FormationChapterTransitions = {
    bind: bind,
    teardown: teardown,
    partTransition: partTransition,
  };
})(typeof window !== 'undefined' ? window : global);
