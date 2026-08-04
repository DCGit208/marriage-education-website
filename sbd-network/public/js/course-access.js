/**
 * COURSE ACCESS — roles, ownership, subscription vs purchase
 * =========================================================
 * Platform admin (role: admin)     → admin panel, moderation — NOT full course catalog
 * Content designer (role/designer) → full catalog for build & QA
 * Members                          → subscription tier + ownedCourses (shop purchases)
 */
(function (global) {
  'use strict';

  const ROLES = {
    MEMBER: 'member',
    ADMIN: 'admin',
    DESIGNER: 'designer',
  };

  /** Product / bundle IDs that unlock a Firestore course doc */
  const OWNERSHIP_ALIASES = {
    'the-woman-the-wife-the-mother': [
      'the-woman-the-wife-the-mother',
      'the-woman-the-wife-the-mother-course',
      'the-woman-the-wife-the-mother-bundle',
      'sex-by-design-complete-edition',
    ],
    'sex-by-design-for-dummies': [
      'sex-by-design-for-dummies',
      'sbd-dummies-course',
      'course-14-sex-by-design-for-dummies',
    ],
  };

  const COURSE_COVER_IMAGES = {
    'the-woman-the-wife-the-mother': '/images/the-woman-the-wife-the-mother-cover.png',
  };

  function getCourseCoverImage(courseId, coverImage) {
    if (coverImage) return String(coverImage);
    return COURSE_COVER_IMAGES[courseId] || '';
  }

  function courseThumbHtml(courseId, fallbackIcon, coverImage) {
    const src = getCourseCoverImage(courseId, coverImage);
    if (!src) {
      return '<div class="course-icon">' + (fallbackIcon || '📖') + '</div>';
    }
    return '<div class="course-thumb"><img src="' + src + '" alt="" loading="lazy" width="56" height="84"></div>';
  }

  function libraryThumbHtml(courseId, fallbackIcon, coverImage) {
    const src = getCourseCoverImage(courseId, coverImage);
    if (!src) {
      return '<span class="library-card-icon">' + (fallbackIcon || '📖') + '</span>';
    }
    return '<span class="library-card-thumb"><img src="' + src + '" alt="" loading="lazy" width="48" height="72"></span>';
  }

  const TIER_ORDER = { free: 0, foundation: 1, premium: 2, elite: 3 };

  function getUserRoles(userData) {
    const roles = new Set();
    const primary = String(userData?.role || ROLES.MEMBER).toLowerCase();
    if (primary) roles.add(primary);
    (userData?.roles || []).forEach(function (r) {
      roles.add(String(r || '').toLowerCase());
    });
    return roles;
  }

  function isPlatformAdmin(userData) {
    return getUserRoles(userData).has(ROLES.ADMIN);
  }

  function isContentDesigner(userData) {
    if (!userData) return false;
    const roles = getUserRoles(userData);
    if (roles.has(ROLES.DESIGNER)) return true;
    return !!(userData.staffAccess && userData.staffAccess.contentDesigner);
  }

  function hasFullCatalogAccess(userData) {
    return isContentDesigner(userData);
  }

  function ownedCourseIds(userData) {
    return Array.isArray(userData?.ownedCourses) ? userData.ownedCourses : [];
  }

  function userOwnsCourse(userData, courseId) {
    if (!courseId) return false;
    if (hasFullCatalogAccess(userData)) return true;

    const owned = ownedCourseIds(userData);
    if (!owned.length) return false;
    if (owned.includes(courseId)) return true;

    const aliases = OWNERSHIP_ALIASES[courseId];
    if (aliases && aliases.some(function (id) { return owned.includes(id); })) {
      return true;
    }
    return false;
  }

  function resolveEffectiveTier(userData) {
    if (!userData) return 'free';
    if (isPlatformAdmin(userData) || isContentDesigner(userData)) return 'elite';
    const sub = userData.subscription || {};
    const now = Date.now();
    const subEnd = sub.endDate?.toMillis ? sub.endDate.toMillis() : 0;
    if (sub.status === 'active' && subEnd > now && sub.tier) {
      return String(sub.tier).toLowerCase();
    }
    // Do not fall back to stale users.tier after cancel/expiry — that grants free access.
    if (sub.status === 'cancelled' || sub.status === 'canceled') return 'free';
    if (subEnd > 0 && subEnd <= now) return 'free';
    if (!sub.status) return String(userData.tier || 'free').toLowerCase();
    return 'free';
  }

  function isPurchaseOnlyCourse(course) {
    if (!course) return false;
    if (course.purchaseOnly === true) return true;
    if (course.id === 'the-woman-the-wife-the-mother') return true;
    const rule = global.TierAccess?.COURSE_TIER_MAP?.[course.id];
    return !!(rule && rule.purchaseOnly);
  }

  /**
   * @returns {{ canAccess: boolean, accessType?: string, reason?: string, requiredTier?: string, purchaseRequired?: boolean }}
   */
  function getCourseAccess(userData, course, opts) {
    opts = opts || {};
    const courseId = course?.id || course?.courseId;
    if (!courseId) return { canAccess: false, reason: 'Course not found' };

    if (hasFullCatalogAccess(userData)) {
      return { canAccess: true, accessType: 'DESIGNER' };
    }

    if (userOwnsCourse(userData, courseId)) {
      return { canAccess: true, accessType: 'OWNED' };
    }

    if (isPurchaseOnlyCourse(course)) {
      return {
        canAccess: false,
        purchaseRequired: true,
        requiredTier: course.accessLevel || course.requiredTier || 'elite',
        reason: 'Purchase this course in the Shop to add it to your library.',
      };
    }

    const effectiveTier = opts.viewTier || resolveEffectiveTier(userData);
    const unlocked = opts.unlockedCourses || [];
    const completed = opts.completedCourses || [];

    if (global.TierAccess) {
      const tierResult = TierAccess.canAccessCourse(
        courseId,
        effectiveTier,
        unlocked,
        completed,
        course.accessLevel
      );
      if (tierResult.canAccess) {
        return Object.assign({ canAccess: true }, tierResult);
      }
      return Object.assign({ canAccess: false }, tierResult);
    }

    const required = course.accessLevel || 'foundation';
    const ok = (TIER_ORDER[effectiveTier] ?? 0) >= (TIER_ORDER[required] ?? 0);
    return ok
      ? { canAccess: true, accessType: 'TIER' }
      : { canAccess: false, requiredTier: required, reason: 'Upgrade your plan to access this course.' };
  }

  function getOwnedCourseIdsFromUser(userData) {
    const owned = ownedCourseIds(userData);
    const courseIds = new Set();
    owned.forEach(function (id) {
      courseIds.add(id);
      Object.keys(OWNERSHIP_ALIASES).forEach(function (courseId) {
        if (OWNERSHIP_ALIASES[courseId].includes(id)) courseIds.add(courseId);
      });
    });
    return Array.from(courseIds);
  }

  function categorizeCourses(userData, allCourses, opts) {
    opts = opts || {};
    const purchased = [];
    const subscription = [];
    const locked = [];
    const completed = opts.completedCourses || [];

    allCourses.forEach(function (course) {
      if (completed.includes(course.id)) return;
      const access = getCourseAccess(userData, course, opts);
      if (!access.canAccess) {
        locked.push({ course: course, access: access });
        return;
      }
      if (access.accessType === 'OWNED' || access.accessType === 'DESIGNER') {
        if (access.accessType === 'OWNED') purchased.push(course);
        else subscription.push(course);
      } else if (isPurchaseOnlyCourse(course) && userOwnsCourse(userData, course.id)) {
        purchased.push(course);
      } else if (userOwnsCourse(userData, course.id)) {
        purchased.push(course);
      } else {
        subscription.push(course);
      }
    });

    if (hasFullCatalogAccess(userData)) {
      return {
        purchased: purchased,
        subscription: allCourses.filter(function (c) { return !completed.includes(c.id); }),
        locked: [],
        designer: true,
      };
    }

    return { purchased: purchased, subscription: subscription, locked: locked, designer: false };
  }

  global.CourseAccess = {
    ROLES: ROLES,
    OWNERSHIP_ALIASES: OWNERSHIP_ALIASES,
    getUserRoles: getUserRoles,
    isPlatformAdmin: isPlatformAdmin,
    isContentDesigner: isContentDesigner,
    hasFullCatalogAccess: hasFullCatalogAccess,
    userOwnsCourse: userOwnsCourse,
    ownedCourseIds: ownedCourseIds,
    getOwnedCourseIdsFromUser: getOwnedCourseIdsFromUser,
    resolveEffectiveTier: resolveEffectiveTier,
    isPurchaseOnlyCourse: isPurchaseOnlyCourse,
    getCourseAccess: getCourseAccess,
    categorizeCourses: categorizeCourses,
    getCourseCoverImage: getCourseCoverImage,
    courseThumbHtml: courseThumbHtml,
    libraryThumbHtml: libraryThumbHtml,
  };
})(typeof window !== 'undefined' ? window : global);
