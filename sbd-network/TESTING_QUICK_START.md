# TESTING QUICK START
# ====================

## ⚡ START HERE (5 minutes)

### 1. Start Local Server
```bash
cd /Users/achugustave/Documents/Marriageducation/sbd-network
firebase serve
```
**Server:** http://localhost:5000

---

### 2. Open Browser DevTools
- Press **F12** (or Cmd+Option+I on Mac)
- Keep **Console** tab open
- Keep **Network** tab available

---

### 3. Create Test User (Firebase Console)
1. Go to: https://console.firebase.google.com
2. Select project: `marriage-education`
3. Authentication → Users → **Add User**
4. Email: `test@sbdnetwork.com`
5. Password: `TestPassword123!`
6. Click **Add User**
7. **Copy User UID** (you'll need this)

---

### 4. Create Test Data (Firestore)
**Option A: Manual (5 min)**
1. Firestore Database → Start collection: `users`
2. Document ID: [paste User UID from step 3]
3. Add fields:
```
uid: [User UID]
email: "test@sbdnetwork.com"
displayName: "Test User"
tier: "free"
```
4. Create nested object `progress`:
```
completedModules: []
currentBoard: "teleios-identity"
passedQuizzes: []
streak: 0
```

**Option B: Skip for now** (test with minimal data first)

---

## 🧪 SMOKE TEST (15 minutes)

### Test 1: Load Pages
- [ ] http://localhost:5000/index.html → Login page loads
- [ ] Login with test user → Redirects to dashboard
- [ ] http://localhost:5000/dashboard.html → Dashboard loads
- [ ] Check Console → **0 errors** (ignore warnings)

### Test 2: Navigation
- [ ] Click any bottom nav item → Page loads
- [ ] Click "Profile" → Profile loads
- [ ] Click "Home" → Dashboard loads

### Test 3: Paywall
- [ ] Click "Upgrade" or "Unlock" button anywhere
- [ ] Paywall modal appears
- [ ] Click tier → Redirects to checkout
- [ ] Checkout page loads

### Test 4: Checkout
- [ ] http://localhost:5000/checkout.html loads
- [ ] Stripe logo visible
- [ ] No JavaScript errors in Console

**If all 4 tests pass → Continue to comprehensive testing**
**If any test fails → Check BUGS_FOUND.md template, document issue**

---

## 🎯 PRIORITY TESTING ORDER

### Day 1: Critical Path (3 hours)
1. **Checkout & Payment** (1 hour)
   - Test card payment: `4242 4242 4242 4242`
   - Verify user tier updates
   - Check success page

2. **Dashboard** (1 hour)
   - Load as free user
   - Load as paid user
   - Check progress ring

3. **Paywall** (30 min)
   - Trigger modal
   - Test tier selection
   - Verify redirect

4. **Quiz System** (30 min)
   - Load quiz
   - Pass quiz (≥80%)
   - Fail quiz (<80%)

### Day 2: Learning Systems (3 hours)
5. **Certificates** (1 hour)
6. **Assignments** (1 hour)
7. **Integration Tests** (1 hour)

### Day 3: Free Tier & Admin (2 hours)
8. **Free Content** (1 hour)
9. **Video Preview** (30 min)
10. **Admin Builder** (30 min)

### Day 4: Responsive & Performance (2 hours)
11. **Mobile Testing** (1 hour)
12. **Performance** (1 hour)

---

## 📋 TESTING CHECKLIST

### Phase 1: Revenue (Checkout)
- [ ] 1.1 Checkout page load
- [ ] 1.2 Tier selection
- [ ] 1.3 Payment success (4242 4242 4242 4242)
- [ ] 1.4 Payment decline (4000 0000 0000 0002)
- [ ] 1.5 Form validation
- [ ] 1.6 Success page
- [ ] 1.7 URL params work

### Phase 2: Dashboard
- [ ] 2.1 Load (free user)
- [ ] 2.2 Load (paid user)
- [ ] 2.3 Progress ring
- [ ] 2.4 Teleios level
- [ ] 2.5 Streak counter
- [ ] 2.6 Section interactions
- [ ] 2.7 Mobile responsive

### Phase 3A: Paywall
- [ ] 3a.1 Modal trigger
- [ ] 3a.2 Tier comparison
- [ ] 3a.3 Tier selection redirect
- [ ] 3a.4 Paid user bypass

### Phase 3B: Quiz
- [ ] 3b.1 Quiz load
- [ ] 3b.2 Navigation
- [ ] 3b.3 Pass (≥80%)
- [ ] 3b.4 Fail (<80%)
- [ ] 3b.5 Answer feedback
- [ ] 3b.6 Retake
- [ ] 3b.7 Blocking

### Phase 3C: Certificates
- [ ] 3c.1 Gallery load
- [ ] 3c.2 Auto-award
- [ ] 3c.3 Modal view
- [ ] 3c.4 Download PNG
- [ ] 3c.5 Multiple certs

### Phase 3D: Assignments
- [ ] 3d.1 Page load
- [ ] 3d.2 Validation
- [ ] 3d.3 Submission
- [ ] 3d.4 Previous submissions
- [ ] 3d.5 Resubmission
- [ ] 3d.6 Auth gate

### Phase 4: Free Tier
- [ ] 4.1 Start-here load
- [ ] 4.2 CTAs work
- [ ] 4.3 Entry quiz load
- [ ] 4.4 Quiz completion
- [ ] 4.5 Resources load
- [ ] 4.6 Inline CTAs
- [ ] 4.7 Video preview load
- [ ] 4.8 Time limit (5 min)
- [ ] 4.9 Seeking prevention
- [ ] 4.10 Paid user full access

### Phase 5: Admin
- [ ] 5.1 Admin access
- [ ] 5.2 Create course
- [ ] 5.3 Course list
- [ ] 5.4 Edit course
- [ ] 5.5 Delete course

### Integration Tests
- [ ] End-to-end journey
- [ ] Tier upgrade
- [ ] Quiz blocking

### Responsive
- [ ] Mobile (iPhone)
- [ ] Tablet (iPad)
- [ ] Desktop

### Performance
- [ ] Dashboard <3s load
- [ ] Firestore <10 reads
- [ ] No memory leaks

### Security
- [ ] Auth gates work
- [ ] Firestore rules
- [ ] Tier access

---

## 🐛 BUG SEVERITY GUIDE

### 🔴 Critical (Fix Immediately)
- Site crashes
- Can't login
- Payment doesn't process
- Data loss

### 🟠 High (Fix Before Launch)
- Major UI broken
- Feature doesn't work
- Security issue

### 🟡 Medium (Fix After Launch)
- Minor UI issue
- Non-critical feature broken
- Performance slowdown

### 🟢 Low (Nice to Have)
- Visual polish
- Edge case bug
- Enhancement

---

## 📊 PROGRESS TRACKING

**Audit:** ✅ Complete (0 critical issues)
**Smoke Test:** ⬜ Not started

**Phases Complete:** 0 / 12

**Bugs Found:** 0
- Critical: 0
- High: 0
- Medium: 0
- Low: 0

**Estimated Completion:** ___ hours remaining

---

## 🚨 STOP TESTING IF:
- [ ] More than 5 critical bugs found
- [ ] Firebase auth completely broken
- [ ] Stripe payment fails repeatedly
- [ ] Dashboard won't load at all

**→ Fix critical issues first, then resume testing**

---

## 🎉 TESTING COMPLETE CRITERIA

- [ ] All 12 phases tested
- [ ] 0 critical bugs
- [ ] <5 high priority bugs
- [ ] Integration tests pass
- [ ] Responsive on 3 devices
- [ ] Performance targets met

**When complete → Review DEPLOYMENT_CHECKLIST.md**

---

## 📞 QUICK REFERENCE

**Stripe Test Cards:**
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Expiry: Any future date (12/28)
- CVC: Any 3 digits (123)

**Test User:**
- Email: `test@sbdnetwork.com`
- Password: `TestPassword123!`

**Local Server:**
- URL: http://localhost:5000

**Firebase Console:**
- https://console.firebase.google.com
- Project: `marriage-education`

---

## 🔗 DOCUMENTS

**Testing:**
- [QUICK_AUDIT_RESULTS.md](QUICK_AUDIT_RESULTS.md) ← Audit complete
- [TESTING_EXECUTION_GUIDE.md](TESTING_EXECUTION_GUIDE.md) ← Detailed guide
- [COMPREHENSIVE_TESTING_PLAN.md](COMPREHENSIVE_TESTING_PLAN.md) ← All test cases
- [BUGS_FOUND.md](BUGS_FOUND.md) ← Track issues

**Reference:**
- [PROJECT_COMPLETE.md](PROJECT_COMPLETE.md) ← Feature overview
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) ← Launch guide
- [PERFORMANCE_OPTIMIZATION.md](PERFORMANCE_OPTIMIZATION.md) ← Scaling guide

---

**READY TO TEST. LET'S GO! 🚀**
