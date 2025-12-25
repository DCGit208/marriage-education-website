# 🧪 Administrative Dashboard - Complete Testing Guide

## Overview

This guide will help you test all features of the **Administrative Dashboard** including:
- Authentication
- Payment approval with Telegram notifications
- Real-time data synchronization
- All dashboard sections

---

## 🔐 Step 1: Test Authentication

### Access the Dashboard
1. Open your browser
2. Go to: `https://marriageducation.com/public/admin-payments.html`
3. You should see the login screen

### Test Login
- **✅ Test Correct Password:**
  - Enter: `admin-secret-2024`
  - Click **Login**
  - Expected: Dashboard should appear immediately
  
- **❌ Test Wrong Password:**
  - Refresh the page
  - Enter: `wrong-password`
  - Click **Login**
  - Expected: Red error message should appear

### Test Session Persistence
1. Login successfully
2. Refresh the page
3. Expected: You should stay logged in (no login screen)

### Test Logout
1. Click the **Logout** button (top-right corner)
2. Confirm logout
3. Expected: Return to login screen

---

## 💰 Step 2: Test Payment Creation & Approval

### A. Create a Test Payment

1. Open a new browser tab
2. Go to: `https://marriageducation.com/public/test-create-payment.html`
3. Fill in the form:
   - **Email:** `test@marriageducation.com`
   - **Name:** `Test Customer`
   - **Phone:** `+237670000000`
   - **Product:** Select `SBD For Dummies (5,000 FCFA)`
   - **MOMO Number:** `670000000`
4. Click **Create Test Payment**
5. Expected: Green success message with reference number

### B. View Pending Payment in Dashboard

1. Go back to the Administrative Dashboard
2. Click **Payments** in the sidebar
3. Expected: You should see your test payment in the list
4. Verify the payment details:
   - Reference number (TEST-...)
   - Email: test@marriageducation.com
   - Product: SBD For Dummies
   - Amount: 5,000 FCFA
   - Status: Pending

### C. Approve Payment (Full Test)

1. Find your test payment
2. Click the **Approve** button (green)
3. **Expected Results:**
   
   **✅ Dashboard Updates:**
   - Payment status changes to "Approved"
   - Payment moves to approved section
   - Stats update (approved count increases)
   
   **✅ Email Sent:**
   - Check email inbox for `test@marriageducation.com`
   - Should receive download link email
   - Subject: "Your Marriage Education Purchase"
   - Email contains download link (7-day expiry)
   
   **✅ Telegram Notification:**
   - Check Telegram (Chat ID: 6658054668)
   - Should receive admin notification with:
     - Payment reference
     - Customer email
     - Product name
     - Amount (5,000 FCFA)
     - Download URL
     - Expiry date
   
   **✅ Firebase Updated:**
   - Payment status in Firestore = "approved"
   - `approved_at` timestamp added

### D. Test Download Link

1. Copy the download URL from:
   - Email received
   - OR Telegram notification
   - OR Dashboard (if you added view feature)
2. Paste URL in browser
3. Expected: PDF should download (sbd-for-dummies.pdf)

---

## 📊 Step 3: Test Dashboard Sections

### Dashboard Home
1. Click **Dashboard** in sidebar
2. Verify:
   - Stats cards show correct numbers
   - Revenue chart displays (if you have data)
   - Recent activity feed shows latest actions

### Analytics Hub
1. Click **Analytics** in sidebar
2. Verify:
   - Charts render (Chart.js)
   - Sales trends visible
   - Regional performance displays

### CRM (Customer Management)
1. Click **CRM** in sidebar
2. Verify:
   - Customer list loads
   - Search functionality works
   - Filter buttons work
   - Customer details display

### Payment Approval Center
1. Click **Payments** in sidebar
2. Test filters:
   - Click **All** - shows all payments
   - Click **Pending** - shows only pending
   - Click **Approved** - shows only approved
   - Click **Rejected** - shows only rejected
3. Test refresh:
   - Click **🔄 Refresh** button
   - Data should reload

### Regional Directors Console
1. Click **Regional Directors** in sidebar
2. Verify:
   - RD list loads from Firestore
   - Performance metrics display
   - Commission tracking shows

### Ambassador Hub
1. Click **Ambassadors** in sidebar
2. Verify:
   - Ambassador leaderboard loads
   - Rankings display correctly
   - Commission data shows

### Referral Analytics
1. Click **Referral Analytics** in sidebar
2. Verify:
   - Referral codes list
   - Conversion tracking
   - Commission calculations

### Communication Center
1. Click **Communication** in sidebar
2. Verify:
   - Email templates section
   - Bulk messaging interface
   - Notification history

### Settings
1. Click **Settings** in sidebar
2. Verify:
   - Configuration options display
   - Settings sections load

---

## 🔔 Step 4: Test Telegram Integration

### Verify Telegram Configuration

```bash
firebase functions:config:get telegram
```

Expected output:
```json
{
  "bot_token": "8598876620:AAG9qTORojDOewDxUS0JZG6rFT3zdDnpvR0",
  "chat_id": "6658054668"
}
```

### Test Telegram Notifications

1. **Create and approve a test payment**
2. **Check Telegram chat (ID: 6658054668)**
3. **Expected message format:**
   ```
   ✅ *Payment Approved & Sent*
   
   📋 Reference: `TEST-1735120000000`
   👤 Customer: test@marriageducation.com
   📱 Phone: +237670000000
   📚 Product: *SBD For Dummies*
   💰 Amount: 5000 FCFA
   
   📧 Email: ✅
   
   📥 Download (expires Jan 1, 2026):
   https://firebasestorage.googleapis.com/v0/b/...
   ```

---

## 🚀 Step 5: Test Real-Time Features

### Real-Time Payment Updates

1. **Open dashboard in Browser 1**
2. **Login and go to Payments section**
3. **Open test-create-payment.html in Browser 2**
4. **Create a new test payment in Browser 2**
5. **Check Browser 1 (dashboard)**
6. **Expected:** New payment should appear automatically (real-time listener)

### Real-Time Stats Updates

1. **Keep dashboard open**
2. **Approve a payment**
3. **Watch stats cards**
4. **Expected:**
   - Pending count decreases
   - Approved count increases
   - Total amount updates

---

## ✅ Complete Testing Checklist

### Authentication
- [ ] Login with correct password works
- [ ] Login with wrong password shows error
- [ ] Session persists on page refresh
- [ ] Logout works and returns to login screen

### Payment Flow
- [ ] Test payment created successfully
- [ ] Payment appears in dashboard (pending section)
- [ ] Payment details display correctly
- [ ] Approve button works
- [ ] Payment status updates to "approved"
- [ ] Approved payment moves to approved section

### Email Notifications
- [ ] Download email sent to customer
- [ ] Email contains correct product name
- [ ] Email contains working download link
- [ ] Download link expires in 7 days (verify text)

### Telegram Notifications
- [ ] Telegram notification received
- [ ] Notification contains payment details
- [ ] Notification contains download URL
- [ ] Notification format is correct

### Download Links
- [ ] Download URL from email works
- [ ] Download URL from Telegram works
- [ ] PDF file downloads correctly
- [ ] File is correct product (sbd-for-dummies.pdf)

### Dashboard Sections
- [ ] Dashboard home loads with stats
- [ ] Analytics section displays charts
- [ ] CRM section shows customers
- [ ] Payments section shows all payments
- [ ] RD console displays directors
- [ ] Ambassador hub shows leaderboard
- [ ] Referral analytics loads codes
- [ ] Communication center accessible
- [ ] Settings panel loads

### Real-Time Features
- [ ] New payments appear automatically
- [ ] Stats update in real-time
- [ ] Activity feed updates live
- [ ] Filter buttons work instantly

### UI/UX
- [ ] Sidebar navigation works
- [ ] All buttons are clickable
- [ ] Charts render properly (Chart.js)
- [ ] Mobile responsive (test on phone)
- [ ] No console errors

---

## 🐛 Troubleshooting

### Payment Not Appearing in Dashboard

**Check:**
1. Firestore connection working?
2. Firebase config correct in `firebase-config.js`?
3. Browser console for errors?

**Solution:**
```bash
# Check Firestore data
firebase firestore:indexes
```

### Email Not Sending

**Check:**
1. SMTP config: `firebase functions:config:get smtp`
2. Email credentials correct?
3. Check Cloud Function logs:

```bash
firebase functions:log --only approvePayment
```

### Telegram Not Working

**Check:**
1. Bot token: `firebase functions:config:get telegram`
2. Chat ID correct?
3. Bot has permission to send to chat?

**Test Telegram directly:**
```bash
curl -X POST "https://api.telegram.org/bot8598876620:AAG9qTORojDOewDxUS0JZG6rFT3zdDnpvR0/sendMessage" \
  -H "Content-Type: application/json" \
  -d '{"chat_id":"6658054668","text":"Test message","parse_mode":"Markdown"}'
```

### Download Link Returns 404

**Check:**
1. File exists in Firebase Storage?
2. Download token generated correctly?
3. Bucket name correct?

**Verify files:**
```bash
firebase functions:call listStorageInfo
```

---

## 📈 Performance Testing

### Load Testing
1. Create 10 test payments
2. Approve them one by one
3. Monitor:
   - Dashboard response time
   - Email delivery speed
   - Telegram notification speed

### Concurrent Users
1. Open dashboard in 3 browsers
2. Login in all 3
3. Approve payments from different browsers
4. Verify all browsers update in real-time

---

## 🎯 Success Criteria

Your Administrative Dashboard is **fully functional** if:

✅ **Authentication:** Login/logout works securely  
✅ **Payments:** Create → View → Approve flow works  
✅ **Email:** Download emails delivered successfully  
✅ **Telegram:** Admin notifications sent correctly  
✅ **Downloads:** PDF files download from Firebase Storage  
✅ **Real-Time:** Dashboard updates automatically  
✅ **Navigation:** All sections load without errors  
✅ **Charts:** Visualizations render properly  
✅ **Mobile:** Responsive on all devices  

---

## 📞 Support Commands

### Check Cloud Functions Status
```bash
firebase functions:list
```

### View Recent Logs
```bash
firebase functions:log --only approvePayment --limit 10
```

### Test Firestore Connection
```bash
firebase firestore:indexes
```

### Check Firebase Storage
```bash
firebase functions:call listStorageInfo
```

### View Config
```bash
firebase functions:config:get
```

---

## 🎉 Ready to Test!

1. **Start with Step 1** (Authentication)
2. **Then Step 2** (Payment approval - most important!)
3. **Test Telegram** (verify notifications)
4. **Browse all sections** (explore features)
5. **Check off the checklist** (track progress)

**Happy Testing! 🚀**

---

*Last Updated: December 25, 2024*
*Dashboard Version: 2.0 (Administrative Dashboard with Authentication)*
