# WhatsApp Notification Setup Guide (100% FREE)

## Overview
Your Marriage Education system now supports **FREE WhatsApp notifications** via CallMeBot API. No credit card required, no monthly fees, completely free forever!

---

## What Gets Sent via WhatsApp?

### **Admin Notifications (You receive on +237677604100):**
1. **Manual MOMO Payment Submitted** - Instant alert when customer submits payment
2. **Stripe Purchase Completed** - Instant alert when Stripe payment succeeds
3. **Payment Approved** - Notification with customer contact details and download link to forward

**Note:** CallMeBot can only send to YOUR number (the account owner). You'll receive admin notifications + customer details, then you can easily forward the download link to customers via the WhatsApp link provided.

---

## Setup Instructions (5 Minutes, 100% FREE)

### **Step 1: Get Your CallMeBot API Key**
1. **Add CallMeBot to your WhatsApp contacts:**
   - Save this number: `+34 644 24 84 77`
   - Contact name: "CallMeBot"

2. **Send activation message:**
   - Open WhatsApp
   - Send this exact message to CallMeBot: `I allow callmebot to send me messages`
   - You'll receive your API key instantly (looks like: `123456`)
   - **SAVE THIS API KEY** - you'll need it

### **Step 2: Add to Render Environment Variables**
1. Go to https://dashboard.render.com
2. Select your `marriage-education-website` service
3. Go to **Environment** tab
4. Add this variable:

```
CALLMEBOT_API_KEY = 123456
ADMIN_WHATSAPP = 237677604100
```

(Use your actual API key from Step 1)

5. Click **Save Changes**
6. Your app will automatically redeploy (2-3 minutes)

### **Step 3: Test**
1. Make a test Stripe purchase or submit a manual MOMO payment
2. You should receive a WhatsApp message instantly on +237677604100!

---

## Why CallMeBot Instead of Twilio?

| Feature | CallMeBot | Twilio |
|---------|-----------|--------|
| **Cost** | 🟢 **100% FREE** | 🔴 ~$0.02-0.05 per message |
| **Setup** | 🟢 2 minutes | 🟡 10-15 minutes |
| **Credit Card** | 🟢 Not required | 🔴 Required after trial |
| **Monthly Limit** | 🟢 Unlimited | 🔴 Pay per message |
| **Approval** | 🟢 Instant | 🟡 May need business verification |
| **Send to customers** | 🟡 Manual forward | 🟢 Automatic |

**Conclusion:** CallMeBot is perfect for admin notifications. You get instant alerts for free, and can easily forward download links to customers manually via WhatsApp.

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

### **Admin - Payment Approved (with customer contact)**
```
✅ *Payment Approved - Send to Customer*

Customer: customer@example.com
Phone: +237690123456
Product: SBD for Dummies
Amount: 15000 XAF

📥 Download Link:
https://marriage-education-website.onrender.com/download?token=abc123...

Valid: December 19, 2025 (5 downloads)

📱 Contact customer: https://wa.me/237690123456
```

Click the `wa.me` link to instantly open WhatsApp chat with the customer and forward the download link!

---

## How It Works

1. **Customer submits payment** → You get WhatsApp alert
2. **You approve payment** → Customer gets email + You get WhatsApp with download link
3. **Click wa.me link** → Opens WhatsApp chat with customer
4. **Forward download link** → Customer gets it via WhatsApp (takes 5 seconds)

---

## Current Notification Matrix

| Event | Admin Email | Admin WhatsApp | Customer Email | Customer WhatsApp |
|-------|-------------|----------------|----------------|-------------------|
| **Manual MOMO Submitted** | ✅ orders@ | ✅ Instant | ❌ | ❌ |
| **Manual MOMO Approved** | ❌ | ✅ (with wa.me link) | ✅ | Manual forward |
| **Stripe Purchase** | ✅ orders@ | ✅ Instant | ✅ | ❌ |

---

## Troubleshooting

### **Not Receiving Messages?**
1. **Check you sent the activation message:** Send `I allow callmebot to send me messages` to `+34 644 24 84 77`
2. **Verify API key:** Check the number CallMeBot sent you matches what's in Render
3. **Check Render environment variables:** Make sure `CALLMEBOT_API_KEY` is set
4. **Check phone number format:** Should be `237677604100` (no + or spaces)

### **Check If WhatsApp is Enabled**
Look at Render logs after deployment. You should see:
```
WhatsApp enabled - Admin: 237677604100
```

If you see:
```
WhatsApp disabled - Set CALLMEBOT API key to enable
```
Then the API key is missing from environment variables.

### **API Key Stopped Working?**
- CallMeBot API keys don't expire
- If it stops working, just send the activation message again
- You'll get a new API key instantly

---

## Limitations & Solutions

### **Limitation:** Can only send to YOUR number
**Solution:** You get instant admin alerts + customer contact info. Click `wa.me` link to message customer directly.

### **Limitation:** Can't auto-send to customers
**Solution:** Customers always get email automatically. WhatsApp forwarding is optional (takes 5 seconds).

### **Limitation:** Rate limit ~100 messages/hour
**Solution:** More than enough for typical eBook sales volume.

---

## Alternative: Upgrade to Paid Later

If your business grows and you want **automatic customer WhatsApp**, you can upgrade to:
- **Twilio WhatsApp API** (~$3-8/month for 100 sales)
- **MessageBird** (similar pricing)
- **WhatsApp Business API** (direct from Meta, requires business verification)

But for now, CallMeBot gives you 90% of the benefits for **$0**!

---

## Cost Comparison (100 sales/month)

| Solution | Setup Cost | Monthly Cost | Total Year 1 |
|----------|------------|--------------|--------------|
| **CallMeBot** | $0 | $0 | **$0** |
| Twilio | $0 | $3-8 | $36-96 |
| WhatsApp Business | $0 | $10-50 | $120-600 |

**Winner:** CallMeBot! 🎉

---

## Support
- CallMeBot FAQ: https://www.callmebot.com/blog/free-api-whatsapp-messages/
- Test your setup: Send a message to CallMeBot anytime
- Need help? The activation message works instantly

---

**Status:** ✅ Code deployed and ready. Just get your CallMeBot API key to activate!
