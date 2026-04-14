// ================================================================
// PUBLIC MEMBER PROFILE
// ================================================================

const urlParams = new URLSearchParams(window.location.search);
let memberUid = urlParams.get('uid');
const memberUsername = urlParams.get('username');

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

function renderMemberAvatar(name, photoUrl) {
  const img = document.getElementById('memberAvatarImg');
  const initials = document.getElementById('memberInitials');
  if (photoUrl) {
    img.src = photoUrl;
    img.style.display = 'block';
    initials.style.display = 'none';
  } else {
    img.style.display = 'none';
    initials.style.display = 'flex';
    initials.textContent = getInitials(name);
  }
}

auth.onAuthStateChanged(async (viewer) => {
  if (!viewer) { window.location.href = '/auth'; return; }
  
  // Resolve username to UID if needed
  if (!memberUid && memberUsername) {
    try {
      // Try username field first
      let snapshot = await db.collection('users')
        .where('username', '==', memberUsername.toLowerCase())
        .limit(1)
        .get();
      
      if (!snapshot.empty) {
        memberUid = snapshot.docs[0].id;
      } else {
        // Fallback: search by name without spaces
        const allUsers = await db.collection('users').limit(100).get();
        for (const doc of allUsers.docs) {
          const userData = doc.data();
          const name = (userData.name || '').toLowerCase().replace(/\s+/g, '');
          const email = (userData.email || '').split('@')[0].toLowerCase();
          if (name === memberUsername.toLowerCase() || email === memberUsername.toLowerCase()) {
            memberUid = doc.id;
            break;
          }
        }
      }
    } catch (error) {
      console.error('Error resolving username:', error);
    }
  }
  
  if (!memberUid) { window.location.href = 'dashboard.html'; return; }
  if (memberUid === viewer.uid) { window.location.href = 'profile.html'; return; }

  if (typeof initNotifications === 'function') initNotifications(viewer.uid);
  if (typeof initDmBadge === 'function') initDmBadge(viewer.uid);

  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.style.display = 'flex';

  try {
    const [memberSnap, viewerSnap] = await Promise.all([
      db.collection('users').doc(memberUid).get(),
      db.collection('users').doc(viewer.uid).get(),
    ]);

    if (!memberSnap.exists) {
      document.getElementById('memberName').textContent = 'Member not found';
      document.getElementById('memberPageTitle').textContent = 'Member not found';
      return;
    }

    const member = memberSnap.data();
    const viewerData = viewerSnap.exists ? viewerSnap.data() : {};
    const name = member.name || 'Member';

    document.title = name + ' - SBD Network';
    document.getElementById('memberName').textContent = name;
    document.getElementById('memberPageTitle').textContent = name;

    renderMemberAvatar(name, member.photoUrl || null);

    const memberGroups = member.groups || [];
    const viewerGroups = viewerData.groups || [];
    const commonGroupIds = memberGroups.filter(g => viewerGroups.includes(g));

    if (commonGroupIds.length) {
      const sharedSection = document.getElementById('sharedGroupsSection');
      if (sharedSection) sharedSection.style.display = '';
      const list = document.getElementById('sharedGroupsList');
      if (list) {
        const CHUNK = 10;
        const chunks = [];
        for (let i = 0; i < commonGroupIds.length; i += CHUNK) {
          chunks.push(commonGroupIds.slice(i, i + CHUNK));
        }
        const groupSnaps = await Promise.all(
          chunks.map(c =>
            db.collection('groups')
              .where(firebase.firestore.FieldPath.documentId(), 'in', c)
              .get()
          )
        );
        const groupDocs = groupSnaps.flatMap(s => s.docs);
        list.innerHTML = groupDocs.map(d =>
          `<a class="profile-group-chip" href="/group.html?id=${esc(d.id)}">${esc(d.data().title || d.id)}</a>`
        ).join('');
      }
    }

    await loadMemberCollections(memberUid);

    const dmBtn = document.getElementById('dmMemberBtn');
    if (dmBtn) {
      dmBtn.addEventListener('click', () => {
        window.location.href = `dm.html?uid=${encodeURIComponent(memberUid)}`;
      });
    }

    await loadMemberPosts(memberUid, commonGroupIds);
  } catch (err) {
    console.error('Member profile error:', err);
    const nameEl = document.getElementById('memberName');
    if (nameEl) nameEl.textContent = 'Error loading profile';
  } finally {
    if (overlay) overlay.style.display = 'none';
  }
});

async function loadMemberCollections(uid) {
  // Collections are stored in R2 (private per-user) — not readable from another user's context.
  // Hide the section on public member profiles.
  const section = document.getElementById('memberCollectionsSection');
  if (section) section.style.display = 'none';
}

async function loadMemberPosts(uid, commonGroupIds) {
  const grid = document.getElementById('memberPostsGrid');
  const noPosts = document.getElementById('memberNoPosts');
  if (!grid) return;

  try {
    let boardIds = [];

    if (commonGroupIds.length) {
      const CHUNK = 10;
      const bChunks = [];
      for (let i = 0; i < commonGroupIds.length; i += CHUNK) {
        bChunks.push(commonGroupIds.slice(i, i + CHUNK));
      }
      const boardSnaps = await Promise.all(
        bChunks.map(c => db.collection('boards').where('groupId', 'in', c).get())
      );
      boardIds = boardSnaps.flatMap(s => s.docs).map(d => d.id);
    }

    if (!boardIds.length) {
      grid.innerHTML = '';
      if (noPosts) { noPosts.style.display = 'block'; noPosts.textContent = 'No shared boards to show posts from.'; }
      return;
    }

    const CHUNK = 30;
    const pChunks = [];
    for (let i = 0; i < boardIds.length; i += CHUNK) {
      pChunks.push(boardIds.slice(i, i + CHUNK));
    }

    const postSnaps = await Promise.all(
      pChunks.map(c =>
        db.collection('posts')
          .where('authorId', '==', uid)
          .where('boardId', 'in', c)
          .orderBy('timestamp', 'desc')
          .limit(30)
          .get()
      )
    );

    const posts = postSnaps.flatMap(s => s.docs).map(d => ({ id: d.id, ...d.data() }));
    posts.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    const top = posts.slice(0, 30);

    const countEl = document.getElementById('memberPostCount');
    if (countEl) {
      countEl.textContent = `${posts.length} post${posts.length !== 1 ? 's' : ''}`;
    }

    grid.innerHTML = '';

    if (!top.length) {
      if (noPosts) { noPosts.style.display = 'block'; noPosts.textContent = 'No posts yet.'; }
      return;
    }

    top.forEach(post => {
      const cell = document.createElement('a');
      cell.className = 'member-post-cell';
      cell.href = `board.html?boardId=${encodeURIComponent(post.boardId)}&post=${encodeURIComponent(post.id)}`;

      const thumb = post.imageUrl
        || (Array.isArray(post.allPhotos) && post.allPhotos[0])
        || post.thumbUrl
        || null;
      const isVideo = !!(post.videoUrl || post.localVideo || (Array.isArray(post.allVideos) && post.allVideos.length));

      if (thumb) {
        cell.innerHTML = `<img src="${esc(thumb)}" alt="" loading="lazy">${isVideo ? '<div class="member-post-play">▶</div>' : ''}`;
      } else if (post.content && post.content.trim()) {
        cell.innerHTML = `<div class="member-post-text-cell">${esc(post.content.slice(0, 80))}</div>`;
      } else {
        cell.innerHTML = `<div class="member-post-text-cell" style="font-size:2rem;">📎</div>`;
      }

      grid.appendChild(cell);
    });
  } catch (err) {
    console.error('loadMemberPosts error:', err);
    grid.innerHTML = '';
    if (noPosts) { noPosts.style.display = 'block'; noPosts.textContent = 'Could not load posts.'; }
  }
}

document.getElementById('backBtn')?.addEventListener('click', () => history.back());
