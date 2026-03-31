# PHASE 1: LEARNING CORE - Complete Access Control & Course System

**Duration:** 60 hours  
**Objective:** Build school-based learning system with strict tier-based access control  
**Master Prompt Compliance:** 100% (incorporates all learning system requirements)

---

## 🎯 PHASE 1 SCOPE (CRITICAL)

### What Phase 1 DOES:
✅ Build Learn page (4 schools grid)  
✅ Build Course detail pages (curriculum + enrollment)  
✅ Build Lesson viewer (video + content + boards)  
✅ Implement access control logic (READ user tier, enforce locks)  
✅ Show upgrade prompts when locked  
✅ Track progress (completedModules, currentCourse)  
✅ Connect board-lesson navigation  

### What Phase 1 DOES NOT DO (Phase 2):
❌ Subscription payment processing (Stripe Checkout)  
❌ Webhook handlers for subscription events  
❌ Subscription management UI (/subscription.html)  
❌ Tier upgrade/downgrade payment flows  

**Testing Strategy:** Manually set user tiers in Firestore to test all access levels

---

## 📋 MASTER PROMPT REQUIREMENTS (STRICT COMPLIANCE)

### 1. TIER ACCESS CONTROL (LOCK THIS LOGIC)

```javascript
// FREE TIER ACCESS:
{
  learning: {
    'foundation-school': 'FULL',           // 6 weeks FULL ACCESS
    'sex-by-design-for-dummies': 'WEEK_1', // Week 1 ONLY
    'the-teleios-blueprint-full-human-maturity': 'WEEK_1' // Week 1 ONLY
  },
  boards: ['public-boards'], // Read-only or limited
  features: {
    certificates: false,
    downloads: false,
    advancedBoards: false
  }
}

// FOUNDATION TIER ($9/month) - PARTIAL ACCESS MODEL
{
  learning: {
    'foundation-school': 'FULL',           // FULL + Certificate
    'sex-by-design-for-dummies': 'WEEKS_1_3', // Weeks 1-3 ONLY (Weeks 4-13 LOCKED)
    'the-teleios-blueprint-full-human-maturity': 'WEEKS_1_2' // Weeks 1-2 ONLY (Weeks 3-6 LOCKED)
  },
  boards: ['foundation-board', 'teleios-board'],
  features: {
    certificates: true, // Foundation School only
    downloads: true,
    advancedBoards: false // MV House boards LOCKED
  }
}

// PREMIUM TIER ($20/month) - FULL LEARNING ACCESS
{
  learning: {
    ALL_SCHOOLS: 'FULL',  // All 4 schools FULL ACCESS
    ALL_COURSES: 'FULL'   // All 44 courses FULL ACCESS
  },
  boards: ['all-standard-boards', 'course-linked-boards'],
  features: {
    certificates: true, // All certificates
    downloads: true,
    advancedBoards: false // Still LOCKED (Elite only)
  }
}

// ELITE TIER ($50/month) - EVERYTHING + MV HOUSE
{
  learning: {
    ALL_SCHOOLS: 'FULL',
    ALL_COURSES: 'FULL'
  },
  boards: [
    'all-standard-boards',
    'advanced-muliebrity-boards', // Corporate, Casual, Night, Official
    'advanced-virility-boards'
  ],
  features: {
    certificates: true,
    downloads: true,
    advancedBoards: true,
    mvHouse: true // Full MV House access
  }
}
```

### 2. LEARN TAB STRUCTURE (SCHOOL-BASED, NOT TIER-BASED)

**Master Prompt Requirement:**
> "LEARN = SCHOOL-BASED (NOT TIER-BASED)"

Display ALL 4 schools to everyone:
- 🏛️ Teleios School
- 🔥 Sexual Literacy School
- 💍 Marriage Systems School
- 🏛️ Civilization Leadership School

**Access Logic:**
```
User clicks course → system checks tier → IF allowed: open | ELSE: 🔒 Upgrade prompt
```

### 3. COURSE LOCK LOGIC (VERY IMPORTANT)

**Master Prompt Requirement:**
> "Each course must:
> - Show FULL curriculum
> - Allow PARTIAL access (based on tier)
> - Lock deeper modules"

**Example - SBD for Dummies:**
```
FREE tier:
  Week 1 → ✅ Open
  Week 2-13 → 🔒 "Upgrade to Foundation to continue"

FOUNDATION tier:
  Week 1 → ✅ Open
  Week 2 → ✅ Open
  Week 3 → ✅ Open
  Week 4-13 → 🔒 "Upgrade to Premium for full access"

PREMIUM tier:
  Week 1-13 → ✅ All Open
```

### 4. PSYCHOLOGICAL STATE (ANTI-CHURN DESIGN)

**Master Prompt Requirement:**
> "User must feel:
> ✔ 'This is valuable'
> ✔ 'I am growing'
> ✔ 'There is more I don't have'"

**Implementation:**
- Progress bars visible everywhere
- Streak tracking in header
- Lock icons with aspirational copy ("Unlock your next level")
- Celebration animations on module completion
- "Continue Learning" prominent placement

---

## 🗂️ TASK BREAKDOWN

### TASK 1.1: Build Schools Page (`/schools.html` → `/learn.html`) (8 hours)

**Current State:** `/schools.html` exists, loads 4 schools from Firestore  
**Target State:** Transform into full learning hub with tier-aware course access

#### Implementation:

**File:** `/sbd-network/public/learn.html` (rename from schools.html)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Learn - SBD Network</title>
  <link rel="stylesheet" href="/css/global.css">
  <link rel="stylesheet" href="/css/learn.css">
</head>
<body>
  <!-- Header with Progress -->
  <header class="learn-header">
    <div class="user-progress">
      <div class="streak">
        <span class="streak-icon">🔥</span>
        <span id="userStreak">0</span> day streak
      </div>
      <div class="tier-badge" id="tierBadge">Free</div>
    </div>
    <h1>Your Formation Journey</h1>
    <p id="progressSummary">0 courses active, 0% complete</p>
  </header>

  <!-- Continue Learning Section -->
  <section class="continue-learning" id="continueSection" style="display:none;">
    <h2>Continue Learning</h2>
    <div class="current-module-card" id="currentModuleCard">
      <div class="module-info">
        <span class="course-name" id="currentCourseName"></span>
        <span class="module-name" id="currentModuleName"></span>
      </div>
      <button class="btn-continue" onclick="continueModule()">Continue →</button>
      <div class="progress-bar">
        <div class="progress-fill" id="currentProgress"></div>
      </div>
    </div>
  </section>

  <!-- Schools Grid -->
  <section class="schools-section">
    <h2>Formation Schools</h2>
    <p class="section-subtitle">Four pillars of covenant maturity</p>
    
    <div class="schools-grid" id="schoolsGrid">
      <!-- Schools loaded dynamically from Firestore -->
    </div>
  </section>

  <!-- Bottom Navigation -->
  <nav class="bottom-nav">
    <a href="/index.html">🏠 Home</a>
    <a href="/learn.html" class="active">📚 Learn</a>
    <a href="/boards.html">📋 Boards</a>
    <a href="/mv-house.html">👗 MV House</a>
    <a href="/shop.html">🛒 Shop</a>
    <a href="/profile.html">👤 Profile</a>
  </nav>

  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
  <script src="/js/firebase-config.js"></script>
  <script src="/js/tier-access.js"></script>
  <script src="/js/learn.js"></script>
</body>
</html>
```

**File:** `/sbd-network/public/js/learn.js`

```javascript
let learnCurrentUser = null;
let userTier = 'free';
let userProgress = {};

// Initialize
firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    learnCurrentUser = user;
    await loadUserData();
    await loadSchools();
    await loadContinueLearning();
  } else {
    window.location.href = '/login.html';
  }
});

async function loadUserData() {
  try {
    const userDoc = await firebase.firestore()
      .collection('users')
      .doc(learnCurrentUser.uid)
      .get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      userTier = userData.tier || 'free';
      userProgress = userData.progress || {};
      
      // Update UI
      updateTierBadge(userTier);
      updateProgressSummary(userData);
      updateStreak(userData.streak || 0);
    }
  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

function updateTierBadge(tier) {
  const badge = document.getElementById('tierBadge');
  const tierMap = {
    free: { text: 'Free', color: '#6c757d' },
    foundation: { text: 'Foundation', color: '#ffc107' },
    premium: { text: 'Premium', color: '#007bff' },
    elite: { text: 'Elite', color: '#dc3545' }
  };
  
  const tierInfo = tierMap[tier] || tierMap.free;
  badge.textContent = tierInfo.text;
  badge.style.background = tierInfo.color;
}

function updateProgressSummary(userData) {
  const enrolledCourses = userData.enrolledCourses || [];
  const completedModules = Object.keys(userData.progress || {}).length;
  const totalModules = enrolledCourses.length * 6; // Average 6 modules per course
  const percentComplete = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0;
  
  document.getElementById('progressSummary').textContent = 
    `${enrolledCourses.length} courses active, ${percentComplete}% complete`;
}

function updateStreak(streak) {
  document.getElementById('userStreak').textContent = streak;
}

async function loadContinueLearning() {
  try {
    // Find last accessed module
    const userDoc = await firebase.firestore()
      .collection('users')
      .doc(learnCurrentUser.uid)
      .get();
    
    const lastModuleId = userDoc.data()?.lastAccessedModule;
    
    if (lastModuleId) {
      const moduleDoc = await firebase.firestore()
        .collection('modules')
        .doc(lastModuleId)
        .get();
      
      if (moduleDoc.exists) {
        const module = moduleDoc.data();
        const courseDoc = await firebase.firestore()
          .collection('courses')
          .doc(module.courseId)
          .get();
        
        const course = courseDoc.data();
        
        // Show continue section
        document.getElementById('continueSection').style.display = 'block';
        document.getElementById('currentCourseName').textContent = course.title;
        document.getElementById('currentModuleName').textContent = module.title;
        
        // Calculate progress
        const progress = userProgress[module.courseId] || 0;
        document.getElementById('currentProgress').style.width = progress + '%';
        
        // Store for continue button
        window.continueModuleId = lastModuleId;
      }
    }
  } catch (error) {
    console.error('Error loading continue learning:', error);
  }
}

function continueModule() {
  if (window.continueModuleId) {
    window.location.href = `/lesson.html?moduleId=${window.continueModuleId}`;
  }
}

async function loadSchools() {
  try {
    const schoolsSnapshot = await firebase.firestore()
      .collection('schools')
      .orderBy('order', 'asc')
      .get();
    
    const schoolsGrid = document.getElementById('schoolsGrid');
    schoolsGrid.innerHTML = '';
    
    for (const doc of schoolsSnapshot.docs) {
      const school = doc.data();
      const schoolCard = await createSchoolCard(school);
      schoolsGrid.appendChild(schoolCard);
    }
  } catch (error) {
    console.error('Error loading schools:', error);
  }
}

async function createSchoolCard(school) {
  const card = document.createElement('div');
  card.className = 'school-card';
  
  // Check if user has access to this school
  const hasAccess = checkSchoolAccess(school.id, userTier);
  
  // Get courses for this school
  const coursesSnapshot = await firebase.firestore()
    .collection('courses')
    .where('schoolId', '==', school.id)
    .get();
  
  const courseCount = coursesSnapshot.size;
  
  card.innerHTML = `
    <div class="school-header">
      <div class="school-icon">${school.icon || '🏛️'}</div>
      <div class="school-info">
        <h3>${school.name}</h3>
        <p class="school-desc">${school.description}</p>
      </div>
    </div>
    
    <div class="school-meta">
      <span class="course-count">${courseCount} courses</span>
      <span class="school-value">$${school.portfolioValue.toLocaleString()} value</span>
    </div>
    
    ${!hasAccess ? `
      <div class="lock-badge">
        🔒 ${school.unlockTier === 'foundation' ? 'Foundation' : 
             school.unlockTier === 'premium' ? 'Premium' : 
             school.unlockTier === 'elite' ? 'Elite' : 'Premium'} Required
      </div>
    ` : ''}
    
    <button class="btn-explore" onclick="exploreSchool('${school.id}')">
      ${hasAccess ? 'Explore Courses' : 'View Curriculum'}
    </button>
  `;
  
  if (!hasAccess) {
    card.classList.add('locked');
  }
  
  return card;
}

function checkSchoolAccess(schoolId, tier) {
  const tierHierarchy = { free: 0, foundation: 1, premium: 2, elite: 3 };
  
  // Get school unlock requirement from database (school.unlockTier)
  // For now, use mapping:
  const schoolAccessMap = {
    'school-1-teleios': 'free',        // Foundation School - always accessible
    'school-2-sexual-literacy': 'foundation', // Requires Foundation+
    'school-3-marriage-systems': 'premium',   // Requires Premium+
    'school-4-civilization-leadership': 'premium' // Requires Premium+
  };
  
  const requiredTier = schoolAccessMap[schoolId] || 'premium';
  return tierHierarchy[tier] >= tierHierarchy[requiredTier];
}

function exploreSchool(schoolId) {
  window.location.href = `/school.html?id=${schoolId}`;
}
```

**File:** `/sbd-network/public/css/learn.css`

```css
/* Learn Page Styles */
.learn-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem 1.5rem;
  text-align: center;
}

.user-progress {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.streak {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.streak-icon {
  font-size: 1.2rem;
}

.tier-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.learn-header h1 {
  font-size: 1.75rem;
  margin: 0.5rem 0;
}

#progressSummary {
  font-size: 0.9rem;
  opacity: 0.9;
}

/* Continue Learning Section */
.continue-learning {
  padding: 1.5rem;
  background: white;
}

.continue-learning h2 {
  font-size: 1.1rem;
  margin-bottom: 1rem;
  color: #333;
}

.current-module-card {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
  padding: 1.5rem;
  border-radius: 12px;
  position: relative;
  cursor: pointer;
}

.module-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.course-name {
  font-size: 0.85rem;
  opacity: 0.9;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.module-name {
  font-size: 1.1rem;
  font-weight: 600;
}

.btn-continue {
  background: white;
  color: #f5576c;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s;
}

.btn-continue:hover {
  transform: translateX(5px);
}

.progress-bar {
  margin-top: 1rem;
  height: 4px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: white;
  transition: width 0.3s ease;
}

/* Schools Section */
.schools-section {
  padding: 1.5rem;
  background: #f8f9fa;
}

.schools-section h2 {
  font-size: 1.3rem;
  margin-bottom: 0.5rem;
  color: #333;
}

.section-subtitle {
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 1.5rem;
}

.schools-grid {
  display: grid;
  gap: 1rem;
}

/* School Card */
.school-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.school-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}

.school-card.locked {
  opacity: 0.7;
  position: relative;
}

.school-header {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.school-icon {
  font-size: 2.5rem;
  flex-shrink: 0;
}

.school-info h3 {
  font-size: 1.1rem;
  margin-bottom: 0.5rem;
  color: #333;
}

.school-desc {
  font-size: 0.85rem;
  color: #666;
  line-height: 1.4;
}

.school-meta {
  display: flex;
  justify-content: space-between;
  margin-bottom: 1rem;
  font-size: 0.85rem;
  color: #666;
}

.lock-badge {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.btn-explore {
  width: 100%;
  padding: 0.75rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-explore:hover {
  background: #764ba2;
}

/* Responsive */
@media (min-width: 768px) {
  .schools-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1200px) {
  .schools-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
```

---

### TASK 1.2: Build Tier Access Control System (`/js/tier-access.js`) (8 hours)

**This is the CRITICAL component that enforces Master Prompt requirements**

```javascript
// /sbd-network/public/js/tier-access.js

/* 
 * TIER ACCESS CONTROL SYSTEM
 * Implements Master Prompt tier logic with strict compliance
 * DO NOT MODIFY without reviewing Master Prompt requirements
 */

const TIER_HIERARCHY = {
  free: 0,
  foundation: 1,
  premium: 2,
  elite: 3
};

// FREE TIER ACCESS (Master Prompt Compliant)
const FREE_ACCESS = {
  courses: {
    'foundation-school': { type: 'FULL', weeks: 'ALL' },
    'sex-by-design-for-dummies': { type: 'PARTIAL', weeks: [1] },
    'the-teleios-blueprint-full-human-maturity': { type: 'PARTIAL', weeks: [1] }
  },
  boards: ['public'],
  features: {
    certificates: false,
    downloads: false,
    advancedBoards: false
  }
};

// FOUNDATION TIER ACCESS ($9/month - PARTIAL MODEL)
const FOUNDATION_ACCESS = {
  courses: {
    'foundation-school': { type: 'FULL', weeks: 'ALL' },
    'sex-by-design-for-dummies': { type: 'PARTIAL', weeks: [1, 2, 3] }, // Weeks 4-13 LOCKED
    'the-teleios-blueprint-full-human-maturity': { type: 'PARTIAL', weeks: [1, 2] } // Weeks 3-6 LOCKED
  },
  boards: ['foundation-board', 'teleios-board'],
  features: {
    certificates: true, // Foundation School only
    downloads: true,
    advancedBoards: false
  }
};

// PREMIUM TIER ACCESS ($20/month - FULL LEARNING)
const PREMIUM_ACCESS = {
  courses: {
    ALL: { type: 'FULL', weeks: 'ALL' } // All 44 courses
  },
  boards: ['all-standard-boards', 'course-linked-boards'],
  features: {
    certificates: true,
    downloads: true,
    advancedBoards: false // Elite only
  }
};

// ELITE TIER ACCESS ($50/month - EVERYTHING)
const ELITE_ACCESS = {
  courses: {
    ALL: { type: 'FULL', weeks: 'ALL' }
  },
  boards: [
    'all-standard-boards',
    'advanced-muliebrity-boards',
    'advanced-virility-boards'
  ],
  features: {
    certificates: true,
    downloads: true,
    advancedBoards: true,
    mvHouse: true
  }
};

/**
 * Check if user can access a specific course
 * @param {string} courseId - Course document ID
 * @param {string} userTier - User's current tier
 * @returns {object} { canAccess: boolean, reason: string }
 */
function canAccessCourse(courseId, userTier) {
  const tier = userTier || 'free';
  
  // Premium and Elite have full access
  if (tier === 'premium' || tier === 'elite') {
    return { canAccess: true, accessType: 'FULL' };
  }
  
  // Foundation tier - check specific course access
  if (tier === 'foundation') {
    const access = FOUNDATION_ACCESS.courses[courseId];
    if (access) {
      return {
        canAccess: true,
        accessType: access.type,
        allowedWeeks: access.weeks
      };
    }
    // Course not in Foundation list = locked
    return {
      canAccess: false,
      reason: 'Upgrade to Premium to access this course',
      requiredTier: 'premium'
    };
  }
  
  // Free tier - very limited access
  const access = FREE_ACCESS.courses[courseId];
  if (access) {
    return {
      canAccess: true,
      accessType: access.type,
      allowedWeeks: access.weeks
    };
  }
  
  return {
    canAccess: false,
    reason: 'Upgrade to Foundation to start this course',
    requiredTier: 'foundation'
  };
}

/**
 * Check if user can access a specific module
 * @param {object} module - Module document data
 * @param {string} userTier - User's current tier
 * @returns {object} { canAccess: boolean, reason: string, lockMessage: string }
 */
function canAccessModule(module, userTier) {
  const tier = userTier || 'free';
  const courseId = module.courseId;
  const weekNumber = module.week;
  
  // First check course access
  const courseAccess = canAccessCourse(courseId, tier);
  
  if (!courseAccess.canAccess) {
    return courseAccess;
  }
  
  // If course access is FULL, all modules unlocked
  if (courseAccess.accessType === 'FULL') {
    return { canAccess: true };
  }
  
  // If course access is PARTIAL, check week number
  if (courseAccess.accessType === 'PARTIAL') {
    const allowedWeeks = courseAccess.allowedWeeks;
    
    if (allowedWeeks === 'ALL' || allowedWeeks.includes(weekNumber)) {
      return { canAccess: true };
    }
    
    // Module is locked - determine which tier unlocks it
    const lockMessage = getLockMessage(courseId, weekNumber, tier);
    
    return {
      canAccess: false,
      reason: lockMessage.reason,
      lockMessage: lockMessage.message,
      requiredTier: lockMessage.requiredTier
    };
  }
  
  return { canAccess: true };
}

/**
 * Get appropriate lock message based on course and tier
 */
function getLockMessage(courseId, weekNumber, currentTier) {
  if (courseId === 'sex-by-design-for-dummies') {
    if (currentTier === 'free') {
      return {
        reason: 'Week 2+ requires Foundation',
        message: 'Upgrade to Foundation ($9/month) to unlock weeks 2-3',
        requiredTier: 'foundation'
      };
    }
    if (currentTier === 'foundation') {
      return {
        reason: 'Week 4+ requires Premium',
        message: `🔒 Week ${weekNumber} is locked. You've completed ${Math.round((3/13) * 100)}% of SBD for Dummies. Upgrade to Premium ($20/month) to unlock weeks 4-13 and complete your sexual literacy education.`,
        requiredTier: 'premium'
      };
    }
  }
  
  if (courseId === 'the-teleios-blueprint-full-human-maturity') {
    if (currentTier === 'free') {
      return {
        reason: 'Week 2+ requires Foundation',
        message: 'Upgrade to Foundation ($9/month) to unlock weeks 2-3',
        requiredTier: 'foundation'
      };
    }
    if (currentTier === 'foundation') {
      return {
        reason: 'Week 3+ requires Premium',
        message: `🔒 Week ${weekNumber} is locked. You've completed 50% of Teleios Blueprint. Upgrade to Premium ($20/month) to unlock weeks 3-6 and complete your foundation in covenant maturity.`,
        requiredTier: 'premium'
      };
    }
  }
  
  // Default lock message
  return {
    reason: 'Premium required',
    message: 'Upgrade to Premium ($20/month) to access all courses',
    requiredTier: 'premium'
  };
}

/**
 * Check if user can access a board
 */
function canAccessBoard(boardId, userTier) {
  const tier = userTier || 'free';
  
  // Elite has full access
  if (tier === 'elite') {
    return { canAccess: true };
  }
  
  // Check if board is MV House advanced board
  const advancedBoards = [
    'advanced-muliebrity-corporate',
    'advanced-muliebrity-casual-home',
    'advanced-muliebrity-casual-day',
    'advanced-muliebrity-casual-night',
    'advanced-muliebrity-official',
    'advanced-virility-corporate',
    'advanced-virility-casual-home',
    'advanced-virility-casual-day',
    'advanced-virility-casual-night',
    'advanced-virility-official'
  ];
  
  if (advancedBoards.includes(boardId)) {
    return {
      canAccess: false,
      reason: 'Elite tier required for MV House boards',
      requiredTier: 'elite'
    };
  }
  
  // Standard boards accessible by Foundation+
  if (tier === 'foundation' || tier === 'premium') {
    return { canAccess: true };
  }
  
  // Free tier - read-only public boards
  return {
    canAccess: true,
    readOnly: true
  };
}

/**
 * Get upgrade prompt copy based on context
 */
function getUpgradePrompt(requiredTier, context = 'course') {
  const prompts = {
    foundation: {
      course: {
        headline: 'Unlock Your Next Level',
        description: 'Start Teleios Blueprint and SBD for Dummies with Foundation tier',
        cta: 'Upgrade to Foundation - $9/month',
        benefits: [
          '✅ Access Teleios Blueprint (weeks 1-2)',
          '✅ Access SBD for Dummies (weeks 1-3)',
          '✅ Foundation School certificate',
          '✅ Downloadable resources'
        ]
      }
    },
    premium: {
      course: {
        headline: 'Complete Your Formation',
        description: 'Unlock all 44 courses across 4 schools',
        cta: 'Upgrade to Premium - $20/month',
        benefits: [
          '✅ All 44 courses (full access)',
          '✅ All 4 formation schools',
          '✅ All certificates',
          '✅ Course-linked boards',
          '✅ Download all materials'
        ]
      }
    },
    elite: {
      mvhouse: {
        headline: 'Embody Your Identity',
        description: 'Access advanced formation content and MV House',
        cta: 'Upgrade to Elite - $50/month',
        benefits: [
          '✅ Everything in Premium',
          '✅ Advanced Muliebrity boards',
          '✅ Advanced Virility boards',
          '✅ MV House full access',
          '✅ Advanced media library'
        ]
      }
    }
  };
  
  return prompts[requiredTier]?.[context] || prompts.premium.course;
}

/**
 * Show upgrade modal (called when user hits locked content)
 */
function showUpgradeModal(requiredTier, context = 'course') {
  const prompt = getUpgradePrompt(requiredTier, context);
  
  const modal = document.createElement('div');
  modal.className = 'upgrade-modal';
  modal.innerHTML = `
    <div class="upgrade-modal-content">
      <button class="close-modal" onclick="this.closest('.upgrade-modal').remove()">×</button>
      
      <div class="upgrade-icon">🔓</div>
      <h2>${prompt.headline}</h2>
      <p class="upgrade-desc">${prompt.description}</p>
      
      <div class="upgrade-benefits">
        ${prompt.benefits.map(benefit => `<div class="benefit-item">${benefit}</div>`).join('')}
      </div>
      
      <button class="btn-upgrade" onclick="window.location.href='/subscription.html?tier=${requiredTier}'">
        ${prompt.cta}
      </button>
      
      <p class="upgrade-footer">30-day money-back guarantee</p>
    </div>
  `;
  
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
}

// Export functions for use in other scripts
window.TierAccess = {
  canAccessCourse,
  canAccessModule,
  canAccessBoard,
  showUpgradeModal,
  getUpgradePrompt,
  TIER_HIERARCHY
};
```

**Add CSS for upgrade modal in `/css/global.css`:**

```css
/* Upgrade Modal */
.upgrade-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.upgrade-modal-content {
  background: white;
  border-radius: 16px;
  padding: 2rem;
  max-width: 500px;
  width: 100%;
  position: relative;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    transform: translateY(50px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.close-modal {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: none;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  color: #999;
  line-height: 1;
}

.upgrade-icon {
  font-size: 3rem;
  text-align: center;
  margin-bottom: 1rem;
}

.upgrade-modal-content h2 {
  text-align: center;
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  color: #333;
}

.upgrade-desc {
  text-align: center;
  color: #666;
  margin-bottom: 1.5rem;
}

.upgrade-benefits {
  background: #f8f9fa;
  padding: 1.5rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.benefit-item {
  padding: 0.5rem 0;
  color: #333;
  font-size: 0.95rem;
}

.btn-upgrade {
  width: 100%;
  padding: 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s;
}

.btn-upgrade:hover {
  transform: translateY(-2px);
}

.upgrade-footer {
  text-align: center;
  font-size: 0.85rem;
  color: #999;
  margin-top: 1rem;
}
```

---

### TASK 1.3: Build School Detail Page (`/school.html`) (8 hours)

Shows all courses in a school with lock states

```html
<!-- /sbd-network/public/school.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>School - SBD Network</title>
  <link rel="stylesheet" href="/css/global.css">
  <link rel="stylesheet" href="/css/school.css">
</head>
<body>
  <header class="school-header">
    <button class="btn-back" onclick="history.back()">← Back</button>
    <div class="school-title">
      <div class="school-icon" id="schoolIcon">🏛️</div>
      <div>
        <h1 id="schoolName">Loading...</h1>
        <p id="schoolDescription"></p>
      </div>
    </div>
  </header>

  <main class="school-main">
    <!-- School Stats -->
    <div class="school-stats">
      <div class="stat">
        <span class="stat-value" id="courseCount">0</span>
        <span class="stat-label">Courses</span>
      </div>
      <div class="stat">
        <span class="stat-value" id="portfolioValue">$0</span>
        <span class="stat-label">Value</span>
      </div>
      <div class="stat">
        <span class="stat-value" id="yourProgress">0%</span>
        <span class="stat-label">Complete</span>
      </div>
    </div>

    <!-- Courses List -->
    <section class="courses-section">
      <h2>Courses</h2>
      <div class="courses-list" id="coursesList">
        <!-- Courses loaded dynamically -->
      </div>
    </section>
  </main>

  <nav class="bottom-nav">
    <a href="/index.html">🏠 Home</a>
    <a href="/learn.html" class="active">📚 Learn</a>
    <a href="/boards.html">📋 Boards</a>
    <a href="/mv-house.html">👗 MV House</a>
    <a href="/shop.html">🛒 Shop</a>
    <a href="/profile.html">👤 Profile</a>
  </nav>

  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
  <script src="/js/firebase-config.js"></script>
  <script src="/js/tier-access.js"></script>
  <script src="/js/school.js"></script>
</body>
</html>
```

```javascript
// /sbd-network/public/js/school.js

let schoolCurrentUser = null;
let userTier = 'free';
let userProgress = {};
let currentSchoolId = null;

// Get school ID from URL
const urlParams = new URLSearchParams(window.location.search);
currentSchoolId = urlParams.get('id');

if (!currentSchoolId) {
  window.location.href = '/learn.html';
}

firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    schoolCurrentUser = user;
    await loadUserData();
    await loadSchool();
    await loadCourses();
  } else {
    window.location.href = '/login.html';
  }
});

async function loadUserData() {
  try {
    const userDoc = await firebase.firestore()
      .collection('users')
      .doc(schoolCurrentUser.uid)
      .get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      userTier = userData.tier || 'free';
      userProgress = userData.progress || {};
    }
  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

async function loadSchool() {
  try {
    const schoolDoc = await firebase.firestore()
      .collection('schools')
      .doc(currentSchoolId)
      .get();
    
    if (!schoolDoc.exists) {
      window.location.href = '/learn.html';
      return;
    }
    
    const school = schoolDoc.data();
    
    document.getElementById('schoolName').textContent = school.name;
    document.getElementById('schoolDescription').textContent = school.description;
    document.getElementById('schoolIcon').textContent = school.icon || '🏛️';
    document.getElementById('portfolioValue').textContent = `$${school.portfolioValue.toLocaleString()}`;
    
    // Calculate school progress
    const schoolProgress = calculateSchoolProgress(school.id);
    document.getElementById('yourProgress').textContent = `${schoolProgress}%`;
    
  } catch (error) {
    console.error('Error loading school:', error);
  }
}

function calculateSchoolProgress(schoolId) {
  // Count completed modules in this school's courses
  const completedInSchool = Object.keys(userProgress).filter(moduleId => {
    return moduleId.startsWith(schoolId.replace('school-', ''));
  }).length;
  
  // Rough estimate: assume 6 modules per course, 10 courses per school
  const totalModules = 60;
  return Math.round((completedInSchool / totalModules) * 100);
}

async function loadCourses() {
  try {
    const coursesSnapshot = await firebase.firestore()
      .collection('courses')
      .where('schoolId', '==', currentSchoolId)
      .orderBy('courseNo', 'asc')
      .get();
    
    document.getElementById('courseCount').textContent = coursesSnapshot.size;
    
    const coursesList = document.getElementById('coursesList');
    coursesList.innerHTML = '';
    
    coursesSnapshot.forEach(doc => {
      const course = doc.data();
      const courseCard = createCourseCard(course);
      coursesList.appendChild(courseCard);
    });
    
  } catch (error) {
    console.error('Error loading courses:', error);
  }
}

function createCourseCard(course) {
  const card = document.createElement('div');
  card.className = 'course-card';
  
  // Check access
  const access = window.TierAccess.canAccessCourse(course.id, userTier);
  const isLocked = !access.canAccess || access.accessType === 'PARTIAL';
  
  const accessBadge = isLocked 
    ? `<div class="access-badge partial">🔒 ${access.requiredTier || 'Partial Access'}</div>`
    : `<div class="access-badge full">✅ Full Access</div>`;
  
  card.innerHTML = `
    <div class="course-number">Course ${course.courseNo}</div>
    ${accessBadge}
    <h3>${course.title}</h3>
    <p class="course-desc">${course.description}</p>
    
    <div class="course-meta">
      <span>📚 ${course.durationWeeks} weeks</span>
      <span>💰 $${course.price}</span>
      <span>🎖️ ${course.badge}</span>
    </div>
    
    <button class="btn-view-course" onclick="viewCourse('${course.id}')">
      ${access.canAccess ? 'View Course' : 'View Curriculum'}
    </button>
  `;
  
  if (isLocked) {
    card.classList.add('locked');
  }
  
  return card;
}

function viewCourse(courseId) {
  window.location.href = `/course.html?id=${courseId}`;
}
```

---

### TASK 1.4: Build Course Detail Page (`/course.html`) (10 hours)

**CRITICAL:** Must show FULL curriculum but lock modules based on tier

```html
<!-- /sbd-network/public/course.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Course - SBD Network</title>
  <link rel="stylesheet" href="/css/global.css">
  <link rel="stylesheet" href="/css/course.css">
</head>
<body>
  <header class="course-header">
    <button class="btn-back" onclick="history.back()">← Back</button>
  </header>

  <div class="course-hero">
    <span class="course-school" id="courseSchool">Loading...</span>
    <h1 id="courseTitle">Loading...</h1>
    <p id="courseDescription"></p>
    
    <div class="course-quick-stats">
      <span>📚 <span id="courseDuration">6 weeks</span></span>
      <span>💰 $<span id="coursePrice">247</span></span>
      <span>🎖️ <span id="courseBadge">Certificate</span></span>
    </div>
    
    <button class="btn-enroll" id="enrollBtn" onclick="handleEnroll()">
      Start Course
    </button>
  </div>

  <main class="course-main">
    <!-- Curriculum Section -->
    <section class="curriculum-section">
      <h2>Complete Curriculum</h2>
      <p class="curriculum-note">
        🔍 Full curriculum visible. Module access based on your tier.
      </p>
      
      <div class="modules-list" id="modulesList">
        <!-- Modules loaded dynamically with lock states -->
      </div>
    </section>

    <!-- What You'll Learn -->
    <section class="learning-outcomes">
      <h2>What You'll Learn</h2>
      <div id="learningOutcomes"></div>
    </section>
  </main>

  <nav class="bottom-nav">
    <a href="/index.html">🏠 Home</a>
    <a href="/learn.html" class="active">📚 Learn</a>
    <a href="/boards.html">📋 Boards</a>
    <a href="/mv-house.html">👗 MV House</a>
    <a href="/shop.html">🛒 Shop</a>
    <a href="/profile.html">👤 Profile</a>
  </nav>

  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
  <script src="/js/firebase-config.js"></script>
  <script src="/js/tier-access.js"></script>
  <script src="/js/course.js"></script>
</body>
</html>
```

```javascript
// /sbd-network/public/js/course.js

let courseCurrentUser = null;
let userTier = 'free';
let userProgress = {};
let currentCourseId = null;
let currentCourse = null;
let isEnrolled = false;

const urlParams = new URLSearchParams(window.location.search);
currentCourseId = urlParams.get('id');

if (!currentCourseId) {
  window.location.href = '/learn.html';
}

firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    courseCurrentUser = user;
    await loadUserData();
    await loadCourse();
    await loadModules();
  } else {
    window.location.href = '/login.html';
  }
});

async function loadUserData() {
  try {
    const userDoc = await firebase.firestore()
      .collection('users')
      .doc(courseCurrentUser.uid)
      .get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      userTier = userData.tier || 'free';
      userProgress = userData.progress || {};
      const enrolledCourses = userData.enrolledCourses || [];
      isEnrolled = enrolledCourses.includes(currentCourseId);
    }
  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

async function loadCourse() {
  try {
    const courseDoc = await firebase.firestore()
      .collection('courses')
      .doc(currentCourseId)
      .get();
    
    if (!courseDoc.exists) {
      window.location.href = '/learn.html';
      return;
    }
    
    currentCourse = courseDoc.data();
    
    // Update UI
    document.getElementById('courseTitle').textContent = currentCourse.title;
    document.getElementById('courseDescription').textContent = currentCourse.description;
    document.getElementById('courseDuration').textContent = `${currentCourse.durationWeeks} weeks`;
    document.getElementById('coursePrice').textContent = currentCourse.price;
    document.getElementById('courseBadge').textContent = currentCourse.badge;
    
    // Load school name
    const schoolDoc = await firebase.firestore()
      .collection('schools')
      .doc(currentCourse.schoolId)
      .get();
    
    if (schoolDoc.exists) {
      document.getElementById('courseSchool').textContent = schoolDoc.data().name;
    }
    
    // Update enroll button
    updateEnrollButton();
    
  } catch (error) {
    console.error('Error loading course:', error);
  }
}

function updateEnrollButton() {
  const btn = document.getElementById('enrollBtn');
  
  // Check if user can access this course
  const access = window.TierAccess.canAccessCourse(currentCourseId, userTier);
  
  if (!access.canAccess) {
    btn.textContent = `Upgrade to ${access.requiredTier || 'Premium'} to Start`;
    btn.onclick = () => window.TierAccess.showUpgradeModal(access.requiredTier, 'course');
    return;
  }
  
  if (isEnrolled) {
    btn.textContent = 'Continue Course';
    btn.classList.add('enrolled');
  } else {
    btn.textContent = 'Enroll in Course';
  }
}

async function loadModules() {
  try {
    const modulesSnapshot = await firebase.firestore()
      .collection('modules')
      .where('courseId', '==', currentCourseId)
      .orderBy('week', 'asc')
      .get();
    
    const modulesList = document.getElementById('modulesList');
    modulesList.innerHTML = '';
    
    modulesSnapshot.forEach(doc => {
      const module = doc.data();
      const moduleCard = createModuleCard(module);
      modulesList.appendChild(moduleCard);
    });
    
  } catch (error) {
    console.error('Error loading modules:', error);
  }
}

function createModuleCard(module) {
  const card = document.createElement('div');
  card.className = 'module-card';
  
  // Check if user can access this module
  const access = window.TierAccess.canAccessModule(module, userTier);
  const isLocked = !access.canAccess;
  
  // Check if completed
  const isCompleted = userProgress[module.id] === 100;
  
  card.innerHTML = `
    <div class="module-header">
      <div class="module-number">
        ${isCompleted ? '✅' : isLocked ? '🔒' : '📚'} Week ${module.week}
      </div>
      ${isLocked ? `<div class="lock-badge">${access.requiredTier || 'Locked'}</div>` : ''}
    </div>
    
    <h3>${module.title}</h3>
    <p class="module-duration">${module.duration}</p>
    
    ${isLocked ? `
      <div class="lock-message">
        ${access.lockMessage || access.reason}
      </div>
    ` : ''}
    
    <button class="btn-module" onclick="${isLocked ? `window.TierAccess.showUpgradeModal('${access.requiredTier}', 'course')` : `openModule('${module.id}')`}">
      ${isLocked ? 'Upgrade to Unlock' : isCompleted ? 'Review' : 'Start Module'}
    </button>
  `;
  
  if (isLocked) {
    card.classList.add('locked');
  }
  
  if (isCompleted) {
    card.classList.add('completed');
  }
  
  return card;
}

async function handleEnroll() {
  if (isEnrolled) {
    // Go to first accessible module
    const firstModule = await getFirstAccessibleModule();
    if (firstModule) {
      window.location.href = `/lesson.html?moduleId=${firstModule.id}`;
    }
    return;
  }
  
  // Check if user can access course
  const access = window.TierAccess.canAccessCourse(currentCourseId, userTier);
  
  if (!access.canAccess) {
    window.TierAccess.showUpgradeModal(access.requiredTier, 'course');
    return;
  }
  
  // Enroll user
  try {
    await firebase.firestore()
      .collection('users')
      .doc(courseCurrentUser.uid)
      .update({
        enrolledCourses: firebase.firestore.FieldValue.arrayUnion(currentCourseId),
        [`enrollmentDates.${currentCourseId}`]: firebase.firestore.FieldValue.serverTimestamp()
      });
    
    isEnrolled = true;
    updateEnrollButton();
    
    // Show success message
    alert('🎉 Enrolled! Starting your first module...');
    
    // Go to first module
    const firstModule = await getFirstAccessibleModule();
    if (firstModule) {
      window.location.href = `/lesson.html?moduleId=${firstModule.id}`;
    }
    
  } catch (error) {
    console.error('Error enrolling:', error);
    alert('Error enrolling. Please try again.');
  }
}

async function getFirstAccessibleModule() {
  const modulesSnapshot = await firebase.firestore()
    .collection('modules')
    .where('courseId', '==', currentCourseId)
    .orderBy('week', 'asc')
    .limit(1)
    .get();
  
  if (!modulesSnapshot.empty) {
    return modulesSnapshot.docs[0].data();
  }
  
  return null;
}

function openModule(moduleId) {
  window.location.href = `/lesson.html?moduleId=${moduleId}`;
}
```

---

## REMAINING TASKS (Condensed for Space)

**TASK 1.5: Build Lesson Viewer (`/lesson.html`)** (10 hours)
- Video player
- Content body (markdown rendering)
- Linked board section
- Progress tracking
- Next/Previous navigation
- Completion marking

**TASK 1.6: Progress Tracking System** (8 hours)
- Update user.progress on module completion
- Update user.lastAccessedModule
- Update user.streak (daily check)
- Calculate course completion percentage
- Trigger certificate generation when course 100%

**TASK 1.7: Board-Lesson Integration** (6 hours)
- Show course-linked board in lesson page
- Filter board posts by module
- Allow posting from within lesson
- "Discuss this topic" CTA

**TASK 1.8: Deploy & Test** (4 hours)
- Deploy to Firebase hosting
- Test all tier access scenarios
- Test enrollment flow
- Test progress tracking
- Test upgrade modals

**TASK 1.9: Verification Script** (2 hours)
- Verify all pages load
- Verify tier logic works
- Verify modals appear correctly
- Verify database updates

---

## 🎯 PHASE 1 COMPLETION CRITERIA

```bash
node scripts/verify-phase-1.js
```

**Must Pass:**
- ✅ User can browse schools (all tiers see all 4 schools)
- ✅ User can view course curriculums (full curriculum visible)
- ✅ Free tier: Can access Foundation School + Week 1 previews
- ✅ Foundation tier: Can access weeks 1-3 of SBD, weeks 1-2 of Teleios
- ✅ Premium tier: Can access all 44 courses fully
- ✅ Elite tier: Same as Premium (MV House boards handled in Phase 3)
- ✅ Lock modals appear with correct upgrade copy
- ✅ Progress tracking updates in Firestore
- ✅ "Continue Learning" shows last accessed module
- ✅ Enrollment flow works (user can enroll in accessible courses)

---

## 🔒 NON-NEGOTIABLES (DO NOT MODIFY)

1. **ALL users see ALL schools** (no hiding schools by tier)
2. **ALL users see FULL curriculums** (no hiding modules)
3. **Locks appear ON CLICK**, not before
4. **Foundation tier gets PARTIAL access** (not full courses)
5. **Upgrade modals must show benefits, not just prices**
6. **Master Prompt tier logic EXACTLY as specified**
7. **Phase 1 does NOT handle payment** (reads tier, doesn't change it)

---

## 📚 REFERENCE FILES

**Master Prompt Data:** (provided by user)  
**Phase 0 Database:** `/scripts/verify-phase-0.js` (must pass before Phase 1)  
**Existing Files to Preserve:**
- `/public/boards.html` (do not modify)
- `/public/shop.html` (do not modify)  
- `/public/mv-house.html` (do not modify - Phase 3 will enhance)

---

## 🚀 NEXT STEPS

**When Phase 1 Complete:**
- Phase 2: Build subscription management + Stripe integration
- Phase 2: Add tier upgrade/downgrade flows
- Phase 2: Implement Stripe webhooks
- Phase 2: Build /subscription.html page

**Testing Strategy for Phase 1:**
Since Phase 1 doesn't handle payments, manually set user tiers in Firestore to test:

```javascript
// In Firebase Console > Firestore > users/{userId}
{
  tier: 'free'       // Test free access
  tier: 'foundation' // Test partial access
  tier: 'premium'    // Test full access
  tier: 'elite'      // Test elite (same as premium in Phase 1)
}
```

---

**PHASE 1 READY TO BEGIN**

All Master Prompt requirements incorporated.  
All tier logic specified.  
Zero ambiguity on access control.  
Ready for implementation.
