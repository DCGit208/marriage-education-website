# 🚀 QUICK START: iPage Email Setup

## What You Need From iPage:

1. **Your email account** (create one if needed):
   - Example: `noreply@marriageducation.com` or `info@marriageducation.com`

2. **SMTP settings** (from iPage control panel):
   - Server: `mail.marriageducation.com` or `smtp.marriageducation.com`
   - Port: `587` (or try `465` if that fails)
   - Username: Your full email (e.g., `noreply@marriageducation.com`)
   - Password: Your email password

## Add to Render (Takes 2 Minutes):

1. Go to: https://dashboard.render.com
2. Click on: `marriage-education-website`
3. Click: **Environment** tab
4. Click: **Add Environment Variable** (5 times for each setting below)

### Add These 5 Variables:

| Key | Value | Example |
|-----|-------|---------|
| `SMTP_HOST` | Your SMTP server | `mail.marriageducation.com` |
| `SMTP_PORT` | Usually 587 | `587` |
| `SMTP_USERNAME` | Your full email | `noreply@marriageducation.com` |
| `SMTP_PASSWORD` | Your email password | `your_password_here` |
| `FROM_EMAIL` | Same as username | `noreply@marriageducation.com` |

5. Click **Save Changes**
6. Wait 2-3 minutes for Render to redeploy

## Done! ✅

Now when you approve payments in the admin panel, emails will be sent automatically!

---

## Don't Know Your SMTP Settings?

### Option 1: Check iPage Control Panel
1. Login to iPage: https://www.ipage.com/controlpanel
2. Go to **Email** or **Email Accounts**
3. Click on your email account
4. Look for **Mail Client Settings** or **SMTP Configuration**

### Option 2: Contact iPage Support
Call or chat: "I need my SMTP server settings for sending emails"
They'll give you:
- SMTP server address
- SMTP port
- Authentication details

### Option 3: Common iPage Settings (Try These):

**First try:**
```
SMTP_HOST = mail.marriageducation.com
SMTP_PORT = 587
SMTP_USERNAME = your-email@marriageducation.com
SMTP_PASSWORD = your_password
```

**If that doesn't work, try:**
```
SMTP_HOST = smtp.secureserver.net
SMTP_PORT = 465
```

---

## How to Test:

1. After setting up, go to: https://marriage-education-website.onrender.com/health
2. Look for: `[EMAIL] ✅ SMTP configured`
3. Test by approving a payment with YOUR email address
4. Check your inbox (and spam folder)

---

## What If Emails Still Don't Send?

**Check these common issues:**

1. **Wrong credentials** → Verify username/password in iPage
2. **Email doesn't exist** → Create the email account in iPage first
3. **Wrong SMTP server** → Try alternative server addresses above
4. **Port blocked** → Try port 465 instead of 587
5. **Authentication failed** → Ensure you're using the FULL email as username

**See Render logs:**
1. Go to Render dashboard
2. Click your service
3. Click **Logs** tab
4. Look for `[EMAIL]` messages

---

## Need Help?

Check the full guide: `EMAIL_SETUP.md`

Or test manually first to verify your SMTP settings work!
