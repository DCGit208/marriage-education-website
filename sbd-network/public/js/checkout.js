/**
 * CHECKOUT PAGE — Stripe Hosted Checkout (full catalog)
 */

let currentUserId = null;
let currentProductId = null;
let checkoutProduct = null;

document.addEventListener('DOMContentLoaded', () => {
  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = '/auth?next=' + encodeURIComponent(window.location.pathname + window.location.search);
      return;
    }
    currentUserId = user.uid;
    await loadCheckoutProduct();
  });
});

async function loadCheckoutProduct() {
  const productId = new URLSearchParams(window.location.search).get('product');
  if (!productId) {
    window.location.href = '/shop.html';
    return;
  }
  try {
    const res = await fetch('/data/shop-catalog.json?v=2');
    const data = await res.json();
    const raw = (data.products || []).find(function (p) { return p.id === productId; });
    if (!raw) {
      window.location.href = '/shop.html';
      return;
    }
    checkoutProduct = raw;
    currentProductId = productId;
    const suffix = raw.priceSuffix || '';
    const priceStr = '$' + (Number(raw.priceUsd) % 1 === 0 ? raw.priceUsd : raw.priceUsd.toFixed(2)) + suffix;
    document.getElementById('product-icon').textContent = raw.icon || '📘';
    document.getElementById('product-name').textContent = raw.name;
    document.getElementById('product-description').textContent = raw.description || '';
    document.getElementById('order-total').textContent = priceStr;
  } catch (err) {
    console.error('[Checkout] catalog load failed:', err);
    window.location.href = '/shop.html';
  }
}

async function startStripeCheckout(productId) {
  const btn = document.getElementById('pay-button');
  const errEl = document.getElementById('checkout-error');
  if (!productId || !currentUserId) return;
  if (errEl) errEl.textContent = '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span> Redirecting to Stripe...';
  }
  try {
    const createSession = firebase.functions().httpsCallable('createSbdCheckoutSession');
    const result = await createSession({ productId: productId });
    if (result.data?.url) {
      window.location.href = result.data.url;
    } else {
      throw new Error('No checkout URL returned from server.');
    }
  } catch (err) {
    console.error('[Checkout] Session creation failed:', err);
    const msg = err.message || 'Something went wrong. Please try again.';
    if (errEl) errEl.textContent = msg;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '💳 Pay with Card';
    }
  }
}

console.log('[Checkout] Ready — full catalog v2');
