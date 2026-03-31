/**
 * MV HOUSE PAGE - Elite Fashion Collection
 * =========================================
 * Display Muliebrity & Virility products from Firestore
 */

let currentUserId = null;
let userTier = 'free';

// ==================================================================
// INITIALIZATION
// ==================================================================

firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = '/index.html';
    return;
  }
  
  currentUserId = user.uid;
  await loadUserData();
  await checkAccessAndLoadProducts();
});

// ==================================================================
// DATA LOADING
// ==================================================================

async function loadUserData() {
  try {
    userTier = await FormationAccess.getUserTier(currentUserId);
    console.log('[MV House] User tier:', userTier);
  } catch (error) {
    console.error('[MV House] Error loading user data:', error);
  }
}

async function checkAccessAndLoadProducts() {
  // Check if user has Elite tier access
  if (userTier !== 'elite') {
    showPaywall();
    return;
  }
  
  // Load products from Firestore
  await loadProducts();
}

async function loadProducts() {
  try {
    const productsSnapshot = await firebase.firestore()
      .collection('products')
      .get();
    
    if (productsSnapshot.empty) {
      showEmptyState();
      return;
    }
    
    // Filter only MV House products
    const mvHouseProducts = productsSnapshot.docs.filter(doc => {
      const data = doc.data();
      const id = data.id || doc.id;
      return (id.startsWith('muliebrity-') || id.startsWith('virility-')) && 
             data.subcategory && 
             ['corporate', 'casual_home', 'casual_day', 'casual_night', 'official'].includes(data.subcategory);
    }).map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`[MV House] Loaded ${mvHouseProducts.length} products`);
    
    // Render products
    renderProducts(mvHouseProducts);
    
  } catch (error) {
    console.error('[MV House] Error loading products:', error);
    showErrorState();
  }
}

function renderProducts(products) {
  const grid = document.getElementById('productsGrid');
  grid.innerHTML = '';
  
  if (products.length === 0) {
    showEmptyState();
    return;
  }
  
  products.forEach(product => {
    const card = createProductCard(product);
    grid.appendChild(card);
  });
}

function createProductCard(product) {
  const card = document.createElement('div');
  card.className = 'product-card';
  card.onclick = () => openProduct(product.id);
  
  // Determine product icon
  const isWomens = product.id.startsWith('muliebrity-');
  const icon = isWomens ? '👗' : '🤵';
  
  // Format price
  const price = product.price ? `${product.price.toLocaleString()} ${product.currency || 'FCFA'}` : 'N/A';
  
  // Format category
  const category = product.subcategory ? product.subcategory.replace(/_/g, ' ') : product.category;
  
  card.innerHTML = `
    <div class="product-image">
      ${icon}
    </div>
    <div class="product-info">
      <h3 class="product-name">${product.name || 'Unnamed Product'}</h3>
      <div class="product-category">${category}</div>
      <div class="product-price">${price}</div>
      <span class="elite-badge">Elite</span>
    </div>
  `;
  
  return card;
}

function openProduct(productId) {
  // TODO: Open product detail modal
  console.log('[MV House] Opening product:', productId);
  alert(`Product details coming soon!\n\nProduct ID: ${productId}`);
}

// ==================================================================
// PAYWALL
// ==================================================================

function showPaywall() {
  document.getElementById('paywallOverlay').classList.add('active');
  
  // Hide products grid
  document.getElementById('productsGrid').innerHTML = '';
}

function closePaywall() {
  window.location.href = '/dashboard.html';
}

function showEmptyState() {
  const grid = document.getElementById('productsGrid');
  grid.innerHTML = `
    <div class="loading-container" style="grid-column: 1 / -1;">
      <div style="font-size: 3rem; margin-bottom: 16px;">🏗️</div>
      <p style="color: var(--text-secondary); font-size: 1.1rem;">MV House collection coming soon...</p>
    </div>
  `;
}

function showErrorState() {
  const grid = document.getElementById('productsGrid');
  grid.innerHTML = `
    <div class="loading-container" style="grid-column: 1 / -1;">
      <div style="font-size: 3rem; margin-bottom: 16px;">⚠️</div>
      <p style="color: var(--text-secondary); font-size: 1.1rem;">Unable to load products. Please try again.</p>
      <button class="btn btn-primary" onclick="location.reload()" style="margin-top: 20px;">Retry</button>
    </div>
  `;
}

// ==================================================================
// NAVIGATION
// ==================================================================

document.querySelector('.back-btn')?.addEventListener('click', () => {
  window.history.back();
});

console.log('[MV House] Page loaded');
