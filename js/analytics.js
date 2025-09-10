// Google Analytics 4 Integration
// Enhanced tracking for e-commerce, events, and conversions

class Analytics {
    constructor(measurementId) {
        this.measurementId = measurementId;
        this.gtag = null;
        this.initializeGA4();
    }

    // Initialize Google Analytics 4
    initializeGA4() {
        // Load GA4 script
        const script1 = document.createElement('script');
        script1.async = true;
        script1.src = `https://www.googletagmanager.com/gtag/js?id=${this.measurementId}`;
        document.head.appendChild(script1);

        // Initialize gtag
        window.dataLayer = window.dataLayer || [];
        window.gtag = function() {
            dataLayer.push(arguments);
        };
        
        this.gtag = window.gtag;
        this.gtag('js', new Date());
        this.gtag('config', this.measurementId, {
            send_page_view: false // We'll send manually for better control
        });

        // Send initial page view
        this.trackPageView();
    }

    // Track page views
    trackPageView(pageName = null) {
        const page = pageName || document.title;
        this.gtag('event', 'page_view', {
            page_title: page,
            page_location: window.location.href,
            page_path: window.location.pathname
        });
    }

    // Track product purchases
    trackPurchase(transactionId, items, value, currency = 'USD') {
        this.gtag('event', 'purchase', {
            transaction_id: transactionId,
            value: value,
            currency: currency,
            items: items
        });
    }

    // Track course enrollments
    trackEnrollment(courseName, courseId, value, currency = 'USD') {
        this.gtag('event', 'purchase', {
            transaction_id: `course_${Date.now()}`,
            value: value,
            currency: currency,
            items: [{
                item_id: courseId,
                item_name: courseName,
                item_category: 'Course',
                quantity: 1,
                price: value
            }]
        });

        // Also track as a custom conversion
        this.gtag('event', 'course_enrollment', {
            course_name: courseName,
            course_id: courseId,
            value: value,
            currency: currency
        });
    }

    // Track email signups
    trackEmailSignup(source, listType = 'newsletter') {
        this.gtag('event', 'sign_up', {
            method: 'email',
            source: source,
            list_type: listType
        });
    }

    // Track video engagement
    trackVideoEngagement(videoTitle, action, progress = null) {
        this.gtag('event', 'video_engagement', {
            video_title: videoTitle,
            action: action, // 'play', 'pause', 'complete', 'progress'
            progress: progress
        });
    }

    // Track download events
    trackDownload(fileName, fileType, source) {
        this.gtag('event', 'file_download', {
            file_name: fileName,
            file_type: fileType,
            source: source
        });
    }

    // Track contact form submissions
    trackContactForm(formType, source) {
        this.gtag('event', 'form_submit', {
            form_type: formType,
            source: source
        });
    }

    // Track button clicks
    trackButtonClick(buttonText, buttonLocation, destination = null) {
        this.gtag('event', 'click', {
            button_text: buttonText,
            button_location: buttonLocation,
            destination: destination
        });
    }

    // Track scroll depth
    trackScrollDepth(percentage) {
        this.gtag('event', 'scroll', {
            percent_scrolled: percentage
        });
    }

    // Track time on page
    trackTimeOnPage(seconds) {
        this.gtag('event', 'timing_complete', {
            name: 'page_engagement',
            value: Math.round(seconds * 1000), // GA4 expects milliseconds
        });
    }

    // Track search queries
    trackSearch(searchTerm, resultCount = null) {
        this.gtag('event', 'search', {
            search_term: searchTerm,
            result_count: resultCount
        });
    }

    // Enhanced E-commerce tracking
    trackAddToCart(item) {
        this.gtag('event', 'add_to_cart', {
            currency: 'USD',
            value: item.price,
            items: [item]
        });
    }

    trackBeginCheckout(items, value) {
        this.gtag('event', 'begin_checkout', {
            currency: 'USD',
            value: value,
            items: items
        });
    }

    trackViewItem(item) {
        this.gtag('event', 'view_item', {
            currency: 'USD',
            value: item.price,
            items: [item]
        });
    }
}

// Conversion tracking setup
class ConversionTracking {
    constructor(analytics) {
        this.analytics = analytics;
        this.setupEventTracking();
        this.setupScrollTracking();
        this.setupTimeTracking();
    }

    setupEventTracking() {
        // Track all button clicks
        document.addEventListener('click', (e) => {
            if (e.target.matches('.cta-button, .buy-button, .cta-button-secondary')) {
                const buttonText = e.target.textContent.trim();
                const destination = e.target.href || e.target.getAttribute('data-destination');
                this.analytics.trackButtonClick(buttonText, 'main_content', destination);
            }

            // Track product view clicks
            if (e.target.matches('.product a, .product img')) {
                const productElement = e.target.closest('.product');
                const productName = productElement.querySelector('h4').textContent;
                this.analytics.trackViewItem({
                    item_id: productName.toLowerCase().replace(/\s+/g, '_'),
                    item_name: productName,
                    item_category: 'Product',
                    price: this.extractPrice(productElement)
                });
            }
        });

        // Track form submissions
        document.addEventListener('submit', (e) => {
            if (e.target.matches('.email-form')) {
                this.analytics.trackEmailSignup('lead_magnet');
            }
            
            if (e.target.matches('.contact form')) {
                this.analytics.trackContactForm('contact', 'contact_page');
            }
        });
    }

    setupScrollTracking() {
        let scrollDepths = [25, 50, 75, 100];
        let trackedDepths = new Set();

        window.addEventListener('scroll', () => {
            const scrollPercent = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
            
            scrollDepths.forEach(depth => {
                if (scrollPercent >= depth && !trackedDepths.has(depth)) {
                    this.analytics.trackScrollDepth(depth);
                    trackedDepths.add(depth);
                }
            });
        });
    }

    setupTimeTracking() {
        const startTime = Date.now();
        
        // Track time on page when user leaves
        window.addEventListener('beforeunload', () => {
            const timeSpent = (Date.now() - startTime) / 1000;
            if (timeSpent > 10) { // Only track if user spent more than 10 seconds
                this.analytics.trackTimeOnPage(timeSpent);
            }
        });
    }

    extractPrice(productElement) {
        const priceElement = productElement.querySelector('.price');
        if (priceElement) {
            const priceText = priceElement.textContent;
            const price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
            return isNaN(price) ? 0 : price;
        }
        return 0;
    }
}

// Initialize analytics when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Replace with your actual GA4 Measurement ID
    const analytics = new Analytics('G-XXXXXXXXXX');
    const conversionTracking = new ConversionTracking(analytics);
    
    // Make analytics available globally
    window.marriageEducationAnalytics = analytics;
    
    // Track initial page load
    analytics.trackPageView();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Analytics, ConversionTracking };
}
