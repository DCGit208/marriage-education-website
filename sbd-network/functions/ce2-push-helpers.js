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
};
