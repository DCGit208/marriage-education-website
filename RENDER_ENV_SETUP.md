# Render Environment Variables for iPage Email

Add these EXACT values to Render:

## Email Configuration (iPage SMTP)

```
SMTP_HOST = mail.marriageducation.com
SMTP_PORT = 587
SMTP_USERNAME = orders@marriageducation.com
SMTP_PASSWORD = cAjry8-jesjos-xihgax
FROM_EMAIL = orders@marriageducation.com
```

## How to Add to Render:

1. Go to: https://dashboard.render.com
2. Login with your account
3. Select service: `marriage-education-website`
4. Click: **Environment** tab on the left
5. For each variable below, click **Add Environment Variable**:

### Variable 1:
- Key: `SMTP_HOST`
- Value: `mail.marriageducation.com`

### Variable 2:
- Key: `SMTP_PORT`
- Value: `587`

### Variable 3:
- Key: `SMTP_USERNAME`
- Value: `orders@marriageducation.com`

### Variable 4:
- Key: `SMTP_PASSWORD`
- Value: `cAjry8-jesjos-xihgax`

### Variable 5:
- Key: `FROM_EMAIL`
- Value: `orders@marriageducation.com`

6. Click **Save Changes** at the bottom
7. Render will automatically redeploy (takes 2-3 minutes)

## Alternative SMTP Settings to Try (if port 587 fails):

If you get connection errors, try these alternatives:

**Option 1: Use port 465**
```
SMTP_HOST = mail.marriageducation.com
SMTP_PORT = 465
```

**Option 2: Use smtp prefix**
```
SMTP_HOST = smtp.marriageducation.com
SMTP_PORT = 587
```

**Option 3: Use iPage shared server**
```
SMTP_HOST = smtp.secureserver.net
SMTP_PORT = 587
```

## After Adding Variables:

1. Wait 2-3 minutes for Render to finish deploying
2. Visit: https://marriage-education-website.onrender.com/health
3. Look for: `[EMAIL] ✅ SMTP configured: mail.marriageducation.com:587 as orders@marriageducation.com`
4. Test by approving a payment in admin panel
5. Check inbox at orders@marriageducation.com

## Email Template Info:

When customers purchase, they will receive emails **FROM**: `orders@marriageducation.com`

Subject: "📥 Your eBook is Ready to Download"

Content:
- Professional HTML template
- Download link (expires in 7 days)
- Download limit notice (5 downloads max)
- Support contact info

## Troubleshooting:

**If emails don't send:**
1. Check Render logs for error messages
2. Verify the password is correct (no extra spaces)
3. Try alternative SMTP_HOST settings above
4. Contact iPage support to verify SMTP is enabled for orders@marriageducation.com

**If emails go to spam:**
- Ask customers to check spam folder
- Add marriageducation.com to their safe senders
- Consider setting up SPF/DKIM records in iPage (ask iPage support)

## Security Note:

These credentials are stored securely in Render's environment variables and are NOT visible in your code or public GitHub repository.

---

**Ready to add?** Just copy-paste each value into Render's environment variables section!
