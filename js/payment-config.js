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
    
    // MTN Mobile Money Configuration (Collection Widget + API)
    mtnMomo: {
        // Collection Widget Key (for USSD/QR payments)
        subscriptionKey: '88e6592aa57d425280a3e55be6ddcac6',
        // Collections API Key (for programmatic payments)
        collectionsApiKey: '4455fd39957b48e281efde9612b55530',
        environment: 'sandbox', // 'sandbox' or 'production'
        merchantNumber: '237677604100', // Your MTN MOMO number to receive payments
        enabled: true,
        // Customers will use USSD (*126#) or MTN MoMo app to send money to your number
    },
    
    // Book Price
    bookPrice: 15000, // FCFA
    
    // Currency
    currency: 'XAF' // West African CFA Franc
};

// Export for use in other files
window.PAYMENT_CONFIG = PAYMENT_CONFIG;
