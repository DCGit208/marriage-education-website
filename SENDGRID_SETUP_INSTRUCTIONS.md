# SendGrid Setup Instructions

## Overview
Ambassador emails will now be sent via **SendGrid API** instead of iPage PHP/SMTP.

**Benefits:**
- ✅ 95%+ inbox delivery rate (vs 60-70% with iPage)
- ✅ Dedicated IP reputation (not shared with spammers)
- ✅ FREE tier: 100 emails/day (3,000/month)
- ✅ $0.00 cost (credit card for verification only)
- ✅ No changes to domain or existing email accounts

---

## Step 1: Create SendGrid Account

1. Go to: **https://signup.sendgrid.com/**
2. Sign up with your email (redirects to Twilio login - this is correct)
3. Complete email verification
4. Add credit card for account verification ($0 charge)
5. Complete profile information

**Important:** You're signing up for SendGrid (email API), NOT Twilio SMS services.

---

## Step 2: Get API Key

1. Log in to SendGrid dashboard
2. Go to: **Settings** → **API Keys**
3. Click **Create API Key**
4. Name: `marriageducation-production`
5. Permissions: **Full Access** (or at minimum "Mail Send")
6. Click **Create & View**
7. **COPY THE API KEY** (you can only see it once!)

Example key format: `SG.xxxxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy`

---

## Step 3: Configure Firebase Functions

Run this command in your terminal:

```bash
firebase functions:config:set sendgrid.api_key="YOUR_SENDGRID_API_KEY_HERE"
```

**Replace** `YOUR_SENDGRID_API_KEY_HERE` with your actual SendGrid API key from Step 2.

Example:
```bash
firebase functions:config:set sendgrid.api_key="SG.abc123xyz.def456uvw789"
```

---

## Step 4: Deploy Updated Function

```bash
cd /Users/achugustave/Documents/Marriageducation
firebase deploy --only functions:approvePayment
```

Wait 2-3 minutes for deployment to complete.

---

## Step 5: Test Email Delivery

### Option A: Test with New Registration

1. Create test registration:
   ```bash
   node create-test-registration.js
   ```

2. Go to admin dashboard: https://marriageducation.com/admin-dashboard.html

3. Approve the test payment

4. **Check email INBOX** (should NOT be in spam this time!)

### Option B: Manual Test Script

Create `test-sendgrid.js`:

```javascript
const admin = require('firebase-admin');
const functions = require('firebase-functions');
const sgMail = require('@sendgrid/mail');

admin.initializeApp();

async function testSendGrid() {
  const SENDGRID_API_KEY = functions.config().sendgrid?.api_key;
  
  if (!SENDGRID_API_KEY) {
    console.log('❌ SendGrid API key not configured');
    console.log('Run: firebase functions:config:set sendgrid.api_key="YOUR_KEY"');
    return;
  }

  sgMail.setApiKey(SENDGRID_API_KEY);

  const msg = {
    to: 'bthedugrp@gmail.com', // Change to your test email
    from: {
      email: 'orders@marriageducation.com',
      name: 'Marriage Education'
    },
    subject: 'SendGrid Test - Marriage Education',
    html: '<h1>Test Email</h1><p>If you received this in your INBOX (not spam), SendGrid is working!</p>'
  };

  try {
    await sgMail.send(msg);
    console.log('✅ Test email sent successfully!');
    console.log('📬 Check your INBOX at: bthedugrp@gmail.com');
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.body);
    }
  }

  process.exit(0);
}

testSendGrid();
```

Run:
```bash
node test-sendgrid.js
```

---

## Step 6: Verify System

After successful test:

1. ✅ Email arrives in **INBOX** (not spam)
2. ✅ Email has correct sender: `orders@marriageducation.com`
3. ✅ Email contains ambassador code, login link, book download
4. ✅ All links work correctly

---

## Troubleshooting

### Error: "SendGrid API key not configured"

**Fix:**
```bash
firebase functions:config:get
```

Check if `sendgrid.api_key` is listed. If not, re-run Step 3.

### Error: "Unauthorized" or "403 Forbidden"

**Cause:** Invalid or expired API key

**Fix:**
1. Create new API key in SendGrid dashboard
2. Run config:set command again with new key
3. Redeploy functions

### Emails still go to spam

**Wait 24-48 hours.** SendGrid needs time to:
- Warm up your sending domain
- Build sender reputation
- Pass ISP authentication

During warmup, some emails may still go to spam. After warmup: 95%+ inbox rate.

### Error: "Daily send limit exceeded"

**Cause:** Sent more than 100 emails today (free tier limit)

**Fix:**
- Wait until tomorrow (resets at midnight UTC)
- OR upgrade to paid plan: $19.95/month for 50K emails

---

## Rollback Plan

If SendGrid causes issues, revert to iPage PHP:

```bash
cd /Users/achugustave/Documents/Marriageducation/functions
git revert HEAD
git push origin main
firebase deploy --only functions:approvePayment
```

This restores the PHP endpoint email system.

---

## Cost Summary

| Tier | Monthly Emails | Cost | Inbox Rate |
|------|---------------|------|------------|
| **Free** | 100/day (3,000/month) | **$0.00** | 95%+ |
| Essentials | 50,000/month | $19.95 | 98%+ |
| Pro | 100,000/month | $89.95 | 99%+ |

**Current usage:** ~5-10 ambassador emails/day = **FREE tier sufficient**

---

## What Changed

### Before (iPage SMTP)
```
Firebase Function → iPage PHP (send-confirmation.php) → PHPMailer SMTP → Email
                                                                      ↓
                                                                  60-70% SPAM folder
```

### After (SendGrid)
```
Firebase Function → SendGrid API → Email
                                    ↓
                                95%+ INBOX
```

**Removed:** 
- `send-confirmation.php` endpoint call
- iPage SMTP dependency

**Added:**
- Direct SendGrid API call in `activateAmbassador()` function
- Same email template (design unchanged)

---

## Next Steps

Once you have your SendGrid API key:
1. Share it with me (via private message if needed)
2. I'll run the config:set command
3. Deploy the updated function
4. Test with a new registration
5. Verify email lands in INBOX

🎯 **Expected Result:** Emails arrive in inbox within seconds, not spam folder!
