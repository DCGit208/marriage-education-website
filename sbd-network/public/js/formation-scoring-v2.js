/* ═══════════════════════════════════════════════════════════════════
 * Formation Intelligence System v2 (FIS_V2)
 * Client-side scoring module — parallel to old formationScore system.
 *
 * Writes to: users/{uid}.formationProfile_v2  (NEVER formationScore)
 * Exposed as: window.FIS_V2
 * ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const WEIGHTS = {
    formation:   0.35,
    engagement:  0.25,
    expression:  0.20,
    consistency: 0.10,
    validation:  0.10,
  };

  // ─── NORMALIZATION ────────────────────────────────────────────────
  function normalize(value, maxExpected) {
    if (!maxExpected) return 0;
    return Math.min((value / maxExpected) * 100, 100);
  }

  // ─── TIME DECAY ───────────────────────────────────────────────────
  function applyDecay(score, lastActiveDays) {
    if (lastActiveDays > 60) return score * 0.3;
    if (lastActiveDays > 30) return score * 0.6;
    return score;
  }

  // ─── FORMATION (35%) ─────────────────────────────────────────────
  function calcFormation(data) {
    return (data.school1Progress * 0.5) + (data.school2Progress * 0.5);
  }

  // ─── ENGAGEMENT (25%) ─────────────────────────────────────────────
  function calcEngagement(data, lastActiveDays) {
    // Anti-gaming: weekly caps applied before normalization
    const posts    = Math.min(data.postsLast7Days    || 0, 5);
    const comments = Math.min(data.commentsLast7Days || 0, 20);
    const likes    = data.likesReceivedTotal || 0;
    const depth    = data.discussionDepth    || 0;

    const raw =
      (normalize(posts,    5)   * 0.30) +
      (normalize(comments, 20)  * 0.25) +
      (normalize(likes,    200) * 0.25) +
      (normalize(depth,    50)  * 0.20);

    return applyDecay(raw, lastActiveDays);
  }

  // ─── EXPRESSION — MV HOUSE (20%) ──────────────────────────────────
  function calcExpression(data) {
    return (
      (normalize(data.recentPurchases       || 0, 10)  * 0.30) +
      (normalize(data.purchaseCount         || 0, 50)  * 0.20) +
      (normalize(data.wardrobeCategoryCount || 0, 5)   * 0.20) +
      (normalize(data.wardrobeCompleteness  || 0, 100) * 0.15) +
      (normalize(data.customizations        || 0, 10)  * 0.15)
    );
  }

  // ─── CONSISTENCY (10%) ────────────────────────────────────────────
  function calcConsistency(data) {
    return normalize(data.activeDaysLast30 || 0, 30);
  }

  // ─── VALIDATION (10%) ─────────────────────────────────────────────
  function calcValidation(data) {
    const a = normalize(data.certificationCount   || 0, 10);
    const b = normalize(data.coachingSessionCount || 0, 10);
    return Math.min(100, (a + b) / 2);
  }

  // ─── GATHER ACTIVITY DATA (CLIENT-SIDE FIRESTORE READS) ──────────
  async function gatherActivityData(uid, userData) {
    const db = window.db;
    if (!db) throw new Error('[FIS_V2] Firestore not available');

    // Activity aggregates written by Cloud Function event triggers
    const agg = userData.activityAggregates || {};

    // School progress: use already-cached formationScore (old system)
    const cached = userData.formationScore || {};
    const school1Progress = cached.school1Pct || 0;
    const school2Progress = cached.school2Pct || 0;

    // Days since last active
    const lastActiveTs = userData.lastActive || userData.lastSeen;
    const lastActiveDays = lastActiveTs
      ? Math.floor(
          (Date.now() - (lastActiveTs.toMillis ? lastActiveTs.toMillis() : new Date(lastActiveTs).getTime()))
          / 86400000
        )
      : 999;

    // Wardrobe completeness from wardrobes/{uid} doc
    let wardrobeCompleteness = agg.wardrobeCompleteness || 0;
    try {
      const wardSnap = await db.collection('wardrobes').doc(uid).get();
      if (wardSnap.exists) {
        wardrobeCompleteness = wardSnap.data().wardrobeCompleteness || wardSnap.data().completeness || wardrobeCompleteness;
      }
    } catch (_) { /* best-effort */ }

    return {
      school1Progress,
      school2Progress,
      postsLast7Days:        agg.postsLast7Days        || 0,
      commentsLast7Days:     agg.commentsLast7Days      || 0,
      likesReceivedTotal:    agg.likesReceivedTotal     || 0,
      discussionDepth:       agg.discussionDepth        || 0,
      recentPurchases:       agg.recentPurchases        || 0,
      purchaseCount:         agg.purchaseCount          || 0,
      wardrobeCategoryCount: agg.wardrobeCategoryCount  || 0,
      wardrobeCompleteness,
      customizations:        agg.customizations         || 0,
      activeDaysLast30:      agg.activeDaysLast30       || 0,
      certificationCount:    agg.certificationCount     || 0,
      coachingSessionCount:  agg.coachingSessionCount   || 0,
      lastActiveDays,
    };
  }

  // ─── CALCULATE + SAVE ─────────────────────────────────────────────
  async function calculateAndSave(uid, userData, activityData) {
    const db = window.db;
    if (!db) throw new Error('[FIS_V2] Firestore not available');

    const data = activityData || await gatherActivityData(uid, userData);

    const formation   = Math.round(calcFormation(data));
    const engagement  = Math.round(calcEngagement(data, data.lastActiveDays));
    const expression  = Math.round(calcExpression(data));
    const consistency = Math.round(calcConsistency(data));
    const validation  = Math.round(calcValidation(data));

    const totalScore = Math.round(
      (formation   * WEIGHTS.formation)   +
      (engagement  * WEIGHTS.engagement)  +
      (expression  * WEIGHTS.expression)  +
      (consistency * WEIGHTS.consistency) +
      (validation  * WEIGHTS.validation)
    );

    const profile = {
      formation,
      engagement,
      expression,
      consistency,
      validation,
      totalScore,
      expressionGated:  expression < 20,
      school1Progress:  data.school1Progress,
      school2Progress:  data.school2Progress,
      lastUpdated:      firebase.firestore.FieldValue.serverTimestamp(),
    };

    // Write non-blocking — don't hold up the render on save
    db.collection('users').doc(uid).update({ formationProfile_v2: profile })
      .catch(err => console.warn('[FIS_V2] save failed:', err.code));

    return profile;
  }

  // ─── ACCESS LEVEL (v2-aware) ──────────────────────────────────────
  function getAccessLevel(totalScore, tier, role) {
    if (role === 'admin') {
      return { level: 'full', badge: 'Admin', priority: false };
    }
    if (tier === 'elite') {
      const covenantReady = totalScore >= 85;
      return { level: 'full', badge: covenantReady ? 'Covenant Ready' : 'Elite', priority: covenantReady };
    }
    if (tier === 'premium') {
      if (totalScore >= 60) return { level: 'limited', badge: 'Premium', priority: false };
      return { level: 'none', badge: 'Locked', priority: false };
    }
    return { level: 'none', badge: 'Locked', priority: false };
  }

  // ─── PUBLIC API ───────────────────────────────────────────────────
  window.FIS_V2 = {
    calculateAndSave,
    gatherActivityData,
    getAccessLevel,
    normalize,
    applyDecay,
  };
})();
