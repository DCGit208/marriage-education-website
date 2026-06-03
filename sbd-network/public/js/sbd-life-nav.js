/**
 * Phase 6 — inject SBD Life into Lifestyle hamburger when sbdLifeEnabled flag is on.
 */
(function () {
  var INJECTED = false;

  function findLifestyleSection() {
    var labels = document.querySelectorAll('.ham-section-label');
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].textContent.trim() === 'Lifestyle') {
        return labels[i].closest('.ham-section');
      }
    }
    return null;
  }

  function findDashboardExpressionSection() {
    var labels = document.querySelectorAll('.ham-section-label');
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].textContent.trim() === 'Expression') {
        return labels[i].closest('.ham-section');
      }
    }
    return null;
  }

  function injectLink(section) {
    if (!section || INJECTED || section.querySelector('[data-sbd-life-nav-link]')) return;
    var link = document.createElement('a');
    link.href = '/sbd-life/';
    link.setAttribute('data-sbd-life-nav-link', '1');
    link.innerHTML = '<span class="menu-icon">◑</span> SBD Life';
    var label = section.querySelector('.ham-section-label');
    if (label && label.nextSibling) {
      section.insertBefore(link, label.nextSibling);
    } else {
      section.appendChild(link);
    }
    INJECTED = true;
  }

  async function loadProductionEnabled() {
    if (typeof firebase === 'undefined' || !firebase.firestore) return false;
    try {
      var snap = await firebase.firestore().collection('admin').doc('flags').get();
      if (!snap.exists) return false;
      return Boolean(snap.data().sbdLifeEnabled);
    } catch (err) {
      console.warn('[SBD Life Nav] flag load failed', err.message || err.code);
      return false;
    }
  }

  async function maybeInject() {
    if (INJECTED) return;
    var enabled = await loadProductionEnabled();
    if (!enabled) return;
    var lifestyle = findLifestyleSection();
    if (lifestyle) {
      injectLink(lifestyle);
      return;
    }
    var expression = findDashboardExpressionSection();
    if (expression) {
      injectLink(expression);
    }
  }

  function boot() {
    if (typeof firebase === 'undefined' || !firebase.auth) {
      window.setTimeout(boot, 150);
      return;
    }
    firebase.auth().onAuthStateChanged(function (user) {
      if (!user) return;
      maybeInject();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
