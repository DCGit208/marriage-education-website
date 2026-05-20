/**
 * CE2 Phase 2 — moderation helpers (client)
 */
(function (global) {
  'use strict';

  function isMessagingEnabled(userData) {
    if (!userData) return true;
    return userData.messagingEnabled !== false;
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
            participants.push({ tier: d.tier || 'foundation' });
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
    VERSION: 2,
  };
})(typeof window !== 'undefined' ? window : global);
