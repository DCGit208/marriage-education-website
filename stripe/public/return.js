initialize();

async function initialize() {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  const sessionId = urlParams.get('session_id');
  const paymentMethod = urlParams.get('payment_method');
  const productId = urlParams.get('product_id');

  // Handle MOMO payments differently (no Stripe session to check)
  if (paymentMethod === 'momo') {
    console.log('MOMO payment detected');
    console.log('Product ID:', productId);
    
    document.getElementById('success').classList.remove('hidden');
    document.getElementById('customer-email').textContent = 'your email';
    
    // Show download link for MOMO payment
    if (productId) {
      console.log('Creating download link for product:', productId);
      const downloadUrl = `/download?product_id=${encodeURIComponent(productId)}`;
      const link = document.getElementById('download-link');
      link.href = downloadUrl;
      document.getElementById('download-link-container').style.display = 'block';
      console.log('Download button should be visible');
    } else {
      console.error('No product_id found in URL parameters');
    }
    return;
  }

  // Handle Stripe payments
  const response = await fetch(`/session-status?session_id=${sessionId}`);
  const session = await response.json();

  if (session.status == 'open') {
    window.location.replace('http://localhost:4242/checkout.html')
  } else if (session.status == 'complete') {
    document.getElementById('success').classList.remove('hidden');
    document.getElementById('customer-email').textContent = session.customer_email;

    // Try to get product_id from session (backend must include it in /session-status response)
    if (session.product_id) {
      const downloadUrl = `/download?product_id=${encodeURIComponent(session.product_id)}`;
      const link = document.getElementById('download-link');
      link.href = downloadUrl;
      document.getElementById('download-link-container').style.display = 'block';
    }
  }
}