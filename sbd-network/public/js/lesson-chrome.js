/**
 * Formation lesson reading chrome — progress, read time, scroll UX (performance-safe).
 */
(function (global) {
  'use strict';

  let scrollListenerBound = false;
  let scrollRafPending = false;

  function wordCount(text) {
    return String(text || '').split(/\s+/).filter(Boolean).length;
  }

  function estimateReadMinutes(text) {
    const words = wordCount(text);
    return Math.max(1, Math.round(words / 220));
  }

  function formatReadMeta(minutes, partLabel) {
    const parts = [];
    if (partLabel) parts.push(partLabel);
    parts.push(minutes + ' min read');
    return parts.join(' · ');
  }

  function bindReadProgress() {
    if (scrollListenerBound) return;
    scrollListenerBound = true;

    const bar = document.getElementById('readProgress');
    if (!bar) return;

    function paint() {
      scrollRafPending = false;
      const doc = document.documentElement;
      const scrollTop = doc.scrollTop || document.body.scrollTop;
      const height = doc.scrollHeight - doc.clientHeight;
      const pct = height > 0 ? Math.min(100, (scrollTop / height) * 100) : 0;
      bar.style.width = pct + '%';
      bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    }

    function onScroll() {
      if (scrollRafPending) return;
      scrollRafPending = true;
      requestAnimationFrame(paint);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    paint();
  }

  function updateHeroMeta(opts) {
    const el = document.getElementById('lessonReadMeta');
    if (!el) return;
    const bits = [];
    if (opts.weekLabel) bits.push(opts.weekLabel);
    if (opts.partLabel) bits.push(opts.partLabel);
    if (opts.minutes) bits.push(opts.minutes + ' min read');
    if (opts.progressLabel) bits.push(opts.progressLabel);
    el.textContent = '';
    bits.forEach((b) => {
      const chip = document.createElement('span');
      chip.className = 'formation-meta-chip';
      chip.textContent = b;
      el.appendChild(chip);
    });
    el.style.display = bits.length ? 'flex' : 'none';
  }

  function initAfterRender(opts) {
    bindReadProgress();
    if (opts && opts.readMeta) updateHeroMeta(opts.readMeta);
    document.body.classList.add('formation-reader-active');
  }

  function weekProgressLabel(completed, total) {
    if (!total) return '';
    return completed + ' of ' + total + ' parts';
  }

  global.FormationReaderChrome = {
    estimateReadMinutes,
    formatReadMeta,
    bindReadProgress,
    updateHeroMeta,
    initAfterRender,
    weekProgressLabel,
    wordCount,
  };
})(typeof window !== 'undefined' ? window : global);
