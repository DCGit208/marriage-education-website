// ================================================================
// SERVICE WORKER UPDATE CHECKER
// Shows notification when new version is available
// ================================================================

(function() {
  // ── Self-heal: fetch /version.json directly from the network (bypassing all
  // caches) so we ALWAYS compare against the latest deployed version, even when
  // iOS has cached the HTML with an old build-version meta tag.
  function _nukeAndReload() {
    const go = () => caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => window.location.reload(true));
    if (navigator.serviceWorker) {
      navigator.serviceWorker.getRegistrations()
        .then(regs => Promise.all(regs.map(r => r.unregister())))
        .then(go).catch(go);
    } else { go(); }
  }

  function _checkVersionFromNetwork() {
    fetch('/version.json?_=' + Date.now(), { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || !data.version) return;
        const fresh  = String(data.version);
        const stored = localStorage.getItem('sbd-build-version');
        if (!stored) {
          localStorage.setItem('sbd-build-version', fresh);
          // If SW already controlling, nuke so we start clean
          if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            console.log('[SW] First run — nuking stale cache…');
            _nukeAndReload();
          }
          return;
        }
        if (stored === fresh) return;
        console.log('[SW] Version changed', stored, '→', fresh, '. Force-updating…');
        localStorage.setItem('sbd-build-version', fresh);
        _nukeAndReload();
      })
      .catch(() => { /* offline — skip */ });
  }

  // Run on load and every time the PWA comes to foreground
  _checkVersionFromNetwork();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _checkVersionFromNetwork();
  });

  if (!('serviceWorker' in navigator)) return;

  let updateAvailable = false;
  let newWorker = null;

  // Show update notification
  function showUpdateNotification() {
    // Create update banner
    const banner = document.createElement('div');
    banner.id = 'updateBanner';
    banner.innerHTML = `
      <div style="position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#00bcd4;color:#000;padding:14px 20px;border-radius:12px;box-shadow:0 4px 20px rgba(0,188,212,0.4);z-index:10000;max-width:90%;display:flex;align-items:center;gap:12px;font-size:0.9rem;font-weight:600;animation:slideUp 0.3s ease;">
        <span>🎉 New version available!</span>
        <button id="updateNowBtn" style="background:#000;color:#00bcd4;border:none;padding:8px 16px;border-radius:8px;font-size:0.85rem;font-weight:700;cursor:pointer;font-family:inherit;">Update Now</button>
        <button id="updateLaterBtn" style="background:transparent;border:none;color:#000;font-size:1.2rem;cursor:pointer;padding:4px;line-height:1;" title="Later">✕</button>
      </div>
    `;
    
    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideUp {
        from { transform: translateX(-50%) translateY(100px); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(banner);

    // Update now button
    document.getElementById('updateNowBtn').addEventListener('click', () => {
      if (newWorker) {
        newWorker.postMessage({ type: 'SKIP_WAITING' });
      }
      window.location.reload();
    });

    // Dismiss button
    document.getElementById('updateLaterBtn').addEventListener('click', () => {
      banner.remove();
      // Show again in 5 minutes
      setTimeout(showUpdateNotification, 5 * 60 * 1000);
    });
  }

  // Register service worker
  navigator.serviceWorker.register('/service-worker.js')
    .then(registration => {
      console.log('[SW] Registered successfully');

      // Check for updates every 30 seconds
      setInterval(() => {
        registration.update();
      }, 30000);

      // ALSO check immediately when the user switches back to the PWA
      // (critical for iOS: home screen → switch app → come back)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update();
        }
      });
      window.addEventListener('focus', () => registration.update());

      // Listen for new service worker installing
      registration.addEventListener('updatefound', () => {
        newWorker = registration.installing;
        console.log('[SW] New version found, installing...');

        // Set flag EARLY — before statechange — so controllerchange fires
        // reliably on iOS PWA (avoids race: SW skipWaiting() can fire
        // controllerchange before statechange reaches 'installed').
        if (navigator.serviceWorker.controller) {
          updateAvailable = true;
        }

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // New version available — show banner for manual update option
              console.log('[SW] New version installed, ready to activate');
              showUpdateNotification();
            } else {
              // First install
              console.log('[SW] Service worker installed for the first time');
            }
          }
        });
      });
    })
    .catch(err => {
      console.warn('[SW] Registration failed:', err);
    });

  // Listen for controller change (when new SW activates).
  // Always reload — controllerchange only fires when a genuinely new SW takes
  // control. Removing the updateAvailable guard eliminates the race condition
  // where controllerchange fires before updatefound sets the flag.
  let _reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_reloading) return;
    _reloading = true;
    console.log('[SW] New version activated, reloading…');
    window.location.reload();
  });

  // Message handler — SW can trigger an immediate reload
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'SKIP_WAITING') {
      if (newWorker) newWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    // SW_UPDATED fires when a new SW has activated and claimed this client.
    // Reload immediately so the page runs the latest code.
    if (event.data.type === 'SW_UPDATED') {
      window.location.reload();
    }
  });
})();
