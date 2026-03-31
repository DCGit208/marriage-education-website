# DEPLOYMENT CHECKLIST
# ====================
# 
# Complete pre-launch checklist for SBD Network platform

## PHASE 1: PRE-DEPLOYMENT SETUP

### Firebase Configuration
- [ ] Create production Firebase project (separate from development)
- [ ] Enable Authentication (Email/Password, Google)
- [ ] Create Firestore database in production mode
- [ ] Configure Firestore security rules
- [ ] Create necessary Firestore indexes
- [ ] Enable Firebase Storage
- [ ] Configure Storage security rules
- [ ] Set up Firebase Hosting
- [ ] Configure custom domain (if applicable)

### Stripe Integration
- [ ] Create production Stripe account
- [ ] Get live API keys (pk_live_xxx and sk_live_xxx)
- [ ] Replace test keys in `/public/js/stripe-config.js`
- [ ] Create live products in Stripe Dashboard:
  - Foundation Monthly ($9)
  - Premium Monthly ($20)
  - Elite Monthly ($50)
- [ ] Set up Stripe webhook endpoint
- [ ] Configure webhook secret in Firebase Functions
- [ ] Test live payment flow with real card
- [ ] Verify order creation in Firestore
- [ ] Confirm content unlocking after payment

### Environment Variables
- [ ] Update Firebase config in `/public/js/firebase-config.js`
- [ ] Replace Stripe publishable key
- [ ] Update any API endpoints to production URLs
- [ ] Verify all absolute URLs point to production domain

---

## PHASE 2: CONTENT SETUP

### Schools & Courses
- [ ] Create all schools in Firestore (`/schools` collection)
- [ ] Create courses under each school (`/courses` collection)
- [ ] Add modules to each course (`/modules` collection)
- [ ] Upload lesson content (videos, PDFs, etc.)
- [ ] Set correct tier requirements on all content
- [ ] Link modules to discussion boards (`linkedBoardId`)

### Boards & Discussions
- [ ] Create boards for each module
- [ ] Verify board privacy settings (private to course members)
- [ ] Test posting, replying, reactions
- [ ] Set up moderation rules (if needed)

### Quizzes & Assignments
- [ ] Create quizzes in Firestore (`/quizzes` collection)
- [ ] Verify quiz questions, answers, and explanations
- [ ] Set passing scores (typically 80%)
- [ ] Create assignments in Firestore (`/assignments` collection)
- [ ] Link quizzes/assignments to correct modules

### Certificates
- [ ] Design certificate templates in `/public/css/certificate.css`
- [ ] Test certificate generation
- [ ] Verify PNG download works
- [ ] Test auto-award on course completion

---

## PHASE 3: TESTING

### Authentication Testing
- [ ] Sign up new user
- [ ] Sign in existing user
- [ ] Reset password flow
- [ ] Sign out
- [ ] Test auth persistence (refresh page while logged in)
- [ ] Verify auth guards (redirect to login if not authenticated)

### Payment Testing
- [ ] Test Foundation tier purchase
- [ ] Test Premium tier purchase
- [ ] Test Elite tier purchase
- [ ] Verify order creation in Firestore
- [ ] Confirm user tier update after payment
- [ ] Test content unlock after purchase
- [ ] Verify Stripe webhook receives events
- [ ] Test declined card handling
- [ ] Test checkout abandonment

### Formation System Testing
- [ ] Test tier access control (free vs paid content)
- [ ] Verify paywall modal triggers correctly
- [ ] Test progression blocking (can't skip modules)
- [ ] Verify quiz blocking (must pass before continuing)
- [ ] Test module completion tracking
- [ ] Verify course completion tracking
- [ ] Test certificate auto-award

### Dashboard Testing
- [ ] Verify "Continue Journey" shows correct next module
- [ ] Test progress percentage calculations
- [ ] Verify Teleios level algorithm (5/10/20/30 thresholds)
- [ ] Test streak counter (increments daily)
- [ ] Verify course-linked discussions filter
- [ ] Test empty states (no progress yet)

### Quiz System Testing
- [ ] Load quiz from Firestore
- [ ] Select answers
- [ ] Submit quiz
- [ ] Verify 80% passing threshold
- [ ] Test fail state (< 80%)
- [ ] Verify quiz attempt saved to Firestore
- [ ] Test progression block if quiz failed
- [ ] Verify quiz passed adds to `user.progress.passedQuizzes`

### Assignment System Testing
- [ ] Load assignment details
- [ ] Submit text response
- [ ] Upload photo (if enabled)
- [ ] Verify submission saved to Firestore
- [ ] Test previous submissions display
- [ ] Verify word count validation

### Certificate System Testing
- [ ] Complete a course
- [ ] Verify certificate auto-awarded
- [ ] Test certificate gallery display
- [ ] Download certificate as PNG
- [ ] Verify certificate appearance (design)
- [ ] Test certificate stats (total, courses, schools)

### Video Preview Testing
- [ ] Load video lesson
- [ ] Verify preview badge shows
- [ ] Test 5-minute preview limit
- [ ] Verify lock overlay appears after preview
- [ ] Test unlock button → paywall
- [ ] Verify full access for paid users (no lock)

### Responsive Testing
- [ ] Test on iPhone (Safari)
- [ ] Test on Android (Chrome)
- [ ] Test on iPad (Safari, Chrome, Firefox)
- [ ] Test on desktop (Chrome, Firefox, Safari, Edge)
- [ ] Verify bottom navigation works on mobile
- [ ] Test touch interactions (buttons, forms)
- [ ] Verify no horizontal scroll

### Performance Testing
- [ ] Page load time < 3 seconds
- [ ] Dashboard loads in < 10 Firestore reads
- [ ] Images lazy load correctly
- [ ] Videos don't autoload (save bandwidth)
- [ ] Service worker caches static assets
- [ ] Offline mode works (cached pages load)

---

## PHASE 4: SEO & ANALYTICS

### Meta Tags
- [ ] Add `<title>` to all pages
- [ ] Add meta descriptions
- [ ] Add Open Graph tags (for social sharing)
- [ ] Add Twitter Card tags
- [ ] Add canonical URLs
- [ ] Create sitemap.xml
- [ ] Create robots.txt

### Google Analytics
- [ ] Create Google Analytics 4 property
- [ ] Add GA tracking code to all pages
- [ ] Set up conversion goals (signup, purchase, completion)
- [ ] Test event tracking
- [ ] Create custom dashboard

### Firebase Analytics
- [ ] Enable Firebase Analytics
- [ ] Track custom events:
  - Course started
  - Module completed
  - Quiz passed
  - Certificate earned
  - Purchase completed

---

## PHASE 5: SECURITY

### Firestore Security Rules
- [ ] Users can only read/write their own documents
- [ ] Courses/modules are read-only for users
- [ ] Tier verification in security rules
- [ ] Quiz submissions are write-once
- [ ] Board posts respect privacy settings
- [ ] Admin-only writes for content

### Firebase Storage Security Rules
- [ ] Users can only upload to their own folder
- [ ] File size limits enforced (5 MB for images)
- [ ] File type restrictions (images, PDFs only)
- [ ] Admin-only writes for course content

### Environment Security
- [ ] API keys not exposed in client code (use Firebase Functions for sensitive operations)
- [ ] Stripe secret key only in Firebase Functions (never client-side)
- [ ] HTTPS enforced on all pages
- [ ] Content Security Policy headers set
- [ ] CORS configured correctly

---

## PHASE 6: COMPLIANCE

### Privacy Policy
- [ ] Create privacy policy page
- [ ] Link from footer on all pages
- [ ] Explain data collection (email, progress, payments)
- [ ] Explain third-party services (Firebase, Stripe)
- [ ] Provide contact for privacy questions

### Terms of Service
- [ ] Create terms of service page
- [ ] Define user responsibilities
- [ ] Explain refund policy
- [ ] Content ownership and usage rights
- [ ] Dispute resolution process

### GDPR Compliance (if serving EU users)
- [ ] Cookie consent banner
- [ ] Data export functionality
- [ ] Data deletion functionality
- [ ] Opt-in for marketing emails
- [ ] Record consent in Firestore

---

## PHASE 7: DEPLOYMENT

### Build & Deploy
- [ ] Run build command (if using bundler)
- [ ] Minify CSS and JavaScript
- [ ] Compress images
- [ ] Deploy to Firebase Hosting: `firebase deploy --only hosting`
- [ ] Deploy Firebase Functions: `firebase deploy --only functions`
- [ ] Deploy Firestore rules: `firebase deploy --only firestore:rules`
- [ ] Deploy Storage rules: `firebase deploy --only storage`

### DNS Configuration
- [ ] Point custom domain to Firebase Hosting
- [ ] Verify SSL certificate provisioned
- [ ] Test HTTPS redirect
- [ ] Test www → non-www redirect (or vice versa)

### Post-Deployment Verification
- [ ] Visit production URL
- [ ] Test signup flow
- [ ] Test payment flow with real card
- [ ] Verify content loads correctly
- [ ] Check console for errors (no JavaScript errors)
- [ ] Test on multiple devices
- [ ] Verify email delivery (password reset, receipts)

---

## PHASE 8: MONITORING

### Firebase Console
- [ ] Monitor Authentication (daily signups)
- [ ] Monitor Firestore usage (reads, writes, storage)
- [ ] Monitor Storage usage (bandwidth, stored files)
- [ ] Monitor Hosting bandwidth
- [ ] Set up billing alerts (Blaze plan)

### Stripe Dashboard
- [ ] Monitor daily revenue
- [ ] Check failed payments
- [ ] Review dispute/chargeback rate
- [ ] Monitor subscription churn rate
- [ ] Set up email notifications for payments

### Error Monitoring
- [ ] Set up error logging (see PERFORMANCE_OPTIMIZATION.md)
- [ ] Monitor JavaScript errors
- [ ] Track failed API calls
- [ ] Review user-reported bugs

### Performance Monitoring
- [ ] Firebase Performance tab (page load times)
- [ ] Core Web Vitals (LCP, FID, CLS)
- [ ] Firestore query performance
- [ ] Slow pages identification

---

## PHASE 9: LAUNCH CHECKLIST

### Pre-Launch (1 week before)
- [ ] Complete all testing phases
- [ ] Fix all critical bugs
- [ ] Test payment flow 3x with real cards
- [ ] Verify all content is live
- [ ] Prepare launch announcement (email, social)
- [ ] Set up customer support email
- [ ] Create FAQ page

### Launch Day
- [ ] Verify production site is live
- [ ] Test payment flow one final time
- [ ] Send launch announcement
- [ ] Monitor error logs closely
- [ ] Be available for support questions
- [ ] Track signups and purchases in real-time

### Post-Launch (first week)
- [ ] Monitor daily signups
- [ ] Track conversion rate (signup → purchase)
- [ ] Review user feedback
- [ ] Fix any reported bugs immediately
- [ ] Optimize slow pages
- [ ] Respond to all support emails within 24 hours

---

## ROLLBACK PLAN

### If Critical Bug Found Post-Launch
1. Revert to previous Firebase Hosting deployment:
   ```bash
   firebase hosting:clone SOURCE_SITE_ID:SOURCE_CHANNEL TARGET_SITE_ID:live
   ```

2. Disable payment processing temporarily:
   - Comment out Stripe checkout code
   - Show maintenance message on checkout page

3. Fix bug in development environment

4. Test fix thoroughly

5. Re-deploy with fix

6. Monitor closely

---

## SUCCESS METRICS

### Week 1 Goals
- 100 signups
- 10 paid conversions
- < 5% error rate
- < 3 second average page load
- 0 failed payments (all processed successfully)

### Month 1 Goals
- 500 signups
- 50 paid conversions (10% conversion rate)
- 50 active course participants
- 10 course completions
- 5-star average user rating

### Long-Term Goals
- 10,000 users
- $10,000 MRR (Monthly Recurring Revenue)
- 80% course completion rate
- < 5% monthly churn rate
- 4.5+ star rating

---

## SUPPORT RESOURCES

### Documentation
- [ ] User guide (how to navigate platform)
- [ ] Course completion guide
- [ ] Payment/billing FAQ
- [ ] Technical troubleshooting guide

### Contact
- Support email: support@sbdnetwork.com
- Emergency contact: (if critical bug)
- Stripe support: https://support.stripe.com
- Firebase support: https://firebase.google.com/support

---

**FINAL PRE-LAUNCH QUESTION:**
"Can a brand new user sign up, pay for Foundation, access a course, complete a module, pass a quiz, and earn a certificate — all without errors?"

If YES → Launch ✅
If NO → Fix and test again ❌
