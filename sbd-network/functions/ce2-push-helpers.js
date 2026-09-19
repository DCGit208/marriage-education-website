/**
 * Server-side CE2 push copy, mute keys, and deep-link URLs.
 * Pure helpers — no admin SDK, no token logging.
 */
"use strict";

const perms = require("./messaging/permissions");

const BODY_MAX = 80;

function inboxPrefId(kind, threadId) {
  const id = String(threadId || "").trim();
  if (!id) return "";
  return (kind === "group" ? "g__" : "d__") + id;
}

function looksLikePayloadDump(text) {
  const s = String(text || "").trim();
  if (!s) return false;
  if (s.charAt(0) === "{" || s.charAt(0) === "[") return true;
  if (/^data:(image|audio|video)\//i.test(s)) return true;
  if (/^https?:\/\/\S+$/i.test(s) && s.length > 80) return true;
  return false;
}

function clip(text, max) {
  const s = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  const limit = max || BODY_MAX;
  if (s.length <= limit) return s;
  return `${s.slice(0, Math.max(0, limit - 1)).replace(/\s+\S*$/, "").trim()}…`;
}

function mediaKind(meta) {
  const m = meta || {};
  const type = String(m.messageType || m.lastMessageType || "").toLowerCase();
  if (type === "voice" || type === "audio" || m.audioUrl) return "voice";
  if (type === "image" || type === "photo" || m.imageUrl) return "photo";
  if (type === "video" || m.videoUrl) return "video";
  if (type === "board_share" || m.boardShare) return "board";
  return "";
}

function normalizeMediaLabel(body) {
  const s = String(body || "").trim();
  if (/^voice(\s+note|\s+message)?$/i.test(s)) return { kind: "voice", body: "" };
  if (/^photo$/i.test(s) || /^image$/i.test(s)) return { kind: "photo", body: "" };
  if (/^video$/i.test(s)) return { kind: "video", body: "" };
  if (/^(shared\s+a\s+)?board(\s+post)?$/i.test(s)) return { kind: "board", body: "" };
  return { kind: "", body: s };
}

function formatPushPreview(meta, fallbackText) {
  const m = meta || {};
  let body = String(m.content != null ? m.content : m.lastPreview || fallbackText || "").trim();
  if (looksLikePayloadDump(body)) body = "";
  const labeled = normalizeMediaLabel(body);
  const kind = mediaKind(m) || labeled.kind;
  body = labeled.body;
  if (kind === "voice") return "Voice note";
  if (kind === "photo") return "Photo";
  if (kind === "video") return "Video";
  if (kind === "board") {
    const bs = m.boardShare || {};
    const title = String(bs.title || bs.note || m.lastBoardTitle || "").trim();
    if (title && !looksLikePayloadDump(title) && !/^board post$/i.test(title)) {
      return clip(title, BODY_MAX);
    }
    return "Board post";
  }
  if (!body) return "New message";
  return clip(body, BODY_MAX);
}

function buildThreadUrl({ convId, groupId, messageId } = {}) {
  const path = "/communication-v2/";
  const parts = [];
  const g = String(groupId || "").trim();
  const c = String(convId || "").trim();
  const msg = String(messageId || "").trim();
  if (g) parts.push(`group=${encodeURIComponent(g)}`);
  else if (c) parts.push(`conv=${encodeURIComponent(c)}`);
  if (msg) parts.push(`msg=${encodeURIComponent(msg)}`);
  return parts.length ? `${path}?${parts.join("&")}` : path;
}

function buildPushCopy({ kind, title, senderName, groupName, body, meta } = {}) {
  const isGroup = kind === "group";
  let nextTitle = String(title || "").trim();
  if (looksLikePayloadDump(nextTitle)) nextTitle = "";
  if (!nextTitle) {
    nextTitle = isGroup
      ? String(groupName || "Group").trim() || "Group"
      : String(senderName || "New message").trim() || "New message";
  }
  let nextBody = formatPushPreview(meta, body);
  if (looksLikePayloadDump(nextBody)) nextBody = "New message";
  if (!nextBody) nextBody = "New message";
  return { title: nextTitle, body: clip(nextBody, BODY_MAX) };
}

function stringifyData(data) {
  const out = {};
  Object.keys(data || {}).forEach((key) => {
    const value = data[key];
    if (value == null) out[key] = "";
    else out[key] = String(value);
  });
  return out;
}

function shouldSkipRecipient({ isSender, muted, canRead } = {}) {
  if (isSender) return { skip: true, reason: "sender" };
  if (muted) return { skip: true, reason: "muted" };
  if (canRead === false) return { skip: true, reason: "visibility" };
  return { skip: false, reason: "" };
}

function recipientCanReadClassification(userData, classification) {
  const cls = String(classification || "foundation").toLowerCase();
  if (!cls || cls === "public" || cls === "foundation" || cls === "free" || cls === "text") {
    return true;
  }
  const user = perms.userFromDoc("recipient", userData || {});
  if (user.role === "admin") return true;
  if (cls === "mentor") return !!user.mentor;
  return perms.tierLevel(user.tier) >= perms.tierLevel(cls);
}

const LEGACY_PUSH_FIELD_NAMES = ["fcmToken", "pushToken", "notificationToken"];

function readPushTokenValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function pickPreferredPushToken({
  ce2PushToken,
  fcmToken,
  pushToken,
  notificationToken,
} = {}) {
  const candidates = [ce2PushToken, fcmToken, pushToken, notificationToken];
  for (let i = 0; i < candidates.length; i += 1) {
    const token = readPushTokenValue(candidates[i]);
    if (token) return token;
  }
  return "";
}

function legacyPushFieldsPresent(userData) {
  const data = userData || {};
  return LEGACY_PUSH_FIELD_NAMES.some((key) =>
    Object.prototype.hasOwnProperty.call(data, key)
  );
}

function pickLegacyUserDocPushToken(userData) {
  const data = userData || {};
  return pickPreferredPushToken({
    fcmToken: data.fcmToken,
    pushToken: data.pushToken,
    notificationToken: data.notificationToken,
  });
}

/**
 * Copy leftover public user-doc tokens onto owner-only ce2_push, then strip
 * the public fields. Never overwrites an existing ce2_push token with a
 * possibly-stale legacy value.
 *
 * Keep lookupPushToken's legacy fallback until a production sweep reports
 * zero leftover fcmToken/pushToken/notificationToken fields.
 */
function planLegacyPushMigration({ userData, ce2PushToken } = {}) {
  const existing = readPushTokenValue(ce2PushToken);
  const leftover = legacyPushFieldsPresent(userData);
  const legacyToken = pickLegacyUserDocPushToken(userData);
  if (existing) {
    return {
      action: leftover ? "clear_legacy" : "noop",
      tokenToWrite: "",
      clearLegacy: leftover,
    };
  }
  if (legacyToken) {
    return {
      action: "migrate",
      tokenToWrite: legacyToken,
      clearLegacy: true,
    };
  }
  if (leftover) {
    return {
      action: "clear_legacy",
      tokenToWrite: "",
      clearLegacy: true,
    };
  }
  return { action: "noop", tokenToWrite: "", clearLegacy: false };
}

function isAdminUserData(userData, authToken) {
  if (authToken && authToken.admin === true) return true;
  const data = userData || {};
  if (String(data.role || "").toLowerCase() === "admin") return true;
  const roles = Array.isArray(data.roles) ? data.roles : [];
  return roles.some((role) => String(role || "").toLowerCase() === "admin");
}

function resolveMigrateTarget({ callerUid, targetUid, sweep, isAdmin } = {}) {
  const caller = String(callerUid || "").trim();
  if (!caller) return { ok: false, reason: "unauthenticated" };
  if (sweep) {
    return isAdmin
      ? { ok: true, reason: "", sweep: true, targetUid: "" }
      : { ok: false, reason: "admin_required" };
  }
  const target = String(targetUid || caller).trim();
  if (!target) return { ok: false, reason: "missing_uid" };
  if (target === caller) return { ok: true, reason: "", targetUid: target };
  if (!isAdmin) return { ok: false, reason: "cross_user_denied" };
  return { ok: true, reason: "", targetUid: target };
}

function userDisplayName(userData, fallback) {
  const d = userData || {};
  const name = String(d.name || d.displayName || d.email || "").trim();
  return name || fallback || "Someone";
}

function groupDisplayName(groupData, fallback) {
  const d = groupData || {};
  const name = String(d.name || d.title || "").trim();
  return name || fallback || "Group";
}

function directConvId(a, b) {
  const sorted = [String(a || ""), String(b || "")].sort();
  return `d_${sorted[0]}_${sorted[1]}`;
}

function resolveDirectRecipientIds({ senderId, receiverId, participantIds } = {}) {
  const sender = String(senderId || "").trim();
  const ids = [];
  const seen = {};
  function add(uid) {
    const id = String(uid || "").trim();
    if (!id || id === sender || seen[id]) return;
    seen[id] = true;
    ids.push(id);
  }
  add(receiverId);
  (Array.isArray(participantIds) ? participantIds : []).forEach(add);
  return ids;
}

function shouldNotifyCreatedMessage(message) {
  const data = message || {};
  const senderId = String(data.senderId || "").trim();
  if (!senderId) return { ok: false, reason: "missing_sender" };
  if (data.deleted) return { ok: false, reason: "deleted" };
  return { ok: true, reason: "" };
}

function pushClaimId({ kind, threadId, messageId, recipientId } = {}) {
  const k = kind === "group" ? "g" : "d";
  const parts = [k, threadId, messageId, recipientId].map((part) =>
    String(part || "")
      .trim()
      .replace(/\//g, "_")
  );
  if (parts.some((part) => !part)) return "";
  return parts.join("__").slice(0, 1400);
}

function buildCreatedPushPayload({
  kind,
  threadId,
  messageId,
  senderId,
  recipientId,
  senderName,
  groupName,
  message,
} = {}) {
  const isGroup = kind === "group";
  const msg = message || {};
  const copy = buildPushCopy({
    kind: isGroup ? "group" : "direct",
    title: isGroup ? groupName : senderName,
    senderName,
    groupName,
    body: msg.content,
    meta: {
      content: msg.content,
      messageType: msg.messageType,
      boardShare: msg.boardShare,
      imageUrl: msg.imageUrl,
      videoUrl: msg.videoUrl,
      audioUrl: msg.audioUrl,
    },
  });
  const url = buildThreadUrl({
    convId: isGroup ? "" : threadId,
    groupId: isGroup ? threadId : "",
    messageId,
  });
  const data = isGroup
    ? {
        type: "group_message",
        senderId: senderId || "",
        groupId: threadId || "",
        convId: threadId || "",
        messageId: messageId || "",
        senderName: senderName || "",
        groupName: groupName || "",
      }
    : {
        type: "dm",
        senderId: senderId || "",
        recipientId: recipientId || "",
        convId: threadId || "",
        messageId: messageId || "",
        senderName: senderName || "",
      };
  return {
    title: copy.title,
    body: copy.body,
    url,
    tag: isGroup ? `group-${threadId}` : `dm-${threadId || recipientId}`,
    data,
  };
}

module.exports = {
  BODY_MAX,
  inboxPrefId,
  looksLikePayloadDump,
  clip,
  formatPushPreview,
  buildThreadUrl,
  buildPushCopy,
  stringifyData,
  shouldSkipRecipient,
  recipientCanReadClassification,
  LEGACY_PUSH_FIELD_NAMES,
  readPushTokenValue,
  pickPreferredPushToken,
  legacyPushFieldsPresent,
  pickLegacyUserDocPushToken,
  planLegacyPushMigration,
  isAdminUserData,
  resolveMigrateTarget,
  userDisplayName,
  groupDisplayName,
  directConvId,
  resolveDirectRecipientIds,
  shouldNotifyCreatedMessage,
  pushClaimId,
  buildCreatedPushPayload,
};
