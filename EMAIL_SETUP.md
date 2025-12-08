# 📧 Email Setup Instructions - iPage SMTP

## iPage Email Setup (Your Existing Service)

### Step 1: Get Your iPage Email Credentials
You already have these from your iPage hosting account. You need:

1. **SMTP Server:** Usually one of these:
   - `smtp.yourdomain.com` (replace with your actual domain)
   - `mail.yourdomain.com`
   - `smtp.secureserver.net` (if using iPage's shared servers)

2. **SMTP Port:** Usually `587` (recommended) or `465`

3. **Username:** Your full email address (e.g., `info@marriageducation.com`)

4. **Password:** Your email account password

### Step 2: Find Your SMTP Settings in iPage
1. Login to iPage Control Panel
2. Go to **Email Accounts** or **Mail**
3. Find your email account (e.g., `noreply@marriageducation.com`)
4. Look for **Email Client Configuration** or **SMTP Settings**
5. Note down:
   - Outgoing Mail Server (SMTP)
   - SMTP Port
   - Authentication required: Yes
   - Your email and password

### Step 3: Add to Render Environment Variables
1. Go to: https://dashboard.render.com
2. Select your service: `marriage-education-website`
3. Go to **Environment** tab
4. Add these variables:
   ```
   SMTP_HOST = smtp.yourdomain.com (or mail.yourdomain.com)
   SMTP_PORT = 587
   SMTP_USERNAME = noreply@marriageducation.com (your full email)
   SMTP_PASSWORD = your_email_password
   FROM_EMAIL = noreply@marriageducation.com
   ```
5. Click **Save Changes**
6. Service will auto-redeploy (takes 2-3 minutes)

## Test Email Sending

### Quick Test:
1. After adding environment variables to Render, wait 2-3 minutes for redeployment
2. Check server logs: `https://marriage-education-website.onrender.com/health`
3. Should see: `[EMAIL] ✅ SMTP configured: smtp.yourdomain.com:587`

### When you approve a payment:
- ✅ Email sent successfully → Green notification: "✅ Email sent automatically!"
- ❌ Email failed → Red alert: "⚠️ Payment Approved BUT Email Failed!"

### If emails fail:
- Check SMTP credentials are correct
- Verify email account exists in iPage
- Try alternative SMTP port (465 instead of 587)
- Check Render logs for error details

## Common iPage SMTP Settings

**For most iPage accounts:**
```
SMTP_HOST = mail.marriageducation.com (or smtp.marriageducation.com)
SMTP_PORT = 587 (use 465 if 587 doesn't work)
SMTP_USERNAME = noreply@marriageducation.com
SMTP_PASSWORD = your_password
FROM_EMAIL = noreply@marriageducation.com
```

**If you're using iPage's shared hosting:**
```
SMTP_HOST = smtp.secureserver.net
SMTP_PORT = 587
SMTP_USERNAME = noreply@marriageducation.com
SMTP_PASSWORD = your_password
FROM_EMAIL = noreply@marriageducation.com
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
