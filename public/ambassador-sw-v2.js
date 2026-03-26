// Marriage Education Ambassador Portal — Service Worker v2
// Registered ONLY by pages under /ambassador/ with scope: '/ambassador/'
// This SW cannot touch the root site, login page, or course-viewer.
const CACHE_NAME = 'me-ambassador-v2::static';
const RUNTIME_CACHE = 'me-ambassador-v2::runtime';

const PRECACHE_URLS = [
  '/ambassador/dashboard.html',
  '/ambassador/senior-dashboard.html',
  '/ambassador/foundation-school.html',
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

  // Never intercept Firebase or CDN requests
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

  // Only intercept /ambassador/ routes — scope is already '/ambassador/' but belt+suspenders
  if (!url.pathname.startsWith('/ambassador/')) return;

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
            cached || caches.match('/ambassador/dashboard.html')
          )
        )
    );
    return;
  }

  // Cache-first for icons
  if (url.pathname.startsWith('/assets/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, res.clone()));
          return res;
        });
      })
    );
    return;
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { body: event.data.text() }; }
  const title = data.title || 'Marriage Education';
  const options = {
    body: data.body || 'You have a new notification.',
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/icon-72.png',
    tag: data.tag || 'me-notification',
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
