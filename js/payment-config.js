// Payment Gateway Configuration
// Replace with your actual API keys

const PAYMENT_CONFIG = {
    // Stripe Configuration
    stripe: {
        publicKey: 'pk_test_YOUR_STRIPE_PUBLIC_KEY_HERE',
        enabled: true
    },
    
    // Paystack Configuration
    paystack: {
        publicKey: 'pk_test_YOUR_PAYSTACK_PUBLIC_KEY_HERE',
        enabled: true
    },
    
    // Flutterwave Configuration
    flutterwave: {
        publicKey: 'FLWPUBK_TEST-YOUR_FLUTTERWAVE_PUBLIC_KEY_HERE',
        enabled: true
    },
    
    // Book Price
    bookPrice: 15000, // FCFA
    
    // Currency
    currency: 'XAF' // West African CFA Franc
};

// Export for use in other files
window.PAYMENT_CONFIG = PAYMENT_CONFIG;
