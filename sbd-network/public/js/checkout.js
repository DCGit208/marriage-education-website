/**
 * CHECKOUT PAGE — Stripe Hosted Checkout (phased catalog)
 * Foundation Yearly also supports Manual MoMo (one-year term).
 * Monthly tiers remain Stripe-only.
 */

let currentUserId = null;
let currentProductId = null;
let checkoutProduct = null;
let payMethod = 'stripe';
let momoNetwork = 'mtn';

const MOMO_PAYEES = {
  mtn: { number: '237 677 604 100', name: 'Achu Gustave Mokom', step1: 'Open MTN MoMo or dial <strong>*126#</strong>' },
  orange: { number: '237 699 651 555', name: 'Achu Gustave Mokom', step1: 'Open Orange Money or dial <strong>#150#</strong>' }
};

function resolveShopProductId(productId) {
  const root = typeof window !== 'undefined' ? window : global;
  if (root.SBDShopProductIds && typeof root.SBDShopProductIds.resolve === 'function') {
    return root.SBDShopProductIds.resolve(productId);
  }
  const normalized = typeof productId === 'string' ? productId.trim() : '';
  return normalized || '';
}

function isYearlyFoundation(productId) {
  return productId === 'foundation-yearly';
}

document.addEventListener('DOMContentLoaded', () => {
  bindPayMethodControls();
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

function bindPayMethodControls() {
  const stripeBtn = document.getElementById('method-stripe');
  const momoBtn = document.getElementById('method-momo');
  const netMtn = document.getElementById('net-mtn');
  const netOrange = document.getElementById('net-orange');

  if (stripeBtn) {
    stripeBtn.addEventListener('click', function () {
      payMethod = 'stripe';
      syncPayMethodUi();
    });
  }
  if (momoBtn) {
    momoBtn.addEventListener('click', function () {
      payMethod = 'momo';
      syncPayMethodUi();
    });
  }
  if (netMtn) {
    netMtn.addEventListener('click', function () {
      momoNetwork = 'mtn';
      syncMomoNetworkUi();
    });
  }
  if (netOrange) {
    netOrange.addEventListener('click', function () {
      momoNetwork = 'orange';
      syncMomoNetworkUi();
    });
  }
}

function syncPayMethodUi() {
  const yearly = isYearlyFoundation(currentProductId);
  const methods = document.getElementById('yearly-pay-methods');
  const momoPanel = document.getElementById('momo-panel');
  const stripeCopy = document.getElementById('stripe-copy');
  const virtualHint = document.getElementById('virtual-card-hint');
  const badge = document.getElementById('secure-badge-text');
  const btn = document.getElementById('pay-button');
  const stripeBtn = document.getElementById('method-stripe');
  const momoBtn = document.getElementById('method-momo');

  if (methods) methods.style.display = yearly ? 'block' : 'none';
  if (!yearly) payMethod = 'stripe';

  const isMomo = yearly && payMethod === 'momo';
  if (momoPanel) momoPanel.style.display = isMomo ? 'block' : 'none';
  if (stripeCopy) {
    stripeCopy.style.display = isMomo ? 'none' : 'block';
    stripeCopy.textContent = yearly
      ? 'Card checkout via Stripe, or Manual MoMo for a one-year term (86,502 FCFA). Monthly plans stay on Stripe only.'
      : 'You\'ll be taken to Stripe\'s secure checkout page to enter your card details. Your payment is processed by Stripe — we never see your card number.';
  }
  if (virtualHint) virtualHint.style.display = isMomo ? 'none' : '';
  if (badge) {
    badge.textContent = isMomo
      ? 'Manual MoMo · 12-month access after admin approval'
      : 'Secure checkout powered by Stripe';
  }
  if (btn) {
    btn.innerHTML = isMomo ? 'Confirm MoMo transfer' : '💳 Pay with Card';
  }
  if (stripeBtn) {
    stripeBtn.style.background = !isMomo ? 'rgba(125,211,192,0.15)' : 'transparent';
    stripeBtn.classList.toggle('active', !isMomo);
  }
  if (momoBtn) {
    momoBtn.style.background = isMomo ? 'rgba(125,211,192,0.15)' : 'transparent';
    momoBtn.classList.toggle('active', isMomo);
  }
  syncMomoNetworkUi();
}

function syncMomoNetworkUi() {
  const p = MOMO_PAYEES[momoNetwork] || MOMO_PAYEES.mtn;
  const num = document.getElementById('momo-payee-number');
  const name = document.getElementById('momo-payee-name');
  const step1 = document.getElementById('momo-step1');
  const netMtn = document.getElementById('net-mtn');
  const netOrange = document.getElementById('net-orange');
  if (num) num.textContent = p.number;
  if (name) name.textContent = p.name;
  if (step1) step1.innerHTML = p.step1;
  if (netMtn) {
    netMtn.style.borderColor = momoNetwork === 'mtn' ? '#f59e0b' : 'rgba(255,255,255,0.2)';
    netMtn.style.background = momoNetwork === 'mtn' ? 'rgba(245,158,11,0.15)' : 'transparent';
  }
  if (netOrange) {
    netOrange.style.borderColor = momoNetwork === 'orange' ? '#ea580c' : 'rgba(255,255,255,0.2)';
    netOrange.style.background = momoNetwork === 'orange' ? 'rgba(234,88,12,0.15)' : 'transparent';
  }
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
    document.getElementById('product-name').textContent = raw.name;
    document.getElementById('product-description').textContent = raw.description || '';
    document.getElementById('order-total').textContent = priceStr;
    var iconEl = document.getElementById('product-icon');
    if (iconEl && raw.coverImage) {
      iconEl.innerHTML =
        '<img class="checkout-cover-front" src="' + raw.coverImage + '" alt="' + (raw.name || '') + ' cover" />';
      iconEl.classList.add('checkout-cover-icon');
    } else if (iconEl) {
      iconEl.textContent = raw.icon || '📘';
    }
    var existingWrap = document.getElementById('checkout-cover-wrap');
    if (existingWrap) existingWrap.remove();
    if (raw.coverWrapImage) {
      var summary = document.querySelector('.order-summary');
      if (summary) {
        var wrap = document.createElement('div');
        wrap.id = 'checkout-cover-wrap';
        wrap.className = 'checkout-cover-wrap';
        wrap.innerHTML =
          '<p class="checkout-cover-wrap-label">Front &amp; back cover</p>' +
          '<img class="checkout-cover-wrap-img" src="' + raw.coverWrapImage + '" alt="' + (raw.name || '') + ' full cover" />';
        summary.appendChild(wrap);
      }
    }
    syncPayMethodUi();
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

async function startCheckout() {
  if (isYearlyFoundation(currentProductId) && payMethod === 'momo') {
    return startMomoCheckout(currentProductId);
  }
  return startStripeCheckout(currentProductId);
}

async function startMomoCheckout(productId) {
  const btn = document.getElementById('pay-button');
  const errEl = document.getElementById('checkout-error');
  const phoneEl = document.getElementById('momo-phone');
  const phone = phoneEl ? String(phoneEl.value || '').trim() : '';
  const done = document.getElementById('momo-done');

  if (!productId || !currentUserId) return;
  if (productId !== 'foundation-yearly') {
    if (errEl) errEl.textContent = 'Manual MoMo is only for Foundation Yearly.';
    return;
  }
  if (!phone || phone.replace(/\D/g, '').length < 9) {
    if (errEl) errEl.textContent = 'Enter the MoMo phone number you are paying from (9+ digits).';
    return;
  }
  if (errEl) errEl.textContent = '';
  if (done) done.style.display = 'none';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span> Submitting…';
  }
  try {
    const create = firebase.functions().httpsCallable('createSbdManualPayment');
    const result = await create({
      productId: productId,
      phone: phone,
      momo_network: momoNetwork
    });
    const data = result.data || {};
    if (!data.success || !data.reference) {
      throw new Error('Could not submit MoMo confirmation.');
    }
    const refEl = document.getElementById('momo-done-ref');
    if (refEl) refEl.textContent = data.reference;
    if (done) done.style.display = 'block';
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Confirm MoMo transfer';
    }
  } catch (err) {
    console.error('[Checkout] MoMo submit failed:', err);
    if (errEl) errEl.textContent = err.message || 'Something went wrong. Please try again.';
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Confirm MoMo transfer';
    }
  }
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

// Back-compat for any leftover onclick handlers
window.startStripeCheckout = startStripeCheckout;
window.startCheckout = startCheckout;

console.log('[Checkout] Phased catalog checkout v4 — yearly MoMo');
