# COMPREHENSIVE TESTING PLAN
# ===========================
# 
# Systematic testing protocol for all 6 phases
# Run AFTER completing PRE_TESTING_AUDIT.md

## TESTING ENVIRONMENT SETUP

### Prerequisites
- [ ] Audit complete (0 critical issues)
- [ ] Firebase project created and configured
- [ ] Stripe test mode configured with test keys
- [ ] Test user account created in Firebase Auth
- [ ] Local server running (`firebase serve` or Live Server)
- [ ] Browser DevTools open (Console + Network tabs)

### Test User Setup
```javascript
// Create test user via Firebase Console or Auth UI
Email: test@sbdnetwork.com
Password: TestPassword123!
```

### Test Data Setup (Firestore)
Create these documents before testing:

**Test User Document:**
```javascript
// /users/{testUserId}
{
  uid: "test-user-123",
  email: "test@sbdnetwork.com",
  displayName: "Test User",
  tier: "free",  // Start as free, will upgrade during testing
  createdAt: firebase.firestore.Timestamp.now(),
  progress: {
    completedModules: [],
    currentBoard: "teleios-identity",
    passedQuizzes: [],
    streak: 0,
    totalPoints: 0
  },
  stats: {
    coursesCompleted: 0,
    quizzesCompleted: 0,
    certificatesEarned: 0
  }
}
```

**Test School:**
```javascript
// /schools/teleios-school
{
  id: "teleios-school",
  name: "Teleios Identity School",
  description: "Discover your covenant identity",
  requiredTier: "foundation",
  courseCount: 1,
  order: 1
}
```

**Test Course:**
```javascript
// /courses/teleios-course-1
{
  id: "teleios-course-1",
  title: "Week 1: Covenant Foundations",
  schoolId: "teleios-school",
  description: "Understanding covenant marriage",
  requiredTier: "foundation",
  duration: "45 minutes",
  modules: 5,
  order: 1
}
```

**Test Module:**
```javascript
// /modules/module-teleios-1
{
  id: "module-teleios-1",
  title: "What is Covenant?",
  courseId: "teleios-course-1",
  content: "Introduction to covenant marriage principles...",
  videoUrl: "https://example.com/video.mp4",
  duration: 15,
  order: 1,
  linkedBoardId: "teleios-week1-discussion"
}
```

**Test Quiz:**
```javascript
// /quizzes/quiz-teleios-week-1
{
  id: "quiz-teleios-week-1",
  title: "Week 1 Assessment",
  courseId: "teleios-course-1",
  requiredTier: "foundation",
  passingScore: 80,
  questions: [
    {
      id: "q1",
      text: "What is the primary purpose of covenant marriage?",
      options: [
        "Personal happiness",
        "Reflecting God's character",
        "Social status",
        "Financial security"
      ],
      correctAnswer: 1,
      explanation: "Covenant marriage reflects God's faithful love."
    },
    {
      id: "q2",
      text: "Which best describes covenant commitment?",
      options: [
        "Based on feelings",
        "Contingent on circumstances",
        "Unconditional and permanent",
        "Negotiable"
      ],
      correctAnswer: 2,
      explanation: "Covenant is unconditional and lifelong."
    }
    // Add 3-5 more questions for realistic testing
  ]
}
```

**Test Assignment:**
```javascript
// /assignments/assignment-teleios-1
{
  id: "assignment-teleios-1",
  title: "Reflect on Your Covenant Identity",
  courseId: "teleios-course-1",
  description: "Write 100-200 words reflecting...",
  requiredTier: "foundation",
  minWords: 100,
  dueDate: firebase.firestore.Timestamp.fromDate(new Date('2026-12-31'))
}
```

---

## PHASE 1: REVENUE FOUNDATION TESTING

### Test 1.1: Checkout Page Load
**Objective:** Verify checkout page loads without errors

**Steps:**
1. Navigate to `/checkout.html`
2. Check Console for errors
3. Verify Stripe.js loaded

**Expected Results:**
- [ ] Page loads without 404 errors
- [ ] Stripe logo/branding visible
- [ ] No JavaScript errors in Console
- [ ] Three tier cards display (Foundation, Premium, Elite)

**Pass Criteria:** All expected results met

---

### Test 1.2: Tier Selection
**Objective:** Verify tier selection and price display

**Steps:**
1. Click "Select Foundation" button
2. Verify price shows $9/month
3. Click "Select Premium" button  
4. Verify price shows $20/month
5. Click "Select Elite" button
6. Verify price shows $50/month

**Expected Results:**
- [ ] Selected tier card highlights (border glow)
- [ ] Price updates correctly
- [ ] Tier name displays in payment summary
- [ ] Features list shows correctly for each tier

**Pass Criteria:** All tiers selectable, prices correct

---

### Test 1.3: Payment Form - Test Card Success
**Objective:** Test successful payment with Stripe test card

**Steps:**
1. Select Foundation tier ($9)
2. Fill in payment form:
   - Card: `4242 4242 4242 4242`
   - Expiry: `12/28`
   - CVC: `123`
   - Zip: `12345`
3. Click "Complete Payment" button
4. Wait for processing

**Expected Results:**
- [ ] Loading spinner appears during processing
- [ ] No errors in Console
- [ ] Redirects to `/success.html`
- [ ] Order document created in Firestore `/orders/{orderId}`
- [ ] User tier updated to `foundation` in `/users/{userId}`
- [ ] Success page shows confirmation message

**Pass Criteria:** Payment succeeds, user tier updated, redirect works

---

### Test 1.4: Payment Form - Test Card Decline
**Objective:** Test declined payment handling

**Steps:**
1. Select Foundation tier
2. Fill in payment form:
   - Card: `4000 0000 0000 0002` (Stripe test card that declines)
   - Expiry: `12/28`
   - CVC: `123`
   - Zip: `12345`
3. Click "Complete Payment"

**Expected Results:**
- [ ] Error message displays: "Your card was declined"
- [ ] User stays on checkout page
- [ ] No order created in Firestore
- [ ] User tier remains `free`
- [ ] Can retry payment with different card

**Pass Criteria:** Decline handled gracefully, no crash

---

### Test 1.5: Payment Form - Validation
**Objective:** Test form validation

**Steps:**
1. Leave all fields empty
2. Click "Complete Payment"
3. Check for validation errors

**Expected Results:**
- [ ] Card field shows error: "Your card number is incomplete"
- [ ] Cannot submit with empty fields
- [ ] Error styling applied (red border)

**Steps (continued):**
4. Enter invalid card: `1111 1111 1111 1111`
5. Click "Complete Payment"

**Expected Results:**
- [ ] Error: "Your card number is invalid"
- [ ] Payment does not process

**Pass Criteria:** All validation errors display correctly

---

### Test 1.6: Success Page
**Objective:** Verify success page displays correctly

**Steps:**
1. Complete successful payment (Test 1.3)
2. Arrive at `/success.html`
3. Check page content

**Expected Results:**
- [ ] Success message displays
- [ ] Order details show (tier name, price)
- [ ] "Go to Dashboard" button visible
- [ ] Clicking button redirects to `/dashboard.html`
- [ ] Order ID displayed (retrieved from URL params)

**Pass Criteria:** Success page functional, CTA works

---

### Test 1.7: URL Parameter Handling
**Objective:** Verify checkout accepts product parameter

**Steps:**
1. Navigate to `/checkout.html?product=foundation-monthly`
2. Verify Foundation tier pre-selected
3. Navigate to `/checkout.html?product=premium-monthly`
4. Verify Premium tier pre-selected

**Expected Results:**
- [ ] URL param correctly pre-selects tier
- [ ] Price matches selected tier
- [ ] Works for all three tiers (foundation, premium, elite)

**Pass Criteria:** URL params work, correct tier pre-selected

---

## PHASE 2: DASHBOARD TRANSFORMATION TESTING

### Test 2.1: Dashboard Load - Free User
**Objective:** Verify dashboard loads for free tier user

**Steps:**
1. Login as test user (tier: 'free')
2. Navigate to `/dashboard.html`
3. Check Console for errors

**Expected Results:**
- [ ] Page loads without errors
- [ ] All 5 sections render:
  1. Continue Your Journey
  2. Identity Status
  3. This Week's Work
  4. Active Discussions
  5. Next Action
- [ ] Bottom navigation appears
- [ ] Empty states show (since no progress yet)

**Pass Criteria:** Dashboard loads, no crashes, empty states friendly

---

### Test 2.2: Dashboard Load - Paid User
**Objective:** Verify dashboard loads for paid user with progress

**Steps:**
1. Update test user in Firestore:
   ```javascript
   tier: "foundation",
   progress: {
     completedModules: ["module-teleios-1"],
     currentBoard: "teleios-week1-discussion",
     passedQuizzes: ["quiz-teleios-week-1"],
     streak: 3,
     totalPoints: 150
   }
   ```
2. Refresh `/dashboard.html`

**Expected Results:**
- [ ] Progress ring shows 20% (1/5 modules complete)
- [ ] Streak counter shows "3 days"
- [ ] Continue Journey section shows next module
- [ ] Identity Status shows "Teleios: Apprentice"
- [ ] This Week's Work shows incomplete items
- [ ] Active Discussions filtered by current board
- [ ] Next Action button shows clear CTA

**Pass Criteria:** All sections render with real data

---

### Test 2.3: Progress Ring Calculation
**Objective:** Verify progress percentage calculates correctly

**Test Cases:**
- 0/5 modules → 0%
- 1/5 modules → 20%
- 3/5 modules → 60%
- 5/5 modules → 100%

**Steps:**
1. Update `progress.completedModules` array in Firestore
2. Refresh dashboard
3. Verify progress ring updates

**Expected Results:**
- [ ] Percentage displays correctly
- [ ] SVG circle animation fills to correct degree
- [ ] Color changes: 0-33% (red), 34-66% (orange), 67-100% (green)

**Pass Criteria:** Progress ring accurate for all test cases

---

### Test 2.4: Teleios Level Algorithm
**Objective:** Verify identity status levels calculate correctly

**Test Cases:**
- 0-4 modules → "Seeker"
- 5-9 modules → "Apprentice"  
- 10-19 modules → "Intermediate"
- 20-29 modules → "Advanced"
- 30+ modules → "Master"

**Steps:**
1. Update `progress.completedModules` count
2. Refresh dashboard
3. Check "Identity Status" section

**Expected Results:**
- [ ] Level name displays correctly
- [ ] Level badge/icon shows
- [ ] Description text updates

**Pass Criteria:** All 5 levels display correctly

---

### Test 2.5: Streak Counter
**Objective:** Verify daily streak increments

**Steps:**
1. Set `progress.streak: 0`
2. Complete an action (module, quiz, discussion post)
3. Verify streak increments to 1
4. Complete another action same day
5. Verify streak stays at 1 (doesn't double count)

**Expected Results:**
- [ ] Streak increments once per day
- [ ] Streak resets to 0 if no activity for 2+ days
- [ ] Streak icon shows fire emoji 🔥
- [ ] "X day streak" text displays

**Pass Criteria:** Streak logic works correctly

---

### Test 2.6: Section Interactions
**Objective:** Test all interactive elements

**Steps:**
1. Click "Continue Journey" card
   - Should navigate to next module page
2. Click "Join Discussion" button
   - Should navigate to discussion board
3. Click "Take Quiz" button
   - Should navigate to `/quiz.html?id={quizId}`
4. Click "Next Action" button
   - Should navigate to recommended next step

**Expected Results:**
- [ ] All buttons functional
- [ ] Navigation works (no 404s)
- [ ] URL params passed correctly

**Pass Criteria:** All section CTAs work

---

### Test 2.7: Mobile Responsive Layout
**Objective:** Verify dashboard adapts to mobile screens

**Steps:**
1. Open Chrome DevTools
2. Enable device toolbar (Cmd+Shift+M)
3. Select iPhone 12 Pro (390x844)
4. Reload dashboard

**Expected Results:**
- [ ] Single column layout (no horizontal scroll)
- [ ] Progress ring scales down appropriately
- [ ] Section cards stack vertically
- [ ] Bottom nav visible and functional
- [ ] Text readable (min 14px font size)
- [ ] Touch targets ≥44px (buttons, links)

**Pass Criteria:** Mobile layout usable, no broken UI

---

## PHASE 3A: PAYWALL MODAL TESTING

### Test 3a.1: Paywall Modal Trigger
**Objective:** Verify paywall modal appears when triggered

**Steps:**
1. Login as free tier user
2. Navigate to a module requiring `foundation` tier
3. Click "Start Module" button

**Expected Results:**
- [ ] Paywall modal appears (overlay + modal)
- [ ] Background blurs
- [ ] Modal shows 3 tier cards
- [ ] Close button (X) visible
- [ ] ESC key closes modal
- [ ] Clicking overlay closes modal

**Pass Criteria:** Modal appears and can be closed

---

### Test 3a.2: Tier Comparison Display
**Objective:** Verify all tier information displays correctly

**Steps:**
1. Trigger paywall modal
2. Review each tier card

**Expected Results:**
- [ ] **Foundation ($9/mo)** card shows:
  - All Teleios Identity School content
  - Weekly quizzes
  - Discussion board access
  - Price: $9/month
  - "Select Foundation" button
- [ ] **Premium ($20/mo)** card shows:
  - Everything in Foundation
  - All 3 schools (Teleios, Sexual, Generational)
  - Priority support
  - Price: $20/month
  - Highlighted as "Most Popular"
  - "Select Premium" button
- [ ] **Elite ($50/mo)** card shows:
  - Everything in Premium
  - 1-on-1 coaching calls
  - Private community access
  - Early access to new content
  - Price: $50/month
  - "Select Elite" button

**Pass Criteria:** All tier details accurate and readable

---

### Test 3a.3: Tier Selection and Redirect
**Objective:** Verify selecting tier redirects to checkout

**Steps:**
1. Open paywall modal
2. Click "Select Foundation" button
3. Verify redirect to `/checkout.html?product=foundation-monthly`

**Steps (repeat for other tiers):**
4. Trigger paywall again
5. Click "Select Premium" button
6. Verify redirect to `/checkout.html?product=premium-monthly`

**Expected Results:**
- [ ] Redirect happens immediately
- [ ] URL param correct for each tier
- [ ] Checkout page pre-selects correct tier
- [ ] User can complete payment from checkout

**Pass Criteria:** All tier buttons redirect correctly

---

### Test 3a.4: Paywall for Already-Paid User
**Objective:** Verify paid users don't see paywall

**Steps:**
1. Update test user: `tier: "foundation"`
2. Navigate to Foundation-tier module
3. Click "Start Module"

**Expected Results:**
- [ ] Paywall does NOT appear
- [ ] Module loads normally
- [ ] Content accessible

**Steps (test tier mismatch):**
4. Navigate to Premium-tier module
5. Click "Start Module"

**Expected Results:**
- [ ] Paywall appears (tier upgrade needed)
- [ ] Shows "Upgrade to Premium" messaging

**Pass Criteria:** Tier checking works correctly

---

## PHASE 3B: QUIZ SYSTEM TESTING

### Test 3b.1: Quiz Page Load
**Objective:** Verify quiz loads from URL parameter

**Steps:**
1. Navigate to `/quiz.html?id=quiz-teleios-week-1`
2. Check Console for errors

**Expected Results:**
- [ ] Page loads without errors
- [ ] Quiz title displays: "Week 1 Assessment"
- [ ] Questions load from Firestore
- [ ] First question displays
- [ ] Answer options render as buttons
- [ ] Progress indicator shows (Question 1 of 5)

**Pass Criteria:** Quiz loads and displays correctly

---

### Test 3b.2: Question Navigation
**Objective:** Test answering questions and navigation

**Steps:**
1. Load quiz (Test 3b.1)
2. Select an answer for Question 1
3. Click "Next Question" button
4. Verify Question 2 displays

**Expected Results:**
- [ ] Selected answer highlights (green border)
- [ ] Next button enables after selection
- [ ] Question 2 renders
- [ ] Progress updates (Question 2 of 5)
- [ ] Can go back to Question 1 (if back button exists)

**Pass Criteria:** Can navigate through all questions

---

### Test 3b.3: Quiz Submission - Pass (Score ≥80%)
**Objective:** Test passing quiz with high score

**Steps:**
1. Answer all questions correctly (or 4/5 correct for 80%)
2. Click "Submit Quiz" button on last question
3. Wait for processing

**Expected Results:**
- [ ] Loading indicator appears
- [ ] Score calculates: 80% or higher
- [ ] "Pass" state displays:
  - Green checkmark icon
  - "Congratulations! You passed!"
  - Score display: "You scored 80%"
  - Explanation for incorrect answers (if any)
- [ ] Firestore updated:
  - `/users/{uid}/progress/passedQuizzes` includes quiz ID
  - `/submissions/{submissionId}` document created with answers and score
- [ ] "Continue" button appears
- [ ] Clicking "Continue" unlocks next module

**Pass Criteria:** Pass state displays, data saved correctly

---

### Test 3b.4: Quiz Submission - Fail (Score <80%)
**Objective:** Test failing quiz with low score

**Steps:**
1. Answer questions mostly wrong (e.g., 2/5 correct = 40%)
2. Submit quiz

**Expected Results:**
- [ ] Score calculates: 40%
- [ ] "Fail" state displays:
  - Red X icon
  - "Not quite there yet"
  - Score display: "You scored 40%"
  - Review button: "Review Incorrect Answers"
- [ ] Firestore updated:
  - `passedQuizzes` does NOT include quiz ID
  - Submission saved with `passed: false`
- [ ] "Retake Quiz" button appears
- [ ] Clicking "Retake" resets quiz, can try again
- [ ] Module remains locked until quiz passed

**Pass Criteria:** Fail state displays, retake works, blocking logic correct

---

### Test 3b.5: Quiz Answer Feedback
**Objective:** Verify immediate feedback on answers

**Steps:**
1. Load quiz
2. Select correct answer
3. Check visual feedback

**Expected Results:**
- [ ] Correct answer: Green background, checkmark icon
- [ ] Explanation text displays below: "✓ Correct! [explanation]"

**Steps (continued):**
4. Select incorrect answer on next question

**Expected Results:**
- [ ] Incorrect answer: Red background, X icon
- [ ] Explanation displays: "✗ [explanation]"
- [ ] Correct answer highlights in green

**Pass Criteria:** Immediate visual feedback works

---

### Test 3b.6: Quiz Retake Logic
**Objective:** Verify users can retake failed quizzes

**Steps:**
1. Fail quiz (Test 3b.4)
2. Click "Retake Quiz" button
3. Verify quiz resets

**Expected Results:**
- [ ] Quiz resets to Question 1
- [ ] All previous answers cleared
- [ ] Can select new answers
- [ ] New submission created on re-submit (doesn't overwrite old)
- [ ] Firestore `/submissions` has multiple attempts with timestamps

**Pass Criteria:** Retake works, multiple attempts tracked

---

### Test 3b.7: Quiz Progression Blocking
**Objective:** Verify quiz blocks module progression

**Steps:**
1. Login as user who hasn't passed quiz
2. Try to access Module 2 (requires passing Module 1 quiz)
3. Check if access blocked

**Expected Results:**
- [ ] Module 2 shows lock icon 🔒
- [ ] Clicking Module 2 shows message: "Complete Week 1 Quiz first"
- [ ] "Take Quiz" button redirects to quiz page

**Steps (after passing):**
4. Pass quiz (Test 3b.3)
5. Return to module list
6. Try to access Module 2

**Expected Results:**
- [ ] Lock icon removed
- [ ] Can access Module 2
- [ ] Content loads normally

**Pass Criteria:** Blocking logic works correctly

---

## PHASE 3C: CERTIFICATE SYSTEM TESTING

### Test 3c.1: Certificate Gallery Load
**Objective:** Verify certificates page loads

**Steps:**
1. Navigate to `/certificates.html`
2. Check Console for errors

**Expected Results:**
- [ ] Page loads without errors
- [ ] Header shows "Your Certificates"
- [ ] Stats section displays:
  - Total certificates earned
  - Courses completed
  - Schools completed
- [ ] Certificate grid renders (empty if no certs)
- [ ] Bottom navigation visible

**Pass Criteria:** Page loads, empty state friendly

---

### Test 3c.2: Certificate Auto-Award
**Objective:** Verify certificate awarded on course completion

**Steps:**
1. Complete all modules in a course (mark last module complete)
2. Check Firestore `/users/{uid}/certificates` array
3. Refresh `/certificates.html`

**Expected Results:**
- [ ] Certificate document created in Firestore:
  ```javascript
  {
    id: "cert-teleios-course-1",
    userId: "test-user-123",
    courseId: "teleios-course-1",
    courseName: "Week 1: Covenant Foundations",
    schoolName: "Teleios Identity School",
    awardedDate: firebase.firestore.Timestamp.now(),
    certificateNumber: "SBD-2026-001234"
  }
  ```
- [ ] User doc updated: `stats.certificatesEarned` increments
- [ ] Certificate appears in gallery
- [ ] Certificate card shows:
  - Course name
  - School name
  - Completion date
  - "View" button
  - "Download" button

**Pass Criteria:** Certificate auto-awarded and displays

---

### Test 3c.3: Certificate Modal View
**Objective:** Test viewing certificate in modal

**Steps:**
1. Ensure at least 1 certificate exists (Test 3c.2)
2. Click "View" button on certificate card

**Expected Results:**
- [ ] Modal opens with full certificate design:
  - SBD Network logo/branding
  - "Certificate of Completion" heading
  - User name (from Firebase user.displayName)
  - Course name
  - School name
  - Completion date (formatted: "March 30, 2026")
  - Certificate number
  - Signature line
- [ ] Modal has close button (X)
- [ ] ESC key closes modal
- [ ] Background blurs

**Pass Criteria:** Modal displays beautiful certificate

---

### Test 3c.4: Certificate Download (PNG)
**Objective:** Test downloading certificate as image

**Steps:**
1. Open certificate modal (Test 3c.3)
2. Click "Download" button
3. Check browser Downloads folder

**Expected Results:**
- [ ] Download initiates (html2canvas converts to PNG)
- [ ] File downloads: `certificate-teleios-course-1.png`
- [ ] PNG file contains full certificate design
- [ ] Image quality high (no pixelation)
- [ ] Image size reasonable (<2MB)

**Pass Criteria:** PNG downloads successfully, quality good

---

### Test 3c.5: Multiple Certificates
**Objective:** Test certificate gallery with multiple certs

**Steps:**
1. Award 3+ certificates (complete multiple courses)
2. Reload `/certificates.html`

**Expected Results:**
- [ ] All certificates display in grid
- [ ] Grid responsive:
  - Desktop: 3 columns
  - Tablet: 2 columns
  - Mobile: 1 column
- [ ] Stats update correctly:
  - Total certificates: 3
  - Courses completed: 3
  - Schools completed: (count unique schools)
- [ ] All "View" and "Download" buttons work
- [ ] Most recent certificate shows first (sorted by date desc)

**Pass Criteria:** Gallery handles multiple certificates gracefully

---

## PHASE 3D: ASSIGNMENT SYSTEM TESTING

### Test 3d.1: Assignment Page Load
**Objective:** Verify assignment loads from URL

**Steps:**
1. Navigate to `/assignment.html?id=assignment-teleios-1`
2. Check Console for errors

**Expected Results:**
- [ ] Page loads without errors
- [ ] Assignment title displays
- [ ] Assignment description/prompt displays
- [ ] Submission textarea renders
- [ ] Character counter shows (0 / 100 minimum)
- [ ] Submit button disabled initially
- [ ] Previous submissions section visible (empty if first time)

**Pass Criteria:** Assignment page loads correctly

---

### Test 3d.2: Assignment Submission - Validation
**Objective:** Test minimum word count validation

**Steps:**
1. Load assignment (Test 3d.1)
2. Type 50 words in textarea
3. Try to submit

**Expected Results:**
- [ ] Character counter updates: "50 / 100 minimum"
- [ ] Submit button stays disabled
- [ ] Error message: "Please write at least 100 words"

**Steps (continued):**
4. Type 100+ words
5. Try to submit

**Expected Results:**
- [ ] Character counter: "105 / 100 minimum" (green color)
- [ ] Submit button enables
- [ ] Can click submit

**Pass Criteria:** Validation prevents short submissions

---

### Test 3d.3: Assignment Submission - Success
**Objective:** Test successful submission

**Steps:**
1. Write 100+ word response
2. Click "Submit Assignment"
3. Wait for processing

**Expected Results:**
- [ ] Loading spinner appears
- [ ] Submission saves to Firestore:
  ```javascript
  // /submissions/{submissionId}
  {
    userId: "test-user-123",
    assignmentId: "assignment-teleios-1",
    content: "...user's 100+ word response...",
    submittedAt: firebase.firestore.Timestamp.now(),
    wordCount: 105,
    feedback: null,  // Will be filled by coach later
    status: "submitted"
  }
  ```
- [ ] Success message displays: "Assignment submitted!"
- [ ] Textarea clears
- [ ] Submission appears in "Previous Submissions" section
- [ ] Shows: submission date, word count, excerpt of content
- [ ] User doc updates: `stats.assignmentsCompleted` increments

**Pass Criteria:** Submission saves, success feedback shown

---

### Test 3d.4: Previous Submissions Display
**Objective:** Verify past submissions display correctly

**Steps:**
1. Submit assignment (Test 3d.3)
2. Reload page
3. Check "Previous Submissions" section

**Expected Results:**
- [ ] Submission card displays:
  - Submission date: "Submitted on March 30, 2026"
  - Word count: "105 words"
  - Excerpt: First 100 characters of content + "..."
  - Status badge: "Submitted" (yellow) or "Reviewed" (green)
  - "View Full Submission" button
- [ ] Submissions sorted by date (newest first)

**Steps (continued):**
4. Click "View Full Submission"

**Expected Results:**
- [ ] Modal opens with full submission text
- [ ] Shows coach feedback (if reviewed)
- [ ] Can close modal

**Pass Criteria:** Previous submissions render correctly

---

### Test 3d.5: Assignment Resubmission
**Objective:** Verify users can submit multiple attempts

**Steps:**
1. Submit first assignment (Test 3d.3)
2. Write new response (different content)
3. Submit again

**Expected Results:**
- [ ] Second submission saves as new document (doesn't overwrite first)
- [ ] Both submissions appear in "Previous Submissions"
- [ ] Each has unique timestamp
- [ ] Latest submission shows at top

**Pass Criteria:** Multiple submissions supported

---

### Test 3d.6: Assignment without Login
**Objective:** Verify auth gate works

**Steps:**
1. Logout
2. Navigate to `/assignment.html?id=assignment-teleios-1`

**Expected Results:**
- [ ] Redirects to `/index.html` (login page)
- [ ] Or shows message: "Please login to submit assignments"
- [ ] Assignment content not accessible (protected)

**Pass Criteria:** Auth check prevents access

---

## PHASE 4: FREE TIER HUB TESTING

### Test 4.1: Start Here Page Load
**Objective:** Verify free tier intro page loads

**Steps:**
1. Navigate to `/start-here.html` (no authentication required)
2. Check Console for errors

**Expected Results:**
- [ ] Page loads without login
- [ ] Hero section displays:
  - Headline: "What if your marriage could become extraordinary?"
  - Subheading explaining SBD Network
  - Primary CTA: "Begin Formation" button
- [ ] Content sections render:
  1. "What is SBD?" explanation
  2. "Why advice fails" section
  3. Teleios School teaser (blurred/locked)
- [ ] Multiple CTAs visible throughout
- [ ] Bottom navigation (if applicable)

**Pass Criteria:** Page loads for unauthenticated users

---

### Test 4.2: Start Here CTAs
**Objective:** Test all call-to-action buttons

**Steps:**
1. Load `/start-here.html`
2. Click "Begin Formation" button (hero section)

**Expected Results:**
- [ ] Paywall modal appears
- [ ] Or redirects to `/entry-quiz.html` (lead generation)
- [ ] Or redirects to signup page

**Steps (repeat for other CTAs):**
3. Click "Unlock Full Content" (on locked Teleios section)
4. Click "Take Entry Quiz" button

**Expected Results:**
- [ ] Each CTA has clear purpose
- [ ] Navigation works (no broken links)
- [ ] Consistent behavior across page

**Pass Criteria:** All CTAs functional

---

### Test 4.3: Entry Quiz Load
**Objective:** Verify entry assessment loads

**Steps:**
1. Navigate to `/entry-quiz.html`
2. Check Console for errors

**Expected Results:**
- [ ] Page loads without login required
- [ ] Quiz title displays: "Discover Your Starting Point"
- [ ] Instructions visible
- [ ] First question displays (Question 1 of 10)
- [ ] Answer options rendered as buttons
- [ ] Progress bar shows 0%

**Pass Criteria:** Entry quiz accessible to all visitors

---

### Test 4.4: Entry Quiz Completion
**Objective:** Test quiz scoring and recommendations

**Steps:**
1. Answer all 10 questions (mix of correct/incorrect)
2. Submit quiz

**Expected Results:**
- [ ] Score calculates based on responses:
  - Covenant category: X%
  - Identity category: Y%
  - Spiritual category: Z%
  - Sexual category: W%
  - Overall score: XX%
- [ ] Results page displays:
  - Overall score with visual (progress ring)
  - Breakdown by category
  - Personalized recommendation (which school to start)
  - CTA: "Begin Your Formation" → triggers paywall or signup

**Scoring Logic:**
- Score ≥75% → Recommend "Generational Formation"
- Score 50-74% → Recommend "Teleios Identity School"
- Score <50% → Recommend "Sexual Literacy School" or "Start with Teleios"

**Pass Criteria:** Quiz completes, recommendation displayed

---

### Test 4.5: Resources Page Load
**Objective:** Verify free article library loads

**Steps:**
1. Navigate to `/resources.html`
2. Check Console for errors

**Expected Results:**
- [ ] Page loads without login
- [ ] Header: "Free Resources & Articles"
- [ ] 5 articles display as cards:
  1. "Understanding Covenant Marriage"
  2. "5 Communication Mistakes..."
  3. "The Sexual Literacy Gap"
  4. "Spiritual Intimacy..."
  5. "Building Generational Legacy"
- [ ] Each article card shows:
  - Title
  - Excerpt (150 chars)
  - "Read More" button
- [ ] Inline CTA boxes appear every 2-3 articles
- [ ] Locked premium content section visible (blurred)

**Pass Criteria:** Resources page loads, articles readable

---

### Test 4.6: Resources Inline CTAs
**Objective:** Test conversion prompts in articles

**Steps:**
1. Scroll through resources page
2. Count inline CTA boxes

**Expected Results:**
- [ ] CTA boxes appear after Article 2 and Article 4
- [ ] Each CTA box clearly designed (different background, border)
- [ ] CTA text: "Ready to go deeper?" with "Unlock Full Library" button
- [ ] Clicking CTA triggers paywall modal or redirects to checkout

**Steps (continued):**
3. Scroll to locked content section
4. Try to access premium article

**Expected Results:**
- [ ] Locked section has blur overlay
- [ ] Lock icon 🔒 visible
- [ ] "Unlock Premium Content" button appears
- [ ] Clicking triggers paywall

**Pass Criteria:** CTAs strategically placed, paywall triggered

---

### Test 4.7: Video Preview System Load
**Objective:** Verify video preview page loads

**Steps:**
1. Navigate to `/video-preview-demo.html`
2. Check Console for errors

**Expected Results:**
- [ ] Page loads
- [ ] Lesson info header displays:
  - Lesson title
  - Meta info: duration, school, week/lesson number
- [ ] Video player renders
- [ ] Preview badge visible: "PREVIEW - 5:00 remaining"
- [ ] Lesson notes section displays
- [ ] "More Lessons" list shows (some locked)
- [ ] Bottom navigation

**Pass Criteria:** Video preview page functional

---

### Test 4.8: Video Preview Time Limit
**Objective:** Test 5-minute preview enforcement

**Steps:**
1. Load video preview page
2. Play video
3. Watch time remaining counter

**Expected Results:**
- [ ] Time remaining counts down: 5:00 → 4:59 → 4:58...
- [ ] Preview progress bar fills (orange gradient)
- [ ] At 0:00 remaining:
  - Video pauses automatically
  - Lock overlay appears over video
  - Overlay text: "Preview time expired"
  - "Unlock Full Access" button visible
  - Cannot resume video without upgrading

**Pass Criteria:** Time limit enforced at 5:00 mark

---

### Test 4.9: Video Preview - Seeking Prevention
**Objective:** Verify users can't skip ahead in preview

**Steps:**
1. Load video preview
2. Play for 30 seconds
3. Try to drag video progress bar to 6:00 mark

**Expected Results:**
- [ ] Seeking prevented beyond preview limit
- [ ] Video position resets to current allowed position
- [ ] Error message: "Upgrade to watch full video"

**Pass Criteria:** Cannot skip ahead past preview limit

---

### Test 4.10: Video Unlock - Paid User
**Objective:** Verify paid users access full video

**Steps:**
1. Login as Foundation tier user
2. Load video preview page
3. Play video

**Expected Results:**
- [ ] No preview badge
- [ ] No time limit (can watch entire video)
- [ ] No lock overlay appears
- [ ] Can seek to any point in video
- [ ] Full access granted

**Pass Criteria:** Paid users bypass preview restrictions

---

## PHASE 5: ADMIN COURSE BUILDER TESTING

### Test 5.1: Admin Page Access
**Objective:** Verify admin page requires authentication

**Steps:**
1. Logout
2. Navigate to `/admin-course-builder.html`

**Expected Results:**
- [ ] Redirects to login page
- [ ] Or shows "Access Denied" message
- [ ] Admin content not accessible

**Steps (as admin):**
3. Login as admin user (set `isAdmin: true` in Firebase user doc)
4. Navigate to admin page

**Expected Results:**
- [ ] Page loads successfully
- [ ] Sidebar navigation visible
- [ ] Course list displays
- [ ] "Create New Course" button visible

**Pass Criteria:** Auth and admin role checked

---

### Test 5.2: Course Creation
**Objective:** Test creating new course

**Steps:**
1. Login as admin
2. Click "Create New Course" button
3. Fill in form:
   - Title: "Test Course: Covenant Basics"
   - School: Select "Teleios Identity School"
   - Description: "Introduction to covenant principles"
   - Tier: Select "Foundation"
   - Duration: "60 minutes"
4. Click "Save Course"

**Expected Results:**
- [ ] Loading indicator appears
- [ ] Course document created in Firestore `/courses/{courseId}`:
  ```javascript
  {
    id: "course-generated-id",
    title: "Test Course: Covenant Basics",
    schoolId: "teleios-school",
    description: "Introduction to covenant principles",
    requiredTier: "foundation",
    duration: 60,
    createdAt: firebase.firestore.Timestamp.now(),
    modules: 0,
    order: (auto-incremented)
  }
  ```
- [ ] Success message: "Course created successfully!"
- [ ] Course appears in course list
- [ ] Form clears for next entry

**Pass Criteria:** Course creates and saves to Firestore

---

### Test 5.3: Course List Display
**Objective:** Verify courses load from Firestore

**Steps:**
1. Navigate to admin course builder
2. Check course list section

**Expected Results:**
- [ ] All courses from Firestore display
- [ ] Each course card shows:
  - Course title
  - School name (human-readable)
  - Tier badge (color-coded: Foundation=blue, Premium=purple, Elite=gold)
  - Module count: "5 modules"
  - Edit button
  - Delete button
- [ ] Courses sorted by order or creation date
- [ ] Empty state shows if no courses: "No courses yet. Create your first course!"

**Pass Criteria:** Courses load and display correctly

---

### Test 5.4: Course Editing
**Objective:** Test editing existing course

**Steps:**
1. Click "Edit" button on a course card
2. Verify form populates with existing data:
   - Title: (current title)
   - School: (current school selected)
   - Description: (current description)
   - Tier: (current tier selected)
   - Duration: (current duration)
3. Change title to "Updated Course Title"
4. Click "Save Changes"

**Expected Results:**
- [ ] Loading indicator appears
- [ ] Firestore document updates
- [ ] Success message: "Course updated!"
- [ ] Course list refreshes with new title
- [ ] Edit form closes

**Pass Criteria:** Course updates successfully

---

### Test 5.5: Course Deletion
**Objective:** Test deleting course

**Steps:**
1. Click "Delete" button on a course
2. Check for confirmation dialog

**Expected Results:**
- [ ] Confirmation prompt: "Are you sure you want to delete this course? This action cannot be undone."
- [ ] Options: "Cancel" and "Delete"

**Steps (continued):**
3. Click "Delete" (confirm)

**Expected Results:**
- [ ] Loading indicator appears
- [ ] Course document deleted from Firestore
- [ ] Course removed from list immediately
- [ ] Success message: "Course deleted"
- [ ] Related modules remain but orphaned (TODO: cascade delete or warning)

**Pass Criteria:** Course deletes with confirmation

---

### Test 5.6: Module Management (TODO)
**Objective:** Test adding modules to course

**Note:** This feature depends on module editor being built. Test when ready.

**Expected Flow:**
1. Edit course
2. View "Modules" section
3. Click "Add Module"
4. Fill in module details
5. Save module
6. Module links to course automatically

---

## INTEGRATION TESTING

### Integration Test 1: End-to-End User Journey
**Objective:** Test complete flow from signup to certificate

**Steps:**
1. Logout (start as new user)
2. Navigate to `/start-here.html` (free content)
3. Read intro content
4. Take entry quiz → Get recommendation
5. Click "Begin Formation" → Paywall appears
6. Select Foundation tier → Redirect to checkout
7. Complete payment with test card
8. Redirect to success page → Click "Go to Dashboard"
9. Dashboard loads → View progress (0%)
10. Click "Continue Journey" → Navigate to Module 1
11. Complete Module 1 → Mark as complete
12. Navigate to Quiz 1 → Pass quiz (80%+)
13. Return to dashboard → Progress updates (20%)
14. Complete Modules 2-5 and quizzes
15. Dashboard shows 100% progress
16. Certificate auto-awarded
17. Navigate to `/certificates.html` → View certificate
18. Download certificate as PNG

**Expected Results:**
- [ ] Every step completes without errors
- [ ] Data persists correctly in Firestore
- [ ] UI updates reflect database changes
- [ ] No broken links
- [ ] No redirects to 404 pages
- [ ] Certificate downloads successfully

**Pass Criteria:** Full journey completes successfully

---

### Integration Test 2: Tier Upgrade Flow
**Objective:** Test upgrading from Foundation to Premium

**Steps:**
1. Login as Foundation tier user
2. Navigate to a Premium-tier course
3. Try to access course → Paywall appears
4. Paywall shows "Upgrade to Premium" message
5. Click "Select Premium" → Redirect to checkout
6. Complete payment (Premium tier)
7. User tier updates to `premium` in Firestore
8. Return to Premium course → Access granted
9. Can access both Foundation and Premium content

**Expected Results:**
- [ ] Tier upgrade flow smooth
- [ ] Payment processes correctly
- [ ] User tier updates immediately
- [ ] Access control respects new tier
- [ ] Dashboard reflects Premium access

**Pass Criteria:** Upgrade works, access granted

---

### Integration Test 3: Quiz Blocking Flow
**Objective:** Verify quiz blocks progression correctly

**Steps:**
1. Login as user with 0 progress
2. Complete Module 1
3. Try to access Module 2 directly (without taking quiz)

**Expected Results:**
- [ ] Module 2 shows lock icon
- [ ] Cannot access Module 2 content
- [ ] Message: "Complete Week 1 Quiz to unlock"

**Steps (continued):**
4. Navigate to Quiz 1
5. Fail quiz (score <80%)
6. Try to access Module 2 again

**Expected Results:**
- [ ] Module 2 still locked
- [ ] Must retake and pass quiz

**Steps (continued):**
7. Retake Quiz 1
8. Pass quiz (score ≥80%)
9. Return to module list
10. Access Module 2

**Expected Results:**
- [ ] Lock icon removed
- [ ] Module 2 accessible
- [ ] Content loads normally

**Pass Criteria:** Quiz blocking logic works correctly

---

## RESPONSIVE DESIGN TESTING

### Responsive Test 1: iPhone 12 Pro (390x844)
**Pages to Test:**
- [ ] dashboard.html
- [ ] checkout.html
- [ ] quiz.html
- [ ] certificates.html
- [ ] start-here.html
- [ ] resources.html
- [ ] assignment.html

**Check for:**
- [ ] No horizontal scroll
- [ ] Single column layout
- [ ] Text readable (font size ≥14px)
- [ ] Touch targets ≥44px
- [ ] Bottom nav always visible
- [ ] Forms usable (inputs not too small)
- [ ] Buttons don't overlap
- [ ] Images scale down appropriately

---

### Responsive Test 2: iPad (768x1024)
**Check for:**
- [ ] 2-column grid where appropriate
- [ ] Sidebar navigation (if exists) collapses or adjusts
- [ ] Touch targets still adequate
- [ ] No wasted white space
- [ ] Typography scales nicely

---

### Responsive Test 3: Desktop (1920x1080)
**Check for:**
- [ ] Max content width (not stretched edge-to-edge)
- [ ] 3-column grids where appropriate
- [ ] Hover states on buttons/links
- [ ] Sidebar navigation (if exists) always visible
- [ ] No bottom nav (desktop uses top nav or sidebar)

---

## BROWSER COMPATIBILITY TESTING

### Test on Multiple Browsers:
- [ ] **Chrome** (latest version)
- [ ] **Safari** (macOS/iOS)
- [ ] **Firefox** (latest version)
- [ ] **Edge** (latest version)

**Check for:**
- [ ] All pages load without errors
- [ ] CSS renders consistently (especially backdrop-filter, gradients)
- [ ] JavaScript functions work (no browser-specific bugs)
- [ ] Stripe checkout works
- [ ] Firebase auth works
- [ ] Video preview works

**Known Issues:**
- `backdrop-filter` requires `-webkit-` prefix for Safari
- `html2canvas` may render differently across browsers

---

## PERFORMANCE TESTING

### Performance Test 1: Page Load Times
**Tool:** Chrome DevTools → Network tab

**Target Metrics:**
- [ ] Dashboard initial load: <3 seconds
- [ ] Checkout page: <2 seconds
- [ ] Quiz page: <2 seconds
- [ ] Certificate page: <2 seconds

**How to Test:**
1. Open Network tab
2. Disable cache (checkbox in Network tab)
3. Reload page
4. Check "Load" time at bottom of Network tab

**If load times exceed targets:**
- Check image sizes (should be optimized)
- Check JavaScript file sizes (consider code splitting)
- Check Firestore query count (should be <10 reads per page)

---

### Performance Test 2: Firestore Query Efficiency
**Tool:** Firebase Console → Firestore → Usage tab

**Target:**
- [ ] Dashboard load: ≤10 document reads
- [ ] Course list: 1 read per course (paginated if >20 course)
- [ ] Quiz load: 1 read (quiz document)
- [ ] Certificate load: 1 read per certificate

**How to Test:**
1. Note current read count in Firebase Console
2. Load page
3. Check new read count
4. Calculate difference

**If reads excessive:**
- Implement caching (localStorage for user tier, 5min TTL)
- Denormalize frequently accessed data
- Use query limits (`.limit(20)`)

---

## SECURITY TESTING

### Security Test 1: Authentication Gate
**Objective:** Verify protected pages redirect unauthenticated users

**Pages to Test:**
- [ ] dashboard.html
- [ ] quiz.html
- [ ] certificates.html
- [ ] assignment.html
- [ ] admin-course-builder.html

**Steps:**
1. Logout completely
2. Navigate directly to each page
3. Verify redirect to login page

**Pass Criteria:** All protected pages require auth

---

### Security Test 2: Firestore Rules
**Objective:** Test security rules prevent unauthorized access

**Test Cases:**

**1. User can read own document:**
```javascript
// In browser console (logged in)
db.collection('users').doc(firebase.auth().currentUser.uid).get()
  .then(doc => console.log(doc.data()))  // Should succeed
```

**2. User cannot read other user's document:**
```javascript
db.collection('users').doc('another-user-id').get()
  .then(doc => console.log(doc.data()))
  .catch(err => console.log('Access denied'))  // Should fail
```

**3. User cannot write to another user's document:**
```javascript
db.collection('users').doc('another-user-id').update({ tier: 'elite' })
  .catch(err => console.log('Access denied'))  // Should fail
```

**Pass Criteria:** Rules enforce per-user access correctly

---

### Security Test 3: Tier Access Control
**Objective:** Test `hasSufficientTier()` function

**Test Cases:**
- Free user tries to access Foundation content → Blocked, paywall shown
- Foundation user accesses Foundation content → Allowed
- Foundation user tries to access Premium content → Blocked, upgrade prompt
- Premium user accesses Premium content → Allowed
- Elite user accesses all content → Allowed

**Pass Criteria:** Tier hierarchy respected

---

## EDGE CASE TESTING

### Edge Case 1: Empty States
**Test:**
- [ ] Dashboard with 0 progress
- [ ] Certificate gallery with 0 certificates
- [ ] Assignment page with 0 previous submissions
- [ ] Course list with 0 courses (admin builder)

**Expected:** Friendly empty states, no broken UI

---

### Edge Case 2: Network Failure
**Test:**
1. Open page
2. Turn off Wi-Fi
3. Try to submit form or load data

**Expected:**
- [ ] Error message displays: "Network error. Please check connection."
- [ ] No silent failure
- [ ] Can retry when connection restored

---

### Edge Case 3: Expired Session
**Test:**
1. Login
2. Wait 1 hour (or manually invalidate token)
3. Try to access protected page

**Expected:**
- [ ] Redirect to login
- [ ] Or show message: "Session expired. Please login again."

---

### Edge Case 4: Invalid URL Parameters
**Test:**
- `/quiz.html?id=nonexistent-quiz`
- `/assignment.html?id=invalid-id`
- `/checkout.html?product=invalid-product`

**Expected:**
- [ ] Error message: "Quiz not found" or "Invalid product"
- [ ] Redirect to appropriate fallback page
- [ ] No crash or blank page

---

## TESTING COMPLETE CRITERIA

✅ **All 6 phases tested systematically**
✅ **0 critical bugs** (blocking issues that prevent core functionality)
✅ **<5 medium bugs** (non-blocking but noticeable issues)
✅ **All integration flows work** (signup → payment → course → certificate)
✅ **Responsive on mobile/tablet/desktop**
✅ **Works on Chrome, Safari, Firefox, Edge**
✅ **Page load times <3 seconds**
✅ **Firestore queries efficient (<10 reads per page)**
✅ **Security rules prevent unauthorized access**
✅ **Empty states friendly**

**When all criteria met → Proceed to DEPLOYMENT_CHECKLIST.md**

---

## BUG TRACKING

**Use this template to track issues found during testing:**

```markdown
# Bug Report

**Title:** Brief description
**Severity:** Critical / High / Medium / Low
**Phase:** Phase X - Component Name
**Page:** /path/to/page.html
**Steps to Reproduce:**
1. Step 1
2. Step 2
3. Step 3

**Expected Result:**
What should happen

**Actual Result:**
What actually happens

**Console Errors:**
```
Paste any errors from browser console
```

**Screenshot:** (if applicable)

**Status:** Open / In Progress / Fixed / Won't Fix
```

**Create `/BUGS_FOUND.md` to track all issues during testing.**

---

## NEXT STEPS AFTER TESTING

1. **Fix all critical bugs** (blocks launch)
2. **Fix high-priority bugs** (major UX issues)
3. **Document medium/low bugs** for post-launch iteration
4. **Run final smoke test** (quick check of core flows)
5. **Deploy to Firebase Hosting**
6. **Follow DEPLOYMENT_CHECKLIST.md for production launch**

---

**TESTING PHASE COMPLETE. READY FOR DEPLOYMENT. 🚀**
