// ================================================================
// AUTH GUARD - Ensures user is authenticated before dashboard loads
// ================================================================

(function() {
  // Show loading screen immediately
  document.body.style.opacity = '0.3';
  document.body.style.pointerEvents = 'none';
  
  // Wait for Firebase to be ready
  const checkAuth = () => {
    if (typeof firebase === 'undefined' || typeof auth === 'undefined') {
      // Firebase not loaded yet, wait
      setTimeout(checkAuth, 100);
      return;
    }
    
    // Firebase loaded, now check auth state
    let authChecked = false;
    const timeout = setTimeout(() => {
      if (!authChecked) {
        console.warn('[Auth Guard] Timeout waiting for auth, redirecting to login');
        window.location.href = '/index.html';
      }
    }, 5000);
    
    auth.onAuthStateChanged((user) => {
      authChecked = true;
      clearTimeout(timeout);
      
      if (!user) {
        // Not authenticated, redirect
        window.location.href = '/index.html';
      } else {
        // Authenticated, show page
        document.body.style.opacity = '';
        document.body.style.pointerEvents = '';
      }
    });
  };
  
  checkAuth();
})();
