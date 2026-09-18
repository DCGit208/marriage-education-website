const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const pushHelpers = require("./ce2-push-helpers");

if (!admin.apps.length) {
  admin.initializeApp();
}

const PUSH_ORIGIN = "https://sbd.marriageducation.com";
const PUSH_ICON = "https://sbd-network.web.app/assets/icons/icon-192.png";
const PUSH_BADGE = "https://sbd-network.web.app/assets/icons/icon-72.png";

async function lookupPushToken(recipientId) {
  const db = admin.firestore();
  try {
    const priv = await db
      .collection("users")
      .doc(recipientId)
      .collection("ce2_push")
      .doc("token")
      .get();
    if (priv.exists) {
      const token = (priv.data() || {}).fcmToken;
      if (typeof token === "string" && token.trim()) {
        return token.trim();
      }
    }
  } catch (error) {
    logger.warn("CE2 push token private lookup failed", {
      recipientId,
      error: error.message,
    });
  }

  const doc = await db.collection("users").doc(recipientId).get();
  if (!doc.exists) return "";
  const data = doc.data() || {};
  const token = data.fcmToken || data.pushToken || data.notificationToken || "";
  return typeof token === "string" ? token.trim() : "";
}

async function resolveRecipient(recipientId) {
  const result = { token: "", userData: null };
  const doc = await admin.firestore().collection("users").doc(recipientId).get();
  if (!doc.exists) {
    return result;
  }

  result.userData = doc.data() || {};
  result.token = await lookupPushToken(recipientId);
  return result;
}

async function isThreadMuted(uid, kind, threadId) {
  const prefId = pushHelpers.inboxPrefId(kind, threadId);
  if (!uid || !prefId) return false;
  try {
    const snap = await admin
      .firestore()
      .collection("users")
      .doc(uid)
      .collection("ce2_inbox")
      .doc(prefId)
      .get();
    return !!(snap.exists && snap.data() && snap.data().muted);
  } catch (error) {
    logger.warn("CE2 mute lookup failed", { uid, prefId, error: error.message });
    return false;
  }
}

function buildPushMessage({ token, title, body, url, tag, data }) {
  const link = url.startsWith("http") ? url : `${PUSH_ORIGIN}${url}`;
  const relUrl = url.startsWith("http")
    ? new URL(url).pathname + new URL(url).search
    : url;
  const payload = pushHelpers.stringifyData({
    title,
    body,
    url: relUrl,
    ...(data || {}),
  });
  return {
    token,
    notification: { title, body },
    data: payload,
    webpush: {
      notification: {
        icon: PUSH_ICON,
        badge: PUSH_BADGE,
        tag: tag || "sbd-notification",
        renotify: true,
        data: payload,
      },
      fcm_options: { link },
    },
    android: { priority: "high" },
  };
}

function directConvId(a, b) {
  const sorted = [a, b].sort();
  return `d_${sorted[0]}_${sorted[1]}`;
}

async function verifyDirectDmParticipants(senderId, recipientId, convId) {
  if (!senderId || !recipientId || senderId === recipientId) {
    return false;
  }

  const expectedConvId = directConvId(senderId, recipientId);
  const resolvedConvId =
    typeof convId === "string" && convId.trim() ? convId.trim() : expectedConvId;

  if (resolvedConvId !== expectedConvId) {
    return false;
  }

  const convDoc = await admin
    .firestore()
    .collection("ce2_conversations")
    .doc(resolvedConvId)
    .get();

  if (!convDoc.exists) {
    return true;
  }

  const data = convDoc.data() || {};
  if (data.type && data.type !== "direct") {
    return false;
  }

  const participants = Array.isArray(data.participantIds) ? data.participantIds : [];
  return participants.includes(senderId) && participants.includes(recipientId);
}

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

  const senderId = typeof body.senderId === "string" ? body.senderId.trim() : "";
  const recipientId = typeof body.recipientId === "string" ? body.recipientId.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const senderName = typeof body.senderName === "string" ? body.senderName.trim() : "";

  if (!senderId || !recipientId || !message) {
    return res.status(400).json({ error: "senderId, recipientId and message are required" });
  }

  if (decoded.uid !== senderId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (senderId === recipientId) {
    return res.status(400).json({ error: "Cannot notify yourself" });
  }

  const convId = typeof body.convId === "string" ? body.convId : "";
  const isDirectDm = await verifyDirectDmParticipants(senderId, recipientId, convId);
  if (!isDirectDm) {
    return res.status(403).json({ error: "Not a direct message recipient" });
  }

  try {
    const muted = await isThreadMuted(recipientId, "direct", convId || directConvId(senderId, recipientId));
    if (muted) {
      return res.status(200).json({
        success: true,
        pushed: false,
        reason: "muted",
      });
    }

    const recipient = await resolveRecipient(recipientId);
    const canRead = pushHelpers.recipientCanReadClassification(
      recipient.userData,
      body.classification
    );
    const skip = pushHelpers.shouldSkipRecipient({
      isSender: recipientId === senderId,
      muted: false,
      canRead,
    });
    if (skip.skip) {
      return res.status(200).json({
        success: true,
        pushed: false,
        reason: skip.reason,
      });
    }

    if (!recipient.token) {
      return res.status(200).json({
        success: true,
        pushed: false,
        reason: "recipient_token_missing",
      });
    }

    const copy = pushHelpers.buildPushCopy({
      kind: "direct",
      title: body.title || senderName || "New message",
      senderName,
      body: body.body || message,
      meta: {
        content: body.body || message,
        messageType: body.messageType,
        boardShare: body.boardShare,
      },
    });
    const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
    const resolvedConvId = convId || directConvId(senderId, recipientId);
    const url =
      typeof body.url === "string" && body.url.trim()
        ? body.url.trim()
        : pushHelpers.buildThreadUrl({
            convId: resolvedConvId,
            messageId,
          });
    await admin.messaging().send(
      buildPushMessage({
        token: recipient.token,
        title: copy.title,
        body: copy.body,
        url,
        tag: `dm-${resolvedConvId || recipientId}`,
        data: {
          type: "dm",
          senderId,
          recipientId,
          convId: resolvedConvId,
          messageId,
          senderName,
        },
      })
    );

    return res.status(200).json({
      success: true,
      pushed: true,
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

  const senderId = typeof body.senderId === "string" ? body.senderId.trim() : "";
  const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const senderName = typeof body.senderName === "string" ? body.senderName.trim() : "";
  const groupName = typeof body.groupName === "string" ? body.groupName.trim() : "Group";

  if (!senderId || !groupId || !message) {
    return res.status(400).json({ error: "senderId, groupId and message are required" });
  }

  if (decoded.uid !== senderId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const groupRef = admin.firestore().collection("communicationGroups").doc(groupId);
    const senderMember = await groupRef.collection("members").doc(senderId).get();
    if (!senderMember.exists) {
      return res.status(403).json({ error: "Not a group member" });
    }

    const membersSnap = await groupRef.collection("members").limit(80).get();
    const copy = pushHelpers.buildPushCopy({
      kind: "group",
      title: groupName,
      senderName,
      groupName,
      body: body.body || message,
      meta: {
        content: body.body || message,
        messageType: body.messageType,
        boardShare: body.boardShare,
      },
    });
    const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
    const url =
      typeof body.url === "string" && body.url.trim()
        ? body.url.trim()
        : pushHelpers.buildThreadUrl({
            groupId,
            messageId,
          });

    let pushed = 0;
    let skipped = 0;
    let failed = 0;

    await Promise.all(
      membersSnap.docs.map(async (memberDoc) => {
        const recipientId = memberDoc.id;
        if (recipientId === senderId) {
          skipped += 1;
          return;
        }

        const muted = await isThreadMuted(recipientId, "group", groupId);
        if (muted) {
          skipped += 1;
          return;
        }

        const recipient = await resolveRecipient(recipientId);
        const canRead = pushHelpers.recipientCanReadClassification(
          recipient.userData,
          body.classification
        );
        const skip = pushHelpers.shouldSkipRecipient({
          isSender: false,
          muted: false,
          canRead,
        });
        if (skip.skip) {
          skipped += 1;
          return;
        }

        if (!recipient.token) {
          skipped += 1;
          return;
        }

        try {
          await admin.messaging().send(
            buildPushMessage({
              token: recipient.token,
              title: copy.title,
              body: copy.body,
              url,
              tag: `group-${groupId}`,
              data: {
                type: "group_message",
                senderId,
                groupId,
                convId: groupId,
                messageId,
                senderName,
                groupName,
              },
            })
          );
          pushed += 1;
        } catch (error) {
          failed += 1;
          logger.warn("GROUP PUSH member failed", { recipientId, groupId, error: error.message });
        }
      })
    );

    return res.status(200).json({
      success: true,
      pushed,
      skipped,
      failed,
      members: membersSnap.size,
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
