/**
 * Pin site-wide .bottom-nav to the *visual* viewport on iOS Safari / PWA.
 *
 * `position: fixed; bottom: 0` is intermittent on iOS: it sometimes tracks the
 * layout viewport (bar sits under Safari chrome / floats after the toolbar
 * hides) and sometimes the visual viewport. Setting `top` from
 * visualViewport.offsetTop + height is layout-coordinate and does not stack
 * with whatever `bottom: 0` currently means.
 *
 * --bn-vv-bottom is the layout-vs-visual gap so FAB / toasts stay above the bar.
 * Does not touch CE2 messenger keyboard helpers.
 */
(function (root) {
  'use strict';

  function occludedBottom(vv, innerHeight) {
    if (!vv) return 0;
    var height = typeof innerHeight === 'number' ? innerHeight : (root.innerHeight || 0);
    var vvOffset = Math.max(0, Math.round(vv.offsetTop || 0));
    var vvHeight = Math.round(vv.height || 0);
    return Math.max(0, Math.round(height - vvHeight - vvOffset));
  }

  function navTopPx(vv, navHeight) {
    if (!vv) return null;
    var h = typeof navHeight === 'number' ? navHeight : 0;
    return Math.round((vv.offsetTop || 0) + (vv.height || 0) - h);
  }

  function applyBottomNavViewport(doc, vv, innerHeight) {
    doc = doc || document;
    var navs = doc.querySelectorAll('.bottom-nav');
    if (!navs.length) return 0;

    var gap = occludedBottom(vv, innerHeight);
    doc.documentElement.style.setProperty('--bn-vv-bottom', gap + 'px');

    for (var i = 0; i < navs.length; i++) {
      var nav = navs[i];
      var navHeight = nav.offsetHeight || 0;
      if (!vv || !navHeight) {
        nav.style.top = '';
        nav.style.bottom = '';
        continue;
      }
      nav.style.top = navTopPx(vv, navHeight) + 'px';
      nav.style.bottom = 'auto';
    }
    return gap;
  }

  var raf = 0;

  function apply() {
    raf = 0;
    applyBottomNavViewport(document, root.visualViewport, root.innerHeight);
  }

  function schedule() {
    if (raf) return;
    raf = root.requestAnimationFrame(apply);
  }

  function bind() {
    apply();
    var vv = root.visualViewport;
    if (vv) {
      vv.addEventListener('resize', schedule, { passive: true });
      vv.addEventListener('scroll', schedule, { passive: true });
    }
    root.addEventListener('resize', schedule);
    root.addEventListener('orientationchange', schedule);
    root.addEventListener('pageshow', schedule);
    root.addEventListener('scroll', schedule, { passive: true });
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
  }

  root.SbdBottomNavViewport = {
    occludedBottom: occludedBottom,
    navTopPx: navTopPx,
    applyBottomNavViewport: applyBottomNavViewport,
    schedule: schedule,
  };

  if (typeof document === 'undefined') return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})(typeof window !== 'undefined' ? window : this);
