# 🧪 SENIOR AMBASSADOR SYSTEM - TESTING GUIDE

## Quick Test Checklist

### ✅ PRE-DEPLOYMENT TESTS (Local/Development)

#### Test 1: Firebase Functions Deploy
```bash
cd /Users/achugustave/Documents/Marriageducation
firebase deploy --only functions:checkAmbassadorPromotion,functions:onAmbassadorUpdate,functions:onNewAmbassadorCreated
```

**Expected:**
- ✅ All 3 functions deploy successfully
- ✅ No errors in console
- ✅ Functions appear in Firebase Console

---

#### Test 2: Recruitment Link Generation
**URL Format:**
```
https://marriageducation.com/ambassador-register.html?senior=AMB-SENIOR-001
```

**Steps:**
1. Open URL in browser
2. Check sessionStorage in DevTools
3. Fill registration form
4. Check "recruited by" field auto-filled

**Expected:**
- ✅ Banner shows: "You'll be part of AMB-SENIOR-001's team"
- ✅ sessionStorage has `referral_code` and `referral_type`
- ✅ Form shows referral code with green highlight

---

#### Test 3: Registration Data Capture
**Steps:**
1. Complete registration form via recruitment link
2. Check sessionStorage.ambassadorData
3. Proceed to payment page
4. Verify data passed to Cloud Function

**Expected sessionStorage.ambassadorData:**
```json
{
  "fullName": "Test Ambassador",
  "email": "test@example.com",
  "phone": "237670000000",
  "recruited_by": "AMB-SENIOR-001",
  "recruited_by_type": "senior_ambassador",
  "senior_code": "AMB-SENIOR-001",
  "regional_director_code": null,
  "ambassador_type": "regular"
}
```

---

### ✅ POST-DEPLOYMENT TESTS (Production)

#### Test 4: Firestore Write Verification
**Steps:**
1. Complete payment for test ambassador
2. Wait for admin approval
3. Check Firestore Console

**Firestore Path:** `ambassadors/[NEW_AMBASSADOR_CODE]`

**Expected Fields:**
```javascript
{
  code: "AMB-TEST-001",
  fullName: "Test Ambassador",
  email: "test@example.com",
  senior_code: "AMB-SENIOR-001",          // ✅ KEY FIELD
  regional_director_code: null,
  recruited_by: "AMB-SENIOR-001",
  recruited_by_type: "senior_ambassador",
  ambassador_type: "regular",             // ✅ STARTS REGULAR
  recruits_count: 0,
  units_deployed: 0,
  status: "active"
}
```

**Critical:** `senior_code` field MUST exist for team queries to work.

---

#### Test 5: Senior Dashboard Team Query
**Steps:**
1. Login as senior (AMB-SENIOR-001)
2. Go to senior dashboard
3. Check team members list

**Expected:**
- ✅ New ambassador appears in team list
- ✅ Team count incremented
- ✅ recruits_count increased on senior's record

**Firestore Query (check in Console):**
```javascript
ambassadors
  .where('senior_code', '==', 'AMB-SENIOR-001')
  .get()
```

Should return: AMB-TEST-001 (the new recruit)

---

#### Test 6: Commission Flow
**Steps:**
1. Trigger sale for team member (AMB-TEST-001)
2. Use processProductDeployment Cloud Function
3. Check commission credits

**Test Data:**
```javascript
{
  "sale_id": "TEST-SALE-001",
  "ambassador_code": "AMB-TEST-001",
  "product_id": "marriage-blueprint",
  "product_price": 90000,
  "customer_email": "customer@example.com"
}
```

**Expected Credits:**
- ✅ AMB-TEST-001: 9,000 FCFA (10%)
- ✅ AMB-SENIOR-001: 4,500 FCFA (5% override)
- ✅ Senior dashboard shows override earned

**Verify in Firestore:**
```javascript
// AMB-TEST-001
commissionEarned: 9000

// AMB-SENIOR-001
team_override_earned: 4500  // ✅ This is the key field
```

---

#### Test 7: Automatic Promotion (Units Threshold)
**Steps:**
1. Find regular ambassador in Firestore
2. Update `units_deployed: 500`
3. Wait 5-10 seconds for trigger
4. Check Firestore and Telegram

**Firestore Update:**
```javascript
ambassadors/AMB-TEST-001
  .update({ units_deployed: 500 })
```

**Expected:**
- ✅ `ambassador_type` changes to "senior"
- ✅ `promotion_date` added
- ✅ `promotion_reason: "units_threshold"`
- ✅ New doc in `senior_ambassadors` collection
- ✅ Telegram notification sent to admin
- ✅ Notification created in `notifications` collection

**Check Telegram:**
```
🎉 SENIOR AMBASSADOR PROMOTION!

Ambassador: AMB-TEST-001
Name: Test Ambassador
Reason: 500+ Units Deployed
Units: 500
Recruits: 0

They can now earn 5% team override commissions!
```

---

#### Test 8: Automatic Promotion (Recruits Threshold)
**Steps:**
1. Create 10 ambassadors with `senior_code: "AMB-TEST-002"`
2. Check AMB-TEST-002's `recruits_count`
3. Verify promotion triggers at 10 recruits

**Expected:**
- ✅ Each new ambassador increments `recruits_count`
- ✅ At 10 recruits: `ambassador_type` → "senior"
- ✅ `promotion_reason: "recruits_threshold"`
- ✅ Notifications sent

---

#### Test 9: Manual Promotion Check
**Steps:**
1. Use Firebase Functions Shell or callable
2. Call promotion check manually

**Command:**
```javascript
firebase functions:shell

> checkAmbassadorPromotion({ambassador_code: 'AMB-TEST-001'})
```

**Expected Response:**
```json
{
  "success": true,
  "eligible": true,
  "reason": "units_threshold",
  "data": {
    "unitsDeployed": 500,
    "recruitsCount": 0
  }
}
```

Or if not eligible:
```json
{
  "eligible": false,
  "reason": "thresholds_not_met",
  "data": {
    "unitsDeployed": 250,
    "recruitsCount": 3,
    "unitsNeeded": 250,
    "recruitsNeeded": 7
  }
}
```

---

#### Test 10: Senior Dashboard Full Features
**Steps:**
1. Login as senior with active team
2. Navigate to senior dashboard
3. Verify all sections load

**Expected Sections:**
- ✅ Performance cards (team count, override, earnings)
- ✅ Monthly income tracker ($18K target shown)
- ✅ RD pathway progress (50 seniors target)
- ✅ Technical reliability indicators (all green)
- ✅ Team portfolio table (6 categories with data)
- ✅ Live sales feed (last 50 transactions)
- ✅ Individual ambassador deep dive (expandable cards)

**Test Data Requirements:**
- Minimum 3 team members
- At least 5 sales across team
- Multiple product categories deployed

---

## 🐛 TROUBLESHOOTING TESTS

### Issue: Team Query Returns Empty
**Debug Steps:**
1. Check Firestore: Does new ambassador have `senior_code` field?
2. Check value: Does it match senior's code exactly?
3. Check collection: Is ambassador in `ambassadors` collection?

**Fix:**
```javascript
// Manually add field if missing
db.collection('ambassadors').doc('AMB-NEW-001').update({
  senior_code: 'AMB-SENIOR-001'
});
```

---

### Issue: Promotion Doesn't Trigger
**Debug Steps:**
1. Check Functions logs: `firebase functions:log --only onAmbassadorUpdate`
2. Verify threshold: `units_deployed >= 500` OR `recruits_count >= 10`
3. Check `ambassador_type`: Already "senior"?

**Manual Trigger:**
```javascript
checkAmbassadorPromotion({ambassador_code: 'AMB-TEST-001'})
```

---

### Issue: Commission Not Credited to Senior
**Debug Steps:**
1. Check sale record: Does it have `ambassador_code`?
2. Check ambassador: Does they have `senior_code`?
3. Check senior: Is `ambassador_type` = "senior"?
4. Check Functions logs: `firebase functions:log --only processProductDeployment`

**Verify Commission Flow:**
```javascript
// Check senior's override field
db.collection('ambassadors').doc('AMB-SENIOR-001').get()
  .then(doc => console.log(doc.data().team_override_earned))
```

---

### Issue: Recruitment Count Not Incrementing
**Debug Steps:**
1. Check trigger deployed: `onNewAmbassadorCreated`
2. Check new ambassador has `senior_code`
3. Check Functions logs for errors

**Manual Fix:**
```javascript
// Increment manually
db.collection('ambassadors').doc('AMB-SENIOR-001').update({
  recruits_count: FieldValue.increment(1)
});
```

---

## 📊 SUCCESS METRICS

### Deployment Success
- [ ] All Cloud Functions deployed (3/3)
- [ ] No errors in Functions logs
- [ ] HTML files uploaded to iPage
- [ ] Firebase Console accessible

### Functional Success
- [ ] Recruitment links capture hierarchy
- [ ] Firestore writes include `senior_code`
- [ ] Team queries return members
- [ ] Commissions credit to senior
- [ ] Promotions trigger automatically
- [ ] Dashboard shows real data

### User Experience Success
- [ ] Registration flow smooth
- [ ] Dashboard loads < 3 seconds
- [ ] Real-time data updates
- [ ] Mobile responsive
- [ ] No JavaScript errors in console

---

## 🚀 PRODUCTION READINESS

### Before Go-Live:
1. ✅ All 10 tests passed
2. ✅ Troubleshooting guide validated
3. ✅ Backup Firestore data
4. ✅ Monitor Functions logs for 24 hours
5. ✅ Test with 3 real ambassadors

### Go-Live Checklist:
- [ ] Announce to existing ambassadors
- [ ] Send recruitment link instructions
- [ ] Monitor registrations for first week
- [ ] Track promotion triggers
- [ ] Verify commission credits
- [ ] Collect ambassador feedback

### Success Criteria:
- Zero critical bugs in first 48 hours
- Recruitment links work 100% of time
- Commissions credit accurately
- Dashboard data accurate
- Promotions trigger correctly

---

## 📞 SUPPORT CONTACTS

### Technical Issues:
- Firebase Console: https://console.firebase.google.com/project/marriage-education
- Functions Logs: https://console.firebase.google.com/project/marriage-education/functions
- Firestore Database: https://console.firebase.google.com/project/marriage-education/firestore

### Documentation:
- Full System: `SENIOR_AMBASSADOR_SYSTEM_COMPLETE.md`
- Architecture: `SYSTEM_ARCHITECTURE_DIAGRAM.md`
- Testing: `SENIOR_AMBASSADOR_TESTING_GUIDE.md` (this file)

---

**Test Status:** 🟡 Ready for Testing
**Deployment Status:** 🟡 Ready to Deploy
**Production Status:** 🔴 Awaiting Tests

Run: `./deploy-senior-system.sh` to start deployment
