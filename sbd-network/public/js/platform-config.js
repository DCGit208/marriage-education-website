/**
 * Platform-wide constants — support DM, public contact routing.
 * Override support UID in Firestore: platform/config { supportDmUid: "..." }
 */
(function (global) {
  'use strict';

  var CACHE = { uid: null, resolved: false };

  /** Set a fixed UID here if preferred; otherwise resolved from Firestore. */
  var SUPPORT_DM_UID = '';
  var SUPPORT_DM_EMAIL = 'sbdpursuit@gmail.com';
  var SUPPORT_DM_LABEL = 'SBD Support';

  function encodePrefill(text) {
    if (!text) return '';
    return encodeURIComponent(String(text).slice(0, 500));
  }

  function buildCe2DmUrl(uid, prefill) {
    if (!uid) return '';
    var url = '/communication-v2/?uid=' + encodeURIComponent(uid);
    if (prefill) url += '&text=' + encodePrefill(prefill);
    return url;
  }

  async function resolveSupportDmUid() {
    if (CACHE.resolved) return CACHE.uid;
    if (SUPPORT_DM_UID) {
      CACHE.uid = SUPPORT_DM_UID;
      CACHE.resolved = true;
      return CACHE.uid;
    }

    var db = global.firebase && global.firebase.firestore ? global.firebase.firestore() : null;
    if (!db) {
      CACHE.resolved = true;
      return null;
    }

    try {
      var cfgSnap = await db.collection('platform').doc('config').get();
      if (cfgSnap.exists) {
        var cfgUid = cfgSnap.data().supportDmUid;
        if (cfgUid) {
          CACHE.uid = String(cfgUid);
          CACHE.resolved = true;
          return CACHE.uid;
        }
      }
    } catch (_) {}

    try {
      if (SUPPORT_DM_EMAIL) {
        var emailSnap = await db
          .collection('users')
          .where('email', '==', SUPPORT_DM_EMAIL)
          .limit(1)
          .get();
        if (!emailSnap.empty) {
          CACHE.uid = emailSnap.docs[0].id;
          CACHE.resolved = true;
          return CACHE.uid;
        }
      }
    } catch (_) {}

    try {
      var adminSnap = await db.collection('users').where('role', '==', 'admin').limit(1).get();
      if (!adminSnap.empty) {
        CACHE.uid = adminSnap.docs[0].id;
        CACHE.resolved = true;
        return CACHE.uid;
      }
    } catch (_) {}

    CACHE.resolved = true;
    return null;
  }

  async function buildSupportDmUrl(opts) {
    opts = opts || {};
    var uid = await resolveSupportDmUid();
    return buildCe2DmUrl(uid, opts.prefill || '');
  }

  global.SbdPlatform = {
    SUPPORT_DM_UID: SUPPORT_DM_UID,
    SUPPORT_DM_EMAIL: SUPPORT_DM_EMAIL,
    SUPPORT_DM_LABEL: SUPPORT_DM_LABEL,
    resolveSupportDmUid: resolveSupportDmUid,
    buildSupportDmUrl: buildSupportDmUrl,
    buildCe2DmUrl: buildCe2DmUrl,
  };
})(typeof window !== 'undefined' ? window : global);
