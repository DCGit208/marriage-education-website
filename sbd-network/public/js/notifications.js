// ================================================================
// NOTIFICATIONS — In-app bell + FCM Web Push
// ================================================================

const NOTIF_WORKER_URL = 'https://sbd-upload-signer.sbdnetwork.workers.dev';

// ⚠️  Replace with your VAPID key:
//   Firebase Console → Project Settings → Cloud Messaging
//   → Web push certificates → Generate key pair → copy the key
const FCM_VAPID_KEY = 'BAlZ5xWEFm9mGl8b5osLULe4_fobt0vYNTypMJX8zumgU1nNsv95SN2HbbqAYrfuCZ7GkmPAoeT6yzuB0I7dlkI';

let _notifUserId    = null;
let _unsubNotif     = null;  // unread badge listener
let _unsubPanel     = null;  // live panel list listener
let _latestNotifId  = null;  // track newest seen doc to detect truly new arrivals

// ── Init ─────────────────────────────────────────────────────────
async function initNotifications(userId) {
  _notifUserId = userId;
  _startUnreadListener(userId);
  _setupBellListeners(userId);
  // Show a nudge banner if the user hasn't enabled push yet
  _maybeShowPushNudge(userId);
  // Silently refresh the FCM token on every login (fixes stale tokens after SW updates)
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    _initPush(userId);
  }
}

// ── Real-time unread count + foreground toast ─────────────────────
function _startUnreadListener(userId) {
  if (_unsubNotif) { _unsubNotif(); _unsubNotif = null; }
  
  // Wait for auth to be fully ready before starting listener
  const startListener = () => {
    let first = true;
    _unsubNotif = db.collection('notifications')
      .where('userId', '==', userId)
      .where('read', '==', false)
      .onSnapshot(snap => {
        _setBadge(snap.size);
        // On subsequent snapshots (not the initial load), show a toast for each new doc
        if (!first) {
          snap.docChanges().forEach(change => {
            if (change.type === 'added') _showNotifToast(change.doc.data());
          });
        }
        first = false;
      }, err => {
        console.error('[Notifications] Unread listener failed:', err);
        // If permission denied, user might not be fully authenticated yet - retry once
        if (err.code === 'permission-denied') {
          console.log('[Notifications] Retrying listener in 1s...');
          setTimeout(() => startListener(), 1000);
        }
      });
  };
  
  // Small delay to ensure auth token is propagated
  setTimeout(startListener, 500);
}

function _showNotifToast(n) {
  // Don't show a toast if the panel is already open
  const panel = document.getElementById('notifPanel');
  if (panel && panel.classList.contains('open')) return;

  const icon = n.type === 'new_post' ? '📝' : n.type === 'new_comment' ? '💬' : n.type === 'new_reaction' ? '❤️' : n.type === 'announcement' ? '📢' : (n.type === 'mention_post' || n.type === 'mention_comment') ? '🔔' : '💬';
  const toast = document.createElement('div');
  toast.className = 'notif-toast';
  toast.innerHTML = `<span class="notif-toast-icon">${icon}</span><div class="notif-toast-body"><div class="notif-toast-title">${_esc(n.title)}</div>${n.body ? `<div class="notif-toast-text">${_esc(n.body.substring(0, 80))}${n.body.length > 80 ? '…' : ''}</div>` : ''}</div>`;

  // Clicking the toast opens the notification panel
  toast.addEventListener('click', () => {
    toast.remove();
    openNotifPanel();
  });

  document.body.appendChild(toast);
  // Animate in
  requestAnimationFrame(() => toast.classList.add('notif-toast--in'));
  // Auto-dismiss after 5s
  setTimeout(() => {
    toast.classList.remove('notif-toast--in');
    setTimeout(() => toast.remove(), 400);
  }, 5000);
}

function _setBadge(count) {
  document.querySelectorAll('.notif-badge').forEach(b => {
    b.textContent  = count > 99 ? '99+' : String(count);
    b.style.display = count > 0 ? 'flex' : 'none';
  });
  // Sync the iOS / Android PWA app icon badge count
  if ('setAppBadge' in navigator) {
    if (count > 0) navigator.setAppBadge(count).catch(() => {});
    else           navigator.clearAppBadge().catch(() => {});
  }
}

// ── Bell & panel listeners ────────────────────────────────────────
let _pushInitialised = false;
function _setupBellListeners(userId) {
  // Use event delegation on body — works even if bell is rendered late
  document.body.addEventListener('click', e => {
    if (!e.target.closest('.notif-bell-btn')) return;
    openNotifPanel();
    if (!_pushInitialised) {
      _pushInitialised = true;
      _initPush(userId).then(() => _dismissPushNudge());
    }
  }, { capture: true });

  const overlay  = document.getElementById('notifOverlay');
  const closeBtn = document.getElementById('notifPanelClose');
  if (overlay)  overlay.addEventListener('click', closeNotifPanel);
  if (closeBtn) closeBtn.addEventListener('click', closeNotifPanel);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeNotifPanel();
  });
}

// ── Notification panel ────────────────────────────────────────────
function openNotifPanel() {
  const panel   = document.getElementById('notifPanel');
  const overlay = document.getElementById('notifOverlay');
  if (!panel) return;
  panel.classList.add('open');
  if (overlay) overlay.style.display = 'block';
  document.body.style.overflow = 'hidden';

  // Start live listener for the panel list
  _startPanelListener();

  // Clear the PWA app icon badge when user opens the notification panel
  if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {});
}

function closeNotifPanel() {
  const panel   = document.getElementById('notifPanel');
  const overlay = document.getElementById('notifOverlay');
  if (panel)   panel.classList.remove('open');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
  // Tear down the panel listener — no wasted reads when closed
  if (_unsubPanel) { _unsubPanel(); _unsubPanel = null; }
}

function _startPanelListener() {
  if (_unsubPanel) { _unsubPanel(); _unsubPanel = null; }
  const list = document.getElementById('notifList');
  if (!list || !_notifUserId) return;
  list.innerHTML = '<li class="notif-empty">Loading…</li>';

  const query = db.collection('notifications')
    .where('userId', '==', _notifUserId)
    .orderBy('timestamp', 'desc')
    .limit(20);

  _unsubPanel = query.onSnapshot(
    snap => _renderFromSnap(snap, list),
    // Index not ready — fall back to unordered
    () => {
      _unsubPanel = db.collection('notifications')
        .where('userId', '==', _notifUserId)
        .limit(20)
        .onSnapshot(snap => _renderFromSnap(snap, list));
    }
  );
}

function _renderFromSnap(snap, list) {
  if (snap.empty) {
    list.innerHTML = '<li class="notif-empty">No notifications yet</li>';
    return;
  }
  list.innerHTML = '';

  // Mark all as read (batch, fire-and-forget)
  const unread = snap.docs.filter(d => !d.data().read);
  if (unread.length) {
    const batch = db.batch();
    unread.forEach(d => batch.update(d.ref, { read: true }));
    batch.commit().catch(() => {});
  }

  snap.forEach(doc => {
    const n  = doc.data();
    const li = document.createElement('li');
    li.className = 'notif-item' + (n.read ? '' : ' unread');
    const ago  = n.timestamp?.toDate ? _timeAgo(n.timestamp.toDate()) : '';
    const icon = n.type === 'new_post' ? '📝' : n.type === 'new_comment' ? '💬' : n.type === 'new_reaction' ? '❤️' : n.type === 'announcement' ? '📢' : (n.type === 'mention_post' || n.type === 'mention_comment') ? '🔔' : '💬';
    li.innerHTML = `
      <span class="ni-icon">${icon}</span>
      <div class="ni-body">
        <div class="ni-title">${_esc(n.title)}</div>
        <div class="ni-text">${_esc(n.body)}</div>
        <div class="ni-time">${ago}</div>
      </div>
    `;
    if (n.boardId) {
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => {
        closeNotifPanel();
        let url = `board.html?boardId=${encodeURIComponent(n.boardId)}`;
        if (n.postId) {
          url += `&post=${encodeURIComponent(n.postId)}`;
        }
        if (n.commentId) {
          url += `&comment=${encodeURIComponent(n.commentId)}`;
        }
        window.location.href = url;
      });
    } else if (n.type === 'announcement') {
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => {
        closeNotifPanel();
        const vMatch = (n.title || '').match(/v(\d+)/);
        _openAnnouncementSheet(vMatch ? vMatch[1] : null, n);
      });
    }
    list.appendChild(li);
  });
}

async function _openAnnouncementSheet(version, notif) {
  // If we're not on dashboard, navigate there so the modal exists
  const modal = document.getElementById('whatsNewModal');
  if (!modal) {
    // Navigate to dashboard with a flag to reopen the sheet
    if (version) localStorage.setItem('sbd-reopen-version', version);
    window.location.href = '/dashboard.html';
    return;
  }

  // Try to load the full entry from changelog.json
  try {
    const res = await fetch('/changelog.json?_=' + Date.now());
    if (res.ok) {
      const log = await res.json();
      const entry = version
        ? (log.versions || []).find(v => String(v.version) === String(version))
        : null;
      if (entry && typeof showWhatsNew === 'function') {
        showWhatsNew(entry);
        return;
      }
    }
  } catch (_) {}

  // Fallback: build a minimal entry from notification data
  if (typeof showWhatsNew === 'function') {
    const fallbackTitle = (notif.title || '').replace(/^[\p{Emoji}\p{Emoji_Presentation}]+\s*/u, '');
    const changes = notif.body ? notif.body.split(' · ').map(s => '• ' + s) : ['No details available.'];
    showWhatsNew({ version: version || '?', title: fallbackTitle, emoji: '📢', changes });
  }
}

function _timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

function _esc(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── FCM Web Push — device registration ───────────────────────────
async function _initPush(userId) {
  // Check full browser support (iOS < 16.4 PWA, Firefox Private, etc.)
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.info('[Push] Not supported on this browser/device');
    return;
  }
  if (typeof firebase === 'undefined' || typeof firebase.messaging !== 'function') return;

  try {
    // Only prompt if not yet decided — calling requestPermission() from a
    // non-gesture context (e.g. auth state change) throws a browser error.
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      // User denied push notifications - this is normal, don't spam console
      return;
    }

    // Explicitly register (idempotent — safe to call every time) then wait for active
    await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
    const reg       = await navigator.serviceWorker.ready;
    const messaging = firebase.messaging();
    const token     = await messaging.getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) { console.warn('[Push] No token returned'); return; }

    // Persist token on user doc
    await db.collection('users').doc(userId).update({ fcmToken: token });

    // Subscribe to /topics/sbd-all via Worker
    const idToken = await firebase.auth().currentUser.getIdToken();
    fetch(`${NOTIF_WORKER_URL}/register-push`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fcmToken: token }),
    }).catch(e => console.warn('[Push] Topic subscription failed:', e));

    console.log('[Push] Registered ✓');
  } catch (err) {
    console.warn('[Push] Setup failed:', err);
  }
}

// ── Push nudge banner ─────────────────────────────────────────────
// Shows a tappable bottom bar if push permission hasn't been granted yet.
// iOS (and all browsers) require a user gesture to call requestPermission(),
// so we can't auto-request — but we CAN show a clear, tappable prompt.
function _maybeShowPushNudge(userId) {
  if (!('Notification' in window)) return;             // browser doesn't support
  if (!('serviceWorker' in navigator)) return;
  if (Notification.permission !== 'default') return;   // already granted or denied
  if (localStorage.getItem('sbd_push_dismissed')) return;
  if (document.getElementById('push-nudge')) return;   // already showing

  const bar = document.createElement('div');
  bar.id = 'push-nudge';
  bar.innerHTML =
    '<span class="push-nudge-text">🔔 Enable notifications to get alerts for new posts & comments</span>' +
    '<button class="push-nudge-btn" id="push-nudge-yes">Enable</button>' +
    '<button class="push-nudge-x"  id="push-nudge-no" aria-label="Dismiss">✕</button>';
  document.body.appendChild(bar);

  document.getElementById('push-nudge-yes').addEventListener('click', () => {
    bar.remove();
    _pushInitialised = true;
    _initPush(userId);
  });
  document.getElementById('push-nudge-no').addEventListener('click', () => {
    localStorage.setItem('sbd_push_dismissed', '1');
    bar.remove();
  });
}

function _dismissPushNudge() {
  const bar = document.getElementById('push-nudge');
  if (bar) bar.remove();
}

// ── FCM push — called from posts.js after creating a post ─────────
async function _triggerPushNewPost(boardId, boardName, postId, authorName, content, groupId) {
  if (FCM_VAPID_KEY === 'REPLACE_WITH_YOUR_VAPID_KEY') return;
  try {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const idToken = await user.getIdToken();
    await fetch(`${NOTIF_WORKER_URL}/notify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type:    'new_post',
        title:   `New post in ${boardName || 'SBD Network'}`,
        body:    `${authorName}: ${(content || 'Shared media').substring(0, 80)}`,
        boardId: boardId,
        postId:  postId,
        groupId: groupId || null,
        url:     `/board.html?boardId=${boardId}&post=${postId}`,
      }),
    });
  } catch (err) {
    console.warn('[Push] Failed to trigger notification:', err);
  }
}

// ── FCM push — called from posts.js after a comment is added ──────
async function _triggerPushForComment(boardId, boardName, postId, commentId, commenterName, text, groupId) {
  try {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const idToken = await user.getIdToken();
    await fetch(`${NOTIF_WORKER_URL}/notify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type:    'new_comment',
        title:   `New comment in ${boardName || 'SBD Network'}`,
        body:    `${commenterName}: ${(text || '').substring(0, 80)}`,
        boardId: boardId,
        postId:  postId,
        groupId: groupId || null,
        url:     `/board.html?boardId=${boardId}&post=${postId}&comment=${commentId}`,
      }),
    });
  } catch (err) {
    console.warn('[Push] Failed to trigger comment notification:', err);
  }
}
