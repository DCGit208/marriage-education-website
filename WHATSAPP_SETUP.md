# WhatsApp Notification Setup Guide

## Overview
Your Marriage Education system now supports WhatsApp notifications via **Twilio WhatsApp API**. When enabled, you'll receive instant WhatsApp messages for purchases, and customers will get their download links via both email AND WhatsApp.

---

## What Gets Sent via WhatsApp?

### **Admin Notifications (You receive):**
1. **Manual MOMO Payment Submitted** - Instant alert when customer submits payment
2. **Stripe Purchase Completed** - Instant alert when Stripe payment succeeds

### **Customer Notifications (Buyers receive):**
1. **Manual MOMO Approved** - Download link sent via WhatsApp + Email

---

## Setup Instructions

### **Step 1: Create Twilio Account**
1. Go to https://www.twilio.com/try-twilio
2. Sign up for a free account
3. Verify your phone number (+237677604100)

### **Step 2: Get WhatsApp Sandbox Access**
1. In Twilio Console, go to: **Messaging** → **Try it out** → **Send a WhatsApp message**
2. You'll see a WhatsApp number like: `+1 415 523 8886`
3. **JOIN THE SANDBOX:** Send a WhatsApp message to that number with the code shown (e.g., "join <code>")
4. You'll receive a confirmation message

### **Step 3: Get Your Credentials**
From Twilio Console Dashboard:
- **Account SID**: Found on dashboard (starts with `AC...`)
- **Auth Token**: Click to reveal (starts with auth token)
- **WhatsApp From Number**: The sandbox number (e.g., `whatsapp:+14155238886`)

### **Step 4: Add to Render Environment Variables**
1. Go to https://dashboard.render.com
2. Select your `marriage-education-website` service
3. Go to **Environment** tab
4. Add these variables:

```
TWILIO_ACCOUNT_SID = YOUR_ACCOUNT_SID_HERE
TWILIO_AUTH_TOKEN = YOUR_AUTH_TOKEN_HERE
TWILIO_WHATSAPP_FROM = whatsapp:+14155238886
ADMIN_WHATSAPP = +237677604100
```

5. Click **Save Changes**
6. Your app will automatically redeploy

### **Step 5: Test**
1. Make a test Stripe purchase or submit a manual MOMO payment
2. You should receive a WhatsApp message instantly!

---

## Production Setup (After Testing)

### **Upgrade to Production WhatsApp** (Optional)
Twilio Sandbox is free but has limitations:
- Users must "join" your sandbox first
- Shows "via Twilio Sandbox"

For production (sending to any customer without them joining):
1. Request WhatsApp Business API access from Twilio
2. Get approved by Facebook/Meta
3. Use your own business phone number
4. Update `TWILIO_WHATSAPP_FROM` to your number

**Cost:** Twilio charges per message (varies by country)
- Cameroon: ~$0.02-0.05 per message
- Check pricing: https://www.twilio.com/whatsapp/pricing

---

## WhatsApp Message Examples

### **Admin - New MOMO Payment**
```
🔔 *New Payment Pending Approval*

Reference: ME-1234567890
Product: SBD for Dummies
Amount: 15000 XAF
Customer: customer@example.com
Phone: +237690123456

👉 Review at: https://marriageducation.com/admin-payments.html
```

### **Admin - New Stripe Purchase**
```
💰 *New Stripe Purchase*

Product: SBD for Dummies
Amount: $27
Customer: customer@example.com

✅ Download link sent automatically
Session: cs_test_abc123...
```

### **Customer - Download Link**
```
📚 *Marriage Education - Payment Approved*

Hi! Your payment has been approved.

✅ Product: SBD for Dummies
💵 Amount: 15000 XAF

📥 *Download your eBook here:*
https://marriage-education-website.onrender.com/download?token=abc123...

⏰ Valid until: December 19, 2025 at 02:30 PM
📊 Downloads allowed: 5 times

Thank you for your purchase!
```

---

## Troubleshooting

### **Not Receiving Messages?**
1. Check you joined the Twilio Sandbox (send "join <code>" to Twilio number)
2. Verify environment variables are set correctly in Render
3. Check Render logs: `cat /var/log/render.log | grep WHATSAPP`
4. Ensure your phone number is in E.164 format: `+237677604100`

### **Customer Not Receiving WhatsApp?**
- WhatsApp only works if customer also joined Twilio Sandbox
- In production with approved WhatsApp Business API, this isn't required
- Until then, customers still get email (always works)

### **Check If WhatsApp is Enabled**
Look at Render logs after deployment:
```
WhatsApp enabled - Admin: +237677604100
```

If you see:
```
WhatsApp disabled - Set TWILIO credentials to enable
```
Then environment variables are missing.

---

## Current Notification Matrix

| Event | Admin Email | Admin WhatsApp | Customer Email | Customer WhatsApp |
|-------|-------------|----------------|----------------|-------------------|
| Manual MOMO Submitted | ✅ orders@marriageducation.com | ✅ +237677604100 | ❌ | ❌ |
| Manual MOMO Approved | ❌ | ❌ | ✅ | ✅ |
| Stripe Purchase | ✅ achugustave@gmail.com | ✅ +237677604100 | ✅ | ❌ |

**Note:** Stripe purchases don't send WhatsApp to customer (they get immediate download on success page + email). Only manual MOMO approvals send WhatsApp to customer.

---

## Cost Estimate

### **Twilio Pricing (Cameroon)**
- **Sandbox (Testing):** FREE
- **Production:** ~$0.02-0.05 per message

### **Monthly Estimate**
If you get 100 purchases/month:
- 100 admin notifications (Stripe/MOMO) = ~$2-5
- 50 customer WhatsApp (manual MOMO) = ~$1-2.50
- **Total:** ~$3-8/month

### **Free Alternative**
Twilio offers $15 free trial credit - enough for ~300-750 messages!

---

## Support
- Twilio Console: https://console.twilio.com
- Twilio Docs: https://www.twilio.com/docs/whatsapp
- Check if WhatsApp Business API approved: https://www.twilio.com/console/sms/whatsapp/senders

---

**Status:** ✅ Code deployed and ready. Just add Twilio credentials to activate!
