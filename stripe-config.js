// Stripe Configuration
// Replace YOUR_STRIPE_PUBLISHABLE_KEY_HERE with your actual Stripe publishable key

// STEP 1: Add your Stripe publishable key here
const STRIPE_PUBLISHABLE_KEY = 'pk_test_YOUR_KEY_HERE'; // Replace with your publishable key

// STEP 2: Add your webhook endpoint secret (for server-side processing)
const STRIPE_WEBHOOK_SECRET = 'whsec_YOUR_WEBHOOK_SECRET_HERE'; // Replace with your webhook secret

// STEP 3: Configure your success/cancel URLs
const PAYMENT_SUCCESS_URL = 'https://yourwebsite.com/payment-success.html';
const PAYMENT_CANCEL_URL = 'https://yourwebsite.com/payment.html';

// Export configuration
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        STRIPE_PUBLISHABLE_KEY,
        STRIPE_WEBHOOK_SECRET,
        PAYMENT_SUCCESS_URL,
        PAYMENT_CANCEL_URL
    };
}

/* 
QUICK SETUP INSTRUCTIONS:
1. Get your Stripe publishable key from: https://dashboard.stripe.com/apikeys
2. Replace 'pk_test_YOUR_KEY_HERE' above with your actual key
3. Replace the placeholder keys in payment.html:
   - Find 'YOUR_STRIPE_PUBLISHABLE_KEY_HERE' 
   - Replace with your actual publishable key
4. Test a payment to verify everything works!

SECURITY NOTE: 
- Publishable keys are safe to use in frontend code
- Never put your SECRET key in frontend code
- Keep your webhook secret secure for server-side use
*/