// ================================================================
// ANALYTICS PAGE
// ================================================================

// Wait for Firebase to be ready
(function initAnalytics() {
  if (typeof firebase === 'undefined' || typeof auth === 'undefined' || typeof db === 'undefined') {
    console.log('[Analytics] Waiting for Firebase...');
    setTimeout(initAnalytics, 100);
    return;
  }
  
  console.log('[Analytics] Firebase ready, initializing...');
  startAnalytics();
})();

function startAnalytics() {
const backBtn = document.getElementById('backBtn');
const refreshBtn = document.getElementById('refreshBtn');
let currentUserId = null;
let currentPeriod = 7; // days
let activityChart = null;

function showLoading(show) {
  const el = document.getElementById('loadingOverlay');
  if (el) el.style.display = show ? 'flex' : 'none';
}

// ── Auth Guard ──────────────────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (!user) { 
    console.log('[Analytics] No user, redirecting to login');
    window.location.href = '/auth'; 
    return; 
  }
  
  currentUserId = user.uid;
  console.log('[Analytics] User logged in:', currentUserId);
  showLoading(true);
  
  try {
    await loadAnalytics();
  } catch (err) {
    console.error('[Analytics] Load error:', err);
    alert('Error loading analytics. Please try refreshing the page.');
  } finally {
    showLoading(false);
  }
});

// ── Load Analytics Data ─────────────────────────────────────────
async function loadAnalytics() {
  console.log('[Analytics] Loading for period:', currentPeriod, 'days');
  
  // Calculate date range
  const now = new Date();
  const startDate = currentPeriod === 'all' 
    ? new Date(0) 
    : new Date(now.getTime() - (currentPeriod * 24 * 60 * 60 * 1000));
  
  // Load user's posts (NO orderBy to avoid index requirement)
  const postsQuery = db.collection('posts')
    .where('authorId', '==', currentUserId);
  
  const postsSnapshot = await postsQuery.get();
  
  // Get all posts and sort/filter in JavaScript
  let posts = postsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Filter by date range
  if (currentPeriod !== 'all') {
    const startTimestamp = startDate.getTime();
    posts = posts.filter(post => {
      if (!post.timestamp) return false;
      const postTime = post.timestamp.toMillis ? post.timestamp.toMillis() : post.timestamp;
      return postTime >= startTimestamp;
    });
  }
  
  // Sort by timestamp descending (newest first) in JavaScript
  posts.sort((a, b) => {
    const aTime = a.timestamp?.toMillis ? a.timestamp.toMillis() : (a.timestamp || 0);
    const bTime = b.timestamp?.toMillis ? b.timestamp.toMillis() : (b.timestamp || 0);
    return bTime - aTime;
  });
  
  // Calculate stats
  const totalPosts = posts.length;
  let totalReactions = 0;
  let topPosts = [];
  
  posts.forEach(post => {
    const reactions = post.reactions || {};
    const reactionCount = Object.values(reactions).reduce((sum, uids) => sum + (Array.isArray(uids) ? uids.length : 0), 0);
    totalReactions += reactionCount;
    
    topPosts.push({
      ...post,
      reactionCount,
      commentCount: post.commentCount || 0,
    });
  });
  
  // Sort top posts by reaction count
  topPosts.sort((a, b) => b.reactionCount - a.reactionCount);
  topPosts = topPosts.slice(0, 10); // Top 10
  
  // Load user's comments (no index required - filter by date in JavaScript)
  const commentsQuery = db.collection('comments').where('authorId', '==', currentUserId);
  
  const commentsSnapshot = await commentsQuery.get();
  
  // Filter by date range in JavaScript (avoids index requirement)
  let totalComments = 0;
  if (currentPeriod === 'all') {
    totalComments = commentsSnapshot.size;
  } else {
    const startTimestamp = startDate.getTime();
    commentsSnapshot.docs.forEach(doc => {
      const comment = doc.data();
      if (comment.createdAt) {
        const commentTime = comment.createdAt.toMillis ? comment.createdAt.toMillis() : comment.createdAt;
        if (commentTime >= startTimestamp) {
          totalComments++;
        }
      }
    });
  }
  
  // Calculate engagement rate
  const engagementRate = totalPosts > 0 ? ((totalReactions / totalPosts)).toFixed(1) : 0;
  
  // Update UI
  document.getElementById('totalPosts').textContent = totalPosts;
  document.getElementById('totalReactions').textContent = totalReactions;
  document.getElementById('totalComments').textContent = totalComments;
  document.getElementById('engagementRate').textContent = engagementRate;
  
  // Render top posts
  renderTopPosts(topPosts);
  
  // Render activity chart
  renderActivityChart(posts);
  
  // Load board stats (if user is admin of any boards)
  await loadBoardStats();
  
  console.log('[Analytics] Loaded:', { totalPosts, totalReactions, totalComments, engagementRate });
}

// ── Render Top Posts ────────────────────────────────────────────
function renderTopPosts(posts) {
  const container = document.getElementById('topPostsList');
  
  if (!posts.length) {
    container.innerHTML = '<div class="loading-text">No posts in this period</div>';
    return;
  }
  
  container.innerHTML = posts.map((post, index) => {
    const rank = index + 1;
    const rankClass = `rank-${rank <= 3 ? rank : ''}`;
    const text = post.content || 'Post with media';
    const truncated = text.length > 100 ? text.slice(0, 100) + '...' : text;
    
    return `
      <a href="/board.html?boardId=${post.boardId}&post=${post.id}" class="top-post-item">
        <div class="top-post-rank ${rankClass}">${rank}</div>
        <div class="top-post-content">
          <div class="top-post-text">${escHtml(truncated)}</div>
          <div class="top-post-stats">
            <span class="top-post-stat">❤️ ${post.reactionCount}</span>
            <span class="top-post-stat">💬 ${post.commentCount || 0}</span>
          </div>
        </div>
      </a>
    `;
  }).join('');
}

// ── Render Activity Chart ───────────────────────────────────────
function renderActivityChart(posts) {
  const canvas = document.getElementById('activityChart');
  if (!canvas) return;
  
  // Group posts by date
  const dateCounts = {};
  const now = new Date();
  const daysToShow = currentPeriod === 'all' ? 30 : currentPeriod;
  
  // Initialize all dates with 0
  for (let i = daysToShow - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
    const dateStr = date.toISOString().split('T')[0];
    dateCounts[dateStr] = 0;
  }
  
  // Count posts per date
  posts.forEach(post => {
    if (post.timestamp) {
      const date = post.timestamp.toDate();
      const dateStr = date.toISOString().split('T')[0];
      if (dateCounts[dateStr] !== undefined) {
        dateCounts[dateStr]++;
      }
    }
  });
  
  const labels = Object.keys(dateCounts).map(dateStr => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  
  const data = Object.values(dateCounts);
  
  // Destroy existing chart
  if (activityChart) {
    activityChart.destroy();
  }
  
  // Create new chart
  const ctx = canvas.getContext('2d');
  activityChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Posts',
        data,
        borderColor: '#00bcd4',
        backgroundColor: 'rgba(0, 188, 212, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            color: 'rgba(255, 255, 255, 0.6)',
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.06)',
          },
        },
        x: {
          ticks: {
            color: 'rgba(255, 255, 255, 0.6)',
            maxRotation: 45,
            minRotation: 45,
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.06)',
          },
        },
      },
    },
  });
}

// ── Load Board Stats (for admins) ──────────────────────────────
async function loadBoardStats() {
  try {
    // Find boards where user is admin
    const userDoc = await db.collection('users').doc(currentUserId).get();
    const userData = userDoc.data() || {};
    const isGlobalAdmin = userData.role === 'admin';
    
    // Get all boards user is a member of
    const boardsSnapshot = await db.collection('boards').where('members', 'array-contains', currentUserId).get();
    const adminBoards = [];
    
    boardsSnapshot.docs.forEach(doc => {
      const board = { id: doc.id, ...doc.data() };
      // Check if user is admin of this board or global admin
      if (isGlobalAdmin || (board.admins && board.admins.includes(currentUserId))) {
        adminBoards.push(board);
      }
    });
    
    if (!adminBoards.length) {
      document.getElementById('boardStatsSection').style.display = 'none';
      return;
    }
    
    document.getElementById('boardStatsSection').style.display = 'block';
    
    // Load stats for each board
    const boardStats = await Promise.all(adminBoards.map(async (board) => {
      const postsSnapshot = await db.collection('posts').where('boardId', '==', board.id).get();
      const memberCount = (board.members || []).length;
      const postCount = postsSnapshot.size;
      
      return {
        ...board,
        postCount,
        memberCount,
      };
    }));
    
    // Render board stats
    renderBoardStats(boardStats);
    
  } catch (err) {
    console.warn('[Analytics] Board stats error:', err);
    document.getElementById('boardStatsSection').style.display = 'none';
  }
}

// ── Render Board Stats ──────────────────────────────────────────
function renderBoardStats(boards) {
  const container = document.getElementById('boardStatsList');
  
  if (!boards.length) {
    container.innerHTML = '<div class="loading-text">No managed boards</div>';
    return;
  }
  
  container.innerHTML = boards.map(board => `
    <div class="board-stat-item">
      <div class="board-stat-header">
        <div class="board-stat-name">${escHtml(board.title || 'Untitled Board')}</div>
        <div class="board-stat-badge">Admin</div>
      </div>
      <div class="board-stat-metrics">
        <div class="board-metric">
          <div class="board-metric-value">${board.memberCount}</div>
          <div class="board-metric-label">Members</div>
        </div>
        <div class="board-metric">
          <div class="board-metric-value">${board.postCount}</div>
          <div class="board-metric-label">Posts</div>
        </div>
      </div>
    </div>
  `).join('');
}

// ── Period Filter ───────────────────────────────────────────────
document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    // Update active state
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Update period
    currentPeriod = btn.dataset.period === 'all' ? 'all' : parseInt(btn.dataset.period, 10);
    
    // Reload analytics
    showLoading(true);
    try {
      await loadAnalytics();
    } catch (err) {
      console.error('[Analytics] Reload error:', err);
    } finally {
      showLoading(false);
    }
  });
});

// ── Navigation ──────────────────────────────────────────────────
backBtn && backBtn.addEventListener('click', () => {
  window.location.href = 'profile.html';
});

refreshBtn && refreshBtn.addEventListener('click', async () => {
  showLoading(true);
  try {
    await loadAnalytics();
  } catch (err) {
    console.error('[Analytics] Refresh error:', err);
  } finally {
    showLoading(false);
  }
});

// ── Utilities ───────────────────────────────────────────────────
function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

} // End of startAnalytics function
