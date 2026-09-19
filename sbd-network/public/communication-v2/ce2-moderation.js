/**
 * CE2 Phase 2 — moderation helpers (client)
 * Group hallway roles: host / facilitator / member (legacy creator → host).
 */
(function (global) {
  'use strict';

  var ROLES = {
    HOST: 'host',
    FACILITATOR: 'facilitator',
    MEMBER: 'member',
  };

  function isMessagingEnabled(userData) {
    if (!userData) return true;
    return userData.messagingEnabled !== false;
  }

  /**
   * Resolve a member doc role. Legacy `creator` and a missing role on the
   * group creator both count as host so existing circles keep a steward.
   */
  function resolveMemberRole(memberData, groupData, uid) {
    var raw = memberData && memberData.role != null ? String(memberData.role) : '';
    raw = raw.toLowerCase();
    if (raw === 'host' || raw === 'creator') return ROLES.HOST;
    if (raw === 'facilitator') return ROLES.FACILITATOR;
    if (!raw && uid && groupData && groupData.createdBy === uid) {
      return ROLES.HOST;
    }
    return ROLES.MEMBER;
  }

  function roleLabel(role) {
    if (role === ROLES.HOST) return 'Host';
    if (role === ROLES.FACILITATOR) return 'Facilitator';
    return 'Member';
  }

  function isPlatformAdmin(user) {
    return !!(user && user.isAdmin);
  }

  function isGroupHost(role, user) {
    return isPlatformAdmin(user) || role === ROLES.HOST;
  }

  function isGroupStaff(role, user) {
    return isGroupHost(role, user) || role === ROLES.FACILITATOR;
  }

  function canPinAnnouncement(role, user, conversationType) {
    if (conversationType && conversationType !== 'group') return true;
    return isGroupStaff(role, user);
  }

  function canModerateMessage(role, user, conversationType) {
    if (conversationType && conversationType !== 'group') return false;
    return isGroupStaff(role, user);
  }

  function canChangeMemberRole(actorRole, actorUser, targetRole, nextRole) {
    if (!isGroupHost(actorRole, actorUser)) return false;
    if (targetRole === ROLES.HOST) return false;
    if (nextRole !== ROLES.FACILITATOR && nextRole !== ROLES.MEMBER) return false;
    return true;
  }

  function canRemoveMember(actorRole, actorUser, targetRole, actorUid, targetUid) {
    if (!targetUid || actorUid === targetUid) return false;
    if (isPlatformAdmin(actorUser)) return true;
    if (actorRole === ROLES.HOST) return targetRole !== ROLES.HOST;
    if (actorRole === ROLES.FACILITATOR) return targetRole === ROLES.MEMBER;
    return false;
  }

  function selfJoinRoleValid(role) {
    return role == null || role === '' || role === ROLES.MEMBER;
  }

  /**
   * Group content floor = lowest formation tier among members (cap at requiredTier minimum).
   * @param {firebase.firestore.Firestore} db
   * @param {string} groupId
   * @param {string} requiredTier
   * @param {object} governance Ce2Governance
   */
  async function resolveGroupSecurityFromMembers(db, groupId, requiredTier, governance) {
    var fallback = governance.groupSecurityFromRequiredTier(requiredTier || 'foundation');
    if (!db || !groupId) return fallback;

    var membersSnap = await db
      .collection('communicationGroups')
      .doc(groupId)
      .collection('members')
      .limit(50)
      .get();

    if (membersSnap.empty) return fallback;

    var participants = [];
    var fetches = [];
    membersSnap.forEach(function (doc) {
      fetches.push(
        db
          .collection('users')
          .doc(doc.id)
          .get()
          .then(function (udoc) {
            var d = udoc.exists ? udoc.data() : {};
            var tier =
              governance && governance.resolveMessagingTier
                ? governance.resolveMessagingTier(d)
                : d.tier || 'foundation';
            participants.push({ tier: tier });
          })
          .catch(function () {
            participants.push({ tier: 'foundation' });
          })
      );
    });
    await Promise.all(fetches);

    var memberFloor = governance.calculateConversationSecurityLevel(participants);
    var requiredFloor = governance.groupSecurityFromRequiredTier(requiredTier || 'foundation');
    if (memberFloor.level >= requiredFloor.level) return memberFloor;
    return requiredFloor;
  }

  global.Ce2Moderation = {
    isMessagingEnabled: isMessagingEnabled,
    resolveGroupSecurityFromMembers: resolveGroupSecurityFromMembers,
    resolveMemberRole: resolveMemberRole,
    roleLabel: roleLabel,
    isGroupHost: isGroupHost,
    isGroupStaff: isGroupStaff,
    canPinAnnouncement: canPinAnnouncement,
    canModerateMessage: canModerateMessage,
    canChangeMemberRole: canChangeMemberRole,
    canRemoveMember: canRemoveMember,
    selfJoinRoleValid: selfJoinRoleValid,
    ROLES: ROLES,
    VERSION: 4,
  };
})(typeof window !== 'undefined' ? window : global);
