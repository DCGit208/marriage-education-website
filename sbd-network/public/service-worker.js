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

const CACHE_VERSION = 'sbd-network-v1779262000000';
const CACHE_NAME = `${CACHE_VERSION}::static`;
const RUNTIME_CACHE = `${CACHE_VERSION}::runtime`;

// NOTE: JS/CSS files in this project use ?v=TIMESTAMP versioned URLs.
// Precaching bare paths (/js/foo.js) would never match those versioned URLs
// (cache lookup is exact URL match). Only precache unversioned assets.
const PRECACHE_URLS = [
  '/manifest.json',
  '/changelog.json',
];

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
  
  // Skip Firebase requests (always use network)
  if (url.href.includes('firebaseio.com') || 
      url.href.includes('googleapis.com') ||
      url.href.includes('firebasestorage.googleapis.com')) {
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

  // HTML — Network-first, bypass all caches.
  // Cache successful responses so we can fall back if the network returns
  // a 503/500 or is unreachable on the next visit.
  const isHtml = request.headers.get('accept')?.includes('text/html') || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === '';
  if (isHtml) {
    event.respondWith(
      fetch(new Request(request, { cache: 'no-store' }))
        .then(response => {
          if (response && response.status === 200 && response.type === 'basic') {
            // Store a fresh copy so offline / 503 fallback works
            const toCache = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, toCache));
            return response;
          }
          // Non-200 from server (e.g. 503) — try cached version first
          return caches.match(request).then(cached => cached || response);
        })
        .catch(() => caches.match(request))
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
