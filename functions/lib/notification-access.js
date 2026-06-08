'use strict';

const { hasAdvancedExpressionAccess } = require('./advanced-expression-access');

const TIER_ORDER = { free: 0, foundation: 1, premium: 2, elite: 3 };

const MV_HOUSE_BOARD_IDS = new Set([
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
]);

const ADVANCED_EXPRESSION_GROUP_SET = new Set([
  'advanced-muliebrity-training-school',
  'z8lmnHLoFUBBZaRp2Vdd',
]);

function subscriptionEndMs(subscription) {
  if (!subscription?.endDate) return 0;
  if (subscription.endDate.toMillis) return subscription.endDate.toMillis();
  if (subscription.endDate._seconds) return subscription.endDate._seconds * 1000;
  return 0;
}

function resolveEffectiveTier(userData) {
  if (!userData) return 'free';
  if (userData.role === 'admin') return 'elite';
  const sub = userData.subscription || {};
  const activeSub =
    sub.status === 'active' && subscriptionEndMs(sub) > Date.now()
      ? String(sub.tier || '').toLowerCase()
      : '';
  return activeSub || String(userData.tier || 'free').toLowerCase();
}

function isAdvancedExpressionBoard(boardId, boardData) {
  if (boardId && MV_HOUSE_BOARD_IDS.has(boardId)) return true;
  const gid = boardData?.groupId;
  return !!(gid && ADVANCED_EXPRESSION_GROUP_SET.has(gid));
}

function userCanReceiveBoardNotification(userData, boardId, boardData) {
  if (!userData) return false;
  if (userData.role === 'admin') return true;

  const gid = boardData?.groupId || null;
  const requiredTier = String(boardData?.requiredTier || 'free').toLowerCase();
  const groups = Array.isArray(userData.groups) ? userData.groups : [];

  if (gid && !groups.includes(gid)) return false;

  const userLevel = TIER_ORDER[resolveEffectiveTier(userData)] ?? 0;
  const needLevel = TIER_ORDER[requiredTier] ?? 0;
  if (userLevel < needLevel) return false;

  if (isAdvancedExpressionBoard(boardId, boardData || {})) {
    return hasAdvancedExpressionAccess(userData);
  }

  return true;
}

module.exports = {
  userCanReceiveBoardNotification,
};
