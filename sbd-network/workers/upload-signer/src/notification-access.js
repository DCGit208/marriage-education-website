/** Worker copy — keep in sync with public/js/notification-access.js */

const TIER_ORDER = { free: 0, foundation: 1, premium: 2, elite: 3 };

const ADVANCED_EXPRESSION_GROUP_SET = {
  'advanced-muliebrity-training-school': true,
  'z8lmnHLoFUBBZaRp2Vdd': true,
};

const MV_HOUSE_BOARD_IDS = {
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

const SCHOOL_1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const SCHOOL_2 = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28];
const SCHOOL_3 = [29, 30, 31, 32, 33, 34, 35, 36];
const SCHOOL_4 = [37, 38, 39, 40, 41, 42, 43, 44];

export function parseFirestoreValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) {
    return (v.arrayValue.values || []).map(parseFirestoreValue).filter(x => x != null);
  }
  if ('mapValue' in v) return parseFirestoreMap(v.mapValue.fields || {});
  return null;
}

export function parseFirestoreMap(fields) {
  const out = {};
  Object.keys(fields || {}).forEach(k => {
    out[k] = parseFirestoreValue(fields[k]);
  });
  return out;
}

function subscriptionEndMs(subscription) {
  if (!subscription?.endDate) return 0;
  if (typeof subscription.endDate === 'string') return Date.parse(subscription.endDate) || 0;
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

function isCourseNoComplete(completed, courseNo) {
  const prefix = `course-${courseNo}-`;
  return completed.some(
    id => typeof id === 'string' && (id === prefix || id.startsWith(prefix))
  );
}

function countCompleteNos(completed, nos) {
  return nos.filter(n => isCourseNoComplete(completed, n)).length;
}

function hasAdvancedExpressionAccess(userData) {
  if (!userData) return false;
  if (userData.role === 'admin') return true;
  if (userData.access?.advancedExpressionRevoked === true) return false;

  const groups = Array.isArray(userData.groups) ? userData.groups : [];
  if (!groups.some(g => ADVANCED_EXPRESSION_GROUP_SET[g])) return false;

  const docTier = String(userData.tier || 'free').toLowerCase();
  const sub = userData.subscription || {};
  const subTier =
    sub.status === 'active' && subscriptionEndMs(sub) > Date.now()
      ? String(sub.tier || '').toLowerCase()
      : '';
  if ((docTier === 'elite' || subTier === 'elite') && userData.staffAccess?.advancedExpression === true) {
    return true;
  }
  if (userData.progress?.advancedExpressionUnlocked === true) return true;

  const completed = Array.isArray(userData.progress?.completedCourses)
    ? userData.progress.completedCourses
    : [];
  const premium =
    countCompleteNos(completed, SCHOOL_1) >= SCHOOL_1.length &&
    countCompleteNos(completed, SCHOOL_2) >= SCHOOL_2.length;
  const s3 = countCompleteNos(completed, SCHOOL_3) >= SCHOOL_3.length;
  const s4 = countCompleteNos(completed, SCHOOL_4) >= 4;
  return premium && s3 && s4;
}

function isAdvancedExpressionBoard(boardId, boardData) {
  if (boardId && MV_HOUSE_BOARD_IDS[boardId]) return true;
  const gid = boardData?.groupId;
  return !!(gid && ADVANCED_EXPRESSION_GROUP_SET[gid]);
}

export function userCanReceiveBoardNotification(userData, boardId, boardData) {
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
