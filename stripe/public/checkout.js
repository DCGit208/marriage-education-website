// Stripe publishable key (safe to expose in client-side code)
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

  const fetchClientSecret = async () => {
    // Use production URL if deployed, otherwise localhost
    const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
      ? 'http://localhost:4242' 
      : window.location.origin;
    
    const response = await fetch(`${API_URL}/create-checkout-session`, {
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
      throw new Error(errorData.error || 'An error occurred while creating the checkout session.');
    }
    const { clientSecret } = await response.json();
    return clientSecret;
  };

  try {
    const checkout = await stripe.initEmbeddedCheckout({
      fetchClientSecret,
    });
    // Mount Checkout
    checkout.mount('#checkout');
  } catch (err) {
    const checkoutDiv = document.getElementById('checkout');
    checkoutDiv.innerHTML = `<div class="error-message" style="color:red; font-weight:bold; padding:2em;">${err.message}</div>`;
  }
}