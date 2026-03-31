# PRE-TESTING AUDIT
# ==================
# 
# Systematic audit to identify broken code, missing dependencies, and integration issues
# Run this BEFORE comprehensive testing phase

## AUDIT CHECKLIST

### ☑️ 1. FILE STRUCTURE AUDIT

**Verify all files exist:**
```bash
# Run from /sbd-network directory
ls -la public/*.html | wc -l  # Should show ~20+ HTML files
ls -la public/css/*.css | wc -l  # Should show ~10+ CSS files
ls -la public/js/*.js | wc -l  # Should show ~15+ JS files
```

**Critical files that MUST exist:**
- [ ] `/public/index.html` (landing page)
- [ ] `/public/dashboard.html` (Phase 2)
- [ ] `/public/checkout.html` (Phase 1)
- [ ] `/public/success.html` (Phase 1)
- [ ] `/public/quiz.html` (Phase 3b)
- [ ] `/public/certificates.html` (Phase 3c)
- [ ] `/public/assignment.html` (Phase 3d)
- [ ] `/public/start-here.html` (Phase 4)
- [ ] `/public/entry-quiz.html` (Phase 4)
- [ ] `/public/resources.html` (Phase 4)
- [ ] `/public/admin-course-builder.html` (Phase 5)

**Critical CSS files:**
- [ ] `/public/css/global.css` (base styles)
- [ ] `/public/css/components.css` (shared components)
- [ ] `/public/css/dashboard.css` (Phase 2)
- [ ] `/public/css/checkout.css` (Phase 1)
- [ ] `/public/css/paywall.css` (Phase 3a)
- [ ] `/public/css/quiz.css` (Phase 3b)
- [ ] `/public/css/certificate.css` (Phase 3c)
- [ ] `/public/css/assignment.css` (Phase 3d)
- [ ] `/public/css/video-preview.css` (Phase 4)

**Critical JS files:**
- [ ] `/public/js/firebase-config.js` (Firebase initialization)
- [ ] `/public/js/auth-check.js` (authentication guard)
- [ ] `/public/js/formation-access.js` (tier checking + paywall)
- [ ] `/public/js/dashboard.js` (Phase 2)
- [ ] `/public/js/checkout.js` (Phase 1)
- [ ] `/public/js/quiz.js` (Phase 3b)
- [ ] `/public/js/certificate.js` (Phase 3c)
- [ ] `/public/js/assignment.js` (Phase 3d)
- [ ] `/public/js/video-preview.js` (Phase 4)

---

### ☑️ 2. SYNTAX ERROR AUDIT

**Check for JavaScript syntax errors:**
```bash
# Install Node.js syntax checker if not installed
npm install -g eslint

# Check all JS files
find public/js -name "*.js" -exec node -c {} \;
```

**Common issues to look for:**
- [ ] Missing closing braces `}`
- [ ] Missing closing parentheses `)`
- [ ] Missing closing brackets `]`
- [ ] Unclosed string quotes `"` or `'`
- [ ] Missing semicolons (optional but good practice)
- [ ] Undefined variables (check console)
- [ ] Async/await errors

**Manual check (open each file):**
- [ ] `/public/js/dashboard.js` - Check for syntax errors
- [ ] `/public/js/quiz.js` - Check for syntax errors
- [ ] `/public/js/certificate.js` - Check for syntax errors
- [ ] `/public/js/assignment.js` - Check for syntax errors
- [ ] `/public/js/checkout.js` - Check for syntax errors

---

### ☑️ 3. DEPENDENCY AUDIT

**Firebase CDN links (check all HTML files have these):**
```html
<!-- Required in ALL authenticated pages -->
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
```

**Additional dependencies:**
- [ ] **Stripe.js** (checkout.html): `<script src="https://js.stripe.com/v3/"></script>`
- [ ] **html2canvas** (certificates.html): For PNG download
- [ ] **Firebase Storage** (assignment.html, future file uploads)

**Check each page has correct dependencies:**
```bash
# Search for Firebase in all HTML files
grep -l "firebase-app-compat" public/*.html

# Should include: dashboard.html, checkout.html, quiz.html, certificates.html, assignment.html, etc.
```

---

### ☑️ 4. CSS INTEGRATION AUDIT

**Check CSS is properly linked in HTML:**
```bash
# Find all <link rel="stylesheet"> references
grep -h "stylesheet" public/*.html | sort | uniq
```

**Pages should link to:**
- **All pages**: `/css/global.css`, `/css/components.css`
- **Dashboard**: Add `/css/dashboard.css`
- **Checkout**: Add `/css/checkout.css`
- **Quiz**: Add `/css/quiz.css`
- **Certificates**: Add `/css/certificate.css`
- **Assignments**: Add `/css/assignment.css`
- **Paywall pages**: Add `/css/paywall.css`
- **Video pages**: Add `/css/video-preview.css`

**Audit each page:**
```bash
# Example: Check dashboard.html has correct CSS
grep "stylesheet" public/dashboard.html
# Should show: global.css, components.css, dashboard.css
```

---

### ☑️ 5. JAVASCRIPT INTEGRATION AUDIT

**Check JS is properly linked in HTML:**
```bash
# Find all <script src> references
grep -h "script src=\"/js" public/*.html | sort | uniq
```

**Required JS on authenticated pages:**
1. `/js/firebase-config.js` (MUST be first)
2. `/js/auth-check.js` (MUST be second - redirects if not logged in)
3. Page-specific JS (dashboard.js, quiz.js, etc.)

**Common mistake: Wrong order**
```html
<!-- ❌ WRONG ORDER (auth-check before firebase-config) -->
<script src="/js/auth-check.js"></script>
<script src="/js/firebase-config.js"></script>

<!-- ✅ CORRECT ORDER -->
<script src="/js/firebase-config.js"></script>
<script src="/js/auth-check.js"></script>
```

---

### ☑️ 6. FIREBASE CONFIG AUDIT

**Check firebase-config.js exists and is valid:**
```javascript
// /public/js/firebase-config.js should contain:

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
```

**Verify:**
- [ ] Firebase config object is present
- [ ] `firebase.initializeApp()` is called
- [ ] `auth` variable is declared
- [ ] `db` variable is declared
- [ ] No syntax errors

---

### ☑️ 7. STRIPE CONFIG AUDIT

**Check stripe-config.js or checkout.js has Stripe key:**
```javascript
// Should be in checkout.js
const stripe = Stripe('pk_test_YOUR_KEY_HERE');
```

**Verify:**
- [ ] Stripe publishable key is present (starts with `pk_test_` or `pk_live_`)
- [ ] Stripe object is initialized
- [ ] Key is valid (not placeholder)

---

### ☑️ 8. FUNCTION REFERENCE AUDIT

**Check for undefined function calls:**

Common issues:
```javascript
// ❌ Function called but not defined
onclick="showPaywallModal()"  // Does showPaywallModal() exist?

// ❌ Function called before definition
showDashboard();  // Called
function showDashboard() { ... }  // Defined later (might work due to hoisting)

// ❌ Function in wrong scope
// HTML: onclick="submitQuiz()"
// JS: inside async function, not globally accessible
```

**Pages to audit for function references:**
- [ ] **dashboard.html** - Check all `onclick` handlers exist in dashboard.js
- [ ] **quiz.html** - Check all functions exist in quiz.js
- [ ] **checkout.html** - Check all functions exist in checkout.js
- [ ] **certificates.html** - Check all functions exist in certificate.js
- [ ] **assignment.html** - Check all functions exist in assignment.js

---

### ☑️ 9. FIRESTORE COLLECTION AUDIT

**Verify Firestore collections are referenced correctly:**

**Collections that MUST exist (or code will fail):**
- `/users/{uid}` - User profiles and progress
- `/schools/{schoolId}` - School information
- `/courses/{courseId}` - Course details
- `/modules/{moduleId}` - Module content
- `/boards/{boardId}` - Discussion boards
- `/quizzes/{quizId}` - Quiz questions
- `/assignments/{assignmentId}` - Assignment details
- `/orders/{orderId}` - Payment orders
- `/certificates/{certId}` - Awarded certificates

**Check for typos in collection names:**
```bash
# Search for all db.collection() calls
grep -r "db.collection(" public/js/*.js
```

Common typos:
- `db.collection('user')` should be `db.collection('users')`
- `db.collection('course')` should be `db.collection('courses')`

---

### ☑️ 10. PATH REFERENCE AUDIT

**Check all file paths are correct:**

**HTML file references:**
```html
<!-- Should use absolute paths from /public root -->
<link rel="stylesheet" href="/css/global.css">  ✅
<link rel="stylesheet" href="css/global.css">   ❌ (missing leading /)

<script src="/js/firebase-config.js"></script>  ✅
<script src="js/firebase-config.js"></script>   ❌
```

**Navigation links:**
```html
<a href="/dashboard.html">Dashboard</a>  ✅
<a href="dashboard.html">Dashboard</a>   ❌ (relative path issues)
```

**Audit all internal links:**
```bash
# Find all href references
grep -h "href=\"" public/*.html | grep -v "http" | sort | uniq
```

---

### ☑️ 11. BOTTOM NAVIGATION AUDIT

**Check bottom nav is consistent across all pages:**

Should appear on:
- [ ] dashboard.html
- [ ] journey.html
- [ ] schools.html
- [ ] shop.html
- [ ] profile.html
- [ ] quiz.html
- [ ] certificates.html
- [ ] assignment.html
- [ ] resources.html

**Verify nav links:**
```html
<div class="bottom-nav">
  <a href="/dashboard.html" class="nav-item">
    <div class="nav-icon">🏠</div>
    <div class="nav-label">Home</div>
  </a>
  <!-- ... more items ... -->
</div>
```

**Check for:**
- [ ] All 5 nav items present
- [ ] Correct hrefs (absolute paths)
- [ ] Active class on current page
- [ ] Icons and labels match

---

### ☑️ 12. AUTHENTICATION FLOW AUDIT

**Verify auth-check.js redirects work:**
```javascript
// auth-check.js should contain:
firebase.auth().onAuthStateChanged(user => {
  if (!user) {
    window.location.href = '/index.html';  // Redirect if not logged in
  }
});
```

**Pages that REQUIRE authentication:**
- [ ] dashboard.html
- [ ] journey.html
- [ ] schools.html
- [ ] profile.html
- [ ] quiz.html
- [ ] certificates.html
- [ ] assignment.html
- [ ] checkout.html (should allow guest checkout OR require auth)

**Pages that DON'T require authentication:**
- [ ] index.html (landing/login)
- [ ] start-here.html (free content)
- [ ] entry-quiz.html (lead generation)
- [ ] resources.html (free content)

---

### ☑️ 13. PAYWALL INTEGRATION AUDIT

**Check paywall modal is accessible:**

**In formation-access.js:**
- [ ] `showPaywallModal()` function exists
- [ ] `createPaywallModal()` function exists
- [ ] `selectTier(productId)` redirects to `/checkout.html?product=${productId}`

**Pages that should trigger paywall:**
- [ ] Module pages (when tier insufficient)
- [ ] Video pages (when tier insufficient)
- [ ] start-here.html (on CTA clicks)
- [ ] resources.html (on upgrade prompts)
- [ ] entry-quiz.html (on result CTA)

**Test paywall trigger:**
```javascript
// In browser console (on any page with formation-access.js)
showPaywallModal();  // Should show modal
```

---

### ☑️ 14. DATA FLOW AUDIT

**Dashboard data flow:**
1. User logs in → `firebase.auth().currentUser`
2. Fetch user doc → `db.collection('users').doc(userId).get()`
3. Get progress data → `user.data().progress`
4. Calculate metrics → Render dashboard

**Quiz data flow:**
1. Get quizId from URL → `?id=quiz-teleios-week-1`
2. Fetch quiz → `db.collection('quizzes').doc(quizId).get()`
3. Render questions → User answers
4. Submit → Calculate score
5. Save attempt → `db.collection('submissions').add()`
6. Update user progress → `user.progress.passedQuizzes`

**Payment data flow:**
1. User selects tier → Redirect to checkout
2. Stripe checkout → Payment intent created
3. Payment succeeds → Webhook fires (TODO: implement)
4. Order created → `db.collection('orders').add()`
5. User tier updated → `user.tier = 'foundation'`
6. Content unlocked → `hasSufficientTier()` returns true

**Verify each step exists in code.**

---

### ☑️ 15. CONSOLE ERROR AUDIT

**Open browser DevTools and check for errors:**

**How to audit:**
1. Open Chrome DevTools (F12)
2. Go to Console tab
3. Load each page
4. Look for red error messages

**Common errors to fix:**
- [ ] `Uncaught ReferenceError: firebase is not defined` → Firebase CDN not loaded
- [ ] `Uncaught ReferenceError: functionName is not defined` → Function not defined or wrong scope
- [ ] `Failed to load resource: 404` → File path incorrect
- [ ] `CORS error` → Firebase rules too restrictive
- [ ] `Permission denied` → Firestore security rules blocking read/write

**Pages to audit (open each in browser):**
- [ ] index.html
- [ ] dashboard.html
- [ ] checkout.html
- [ ] quiz.html
- [ ] certificates.html
- [ ] assignment.html
- [ ] start-here.html
- [ ] resources.html

---

### ☑️ 16. MOBILE RESPONSIVE AUDIT

**Check responsive breakpoints exist:**
```css
/* Should exist in most CSS files */
@media (max-width: 768px) {
  /* Mobile styles */
}

@media (max-width: 1024px) {
  /* Tablet styles */
}
```

**Pages to test (use Chrome DevTools device toolbar):**
- [ ] Dashboard (should be single column on mobile)
- [ ] Checkout (card input should be full width)
- [ ] Quiz (buttons should stack vertically)
- [ ] Certificates (grid should be 1 column)
- [ ] Bottom nav (should always show on mobile)

---

### ☑️ 17. FIRESTORE SECURITY RULES AUDIT

**Check if security rules are too restrictive:**

**If users can't read/write, rules might be wrong:**
```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow users to read courses (needed for dashboard)
    match /courses/{courseId} {
      allow read: if request.auth != null;  // Logged in users can read
    }
    
    // Allow users to read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
    
    // Allow users to read quizzes
    match /quizzes/{quizId} {
      allow read: if request.auth != null;
    }
  }
}
```

**Deploy rules:**
```bash
firebase deploy --only firestore:rules
```

---

## AUDIT EXECUTION PLAN

### Step 1: Quick Visual Audit (15 minutes)
1. Open VS Code file explorer
2. Verify all files from checklist exist
3. Open each HTML file and check for:
   - Proper `<head>` section
   - Firebase CDN links
   - CSS links
   - JS script tags
   - No obvious typos

### Step 2: Syntax Check (15 minutes)
1. Open browser DevTools Console
2. Load each page one by one
3. Note any red errors
4. Fix critical errors (file not found, undefined functions)

### Step 3: Firebase Connection Test (10 minutes)
1. Open dashboard.html in browser
2. Open Console
3. Type: `firebase.auth().currentUser`
4. Should return user object if logged in, or null
5. Type: `db.collection('users').doc('test').get()`
6. Should attempt Firestore query (check for permission errors)

### Step 4: Integration Points (20 minutes)
1. Test paywall trigger: Click any "Upgrade" button → Modal should appear
2. Test checkout flow: Select tier → Should redirect to checkout page with ?product param
3. Test quiz flow: Load quiz.html?id=test-quiz → Should show quiz interface
4. Test certificate flow: Load certificates.html → Should show gallery (even if empty)

### Step 5: Document Issues (ongoing)
Create `AUDIT_ISSUES.md` with:
```markdown
# Issues Found During Audit

## Critical (Blocks Testing)
- [ ] Issue 1: Description
- [ ] Issue 2: Description

## High Priority (Major bugs)
- [ ] Issue 1: Description

## Low Priority (Minor issues)
- [ ] Issue 1: Description
```

---

## POST-AUDIT ACTIONS

### If 0-5 issues found:
✅ **Proceed to comprehensive testing phase**

### If 6-15 issues found:
⚠️ **Fix issues, then re-audit before testing**

### If 16+ issues found:
❌ **Major problems - systematically fix each category before testing**

---

## COMMON ISSUES & FIXES

### Issue: "firebase is not defined"
**Fix:** Add Firebase CDN to `<head>`:
```html
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
```

### Issue: "Cannot read property 'uid' of null"
**Fix:** Check authentication before accessing user:
```javascript
const user = firebase.auth().currentUser;
if (!user) {
  console.error('User not logged in');
  return;
}
const userId = user.uid;  // Safe
```

### Issue: "Failed to load resource: 404"
**Fix:** Check file path uses absolute path from /public root:
```html
<!-- Wrong -->
<link href="css/global.css">

<!-- Right -->
<link href="/css/global.css">
```

### Issue: "Permission denied" in Firestore
**Fix:** Update security rules to allow reads:
```javascript
match /courses/{courseId} {
  allow read: if request.auth != null;
}
```

### Issue: Function not defined in onclick
**Fix:** Ensure function is globally accessible:
```javascript
// ❌ Inside async function (not accessible)
firebase.auth().onAuthStateChanged(user => {
  function showDashboard() { }  // Not global
});

// ✅ At global scope
function showDashboard() { }  // Accessible to onclick

firebase.auth().onAuthStateChanged(user => {
  // Use function here
});
```

---

## AUDIT COMPLETE CRITERIA

✅ All files exist
✅ No syntax errors in Console
✅ Firebase connects successfully
✅ All CSS files load (no 404s)
✅ All JS files load (no 404s)
✅ No undefined function errors
✅ Paywall modal appears when triggered
✅ Bottom navigation appears on all pages
✅ Mobile view doesn't break layout

**When all criteria met → Proceed to COMPREHENSIVE_TESTING_PLAN.md**
