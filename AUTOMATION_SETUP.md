# 🚀 Automated Course Sync Setup Guide

This guide will enable **automatic JSON → Firebase sync** every time you push changes to `courses-catalogue.json`.

---

## What This Automation Does

Every time you push changes to `courses-catalogue.json`:
1. GitHub Actions detects the change
2. Automatically syncs all courses to Firebase Firestore
3. `courses.html` and `schools.html` instantly reflect updates (they read from Firebase)
4. **No manual import tool needed!**

---

## Setup Steps

### Step 1: Get Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `marriage-education`
3. Click ⚙️ **Settings** → **Project Settings**
4. Go to **Service Accounts** tab
5. Click **Generate New Private Key**
6. Download the JSON file (keep it secure!)

### Step 2: Add Secret to GitHub

1. Go to your GitHub repo: `https://github.com/DCGit208/marriage-education-website`
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `FIREBASE_SERVICE_ACCOUNT`
5. Value: **Paste the entire contents of the JSON file you downloaded**
6. Click **Add secret**

### Step 3: Enable GitHub Actions

1. In your GitHub repo, go to **Actions** tab
2. If prompted, click **Enable GitHub Actions**
3. Done! The workflow will run automatically on next push

---

## How to Use

### Update Courses (Automated Way)

```bash
# 1. Edit courses-catalogue.json locally
# 2. Commit and push
git add courses-catalogue.json
git commit -m "Update course content"
git push origin main

# 3. GitHub Actions automatically syncs to Firebase
# 4. courses.html and schools.html update instantly
```

### Manual Override (if needed)

If you need to manually sync without pushing:
- Open `admin/import-courses.html`
- Click "Load JSON File"
- Click "Import to Firebase"

---

## What Changed

### ✅ Fully Automated Files

**courses-catalogue.json** → GitHub Actions → **Firebase** → Auto-displayed on:
- ✅ `courses.html` (dynamic cards with real "Enroll Now" buttons)
- ✅ `schools.html` (all "View in Courses" replaced with payment links)
- ✅ `course-viewer.html` (students see updated content)

### ✅ Payment Integration

All 44 courses added to `payment.html` product mapping:
- `payment.html?product=teleios-blueprint` → Stripe/MoMo checkout
- Course IDs match JSON file exactly

### ✅ GitHub Actions Workflow

`.github/workflows/sync-courses.yml`:
- Triggers on push to `courses-catalogue.json`
- Reads JSON file
- Syncs all courses to Firestore
- Logs success/errors

---

## Workflow Diagram

```
YOU EDIT → courses-catalogue.json
    ↓
GIT PUSH → GitHub (main branch)
    ↓
GITHUB ACTIONS → Reads JSON + Syncs to Firebase
    ↓
FIREBASE → Firestore `courses/` collection updated
    ↓
WEBSITE → courses.html & schools.html auto-update
    ↓
STUDENTS → See new content immediately
```

---

## Testing the Automation

1. Make a small edit to `courses-catalogue.json` (e.g., change a price)
2. Commit and push:
   ```bash
   git add courses-catalogue.json
   git commit -m "Test automation"
   git push origin main
   ```
3. Go to GitHub → **Actions** tab
4. Watch the workflow run (should take ~30 seconds)
5. Check Firebase Console → Firestore → `courses/` collection
6. Visit `courses.html` → should show updated data

---

## Troubleshooting

### GitHub Action Fails

**Error:** "FIREBASE_SERVICE_ACCOUNT secret not found"
- Solution: Make sure you added the secret in GitHub repo settings (see Step 2)

**Error:** "Permission denied" from Firebase
- Solution: Re-generate service account key with Firestore write permissions

### Courses Not Updating on Website

**Symptom:** Changes to JSON don't show on `courses.html`
- Check: Did GitHub Action run successfully? (Actions tab)
- Check: Is Firebase updated? (Firestore console)
- Try: Hard refresh browser (Cmd/Ctrl + Shift + R)

### Manual Sync Needed

If automation is disabled:
- Use `admin/import-courses.html` (still works!)
- Or run Firebase Admin SDK script locally

---

## Next Steps

Once automation is working:

1. **Add payment webhook** to auto-enroll students after purchase
2. **Update success.html** to show course access link
3. **Build email automation** to send course access on payment
4. **Add course preview** feature on schools.html

---

## Support

If you need help:
- Check GitHub Actions logs (Actions tab)
- Check browser console (F12 → Console)
- Check Firebase Console → Firestore
- Email: train@marriageducation.com
