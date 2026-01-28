# SYSTEM CONTEXT - PERMANENT MEMORY

**DATE CREATED:** January 28, 2026
**CRITICAL:** Read this file BEFORE making any changes to the system!

---

## 🚨 CRITICAL FACTS - DO NOT FORGET

### 1. LEARNING MANAGEMENT SYSTEM (LMS)
- **FILE:** `course-viewer.html` (1281 lines)
- **PURPOSE:** Delivers ALL courses and training for Marriage Education Group
- **SCOPE:** All training programs, courses, Foundation School, etc.
- **RULE:** When ambassadors click on courses/lessons, they MUST be directed to `course-viewer.html` with appropriate parameters
- **NEVER:** Build new course delivery pages - USE THE EXISTING LMS!

### 2. FOUNDATION SCHOOL FOR AMBASSADORS
- **NATURE:** FREE training for ALL ambassadors (not a paid product)
- **PURPOSE:** 6-week integrated dual-track program → CRLA Certification
- **STRUCTURE:** Each week combines BOTH:
  - **📚 Teleios Blueprint Content** (WHAT marriage literacy is)
  - **🎯 Advocacy Training** (HOW to deploy it)
- **DURATION:** 6 weeks, integrated weekly lessons
- **ACCESS:** Automatic for all ambassadors (no enrollment payment required)
- **DELIVERY:** Through course-viewer.html LMS (course IDs: `teleios-blueprint` + integrated advocacy training)
- **DASHBOARD VISIBILITY:** Foundation School section should ALWAYS be visible on ambassador dashboard
- **CURRICULUM SOURCE:** Defined in ambassador-register.html lines 2160-2250

### 3. PRODUCT CATALOG (32 Products)
The "Foundation School" in the product catalog (1.2M FCFA) is:
- A PAID product for CUSTOMERS (non-ambassadors)
- Different from the FREE Foundation School training for ambassadors
- Ambassadors get free access; customers pay

---

## 📊 CURRENT SYSTEM STATE

### Multi-Product Ambassador System
**STATUS:** Deployed and operational

**COMPONENTS:**
1. ✅ 32 products in Firestore (6 categories: books, schools, courses, premium, corporate, community)
2. ✅ processProductDeployment Cloud Function (deployed, us-central1)
3. ✅ Commission system: 10% direct + 5% senior + 5% RD = 20% total
4. ✅ Stripe payment integration with commission processing
5. ✅ Category tracking: deployment_by_category, revenue_by_category
6. ✅ Monthly earnings: monthly_earnings.{YYYY-MM}.{category}
7. ✅ Monthly target: 1,800,000 FCFA ($3,000 USD) per ambassador

### Ambassador Dashboard
**FILE:** `ambassador/dashboard.html` (1795 lines)
**STATUS:** Merged - includes ALL original features + new multi-product tracking

**FEATURES:**
- ✅ Foundation School/CRLA progress section (always visible, FREE training)
- ✅ Weekly contest banner with countdown
- ✅ Monthly target tracker ($3K/1.8M FCFA)
- ✅ Multi-product portfolio table (6 categories)
- ✅ Milestone tracker (Bronze/Silver/Gold/Senior)
- ✅ Tiered commission visualization
- ✅ Recent deployments feed
- ✅ Leaderboard preview
- ✅ Real-time notifications system
- ✅ Social sharing buttons
- ✅ Badge unlock modals with confetti
- ✅ Logout button

**CRITICAL INTEGRATIONS:**
- Foundation School "Continue Learning" → `../course-viewer.html?course=foundation-school`
- Foundation School "View All Courses" → `foundation-school.html` (course list)
- Each lesson → `../course-viewer.html?course=foundation-school&week={X}&lesson={Y}`

### Foundation School Course List
**FILE:** `ambassador/foundation-school.html`
**PURPOSE:** Shows 6-week curriculum with lesson list
**BEHAVIOR:** 
- Auto-enrolls all ambassadors (free access)
- Tracks progress in Firestore: `ambassadors/{code}/school_enrollment/foundation_school`
- Lesson clicks → Opens LMS (course-viewer.html)

---

## 🔗 SYSTEM INTEGRATIONS

### Payment Flow
1. Customer clicks ambassador link: `?ref=AMB-XXX-XXX`
2. Payment page stores ref in sessionStorage
3. Stripe checkout processes payment
4. return.html calls commission-processor.js
5. processProductDeployment Cloud Function credits commission
6. Updates all tracking fields (category, monthly, revenue)

### Real Ambassador Data
- **AMB-EVEL-6730:** 1 purchase (SBD book, 1,500 FCFA) - manually credited
- **AMB-X-001:** Test ambassador (2 purchases, 121,500 FCFA total)

---

## 🎯 WHAT WE'RE BUILDING

### PRIMARY GOAL
Multi-product portfolio system for ambassadors to track:
- Sales across 6 categories
- Path to $3K/month target
- Commission earnings by category
- Monthly progress aggregation

### WHAT'S COMPLETE
1. ✅ Product catalog deployed (32 products)
2. ✅ Commission engine working
3. ✅ Dashboard merged (all features preserved + new tracking)
4. ✅ Foundation School integrated with LMS
5. ✅ Stripe payment auto-processing
6. ✅ Category segregation working

### WHAT'S PENDING
1. 🔄 Test merged dashboard with real ambassador login
2. 🔄 Senior Ambassador dashboard (same features + team overview)
3. 🔄 MoMo payment commission integration
4. 🔄 Regional Director dashboard

---

## 🚫 WHAT NOT TO DO

1. ❌ DO NOT build new course delivery pages
2. ❌ DO NOT make Foundation School paid for ambassadors
3. ❌ DO NOT remove existing dashboard features
4. ❌ DO NOT forget about the LMS (course-viewer.html)
5. ❌ DO NOT replace complex UI without full feature audit
6. ❌ DO NOT assume new pages are needed - check existing files first

---

## ✅ RULES FOR MODIFICATIONS

1. **Before building ANYTHING course-related:** Check if course-viewer.html LMS can handle it
2. **Before modifying dashboard:** Read full file (1795 lines), don't just read first 100 lines
3. **Before adding ambassador features:** Confirm Foundation School is FREE and visible
4. **Before creating new files:** Search for existing files that might already exist
5. **When user says "I have an LMS":** They mean course-viewer.html - link to it!

---

## 📁 KEY FILES REFERENCE

| File | Purpose | Critical Notes |
|------|---------|---------------|
| `course-viewer.html` | LMS - delivers all courses | USE THIS for all training delivery |
| `ambassador/dashboard.html` | Ambassador main dashboard | 1795 lines, merged with all features |
| `ambassador/foundation-school.html` | Course list for Foundation School | Shows 6 weeks, 36 lessons |
| `functions/index.js` | Cloud Functions | processProductDeployment at line 2951+ |
| `create-products-catalog.js` | Product deployment script | 32 products across 6 categories |
| `commission-processor.js` | Stripe commission handler | Called from return.html |

---

## 🔥 USER FRUSTRATIONS TO AVOID

1. **"You keep forgetting I have an LMS"** - Always check for course-viewer.html first
2. **"Foundation School is for ambassadors"** - It's FREE training, not a paid product for them
3. **"You cut off important features"** - Never replace UI, only add to existing
4. **"You're building on nothing"** - Check existing systems before creating new ones

---

**LAST UPDATED:** January 28, 2026
**BY:** GitHub Copilot
**REASON:** User frustration with forgetting LMS system and Foundation School nature
