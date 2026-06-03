/**
 * ham-nav.js — Shared hamburger drawer
 */
(function () {
  var menuBtn = document.getElementById('menuBtn');
  var menuOverlay = document.getElementById('menuOverlay');
  var sideMenu = document.getElementById('sideMenu');
  var closeBtn = document.getElementById('hamDrawerClose');
  var logoutBtn = document.getElementById('logoutMenuBtn');
  var adminSection = document.getElementById('adminSection');

  if (!menuBtn || !sideMenu) return;

  function openMenu() {
    sideMenu.classList.add('open');
    sideMenu.setAttribute('aria-hidden', 'false');
    menuBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('ham-drawer-open');
    if (menuOverlay) {
      menuOverlay.style.display = 'block';
      menuOverlay.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(function () {
        menuOverlay.style.opacity = '1';
      });
    }
  }

  function closeMenu() {
    sideMenu.classList.remove('open');
    sideMenu.setAttribute('aria-hidden', 'true');
    menuBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('ham-drawer-open');
    if (menuOverlay) {
      menuOverlay.style.opacity = '0';
      menuOverlay.setAttribute('aria-hidden', 'true');
      window.setTimeout(function () {
        if (!sideMenu.classList.contains('open')) {
          menuOverlay.style.display = 'none';
        }
      }, 260);
    }
  }

  menuBtn.addEventListener('click', function () {
    sideMenu.classList.contains('open') ? closeMenu() : openMenu();
  });
  if (closeBtn) closeBtn.addEventListener('click', closeMenu);
  if (menuOverlay) menuOverlay.addEventListener('click', closeMenu);

  sideMenu.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', closeMenu);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sideMenu.classList.contains('open')) closeMenu();
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      closeMenu();
      if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase
          .auth()
          .signOut()
          .then(function () {
            window.location.href = '/auth';
          })
          .catch(function () {
            window.location.href = '/auth';
          });
      } else {
        window.location.href = '/auth';
      }
    });
  }

  if (adminSection && typeof firebase !== 'undefined') {
    firebase.auth().onAuthStateChanged(function (user) {
      if (!user) return;
      firebase
        .firestore()
        .collection('users')
        .doc(user.uid)
        .get()
        .then(function (doc) {
          if (doc.exists && doc.data().role === 'admin') {
            adminSection.classList.add('is-visible');
            adminSection.style.display = 'flex';
          }
        })
        .catch(function () {});
    });
  }

  if (!window.__sbdLifeNavLoader) {
    window.__sbdLifeNavLoader = true;
    var navScript = document.createElement('script');
    navScript.src = '/js/sbd-life-nav.js?v=phase6';
    navScript.defer = true;
    document.body.appendChild(navScript);
  }
})();
