// Boards V2 — Community Engine (Group-based)
// Architecture: Community → Groups → Boards
// Access: requiredTier on the group AND on individual boards.
// Admin (role:'admin') = elite, sees everything.

let userTier = 'free';
let isAdmin = false;
let userCommentCount = 0;
const FREE_TIER_COMMENT_LIMIT = 3;
const TIER_ORDER = { free: 0, foundation: 1, premium: 2, elite: 3 };

// ── Boot ────────────────────────────────────────────────────────
firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = '/auth'; return; }
  await loadUserData(user);
  await loadCommunity();
});

// ── User data + tier ─────────────────────────────────────────────
async function loadUserData(user) {
  try {
    const doc = await firebase.firestore().collection('users').doc(user.uid).get();
    if (doc.exists) {
      const data = doc.data();
      const sub = data.subscription || {};
      const now = Date.now();
      const subEnd = sub.endDate?.toMillis ? sub.endDate.toMillis() : 0;
      const activeSub = sub.status === 'active' && subEnd > now ? (sub.tier || '') : '';
      isAdmin = data.role === 'admin';
      userTier = isAdmin ? 'elite' : (activeSub || 'free');

      if (userTier === 'free') {
        const postsSnap = await firebase.firestore()
          .collection('posts').where('authorId', '==', user.uid).get();
        userCommentCount = postsSnap.size;
      }
    }
  } catch (e) { console.error('loadUserData:', e); }
}

// ── Main render ──────────────────────────────────────────────────
async function loadCommunity() {
  showLoading(true);
  const container = document.getElementById('groupsContainer');
  const subtext = document.getElementById('communitySubtext');
  try {
    // Load groups ordered by order field
    let groupsSnap;
    try {
      groupsSnap = await firebase.firestore()
        .collection('groups')
        .where('archived', '!=', true)
        .orderBy('archived')
        .orderBy('order')
        .get();
    } catch (_) {
      groupsSnap = await firebase.firestore().collection('groups').get();
    }

    const groups = groupsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(g => !g.archived)
      .sort((a, b) => (a.order || 99) - (b.order || 99));

    if (groups.length === 0) {
      document.getElementById('emptyState').style.display = 'block';
      showLoading(false);
      return;
    }

    // Load all boards once (admin gets all; others get accessible tiers)
    const userLevel = TIER_ORDER[userTier] ?? 0;
    const accessibleTiers = Object.keys(TIER_ORDER).filter(t => TIER_ORDER[t] <= userLevel);

    let allBoards = [];
    if (isAdmin) {
      const snap = await firebase.firestore().collection('boards')
        .where('archived', '!=', true).get()
        .catch(() => firebase.firestore().collection('boards').get());
      allBoards = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => !b.archived);
    } else {
      const snaps = await Promise.all(
        accessibleTiers.map(t =>
          firebase.firestore().collection('boards')
            .where('requiredTier', '==', t)
            .where('archived', '!=', true)
            .get()
            .catch(() =>
              firebase.firestore().collection('boards')
                .where('requiredTier', '==', t).get()
            )
        )
      );
      allBoards = snaps.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() })))
        .filter(b => !b.archived);
    }

    // Group boards by groupId
    const boardsByGroup = {};
    allBoards.forEach(b => {
      const gid = b.groupId || '__none__';
      if (!boardsByGroup[gid]) boardsByGroup[gid] = [];
      boardsByGroup[gid].push(b);
    });

    // Render groups
    const userLevel2 = TIER_ORDER[userTier] ?? 0;
    let unlockedCount = 0;
    container.innerHTML = '';

    groups.forEach(group => {
      const groupLevel = TIER_ORDER[group.requiredTier] ?? 3;
      const hasAccess = userLevel2 >= groupLevel;
      const boards = (boardsByGroup[group.id] || [])
        .sort((a, b) => (b.postCount || 0) - (a.postCount || 0));
      const totalPosts = boards.reduce((sum, b) => sum + (b.postCount || 0), 0);

      if (hasAccess) {
        unlockedCount++;
        container.appendChild(createGroupCard(group, boards, totalPosts));
      } else {
        container.appendChild(createLockedGroupCard(group));
      }
    });

    subtext.textContent = unlockedCount > 0
      ? `${unlockedCount} group${unlockedCount !== 1 ? 's' : ''} available`
      : 'Groups unlock as you upgrade your tier';

  } catch (err) {
    console.error('loadCommunity:', err);
    container.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-secondary)">Error loading groups. Try again.</div>';
  }
  showLoading(false);
}

// ── Group card — unlocked ────────────────────────────────────────
function createGroupCard(group, boards, totalPosts) {
  const el = document.createElement('div');
  el.className = 'group-card group-card--open';
  el.innerHTML = `
    <div class="gc-header" onclick="window.location.href='/group.html?id=${group.id}'">
      <div class="gc-meta">
        <h3 class="gc-title">${escapeHtml(group.title)}</h3>
        <span class="gc-stats">${boards.length} board${boards.length !== 1 ? 's' : ''} · ${totalPosts.toLocaleString()} posts</span>
      </div>
      <span class="gc-chevron">›</span>
    </div>
    <div class="gc-footer">
      <p class="gc-desc">${escapeHtml(group.description || 'Active discussions happening inside')}</p>
      <button class="gc-goto-btn" onclick="window.location.href='/group.html?id=${group.id}'">View Group →</button>
    </div>`;
  return el;
}

// ── Locked group card ─────────────────────────────────────────────
function createLockedGroupCard(group) {
  const tierLabel = { free: 'Free', foundation: 'Foundation', premium: 'Premium', elite: 'Elite' };
  const label = tierLabel[group.requiredTier] || 'Elite';
  const el = document.createElement('div');
  el.className = 'group-card group-card--locked';
  el.innerHTML = `
    <div class="gc-lock-icon">🔒</div>
    <h3 class="gc-title gc-title--locked">${escapeHtml(group.title)}</h3>
    <p class="gc-locked-sub">Active discussions happening inside</p>
    <button class="gc-unlock-btn" onclick="showUpgradeModal('${group.requiredTier}')">
      Unlock ${label} →
    </button>`;
  return el;
}


// ── Open board ────────────────────────────────────────────────────
function openBoard(boardId) {
  if (userTier === 'free' && userCommentCount >= FREE_TIER_COMMENT_LIMIT) {
    document.getElementById('participationLimit').style.display = 'block';
    document.getElementById('participationLimit').scrollIntoView({ behavior: 'smooth' });
  } else {
    window.location.href = `/board.html?boardId=${boardId}`;
  }
}

function showUpgradeModal(tier) {
  window.location.href = `/payment?tier=${tier}`;
}

function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.toggle('visible', show);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

