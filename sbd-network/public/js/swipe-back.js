// swipe-back.js — Swipe right from left edge to go back
// Shows a visual drag handle that follows the finger; triggers history.back() on success.
(function () {
  var startX = 0, startY = 0, tracking = false, cancelled = false;
  var EDGE = 28;      // px from left edge to begin tracking
  var THRESHOLD = 72; // min rightward distance to trigger back
  var MAX_VERT = 60;  // max vertical drift that still counts as horizontal

  /* ---- create the persistent drag-handle elements ---- */
  var handle = document.createElement('div');
  handle.id = 'swipe-back-handle';
  handle.innerHTML = '<div id="swipe-back-arrow"></div>';

  var overlay = document.createElement('div');
  overlay.id = 'swipe-back-overlay';

  /* ---- inject CSS ---- */
  var style = document.createElement('style');
  style.textContent = [
    '#swipe-back-handle{',
      'position:fixed;top:50%;left:0;z-index:9999;',
      'transform:translateY(-50%) translateX(-100%);',
      'width:48px;height:64px;',
      'display:flex;align-items:center;justify-content:center;',
      'background:rgba(255,255,255,0.12);',
      'border-radius:0 16px 16px 0;',
      'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);',
      'box-shadow:2px 0 16px rgba(0,0,0,0.4);',
      'opacity:0;pointer-events:none;',
      'will-change:transform,opacity;',
    '}',
    '#swipe-back-arrow{',
      'width:0;height:0;',
      'border-top:9px solid transparent;',
      'border-bottom:9px solid transparent;',
      'border-right:13px solid rgba(255,255,255,0.85);',
      'margin-left:6px;',
      'transition:border-right-color 0.15s;',
    '}',
    '#swipe-back-overlay{',
      'position:fixed;inset:0;z-index:9998;',
      'background:linear-gradient(to right,rgba(255,255,255,0.06) 0%,transparent 40%);',
      'opacity:0;pointer-events:none;',
      'will-change:opacity;',
    '}',
    /* ready state — arrow turns accent colour when past threshold */
    '#swipe-back-handle.ready #swipe-back-arrow{',
      'border-right-color:rgba(0,212,188,0.95);',
    '}'
  ].join('');

  document.addEventListener('DOMContentLoaded', function () {
    document.body.appendChild(overlay);
    document.body.appendChild(handle);
  });

  /* Safety: clear any leftover classes/transforms on pageshow */
  window.addEventListener('pageshow', function () {
    document.body.classList.remove('page-enter', 'page-exit', 'page-exit-back');
    resetHandle();
  });

  function resetHandle() {
    handle.style.transition = '';
    handle.style.transform = 'translateY(-50%) translateX(-100%)';
    handle.style.opacity = '0';
    overlay.style.opacity = '0';
    handle.classList.remove('ready');
  }

  function setProgress(dx) {
    // dx = how far right the finger has moved from startX
    var clamped = Math.min(dx, THRESHOLD * 1.4);
    var ratio = Math.max(0, clamped / THRESHOLD); // 0 → 1+

    // handle slides in from left (starts fully off-screen at -100%)
    var slideIn = Math.min(ratio * 100, 100); // 0% → 100% (fully visible)
    handle.style.transform = 'translateY(-50%) translateX(calc(-100% + ' + slideIn + '%))';
    handle.style.opacity = Math.min(ratio * 1.6, 1).toFixed(2);
    overlay.style.opacity = (Math.min(ratio, 1) * 0.5).toFixed(2);

    if (ratio >= 1) {
      handle.classList.add('ready');
    } else {
      handle.classList.remove('ready');
    }
  }

  /* ---- touch handlers ---- */
  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    cancelled = false;
    tracking = startX <= EDGE;
    if (tracking) {
      handle.style.transition = 'none';
      overlay.style.transition = 'none';
    }
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!tracking || cancelled) return;
    var dx = e.touches[0].clientX - startX;
    var dy = Math.abs(e.touches[0].clientY - startY);
    if (dy > MAX_VERT) {
      cancelled = true;
      handle.style.transition = 'transform 0.25s ease,opacity 0.25s ease';
      overlay.style.transition = 'opacity 0.25s ease';
      resetHandle();
      return;
    }
    if (dx > 0) setProgress(dx);
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    if (!tracking) return;
    tracking = false;
    if (cancelled) return;
    var dx = e.changedTouches[0].clientX - startX;
    var dy = Math.abs(e.changedTouches[0].clientY - startY);

    if (dx >= THRESHOLD && dy <= MAX_VERT) {
      // Commit — slide handle further right then trigger back
      handle.style.transition = 'transform 0.2s ease,opacity 0.15s ease';
      handle.style.transform = 'translateY(-50%) translateX(60px)';
      handle.style.opacity = '0';
      overlay.style.transition = 'opacity 0.2s ease';
      overlay.style.opacity = '0';
      document.body.classList.add('page-exit-back');
      setTimeout(function () {
        document.body.classList.remove('page-exit-back');
        resetHandle();
        history.back();
      }, 220);
    } else {
      // Cancel — snap handle back
      handle.style.transition = 'transform 0.3s cubic-bezier(0.4,0,0.2,1),opacity 0.3s ease';
      overlay.style.transition = 'opacity 0.3s ease';
      resetHandle();
    }
  }, { passive: true });

  document.addEventListener('touchcancel', function () {
    if (!tracking) return;
    tracking = false;
    handle.style.transition = 'transform 0.25s ease,opacity 0.25s ease';
    overlay.style.transition = 'opacity 0.25s ease';
    resetHandle();
  }, { passive: true });
}());
