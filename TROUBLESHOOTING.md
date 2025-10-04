# Stripe Payment Troubleshooting Quick Reference

## Common Issues and Solutions

### 1. Card Element Not Showing / Empty Box

**Symptoms:**
- Card information box is empty
- No input fields visible
- Just a white/empty box where card should be

**Causes & Solutions:**

#### A. Using Live Keys over HTTP
**Cause:** Live Stripe keys (`pk_live_...`) require HTTPS  
**Solution:** 
- Deploy to HTTPS site (marriageducation.com has SSL)
- OR use test keys for local HTTP testing: `pk_test_...`

#### B. Stripe.js Not Loaded
**Check:** Open browser console, look for errors  
**Solution:**
```html
<!-- Verify this line exists in <head> -->
<script src="https://js.stripe.com/v3/"></script>
```

#### C. Ad Blocker / Content Blocker
**Cause:** Browser extensions blocking Stripe.js  
**Solution:** Disable ad blockers or test in incognito mode

#### D. CSS Conflicts
**Check:** Inspect element, look for conflicting styles  
**Solution:** Run verification script:
```bash
./verify-stripe-implementation.sh
```

### 2. PayPal Still Showing Up

**Symptoms:**
- PayPal buttons or tabs visible
- Old payment form showing

**Causes & Solutions:**

#### A. Browser Cache
**Solution:** Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

#### B. CDN/Server Cache
**Solution:** 
- Clear server cache if using caching plugin
- Wait 5-10 minutes for CDN to update
- Add cache-busting: `?v=timestamp` to URL

#### C. Wrong File Being Served
**Solution:** Verify correct file is deployed:
```bash
curl https://marriageducation.com/payment.html | grep -i paypal
# Should return no results
```

### 3. Stripe Elements Not Styling Correctly

**Symptoms:**
- Card element looks unstyled
- Wrong colors or fonts
- Border issues

**Solution:** Check CSS exists:
```css
/* These should exist in style.css */
#card-element {
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  min-height: 44px;
}

.StripeElement {
  height: 44px;
  padding: 10px 12px;
  /* ... more styles ... */
}
```

### 4. Form Submission Not Working

**Symptoms:**
- Button click does nothing
- No errors in console
- Form doesn't submit

**Causes & Solutions:**

#### A. JavaScript Errors
**Check:** Browser console for errors  
**Solution:** Fix JavaScript errors before form code runs

#### B. Button Disabled
**Check:** Inspect button element  
**Solution:** Ensure button isn't permanently disabled

#### C. Event Listener Not Attached
**Check:** Console log in form handler  
**Solution:** Verify JavaScript runs after DOM loads

### 5. "Stripe is not defined" Error

**Cause:** Stripe.js loaded after your script runs  
**Solution:** Ensure Stripe.js loads in `<head>`:
```html
<head>
  <!-- Load Stripe.js FIRST -->
  <script src="https://js.stripe.com/v3/"></script>
</head>
<body>
  <!-- Your form here -->
  
  <!-- Your script LAST -->
  <script>
    // Initialize Stripe here
  </script>
</body>
```

### 6. Different Display in VS Code vs Browser

**Cause:** Different caching, different engines  
**Solution:**
1. Clear browser cache completely
2. Use incognito/private mode
3. Check browser console for errors
4. Verify HTTPS for live keys

## Quick Diagnostic Commands

```bash
# 1. Verify implementation is clean
./verify-stripe-implementation.sh

# 2. Check for PayPal references
grep -i "paypal" payment.html
# Should output: (nothing)

# 3. Check Stripe.js is loaded
grep "js.stripe.com" payment.html
# Should output: <script src="https://js.stripe.com/v3/"></script>

# 4. Count CSS definitions (should be 1 each)
grep -c "^#card-element" style.css
grep -c "^#card-errors" style.css
```

## Testing Checklist

### Local Testing (HTTP)
- [ ] Use test keys: `pk_test_...`
- [ ] Verify page loads
- [ ] Check browser console for errors
- [ ] Verify card element renders
- [ ] Test form validation

### Production Testing (HTTPS)
- [ ] Use live keys: `pk_live_...`
- [ ] Deploy to HTTPS site
- [ ] Clear all caches
- [ ] Test in multiple browsers
- [ ] Verify card element renders
- [ ] Test with Stripe test cards:
  - Success: 4242 4242 4242 4242
  - Decline: 4000 0000 0000 0002

## Browser Console Checks

Open Developer Tools (F12), check:

1. **Network Tab:**
   - `js.stripe.com/v3/` should load (200 OK)
   - No failed requests

2. **Console Tab:**
   - No red errors
   - Look for "Stripe" object exists

3. **Elements Tab:**
   - `#card-element` should contain an iframe
   - StripeElement class should be present

## When All Else Fails

1. **Compare with working version:**
   ```bash
   git diff HEAD~1 payment.html
   git diff HEAD~1 style.css
   ```

2. **Restore from backup:**
   ```bash
   git checkout HEAD~1 -- payment.html style.css
   ```

3. **Use test page:**
   - Check `test-pages/clean-payment-test.html`
   - Has minimal CSS/JS for debugging

4. **Contact Support:**
   - Stripe Support: https://support.stripe.com
   - Check Stripe Status: https://status.stripe.com

## Documentation References

- `STRIPE_IMPLEMENTATION.md` - Full implementation guide
- `VERIFICATION_REPORT.md` - Verification results
- Stripe Docs: https://stripe.com/docs/stripe-js

---

**Quick Fix Command:**
```bash
# Run this to verify everything is correct
./verify-stripe-implementation.sh
```

If all checks pass ✅, the issue is likely environment-related (HTTPS, caching, etc.)
