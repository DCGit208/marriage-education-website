// ================================================================
// NOTIFICATIONS — In-app bell + FCM Web Push (v2 group messages)
// ================================================================

const NOTIF_WORKER_URL = 'https://sbd-upload-signer.sbdnetwork.workers.dev';

// ⚠️  Replace with your VAPID key:
//   Firebase Console → Project Settings → Cloud Messaging
//   → Web push certificates → Generate key pair → copy the key
const FCM_VAPID_KEY = 'BAlZ5xWEFm9mGl8b5osLULe4_fobt0vYNTypMJX8zumgU1nNsv95SN2HbbqAYrfuCZ7GkmPAoeT6yzuB0I7dlkI';

/** In-panel list cap (Instagram/LinkedIn-style recent activity). */
const NOTIF_PANEL_LIMIT = 15;
/** Badge only reflects unread from this window — avoids stale red dots. */
const NOTIF_BADGE_MAX_AGE_DAYS = 7;
/** Read notifications older than this are purged on panel open. */
const NOTIF_RETENTION_DAYS = 30;
/** Version/admin announcements auto-expire — use What's New for detail. */
const NOTIF_ANNOUNCEMENT_MAX_AGE_DAYS = 14;

let _notifUserId    = null;
let _notifUserData  = null;
let _boardMetaCache = {};
let _unsubNotif     = null;  // unread badge listener
let _unsubPanel     = null;  // live panel list listener
let _latestNotifId  = null;  // track newest seen doc to detect truly new arrivals
let _notifPurging   = false; // prevent delete → snapshot → delete loops on iOS

// ── Init ─────────────────────────────────────────────────────────
async function initNotifications(userId) {
  _notifUserId = userId;
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    _notifUserData = userDoc.exists ? userDoc.data() : null;
  } catch (_) {
    _notifUserData = null;
  }
  _startUnreadListener(userId);
  _ensurePanelShell();
  _setupBellListeners(userId);
  _ensurePanelChrome();
  // Defer heavy purge — running during dashboard boot caused iOS listener churn
  setTimeout(() => _purgeStaleNotifications(userId).catch(() => {}), 4000);
  // Show a nudge banner if the user hasn't enabled push yet
  _maybeShowPushNudge(userId);
  // Silently refresh the FCM token on every login (fixes stale tokens after SW updates)
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    _initPush(userId);
  }
}

// ── Board-linked notification access filter ───────────────────────
async function _getBoardMeta(boardId) {
  if (!boardId) return null;
  if (_boardMetaCache[boardId]) return _boardMetaCache[boardId];
  try {
    const boardDoc = await db.collection('boards').doc(boardId).get();
    const meta = boardDoc.exists
      ? {
          groupId: boardDoc.data().groupId || null,
          requiredTier: boardDoc.data().requiredTier || 'free',
        }
      : { groupId: null, requiredTier: 'free' };
    _boardMetaCache[boardId] = meta;
    return meta;
  } catch (_) {
    return { groupId: null, requiredTier: 'free' };
  }
}

function _canViewBoardNotif(n) {
  if (!n || !n.boardId) return true;
  if (typeof NotificationAccess === 'undefined' || !_notifUserData) return false;
  const meta = _boardMetaCache[n.boardId];
  if (!meta) return false;
  return NotificationAccess.userCanReceiveBoardNotification(_notifUserData, n.boardId, meta);
}

async function _prepareBoardMetaForDocs(docs) {
  const boardIds = [...new Set(docs.map(d => d.data().boardId).filter(Boolean))];
  await Promise.all(boardIds.map(id => _getBoardMeta(id)));
}

async function _filterVisibleNotifDocs(docs, purgeIneligible) {
  const withBoard = docs.filter(d => d.data().boardId);
  const withoutBoard = docs.filter(d => !d.data().boardId);
  if (!withBoard.length) return docs;

  await _prepareBoardMetaForDocs(withBoard);

  const visible = [...withoutBoard];
  const toDelete = [];

  withBoard.forEach(doc => {
    if (_canViewBoardNotif(doc.data())) visible.push(doc);
    else if (purgeIneligible && !_notifPurging) toDelete.push(doc.ref);
  });

  if (toDelete.length && !_notifPurging) {
    _notifPurging = true;
    try {
      const batch = db.batch();
      toDelete.forEach(ref => batch.delete(ref));
      await batch.commit();
    } catch (_) {
      /* ignore */
    } finally {
      setTimeout(() => { _notifPurging = false; }, 800);
    }
  }

  return visible;
}

function _notifTimestampMs(data) {
  if (!data?.timestamp) return 0;
  if (data.timestamp.toMillis) return data.timestamp.toMillis();
  if (data.timestamp._seconds) return data.timestamp._seconds * 1000;
  return 0;
}

function _sortNotifDocsNewestFirst(docs) {
  return docs.slice().sort((a, b) => _notifTimestampMs(b.data()) - _notifTimestampMs(a.data()));
}

function _isRecentForBadge(data) {
  const ts = _notifTimestampMs(data);
  if (!ts) return true;
  return ts >= Date.now() - NOTIF_BADGE_MAX_AGE_DAYS * 86400000;
}

async function _purgeStaleNotifications(userId) {
  if (!userId) return;
  const readCutoff = Date.now() - NOTIF_RETENTION_DAYS * 86400000;
  const announceCutoff = Date.now() - NOTIF_ANNOUNCEMENT_MAX_AGE_DAYS * 86400000;
  try {
    const snap = await db.collection('notifications')
      .where('userId', '==', userId)
      .limit(120)
      .get();
    const toDelete = [];
    snap.forEach(doc => {
      const n = doc.data();
      const ts = _notifTimestampMs(n);
      if (!ts) return;
      if (n.type === 'announcement' && ts < announceCutoff) {
        toDelete.push(doc.ref);
        return;
      }
      if (n.read === true && ts < readCutoff) toDelete.push(doc.ref);
    });
    if (!toDelete.length) return;
    for (let i = 0; i < toDelete.length; i += 400) {
      const batch = db.batch();
      toDelete.slice(i, i + 400).forEach(ref => batch.delete(ref));
      await batch.commit();
    }
  } catch (_) {}
}

function _shouldSuppressMessengerToast(n) {
  if (!n || (n.type !== 'direct_message' && n.type !== 'group_message')) return false;
  if (typeof window === 'undefined') return false;
  if (!/\/communication-v2\/?/i.test(window.location.pathname || '')) return false;
  if (window.Ce2Runtime && typeof window.Ce2Runtime.isMessengerThreadOpen === 'function') {
    return window.Ce2Runtime.isMessengerThreadOpen(n);
  }
  const ac = window.CommunicationState && window.CommunicationState.activeConversation;
  if (!ac || ac.needsJoin) return false;
  if (n.type === 'direct_message') {
    if (ac.type !== 'direct') return false;
    if (n.convId && ac.id && n.convId === ac.id) return true;
    if (n.senderId && ac.otherUid && n.senderId === ac.otherUid) return true;
    return false;
  }
  const gid = n.groupId || n.convId;
  return n.type === 'group_message' && ac.type === 'group' && !!gid && ac.id === gid;
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
      .onSnapshot(async (snap) => {
        try {
          // Badge only — never delete here (deletes re-fire snapshot and freeze iOS)
          const visible = await _filterVisibleNotifDocs(snap.docs, false);
          const recentUnread = visible.filter(d => _isRecentForBadge(d.data()));
          _setBadge(recentUnread.length);
          if (!first) {
            for (const change of snap.docChanges()) {
              if (change.type !== 'added') continue;
              const n = change.doc.data();
              if (n.boardId) await _getBoardMeta(n.boardId);
              if (
                (n.type === 'direct_message' || n.type === 'group_message') &&
                window.Ce2Runtime &&
                typeof window.Ce2Runtime.ingestIncomingNotif === 'function'
              ) {
                window.Ce2Runtime.ingestIncomingNotif(
                  Object.assign({ messageId: n.messageId || '' }, n)
                );
              }
              if (_canViewBoardNotif(n) && !_shouldSuppressMessengerToast(n)) _showNotifToast(n);
            }
          }
          first = false;
        } catch (err) {
          console.warn('[Notifications] Unread snapshot handler failed:', err);
        }
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

  const icon = n.type === 'new_post' ? '📝' : n.type === 'new_comment' ? '💬' : n.type === 'new_reaction' ? '❤️' : n.type === 'announcement' ? '📢' : n.type === 'group_message' ? '👥' : n.type === 'direct_message' ? '✉️' : (n.type === 'mention_post' || n.type === 'mention_comment') ? '🔔' : '💬';
  const toast = document.createElement('div');
  toast.className = 'notif-toast';
  toast.innerHTML = `<span class="notif-toast-icon">${icon}</span><div class="notif-toast-body"><div class="notif-toast-title">${_esc(n.title)}</div>${n.body ? `<div class="notif-toast-text">${_esc(n.body.substring(0, 80))}${n.body.length > 80 ? '…' : ''}</div>` : ''}</div>`;

  // Clicking the toast should land on the same target as the panel item.
  toast.addEventListener('click', () => {
    toast.remove();
    const targetUrl = _notificationTargetUrl(n);
    if (targetUrl) {
      window.location.href = targetUrl;
    } else {
      openNotifPanel();
    }
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

function _notificationTargetUrl(n) {
  if (!n) return '';
  if (n.boardId) {
    let url = `/board.html?boardId=${encodeURIComponent(n.boardId)}`;
    if (n.postId) {
      url += `&post=${encodeURIComponent(n.postId)}`;
    }
    if (n.commentId) {
      url += `&comment=${encodeURIComponent(n.commentId)}`;
    }
    return url;
  }
  if (n.type === 'group_message' && (n.groupId || n.convId)) {
    let url = `/communication-v2/?group=${encodeURIComponent(n.groupId || n.convId)}`;
    if (n.messageId) url += `&msg=${encodeURIComponent(n.messageId)}`;
    return url;
  }
  if (n.type === 'direct_message' && n.convId) {
    let url = `/communication-v2/?conv=${encodeURIComponent(n.convId)}`;
    if (n.messageId) url += `&msg=${encodeURIComponent(n.messageId)}`;
    return url;
  }
  return '';
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
let _clearAllBusy = false;

function _ensurePanelShell() {
  if (!document.getElementById('notifOverlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'notifOverlay';
    overlay.className = 'notif-overlay';
    overlay.style.display = 'none';
    document.body.appendChild(overlay);
  }

  if (!document.getElementById('notifPanel')) {
    const panel = document.createElement('aside');
    panel.id = 'notifPanel';
    panel.className = 'notif-panel';
    panel.setAttribute('aria-label', 'Notifications');
    panel.innerHTML = `
      <div class="notif-panel-header">
        <h3>Notifications</h3>
        <button id="notifPanelClose" class="notif-close-btn" type="button" aria-label="Close notifications">&times;</button>
      </div>
      <ul id="notifList" class="notif-list">
        <li class="notif-empty">No notifications yet</li>
      </ul>
    `;
    document.body.appendChild(panel);
  }
}

function _ensurePanelChrome() {
  _ensurePanelShell();
  const header = document.querySelector('#notifPanel .notif-panel-header');
  if (!header || header.dataset.notifChrome === '1') return;
  const closeBtn = document.getElementById('notifPanelClose');
  if (!closeBtn) return;

  header.dataset.notifChrome = '1';
  const actions = document.createElement('div');
  actions.className = 'notif-panel-header-actions';

  const clearBtn = document.createElement('button');
  clearBtn.id = 'notifClearAll';
  clearBtn.type = 'button';
  clearBtn.className = 'notif-clear-all-btn';
  clearBtn.textContent = 'Clear all';
  clearBtn.setAttribute('aria-label', 'Clear all notifications');
  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    _clearAllNotifications();
  });

  actions.appendChild(clearBtn);
  actions.appendChild(closeBtn);
  header.appendChild(actions);
}

async function _clearAllNotifications() {
  if (!_notifUserId || _clearAllBusy) return;
  _clearAllBusy = true;
  const clearBtn = document.getElementById('notifClearAll');
  if (clearBtn) clearBtn.disabled = true;

  try {
    const snap = await db.collection('notifications')
      .where('userId', '==', _notifUserId)
      .limit(200)
      .get();
    const visible = await _filterVisibleNotifDocs(snap.docs, true);
    const refs = visible.map((d) => d.ref);
    for (let i = 0; i < refs.length; i += 400) {
      const batch = db.batch();
      refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
    _setBadge(0);
    const list = document.getElementById('notifList');
    if (list) list.innerHTML = '<li class="notif-empty">No notifications yet</li>';
    if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {});
  } catch (err) {
    console.warn('[Notifications] Clear all failed:', err);
  } finally {
    _clearAllBusy = false;
    if (clearBtn) clearBtn.disabled = false;
  }
}

function _setupBellListeners(userId) {
  _ensurePanelShell();
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
  _ensurePanelShell();
  const panel   = document.getElementById('notifPanel');
  const overlay = document.getElementById('notifOverlay');
  if (!panel) return;
  _ensurePanelChrome();
  panel.classList.add('open');
  if (overlay) overlay.style.display = 'block';
  document.body.style.overflow = 'hidden';

  // Start live listener for the panel list
  _startPanelListener();
  _purgeStaleNotifications(_notifUserId);

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
    .limit(NOTIF_PANEL_LIMIT + 10);

  _unsubPanel = query.onSnapshot(
    snap => _renderFromSnap(snap, list),
    // Index not ready — fall back to unordered
    () => {
      _unsubPanel = db.collection('notifications')
        .where('userId', '==', _notifUserId)
        .limit(NOTIF_PANEL_LIMIT + 10)
        .onSnapshot(snap => _renderFromSnap(snap, list));
    }
  );
}

function _renderFromSnap(snap, list) {
  _filterVisibleNotifDocs(snap.docs, true).then(visibleDocs => {
    const sorted = _sortNotifDocsNewestFirst(visibleDocs).slice(0, NOTIF_PANEL_LIMIT);
    if (!sorted.length) {
      list.innerHTML = '<li class="notif-empty">No notifications yet</li>';
      return;
    }
    list.innerHTML = '';

    // Mark visible unread as read (batch, fire-and-forget)
    const unread = sorted.filter(d => !d.data().read);
    if (unread.length) {
      const batch = db.batch();
      unread.forEach(d => batch.update(d.ref, { read: true }));
      batch.commit().catch(() => {});
    }

    sorted.forEach(doc => {
      _appendNotifItem(doc.data(), list);
    });

    const footer = document.createElement('li');
    footer.className = 'notif-empty notif-panel-footer';
    footer.textContent = `Showing your ${NOTIF_PANEL_LIMIT} most recent alerts · read items clear after ${NOTIF_RETENTION_DAYS} days`;
    list.appendChild(footer);
  }).catch(() => {
    list.innerHTML = '<li class="notif-empty">Could not load notifications</li>';
  });
}

function _appendNotifItem(n, list) {
    const li = document.createElement('li');
    li.className = 'notif-item' + (n.read ? '' : ' unread');
    const ago  = n.timestamp?.toDate ? _timeAgo(n.timestamp.toDate()) : '';
  const icon = n.type === 'new_post' ? '📝' : n.type === 'new_comment' ? '💬' : n.type === 'new_reaction' ? '❤️' : n.type === 'announcement' ? '📢' : n.type === 'group_message' ? '👥' : n.type === 'direct_message' ? '✉️' : (n.type === 'mention_post' || n.type === 'mention_comment') ? '🔔' : '💬';
  li.innerHTML = `
      <span class="ni-icon">${icon}</span>
      <div class="ni-body">
        <div class="ni-title">${_esc(n.title)}</div>
        <div class="ni-text">${_esc(n.body)}</div>
        <div class="ni-time">${ago}</div>
      </div>
    `;
    const targetUrl = _notificationTargetUrl(n);
    if (targetUrl) {
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => {
        closeNotifPanel();
        window.location.href = targetUrl;
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
        commentId: commentId,
        groupId: groupId || null,
        url:     `/board.html?boardId=${boardId}&post=${postId}&comment=${commentId}`,
      }),
    });
  } catch (err) {
    console.warn('[Push] Failed to trigger comment notification:', err);
  }
}
