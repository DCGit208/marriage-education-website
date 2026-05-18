// ================================================================
// ADMIN PANEL LOGIC  —  v50
// ================================================================

// Tier → community group mapping (mirrors checkout.js — keep in sync)
const ADMIN_TIER_GROUPS = {
  free:       ['group-sbd-community'],
  foundation: ['group-sbd-community', 'group-teleios-formation', 'group-sbd-dummies'],
  premium:    ['group-sbd-community', 'group-teleios-formation', 'group-sbd-dummies',
               'group-sexual-literacy', 'CYUhNHqGvf7bhVIR6D13'],
  elite:      ['group-sbd-community', 'group-teleios-formation', 'group-sbd-dummies',
               'group-sexual-literacy', 'CYUhNHqGvf7bhVIR6D13',
               'group-marriage-systems', 'group-civilization-leadership',
               'z8lmnHLoFUBBZaRp2Vdd', 'advanced-muliebrity-training-school'],
};

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
const refreshUsersBtn = document.getElementById('refreshUsersBtn');
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
  if (!user) { window.location.href = '/auth'; return; }
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
    if (tabName === 'users') loadUsers();
    if (tabName === 'content') loadContent();
    if (tabName === 'analytics') loadAnalytics();
    if (tabName === 'sales') loadSbdSales();
    if (tabName === 'ce2') loadCe2Groups();
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
      const tierLabel = { free: 'Free', foundation: 'Foundation', premium: 'Premium', elite: 'Elite' };
      const tBadge = g.requiredTier ? `<span class="admin-tier-badge tier-${g.requiredTier}">${tierLabel[g.requiredTier] || g.requiredTier}</span>` : '';
      card.innerHTML = `
        <h4>${escapeHtml(g.title)} ${tBadge}${g.archived ? ' <span class="badge-archived">Archived</span>' : ''}</h4>
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
  document.getElementById('editGroupRequiredTier').value = g.requiredTier || 'elite';
  openModal(editGroupModal);
}

document.getElementById('editGroupForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const groupId = document.getElementById('editGroupId').value;
  const title = document.getElementById('editGroupTitle').value.trim();
  const description = document.getElementById('editGroupDescription').value.trim();
  const requiredTier = document.getElementById('editGroupRequiredTier').value || 'elite';
  if (!title) { alert('Title is required'); return; }
  try {
    showLoading(true);
    await db.collection('groups').doc(groupId).update({ title, description, requiredTier });
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
  const requiredTier = document.getElementById('groupRequiredTier').value || 'elite';
  if (!title) { alert('Please enter a group title'); return; }
  try {
    showLoading(true);
    await db.collection('groups').add({ title, description, requiredTier, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
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
    });

    // Organise boards by group
    const grouped = {}; // groupId → [boards]
    allBoards.forEach(b => {
      const gid = b.groupId || '__unassigned__';
      if (!grouped[gid]) grouped[gid] = [];
      grouped[gid].push(b);
    });

    const tierLabel = { free: 'Free', foundation: 'Foundation', premium: 'Premium', elite: 'Elite' };

    Object.entries(grouped).forEach(([gid, boards]) => {
      const group = allGroups.find(g => g.id === gid);
      const groupName = group ? group.title : (gid === '__unassigned__' ? 'Unassigned' : `Unknown (${gid})`);

      // Group header
      const header = document.createElement('div');
      header.className = 'admin-group-header';
      header.textContent = `${groupName} (${boards.length})`;
      boardsList.appendChild(header);

      boards.forEach(b => {
        const tierBadge = b.requiredTier ? `<span class="admin-tier-badge tier-${b.requiredTier}">${tierLabel[b.requiredTier] || b.requiredTier}</span>` : '';
        const card = document.createElement('div');
        card.className = 'admin-card admin-card--board' + (b.archived ? ' admin-card-archived' : '');
        card.innerHTML = `
          <h4>${escapeHtml(b.title)} ${tierBadge}${b.archived ? ' <span class="badge-archived">Archived</span>' : ''}</h4>
          <p class="small-text">Group: ${escapeHtml(group ? group.title : gid)}</p>
          <p>${escapeHtml(b.description || 'No description')}</p>
          <div class="admin-card-actions">
            <button class="btn btn-sm btn-secondary edit-board-btn" data-id="${b.id}">Edit / Reassign</button>
            <button class="btn btn-sm btn-secondary archive-board-btn" data-id="${b.id}" data-archived="${!!b.archived}">${b.archived ? 'Unarchive' : 'Archive'}</button>
            <button class="btn btn-sm btn-secondary clear-board-btn" data-id="${b.id}">Clear Posts</button>
            <button class="btn btn-sm btn-danger delete-board-btn" data-id="${b.id}">Delete</button>
          </div>`;
        boardsList.appendChild(card);
      });
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
  document.getElementById('editBoardRequiredTier').value = b.requiredTier || 'free';
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
    const requiredTier = document.getElementById('editBoardRequiredTier').value || 'free';
    const update = { groupId, title, description, requiredTier };
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
    const requiredTier = document.getElementById('boardRequiredTier').value || 'free';
    const data = {
      groupId,
      title,
      description,
      requiredTier,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastActivityAt: firebase.firestore.FieldValue.serverTimestamp(),
      postsCount: 0,
      commentsCount: 0,
      likesCount: 0,
      activity24h: 0,
      activeUsers24h: 0,
      rankScore: 0,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
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
  if (!u) { console.error('handleManageUser: user not found in allUsers. userId=', userId, 'allUsers=', allUsers.map(x => x.id)); alert('User data not found. Try refreshing the page.'); return; }
  try {

  document.getElementById('manageUserTitle').textContent = 'Manage User';
  document.getElementById('manageUserName').textContent = `${u.name || u.email} — ${u.email}`;

  // Tier
  const currentTier = u.tier || 'free';
  const tierLabel = { free: 'Free', foundation: 'Foundation', premium: 'Premium', elite: 'Elite' };
  document.getElementById('manageUserTier').textContent = tierLabel[currentTier] || currentTier;
  document.getElementById('setUserTierSelect').value = currentTier;
  document.getElementById('setUserTierBtn').onclick = () => {
    const selectedTier = document.getElementById('setUserTierSelect').value;
    handleSetUserTier(userId, selectedTier);
  };

  // Role
  const role = u.role || 'member';
  document.getElementById('manageUserRole').textContent = role.charAt(0).toUpperCase() + role.slice(1);

  var mentorCb = document.getElementById('manageUserMentor');
  var saveMentorBtn = document.getElementById('saveUserMentorBtn');
  if (mentorCb) mentorCb.checked = !!u.mentor;
  if (saveMentorBtn) {
    saveMentorBtn.onclick = async function () {
      try {
        showLoading(true);
        await db.collection('users').doc(userId).set({ mentor: !!mentorCb.checked }, { merge: true });
        alert('Mentor flag saved.');
        closeAllModals();
        await loadUsers();
      } catch (err) {
        console.error('saveMentor:', err);
        alert('Error: ' + (err.message || err));
      } finally {
        showLoading(false);
      }
    };
  }
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

  // Groups checklist — shows tier badge per group
  const checklist = document.getElementById('userGroupsChecklist');
  checklist.innerHTML = '';
  const tierColors = { free: '#4caf50', foundation: '#2196f3', premium: '#9c27b0', elite: '#c6a96b' };
  allGroups.forEach(g => {
    const checked = u.groups && u.groups.includes(g.id);
    const tColor = tierColors[g.requiredTier] || '#888';
    const tLabel = g.requiredTier ? ` <span style="font-size:10px;background:${tColor}22;color:${tColor};border:1px solid ${tColor}44;border-radius:4px;padding:1px 5px;vertical-align:middle">${g.requiredTier}</span>` : '';
    const lbl = document.createElement('label');
    lbl.className = 'checkbox-label';
    lbl.innerHTML = `<input type="checkbox" value="${g.id}" ${checked ? 'checked' : ''}><span>${escapeHtml(g.title)}${tLabel}</span>`;
    checklist.appendChild(lbl);
  });

  openModal(manageUserModal);
  } catch (err) {
    console.error('handleManageUser error:', err);
    alert('Error opening manage panel: ' + err.message);
  }
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

async function handleSetUserTier(userId, newTier) {
  const tierLabel = { free: 'Free', foundation: 'Foundation', premium: 'Premium', elite: 'Elite' };
  if (!confirm(`Set this user's tier to "${tierLabel[newTier] || newTier}" and auto-assign all corresponding community groups?`)) return;
  try {
    showLoading(true);
    const userRef  = db.collection('users').doc(userId);
    const groups   = ADMIN_TIER_GROUPS[newTier] || [];
    // For free tier, clear the subscription; for paid tiers set a far-future end date
    // so learn-v2.js (which checks sub.status === 'active' && subEnd > now) resolves correctly.
    const farFuture = firebase.firestore.Timestamp.fromDate(new Date('2099-12-31'));
    const subUpdate = newTier === 'free'
      ? { tier: 'free', 'subscription.tier': 'free', 'subscription.status': 'inactive', 'subscription.endDate': firebase.firestore.Timestamp.fromDate(new Date(0)) }
      : { tier: newTier, 'subscription.tier': newTier, 'subscription.status': 'active', 'subscription.endDate': farFuture };
    await userRef.update(subUpdate);
    if (groups.length > 0) {
      await userRef.update({ groups: firebase.firestore.FieldValue.arrayUnion(...groups) });
    }
    closeAllModals();
    await loadUsers();
    alert(`✅ Tier set to "${tierLabel[newTier]}" and ${groups.length} group(s) assigned.`);
  } catch (err) {
    console.error('setUserTier:', err);
    alert('Error updating tier: ' + err.message);
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
if (refreshUsersBtn) refreshUsersBtn.addEventListener('click', loadUsers);

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
if (logoutBtn) logoutBtn.addEventListener('click', async () => { await auth.signOut(); window.location.href = '/auth'; });

function showLoading(show) {
  if (loadingOverlay) loadingOverlay.style.display = show ? 'flex' : 'none';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ================================================================
// SBD SALES
// ================================================================
async function loadSbdSales() {
  const summaryEl = document.getElementById('salesSummary');
  const listEl    = document.getElementById('salesList');
  if (!summaryEl || !listEl) return;
  listEl.innerHTML = '<div class="loading-text">Loading SBD sales…</div>';
  try {
    const snap = await db.collection('sbd_sales').orderBy('createdAt', 'desc').limit(200).get();
    if (snap.empty) {
      summaryEl.innerHTML = '';
      listEl.innerHTML = '<p class="empty-state">No SBD sales recorded yet.</p>';
      return;
    }

    // Aggregate by ambassador
    const byAmb = {};
    let totalRevenue = 0, totalCommission = 0, totalOverride = 0;
    snap.forEach(doc => {
      const d = doc.data();
      const code = d.ambassadorCode || 'unknown';
      if (!byAmb[code]) byAmb[code] = { name: d.ambassadorName || code, sales: 0, commissionEarned: 0, commissionPending: 0, tiers: {} };
      byAmb[code].sales++;
      byAmb[code].commissionEarned  += d.ambassadorCommission || 0;
      byAmb[code].commissionPending += (d.status === 'pending') ? (d.ambassadorCommission || 0) : 0;
      const tier = d.tier || 'foundation';
      byAmb[code].tiers[tier] = (byAmb[code].tiers[tier] || 0) + 1;
      totalRevenue    += d.revenueBaseFCFA || 0;
      totalCommission += d.ambassadorCommission || 0;
      totalOverride   += d.seniorAmbassadorCommission || 0;
    });

    // Summary cards
    summaryEl.innerHTML = [
      { label: 'Total Sales',             val: snap.size,                            color: 'var(--gold,#C6A96B)' },
      { label: 'Revenue Base (FCFA)',      val: totalRevenue.toLocaleString(),        color: 'var(--gold,#C6A96B)' },
      { label: 'Commission Due (FCFA)',    val: totalCommission.toLocaleString(),     color: '#4caf50' },
      { label: 'Senior Override (FCFA)',   val: totalOverride.toLocaleString(),       color: '#C6A96B' },
    ].map(c => `
      <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:1.4rem;font-weight:700;color:${c.color};">${c.val}</div>
        <div style="font-size:0.72rem;color:var(--text-muted,#888);margin-top:2px;">${c.label}</div>
      </div>`).join('');

    // Per-ambassador table
    const rows = Object.entries(byAmb).sort((a, b) => b[1].sales - a[1].sales);
    listEl.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="text-align:left;border-bottom:1px solid rgba(255,255,255,0.08);color:var(--text-muted,#888);">
            <th style="padding:8px 6px;">Ambassador</th>
            <th style="padding:8px 6px;text-align:center;">Sales</th>
            <th style="padding:8px 6px;text-align:center;">Tiers</th>
            <th style="padding:8px 6px;text-align:right;">Earned (FCFA)</th>
            <th style="padding:8px 6px;text-align:right;">Pending (FCFA)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(([code, a]) => `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
              <td style="padding:8px 6px;">
                <div style="font-weight:600;color:var(--text-primary);">${escapeHtml(a.name)}</div>
                <div style="font-size:11px;color:var(--text-muted,#888);">${escapeHtml(code)}</div>
              </td>
              <td style="padding:8px 6px;text-align:center;font-weight:700;color:var(--gold,#C6A96B);">${a.sales}</td>
              <td style="padding:8px 6px;text-align:center;font-size:11px;color:var(--text-secondary);">${
                Object.entries(a.tiers).map(([t, n]) => `${t}:${n}`).join(', ')
              }</td>
              <td style="padding:8px 6px;text-align:right;color:var(--text-primary);">${a.commissionEarned.toLocaleString()}</td>
              <td style="padding:8px 6px;text-align:right;color:#4caf50;font-weight:600;">${a.commissionPending.toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    console.error('[Admin] loadSbdSales error:', err);
    listEl.innerHTML = '<p class="empty-state" style="color:#f44;">Failed to load SBD sales.</p>';
  }
}

if (document.getElementById('refreshSalesBtn')) {
  document.getElementById('refreshSalesBtn').addEventListener('click', loadSbdSales);
}

// ================================================================
// COMMUNICATION ENGINE V2 (beta) — communicationGroups collection
// ================================================================

const ce2GroupsList = document.getElementById('ce2GroupsList');
const createCe2GroupBtn = document.getElementById('createCe2GroupBtn');
const createCe2GroupModal = document.getElementById('createCe2GroupModal');

async function loadCe2Groups() {
  if (!ce2GroupsList) return;
  try {
    ce2GroupsList.innerHTML = '<div class="loading-text">Loading CE2 groups...</div>';
    const snap = await db.collection('communicationGroups').limit(50).get();
    ce2GroupsList.innerHTML = '';
    if (snap.empty) {
      ce2GroupsList.innerHTML =
        '<p class="empty-state">No CE2 groups yet. Click <strong>+ Create CE2 Group</strong>, then test in the beta app.</p>';
      return;
    }
    snap.forEach(function (doc) {
      const g = doc.data();
      const card = document.createElement('div');
      card.className = 'admin-card';
      card.innerHTML =
        '<h4>' + escapeHtml(g.name || 'Unnamed') + '</h4>' +
        '<p class="small-text">Tier: <strong>' + escapeHtml(g.requiredTier || 'foundation') + '</strong>' +
        (g.mentorLed ? ' · mentor-led' : '') +
        (g.allowCrossTier ? ' · cross-tier' : '') + '</p>' +
        '<p class="small-text">ID: ' + escapeHtml(doc.id) + '</p>';
      ce2GroupsList.appendChild(card);
    });
  } catch (err) {
    console.error('loadCe2Groups:', err);
    ce2GroupsList.innerHTML = '<div class="error-text">Error loading CE2 groups: ' + escapeHtml(err.message || String(err)) + '</div>';
  }
}

if (createCe2GroupBtn) {
  createCe2GroupBtn.addEventListener('click', function () {
    openModal(createCe2GroupModal);
  });
}

document.getElementById('createCe2GroupForm')?.addEventListener('submit', async function (e) {
  e.preventDefault();
  const name = document.getElementById('ce2GroupName').value.trim();
  const requiredTier = document.getElementById('ce2GroupRequiredTier').value;
  const mentorLed = document.getElementById('ce2GroupMentorLed').checked;
  const allowCrossTier = document.getElementById('ce2GroupAllowCrossTier').checked;
  if (!name) return;
  try {
    showLoading(true);
    const uid = auth.currentUser && auth.currentUser.uid;
    await db.collection('communicationGroups').add({
      name: name,
      requiredTier: requiredTier,
      mentorLed: mentorLed,
      allowCrossTier: allowCrossTier,
      createdBy: uid || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    document.getElementById('createCe2GroupForm').reset();
    closeAllModals();
    await loadCe2Groups();
    alert('CE2 group created. Open Messages V2 beta, select it, tap Join, then send a test message.');
  } catch (err) {
    console.error('createCe2Group:', err);
    alert('Error creating CE2 group: ' + (err.message || err));
  } finally {
    showLoading(false);
  }
});

const ce2QuickSetupBtn = document.getElementById('ce2QuickSetupBtn');

async function runCe2QuickTestSetup() {
  const user = auth.currentUser;
  if (!user) {
    alert('You must be signed in.');
    return;
  }
  if (!confirm(
    'Create a Foundation test group, mark your account as mentor, and join the group?\n\n' +
      'Then open Messages V2 beta to send a test message.'
  )) {
    return;
  }
  try {
    showLoading(true);
    const uid = user.uid;
    const groupRef = await db.collection('communicationGroups').add({
      name: 'Quick Test Circle',
      requiredTier: 'foundation',
      mentorLed: true,
      allowCrossTier: false,
      createdBy: uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('users').doc(uid).set(
      {
        mentor: true,
        formationLevel: 0,
        communicationLevel: 0,
      },
      { merge: true }
    );
    await groupRef.collection('members').doc(uid).set({
      joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    closeAllModals();
    await loadCe2Groups();
    alert(
      'Quick setup done.\n\n' +
        '1. Open Messages V2 beta\n' +
        '2. Select "Quick Test Circle" (already joined)\n' +
        '3. Or use Discovery → Mentors → your account\n' +
        '4. Send a test message'
    );
  } catch (err) {
    console.error('runCe2QuickTestSetup:', err);
    alert('Quick setup failed: ' + (err.message || err));
  } finally {
    showLoading(false);
  }
}

if (ce2QuickSetupBtn) {
  ce2QuickSetupBtn.addEventListener('click', runCe2QuickTestSetup);
}

console.log('Admin module v53 loaded');
