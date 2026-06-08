// Boards V2 — Community Engine (Group-based)
// Access: user's tier must meet group.requiredTier AND group.id must be in users.groups (admin-assigned).

let userTier = 'free';
let userData = null;
let isAdmin = false;
let userCommentCount = 0;
const FREE_TIER_COMMENT_LIMIT = 3;
const TIER_ORDER = { free: 0, foundation: 1, premium: 2, elite: 3 };

firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = '/auth'; return; }
  await loadUserData(user);
  await loadCommunity();
});

async function loadUserData(user) {
  try {
    const doc = await firebase.firestore().collection('users').doc(user.uid).get();
    if (doc.exists) {
      userData = doc.data();
      const data = userData;
      const sub = data.subscription || {};
      const now = Date.now();
      const subEnd = sub.endDate?.toMillis ? sub.endDate.toMillis() : 0;
      const activeSub = sub.status === 'active' && subEnd > now ? (sub.tier || '') : '';
      isAdmin = data.role === 'admin';
      const docTier = (data.tier || 'free').toLowerCase();
      userTier = isAdmin ? 'elite' : (activeSub || docTier || 'free');

      if (userTier === 'free') {
        const postsSnap = await firebase.firestore()
          .collection('posts').where('authorId', '==', user.uid).get();
        userCommentCount = postsSnap.size;
      }
    }
  } catch (e) { console.error('loadUserData:', e); }
}

function userGroupIds() {
  const g = userData?.groups;
  if (!Array.isArray(g)) return [];
  return g.filter(function (id) { return typeof id === 'string' && id; });
}

function userAssignedToGroup(groupId) {
  return isAdmin || userGroupIds().includes(groupId);
}

function isAdvancedCommunityGroup(groupId) {
  return typeof AdvancedExpressionAccess !== 'undefined' &&
    AdvancedExpressionAccess.isAdvancedExpressionGroupId(groupId);
}

/** Tier + admin-assigned group membership (+ formation for advanced groups when assigned). */
function resolveGroupAccess(group) {
  if (isAdmin) return { allowed: true };

  const userLevel = TIER_ORDER[userTier] ?? 0;
  const groupLevel = TIER_ORDER[group.requiredTier] ?? 3;

  if (userLevel < groupLevel) {
    return { allowed: false, kind: 'tier', requiredTier: group.requiredTier || 'elite' };
  }

  if (!userAssignedToGroup(group.id)) {
    return { allowed: false, kind: 'hidden' };
  }

  if (isAdvancedCommunityGroup(group.id) && typeof AdvancedExpressionAccess !== 'undefined') {
    if (!AdvancedExpressionAccess.hasAdvancedExpressionAccess(userData)) {
      const access = AdvancedExpressionAccess.getAdvancedExpressionAccess(userData || {});
      return {
        allowed: false,
        kind: 'formation',
        message: access.message || 'Formation Required',
        detail: access.detail || 'Complete your formation arc to unlock this group.',
        ctaUrl: access.ctaUrl || '/courses.html',
      };
    }
  }

  return { allowed: true };
}

function boardAllowedForUser(board) {
  if (isAdmin) return true;
  const gid = board.groupId;
  if (gid && !userAssignedToGroup(gid)) return false;
  if (typeof AdvancedExpressionAccess !== 'undefined' &&
      AdvancedExpressionAccess.isAdvancedExpressionBoard(board.id, board)) {
    return AdvancedExpressionAccess.hasAdvancedExpressionAccess(userData);
  }
  return true;
}

async function loadCommunity() {
  showLoading(true);
  const container = document.getElementById('groupsContainer');
  const subtext = document.getElementById('communitySubtext');
  try {
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
        .filter(b => !b.archived)
        .filter(boardAllowedForUser);
    }

    const boardsByGroup = {};
    allBoards.forEach(b => {
      const gid = b.groupId || '__none__';
      if (!boardsByGroup[gid]) boardsByGroup[gid] = [];
      boardsByGroup[gid].push(b);
    });

    let unlockedCount = 0;
    container.innerHTML = '';

    groups.forEach(group => {
      const access = resolveGroupAccess(group);

      if (access.kind === 'hidden') return;

      const boards = (boardsByGroup[group.id] || [])
        .sort((a, b) => (b.postCount || 0) - (a.postCount || 0));
      const totalPosts = boards.reduce((sum, b) => sum + (b.postCount || 0), 0);

      if (access.allowed) {
        unlockedCount++;
        container.appendChild(createGroupCard(group, boards, totalPosts));
      } else if (access.kind === 'formation') {
        container.appendChild(createFormationLockedGroupCard(group, access));
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

function createFormationLockedGroupCard(group, access) {
  const el = document.createElement('div');
  el.className = 'group-card group-card--locked';
  el.innerHTML = `
    <div class="gc-lock-icon">🔒</div>
    <h3 class="gc-title gc-title--locked">${escapeHtml(group.title)}</h3>
    <p class="gc-locked-sub">${escapeHtml(access.detail || access.message || 'Formation required')}</p>
    <button class="gc-unlock-btn" onclick="window.location.href='${escapeHtml(access.ctaUrl || '/courses.html')}'">
      Continue Formation →
    </button>`;
  return el;
}

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
