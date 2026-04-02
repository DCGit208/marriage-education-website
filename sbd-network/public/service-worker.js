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

const CACHE_VERSION = 'sbd-network-v206';
const CACHE_NAME = `${CACHE_VERSION}::static`;
const RUNTIME_CACHE = `${CACHE_VERSION}::runtime`;

// Assets to cache immediately
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/boards.html',
  '/group.html',
  '/board.html',
  '/admin.html',
  '/member.html',
  '/explore.html',
  '/search.html',
  '/css/styles.css',
  '/js/firebase.js',
  '/js/sw-update-checker.js',
  '/js/auth.js',
  '/js/dashboard.js',
  '/js/boards.js',
  '/js/group.js',
  '/js/board.js',
  '/js/posts.js',
  '/js/mentions.js',
  '/js/image-editor.js',
  '/js/upload.js',
  '/js/admin.js',
  '/js/member.js',
  '/js/explore.js',
  '/js/search.js',
  '/js/notifications.js',
  '/js/ptr.js',
  '/js/offline.js',
  '/js/transitions.js',
  '/js/swipe-back.js',
  '/js/install-prompt.js',
  '/css/bottom-nav.css',
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

  // JS and CSS — Cache first, refresh in background (stale-while-revalidate).
  // Scripts carry version query strings; the SW cache is busted on each deploy via CACHE_VERSION.
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            // Clone BEFORE returning — body can only be consumed once
            const toCache = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, toCache));
          }
          return response;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // For HTML pages — stale-while-revalidate: serve cache instantly, update in background.
  // This gives users an immediate response (skeleton → content) on every visit.
  if (request.headers.get('Accept').includes('text/html')) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(cache =>
        cache.match(request).then(cached => {
          // Always kick off a background refresh regardless of cache hit
          const networkFetch = fetch(request).then(response => {
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => null);
          // Return cached page immediately if available, otherwise wait for network
          return cached || networkFetch;
        })
      )
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
  );
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
