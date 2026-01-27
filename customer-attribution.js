/**
 * CUSTOMER ATTRIBUTION SYSTEM
 * 
 * Handles lifetime customer attribution across ALL products.
 * Once a customer is attributed to an ambassador, that attribution
 * NEVER changes—even if customer buys through different channels.
 * 
 * Features:
 * - 90-day cookie/localStorage tracking
 * - Permanent ambassador attribution on first purchase
 * - Multi-product purchase history
 * - Lifetime value calculation
 * - Commission attribution to full upline (Ambassador → Senior → RD)
 */

// ==================== CLIENT-SIDE: Referral Tracking ====================

/**
 * Track referral source from URL parameter
 * Format: ?ref=AMB-X-001 or ?ref=SNR-X-042 or ?ref=RD-X-005
 * 
 * Call this on EVERY product page load
 */
function trackReferral() {
  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref');
  
  if (refCode) {
    // Store in localStorage (90-day persistence)
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 90);
    
    const referralData = {
      code: refCode,
      timestamp: new Date().toISOString(),
      expires: expirationDate.toISOString(),
      page: window.location.pathname
    };
    
    localStorage.setItem('marriage_referral', JSON.stringify(referralData));
    
    // Also set cookie as backup
    document.cookie = `marriage_ref=${refCode}; expires=${expirationDate.toUTCString()}; path=/; SameSite=Lax`;
    
    console.log('✅ Referral tracked:', refCode);
  }
}

/**
 * Get current attribution source
 * Checks in order: URL param → localStorage → cookie
 */
function getAttributionSource() {
  // 1. Check URL parameter (highest priority)
  const urlParams = new URLSearchParams(window.location.search);
  const urlRef = urlParams.get('ref');
  if (urlRef) return urlRef;
  
  // 2. Check localStorage
  const stored = localStorage.getItem('marriage_referral');
  if (stored) {
    const data = JSON.parse(stored);
    const expires = new Date(data.expires);
    
    // Check if not expired
    if (expires > new Date()) {
      return data.code;
    } else {
      // Clean up expired data
      localStorage.removeItem('marriage_referral');
    }
  }
  
  // 3. Check cookie
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'marriage_ref') return value;
  }
  
  return null;
}

/**
 * Display attribution badge on page
 * Shows "You're exploring through Ambassador [Name]"
 */
function displayAttributionBadge() {
  const refCode = getAttributionSource();
  if (!refCode) return;
  
  // Extract ambassador type and ID
  const match = refCode.match(/(AMB|SNR|RD)-([A-Z])-(\d+)/);
  if (!match) return;
  
  const [, type, region, number] = match;
  const typeLabel = {
    'AMB': 'Marriage Literacy Ambassador',
    'SNR': 'Senior Ambassador',
    'RD': 'Regional Director'
  }[type];
  
  // Create badge HTML
  const badge = document.createElement('div');
  badge.className = 'attribution-badge';
  badge.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #D97706 0%, #B45309 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-family: 'Inter', sans-serif;
      font-size: 0.875rem;
      z-index: 1000;
      max-width: 300px;
    ">
      <div style="font-weight: 600; margin-bottom: 4px;">
        💍 Facilitated Pathway
      </div>
      <div style="opacity: 0.95;">
        Your advocate: ${typeLabel} ${region}-${number}
      </div>
    </div>
  `;
  
  document.body.appendChild(badge);
}

// Initialize on page load
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    trackReferral();
    displayAttributionBadge();
  });
}


// ==================== SERVER-SIDE: Customer Attribution ====================

/**
 * Firebase Cloud Function: Get or create customer with attribution
 * 
 * @param {string} customerEmail - Customer's email
 * @param {string} customerPhone - Customer's phone
 * @param {string} customerName - Customer's name
 * @param {string} refCode - Referral code (AMB-X-001)
 * @returns {object} Customer document with attribution
 */
async function getOrCreateCustomer(customerEmail, customerPhone, customerName, refCode) {
  const db = admin.firestore();
  
  // First, check if customer already exists
  const existingCustomer = await db.collection('customers')
    .where('email', '==', customerEmail)
    .limit(1)
    .get();
  
  if (!existingCustomer.empty) {
    // Customer exists - return with existing attribution
    const customerDoc = existingCustomer.docs[0];
    console.log('✅ Existing customer found:', customerDoc.id);
    return {
      id: customerDoc.id,
      ...customerDoc.data()
    };
  }
  
  // New customer - establish attribution
  console.log('🆕 New customer - establishing attribution...');
  
  // Parse referral code
  const attribution = await parseReferralCode(refCode);
  
  if (!attribution) {
    console.error('❌ Invalid referral code:', refCode);
    throw new Error('Invalid referral code');
  }
  
  // Create customer document with PERMANENT attribution
  const customerData = {
    email: customerEmail,
    phone: customerPhone || '',
    name: customerName,
    
    // PERMANENT ATTRIBUTION - never changes
    source_ambassador: attribution.ambassador_id,
    source_senior: attribution.senior_id || null,
    source_rd: attribution.rd_id || null,
    
    // Tracking data
    first_referral_code: refCode,
    first_touch_date: admin.firestore.FieldValue.serverTimestamp(),
    
    // Purchase history
    purchase_history: [],
    total_purchases: 0,
    lifetime_value: 0,
    
    // Commission totals (for reporting)
    total_commission_ambassador: 0,
    total_commission_senior: 0,
    total_commission_rd: 0,
    
    // Metadata
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  };
  
  const customerRef = await db.collection('customers').add(customerData);
  
  console.log('✅ Customer created with attribution:', {
    customer_id: customerRef.id,
    ambassador: attribution.ambassador_id,
    senior: attribution.senior_id,
    rd: attribution.rd_id
  });
  
  return {
    id: customerRef.id,
    ...customerData
  };
}

/**
 * Parse referral code and get full upline attribution
 * 
 * @param {string} refCode - e.g., "AMB-X-001" or "SNR-X-042"
 * @returns {object} - { ambassador_id, senior_id, rd_id }
 */
async function parseReferralCode(refCode) {
  if (!refCode) return null;
  
  const db = admin.firestore();
  
  // Extract type and ID
  const match = refCode.match(/(AMB|SNR|RD)-([A-Z])-(\d+)/);
  if (!match) return null;
  
  const [, type, region, number] = match;
  const fullCode = `${type}-${region}-${number}`;
  
  if (type === 'AMB') {
    // Direct ambassador referral
    const ambassadorDoc = await db.collection('ambassadors')
      .where('ambassador_code', '==', fullCode)
      .limit(1)
      .get();
    
    if (ambassadorDoc.empty) return null;
    
    const ambassador = ambassadorDoc.docs[0].data();
    
    return {
      ambassador_id: ambassadorDoc.docs[0].id,
      senior_id: ambassador.recruited_by_senior || null,
      rd_id: ambassador.recruited_by_rd || null
    };
    
  } else if (type === 'SNR') {
    // Senior ambassador referral
    const seniorDoc = await db.collection('ambassadors')
      .where('ambassador_code', '==', fullCode)
      .where('ambassador_type', '==', 'senior')
      .limit(1)
      .get();
    
    if (seniorDoc.empty) return null;
    
    const senior = seniorDoc.docs[0].data();
    
    return {
      ambassador_id: seniorDoc.docs[0].id, // Senior IS an ambassador
      senior_id: seniorDoc.docs[0].id,
      rd_id: senior.recruited_by_rd || null
    };
    
  } else if (type === 'RD') {
    // Regional director referral
    const rdDoc = await db.collection('regional_directors')
      .where('rd_code', '==', fullCode)
      .limit(1)
      .get();
    
    if (rdDoc.empty) return null;
    
    return {
      ambassador_id: null, // RD direct sales (rare)
      senior_id: null,
      rd_id: rdDoc.docs[0].id
    };
  }
  
  return null;
}

/**
 * Get customer attribution from existing customer record
 * 
 * @param {string} customerEmail - Customer's email
 * @returns {object|null} Attribution object or null if not found
 */
async function getCustomerAttribution(customerEmail) {
  const db = admin.firestore();
  
  const customerDoc = await db.collection('customers')
    .where('email', '==', customerEmail)
    .limit(1)
    .get();
  
  if (customerDoc.empty) return null;
  
  const customer = customerDoc.docs[0].data();
  
  return {
    customer_id: customerDoc.docs[0].id,
    ambassador_id: customer.source_ambassador,
    senior_id: customer.source_senior,
    rd_id: customer.source_rd
  };
}


// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    // Client-side
    trackReferral,
    getAttributionSource,
    displayAttributionBadge,
    
    // Server-side
    getOrCreateCustomer,
    parseReferralCode,
    getCustomerAttribution
  };
}
