# TESTING EXECUTION GUIDE
# ========================
#
# Quick-start guide to begin testing immediately

## SETUP (15 minutes)

### 1. Start Local Server
```bash
cd /Users/achugustave/Documents/Marriageducation/sbd-network

# Option A: Firebase Hosting
firebase serve
# Server starts at: http://localhost:5000

# Option B: Live Server (VS Code extension)
# Right-click index.html → "Open with Live Server"
# Server starts at: http://127.0.0.1:5500
```

### 2. Create Test User
1. Navigate to Firebase Console → Authentication
2. Click "Add User"
3. Email: `test@sbdnetwork.com`
4. Password: `TestPassword123!`
5. Click "Add User"
6. Note the User UID (you'll need it for Firestore)

### 3. Create Test Data in Firestore

**Option A: Manually via Firebase Console**
1. Open Firebase Console → Firestore Database
2. Create collections and documents per COMPREHENSIVE_TESTING_PLAN.md → "Test Data Setup"

**Option B: Run Script (if you have one)**
```bash
# If you create a seed script
node scripts/seed-test-data.js
```

**Minimum Required Data:**
```javascript
// /users/{testUserId}
{
  uid: "paste-user-uid-here",
  email: "test@sbdnetwork.com",
  displayName: "Test User",
  tier: "free",
  progress: {
    completedModules: [],
    currentBoard: "teleios-identity",
    passedQuizzes: [],
    streak: 0
  }
}

// /schools/teleios-school
{
  id: "teleios-school",
  name: "Teleios Identity School",
  description: "Discover your covenant identity",
  requiredTier: "foundation",
  courseCount: 1
}

// /courses/test-course-1
{
  id: "test-course-1",
  title: "Week 1: Covenant Foundations",
  schoolId: "teleios-school",
  requiredTier: "foundation",
  duration: "45 minutes",
  modules: 5
}
```

### 4. Open Browser DevTools
- Chrome: F12 or Cmd+Option+I (Mac)
- Keep Console tab open throughout testing
- Keep Network tab available for performance checks

---

## TESTING ORDER (Prioritized)

### 🚨 PHASE 0: PRE-TESTING AUDIT (1 hour)
**Do this FIRST before comprehensive testing**

```bash
# Open PRE_TESTING_AUDIT.md and work through checklist
```

**Critical Checks:**
1. All files exist (check file structure)
2. No syntax errors (load pages, check Console)
3. Firebase config valid
4. CSS/JS properly linked
5. No 404 errors

**Action:** Fix any issues found before proceeding

---

### ⚡ PHASE 1: SMOKE TEST (30 minutes)
**Quick validation that core flows work**

**Test Path:**
1. Load `/index.html` → Should show login
2. Login with test user → Should redirect to `/dashboard.html`
3. Dashboard loads → Check for errors in Console
4. Click any navigation link → Verify pages load
5. Trigger paywall (click upgrade) → Modal appears
6. Navigate to `/checkout.html` → Page loads
7. Navigate to `/start-here.html` → Free content loads

**Stop Criteria:** If any page crashes or shows blank screen, fix immediately

---

### 💰 PHASE 2: CRITICAL PATH TESTING (2 hours)
**Test revenue-generating flow (most important)**

**Test: Signup → Purchase → Access Content**

1. **Checkout Flow** (COMPREHENSIVE_TESTING_PLAN.md → Phase 1 tests)
   - Test 1.1: Checkout page load
   - Test 1.2: Tier selection
   - Test 1.3: Payment with test card (4242 4242 4242 4242)
   - Test 1.4: Declined payment (4000 0000 0000 0002)
   - Test 1.6: Success page

2. **Access Control**
   - Verify free user sees paywall
   - Verify paid user (Foundation) accesses Foundation content
   - Verify Foundation user sees upgrade prompt for Premium content

**Success Metric:** Can complete full purchase and unlock content

---

### 📊 PHASE 3: DASHBOARD & LEARNING SYSTEMS (3 hours)

**Test: Core Product Experience**

1. **Dashboard** (Phase 2 tests)
   - Test 2.1: Dashboard load (free user)
   - Test 2.2: Dashboard load (paid user with progress)
   - Test 2.3: Progress ring calculation
   - Test 2.4: Teleios level algorithm
   - Test 2.7: Mobile responsive

2. **Quiz System** (Phase 3B tests)
   - Test 3b.1: Quiz page load
   - Test 3b.3: Pass quiz (score ≥80%)
   - Test 3b.4: Fail quiz (score <80%)
   - Test 3b.7: Quiz blocking logic

3. **Certificates** (Phase 3C tests)
   - Test 3c.2: Certificate auto-award on course completion
   - Test 3c.3: Certificate modal view
   - Test 3c.4: Certificate download PNG

**Success Metric:** User can complete course, pass quiz, earn certificate

---

### 🎓 PHASE 4: FREE TIER & ENGAGEMENT (2 hours)

**Test: Top of Funnel (Lead Generation)**

1. **Free Content** (Phase 4 tests)
   - Test 4.1: Start-here page load
   - Test 4.2: CTAs trigger paywall
   - Test 4.3: Entry quiz load
   - Test 4.4: Entry quiz completion + recommendation
   - Test 4.5: Resources page load
   - Test 4.6: Inline CTAs

2. **Video Preview** (Phase 4 tests)
   - Test 4.7: Video preview page load
   - Test 4.8: 5-minute time limit enforcement
   - Test 4.9: Seeking prevention
   - Test 4.10: Paid user gets full access

**Success Metric:** Free content drives user to paywall, quiz provides value

---

### 🛠️ PHASE 5: ADMIN & ASSIGNMENTS (1.5 hours)

**Test: Content Management & Submissions**

1. **Admin Builder** (Phase 5 tests)
   - Test 5.1: Admin page access (auth required)
   - Test 5.2: Course creation
   - Test 5.3: Course list display
   - Test 5.4: Course editing
   - Test 5.5: Course deletion

2. **Assignments** (Phase 3D tests)
   - Test 3d.1: Assignment page load
   - Test 3d.2: Validation (min 100 words)
   - Test 3d.3: Submission success
   - Test 3d.4: Previous submissions display

**Success Metric:** Admin can create courses, users can submit assignments

---

### 🔗 PHASE 6: INTEGRATION TESTING (2 hours)

**Test: End-to-End User Journeys**

1. **Full Journey** (Integration Test 1)
   - Start-here → Entry quiz → Paywall → Checkout → Dashboard → Course → Quiz → Certificate

2. **Tier Upgrade** (Integration Test 2)
   - Foundation user → Premium content → Paywall → Upgrade → Access granted

3. **Quiz Blocking** (Integration Test 3)
   - Complete module → Fail quiz → Module 2 locked → Pass quiz → Module 2 unlocked

**Success Metric:** Complete user journey works without errors

---

### 📱 PHASE 7: RESPONSIVE & BROWSER TESTING (2 hours)

**Test: Cross-Device & Cross-Browser**

1. **Mobile** (iPhone 12 Pro - 390x844)
   - All pages load without horizontal scroll
   - Bottom nav always visible
   - Touch targets ≥44px
   - Forms usable

2. **Tablet** (iPad - 768x1024)
   - 2-column grids
   - No wasted space

3. **Desktop** (1920x1080)
   - Max content width
   - 3-column grids

4. **Browsers**
   - Chrome ✅
   - Safari ✅
   - Firefox ✅
   - Edge ✅

**Success Metric:** Works on all devices and browsers

---

### ⚡ PHASE 8: PERFORMANCE & SECURITY (1.5 hours)

**Test: Speed & Protection**

1. **Performance**
   - Dashboard load <3s
   - Firestore reads <10 per page
   - Images optimized

2. **Security**
   - Protected pages require auth
   - Firestore rules prevent unauthorized access
   - Tier access control enforced

**Success Metric:** Fast load times, secure data access

---

## TESTING CHECKLIST

### Daily Testing Session
- [ ] Start local server
- [ ] Open DevTools Console
- [ ] Login as test user
- [ ] Clear browser cache (for fresh load times)
- [ ] Note current Phase focus
- [ ] Document bugs in BUGS_FOUND.md
- [ ] Fix critical bugs immediately
- [ ] Mark completed tests in COMPREHENSIVE_TESTING_PLAN.md

### After Each Test
- [ ] Check Console for errors
- [ ] Check Network tab for 404s
- [ ] Verify data saved to Firestore (refresh Firebase Console)
- [ ] Screenshot any bugs (for documentation)

### End of Day
- [ ] Update BUGS_FOUND.md with all issues
- [ ] Prioritize critical bugs for next day
- [ ] Commit any fixes to Git
- [ ] Update testing progress

---

## QUICK REFERENCE: TEST STRIPE CARDS

**Success:**
- `4242 4242 4242 4242` (any expiry/CVC)

**Decline:**
- `4000 0000 0000 0002` (generic decline)

**3D Secure:**
- `4000 0025 0000 3155` (requires authentication)

**Insufficient Funds:**
- `4000 0000 0000 9995`

---

## QUICK REFERENCE: TEST USER TIERS

**Free Tier User:**
```javascript
db.collection('users').doc(userId).update({ tier: 'free' })
```

**Foundation Tier User:**
```javascript
db.collection('users').doc(userId).update({ tier: 'foundation' })
```

**Premium Tier User:**
```javascript
db.collection('users').doc(userId).update({ tier: 'premium' })
```

**Elite Tier User:**
```javascript
db.collection('users').doc(userId).update({ tier: 'elite' })
```

---

## COMMON TESTING ISSUES & FIXES

### Issue: "firebase is not defined"
**Fix:** Firebase CDN not loaded. Add to HTML `<head>`:
```html
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
```

### Issue: "Permission denied" in Firestore
**Fix:** Security rules too restrictive. Update rules:
```javascript
match /courses/{courseId} {
  allow read: if request.auth != null;
}
```

### Issue: Page loads blank
**Check:**
1. Console errors (JavaScript crash)
2. Missing CSS file (404 in Network tab)
3. Missing HTML content
4. Wrong file path

### Issue: Payment doesn't process
**Check:**
1. Stripe key is correct (starts with `pk_test_`)
2. Stripe.js CDN loaded
3. Network tab shows request to Stripe API
4. Console shows any Stripe errors

---

## TESTING PROGRESS TRACKER

**Audit Complete:** ⬜ (⬜ Not started, 🟨 In progress, ✅ Complete)
**Phase 1 - Checkout:** ⬜
**Phase 2 - Dashboard:** ⬜
**Phase 3A - Paywall:** ⬜
**Phase 3B - Quiz:** ⬜
**Phase 3C - Certificates:** ⬜
**Phase 3D - Assignments:** ⬜
**Phase 4 - Free Tier:** ⬜
**Phase 5 - Admin:** ⬜
**Integration Tests:** ⬜
**Responsive Tests:** ⬜
**Performance Tests:** ⬜
**Security Tests:** ⬜

**Total Progress:** 0/12 phases complete

---

## WHEN TO STOP & FIX

**Stop testing immediately if:**
- [ ] Firebase auth completely broken (can't login)
- [ ] Dashboard crashes on load (blank page)
- [ ] Checkout payment doesn't process
- [ ] More than 5 critical bugs found
- [ ] Security vulnerability discovered

**Fix these before continuing testing.**

---

## TESTING COMPLETE CRITERIA

✅ All 12 testing phases complete
✅ 0 critical bugs
✅ <5 high priority bugs
✅ All integration flows functional
✅ Responsive on mobile/tablet/desktop
✅ Works on all major browsers
✅ Performance targets met (<3s load time)
✅ Security rules enforced

**When complete → Review DEPLOYMENT_CHECKLIST.md**

---

## ESTIMATED TIME

**With 0 bugs:** 15-20 hours total
**With minor bugs:** 20-30 hours (including fixes)
**With major issues:** 30-40 hours (requires debugging)

**Recommended:** 2-4 hours per day over 5-7 days for thorough testing

---

## QUESTIONS WHILE TESTING?

**Refer to:**
- `PRE_TESTING_AUDIT.md` - Setup and file checks
- `COMPREHENSIVE_TESTING_PLAN.md` - Detailed test cases
- `BUGS_FOUND.md` - Document issues
- `PROJECT_COMPLETE.md` - Feature overview
- Phase-specific guides (STRIPE_IMPLEMENTATION_GUIDE.md, QUIZ_SYSTEM_GUIDE.md, etc.)

**Need help?** Check Console errors first, then Firebase Console (Firestore, Auth tabs)

---

**READY TO BEGIN TESTING. LET'S GO! 🚀**
