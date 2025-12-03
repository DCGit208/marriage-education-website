// Redirect to Stripe hosted checkout (works over HTTP for local testing)
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
    console.log('📡 Calling API to create checkout session...');
    const response = await fetch("/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        product_id: productId
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ API Error:', response.status, errorData);
      throw new Error(errorData.error || 'Failed to create checkout session');
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