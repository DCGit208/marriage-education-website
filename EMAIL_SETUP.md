# 📧 Email Setup Instructions

## SendGrid Setup (Free - 100 emails/day)

### Step 1: Create SendGrid Account
1. Go to: https://signup.sendgrid.com/
2. Sign up for **FREE** account
3. Verify your email address

### Step 2: Get API Key
1. Login to SendGrid dashboard
2. Go to: **Settings** → **API Keys**
3. Click **Create API Key**
4. Name it: `marriage-education-downloads`
5. Select: **Full Access**
6. Click **Create & View**
7. **COPY THE KEY** (you'll only see it once!)

### Step 3: Verify Sender Email
1. Go to: **Settings** → **Sender Authentication**
2. Click **Verify a Single Sender**
3. Fill in your details:
   - From Name: `Marriage Education`
   - From Email: `noreply@marriageducation.com` (or your email)
   - Reply To: `support@marriageducation.com`
4. Check your email and verify

### Step 4: Add to Render
1. Go to: https://dashboard.render.com
2. Select your service: `marriage-education-website`
3. Go to **Environment** tab
4. Add these variables:
   ```
   SENDGRID_API_KEY = SG.xxxxxxxxxxxxxxxxxxxxxxxxxxx (paste your key)
   FROM_EMAIL = noreply@marriageducation.com (your verified email)
   ```
5. Click **Save Changes**
6. Service will auto-redeploy

## Test Email Sending

After setup, when you approve a payment in admin panel:
- ✅ Email sent automatically → Green notification
- ❌ Email failed → Red alert, copy link manually

## Alternative: Mailgun Setup (Free - 5,000 emails/month)

If you prefer Mailgun:
1. Go to: https://signup.mailgun.com/
2. Sign up for FREE account
3. Get API key from dashboard
4. Add to Render:
   ```
   MAILGUN_API_KEY = your-key
   MAILGUN_DOMAIN = your-domain.mailgun.org
   FROM_EMAIL = noreply@yourdomain.com
   ```

## Email Template Features

The automatic email includes:
- ✅ Product name
- ✅ Secure download link
- ✅ Expiration date (7 days)
- ✅ Download limit notice (5 downloads max)
- ✅ Support contact info
- ✅ Professional HTML design

## Important Notes

- **Without SendGrid key:** System still works, but you must manually send links
- **Free tier limits:** 100 emails/day (SendGrid) or 5,000/month (Mailgun)
- **Sender verification:** Must verify your email before sending works
- **Test first:** Approve a test payment to yourself to verify emails work

## Current Status

Check if email is configured:
- Visit: https://marriage-education-website.onrender.com/health
- Look for email status in response

## Troubleshooting

**Emails not sending?**
1. Check Render environment variables are set
2. Verify sender email in SendGrid
3. Check SendGrid dashboard for error logs
4. Test with your own email first

**Emails going to spam?**
1. Add SPF/DKIM records (SendGrid provides instructions)
2. Ask customers to check spam folder
3. Consider using your own domain email

## Support

Questions? Check:
- SendGrid Docs: https://docs.sendgrid.com/
- Mailgun Docs: https://documentation.mailgun.com/
