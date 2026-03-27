// offline.js — Offline / Online detection banner for SBD Network
(function () {
  var banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.innerHTML =
    '<span class="offline-dot"></span>' +
    '<span>No connection \u2014 you\'re offline</span>';
  document.body.appendChild(banner);

  function showOffline() {
    banner.className = 'show';
    banner.innerHTML =
      '<span class="offline-dot"></span>' +
      '<span>No connection \u2014 you\'re offline</span>';
  }

  function showOnline() {
    banner.className = 'show online';
    banner.innerHTML = '<span>\u2713 Back online</span>';
    setTimeout(function () {
      banner.className = '';
    }, 2400);
  }

  window.addEventListener('offline', showOffline);
  window.addEventListener('online',  showOnline);

  // Check on init
  if (!navigator.onLine) showOffline();
}());
