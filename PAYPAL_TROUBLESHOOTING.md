# PayPal PAYMENT_DENIED Error - Troubleshooting Guide

## Overview
You're experiencing a PAYMENT_DENIED error with your PayPal integration after successful login. This is a common issue that can have several causes.

## Common Causes and Solutions

### 1. Merchant Account Issues
**Most Likely Cause**: Your PayPal Business account may have restrictions or verification requirements.

**Check:**
- Login to PayPal Dashboard (paypal.com/businessmanage)
- Check for any account limitations or verification requirements
- Ensure your account can accept payments in USD
- Verify your account is in good standing

### 2. Geographic/Regional Restrictions
**Issue**: PayPal may have restrictions based on merchant or buyer location.

**Solutions:**
- Ensure your business location is supported
- Check if buyer's location is supported for your merchant account
- Consider enabling international payments if needed

### 3. App Configuration Issues
**Your Current Setup:**
- App: BTHPAY
- Client ID: AV2lnBrIkt_EeUyPx_tkntdOaEPnLAlWgWs7qgj7NXT4JoMLLioU_NDJoYOOrYkCpsrfCyooDDc281qO
- Merchant ID: MDSNVRPA8J7UE

**Check:**
- Ensure app has correct permissions
- Verify live credentials are active
- Check app settings in PayPal Developer Dashboard

### 4. Order Structure Issues
**Fixed**: I've simplified the order structure in payment.html to use minimal required fields.

## Testing Steps

### Step 1: Test with Simple Integration
Use the new `paypal-simple-test.html` file:
```
http://localhost/paypal-simple-test.html
```

This tests with a minimal $5.00 transaction.

### Step 2: Test Different Amounts
Try these amounts to see if there's a threshold issue:
- $1.00
- $5.00
- $10.00
- $19.99

### Step 3: Test with Different PayPal Accounts
- Try with different PayPal buyer accounts
- Test with accounts from different countries
- Use both personal and business buyer accounts

## Alternative Solutions

### Option 1: PayPal Express Checkout
Consider switching to PayPal Express Checkout which has fewer restrictions.

### Option 2: PayPal Standard Integration
Use PayPal's standard hosted checkout instead of JavaScript SDK.

### Option 3: Stripe Primary, PayPal Secondary
Make Stripe your primary payment method and PayPal as backup.

## Immediate Action Items

1. **Check PayPal Business Account**
   - Login to paypal.com/businessmanage
   - Review any notifications or limitations
   - Complete any pending verifications

2. **Test Simple Integration**
   - Use `paypal-simple-test.html`
   - Monitor browser console for detailed errors

3. **Contact PayPal Support**
   - If issues persist, contact PayPal Merchant Support
   - Reference your Merchant ID: MDSNVRPA8J7UE
   - Mention the PAYMENT_DENIED error

4. **Verify App Permissions**
   - Login to developer.paypal.com
   - Check your BTHPAY app settings
   - Ensure all required permissions are enabled

## Updated Payment Integration

I've updated your `payment.html` with:
- Simplified PayPal SDK loading
- Minimal order structure
- Better error handling
- Cleaner code without duplications

The integration should now be more stable and provide clearer error messages.

## Next Steps

1. Test the updated payment.html
2. Try the simple test page
3. Check your PayPal business account for any issues
4. If problems persist, consider the alternative solutions above

## Files Updated
- ✅ payment.html (simplified and optimized)
- ✅ paypal-simple-test.html (new diagnostic tool)
- ✅ This troubleshooting guide
