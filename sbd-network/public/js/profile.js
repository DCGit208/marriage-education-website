// ================================================================
// PROFILE PAGE
// ================================================================

const backBtn     = document.getElementById('backBtn');
const logoutBtn   = document.getElementById('logoutBtn');
const nameInput   = document.getElementById('nameInput');
const saveNameBtn = document.getElementById('saveNameBtn');
const avatarInput = document.getElementById('avatarInput');
const avatarImg   = document.getElementById('avatarImg');
const avatarInitials = document.getElementById('avatarInitials');
const profileEmail   = document.getElementById('profileEmail');

function showToast(msg) {
  const t = document.getElementById('appToast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function showLoading(show) {
  const el = document.getElementById('loadingOverlay');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function renderAvatar(name, photoUrl) {
  if (photoUrl) {
    avatarImg.src = photoUrl;
    avatarImg.style.display = 'block';
    avatarInitials.style.display = 'none';
  } else {
    avatarImg.style.display = 'none';
    avatarInitials.style.display = 'flex';
    avatarInitials.textContent = getInitials(name);
  }
}

auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = '/auth'; return; }

  if (typeof initNotifications === 'function') initNotifications(user.uid);
  if (typeof initDmBadge === 'function') initDmBadge(user.uid);

  showLoading(true);
  try {
    const userDoc = await db.collection('users').doc(user.uid).get();
    const data = userDoc.exists ? userDoc.data() : {};

    // Populate fields
    nameInput.value = data.name || user.displayName || '';
    profileEmail.textContent = user.email || '';
    renderAvatar(data.name || user.displayName, data.photoUrl || null);

    // Load groups
    await loadProfileGroups(data.groups || []);

    // Load collections
    await loadMyCollections(user.uid);

  } catch (err) {
    console.error('Profile load error:', err);
  } finally {
    showLoading(false);
  }
});

async function loadProfileGroups(groupIds) {
  const container = document.getElementById('profileGroupsList');
  if (!groupIds.length) {
    container.innerHTML = '<span class="profile-hint">No groups yet — contact an admin.</span>';
    return;
  }
  try {
    // Batch fetch all group docs
    const chunks = [];
    for (let i = 0; i < groupIds.length; i += 10) chunks.push(groupIds.slice(i, i + 10));
    const docs = (await Promise.all(
      chunks.map(chunk => db.collection('groups').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get())
    )).flatMap(s => s.docs);

    container.innerHTML = docs.map(d => `
      <a class="profile-group-chip" href="group.html?id=${d.id}">${escHtml(d.data().name || d.id)}</a>
    `).join('');
  } catch (err) {
    container.innerHTML = '<span class="profile-hint">Could not load groups.</span>';
  }
}

// ── My Collections ────────────────────────────────────────────────

const _COL_WORKER = 'https://sbd-upload-signer.sbdnetwork.workers.dev';

async function _profileColsCall(action, colPayload) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const idToken = await user.getIdToken();
  const res = await fetch(`${_COL_WORKER}/collections`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, collection: colPayload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Worker error');
  return data;
}

async function loadMyCollections(uid) {
  const list = document.getElementById('myCollectionsList');
  if (!list) return;
  try {
    const data = await _profileColsCall('get');
    const cols = data.collections || [];
    if (!cols.length) {
      list.innerHTML = '<span class="profile-hint">No collections yet.</span>';
    } else {
      list.innerHTML = cols.map(col => {
        const count = (col.postIds || []).length;
        return `<span class="profile-group-chip col-chip" data-colid="${escHtml(col.id)}" data-name="${escHtml(col.name)}" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
          ${escHtml(col.name)}<span style="opacity:0.55;font-size:0.78rem;">(${count})</span>
          <button data-colid="${escHtml(col.id)}" class="del-col-btn" type="button" style="margin-left:4px;background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:0.9rem;padding:0;" aria-label="Delete collection">✕</button>
        </span>`;
      }).join('');

      // Open viewer on chip click (but not on the delete button)
      list.querySelectorAll('.col-chip').forEach(chip => {
        chip.addEventListener('click', e => {
          if (e.target.classList.contains('del-col-btn')) return;
          const colId   = chip.dataset.colid;
          const colName = chip.dataset.name;
          const col     = cols.find(c => c.id === colId);
          if (col) openCollectionViewer(col, colName);
        });
      });

      list.querySelectorAll('.del-col-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this collection permanently?')) return;
          try {
            await _profileColsCall('delete', { id: btn.dataset.colid });
            await loadMyCollections(uid);
          } catch (err) {
            showToast('Error deleting collection');
          }
        });
      });
    }
  } catch (err) {
    console.warn('loadMyCollections:', err);
    list.innerHTML = '<span class="profile-hint">Could not load collections.</span>';
  }
}

// ── Collection viewer ──────────────────────────────────────────────

function _esc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function openCollectionViewer(col, colName) {
  const modal   = document.getElementById('colViewModal');
  const grid    = document.getElementById('colViewGrid');
  const titleEl = document.getElementById('colViewTitle');
  const closeBtn = document.getElementById('colViewClose');
  if (!modal || !grid) return;

  titleEl.textContent = colName;
  grid.innerHTML = '<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text-muted);font-size:0.9rem;">Loading…</div>';
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  const close = () => { modal.style.display = 'none'; document.body.style.overflow = ''; };
  closeBtn.onclick = close;
  modal.addEventListener('click', e => { if (e.target === modal) close(); }, { once: true });

  const postIds = col.postIds || [];
  if (!postIds.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text-muted);font-size:0.9rem;">No posts saved yet.</div>';
    return;
  }

  try {
    // Fetch posts in chunks of 10 (Firestore 'in' limit)
    const CHUNK = 10;
    const chunks = [];
    for (let i = 0; i < postIds.length; i += CHUNK) chunks.push(postIds.slice(i, i + CHUNK));

    const snaps = await Promise.all(
      chunks.map(c => db.collection('posts').where(firebase.firestore.FieldPath.documentId(), 'in', c).get())
    );
    const posts = snaps.flatMap(s => s.docs).map(d => ({ id: d.id, ...d.data() }));

    if (!posts.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text-muted);font-size:0.9rem;">No posts found (they may have been deleted).</div>';
      return;
    }

    grid.innerHTML = posts.map(post => {
      // Pick best thumbnail to represent the post
      const media = post.allMedia && post.allMedia.length ? post.allMedia[0] : null;
      let thumb = '';
      if (media) {
        thumb = media.type === 'image' ? media.url : (media.thumbUrl || '');
      } else if (post.imageUrl) {
        thumb = post.imageUrl;
      } else if (post.thumbUrl) {
        thumb = post.thumbUrl;
      }
      const isVideo = (media?.type === 'video') || (!media && !!post.videoUrl && !post.imageUrl);
      const href = `board.html?boardId=${encodeURIComponent(post.boardId)}&post=${encodeURIComponent(post.id)}`;

      return `<a href="${_esc(href)}" style="display:block;position:relative;aspect-ratio:1;overflow:hidden;border-radius:6px;background:var(--bg-tertiary,#0d0d1a);">
        ${thumb
          ? `<img src="${_esc(thumb)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;">`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.6rem;">📝</div>`}
        ${isVideo ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;"><span style="background:rgba(0,0,0,0.55);border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:0.9rem;">▶</span></div>` : ''}
      </a>`;
    }).join('');
  } catch (err) {
    grid.innerHTML = '<div style="grid-column:1/-1;padding:24px;text-align:center;color:#f55;font-size:0.9rem;">Could not load posts.</div>';
    console.warn('openCollectionViewer:', err);
  }
}

document.getElementById('createCollectionBtn')?.addEventListener('click', async () => {
  const name = window.prompt('Collection name:');
  if (!name || !name.trim()) return;
  const user = getCurrentUser();
  if (!user) return;
  try {
    await _profileColsCall('create', { name: name.trim(), postIds: [] });
    await loadMyCollections(user.uid);
    showToast('Collection created');
  } catch (err) {
    showToast('Error creating collection');
  }
});

// ── Save display name ─────────────────────────────────────────────
saveNameBtn.addEventListener('click', async () => {
  const newName = nameInput.value.trim();
  if (!newName) return;
  saveNameBtn.disabled = true;
  saveNameBtn.textContent = 'Saving…';
  try {
    const user = getCurrentUser();
    await Promise.all([
      db.collection('users').doc(user.uid).update({ name: newName }),
      user.updateProfile({ displayName: newName }),
    ]);
    renderAvatar(newName, avatarImg.style.display === 'block' ? avatarImg.src : null);
    showToast('Name saved!');
  } catch (err) {
    showToast('Could not save: ' + err.message);
  } finally {
    saveNameBtn.disabled = false;
    saveNameBtn.textContent = 'Save';
  }
});

// ── Avatar upload ─────────────────────────────────────────────────
avatarInput.addEventListener('change', async () => {
  const file = avatarInput.files[0];
  if (!file) return;

  const progress = document.getElementById('avatarUploadProgress');
  const fill     = document.getElementById('avatarFill');
  progress.style.display = 'block';
  fill.style.width = '30%';

  try {
    const user = getCurrentUser();
    const photoUrl = await uploadImage(file, user.uid);
    fill.style.width = '100%';
    await db.collection('users').doc(user.uid).update({ photoUrl });
    const data = (await db.collection('users').doc(user.uid).get()).data();
    renderAvatar(data.name || user.displayName, photoUrl);
    showToast('Photo updated!');
  } catch (err) {
    showToast('Upload failed: ' + err.message);
  } finally {
    setTimeout(() => { progress.style.display = 'none'; fill.style.width = '0%'; }, 800);
    avatarInput.value = '';
  }
});

// ── Nav ───────────────────────────────────────────────────────────
backBtn && backBtn.addEventListener('click', () => { window.location.href = 'dashboard.html'; });
logoutBtn && logoutBtn.addEventListener('click', async () => {
  await auth.signOut();
  window.location.href = '/auth';
});

// ── Delete My Account ─────────────────────────────────────────────
const deleteAccountBtn = document.getElementById('deleteAccountBtn');
deleteAccountBtn && deleteAccountBtn.addEventListener('click', async () => {
  if (!confirm('Permanently delete your account?\n\nThis will erase:\n• Your login credentials\n• All your posts and media\n• Your profile\n\nThis CANNOT be undone.')) return;
  if (!confirm('Are you absolutely sure? Type OK in the next prompt to confirm.') && !window.confirm('Last chance — permanently delete your account?')) return;
  try {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    const user = auth.currentUser;
    if (!user) throw new Error('Not signed in');
    const idToken = await user.getIdToken();
    const res = await fetch('https://sbd-upload-signer.sbdnetwork.workers.dev/delete-user', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUid: user.uid }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Deletion failed');
    await auth.signOut();
    window.location.href = '/auth';
  } catch (err) {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    alert('Error deleting account: ' + err.message);
  }
});

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── Notification Settings ─────────────────────────────────────────
const notifSettings = {
  pushNotif: document.getElementById('pushNotifToggle'),
  reactions: document.getElementById('reactionsNotifToggle'),
  comments: document.getElementById('commentsNotifToggle'),
  mentions: document.getElementById('mentionsNotifToggle'),
  newPosts: document.getElementById('newPostsNotifToggle'),
  dm: document.getElementById('dmNotifToggle'),
};

// Load notification settings
async function loadNotificationSettings(uid) {
  try {
    const settingsDoc = await db.collection('users').doc(uid).collection('settings').doc('notifications').get();
    if (settingsDoc.exists) {
      const data = settingsDoc.data();
      if (notifSettings.pushNotif) notifSettings.pushNotif.checked = data.pushNotif !== false;
      if (notifSettings.reactions) notifSettings.reactions.checked = data.reactions !== false;
      if (notifSettings.comments) notifSettings.comments.checked = data.comments !== false;
      if (notifSettings.mentions) notifSettings.mentions.checked = data.mentions !== false;
      if (notifSettings.newPosts) notifSettings.newPosts.checked = data.newPosts === true;
      if (notifSettings.dm) notifSettings.dm.checked = data.dm !== false;
    }
  } catch (err) {
    console.warn('[Profile] Failed to load notification settings:', err);
  }
}

// Save notification setting
async function saveNotificationSetting(settingName, value) {
  try {
    const user = auth.currentUser;
    if (!user) return;
    
    await db.collection('users').doc(user.uid).collection('settings').doc('notifications').set({
      [settingName]: value,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    
    console.log(`[Profile] Notification setting saved: ${settingName} = ${value}`);
  } catch (err) {
    console.error('[Profile] Failed to save notification setting:', err);
    showToast('Failed to save setting');
  }
}

// Set up toggle listeners
Object.entries(notifSettings).forEach(([key, toggle]) => {
  if (!toggle) return;
  
  // Special handling for push notifications
  if (key === 'pushNotif') {
    toggle.addEventListener('change', async () => {
      if (toggle.checked) {
        // Request permission
        try {
          if ('Notification' in window && Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
              toggle.checked = false;
              showToast('Push notifications denied');
              return;
            }
          }
          if (Notification.permission !== 'granted') {
            toggle.checked = false;
            showToast('Push notifications not allowed');
            return;
          }
          saveNotificationSetting(key, true);
          showToast('Push notifications enabled');
        } catch (err) {
          console.error('[Profile] Push notification error:', err);
          toggle.checked = false;
          showToast('Failed to enable notifications');
        }
      } else {
        saveNotificationSetting(key, false);
        showToast('Push notifications disabled');
      }
    });
    
    // Initialize push notification toggle based on permission
    if ('Notification' in window) {
      if (Notification.permission === 'denied') {
        toggle.disabled = true;
        toggle.checked = false;
      } else if (Notification.permission === 'granted') {
        // Leave as is from Firestore
      } else {
        toggle.checked = false;
      }
    }
  } else {
    // Regular toggle
    toggle.addEventListener('change', () => {
      saveNotificationSetting(key, toggle.checked);
    });
  }
});

// Initialize notification settings when user loads
auth.onAuthStateChanged((user) => {
  if (user) {
    loadNotificationSettings(user.uid);
  }
});
