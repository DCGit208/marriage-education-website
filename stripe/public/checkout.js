// Stripe publishable key - replace with your key or load from config
// TODO: Load from server-side config endpoint
const stripe = Stripe("pk_live_REPLACE_WITH_YOUR_PUBLISHABLE_KEY");

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