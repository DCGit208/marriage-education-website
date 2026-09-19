const admin = require("firebase-admin");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const { createDelivery } = require("./ce2-push-delivery");
const { createMigrator } = require("./ce2-push-migrate");
const pushHelpers = require("./ce2-push-helpers");

if (!admin.apps.length) {
  admin.initializeApp();
}

const delivery = createDelivery({
  getDb: () => admin.firestore(),
  getMessaging: () => admin.messaging(),
  FieldValue: admin.firestore.FieldValue,
  FieldPath: admin.firestore.FieldPath,
  logger,
});

const migrator = createMigrator({
  getDb: () => admin.firestore(),
  FieldValue: admin.firestore.FieldValue,
  FieldPath: admin.firestore.FieldPath,
  logger,
});

// Client-supplied FCM tokens are ignored. Token lookup uses owner-only
// users/{uid}/ce2_push/token, then legacy users.fcmToken / pushToken /
// notificationToken. Remove that user-doc fallback after a production sweep
// reports zero leftover public token fields (see migrateCe2PushTokens).

async function verifyBearer(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }
  try {
    return await admin.auth().verifyIdToken(authHeader.slice(7));
  } catch (error) {
    return null;
  }
}

function readString(body, key) {
  return typeof body[key] === "string" ? body[key].trim() : "";
}

exports.notifyDmV2 = onRequest({ region: "us-central1", cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const decoded = await verifyBearer(req);
  if (!decoded) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  const senderId = readString(body, "senderId");
  const recipientId = readString(body, "recipientId");
  const message = readString(body, "message") || readString(body, "body");
  const senderName = readString(body, "senderName");
  const convId = readString(body, "convId");
  const messageId = readString(body, "messageId");

  if (!senderId || !recipientId || !message) {
    return res.status(400).json({ error: "senderId, recipientId and message are required" });
  }

  if (decoded.uid !== senderId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (senderId === recipientId) {
    return res.status(400).json({ error: "Cannot notify yourself" });
  }

  const isDirectDm = await delivery.verifyDirectDmParticipants(senderId, recipientId, convId);
  if (!isDirectDm) {
    return res.status(403).json({ error: "Not a direct message recipient" });
  }

  try {
    const result = await delivery.notifyDirectFromHttp({
      senderId,
      recipientId,
      convId,
      messageId,
      senderName,
      title: readString(body, "title"),
      bodyText: readString(body, "body") || message,
      url: readString(body, "url"),
      classification: body.classification,
      messageType: body.messageType,
      boardShare: body.boardShare,
      source: "http",
    });
    if (result.forbidden) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.status(200).json({
      success: true,
      pushed: result.pushed > 0,
      reason: result.reason || undefined,
    });
  } catch (error) {
    logger.error("DM PUSH ERROR", error);
    return res.status(200).json({
      success: true,
      pushed: false,
      reason: "push_failed",
    });
  }
});

exports.notifyGroupV2 = onRequest({ region: "us-central1", cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const decoded = await verifyBearer(req);
  if (!decoded) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  const senderId = readString(body, "senderId");
  const groupId = readString(body, "groupId");
  const message = readString(body, "message") || readString(body, "body");
  const senderName = readString(body, "senderName");
  const groupName = readString(body, "groupName") || "Group";
  const messageId = readString(body, "messageId");

  if (!senderId || !groupId || !message) {
    return res.status(400).json({ error: "senderId, groupId and message are required" });
  }

  if (decoded.uid !== senderId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const senderOk = await delivery.verifyGroupSender(groupId, senderId);
    if (!senderOk) {
      return res.status(403).json({ error: "Not a group member" });
    }

    const result = await delivery.notifyGroupFromHttp({
      senderId,
      groupId,
      messageId,
      senderName,
      groupName,
      bodyText: readString(body, "body") || message,
      url: readString(body, "url"),
      classification: body.classification,
      messageType: body.messageType,
      boardShare: body.boardShare,
      source: "http",
    });
    if (result.forbidden) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.status(200).json({
      success: true,
      pushed: result.pushed,
      skipped: result.skipped,
      failed: result.failed,
      members: result.members,
    });
  } catch (error) {
    logger.error("GROUP PUSH ERROR", error);
    return res.status(200).json({
      success: true,
      pushed: 0,
      reason: "push_failed",
    });
  }
});

exports.onCe2DirectMessageCreated = onDocumentCreated(
  {
    document: "ce2_conversations/{convId}/ce2_messages/{messageId}",
    region: "us-central1",
    retry: false,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    try {
      await delivery.notifyDirectMessageCreated({
        convId: event.params.convId,
        messageId: event.params.messageId,
        message: snap.data() || {},
        source: "trigger",
      });
    } catch (error) {
      logger.error("CE2 DM onCreate push failed", error);
    }
  }
);

exports.onCe2GroupMessageCreated = onDocumentCreated(
  {
    document: "communicationGroups/{groupId}/ce2_messages/{messageId}",
    region: "us-central1",
    retry: false,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    try {
      await delivery.notifyGroupMessageCreated({
        groupId: event.params.groupId,
        messageId: event.params.messageId,
        message: snap.data() || {},
        source: "trigger",
      });
    } catch (error) {
      logger.error("CE2 group onCreate push failed", error);
    }
  }
);

async function loadCallerUserData(uid) {
  if (!uid) return {};
  try {
    const snap = await admin.firestore().collection("users").doc(uid).get();
    return snap.exists ? snap.data() || {} : {};
  } catch (error) {
    logger.warn("CE2 push migrate caller lookup failed", {
      uid,
      error: error.message,
    });
    return {};
  }
}

/**
 * Signed-in users may migrate only their own leftover public token.
 * Admins may pass `{ uid }` for another user or `{ sweep: true }` for a page.
 * Response never includes the raw FCM token.
 */
exports.migrateCe2PushTokens = onCall(
  { region: "us-central1", cors: true },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError("unauthenticated", "Sign in required");
    }
    const callerUid = request.auth.uid;
    const data = request.data && typeof request.data === "object" ? request.data : {};
    const callerUserData = await loadCallerUserData(callerUid);
    const gate = pushHelpers.resolveMigrateTarget({
      callerUid,
      targetUid: typeof data.uid === "string" ? data.uid : "",
      sweep: !!data.sweep,
      isAdmin: pushHelpers.isAdminUserData(callerUserData, request.auth.token),
    });
    if (!gate.ok) {
      throw new HttpsError("permission-denied", "Cannot migrate another user's token");
    }
    if (gate.sweep) {
      const result = await migrator.sweepLegacyPushTokens({
        maxUsers: 400,
        pageSize: 100,
      });
      return {
        ok: true,
        sweep: true,
        scanned: result.scanned,
        migrated: result.migrated,
        cleared: result.cleared,
      };
    }
    const result = await migrator.migrateUser(gate.targetUid);
    return { ok: true, action: result.action, reason: result.reason || undefined };
  }
);

exports.sweepLegacyCe2PushTokens = onSchedule(
  {
    schedule: "every 6 hours",
    region: "us-central1",
    timeoutSeconds: 120,
    retryCount: 0,
  },
  async () => {
    try {
      await migrator.sweepLegacyPushTokens({ maxUsers: 400, pageSize: 100 });
    } catch (error) {
      logger.error("CE2 push token sweep failed", error);
    }
  }
);
