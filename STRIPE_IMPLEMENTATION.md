# Stripe Payment Implementation Documentation

## Overview
This document describes the clean Stripe payment implementation for marriageducation.com.

## Main Payment Page
**File:** `payment.html`

### Features
- ✅ Clean Stripe-only implementation (no PayPal)
- ✅ Live Stripe keys for HTTPS production
- ✅ Proper Stripe Elements integration with custom styling
- ✅ Real-time card validation
- ✅ Responsive design
- ✅ Error handling and user feedback

### Key Components

#### 1. HTML Structure
- Order summary section
- Secure credit card payment form
- Stripe card element container (`#card-element`)
- Error display (`#card-errors`)
- Submit button with loading state

#### 2. JavaScript Integration
- **Stripe.js**: Loaded from `https://js.stripe.com/v3/`
- **Elements API**: Used with custom styling options
- **Card Element**: Mounted with validation handlers
- **Payment Method Creation**: Collects card details securely

#### 3. CSS Styling
**File:** `style.css`

Clean, minimal Stripe-specific styles:
```css
#card-element {
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  min-height: 44px;
}

#card-errors {
  color: #fa755a;
  font-size: 14px;
  margin-top: 8px;
  min-height: 20px;
}

.StripeElement {
  height: 44px;
  padding: 10px 12px;
  /* Standard Stripe element styles */
}
```

## Important Notes

### HTTPS Requirement
⚠️ **Live Stripe keys ONLY work over HTTPS**. For local testing, use test keys:
- Test publishable key: `pk_test_...`
- Test secret key: `sk_test_...`

### Security
- ✅ Publishable key is safe to expose in client-side code
- ❌ Never expose secret keys in client-side code
- ✅ Payment processing happens server-side via webhooks

### Files Cleaned Up
The following test/backup files have been moved to `test-pages/` or excluded via `.gitignore`:
- `payment-test-keys.html`
- `payment-test.html`
- `payment-diagnostic.html`
- `payment-alternative.html`
- `payment-old-backup.html`
- `payment-new.html`
- `clean-payment-test.html`
- `paypal-*.html` (all PayPal test files)

### Production Integration

To complete the payment flow, you need to:

1. **Create a backend endpoint** to create Payment Intents:
   ```javascript
   // Server-side (Node.js example)
   const stripe = require('stripe')('sk_live_...');
   
   app.post('/create-payment-intent', async (req, res) => {
     const { paymentMethodId, amount, currency } = req.body;
     
     const paymentIntent = await stripe.paymentIntents.create({
       amount: amount,
       currency: currency,
       payment_method: paymentMethodId,
       confirm: true,
     });
     
     res.json({ paymentIntent });
   });
   ```

2. **Set up Stripe webhooks**:
   - Endpoint: `https://marriageducation.com/stripe-webhook-simple.php`
   - Events to listen for:
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`

3. **Update frontend to call backend**:
   - Uncomment the backend integration code in `payment.html`
   - Add proper success/failure handling
   - Redirect to success page after payment

## Testing

### Test Cards (Stripe Test Mode)
- **Success:** 4242 4242 4242 4242
- **Declined:** 4000 0000 0000 0002
- **Authentication Required:** 4000 0025 0000 3155

Use any future expiry date and any 3-digit CVC.

### Local Testing
1. Use test keys for HTTP testing
2. Or set up ngrok for HTTPS tunnel: `ngrok http 8000`

### Production Testing
1. Deploy to HTTPS site
2. Test with real cards (small amounts)
3. Monitor Stripe Dashboard for transactions

## File Structure

```
/
├── payment.html          # Main payment page (PRODUCTION)
├── payment-success.html  # Success page after payment
├── style.css            # All styling including Stripe elements
├── js/
│   ├── analytics.js     # Google Analytics integration
│   ├── payment-processor.js  # Used by shop.html (includes PayPal)
│   └── paypal-direct.js      # PayPal integration (not used in payment.html)
├── test-pages/          # Test and backup pages
│   ├── payment-test-keys.html
│   ├── clean-payment-test.html
│   └── ...
└── stripe-webhook-simple.php  # Webhook handler
```

## Troubleshooting

### Card Element Not Showing
1. Check browser console for errors
2. Verify Stripe.js is loaded (check Network tab)
3. Confirm HTTPS is being used with live keys
4. Check CSS isn't hiding the element

### Payment Fails
1. Check Stripe Dashboard for error details
2. Verify webhook is receiving events
3. Check backend logs for integration errors
4. Test with different test cards

### Style Issues
1. Clear browser cache
2. Check for CSS conflicts (duplicate `#card-element` styles)
3. Verify `.StripeElement` styles are present
4. Use browser DevTools to inspect element

## Resources

- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Elements](https://stripe.com/docs/stripe-js)
- [Payment Intents API](https://stripe.com/docs/payments/payment-intents)
- [Webhook Integration](https://stripe.com/docs/webhooks)

---

Last Updated: 2025-02-04
