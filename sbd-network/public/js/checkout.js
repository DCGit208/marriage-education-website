/**
 * CHECKOUT PAGE — STRIPE PAYMENT PROCESSING
 * ==========================================
 * Handle Stripe payment form and order creation
 */

// REPLACE WITH YOUR STRIPE PUBLISHABLE KEY
const STRIPE_PUBLIC_KEY = 'pk_test_YOUR_STRIPE_KEY_HERE';

let stripe = null;
let cardElement = null;
let currentUserId = null;
let currentProduct = null;

// Product catalog (imported from shop.js logic)
const PRODUCT_CATALOG = {
  'sbd-dummies': {
    id: 'sbd-dummies',
    name: 'Sex By Design for Dummies',
    description: 'Entry-level guide to sexual design and intimacy',
    price: 27,
    image: '📚'
  },
  'teleios-blueprint': {
    id: 'teleios-blueprint',
    name: 'Teleios Blueprint',
    description: 'Foundation of identity, wholeness, and maturity',
    price: 247,
    image: '🎯'
  },
  'foundation-monthly': {
    id: 'foundation-monthly',
    name: 'Foundation Tier',
    description: 'Monthly subscription to beginner courses',
    price: 9,
    image: '🟢'
  },
  'premium-monthly': {
    id: 'premium-monthly',
    name: 'Premium Tier',
    description: 'Full access to core schools',
    price: 20,
    image: '🔵'
  },
  'elite-monthly': {
    id: 'elite-monthly',
    name: 'Elite Tier',
    description: 'Advanced content and coaching',
    price: 50,
    image: '🔴'
  },
  'starter-bundle': {
    id: 'starter-bundle',
    name: 'Starter Bundle',
    description: 'Book + 1 month premium',
    price: 37,
    image: '🚀'
  },
  'teleios-bundle': {
    id: 'teleios-bundle',
    name: 'Teleios Bundle',
    description: 'Blueprint + 3 months premium',
    price: 297,
    image: '🎓'
  },
  'elite-bundle': {
    id: 'elite-bundle',
    name: 'Elite Formation Bundle',
    description: 'Complete library + 6 months elite',
    price: 497,
    image: '💎'
  }
};

// ==================================================================
// INITIALIZATION
// ==================================================================

document.addEventListener('DOMContentLoaded', async () => {
  
  // Check auth
  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = '/index.html';
      return;
    }
    
    currentUserId = user.uid;
    
    // Pre-fill email
    document.getElementById('email').value = user.email || '';
    
    // Initialize Stripe
    initializeStripe();
    
    // Load product from URL
    loadProduct();
  });
  
});

// ==================================================================
// STRIPE INITIALIZATION
// ==================================================================

function initializeStripe() {
  // Initialize Stripe.js
  stripe = Stripe(STRIPE_PUBLIC_KEY);
  
  // Create card element
  const elements = stripe.elements();
  
  cardElement = elements.create('card', {
    style: {
      base: {
        color: '#fff',
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
        fontSmoothing: 'antialiased',
        fontSize: '16px',
        '::placeholder': {
          color: '#aaa'
        }
      },
      invalid: {
        color: '#ff4444',
        iconColor: '#ff4444'
      }
    }
  });
  
  // Mount card element
  cardElement.mount('#card-element');
  
  // Handle real-time validation errors
  cardElement.on('change', (event) => {
    const displayError = document.getElementById('card-errors');
    if (event.error) {
      displayError.textContent = event.error.message;
    } else {
      displayError.textContent = '';
    }
  });
  
  console.log('[Checkout] Stripe initialized');
}

// ==================================================================
// LOAD PRODUCT
// ==================================================================

function loadProduct() {
  // Get product ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('product');
  
  if (!productId) {
    alert('No product specified');
    window.location.href = '/shop.html';
    return;
  }
  
  currentProduct = PRODUCT_CATALOG[productId];
  
  if (!currentProduct) {
    alert('Product not found');
    window.location.href = '/shop.html';
    return;
  }
  
  // Display product info
  document.getElementById('product-icon').textContent = currentProduct.image;
  document.getElementById('product-name').textContent = currentProduct.name;
  document.getElementById('product-description').textContent = currentProduct.description;
  document.getElementById('order-total').textContent = `$${currentProduct.price}`;
  
  console.log('[Checkout] Product loaded:', currentProduct);
}

// ==================================================================
// PAYMENT FORM SUBMISSION
// ==================================================================

document.getElementById('payment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (!currentProduct || !currentUserId) {
    alert('Error: Missing product or user data');
    return;
  }
  
  const payButton = document.getElementById('pay-button');
  const originalButtonText = payButton.textContent;
  
  // Disable button and show loading
  payButton.disabled = true;
  payButton.innerHTML = '<span class="loading-spinner"></span> Processing...';
  
  try {
    
    // Get form data
    const email = document.getElementById('email').value;
    const cardName = document.getElementById('card-name').value;
    
    console.log('[Checkout] Processing payment...');
    
    // ==================================================================
    // TEMPORARY: Direct Stripe Payment Intent (No Cloud Function)
    // ==================================================================
    // NOTE: In production, you should create Payment Intent server-side
    // for security. This is a simplified demo flow.
    
    // For now, we'll simulate success and create order directly
    // In production, replace with actual Stripe Payment Intent flow
    
    const mockPaymentSuccess = await simulatePayment(email, cardName);
    
    if (mockPaymentSuccess) {
      // Create order in Firestore
      await createOrder({
        productId: currentProduct.id,
        productName: currentProduct.name,
        amount: currentProduct.price,
        currency: 'USD',
        userEmail: email,
        cardholderName: cardName
      });
      
      // Redirect to success page
      window.location.href = `/checkout-success.html?product=${currentProduct.id}`;
    }
    
  } catch (error) {
    console.error('[Checkout] Payment failed:', error);
    alert('Payment failed. Please try again.');
    
    // Re-enable button
    payButton.disabled = false;
    payButton.textContent = originalButtonText;
  }
});

// ==================================================================
// SIMULATE PAYMENT (TEMPORARY FOR TESTING)
// ==================================================================

async function simulatePayment(email, cardName) {
  // This simulates a successful payment
  // In production, this would be replaced with actual Stripe token creation
  
  console.log('[Checkout] Simulating payment...');
  
  // Validate card with Stripe
  const { token, error } = await stripe.createToken(cardElement, {
    name: cardName
  });
  
  if (error) {
    throw new Error(error.message);
  }
  
  console.log('[Checkout] Stripe token created:', token.id);
  
  // In production, you would send this token to your server
  // For now, we simulate success
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, 1500); // Simulate network delay
  });
}

// ==================================================================
// CREATE ORDER
// ==================================================================

async function createOrder(orderData) {
  try {
    const orderRef = await firebase.firestore().collection('orders').add({
      userId: currentUserId,
      userEmail: orderData.userEmail,
      productId: orderData.productId,
      productName: orderData.productName,
      productType: currentProduct.type || 'product',
      amount: orderData.amount,
      currency: orderData.currency,
      paymentMethod: 'stripe',
      status: 'completed',
      cardholderName: orderData.cardholderName,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      metadata: {
        checkoutVersion: 'v1.0',
        userAgent: navigator.userAgent
      }
    });
    
    console.log('[Checkout] Order created:', orderRef.id);
    
    // Add to user's purchases
    await firebase.firestore().collection('users').doc(currentUserId).update({
      purchases: firebase.firestore.FieldValue.arrayUnion(orderRef.id)
    });
    
    // Unlock content based on product type
    await unlockContent(orderData.productId);
    
    return orderRef.id;
    
  } catch (error) {
    console.error('[Checkout] Order creation failed:', error);
    throw error;
  }
}

// ==================================================================
// CONTENT UNLOCKING
// ==================================================================

async function unlockContent(productId) {
  const userRef = firebase.firestore().collection('users').doc(currentUserId);
  
  // Define unlock logic per product
  const unlockRules = {
    'sbd-dummies': {
      courses: ['sbd-dummies-course']
    },
    'teleios-blueprint': {
      courses: ['teleios-blueprint']
    },
    'foundation-monthly': {
      tier: 'foundation',
      months: 1
    },
    'premium-monthly': {
      tier: 'premium',
      months: 1
    },
    'elite-monthly': {
      tier: 'elite',
      months: 1
    },
    'starter-bundle': {
      courses: ['sbd-dummies-course'],
      tier: 'premium',
      months: 1
    },
    'teleios-bundle': {
      courses: ['teleios-blueprint'],
      tier: 'premium',
      months: 3
    },
    'elite-bundle': {
      courses: ['sbd-dummies-course', 'teleios-blueprint'],
      tier: 'elite',
      months: 6
    }
  };
  
  const rule = unlockRules[productId];
  if (!rule) {
    console.log('[Checkout] No unlock rule for product:', productId);
    return;
  }
  
  try {
    // Unlock courses
    if (rule.courses) {
      await userRef.update({
        ownedCourses: firebase.firestore.FieldValue.arrayUnion(...rule.courses)
      });
      console.log('[Checkout] Courses unlocked:', rule.courses);
    }
    
    // Activate subscription tier
    if (rule.tier) {
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + rule.months);
      
      await userRef.update({
        'subscription.tier': rule.tier,
        'subscription.status': 'active',
        'subscription.startDate': firebase.firestore.FieldValue.serverTimestamp(),
        'subscription.endDate': firebase.firestore.Timestamp.fromDate(endDate),
        'subscription.lastPayment': firebase.firestore.FieldValue.serverTimestamp()
      });
      
      console.log('[Checkout] Subscription activated:', rule.tier, `for ${rule.months} months`);
    }
    
  } catch (error) {
    console.error('[Checkout] Content unlock failed:', error);
    throw error;
  }
}

console.log('[Checkout] Script loaded');
