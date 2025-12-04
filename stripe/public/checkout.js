// Redirect to Stripe hosted checkout (works over HTTP for local testing)
// Version banner to confirm the exact script loaded in the browser
// v6: Hardcoded production path to /stripe/create-checkout-session for cache resilience
console.log('✅ checkout.js v6 loaded (redirect mode) -', new Date().toISOString(), 'origin:', window.location.origin);
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
  // Get product ID from URL
  const productId = getUrlParameter('product');
  console.log('🔍 Creating checkout session for product:', productId);

  if (!productId) {
    document.getElementById('checkout').innerHTML = '<p style="color:red;">Missing product ID</p>';
    return;
  }

  // Show loading message
  document.getElementById('checkout').innerHTML = '<p>Loading secure checkout...</p>';

  try {
    // Hardcoded live production path to survive caching: always use /stripe prefix on marriageducation.com
    const isProduction = window.location.hostname === 'marriageducation.com' || window.location.hostname === 'www.marriageducation.com';
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const prefix = isProduction ? '/stripe' : (isLocal ? '' : '/stripe');
    const apiUrl = `${window.location.origin}${prefix}/create-checkout-session`;
    console.log('📡 Calling API to create checkout session...', apiUrl, 'product:', productId, 'env:', isProduction ? 'PRODUCTION' : 'LOCAL');
    // Always call same-origin Ruby endpoint explicitly to avoid wrong-origin issues
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        product_id: productId
      })
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