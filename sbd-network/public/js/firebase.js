// ================================================================
// Firebase Configuration and Initialization
// ================================================================

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDK2FjzMM5cZ6zkpz89LieauLDTBT8DzYc",
  authDomain: "marriage-education.firebaseapp.com",
  projectId: "marriage-education",
  storageBucket: "marriage-education.firebasestorage.app",
  messagingSenderId: "730854285800",
  appId: "1:730854285800:web:2176d278397398fd41045d"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Firebase Services
const auth = firebase.auth();
const db = firebase.firestore();

// ── Configure Firestore Settings ───────────────────────────────
// Safari (including iOS Safari used by PWAs) often has issues with WebSocket connections.
// Enable long polling for Safari to ensure reliable Firestore connectivity.
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
if (isSafari) {
  console.log('Safari detected — enabling Firestore long polling');
  db.settings({
    experimentalForceLongPolling: true,
    merge: true
  });
}

// ── Session persistence (Remember Me) ───────────────────────────
// Default to LOCAL so auth survives browser restarts.
// auth.js overrides to SESSION when the user unchecks "Remember Me".
(function _applyStoredPersistence() {
  const pref = localStorage.getItem('sbd_remember');
  // '0' = user explicitly chose SESSION last login
  const mode = pref === '0'
    ? firebase.auth.Auth.Persistence.SESSION
    : firebase.auth.Auth.Persistence.LOCAL;
  auth.setPersistence(mode).catch(() => {});
}());

console.log('✅ sbd-network: Firestore initialized successfully');

// Disable offline persistence to avoid Safari IndexedDB issues in private browsing
// db.enablePersistence()
//   .catch((err) => {
//     if (err.code === 'failed-precondition') {
//       console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
//     } else if (err.code === 'unimplemented') {
//       console.warn('Browser doesn\'t support persistence.');
//     }
//   });

// Current user state
let currentUser = null;

function normalizePathname(pathname) {
  const trimmed = (pathname || '/').replace(/\/+$/, '');
  return trimmed || '/';
}

function isPublicGuestRoute(pathname) {
  const normalized = normalizePathname(pathname);
  return normalized === '/' ||
         normalized === '/auth' ||
         normalized === '/auth.html' ||
         normalized === '/index' ||
         normalized === '/index.html' ||
         normalized === '/dashboard' ||
         normalized === '/dashboard.html';
}

// Auth state listener
auth.onAuthStateChanged((user) => {
  currentUser = user;
  if (user) {
    // Store user info for quick access
    console.log('User authenticated:', user.uid);
    localStorage.setItem('sbdUserId', user.uid);
    localStorage.setItem('sbdUserEmail', user.email);
  } else {
    console.log('User logged out');
    localStorage.removeItem('sbdUserId');
    localStorage.removeItem('sbdUserEmail');
    // Redirect to login if not on login page
    if (!isPublicGuestRoute(window.location.pathname)) {
      window.location.href = '/auth';
    }
  }
});

// Helper function to get current user
function getCurrentUser() {
  return currentUser || auth.currentUser;
}

// Helper function to check if user is admin
async function isUserAdmin() {
  const user = getCurrentUser();
  if (!user) return false;
  try {
    const userDoc = await db.collection('users').doc(user.uid).get();
    return userDoc.exists && userDoc.data().role === 'admin';
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

// Helper function to get user's groups
async function getUserGroups() {
  const user = getCurrentUser();
  if (!user) return [];
  try {
    const userDoc = await db.collection('users').doc(user.uid).get();
    return userDoc.exists ? userDoc.data().groups || [] : [];
  } catch (error) {
    console.error('Error getting user groups:', error);
    return [];
  }
}

console.log('Firebase initialized successfully');

// ── Service Worker Registration ───────────────────────────────────
// Must be registered here (loaded on every page) so it is always
// installed before _initPush tries to use it for FCM tokens.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
    .then(reg => {
      console.log('[SW] Registered, scope:', reg.scope);
      // Check for an update every time the app loads
      reg.update().catch(() => {});
    })
    .catch(err => console.warn('[SW] Registration failed:', err));

  // When a new SW takes over (skipWaiting + clients.claim), reload the page
  // so users instantly get the latest version without needing to reinstall.
  let swRefreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (swRefreshing) return;
    swRefreshing = true;
    window.location.reload();
  });
}
