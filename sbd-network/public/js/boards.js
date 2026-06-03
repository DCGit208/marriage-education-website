// boards.js — All boards the current user has access to, grouped by group

const loadingOverlay = document.getElementById('loadingOverlay');
const allBoardsContainer = document.getElementById('allBoardsContainer');
const noBoardsMessage = document.getElementById('noBoardsMessage');
const logoutBtn = document.getElementById('logoutBtn');

auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = '/auth'; return; }

  if (typeof initNotifications === 'function') initNotifications(user.uid);

  await loadAllBoards(user);
});

async function loadAllBoards(user) {
  try {
    showLoading(true);

    // Load user doc to get group IDs
    const userDoc = await db.collection('users').doc(user.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    let groupIds = userData?.groups || [];
    const advGroups =
      typeof AdvancedExpressionAccess !== 'undefined'
        ? AdvancedExpressionAccess.ADVANCED_EXPRESSION_GROUP_IDS
        : ['advanced-muliebrity-training-school', 'z8lmnHLoFUBBZaRp2Vdd'];
    if (typeof AdvancedExpressionAccess !== 'undefined' &&
        !AdvancedExpressionAccess.hasAdvancedExpressionAccess(userData)) {
      groupIds = groupIds.filter((g) => !advGroups.includes(g));
    }

    if (!groupIds.length) {
      allBoardsContainer.innerHTML = '';
      if (noBoardsMessage) noBoardsMessage.style.display = 'block';
      return;
    }

    // One-time legacy migration: ensure boards have lastActivityAt for server-side ordering
    await backfillBoardsLastActivity(groupIds);

    // Rank-first ordering with safe fallback to lastActivityAt.
    const groupDocsPromise = Promise.all(groupIds.map(id => db.collection('groups').doc(id).get()));
    const boardsPromise = (async () => {
      try {
        return await db.collection('boards').orderBy('rankScore', 'desc').get();
      } catch (_) {
        return await db.collection('boards').orderBy('lastActivityAt', 'desc').get();
      }
    })();

    const [groupDocs, boardsSnapshot] = await Promise.all([groupDocsPromise, boardsPromise]);

    const boardsByGroup = {};
    boardsSnapshot.docs.forEach((doc) => {
      const board = { id: doc.id, ...doc.data() };
      if (!groupIds.includes(board.groupId)) return;
      if (!boardsByGroup[board.groupId]) boardsByGroup[board.groupId] = [];
      boardsByGroup[board.groupId].push(board);
    });

    allBoardsContainer.innerHTML = '';
    let totalBoards = 0;

    groupDocs.forEach((groupDoc, i) => {
      if (!groupDoc.exists) return;
      const group = groupDoc.data();
      const boards = boardsByGroup[groupDoc.id] || [];
      if (!boards.length) return;

      // Section wrapper with group heading
      const section = document.createElement('section');
      section.className = 'boards-group-section';

      const heading = document.createElement('h3');
      heading.className = 'boards-group-title';
      heading.textContent = group.title;
      section.appendChild(heading);

      const grid = document.createElement('div');
      grid.className = 'boards-grid';
      boards.forEach(board => grid.appendChild(createBoardCard(board.id, board)));
      section.appendChild(grid);

      allBoardsContainer.appendChild(section);
      totalBoards += boards.length;
    });

    if (!totalBoards) {
      if (noBoardsMessage) noBoardsMessage.style.display = 'block';
    }
  } catch (err) {
    console.error('loadAllBoards:', err);
    allBoardsContainer.innerHTML = `
      <div class="empty-state">
        <p>Couldn't load boards. Check your connection.</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>`;
  } finally {
    showLoading(false);
  }
}

function createBoardCard(boardId, board) {
  const card = document.createElement('div');
  card.className = 'board-card';
  card.onclick = () => { window.location.href = `/board.html?boardId=${boardId}`; };

  const coverImg = board.coverUrl
    ? `<img class="board-cover-img" src="${escapeHtml(board.coverUrl)}" alt="${escapeHtml(board.title)}" loading="lazy">`
    : `<div class="board-cover-placeholder">${escapeHtml(board.title.charAt(0))}</div>`;

  const lastActivityAt = board.lastActivityAt || board.lastPostAt || board.createdAt;
  const lastActivity = lastActivityAt ? formatTimestamp(lastActivityAt) : null;
  const preview      = board.lastPostPreview ? escapeHtml(board.lastPostPreview) : null;

  card.innerHTML = `
    <div class="board-cover">${coverImg}</div>
    <div class="board-card-body">
      <div class="board-card-top">
        <h4 class="board-title">${escapeHtml(board.title)}</h4>
        ${lastActivity ? `<span class="board-last-time">${lastActivity}</span>` : ''}
      </div>
      ${preview
        ? `<p class="board-last-preview">${preview}</p>`
        : `<span class="board-post-count">${board.postCount ? board.postCount + ' posts' : 'View posts'}</span>`}
    </div>`;

  return card;
}

async function backfillBoardsLastActivity(groupIds) {
  try {
    for (const gid of groupIds) {
      const boardsSnap = await db.collection('boards').where('groupId', '==', gid).get();
      if (boardsSnap.empty) continue;

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
      if (!missing.length) continue;

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
    }
  } catch (err) {
    console.warn('backfillBoardsLastActivity skipped:', err);
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

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try { await auth.signOut(); window.location.href = '/auth'; } catch (e) { console.error(e); }
  });
}

function showLoading(show) {
  if (loadingOverlay) loadingOverlay.style.display = show ? 'flex' : 'none';
}

function escapeHtml(text) {
  if (!text) return '';
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
  const diff  = Date.now() - date;
  const mins  = Math.floor(diff / 60000);
  const hrs   = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs  < 24) return `${hrs}h ago`;
  if (days < 7)  return `${days}d ago`;
  return date.toLocaleDateString();
}

if (typeof initPTR === 'function') {
  initPTR(() => window.location.reload());
}
