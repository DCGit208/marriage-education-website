# WhatsApp Business API Setup Guide

## Overview
Send automatic WhatsApp activation notifications to ambassadors when their payment is approved. Messages include credentials, book download link, and dashboard login URL.

## Cost
- **Twilio Free Trial**: $15.50 credit (covers ~1,500-3,000 messages)
- **Production**: ~$0.005-$0.01 per WhatsApp message
- **Monthly**: ~$5-10 for 1,000 notifications

## Setup Steps

### 1. Create Twilio Account
1. Go to https://www.twilio.com/try-twilio
2. Sign up with email/password
3. Verify your phone number
4. Select "WhatsApp" as primary use case
5. Skip "Add a Phone Number" (we'll use Twilio sandbox)

### 2. Get Twilio Credentials
1. Go to Twilio Console: https://console.twilio.com/
2. Copy your **Account SID** (starts with AC...)
3. Copy your **Auth Token** (click "View" to reveal)

### 3. Enable Twilio Sandbox for WhatsApp
1. In Twilio Console, go to **Messaging → Try it Out → Send a WhatsApp message**
2. You'll see sandbox number: **+1 415 523 8886** (or your region's number)
3. Send activation code from YOUR phone (the test device):
   - Open WhatsApp
   - Message: `join <your-sandbox-code>` to +1 415 523 8886
   - Example: `join purple-tiger`
4. Confirm you receive "Sandbox Setup Complete" reply

### 4. Configure Firebase Functions
Run these commands in your terminal:

```bash
# Set Twilio Account SID (starts with AC...)
firebase functions:config:set twilio.account_sid="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Set Twilio Auth Token
firebase functions:config:set twilio.auth_token="your_auth_token_here"

# Set WhatsApp sender (Twilio Sandbox number)
firebase functions:config:set twilio.whatsapp_from="whatsapp:+14155238886"

# Verify configuration
firebase functions:config:get
```

### 5. Install Dependencies & Deploy
```bash
cd functions
npm install
cd ..
firebase deploy --only functions:approvePayment
```

### 6. Test WhatsApp Delivery
1. Create test ambassador registration
2. Approve payment in admin dashboard
3. Check WhatsApp on registered phone number
4. Verify message contains:
   - ✅ Ambassador code
   - ✅ Credentials
   - ✅ Book download link
   - ✅ Dashboard login URL

## Message Template
```
🎉 *Welcome, Ambassador!*

Your account has been activated successfully.

*Your Credentials:*
• Ambassador Code: *AMB-XXXX-1234*
• Name: John Doe
• Email: john@example.com

*📚 Your Book Package:*
Download before Feb 9, 2026:
https://storage.googleapis.com/...

*🚀 Next Steps:*
1. Download your book package
2. Login: https://marriageducation.com/ambassador-login.html
3. Get your referral link
4. Start sharing & earning!

Questions? Reply to this message or email orders@marriageducation.com

_Marriage Education | Transforming persons, families, and nations_
```

## Phone Number Format
The system automatically formats phone numbers:
- **Input**: 677123456 (Cameroon)
- **Converted**: +237677123456
- **WhatsApp**: whatsapp:+237677123456

If user provides international format (+237...), it's used as-is.

## Production: WhatsApp Business API
For higher volume (>100 messages/day), upgrade to WhatsApp Business API:

1. **Apply for WhatsApp Business Account**:
   - Go to Facebook Business Manager
   - Submit business verification documents
   - Approval takes 1-3 days

2. **Connect to Twilio**:
   - In Twilio Console → Messaging → WhatsApp senders
   - Click "Request to enable my Twilio numbers for WhatsApp"
   - Select verified business profile

3. **Update sender number**:
```bash
firebase functions:config:set twilio.whatsapp_from="whatsapp:+237123456789"
firebase deploy --only functions:approvePayment
```

## Troubleshooting

### "Failed to send WhatsApp"
- **Check**: Is phone number in sandbox? (sandbox only sends to opted-in numbers)
- **Fix**: Have ambassador send `join <code>` to Twilio number first
- **Production**: Use verified WhatsApp Business API (no sandbox restrictions)

### "WhatsApp Skipped - No WhatsApp number provided"
- **Check**: Registration form phone field is named "phone"
- **Fix**: Verify `whatsappNumber: data.phone` in ambassador-register.html

### "Invalid phone number format"
- **Check**: Phone starts with + and country code
- **Fix**: System auto-adds +237 for Cameroon numbers

### "Account suspended"
- **Check**: Twilio free trial expired
- **Fix**: Add payment method: Console → Billing → Add credit card

## Monitoring
View WhatsApp delivery status in:
1. **Firebase Logs**: `firebase functions:log --only approvePayment`
2. **Twilio Console**: Messaging → Logs → WhatsApp
3. **Telegram Alerts**: Shows "📧 Email: ✅ Sent | 💬 WhatsApp: ✅ Sent"

## Fallback Strategy
System gracefully handles WhatsApp failures:
- If WhatsApp fails: Email still sent ✅
- Admin sees status in Telegram alert
- Manual follow-up available via direct WhatsApp message

## Next Steps
1. ✅ Twilio account created
2. ✅ Sandbox activated
3. ✅ Firebase configured
4. ✅ Functions deployed
5. ✅ Test ambassador created
6. ✅ WhatsApp received

Your WhatsApp activation notifications are now live! 🚀
