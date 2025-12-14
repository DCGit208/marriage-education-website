# 🚀 Payment Webhook & Auto-Enrollment Setup

Complete guide to deploy Firebase Cloud Functions for automatic student enrollment after payment.

---

## Overview

When a student pays via Stripe or MTN MoMo:
1. Payment provider sends webhook to Firebase Cloud Function
2. Function creates enrollment record in Firestore
3. Function sends welcome email with course access link
4. Student is instantly enrolled - no manual work needed!

---

## Prerequisites

✅ Firebase project: `marriage-education` (already configured)
✅ Stripe account with API keys
✅ Node.js 18+ installed
✅ Firebase CLI installed (`npm install -g firebase-tools`)

---

## Step 1: Install Firebase CLI

```bash
# Install globally
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize project (from your repo root)
cd /Users/achugustave/Documents/Marriageducation
firebase init
```

When prompted:
- Select: **Functions, Firestore, Hosting**
- Use existing project: `marriage-education`
- Functions language: **JavaScript**
- Install dependencies: **Yes**

---

## Step 2: Deploy Cloud Functions

```bash
# From repo root
cd functions
npm install

# Deploy to Firebase
firebase deploy --only functions
```

This deploys:
- `stripeWebhook` - Handles Stripe payments
- `momoWebhook` - Handles MTN MoMo payments
- `checkEnrollment` - Verifies student access

---

## Step 3: Configure Firebase Function Secrets

Set environment variables for your functions:

```bash
# Stripe configuration
firebase functions:config:set stripe.secret_key="sk_live_YOUR_STRIPE_SECRET_KEY"
firebase functions:config:set stripe.webhook_secret="whsec_YOUR_WEBHOOK_SECRET"

# Email configuration (iPage SMTP)
firebase functions:config:set email.user="train@marriageducation.com"
firebase functions:config:set email.password="YOUR_EMAIL_PASSWORD"

# Redeploy after setting config
firebase deploy --only functions
```

---

## Step 4: Configure Stripe Webhook

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
2. Click **Add Endpoint**
3. URL: `https://us-central1-marriage-education.cloudfunctions.net/stripeWebhook`
4. Events to send:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
5. Copy the **Signing Secret** (starts with `whsec_`)
6. Add to Firebase config (see Step 3)

---

## Step 5: Update Stripe Checkout to Send Course Metadata

Your Stripe checkout needs to include courseId in metadata:

**Option A: Use Stripe Checkout Session (Recommended)**

Create a server endpoint that creates checkout sessions with metadata:

```javascript
// In your Stripe checkout handler
const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: [{
    price_data: {
      currency: 'usd',
      product_data: {
        name: courseName,
      },
      unit_amount: price * 100, // cents
    },
    quantity: 1,
  }],
  mode: 'payment',
  success_url: 'https://marriageducation.com/success.html?product_id={CHECKOUT_SESSION_ID}',
  cancel_url: 'https://marriageducation.com/payment.html',
  metadata: {
    courseId: 'teleios-blueprint',  // IMPORTANT!
    email: customerEmail,
    name: customerName
  }
});
```

**Option B: Update Existing Stripe Integration**

If you're using Stripe Payment Links, add custom fields for courseId in the link settings.

---

## Step 6: Configure MTN MoMo Webhook

1. In your MTN MoMo dashboard, set webhook URL to:
   `https://us-central1-marriage-education.cloudfunctions.net/momoWebhook`

2. Update your MoMo payment request to include courseId in `externalId`:
   ```javascript
   externalId: `${courseId}_${Date.now()}`
   ```

---

## Step 7: Deploy Firestore Security Rules

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

This enables:
- Students can only read their own enrollments
- Admin can read/write everything
- Public can read courses

---

## Step 8: Test the Webhook

### Test Stripe Webhook (Stripe CLI)

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local function
stripe listen --forward-to https://us-central1-marriage-education.cloudfunctions.net/stripeWebhook

# Trigger test payment
stripe trigger checkout.session.completed
```

### Test MoMo Webhook

Use MTN MoMo sandbox:
1. Create test payment with `externalId: teleios-blueprint_1234567890`
2. Mark as successful in sandbox
3. Check Firestore for new enrollment record

---

## Step 9: Verify Email Sending

Test email delivery:

```bash
# Check Firebase Functions logs
firebase functions:log --only stripeWebhook

# Look for "📧 Course access email sent to..."
```

If emails aren't sending:
- Verify iPage SMTP credentials
- Check spam folder
- Review Firebase Functions logs for errors

---

## Step 10: Update Payment Pages

### payment.html
Already updated with all 44 course IDs ✅

### success.html
Already updated to show course access ✅

### Stripe Checkout
Needs to pass `courseId` in metadata (see Step 5)

---

## Webhook Endpoints

After deployment, your webhook URLs will be:

**Stripe Webhook:**
```
https://us-central1-marriage-education.cloudfunctions.net/stripeWebhook
```

**MoMo Webhook:**
```
https://us-central1-marriage-education.cloudfunctions.net/momoWebhook
```

**Check Enrollment (Callable):**
```javascript
const checkEnrollment = firebase.functions().httpsCallable('checkEnrollment');
const result = await checkEnrollment({ courseId: 'teleios-blueprint', email: 'student@example.com' });
```

---

## Firebase Console Monitoring

Monitor enrollments:
1. Go to [Firebase Console](https://console.firebase.google.com/project/marriage-education/firestore)
2. Select **Firestore Database**
3. View collections:
   - `enrollments/` - All student enrollments
   - `courses/` - Course metadata
   - `progress/` - Student progress tracking

Check function logs:
1. Go to **Functions** tab
2. Click on function name
3. View **Logs** tab

---

## Troubleshooting

### Webhook Not Firing

**Symptom:** Payment succeeds but no enrollment created

**Solutions:**
- Check Stripe Dashboard → Webhooks → Event logs
- Verify webhook URL is correct
- Check Firebase Functions logs: `firebase functions:log`
- Ensure courseId is in payment metadata

### Email Not Sending

**Symptom:** Enrollment created but student didn't receive email

**Solutions:**
- Check Firebase Functions logs for email errors
- Verify SMTP credentials are correct
- Test email directly: `firebase functions:shell`
- Check spam/junk folder

### Student Can't Access Course

**Symptom:** Enrollment exists but course-viewer.html shows "no access"

**Solutions:**
- Verify enrollment status is "active"
- Check Firestore security rules
- Verify student email matches enrollment record
- Test with `checkEnrollment` function

---

## Cost Estimate (Firebase Free Tier)

- **Cloud Functions:** 2M invocations/month (free)
- **Firestore:** 50K reads, 20K writes/day (free)
- **Hosting:** 10GB bandwidth/month (free)

Your enrollment webhooks will use ~1-2 function calls per payment.
**Estimated cost:** $0/month for <10K enrollments/month

---

## Security Best Practices

✅ Verify webhook signatures (already implemented)
✅ Use environment variables for secrets (Firebase config)
✅ Firestore security rules prevent unauthorized access
✅ HTTPS only (Firebase enforces)
✅ Log all enrollment attempts for audit

---

## Next Steps

Once webhooks are deployed:

1. **Test end-to-end:**
   - Make test purchase → Check Firestore → Verify email → Access course

2. **Monitor for 48 hours:**
   - Watch Firebase Functions logs
   - Check enrollment counts
   - Verify email delivery rates

3. **Add features:**
   - Enrollment expiration (if needed)
   - Completion certificates
   - Progress tracking webhooks
   - Student dashboard integration

---

## Support

If you need help:
- Firebase docs: https://firebase.google.com/docs/functions
- Stripe webhooks: https://stripe.com/docs/webhooks
- Email: train@marriageducation.com
- Firebase Functions logs: `firebase functions:log`
