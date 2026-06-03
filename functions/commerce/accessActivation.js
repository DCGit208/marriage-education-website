/**
 * Sandbox access activation — books, 60-day formation, courseware flags.
 * Does NOT modify production subscription docs unless commerce.sandbox_mode=false.
 */

const { COLLECTIONS, ACCESS_RULES, SANDBOX_MODE } = require('./config');

async function activatePurchaseAccess(db, admin, {
  uid,
  productType,
  productId,
  transactionId
}) {
  const rules = ACCESS_RULES[productType];
  if (!rules) {
    return { activated: false, reason: 'no_access_rules' };
  }

  const now = Date.now();
  const formationEndsAt = rules.formationAccessDays
    ? admin.firestore.Timestamp.fromMillis(now + rules.formationAccessDays * 24 * 60 * 60 * 1000)
    : null;

  const grantId = `grant_${transactionId}`;
  const grant = {
    grantId,
    uid,
    productType,
    productId,
    transactionId,
    formationAccessDays: rules.formationAccessDays || 0,
    formationEndsAt,
    permanentReader: !!rules.permanentReader,
    unlockCourseware: !!rules.unlockCourseware,
    subscriptionTier: rules.subscriptionTier || null,
    sandbox: SANDBOX_MODE,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await db.collection(COLLECTIONS.accessGrants).doc(grantId).set(grant);

  if (SANDBOX_MODE) {
    await db.collection('commerce_v1_sandbox_users').doc(uid).set(
      {
        uid,
        lastGrantId: grantId,
        formationEndsAt,
        permanentReader: grant.permanentReader,
        unlockCourseware: grant.unlockCourseware,
        subscriptionTier: grant.subscriptionTier,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    return { activated: true, grantId, mode: 'sandbox' };
  }

  return { activated: true, grantId, mode: 'production_not_wired' };
}

module.exports = {
  activatePurchaseAccess
};
