# 📚 Book Sharer Rewards Program - Implementation Guide

## Overview

**Book Sharer Rewards** is a casual referral program distinct from the main Ambassador Program. It allows book buyers to earn cash commissions by simply sharing their referral link with friends and family—no registration, no commitment, no selling required.

### Key Differences from Ambassador Program

| Feature | Book Sharer Rewards | Ambassador Program |
|---------|---------------------|-------------------|
| **Target Audience** | Casual book lovers | Professional sellers |
| **Registration** | No registration needed | Must register & apply |
| **Commission** | 10,000 FCFA per 10 sales | 10% per book (1,500-2,500 FCFA tiered) |
| **Payment Type** | Milestone-based (bulk) | Per-sale |
| **Dashboard** | No dashboard | Full dashboard access |
| **Commitment** | Zero commitment | Professional commitment |
| **Approval** | Admin approves milestones | Auto-approved sales |

---

## How It Works

### For Referrers (Book Sharers)

1. **Get Your Link**
   - Visit: `https://marriageducation.com/sbd-campaign.html#referral-program`
   - Enter email address
   - Click "Generate My Link"
   - System generates unique code (e.g., `ACHU123`)

2. **Share the Link**
   - Copy: `https://marriageducation.com/sbd-campaign.html?referral=ACHU123`
   - Share via WhatsApp, Facebook, email, SMS
   - Link tracks all purchases made through it

3. **Earn Commissions**
   - **10 sales** = 10,000 FCFA
   - **20 sales** = 20,000 FCFA (another 10K)
   - **30 sales** = 30,000 FCFA (another 10K)
   - Unlimited earning potential!

4. **Get Paid**
   - At each 10-sale milestone, you receive email notification
   - Admin verifies and approves commission within 1-2 business days
   - Payment sent via Mobile Money to your registered phone number

---

## Technical Implementation

### Backend Structure

#### File: `referral_codes.json`
```json
{
  "referrals": {
    "ACHU123": {
      "code": "ACHU123",
      "email": "achu@example.com",
      "sales_count": 15,
      "total_revenue": 225000,
      "commission_earned": 10000,
      "commission_pending": 10000,
      "commission_paid": 0,
      "milestones_reached": [10],
      "created_at": "2025-01-15T10:30:00Z",
      "last_sale_date": "2025-01-20T14:22:00Z"
    }
  }
}
```

#### Key Functions in `server.rb`

**1. Register Referral Code**
```ruby
POST /register-referral-code
```
- Validates email format
- Generates unique code from email (e.g., `ACHU123`)
- Checks for existing codes (returns existing if found)
- Stores in `referral_codes.json`

**2. Track Referral Sale**
```ruby
def track_referral_sale(referral_code, amount)
```
- Increments `sales_count`
- Adds to `total_revenue`
- Detects milestones (every 10 sales)
- Awards 10,000 FCFA commission
- Triggers email notifications

**3. Send Milestone Email**
```ruby
def send_referral_milestone_email(referral, milestone_sales)
```
- Sends celebration email to referrer with:
  - Milestone achievement (10, 20, 30 sales)
  - Commission earned (10,000 FCFA)
  - Total stats (sales, earnings, pending)
  - Next milestone progress
  - Payment timeline (1-2 business days)
- Sends admin notification with:
  - Referral code and email
  - Commission due (10,000 FCFA)
  - Approval required alert
  - Complete statistics

---

## Frontend Flow

### 1. Campaign Page (`sbd-campaign.html`)

**Referral Section:**
- Title: "🎁 Book Sharer Rewards — Earn Cash by Sharing"
- Distinction badge: "Not an Ambassador? No problem!"
- Rewards breakdown: 10K (10 sales), 20K (20), 30K (30)
- Email input field (required for notifications)
- "Generate My Link" button
- Link display with "Copy Link" button

**JavaScript:**
```javascript
async function generateReferralLink() {
    const email = document.getElementById('referral-email').value;
    
    // Call backend API
    const response = await fetch('https://marriage-education-website.onrender.com/register-referral-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email })
    });
    
    const data = await response.json();
    const referralUrl = `${window.location.origin}${window.location.pathname}?referral=${data.code}`;
    
    // Display link and store in localStorage
    document.getElementById('referral-link').textContent = referralUrl;
    localStorage.setItem('sbd-referral-code', data.code);
}
```

**URL Parameter Tracking:**
```javascript
// Track ?referral= parameter (Book Sharer)
const referralCode = new URLSearchParams(window.location.search).get('referral');
if (referralCode) {
    sessionStorage.setItem('referral_code', referralCode);
}

// Track ?ref= parameter (Ambassador)
const ambassadorRef = new URLSearchParams(window.location.search).get('ref');
if (ambassadorRef) {
    sessionStorage.setItem('ambassador_ref', ambassadorRef);
}
```

### 2. Payment Pages

**Parameters Used:**
- `?referral=CODE` - Book Sharer Rewards tracking
- `?ref=CODE` - Ambassador tracking (separate system)

**Data Flow:**
1. User clicks referral link: `sbd-campaign.html?referral=ACHU123`
2. Code stored in `sessionStorage`
3. User clicks "Buy Now" → redirected to `payment.html?referral=ACHU123`
4. Code persists through payment flow
5. User selects MoMo → `momo-manual-payment.html` (code in sessionStorage)
6. User submits payment → code sent to backend in JSON:
```javascript
{
    reference: "PMT-123",
    product_id: "sbd-for-dummies",
    amount: 15000,
    referral_code: "ACHU123",  // <-- Book Sharer
    ambassador_ref: "",         // <-- Ambassador (if applicable)
    ...
}
```

### 3. Admin Approval

When admin approves payment in `admin-payments.html`:
1. Backend calls `track_referral_sale(referral_code, amount)`
2. Sales count increments
3. If milestone reached (10, 20, 30, etc.):
   - Commission added: `commission_pending += 10000`
   - Emails sent to referrer and admin
   - Admin sees notification to approve payout

---

## Email Notifications

### Referrer Email (Milestone Celebration)

**Subject:** 🎉 You Earned 10,000 FCFA! [10/20/30] Sales Milestone Reached

**Content:**
- Large milestone number (10, 20, 30 sales)
- Commission amount: +10,000 FCFA
- Stats table:
  - Referral Code
  - Total Sales
  - Total Earned
  - Pending Payment
- Next milestone progress (e.g., "Just 5 more sales to earn another 10K!")
- What happens next:
  1. Admin notified
  2. Verification (1-2 business days)
  3. Mobile Money payment
- Encouragement to keep sharing

**Design:** Green gradient header, clean stats display, motivational copy

---

### Admin Email (Commission Approval)

**Subject:** 🎁 Referral Milestone: [CODE] - 10,000 FCFA Commission Pending

**Content:**
- Action required alert (yellow background)
- Referral details:
  - Code
  - Email
  - Milestone (10, 20, 30 sales)
  - Commission due: **10,000 FCFA**
  - Total sales
  - Total earned
  - Pending payment amount
- Next steps:
  1. Verify milestone in admin panel
  2. Process Mobile Money payment
  3. Mark as paid in system

**Design:** Purple gradient header, prominent alert box, clear action items

---

## Commission Approval Process

### Current Flow (Manual)

1. **Milestone Reached:**
   - User hits 10, 20, 30 sales
   - System sends emails to user and admin
   - Status: `commission_pending = 10000`

2. **Admin Reviews:**
   - Check email notification
   - Verify sales count in `referral_codes.json`
   - Confirm email address matches

3. **Process Payment:**
   - Send 10,000 FCFA via Mobile Money
   - Keep proof of payment

4. **Mark as Paid:**
   - Manually update `referral_codes.json`:
     ```json
     "commission_pending": 0,
     "commission_paid": 10000
     ```

### Future Enhancement (Admin Panel)

**Planned Features:**
- Admin panel section: `admin-referral-commissions.html`
- List all pending milestone commissions
- One-click approval button
- Automatic update to `commission_paid`
- Payment status tracking
- Historical payout records

---

## Testing Checklist

### Test Scenario 1: New Referrer

1. ✅ Go to `sbd-campaign.html#referral-program`
2. ✅ Enter email: `test@example.com`
3. ✅ Click "Generate My Link"
4. ✅ Verify API returns code (e.g., `TEST123`)
5. ✅ Verify link displays: `sbd-campaign.html?referral=TEST123`
6. ✅ Check `referral_codes.json` created with correct structure

### Test Scenario 2: Returning Referrer

1. ✅ Use same email from Test 1
2. ✅ Verify returns existing code
3. ✅ Alert shows: "Welcome back! Here is your existing referral code."

### Test Scenario 3: Referral Link → Purchase

1. ✅ Copy referral link from Test 1
2. ✅ Open in new incognito browser
3. ✅ Verify referral code stored in sessionStorage
4. ✅ Click "Buy Now" button
5. ✅ Verify payment page includes `?referral=TEST123`
6. ✅ Complete payment submission
7. ✅ Verify `pending_payments.json` includes `referral_code: "TEST123"`

### Test Scenario 4: Admin Approval → Milestone

1. ✅ Go to `admin-payments.html`
2. ✅ Approve 10 payments with same referral code
3. ✅ On 10th approval, verify:
   - Console shows: `[REFERRAL MILESTONE] 🎉 TEST123 reached 10 sales`
   - Emails sent to referrer and admin
   - `referral_codes.json` updated:
     ```json
     "sales_count": 10,
     "commission_earned": 10000,
     "commission_pending": 10000,
     "milestones_reached": [10]
     ```

### Test Scenario 5: Multiple Milestones

1. ✅ Approve 20 more payments (total 30)
2. ✅ Verify milestone at 20 sales (another 10K)
3. ✅ Verify milestone at 30 sales (another 10K)
4. ✅ Check `commission_earned: 30000`

---

## Troubleshooting

### Issue: Referral code not tracking

**Symptoms:**
- Payment submitted but no referral_code in `pending_payments.json`
- No milestone email after 10 sales

**Diagnosis:**
1. Check browser console for referral code in sessionStorage:
   ```javascript
   sessionStorage.getItem('referral_code')
   ```
2. Check if payment page URL includes `?referral=CODE`
3. Check `momo-manual-payment.html` form submission includes referral_code

**Solution:**
- Clear sessionStorage and try again
- Ensure URL parameter is `?referral=` not `?ref=`
- Verify sessionStorage persists across payment flow

---

### Issue: Milestone not detected

**Symptoms:**
- 10+ sales but no email notification
- `commission_pending` still 0

**Diagnosis:**
1. Check server logs for `[REFERRAL MILESTONE]` message
2. Verify `track_referral_sale()` called on payment approval
3. Check `referral_codes.json` for `sales_count`

**Solution:**
- Ensure referral code matches exactly (case-sensitive)
- Verify `payment['referral_code']` not empty
- Check milestone detection logic: `sales_count / 10`

---

### Issue: Email not received

**Symptoms:**
- Milestone reached but no email to referrer/admin

**Diagnosis:**
1. Check server logs for email send status
2. Verify SMTP configuration in `server.rb`
3. Check spam folder

**Solution:**
- Test email sending with simple test:
  ```ruby
  send_email('test@example.com', 'Test', 'Test body')
  ```
- Verify email address in `referral_codes.json` correct
- Check email provider not blocking automated emails

---

## Monitoring & Analytics

### Key Metrics to Track

1. **Referral Activity:**
   - Total referral codes generated
   - Active referrers (>0 sales)
   - Average sales per referrer
   - Conversion rate (visitors → buyers)

2. **Commission Stats:**
   - Total commissions earned
   - Total commissions pending
   - Total commissions paid
   - Average time to milestone

3. **Revenue Impact:**
   - Total revenue from referral sales
   - Referral sales vs. direct sales
   - Cost per acquisition via referrals

### Generate Reports

**Script to analyze `referral_codes.json`:**
```ruby
require 'json'

data = JSON.parse(File.read('referral_codes.json'))
referrals = data['referrals'].values

puts "=== Book Sharer Rewards Statistics ==="
puts "Total Referrers: #{referrals.length}"
puts "Active Referrers: #{referrals.count { |r| r['sales_count'] > 0 }}"
puts "Total Sales: #{referrals.sum { |r| r['sales_count'] }}"
puts "Total Revenue: #{referrals.sum { |r| r['total_revenue'] }} FCFA"
puts "Total Earned: #{referrals.sum { |r| r['commission_earned'] }} FCFA"
puts "Total Pending: #{referrals.sum { |r| r['commission_pending'] }} FCFA"
puts "Total Paid: #{referrals.sum { |r| r['commission_paid'] }} FCFA"

puts "\n=== Top Referrers ==="
referrals.sort_by { |r| -r['sales_count'] }.take(10).each_with_index do |r, i|
  puts "#{i+1}. #{r['code']} (#{r['email']}): #{r['sales_count']} sales, #{r['commission_earned']} FCFA"
end
```

---

## Future Enhancements

### Priority 1: Admin Panel Integration

- Create `admin-referral-commissions.html`
- List all pending commissions
- One-click approve & mark paid
- Payment history log
- Export reports (CSV/PDF)

### Priority 2: Referrer Dashboard

- Optional login for referrers (via email link)
- View sales count, earnings, next milestone
- Download payment history
- Get marketing materials (images, messages)
- Track link performance (clicks, conversions)

### Priority 3: Advanced Features

- **Tiered rewards:** Increase commission for high performers (e.g., 12K after 100 sales)
- **Bonus milestones:** Extra bonuses at 50, 100, 200 sales
- **Leaderboard:** Public top referrers (optional, privacy-conscious)
- **Social sharing buttons:** One-click share to WhatsApp, Facebook, Twitter
- **QR codes:** Generate QR code for offline sharing
- **Custom short links:** `marriageducation.com/r/ACHU123`

### Priority 4: Analytics Dashboard

- Real-time tracking
- Geographic distribution
- Peak sharing times
- Conversion funnels
- A/B testing different reward structures

---

## Support & Maintenance

### Regular Tasks

**Weekly:**
- Review pending commissions
- Process milestone payments
- Check for fraud/abuse patterns

**Monthly:**
- Generate performance reports
- Clean up inactive referral codes (0 sales after 90 days)
- Backup `referral_codes.json`

**Quarterly:**
- Review commission structure effectiveness
- Analyze top performer strategies
- Consider reward adjustments

### Contact Points

**For Referrers:**
- Email: orders@marriageducation.com
- Support: Reply to milestone emails
- FAQ: Include in sbd-campaign.html

**For Admin:**
- Logs: Check server logs for `[REFERRAL]` messages
- Data: `referral_codes.json` in project root
- Code: `server.rb` lines 928-1077, 1220-1290

---

## Conclusion

The **Book Sharer Rewards** program provides a low-barrier, high-reward way for satisfied customers to earn money by sharing the book with their networks. By keeping it simple (no registration, no dashboards, no complex processes), we encourage casual sharing while still providing meaningful cash incentives.

The distinction from the Ambassador program is crucial:
- **Ambassador** = Professional selling, per-sale commissions, requires commitment
- **Book Sharer** = Casual sharing, milestone bonuses, zero commitment

This two-track approach maximizes reach: professional sellers handle active promotion, while casual sharers leverage personal networks through word-of-mouth.

### Success Metrics

**Good:**
- 10%+ of buyers generate referral links
- 5%+ of referrers reach first milestone (10 sales)
- 30% of sales include referral codes

**Great:**
- 20%+ of buyers generate referral links
- 10%+ of referrers reach first milestone
- 50% of sales include referral codes

**Excellent:**
- 30%+ of buyers generate referral links
- 15%+ of referrers reach first milestone
- 60%+ of sales include referral codes

Monitor these metrics and adjust commission structure, messaging, and incentives accordingly.
