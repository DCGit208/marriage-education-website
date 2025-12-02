# Ambassador Program - Quick Testing Guide

## 🎯 Phase 3 Gamification Features - Demo Instructions

### Testing Order

Open files in this sequence to see the complete ambassador experience:

---

## 1️⃣ Ambassador Registration
**File:** `ambassador-register.html`

**What to Test:**
- Earnings calculator (60 books × 1,500 FCFA = 90,000 FCFA)
- Commission tier breakdown visualization
- Spots counter (463/500 available)
- Form validation (motivation requires 50+ words)
- Success modal after submission

**User Flow:**
1. Open page
2. Scroll to earnings calculator
3. Fill out form (use dummy data)
4. Click "Submit Application"
5. See success modal

---

## 2️⃣ Ambassador Dashboard
**File:** `ambassador/dashboard.html`

**What to Test:**
- **Performance cards:** Books sold (23/60), Commission (34,500 FCFA), Rank (#47), Level (Bronze)
- **Referral link:** Copy button and social share options
- **Weekly contest banner:** Countdown timer, top 3 leaders, your position
- **Notifications (appear after 3 seconds):**
  - Sale notification
  - Rank update
  - Milestone alert
- **Badge modal (appears after 10 seconds):** Silver level achievement with confetti

**User Flow:**
1. Open page
2. Wait 3 seconds → see notifications slide in
3. Close notifications manually or wait for auto-dismiss
4. Observe contest countdown (updates every minute)
5. Wait 10 seconds → badge achievement modal appears with confetti
6. Try social sharing buttons
7. Close modal

**Pro Tip:** Refresh page to see animations again

---

## 3️⃣ Training Modules
**File:** `ambassador/training.html`

**What to Test:**
- Progress bar (25% complete - Module 1 done)
- **Module 1:** Marked completed with checkmark
- **Module 2:** Unlocked and clickable
- **Module 3-4:** Locked (grayed out)
- Pro tips section
- Success stories from top ambassadors

**User Flow:**
1. Open page
2. See progress overview
3. Click "Watch Again" on Module 1
4. Click "Start Module" on Module 2
5. Try clicking locked modules (should show disabled state)

---

## 4️⃣ Marketing Resources
**File:** `ambassador/resources.html`

**What to Test:**
- 6 social media template categories
- 9 copy-paste message templates
- 2 video scripts with timing
- 3 objection handler responses
- One-click copy to clipboard
- Pro tips section

**User Flow:**
1. Open page
2. Click any "Copy to Clipboard" button
3. See success feedback
4. Paste into notepad to verify

---

## 5️⃣ Public Leaderboard
**File:** `ambassador/leaderboard.html`

**What to Test:**
- Diamond Hall of Fame (top 6 achievers)
- Filter buttons (All Time / This Week / Today)
- Search box (try searching names or codes)
- Visual podium (🥇🥈🥉 top 3)
- Full leaderboard table (50 ambassadors)
- User highlight (row #47)

**User Flow:**
1. Open page
2. See stats banner at top
3. View Diamond Hall of Fame
4. Click "This Week" filter
5. Search for "Grace" or "AMB-GRACE"
6. Scroll to find highlighted user row

---

## 🧪 Feature-Specific Tests

### Notification System

**Manual Test:**
1. Open `ambassador/dashboard.html`
2. Open browser console (F12)
3. Run command:
```javascript
showNotification('success', 'Test Sale', 'You sold 5 books to John Doe!');
```
4. See notification slide in
5. Click X to close OR wait 5 seconds

**Types to Test:**
```javascript
// Success (green border)
showNotification('success', 'New Sale!', '+3 books from Sarah K.');

// Rank (yellow border)
showNotification('rank', 'Rank Up!', 'You moved to #45!');

// Milestone (purple border)
showNotification('milestone', 'Almost There!', '5 more books to Gold!');
```

---

### Weekly Contest Countdown

**Check:**
- Countdown updates every minute
- Format: "Xd Xh Xm" (e.g., "2d 14h 32m")
- Calculates to next Sunday 23:59:59
- Mini leaderboard shows top 3 + your position

**Manual Update (Console):**
```javascript
updateContestCountdown();
```

---

### Badge Achievement Modal

**Manual Test:**
1. Open `ambassador/dashboard.html`
2. Wait 10 seconds for auto-demo OR
3. Open console and run:
```javascript
showBadgeModal('Gold', 45, 8000);
```

**Parameters:**
- Level: 'Bronze', 'Silver', 'Gold', 'Diamond'
- Books: Number of books sold
- Bonus: FCFA bonus amount

**Check:**
- Modal appears with scale animation
- Confetti falls from top
- Badge icon matches level
- Bonus amount formatted correctly
- Share buttons work
- Close button dismisses

**Try All Levels:**
```javascript
showBadgeModal('Bronze', 15, 2000);
showBadgeModal('Silver', 30, 5000);
showBadgeModal('Gold', 45, 8000);
showBadgeModal('Diamond', 60, 15000);
```

---

## 📱 Mobile Testing

### iPhone/Android Simulation

**Chrome DevTools:**
1. F12 → Toggle device toolbar
2. Select iPhone 12 Pro or Pixel 5
3. Test all pages

**Check:**
- Notifications go full-width
- Contest banner stacks vertically
- Performance cards single column
- Badge modal responsive
- Training modules scroll properly

---

## 🎨 Visual Checks

### Color Consistency
- Primary green: #00b894
- Contest banner: Gold gradient
- Notifications: Green/Yellow/Purple borders
- Buttons: Green gradient on hover

### Animations
- Notifications: Slide-in from right (0.3s)
- Badge modal: Scale-in (0.5s)
- Confetti: Fall and rotate (2-5s)
- Hover effects: 0.3s transitions

### Typography
- Headers: Playfair Display
- Body: Inter font family
- Weights: 300, 400, 600, 700

---

## 🐛 Known Issues (Simulated Data)

### Not Real Data
All numbers are **mock data** for demo purposes:
- 23 books sold
- 34,500 FCFA commission
- Rank #47
- Weekly contest leaders
- Recent sales list

### Will Be Fixed When Backend Connected
- Notifications will trigger from real sales
- Contest data will update from database
- Badge unlocks will detect actual milestones
- Training progress will save

---

## 💡 Tips for Realistic Testing

### Simulate Real Ambassador Journey

1. **Day 1:** Open dashboard → See welcome notification
2. **First Sale:** Manually trigger success notification
3. **Hit Bronze (15 books):** Show Bronze badge modal
4. **Week 1 End:** Check weekly contest standings
5. **Hit Silver (30 books):** Show Silver badge modal
6. **Complete Training:** Go through all 4 modules
7. **Hit Gold (45 books):** Show Gold badge modal
8. **Final Push:** Use marketing resources
9. **Hit Diamond (60 books):** Show Diamond badge modal + confetti celebration

### Browser Console Shortcuts

```javascript
// Quick notification test
showNotification('success', 'Quick Test', 'This is a test message');

// Quick badge test
showBadgeModal('Diamond', 60, 15000);

// Update contest countdown
updateContestCountdown();

// Check current ambassador data
console.log(ambassadorData);
```

---

## 📊 Performance Checklist

### Page Load Times
- Dashboard: < 2 seconds
- Training: < 2 seconds
- Leaderboard: < 3 seconds (50 rows)
- Resources: < 1 second

### Animation Smoothness
- Notifications: 60fps
- Confetti: 30-60fps
- Modal scale: 60fps

### Responsive Breakpoints
- Desktop: 1400px max-width
- Tablet: 768px breakpoint
- Mobile: 320px minimum

---

## 🚀 Demo Script (5-Minute Walkthrough)

**For presenting to stakeholders:**

1. **[0:00-0:30]** Show ambassador registration form
   - Point out earnings calculator
   - Explain 60-book target

2. **[0:30-2:00]** Open dashboard
   - Explain performance cards
   - Wait for notifications to appear
   - Show weekly contest banner
   - Wait for badge modal

3. **[2:00-3:00]** Navigate to training
   - Show 4 progressive modules
   - Explain locking system

4. **[3:00-4:00]** Open marketing resources
   - Demo copy-paste templates
   - Show objection handlers

5. **[4:00-5:00]** View leaderboard
   - Explain Hall of Fame
   - Show filtering options
   - Highlight competitive aspect

---

## 🔧 Troubleshooting

### Notifications Not Appearing?
- Check: `setTimeout` delay (3 seconds)
- Verify: `#notificationsContainer` exists
- Console: Look for JavaScript errors

### Badge Modal Not Showing?
- Check: 10-second delay OR manually trigger
- Verify: Modal div exists
- Console: Run `showBadgeModal('Silver', 30, 5000)`

### Countdown Not Updating?
- Check: `setInterval` running
- Console: Run `updateContestCountdown()` manually
- Verify: Date calculations correct

### Confetti Not Falling?
- Check: `createConfetti()` called in `showBadgeModal()`
- Verify: Animation CSS loaded
- Test: Different browser (Chrome recommended)

---

## 📞 Testing Feedback Template

**Report issues using this format:**

```
Feature: [Notification System / Badge Modal / etc.]
Browser: [Chrome 120 / Safari 17 / etc.]
Device: [Desktop / iPhone 12 / etc.]
Issue: [Description]
Steps to Reproduce:
1. [Step 1]
2. [Step 2]
3. [Step 3]
Expected: [What should happen]
Actual: [What actually happened]
Screenshot: [If applicable]
```

---

## ✅ Final Checklist Before Launch

### Phase 3 Features
- [ ] Training page loads correctly
- [ ] All 4 modules display properly
- [ ] Notifications slide in and dismiss
- [ ] Contest countdown updates
- [ ] Badge modal shows with confetti
- [ ] All share buttons work
- [ ] Mobile responsive on all pages
- [ ] No console errors
- [ ] All links functional
- [ ] Colors match brand guidelines

### Backend Integration Ready
- [ ] API endpoints documented
- [ ] Mock data clearly marked
- [ ] TODO comments for integration points
- [ ] WebSocket/polling strategy decided
- [ ] Database schema planned

---

**Happy Testing! 🎉**

For questions or issues, refer to:
- `PHASE3_GAMIFICATION.md` (full documentation)
- Code comments in HTML files
- Development team

---

**Testing Guide Version:** 1.0  
**Last Updated:** Phase 3 Completion  
**Status:** ✅ READY FOR QA
