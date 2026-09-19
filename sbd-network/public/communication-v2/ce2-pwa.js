/**
 * CE2 Layer 6 — push registration, install prompt, offline banner
 */
(function (root) {
  'use strict';

  var FCM_VAPID_KEY =
    'BAlZ5xWEFm9mGl8b5osLULe4_fobt0vYNTypMJX8zumgU1nNsv95SN2HbbqAYrfuCZ7GkmPAoeT6yzuB0I7dlkI';
  var NOTIF_WORKER_URL = 'https://sbd-upload-signer.sbdnetwork.workers.dev';
  var NotifApi = root.Notification;

  function hasNotificationApi() {
    return typeof NotifApi !== 'undefined';
  }

  function setOfflineFlag(on) {
    if (root.CommunicationState) root.CommunicationState.offline = !!on;
    var bar = document.getElementById('ce2OfflineBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'ce2OfflineBar';
      bar.className = 'ce2-offline-bar';
      bar.setAttribute('role', 'status');
      bar.textContent = 'You are offline — messages will send when you reconnect.';
      var app = document.getElementById('ce2App');
      if (app) app.insertBefore(bar, app.firstChild);
    }
    bar.hidden = !on;
  }

  function pushTokenRef(userId) {
    return db.collection('users').doc(userId).collection('ce2_push').doc('token');
  }

  async function clearOwnLegacyPushFields(userId) {
    if (!userId || typeof db === 'undefined') return;
    try {
      await db.collection('users').doc(userId).update({
        fcmToken: firebase.firestore.FieldValue.delete(),
        pushToken: firebase.firestore.FieldValue.delete(),
        notificationToken: firebase.firestore.FieldValue.delete(),
      });
    } catch (_) {}
  }

  async function persistCe2PushToken(userId, token) {
    if (!userId || !token || typeof db === 'undefined') return;
    await pushTokenRef(userId).set(
      {
        fcmToken: token,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await clearOwnLegacyPushFields(userId);
  }

  /**
   * Signed-in user only: copy leftover public token fields onto ce2_push,
   * then delete them. Never overwrites an existing private token.
   */
  async function migrateOwnLegacyPushToken(userId) {
    if (!userId || typeof db === 'undefined' || typeof firebase === 'undefined') return;
    var me = firebase.auth && firebase.auth().currentUser;
    if (!me || me.uid !== userId) return;
    try {
      var userRef = db.collection('users').doc(userId);
      var userSnap = await userRef.get();
      var privSnap = await pushTokenRef(userId).get();
      var userData = userSnap.exists ? userSnap.data() || {} : {};
      var existing = privSnap.exists
        ? String((privSnap.data() || {}).fcmToken || '').trim()
        : '';
      var legacy = String(
        userData.fcmToken || userData.pushToken || userData.notificationToken || ''
      ).trim();
      var leftover =
        Object.prototype.hasOwnProperty.call(userData, 'fcmToken') ||
        Object.prototype.hasOwnProperty.call(userData, 'pushToken') ||
        Object.prototype.hasOwnProperty.call(userData, 'notificationToken');
      if (!existing && legacy) {
        await persistCe2PushToken(userId, legacy);
        return;
      }
      if (leftover) await clearOwnLegacyPushFields(userId);
    } catch (_) {}
  }

  function bindTokenRefresh(userId) {
    if (root.__ce2TokenRefreshBound || !userId) return;
    if (typeof firebase === 'undefined' || typeof firebase.messaging !== 'function') return;
    try {
      var messaging = firebase.messaging();
      if (typeof messaging.onTokenRefresh !== 'function') return;
      root.__ce2TokenRefreshBound = true;
      messaging.onTokenRefresh(function () {
        initPush(userId);
      });
    } catch (_) {}
  }

  async function initPush(userId) {
    if (
      !hasNotificationApi() ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      return;
    }
    if (typeof firebase === 'undefined' || typeof firebase.messaging !== 'function') return;
    try {
      var permission = NotifApi.permission;
      if (permission === 'default') return;
      if (permission !== 'granted') return;

      await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
      var reg = await navigator.serviceWorker.ready;
      var messaging = firebase.messaging();
      bindTokenRefresh(userId);
      var token = await messaging.getToken({
        vapidKey: FCM_VAPID_KEY,
        serviceWorkerRegistration: reg,
      });
      if (!token || typeof db === 'undefined') return;

      await persistCe2PushToken(userId, token);

      var user = firebase.auth().currentUser;
      if (user) {
        var idToken = await user.getIdToken();
        fetch(NOTIF_WORKER_URL + '/register-push', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + idToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fcmToken: token }),
        }).catch(function () {});
      }
    } catch (err) {
      console.warn('[CE2 Push]', err);
    }
  }

  function maybePushNudge(userId) {
    if (!hasNotificationApi()) return;
    if (NotifApi.permission !== 'default') return;
    if (localStorage.getItem('ce2_push_dismissed')) return;
    if (document.getElementById('ce2-push-nudge')) return;

    var bar = document.createElement('div');
    bar.id = 'ce2-push-nudge';
    bar.className = 'ce2-push-nudge';
    bar.innerHTML =
      '<span>Enable notifications for new messages</span>' +
      '<button type="button" class="ce2-btn ce2-btn-ghost" id="ce2-push-yes">Enable</button>' +
      '<button type="button" class="ce2-push-dismiss" id="ce2-push-no" aria-label="Dismiss">×</button>';
    document.body.appendChild(bar);

    document.getElementById('ce2-push-yes').addEventListener('click', function () {
      bar.remove();
      NotifApi.requestPermission().then(function (p) {
        if (p === 'granted') initPush(userId);
      });
    });
    document.getElementById('ce2-push-no').addEventListener('click', function () {
      localStorage.setItem('ce2_push_dismissed', '1');
      bar.remove();
    });
  }

  function bindInstallPrompt() {
    if (root.__ce2InstallBound) return;
    root.__ce2InstallBound = true;
    var deferred;
    root.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferred = e;
      if (localStorage.getItem('ce2_a2hs_dismissed')) return;
      if (document.getElementById('ce2-install-nudge')) return;
      var bar = document.createElement('div');
      bar.id = 'ce2-install-nudge';
      bar.className = 'ce2-push-nudge';
      bar.innerHTML =
        '<span>Add Messages to your home screen</span>' +
        '<button type="button" class="ce2-btn ce2-btn-ghost" id="ce2-install-yes">Install</button>' +
        '<button type="button" class="ce2-push-dismiss" id="ce2-install-no" aria-label="Dismiss">×</button>';
      document.body.appendChild(bar);
      document.getElementById('ce2-install-yes').addEventListener('click', function () {
        bar.remove();
        if (deferred) deferred.prompt();
      });
      document.getElementById('ce2-install-no').addEventListener('click', function () {
        localStorage.setItem('ce2_a2hs_dismissed', '1');
        bar.remove();
      });
    });
  }

  function bindOffline() {
    if (root.__ce2OfflineBound) return;
    root.__ce2OfflineBound = true;
    setOfflineFlag(!navigator.onLine);
    root.addEventListener('online', function () {
      setOfflineFlag(false);
      if (typeof root.ce2FlushOfflineQueue === 'function') {
        root.ce2FlushOfflineQueue();
      }
    });
    root.addEventListener('offline', function () {
      setOfflineFlag(true);
    });
  }

  function parseForegroundPayload(payload) {
    if (root.Ce2Push && typeof root.Ce2Push.normalizePushPayload === 'function') {
      return root.Ce2Push.normalizePushPayload(payload || {});
    }
    var data = (payload && payload.data) || {};
    return {
      type:
        data.type === 'dm'
          ? 'direct_message'
          : data.type === 'group_message'
            ? 'group_message'
            : data.type || '',
      convId: data.convId || '',
      senderId: data.senderId || '',
      groupId: data.groupId || '',
      messageId: data.messageId || '',
      title: (payload.notification && payload.notification.title) || data.title || '',
      body:
        (payload.notification && payload.notification.body) ||
        data.body ||
        '',
      url: data.url || '',
      tag: data.tag || '',
    };
  }

  function isMutedForeground(notif) {
    if (!notif || !root.Ce2Inbox || !root.CommunicationState) return false;
    var kind = notif.type === 'group_message' ? 'group' : 'direct';
    var threadId = notif.groupId || notif.convId;
    var prefId = root.Ce2Inbox.prefId(kind, threadId);
    var pref = (root.CommunicationState.inboxPrefs || {})[prefId];
    return !!(pref && pref.muted);
  }

  function bindForegroundPushSuppress() {
    if (root.__ce2ForegroundPushBound) return;
    root.__ce2ForegroundPushBound = true;
    if (typeof firebase === 'undefined' || typeof firebase.messaging !== 'function') return;
    try {
      var messaging = firebase.messaging();
      messaging.onMessage(function (payload) {
        var notif = parseForegroundPayload(payload);
        var threadOpen = !!(
          notif.type &&
          root.Ce2Runtime &&
          typeof root.Ce2Runtime.isMessengerThreadOpen === 'function' &&
          root.Ce2Runtime.isMessengerThreadOpen(notif)
        );
        var visible =
          typeof document !== 'undefined' && document.visibilityState === 'visible';
        var me = root.CommunicationState && root.CommunicationState.me;
        var suppress = root.Ce2Push
          ? root.Ce2Push.shouldSuppressForeground({
              threadOpen: threadOpen,
              documentVisible: visible,
              muted: isMutedForeground(notif),
              isSender: !!(me && notif.senderId && notif.senderId === me.uid),
              permissionDenied: hasNotificationApi() && NotifApi.permission === 'denied',
            })
          : threadOpen && visible;
        if (suppress) {
          if (threadOpen && typeof root.Ce2Runtime.ingestIncomingNotif === 'function') {
            root.Ce2Runtime.ingestIncomingNotif(notif);
          }
          return;
        }
        if (!hasNotificationApi() || NotifApi.permission !== 'granted') return;
        if (!('serviceWorker' in navigator)) return;
        navigator.serviceWorker.ready
          .then(function (reg) {
            return reg.showNotification(notif.title || 'New message', {
              body: notif.body || 'New message',
              icon: '/assets/icons/icon-192.png',
              badge: '/assets/icons/icon-72.png',
              tag: notif.tag || 'sbd-notification',
              renotify: true,
              data: {
                url: notif.url,
                convId: notif.convId,
                groupId: notif.groupId,
                messageId: notif.messageId,
                type: notif.type,
                senderId: notif.senderId,
              },
            });
          })
          .catch(function () {});
      });
    } catch (_) {}
  }

  function init(userId) {
    if (!userId) return;
    try {
      bindOffline();
      bindInstallPrompt();
      bindForegroundPushSuppress();
      migrateOwnLegacyPushToken(userId)
        .catch(function () {})
        .then(function () {
          if (!hasNotificationApi()) return;
          maybePushNudge(userId);
          if (NotifApi.permission === 'granted') initPush(userId);
        });
      if (hasNotificationApi() && NotifApi.permission === 'granted') {
        bindTokenRefresh(userId);
      }
    } catch (err) {
      console.warn('[CE2 PWA]', err);
    }
  }

  root.Ce2Pwa = {
    init: init,
    initPush: initPush,
    persistCe2PushToken: persistCe2PushToken,
    migrateOwnLegacyPushToken: migrateOwnLegacyPushToken,
  };
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof window !== 'undefined'
      ? window
      : self
);
