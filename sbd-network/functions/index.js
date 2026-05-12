const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

if (!admin.apps.length) {
  admin.initializeApp();
}

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

exports.notifyDmV2 = onRequest({ region: "us-central1", cors: true }, async (req, res) => {

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const idToken = authHeader.slice(7);
    await admin.auth().verifyIdToken(idToken);
  } catch (error) {
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

  try {
    const recipientToken = await resolveRecipientToken(recipientId, body.recipientToken);

    if (!recipientToken) {
      return res.status(200).json({
        success: true,
        pushed: false,
        reason: "recipient_token_missing",
      });
    }

    await admin.messaging().send({
      token: recipientToken,
      notification: {
        title: senderName || "New message",
        body: message,
      },
      data: {
        type: "dm",
        senderId,
        recipientId,
        message,
      },
    });

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
