// ================================================================
// AUTH GUARD - Ensures user is authenticated before protected pages load
// Never sets pointer-events:none on body (breaks iOS PWA / CE2).
// ================================================================

(function () {
  var normalizedPath = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  var guestAllowedRoutes = new Set([
    '/',
    '/dashboard',
    '/dashboard.html',
    '/auth',
    '/auth.html',
    '/index',
    '/index.html',
    '/pricing',
    '/pricing.html',
    '/resources',
    '/resources.html',
  ]);

  if (normalizedPath.indexOf('/communication-v2') === 0) {
    return;
  }

  if (guestAllowedRoutes.has(normalizedPath)) {
    return;
  }

  // Hide opted-in pages (html.sbd-auth-pending CSS) until auth is confirmed.
  document.documentElement.classList.add('sbd-auth-pending');

  // Bounce guests before Firebase loads so protected chrome never paints.
  try {
    if (!localStorage.getItem('sbdUserId')) {
      var nextNow = window.location.pathname + window.location.search;
      window.location.replace('/auth?next=' + encodeURIComponent(nextNow));
      return;
    }
  } catch (e) {}

  function waitForFirebase(maxMs) {
    var start = Date.now();
    return new Promise(function (resolve, reject) {
      (function tick() {
        if (typeof firebase !== 'undefined' && typeof auth !== 'undefined') {
          resolve();
          return;
        }
        if (Date.now() - start >= maxMs) {
          reject(new Error('Firebase did not load'));
          return;
        }
        window.setTimeout(tick, 100);
      })();
    });
  }

  function waitForUser(maxMs) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timeout = window.setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error('Auth timeout'));
      }, maxMs);

      auth.onAuthStateChanged(function (user) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        if (!user) {
          reject(new Error('Not signed in'));
          return;
        }
        resolve(user);
      });
    });
  }

  waitForFirebase(8000)
    .then(function () {
      return waitForUser(8000);
    })
    .then(function () {
      document.documentElement.classList.remove('sbd-auth-pending');
    })
    .catch(function () {
      var next = window.location.pathname + window.location.search;
      window.location.replace('/auth?next=' + encodeURIComponent(next));
    });
})();
