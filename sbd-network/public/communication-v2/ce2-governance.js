/**
 * CE2 Formation Governance Layer (Phases 1 + 4)
 * ROLLBACK: set CE2_GOVERNANCE_V1_ENABLED = false and redeploy hosting.
 */
(function (global) {
  'use strict';

  /** @type {boolean} Instant rollback switch — do not remove */
  var CE2_GOVERNANCE_V1_ENABLED = true;

  /** Formation tier order (low → high). Admin role is not a formation tier. */
  var TIER_RANK = {
    foundation: 0,
    free: 0,
    premium: 1,
    elite: 2,
    ambassador: 3,
    senior_ambassador: 4,
    rd: 5,
  };

  var TIER_ORDER = [
    'foundation',
    'free',
    'premium',
    'elite',
    'ambassador',
    'senior_ambassador',
    'rd',
  ];

  var CLASS_RANK = {
    public: 0,
    foundation: 0,
    premium: 1,
    elite: 2,
    ambassador: 3,
    senior_ambassador: 4,
    rd: 5,
    mentor: 6,
  };

  function normalizeTier(tier) {
    var t = (tier && String(tier).toLowerCase()) || 'foundation';
    if (t === 'free') return 'foundation';
    if (TIER_RANK[t] !== undefined) return t;
    return 'foundation';
  }

  function tierRank(tier) {
    return TIER_RANK[normalizeTier(tier)] || 0;
  }

  function isBillingTier(tier) {
    var t = normalizeTier(tier);
    return t === 'foundation' || t === 'premium' || t === 'elite';
  }

  function subscriptionEndMs(sub) {
    if (!sub || !sub.endDate) return 0;
    var end = sub.endDate;
    try {
      if (typeof end.toMillis === 'function') return end.toMillis();
      if (typeof end.toDate === 'function') return end.toDate().getTime();
    } catch (_) {}
    if (typeof end.seconds === 'number') return end.seconds * 1000;
    if (typeof end._seconds === 'number') return end._seconds * 1000;
    if (end instanceof Date) return end.getTime();
    var n = Number(end);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function isSubscriptionCurrentlyActive(sub, nowMs) {
    if (!sub) return false;
    var status = String(sub.status || '').toLowerCase();
    if (status === 'canceled') status = 'cancelled';
    if (status && status !== 'active' && status !== 'trialing') return false;
    if (!status) return false;
    var end = subscriptionEndMs(sub);
    var now = typeof nowMs === 'number' ? nowMs : Date.now();
    if (end > 0 && end <= now) return false;
    return true;
  }

  /**
   * Messaging rank for a user doc.
   * Paid Elite lives on subscription.tier for many members; users.tier can lag.
   * Ambassador / senior_ambassador / rd ranks on users.tier stay higher than billing.
   * Do not treat raw users.tierLevel as messaging rank (that field is formation progress).
   */
  function resolveMessagingTier(userData, nowMs) {
    var d = userData || {};
    var docTier = normalizeTier(d.tier);
    var sub = d.subscription || null;
    if (!isSubscriptionCurrentlyActive(sub, nowMs)) return docTier;
    var subTier = normalizeTier(sub.tier);
    if (!isBillingTier(subTier)) return docTier;
    return tierRank(subTier) > tierRank(docTier) ? subTier : docTier;
  }

  /** True when live billing or users.tier grants Elite messaging rank. */
  function hasEliteMessagingAccess(userData, nowMs) {
    return tierRank(resolveMessagingTier(userData, nowMs)) >= 2;
  }

  /**
   * Conversation floor is min(participants). Raise stored floor when live
   * resolved tiers would be higher (stale users.tier wrote premium on Elite DMs).
   * Never lower — that would clamp existing Elite-classified history.
   */
  function shouldRaiseConversationSecurity(storedLevel, liveLevel) {
    if (typeof liveLevel !== 'number' || liveLevel < 0) return false;
    if (typeof storedLevel !== 'number' || storedLevel < 0) return true;
    return liveLevel > storedLevel;
  }

  /**
   * Read eligibility: personal rank vs classification.
   * Conversation securityLevel is a send-side clamp, not a receive filter.
   */
  function canReadClassificationAsUser(userData, classification, extras) {
    var x = extras || {};
    if (x.isAdmin) return true;
    var c = (classification && String(classification).toLowerCase()) || 'public';
    if (c === 'public') return true;
    if (c === 'mentor') return !!(x.mentor || (userData && userData.mentor));
    return tierRank(resolveMessagingTier(userData)) >= classRank(c);
  }

  /** Formation tier only — admin role does not raise conversation floor. */
  function formationRankFromParticipant(p) {
    if (!p) return 0;
    if (p.tier) return tierRank(p.tier);
    if (
      typeof p.tierLevel === 'number' &&
      !Number.isNaN(p.tierLevel) &&
      p.tierLevel >= 0 &&
      p.tierLevel <= 5
    ) {
      return p.tierLevel;
    }
    return 0;
  }

  function tierRankFromParticipant(p) {
    return formationRankFromParticipant(p);
  }

  function tierLabelFromRank(rank) {
    if (rank >= 5) return 'rd';
    if (rank >= 4) return 'senior_ambassador';
    if (rank >= 3) return 'ambassador';
    if (rank >= 2) return 'elite';
    if (rank >= 1) return 'premium';
    return 'foundation';
  }

  function tiersAtOrBelowRank(rank) {
    return TIER_ORDER.filter(function (t) {
      return tierRank(t) <= rank;
    });
  }

  function tiersBelowRank(rank) {
    return TIER_ORDER.filter(function (t) {
      return tierRank(t) < rank;
    });
  }

  function classRank(classification) {
    var c = (classification && String(classification).toLowerCase()) || 'public';
    return CLASS_RANK[c] !== undefined ? CLASS_RANK[c] : 99;
  }

  function calculateConversationSecurityLevel(participants) {
    if (!participants || !participants.length) {
      return { tier: 'foundation', level: 0 };
    }
    var minLevel = 99;
    var minRank = 0;
    participants.forEach(function (p) {
      var lvl = formationRankFromParticipant(p);
      if (lvl < minLevel) {
        minLevel = lvl;
        minRank = lvl;
      }
    });
    if (minLevel === 99) minLevel = 0;
    return {
      tier: tierLabelFromRank(minRank),
      level: minLevel,
    };
  }

  function groupSecurityFromRequiredTier(requiredTier) {
    var t = normalizeTier(requiredTier);
    var level = TIER_RANK[t] || 0;
    return { tier: t, level: level };
  }

  function isEnabled() {
    return CE2_GOVERNANCE_V1_ENABLED === true;
  }

  function setEnabled(value) {
    CE2_GOVERNANCE_V1_ENABLED = !!value;
  }

  function classificationAllowedAtFloor(classification, securityLevel) {
    if (typeof securityLevel !== 'number' || securityLevel < 0) return true;
    return classRank(classification) <= securityLevel;
  }

  function clampClassification(classification, securityLevel) {
    if (!classificationAllowedAtFloor(classification, securityLevel)) {
      return tierLabelFromRank(securityLevel);
    }
    return classification;
  }

  function classificationsAtOrBelowFloor(securityLevel) {
    var all = ['public', 'foundation', 'premium', 'elite', 'ambassador', 'senior_ambassador', 'rd', 'mentor'];
    if (typeof securityLevel !== 'number' || securityLevel < 0) return all;
    return all.filter(function (c) {
      return classRank(c) <= securityLevel || (c === 'mentor' && securityLevel >= 6);
    });
  }

  global.Ce2Governance = {
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    normalizeTier: normalizeTier,
    tierRank: tierRank,
    resolveMessagingTier: resolveMessagingTier,
    hasEliteMessagingAccess: hasEliteMessagingAccess,
    shouldRaiseConversationSecurity: shouldRaiseConversationSecurity,
    canReadClassificationAsUser: canReadClassificationAsUser,
    isSubscriptionCurrentlyActive: isSubscriptionCurrentlyActive,
    tierRankFromParticipant: tierRankFromParticipant,
    formationRankFromParticipant: formationRankFromParticipant,
    tierLabelFromRank: tierLabelFromRank,
    tiersAtOrBelowRank: tiersAtOrBelowRank,
    tiersBelowRank: tiersBelowRank,
    TIER_ORDER: TIER_ORDER,
    classRank: classRank,
    calculateConversationSecurityLevel: calculateConversationSecurityLevel,
    groupSecurityFromRequiredTier: groupSecurityFromRequiredTier,
    classificationAllowedAtFloor: classificationAllowedAtFloor,
    clampClassification: clampClassification,
    classificationsAtOrBelowFloor: classificationsAtOrBelowFloor,
    VERSION: 6,
  };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
