// boards.js — All boards the current user has access to, grouped by group

const loadingOverlay = document.getElementById('loadingOverlay');
const allBoardsContainer = document.getElementById('allBoardsContainer');
const noBoardsMessage = document.getElementById('noBoardsMessage');
const logoutBtn = document.getElementById('logoutBtn');

auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = '/index.html'; return; }

  if (typeof initNotifications === 'function') initNotifications(user.uid);

  await loadAllBoards(user);
});

async function loadAllBoards(user) {
  try {
    showLoading(true);

    // Load user doc to get group IDs
    const userDoc = await db.collection('users').doc(user.uid).get();
    const userData = userDoc.data();
    const groupIds = userData?.groups || [];

    if (!groupIds.length) {
      allBoardsContainer.innerHTML = '';
      if (noBoardsMessage) noBoardsMessage.style.display = 'block';
      return;
    }

    // Load all group docs + all their boards in parallel
    const [groupDocs, boardsSnapshots] = await Promise.all([
      Promise.all(groupIds.map(id => db.collection('groups').doc(id).get())),
      Promise.all(groupIds.map(id =>
        db.collection('boards').where('groupId', '==', id).get()
      )),
    ]);

    allBoardsContainer.innerHTML = '';
    let totalBoards = 0;

    groupDocs.forEach((groupDoc, i) => {
      if (!groupDoc.exists) return;
      const group = groupDoc.data();
      const snap = boardsSnapshots[i];
      if (!snap || snap.empty) return;

      // Sort boards by most recent activity
      const boards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      boards.sort((a, b) => (b.lastPostAt?.seconds || 0) - (a.lastPostAt?.seconds || 0));

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

  const lastActivity = board.lastPostAt ? formatTimestamp(board.lastPostAt) : null;
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

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try { await auth.signOut(); window.location.href = '/index.html'; } catch (e) { console.error(e); }
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
