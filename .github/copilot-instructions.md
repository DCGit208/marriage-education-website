# GitHub Copilot Instructions for Marriage Education Project
# DR. COACH ACHU'S CODE QUALITY STANDARDS

## CRITICAL: HTML/JavaScript Integration Rules

### 1. Script Tag Integrity (MANDATORY)
**NEVER leave script tags unclosed. ALWAYS validate before committing.**

```html
<!-- ✅ CORRECT -->
<script>
    // Your JavaScript code here
</script>

<!-- ❌ FORBIDDEN - Unclosed script tag -->
<script>
    // JavaScript code
<!-- HTML comment here -->  ⬅️ WILL BREAK!
```

**Validation Checklist:**
- [ ] Every `<script>` has matching `</script>`
- [ ] No HTML comments inside `<script>` blocks
- [ ] All JavaScript is wrapped in proper script tags
- [ ] Script count balanced: `grep -c "<script"` = `grep -c "</script>"`

### 2. HTML Comment Hygiene

**RULE:** HTML comments must ONLY appear between tags, never inside script blocks.

```html
<!-- ✅ CORRECT -->
</script>
<!-- This comment is safe -->
<script>

<!-- ❌ FORBIDDEN -->
<script>
    const x = 1;
    <!-- This will cause: Unexpected token '<' -->
    const y = 2;
</script>
```

### 3. Firebase Deployment Requirements

**CRITICAL:** Code changes are worthless if Firebase rules aren't deployed.

**Whenever you modify:**
- `firestore.rules` → Run: `firebase deploy --only firestore:rules`
- `storage.rules` → Run: `firebase deploy --only storage`
- Firebase security rules → ALWAYS deploy immediately

**Standard Deploy Commands:**
```bash
# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy storage rules
firebase deploy --only storage

# Deploy entire Firebase config
firebase deploy
```

### 4. Browser Caching Strategy

**PROBLEM:** Users cache broken code even after fixes are deployed.

**SOLUTION:** Always add aggressive cache-busting on critical files.

```html
<!-- Add to <head> of ALL authentication/payment pages -->
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate, max-age=0">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<meta name="cache-bust" content="v2-YYYYMMDD">
```

**Files requiring cache-busting:**
- ✅ `ambassador-login.html`
- ✅ `ambassador-register.html`
- ✅ `payment.html`
- ✅ `rd-login.html`
- ✅ Any file with Firebase authentication

### 5. Git Workflow Standards

**MANDATORY STEPS for every code change:**

```bash
# 1. Make changes
# 2. Test locally
# 3. Check for errors
grep -c "<script" file.html && grep -c "</script>" file.html

# 4. Commit with descriptive emoji
git add .
git commit -m "🔧 FIX: Clear description of what was fixed"

# 5. Push to trigger deployment
git push origin main

# 6. Deploy Firebase rules if modified
firebase deploy --only firestore:rules
```

**Commit Message Emojis:**
- 🔧 `FIX:` - Bug fixes
- ✨ `FEAT:` - New features
- 💰 `MONETIZATION:` - Revenue/conversion changes
- 🚀 `DEPLOY:` - Deployment configs
- 🔒 `SECURITY:` - Firestore rules, permissions
- 📝 `DOCS:` - Documentation
- ⚡ `PERF:` - Performance improvements

## Project-Specific Rules

### File Structure Awareness
```
/Users/achugustave/Documents/Marriageducation/
├── public/               ← DEPLOYED via GitHub Actions FTP
│   ├── ambassador-login.html
│   ├── js/firebase-config.js
│   └── ...
├── ambassador-login.html ← ROOT version (NOT deployed)
└── .github/
    └── workflows/
        └── deploy-to-ftp.yml  ← Deploys ONLY public/ folder
```

**CRITICAL:** When fixing files, check if duplicates exist:
- `ambassador-login.html` (root) - NOT deployed
- `public/ambassador-login.html` - DEPLOYED to production

**ALWAYS fix the PUBLIC version for production issues.**

### Firebase Collections Schema
```javascript
// Core collections used in ambassador system
db.collection('ambassadors')      // Ambassador accounts
db.collection('sales')            // Sales tracking
db.collection('regional_directors') // RD management
db.collection('pending_payments')  // Payment queue
db.collection('referral_codes')   // Referral tracking
db.collection('enrollments')      // Course enrollments
db.collection('courses')          // Course catalog
db.collection('notifications')    // Notifications for ambassadors
db.collection('contests')         // Contest/leaderboard data
db.collection('badges')           // Achievement badges
db.collection('settings')         // App configuration
db.collection('announcements')    // Dashboard announcements
```

**CRITICAL:** Every collection MUST have a rule in `firestore.rules`, even if it's just `allow read: if true;`

**Missing rule symptom:** `FirebaseError: Missing or insufficient permissions`

### Common Error Patterns (LEARN FROM THESE)

#### Error 1: Syntax errors from unclosed tags
```
❌ Uncaught SyntaxError: Unexpected token '<' at line 382
```
**Cause:** HTML comment inside JavaScript block
**Prevention:** Always close `</script>` before HTML comments

#### Error 2: Firebase permissions errors
```
❌ FirebaseError: Missing or insufficient permissions
```
**Cause:** Firestore rules not deployed OR missing collection rule
**Fix:** 
1. Check if collection has a rule in `firestore.rules`
2. If missing, add: `match /collection_name/{docId} { allow read: if true; }`
3. Deploy: `firebase deploy --only firestore:rules`

#### Error 3: Changes not appearing
```
❌ "I fixed it but nothing changed"
```
**Cause:** Browser caching old code
**Fix:** Add cache-busting meta tags + hard refresh (Cmd+Shift+R)

#### Error 4: CORS/XMLHttpRequest errors
```
❌ XMLHttpRequest cannot load https://firestore.googleapis.com/... due to access control checks
```
**Cause:** Usually accompanies permission errors - see Error 2
**Fix:** Deploy missing Firestore rules

## Code Review Checklist (Run Before Every Commit)

### Pre-Commit Validation
```bash
# 1. Check script tag balance
file="public/ambassador-login.html"
open=$(grep -c "<script" "$file")
close=$(grep -c "</script>" "$file")
echo "Script tags: $open opening, $close closing"
[ "$open" -eq "$close" ] && echo "✅ Balanced" || echo "❌ UNBALANCED"

# 2. Check for HTML comments in script blocks
grep -n "<!-- " "$file" | grep -B5 -A5 "<script>"

# 3. Verify Firebase config loaded
grep -n "firebase.initializeApp" public/js/firebase-config.js

# 4. Test file locally (if possible)
open "$file"  # Opens in browser for visual check
```

### Post-Deployment Verification
```bash
# 1. Verify GitHub Actions deployment succeeded
# Check: https://github.com/DCGit208/marriage-education-website/actions

# 2. Hard refresh production site
# Cmd + Shift + R (Mac) or Ctrl + Shift + R (Windows)

# 3. Check browser console for errors (F12)

# 4. Test critical user flows:
# - Ambassador login
# - Payment processing
# - Course enrollment
```

## When Things Break (Emergency Protocol)

### Step 1: Identify Error Source
```bash
# Check browser console (F12)
# Look for line numbers: "filename.html:382"

# Read that exact line
sed -n '375,390p' public/ambassador-login.html

# Check surrounding context
grep -A 10 -B 10 "problem_code" public/ambassador-login.html
```

### Step 2: Fix Pattern Recognition
- **Syntax Error + Line Number** → Look for unclosed tags or HTML comments
- **Firebase Permission Error** → Deploy firestore.rules
- **"Nothing changed" Issue** → Cache problem, add cache-busting
- **404 Errors** → Wrong file path or FTP deployment issue

### Step 3: Implement Fix
1. Fix the code
2. Validate structure (script tag balance)
3. Commit with clear message
4. Push to trigger deployment
5. Deploy Firebase rules if needed
6. Test with hard refresh

### Step 4: Prevent Recurrence
- Add validation to CI/CD
- Update this instruction file
- Document in memory notes

## User Context: Dr. Coach Achu

### Communication Style
- **Be direct and solution-focused**
- User is technically savvy but values efficiency
- Frustration indicator: "this system keeps breaking"
- Wants: Self-healing, resilient systems

### Ambassador System Critical Files
**NEVER break these files - they block revenue:**
- `public/ambassador-login.html` - Login gateway
- `public/ambassador-register.html` - Registration
- `public/ambassador/dashboard.html` - Ambassador dashboard
- `public/payment.html` - Payment processing
- `firestore.rules` - Database permissions

### Deployment Architecture
- **GitHub → GitHub Actions → FTP Server**
- Triggers: Push to main branch
- Deploy Time: ~1-2 minutes
- Deploys: ONLY `/public/` directory
- Target: `/public_html/` on FTP server

## SEO & Monetization Standards

### Modal System Integration
All SEO pages must include:
```html
<!-- SBD-Dummies Modal System -->
<style>
/* 210-line modal CSS */
</style>

<!-- Modal HTML structure -->
<div id="sbd-dummies-modal" class="sbd-modal">
    <!-- Modal content -->
</div>

<script>
// Modal JavaScript
</script>
```

### CTA Requirements
- ✅ Specific pricing visible ($27, $300, $997)
- ✅ Clear action triggers ("Enroll Now", "Get Book")
- ✅ Mobile-responsive (tested on iOS/Android)
- ✅ Fast load time (<3 seconds)

## Testing Requirements

### Before Every Commit
- [ ] Script tags balanced
- [ ] No HTML comments in JS
- [ ] Firebase config loaded
- [ ] Local browser test (visual)

### After Every Deployment
- [ ] GitHub Actions green
- [ ] Hard refresh production
- [ ] Console clean (no errors)
- [ ] Critical flow tested (login/payment)

## Memory & Learning

**When new issues are discovered:**
1. Document in this file
2. Add to memory notes (`/memories/`)
3. Create validation script if possible
4. Update CI/CD pipeline

**Success Criteria:**
- Zero syntax errors in production
- Firebase rules deployed with code
- Users never see broken functionality
- Issues caught before deployment

---

## Quick Reference Commands

```bash
# Validate HTML structure
grep -c "<script" file.html && grep -c "</script>" file.html

# Deploy Firebase rules
firebase deploy --only firestore:rules

# Check deployment status
git log --oneline -5

# Test script balance
file="public/ambassador-login.html"
echo "Open: $(grep -c "<script" "$file"), Close: $(grep -c "</script>" "$file")"

# Find line with error
sed -n '375,390p' public/ambassador-login.html

# Hard refresh cache
echo "Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)"
```

---

**REMEMBER:** This project generates real revenue through ambassador sales. Breaking login or payment systems directly impacts Dr. Coach Achu's business. Production stability is paramount.

**GOAL:** Zero production incidents. Prevent issues, don't just fix them.
