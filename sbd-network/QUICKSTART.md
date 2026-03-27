# SBD Network - Quick Start Guide

## ⚡ 5-Minute Setup

### Step 1: Firebase Project (2 minutes)
1. Go to https://console.firebase.google.com/
2. Click "Add Project"
3. Name it "SBD Network"
4. Disable Google Analytics (optional)
5. Create project

### Step 2: Enable Services (1 minute)
1. **Authentication**: Click "Get Started" → Enable "Email/Password"
2. **Firestore**: Click "Create Database" → Start in production mode → Choose location
3. **Storage**: Click "Get Started" → Use default rules

### Step 3: Get Configuration (1 minute)
1. Click gear icon → Project Settings
2. Scroll to "Your apps" section
3. Click web icon (</>) to add web app
4. Register app with nickname "SBD Network Web"
5. Copy the firebaseConfig object

### Step 4: Configure App (1 minute)
Open `js/firebase.js` and paste your config:
```javascript
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_KEY_HERE",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "123456789",
  appId: "YOUR_APP_ID"
};
```

### Step 5: Deploy Security Rules (30 seconds each)
**Firestore Rules:**
1. Go to Firestore → Rules tab
2. Copy entire content from `firestore.rules` file
3. Click "Publish"

**Storage Rules:**
1. Go to Storage → Rules tab  
2. Copy entire content from `storage.rules` file
3. Click "Publish"

### Step 6: Create Placeholder Icons (optional - for now)
The app will work without icons, but for PWA installation:
1. Create any 192x192 and 512x512 PNG images
2. Save as `assets/icons/icon-192.png` and `icon-512.png`
3. Or use this temporary fix: comment out icon references in `manifest.json`

### Step 7: Run Locally
```bash
cd sbd-network
python3 -m http.server 8000
```
Visit: http://localhost:8000/public/

### Step 8: Make Yourself Admin
1. Sign up with your email
2. Go to Firebase Console → Firestore
3. Click on `users` collection
4. Find your document
5. Edit: Change `role: "member"` to `role: "admin"`
6. Refresh the app

## 🎉 You're Done!

Now you can:
1. Login as admin
2. Click "Admin Panel"
3. Create groups and boards
4. Add users to groups
5. Create posts with images/videos

## 🚀 Next Steps

### For Production:
1. **Deploy to Firebase Hosting:**
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init hosting
   firebase deploy
   ```

2. **Create Proper Icons:**
   - Use https://realfavicongenerator.net/
   - Or hire a designer for a logo

3. **Custom Domain:**
   - Go to Firebase Hosting
   - Add custom domain
   - Point DNS records

### For Development:
- Read full `README.md` for detailed documentation
- Check Firebase Console regularly
- Monitor usage and costs

## ⚠️ Important Notes

- **Free Tier Limits:**
  - 50,000 reads/day
  - 20,000 writes/day
  - 1GB storage
  - Monitor usage in Firebase Console

- **Security:**
  - Don't commit firebase config to public repos
  - Consider environment variables for production
  - Keep your API key secure

- **Testing:**
  - Test on mobile devices
  - Try installing as PWA
  - Test offline functionality

## 🆘 Common Issues

**Problem:** "Missing or insufficient permissions"
**Solution:** Deploy firestore.rules and storage.rules

**Problem:** "No matching index found"
**Solution:** Click the link in the error message to create the index

**Problem:** Can't install PWA
**Solution:** Must use HTTPS (Firebase Hosting) or localhost

**Problem:** Images not uploading
**Solution:** Check storage.rules are deployed and file is < 5MB

---

Need help? Check the full README.md or Firebase documentation.
