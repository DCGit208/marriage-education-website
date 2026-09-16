// Service Worker for SBD Network PWA
// Firebase Messaging — must be imported before anything else
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

if (!firebase.apps.length) {
  firebase.initializeApp({
    apiKey: 'AIzaSyDK2FjzMM5cZ6zkpz89LieauLDTBT8DzYc',
    authDomain: 'marriage-education.firebaseapp.com',
    projectId: 'marriage-education',
    storageBucket: 'marriage-education.firebasestorage.app',
    messagingSenderId: '730854285800',
    appId: '1:730854285800:web:2176d278397398fd41045d'
  });
}

const messaging = firebase.messaging();

// Raw push listener — runs ALONGSIDE Firebase's handler.
// Firebase handles showNotification() when "notification" key is present.
// We only handle the app icon badge here (Web App Badging API).
self.addEventListener('push', () => {
  if ('setAppBadge' in self.navigator) {
    self.navigator.setAppBadge(1).catch(() => {});
  }
});

// onBackgroundMessage — fires for data-only messages (no "notification" key).
// Kept as fallback for non-iOS browsers / Android Chrome.
messaging.onBackgroundMessage((payload) => {
  const data  = payload.data || {};
  const title = data.title || 'SBD Network';
  const body  = data.body  || 'New activity in SBD Network';
  const url   = data.url   || '/dashboard.html';
  return self.registration.showNotification(title, {
    body,
    icon:     '/assets/icons/icon-192.png',
    badge:    '/assets/icons/icon-72.png',
    vibrate:  [200, 100, 200],
    tag:      'sbd-notification',
    renotify: true,
    data:     { url },
  });
});

const CACHE_VERSION = 'sbd-network-v1789601192657';
const CACHE_NAME = `${CACHE_VERSION}::static`;
const RUNTIME_CACHE = `${CACHE_VERSION}::runtime`;

// NOTE: JS/CSS files in this project use ?v=TIMESTAMP versioned URLs.
// Precaching bare paths (/js/foo.js) would never match those versioned URLs
// (cache lookup is exact URL match). Only precache unversioned assets.
// Do NOT precache .html paths — Firebase cleanUrls redirects /page.html → /page,
// and Safari rejects "Response served by service worker has redirections".
const PRECACHE_URLS = [
  '/manifest.json',
  '/changelog.json',
];

/** Paths Hosting 302/301s. If the SW follows those redirects, the document URL
 *  stays on the original path (Safari unwrap) and auth-guard may bounce guests. */
const HOSTING_REDIRECT_PATHS = new Set([
  '/',
  '/index',
  '/index.html',
  '/paywall-demo',
  '/paywall-demo.html',
  '/video-preview-demo',
  '/video-preview-demo.html',
  '/dashboard-old',
  '/dashboard-old.html',
  '/mv-house-OLD-BACKUP',
  '/mv-house-OLD-BACKUP.html',
]);

/**
 * Safari (WebKit) throws if a SW returns a Response with redirected === true.
 * Rebuild the body so navigations remain valid after Firebase Hosting redirects.
 */
function asSameOriginResponse(response) {
  if (!response || response.type === 'opaqueredirect') {
    return null;
  }
  if (!response.redirected) {
    return response;
  }
  const headers = new Headers(response.headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers,
  });
}

/** With cleanUrls, fetch /page instead of /page.html to avoid a 301. */
function cleanHtmlRequest(request, url) {
  const path = (url.pathname.endsWith('.html')
    ? url.pathname.replace(/\.html$/i, '')
    : url.pathname) + url.search;
  return new Request(path, {
    method: 'GET',
    headers: request.headers,
    credentials: request.credentials,
    redirect: 'follow',
    cache: 'no-store',
  });
}

async function matchHtmlCache(request, url) {
  const direct = await caches.match(request);
  if (direct) return asSameOriginResponse(direct) || direct;
  if (url.pathname.endsWith('.html')) {
    const cleanPath = url.pathname.replace(/\.html$/i, '') + url.search;
    const cleanHit = await caches.match(cleanPath);
    if (cleanHit) return asSameOriginResponse(cleanHit) || cleanHit;
  } else {
    const htmlHit = await caches.match(url.pathname + '.html' + url.search);
    if (htmlHit) return asSameOriginResponse(htmlHit) || htmlHit;
  }
  return null;
}

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Precaching static assets');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            return cacheName.startsWith('sbd-network-') && cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE;
          })
          .map((cacheName) => {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => self.clients.claim())
      .then(() => {
        // After taking control, send a message to open tabs so they can
        // reload at a safe moment — avoids forced navigation on installed PWAs.
        return self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
        });
      })
  );
});

// Fetch event - network first, fall back to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Never cache or intercept the SW script or version manifest — doing so breaks
  // registration.update() with "unknown error when fetching the script".
  if (url.pathname === '/service-worker.js' || url.pathname === '/version.json') {
    return;
  }
  
  // Skip Firebase requests (always use network)
  if (url.href.includes('firebaseio.com') || 
      url.href.includes('googleapis.com') ||
      url.href.includes('firebasestorage.googleapis.com')) {
    return;
  }

  // Labs contract JSON — network-first (avoid stale phase1 contracts in runtime cache).
  if (url.pathname.indexOf('/docs/sbd-life-') === 0 && url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(new Request(request, { cache: 'no-store' })).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const toCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, toCache));
        }
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // JS and CSS — Network-first with HTTP-cache bypass.
  // ?v=TIMESTAMP URLs change every deploy, so new URLs are always fetched fresh.
  // Falls back to SW cache only when offline.
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(new Request(request, { cache: 'no-store' })).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const toCache = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, toCache));
        }
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // Do not intercept Hosting redirect sources. Following + unwrapping those
  // responses keeps the original URL (e.g. `/` or `/dashboard-old`) and
  // sends guests to `/auth?next=...`.
  if (HOSTING_REDIRECT_PATHS.has(url.pathname)) {
    return;
  }
  const isHtml = request.headers.get('accept')?.includes('text/html') || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === '';
  if (isHtml) {
    event.respondWith(
      fetch(cleanHtmlRequest(request, url))
        .then((raw) => {
          const response = asSameOriginResponse(raw);
          if (response && response.status === 200 && (response.type === 'basic' || response.type === 'default')) {
            const cacheKey = url.pathname.endsWith('.html')
              ? new Request(url.pathname.replace(/\.html$/i, '') + url.search)
              : request;
            const toCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, toCache));
            return response;
          }
          return matchHtmlCache(request, url).then((cached) => cached || response);
        })
        .catch(() => matchHtmlCache(request, url))
    );
    return;
  }

  // Video/audio: always hit the network — never cache-first.
  // Safari (especially iOS) uses byte-range requests for <video>. The Cache API match
  // is URL-only; serving one stored 200 body for subsequent Range requests breaks
  // decoding (black / paused / "doesn't play") in Safari and installed PWAs.
  if (/\.(mp4|webm|m4v|ogg|ogv)(\?|#|$)/i.test(url.pathname)) {
    event.respondWith(
      fetch(request, { cache: 'no-store', mode: 'same-origin' }).catch(() => new Response('', { status: 503 }))
    );
    return;
  }
  
  // For other static assets (icons, images) - Cache first, fallback to network
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(request).then((response) => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          
          return response;
        });
      })
      .catch(() => fetch(request).catch(() => new Response('', { status: 503 })))
  );
});

// Allow pages to trigger an immediate SW swap without waiting for idle.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Background sync for offline posts (future enhancement)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-posts') {
    event.waitUntil(syncPosts());
  }
});

async function syncPosts() {
  console.log('[Service Worker] Syncing offline posts...');
}

// Notification click handler — open the relevant board/page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Clear the app icon badge when user taps the notification
  if ('clearAppBadge' in self.navigator) self.navigator.clearAppBadge().catch(() => {});
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      const targetUrl = event.notification.data?.url || '/dashboard.html';
      // Focus and navigate existing open window if possible
      for (const client of windowClients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

// Message handler — for update notifications
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[Service Worker] Loaded');
