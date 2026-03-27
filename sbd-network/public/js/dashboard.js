// ================================================================
// DASHBOARD LOGIC
// ================================================================

let currentUserData = null;

// DOM Elements
const userNameDisplay = document.getElementById('userNameDisplay');
const welcomeTitle = document.getElementById('welcomeTitle');
const logoutBtn = document.getElementById('logoutBtn');
const adminPanelBtn = document.getElementById('adminPanelBtn');
const myGroupsContainer = document.getElementById('myGroupsContainer');
const noGroupsMessage = document.getElementById('noGroupsMessage');
const loadingOverlay = document.getElementById('loadingOverlay');

// Initialize dashboard
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  
  try {
    showLoading(true);

    try { if (typeof initNotifications === 'function') initNotifications(user.uid); } catch (_) {}
    try { if (typeof initDmBadge === 'function') initDmBadge(user.uid); } catch (_) {}
    
    // Load user data
    const userDoc = await db.collection('users').doc(user.uid).get();
    
    if (userDoc.exists) {
      currentUserData = userDoc.data();

      // Block suspended users
      if (currentUserData.disabled) {
        await auth.signOut();
        alert('Your account has been suspended. Please contact an administrator.');
        window.location.href = 'index.html';
        return;
      }
      
      // Update UI with user info
      const displayName = currentUserData.name || user.displayName || user.email;
      if (userNameDisplay) userNameDisplay.textContent = displayName;
      if (welcomeTitle) welcomeTitle.textContent = `Welcome back, ${displayName.split(' ')[0]}!`;
      
      // Show admin button if user is admin
      if (currentUserData.role === 'admin' && adminPanelBtn) {
        adminPanelBtn.style.display = 'block';
      }
      
      // Load user's groups (don't block on errors)
      try {
        await loadUserGroups();
      } catch (error) {
        console.error('Error loading groups:', error);
        noGroupsMessage.style.display = 'block';
      }

      // Show "What's New" sheet if this is the first load after an upgrade
      checkForVersionUpdate(user.uid);

      // Re-open a specific version sheet if navigating back from a notification tap
      const reopenVersion = localStorage.getItem('sbd-reopen-version');
      if (reopenVersion) {
        localStorage.removeItem('sbd-reopen-version');
        fetch('/changelog.json?_=' + Date.now())
          .then(r => r.json())
          .then(log => {
            const entry = (log.versions || []).find(v => String(v.version) === String(reopenVersion));
            if (entry) showWhatsNew(entry);
          }).catch(() => {});
      }
    }
    
  } catch (error) {
    console.error('Error loading dashboard:', error);
    alert('Error loading dashboard. Please refresh the page.');
  } finally {
    showLoading(false);
  }
});

// Load user's groups
async function loadUserGroups() {
  if (!currentUserData || !currentUserData.groups || currentUserData.groups.length === 0) {
    myGroupsContainer.innerHTML = '';
    noGroupsMessage.style.display = 'block';
    return;
  }
  
  try {
    noGroupsMessage.style.display = 'none';
    // skeleton cards already pre-rendered in HTML — no loading text needed

    // Fetch all groups the user belongs to
    const groupPromises = currentUserData.groups.map(groupId => 
      db.collection('groups').doc(groupId).get()
    );
    
    const groupDocs = await Promise.all(groupPromises);
    
    // Clear loading message
    myGroupsContainer.innerHTML = '';
    
    // Render groups
    groupDocs.forEach(doc => {
      if (doc.exists) {
        const group = doc.data();
        const groupCard = createGroupCard(doc.id, group);
        myGroupsContainer.appendChild(groupCard);
      }
    });
    
    if (myGroupsContainer.children.length === 0) {
      noGroupsMessage.style.display = 'block';
    }
    
  } catch (error) {
    console.error('Error loading groups:', error);
    myGroupsContainer.innerHTML = '<div class="error-text">Error loading groups</div>';
  }
}

// Create group card element
function createGroupCard(groupId, group) {
  const card = document.createElement('div');
  card.className = 'group-card';
  card.onclick = () => window.location.href = `group.html?id=${groupId}`;
  
  card.innerHTML = `
    <div class="group-icon">${group.title.charAt(0)}</div>
    <h4 class="group-title">${escapeHtml(group.title)}</h4>
    <p class="group-description">${escapeHtml(group.description || 'No description')}</p>
    <div class="group-footer">
      <span class="group-meta">Tap to explore</span>
    </div>
  `;
  
  return card;
}

// Logout handler
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await auth.signOut();
      window.location.href = 'index.html';
    } catch (error) {
      console.error('Logout error:', error);
      alert('Error logging out. Please try again.');
    }
  });
}

// Admin panel button
if (adminPanelBtn) {
  adminPanelBtn.addEventListener('click', () => {
    window.location.href = 'admin.html';
  });
}

// Helper: Show loading overlay
function showLoading(show) {
  if (loadingOverlay) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
  }
}

// Helper: Format timestamp
function formatTimestamp(timestamp) {
  if (!timestamp) return 'Just now';
  
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString();
}

// Helper: Escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── Version / What's New ──────────────────────────────────────────

async function checkForVersionUpdate(uid) {
  try {
    const res = await fetch('/changelog.json?_=' + Date.now());
    if (!res.ok) return;
    const log = await res.json();
    const current = String(log.current || '');
    const seen = localStorage.getItem('sbd-seen-version');
    if (!current || current === seen) return;

    const entry = (log.versions || []).find(v => String(v.version) === current);
    if (!entry) return;

    // Show the bottom sheet
    showWhatsNew(entry);

    // Write a Firestore notification for this user (fire-and-forget)
    db.collection('notifications').add({
      type: 'announcement',
      title: `${entry.emoji || '🚀'} v${current} — ${entry.title}`,
      body: (entry.changes || []).map(c => c.replace(/^[^\w\s]+\s*/, '')).join(' · '),
      userId: uid,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      read: false,
    }).catch(() => {});

    // Mark this version as seen
    localStorage.setItem('sbd-seen-version', current);
  } catch (err) {
    console.warn('checkForVersionUpdate:', err);
  }
}

function showWhatsNew(entry) {
  const modal   = document.getElementById('whatsNewModal');
  const titleEl = document.getElementById('whatsNewTitle');
  const emojiEl = document.getElementById('whatsNewEmoji');
  const list    = document.getElementById('whatsNewList');
  const closeBtn = document.getElementById('whatsNewClose');
  const doneBtn  = document.getElementById('whatsNewDone');
  if (!modal) return;

  emojiEl.textContent = entry.emoji || '🚀';
  titleEl.textContent = `v${entry.version} — ${entry.title}`;

  list.innerHTML = (entry.changes || []).map(c => {
    // Extract the leading emoji (if any) and the rest of the text
    const match = c.match(/^([\p{Emoji}\p{Emoji_Presentation}]+)\s*(.*)/u);
    const icon = match ? match[1] : '✦';
    const text = match ? match[2] : c;
    return `<li style="display:flex;gap:12px;align-items:flex-start;">
      <span style="flex-shrink:0;font-size:1.1rem;line-height:1.4;">${escapeHtml(icon)}</span>
      <span style="font-size:0.9rem;color:var(--text-secondary);line-height:1.5;">${escapeHtml(text)}</span>
    </li>`;
  }).join('');

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  const close = () => {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  };

  closeBtn.onclick = close;
  doneBtn.onclick  = close;
  modal.addEventListener('click', e => { if (e.target === modal) close(); }, { once: true });
}

console.log('Dashboard module loaded');

// Pull-to-refresh (mobile)
if (typeof initPTR === 'function') {
  initPTR(function () { window.location.reload(); });
}
