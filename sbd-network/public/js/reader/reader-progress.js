/**
 * SBD Book Reader — chapter progress, %, ETA (Milestone 5).
 * Local session only — no persistence / Firestore.
 * Window: SBDReader.Progress
 */
(function (global) {
  'use strict';

  var WPM = 220;

  var state = {
    active: false,
    totalWords: 0,
    totalMinutes: 0,
    scrollRaf: false,
    onScroll: null,
    onResize: null,
  };

  function qs(id) {
    return document.getElementById(id);
  }

  function wordCount(text) {
    return String(text || '').split(/\s+/).filter(Boolean).length;
  }

  function estimateMinutes(words) {
    if (!words) return 0;
    return Math.max(1, Math.ceil(words / WPM));
  }

  function formatEta(remainingMinutes) {
    if (remainingMinutes <= 0) return 'Done';
    if (remainingMinutes < 1) return '< 1 min left';
    if (remainingMinutes === 1) return '1 min left';
    return remainingMinutes + ' min left';
  }

  function articleEl() {
    return qs('brArticle');
  }

  function chapterScrollMetrics() {
    var article = articleEl();
    if (!article || article.hidden) {
      return { ratio: 0, pct: 0 };
    }

    var doc = document.documentElement;
    var scrollTop = doc.scrollTop || document.body.scrollTop || 0;
    var viewport = global.innerHeight || doc.clientHeight || 0;
    var articleTop = article.offsetTop;
    var articleHeight = article.offsetHeight;
    var scrollable = Math.max(0, articleHeight - viewport);

    if (scrollable <= 0) {
      return { ratio: 1, pct: 100 };
    }

    var scrolled = scrollTop - articleTop;
    var ratio = Math.min(1, Math.max(0, scrolled / scrollable));
    return { ratio: ratio, pct: Math.round(ratio * 100) };
  }

  function getRatio() {
    return chapterScrollMetrics().ratio;
  }

  function scrollToRatio(ratio, behavior) {
    var article = articleEl();
    if (!article || article.hidden) return;

    var doc = document.documentElement;
    var viewport = global.innerHeight || doc.clientHeight || 0;
    var articleTop = article.offsetTop;
    var articleHeight = article.offsetHeight;
    var scrollable = Math.max(0, articleHeight - viewport);
    var clamped = Math.min(1, Math.max(0, Number(ratio) || 0));
    var top = articleTop + scrollable * clamped;

    global.scrollTo({
      top: top,
      behavior: behavior === 'smooth' ? 'smooth' : 'auto',
    });
    schedulePaint();
  }

  function paint() {
    state.scrollRaf = false;
    if (!state.active) return;

    var metrics = chapterScrollMetrics();
    var pct = metrics.pct;
    var ratio = metrics.ratio;
    var remaining = Math.max(0, Math.ceil(state.totalMinutes * (1 - ratio)));

    var fill = qs('brProgressFill');
    var pctEl = qs('brProgressPct');
    var etaEl = qs('brProgressEta');
    var topProg = qs('brTopProgress');
    var strip = qs('brProgress');
    var body = document.body;
    var chromeVisible = body && body.classList.contains('br-chrome-visible');

    if (fill) {
      fill.style.width = pct + '%';
      fill.setAttribute('aria-valuenow', String(pct));
    }
    if (pctEl) pctEl.textContent = pct + '%';
    if (etaEl) etaEl.textContent = formatEta(remaining);
    if (topProg) {
      if (chromeVisible) {
        topProg.hidden = false;
        topProg.textContent = pct + '% · ' + formatEta(remaining);
      } else {
        topProg.hidden = true;
        topProg.textContent = '';
      }
    }
    if (strip) {
      strip.setAttribute('aria-label', 'Chapter reading progress ' + pct + ' percent, ' + formatEta(remaining));
    }
  }

  function schedulePaint() {
    if (state.scrollRaf || !state.active) return;
    state.scrollRaf = true;
    global.requestAnimationFrame(paint);
  }

  function bindListeners() {
    if (state.onScroll) return;
    state.onScroll = schedulePaint;
    state.onResize = schedulePaint;
    global.addEventListener('scroll', state.onScroll, { passive: true });
    global.addEventListener('resize', state.onResize, { passive: true });
  }

  function unbindListeners() {
    if (state.onScroll) {
      global.removeEventListener('scroll', state.onScroll);
      state.onScroll = null;
    }
    if (state.onResize) {
      global.removeEventListener('resize', state.onResize);
      state.onResize = null;
    }
    state.scrollRaf = false;
  }

  function showStrip(show) {
    var strip = qs('brProgress');
    if (!strip) return;
    strip.hidden = !show;
    strip.setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  function startChapter(bodyEl) {
    stop();

    var text = bodyEl ? (bodyEl.innerText || bodyEl.textContent || '') : '';
    state.totalWords = wordCount(text);
    state.totalMinutes = estimateMinutes(state.totalWords);
    state.active = true;

    showStrip(true);
    bindListeners();

    // Layout may settle after fonts / images
    schedulePaint();
    global.setTimeout(schedulePaint, 50);
    global.setTimeout(schedulePaint, 300);
  }

  function stop() {
    state.active = false;
    unbindListeners();
    showStrip(false);

    var fill = qs('brProgressFill');
    if (fill) {
      fill.style.width = '0%';
      fill.setAttribute('aria-valuenow', '0');
    }
    var pctEl = qs('brProgressPct');
    var etaEl = qs('brProgressEta');
    var topProg = qs('brTopProgress');
    if (pctEl) pctEl.textContent = '0%';
    if (etaEl) etaEl.textContent = '';
    if (topProg) {
      topProg.hidden = true;
      topProg.textContent = '';
    }
  }

  function init() {
    stop();
  }

  global.SBDReader = global.SBDReader || {};
  global.SBDReader.Progress = {
    init: init,
    startChapter: startChapter,
    stop: stop,
    repaint: schedulePaint,
    getRatio: getRatio,
    scrollToRatio: scrollToRatio,
    wordCount: wordCount,
    estimateMinutes: estimateMinutes,
    WPM: WPM,
  };
})(window);
