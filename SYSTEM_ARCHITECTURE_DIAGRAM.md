# 🏗️ SENIOR AMBASSADOR SYSTEM ARCHITECTURE

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     RECRUITMENT FLOW                             │
└─────────────────────────────────────────────────────────────────┘

Senior Ambassador (AMB-SENIOR-001)
         │
         │ Shares recruitment link
         ├──────────────────────────────────────────────┐
         │                                              │
         ▼                                              ▼
?senior=AMB-SENIOR-001                        ?rd=RD-JOHN-001
         │                                              │
         │                                              │
         ▼                                              ▼
┌────────────────────────┐                   ┌────────────────────────┐
│ Ambassador Register    │                   │ Ambassador Register    │
│ - Capture referral     │                   │ - Capture referral     │
│ - Store in session     │                   │ - Store in session     │
│ - Show banner          │                   │ - Show banner          │
└──────────┬─────────────┘                   └──────────┬─────────────┘
           │                                            │
           │ Submit form                                │
           ▼                                            ▼
┌────────────────────────┐                   ┌────────────────────────┐
│ Payment Page           │                   │ Payment Page           │
│ - Read sessionStorage  │                   │ - Read sessionStorage  │
│ - Pass to Cloud Fn     │                   │ - Pass to Cloud Fn     │
└──────────┬─────────────┘                   └──────────┬─────────────┘
           │                                            │
           │ submitManualPayment()                      │
           └─────────────────┬──────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                 CLOUD FUNCTION: submitManualPayment             │
│                                                                 │
│  Writes to pending_payments with:                              │
│  - ambassador_data (contains hierarchy fields)                 │
│  - ambassador_code                                             │
│  - regional_director (if applicable)                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ Admin approves
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│               CLOUD FUNCTION: approvePayment                    │
│                                                                 │
│  Calls: activateAmbassador(payment)                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│            CLOUD FUNCTION: activateAmbassador                   │
│                                                                 │
│  Firestore Write:                                              │
│  ambassadors/AMB-NEW-001 = {                                   │
│    fullName: "John Doe",                                       │
│    email: "john@example.com",                                  │
│    senior_code: "AMB-SENIOR-001",        ← HIERARCHY LINK     │
│    regional_director_code: "RD-JOHN-001", ← HIERARCHY LINK     │
│    recruited_by: "AMB-SENIOR-001",                             │
│    recruited_by_type: "senior_ambassador",                     │
│    ambassador_type: "regular",            ← STARTS REGULAR     │
│    recruits_count: 0,                                          │
│    units_deployed: 0,                                          │
│    status: "active"                                            │
│  }                                                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ TRIGGERS
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│      FIRESTORE TRIGGER: onNewAmbassadorCreated                 │
│                                                                 │
│  Reads: senior_code from new ambassador                        │
│  Updates: ambassadors/AMB-SENIOR-001                           │
│    recruits_count: +1                                          │
│    team_count: +1                                              │
│  Creates: notification for senior                              │
└─────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────┐
│                     PROMOTION FLOW                              │
└─────────────────────────────────────────────────────────────────┘

Regular Ambassador (AMB-NEW-001)
         │
         │ Works & grows
         │
         ├─────────────────────┬──────────────────────┐
         │                     │                      │
         ▼                     ▼                      ▼
   Makes sales          Recruits team          Time passes
   (10% commission)     (builds downline)      (tracks progress)
         │                     │                      │
         │                     │                      │
         ▼                     ▼                      ▼
   units_deployed        recruits_count         Dashboard shows
   increases             increases              progress to 500/10
         │                     │                      │
         └─────────────────────┴──────────────────────┘
                             │
                    Reaches threshold:
                    500 units OR 10 recruits
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│      FIRESTORE TRIGGER: onAmbassadorUpdate                     │
│                                                                 │
│  Detects: units_deployed >= 500 OR recruits_count >= 10        │
│  Calls: promoteToSenior(ambassadorCode, reason, data)         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│            FUNCTION: promoteToSenior                            │
│                                                                 │
│  Firestore Batch Write:                                        │
│  1. ambassadors/AMB-NEW-001                                    │
│     ambassador_type: "regular" → "senior"                      │
│     promotion_date: Timestamp                                  │
│     promotion_reason: "units_threshold"                        │
│                                                                 │
│  2. senior_ambassadors/AMB-NEW-001 (NEW COLLECTION)           │
│     ...ambassadorData                                          │
│     team_count: 0                                              │
│     team_override_earned: 0                                    │
│     seniors_recruited: 0                                       │
│                                                                 │
│  3. ambassadors/AMB-SENIOR-001 (if recruited by senior)       │
│     seniors_recruited: +1                                      │
│                                                                 │
│  4. notifications/[auto-id]                                    │
│     type: "promotion"                                          │
│     title: "🎉 You're now a Senior Ambassador!"                │
│                                                                 │
│  5. Send Telegram notification to admin                        │
└─────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────┐
│                     COMMISSION FLOW                             │
└─────────────────────────────────────────────────────────────────┘

Customer buys product ($300)
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│      CLOUD FUNCTION: processProductDeployment                  │
│      (commission-functions.js)                                  │
│                                                                 │
│  1. Find ambassador who made sale                              │
│     ambassadors/AMB-NEW-001                                    │
│                                                                 │
│  2. Credit 10% direct commission                               │
│     AMB-NEW-001 receives: $30 (10%)                            │
│                                                                 │
│  3. Check for senior_code                                      │
│     Found: "AMB-SENIOR-001"                                    │
│                                                                 │
│  4. Credit 5% team override to senior                          │
│     AMB-SENIOR-001 receives: $15 (5%)                          │
│     Field: team_override_earned += $15                         │
│                                                                 │
│  5. Check senior's regional_director_code                      │
│     Found: "RD-JOHN-001"                                       │
│                                                                 │
│  6. Credit 5% network override to RD                           │
│     RD-JOHN-001 receives: $15 (5%)                             │
│     Field: network_override_earned += $15                      │
│                                                                 │
│  Total distributed: $60 = $30 + $15 + $15 (20% of $300)       │
└─────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────┐
│                  SENIOR DASHBOARD VIEW                          │
└─────────────────────────────────────────────────────────────────┘

Senior Ambassador (AMB-SENIOR-001) logs in
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│           QUERY: Team Members                                   │
│                                                                 │
│  db.collection('ambassadors')                                  │
│    .where('senior_code', '==', 'AMB-SENIOR-001')               │
│    .get()                                                      │
│                                                                 │
│  Returns:                                                      │
│  - AMB-NEW-001 (John Doe)                                      │
│  - AMB-NEW-002 (Jane Smith)                                    │
│  - AMB-NEW-003 (Bob Wilson)                                    │
│  - ... (up to 100+ team members)                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│           AGGREGATE: Team Performance                           │
│                                                                 │
│  For each team member:                                         │
│  - Sum units_deployed → Total Team Units                       │
│  - Sum deployment_by_category → Portfolio Breakdown            │
│  - Count team.length → Team Size                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│           QUERY: Team Sales Activity                            │
│                                                                 │
│  const teamCodes = ['AMB-NEW-001', 'AMB-NEW-002', ...]         │
│                                                                 │
│  db.collection('sales')                                        │
│    .where('ambassador_code', 'in', teamCodes)                  │
│    .orderBy('created_at', 'desc')                              │
│    .limit(50)                                                  │
│    .get()                                                      │
│                                                                 │
│  Returns: Last 50 team transactions in real-time              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│           DISPLAY: Senior Dashboard                             │
│                                                                 │
│  Performance Cards:                                            │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐  │
│  │ Team Count: 25  │ │ Override: $375  │ │ Total: $1,875   │  │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘  │
│                                                                 │
│  Monthly Income Tracker:                                       │
│  Personal:     $300   (10% on $3K sales)                       │
│  Team Override: $375  (5% on 25 × $300 sales)                 │
│  ─────────────────────────────────────────                     │
│  Total:        $675/month (path to $18K with 10 ambassadors)   │
│                                                                 │
│  Team Portfolio:                                               │
│  ┌────────────┬───────┬──────────┬─────────────┐              │
│  │ Category   │ Units │ Revenue  │ Override    │              │
│  ├────────────┼───────┼──────────┼─────────────┤              │
│  │ Books      │  120  │ $3,600   │   $180      │              │
│  │ Schools    │   45  │ $13,500  │   $675      │              │
│  │ Courses    │   80  │ $2,400   │   $120      │              │
│  │ Premium    │   30  │ $9,000   │   $450      │              │
│  └────────────┴───────┴──────────┴─────────────┘              │
│                                                                 │
│  Live Sales Feed:                                              │
│  🎯 AMB-NEW-001 deployed "Marriage Blueprint" - $300 → +$15    │
│  🎯 AMB-NEW-003 deployed "Foundation School" - $300 → +$15     │
│  🎯 AMB-NEW-002 deployed "Marriage Pro Course" - $30 → +$1.50  │
│                                                                 │
│  Individual Performance:                                       │
│  ▶ John Doe (AMB-NEW-001) - 50 units - $500 override          │
│  ▶ Jane Smith (AMB-NEW-002) - 35 units - $350 override        │
│  ▶ Bob Wilson (AMB-NEW-003) - 40 units - $400 override        │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Summary

### Registration → Firestore
```javascript
URL: ?senior=AMB-SENIOR-001
  ↓
sessionStorage: { referral_code, referral_type }
  ↓
ambassadorData: { senior_code, ambassador_type: 'regular', ... }
  ↓
Firestore: ambassadors/AMB-NEW-001
```

### Promotion Check
```javascript
onAmbassadorUpdate trigger
  ↓
Check: units_deployed >= 500 OR recruits_count >= 10
  ↓
promoteToSenior(code, reason, data)
  ↓
Update: ambassador_type → 'senior'
  ↓
Create: senior_ambassadors/AMB-NEW-001
```

### Commission Distribution
```javascript
Sale: $300 product
  ↓
Ambassador (10%): $30
  ↓
Find: senior_code
  ↓
Senior Override (5%): $15
  ↓
Find: regional_director_code
  ↓
RD Override (5%): $15
  ↓
Total: $60 distributed (20%)
```

### Dashboard Query
```javascript
Login as: AMB-SENIOR-001
  ↓
Query: ambassadors where senior_code === 'AMB-SENIOR-001'
  ↓
Aggregate: Sum units, revenues, overrides
  ↓
Query: sales where ambassador_code in [team codes]
  ↓
Display: Real-time team performance
```

## Key Collections

### ambassadors
```javascript
{
  code: "AMB-NEW-001",
  fullName: "John Doe",
  email: "john@example.com",
  ambassador_type: "regular" | "senior",  // Starts regular
  senior_code: "AMB-SENIOR-001",          // WHO recruited them
  regional_director_code: "RD-JOHN-001",  // Ultimate upline
  recruited_by: "AMB-SENIOR-001",
  recruited_by_type: "senior_ambassador",
  recruits_count: 0,                      // How many THEY recruited
  units_deployed: 0,                      // Products deployed
  team_override_earned: 0                 // From their team (if senior)
}
```

### senior_ambassadors
```javascript
{
  code: "AMB-SENIOR-001",
  fullName: "Sarah Senior",
  ambassador_type: "senior",
  promotion_date: Timestamp,
  promotion_reason: "units_threshold",
  team_count: 25,                         // Team members
  team_override_earned: 5000,             // Total override earned
  seniors_recruited: 3                    // For RD promotion tracking
}
```

### sales
```javascript
{
  sale_id: "SALE-123",
  ambassador_code: "AMB-NEW-001",
  product_id: "marriage-blueprint",
  product_name: "Marriage Blueprint",
  price: 90000,                           // 90K FCFA
  currency: "XAF",
  ambassador_commission: 9000,            // 10%
  senior_override: 4500,                  // 5% to AMB-SENIOR-001
  rd_override: 4500,                      // 5% to RD-JOHN-001
  created_at: Timestamp
}
```

### notifications
```javascript
{
  type: "promotion" | "new_recruit" | "sale",
  title: "🎉 You're now a Senior Ambassador!",
  message: "You've been promoted for deploying 500+ units...",
  ambassador_code: "AMB-NEW-001",
  read: false,
  created_at: Timestamp
}
```

## Economic Flow at Scale

### Single Ambassador
```
$300 sale
├─ 10% → Ambassador ($30)
├─ 5%  → Senior ($15)
└─ 5%  → RD ($15)
Total: $60 distributed (20%)
```

### Senior with 10 Ambassadors
```
10 ambassadors × $3,000/month sales = $30,000
├─ Personal: $3,000 × 10% = $300
└─ Team Override: $30,000 × 5% = $1,500
Total: $1,800/month

With full team (10 active):
├─ Personal: $30,000 × 10% = $3,000
└─ Team Override: $300,000 × 5% = $15,000
Total: $18,000/month (designed outcome)
```

### RD with 500 Ambassadors
```
500 ambassadors × $3,000/month = $1,500,000
├─ Network Override: $1,500,000 × 5% = $75,000/month
└─ Annual: $900,000/year

Conservative (300 active):
300 × $3,000 × 5% = $45,000/month ($540K/year)

Target (500 active):
500 × $3,000 × 5% = $75,000/month ($900K/year)
```

---

**System Status:** ✅ COMPLETE & READY FOR DEPLOYMENT
**Documentation:** SENIOR_AMBASSADOR_SYSTEM_COMPLETE.md
**Deployment:** ./deploy-senior-system.sh
