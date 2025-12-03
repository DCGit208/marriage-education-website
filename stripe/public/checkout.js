// This is your test publishable API key.
const stripe = Stripe("pk_live_51S4PByJFVcOiuICpKXZ5oFjIWuhbZRNuFTBdBfk8II61iBhyOVhzQQJ22AUUM938xCLobMr23IVI8miaPEmsRYTj00yKjh6776");

initialize();

// Helper to get URL parameters
function getUrlParameter(name) {
  name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
  var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
  var results = regex.exec(window.location.search);
  return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// Create a Checkout Session
async function initialize() {

  // Get product ID from URL
  const productId = getUrlParameter('product');
  console.log('🔍 Initializing checkout for product:', productId);

  const fetchClientSecret = async () => {
    console.log('📡 Fetching client secret from API...');
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
      throw new Error(errorData.error || 'An error occurred while creating the checkout session.');
    }
    const data = await response.json();
    console.log('✅ Received data:', data);
    const { clientSecret } = data;
    console.log('🔑 Client secret:', clientSecret ? 'received' : 'missing');
    return clientSecret;
  };

  try {
    console.log('🎨 Initializing Stripe embedded checkout...');
    const checkout = await stripe.initEmbeddedCheckout({
      fetchClientSecret,
    });
    console.log('✅ Stripe checkout initialized');
    // Mount Checkout
    checkout.mount('#checkout');
    console.log('✅ Checkout mounted to DOM');
  } catch (err) {
    console.error('❌ Checkout error:', err);
    const checkoutDiv = document.getElementById('checkout');
    checkoutDiv.innerHTML = `<div class="error-message" style="color:red; font-weight:bold; padding:2em;">${err.message}</div>`;
  }
}