/**
 * After Stripe checkout — sync SBD Life entitlements (backup if webhook is delayed).
 */
(function () {
  var MAGAZINE_PRODUCTS = {
    'sbd-magazine-annual-subscription': true,
    'sbd-magazine-single-issue': true,
    'sbd-digital-archive-access': true
  };

  document.addEventListener('DOMContentLoaded', function () {
    var params = new URLSearchParams(window.location.search);
    var productId = params.get('product') || '';
    var sessionId = params.get('session_id') || '';
    if (!MAGAZINE_PRODUCTS[productId]) return;

    var lifeLink = document.getElementById('sbd-life-success-link');
    if (lifeLink) {
      lifeLink.style.display = 'block';
      lifeLink.href = '/sbd-life/';
    }

    if (!sessionId || typeof firebase === 'undefined') return;

    firebase.auth().onAuthStateChanged(async function (user) {
      if (!user || !window.SbdLifeEntitlements) return;
      try {
        await window.SbdLifeEntitlements.syncFromCheckoutSession(sessionId, productId);
        var note = document.getElementById('sbd-life-sync-note');
        if (note) {
          note.textContent = 'SBD Life access is active. Open your editorial below.';
        }
      } catch (err) {
        console.warn('[SBD Life] checkout sync:', err.message || err.code);
        var note = document.getElementById('sbd-life-sync-note');
        if (note) {
          note.textContent =
            'Payment received. SBD Life access may take a minute to activate — refresh or return shortly.';
        }
      }
    });
  });
})();
