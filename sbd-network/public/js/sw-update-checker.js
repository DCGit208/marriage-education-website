// ================================================================
// SERVICE WORKER UPDATE CHECKER
// Shows notification when new version is available
// ================================================================

(function() {
  // ── Self-heal: fetch /version.json directly from the network (bypassing all
  // caches) so we ALWAYS compare against the latest deployed version, even when
  // iOS has cached the HTML with an old build-version meta tag.
  let _nuking = false;
  function _nukeAndReload() {
    if (_nuking) return;
    _nuking = true;
    const go = () => caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => window.location.reload());
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
          return;
        }
        if (stored === fresh) return;
        console.log('[SW] Version changed', stored, '→', fresh, '. Force-updating…');
        localStorage.setItem('sbd-build-version', fresh);
        _nukeAndReload();
      })
      .catch(() => { /* offline — skip */ });
  }

  // Run on load and when returning to foreground (debounced — iOS fires visibility often)
  let _versionCheckTimer = null;
  function scheduleVersionCheck() {
    clearTimeout(_versionCheckTimer);
    _versionCheckTimer = setTimeout(_checkVersionFromNetwork, 600);
  }
  scheduleVersionCheck();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleVersionCheck();
  });

  if (!('serviceWorker' in navigator)) return;

  let updateAvailable = false;
  let newWorker = null;
  let _updating = false;

  function safeUpdate(registration) {
    if (!registration || _updating) return;
    _updating = true;
    registration.update()
      .catch((err) => {
        // Benign during deploys, offline, or when _nukeAndReload unregisters mid-flight
        console.warn('[SW] Update check failed (non-fatal):', err?.message || err);
      })
      .finally(() => { _updating = false; });
  }

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

  // Attach to existing registration (firebase.js registers on every page)
  const attachToRegistration = (registration) => {
    if (!registration) return;
    console.log('[SW] Update checker attached');

    setInterval(() => safeUpdate(registration), 60000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') safeUpdate(registration);
    });
    window.addEventListener('focus', () => safeUpdate(registration));

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
  };

  navigator.serviceWorker.ready
    .then(() => navigator.serviceWorker.getRegistration('/'))
    .then((registration) => {
      if (registration) {
        attachToRegistration(registration);
        return;
      }
      return navigator.serviceWorker.register('/service-worker.js', {
        scope: '/',
        updateViaCache: 'none',
      }).then((reg) => {
        console.log('[SW] Registered successfully (fallback)');
        attachToRegistration(reg);
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
