# 🎯 COMPLETE UPGRADE LOGIC FLOW

**MarriageEducation.com Ambassador Promotion System**  
**Date:** February 26, 2026

---

## 🚀 STARTING POINT: Everyone Begins Here

### **STEP 0: Customer → Ambassador Registration**

**How to become an Ambassador:**
1. Visit: `https://marriageducation.com/ambassador-register.html`
2. Pay **15,000 FCFA** registration fee
3. Receive ambassador code (e.g., `AMB-X-001`)
4. Account created with:
   ```javascript
   {
     ambassadorCode: "AMB-X-001",
     ambassador_type: "regular",
     role_level: 1,              // 👈 START HERE
     recruits_count: 0,
     directAmbassadorCount: 0,
     commissionEarned: 0,
     personalVolume: 0
   }
   ```

**What you get:**
- ✅ Unique referral link: `marriageducation.com/sbd-campaign.html?ref=AMB-X-001`
- ✅ Access to Ambassador Dashboard
- ✅ Ability to sell books and earn **10% commission**
- ✅ Ability to recruit other ambassadors

**Commission Structure:**
- Earn **10%** on every book you sell directly
- Example: Sell $300 book → Earn $30

---

## ⬆️ UPGRADE PATH #1: Ambassador → Senior Ambassador

### **Criteria: Recruit 10 Ambassadors**

**The Logic:**
```
When you recruit your 10th ambassador:
  ✓ System detects: recruits_count = 10
  ✓ Auto-trigger: onAmbassadorUpdate() function
  ✓ Promotion: promoteToSenior() executes
  ✓ Status: ambassador_type = "senior"
  ✓ Level: role_level = 2
```

### **How Recruitment Works:**

**Your Referral Link:**
```
https://marriageducation.com/ambassador-register.html?senior=AMB-X-001
                                                              ↑
                                                        Your code here
```

**When someone registers using your link:**
1. New ambassador created (e.g., `AMB-Y-001`)
2. Their `senior_code` field set to `AMB-X-001` (you!)
3. **Your `recruits_count` increments by 1**
4. **Your `directAmbassadorCount` increments by 1**
5. Firestore trigger: `onNewAmbassadorCreated()` fires
6. System checks: Have you reached 10? → If YES, promote!

### **Automatic Promotion Example:**

```
Timeline of Ambassador John (AMB-JOHN-001):

Day 1:   Registers as Ambassador (recruits_count = 0) 👤
Day 5:   Recruits first person (recruits_count = 1) 👥
Day 10:  Recruits 2nd person (recruits_count = 2) 👥👥
Day 15:  Recruits 3rd person (recruits_count = 3)
Day 20:  Recruits 4th person (recruits_count = 4)
Day 25:  Recruits 5th person (recruits_count = 5)
Day 30:  Recruits 6th person (recruits_count = 6)
Day 35:  Recruits 7th person (recruits_count = 7)
Day 40:  Recruits 8th person (recruits_count = 8)
Day 45:  Recruits 9th person (recruits_count = 9)
Day 50:  Recruits 10th person (recruits_count = 10) 🎉

🎉 AUTOMATIC PROMOTION TO SENIOR AMBASSADOR!
```

### **What Happens When You're Promoted:**

**1. Firestore Update:**
```javascript
// Your ambassador record updates:
{
  ambassador_type: "senior",        // Changed from "regular"
  role_level: 2,                    // Changed from 1
  promotion_date: "2026-02-26",
  promoted_at: "2026-02-26T10:30:00Z"
}
```

**2. Senior Record Created:**
```javascript
// New document in senior_ambassadors collection:
senior_ambassadors/AMB-JOHN-001 {
  ...all your data,
  ambassador_type: "senior",
  team_count: 0,
  team_override_earned: 0,
  seniors_recruited: 0,           // 👈 Track for RD promotion
  directSeniorCount: 0
}
```

**3. Email Notification Sent:**
```
Subject: 🎉 You've Been Promoted to Senior Ambassador!

You can now:
✅ Earn 10% direct commission (on your own sales)
✅ Earn 5% team override (on your team's sales)
✅ Build and manage your own team
✅ Target: $18,000/month with 10 active ambassadors
```

**4. Your New Commission Structure:**
```
Level 1: Direct Sales   = 10% (you sell a book)
Level 2: Team Override  = 5%  (your team sells a book)
---------------------------------------------------
Total Earning Potential = 10% + 5% on team sales
```

### **Senior Ambassador Benefits:**

**Example Earnings:**
```
You sell 10 books ($300 each) = $3,000 × 10% = $300
Your 10 ambassadors each sell 10 books = $30,000 × 5% = $1,500
-----------------------------------------------------------
Total Monthly Income = $1,800
```

**Your New Referral Link:**
```
https://marriageducation.com/ambassador-register.html?senior=AMB-JOHN-001
```

Anyone who registers with this link becomes YOUR direct recruit!

---

## ⬆️ UPGRADE PATH #2: Senior Ambassador → Regional Director

### **Criteria: Recruit/Build 50 Senior Ambassadors**

**The Logic:**
```
When your 50th recruit becomes a Senior:
  ✓ System detects: seniors_recruited = 50
  ✓ Auto-trigger: onSeniorUpdate() function
  ✓ Promotion: promoteToRD() executes
  ✓ Status: ambassador_type = "regional_director"
  ✓ Level: role_level = 3
```

### **How Senior Count Works:**

**You're now Senior John (AMB-JOHN-001):**

When you recruit Ambassador Mary (AMB-MARY-001):
- Her `senior_code` = `AMB-JOHN-001` (you!)
- Your `directAmbassadorCount` increments

When Mary recruits 10 ambassadors and becomes Senior:
- Her status changes: `ambassador_type = "senior"`
- Firestore trigger: `onAmbassadorUpdate()` fires for Mary
- Function `promoteToSenior()` executes
- **Inside promoteToSenior(), your `seniors_recruited` increments!**
- **Your `directSeniorCount` increments!**
- System checks: Have you reached 50 seniors? → If YES, promote to RD!

### **The Math:**

**To become RD, you need:**
```
50 Senior Ambassadors
  ↓
Each Senior recruited 10 Ambassadors
  ↓
50 Seniors × 10 Ambassadors = 500 Total Ambassadors in your network!
```

### **Automatic Promotion Example:**

```
Timeline of Senior John (AMB-JOHN-001):

Month 1:  Recruits 10 ambassadors → Becomes Senior (seniors_recruited = 0)
Month 2:  3 of his recruits reach 10 → 3 become Seniors (seniors_recruited = 3)
Month 3:  5 more recruits reach 10 → 5 become Seniors (seniors_recruited = 8)
Month 4:  7 more recruits reach 10 → 7 become Seniors (seniors_recruited = 15)
Month 5:  10 more recruits reach 10 → 10 become Seniors (seniors_recruited = 25)
Month 6:  12 more recruits reach 10 → 12 become Seniors (seniors_recruited = 37)
Month 7:  13 more recruits reach 10 → 13 become Seniors (seniors_recruited = 50) 🎉

🎉 AUTOMATIC PROMOTION TO REGIONAL DIRECTOR!
```

### **What Happens When You're Promoted:**

**1. Firestore Update:**
```javascript
// Your ambassador record updates:
{
  ambassador_type: "regional_director",  // Changed from "senior"
  role_level: 3,                         // Changed from 2
  rd_promotion_date: "2026-08-26",
  promoted_to_rd_at: "2026-08-26T15:45:00Z"
}
```

**2. Regional Director Record Created:**
```javascript
// New document in regional_directors collection:
regional_directors/RD-JOHN-001 {
  ...all your data,
  code: "RD-JOHN-001",              // New RD code
  rd_code: "RD-JOHN-001",
  ambassador_code: "AMB-JOHN-001",  // Original code
  ambassador_type: "regional_director",
  network_size: 50,                 // Seniors
  network_ambassadors: 500,         // Total ambassadors
  network_override_earned: 0,
  networkVolume: 0
}
```

**3. Email Notification Sent:**
```
Subject: 👑 You've Been Promoted to Regional Director!

You now manage:
✅ 50 Senior Ambassadors
✅ 500 Total Ambassadors in your network
✅ Earn 3% network override on ALL network sales
✅ Target: $450K-$750K/month with active network
```

**4. Your New Commission Structure:**
```
Level 1: Direct Sales      = 10% (you sell a book)
Level 2: Team Override     = 5%  (your 50 seniors sell books)
Level 3: Network Override  = 3%  (your 500 ambassadors sell books)
-------------------------------------------------------------------
Total Earning Potential    = 10% + 5% + 3% on network sales
```

### **Regional Director Benefits:**

**Example Earnings:**
```
You sell 10 books ($300 each) = $3,000 × 10% = $300
Your 50 seniors sell 100 books = $30,000 × 5% = $1,500
Your 500 ambassadors sell 1,000 books = $300,000 × 3% = $9,000
-----------------------------------------------------------------
Total Monthly Income = $10,800
```

**Your Network:**
```
Regional Director (You)
  ├── Senior 1 (10 ambassadors)
  ├── Senior 2 (10 ambassadors)
  ├── Senior 3 (10 ambassadors)
  ├── ... (47 more seniors)
  └── Senior 50 (10 ambassadors)
      
Total: 50 Seniors × 10 Ambassadors = 500 Ambassadors
```

---

## ⬆️ UPGRADE PATH #3: Regional Director → Executive Network Director

### **Criteria: Recruit/Build 1 Regional Director**

**The Logic:**
```
When one of your recruits becomes a Regional Director:
  ✓ System detects: New RD created
  ✓ Auto-trigger: onRDPromoted() function
  ✓ Checks: Is the RD's sponsor an existing RD?
  ✓ If YES: Increment sponsor's directRDCount
  ✓ If directRDCount >= 1: promoteToExecutive() executes
  ✓ Status: ambassador_type = "executive"
  ✓ Level: role_level = 4
```

### **How RD Count Works:**

**You're now RD John (RD-JOHN-001, formerly AMB-JOHN-001):**

**Way back when you were an Ambassador:**
- You recruited Ambassador Sarah (AMB-SARAH-001)
- Her `senior_code` = `AMB-JOHN-001` (you!)

**Sarah's Journey:**
```
Month 1: Sarah recruits 10 → Becomes Senior Sarah
         Your seniors_recruited = 1

Month 7: Sarah's 50 recruits become Seniors → Sarah becomes RD-SARAH-001
         🎉 Firestore trigger: onRDPromoted() fires!
         Regional Director document created: RD-SARAH-001
         System checks: Who recruited Sarah? → You! (AMB-JOHN-001/RD-JOHN-001)
         Your directRDCount increments: 0 → 1
         System checks: directRDCount >= 1? YES!
         🏆 AUTOMATIC PROMOTION TO EXECUTIVE!
```

### **The Math:**

**To become Executive, you need:**
```
1 Regional Director recruited
  ↓
That RD has 50 Seniors
  ↓
Those 50 Seniors each have 10 Ambassadors = 500 Ambassadors
  ↓
Plus YOUR 500 Ambassadors
  ↓
Total Network: 1,000+ Ambassadors!
```

### **Automatic Promotion Example:**

```
Timeline of RD John (RD-JOHN-001):

Month 7:  Becomes Regional Director (directRDCount = 0)
          Manages 50 Seniors, 500 Ambassadors

Month 8:  Sarah (one of his original recruits) reaches 50 seniors
          👑 Sarah promoted to RD-SARAH-001
          🎉 John's directRDCount = 1
          🏆 AUTOMATIC PROMOTION TO EXECUTIVE NETWORK DIRECTOR!
```

### **What Happens When You're Promoted:**

**1. Firestore Update:**
```javascript
// Your ambassador record updates:
{
  ambassador_type: "executive",        // Changed from "regional_director"
  role_level: 4,                       // Changed from 3 (TOP TIER!)
  executive_promotion_date: "2026-09-15",
  promoted_to_executive_at: "2026-09-15T09:20:00Z"
}
```

**2. Regional Director Record Updated:**
```javascript
// Your RD document updates:
regional_directors/RD-JOHN-001 {
  ...existing data,
  ambassador_type: "executive",
  role_level: 4,
  executive_promotion_date: "2026-09-15"
}
```

**3. Email Notification Sent:**
```
Subject: 🏆 You've Been Promoted to Executive Network Director!

🏆 TOP TIER LEADERSHIP - ELITE STATUS!

You now manage:
✅ Multiple Regional Directors
✅ 100+ Senior Ambassadors across territories
✅ 1,000+ Ambassadors in your network
✅ Earn 9% executive override (7% + 2% leadership)
✅ Target: $1M-$1.5M+/month with active network
```

**4. Your FINAL Commission Structure:**
```
Level 1: Direct Sales         = 10% (you sell a book)
Level 2: Team Override        = 5%  (your seniors sell books)
Level 3: Network Override     = 3%  (your 1st-tier RD network sells books)
Level 4: Executive Override   = 9%  (your entire multi-RD network sells books)
-------------------------------------------------------------------------
Total Earning Potential       = 10% + 5% + 3% + 9% (27% total!)
```

### **Executive Network Director Benefits:**

**Example Earnings:**
```
You sell 10 books ($300 each) = $3,000 × 10% = $300
Your direct seniors sell 100 books = $30,000 × 5% = $1,500
Your RD network sells 1,000 books = $300,000 × 3% = $9,000
Your ENTIRE network sells 5,000 books = $1,500,000 × 9% = $135,000
----------------------------------------------------------------------
Total Monthly Income = $145,800
```

**Your Network Structure:**
```
Executive Network Director (YOU - TOP TIER!)
  │
  ├── Regional Director 1 (RD-SARAH-001)
  │     ├── Senior 1 (10 ambassadors)
  │     ├── Senior 2 (10 ambassadors)
  │     ├── ... (48 more seniors)
  │     └── Senior 50 (10 ambassadors)
  │         = 500 Ambassadors
  │
  ├── Regional Director 2 (RD-MIKE-001) [if you build another]
  │     ├── Senior 1 (10 ambassadors)
  │     ├── Senior 2 (10 ambassadors)
  │     ├── ... (48 more seniors)
  │     └── Senior 50 (10 ambassadors)
  │         = 500 Ambassadors
  │
  └── YOUR DIRECT NETWORK (50 Seniors, 500 Ambassadors)
      
Total: 1,500+ Ambassadors across multiple territories!
```

---

## 🔄 COMPLETE UPGRADE LOGIC FLOW (Visual)

```
START: Customer
  │
  │ Pay 15,000 FCFA
  ↓
┌─────────────────────────────────────────┐
│ LEVEL 1: AMBASSADOR                     │
│ • Role: "regular"                       │
│ • Commission: 10%                       │
│ • Goal: Recruit 10 ambassadors          │
│ • Field: recruits_count                 │
└─────────────────────────────────────────┘
  │
  │ recruits_count = 10
  │ ✓ onAmbassadorUpdate() triggers
  │ ✓ promoteToSenior() executes
  ↓
┌─────────────────────────────────────────┐
│ LEVEL 2: SENIOR AMBASSADOR              │
│ • Role: "senior"                        │
│ • Commission: 10% + 5%                  │
│ • Goal: Build 50 senior ambassadors     │
│ • Field: seniors_recruited              │
└─────────────────────────────────────────┘
  │
  │ seniors_recruited = 50
  │ ✓ onSeniorUpdate() triggers
  │ ✓ promoteToRD() executes
  ↓
┌─────────────────────────────────────────┐
│ LEVEL 3: REGIONAL DIRECTOR              │
│ • Role: "regional_director"             │
│ • Commission: 10% + 5% + 3%             │
│ • Goal: Build 1 Regional Director       │
│ • Field: directRDCount                  │
│ • Network: 50 Seniors, 500 Ambassadors  │
└─────────────────────────────────────────┘
  │
  │ directRDCount = 1
  │ ✓ onRDPromoted() triggers
  │ ✓ promoteToExecutive() executes
  ↓
┌─────────────────────────────────────────┐
│ LEVEL 4: EXECUTIVE NETWORK DIRECTOR     │
│ • Role: "executive"                     │
│ • Commission: 10% + 5% + 3% + 9%        │
│ • Goal: MAINTAIN & GROW EMPIRE          │
│ • Network: 1,000+ Ambassadors           │
│ • Status: 🏆 TOP TIER ELITE             │
└─────────────────────────────────────────┘
```

---

## 🎯 UPGRADE LOGIC: Technical Implementation

### **Firestore Triggers (Automatic Checks)**

**1. onNewAmbassadorCreated**
```javascript
// Fires when: New ambassador document created
// Location: ambassadors/{ambassadorCode}
// Action: Increment recruiter's recruits_count + directAmbassadorCount
// Next: Triggers onAmbassadorUpdate for recruiter
```

**2. onAmbassadorUpdate**
```javascript
// Fires when: Any field in ambassador document changes
// Checks: Did recruits_count change?
// Logic:
if (recruits_count >= 10 && ambassador_type === "regular") {
  promoteToSenior(ambassadorCode);
}
```

**3. onSeniorUpdate** (Custom - we added this)
```javascript
// Fires when: Any field in ambassador document changes
// Checks: Did seniors_recruited change?
// Logic:
if (seniors_recruited >= 50 && ambassador_type === "senior") {
  promoteToRD(ambassadorCode);
}
```

**4. onRDPromoted** (NEW - we added this)
```javascript
// Fires when: New RD document created in regional_directors collection
// Location: regional_directors/{rdCode}
// Action: 
//   1. Get RD's sponsor_code
//   2. Increment sponsor's directRDCount
//   3. Check if sponsor eligible for Executive
// Logic:
if (directRDCount >= 1 && ambassador_type === "regional_director") {
  promoteToExecutive(sponsorCode);
}
```

---

## 📊 UPGRADE REQUIREMENTS SUMMARY

| From | To | Requirement | Time to Achieve | Network Size |
|------|------|-------------|----------------|--------------|
| **Customer** | **Ambassador** | Pay 15,000 FCFA | Instant | 0 |
| **Ambassador** | **Senior** | 10 Ambassadors recruited | 1-3 months | 10 |
| **Senior** | **Regional Director** | 50 Seniors built | 6-12 months | 500 |
| **RD** | **Executive** | 1 RD recruited | 12-24 months | 1,000+ |

---

## 🔢 FIELD TRACKING DETAILS

### **Fields That Trigger Promotions:**

**Ambassador → Senior:**
```javascript
recruits_count: 10        // Counts ALL direct recruits
directAmbassadorCount: 10 // Same as recruits_count (for clarity)
```

**Senior → RD:**
```javascript
seniors_recruited: 50     // Counts only recruits who became Seniors
directSeniorCount: 50     // Same as seniors_recruited (for clarity)
```

**RD → Executive:**
```javascript
directRDCount: 1          // Counts only recruits who became RDs
rds_recruited: 1          // Same as directRDCount (for clarity)
```

### **How Fields Update:**

**When you recruit someone:**
```javascript
// Your fields update:
recruits_count: +1
directAmbassadorCount: +1
```

**When your recruit becomes Senior:**
```javascript
// Your fields update:
seniors_recruited: +1
directSeniorCount: +1
```

**When your recruit becomes RD:**
```javascript
// Your fields update:
directRDCount: +1
rds_recruited: +1
```

---

## ✅ UPGRADE CHECKLIST

### **To Become Senior Ambassador:**
- [ ] Recruit 10 ambassadors
- [ ] Share your referral link: `?senior=YOUR-CODE`
- [ ] Wait for automatic promotion (happens instantly when 10th recruits)
- [ ] Check email for promotion notification
- [ ] Access Senior Dashboard

### **To Become Regional Director:**
- [ ] Already be a Senior Ambassador
- [ ] Help 50 of your recruits reach Senior status
- [ ] Each recruit needs to recruit 10 ambassadors
- [ ] Total network: 500 ambassadors
- [ ] Wait for automatic promotion (happens instantly when 50th Senior)
- [ ] Check email for RD promotion notification
- [ ] Access Regional Director Dashboard

### **To Become Executive Network Director:**
- [ ] Already be a Regional Director
- [ ] Help ONE of your original recruits reach RD status
- [ ] That recruit needs 50 seniors (500 ambassadors)
- [ ] Your total network: 1,000+ ambassadors
- [ ] Wait for automatic promotion (happens instantly)
- [ ] Check email for Executive promotion notification
- [ ] Access Executive Network Director Dashboard

---

## 🏆 FINAL NOTES

**All promotions are AUTOMATIC:**
- ✅ No manual approval needed
- ✅ No forms to fill
- ✅ No waiting period
- ✅ Instant when threshold reached
- ✅ Email + Telegram notifications sent
- ✅ Dashboard updates immediately

**All tracking is AUTOMATIC:**
- ✅ Firestore triggers handle everything
- ✅ Counts increment on each action
- ✅ Promotion checks run automatically
- ✅ Commission structure updates automatically

**The system is BULLETPROOF:**
- ✅ No duplicate promotions (checks current status)
- ✅ No skipping levels (must progress sequentially)
- ✅ No gaming the system (Firestore is authoritative)
- ✅ Full audit trail (all actions logged)

---

**START YOUR JOURNEY TODAY!** 🚀

Register → Recruit 10 → Build 50 Seniors → Develop 1 RD → Reach Executive!
