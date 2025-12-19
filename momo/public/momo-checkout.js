// MTN MOMO Checkout Script
console.log('✅ momo-checkout.js v1 loaded -', new Date().toISOString());

// Get URL parameters
function getUrlParameter(name) {
  name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
  const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
  const results = regex.exec(window.location.search);
  return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// Get product details from URL
const productId = getUrlParameter('product');
const productName = getUrlParameter('name');
const productPrice = getUrlParameter('price');
const productCurrency = getUrlParameter('currency') || 'XAF';

console.log('Product:', productId, 'Name:', productName, 'Price:', productPrice, 'Currency:', productCurrency);

// Display product info
if (productName && productPrice) {
  document.getElementById('product-name').textContent = productName;
  const priceText = `${productPrice} ${productCurrency === 'XAF' || productCurrency === 'FCFA' ? 'FCFA' : productCurrency}`;
  document.getElementById('product-price').textContent = priceText;
  document.getElementById('order-total').textContent = priceText;
} else {
  document.getElementById('product-name').textContent = 'Product information missing';
  document.getElementById('product-price').textContent = '-';
  document.getElementById('order-total').textContent = '-';
}

// Always use the correct backend - if on Render, use relative URL (same server)
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const isRender = window.location.hostname.includes('onrender.com');

const apiUrl = isLocal 
  ? 'http://localhost:4243'
  : isRender
    ? window.location.origin  // Same server on Render
    : 'https://marriage-education-momo-rp92.onrender.com';  // Fallback

console.log('API URL:', apiUrl, 'Hostname:', window.location.hostname);

// Handle form submission
document.getElementById('momo-payment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const phoneNumber = document.getElementById('phone-number').value.trim();
  const payBtn = document.getElementById('pay-btn');
  const formContainer = document.getElementById('payment-form-container');
  const loadingSpinner = document.getElementById('loading-spinner');
  const statusMessage = document.getElementById('status-message');
  
  // Validate phone number
  if (!phoneNumber || phoneNumber.length < 9) {
    showStatus('error', '❌ Please enter a valid phone number');
    return;
  }
  
  // Show loading
  formContainer.style.display = 'none';
  loadingSpinner.style.display = 'block';
  statusMessage.style.display = 'none';
  
  try {
    console.log('Creating MOMO payment request...');
    
    // Create payment request
    const response = await fetch(`${apiUrl}/create-momo-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product_id: productId,
        name: productName,
        price: productPrice,
        currency: productCurrency,
        phone_number: phoneNumber
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Payment request failed');
    }
    
    const data = await response.json();
    console.log('Payment request created:', data);
    
    // Show pending message
    loadingSpinner.style.display = 'none';
    showStatus('pending', `✅ Payment request sent!\n\nPlease check your phone (${phoneNumber}) and enter your MTN MOMO PIN to complete the payment.\n\nChecking payment status...`);
    
    // Start polling payment status
    pollPaymentStatus(data.reference_id, 0);
    
  } catch (error) {
    console.error('Payment error:', error);
    loadingSpinner.style.display = 'none';
    showStatus('error', `❌ ${error.message}\n\nPlease try again or contact support.`);
    
    // Show form again
    setTimeout(() => {
      formContainer.style.display = 'block';
      statusMessage.style.display = 'none';
    }, 5000);
  }
});

// Poll payment status
function pollPaymentStatus(referenceId, attempts) {
  const maxAttempts = 24; // 2 minutes (24 * 5 seconds)
  
  if (attempts >= maxAttempts) {
    console.log('Payment status polling timeout');
    showStatus('error', '⏱️ Payment timeout. Please check your MTN MOMO app or contact support if amount was deducted.');
    return;
  }
  
  console.log(`Checking payment status (attempt ${attempts + 1}/${maxAttempts})...`);
  
  fetch(`${apiUrl}/momo-payment-status?reference_id=${referenceId}`)
    .then(response => response.json())
    .then(data => {
      console.log('Payment status:', data);
      
      if (data.success && data.status === 'SUCCESSFUL') {
        // Payment successful!
        console.log('✅ Payment successful - Payment is now pending admin approval');
        showStatus('success', '🎉 Payment Successful!\n\nRedirecting to confirmation page...');
        
        // Redirect to payment-pending page (waiting for admin approval)
        const pendingUrl = `https://marriageducation.com/payment-pending.html?reference=${referenceId}&product=${productId}`;
        
        setTimeout(() => {
          window.location.href = pendingUrl;
        }, 1500);
        
      } else if (data.success && data.status === 'FAILED') {
        // Payment failed
        console.log('❌ Payment failed');
        const reason = data.reason ? `\n\nReason: ${data.reason}` : '';
        showStatus('error', `❌ Payment Failed${reason}\n\nPlease try again or use a different payment method.`);
        
        // Show form again
        setTimeout(() => {
          document.getElementById('payment-form-container').style.display = 'block';
          document.getElementById('status-message').style.display = 'none';
        }, 5000);
        
      } else if (data.success && data.status === 'PENDING') {
        // Still pending, continue polling
        setTimeout(() => pollPaymentStatus(referenceId, attempts + 1), 5000);
        
      } else {
        // Unknown status, continue polling
        setTimeout(() => pollPaymentStatus(referenceId, attempts + 1), 5000);
      }
    })
    .catch(error => {
      console.error('Status check error:', error);
      // Continue polling on error
      setTimeout(() => pollPaymentStatus(referenceId, attempts + 1), 5000);
    });
}

// Show status message
function showStatus(type, message) {
  const statusMessage = document.getElementById('status-message');
  statusMessage.className = `status-message ${type}`;
  statusMessage.innerHTML = message.replace(/\n/g, '<br>');
  statusMessage.style.display = 'block';
}

// Auto-focus phone input
document.getElementById('phone-number').focus();

// Format phone number as user types
document.getElementById('phone-number').addEventListener('input', (e) => {
  let value = e.target.value.replace(/[^0-9]/g, '');
  if (value.length > 12) {
    value = value.substring(0, 12);
  }
  e.target.value = value;
});
