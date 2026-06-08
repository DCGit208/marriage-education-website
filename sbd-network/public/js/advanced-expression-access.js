/**
 * Advanced expression layer — MV House + advanced Muliebrity/Virility boards.
 * Single formation gate: Premium arc (S1+S2) → S3 complete → ≥50% S4.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.AdvancedExpressionAccess = factory();
    if (root.FormationAccess) {
      Object.assign(root.FormationAccess, root.AdvancedExpressionAccess);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const SCHOOL_1_COURSE_NOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  const SCHOOL_2_COURSE_NOS = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28];
  const SCHOOL_3_COURSE_NOS = [29, 30, 31, 32, 33, 34, 35, 36];
  const SCHOOL_4_COURSE_NOS = [37, 38, 39, 40, 41, 42, 43, 44];
  const SCHOOL_4_MIN_COMPLETE = 4;

  const MV_HOUSE_BOARD_IDS = [
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

  /** Groups granted only when advanced expression milestone is met. */
  const ADVANCED_EXPRESSION_GROUP_IDS = [
    'advanced-muliebrity-training-school',
    'z8lmnHLoFUBBZaRp2Vdd',
  ];

  const ADVANCED_EXPRESSION_GROUP_SET = new Set(ADVANCED_EXPRESSION_GROUP_IDS);

  const FORMATION_GATE_COPY = {
    premium: 'Complete all School 1 (Teleios) and School 2 (Sexual Literacy) courses to continue toward advanced expression.',
    school3: 'Complete all School 3 (Marriage Systems) courses before advanced expression unlocks.',
    school4: 'Complete at least half of School 4 (Civilization Leadership) — 4 of 8 courses — to unlock advanced boards and MV House.',
    elite: 'Advanced expression (MV House and advanced training boards) requires Elite formation progress, not billing alone.',
  };

  function normalizeTierSlug(tier) {
    if (!tier) return 'free';
    return String(tier).toLowerCase().trim();
  }

  function subscriptionEndMs(subscription) {
    if (!subscription?.endDate) return 0;
    return subscription.endDate.toMillis ? subscription.endDate.toMillis() : 0;
  }

  function isSubscriptionCurrentlyActive(subscription) {
    if (!subscription || subscription.status !== 'active') return false;
    return subscriptionEndMs(subscription) > Date.now();
  }

  function hasEliteTier(userData) {
    if (!userData) return false;
    const docTier = normalizeTierSlug(userData.tier || 'free');
    const sub = userData.subscription;
    const subTier =
      sub && sub.status === 'active' && subscriptionEndMs(sub) > Date.now()
        ? normalizeTierSlug(sub.tier || 'free')
        : null;
    return docTier === 'elite' || subTier === 'elite';
  }

  function isAdminGrantedElite(userData) {
    if (!userData || !hasEliteTier(userData)) return false;
    return userData.staffAccess?.advancedExpression === true;
  }

  /** Set when admin removes advanced community groups — blocks formation/unlock bypasses. */
  function isAdvancedExpressionRevoked(userData) {
    return userData?.access?.advancedExpressionRevoked === true;
  }

  function userHasAdvancedExpressionGroup(userData) {
    const groups = Array.isArray(userData?.groups) ? userData.groups : [];
    return ADVANCED_EXPRESSION_GROUP_IDS.some((id) => groups.includes(id));
  }

  function getCompletedCourses(userData) {
    const p = userData?.progress;
    if (!p) return [];
    return Array.isArray(p.completedCourses) ? p.completedCourses : [];
  }

  function isCourseNoComplete(completedCourses, courseNo) {
    const prefix = `course-${courseNo}-`;
    return completedCourses.some(
      (id) => typeof id === 'string' && (id === prefix || id.startsWith(prefix))
    );
  }

  function countCompleteNos(completedCourses, nos) {
    return nos.filter((n) => isCourseNoComplete(completedCourses, n)).length;
  }

  function getSchoolProgress(userData) {
    const completed = getCompletedCourses(userData);
    const s1 = countCompleteNos(completed, SCHOOL_1_COURSE_NOS);
    const s2 = countCompleteNos(completed, SCHOOL_2_COURSE_NOS);
    const s3 = countCompleteNos(completed, SCHOOL_3_COURSE_NOS);
    const s4 = countCompleteNos(completed, SCHOOL_4_COURSE_NOS);
    return {
      school1: { done: s1, total: SCHOOL_1_COURSE_NOS.length },
      school2: { done: s2, total: SCHOOL_2_COURSE_NOS.length },
      school3: { done: s3, total: SCHOOL_3_COURSE_NOS.length },
      school4: { done: s4, total: SCHOOL_4_COURSE_NOS.length },
    };
  }

  function hasPremiumArcComplete(userData) {
    const completed = getCompletedCourses(userData);
    return (
      countCompleteNos(completed, SCHOOL_1_COURSE_NOS) >= SCHOOL_1_COURSE_NOS.length &&
      countCompleteNos(completed, SCHOOL_2_COURSE_NOS) >= SCHOOL_2_COURSE_NOS.length
    );
  }

  function hasSchool3Complete(userData) {
    return countCompleteNos(getCompletedCourses(userData), SCHOOL_3_COURSE_NOS) >= SCHOOL_3_COURSE_NOS.length;
  }

  function hasSchool4HalfComplete(userData) {
    return countCompleteNos(getCompletedCourses(userData), SCHOOL_4_COURSE_NOS) >= SCHOOL_4_MIN_COMPLETE;
  }

  function computeFormationMilestoneMet(userData) {
    return hasPremiumArcComplete(userData) && hasSchool3Complete(userData) && hasSchool4HalfComplete(userData);
  }

  function hasAdvancedExpressionAccess(userData) {
    if (!userData) return false;
    if (userData.role === 'admin') return true;
    if (isAdvancedExpressionRevoked(userData)) return false;
    if (!userHasAdvancedExpressionGroup(userData)) return false;
    if (isAdminGrantedElite(userData)) return true;
    if (userData.progress?.advancedExpressionUnlocked === true) return true;
    return computeFormationMilestoneMet(userData);
  }

  function getAdvancedExpressionAccess(userData) {
    if (!userData) {
      return { allowed: false, reason: 'auth', message: 'Sign in required', showPaywall: false };
    }
    if (userData.role === 'admin') {
      return { allowed: true, reason: '', message: '', showPaywall: false };
    }
    if (isAdvancedExpressionRevoked(userData)) {
      return {
        allowed: false,
        reason: 'admin_revoked',
        message: 'MV House is paused on your account',
        detail:
          'Advanced expression — MV House and Advanced Muliebrity / Virility boards — is not active for you right now. Your other formation schools and assigned community groups are still available.',
        showPaywall: false,
        showSupportDm: true,
        supportPrefill:
          'Hi — my MV House / advanced expression access is paused. Could you review my account?',
        ctaUrl: '/learn.html',
        ctaLabel: 'Go to Learning →',
      };
    }
    if (!userHasAdvancedExpressionGroup(userData)) {
      return {
        allowed: false,
        reason: 'group_revoked',
        message: 'MV House unlocks through formation',
        detail:
          'MV House opens when Advanced Muliebrity / Virility training is assigned to your profile and your formation milestones are met. Continue your schools in Learning, or message support to confirm your group membership.',
        showPaywall: false,
        showSupportDm: true,
        supportPrefill:
          'Hi — I need help with MV House access and my Advanced Muliebrity / Virility group membership.',
        ctaUrl: '/courses.html',
        ctaLabel: 'Continue Formation →',
      };
    }
    if (isAdminGrantedElite(userData)) {
      return { allowed: true, reason: '', message: '', showPaywall: false };
    }
    if (userData.progress?.advancedExpressionUnlocked === true || computeFormationMilestoneMet(userData)) {
      return { allowed: true, reason: '', message: '', showPaywall: false };
    }

    const progress = getSchoolProgress(userData);

    if (!hasPremiumArcComplete(userData)) {
      return {
        allowed: false,
        reason: 'premium_arc',
        message: 'Formation Required',
        detail: FORMATION_GATE_COPY.premium,
        showPaywall: false,
        progress,
        ctaUrl: '/courses.html',
        ctaLabel: 'Continue Formation →',
      };
    }
    if (!hasSchool3Complete(userData)) {
      return {
        allowed: false,
        reason: 'school3',
        message: 'Complete School 3',
        detail: FORMATION_GATE_COPY.school3,
        showPaywall: false,
        progress,
        ctaUrl: '/courses.html',
        ctaLabel: 'Continue Formation →',
      };
    }
    if (!hasSchool4HalfComplete(userData)) {
      return {
        allowed: false,
        reason: 'school4',
        message: 'Advance Through School 4',
        detail: `${FORMATION_GATE_COPY.school4} (${progress.school4.done}/${SCHOOL_4_MIN_COMPLETE} required).`,
        showPaywall: false,
        progress,
        ctaUrl: '/courses.html',
        ctaLabel: 'Continue Formation →',
      };
    }

    return { allowed: true, reason: '', message: '', showPaywall: false, progress };
  }

  function isAdvancedExpressionBoard(boardId, boardData) {
    if (!boardId) return false;
    if (MV_HOUSE_BOARD_IDS.includes(boardId)) return true;
    const gid = boardData?.groupId;
    if (gid && ADVANCED_EXPRESSION_GROUP_SET.has(gid)) return true;
    return false;
  }

  function isAdvancedExpressionGroupId(groupId) {
    return !!groupId && ADVANCED_EXPRESSION_GROUP_SET.has(groupId);
  }

  function filterAdvancedExpressionGroups(groupIds) {
    return (groupIds || []).filter((id) => !ADVANCED_EXPRESSION_GROUP_SET.has(id));
  }

  function eliteBillingGroupsOnly(eliteGroups) {
    return (eliteGroups || []).filter((id) => !ADVANCED_EXPRESSION_GROUP_SET.has(id));
  }

  /**
   * After course completion — persist unlock flag and advanced community groups.
   */
  async function maybePersistAdvancedExpressionUnlock(db, uid, userData) {
    if (!db || !uid || !userData) return false;
    if (!computeFormationMilestoneMet(userData)) return false;

    const updates = {
      groups: firebase.firestore.FieldValue.arrayUnion(...ADVANCED_EXPRESSION_GROUP_IDS),
    };
    if (userData.progress?.advancedExpressionUnlocked !== true) {
      updates['progress.advancedExpressionUnlocked'] = true;
      updates['progress.advancedExpressionUnlockedAt'] = firebase.firestore.FieldValue.serverTimestamp();
    }
    await db.collection('users').doc(uid).update(updates);
    return true;
  }

  return {
    SCHOOL_1_COURSE_NOS,
    SCHOOL_2_COURSE_NOS,
    SCHOOL_3_COURSE_NOS,
    SCHOOL_4_COURSE_NOS,
    SCHOOL_4_MIN_COMPLETE,
    MV_HOUSE_BOARD_IDS,
    ADVANCED_EXPRESSION_GROUP_IDS,
    hasPremiumArcComplete,
    hasSchool3Complete,
    hasSchool4HalfComplete,
    computeFormationMilestoneMet,
    hasAdvancedExpressionAccess,
    getAdvancedExpressionAccess,
    userHasAdvancedExpressionGroup,
    isAdvancedExpressionBoard,
    isAdvancedExpressionGroupId,
    filterAdvancedExpressionGroups,
    eliteBillingGroupsOnly,
    getSchoolProgress,
    maybePersistAdvancedExpressionUnlock,
    isAdminGrantedElite,
    isAdvancedExpressionRevoked,
    hasEliteTier,
  };
});
