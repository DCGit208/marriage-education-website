/**
 * CHECKOUT PAGE — Stripe Hosted Checkout (phased catalog)
 * Foundation School One-Time Access also supports Manual MoMo (12-month term).
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

function isFoundationPlanSelector(productId) {
  return productId === 'foundation-options';
}

const FOUNDATION_PLAN_IDS = ['foundation-yearly', 'foundation-1year', 'foundation-2year'];

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
  const foundationPlan = FOUNDATION_PLAN_IDS.includes(currentProductId);
  const planSelector = isFoundationPlanSelector(currentProductId);
  const planBox = document.getElementById('foundation-plan-selector');
  const methods = document.getElementById('yearly-pay-methods');
  const momoPanel = document.getElementById('momo-panel');
  const stripeCopy = document.getElementById('stripe-copy');
  const virtualHint = document.getElementById('virtual-card-hint');
  const badge = document.getElementById('secure-badge-text');
  const btn = document.getElementById('pay-button');
  const stripeBtn = document.getElementById('method-stripe');
  const momoBtn = document.getElementById('method-momo');

  if (planBox) planBox.style.display = planSelector ? 'block' : 'none';
  if (methods) methods.style.display = foundationPlan ? 'block' : 'none';
  if (!foundationPlan) payMethod = 'stripe';
  if (planSelector) {
    if (momoPanel) momoPanel.style.display = 'none';
    if (stripeCopy) stripeCopy.textContent = 'Choose your Foundation School payment plan above. You will then be taken to the appropriate Stripe checkout.';
    if (virtualHint) virtualHint.style.display = 'none';
    if (badge) badge.textContent = 'Secure checkout powered by Stripe';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = 'Choose a Foundation plan';
    }
    return;
  }

  const isMomo = foundationPlan && payMethod === 'momo';
  if (momoPanel) momoPanel.style.display = isMomo ? 'block' : 'none';
  if (stripeCopy) {
    stripeCopy.style.display = isMomo ? 'none' : 'block';
    stripeCopy.textContent = yearly
      ? 'Card checkout via Stripe, or Mobile Money through MeSomb. One-time access is 86,502 FCFA; subscription plans are charged one monthly installment at a time.'
      : 'You\'ll be taken to Stripe\'s secure checkout page to enter your card details. Your payment is processed by Stripe — we never see your card number.';
  }
  if (virtualHint) virtualHint.style.display = isMomo ? 'none' : '';
  if (badge) {
    badge.textContent = isMomo
      ? 'Manual MoMo · 12-month access after admin approval'
      : 'Secure checkout powered by Stripe';
  }
  if (btn) {
    btn.innerHTML = isMomo ? '📱 Pay with Mobile Money' : '💳 Pay with Card';
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
  const step1 = document.getElementById('momo-step1');
  const netMtn = document.getElementById('net-mtn');
  const netOrange = document.getElementById('net-orange');
  if (step1) {
    step1.innerHTML = momoNetwork === 'orange'
      ? 'Enter the Orange Money number you want MeSomb to charge.'
      : 'Enter the MTN MoMo number you want MeSomb to charge.';
  }
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
    const res = await fetch('/data/shop-catalog.json?v=4');
    const data = await res.json();
    const activePhase = Number(data.activePhase) || 1;

    // foundation-options is a selector route, not a catalog product.
    // Handle it before catalog validation so the selector is not reported as missing.
    if (isFoundationPlanSelector(productId)) {
      currentProductId = productId;
      checkoutProduct = {
        id: productId,
        name: 'Foundation School',
        description: 'Choose one of the three Foundation School payment options.',
        stripeReady: true
      };
      renderFoundationPlanOptions(data.products || []);
      document.getElementById('product-name').textContent = 'Foundation School';
      document.getElementById('product-description').textContent = 'Choose one of the three Foundation School payment options.';
      document.getElementById('order-total').textContent = 'Choose plan';
      syncPayMethodUi();
      return;
    }

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

function renderFoundationPlanOptions(products) {
  const box = document.getElementById("foundation-plan-options");
  if (!box) return;

  const plans = FOUNDATION_PLAN_IDS
    .map(function (id) {
      return (products || []).find(function (p) { return p.id === id; });
    })
    .filter(Boolean);

  box.innerHTML = plans.map(function (plan) {
    const isOneTime = plan.id === "foundation-yearly";
    const price = "$" + Number(plan.priceUsd).toFixed(2).replace(/\.00$/, "");
    let term = "12 months · one-time payment · no automatic renewal";
    if (plan.id === "foundation-1year") term = "$15/month · 12 monthly payments · 12-month term";
    if (plan.id === "foundation-2year") term = "$11/month · 24 monthly payments · 24-month term";

    return "<button type=\"button\" onclick=\"selectFoundationPlan('" + plan.id + "')\" style=\"text-align:left;padding:16px;border:1px solid rgba(255,255,255,.15);border-radius:12px;background:rgba(255,255,255,.03);color:#fff;cursor:pointer\">" +
      "<strong style=\"display:block;font-size:1rem\">" + plan.name + "</strong>" +
      "<span style=\"display:block;margin-top:5px;color:#7dd3c0;font-size:1.05rem\">" + price + (isOneTime ? "" : "/month") + "</span>" +
      "<span style=\"display:block;margin-top:5px;color:#aaa;font-size:.82rem;line-height:1.45\">" + term + "</span>" +
      "</button>";
  }).join("");
}

function selectFoundationPlan(productId) {
  if (!FOUNDATION_PLAN_IDS.includes(productId)) return;
  const url = new URL(window.location.href);
  url.searchParams.set("product", productId);
  window.history.replaceState({}, "", url.toString());
  loadCheckoutProduct();
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

  if (!productId || !currentUserId || !FOUNDATION_PLAN_IDS.includes(productId)) return;
  if (!phone || phone.replace(/\D/g, '').length < 9) {
    if (errEl) errEl.textContent = 'Enter the MoMo phone number you are paying from (9+ digits).';
    return;
  }

  if (errEl) errEl.textContent = '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span> Sending payment request…';
  }

  try {
    const create = firebase.functions().httpsCallable('createSbdMeSombPayment');
    const result = await create({
      productId,
      phone,
      service: momoNetwork
    });
    const data = result.data || {};

    if (data.success && data.status === 'SUCCESS') {
      window.location.href = '/checkout-success.html?product=' + encodeURIComponent(productId) + '&payment=mesomb&reference=' + encodeURIComponent(data.reference || '');
      return;
    }

    if (!data.pending || !data.reference) {
      throw new Error(data.message || 'MeSomb could not start the Mobile Money payment.');
    }

    if (errEl) {
      errEl.style.color = '#a7f3d0';
      errEl.textContent = data.message || 'Payment request sent. Approve it on your phone…';
    }

    let attempts = 0;
    const poll = async function () {
      attempts += 1;
      if (attempts > 12) {
        if (errEl) {
          errEl.style.color = '#fbbf24';
          errEl.textContent = 'Payment is still pending. Your access will activate when MeSomb confirms the transaction. Reference: ' + data.reference;
        }
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '📱 Check Mobile Money Payment';
        }
        return;
      }

      try {
        const check = firebase.functions().httpsCallable('checkSbdMeSombPayment');
        const checked = await check({ reference: data.reference });
        const state = checked.data || {};
        if (state.success && state.status === 'SUCCESS') {
          window.location.href = '/checkout-success.html?product=' + encodeURIComponent(productId) + '&payment=mesomb&reference=' + encodeURIComponent(data.reference);
          return;
        }
        if (state.status === 'FAILED') {
          throw new Error(state.message || 'MeSomb reports that the payment failed.');
        }
      } catch (pollErr) {
        console.warn('[Checkout] MeSomb status check:', pollErr);
      }
      setTimeout(poll, 5000);
    };

    setTimeout(poll, 4000);
  } catch (err) {
    console.error('[Checkout] MeSomb submit failed:', err);
    if (errEl) {
      errEl.style.color = '#ff4444';
      errEl.textContent = err.message || 'Something went wrong. Please try again.';
    }
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '📱 Pay with Mobile Money';
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

console.log('[Checkout] Phased catalog checkout v5 — MeSomb Mobile Money');
