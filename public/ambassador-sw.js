// Kill switch — Chrome had this registered at scope '/'; self-destruct and clean up.
// The real ambassador SW is now ambassador-sw-v2.js (scope: '/ambassador/').
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
      .then(() => self.registration.unregister())
      .then(() =>
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then((clients) =>
            Promise.all(clients.map((c) => c.navigate(c.url).catch(() => {})))
          )
      )
  );
});

const CACHE_NAME = CACHE_VERSION + '::static';
const RUNTIME_CACHE = CACHE_VERSION + '::runtime';

const PRECACHE_URLS = [
  '/ambassador-login.html',
  '/ambassador/dashboard.html',
  '/ambassador/senior-dashboard.html',
  '/ambassador/foundation-school.html',
  '/ambassador/training.html',
  '/ambassador/resources.html',
  '/ambassador/leaderboard.html',
  '/course-viewer.html',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n !== CACHE_NAME && n !== RUNTIME_CACHE)
            .map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Always network-only for Firebase, CDNs, fonts
  const networkOnlyHosts = [
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'firebase.googleapis.com',
    'fcm.googleapis.com',
    'firebaseinstallations.googleapis.com',
    'www.gstatic.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'marriageeducation.firebasestorage.app',
  ];
  if (networkOnlyHosts.some((h) => url.hostname.includes(h))) return;

  // Only intercept ambassador + course routes — main site passes through unmodified
  const ambassadorRoutes = [
    '/ambassador-login.html',
    '/ambassador/',
    '/course-viewer.html',
    '/assets/icons/',
    '/manifest.json',
  ];
  const isAmbassadorRoute = ambassadorRoutes.some(
    (r) => url.pathname === r || url.pathname.startsWith(r)
  );
  if (!isAmbassadorRoute) return;

  // Network-first for HTML pages
  if (request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(CACHE_NAME).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) =>
            cached || caches.match('/ambassador-login.html')
          )
        )
    );
    return;
  }

  // Cache-first for icons and manifest
  event.respondWith(
    caches.match(request).then((cached) => {
      const netFetch = fetch(request)
        .then((res) => {
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || netFetch;
    })
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { body: event.data.text() }; }
  const title = data.title || 'Marriage Education';
  const options = {
    body: data.body || 'You have a new notification.',
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/icon-72.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'me-ambassador',
    renotify: true,
    data: { url: data.url || '/ambassador/dashboard.html' },
  };
  if ('setAppBadge' in self.navigator) self.navigator.setAppBadge(1).catch(() => {});
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl =
    event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : '/ambassador/dashboard.html';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      })
  );
});
