const admin = require('firebase-admin');

async function logAudit(db, entry) {
  return db.collection('formation_audit_log').add({
    ...entry,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function suspendMessaging(db, uid, reason, adminUid) {
  await db.collection('users').doc(uid).set({ messagingEnabled: false }, { merge: true });
  await logAudit(db, {
    type: 'suspend_messaging',
    targetUid: uid,
    adminUid,
    reason: reason || '',
  });
}

module.exports = { logAudit, suspendMessaging };
