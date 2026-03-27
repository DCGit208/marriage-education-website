// install-prompt.js — Custom PWA install banner
(function () {
  var DISMISS_KEY = 'pwa_install_dismissed';
  var DISMISS_DAYS = 7;
  var deferredPrompt = null;

  function wasDismissed() {
    var ts = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
    return ts && (Date.now() - ts) < DISMISS_DAYS * 864e5;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (wasDismissed()) return;
    showBanner();
  });

  function showBanner() {
    if (document.getElementById('pwa-install-banner')) return;
    var banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.innerHTML =
      '<span class="pwa-install-icon">📲</span>' +
      '<span class="pwa-install-text">Install SBD Network for faster access</span>' +
      '<button class="pwa-install-btn" id="pwa-install-ok">Install</button>' +
      '<button class="pwa-install-close" id="pwa-install-no" aria-label="Dismiss">✕</button>';
    document.body.appendChild(banner);

    // Animate in
    requestAnimationFrame(function () { banner.classList.add('pwa-banner-show'); });

    document.getElementById('pwa-install-ok').addEventListener('click', function () {
      hideBanner(false);
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function () { deferredPrompt = null; });
      }
    });

    document.getElementById('pwa-install-no').addEventListener('click', function () {
      hideBanner(true);
    });
  }

  function hideBanner(dismiss) {
    var banner = document.getElementById('pwa-install-banner');
    if (!banner) return;
    if (dismiss) localStorage.setItem(DISMISS_KEY, Date.now().toString());
    banner.classList.remove('pwa-banner-show');
    setTimeout(function () { banner.remove(); }, 300);
  }
}());
