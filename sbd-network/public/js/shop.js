/**
 * SHOP PAGE — phased marriageducation.com catalog
 * Loads /data/shop-catalog.json; only products with phase <= activePhase are shown.
 * Checkout is enabled only when stripeReady is true (Stripe + unlock rules live).
 */

let currentUserId = null;
let shopCurrentUser = null;
let PRODUCT_CATALOG = {};
let SHOP_CATEGORIES = [];
let SHOP_PRODUCTS = [];
let SHOP_ACTIVE_PHASE = 1;
let SHOP_PHASES = [];
let activeCategory = 'all';
let shopSearchQuery = '';

firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = '/auth?next=' + encodeURIComponent('/shop.html');
    return;
  }
  currentUserId = user.uid;
  shopCurrentUser = user;
  try {
    const userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
    if (userDoc.exists) {
      shopCurrentUser = { ...user, ...userDoc.data() };
    }
  } catch (e) {
    console.warn('[Shop] user doc load failed:', e);
  }
  await loadShopCatalog();
  renderShopPage();
});

async function loadShopCatalog() {
  const res = await fetch('/data/shop-catalog.json?v=3');
  if (!res.ok) throw new Error('Could not load shop catalog');
  const data = await res.json();
  SHOP_ACTIVE_PHASE = Number(data.activePhase) || 1;
  SHOP_PHASES = data.phases || [];
  SHOP_CATEGORIES = [{ id: 'all', label: 'All', icon: '◇', sort: 0 }].concat(data.categories || []);
  SHOP_PRODUCTS = (data.products || []).filter(function (p) {
    return p.status !== 'inactive' && (p.phase || 1) <= SHOP_ACTIVE_PHASE;
  });
  PRODUCT_CATALOG = {};
  SHOP_PRODUCTS.forEach(function (p) {
    PRODUCT_CATALOG[p.id] = normalizeCatalogProduct(p);
  });
  console.log('[Shop] Catalog loaded: phase', SHOP_ACTIVE_PHASE, '→', SHOP_PRODUCTS.length, 'visible products');
}

function normalizeCatalogProduct(p) {
  return {
    id: p.id,
    name: p.name,
    description: p.description || '',
    price: p.priceUsd,
    priceUsd: p.priceUsd,
    priceSuffix: p.priceSuffix || '',
    originalPrice: p.originalPriceUsd,
    currency: 'USD',
    type: p.type || 'book',
    category: p.category,
    icon: p.icon || '📘',
    recurring: !!p.recurring,
    stripeReady: !!p.stripeReady,
    phase: p.phase || 1,
    unlocks: p.unlocks || null,
    schoolId: p.schoolId || null,
  };
}

function formatPrice(product) {
  var amount = '$' + (Number(product.priceUsd) % 1 === 0 ? product.priceUsd : product.priceUsd.toFixed(2));
  return amount + (product.priceSuffix || '');
}

function getFilteredProducts() {
  var q = shopSearchQuery.trim().toLowerCase();
  return SHOP_PRODUCTS.filter(function (p) {
    if (activeCategory !== 'all' && p.category !== activeCategory) return false;
    if (!q) return true;
    return (p.name || '').toLowerCase().indexOf(q) >= 0 ||
      (p.description || '').toLowerCase().indexOf(q) >= 0;
  }).sort(function (a, b) {
    return (a.sortOrder || 999) - (b.sortOrder || 999);
  });
}

function renderShopPage() {
  renderPhaseBanner();
  renderCategoryFilters();
  renderProductGrid();
  var countEl = document.getElementById('shopProductCount');
  if (countEl) countEl.textContent = getFilteredProducts().length + ' items';
}

function renderPhaseBanner() {
  var banner = document.getElementById('shopPhaseBanner');
  var note = document.getElementById('shopCatalogNote');
  var phaseInfo = SHOP_PHASES.find(function (ph) { return ph.id === SHOP_ACTIVE_PHASE; });
  var label = phaseInfo ? phaseInfo.label : ('Phase ' + SHOP_ACTIVE_PHASE);
  var checkoutReady = SHOP_PRODUCTS.filter(function (p) { return p.stripeReady; }).length;
  if (banner) {
    banner.textContent = 'Rollout phase ' + SHOP_ACTIVE_PHASE + ': ' + label +
      ' — ' + checkoutReady + ' of ' + SHOP_PRODUCTS.length + ' items ready for checkout.';
  }
  if (note) {
    note.textContent = SHOP_PRODUCTS.length + ' products available now. More categories unlock in later phases.';
  }
}

function renderCategoryFilters() {
  var bar = document.getElementById('shopCategoryBar');
  if (!bar) return;
  bar.innerHTML = '';
  var visibleCats = {};
  SHOP_PRODUCTS.forEach(function (p) { visibleCats[p.category] = true; });
  SHOP_CATEGORIES.filter(function (cat) {
    return cat.id === 'all' || visibleCats[cat.id];
  }).forEach(function (cat) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shop-cat-btn' + (activeCategory === cat.id ? ' active' : '');
    btn.textContent = (cat.icon ? cat.icon + ' ' : '') + cat.label;
    btn.addEventListener('click', function () {
      activeCategory = cat.id;
      renderShopPage();
    });
    bar.appendChild(btn);
  });
}

function renderProductGrid() {
  var grid = document.getElementById('shopProductGrid');
  if (!grid) return;
  var products = getFilteredProducts();
  grid.innerHTML = '';
  if (products.length === 0) {
    grid.innerHTML = '<p class="shop-empty">No products match your filter.</p>';
    return;
  }
  products.forEach(function (p) {
    grid.appendChild(buildProductCard(p));
  });
}

function buildProductCard(p) {
  var card = document.createElement('div');
  var canCheckout = !!p.stripeReady;
  card.className = 'product-card' + (canCheckout ? '' : ' product-card--soon');
  if (canCheckout) {
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
  }
  var badge = p.type === 'bundle' ? '<span class="bundle-badge">Bundle</span>' : '';
  if (!canCheckout) badge += '<span class="soon-badge">Coming soon</span>';
  var savings = p.originalPriceUsd
    ? '<p class="savings-text">Was $' + p.originalPriceUsd + '</p>'
    : '';
  var btnLabel = canCheckout
    ? (p.type === 'subscription' ? 'Subscribe' : 'Buy Now')
    : 'Coming soon';
  var btnClass = canCheckout ? 'product-btn btn btn-primary' : 'product-btn btn btn-secondary';
  card.innerHTML =
    badge +
    '<div class="product-image">' + escapeShopHtml(p.icon || '📘') + '</div>' +
    '<h3 class="product-name">' + escapeShopHtml(p.name) + '</h3>' +
    '<p class="product-description">' + escapeShopHtml(p.description || '') + '</p>' +
    savings +
    '<p class="product-price">' + escapeShopHtml(formatPrice(p)) + '</p>' +
    '<button type="button" class="' + btnClass + '"' + (canCheckout ? '' : ' disabled') + '>' +
    btnLabel +
    '</button>';
  if (canCheckout) {
    function go() { buyProduct(p.id); }
    card.addEventListener('click', go);
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
    card.querySelector('.product-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      go();
    });
  }
  return card;
}

function escapeShopHtml(text) {
  if (!text) return '';
  var d = document.createElement('div');
  d.textContent = String(text);
  return d.innerHTML;
}

document.getElementById('shopSearchInput')?.addEventListener('input', function (e) {
  shopSearchQuery = e.target.value || '';
  renderProductGrid();
  var countEl = document.getElementById('shopProductCount');
  if (countEl) countEl.textContent = getFilteredProducts().length + ' items';
});

async function buyProduct(productId) {
  var product = PRODUCT_CATALOG[productId];
  if (!product) {
    alert('Product not found. Refresh the shop page.');
    return;
  }
  if (!product.stripeReady) {
    alert('Checkout for this item is not available yet. It will open in a later shop phase.');
    return;
  }
  if (!currentUserId) {
    window.location.href = '/auth?next=' + encodeURIComponent('/shop.html');
    return;
  }
  window.location.href = '/checkout.html?product=' + encodeURIComponent(productId);
}

async function subscribeToTier(tierId) {
  buyProduct(tierId);
}

async function createOrder(orderData) {
  try {
    const orderRef = await firebase.firestore().collection('orders').add({
      userId: currentUserId,
      userEmail: shopCurrentUser.email,
      productId: orderData.productId,
      productName: orderData.productName,
      productType: orderData.productType,
      amount: orderData.amount,
      currency: orderData.currency || 'USD',
      paymentMethod: orderData.paymentMethod || 'stripe',
      status: 'completed',
      stripeSessionId: orderData.stripeSessionId || null,
      stripePaymentIntentId: orderData.stripePaymentIntentId || null,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      metadata: orderData.metadata || {},
    });
    await firebase.firestore().collection('users').doc(currentUserId).update({
      purchases: firebase.firestore.FieldValue.arrayUnion(orderRef.id),
    });
    return orderRef.id;
  } catch (error) {
    console.error('[Shop] Order creation failed:', error);
    throw error;
  }
}

async function _creditAmbassadorReferral(userRef, tier, wasAlreadySubscribed) {
  if (wasAlreadySubscribed) return;
  try {
    const userSnap = await userRef.get();
    const referralCode = userSnap.exists ? userSnap.data().referredBy : null;
    if (!referralCode) return;
    const ambSnap = await firebase.firestore().collection('ambassadors')
      .where('sbdReferralCode', '==', referralCode).limit(1).get();
    if (ambSnap.empty) return;
    const tierKey = tier || 'foundation';
    await ambSnap.docs[0].ref.update({
      'sbdReferrals.subscribers': firebase.firestore.FieldValue.increment(1),
      ['sbdReferrals.' + tierKey]: firebase.firestore.FieldValue.increment(1),
    });
  } catch (_) {}
}

async function unlockContent(productId) {
  const product = PRODUCT_CATALOG[productId];
  if (!product || !product.unlocks) return;
  try {
    const userRef = firebase.firestore().collection('users').doc(currentUserId);
    const preSnap = await userRef.get();
    const preData = preSnap.exists ? preSnap.data() : {};
    const wasAlreadySubscribed = preData.subscription?.status === 'active';

    if (product.unlocks.type === 'tier') {
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);
      await userRef.update({
        tier: product.unlocks.tier,
        'subscription.tier': product.unlocks.tier,
        'subscription.status': 'active',
        'subscription.startDate': firebase.firestore.FieldValue.serverTimestamp(),
        'subscription.endDate': firebase.firestore.Timestamp.fromDate(endDate),
        'subscription.lastPayment': firebase.firestore.FieldValue.serverTimestamp(),
      });
      await _creditAmbassadorReferral(userRef, product.unlocks.tier, wasAlreadySubscribed);
    } else if (product.unlocks.type === 'course' && product.unlocks.courseIds) {
      await userRef.update({
        ownedCourses: firebase.firestore.FieldValue.arrayUnion(...product.unlocks.courseIds),
      });
    } else if (product.unlocks.type === 'bundle') {
      if (product.unlocks.products) {
        for (const prodId of product.unlocks.products) {
          const sub = PRODUCT_CATALOG[prodId];
          if (sub && sub.unlocks && sub.unlocks.courseIds) {
            await userRef.update({
              ownedCourses: firebase.firestore.FieldValue.arrayUnion(...sub.unlocks.courseIds),
            });
          }
        }
      }
      if (product.unlocks.subscription) {
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + product.unlocks.subscription.months);
        await userRef.update({
          tier: product.unlocks.subscription.tier,
          'subscription.tier': product.unlocks.subscription.tier,
          'subscription.status': 'active',
          'subscription.startDate': firebase.firestore.FieldValue.serverTimestamp(),
          'subscription.endDate': firebase.firestore.Timestamp.fromDate(endDate),
        });
        await _creditAmbassadorReferral(userRef, product.unlocks.subscription.tier, wasAlreadySubscribed);
      }
    }
    showNotification('Purchase applied! Check My Learning.', 'success');
  } catch (error) {
    console.error('[Shop] Content unlock failed:', error);
    throw error;
  }
}

function showNotification(message, type) {
  if (type === 'error') alert('❌ ' + message);
  else if (type === 'success') alert('✅ ' + message);
}

document.querySelector('.back-btn')?.addEventListener('click', () => window.history.back());

console.log('[Shop] Phased catalog shop v3');
