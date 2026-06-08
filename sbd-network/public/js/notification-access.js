/**
 * Board notification eligibility — mirrors boards-v2 / board.js access rules.
 * Standalone (no dependency on advanced-expression-access.js).
 */
(function (root) {
  'use strict';

  var TIER_ORDER = { free: 0, foundation: 1, premium: 2, elite: 3 };

  var ADVANCED_EXPRESSION_GROUP_SET = {
    'advanced-muliebrity-training-school': true,
    'z8lmnHLoFUBBZaRp2Vdd': true,
  };

  var MV_HOUSE_BOARD_IDS = {
    'advanced-muliebrity-corporate': true,
    'advanced-muliebrity-casual-home': true,
    'advanced-muliebrity-casual-day': true,
    'advanced-muliebrity-casual-night': true,
    'advanced-muliebrity-official': true,
    'advanced-virility-corporate': true,
    'advanced-virility-casual-home': true,
    'advanced-virility-casual-day': true,
    'advanced-virility-casual-night': true,
    'advanced-virility-official': true,
  };

  var SCHOOL_1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  var SCHOOL_2 = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28];
  var SCHOOL_3 = [29, 30, 31, 32, 33, 34, 35, 36];
  var SCHOOL_4 = [37, 38, 39, 40, 41, 42, 43, 44];

  function subscriptionEndMs(subscription) {
    if (!subscription || !subscription.endDate) return 0;
    if (subscription.endDate.toMillis) return subscription.endDate.toMillis();
    if (subscription.endDate._seconds) return subscription.endDate._seconds * 1000;
    return 0;
  }

  function resolveEffectiveTier(userData) {
    if (!userData) return 'free';
    if (userData.role === 'admin') return 'elite';
    var sub = userData.subscription || {};
    var activeSub =
      sub.status === 'active' && subscriptionEndMs(sub) > Date.now()
        ? String(sub.tier || '').toLowerCase()
        : '';
    return activeSub || String(userData.tier || 'free').toLowerCase();
  }

  function userGroups(userData) {
    return Array.isArray(userData && userData.groups)
      ? userData.groups.filter(function (id) { return typeof id === 'string' && id; })
      : [];
  }

  function isCourseNoComplete(completed, courseNo) {
    var prefix = 'course-' + courseNo + '-';
    return completed.some(function (id) {
      return typeof id === 'string' && (id === prefix || id.indexOf(prefix) === 0);
    });
  }

  function countCompleteNos(completed, nos) {
    return nos.filter(function (n) { return isCourseNoComplete(completed, n); }).length;
  }

  function hasAdvancedExpressionAccess(userData) {
    if (!userData) return false;
    if (userData.role === 'admin') return true;
    if (userData.access && userData.access.advancedExpressionRevoked === true) return false;

    var groups = userGroups(userData);
    var hasAdvGroup = groups.some(function (g) { return ADVANCED_EXPRESSION_GROUP_SET[g]; });
    if (!hasAdvGroup) return false;

    var docTier = String(userData.tier || 'free').toLowerCase();
    var sub = userData.subscription || {};
    var subTier =
      sub.status === 'active' && subscriptionEndMs(sub) > Date.now()
        ? String(sub.tier || '').toLowerCase()
        : '';
    if ((docTier === 'elite' || subTier === 'elite') && userData.staffAccess && userData.staffAccess.advancedExpression === true) {
      return true;
    }
    if (userData.progress && userData.progress.advancedExpressionUnlocked === true) return true;

    var completed =
      userData.progress && Array.isArray(userData.progress.completedCourses)
        ? userData.progress.completedCourses
        : [];
    var premium =
      countCompleteNos(completed, SCHOOL_1) >= SCHOOL_1.length &&
      countCompleteNos(completed, SCHOOL_2) >= SCHOOL_2.length;
    var s3 = countCompleteNos(completed, SCHOOL_3) >= SCHOOL_3.length;
    var s4 = countCompleteNos(completed, SCHOOL_4) >= 4;
    return premium && s3 && s4;
  }

  function isAdvancedExpressionBoard(boardId, boardData) {
    if (boardId && MV_HOUSE_BOARD_IDS[boardId]) return true;
    var gid = boardData && boardData.groupId;
    return !!(gid && ADVANCED_EXPRESSION_GROUP_SET[gid]);
  }

  function userCanReceiveBoardNotification(userData, boardId, boardData) {
    if (!userData) return false;
    if (userData.role === 'admin') return true;

    var gid = (boardData && boardData.groupId) || null;
    var requiredTier = String((boardData && boardData.requiredTier) || 'free').toLowerCase();
    var groups = userGroups(userData);

    if (gid && groups.indexOf(gid) < 0) return false;

    var userLevel = TIER_ORDER[resolveEffectiveTier(userData)] || 0;
    var needLevel = TIER_ORDER[requiredTier] || 0;
    if (userLevel < needLevel) return false;

    if (isAdvancedExpressionBoard(boardId, boardData || {})) {
      return hasAdvancedExpressionAccess(userData);
    }

    return true;
  }

  root.NotificationAccess = {
    TIER_ORDER: TIER_ORDER,
    resolveEffectiveTier: resolveEffectiveTier,
    hasAdvancedExpressionAccess: hasAdvancedExpressionAccess,
    isAdvancedExpressionBoard: isAdvancedExpressionBoard,
    userCanReceiveBoardNotification: userCanReceiveBoardNotification,
  };
})(typeof window !== 'undefined' ? window : globalThis);
