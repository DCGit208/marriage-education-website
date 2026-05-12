/**
 * FORMATION SYSTEM - ACCESS CONTROL
 * ==================================
 * 
 * Centralized access control for schools, courses, modules, and boards.
 * Handles subscription tiers and progression requirements.
 * 
 * Usage: import this in any JS file that needs access checks.
 */

// ==================================================================
// SUBSCRIPTION TIERS
// ==================================================================

const TIERS = {
  FREE: 'free',
  FOUNDATION: 'foundation',
  PREMIUM: 'premium',
  ELITE: 'elite'
};

const _FA_TIER_ORDER = ['free', 'foundation', 'premium', 'elite'];

/**
 * Check if user's tier is sufficient for required tier
 */
function hasSufficientTier(userTier, requiredTier) {
  const userIndex = _FA_TIER_ORDER.indexOf(userTier || 'free');
  const requiredIndex = _FA_TIER_ORDER.indexOf(requiredTier || 'free');
  return userIndex >= requiredIndex;
}

// ==================================================================
// USER PROGRESSION HELPERS
// ==================================================================

/**
 * Get user's current progress data
 */
async function getUserProgress(userId) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return null;
    
    const userData = userDoc.data();
    return userData.progress || {
      currentSchoolId: null,
      currentCourseId: null,
      currentModuleId: null,
      completedModules: [],
      completedCourses: [],
      completedSchools: [],
      streak: 0,
      lastActivityDate: null,
      progressPercent: {}
    };
  } catch (error) {
    console.error('[Access Control] Error fetching user progress:', error);
    return null;
  }
}

/**
 * Get user's subscription tier
 */
async function getUserTier(userId) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return 'free';
    
    const userData = userDoc.data();
    const subscription = userData.subscription;
    
    // Check if subscription is active
    if (subscription && subscription.status === 'active') {
      const now = Date.now();
      const endDate = subscription.endDate?.toMillis ? subscription.endDate.toMillis() : 0;
      
      if (endDate > now) {
        return subscription.tier || 'free';
      }
    }
    
    // Fall back to direct tier field if subscription object not present/active
    return userData.tier || 'free';
  } catch (error) {
    console.error('[Access Control] Error fetching user tier:', error);
    return 'free';
  }
}

// ==================================================================
// SCHOOL ACCESS
// ==================================================================

/**
 * Check if user can access a school
 */
async function canAccessSchool(userId, schoolId) {
  try {
    const school = await db.collection('schools').doc(schoolId).get();
    if (!school.exists) return false;
    
    const schoolData = school.data();
    const userProgress = await getUserProgress(userId);
    
    if (!userProgress) return false;
    
    // Check if school requires prerequisite schools to be completed
    if (schoolData.unlockRequirements?.completedSchools?.length > 0) {
      const hasCompleted = schoolData.unlockRequirements.completedSchools.every(
        reqSchoolId => userProgress.completedSchools.includes(reqSchoolId)
      );
      if (!hasCompleted) return false;
    }
    
    // Check if school requires prerequisite courses to be completed
    if (schoolData.unlockRequirements?.completedCourses?.length > 0) {
      const hasCompleted = schoolData.unlockRequirements.completedCourses.every(
        reqCourseId => userProgress.completedCourses.includes(reqCourseId)
      );
      if (!hasCompleted) return false;
    }
    
    return true;
  } catch (error) {
    console.error('[Access Control] Error checking school access:', error);
    return false;
  }
}

// ==================================================================
// COURSE ACCESS
// ==================================================================

/**
 * Check if user can access a course
 */
async function canAccessCourse(userId, courseId) {
  try {
    const course = await db.collection('courses').doc(courseId).get();
    if (!course.exists) return false;
    
    const courseData = course.data();
    const userTier = await getUserTier(userId);
    
    // Check subscription tier
    if (!hasSufficientTier(userTier, courseData.accessLevel)) {
      return false;
    }
    
    // Check school access (must be able to access parent school)
    const schoolAccess = await canAccessSchool(userId, courseData.schoolId);
    if (!schoolAccess) return false;
    
    return true;
  } catch (error) {
    console.error('[Access Control] Error checking course access:', error);
    return false;
  }
}

// ==================================================================
// MODULE ACCESS
// ==================================================================

/**
 * Check if user can access a module
 */
async function canAccessModule(userId, moduleId) {
  try {
    const module = await db.collection('modules').doc(moduleId).get();
    if (!module.exists) return false;
    
    const moduleData = module.data();
    
    // Check course access first
    const courseAccess = await canAccessCourse(userId, moduleData.courseId);
    if (!courseAccess) return false;
    
    // If module is first in course (no previous module), it's accessible
    if (!moduleData.unlockRequirements?.previousModuleId) {
      return true;
    }
    
    // Check if previous module is completed
    const userProgress = await getUserProgress(userId);
    if (!userProgress) return false;
    
    const prevCompleted = userProgress.completedModules.includes(
      moduleData.unlockRequirements.previousModuleId
    );
    
    return prevCompleted;
  } catch (error) {
    console.error('[Access Control] Error checking module access:', error);
    return false;
  }
}

// ==================================================================
// BOARD ACCESS
// ==================================================================

/**
 * Check if user can access a board
 */
async function canAccessBoard(userId, boardId) {
  try {
    const board = await db.collection('boards').doc(boardId).get();
    if (!board.exists) return false;
    
    const boardData = board.data();
    
    // Boards without schoolId are legacy boards - accessible to all for backward compatibility
    if (!boardData.schoolId) {
      return true;
    }
    
    // Free boards accessible to all
    if (boardData.accessLevel === 'free') {
      return true;
    }
    
    // Check subscription tier
    const userTier = await getUserTier(userId);
    if (!hasSufficientTier(userTier, boardData.accessLevel)) {
      return false;
    }
    
    // If board is linked to a module, check module access
    if (boardData.moduleId) {
      return await canAccessModule(userId, boardData.moduleId);
    }
    
    // If board is linked to a course, check course access
    if (boardData.courseId) {
      return await canAccessCourse(userId, boardData.courseId);
    }
    
    // If board is linked to a school, check school access
    if (boardData.schoolId) {
      return await canAccessSchool(userId, boardData.schoolId);
    }
    
    return true;
  } catch (error) {
    console.error('[Access Control] Error checking board access:', error);
    return false;
  }
}

// ==================================================================
// PROGRESSION ACTIONS
// ==================================================================

/**
 * Mark a module  as completed
 */
async function completeModule(userId, moduleId) {
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      throw new Error('User not found');
    }
    
    const userData = userDoc.data();
    const progress = userData.progress || {
      completedModules: [],
      completedCourses: [],
      completedSchools: [],
      progressPercent: {}
    };
    
    // Don't add if already completed
    if (progress.completedModules.includes(moduleId)) {
      return { success: true, alreadyCompleted: true };
    }
    
    // Add to completed modules
    progress.completedModules.push(moduleId);
    progress.lastActivityDate = firebase.firestore.FieldValue.serverTimestamp();
    
    // Update streak
    const lastActivity = userData.progress?.lastActivityDate;
    if (lastActivity) {
      const daysSince = Math.floor((Date.now() - lastActivity.toMillis()) / (1000 * 60 * 60 * 24));
      if (daysSince === 1) {
        progress.streak = (progress.streak || 0) + 1;
      } else if (daysSince > 1) {
        progress.streak = 1;
      }
    } else {
      progress.streak = 1;
    }
    
    // Check if course is completed (all modules done)
    const module = await db.collection('modules').doc(moduleId).get();
    const moduleData = module.data();
    const courseId = moduleData.courseId;
    
    const allModulesSnapshot = await db.collection('modules')
      .where('courseId', '==', courseId)
      .get();
    
    const allModuleIds = allModulesSnapshot.docs.map(doc => doc.id);
    const allCompleted = allModuleIds.every(id => progress.completedModules.includes(id));
    
    if (allCompleted && !progress.completedCourses.includes(courseId)) {
      progress.completedCourses.push(courseId);
      
      // Check if school is completed (all courses done)
      const course = await db.collection('courses').doc(courseId).get();
      const courseData = course.data();
      const schoolId = courseData.schoolId;
      
      const schoolCoursesSnapshot = await db.collection('courses')
        .where('schoolId', '==', schoolId)
        .get();
      
      const schoolCourseIds = schoolCoursesSnapshot.docs.map(doc => doc.id);
      const schoolCompleted = schoolCourseIds.every(id => progress.completedCourses.includes(id));
      
      if (schoolCompleted && !progress.completedSchools.includes(schoolId)) {
        progress.completedSchools.push(schoolId);
      }
    }
    
    // Update user document
    await userRef.update({ progress });
    
    return { 
      success: true, 
      courseCompleted: allCompleted,
      nextModuleUnlocked: true
    };
    
  } catch (error) {
    console.error('[Access Control] Error completing module:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get next recommended module for user
 */
async function getNextModule(userId) {
  try {
    const userProgress = await getUserProgress(userId);
    if (!userProgress) return null;
    
    // If user has current module, return that
    if (userProgress.currentModuleId) {
      const module = await db.collection('modules').doc(userProgress.currentModuleId).get();
      if (module.exists) {
        return { id: module.id, ...module.data() };
      }
    }
    
    // Otherwise, find first incomplete module in current course
    if (userProgress.currentCourseId) {
      const modulesSnapshot = await db.collection('modules')
        .where('courseId', '==', userProgress.currentCourseId)
        .orderBy('order', 'asc')
        .get();
      
      for (const doc of modulesSnapshot.docs) {
        if (!userProgress.completedModules.includes(doc.id)) {
          return { id: doc.id, ...doc.data() };
        }
      }
    }
    
    // If no current course, suggest starting Teleios
    const firstModule = await db.collection('modules')
      .where('courseId', '==', 'teleios-foundation')
      .where('order', '==', 1)
      .limit(1)
      .get();
    
    if (!firstModule.empty) {
      const doc = firstModule.docs[0];
      return { id: doc.id, ...doc.data() };
    }
    
    return null;
  } catch (error) {
    console.error('[Access Control] Error getting next module:', error);
    return null;
  }
}

// ==================================================================
// PAYWALL HELPERS
// ==================================================================

/**
 * Determine which tier is required for access
 */
function getRequiredTier(resourceType, resourceData) {
  if (resourceType === 'board') {
    return resourceData.accessLevel || 'free';
  }
  if (resourceType === 'course') {
    return resourceData.accessLevel || 'free';
  }
  if (resourceType === 'module') {
    // Module tier is determined by course
    return resourceData.courseData?.accessLevel || 'free';
  }
  return 'free';
}

/**
 * Show paywall modal
 */
function showPaywall(requiredTier, context = {}) {
  const modal = document.getElementById('paywallModal');
  if (!modal) {
    console.error('[Access Control] Paywall modal not found');
    return;
  }
  
  // Set context message
  const messages = {
    foundation: 'Unlock Teleios Foundation and begin your formation journey',
    premium: 'Access full Teleios and Sexual Literacy courses with all core boards',
    elite: 'Unlock Muliebrity and Virility advanced schools with elite content'
  };
  
  const messageEl = modal.querySelector('.paywall-message');
  if (messageEl) {
    messageEl.textContent = messages[requiredTier] || 'Upgrade to continue';
  }
  
  // Highlight required tier
  modal.querySelectorAll('[data-tier]').forEach(el => {
    const tier = el.getAttribute('data-tier');
    const tierIndex = _FA_TIER_ORDER.indexOf(tier);
    const requiredIndex = _FA_TIER_ORDER.indexOf(requiredTier);
    
    if (tierIndex >= requiredIndex) {
      el.classList.add('recommended');
    } else {
      el.classList.remove('recommended');
    }
  });
  
  // Show modal
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

/**
 * Hide paywall modal
 */
function hidePaywall() {
  const modal = document.getElementById('paywallModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

/**
 * Show paywall modal (convenient wrapper with custom messaging)
 */
function showPaywallModal(options = {}) {
  const {
    title = 'Upgrade Required',
    message = 'This content requires a subscription',
    requiredTier = 'premium',
    currentTier = 'free'
  } = options;
  
  // Create modal if it doesn't exist
  let modal = document.getElementById('paywallModal');
  if (!modal) {
    modal = createPaywallModal();
  }
  
  // Update content
  const titleEl = modal.querySelector('.paywall-title');
  const messageEl = modal.querySelector('.paywall-message');
  
  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;
  
  // Highlight tiers
  const tierCards = modal.querySelectorAll('[data-tier]');
  tierCards.forEach(card => {
    const tier = card.getAttribute('data-tier');
    const tierIndex = _FA_TIER_ORDER.indexOf(tier);
    const requiredIndex = _FA_TIER_ORDER.indexOf(requiredTier);
    
    if (tierIndex >= requiredIndex) {
      card.classList.add('recommended');
    } else {
      card.classList.remove('recommended');
    }
  });
  
  // Show modal
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

/**
 * Create paywall modal HTML
 */
function createPaywallModal() {
  const modal = document.createElement('div');
  modal.id = 'paywallModal';
  modal.className = 'paywall-modal';
  modal.innerHTML = `
    <div class="paywall-overlay" onclick="hidePaywall()"></div>
    <div class="paywall-content">
      <button class="paywall-close" onclick="hidePaywall()" aria-label="Close">×</button>
      
      <div class="paywall-icon">🔒</div>
      <h2 class="paywall-title">Upgrade to Continue</h2>
      <p class="paywall-message">Choose a subscription tier to unlock this content and continue your formation journey.</p>
      
      <div class="tier-comparison">
        <!-- Foundation Tier -->
        <div class="tier-card" data-tier="foundation">
          <h3 class="tier-name">Foundation</h3>
          <p class="tier-price">$9<span>/month</span></p>
          <ul class="tier-features">
            <li>Partial Teleios Identity (Weeks 1-4)</li>
            <li>Partial Sexual Literacy (Intro)</li>
            <li>5 Discussion Boards</li>
            <li>Progress tracking</li>
            <li>Community access</li>
          </ul>
          <button class="btn btn-secondary" onclick="selectTier('foundation-monthly')">
            Start Foundation
          </button>
        </div>
        
        <!-- Premium Tier -->
        <div class="tier-card" data-tier="premium">
          <span class="tier-badge">Popular</span>
          <h3 class="tier-name">Premium</h3>
          <p class="tier-price">$20<span>/month</span></p>
          <ul class="tier-features">
            <li>Full Teleios Identity (All Weeks)</li>
            <li>Full Sexual Literacy Course</li>
            <li>10 Discussion Boards</li>
            <li>Quizzes & Certificates</li>
            <li>Assignment submissions</li>
            <li>Priority support</li>
          </ul>
          <button class="btn btn-primary" onclick="selectTier('premium-monthly')">
            Start Premium
          </button>
        </div>
        
        <!-- Elite Tier -->
        <div class="tier-card" data-tier="elite">
          <span class="tier-badge elite">Elite</span>
          <h3 class="tier-name">Elite</h3>
          <p class="tier-price">$50<span>/month</span></p>
          <ul class="tier-features">
            <li>Everything in Premium</li>
            <li>Muliebrity School (Women)</li>
            <li>Virility School (Men)</li>
            <li>20 Elite Discussion Boards</li>
            <li>Advanced content library</li>
            <li>Exclusive community</li>
            <li>Direct coaching access</li>
          </ul>
          <button class="btn btn-primary" onclick="selectTier('elite-monthly')">
            Start Elite
          </button>
        </div>
      </div>
      
      <div class="paywall-footer">
        <p>All plans include a 30-day money-back guarantee</p>
        <p><a href="/shop.html">View all plans and bundles</a></p>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  return modal;
}

/**
 * Handle tier selection - Redirect to checkout
 */
function selectTier(productId) {
  // Close the modal
  hidePaywall();
  
  // Redirect to checkout with the product ID
  window.location.href = `/checkout.html?product=${productId}`;
}

// Make selectTier globally available
if (typeof window !== 'undefined') {
  window.selectTier = selectTier;
}

// ==================================================================
// FEATURE GATE — canAccessFeature(uid, feature)
// ==================================================================

/**
 * Formation-gated feature access.
 * Tier = billing privilege. Formation = access privilege.
 * Elite users are NOT exempt — they must still meet formation thresholds.
 *
 * Features:
 *   'dating'    — Premium + score≥60 + S1≥70 + S2≥70 | Elite + score≥70
 *   'mv_house'  — Elite + FIS_V2 expression≥20
 *   'school2'   — Premium+ (tier gate only, formation-access.js already handles)
 *   'boards'    — foundation+ (tier gate only)
 *
 * @param {string} uid
 * @param {string} feature
 * @returns {Promise<{ allowed: boolean, reason: string, showPaywall: boolean }>}
 */
async function canAccessFeature(uid, feature) {
  if (!uid) return { allowed: false, reason: 'Not authenticated.', showPaywall: false };

  const db = typeof window !== 'undefined' ? window.db : null;
  if (!db) return { allowed: false, reason: 'Firestore unavailable.', showPaywall: false };

  let userData;
  try {
    const snap = await db.collection('users').doc(uid).get();
    userData = snap.exists ? snap.data() : {};
  } catch (_) {
    return { allowed: false, reason: 'Could not load user data.', showPaywall: false };
  }

  // Admin bypass — always allowed
  if (userData.role === 'admin') {
    return { allowed: true, reason: '', showPaywall: false };
  }

  const tier       = userData?.subscription?.tier || userData?.tier || 'free';
  const tierLevel  = _FA_TIER_ORDER.indexOf(tier);
  // Old formationScore (used by dating)
  const fs         = userData.formationScore || {};
  const totalScore = fs.totalScore  || 0;
  const school1Pct = fs.school1Pct  || 0;
  const school2Pct = fs.school2Pct  || 0;
  // FIS_V2 profile (used by mv_house)
  const v2         = userData.formationProfile_v2 || {};
  const expression = v2.expression  || 0;

  // ── DATING ───────────────────────────────────────────────────────
  if (feature === 'dating') {
    if (tierLevel < _FA_TIER_ORDER.indexOf('premium')) {
      return {
        allowed: false,
        reason: 'Upgrade to Premium and reach a formation score of 60+ to unlock Covenant Matching.',
        showPaywall: true,
      };
    }
    if (tier === 'premium') {
      if (totalScore >= 60 && school1Pct >= 70 && school2Pct >= 70) {
        return { allowed: true, reason: '', showPaywall: false };
      }
      return {
        allowed: false,
        reason: `Formation score or school progress below threshold. Score: ${totalScore}/100 (need 60), School 1: ${school1Pct}% (need 70%), School 2: ${school2Pct}% (need 70%).`,
        showPaywall: false,
      };
    }
    if (tier === 'elite') {
      if (totalScore >= 70) {
        return { allowed: true, reason: '', showPaywall: false };
      }
      return {
        allowed: false,
        reason: `Elite — increase formation score to 70+ for full matching. Current: ${totalScore}/100.`,
        showPaywall: false,
      };
    }
  }

  // ── MV HOUSE ─────────────────────────────────────────────────────
  if (feature === 'mv_house') {
    if (tierLevel < _FA_TIER_ORDER.indexOf('elite')) {
      return {
        allowed: false,
        reason: 'MV House is an Elite feature. Upgrade to Elite to access your wardrobe system.',
        showPaywall: true,
      };
    }
    // Elite: require expression score ≥ 20 (anti-game: must have actual MV engagement)
    if (expression < 20) {
      return {
        allowed: false,
        reason: `Expression score too low to access MV House (${expression}/100 — need 20). Engage with the community and wardrobe system to build your expression score.`,
        showPaywall: false,
      };
    }
    return { allowed: true, reason: '', showPaywall: false };
  }

  // ── SCHOOL 2 ─────────────────────────────────────────────────────
  if (feature === 'school2') {
    if (tierLevel < _FA_TIER_ORDER.indexOf('premium')) {
      return {
        allowed: false,
        reason: 'School 2 requires a Premium subscription.',
        showPaywall: true,
      };
    }
    return { allowed: true, reason: '', showPaywall: false };
  }

  // ── BOARDS ───────────────────────────────────────────────────────
  if (feature === 'boards') {
    if (tierLevel < _FA_TIER_ORDER.indexOf('foundation')) {
      return {
        allowed: false,
        reason: 'Discussion boards require a Foundation subscription or higher.',
        showPaywall: true,
      };
    }
    return { allowed: true, reason: '', showPaywall: false };
  }

  // Unknown feature — default locked
  return { allowed: false, reason: 'Feature not recognised.', showPaywall: false };
}

// ==================================================================
// EXPORTS
// ==================================================================

// Make functions globally available
if (typeof window !== 'undefined') {
  window.FormationAccess = {
    // Tier helpers
    TIERS,
    hasSufficientTier,
    getUserTier,
    
    // Access checks
    canAccessSchool,
    canAccessCourse,
    canAccessModule,
    canAccessBoard,
    canAccessFeature,
    
    // Progression
    getUserProgress,
    completeModule,
    getNextModule,
    
    // Paywall
    getRequiredTier,
    showPaywall,
    showPaywallModal,
    hidePaywall
  };
}

// For Node.js/testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TIERS,
    hasSufficientTier,
    getUserTier,
    canAccessSchool,
    canAccessCourse,
    canAccessModule,
    canAccessBoard,
    canAccessFeature,
    getUserProgress,
    completeModule,
    getNextModule,
    getRequiredTier,
    showPaywall,
    showPaywallModal,
    hidePaywall
  };
}
