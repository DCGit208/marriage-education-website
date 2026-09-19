/**
 * Copy leftover public users.{fcm,push,notification}Token onto
 * users/{uid}/ce2_push/token, then delete the public fields.
 * Admin SDK only — never returns or logs the raw token.
 */
"use strict";

const pushHelpers = require("./ce2-push-helpers");

const SWEEP_PAGE = 100;
const SWEEP_MAX = 400;

function createMigrator(deps) {
  const getDb = deps.getDb;
  const FieldValue = deps.FieldValue || {
    serverTimestamp: function serverTimestamp() {
      return new Date();
    },
    delete: function deleteField() {
      return { __ce2Delete: true };
    },
  };
  const FieldPath = deps.FieldPath;
  const logger = deps.logger || { warn() {}, error() {}, info() {} };

  function log(level, msg, meta) {
    if (logger && typeof logger[level] === "function") logger[level](msg, meta);
  }

  function legacyDeletePatch() {
    return {
      fcmToken: FieldValue.delete(),
      pushToken: FieldValue.delete(),
      notificationToken: FieldValue.delete(),
    };
  }

  async function loadUserAndToken(uid, known) {
    const db = getDb();
    let userData = known && known.userData;
    let ce2PushToken = known && Object.prototype.hasOwnProperty.call(known, "ce2PushToken")
      ? known.ce2PushToken
      : undefined;
    if (userData == null) {
      try {
        const snap = await db.collection("users").doc(uid).get();
        userData = snap.exists ? snap.data() || {} : {};
      } catch (error) {
        log("warn", "CE2 push migrate user lookup failed", {
          uid,
          error: error.message,
        });
        userData = {};
      }
    }
    if (ce2PushToken === undefined) {
      try {
        const priv = await db
          .collection("users")
          .doc(uid)
          .collection("ce2_push")
          .doc("token")
          .get();
        ce2PushToken = priv.exists ? (priv.data() || {}).fcmToken : "";
      } catch (error) {
        log("warn", "CE2 push migrate private lookup failed", {
          uid,
          error: error.message,
        });
        ce2PushToken = "";
      }
    }
    return { userData, ce2PushToken };
  }

  async function migrateUser(uid, known) {
    const id = String(uid || "").trim();
    if (!id) return { action: "noop", reason: "missing_uid" };
    const loaded = await loadUserAndToken(id, known || {});
    const plan = pushHelpers.planLegacyPushMigration(loaded);
    if (plan.action === "noop") {
      return { action: "noop", reason: "already_private" };
    }

    const userRef = getDb().collection("users").doc(id);
    if (plan.tokenToWrite) {
      await userRef.collection("ce2_push").doc("token").set(
        {
          fcmToken: plan.tokenToWrite,
          updatedAt: FieldValue.serverTimestamp(),
          migratedFrom: "legacy_user_doc",
        },
        { merge: true }
      );
    }
    if (plan.clearLegacy) {
      try {
        await userRef.update(legacyDeletePatch());
      } catch (error) {
        log("warn", "CE2 push migrate clear-legacy failed", {
          uid: id,
          error: error.message,
        });
        return { action: plan.action, reason: "clear_failed" };
      }
    }
    log("info", "CE2 push token migrate", { uid: id, action: plan.action });
    return { action: plan.action, reason: "" };
  }

  async function sweepLegacyPushTokens(opts) {
    const pageSize = Math.min(Math.max((opts && opts.pageSize) || SWEEP_PAGE, 1), 200);
    const maxUsers = Math.min(Math.max((opts && opts.maxUsers) || SWEEP_MAX, 1), 1000);
    const db = getDb();
    let scanned = 0;
    let migrated = 0;
    let cleared = 0;
    let lastDoc = null;

    while (scanned < maxUsers) {
      let query = db.collection("users");
      if (FieldPath && typeof FieldPath.documentId === "function" && typeof query.orderBy === "function") {
        query = query.orderBy(FieldPath.documentId());
      } else if (typeof query.orderBy === "function") {
        query = query.orderBy("__name__");
      }
      if (lastDoc && typeof query.startAfter === "function") {
        query = query.startAfter(lastDoc);
      }
      if (typeof query.limit === "function") {
        query = query.limit(Math.min(pageSize, maxUsers - scanned));
      }
      const snap = await query.get();
      const docs = snap.docs || [];
      if (!docs.length) break;
      for (let i = 0; i < docs.length; i += 1) {
        const doc = docs[i];
        scanned += 1;
        const userData = typeof doc.data === "function" ? doc.data() : doc.data || {};
        if (!pushHelpers.legacyPushFieldsPresent(userData)) continue;
        const result = await migrateUser(doc.id, { userData });
        if (result.action === "migrate") migrated += 1;
        else if (result.action === "clear_legacy") cleared += 1;
      }
      lastDoc = docs[docs.length - 1];
      if (docs.length < pageSize) break;
    }

    log("info", "CE2 push token sweep", { scanned, migrated, cleared });
    return { scanned, migrated, cleared };
  }

  return { migrateUser, sweepLegacyPushTokens };
}

module.exports = {
  SWEEP_PAGE,
  SWEEP_MAX,
  createMigrator,
};
