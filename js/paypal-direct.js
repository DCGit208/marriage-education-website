// PayPal Direct Purchase Integration
// This handles immediate PayPal purchases from the shop page

class PayPalDirectPurchase {
    constructor() {
        this.merchantId = 'MDSNVRPA8J7UE';
        this.currency = 'USD';
        this.initializePayPal();
    }

    initializePayPal() {
        // Initialize PayPal SDK when available
        if (typeof paypal !== 'undefined') {
            this.setupPayPalButtons();
        } else {
            // Wait for PayPal SDK to load
            window.addEventListener('load', () => {
                if (typeof paypal !== 'undefined') {
                    this.setupPayPalButtons();
                }
            });
        }
    }

    // Create PayPal button for a specific product
    createPayPalButton(containerId, productData) {
        const container = document.getElementById(containerId);
        if (!container || typeof paypal === 'undefined') {
            console.error('PayPal container not found or PayPal not loaded');
            return;
        }

        // Clear existing buttons
        container.innerHTML = '';

        return paypal.Buttons({
            style: {
                layout: 'vertical',
                color: 'gold',
                shape: 'rect',
                label: 'paypal'
            },
            createOrder: (data, actions) => {
                return actions.order.create({
                    purchase_units: [{
                        amount: {
                            value: productData.price,
                            currency_code: this.currency
                        },
                        description: productData.description,
                        custom_id: productData.id,
                        invoice_id: `INV-${Date.now()}-${productData.id}`
                    }],
                    application_context: {
                        brand_name: 'Marriage Education',
                        landing_page: 'BILLING',
                        user_action: 'PAY_NOW',
                        return_url: `${window.location.origin}/payment-success.html`,
                        cancel_url: `${window.location.origin}/shop.html`
                    }
                });
            },
            onApprove: async (data, actions) => {
                try {
                    const order = await actions.order.capture();
                    console.log('PayPal payment successful:', order);
                    
                    // Send order details to your server for processing
                    await this.processOrderCompletion(order, productData);
                    
                    // Redirect to success page
                    window.location.href = `payment-success.html?order=${order.id}&product=${productData.id}`;
                } catch (error) {
                    console.error('Error capturing PayPal payment:', error);
                    alert('Payment processing failed. Please try again.');
                }
            },
            onError: (err) => {
                console.error('PayPal payment error:', err);
                alert('Payment failed. Please try again or contact support.');
            },
            onCancel: (data) => {
                console.log('PayPal payment cancelled:', data);
                // User cancelled, do nothing or show message
            }
        }).render(`#${containerId}`);
    }

    // Process order completion (send to your backend)
    async processOrderCompletion(paypalOrder, productData) {
        try {
            // This would typically send data to your backend server
            const orderData = {
                paypal_order_id: paypalOrder.id,
                product_id: productData.id,
                product_name: productData.name,
                amount: productData.price,
                currency: this.currency,
                customer_email: paypalOrder.payer?.email_address,
                customer_name: paypalOrder.payer?.name?.given_name + ' ' + paypalOrder.payer?.name?.surname,
                merchant_id: this.merchantId,
                timestamp: new Date().toISOString()
            };

            // For now, we'll log the order data
            // In production, you'd send this to your server
            console.log('Order completion data:', orderData);
            
            // Store in localStorage for the success page
            localStorage.setItem('lastOrder', JSON.stringify(orderData));
            
            // Send confirmation email (you'd implement this server-side)
            await this.sendOrderConfirmation(orderData);
            
        } catch (error) {
            console.error('Error processing order completion:', error);
        }
    }

    // Send order confirmation email
    async sendOrderConfirmation(orderData) {
        // This would be handled by your backend in production
        // For now, we'll create a mailto link as fallback
        const subject = `Order Confirmation - ${orderData.product_name}`;
        const body = `
Order Details:
- Product: ${orderData.product_name}
- Amount: $${orderData.amount}
- PayPal Order ID: ${orderData.paypal_order_id}
- Customer: ${orderData.customer_name}
- Email: ${orderData.customer_email}
- Date: ${orderData.timestamp}

Thank you for your purchase!
        `;
        
        // Auto-send email to orders@marriageducation.com
        const mailtoLink = `mailto:orders@marriageducation.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        
        // Open mailto link in hidden iframe to trigger email
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = mailtoLink;
        document.body.appendChild(iframe);
        
        // Remove iframe after a short delay
        setTimeout(() => {
            document.body.removeChild(iframe);
        }, 1000);
    }

    // Initialize PayPal buttons for products on the page
    setupPayPalButtons() {
        // Find all products with PayPal button containers
        const paypalContainers = document.querySelectorAll('[data-paypal-product]');
        
        paypalContainers.forEach(container => {
            const productData = {
                id: container.dataset.productId,
                name: container.dataset.productName,
                price: container.dataset.productPrice,
                description: container.dataset.productDescription || container.dataset.productName
            };
            
            this.createPayPalButton(container.id, productData);
        });
    }
}

// Initialize PayPal Direct Purchase when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.paypalDirectPurchase = new PayPalDirectPurchase();
});

// Helper function for creating quick PayPal purchases
function createQuickPayPalPurchase(productId, productName, price) {
    const productData = {
        id: productId,
        name: productName,
        price: price,
        description: productName
    };
    
    // Create a modal or redirect to payment page with PayPal option
    window.location.href = `payment.html?product=${productId}&price=${price}&name=${encodeURIComponent(productName)}`;
}
