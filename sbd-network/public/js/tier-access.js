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
      <button class="close-modal" onclick="this.closest('.upgrade-modal').remove(); document.body.style.overflow = '';">×</button>
      
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
