const admin = require('firebase-admin');
const perms = require('./permissions');

function directConversationId(a, b) {
  return 'fc_' + [a, b].sort().join('_');
}

async function loadUser(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  return perms.userFromDoc(uid, snap.data());
}

async function ensureDirectConversation(db, senderUid, receiverUid) {
  const sender = await loadUser(db, senderUid);
  const receiver = await loadUser(db, receiverUid);
  if (!sender || !receiver) {
    throw new Error('Both users must have profiles.');
  }
  if (!perms.canDiscoverUser(sender, receiver)) {
    throw new Error('Formation policy blocks this conversation.');
  }
  const security = perms.calculateConversationSecurityLevel([sender, receiver]);
  const convId = directConversationId(senderUid, receiverUid);
  const ref = db.collection('formation_conversations').doc(convId);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      conversationId: convId,
      participants: [senderUid, receiverUid].sort(),
      participantIds: [senderUid, receiverUid].sort(),
      securityTier: security.tier,
      securityLevel: security.level,
      type: 'direct',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastPreview: '',
    });
  }
  return { convId, security, sender, receiver };
}

module.exports = {
  directConversationId,
  ensureDirectConversation,
  loadUser,
};
