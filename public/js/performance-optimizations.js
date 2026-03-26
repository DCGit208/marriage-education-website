/**
 * Performance Optimizations for Marriage Education
 * Speed improvements, lazy loading, and resource optimization
 */

// Defer non-critical CSS
function deferNonCriticalCSS() {
  const stylesheets = document.querySelectorAll('link[rel="stylesheet"][data-defer]');
  stylesheets.forEach(link => {
    link.media = 'print';
    link.onload = function() { this.media = 'all'; };
  });
}

// Preload critical resources
function preloadCriticalResources() {
  // Preload hero image if exists
  const heroImg = document.querySelector('.hero img, .hero-section img');
  if (heroImg && heroImg.dataset.src) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = heroImg.dataset.src;
    document.head.appendChild(link);
  }
}

// Lazy load images with IntersectionObserver
function setupLazyLoading() {
  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
        }
        
        if (img.dataset.srcset) {
          img.srcset = img.dataset.srcset;
          img.removeAttribute('data-srcset');
        }
        
        img.classList.add('loaded');
        observer.unobserve(img);
      }
    });
  }, {
    rootMargin: '50px 0px',
    threshold: 0.01
  });

  document.querySelectorAll('img[data-src], img[loading="lazy"]').forEach(img => {
    imageObserver.observe(img);
  });
}

// Defer iframe loading (for embedded videos, maps, etc.)
function setupIframeDeferral() {
  const iframeObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const iframe = entry.target;
        if (iframe.dataset.src) {
          iframe.src = iframe.dataset.src;
          iframe.removeAttribute('data-src');
        }
        observer.unobserve(iframe);
      }
    });
  });

  document.querySelectorAll('iframe[data-src]').forEach(iframe => {
    iframeObserver.observe(iframe);
  });
}

// Optimize font loading
function optimizeFontLoading() {
  if ('fonts' in document) {
    // Preload key fonts
    const fontPreloads = [
      { family: 'Inter', weight: '400' },
      { family: 'Inter', weight: '600' },
      { family: 'Playfair Display', weight: '500' }
    ];

    fontPreloads.forEach(font => {
      document.fonts.load(`${font.weight} 1em ${font.family}`).catch(() => {
        console.warn(`Failed to preload font: ${font.family}`);
      });
    });
  }
}

// Minify inline scripts dynamically (remove console.logs in production)
function cleanupProductionCode() {
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    console.log = function() {};
    console.debug = function() {};
  }
}

// Cache Firebase config for faster subsequent loads
function cacheFirebaseConfig() {
  if (typeof firebase !== 'undefined' && localStorage) {
    try {
      const configKey = 'fb_config_cache';
      const cachedConfig = localStorage.getItem(configKey);
      
      if (!cachedConfig) {
        // Store timestamp to invalidate after 24 hours
        const cacheData = {
          timestamp: Date.now(),
          config: firebase.app().options
        };
        localStorage.setItem(configKey, JSON.stringify(cacheData));
      } else {
        const data = JSON.parse(cachedConfig);
        const hoursSinceCache = (Date.now() - data.timestamp) / (1000 * 60 * 60);
        
        if (hoursSinceCache > 24) {
          localStorage.removeItem(configKey);
        }
      }
    } catch (e) {
      console.warn('Firebase config caching failed:', e);
    }
  }
}

// Implement service worker for offline caching (progressive web app)
function registerServiceWorker() {
  if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('Service Worker registered:', registration.scope);
        })
        .catch(error => {
          console.warn('Service Worker registration failed:', error);
        });
    });
  }
}

// Optimize Firestore queries with caching
function setupFirestoreCache() {
  if (typeof firebase !== 'undefined' && firebase.firestore) {
    try {
      firebase.firestore().enablePersistence({ synchronizeTabs: true })
        .catch(err => {
          if (err.code === 'failed-precondition') {
            console.warn('Firestore persistence failed: Multiple tabs open');
          } else if (err.code === 'unimplemented') {
            console.warn('Firestore persistence not available');
          }
        });
    } catch (e) {
      console.warn('Firestore caching setup failed:', e);
    }
  }
}

// Reduce layout shifts by reserving space for images
function preventLayoutShifts() {
  document.querySelectorAll('img:not([width]):not([height])').forEach(img => {
    if (!img.style.aspectRatio) {
      img.addEventListener('load', function() {
        const aspectRatio = this.naturalWidth / this.naturalHeight;
        this.style.aspectRatio = aspectRatio;
      }, { once: true });
    }
  });
}

// Implement request idle callback for non-critical tasks
function scheduleNonCriticalTasks(callback) {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(callback, { timeout: 2000 });
  } else {
    setTimeout(callback, 1);
  }
}

// Resource hints for next page navigation
function preloadNextPage() {
  // Preload likely next pages
  const links = {
    'index.html': ['shop.html', 'courses.html', 'ambassador-login.html'],
    'shop.html': ['index.html', 'courses.html'],
    'courses.html': ['shop.html', 'ambassador-login.html'],
    'ambassador-login.html': ['ambassador/dashboard.html']
  };

  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const nextPages = links[currentPage] || [];

  nextPages.forEach(page => {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = page;
    document.head.appendChild(link);
  });
}

// Compress and optimize localStorage usage
function cleanupLocalStorage() {
  if (!localStorage) return;
  
  try {
    // Remove old cached data (> 7 days)
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('temp_') || key.startsWith('cache_')) {
        try {
          const item = JSON.parse(localStorage.getItem(key));
          if (item.timestamp) {
            const daysSince = (Date.now() - item.timestamp) / (1000 * 60 * 60 * 24);
            if (daysSince > 7) {
              localStorage.removeItem(key);
            }
          }
        } catch (e) {
          // Invalid JSON, remove it
          localStorage.removeItem(key);
        }
      }
    });
  } catch (e) {
    console.warn('localStorage cleanup failed:', e);
  }
}

// Critical CSS extraction (inline critical CSS, defer rest)
function extractCriticalCSS() {
  // This would typically be done at build time
  // For runtime, we ensure critical styles are inline in <head>
  const criticalSelectors = [
    'header', 'nav', '.hero', '.hero-section', 
    'h1', 'h2', '.cta-button', '.campaign-banner'
  ];
  
  // Mark non-critical stylesheets
  document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
    if (!link.hasAttribute('data-critical')) {
      link.setAttribute('data-defer', 'true');
    }
  });
}

// Initialize all optimizations
function initializePerformanceOptimizations() {
  // Immediate optimizations
  cleanupProductionCode();
  extractCriticalCSS();
  deferNonCriticalCSS();
  preloadCriticalResources();
  optimizeFontLoading();
  
  // After DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    setupLazyLoading();
    setupIframeDeferral();
    preventLayoutShifts();
    
    // Non-critical tasks
    scheduleNonCriticalTasks(() => {
      cacheFirebaseConfig();
      setupFirestoreCache();
      preloadNextPage();
      cleanupLocalStorage();
    });
  });
  
  // After page load
  window.addEventListener('load', () => {
    registerServiceWorker();
  });
}

// Auto-initialize
initializePerformanceOptimizations();

// Export for external use
if (typeof window !== 'undefined') {
  window.PerformanceOptimizations = {
    setupLazyLoading,
    cacheFirebaseConfig,
    cleanupLocalStorage
  };
}
