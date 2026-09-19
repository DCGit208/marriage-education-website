/**
 * CE2 push delivery — token lookup, mute, notify prefs, claims, and FCM send.
 * Firestore onCreate is the primary path; HTTP notify is a fallback.
 * Injected db/messaging so unit tests do not need firebase-admin.
 */
"use strict";

const pushHelpers = require("./ce2-push-helpers");
const { createMigrator } = require("./ce2-push-migrate");

const PUSH_ORIGIN = "https://sbd.marriageducation.com";
const PUSH_ICON = "https://sbd-network.web.app/assets/icons/icon-192.png";
const PUSH_BADGE = "https://sbd-network.web.app/assets/icons/icon-72.png";
const GROUP_MEMBER_LIMIT = 80;
const CLAIMS_COLLECTION = "ce2_push_claims";

function isAlreadyExists(error) {
  if (!error) return false;
  const code = error.code;
  if (code === 6 || code === "already-exists" || code === "ALREADY_EXISTS") {
    return true;
  }
  const msg = String(error.message || "");
  return /ALREADY_EXISTS/i.test(msg);
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

function createDelivery(deps) {
  const getDb = deps.getDb;
  const getMessaging = deps.getMessaging;
  const FieldValue = deps.FieldValue || {
    serverTimestamp: function serverTimestamp() {
      return new Date();
    },
  };
  const logger = deps.logger || { warn() {}, error() {} };
  const migrator = deps.migrator || createMigrator(deps);

  async function lookupPushToken(recipientId, knownUserData) {
    const db = getDb();
    let ce2PushToken = "";
    try {
      const priv = await db
        .collection("users")
        .doc(recipientId)
        .collection("ce2_push")
        .doc("token")
        .get();
      if (priv.exists) {
        ce2PushToken = (priv.data() || {}).fcmToken;
      }
    } catch (error) {
      logger.warn("CE2 push token private lookup failed", {
        recipientId,
        error: error.message,
      });
    }

    let userData = knownUserData;
    if (userData == null) {
      try {
        const doc = await db.collection("users").doc(recipientId).get();
        userData = doc.exists ? doc.data() || {} : {};
      } catch (error) {
        logger.warn("CE2 push token user lookup failed", {
          recipientId,
          error: error.message,
        });
        userData = {};
      }
    }

    const token = pushHelpers.pickPreferredPushToken({
      ce2PushToken,
      fcmToken: userData.fcmToken,
      pushToken: userData.pushToken,
      notificationToken: userData.notificationToken,
    });
    try {
      await migrator.migrateUser(recipientId, {
        userData,
        ce2PushToken,
      });
    } catch (error) {
      logger.warn("CE2 push token migrate failed", {
        recipientId,
        error: error.message,
      });
    }
    return token;
  }

  async function resolveRecipient(recipientId) {
    const result = { token: "", userData: null };
    const doc = await getDb().collection("users").doc(recipientId).get();
    if (!doc.exists) {
      result.token = await lookupPushToken(recipientId, {});
      return result;
    }
    result.userData = doc.data() || {};
    result.token = await lookupPushToken(recipientId, result.userData);
    return result;
  }

  async function isThreadMuted(uid, kind, threadId) {
    const prefId = pushHelpers.inboxPrefId(kind, threadId);
    if (!uid || !prefId) return false;
    try {
      const snap = await getDb()
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

  async function loadNotifyPrefs(uid) {
    if (!uid) return pushHelpers.normalizeNotifyPrefs({});
    try {
      const snap = await getDb()
        .collection("users")
        .doc(uid)
        .collection("ce2_push")
        .doc("prefs")
        .get();
      return pushHelpers.normalizeNotifyPrefs(snap.exists ? snap.data() || {} : {});
    } catch (error) {
      logger.warn("CE2 notify prefs lookup failed", {
        uid,
        error: error.message,
      });
      return pushHelpers.normalizeNotifyPrefs({});
    }
  }

  async function loadUserData(uid) {
    if (!uid) return {};
    try {
      const doc = await getDb().collection("users").doc(uid).get();
      return doc.exists ? doc.data() || {} : {};
    } catch (error) {
      logger.warn("CE2 user lookup failed", { uid, error: error.message });
      return {};
    }
  }

  async function claimPushDelivery(claimId, meta) {
    if (!claimId) return true;
    try {
      await getDb()
        .collection(CLAIMS_COLLECTION)
        .doc(claimId)
        .create({
          kind: (meta && meta.kind) || "",
          threadId: (meta && meta.threadId) || "",
          messageId: (meta && meta.messageId) || "",
          recipientId: (meta && meta.recipientId) || "",
          source: (meta && meta.source) || "",
          createdAt: FieldValue.serverTimestamp(),
        });
      return true;
    } catch (error) {
      if (isAlreadyExists(error)) return false;
      logger.warn("CE2 push claim failed", { claimId, error: error.message });
      return true;
    }
  }

  async function releasePushDelivery(claimId) {
    if (!claimId) return;
    try {
      await getDb().collection(CLAIMS_COLLECTION).doc(claimId).delete();
    } catch (error) {
      logger.warn("CE2 push claim release failed", {
        claimId,
        error: error.message,
      });
    }
  }

  async function deliverToRecipient(opts) {
    const kind = opts.kind === "group" ? "group" : "direct";
    const senderId = String(opts.senderId || "").trim();
    const recipientId = String(opts.recipientId || "").trim();
    const threadId = String(opts.threadId || "").trim();
    const messageId = String(opts.messageId || "").trim();
    const source = opts.source || "";
    const message = opts.message || {};

    if (!recipientId) {
      return { pushed: false, reason: "missing_recipient" };
    }

    const [muted, recipient, prefs] = await Promise.all([
      isThreadMuted(recipientId, kind, threadId),
      resolveRecipient(recipientId),
      loadNotifyPrefs(recipientId),
    ]);
    const canRead = pushHelpers.recipientCanReadClassification(
      recipient.userData,
      message.classification
    );
    const mentioned = pushHelpers.messageMentionsUser(
      message.content,
      recipient.userData,
      recipientId
    );
    let senderUserData = opts.senderUserData;
    if (senderUserData == null && senderId) {
      senderUserData = await loadUserData(senderId);
    }
    const policy = pushHelpers.evaluateNotifyPolicy({
      kind,
      prefs,
      mentioned,
      senderIsElite: pushHelpers.senderSatisfiesElite(senderUserData),
    });
    const quietHours = pushHelpers.isInQuietHours(prefs.quietHours, opts.nowMs);
    const skip = pushHelpers.shouldSkipRecipient({
      isSender: recipientId === senderId,
      muted,
      canRead,
      policyReason: policy.skip ? policy.reason : "",
      quietHours,
    });
    if (skip.skip) {
      return { pushed: false, reason: skip.reason };
    }

    if (!recipient.token) {
      return { pushed: false, reason: "recipient_token_missing" };
    }

    const claimId = pushHelpers.pushClaimId({
      kind,
      threadId,
      messageId,
      recipientId,
    });
    const claimed = await claimPushDelivery(claimId, {
      kind,
      threadId,
      messageId,
      recipientId,
      source,
    });
    if (!claimed) {
      return { pushed: false, reason: "duplicate" };
    }

    const built = pushHelpers.buildCreatedPushPayload({
      kind,
      threadId,
      messageId,
      senderId,
      recipientId,
      senderName: opts.senderName,
      groupName: opts.groupName,
      message,
    });
    const url =
      typeof opts.url === "string" && opts.url.trim()
        ? opts.url.trim()
        : built.url;

    try {
      await getMessaging().send(
        buildPushMessage({
          token: recipient.token,
          title: built.title,
          body: built.body,
          url,
          tag: built.tag,
          data: built.data,
        })
      );
      return { pushed: true, reason: "" };
    } catch (error) {
      await releasePushDelivery(claimId);
      logger.warn("CE2 push send failed", {
        recipientId,
        threadId,
        error: error.message,
      });
      return { pushed: false, reason: "push_failed" };
    }
  }

  async function loadDirectConversation(convId) {
    if (!convId) return null;
    const snap = await getDb().collection("ce2_conversations").doc(convId).get();
    if (!snap.exists) return null;
    return snap.data() || {};
  }

  async function loadDirectMessage(convId, messageId) {
    if (!convId || !messageId) return null;
    const snap = await getDb()
      .collection("ce2_conversations")
      .doc(convId)
      .collection("ce2_messages")
      .doc(messageId)
      .get();
    if (!snap.exists) return null;
    return snap.data() || {};
  }

  async function loadGroup(groupId) {
    if (!groupId) return null;
    const snap = await getDb().collection("communicationGroups").doc(groupId).get();
    if (!snap.exists) return null;
    return snap.data() || {};
  }

  async function loadGroupMessage(groupId, messageId) {
    if (!groupId || !messageId) return null;
    const snap = await getDb()
      .collection("communicationGroups")
      .doc(groupId)
      .collection("ce2_messages")
      .doc(messageId)
      .get();
    if (!snap.exists) return null;
    return snap.data() || {};
  }

  async function listGroupMemberIds(groupId) {
    const snap = await getDb()
      .collection("communicationGroups")
      .doc(groupId)
      .collection("members")
      .limit(GROUP_MEMBER_LIMIT)
      .get();
    return (snap.docs || []).map((doc) => doc.id);
  }

  async function senderDisplayName(senderId, fallback, knownUserData) {
    if (knownUserData && typeof knownUserData === "object") {
      return pushHelpers.userDisplayName(knownUserData, fallback);
    }
    if (!senderId) return fallback || "Someone";
    const data = await loadUserData(senderId);
    return pushHelpers.userDisplayName(data, fallback);
  }

  async function notifyDirectMessageCreated({
    convId,
    messageId,
    message,
    source,
    senderName,
    nowMs,
  }) {
    const msg = message || {};
    const gate = pushHelpers.shouldNotifyCreatedMessage(msg);
    if (!gate.ok) {
      return { pushed: 0, skipped: 0, failed: 0, reason: gate.reason };
    }

    const senderId = String(msg.senderId || "").trim();
    const resolvedConvId =
      String(convId || msg.conversationId || "").trim() ||
      (msg.receiverId ? pushHelpers.directConvId(senderId, msg.receiverId) : "");
    if (!resolvedConvId) {
      return { pushed: 0, skipped: 0, failed: 0, reason: "missing_conv" };
    }

    const conv = await loadDirectConversation(resolvedConvId);
    if (conv && conv.type && conv.type !== "direct") {
      return { pushed: 0, skipped: 0, failed: 0, reason: "not_direct" };
    }

    const participantIds = Array.isArray(conv && conv.participantIds)
      ? conv.participantIds
      : [];
    let recipientIds = pushHelpers.resolveDirectRecipientIds({
      senderId,
      receiverId: msg.receiverId,
      participantIds,
    });
    if (participantIds.length) {
      recipientIds = recipientIds.filter((id) => participantIds.includes(id));
    }
    recipientIds = recipientIds.filter((id) => id !== senderId);

    const senderUserData = await loadUserData(senderId);
    const resolvedSenderName = await senderDisplayName(
      senderId,
      senderName || "Someone",
      senderUserData
    );

    let pushed = 0;
    let skipped = 0;
    let failed = 0;
    await Promise.all(
      recipientIds.map(async (recipientId) => {
        const result = await deliverToRecipient({
          kind: "direct",
          threadId: resolvedConvId,
          messageId: String(messageId || "").trim(),
          senderId,
          recipientId,
          senderName: resolvedSenderName,
          senderUserData,
          message: msg,
          source: source || "trigger",
          nowMs,
        });
        if (result.pushed) pushed += 1;
        else if (result.reason === "push_failed") failed += 1;
        else skipped += 1;
      })
    );

    return {
      pushed,
      skipped,
      failed,
      reason: pushed ? "" : recipientIds.length ? "skipped" : "no_recipients",
    };
  }

  async function notifyGroupMessageCreated({
    groupId,
    messageId,
    message,
    source,
    senderName,
    groupName,
    nowMs,
  }) {
    const msg = message || {};
    const gate = pushHelpers.shouldNotifyCreatedMessage(msg);
    if (!gate.ok) {
      return { pushed: 0, skipped: 0, failed: 0, reason: gate.reason };
    }

    const senderId = String(msg.senderId || "").trim();
    const resolvedGroupId = String(groupId || msg.conversationId || "").trim();
    if (!resolvedGroupId) {
      return { pushed: 0, skipped: 0, failed: 0, reason: "missing_group" };
    }

    const group = await loadGroup(resolvedGroupId);
    const memberIds = await listGroupMemberIds(resolvedGroupId);
    const recipientIds = memberIds.filter((id) => id && id !== senderId);
    const resolvedGroupName = pushHelpers.groupDisplayName(group, groupName);
    const senderUserData = await loadUserData(senderId);
    const resolvedSenderName = await senderDisplayName(
      senderId,
      senderName || "Someone",
      senderUserData
    );

    let pushed = 0;
    let skipped = 0;
    let failed = 0;
    await Promise.all(
      recipientIds.map(async (recipientId) => {
        const result = await deliverToRecipient({
          kind: "group",
          threadId: resolvedGroupId,
          messageId: String(messageId || "").trim(),
          senderId,
          recipientId,
          senderName: resolvedSenderName,
          senderUserData,
          groupName: resolvedGroupName,
          message: msg,
          source: source || "trigger",
          nowMs,
        });
        if (result.pushed) pushed += 1;
        else if (result.reason === "push_failed") failed += 1;
        else skipped += 1;
      })
    );

    return {
      pushed,
      skipped,
      failed,
      members: memberIds.length,
      reason: pushed ? "" : recipientIds.length ? "skipped" : "no_recipients",
    };
  }

  /**
   * HTTP fallback. Ignores client-supplied recipientToken.
   * When the CE2 message already exists, uses the same path as onCreate.
   */
  async function notifyDirectFromHttp(opts) {
    const senderId = String(opts.senderId || "").trim();
    const recipientId = String(opts.recipientId || "").trim();
    const messageId = String(opts.messageId || "").trim();
    const convId =
      String(opts.convId || "").trim() ||
      (recipientId ? pushHelpers.directConvId(senderId, recipientId) : "");

    if (messageId && convId) {
      const stored = await loadDirectMessage(convId, messageId);
      if (stored) {
        if (stored.senderId && stored.senderId !== senderId) {
          return { pushed: 0, skipped: 0, failed: 0, forbidden: true, reason: "sender_mismatch" };
        }
        return notifyDirectMessageCreated({
          convId,
          messageId,
          message: stored,
          source: opts.source || "http",
          senderName: opts.senderName,
          nowMs: opts.nowMs,
        });
      }
    }

    const message = {
      senderId,
      receiverId: recipientId,
      conversationId: convId,
      content: opts.bodyText || opts.message || "",
      classification: opts.classification || "foundation",
      messageType: opts.messageType || "text",
      boardShare: opts.boardShare || null,
    };
    const result = await deliverToRecipient({
      kind: "direct",
      threadId: convId,
      messageId,
      senderId,
      recipientId,
      senderName: opts.senderName || opts.title || "Someone",
      message,
      url: opts.url,
      source: opts.source || "http",
      nowMs: opts.nowMs,
    });
    return {
      pushed: result.pushed ? 1 : 0,
      skipped: result.pushed ? 0 : 1,
      failed: result.reason === "push_failed" ? 1 : 0,
      reason: result.reason,
    };
  }

  async function notifyGroupFromHttp(opts) {
    const senderId = String(opts.senderId || "").trim();
    const groupId = String(opts.groupId || "").trim();
    const messageId = String(opts.messageId || "").trim();

    if (messageId && groupId) {
      const stored = await loadGroupMessage(groupId, messageId);
      if (stored) {
        if (stored.senderId && stored.senderId !== senderId) {
          return { pushed: 0, skipped: 0, failed: 0, forbidden: true, reason: "sender_mismatch" };
        }
        return notifyGroupMessageCreated({
          groupId,
          messageId,
          message: stored,
          source: opts.source || "http",
          senderName: opts.senderName,
          groupName: opts.groupName,
          nowMs: opts.nowMs,
        });
      }
    }

    const memberIds = await listGroupMemberIds(groupId);
    const message = {
      senderId,
      conversationId: groupId,
      content: opts.bodyText || opts.message || "",
      classification: opts.classification || "foundation",
      messageType: opts.messageType || "text",
      boardShare: opts.boardShare || null,
    };
    const senderName = opts.senderName || "Someone";
    const groupName = opts.groupName || "Group";

    let pushed = 0;
    let skipped = 0;
    let failed = 0;
    await Promise.all(
      memberIds.map(async (recipientId) => {
        if (recipientId === senderId) {
          skipped += 1;
          return;
        }
        const result = await deliverToRecipient({
          kind: "group",
          threadId: groupId,
          messageId,
          senderId,
          recipientId,
          senderName,
          groupName,
          message,
          url: opts.url,
          source: opts.source || "http",
          nowMs: opts.nowMs,
        });
        if (result.pushed) pushed += 1;
        else if (result.reason === "push_failed") failed += 1;
        else skipped += 1;
      })
    );

    return { pushed, skipped, failed, members: memberIds.length };
  }

  async function verifyDirectDmParticipants(senderId, recipientId, convId) {
    if (!senderId || !recipientId || senderId === recipientId) {
      return false;
    }

    const expectedConvId = pushHelpers.directConvId(senderId, recipientId);
    const resolvedConvId =
      typeof convId === "string" && convId.trim() ? convId.trim() : expectedConvId;

    if (resolvedConvId !== expectedConvId) {
      return false;
    }

    const conv = await loadDirectConversation(resolvedConvId);
    if (!conv) return true;
    if (conv.type && conv.type !== "direct") return false;
    const participants = Array.isArray(conv.participantIds) ? conv.participantIds : [];
    return participants.includes(senderId) && participants.includes(recipientId);
  }

  async function verifyGroupSender(groupId, senderId) {
    if (!groupId || !senderId) return false;
    const snap = await getDb()
      .collection("communicationGroups")
      .doc(groupId)
      .collection("members")
      .doc(senderId)
      .get();
    return !!snap.exists;
  }

  return {
    lookupPushToken,
    resolveRecipient,
    isThreadMuted,
    loadNotifyPrefs,
    deliverToRecipient,
    notifyDirectMessageCreated,
    notifyGroupMessageCreated,
    notifyDirectFromHttp,
    notifyGroupFromHttp,
    verifyDirectDmParticipants,
    verifyGroupSender,
    buildPushMessage,
    migrateUser: migrator.migrateUser,
    sweepLegacyPushTokens: migrator.sweepLegacyPushTokens,
  };
}

module.exports = {
  PUSH_ORIGIN,
  PUSH_ICON,
  PUSH_BADGE,
  GROUP_MEMBER_LIMIT,
  CLAIMS_COLLECTION,
  isAlreadyExists,
  buildPushMessage,
  createDelivery,
};
