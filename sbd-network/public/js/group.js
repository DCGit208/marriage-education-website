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
    // Clear any previous error
    boardsContainer.innerHTML = '<div class="skel-card"><div class="skel-icon"></div><div class="skel-line w60"></div><div class="skel-line w80"></div></div><div class="skel-card"><div class="skel-icon"></div><div class="skel-line w80"></div><div class="skel-line w60"></div></div>';

    if (typeof initNotifications === 'function') initNotifications(user.uid);
    
    // Verify user has tier access to this group
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

    // Query boards belonging to this group
    const boardsSnapshot = await db.collection('boards')
      .where('groupId', '==', groupId)
      .get();
    
    boardsContainer.innerHTML = '';
    
    if (boardsSnapshot.empty) {
      noBoardsMessage.style.display = 'block';
      return;
    }
    
    // Sort by most recent post activity (Telegram-style)
    const boards = boardsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    boards.sort((a, b) => {
      const ta = a.lastPostAt?.seconds || 0;
      const tb = b.lastPostAt?.seconds || 0;
      return tb - ta;
    });

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

  const lastActivity = board.lastPostAt
    ? formatTimestamp(board.lastPostAt)
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
      const preview   = post.content
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
    if (recentActivityContainer)
      recentActivityContainer.innerHTML = '<div class="error-text">Could not load recent discussions.</div>';
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
