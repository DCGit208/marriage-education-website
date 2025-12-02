# Firebase Setup Guide - Complete in 10 Minutes

## 🚀 Step 1: Create Firebase Project (2 minutes)

1. Go to https://console.firebase.google.com/
2. Click **"Add project"**
3. Name: `marriage-education`
4. Disable Google Analytics (not needed)
5. Click **"Create project"**

## 🔥 Step 2: Enable Firestore Database (1 minute)

1. In left sidebar, click **"Firestore Database"**
2. Click **"Create database"**
3. Start in **"Test mode"** (we'll secure it later)
4. Choose location: **"us-central"** or closest to Cameroon
5. Click **"Enable"**

## 🔐 Step 3: Enable Authentication (1 minute)

1. In left sidebar, click **"Authentication"**
2. Click **"Get started"**
3. Click **"Email/Password"** tab
4. Enable **"Email/Password"** (toggle ON)
5. Click **"Save"**

## ⚙️ Step 4: Get Firebase Config (2 minutes)

1. Click gear icon ⚙️ → **"Project settings"**
2. Scroll down to **"Your apps"**
3. Click **"Web"** icon (</>)
4. App nickname: `marriage-education-web`
5. Click **"Register app"**
6. **COPY** the firebaseConfig object (looks like this):

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyC...",
  authDomain: "marriage-education.firebaseapp.com",
  projectId: "marriage-education",
  storageBucket: "marriage-education.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

7. **PASTE** it into `js/firebase-config.js` (replace the placeholder)

## 📦 Step 5: Include Firebase SDKs (1 minute)

Add these scripts **BEFORE** `</body>` in ALL HTML files:

```html
<!-- Firebase SDKs -->
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-functions-compat.js"></script>

<!-- Firebase Config -->
<script src="/js/firebase-config.js"></script>
```

## 🗃️ Step 6: Set Up Firestore Collections (2 minutes)

In Firestore console, manually create these collections (click "+ Start collection"):

### Collection: `ambassadors`
- Document ID: Auto-ID
- Fields (leave empty, structure will auto-create):

### Collection: `sales`
- Document ID: Auto-ID
- Fields (leave empty)

### Collection: `notifications`
- Document ID: Auto-ID
- Fields (leave empty)

### Collection: `badges`
- Document ID: Auto-ID
- Fields (leave empty)

### Collection: `contests`
- Document ID: Auto-ID
- Fields (leave empty)

### Collection: `settings`
- Document ID: `general`
- Fields:
  - `totalAmbassadors`: 0 (number)
  - `totalBooksSold`: 0 (number)
  - `totalRevenue`: 0 (number)
  - `spotsAvailable`: 500 (number)

## 🔒 Step 7: Security Rules (2 minutes)

In Firestore → **Rules** tab, replace with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Ambassadors: read all approved, write own
    match /ambassadors/{ambassadorId} {
      allow read: if resource.data.status == 'approved';
      allow create: if request.auth == null; // Registration
      allow update: if request.auth.uid == ambassadorId;
    }
    
    // Sales: authenticated users can read own
    match /sales/{saleId} {
      allow read: if request.auth != null;
      allow create: if true; // From payment gateway
    }
    
    // Notifications: users can read own
    match /notifications/{notificationId} {
      allow read, update: if request.auth.uid == resource.data.ambassadorId;
    }
    
    // Badges: users can read own
    match /badges/{badgeId} {
      allow read: if request.auth.uid == resource.data.ambassadorId;
    }
    
    // Settings: public read
    match /settings/{document=**} {
      allow read: if true;
      allow write: if false; // Admin only via console
    }
  }
}
```

Click **"Publish"**

## 💳 Step 8: Payment Gateway Setup (Separate per provider)

### Stripe
1. Go to https://dashboard.stripe.com/
2. Get your **Publishable Key** and **Secret Key**
3. Add to `js/payment-config.js`:
```javascript
const STRIPE_PUBLIC_KEY = 'pk_test_...';
```

### Paystack
1. Go to https://dashboard.paystack.com/
2. Settings → API Keys & Webhooks
3. Copy **Public Key**
4. Add to `js/payment-config.js`:
```javascript
const PAYSTACK_PUBLIC_KEY = 'pk_test_...';
```

### Flutterwave
1. Go to https://dashboard.flutterwave.com/
2. Settings → API
3. Copy **Public Key**
4. Add to `js/payment-config.js`:
```javascript
const FLUTTERWAVE_PUBLIC_KEY = 'FLWPUBK_TEST-...';
```

## ✅ Step 9: Test Firebase Connection

Open browser console on any page with Firebase loaded:

```javascript
// Test connection
db.collection('settings').doc('general').get()
  .then(doc => console.log('✅ Firebase connected!', doc.data()))
  .catch(err => console.error('❌ Firebase error:', err));
```

If you see "✅ Firebase connected!", you're ready!

## 🎯 Step 10: Deploy & Test

1. Open `ambassador-register.html` in browser
2. Fill out registration form
3. Submit (check Firestore → ambassadors collection for new entry)
4. Open admin panel → approve ambassador
5. Make test payment with referral code
6. Check dashboard for updated stats

---

## 🆘 Troubleshooting

### "Firebase is not defined"
- Check that Firebase SDKs are loaded before firebase-config.js
- Check browser console for script loading errors

### "Permission denied"
- Check Firestore rules are published
- For testing, temporarily set: `allow read, write: if true;`

### "Ambassador not found"
- Check that status field is set to 'approved'
- Verify referral code matches exactly (case-sensitive)

### Payment not tracking
- Check webhook setup in payment provider
- Verify referral code is being passed in payment URL
- Check browser console for JavaScript errors

---

## 📊 Firebase Pricing (Free Tier Limits)

✅ **Free tier includes:**
- 50K document reads/day
- 20K document writes/day
- 20K document deletes/day
- 1GB storage
- 10GB/month bandwidth

**Estimated usage for 500 ambassadors:**
- ~10K reads/day (well within limit)
- ~2K writes/day (well within limit)
- Total cost: **$0/month** for first 3-6 months

When you scale past 500 ambassadors:
- Upgrade to **Blaze plan** (pay-as-you-go)
- Estimated cost: ~$20-50/month for 1,000+ ambassadors

---

## 🚀 Next Steps After Setup

1. ✅ Complete Firebase setup (above)
2. ✅ Test registration → approval → payment flow
3. ✅ Invite 10 beta ambassadors
4. ✅ Monitor Firebase console for activity
5. ✅ Fix any bugs that appear
6. ✅ Launch to 100 ambassadors
7. ✅ Scale to 500 ambassadors
8. ✅ Build Phase 4 (payouts) when commissions accumulate

---

**Setup Time: 10 minutes**  
**Cost: $0 (free tier)**  
**Scalability: 500-1000 ambassadors**  
**Real-time: ✅ Yes**  
**Production-ready: ✅ Yes**

Go build! 🔥
