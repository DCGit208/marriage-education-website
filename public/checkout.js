// Redirect to Stripe hosted checkout (works over HTTP for local testing)
// Version banner to confirm the exact script loaded in the browser
// v8: Production uses Render backend at marriage-education-stripe.onrender.com
console.log('✅ checkout.js v8 loaded (redirect mode) -', new Date().toISOString(), 'origin:', window.location.origin);
console.log('🔧 Hostname:', window.location.hostname, 'Pathname:', window.location.pathname);
initialize();

// Helper to get URL parameters
function getUrlParameter(name) {
  name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
  var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
  var results = regex.exec(window.location.search);
  return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// Create a Checkout Session and redirect
async function initialize() {
  // Get product details from URL
  const productId = getUrlParameter('product');
  const productName = getUrlParameter('name');
  const productPrice = getUrlParameter('price');
  const productCurrency = getUrlParameter('currency');
  
  console.log('🔍 Creating checkout session for product:', productId, 'name:', productName, 'price:', productPrice, 'currency:', productCurrency);

  if (!productId) {
    document.getElementById('checkout').innerHTML = '<p style="color:red;">Missing product ID</p>';
    return;
  }

  // Show loading message
  document.getElementById('checkout').innerHTML = '<p>Loading secure checkout...</p>';

  try {
    // Detect environment and use appropriate API URL
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    // Use Render backend for all non-localhost environments (Firebase, iPage, etc.)
    const apiUrl = isLocal 
      ? 'http://localhost:4567/create-checkout-session'
      : 'https://marriage-education-website.onrender.com/create-checkout-session';
    
    console.log('📡 Calling API to create checkout session...', apiUrl, 'product:', productId, 'env:', isLocal ? 'LOCAL' : 'PRODUCTION');
    
    // Build request body - include dynamic pricing if provided
    const requestBody = {
      product_id: productId
    };
    if (productName) requestBody.name = productName;
    if (productPrice) requestBody.price = productPrice;
    if (productCurrency) requestBody.currency = productCurrency;
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData && errorData.error) errorMsg += ` - ${errorData.error}`;
      } catch (_) {}
      console.error('❌ API Error:', errorMsg);
      throw new Error('Failed to create checkout session');
    }

    const data = await response.json();
    console.log('✅ Received checkout URL:', data.url);

    // Redirect to Stripe hosted checkout page
    if (data.url) {
      console.log('🚀 Redirecting to Stripe checkout...');
      window.location.href = data.url;
    } else {
      throw new Error('No checkout URL received');
    }
  } catch (err) {
    console.error('❌ Checkout error:', err);
    document.getElementById('checkout').innerHTML = 
      `<div style="color:red; font-weight:bold; padding:2em;">
        <p>Error: ${err.message}</p>
        <p><a href="javascript:location.reload()">Try again</a></p>
      </div>`;
  }
}