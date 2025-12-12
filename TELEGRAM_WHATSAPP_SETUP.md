# 📱 Telegram + WhatsApp Integration (100% FREE)

## Overview
Your Marriage Education system uses **DUAL messaging** - both completely FREE:

1. **Telegram Bot** → For YOU (admin notifications)
2. **WhatsApp (CallMeBot)** → For CUSTOMERS (download links)

---

## What You Get:

### **Telegram Notifications (Admin - YOU):**
✅ Manual MOMO payment submitted  
✅ Manual MOMO payment approved (with delivery status)  
✅ Stripe purchase completed  

### **WhatsApp Messages (Customers):**
✅ Download link sent when MOMO payment approved  
✅ Link sent to their WhatsApp + Email  

### **Email (Always):**
✅ Admin email to `orders@marriageducation.com`  
✅ Customer email with download link  

---

## Setup Part 1: Telegram (Admin Notifications)

### **Step 1: Create Telegram Bot**
1. Open Telegram app
2. Search for `@BotFather`
3. Send: `/newbot`
4. Choose a name: `Marriage Education Notifications`
5. Choose username: `marriageedu_bot` (or any available name)
6. Copy the **Bot Token** (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### **Step 2: Get Your Chat ID**
1. Search for `@userinfobot` in Telegram
2. Start the bot
3. Copy your **Chat ID** (looks like: `123456789`)

### **Step 3: Start Your Bot**
1. Search for your bot (the username you created)
2. Click START or send `/start`

---

## Setup Part 2: WhatsApp (Customer Download Links)

### **Step 1: Get CallMeBot API Key**
1. Save this WhatsApp number: `+34 644 31 95 93`
2. Send this exact message: `I allow callmebot to send me messages`
3. You'll receive your API key (looks like: `123456`)
4. **Important:** This activates CallMeBot to send messages to any number

---

## Setup Part 3: Add to Render

1. Go to https://dashboard.render.com
2. Select `marriage-education-website`
3. Go to **Environment** tab
4. Add these variables:

```
TELEGRAM_BOT_TOKEN = your_bot_token_from_botfather
TELEGRAM_CHAT_ID = your_chat_id_from_userinfobot
CALLMEBOT_API_KEY = your_api_key_from_whatsapp
```

5. Click **Save Changes**
6. Wait 2 minutes for deployment

---

## Test It!

### **Test Telegram:**
- Submit a manual MOMO payment
- You should get instant Telegram notification

### **Test WhatsApp:**
- Approve the MOMO payment from admin panel
- Customer should receive WhatsApp with download link
- You should get Telegram confirmation

---

## Message Examples

### **Telegram to Admin (MOMO Submitted):**
```
🔔 *New Payment Pending Approval*

Reference: `ME-1234567890`
Product: *SBD for Dummies*
Amount: 15000 XAF
Customer: customer@example.com
Phone: +237690123456

👉 [Review & Approve](https://marriageducation.com/admin-payments.html)
```

### **WhatsApp to Customer (Download Link):**
```
📚 *Marriage Education - Payment Approved*

Hi! Your payment has been approved.

✅ Product: SBD for Dummies
💵 Amount: 15000 XAF

📥 *Download your eBook here:*
https://marriage-education-website.onrender.com/download?token=...

⏰ Valid until: December 19, 2025 at 02:30 PM
📊 Downloads allowed: 5 times

Thank you for your purchase!
```

### **Telegram to Admin (Payment Approved):**
```
✅ *Payment Approved & Sent*

Reference: `ME-1234567890`
Customer: customer@example.com
Phone: +237690123456
Product: *SBD for Dummies*
Amount: 15000 XAF

📧 Email sent: ✅
📱 WhatsApp sent: ✅
```

### **Telegram to Admin (Stripe Purchase):**
```
💰 *New Stripe Purchase*

Product: *SBD for Dummies*
Amount: $27
Customer: customer@example.com

✅ Download link sent automatically
Session: `cs_test_abc123...`
```

---

## Complete Notification Matrix

| Event | Admin Email | Admin Telegram | Customer Email | Customer WhatsApp |
|-------|-------------|----------------|----------------|-------------------|
| **MOMO Submitted** | ✅ | ✅ | ❌ | ❌ |
| **MOMO Approved** | ❌ | ✅ | ✅ | ✅ |
| **Stripe Purchase** | ✅ | ✅ | ✅ | ❌* |

*Stripe customers get immediate download on success page + email

---

## Why This Is Better

**Telegram for Admin:**
- ✅ Official API from Telegram
- ✅ 100% FREE forever
- ✅ Very reliable
- ✅ Rich formatting (bold, links, code)
- ✅ Can add buttons in future
- ✅ Works on all devices
- ✅ Desktop + mobile apps

**WhatsApp for Customers:**
- ✅ People in Cameroon use WhatsApp more than email
- ✅ Download link arrives instantly
- ✅ Higher open rate than email
- ✅ FREE via CallMeBot
- ✅ No setup needed for customers

---

## Troubleshooting

### **Not Getting Telegram Messages?**
1. Check you sent `/start` to your bot
2. Verify `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in Render
3. Check Render logs for `[TELEGRAM]` messages
4. Make sure you used @BotFather to create the bot

### **Customer Not Getting WhatsApp?**
1. Verify you sent "I allow callmebot..." message to +34 644 31 95 93
2. Check `CALLMEBOT_API_KEY` is correct in Render
3. Ensure customer phone number includes country code (+237...)
4. Customer will still get email if WhatsApp fails
5. Check Render logs for `[WHATSAPP]` messages

### **Check If Active:**
Look at Render logs after deployment:
```
[TELEGRAM] ✅ Enabled - Admin notifications active
[WHATSAPP] ✅ Enabled - Customer download links active
```

If disabled:
```
[TELEGRAM] ⚠️  Disabled - Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable
[WHATSAPP] ⚠️  Disabled - Set CALLMEBOT_API_KEY to enable customer WhatsApp
```

---

## Cost

**Both 100% FREE:**
- **Telegram:** FREE forever (official Telegram policy, no limits)
- **CallMeBot:** FREE (community-supported, donation-based)

**No hidden costs, no credit card needed, no trials to expire!**

---

## Support

- **Telegram Bot Setup:** https://core.telegram.org/bots#6-botfather
- **CallMeBot WhatsApp:** https://www.callmebot.com/blog/free-api-whatsapp-messages/
- **Get Chat ID:** https://t.me/userinfobot

---

**Status:** ✅ Code deployed and ready. Just add credentials to activate!
