// ================================================================
// AUTH GUARD - Ensures user is authenticated before protected pages load
// Never sets pointer-events:none on body (breaks iOS PWA / CE2).
// ================================================================

(function () {
  var normalizedPath = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  var guestAllowedRoutes = new Set([
    '/dashboard',
    '/dashboard.html',
    '/auth',
    '/auth.html',
    '/index',
    '/index.html',
  ]);

  if (normalizedPath.indexOf('/communication-v2') === 0) {
    return;
  }

  if (guestAllowedRoutes.has(normalizedPath)) {
    return;
  }

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

  Promise.all([waitForFirebase(8000), waitForUser(8000)])
    .catch(function () {
      var next = window.location.pathname + window.location.search;
      window.location.href = '/auth?next=' + encodeURIComponent(next);
    });
})();
