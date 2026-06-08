/**
 * Scheduled + admin notification hygiene.
 */
const functions = require('firebase-functions');
const { userCanReceiveBoardNotification } = require('./lib/notification-access');

const RETENTION_DAYS = 30;
const ANNOUNCEMENT_DAYS = 14;
const BATCH = 400;

function tsMs(ts) {
  if (!ts) return 0;
  if (ts.toMillis) return ts.toMillis();
  if (ts._seconds) return ts._seconds * 1000;
  return 0;
}

async function deleteRefs(db, refs) {
  for (let i = 0; i < refs.length; i += BATCH) {
    const batch = db.batch();
    refs.slice(i, i + BATCH).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function purgeStaleNotifications(db, pageSize = 400, maxDeletes = 5000) {
  const readCutoff = Date.now() - RETENTION_DAYS * 86400000;
  const announceCutoff = Date.now() - ANNOUNCEMENT_DAYS * 86400000;
  let deleted = 0;
  let lastDoc = null;

  while (deleted < maxDeletes) {
    let q = db.collection('notifications').orderBy('timestamp').limit(pageSize);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    const toDelete = [];
    snap.forEach((doc) => {
      const n = doc.data();
      const ms = tsMs(n.timestamp);
      if (!ms) return;
      if (n.type === 'announcement' && ms < announceCutoff) {
        toDelete.push(doc.ref);
      } else if (n.read === true && ms < readCutoff) {
        toDelete.push(doc.ref);
      }
    });

    if (toDelete.length) {
      await deleteRefs(db, toDelete);
      deleted += toDelete.length;
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }

  return { deleted };
}

async function cleanupIneligibleBoardNotifications(db, { dryRun = true, maxScan = 3000 } = {}) {
  const boardCache = new Map();
  const userCache = new Map();
  let scanned = 0;
  let ineligible = 0;
  let deleted = 0;
  let lastDoc = null;

  async function getBoard(boardId) {
    if (boardCache.has(boardId)) return boardCache.get(boardId);
    const doc = await db.collection('boards').doc(boardId).get();
    const data = doc.exists
      ? { groupId: doc.data().groupId || null, requiredTier: doc.data().requiredTier || 'free' }
      : { groupId: null, requiredTier: 'free' };
    boardCache.set(boardId, data);
    return data;
  }

  async function getUser(uid) {
    if (userCache.has(uid)) return userCache.get(uid);
    const doc = await db.collection('users').doc(uid).get();
    const data = doc.exists ? doc.data() : null;
    userCache.set(uid, data);
    return data;
  }

  while (scanned < maxScan) {
    let q = db.collection('notifications').orderBy('timestamp', 'desc').limit(250);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    const toDelete = [];
    for (const doc of snap.docs) {
      scanned += 1;
      const n = doc.data();
      if (!n.boardId || !n.userId) continue;

      const boardMeta = await getBoard(n.boardId);
      const userData = await getUser(n.userId);
      if (userCanReceiveBoardNotification(userData, n.boardId, boardMeta)) continue;

      ineligible += 1;
      toDelete.push(doc.ref);
    }

    if (!dryRun && toDelete.length) {
      await deleteRefs(db, toDelete);
      deleted += toDelete.length;
    } else if (dryRun) {
      deleted += toDelete.length;
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < 250) break;
  }

  return { scanned, ineligible, deleted, dryRun };
}

async function assertSbdAdmin(db, context) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  if (context.auth.token.admin === true) {
    return context.auth.uid;
  }
  const callerSnap = await db.collection('users').doc(context.auth.uid).get();
  const callerData = callerSnap.exists ? callerSnap.data() : {};
  const role = String(callerData.role || '').toLowerCase();
  if (role === 'admin' || callerData.isAdmin === true) {
    return context.auth.uid;
  }
  throw new functions.https.HttpsError('permission-denied', 'Admin access required');
}

function registerNotificationMaintenance(db, exportsObj) {
  exportsObj.purgeStaleNotificationsScheduled = functions.pubsub
    .schedule('every 24 hours')
    .timeZone('Africa/Douala')
    .onRun(async () => {
      const result = await purgeStaleNotifications(db);
      console.log('[NotifMaintenance] scheduled purge', result);
      return null;
    });

  exportsObj.adminCleanupIneligibleNotifications = functions.https.onCall(async (data, context) => {
    await assertSbdAdmin(db, context);
    const dryRun = data?.dryRun !== false;
    const maxScan = Number(data?.maxScan) > 0 ? Number(data.maxScan) : 3000;
    return cleanupIneligibleBoardNotifications(db, { dryRun, maxScan });
  });

  exportsObj.adminPurgeStaleNotifications = functions.https.onCall(async (data, context) => {
    await assertSbdAdmin(db, context);
    const maxDeletes = Number(data?.maxDeletes) > 0 ? Number(data.maxDeletes) : 5000;
    return purgeStaleNotifications(db, 400, maxDeletes);
  });
}

module.exports = { registerNotificationMaintenance };
