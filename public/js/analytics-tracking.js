/**
 * Analytics and Conversion Tracking
 * Setup Google Analytics, tag events, and track conversions
 */

// Google Analytics 4 Configuration
// Replace 'G-XXXXXXXXXX' with your actual GA4 Measurement ID
const GA4_MEASUREMENT_ID = 'G-XXXXXXXXXX'; // TODO: Add your GA4 ID

// Initialize Google Analytics
function initializeGA4() {
  if (GA4_MEASUREMENT_ID !== 'G-XXXXXXXXXX') {
    // Load gtag.js
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;
    document.head.appendChild(script);

    // Initialize dataLayer and gtag
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA4_MEASUREMENT_ID, {
      'send_page_view': true,
      'cookie_flags': 'SameSite=None;Secure'
    });
  }
}

// Track custom events
function trackEvent(eventName, eventParams = {}) {
  if (typeof gtag !== 'undefined') {
    gtag('event', eventName, eventParams);
  }
  console.log('Event tracked:', eventName, eventParams);
}

// Track conversions
function trackConversion(conversionType, value = 0) {
  trackEvent('conversion', {
    'conversion_type': conversionType,
    'value': value,
    'currency': 'XAF'
  });
}

// Track outbound links
function trackOutboundLink(url, label) {
  trackEvent('click', {
    'event_category': 'outbound',
    'event_label': label,
    'value': url
  });
}

// Track form submissions
function setupFormTracking() {
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', function(e) {
      const formId = this.id || this.name || 'unknown_form';
      trackEvent('form_submit', {
        'form_id': formId,
        'form_action': this.action
      });
    });
  });
}

// Track button clicks (CTA tracking)
function setupCTATracking() {
  document.querySelectorAll('a[href*="shop"], a[href*="course"], button.cta, a.cta-button').forEach(element => {
    element.addEventListener('click', function() {
      const label = this.textContent.trim() || this.getAttribute('aria-label') || 'Unknown CTA';
      trackEvent('cta_click', {
        'cta_label': label,
        'cta_url': this.href || this.getAttribute('data-url')
      });
    });
  });
}

// Track scroll depth
let maxScroll = 0;
function trackScrollDepth() {
  const scrollPercentage = Math.round((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100);
  
  if (scrollPercentage > maxScroll) {
    maxScroll = scrollPercentage;
    
    // Track at 25%, 50%, 75%, 100%
    if ([25, 50, 75, 100].includes(scrollPercentage)) {
      trackEvent('scroll', {
        'percent_scrolled': scrollPercentage
      });
    }
  }
}

// Track time on page
let pageStartTime = Date.now();
function trackTimeOnPage() {
  const timeSpent = Math.round((Date.now() - pageStartTime) / 1000); // seconds
  
  if (timeSpent > 30) { // More than 30 seconds = engaged
    trackEvent('engaged_user', {
      'time_on_page': timeSpent
    });
  }
}

// Track video interactions (if you add videos)
function setupVideoTracking() {
  document.querySelectorAll('video').forEach(video => {
    video.addEventListener('play', () => trackEvent('video_play', {'video_title': video.title || 'Unknown'}));
    video.addEventListener('ended', () => trackEvent('video_complete', {'video_title': video.title || 'Unknown'}));
  });
}

// Track product views (for shop page)
function trackProductView(productName, productPrice) {
  trackEvent('view_item', {
    'items': [{
      'item_name': productName,
      'price': productPrice,
      'currency': 'XAF'
    }]
  });
}

// Track add to cart (if you implement shopping cart)
function trackAddToCart(productName, productPrice, quantity = 1) {
  trackEvent('add_to_cart', {
    'items': [{
      'item_name': productName,
      'price': productPrice,
      'quantity': quantity,
      'currency': 'XAF'
    }],
    'value': productPrice * quantity
  });
}

// Track purchases
function trackPurchase(transactionId, value, items) {
  trackEvent('purchase', {
    'transaction_id': transactionId,
    'value': value,
    'currency': 'XAF',
    'items': items
  });
  
  // Also track conversion
  trackConversion('purchase', value);
}

// Track ambassador registrations
function trackAmbassadorRegistration() {
  trackEvent('generate_lead', {
    'lead_type': 'ambassador_registration'
  });
  trackConversion('ambassador_signup', 0);
}

// Track course enrollments
function trackCourseEnrollment(courseName, coursePrice) {
  trackEvent('begin_checkout', {
    'items': [{
      'item_name': courseName,
      'item_category': 'course',
      'price': coursePrice,
      'currency': 'XAF'
    }]
  });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initializeGA4();
  setupFormTracking();
  setupCTATracking();
  setupVideoTracking();
  
  // Track scroll depth
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(trackScrollDepth, 100);
  });
  
  // Track time on page when user leaves
  window.addEventListener('beforeunload', trackTimeOnPage);
  
  // Track visibility changes (tab switches)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      trackTimeOnPage();
    }
  });
});

// Export functions for external use
if (typeof window !== 'undefined') {
  window.MarriageEducationTracking = {
    trackEvent,
    trackConversion,
    trackOutboundLink,
    trackProductView,
    trackAddToCart,
    trackPurchase,
    trackAmbassadorRegistration,
    trackCourseEnrollment
  };
}
