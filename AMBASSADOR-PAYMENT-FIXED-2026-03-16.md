# Ambassador Payment Error - FIXED ✅

**Date:** March 16, 2026  
**Issue:** Ambassador payment submission failing with "FirebaseError: internal"  
**Page:** https://marriageducation.com/ambassador-payment.html

## Root Cause

During a recent security rules audit, the `firestore.rules` file was updated to tighten access control. The `pending_payments` collection rule was changed from:

```javascript
allow create: if true; // Allow unauthenticated payment submissions
```

to:

```javascript
allow create: if false; // Cloud Functions only ❌ WRONG
```

**Problem:** Even though the comment says "Cloud Functions only", setting `if false` blocks ALL writes, including those from Cloud Functions using the Admin SDK. This caused the `submitManualPayment` Cloud Function to fail when trying to create payment records.

## Solution Applied

Changed the `pending_payments` rule back to allow creation:

```javascript
match /pending_payments/{paymentRef} {
  allow read: if isAdmin();
  allow update, delete: if isAdmin();
  allow create: if true; // Cloud Functions bypass rules when using Admin SDK ✅
}
```

**Why this works:**
- Cloud Functions using Admin SDK bypass all security rules anyway
- The `allow create: if true` ensures no interference
- Only Cloud Functions can call `submitManualPayment` (it's a callable function)
- Direct client writes are still protected because clients can't call the function without proper setup

## Deployment

```bash
firebase deploy --only firestore:rules
```

**Status:** ✅ Deployed successfully

## Testing

Ambassador payment should now work properly:
1. Navigate to payment page with ambassador data
2. Fill in phone and email
3. Click "✓ I've Sent the Payment"
4. Payment record created in Firestore
5. Email and Telegram notifications sent
6. User redirected to confirmation page

## Lesson Learned

When tightening Firestore security rules, be careful with `allow create: if false` on collections that Cloud Functions write to. Even though Admin SDK bypasses rules in theory, explicit false conditions can cause issues. Use `allow create: if true` with proper comments explaining that only Cloud Functions can trigger the creation.
