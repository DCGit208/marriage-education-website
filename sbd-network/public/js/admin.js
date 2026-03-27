// ================================================================
// ADMIN PANEL LOGIC  —  v49
// ================================================================

let allGroups = [];
let allBoards = [];
let allUsers = [];
let currentManagingUserId = null;
let currentMovePostId = null;

// DOM Elements
const backBtn = document.getElementById('backBtn');
const logoutBtn = document.getElementById('logoutBtn');
const tabBtns = document.querySelectorAll('.tab-btn');
const groupsList = document.getElementById('groupsList');
const boardsList = document.getElementById('boardsList');
const usersList = document.getElementById('usersList');
const contentList = document.getElementById('contentList');
const analyticsList = document.getElementById('analyticsList');
const createGroupBtn = document.getElementById('createGroupBtn');
const createBoardBtn = document.getElementById('createBoardBtn');
const broadcastBtn = document.getElementById('broadcastBtn');
const refreshAnalyticsBtn = document.getElementById('refreshAnalyticsBtn');
const createGroupModal = document.getElementById('createGroupModal');
const editGroupModal = document.getElementById('editGroupModal');
const createBoardModal = document.getElementById('createBoardModal');
const editBoardModal = document.getElementById('editBoardModal');
const manageUserModal = document.getElementById('manageUserModal');
const movePostModal = document.getElementById('movePostModal');
const broadcastModal = document.getElementById('broadcastModal');
const loadingOverlay = document.getElementById('loadingOverlay');

// ── Auth guard ────────────────────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = 'index.html'; return; }
  try {
    showLoading(true);
    const isAdmin = await isUserAdmin();
    if (!isAdmin) {
      alert('Access denied. Admin privileges required.');
      window.location.href = 'dashboard.html';
      return;
    }
    await Promise.all([loadGroups(), loadBoards(), loadUsers()]);
  } catch (err) {
    console.error('Admin init error:', err);
    alert('Error loading admin panel');
  } finally {
    showLoading(false);
  }
});

// ── Tab switching ─────────────────────────────────────────────────
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(tabName + 'Tab').classList.add('active');
    if (tabName === 'content') loadContent();
    if (tabName === 'analytics') loadAnalytics();
  });
});

// ================================================================
// GROUPS
// ================================================================

async function loadGroups() {
  try {
    groupsList.innerHTML = '<div class="loading-text">Loading groups...</div>';
    const snap = await db.collection('groups').get();
    allGroups = [];
    groupsList.innerHTML = '';
    if (snap.empty) { groupsList.innerHTML = '<p class="empty-state">No groups yet</p>'; updateGroupSelects(); return; }
    snap.forEach(doc => {
      const g = doc.data();
      allGroups.push({ id: doc.id, ...g });
      const card = document.createElement('div');
      card.className = 'admin-card' + (g.archived ? ' admin-card-archived' : '');
      card.innerHTML = `
        <h4>${escapeHtml(g.title)}${g.archived ? ' <span class="badge-archived">Archived</span>' : ''}</h4>
        <p>${escapeHtml(g.description || 'No description')}</p>
        <div class="admin-card-actions">
          <button class="btn btn-sm btn-secondary edit-group-btn" data-id="${doc.id}">Edit</button>
          <button class="btn btn-sm btn-secondary archive-group-btn" data-id="${doc.id}" data-archived="${!!g.archived}">${g.archived ? 'Unarchive' : 'Archive'}</button>
          <button class="btn btn-sm btn-danger delete-group-btn" data-id="${doc.id}">Delete</button>
        </div>`;
      groupsList.appendChild(card);
    });
    groupsList.querySelectorAll('.edit-group-btn').forEach(b => b.addEventListener('click', () => handleEditGroup(b.dataset.id)));
    groupsList.querySelectorAll('.archive-group-btn').forEach(b => b.addEventListener('click', () => handleArchiveGroup(b.dataset.id, b.dataset.archived === 'true')));
    groupsList.querySelectorAll('.delete-group-btn').forEach(b => b.addEventListener('click', () => handleDeleteGroup(b.dataset.id)));
    updateGroupSelects();
  } catch (err) {
    console.error('loadGroups:', err);
    groupsList.innerHTML = '<div class="error-text">Error loading groups</div>';
  }
}

function handleEditGroup(groupId) {
  const g = allGroups.find(x => x.id === groupId);
  if (!g) return;
  document.getElementById('editGroupId').value = groupId;
  document.getElementById('editGroupTitle').value = g.title || '';
  document.getElementById('editGroupDescription').value = g.description || '';
  openModal(editGroupModal);
}

document.getElementById('editGroupForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const groupId = document.getElementById('editGroupId').value;
  const title = document.getElementById('editGroupTitle').value.trim();
  const description = document.getElementById('editGroupDescription').value.trim();
  if (!title) { alert('Title is required'); return; }
  try {
    showLoading(true);
    await db.collection('groups').doc(groupId).update({ title, description });
    closeAllModals();
    await loadGroups();
  } catch (err) {
    console.error('editGroup:', err);
    alert('Error saving group');
  } finally { showLoading(false); }
});

async function handleArchiveGroup(groupId, isArchived) {
  const action = isArchived ? 'unarchive' : 'archive';
  if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} this group?`)) return;
  try {
    showLoading(true);
    await db.collection('groups').doc(groupId).update({ archived: !isArchived });
    await loadGroups();
  } catch (err) {
    console.error('archiveGroup:', err);
    alert('Error updating group');
  } finally { showLoading(false); }
}

async function handleDeleteGroup(groupId) {
  if (!confirm('Delete this group? Associated boards will remain but may need reassignment.')) return;
  try {
    showLoading(true);
    await db.collection('groups').doc(groupId).delete();
    await loadGroups();
  } catch (err) {
    console.error('deleteGroup:', err);
    alert('Error deleting group');
  } finally { showLoading(false); }
}

if (createGroupBtn) createGroupBtn.addEventListener('click', () => openModal(createGroupModal));

document.getElementById('createGroupForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('groupTitle').value.trim();
  const description = document.getElementById('groupDescription').value.trim();
  if (!title) { alert('Please enter a group title'); return; }
  try {
    showLoading(true);
    await db.collection('groups').add({ title, description, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    closeAllModals();
    document.getElementById('createGroupForm').reset();
    await loadGroups();
  } catch (err) {
    console.error('createGroup:', err);
    alert('Error creating group');
  } finally { showLoading(false); }
});

// ================================================================
// BOARDS
// ================================================================

async function loadBoards() {
  try {
    boardsList.innerHTML = '<div class="loading-text">Loading boards...</div>';
    const snap = await db.collection('boards').get();
    allBoards = [];
    boardsList.innerHTML = '';
    if (snap.empty) { boardsList.innerHTML = '<p class="empty-state">No boards yet</p>'; return; }
    snap.forEach(doc => {
      const b = doc.data();
      allBoards.push({ id: doc.id, ...b });
      const group = allGroups.find(g => g.id === b.groupId);
      const groupName = group ? group.title : 'Unknown Group';
      const card = document.createElement('div');
      card.className = 'admin-card' + (b.archived ? ' admin-card-archived' : '');
      card.innerHTML = `
        <h4>${escapeHtml(b.title)}${b.archived ? ' <span class="badge-archived">Archived</span>' : ''}</h4>
        <p class="small-text">Group: ${escapeHtml(groupName)}</p>
        <p>${escapeHtml(b.description || 'No description')}</p>
        <div class="admin-card-actions">
          <button class="btn btn-sm btn-secondary edit-board-btn" data-id="${doc.id}">Edit</button>
          <button class="btn btn-sm btn-secondary archive-board-btn" data-id="${doc.id}" data-archived="${!!b.archived}">${b.archived ? 'Unarchive' : 'Archive'}</button>
          <button class="btn btn-sm btn-secondary clear-board-btn" data-id="${doc.id}">Clear Posts</button>
          <button class="btn btn-sm btn-danger delete-board-btn" data-id="${doc.id}">Delete</button>
        </div>`;
      boardsList.appendChild(card);
    });
    boardsList.querySelectorAll('.edit-board-btn').forEach(b => b.addEventListener('click', () => handleEditBoard(b.dataset.id)));
    boardsList.querySelectorAll('.archive-board-btn').forEach(b => b.addEventListener('click', () => handleArchiveBoard(b.dataset.id, b.dataset.archived === 'true')));
    boardsList.querySelectorAll('.clear-board-btn').forEach(b => b.addEventListener('click', () => handleClearBoard(b.dataset.id)));
    boardsList.querySelectorAll('.delete-board-btn').forEach(b => b.addEventListener('click', () => handleDeleteBoard(b.dataset.id)));
  } catch (err) {
    console.error('loadBoards:', err);
    boardsList.innerHTML = '<div class="error-text">Error loading boards</div>';
  }
}

function handleEditBoard(boardId) {
  const b = allBoards.find(x => x.id === boardId);
  if (!b) return;
  document.getElementById('editBoardId').value = boardId;
  document.getElementById('editBoardTitle').value = b.title || '';
  document.getElementById('editBoardDescription').value = b.description || '';
  // Reset file input
  document.getElementById('editBoardCoverFile').value = '';
  // Show existing cover if present
  const previewImg = document.getElementById('editBoardCoverPreviewImg');
  if (b.coverUrl) {
    previewImg.src = b.coverUrl;
    previewImg.style.display = 'block';
  } else {
    previewImg.src = '';
    previewImg.style.display = 'none';
  }
  // populate group select
  const sel = document.getElementById('editBoardGroup');
  sel.innerHTML = '<option value="">Choose a group...</option>';
  allGroups.forEach(g => {
    const o = document.createElement('option');
    o.value = g.id;
    o.textContent = g.title;
    if (g.id === b.groupId) o.selected = true;
    sel.appendChild(o);
  });
  openModal(editBoardModal);
}

document.getElementById('editBoardForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const boardId = document.getElementById('editBoardId').value;
  const groupId = document.getElementById('editBoardGroup').value;
  const title = document.getElementById('editBoardTitle').value.trim();
  const description = document.getElementById('editBoardDescription').value.trim();
  const coverFile = document.getElementById('editBoardCoverFile').files[0];
  if (!groupId || !title) { alert('Please fill in all required fields'); return; }
  try {
    showLoading(true);
    const update = { groupId, title, description };
    if (coverFile) {
      update.coverUrl = await uploadImage(coverFile, getCurrentUser()?.uid);
    }
    await db.collection('boards').doc(boardId).update(update);
    closeAllModals();
    await loadBoards();
  } catch (err) {
    console.error('editBoard:', err);
    alert('Error saving board');
  } finally { showLoading(false); }
});

async function handleArchiveBoard(boardId, isArchived) {
  const action = isArchived ? 'unarchive' : 'archive';
  if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} this board?`)) return;
  try {
    showLoading(true);
    await db.collection('boards').doc(boardId).update({ archived: !isArchived });
    await loadBoards();
  } catch (err) {
    console.error('archiveBoard:', err);
    alert('Error updating board');
  } finally { showLoading(false); }
}

async function handleClearBoard(boardId) {
  const board = allBoards.find(b => b.id === boardId);
  const name = board ? board.title : boardId;
  if (!confirm(`Delete ALL posts in "${name}"? This cannot be undone.`)) return;
  try {
    showLoading(true);
    const postsSnap = await db.collection('posts').where('boardId', '==', boardId).get();
    const batch = db.batch();
    postsSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    alert(`Deleted ${postsSnap.size} post(s).`);
  } catch (err) {
    console.error('clearBoard:', err);
    alert('Error clearing board');
  } finally { showLoading(false); }
}

async function handleDeleteBoard(boardId) {
  if (!confirm('Delete this board? Posts will remain orphaned.')) return;
  try {
    showLoading(true);
    await db.collection('boards').doc(boardId).delete();
    await loadBoards();
  } catch (err) {
    console.error('deleteBoard:', err);
    alert('Error deleting board');
  } finally { showLoading(false); }
}

if (createBoardBtn) createBoardBtn.addEventListener('click', () => {
  if (allGroups.length === 0) { alert('Please create a group first'); return; }
  openModal(createBoardModal);
});

// Live cover preview — Create Board
document.getElementById('boardCoverFile')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  const preview = document.getElementById('boardCoverPreview');
  const img = document.getElementById('boardCoverPreviewImg');
  if (file) {
    img.src = URL.createObjectURL(file);
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
});

// Live cover preview — Edit Board
document.getElementById('editBoardCoverFile')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  const img = document.getElementById('editBoardCoverPreviewImg');
  if (file) {
    img.src = URL.createObjectURL(file);
    img.style.display = 'block';
  }
});

document.getElementById('createBoardForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const groupId = document.getElementById('boardGroupId').value;
  const title = document.getElementById('boardTitle').value.trim();
  const description = document.getElementById('boardDescription').value.trim();
  const coverFile = document.getElementById('boardCoverFile').files[0];
  if (!groupId || !title) { alert('Please fill in all required fields'); return; }
  try {
    showLoading(true);
    const data = { groupId, title, description, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (coverFile) {
      data.coverUrl = await uploadImage(coverFile, getCurrentUser()?.uid);
    }
    await db.collection('boards').add(data);
    closeAllModals();
    document.getElementById('createBoardForm').reset();
    document.getElementById('boardCoverPreview').style.display = 'none';
    await loadBoards();
  } catch (err) {
    console.error('createBoard:', err);
    alert('Error creating board');
  } finally { showLoading(false); }
});

// ================================================================
// USERS
// ================================================================

async function loadUsers() {
  try {
    usersList.innerHTML = '<div class="loading-text">Loading users...</div>';
    const snap = await db.collection('users').get();
    allUsers = [];
    usersList.innerHTML = '';
    if (snap.empty) { usersList.innerHTML = '<p class="empty-state">No users yet</p>'; return; }
    snap.forEach(doc => {
      const u = doc.data();
      allUsers.push({ id: doc.id, ...u });
      const card = document.createElement('div');
      card.className = 'admin-card' + (u.disabled ? ' admin-card-archived' : '');
      const lastActive = u.lastActive ? new Date(u.lastActive.seconds * 1000).toLocaleDateString() : 'Unknown';
      card.innerHTML = `
        <h4>${escapeHtml(u.name || u.email)}${u.disabled ? ' <span class="badge-archived">Suspended</span>' : ''}</h4>
        <p class="small-text">${escapeHtml(u.email)}</p>
        <p class="small-text">Role: <strong>${escapeHtml(u.role || 'member')}</strong> · Last active: ${lastActive}</p>
        <p class="small-text">Groups: ${u.groups ? u.groups.length : 0}</p>
        <div class="admin-card-actions">
          <button class="btn btn-sm btn-primary manage-user-btn" data-id="${doc.id}">Manage</button>
        </div>`;
      usersList.appendChild(card);
    });
    usersList.querySelectorAll('.manage-user-btn').forEach(b => b.addEventListener('click', () => handleManageUser(b.dataset.id)));
    updateBroadcastTargets();
  } catch (err) {
    console.error('loadUsers:', err);
    usersList.innerHTML = '<div class="error-text">Error loading users</div>';
  }
}

async function handleManageUser(userId) {
  currentManagingUserId = userId;
  const u = allUsers.find(x => x.id === userId);
  if (!u) return;

  document.getElementById('manageUserTitle').textContent = 'Manage User';
  document.getElementById('manageUserName').textContent = `${u.name || u.email} — ${u.email}`;

  // Role
  const role = u.role || 'member';
  document.getElementById('manageUserRole').textContent = role.charAt(0).toUpperCase() + role.slice(1);
  const toggleBtn = document.getElementById('toggleRoleBtn');
  if (role === 'admin') {
    toggleBtn.textContent = 'Demote to Member';
    toggleBtn.onclick = () => handleToggleRole(userId, 'member');
  } else {
    toggleBtn.textContent = 'Promote to Admin';
    toggleBtn.onclick = () => handleToggleRole(userId, 'admin');
  }

  // Password reset
  document.getElementById('resetPasswordBtn').onclick = () => handleResetPassword(u.email);

  // Suspend / reinstate toggle
  const removeBtn = document.getElementById('removeUserBtn');
  if (u.disabled) {
    removeBtn.textContent = '✅ Reinstate';
    removeBtn.onclick = () => handleReinstateUser(userId, u.email);
  } else {
    removeBtn.textContent = '🚫 Suspend';
    removeBtn.onclick = () => handleRemoveUser(userId, u.email);
  }

  // Hard delete button
  document.getElementById('hardDeleteUserBtn').onclick = () => handleHardDeleteUser(userId, u.email);

  // Groups checklist
  const checklist = document.getElementById('userGroupsChecklist');
  checklist.innerHTML = '';
  allGroups.forEach(g => {
    const checked = u.groups && u.groups.includes(g.id);
    const lbl = document.createElement('label');
    lbl.className = 'checkbox-label';
    lbl.innerHTML = `<input type="checkbox" value="${g.id}" ${checked ? 'checked' : ''}><span>${escapeHtml(g.title)}</span>`;
    checklist.appendChild(lbl);
  });

  openModal(manageUserModal);
}

async function handleToggleRole(userId, newRole) {
  if (!confirm(`Set this user's role to "${newRole}"?`)) return;
  try {
    showLoading(true);
    await db.collection('users').doc(userId).update({ role: newRole });
    closeAllModals();
    await loadUsers();
  } catch (err) {
    console.error('toggleRole:', err);
    alert('Error updating role');
  } finally { showLoading(false); }
}

async function handleResetPassword(email) {
  if (!confirm(`Send a password reset email to ${email}?`)) return;
  try {
    await auth.sendPasswordResetEmail(email);
    alert(`Password reset email sent to ${email}`);
  } catch (err) {
    console.error('resetPassword:', err);
    alert('Error sending reset email: ' + err.message);
  }
}

async function handleRemoveUser(userId, email) {
  if (!confirm(`Suspend ${email}? They will be signed out automatically on next load.`)) return;
  try {
    showLoading(true);
    await db.collection('users').doc(userId).update({ disabled: true });
    closeAllModals();
    await loadUsers();
    alert(`${email} has been suspended.`);
  } catch (err) {
    console.error('removeUser:', err);
    alert('Error suspending user');
  } finally { showLoading(false); }
}

async function handleReinstateUser(userId, email) {
  if (!confirm(`Reinstate ${email}? They will be able to sign in again.`)) return;
  try {
    showLoading(true);
    await db.collection('users').doc(userId).update({ disabled: false });
    closeAllModals();
    await loadUsers();
    alert(`${email} has been reinstated.`);
  } catch (err) {
    console.error('reinstateUser:', err);
    alert('Error reinstating user');
  } finally { showLoading(false); }
}

async function handleHardDeleteUser(userId, email) {
  if (!confirm(`HARD DELETE "${email}"?\n\nThis will permanently erase:\n• Their login account\n• All their posts & media\n• Their profile & avatar\n\nThis CANNOT be undone.`)) return;
  if (!confirm(`Second confirmation: permanently delete all data for ${email}?`)) return;
  try {
    showLoading(true);
    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch('https://sbd-upload-signer.sbdnetwork.workers.dev/delete-user', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ targetUid: userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Worker error');
    closeAllModals();
    await loadUsers();
    alert(`${email} has been permanently deleted.\n• Login account removed\n• ${data.postsDeleted || 0} post(s) deleted\n• ${data.r2Deleted || 0} media file(s) removed from storage`);
  } catch (err) {
    console.error('hardDeleteUser:', err);
    alert('Error deleting user: ' + err.message);
  } finally { showLoading(false); }
}

document.getElementById('saveUserGroupsBtn')?.addEventListener('click', async () => {
  if (!currentManagingUserId) return;
  try {
    showLoading(true);
    const checkboxes = document.querySelectorAll('#userGroupsChecklist input[type="checkbox"]');
    const selectedGroups = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
    await db.collection('users').doc(currentManagingUserId).update({ groups: selectedGroups });
    closeAllModals();
    await loadUsers();
  } catch (err) {
    console.error('saveUserGroups:', err);
    alert('Error updating user groups');
  } finally { showLoading(false); }
});

// ================================================================
// CONTENT MODERATION
// ================================================================

async function loadContent() {
  if (!contentList) return;
  contentList.innerHTML = '<div class="loading-text">Loading posts...</div>';
  const filter = document.getElementById('contentBoardFilter');

  // Populate board filter
  if (filter.options.length === 1) {
    allBoards.forEach(b => {
      const o = document.createElement('option');
      o.value = b.id;
      o.textContent = b.title;
      filter.appendChild(o);
    });
    filter.addEventListener('change', loadContent);
  }

  try {
    const boardId = filter.value;
    let query = db.collection('posts').orderBy('timestamp', 'desc').limit(50);
    if (boardId) query = db.collection('posts').where('boardId', '==', boardId).orderBy('timestamp', 'desc').limit(50);
    const snap = await query.get();
    contentList.innerHTML = '';
    if (snap.empty) { contentList.innerHTML = '<p class="empty-state">No posts found</p>'; return; }
    snap.forEach(doc => {
      const p = doc.data();
      const board = allBoards.find(b => b.id === p.boardId);
      const boardName = board ? board.title : 'Unknown Board';
      const author = allUsers.find(u => u.id === p.authorId);
      const authorName = author ? (author.name || author.email) : (p.authorName || 'Unknown');
      const ts = p.timestamp ? new Date(p.timestamp.seconds * 1000).toLocaleDateString() : '';
      const card = document.createElement('div');
      card.className = 'admin-card' + (p.hidden ? ' admin-card-archived' : '');
      const preview = (p.content || p.caption || '').slice(0, 120);
      card.innerHTML = `
        <p class="small-text">Board: <strong>${escapeHtml(boardName)}</strong> · By: ${escapeHtml(authorName)} · ${ts}${p.hidden ? ' · <em>Hidden</em>' : ''}</p>
        <p style="margin:6px 0">${escapeHtml(preview)}${preview.length === 120 ? '…' : ''}</p>
        <div class="admin-card-actions">
          <button class="btn btn-sm btn-secondary hide-post-btn" data-id="${doc.id}" data-hidden="${!!p.hidden}">${p.hidden ? 'Unhide' : 'Hide'}</button>
          <button class="btn btn-sm btn-secondary move-post-btn" data-id="${doc.id}">Move</button>
          <button class="btn btn-sm btn-danger delete-post-btn" data-id="${doc.id}">Delete</button>
        </div>`;
      contentList.appendChild(card);
    });
    contentList.querySelectorAll('.hide-post-btn').forEach(b => b.addEventListener('click', () => handleHidePost(b.dataset.id, b.dataset.hidden === 'true')));
    contentList.querySelectorAll('.move-post-btn').forEach(b => b.addEventListener('click', () => handleOpenMovePost(b.dataset.id)));
    contentList.querySelectorAll('.delete-post-btn').forEach(b => b.addEventListener('click', () => handleDeletePost(b.dataset.id)));
  } catch (err) {
    console.error('loadContent:', err);
    contentList.innerHTML = '<div class="error-text">Error loading posts</div>';
  }
}

async function handleHidePost(postId, isHidden) {
  try {
    showLoading(true);
    await db.collection('posts').doc(postId).update({ hidden: !isHidden });
    await loadContent();
  } catch (err) {
    console.error('hidePost:', err);
    alert('Error updating post');
  } finally { showLoading(false); }
}

function handleOpenMovePost(postId) {
  currentMovePostId = postId;
  const sel = document.getElementById('movePostTarget');
  sel.innerHTML = '<option value="">Choose a board...</option>';
  allBoards.forEach(b => {
    const o = document.createElement('option');
    o.value = b.id;
    o.textContent = b.title;
    sel.appendChild(o);
  });
  openModal(movePostModal);
}

document.getElementById('confirmMovePostBtn')?.addEventListener('click', async () => {
  const targetBoardId = document.getElementById('movePostTarget').value;
  if (!targetBoardId || !currentMovePostId) { alert('Select a board'); return; }
  try {
    showLoading(true);
    await db.collection('posts').doc(currentMovePostId).update({ boardId: targetBoardId });
    closeAllModals();
    await loadContent();
  } catch (err) {
    console.error('movePost:', err);
    alert('Error moving post');
  } finally { showLoading(false); }
});

async function handleDeletePost(postId) {
  if (!confirm('Permanently delete this post?')) return;
  try {
    showLoading(true);
    await db.collection('posts').doc(postId).delete();
    await loadContent();
  } catch (err) {
    console.error('deletePost:', err);
    alert('Error deleting post');
  } finally { showLoading(false); }
}

// ================================================================
// BROADCAST
// ================================================================

if (broadcastBtn) broadcastBtn.addEventListener('click', () => openModal(broadcastModal));

function updateBroadcastTargets() {
  const sel = document.getElementById('broadcastTarget');
  if (!sel) return;
  // Keep "All Members" option, rebuild group options
  sel.innerHTML = '<option value="all">All Members</option>';
  allGroups.forEach(g => {
    const o = document.createElement('option');
    o.value = 'group:' + g.id;
    o.textContent = 'Group: ' + g.title;
    sel.appendChild(o);
  });
}

document.getElementById('sendBroadcastBtn')?.addEventListener('click', async () => {
  const target = document.getElementById('broadcastTarget').value;
  const message = document.getElementById('broadcastMessage').value.trim();
  if (!message) { alert('Please write a message first'); return; }

  let targetUsers = allUsers;
  if (target.startsWith('group:')) {
    const groupId = target.slice(6);
    targetUsers = allUsers.filter(u => u.groups && u.groups.includes(groupId));
  }

  if (targetUsers.length === 0) { alert('No users to send to'); return; }
  if (!confirm(`Send announcement to ${targetUsers.length} member(s)?`)) return;

  try {
    showLoading(true);
    const batch = db.batch();
    const now = firebase.firestore.FieldValue.serverTimestamp();
    targetUsers.forEach(u => {
      const ref = db.collection('notifications').doc();
      batch.set(ref, {
        type:      'announcement',
        title:     '📢 Announcement',
        body:      message,
        userId:    u.id,
        timestamp: now,
        read:      false
      });
    });
    await batch.commit();
    closeAllModals();
    document.getElementById('broadcastMessage').value = '';
    alert(`Announcement sent to ${targetUsers.length} member(s)`);
  } catch (err) {
    console.error('broadcast:', err);
    alert('Error sending announcement');
  } finally { showLoading(false); }
});

// ================================================================
// ANALYTICS
// ================================================================

async function loadAnalytics() {
  if (!analyticsList) return;
  analyticsList.innerHTML = '<div class="loading-text">Calculating activity...</div>';
  try {
    // Fetch post counts per user
    const postsSnap = await db.collection('posts').get();
    const postCounts = {};
    postsSnap.docs.forEach(d => {
      const uid = d.data().authorId;
      if (uid) postCounts[uid] = (postCounts[uid] || 0) + 1;
    });

    // Fetch comment counts per user
    const commentsSnap = await db.collection('comments').get();
    const commentCounts = {};
    commentsSnap.docs.forEach(d => {
      const uid = d.data().authorId || d.data().userId;
      if (uid) commentCounts[uid] = (commentCounts[uid] || 0) + 1;
    });

    analyticsList.innerHTML = '';
    if (allUsers.length === 0) { analyticsList.innerHTML = '<p class="empty-state">No users</p>'; return; }

    // Sort by post count desc
    const sorted = [...allUsers].sort((a, b) => (postCounts[b.id] || 0) - (postCounts[a.id] || 0));
    sorted.forEach(u => {
      const lastActive = u.lastActive ? new Date(u.lastActive.seconds * 1000).toLocaleDateString() : '—';
      const posts = postCounts[u.id] || 0;
      const comments = commentCounts[u.id] || 0;
      const card = document.createElement('div');
      card.className = 'admin-card';
      card.innerHTML = `
        <h4>${escapeHtml(u.name || u.email)}</h4>
        <p class="small-text">${escapeHtml(u.email)} · <strong>${u.role || 'member'}</strong></p>
        <p class="small-text">Posts: <strong>${posts}</strong> · Comments: <strong>${comments}</strong> · Last active: ${lastActive}</p>`;
      analyticsList.appendChild(card);
    });
  } catch (err) {
    console.error('loadAnalytics:', err);
    analyticsList.innerHTML = '<div class="error-text">Error loading analytics</div>';
  }
}

if (refreshAnalyticsBtn) refreshAnalyticsBtn.addEventListener('click', loadAnalytics);

// ================================================================
// HELPERS
// ================================================================

function updateGroupSelects() {
  // Create Group modal — board group select
  ['boardGroupId'].forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Choose a group...</option>';
    allGroups.forEach(g => {
      const o = document.createElement('option');
      o.value = g.id;
      o.textContent = g.title;
      sel.appendChild(o);
    });
  });
  updateBroadcastTargets();
}

// Modal management
document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', closeAllModals));

function openModal(modal) {
  if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  document.body.style.overflow = '';
  currentMovePostId = null;
}

// Back and logout
if (backBtn) backBtn.addEventListener('click', () => window.location.href = 'dashboard.html');
if (logoutBtn) logoutBtn.addEventListener('click', async () => { await auth.signOut(); window.location.href = 'index.html'; });

function showLoading(show) {
  if (loadingOverlay) loadingOverlay.style.display = show ? 'flex' : 'none';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

console.log('Admin module v49 loaded');
