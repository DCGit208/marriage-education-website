// ================================================================
// AUTHENTICATION LOGIC
// ================================================================

// DOM Elements
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const showSignupLink = document.getElementById('showSignup');
const showLoginLink = document.getElementById('showLogin');
const authMessage = document.getElementById('authMessage');
const loadingOverlay = document.getElementById('loadingOverlay');

const AUTH_REDIRECT_ALLOWLIST = new Set([
  '/dashboard', '/dashboard.html',
  '/learn', '/learn.html',
  '/profile', '/profile.html',
  '/boards', '/boards.html',
  '/payment', '/payment.html'
]);

function getAuthEntryIntent() {
  const params = new URLSearchParams(window.location.search);
  const src = (params.get('src') || '').toLowerCase();
  const tier = (params.get('tier') || '').toLowerCase();
  const hasTierIntent = tier === 'foundation' || tier === 'premium' || tier === 'elite';
  const explicitSigninSource = src.includes('signin') || src.includes('login');
  return { hasTierIntent, explicitSigninSource };
}

function isAuthRoute(pathname) {
  const normalized = (pathname || '/').replace(/\/+$/, '') || '/';
  return normalized === '/' ||
         normalized === '/auth' ||
         normalized === '/auth.html' ||
         normalized === '/index' ||
         normalized === '/index.html';
}

function getPostAuthRedirectUrl() {
  const params = new URLSearchParams(window.location.search);
  const nextRaw = (params.get('next') || '/dashboard').trim();
  const tier = (params.get('tier') || '').trim().toLowerCase();
  const src = (params.get('src') || '').trim();

  const safeNext = nextRaw.startsWith('/') ? nextRaw : '/dashboard';
  const nextUrl = new URL(safeNext, window.location.origin);
  const pathOnly = nextUrl.pathname.replace(/\/+$/, '') || '/';

  if (!AUTH_REDIRECT_ALLOWLIST.has(pathOnly)) {
    return '/dashboard';
  }

  if (tier) nextUrl.searchParams.set('tier', tier);
  if (src) nextUrl.searchParams.set('src', src);

  return `${nextUrl.pathname}${nextUrl.search}`;
}

// Toggle between login and signup
if (showSignupLink) {
  showSignupLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    signupForm.style.display = 'block';
    clearMessage();
  });
}

if (showLoginLink) {
  showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    signupForm.style.display = 'none';
    loginForm.style.display = 'block';
    clearMessage();
  });
}

// Entry UX: if user arrives from a signup CTA with tier intent, open signup form by default.
const entryIntent = getAuthEntryIntent();
if (entryIntent.hasTierIntent && !entryIntent.explicitSigninSource && loginForm && signupForm) {
  loginForm.style.display = 'none';
  signupForm.style.display = 'block';
}

// Forgot password
const forgotPasswordLink = document.getElementById('forgotPasswordLink');
if (forgotPasswordLink) {
  forgotPasswordLink.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    if (!email) {
      showMessage('Enter your email address above first, then click "Forgot password?"', 'error');
      return;
    }
    try {
      await auth.sendPasswordResetEmail(email);
      showMessage(`Password reset email sent to ${email}. Check your inbox (and spam folder).`, 'success');
    } catch (err) {
      console.error('Password reset error:', err);
      showMessage(getErrorMessage(err.code) || 'Could not send reset email. Check the address and try again.', 'error');
    }
  });
}

// Login Handler
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email      = document.getElementById('loginEmail').value.trim();
    const password   = document.getElementById('loginPassword').value;
    const rememberMeEl = document.getElementById('rememberMe');
    const rememberMe   = rememberMeEl ? rememberMeEl.checked : true;

    // Persist preference so firebase.js applies the right mode on next cold start
    localStorage.setItem('sbd_remember', rememberMe ? '1' : '0');
    
    if (!email || !password) {
      showMessage('Please fill in all fields', 'error');
      return;
    }
    
    showLoading(true);
    clearMessage();
    
    try {
      // LOCAL = survives browser restarts; SESSION = clears when tab closes
      const persistence = rememberMe
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION;
      await auth.setPersistence(persistence);

      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      console.log('Login successful:', userCredential.user.uid);
      
      showMessage('Login successful! Redirecting...', 'success');
      
      // Redirect using canonical contract (next/tier/src)
      setTimeout(() => {
        window.location.href = getPostAuthRedirectUrl();
      }, 1000);
      
    } catch (error) {
      console.error('Login error:', error);
      showMessage(getErrorMessage(error.code), 'error');
      showLoading(false);
    }
  });
}

// Signup Handler
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
    
    // Validation
    if (!name || !email || !password || !passwordConfirm) {
      showMessage('Please fill in all fields', 'error');
      return;
    }
    
    if (password !== passwordConfirm) {
      showMessage('Passwords do not match', 'error');
      return;
    }
    
    if (password.length < 6) {
      showMessage('Password must be at least 6 characters', 'error');
      return;
    }
    
    showLoading(true);
    clearMessage();
    
    try {
      // Create user account
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;
      
      console.log('Signup successful:', user.uid);
      
      // Optional: auto-enroll new free users into default free community groups
      let starterGroups = [];
      try {
        const defaultGroupsSnap = await db.collection('groups')
          .where('isDefaultFree', '==', true)
          .limit(3)
          .get();
        starterGroups = defaultGroupsSnap.docs.map(doc => doc.id);
      } catch (groupError) {
        console.warn('Default free groups lookup failed:', groupError);
      }

      // Create user document in Firestore
      await db.collection('users').doc(user.uid).set({
        uid: user.uid,
        name: name,
        email: email,
        tier: 'free',
        subscription: {
          tier: 'free',
          status: 'inactive'
        },
        role: 'member',
        groups: starterGroups,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastActive: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Update profile
      await user.updateProfile({
        displayName: name
      });
      
      showMessage('Account created! Redirecting...', 'success');
      
      // Redirect using canonical contract (next/tier/src)
      setTimeout(() => {
        window.location.href = getPostAuthRedirectUrl();
      }, 1000);
      
    } catch (error) {
      console.error('Signup error:', error);
      showMessage(getErrorMessage(error.code), 'error');
      showLoading(false);
    }
  });
}

// Helper: Show loading overlay
function showLoading(show) {
  if (loadingOverlay) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
  }
}

// Helper: Show message
function showMessage(message, type) {
  if (authMessage) {
    authMessage.textContent = message;
    authMessage.className = `auth-message ${type}`;
    authMessage.style.display = 'block';
  }
}

// Helper: Clear message
function clearMessage() {
  if (authMessage) {
    authMessage.style.display = 'none';
    authMessage.textContent = '';
  }
}

// Helper: Get user-friendly error message
function getErrorMessage(errorCode) {
  const errorMessages = {
    'auth/invalid-email': 'Invalid email address',
    'auth/user-disabled': 'This account has been disabled',
    'auth/user-not-found': 'No account found with this email',
    'auth/wrong-password': 'Incorrect password. Please try again',
    'auth/invalid-login-credentials': 'Incorrect email or password. Please try again',
    'auth/invalid-credential': 'Incorrect email or password. Please try again',
    'auth/email-already-in-use': 'Email already in use',
    'auth/weak-password': 'Password is too weak',
    'auth/network-request-failed': 'Network error. Please check your connection',
    'auth/too-many-requests': 'Too many failed attempts. Please wait a few minutes or reset your password'
  };
  
  return errorMessages[errorCode] || 'An error occurred. Please try again';
}

// Check if already logged in
auth.onAuthStateChanged((user) => {
  if (user && isAuthRoute(window.location.pathname)) {
    // Already logged in on auth route, route with the same redirect contract
    window.location.href = getPostAuthRedirectUrl();
  }
});

// Logout function (global)
window.logout = async function() {
  try {
    await auth.signOut();
    window.location.href = '/auth';
  } catch (error) {
    console.error('Logout error:', error);
  }
};

console.log('Auth module loaded');
