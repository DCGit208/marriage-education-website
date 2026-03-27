// ptr.js – Pull-to-Refresh for SBD Network PWA
// Usage: initPTR(onRefresh [, scrollEl])
//   onRefresh  – async function called when user completes the pull gesture
//   scrollEl   – element with overflow-y:auto|scroll; omit for body/window scroll
window.initPTR = function (onRefresh, scrollEl) {
  var THRESHOLD = 65; // minimum drag distance (px) before refresh triggers

  // Inject the indicator bar just below the app-header
  var bar = document.createElement('div');
  bar.className = 'ptr-bar';
  bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML =
    '<span class="ptr-icon"></span>' +
    '<span class="ptr-text">Pull to refresh</span>';
  document.body.insertBefore(bar, document.body.firstChild);

  // Position below whatever the actual header height is
  var header = document.querySelector('.app-header');
  if (header) bar.style.top = header.offsetHeight + 'px';

  var getScrollTop = function () {
    return scrollEl
      ? scrollEl.scrollTop
      : (window.scrollY || document.documentElement.scrollTop);
  };

  var target = scrollEl || document;
  var startY = 0, dist = 0, live = false, busy = false;

  target.addEventListener('touchstart', function (e) {
    if (busy || getScrollTop() > 4) return;
    startY = e.touches[0].clientY;
    live  = true;
    dist  = 0;
  }, { passive: true });

  target.addEventListener('touchmove', function (e) {
    if (!live || busy) return;
    dist = e.touches[0].clientY - startY;
    if (dist <= 0) { live = false; return; }
    var progress = Math.min(dist / THRESHOLD, 1);
    bar.style.height  = Math.min(dist * 0.45, 48) + 'px';
    bar.style.opacity = progress;
    bar.querySelector('.ptr-text').textContent =
      progress >= 1 ? 'Release to refresh' : 'Pull to refresh';
  }, { passive: true });

  target.addEventListener('touchend', function () {
    if (!live || busy) { live = false; return; }
    live = false;
    if (dist >= THRESHOLD) {
      busy = true;
      bar.style.height = '48px';
      bar.querySelector('.ptr-text').textContent = 'Refreshing\u2026';
      bar.querySelector('.ptr-icon').classList.add('ptr-spin');
      Promise.resolve()
        .then(function () { return onRefresh(); })
        .catch(function () {})
        .then(function () {
          setTimeout(function () {
            bar.style.height  = '0';
            bar.style.opacity = '0';
            bar.querySelector('.ptr-icon').classList.remove('ptr-spin');
            busy = false;
          }, 500);
        });
    } else {
      bar.style.height  = '0';
      bar.style.opacity = '0';
    }
    dist = 0;
  }, { passive: true });
};
