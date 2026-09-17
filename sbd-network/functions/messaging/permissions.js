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

function isBillingTier(tier) {
  const t = normalizeTier(tier);
  return t === 'foundation' || t === 'premium' || t === 'elite';
}

function subscriptionEndMs(sub) {
  if (!sub || !sub.endDate) return 0;
  const end = sub.endDate;
  if (typeof end.toMillis === 'function') return end.toMillis();
  if (typeof end.toDate === 'function') return end.toDate().getTime();
  if (typeof end.seconds === 'number') return end.seconds * 1000;
  if (typeof end._seconds === 'number') return end._seconds * 1000;
  if (end instanceof Date) return end.getTime();
  const n = Number(end);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isSubscriptionCurrentlyActive(sub, nowMs) {
  if (!sub) return false;
  let status = String(sub.status || '').toLowerCase();
  if (status === 'canceled') status = 'cancelled';
  if (status && status !== 'active' && status !== 'trialing') return false;
  if (!status) return false;
  const end = subscriptionEndMs(sub);
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  if (end > 0 && end <= now) return false;
  return true;
}

function resolveMessagingTier(userData, nowMs) {
  const d = userData || {};
  const docTier = normalizeTier(d.tier);
  const sub = d.subscription || null;
  if (!isSubscriptionCurrentlyActive(sub, nowMs)) return docTier;
  const subTier = normalizeTier(sub.tier);
  if (!isBillingTier(subTier)) return docTier;
  return tierLevel(subTier) > tierLevel(docTier) ? subTier : docTier;
}

function userFromDoc(uid, data) {
  const d = data || {};
  const tier = resolveMessagingTier(d);
  return {
    uid,
    tier,
    tierLevel: tierLevel(tier),
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
    const resolved = p && p.tier ? normalizeTier(p.tier) : 'foundation';
    const lvl = tierLevel(resolved);
    if (lvl < minLevel) {
      minLevel = lvl;
      minTier = resolved;
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

function shouldRaiseConversationSecurity(storedLevel, liveLevel) {
  if (typeof liveLevel !== 'number' || liveLevel < 0) return false;
  if (typeof storedLevel !== 'number' || storedLevel < 0) return true;
  return liveLevel > storedLevel;
}

module.exports = {
  TIER_ORDER,
  TIER_LEVEL,
  normalizeTier,
  tierLevel,
  resolveMessagingTier,
  isSubscriptionCurrentlyActive,
  shouldRaiseConversationSecurity,
  userFromDoc,
  calculateConversationSecurityLevel,
  canDiscoverUser,
  canSendContentToConversation,
  validateMessageSend,
};
