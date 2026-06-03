'use strict';

const SCHOOL_1_COURSE_NOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const SCHOOL_2_COURSE_NOS = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28];
const SCHOOL_3_COURSE_NOS = [29, 30, 31, 32, 33, 34, 35, 36];
const SCHOOL_4_COURSE_NOS = [37, 38, 39, 40, 41, 42, 43, 44];
const SCHOOL_4_MIN_COMPLETE = 4;

const ADVANCED_EXPRESSION_GROUP_IDS = [
  'advanced-muliebrity-training-school',
  'z8lmnHLoFUBBZaRp2Vdd',
];

const ADVANCED_EXPRESSION_GROUP_SET = new Set(ADVANCED_EXPRESSION_GROUP_IDS);

function normalizeTierSlug(tier) {
  if (!tier) return 'free';
  return String(tier).toLowerCase().trim();
}

function subscriptionEndMs(subscription) {
  if (!subscription?.endDate) return 0;
  if (subscription.endDate.toMillis) return subscription.endDate.toMillis();
  if (subscription.endDate._seconds) return subscription.endDate._seconds * 1000;
  return 0;
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
    sub && isSubscriptionCurrentlyActive(sub)
      ? normalizeTierSlug(sub.tier || 'free')
      : null;
  return docTier === 'elite' || subTier === 'elite';
}

function isAdminGrantedElite(userData) {
  if (!userData || !hasEliteTier(userData)) return false;
  if (userData.staffAccess?.advancedExpression === true) return true;
  const sub = userData.subscription;
  if (sub?.source === 'admin') return true;
  if (!sub || sub.status !== 'active' || normalizeTierSlug(sub.tier) !== 'elite') return false;
  return subscriptionEndMs(sub) >= new Date('2090-01-01').getTime();
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
  if (isAdminGrantedElite(userData)) return true;
  if (userData.progress?.advancedExpressionUnlocked === true) return true;
  return computeFormationMilestoneMet(userData);
}

function eliteBillingGroupsOnly(eliteGroups) {
  return (eliteGroups || []).filter((id) => !ADVANCED_EXPRESSION_GROUP_SET.has(id));
}

module.exports = {
  SCHOOL_4_MIN_COMPLETE,
  ADVANCED_EXPRESSION_GROUP_IDS,
  ADVANCED_EXPRESSION_GROUP_SET,
  hasEliteTier,
  isAdminGrantedElite,
  hasPremiumArcComplete,
  hasSchool3Complete,
  hasSchool4HalfComplete,
  computeFormationMilestoneMet,
  hasAdvancedExpressionAccess,
  eliteBillingGroupsOnly,
};
