// Firebase Commission Processor
// Integrates with Cloud Functions processProductDeployment

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCoxtWEU_dBfGBs_x5Bde-_fLlwHcVLnzI",
    authDomain: "marriage-education.firebaseapp.com",
    projectId: "marriage-education",
    storageBucket: "marriage-education.firebasestorage.app",
    messagingSenderId: "746853352612",
    appId: "1:746853352612:web:7f65963f1e8f1c4e64dc9f"
};

// Initialize Firebase (only if not already initialized)
if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const functions = firebase.functions();

/**
 * Process commission for a product deployment
 * @param {Object} params - Commission parameters
 * @param {string} params.productId - Product ID from Firestore
 * @param {string} params.customerEmail - Customer email
 * @param {string} params.customerName - Customer name
 * @param {string} params.referralCode - Ambassador/Senior/RD code (format: AMB-*/SNR-*/RD-*)
 * @param {number} params.amount - Purchase amount (for validation)
 * @returns {Promise<Object>} Commission result
 */
async function processCommission(params) {
    try {
        console.log('🔄 Processing commission...', params);
        
        // Validate required fields
        if (!params.productId) {
            throw new Error('Missing productId');
        }
        if (!params.customerEmail) {
            throw new Error('Missing customerEmail');
        }
        if (!params.referralCode) {
            console.warn('⚠️ No referral code - commission will not be credited');
            return { success: false, message: 'No referral code provided' };
        }

        // Call Cloud Function
        const processProductDeployment = functions.httpsCallable('processProductDeployment');
        
        const result = await processProductDeployment({
            productId: params.productId,
            customerEmail: params.customerEmail,
            customerName: params.customerName || 'Customer',
            referralCode: params.referralCode
        });

        console.log('✅ Commission processed:', result.data);
        return result.data;
        
    } catch (error) {
        console.error('❌ Commission processing error:', error);
        throw error;
    }
}

/**
 * Extract referral code from URL or sessionStorage
 * @returns {string|null} Referral code (AMB-*/SNR-*/RD-*)
 */
function getReferralCode() {
    // Try URL parameters first
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    
    if (refCode) {
        console.log('📌 Referral code from URL:', refCode);
        return refCode;
    }
    
    // Fallback to sessionStorage
    const storedRef = sessionStorage.getItem('ambassador_ref');
    if (storedRef) {
        console.log('📌 Referral code from session:', storedRef);
        return storedRef;
    }
    
    console.warn('⚠️ No referral code found in URL or session');
    return null;
}

/**
 * Map product ID to Firestore product ID
 * @param {string} productId - Product identifier from Stripe/MoMo
 * @returns {string} Firestore product ID
 */
function mapProductId(productId) {
    // Product ID mapping (Stripe/website ID -> Firestore ID)
    const productMap = {
        'sbd-for-dummies': 'sex-by-design-dummies',
        'sbd-dummies': 'sex-by-design-dummies',
        'the-sex-by-design-compendium': 'sex-by-design-compendium',
        'sbd-compendium': 'sex-by-design-compendium',
        'foundation-school': 'marriage-foundation-school',
        'marriage-foundation-school': 'marriage-foundation-school',
        // Add more mappings as needed
    };
    
    return productMap[productId] || productId;
}
