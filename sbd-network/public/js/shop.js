/**
 * SHOP PAGE — STRIPE PAYMENT INTEGRATION
 * =======================================
 * Handle product purchases, subscriptions, and bundles
 * Phase 1: Revenue Foundation
 */

let currentUserId = null;
let shopCurrentUser = null;

// Stripe publishable key (REPLACE WITH YOUR KEY)
// Get from: https://dashboard.stripe.com/test/apikeys
const STRIPE_PUBLIC_KEY = 'pk_test_YOUR_STRIPE_KEY_HERE';

// ==================================================================
// INITIALIZATION
// ==================================================================

firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = '/auth';
    return;
  }
  
  currentUserId = user.uid;
  shopCurrentUser = user;
  
  // Fetch user data for email
  const userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
  if (userDoc.exists) {
    shopCurrentUser = { ...user, ...userDoc.data() };
  }
  
  console.log('[Shop] User loaded:', currentUserId);
});

// ==================================================================
// PRODUCT CATALOG
// ==================================================================

const PRODUCT_CATALOG = {
  // BOOKS
  'sbd-dummies': {
    id: 'sbd-dummies',
    name: 'Sex By Design for Dummies',
    description: 'Entry-level guide to sexual design and intimacy',
    price: 27,
    currency: 'USD',
    type: 'book',
    unlocks: {
      type: 'course',
      courseIds: ['sbd-dummies-course']
    },
    image: '📚'
  },
  
  'teleios-blueprint': {
    id: 'teleios-blueprint',
    name: 'Teleios Blueprint',
    description: 'Foundation of identity, wholeness, and maturity',
    price: 247,
    currency: 'USD',
    type: 'book',
    unlocks: {
      type: 'course',
      courseIds: ['teleios-blueprint']
    },
    image: '🎯'
  },
  
  // SUBSCRIPTIONS
  'foundation-monthly': {
    id: 'foundation-monthly',
    name: 'Foundation Tier',
    description: 'Access beginner courses and Teleios Blueprint',
    price: 9,
    currency: 'USD',
    type: 'subscription',
    interval: 'monthly',
    unlocks: {
      type: 'tier',
      tier: 'foundation'
    },
    features: [
      'SBD for Dummies course',
      'Teleios Blueprint (basic)',
      'Selected beginner courses',
      'Limited course boards'
    ],
    image: '🟢'
  },
  
  'premium-monthly': {
    id: 'premium-monthly',
    name: 'Premium Tier',
    description: 'Full access to core schools and certifications',
    price: 20,
    currency: 'USD',
    type: 'subscription',
    interval: 'monthly',
    unlocks: {
      type: 'tier',
      tier: 'premium'
    },
    features: [
      'All Foundation features',
      'Full Teleios School access',
      'Sexual Literacy courses',
      'Marriage Systems courses',
      'All course boards',
      'Certifications'
    ],
    image: '🔵'
  },
  
  'elite-monthly': {
    id: 'elite-monthly',
    name: 'Elite Tier',
    description: 'Advanced boards, coaching access, and exclusive content',
    price: 50,
    currency: 'USD',
    type: 'subscription',
    interval: 'monthly',
    unlocks: {
      type: 'tier',
      tier: 'elite'
    },
    features: [
      'All Premium features',
      'Advanced Muliebrity boards',
      'Advanced Virility boards',
      'Exclusive media content',
      'Live session access',
      'Coaching layer (future)'
    ],
    image: '🔴'
  },
  
  // BUNDLES
  'starter-bundle': {
    id: 'starter-bundle',
    name: 'Starter Bundle',
    description: 'Perfect for beginners — Book + 1 month premium',
    price: 37,
    currency: 'USD',
    type: 'bundle',
    savings: 10,
    originalPrice: 47,
    includes: [
      { productId: 'sbd-dummies', name: 'SBD for Dummies' },
      { duration: '1 month', tier: 'premium', name: '1-Month Premium Access' }
    ],
    unlocks: {
      type: 'bundle',
      products: ['sbd-dummies'],
      subscription: { tier: 'premium', months: 1 }
    },
    image: '🚀'
  },
  
  'teleios-bundle': {
    id: 'teleios-bundle',
    name: 'Teleios Bundle',
    description: 'Blueprint book + 3 months premium + coaching',
    price: 297,
    currency: 'USD',
    type: 'bundle',
    savings: 50,
    originalPrice: 347,
    includes: [
      { productId: 'teleios-blueprint', name: 'Teleios Blueprint' },
      { duration: '3 months', tier: 'premium', name: '3-Month Premium' },
      { name: 'Coaching Session' }
    ],
    unlocks: {
      type: 'bundle',
      products: ['teleios-blueprint'],
      subscription: { tier: 'premium', months: 3 }
    },
    image: '🎓'
  },
  
  'elite-bundle': {
    id: 'elite-bundle',
    name: 'Elite Formation Bundle',
    description: 'Complete library + 6 months elite access',
    price: 497,
    currency: 'USD',
    type: 'bundle',
    savings: 77,
    originalPrice: 574,
    includes: [
      { productId: 'sbd-dummies', name: 'SBD for Dummies' },
      { productId: 'teleios-blueprint', name: 'Teleios Blueprint' },
      { duration: '6 months', tier: 'elite', name: '6-Month Elite Access' }
    ],
    unlocks: {
      type: 'bundle',
      products: ['sbd-dummies', 'teleios-blueprint'],
      subscription: { tier: 'elite', months: 6 }
    },
    image: '💎'
  }
};

// ==================================================================
// STRIPE CHECKOUT
// ==================================================================

async function buyProduct(productId) {
  console.log('[Shop] Purchase initiated:', productId);
  
  const product = PRODUCT_CATALOG[productId];
  if (!product) {
    console.error('[Shop] Product not found:', productId);
    showNotification('Product not found', 'error');
    return;
  }
  
  if (!currentUserId) {
    showNotification('Please log in to purchase', 'error');
    window.location.href = '/auth';
    return;
  }
  
  // Show loading state
  showNotification(`Processing ${product.name}...`, 'info');
  
  try {
    // Create checkout session via Cloud Function
    // NOTE: This requires deploying the webhook function first
    
    // For now, redirect to checkout page with product data
    const checkoutUrl = `/checkout.html?product=${productId}`;
    window.location.href = checkoutUrl;
    
    // TODO: Once Cloud Function is deployed, use this instead:
    /*
    const createCheckoutSession = firebase.functions().httpsCallable('createCheckoutSession');
    const result = await createCheckoutSession({
      productId: productId,
      userId: currentUserId,
      userEmail: shopCurrentUser.email || shopCurrentUser.email,
      successUrl: `${window.location.origin}/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${window.location.origin}/shop.html`
    });
    
    // Redirect to Stripe Checkout
    const sessionId = result.data.sessionId;
    const stripe = Stripe(STRIPE_PUBLIC_KEY);
    await stripe.redirectToCheckout({ sessionId });
    */
    
  } catch (error) {
    console.error('[Shop] Purchase error:', error);
    showNotification('Purchase failed. Please try again.', 'error');
  }
}

// ==================================================================
// SUBSCRIPTION MANAGEMENT
// ==================================================================

async function subscribeToTier(tierId) {
  console.log('[Shop] Subscription initiated:', tierId);
  
  const product = PRODUCT_CATALOG[tierId];
  if (!product || product.type !== 'subscription') {
    console.error('[Shop] Invalid subscription:', tierId);
    return;
  }
  
  buyProduct(tierId);
}

// ==================================================================
// ORDER CREATION (CALLED AFTER SUCCESSFUL PAYMENT)
// ==================================================================

async function createOrder(orderData) {
  try {
    const orderRef = await firebase.firestore().collection('orders').add({
      userId: currentUserId,
      userEmail: shopCurrentUser.email,
      productId: orderData.productId,
      productName: orderData.productName,
      productType: orderData.productType,
      amount: orderData.amount,
      currency: orderData.currency,
      paymentMethod: orderData.paymentMethod || 'stripe',
      status: 'completed',
      stripeSessionId: orderData.stripeSessionId || null,
      stripePaymentIntentId: orderData.stripePaymentIntentId || null,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      metadata: orderData.metadata || {}
    });
    
    console.log('[Shop] Order created:', orderRef.id);
    
    // Add to user's purchases
    await firebase.firestore().collection('users').doc(currentUserId).update({
      purchases: firebase.firestore.FieldValue.arrayUnion(orderRef.id)
    });
    
    return orderRef.id;
    
  } catch (error) {
    console.error('[Shop] Order creation failed:', error);
    throw error;
  }
}

// ==================================================================
// CONTENT UNLOCKING (CALLED AFTER ORDER CREATION)
// ==================================================================

async function unlockContent(productId) {
  const product = PRODUCT_CATALOG[productId];
  if (!product || !product.unlocks) {
    console.log('[Shop] No unlocks for product:', productId);
    return;
  }
  
  try {
    const userRef = firebase.firestore().collection('users').doc(currentUserId);
    
    if (product.unlocks.type === 'tier') {
      // Update subscription tier
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1); // 1 month for monthly subscriptions
      
      await userRef.update({
        'subscription.tier': product.unlocks.tier,
        'subscription.status': 'active',
        'subscription.startDate': firebase.firestore.FieldValue.serverTimestamp(),
        'subscription.endDate': firebase.firestore.Timestamp.fromDate(endDate),
        'subscription.lastPayment': firebase.firestore.FieldValue.serverTimestamp()
      });
      
      console.log('[Shop] Subscription activated:', product.unlocks.tier);

      // If this user was referred by an ambassador, increment their subscriber count
      try {
        const userSnap = await userRef.get();
        const referralCode = userSnap.exists ? userSnap.data().referredBy : null;
        if (referralCode) {
          const ambSnap = await firebase.firestore().collection('ambassadors')
            .where('sbdReferralCode', '==', referralCode).limit(1).get();
          if (!ambSnap.empty) {
            await ambSnap.docs[0].ref.update({
              'sbdReferrals.subscribers': firebase.firestore.FieldValue.increment(1)
            });
          }
        }
      } catch (_) {} // non-critical
      
    } else if (product.unlocks.type === 'course') {
      // Grant access to specific courses
      for (const courseId of product.unlocks.courseIds) {
        await userRef.update({
          ownedCourses: firebase.firestore.FieldValue.arrayUnion(courseId)
        });
      }
      
      console.log('[Shop] Courses unlocked:', product.unlocks.courseIds);
      
    } else if (product.unlocks.type === 'bundle') {
      // Unlock multiple products
      if (product.unlocks.products) {
        for (const prodId of product.unlocks.products) {
          const subProduct = PRODUCT_CATALOG[prodId];
          if (subProduct && subProduct.unlocks && subProduct.unlocks.courseIds) {
            await userRef.update({
              ownedCourses: firebase.firestore.FieldValue.arrayUnion(...subProduct.unlocks.courseIds)
            });
          }
        }
      }
      
      // Activate subscription if bundle includes it
      if (product.unlocks.subscription) {
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + product.unlocks.subscription.months);
        
        await userRef.update({
          'subscription.tier': product.unlocks.subscription.tier,
          'subscription.status': 'active',
          'subscription.startDate': firebase.firestore.FieldValue.serverTimestamp(),
          'subscription.endDate': firebase.firestore.Timestamp.fromDate(endDate)
        });
      }
      
      console.log('[Shop] Bundle unlocked');
    }
    
    showNotification('Content unlocked! Check My Journey', 'success');
    
  } catch (error) {
    console.error('[Shop] Content unlock failed:', error);
    throw error;
  }
}

// ==================================================================
// UTILITY FUNCTIONS
// ==================================================================

function showNotification(message, type = 'info') {
  // Simple notification (can be enhanced with a toast library)
  console.log(`[${type.toUpperCase()}]`, message);
  
  // Show browser alert for now
  if (type === 'error') {
    alert(`❌ ${message}`);
  } else if (type === 'success') {
    alert(`✅ ${message}`);
  } else {
    // Info notifications can be silent or use a toast
    console.info(message);
  }
}

// ==================================================================
// BACK BUTTON
// ==================================================================

document.querySelector('.back-btn')?.addEventListener('click', () => {
  window.history.back();
});

console.log('[Shop] Page loaded');
