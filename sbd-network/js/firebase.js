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
const storage = firebase.storage();

// Configure Firestore settings (must be called once, before any operations)
// Removed experimentalForceLongPolling to avoid conflicts
console.log('✅ sbd-network: Firestore initialized successfully');

// Disable offline persistence for development (can cause CORS issues)
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
    if (!window.location.pathname.includes('index.html') && 
        !window.location.pathname.endsWith('/')) {
      window.location.href = 'index.html';
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
