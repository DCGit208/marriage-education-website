/**
 * ham-nav.js — Shared hamburger navigation
 * Handles: toggle open/close, admin visibility, logout
 * Used on all pages except dashboard.html (which has its own inline JS)
 */
(function () {
  const menuBtn      = document.getElementById('menuBtn');
  const menuOverlay  = document.getElementById('menuOverlay');
  const sideMenu     = document.getElementById('sideMenu');
  const logoutBtn    = document.getElementById('logoutMenuBtn');
  const adminSection = document.getElementById('adminSection');

  if (!menuBtn || !sideMenu) return;

  function openMenu() {
    sideMenu.classList.add('open');
    if (menuOverlay) menuOverlay.style.display = 'block';
  }
  function closeMenu() {
    sideMenu.classList.remove('open');
    if (menuOverlay) menuOverlay.style.display = 'none';
  }

  menuBtn.addEventListener('click', function () {
    sideMenu.classList.contains('open') ? closeMenu() : openMenu();
  });
  if (menuOverlay) menuOverlay.addEventListener('click', closeMenu);

  // Close on link click (smooth navigation)
  sideMenu.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', closeMenu);
  });

  // Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      closeMenu();
      if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().signOut()
          .then(function () { window.location.href = '/auth'; })
          .catch(function () { window.location.href = '/auth'; });
      } else {
        window.location.href = '/auth';
      }
    });
  }

  // Show admin panel link if user has admin role
  if (adminSection && typeof firebase !== 'undefined') {
    firebase.auth().onAuthStateChanged(function (user) {
      if (!user) return;
      firebase.firestore().collection('users').doc(user.uid).get()
        .then(function (doc) {
          if (doc.exists && doc.data().role === 'admin') {
            adminSection.style.display = 'block';
          }
        })
        .catch(function () {});
    });
  }
})();
