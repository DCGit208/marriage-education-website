# Deploy Updated Files to Live Site

## Files That Need to be Uploaded to iPage

Upload these updated files via FTP to **marriageducation.com**:

### 1. Payment Pages (Priority - Customer Facing)
```
/payment.html
/public/payment.html
/public/momo-manual-payment.html
/rd-payment.html
```

### 2. Stripe Checkout Scripts
```
/public/checkout.js
/stripe/public/checkout.js
```

### 3. Ambassador System
```
/ambassador-login.html
/ambassador-register.html
/ambassador/dashboard.html
```

### 4. Regional Director System
```
/regional-director/dashboard.html
```

### 5. Utility Pages
```
/payment-pending.html
/public/resend-link.html
```

---

## Quick FTP Upload Command

If you have your FTP credentials in `.netrc_ftp`, you can use:

```bash
cd /Users/achugustave/Documents/Marriageducation
sh deploy-to-ftp.sh
```

Or manually upload the files above using FileZilla or any FTP client:
- **Host:** ftp.marriageducation.com (or iPage FTP server)
- **Username:** Your iPage FTP username
- **Password:** Your iPage FTP password
- **Port:** 21

---

## Verification After Upload

### 1. Check Payment Form
- Visit: https://marriageducation.com/payment.html
- Open browser DevTools (F12) → Console tab
- Click "Pay with MOMO"
- Look for: `🚀 Redirecting to: https://marriageducation.com/public/momo-manual-payment.html`
- **Should NOT see:** Any `onrender.com` URLs

### 2. Check Stripe Checkout
- Visit: https://marriageducation.com/shop.html
- Select a product
- Click "Buy with Card"
- In Console, look for: `📡 Calling Firebase Cloud Function...`
- Should see: `https://us-central1-marriage-education.cloudfunctions.net/createCheckoutSession`

### 3. Test Payment Submission
- Go to MOMO payment form
- Fill in test payment details
- Submit form
- Should see success message
- Check admin dashboard for new pending payment
- Check Telegram for notification

### 4. Verify No Render Calls
Open DevTools → Network tab, filter by "onrender":
- Navigate through payment flows
- Should see **0 requests** to onrender.com

---

## If You See Errors

### Error: "Failed to create checkout session"
**Cause:** Firebase Cloud Function not deployed or Stripe config missing  
**Fix:**
```bash
firebase deploy --only functions:createCheckoutSession
firebase functions:config:set stripe.secret_key="sk_live_..."
```

### Error: "FirebaseError: internal"
**Cause:** Firebase config not loaded properly  
**Fix:** Payment forms now have inline Firebase config - verify uploaded correctly

### Error: "API_BASE is not defined"
**Cause:** Ambassador/RD dashboard needs Firebase integration  
**Fix:** These dashboards now use Firestore directly (no API_BASE needed)

---

## Firebase is Already Deployed ✅

Firebase Cloud Functions are **already deployed and live**:
- ✅ `createCheckoutSession` - Stripe checkout
- ✅ `submitManualPayment` - Payment submissions
- ✅ `approvePayment` - Admin approvals
- ✅ All other functions

**You only need to upload the HTML/JS files to iPage.**

---

## Shutdown Render (When Ready)

Once you verify everything works:

1. **Test thoroughly** (at least 2-3 real payments)
2. **Monitor for 24 hours** to ensure no issues
3. **Then:** Log into Render.com and delete the deployment

---

## Rollback (If Needed)

If something breaks and you need to rollback temporarily:

1. Keep Render running
2. Revert payment.html and checkout.js to use Render URLs
3. Debug the issue
4. Re-deploy when fixed

---

## Support

- **Firebase Console:** https://console.firebase.google.com/project/marriage-education
- **Firebase Functions Logs:** Check for errors in Cloud Functions
- **iPage Support:** For FTP/hosting issues

---

**Ready to deploy?** Upload the files listed above and test! 🚀
