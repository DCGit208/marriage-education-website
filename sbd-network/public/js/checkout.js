/**
 * CHECKOUT PAGE — STRIPE HOSTED CHECKOUT
 * ========================================
 * Calls the createSbdCheckoutSession Cloud Function to create a
 * Stripe-hosted checkout session, then redirects the user to Stripe.
 * Card details are collected securely by Stripe’s own pages.
 */

let currentUserId  = null;
let currentProductId = null;

const PRODUCT_CATALOG = {
  'sbd-dummies': {
    name: 'Sex By Design for Dummies',
    description: 'Entry-level guide to sexual design and intimacy',
    price: 27, image: '\uD83D\uDCDA', recurring: false
  },
  'teleios-blueprint': {
    name: 'Teleios Blueprint',
    description: 'Foundation of identity, wholeness, and maturity',
    price: 247, image: '\uD83C\uDFAF', recurring: false
  },
  'foundation-monthly': {
    name: 'Foundation Tier',
    description: 'Monthly access to formation content and community',
    price: 9, image: '\uD83D\uDFE2', recurring: true
  },
  'premium-monthly': {
    name: 'Premium Tier',
    description: 'Full access to all formation schools',
    price: 20, image: '\uD83D\uDD35', recurring: true
  },
  'elite-monthly': {
    name: 'Elite Tier',
    description: 'Advanced content, coaching and full community access',
    price: 50, image: '\uD83D\uDD34', recurring: true
  },
  'starter-bundle': {
    name: 'Starter Bundle',
    description: 'SBD Dummies book + 1 month Premium access',
    price: 37, image: '\uD83D\uDE80', recurring: false
  },
  'teleios-bundle': {
    name: 'Teleios Bundle',
    description: 'Teleios Blueprint + 3 months Premium',
    price: 297, image: '\uD83C\uDF93', recurring: false
  },
  'elite-bundle': {
    name: 'Elite Formation Bundle',
    description: 'Full library + 6 months Elite access',
    price: 497, image: '\uD83D\uDC8E', recurring: false
  },
};

document.addEventListener('DOMContentLoaded', () => {
  firebase.auth().onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = '/auth?next=' + encodeURIComponent(window.location.pathname + window.location.search);
      return;
    }
    currentUserId = user.uid;
    loadProduct();
  });
});

function loadProduct() {
  const productId = new URLSearchParams(window.location.search).get('product');
  if (!productId || !PRODUCT_CATALOG[productId]) {
    window.location.href = '/shop.html';
    return;
  }
  currentProductId = productId;
  const p = PRODUCT_CATALOG[productId];
  document.getElementById('product-icon').textContent        = p.image;
  document.getElementById('product-name').textContent        = p.name;
  document.getElementById('product-description').textContent = p.description;
  document.getElementById('order-total').textContent         = `$${p.price}${p.recurring ? '/mo' : ''}`;
}

async function startStripeCheckout(productId) {
  const btn   = document.getElementById('pay-button');
  const errEl = document.getElementById('checkout-error');
  if (!productId || !currentUserId) return;
  if (errEl) errEl.textContent = '';
  if (btn)   { btn.disabled = true; btn.innerHTML = '<span class="loading-spinner"></span> Redirecting to Stripe...'; }

  try {
    const createSession = firebase.functions().httpsCallable('createSbdCheckoutSession');
    const result        = await createSession({ productId });
    if (result.data?.url) {
      window.location.href = result.data.url;
    } else {
      throw new Error('No checkout URL returned from server.');
    }
  } catch (err) {
    console.error('[Checkout] Session creation failed:', err);
    const msg = err.message || 'Something went wrong. Please try again.';
    if (errEl) errEl.textContent = msg;
    if (btn)   { btn.disabled = false; btn.innerHTML = '\uD83D\uDCB3 Pay with Card'; }
  }
}

console.log('[Checkout] Ready — Stripe Hosted Checkout v1');
