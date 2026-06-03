/**
 * CHECKOUT PAGE — Stripe Hosted Checkout (phased catalog)
 * Only products in the active phase with stripeReady=true can checkout.
 */

let currentUserId = null;
let currentProductId = null;
let checkoutProduct = null;
function resolveShopProductId(productId) {
  const root = typeof window !== 'undefined' ? window : global;
  if (root.SBDShopProductIds && typeof root.SBDShopProductIds.resolve === 'function') {
    return root.SBDShopProductIds.resolve(productId);
  }
  const normalized = typeof productId === 'string' ? productId.trim() : '';
  return normalized || '';
}

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

function isCheckoutAllowed(product, activePhase) {
  if (!product) return false;
  if ((product.phase || 1) > activePhase) return false;
  return !!product.stripeReady;
}

async function loadCheckoutProduct() {
  const requestedProductId = new URLSearchParams(window.location.search).get('product');
  const productId = resolveShopProductId(requestedProductId);
  if (!productId) {
    window.location.href = '/shop.html';
    return;
  }
  try {
    const res = await fetch('/data/shop-catalog.json?v=3');
    const data = await res.json();
    const activePhase = Number(data.activePhase) || 1;
    const raw = (data.products || []).find(function (p) { return p.id === productId; });
    if (!raw || !isCheckoutAllowed(raw, activePhase)) {
      showCheckoutBlocked(raw
        ? 'This product is not available for checkout yet. Please return to the shop.'
        : 'Product not found.');
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

function showCheckoutBlocked(message) {
  const errEl = document.getElementById('checkout-error');
  const btn = document.getElementById('pay-button');
  if (errEl) errEl.textContent = message;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Not available yet';
  }
  setTimeout(function () {
    window.location.href = '/shop.html';
  }, 3500);
}

async function startStripeCheckout(productId) {
  const btn = document.getElementById('pay-button');
  const errEl = document.getElementById('checkout-error');
  if (!productId || !currentUserId || !checkoutProduct) return;
  if (!checkoutProduct.stripeReady) {
    if (errEl) errEl.textContent = 'Checkout is not enabled for this product yet.';
    return;
  }
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

console.log('[Checkout] Phased catalog checkout v3');
