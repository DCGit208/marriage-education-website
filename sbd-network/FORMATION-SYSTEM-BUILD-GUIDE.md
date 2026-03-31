# 🏗️ SBD NETWORK FORMATION SYSTEM — BUILD GUIDE

**Version:** 1.0  
**Date:** March 30, 2026  
**Type:** System Transformation (NOT Rebuild)

---

## 📋 EXECUTIVE SUMMARY

Transform existing SBD Network PWA from "content platform" into "structured formation system" WITHOUT breaking current functionality.

**Current State:**
- ✅ Boards, posts, comments working
- ✅ Media uploads functional
- ✅ User authentication active
- ✅ Groups/communities established

**Target State:**
- ✅ All above preserved
- ✨ Schools layer added
- ✨ Courses with progression
- ✨ Access control tiers
- ✨ Paywall system
- ✨ Dashboard-driven UX

---

## 🎯 CORE PHILOSOPHY

### Formation Hierarchy (Enforced)
```
IDENTITY (Teleios) 
    ↓ Required First
LITERACY (Sexual Literacy)
    ↓ Must Complete
EXPRESSION (Muliebrity/Virility)
    ↓ Unlocked Last
```

### User Journey Map
```
Entry → Schools → Current Course → Active Module → Linked Board → Practice → Progress
```

---

## 📊 DATABASE ARCHITECTURE

### New Collections (Add, Don't Replace)

#### 1. `schools` Collection
```javascript
{
  id: "teleios",
  name: "Teleios School",
  slug: "teleios",
  description: "Foundation of identity, wholeness, and maturity",
  order: 1,
  icon: "🧠",
  requiredForAccess: null, // no prerequisites
  unlockRequirements: {
    completedSchools: [],
    completedCourses: []
  }
}

{
  id: "sexual-literacy",
  name: "Sexual Literacy School",
  slug: "sexual-literacy",
  order: 2,
  requiredForAccess: "teleios", // must start Teleios first
  unlockRequirements: {
    completedSchools: [],
    completedCourses: []
  }
}

{
  id: "muliebrity",
  name: "Muliebrity School",
  slug: "muliebrity",
  order: 3,
  requiredForAccess: "sexual-literacy",
  unlockRequirements: {
    completedSchools: ["teleios"],
    completeCourses: ["sexual-literacy-core"]
  }
}

{
  id: "virility",
  name: "Virility School",
  slug: "virility",
  order: 4,
  requiredForAccess: "sexual-literacy",
  unlockRequirements: {
    completedSchools: ["teleios"],
    completedCourses: ["sexual-literacy-core"]
  }
}
```

#### 2. `courses` Collection
```javascript
{
  id: "teleios-foundation",
  schoolId: "teleios",
  title: "Teleios Foundation Course",
  description: "12-week journey to wholeness",
  order: 1,
  accessLevel: "foundation", // foundation, premium, elite
  isPremium: false,
  isElite: false,
  moduleCount: 12,
  estimatedWeeks: 12
}
```

#### 3. `modules` Collection
```javascript
{
  id: "teleios-week-1",
  courseId: "teleios-foundation",
  title: "Week 1: Understanding Identity",
  description: "Who are you designed to be?",
  order: 1,
  linkedBoardId: "board-teleios-1", // EXISTING board ID
  isLocked: false,
  unlockRequirements: {
    previousModuleId: null // first module
  },
  assignment: {
    title: "Reflect on Identity",
    description: "Write 3 paragraphs about your current identity",
    submissionRequired: false,
    submissionType: "text" // or "post"
  }
}
```

#### 4. Update `boards` Collection (Extend, Don't Replace)
```javascript
// ADD these fields to existing boards
{
  id: "existing-board-id",
  title: "Existing Board Title",
  // ... all existing fields preserved ...
  
  // NEW FIELDS:
  schoolId: "muliebrity",
  courseId: "muliebrity-expression",
  moduleId: "muliebrity-week-3",
  accessLevel: "elite", // free, foundation, premium, elite
  isLinkedToModule: true
}
```

#### 5. Update `users` Collection (Extend)
```javascript
{
  uid: "user-id",
  // ... all existing fields preserved ...
  
  // NEW FIELDS:
  subscription: {
    tier: "premium", // free, foundation, premium, elite
    startDate: timestamp,
    endDate: timestamp,
    status: "active" // active, cancelled, expired
  },
  
  progress: {
    currentSchoolId: "teleios",
    currentCourseId: "teleios-foundation",
    currentModuleId: "teleios-week-3",
    completedModules: ["teleios-week-1", "teleios-week-2"],
    completedCourses: [],
    completedSchools: [],
    streak: 15,
    lastActivityDate: timestamp,
    progressPercent: {
      "teleios-foundation": 25,
      "sexual-literacy-core": 0
    }
  }
}
```

#### 6. `submissions` Collection (New)
```javascript
{
  id: "submission-id",
  userId: "user-id",
  moduleId: "teleios-week-1",
  courseId: "teleios-foundation",
  type: "text", // or "post"
  content: "User's reflection text",
  postId: "post-id", // if type = "post"
  submittedAt: timestamp,
  status: "submitted" // submitted, reviewed
}
```

---

## 🔐 ACCESS CONTROL MATRIX

### Tier Definitions

| Tier | Price | Access |
|------|-------|--------|
| **Free** | $0 | Teleios preview (3 modules), Sample boards only |
| **Foundation** | $9/mo | Partial Teleios (6 modules), Partial Sexual Literacy |
| **Premium** | $20/mo | Full Teleios, Full Sexual Literacy, Core boards |
| **Elite** | $50/mo | Everything + Muliebrity + Virility + Advanced boards |

### Access Logic Function
```javascript
function canAccessBoard(userId, boardId) {
  const user = getUser(userId);
  const board = getBoard(boardId);
  
  // Free boards accessible to all
  if (board.accessLevel === 'free') return true;
  
  // Check subscription tier
  const userTier = user.subscription?.tier || 'free';
  const tierHierarchy = ['free', 'foundation', 'premium', 'elite'];
  const userTierIndex = tierHierarchy.indexOf(userTier);
  const boardTierIndex = tierHierarchy.indexOf(board.accessLevel);
  
  // User tier must be >= board tier
  if (userTierIndex >= boardTierIndex) {
    // Check progression requirements
    if (board.moduleId) {
      const module = getModule(board.moduleId);
      return canAccessModule(userId, module.id);
    }
    return true;
  }
  
  return false;
}

function canAccessModule(userId, moduleId) {
  const user = getUser(userId);
  const module = getModule(moduleId);
  
  // First module in course - check course access
  if (!module.unlockRequirements.previousModuleId) {
    return canAccessCourse(userId, module.courseId);
  }
  
  // Must complete previous module
  const prevCompleted = user.progress.completedModules.includes(
    module.unlockRequirements.previousModuleId
  );
  
  return prevCompleted;
}

function canAccessCourse(userId, courseId) {
  const user = getUser(userId);
  const course = getCourse(courseId);
  const school = getSchool(course.schoolId);
  
  // Check school prerequisites
  if (school.unlockRequirements.completedSchools.length > 0) {
    const hasCompleted = school.unlockRequirements.completedSchools.every(
      schoolId => user.progress.completedSchools.includes(schoolId)
    );
    if (!hasCompleted) return false;
  }
  
  // Check course prerequisites
  if (school.unlockRequirements.completedCourses.length > 0) {
    const hasCompleted = school.unlockRequirements.completedCourses.every(
      courseId => user.progress.completedCourses.includes(courseId)
    );
    if (!hasCompleted) return false;
  }
  
  return true;
}
```

---

## 🎨 UI TRANSFORMATION PLAN

### 1. Schools Page (`/schools.html`)

**Current:** Simple list of schools  
**New:** Journey roadmap with locked stages

```html
<!-- SECTION 1: Start Your Formation -->
<section class="formation-stage stage-foundation">
  <h2>Start Your Formation</h2>
  <div class="school-card primary">
    <div class="school-icon">🧠</div>
    <h3>Teleios — Become Whole</h3>
    <p>Foundation of identity, wholeness, and maturity</p>
    <button class="cta-primary">Start Here</button>
  </div>
</section>

<!-- SECTION 2: Build Literacy -->
<section class="formation-stage stage-literacy" data-requires="teleios-started">
  <h2>Build Design Literacy</h2>
  <div class="school-card secondary">
    <div class="school-icon">📚</div>
    <h3>Sexual Literacy — Master Design</h3>
    <p>Understand sexuality as covenant, not culture</p>
    <button class="cta-secondary">Begin Course</button>
    <!-- Or if locked: -->
    <div class="lock-overlay">
      <span class="lock-icon">🔒</span>
      <span>Start Teleios first</span>
    </div>
  </div>
</section>

<!-- SECTION 3: Step Into Expression -->
<section class="formation-stage stage-expression" data-requires="literacy-completed">
  <h2>Step Into Expression</h2>
  <div class="school-grid">
    <div class="school-card tertiary locked">
      <div class="school-icon">👑</div>
      <h3>Muliebrity — Feminine Excellence</h3>
      <div class="lock-overlay">
        <span class="lock-icon">🔒</span>
        <span>Complete foundation to unlock</span>
      </div>
    </div>
    <div class="school-card tertiary locked">
      <div class="school-icon">⚔️</div>
      <h3>Virility — Masculine Authority</h3>
      <div class="lock-overlay">
        <span class="lock-icon">🔒</span>
        <span>Complete foundation to unlock</span>
      </div>
    </div>
  </div>
</section>
```

### 2. Courses Page (`/courses.html`) → Dashboard

**Rename to:** "My Learning" or keep as "Courses" but redesign

```html
<!-- CONTINUE LEARNING -->
<section class="dashboard-continue">
  <h2>Continue Learning</h2>
  <div class="current-module-card">
    <div class="module-meta">
      <span class="course-name">Teleios Foundation</span>
      <span class="module-name">Week 3: Authority & Responsibility</span>
    </div>
    <button class="btn-continue">Continue →</button>
    <div class="progress-bar">
      <div class="progress-fill" style="width: 25%"></div>
    </div>
  </div>
</section>

<!-- ACTIVE COURSES -->
<section class="dashboard-active">
  <h2>Active Courses</h2>
  <div class="course-list">
    <div class="course-card">
      <h3>Teleios Foundation</h3>
      <div class="progress-circle" data-progress="25">
        <span>25%</span>
      </div>
      <p>3 of 12 modules complete</p>
    </div>
    <div class="course-card">
      <h3>Sexual Literacy</h3>
      <div class="progress-circle" data-progress="0">
        <span>0%</span>
      </div>
      <p>Not started</p>
    </div>
  </div>
</section>

<!-- LOCKED COURSES -->
<section class="dashboard-locked">
  <h2>Upcoming Courses</h2>
  <div class="course-list locked">
    <div class="course-card locked">
      <h3>Muliebrity Expression</h3>
      <div class="lock-icon">🔒</div>
      <p>Complete foundation to unlock</p>
    </div>
  </div>
</section>
```

### 3. Shop Page (`/shop.html`)

**Transform from:** Random shop  
**Into:** Ownership library organized by purpose

```html
<!-- HERO MESSAGE -->
<section class="shop-hero">
  <h1>Own Your Formation</h1>
  <p>Learn through subscription. Own through purchase.</p>
</section>

<!-- BOOKS SECTION -->
<section class="shop-section">
  <h2>Books</h2>
  <div class="product-grid">
    <div class="product-card">
      <img src="/assets/sbd-dummies.jpg" alt="Sex By Design for Dummies">
      <h3>Sex By Design for Dummies</h3>
      <p class="price">$27</p>
      <button class="btn-buy">Buy Now</button>
    </div>
    <div class="product-card">
      <img src="/assets/teleios-blueprint.jpg" alt="Teleios Blueprint">
      <h3>Teleios Blueprint</h3>
      <p class="price">$247</p>
      <button class="btn-buy">Buy Now</button>
    </div>
  </div>
</section>

<!-- BUNDLES SECTION -->
<section class="shop-section">
  <h2>Formation Bundles</h2>
  <div class="product-grid">
    <div class="product-card bundle">
      <h3>Starter Bundle</h3>
      <ul>
        <li>SBD for Dummies (Book)</li>
        <li>1 Month Premium Access</li>
      </ul>
      <p class="price"><s>$47</s> $39</p>
      <button class="btn-buy">Buy Bundle</button>
    </div>
  </div>
</section>
```

### 4. Navigation Update

**Bottom Nav (Mobile):**
```html
<nav class="bottom-nav">
  <a href="/dashboard.html" class="nav-item">
    <span class="icon">🏠</span>
    <span class="label">Home</span>
  </a>
  <a href="/courses.html" class="nav-item">
    <span class="icon">📚</span>
    <span class="label">Learn</span>
  </a>
  <a href="/boards.html" class="nav-item">
    <span class="icon">💬</span>
    <span class="label">Boards</span>
  </a>
  <a href="/shop.html" class="nav-item">
    <span class="icon">🛍️</span>
    <span class="label">Shop</span>
  </a>
  <a href="/profile.html" class="nav-item">
    <span class="icon">👤</span>
    <span class="label">Profile</span>
  </a>
</nav>
```

---

## 💰 PAYWALL SYSTEM

### Trigger Points
1. User clicks locked module
2. User tries to access premium/elite board
3. User tries to access locked school

### Modal Implementation
```javascript
function showPaywall(requiredTier, context) {
  const modal = document.getElementById('paywallModal');
  
  // Set context message
  const messages = {
    foundation: "Unlock Teleios and begin your formation journey",
    premium: "Access full Teleios and Sexual Literacy courses",
    elite: "Unlock Muliebrity and Virility advanced schools"
  };
  
  modal.querySelector('.paywall-message').textContent = messages[requiredTier];
  
  // Show pricing options
  const tiers = {
    foundation: { price: 9, label: "Foundation" },
    premium: { price: 20, label: "Premium" },
    elite: { price: 50, label: "Elite" }
  };
  
  // Render options (highlight required tier and above)
  // ...
  
  modal.classList.add('active');
}
```

---

## 🔄 IMPLEMENTATION PHASES

### Phase 1: Database Setup (Week 1)
- [ ] Create `schools` collection with 4 schools
- [ ] Create `courses` collection for each school
- [ ] Create `modules` collection mapping to boards
- [ ] Update existing boards with new fields (schoolId, courseId, moduleId, accessLevel)
- [ ] Extend user schema with progress and subscription
- [ ] Preserve "Advanced Muliebrity School" board (map to elite tier)

### Phase 2: Access Control (Week 1)
- [ ] Implement `canAccessBoard()` function
- [ ] Implement `canAccessModule()` function
- [ ] Implement `canAccessCourse()` function
- [ ] Add access checks to board loading
- [ ] Add paywall triggers

### Phase 3: UI Transformation (Week 2)
- [ ] Rebuild schools.html as journey map
- [ ] Transform courses.html into dashboard
- [ ] Reorganize shop.html by purpose
- [ ] Update navigation (bottom nav)
- [ ] Add lock/unlock visual states

### Phase 4: Progression System (Week 2)
- [ ] Module completion logic
- [ ] Progress tracking
- [ ] Streak system
- [ ] "Continue Learning" auto-detection
- [ ] Course/school completion

### Phase 5: Paywall & Monetization (Week 3)
- [ ] Paywall modal component
- [ ] Subscription tier management
- [ ] Stripe/payment integration
- [ ] Admin subscription controls

### Phase 6: Testing & Polish (Week 3)
- [ ] Test all access paths
- [ ] Verify existing boards still work
- [ ] Test progression flow end-to-end
- [ ] Mobile responsiveness check
- [ ] Performance optimization

---

## 🚨 CRITICAL PRESERVATION CHECKLIST

**MUST NOT BREAK:**
- ✅ Existing boards load and display
- ✅ Posts can be created/edited/deleted
- ✅ Media uploads work (images/videos)
- ✅ Comments system functional
- ✅ Reactions work
- ✅ User authentication intact
- ✅ "Advanced Muliebrity School" board accessible (to elite tier)

**MIGRATION STRATEGY:**
- Boards without schoolId/courseId → accessible to all (backward compatibility)
- Users without progress object → treat as new users (free tier)
- Existing premium users → upgrade to new tier system gracefully

---

## 📝 FIREBASE RULES UPDATE

```javascript
// Add to firestore.rules
match /schools/{schoolId} {
  allow read: if true; // everyone can see schools
  allow write: if hasRole('admin');
}

match /courses/{courseId} {
  allow read: if true;
  allow write: if hasRole('admin');
}

match /modules/{moduleId} {
  allow read: if true;
  allow write: if hasRole('admin');
}

match /boards/{boardId} {
  allow read: if canAccessBoard(request.auth.uid, boardId);
  allow write: if hasRole('admin') || 
                  (resource.data.members.hasAny([request.auth.uid]));
}

match /submissions/{submissionId} {
  allow read: if request.auth.uid == resource.data.userId ||
                 hasRole('admin');
  allow create: if request.auth.uid == request.resource.data.userId;
}
```

---

## 🎯 SUCCESS METRICS

**Technical:**
- Zero existing features broken
- < 3 second page load times
- Mobile-first UI working
- All access control enforced

**Product:**
- Clear progression path visible
- Locked schools create desire
- Paywall conversion rate tracked
- User completion rates monitored

---

## 📞 SUPPORT & MAINTENANCE

**Post-Launch:**
- Monitor error logs for access issues
- Track paywall trigger → conversion rate
- Watch for progression blockers
- Gather user feedback on flow

**Iteration Priorities:**
1. Fix access control bugs
2. Optimize progression UX
3. Enhance dashboard insights
4. Add social proof (others' progress)

---

**END OF BUILD GUIDE**

*This is a living document. Update as system evolves.*
