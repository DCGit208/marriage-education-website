/**
 * Formation-governed messaging permissions (server-side source of truth).
 * Used by Cloud Functions and mirrored in client for UX hints only.
 */

const TIER_ORDER = [
  'foundation',
  'free',
  'premium',
  'elite',
  'ambassador',
  'senior_ambassador',
  'rd',
  'admin',
];

const TIER_LEVEL = {
  foundation: 0,
  free: 0,
  premium: 1,
  elite: 2,
  ambassador: 3,
  senior_ambassador: 4,
  rd: 5,
  admin: 6,
};

function normalizeTier(tier) {
  const t = String(tier || 'foundation').toLowerCase();
  if (t === 'free') return 'foundation';
  if (TIER_LEVEL[t] !== undefined) return t;
  return 'foundation';
}

function tierLevel(tier) {
  const t = normalizeTier(tier);
  if (t === 'admin') return TIER_LEVEL.admin;
  return TIER_LEVEL[t] ?? 0;
}

function userFromDoc(uid, data) {
  const d = data || {};
  return {
    uid,
    tier: normalizeTier(d.tier),
    tierLevel: typeof d.tierLevel === 'number' ? d.tierLevel : tierLevel(d.tier),
    ambassadorRole: d.ambassadorRole || null,
    messagingEnabled: d.messagingEnabled !== false,
    mentor: !!d.mentor,
    role: d.role || 'member',
  };
}

function calculateConversationSecurityLevel(participants) {
  if (!participants || !participants.length) return { tier: 'foundation', level: 0 };
  let minLevel = 99;
  let minTier = 'foundation';
  participants.forEach(function (p) {
    const lvl = typeof p.tierLevel === 'number' ? p.tierLevel : tierLevel(p.tier);
    if (lvl < minLevel) {
      minLevel = lvl;
      minTier = normalizeTier(p.tier);
    }
  });
  return { tier: minTier, level: minLevel };
}

function canDiscoverUser(viewer, target) {
  if (!viewer || !target) return false;
  if (viewer.uid === target.uid) return false;
  if (!viewer.messagingEnabled || !target.messagingEnabled) return false;
  if (viewer.role === 'admin' || target.role === 'admin') return true;
  const vl = tierLevel(viewer.tier);
  const tl = tierLevel(target.tier);
  if (vl >= tl) return true;
  if (target.mentor) return true;
  return false;
}

function canSendContentToConversation(contentTier, conversationSecurityLevel) {
  return tierLevel(contentTier) <= conversationSecurityLevel;
}

function validateMessageSend({ sender, conversationSecurity, contentTier, messageType }) {
  if (!sender.messagingEnabled) {
    return { ok: false, code: 'messaging_disabled', message: 'Messaging is disabled for this account.' };
  }
  const ct = normalizeTier(contentTier);
  if (!canSendContentToConversation(ct, conversationSecurity.level)) {
    return {
      ok: false,
      code: 'content_tier_blocked',
      message: 'This content requires ' + conversationSecurity.tier + ' formation clearance in this thread.',
    };
  }
  if (messageType === 'board_share' || messageType === 'courseware') {
    if (tierLevel(ct) > conversationSecurity.level) {
      return { ok: false, code: 'share_blocked', message: 'Cannot share advanced formation assets in this thread.' };
    }
  }
  return { ok: true };
}

module.exports = {
  TIER_ORDER,
  TIER_LEVEL,
  normalizeTier,
  tierLevel,
  userFromDoc,
  calculateConversationSecurityLevel,
  canDiscoverUser,
  canSendContentToConversation,
  validateMessageSend,
};
