/*
 * TIER ACCESS CONTROL SYSTEM v2 — DRIP MODEL
 * ============================================
 * Master Prompt canonical. DO NOT MODIFY without full system review.
 *
 * MODEL (locked April 13 2026):
 *   Free       → Teleios Week 1 preview only
 *   Foundation → Teleios Blueprint (6wks) + SBD Dummies (13wks) — TIME-DRIPPED
 *   Premium    → Schools 1+2 (28 courses) — TIME-DRIPPED, more parallel lanes
 *   Elite      → All 44 courses + MV House — TIME-DRIPPED, all lanes concurrent
 *
 * DRIP RULE: 1 week unlocks per 7 calendar days from subscription.dripStartDate
 * DRIP BYPASS: Elite tier & admin role bypass drip (no wait, immediate access)
 * RE-SUBSCRIBE: dripWeeksUnlocked saved on cancel → resume from saved position
 */

const TIER_HIERARCHY = {
  free: 0,
  foundation: 1,
  premium: 2,
  elite: 3
};

// ── DRIP CONSTANTS ──────────────────────────────────────────────
const DRIP_DAYS_PER_WEEK = 7; // 1 module every 7 calendar days

// ── COURSE → MINIMUM TIER to access at all ─────────────────────
// DRIP = accessible at this tier but time-gated by dripStartDate
// FULL = no drip gate (used for elite bypassing drip)
const COURSE_TIER_MAP = {
  // Free preview
  // Both short and full Firestore doc IDs supported
  'the-teleios-blueprint-full-human-maturity':          { minTier: 'free', freeWeeks: [1] },
  'course-1-the-teleios-blueprint-full-human-maturity': { minTier: 'free', freeWeeks: [1] },
  'sex-by-design-for-dummies':                          { minTier: 'free', freeWeeks: [1] },
  'course-14-sex-by-design-for-dummies':                { minTier: 'free', freeWeeks: [1] }, // legacy alias
  // Foundation dripped
  'foundation-school':                        { minTier: 'foundation',  drip: true },
  // School 1 — Teleios (Foundation dripped, Premium full drip)
  'school-1-teleios':                         { minTier: 'foundation',  drip: true },
  // School 2 — Sexual Literacy (Premium+)
  'school-2-sexual-literacy':                 { minTier: 'premium',     drip: true },
  // School 3 — Marriage Systems (Elite only)
  'school-3-marriage-systems':                { minTier: 'elite',       drip: false },
  // School 4 — Civilization (Elite only)
  'school-4-civilization-leadership':         { minTier: 'elite',       drip: false },
};

// ── SCHOOL 1 PROGRESSION SEQUENCE ──────────────────────────────
// Foundation tier: completion-triggered unlock (drip-paced within each course)
// Premium/Elite: all School 1 unlocked immediately
const SCHOOL_1_SEQUENCE = [
  'course-1-the-teleios-blueprint-full-human-maturity',
  'course-2-the-anthropology-of-wholeness-becoming-fully-human',
  'course-3-identity-mastery-understanding-image-likeness-human-design',
  'course-4-the-four-faculties-training',
  'course-5-anthropocentric-development-how-humans-grow',
  'course-6-the-personal-development-masterclass',
  'course-7-the-science-of-self-command',
  'course-8-the-heart-of-relationship-level-1',
  'course-9-relationship-relatednesses-level-2',
  'course-10-relationship-mastery-intensive-level-3',
  'course-11-the-perfect-self-program-practicing-from-perfection',
  'course-12-emotional-literacy-for-couples-singles',
  'course-13-temperament-intelligence-for-marriage',
];

/**
 * Check if a Foundation user can access a specific School 1 course.
 * Course 1 (Teleios Blueprint) is always accessible at Foundation.
 * Courses 2-13 require the previous course to be completed.
 * Premium/Elite users bypass the progression gate entirely.
 *
 * @param {string}   courseId        - Firestore course document ID
 * @param {string}   userTier        - User's current tier
 * @param {string[]} unlockedCourses - From users/{uid}.progress.unlockedCourses
 * @param {string[]} completedCourses - From users/{uid}.progress.completedCourses
 */
function canAccessSchool1Course(courseId, userTier, unlockedCourses = [], completedCourses = []) {
  const tierLevel = TIER_HIERARCHY[userTier] ?? 0;

  // Premium/Elite: no progression gate
  if (tierLevel >= TIER_HIERARCHY['premium']) return { canAccess: true, accessType: 'FULL' };

  // Free: only Week 1 of Course 1 via free preview (handled by canAccessCourse)
  if (tierLevel < TIER_HIERARCHY['foundation']) {
    return { canAccess: false, requiredTier: 'foundation', reason: tierUpgradeReason('foundation') };
  }

  // Foundation: Course 1 is always accessible
  if (courseId === SCHOOL_1_SEQUENCE[0]) return { canAccess: true, accessType: 'DRIP' };

  // Foundation: Courses 2-13 — check if explicitly unlocked via progression
  if (unlockedCourses.includes(courseId) || completedCourses.includes(courseId)) {
    return { canAccess: true, accessType: 'DRIP' };
  }

  // Not yet unlocked — find which course they need to complete first
  const idx      = SCHOOL_1_SEQUENCE.indexOf(courseId);
  const prevId   = idx > 0 ? SCHOOL_1_SEQUENCE[idx - 1] : null;
  const prevNo   = idx;   // idx is 0-based, course numbers are 1-based → prev is idx

  return {
    canAccess: false,
    progressionLocked: true,
    requiredCourseId: prevId,
    requiredCourseNo: prevNo,
    reason: prevId
      ? `Complete Course ${prevNo} first to unlock this one`
      : 'Complete the previous course to unlock',
  };
}

// MV House boards — Elite only
const MV_HOUSE_BOARDS = [
  'advanced-muliebrity-corporate',
  'advanced-muliebrity-casual-home',
  'advanced-muliebrity-casual-day',
  'advanced-muliebrity-casual-night',
  'advanced-muliebrity-official',
  'advanced-virility-corporate',
  'advanced-virility-casual-home',
  'advanced-virility-casual-day',
  'advanced-virility-casual-night',
  'advanced-virility-official',
];

// ── DRIP GATE ───────────────────────────────────────────────────
/**
 * Calculate drip gate for a module.
 * @param {object} module       - Firestore module data (must have .week)
 * @param {string} userTier     - User's current tier
 * @param {object} subscription - users/{uid}.subscription (must have .dripStartDate Timestamp)
 * @returns {{ dripLocked: boolean, weeksElapsed: number, unlockDate: Date|null, unlockLabel: string }}
 */
function getDripGate(module, userTier, subscription) {
  // Elite bypasses drip entirely — instant access to everything
  if (userTier === 'elite') {
    return { dripLocked: false, weeksElapsed: Infinity, unlockDate: null, unlockLabel: '' };
  }

  const weekNum = module.week || module.weekNumber || 1;
  const dripStartMs = subscription?.dripStartDate?.toMillis
    ? subscription.dripStartDate.toMillis()
    : null;

  if (!dripStartMs) {
    // No drip start date means they haven't subscribed yet
    return { dripLocked: true, weeksElapsed: 0, unlockDate: null, unlockLabel: 'Subscribe to start' };
  }

  const weeksElapsed = Math.floor((Date.now() - dripStartMs) / (DRIP_DAYS_PER_WEEK * 24 * 60 * 60 * 1000)) + 1;

  if (weekNum > weeksElapsed) {
    const unlockMs   = dripStartMs + (weekNum - 1) * DRIP_DAYS_PER_WEEK * 24 * 60 * 60 * 1000;
    const unlockDate = new Date(unlockMs);
    const daysLeft   = Math.ceil((unlockMs - Date.now()) / (24 * 60 * 60 * 1000));
    const unlockLabel = daysLeft === 1
      ? 'Unlocks tomorrow'
      : daysLeft <= 7
        ? `Unlocks in ${daysLeft} days`
        : `Unlocks ${unlockDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
    return { dripLocked: true, weeksElapsed, unlockDate, unlockLabel, daysLeft };
  }

  return { dripLocked: false, weeksElapsed, unlockDate: null, unlockLabel: '' };
}

// ── TIER GATE ───────────────────────────────────────────────────
/**
 * Check if user's tier grants access to a course at all (before drip check).
 * @param {string} courseId  - Course Firestore ID
 * @param {string} userTier
 * @returns {{ canAccess: boolean, requiredTier?: string, reason?: string }}
 */
function canAccessCourse(courseId, userTier, unlockedCourses = [], completedCourses = [], courseAccessLevel = null) {
  const tier      = userTier || 'free';
  const tierLevel = TIER_HIERARCHY[tier] ?? 0;

  // Teleios Blueprint & SBD Dummies: free gets week 1 preview
  if (courseId === 'the-teleios-blueprint-full-human-maturity' ||
      courseId === 'course-1-the-teleios-blueprint-full-human-maturity' ||
      courseId === 'sex-by-design-for-dummies' ||
      courseId === 'course-14-sex-by-design-for-dummies') {
    if (tierLevel >= TIER_HIERARCHY['foundation']) return { canAccess: true, accessType: 'DRIP' };
    return { canAccess: true, accessType: 'PREVIEW', freeWeeks: [1] };
  }

  // School 1 courses 2-13: progression-gated for Foundation, free for Premium+
  if (SCHOOL_1_SEQUENCE.includes(courseId)) {
    return canAccessSchool1Course(courseId, tier, unlockedCourses, completedCourses);
  }

  const rule = COURSE_TIER_MAP[courseId];
  if (!rule) {
    // Unknown course — use Firestore accessLevel if supplied, otherwise deny
    const fallbackTier = courseAccessLevel || 'premium';
    const fallbackLevel = TIER_HIERARCHY[fallbackTier] ?? TIER_HIERARCHY['premium'];
    if (tierLevel >= fallbackLevel) return { canAccess: true, accessType: 'DRIP' };
    return { canAccess: false, requiredTier: fallbackTier, reason: tierUpgradeReason(fallbackTier) };
  }

  const minLevel = TIER_HIERARCHY[rule.minTier] ?? 0;
  if (tierLevel >= minLevel) return { canAccess: true, accessType: rule.drip ? 'DRIP' : 'FULL' };

  return {
    canAccess: false,
    requiredTier: rule.minTier,
    reason: tierUpgradeReason(rule.minTier)
  };
}

function tierUpgradeReason(requiredTier) {
  const map = {
    foundation: 'Upgrade to Foundation ($9/month) to access this course',
    premium:    'Upgrade to Premium ($20/month) to access School 2 — Sexual Literacy',
    elite:      'Upgrade to Elite ($50/month) to access Schools 3 & 4 + MV House',
  };
  return map[requiredTier] || 'Upgrade to access this content';
}

/**
 * Check module access — tier gate only (no drip check).
 * Use getDripGate() additionally in lesson.html for the drip wall.
 */
function canAccessModule(module, userTier) {
  const tier     = userTier || 'free';
  const courseId = module.courseId;
  const weekNum  = module.week || module.weekNumber || 1;

  const courseAccess = canAccessCourse(courseId, tier);
  if (!courseAccess.canAccess) return courseAccess;

  // Free preview: only week 1
  if (courseAccess.accessType === 'PREVIEW') {
    if (weekNum === 1) return { canAccess: true };
    const requiredTier = 'foundation';
    return {
      canAccess: false,
      requiredTier,
      reason: `Upgrade to Foundation ($9/month) to access week ${weekNum} and beyond`,
    };
  }

  // DRIP or FULL: tier is satisfied — drip is checked separately by caller
  return { canAccess: true };
}

// ── BOARD GATE ──────────────────────────────────────────────────
/**
 * Check if user can access a board.
 * MV House boards: Elite only.
 * Standard boards: Foundation+ full access, Free = read-only.
 */
function canAccessBoard(boardId, userTier) {
  const tier      = userTier || 'free';
  const tierLevel = TIER_HIERARCHY[tier] ?? 0;

  // Elite → full access everywhere
  if (tier === 'elite') return { canAccess: true, canPost: true, canWardrobe: true };

  // MV House boards: Elite only
  if (MV_HOUSE_BOARDS.includes(boardId)) {
    return {
      canAccess: false,
      requiredTier: 'elite',
      reason: '🏠 MV House is an Elite-only expression system. Upgrade to access.',
      upgradeUrl: '/payment?tier=elite',
    };
  }

  // Standard boards: Foundation+ can post
  if (tierLevel >= TIER_HIERARCHY['foundation']) {
    return { canAccess: true, canPost: true, canWardrobe: false };
  }

  // Free: read-only on public boards
  if (tier === 'free') {
    return { canAccess: true, canPost: false, readOnly: true };
  }

  return { canAccess: false, requiredTier: 'foundation', reason: 'Upgrade to Foundation to join the community' };
}

// ── UPGRADE PROMPTS ─────────────────────────────────────────────
/**
 * Return upgrade prompt copy based on required tier and context.
 * All prompts must create upward pressure (Master Prompt law).
 */
function getUpgradePrompt(requiredTier, context = 'course') {
  const prompts = {
    foundation: {
      course: {
        headline: '🏗 Start Your Formation — Foundation',
        description: 'Get full access to Teleios Blueprint (6 weeks) and Sex By Design For Dummies (13 weeks) — dripped weekly as you progress.',
        cta: 'Unlock Foundation — $9/month →',
        benefits: [
          '✅ Teleios Blueprint — all 6 weeks (dripped weekly)',
          '✅ SBD For Dummies — all 13 weeks (dripped weekly)',
          '✅ Foundation community boards',
          '✅ Foundation Certificate on completion',
          '🔒 School 2 Sexual Literacy — 15 courses (Premium)',
          '🔒 MV House expression system (Elite)',
        ],
        upgradeUrl: '/payment?tier=foundation',
      },
    },
    premium: {
      course: {
        headline: '⚡ Unlock Full Formation — Premium',
        description: '28 courses across School 1 (Teleios) and School 2 (Sexual Literacy) — all dripped weekly. 15 Sexual Literacy courses unlocked immediately.',
        cta: 'Unlock Premium — $20/month →',
        benefits: [
          '✅ Full School 1 — 13 Teleios courses',
          '✅ Full School 2 — 15 Sexual Literacy courses',
          '✅ All standard community boards',
          '✅ School 1 + 2 certificates',
          '🔒 School 3 — Marriage Systems (8 courses, Elite)',
          '🔒 School 4 — Civilization Leadership (8 courses, Elite)',
          '🔒 MV House expression system (Elite)',
        ],
        upgradeUrl: '/payment?tier=premium',
      },
      board: {
        headline: '⚡ Premium — Full Community Access',
        description: 'All standard boards. Post, reply, and engage with the full formation community.',
        cta: 'Unlock Premium — $20/month →',
        benefits: [
          '✅ All standard boards — full posting access',
          '✅ Course-linked discussion boards',
          '🔒 Advanced Muliebrity & Virility boards (Elite)',
          '🔒 MV House boards (Elite)',
        ],
        upgradeUrl: '/payment?tier=premium',
      },
    },
    elite: {
      mvhouse: {
        headline: '👑 MV House — Identity Becomes Expression',
        description: 'The wardrobe system of covenant expression. Build your Muliebrity or Virility wardrobe. Corporate, Casual, Official — curated, purchased, customized.',
        cta: 'Unlock Elite — $50/month →',
        benefits: [
          '✅ ALL 44 courses — Schools 1–4',
          '✅ MV House — full wardrobe system',
          '✅ Advanced Muliebrity boards',
          '✅ Advanced Virility boards',
          '✅ Mastery Certification',
          '✅ Direct access — Dr. Coach Achu',
        ],
        upgradeUrl: '/payment?tier=elite',
      },
      course: {
        headline: '👑 Elite — Full Embodiment Access',
        description: 'All 44 courses across all 4 schools, plus MV House, advanced boards, and Mastery Certification.',
        cta: 'Unlock Elite — $50/month →',
        benefits: [
          '✅ ALL 44 courses — Schools 1–4',
          '✅ School 3 — Marriage Systems (8 courses)',
          '✅ School 4 — Civilization Leadership (8 courses)',
          '✅ MV House full access',
          '✅ Advanced boards + Mastery cert',
        ],
        upgradeUrl: '/payment?tier=elite',
      },
      board: {
        headline: '👑 Elite — Advanced Formation Community',
        description: 'Access Advanced Muliebrity, Virility, and MV House boards. The identity expression layer.',
        cta: 'Unlock Elite — $50/month →',
        benefits: [
          '✅ Advanced Muliebrity Training School boards',
          '✅ Advanced Virility boards',
          '✅ MV House wardrobe boards',
          '✅ Full community + all 44 courses',
        ],
        upgradeUrl: '/payment?tier=elite',
      },
    },
  };

  return prompts[requiredTier]?.[context]
    || prompts[requiredTier]?.course
    || prompts.premium.course;
}

// ── UPGRADE MODAL ───────────────────────────────────────────────
/**
 * Show upgrade modal when user hits locked content.
 * Calls UpgradeTracker.trackLockHit() if available (v248).
 */
function showUpgradeModal(requiredTier, context = 'course') {
  const prompt = getUpgradePrompt(requiredTier, context);

  // Track lock hit for nudge engine (v248)
  if (window.UpgradeTracker) {
    window.UpgradeTracker.trackLockHit(requiredTier, context);
  }

  // Remove any existing modal
  const existing = document.querySelector('.upgrade-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'upgrade-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="upgrade-modal-content">
      <button class="close-modal" aria-label="Close" onclick="this.closest('.upgrade-modal').remove();document.body.style.overflow='';">×</button>
      <div class="upgrade-icon">🔒</div>
      <h2>${prompt.headline}</h2>
      <p class="upgrade-desc">${prompt.description}</p>
      <ul class="upgrade-benefits">
        ${prompt.benefits.map(b => `<li>${b}</li>`).join('')}
      </ul>
      <a class="btn-upgrade" href="${prompt.upgradeUrl}">${prompt.cta}</a>
      <p class="upgrade-footer">Cancel anytime. Formation stays with you.</p>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  // Close on backdrop click
  modal.addEventListener('click', e => {
    if (e.target === modal) { modal.remove(); document.body.style.overflow = ''; }
  });

  // Close on Escape
  const onKey = e => {
    if (e.key === 'Escape') { modal.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);
}

// ── DRIP WALL (shown when content is time-locked, NOT upgrade-locked) ──
/**
 * Show drip wall for subscribers who are waiting for next week.
 * This is NOT an upgrade modal — they are already subscribed.
 */
function showDripWallModal(unlockLabel, weekNum, courseName) {
  const existing = document.querySelector('.drip-wall-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'drip-wall-modal upgrade-modal'; // reuse modal backdrop styles
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="upgrade-modal-content drip-wall-content">
      <div class="upgrade-icon">⏳</div>
      <h2>Week ${weekNum} — Coming Soon</h2>
      <p class="upgrade-desc">${courseName ? `<strong>${courseName}</strong><br>` : ''}Your formation continues on schedule.<br>${unlockLabel}.</p>
      <p style="font-size:13px;color:var(--text-sec,#666);line-height:1.6;margin-top:8px">
        This is the drip system protecting your transformation — one week at a time, so you truly absorb each stage before moving forward.
      </p>
      <button class="btn-upgrade" onclick="this.closest('.drip-wall-modal').remove();document.body.style.overflow='';" style="margin-top:20px">Got it →</button>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  modal.addEventListener('click', e => {
    if (e.target === modal) { modal.remove(); document.body.style.overflow = ''; }
  });
}

// ── EXPORTS ─────────────────────────────────────────────────────
window.TierAccess = {
  canAccessCourse,
  canAccessModule,
  canAccessBoard,
  canAccessSchool1Course,
  getDripGate,
  showUpgradeModal,
  showDripWallModal,
  getUpgradePrompt,
  TIER_HIERARCHY,
  MV_HOUSE_BOARDS,
  DRIP_DAYS_PER_WEEK,
  SCHOOL_1_SEQUENCE,
};
