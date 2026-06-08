const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

if (!admin.apps.length) {
  admin.initializeApp();
}

const PUSH_ORIGIN = "https://sbd-network.web.app";
const PUSH_ICON = `${PUSH_ORIGIN}/assets/icons/icon-192.png`;
const PUSH_BADGE = `${PUSH_ORIGIN}/assets/icons/icon-72.png`;

async function resolveRecipientToken(recipientId, fallbackToken) {
  if (typeof fallbackToken === "string" && fallbackToken.trim()) {
    return fallbackToken.trim();
  }

  const doc = await admin.firestore().collection("users").doc(recipientId).get();
  if (!doc.exists) {
    return "";
  }

  const data = doc.data() || {};
  const token = data.fcmToken || data.pushToken || data.notificationToken || "";
  return typeof token === "string" ? token.trim() : "";
}

function buildPushMessage({
  token,
  title,
  body,
  url,
  tag,
  data,
}) {
  const link = url.startsWith("http") ? url : `${PUSH_ORIGIN}${url}`;
  const relUrl = url.startsWith("http") ? new URL(url).pathname + new URL(url).search : url;
  return {
    token,
    notification: { title, body },
    data: {
      title,
      body,
      url: relUrl,
      ...(data || {}),
    },
    webpush: {
      notification: {
        icon: PUSH_ICON,
        badge: PUSH_BADGE,
        tag: tag || "sbd-notification",
        renotify: true,
      },
      fcm_options: { link },
    },
    android: { priority: "high" },
  };
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

  try {
    const recipientToken = await resolveRecipientToken(recipientId, body.recipientToken);

    if (!recipientToken) {
      return res.status(200).json({
        success: true,
        pushed: false,
        reason: "recipient_token_missing",
      });
    }

    const pushTitle = body.title || senderName || "New message";
    const pushBody = (body.body || message).slice(0, 100);
    const url =
      typeof body.url === "string" && body.url.trim()
        ? body.url.trim()
        : `/communication-v2/?conv=${encodeURIComponent(body.convId || "")}`;
    const convId = typeof body.convId === "string" ? body.convId : "";

    await admin.messaging().send(
      buildPushMessage({
        token: recipientToken,
        title: pushTitle,
        body: pushBody,
        url,
        tag: `dm-${convId || recipientId}`,
        data: {
          type: "dm",
          senderId,
          recipientId,
          message: message.slice(0, 300),
          convId,
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
    const pushTitle = groupName;
    const pushBody = `${senderName || "Someone"}: ${message.slice(0, 100)}`;
    const url =
      typeof body.url === "string" && body.url.trim()
        ? body.url.trim()
        : `/communication-v2/?group=${encodeURIComponent(groupId)}`;

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

        const recipientToken = await resolveRecipientToken(recipientId, null);
        if (!recipientToken) {
          skipped += 1;
          return;
        }

        try {
          await admin.messaging().send(
            buildPushMessage({
              token: recipientToken,
              title: pushTitle,
              body: pushBody,
              url,
              tag: `group-${groupId}`,
              data: {
                type: "group_message",
                senderId,
                groupId,
                message: message.slice(0, 300),
                convId: groupId,
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
