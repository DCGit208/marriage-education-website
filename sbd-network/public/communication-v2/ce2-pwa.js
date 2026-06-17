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
      var token = await messaging.getToken({
        vapidKey: FCM_VAPID_KEY,
        serviceWorkerRegistration: reg,
      });
      if (!token || typeof db === 'undefined') return;

      await db.collection('users').doc(userId).update({ fcmToken: token });

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

  function bindForegroundPushSuppress() {
    if (root.__ce2ForegroundPushBound) return;
    root.__ce2ForegroundPushBound = true;
    if (typeof firebase === 'undefined' || typeof firebase.messaging !== 'function') return;
    try {
      var messaging = firebase.messaging();
      messaging.onMessage(function (payload) {
        var data = (payload && payload.data) || {};
        var notif = {
          type:
            data.type === 'dm'
              ? 'direct_message'
              : data.type === 'group_message'
                ? 'group_message'
                : '',
          convId: data.convId || '',
          senderId: data.senderId || '',
          groupId: data.groupId || '',
          messageId: data.messageId || '',
          body:
            (payload.notification && payload.notification.body) ||
            data.body ||
            '',
        };
        if (
          notif.type &&
          root.Ce2Runtime &&
          typeof root.Ce2Runtime.isMessengerThreadOpen === 'function' &&
          root.Ce2Runtime.isMessengerThreadOpen(notif)
        ) {
          if (typeof root.Ce2Runtime.ingestIncomingNotif === 'function') {
            root.Ce2Runtime.ingestIncomingNotif(notif);
          }
          return;
        }
      });
    } catch (_) {}
  }

  function init(userId) {
    if (!userId) return;
    try {
      bindOffline();
      bindInstallPrompt();
      bindForegroundPushSuppress();
      if (hasNotificationApi()) {
        maybePushNudge(userId);
        if (NotifApi.permission === 'granted') initPush(userId);
      }
    } catch (err) {
      console.warn('[CE2 PWA]', err);
    }
  }

  root.Ce2Pwa = { init: init, initPush: initPush };
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof window !== 'undefined'
      ? window
      : self
);
