// ================================================================
// EXPLORE PAGE
// ================================================================

const WORKER_URL = 'https://sbd-upload-signer.sbdnetwork.workers.dev';
let currentUserUid = null;
let accessibleBoardIds = [];
let allGroupMembers = [];
let searchTimer = null;

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

// ---- Auth entry point ----

auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = '/auth'; return; }
  currentUserUid = user.uid;

  if (typeof initNotifications === 'function') initNotifications(user.uid);
  if (typeof initDmBadge === 'function') initDmBadge(user.uid);

  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.style.display = 'flex';

  try {
    await buildAccessIndex(user.uid);
    await loadHotPosts();
  } catch (err) {
    console.error('Explore init error:', err);
  } finally {
    if (overlay) overlay.style.display = 'none';
  }
});

// ---- Build index of accessible boards + members ----

async function buildAccessIndex(uid) {
  const userSnap = await db.collection('users').doc(uid).get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const groupIds = userData.groups || [];
  if (!groupIds.length) return;

  // Fetch all accessible boards
  const CHUNK = 10;
  const gChunks = [];
  for (let i = 0; i < groupIds.length; i += CHUNK) gChunks.push(groupIds.slice(i, i + CHUNK));

  const [boardResults, groupResults] = await Promise.all([
    Promise.all(gChunks.map(c => db.collection('boards').where('groupId', 'in', c).get())),
    Promise.all(gChunks.map(c =>
      db.collection('groups').where(firebase.firestore.FieldPath.documentId(), 'in', c).get()
    )),
  ]);

  accessibleBoardIds = boardResults.flatMap(s => s.docs).map(d => d.id);

  // Collect unique member uids across all groups
  const memberUidSet = new Set();
  groupResults.flatMap(s => s.docs).forEach(d => {
    const data = d.data();
    (data.members || []).forEach(m => {
      if (m !== uid) memberUidSet.add(m);
    });
  });

  if (memberUidSet.size) {
    const uids = Array.from(memberUidSet);
    const uChunks = [];
    for (let i = 0; i < uids.length; i += 10) uChunks.push(uids.slice(i, i + 10));
    const memberSnaps = await Promise.all(
      uChunks.map(c =>
        db.collection('users')
          .where(firebase.firestore.FieldPath.documentId(), 'in', c)
          .get()
      )
    );
    allGroupMembers = memberSnaps.flatMap(s => s.docs).map(d => ({ uid: d.id, ...d.data() }));
  }
}

// ---- Hot posts this week ----

async function loadHotPosts() {
  const grid = document.getElementById('hotGrid');
  if (!grid) return;
  if (!accessibleBoardIds.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Join groups to see hot posts.</p>';
    return;
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const cutoff = firebase.firestore.Timestamp.fromDate(sevenDaysAgo);

  const CHUNK = 30;
  const chunks = [];
  for (let i = 0; i < accessibleBoardIds.length; i += CHUNK) {
    chunks.push(accessibleBoardIds.slice(i, i + CHUNK));
  }

  const postSnaps = await Promise.all(
    chunks.map(c =>
      db.collection('posts')
        .where('boardId', 'in', c)
        .where('timestamp', '>=', cutoff)
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get()
    )
  );

  let posts = postSnaps.flatMap(s => s.docs).map(d => ({ id: d.id, ...d.data() }));

  // Score by reactions + comments
  posts.sort((a, b) => {
    const scoreA = (a.reactions ? Object.values(a.reactions).reduce((s, v) => s + (v || 0), 0) : 0) + (a.commentCount || 0);
    const scoreB = (b.reactions ? Object.values(b.reactions).reduce((s, v) => s + (v || 0), 0) : 0) + (b.commentCount || 0);
    return scoreB - scoreA;
  });

  const top = posts.slice(0, 24);
  renderGrid(grid, top);
}

// ---- Render helpers ----

function renderGrid(container, posts) {
  if (!container) return;
  if (!posts.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;grid-column:1/-1;padding:12px 0;">Nothing here yet.</p>';
    return;
  }
  container.innerHTML = posts.map(post => {
    const thumb = post.imageUrl
      || (Array.isArray(post.allPhotos) && post.allPhotos[0])
      || post.thumbUrl
      || null;
    const isVideo = !!(post.videoUrl || (Array.isArray(post.allVideos) && post.allVideos.length));
    const reactions = post.reactions
      ? Object.values(post.reactions).reduce((s, v) => s + (v || 0), 0)
      : 0;
    const comments = post.commentCount || 0;
    const engagement = reactions + comments;
    const href = `board.html?boardId=${encodeURIComponent(post.boardId)}&post=${encodeURIComponent(post.id)}`;

    if (thumb) {
      return `<a class="explore-post-cell" href="${esc(href)}">
        <img src="${esc(thumb)}" alt="" loading="lazy">
        ${isVideo ? '<div class="explore-play">▶</div>' : ''}
        ${engagement > 0 ? `<div class="explore-engagement">❤️${reactions} 💬${comments}</div>` : ''}
      </a>`;
    } else if (post.content && post.content.trim()) {
      return `<a class="explore-post-cell" href="${esc(href)}">
        <div class="explore-text-cell">${esc(post.content.slice(0, 80))}</div>
        ${engagement > 0 ? `<div class="explore-engagement">❤️${reactions} 💬${comments}</div>` : ''}
      </a>`;
    } else {
      return `<a class="explore-post-cell" href="${esc(href)}">
        <div class="explore-text-cell" style="font-size:2rem;">📎</div>
      </a>`;
    }
  }).join('');
}

function renderPeople(container, members) {
  if (!container) return;
  if (!members.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No members found.</p>';
    return;
  }
  container.innerHTML = members.slice(0, 20).map(m => {
    const name = m.name || 'Member';
    const initials = getInitials(name);
    const avatarInner = m.photoUrl
      ? `<img src="${esc(m.photoUrl)}" alt="">`
      : initials;
    return `<a class="explore-person-row" href="member.html?uid=${encodeURIComponent(m.uid)}">
      <div class="explore-person-avatar">${avatarInner}</div>
      <div>
        <div class="explore-person-name">${esc(name)}</div>
      </div>
    </a>`;
  }).join('');
}

// ---- Search logic ----

async function runSearch(q) {
  const qLow = q.toLowerCase().trim();

  const peopleSection = document.getElementById('peopleSection');
  const postsSection = document.getElementById('postsSection');
  const hotSection = document.getElementById('hotSection');
  const peopleList = document.getElementById('peopleList');
  const searchPostsGrid = document.getElementById('searchPostsGrid');

  if (!qLow) {
    if (hotSection) hotSection.style.display = '';
    if (peopleSection) peopleSection.style.display = 'none';
    if (postsSection) postsSection.style.display = 'none';
    return;
  }

  if (hotSection) hotSection.style.display = 'none';
  if (peopleSection) peopleSection.style.display = '';
  if (postsSection) postsSection.style.display = '';

  // People search (client-side)
  const matchedPeople = allGroupMembers.filter(m =>
    (m.name || '').toLowerCase().includes(qLow)
  );
  renderPeople(peopleList, matchedPeople);

  // Post search (fetch + client-side filter)
  if (!accessibleBoardIds.length) {
    if (searchPostsGrid) renderGrid(searchPostsGrid, []);
    return;
  }

  try {
    const CHUNK = 30;
    const chunks = [];
    for (let i = 0; i < accessibleBoardIds.length; i += CHUNK) {
      chunks.push(accessibleBoardIds.slice(i, i + CHUNK));
    }
    const postSnaps = await Promise.all(
      chunks.map(c =>
        db.collection('posts')
          .where('boardId', 'in', c)
          .orderBy('timestamp', 'desc')
          .limit(100)
          .get()
      )
    );
    const posts = postSnaps.flatMap(s => s.docs).map(d => ({ id: d.id, ...d.data() }));
    const matching = posts.filter(p => (p.content || '').toLowerCase().includes(qLow));
    renderGrid(searchPostsGrid, matching.slice(0, 24));
  } catch (err) {
    console.error('Post search error:', err);
    if (searchPostsGrid) renderGrid(searchPostsGrid, []);
  }
}

// ---- Search input debounce ----

const searchInput = document.getElementById('exploreSearch');
if (searchInput) {
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(searchInput.value), 380);
  });
}
