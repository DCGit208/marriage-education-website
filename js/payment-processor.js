// Payment Processing Integration
// This file handles Stripe and PayPal payment processing

class PaymentProcessor {
    constructor() {
        this.stripe = null;
        this.paypal = null;
        this.initializeStripe();
        this.initializePayPal();
    }

    // Initialize Stripe
    async initializeStripe() {
        // Load Stripe.js
        if (typeof Stripe !== 'undefined') {
            this.stripe = Stripe('pk_test_your_stripe_publishable_key_here'); // Replace with your actual key
        }
    }

    // Initialize PayPal
    initializePayPal() {
        // PayPal SDK will be loaded via script tag in HTML
        if (typeof paypal !== 'undefined') {
            this.paypal = paypal;
        }
    }

    // Process Stripe Payment
    async processStripePayment(amount, currency, productName, customerEmail) {
        try {
            const response = await fetch('/process-stripe-payment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    amount: amount * 100, // Stripe uses cents
                    currency: currency,
                    product_name: productName,
                    customer_email: customerEmail
                })
            });

            const { client_secret } = await response.json();

            const result = await this.stripe.confirmCardPayment(client_secret, {
                payment_method: {
                    card: this.stripe.elements().getElement('card'),
                    billing_details: {
                        email: customerEmail
                    }
                }
            });

            if (result.error) {
                throw new Error(result.error.message);
            }

            return result.paymentIntent;
        } catch (error) {
            console.error('Stripe payment failed:', error);
            throw error;
        }
    }

    // Setup PayPal Buttons
    setupPayPalButtons(containerId, amount, currency, productName) {
        return this.paypal.Buttons({
            createOrder: (data, actions) => {
                return actions.order.create({
                    purchase_units: [{
                        amount: {
                            value: amount.toString(),
                            currency_code: currency
                        },
                        description: productName
                    }]
                });
            },
            onApprove: async (data, actions) => {
                const order = await actions.order.capture();
                await this.handlePaymentSuccess(order, 'paypal');
                return order;
            },
            onError: (err) => {
                console.error('PayPal payment failed:', err);
                this.handlePaymentError(err);
            }
        }).render(`#${containerId}`);
    }

    // Handle successful payment
    async handlePaymentSuccess(paymentData, method) {
        try {
            // Send payment confirmation to server
            await fetch('/payment-success', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    payment_data: paymentData,
                    payment_method: method,
                    timestamp: new Date().toISOString()
                })
            });

            // Redirect to success page
            window.location.href = '/payment-success.html';
        } catch (error) {
            console.error('Error handling payment success:', error);
        }
    }

    // Handle payment error
    handlePaymentError(error) {
        alert('Payment failed. Please try again or contact support.');
        console.error('Payment error:', error);
    }
}

// Initialize payment processor when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.paymentProcessor = new PaymentProcessor();
});

// Utility functions for product purchases
function purchaseProduct(productId, amount, productName) {
    const modal = document.getElementById('payment-modal');
    const productNameEl = document.getElementById('modal-product-name');
    const productPriceEl = document.getElementById('modal-product-price');
    
    productNameEl.textContent = productName;
    productPriceEl.textContent = `$${amount}`;
    
    modal.style.display = 'block';
    
    // Setup payment methods for this product
    setupProductPayment(productId, amount, productName);
}

function setupProductPayment(productId, amount, productName) {
    // Setup PayPal button
    if (window.paymentProcessor && window.paymentProcessor.paypal) {
        const paypalContainer = document.getElementById('paypal-button-container');
        paypalContainer.innerHTML = ''; // Clear existing buttons
        
        window.paymentProcessor.setupPayPalButtons(
            'paypal-button-container',
            amount,
            'USD',
            productName
        );
    }
    
    // Setup Stripe form submission
    const stripeForm = document.getElementById('stripe-payment-form');
    stripeForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('customer-email').value;
        
        try {
            await window.paymentProcessor.processStripePayment(
                amount,
                'usd',
                productName,
                email
            );
        } catch (error) {
            alert('Payment failed: ' + error.message);
        }
    };
}
