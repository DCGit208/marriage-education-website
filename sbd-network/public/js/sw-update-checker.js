// ================================================================
// SERVICE WORKER UPDATE CHECKER
// Shows notification when new version is available
// ================================================================

(function() {
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

  // Listen for controller change (when new SW activates)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateAvailable) {
      console.log('[SW] New version activated, reloading...');
      window.location.reload();
    }
  });

  // Message handler for SKIP_WAITING
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
      if (newWorker) {
        newWorker.postMessage({ type: 'SKIP_WAITING' });
      }
    }
  });
})();
