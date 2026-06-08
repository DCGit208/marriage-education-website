// ================================================================
// GROUP PAGE LOGIC
// ================================================================

// Get group ID from URL
const urlParams = new URLSearchParams(window.location.search);
const groupId = urlParams.get('id');

// DOM Elements
const backBtn = document.getElementById('backBtn');
const logoutBtn = document.getElementById('logoutBtn');
const groupTitle = document.getElementById('groupTitle');
const groupName = document.getElementById('groupName');
const groupDescription = document.getElementById('groupDescription');
const boardsContainer = document.getElementById('boardsContainer');
const noBoardsMessage = document.getElementById('noBoardsMessage');
const recentActivityContainer = document.getElementById('recentActivityContainer');
const noActivityMessage = document.getElementById('noActivityMessage');
const loadingOverlay = document.getElementById('loadingOverlay');

// Initialize group page
auth.onAuthStateChanged((user) => {
  if (!user) {
    window.location.href = '/auth';
    return;
  }
  
  if (!groupId) {
    alert('No group selected');
    window.location.href = 'dashboard.html';
    return;
  }
  
  loadGroupPage(user);
});

async function loadGroupPage(user) {
  try {
    showLoading(true);
    boardsContainer.innerHTML = '<div class="skel-card"><div class="skel-icon"></div><div class="skel-line w60"></div><div class="skel-line w80"></div></div><div class="skel-card"><div class="skel-icon"></div><div class="skel-line w80"></div><div class="skel-line w60"></div></div>';

    if (typeof initNotifications === 'function') initNotifications(user.uid);
    
    const userDoc = await db.collection('users').doc(user.uid).get();
    const userData = userDoc.data() || {};
    const sub = userData.subscription || {};
    const now = Date.now();
    const subEnd = sub.endDate?.toMillis ? sub.endDate.toMillis() : 0;
    const activeSub = sub.status === 'active' && subEnd > now ? (sub.tier || '') : '';
    const isAdminUser = userData.role === 'admin';
    const effectiveTier = isAdminUser ? 'elite' : (activeSub || 'free');
    const TIER_ORDER = { free: 0, foundation: 1, premium: 2, elite: 3 };

    // Load group doc to check its requiredTier
    const groupDoc = await db.collection('groups').doc(groupId).get();
    if (!groupDoc.exists) {
      alert('Group not found');
      window.location.href = '/boards.html';
      return;
    }
    const groupData = groupDoc.data();
    const groupTier = groupData.requiredTier || 'elite';
    if ((TIER_ORDER[effectiveTier] ?? 0) < (TIER_ORDER[groupTier] ?? 3)) {
      alert('Your current tier does not include access to this group.');
      window.location.href = '/boards.html';
      return;
    }

    const assignedGroups = Array.isArray(userData.groups) ? userData.groups : [];
    if (!isAdminUser && !assignedGroups.includes(groupId)) {
      showGroupMembershipLock(groupData);
      return;
    }

    if (
      typeof AdvancedExpressionAccess !== 'undefined' &&
      AdvancedExpressionAccess.isAdvancedExpressionGroupId(groupId) &&
      userData.role !== 'admin' &&
      !AdvancedExpressionAccess.hasAdvancedExpressionAccess(userData)
    ) {
      showAdvancedExpressionGroupLock(userData, groupData);
      return;
    }
    
    // Load group info
    await loadGroupInfo();
    
    // Load boards for this group
    await loadBoards();

    // Load recent discussions scoped to this group's boards
    await loadRecentActivity();
    
  } catch (error) {
    console.error('Error loading group:', error);
    boardsContainer.innerHTML = `
      <div class="empty-state" style="padding: 40px 20px;">
        <p style="color: var(--text-muted); margin-bottom: 16px;">Couldn't load this group. Check your connection and try again.</p>
        <button class="btn btn-primary" id="retryGroupBtn">Retry</button>
      </div>
    `;
    document.getElementById('retryGroupBtn').addEventListener('click', () => loadGroupPage(user));
  } finally {
    showLoading(false);
  }
}

function showGroupMembershipLock(groupData) {
  if (groupTitle) groupTitle.textContent = groupData.title || 'Group';
  if (groupName) groupName.textContent = groupData.title || 'Group';
  if (groupDescription) {
    groupDescription.textContent = 'You are not assigned to this community group.';
  }
  boardsContainer.innerHTML = `
    <div class="empty-state" style="padding: 2.5rem 1.25rem; text-align: center;">
      <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🔒</div>
      <h3 style="margin: 0 0 0.5rem; color: #fff;">Group not assigned</h3>
      <p style="margin: 0 0 1.25rem; color: var(--text-muted); line-height: 1.6;">An administrator must check this group under Admin → Manage user → Group Membership.</p>
      <a href="/boards.html" class="btn btn-primary">← Back to Community</a>
    </div>`;
  if (recentActivityContainer) recentActivityContainer.innerHTML = '';
  if (noActivityMessage) noActivityMessage.style.display = 'none';
  showLoading(false);
}

function showAdvancedExpressionGroupLock(userData, groupData) {
  const access = typeof AdvancedExpressionAccess !== 'undefined'
    ? AdvancedExpressionAccess.getAdvancedExpressionAccess(userData)
    : {
        message: 'Formation Required',
        detail: 'Complete your formation arc to unlock advanced boards.',
        ctaUrl: '/courses.html',
      };
  if (groupTitle) groupTitle.textContent = groupData.title || 'Group';
  if (groupName) groupName.textContent = groupData.title || 'Group';
  if (groupDescription) {
    groupDescription.textContent = access.detail || access.message || 'Advanced access required.';
  }
  boardsContainer.innerHTML = `
    <div class="empty-state" style="padding: 2.5rem 1.25rem; text-align: center;">
      <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🔒</div>
      <h3 style="margin: 0 0 0.5rem; color: #fff;">${escapeHtml(access.message || 'Formation Required')}</h3>
      <p style="margin: 0 0 1.25rem; color: var(--text-muted); line-height: 1.6;">${escapeHtml(access.detail || '')}</p>
      <a href="${escapeHtml(access.ctaUrl || '/courses.html')}" class="btn btn-primary">Continue Formation →</a>
      <br><a href="/boards.html" style="display:inline-block;margin-top:1rem;font-size:13px;color:var(--text-muted);text-decoration:none">← Back to Community</a>
    </div>`;
  if (recentActivityContainer) recentActivityContainer.innerHTML = '';
  if (noActivityMessage) noActivityMessage.style.display = 'none';
  showLoading(false);
}

// Load group information
async function loadGroupInfo() {
  try {
    const groupDoc = await db.collection('groups').doc(groupId).get();
    
    if (!groupDoc.exists) {
      throw new Error('Group not found');
    }
    
    const group = groupDoc.data();
    
    if (groupTitle) groupTitle.textContent = group.title;
    if (groupName) groupName.textContent = group.title;
    if (groupDescription) groupDescription.textContent = group.description || 'No description available';
    
  } catch (error) {
    console.error('Error loading group info:', error);
    throw error;
  }
}

// Load boards for this group
async function loadBoards() {
  try {
    noBoardsMessage.style.display = 'none';
    // skeleton cards already pre-rendered in HTML — no loading text needed

    // One-time legacy migration: ensure boards in this group have activity and ranking fields
    await backfillGroupBoardsLastActivity(groupId);

    // Rank-first ordering with safe fallback to lastActivityAt
    let boardsSnapshot;
    try {
      boardsSnapshot = await db.collection('boards').orderBy('rankScore', 'desc').get();
    } catch (_) {
      boardsSnapshot = await db.collection('boards').orderBy('lastActivityAt', 'desc').get();
    }
    
    boardsContainer.innerHTML = '';
    
    if (boardsSnapshot.empty) {
      noBoardsMessage.style.display = 'block';
      return;
    }

    const boards = boardsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(board => board.groupId === groupId);

    // Render boards
    boards.forEach(board => {
      const boardCard = createBoardCard(board.id, board);
      boardsContainer.appendChild(boardCard);
    });
    
  } catch (error) {
    console.error('Error loading boards:', error);
    boardsContainer.innerHTML = '<div class="error-text">Error loading boards</div>';
  }
}

// Create board card element
function createBoardCard(boardId, board) {
  const card = document.createElement('div');
  card.className = 'board-card';
  card.onclick = () => window.location.href = `board.html?boardId=${boardId}`;

  const coverImg = board.coverUrl
    ? `<img class="board-cover-img" src="${escapeHtml(board.coverUrl)}" alt="${escapeHtml(board.title)}" loading="lazy">`
    : `<div class="board-cover-placeholder">${escapeHtml(board.title.charAt(0))}</div>`;

  const lastActivityAt = board.lastActivityAt || board.lastPostAt || board.createdAt;
  const lastActivity = lastActivityAt
    ? formatTimestamp(lastActivityAt)
    : null;
  const preview = board.lastPostPreview
    ? escapeHtml(board.lastPostPreview)
    : null;

  card.innerHTML = `
    <div class="board-cover">${coverImg}</div>
    <div class="board-card-body">
      <div class="board-card-top">
        <h4 class="board-title">${escapeHtml(board.title)}</h4>
        ${lastActivity ? `<span class="board-last-time">${lastActivity}</span>` : ''}
      </div>
      ${preview
        ? `<p class="board-last-preview">${preview}</p>`
        : `<span class="board-post-count">${board.postCount ? board.postCount + ' posts' : 'View posts'}</span>`
      }
    </div>
  `;

  return card;
}

async function backfillGroupBoardsLastActivity(groupId) {
  try {
    const boardsSnap = await db.collection('boards').where('groupId', '==', groupId).get();
    if (boardsSnap.empty) return;

    const missing = boardsSnap.docs.filter(d => {
      const data = d.data() || {};
      return (
        !data.lastActivityAt ||
        data.postsCount === undefined ||
        data.commentsCount === undefined ||
        data.likesCount === undefined ||
        data.activity24h === undefined ||
        data.activeUsers24h === undefined ||
        data.rankScore === undefined ||
        !data.updatedAt
      );
    });
    if (!missing.length) return;

    const batch = db.batch();
    for (const doc of missing) {
      const boardId = doc.id;
      const data = doc.data() || {};
      let activityAt = data.lastPostAt || data.createdAt || null;

      if (!activityAt) {
        const latestPostSnap = await db.collection('posts')
          .where('boardId', '==', boardId)
          .orderBy('timestamp', 'desc')
          .limit(1)
          .get();
        if (!latestPostSnap.empty) {
          activityAt = latestPostSnap.docs[0].data().timestamp || null;
        }
      }

      const merged = {
        ...data,
        postsCount: data.postsCount ?? data.postCount ?? 0,
        commentsCount: data.commentsCount ?? 0,
        likesCount: data.likesCount ?? 0,
        activity24h: data.activity24h ?? 0,
        activeUsers24h: data.activeUsers24h ?? 0,
        lastActivityAt: activityAt || data.lastActivityAt || null,
      };

      const update = {};
      if (!data.lastActivityAt && merged.lastActivityAt) update.lastActivityAt = merged.lastActivityAt;
      if (data.postsCount === undefined) update.postsCount = merged.postsCount;
      if (data.commentsCount === undefined) update.commentsCount = merged.commentsCount;
      if (data.likesCount === undefined) update.likesCount = merged.likesCount;
      if (data.activity24h === undefined) update.activity24h = merged.activity24h;
      if (data.activeUsers24h === undefined) update.activeUsers24h = merged.activeUsers24h;
      if (data.rankScore === undefined) update.rankScore = computeBoardRank(merged);
      if (!data.updatedAt) update.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

      if (Object.keys(update).length) {
        batch.update(doc.ref, update);
      }
    }

    await batch.commit();
  } catch (err) {
    console.warn('backfillGroupBoardsLastActivity skipped:', err);
  }
}

function computeBoardRank(board) {
  const now = Date.now();
  const lastActivity = board.lastActivityAt?.toMillis?.() || 0;
  const hoursSince = (now - lastActivity) / (1000 * 60 * 60);

  const engagement =
    Math.log1p(board.postsCount || 0) * 3 +
    Math.log1p(board.commentsCount || 0) * 2 +
    Math.log1p(board.likesCount || 0);

  const activityBoost = (board.activity24h || 0) * 4;
  const userBoost = (board.activeUsers24h || 0) * 5;

  const decay = hoursSince * 1.5;

  return engagement + activityBoost + userBoost - decay;
}

// Back button
if (backBtn) {
  backBtn.addEventListener('click', () => {
    window.location.href = 'dashboard.html';
  });
}

// Logout button
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await auth.signOut();
      window.location.href = '/auth';
    } catch (error) {
      console.error('Logout error:', error);
    }
  });
}

// Helper: Show loading overlay
function showLoading(show) {
  if (loadingOverlay) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
  }
}

// Load recent discussions — only posts from boards in this group
async function loadRecentActivity() {
  if (!recentActivityContainer) return;
  try {
    recentActivityContainer.innerHTML = '<div class="loading-text">Loading recent discussions…</div>';

    // First get all board IDs belonging to this group
    const boardsSnap = await db.collection('boards').where('groupId', '==', groupId).get();
    const boardIds = boardsSnap.docs.map(d => d.id);

    if (!boardIds.length) {
      recentActivityContainer.innerHTML = '';
      if (noActivityMessage) noActivityMessage.style.display = 'block';
      return;
    }

    // Firestore "in" supports up to 30 values — chunk if needed
    const CHUNK = 30;
    const chunks = [];
    for (let i = 0; i < boardIds.length; i += CHUNK) chunks.push(boardIds.slice(i, i + CHUNK));

    const snapshots = await Promise.all(
      chunks.map(chunk =>
        db.collection('posts')
          .where('boardId', 'in', chunk)
          .orderBy('timestamp', 'desc')
          .limit(10)
          .get()
      )
    );

    // Merge, sort by timestamp desc, keep top 10
    const allDocs = snapshots.flatMap(s => s.docs);
    allDocs.sort((a, b) => {
      const ta = a.data().timestamp?.seconds || 0;
      const tb = b.data().timestamp?.seconds || 0;
      return tb - ta;
    });
    const topDocs = allDocs.slice(0, 10);

    recentActivityContainer.innerHTML = '';
    if (!topDocs.length) {
      if (noActivityMessage) noActivityMessage.style.display = 'block';
      return;
    }
    if (noActivityMessage) noActivityMessage.style.display = 'none';

    topDocs.forEach(doc => {
      const post = doc.data();
      const item = document.createElement('div');
      item.className = 'activity-item';
      item.addEventListener('click', () => {
        window.location.href = `board.html?boardId=${encodeURIComponent(post.boardId)}`;
      });
      const timestamp = post.timestamp ? formatTimestamp(post.timestamp) : 'Just now';
      const preview = post.content
        ? post.content.substring(0, 100) + (post.content.length > 100 ? '…' : '')
        : (post.allVideos?.length ? '📹 Video' : post.imageUrl ? '🖼 Photo' : '');
      item.innerHTML = `
        <div class="activity-header">
          <span class="activity-author">${escapeHtml(post.authorName || 'Member')}</span>
          <span class="activity-board">${escapeHtml(post.boardName || '')}</span>
          <span class="activity-time">${timestamp}</span>
        </div>
        ${preview ? `<p class="activity-preview">${escapeHtml(preview)}</p>` : ''}
      `;
      recentActivityContainer.appendChild(item);
    });
  } catch (err) {
    console.error('loadRecentActivity error:', err);
    if (recentActivityContainer) {
      recentActivityContainer.innerHTML = '<div class="error-text">Could not load recent discussions.</div>';
    }
  }
}

// Helper: Format timestamp
function formatTimestamp(timestamp) {
  if (!timestamp) return 'Just now';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
  const now  = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs  < 24) return `${hrs}h ago`;
  if (days < 7)  return `${days}d ago`;
  return date.toLocaleDateString();
}

// Helper: Escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

console.log('Group module loaded');

// Pull-to-refresh (mobile)
if (typeof initPTR === 'function') {
  initPTR(function () { window.location.reload(); });
}
