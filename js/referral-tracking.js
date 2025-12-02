/**
 * Referral Tracking System for Ambassador Program
 * Captures referral codes from URL and stores for attribution
 */

(function() {
    'use strict';

    const REFERRAL_STORAGE_KEY = 'ambassadorReferralCode';
    const REFERRAL_EXPIRY_KEY = 'ambassadorReferralExpiry';
    const ATTRIBUTION_DAYS = 30; // 30-day attribution window

    /**
     * Get URL parameter by name
     */
    function getUrlParameter(name) {
        name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
        const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
        const results = regex.exec(window.location.search);
        return results === null ? null : decodeURIComponent(results[1].replace(/\+/g, ' '));
    }

    /**
     * Store referral code with expiry timestamp
     */
    function storeReferralCode(code) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + ATTRIBUTION_DAYS);
        
        localStorage.setItem(REFERRAL_STORAGE_KEY, code);
        localStorage.setItem(REFERRAL_EXPIRY_KEY, expiryDate.getTime());
        
        console.log(`Referral code stored: ${code} (expires: ${expiryDate.toLocaleDateString()})`);
    }

    /**
     * Get stored referral code if not expired
     */
    function getStoredReferralCode() {
        const code = localStorage.getItem(REFERRAL_STORAGE_KEY);
        const expiry = localStorage.getItem(REFERRAL_EXPIRY_KEY);
        
        if (!code || !expiry) {
            return null;
        }
        
        const now = new Date().getTime();
        if (now > parseInt(expiry)) {
            // Expired - clear storage
            clearReferralCode();
            return null;
        }
        
        return code;
    }

    /**
     * Clear referral code from storage
     */
    function clearReferralCode() {
        localStorage.removeItem(REFERRAL_STORAGE_KEY);
        localStorage.removeItem(REFERRAL_EXPIRY_KEY);
    }

    /**
     * Initialize referral tracking on page load
     */
    function initReferralTracking() {
        // Check if URL has ref parameter
        const urlRef = getUrlParameter('ref');
        
        if (urlRef) {
            // New referral code from URL - store it
            storeReferralCode(urlRef);
            
            // Optional: Show notification to user
            showReferralNotification(urlRef);
        }
        
        // Get current referral code (from URL or storage)
        const currentRef = urlRef || getStoredReferralCode();
        
        if (currentRef) {
            // Add referral code to all payment links
            attachReferralToLinks(currentRef);
            
            // Display referral info if on payment page
            if (window.location.pathname.includes('payment')) {
                displayReferralInfo(currentRef);
            }
        }
    }

    /**
     * Show notification that referral was captured
     */
    function showReferralNotification(code) {
        // Extract ambassador name from code (e.g., AMB-JOHN-001 -> JOHN)
        const match = code.match(/AMB-([A-Z]+)-/i);
        const ambassadorName = match ? match[1] : 'an ambassador';
        
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #00b894 0%, #00a085 100%);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 10000;
            animation: slideIn 0.4s ease-out;
            max-width: 300px;
            font-family: 'Inter', sans-serif;
        `;
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <i class="fas fa-user-check" style="font-size: 1.5rem;"></i>
                <div>
                    <div style="font-weight: 600; margin-bottom: 0.25rem;">Ambassador Link Detected</div>
                    <div style="font-size: 0.9rem; opacity: 0.9;">Referred by: ${ambassadorName}</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Add animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(400px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        
        // Remove after 5 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.4s ease-out';
            notification.style.cssText += 'animation: slideOut 0.4s ease-out;';
            setTimeout(() => notification.remove(), 400);
        }, 5000);
    }

    /**
     * Attach referral code to all payment links
     */
    function attachReferralToLinks(refCode) {
        const paymentLinks = document.querySelectorAll('a[href*="payment.html"]');
        
        paymentLinks.forEach(link => {
            const url = new URL(link.href, window.location.origin);
            url.searchParams.set('ref', refCode);
            link.href = url.toString();
        });
        
        console.log(`Referral code ${refCode} attached to ${paymentLinks.length} payment links`);
    }

    /**
     * Display referral info on payment page
     */
    function displayReferralInfo(refCode) {
        // Find order summary section
        const orderSummary = document.querySelector('.order-summary') || document.querySelector('.payment-container');
        
        if (!orderSummary) return;
        
        // Extract ambassador name
        const match = refCode.match(/AMB-([A-Z]+)-(\d+)/i);
        const ambassadorName = match ? match[1] : 'Ambassador';
        const ambassadorId = match ? match[2] : '---';
        
        // Create referral display element
        const refDisplay = document.createElement('div');
        refDisplay.style.cssText = `
            background: rgba(0, 184, 148, 0.1);
            border: 2px solid #00b894;
            border-radius: 8px;
            padding: 1rem;
            margin-top: 1rem;
            font-family: 'Inter', sans-serif;
        `;
        refDisplay.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.75rem; color: #2d3436;">
                <i class="fas fa-user-tie" style="font-size: 1.5rem; color: #00b894;"></i>
                <div>
                    <div style="font-weight: 600; color: #00b894; margin-bottom: 0.25rem;">Ambassador Referral</div>
                    <div style="font-size: 0.9rem;">Referred by: <strong>${ambassadorName}</strong> (ID: ${ambassadorId})</div>
                    <div style="font-size: 0.85rem; color: #636e72; margin-top: 0.25rem;">This purchase will be credited to their account</div>
                </div>
            </div>
        `;
        
        // Insert after order items
        const orderItems = orderSummary.querySelector('.order-item:last-of-type');
        if (orderItems) {
            orderItems.parentNode.insertBefore(refDisplay, orderItems.nextSibling);
        } else {
            orderSummary.appendChild(refDisplay);
        }
    }

    /**
     * Get referral code for form submission
     * Call this when submitting payment form
     */
    window.getReferralCode = function() {
        return getStoredReferralCode();
    };

    /**
     * Validate referral code format
     */
    window.validateReferralCode = function(code) {
        // Expected format: AMB-NAME-XXX
        const pattern = /^AMB-[A-Z]+-\d{3}$/i;
        return pattern.test(code);
    };

    /**
     * Generate referral link for a given code
     */
    window.generateReferralLink = function(code) {
        const baseUrl = window.location.origin;
        return `${baseUrl}/sbd-campaign.html?ref=${encodeURIComponent(code)}`;
    };

    // Initialize on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initReferralTracking);
    } else {
        initReferralTracking();
    }

})();
