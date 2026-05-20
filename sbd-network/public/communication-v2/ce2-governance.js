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

  /** Formation tier only — admin role does not raise conversation floor. */
  function formationRankFromParticipant(p) {
    if (!p) return 0;
    if (typeof p.tierLevel === 'number' && !Number.isNaN(p.tierLevel)) {
      return p.tierLevel;
    }
    return tierRank(p.tier);
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
    tierRankFromParticipant: tierRankFromParticipant,
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
    VERSION: 4,
  };
})(typeof window !== 'undefined' ? window : global);
