// ================================================================
// DASHBOARD LOGIC
// ================================================================

let currentUserData = null;

// DOM Elements
const userNameDisplay = document.getElementById('userNameDisplay');
const logoutBtn = document.getElementById('logoutBtn');
const adminPanelBtn = document.getElementById('adminPanelBtn');
const loadingOverlay = document.getElementById('loadingOverlay');

// Continue Journey Elements
const continueJourneyCard = document.getElementById('continueJourneyCard');

// Identity Status Elements
const teleiosLevel = document.getElementById('teleiosLevel');
const streakValue = document.getElementById('streakValue');
const completionPercent = document.getElementById('completionPercent');
const completionRingCircle = document.getElementById('completionRingCircle');

// This Week's Work Elements
const weekWorkContainer = document.getElementById('weekWorkContainer');

// Active Discussions Elements
const discussionsContainer = document.getElementById('discussionsContainer');

// Next Action Elements
const nextActionButton = document.getElementById('nextActionButton');
const nextActionText = document.getElementById('nextActionText');
const noProgressMessage = document.getElementById('noProgressMessage');

// Retry helper function for Firestore queries
async function retryFirestoreQuery(queryFn, maxRetries = 3, timeoutMs = 8000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Race between query and timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
      );
      const result = await Promise.race([queryFn(), timeoutPromise]);
      return result;
    } catch (error) {
      console.warn(`Query attempt ${attempt} failed:`, error.message);
      if (attempt === maxRetries) throw error;
      // Exponential backoff: 500ms, 1000ms, 2000ms
      await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt - 1)));
    }
  }
}

// Initialize dashboard
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  
  try {
    showLoading(true);

    // Check network connectivity
    if (!navigator.onLine) {
      throw new Error('No internet connection. Please check your network and try again.');
    }

    try { if (typeof initNotifications === 'function') initNotifications(user.uid); } catch (_) {}
    try { if (typeof initDmBadge === 'function') initDmBadge(user.uid); } catch (_) {}
    
    // Load user data with retry logic
    const userDoc = await retryFirestoreQuery(() => 
      db.collection('users').doc(user.uid).get()
    );
    
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
      
      // Show admin button if user is admin
      if (currentUserData.role === 'admin' && adminPanelBtn) {
        adminPanelBtn.style.display = 'block';
      }
      
      // Load all dashboard sections (don't block on individual errors)
      await Promise.allSettled([
        loadContinueJourney(user.uid).catch(e => console.error('Continue Journey failed:', e)),
        loadIdentityStatus(user.uid).catch(e => console.error('Identity Status failed:', e)),
        loadThisWeeksWork(user.uid).catch(e => console.error('Week Work failed:', e)),
        loadActiveDiscussions(user.uid).catch(e => console.error('Discussions failed:', e))
      ]);
      
      // Setup next action CTA
      setupNextAction();

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
    
    // If permission denied on initial load, might be auth timing - retry once
    if (error.code === 'permission-denied' && !window._dashboardRetried) {
      console.log('Permission denied on first load, retrying in 1s...');
      window._dashboardRetried = true;
      showLoading(false);
      setTimeout(() => window.location.reload(), 1000);
      return;
    }
    
    // Show more specific error messages
    let errorMessage = 'Error loading dashboard. ';
    if (error.message.includes('No internet connection')) {
      errorMessage += 'Please check your internet connection and try again.';
    } else if (error.message.includes('timeout') || error.message.includes('Query timeout')) {
      errorMessage += 'Your connection is slow. Please refresh the page or try again later.';
    } else if (error.code === 'permission-denied') {
      errorMessage += 'Authentication issue. Please log out and log back in.';
    } else {
      errorMessage += 'Please refresh the page. If the problem persists, contact support.';
    }
    
    alert(errorMessage);
  } finally {
    showLoading(false);
  }
});

// ================================================================
// 🔥 SECTION 1: CONTINUE JOURNEY
// ================================================================

async function loadContinueJourney(uid) {
  try {
    if (!continueJourneyCard) {
      console.warn('continueJourneyCard element not found');
      return;
    }
    
    // Get user progress data
    const progress = currentUserData.progress || {};
    const currentCourseId = progress.currentCourseId;
    const currentModuleId = progress.currentModuleId;
    const lastActivity = progress.lastActivity;
    
    if (!currentCourseId) {
      // No active course - show empty state
      continueJourneyCard.innerHTML = `
        <div class="empty-state-inline" style="text-align:center;padding:40px 20px;">
          <div style="font-size:3rem;margin-bottom:16px;">🎓</div>
          <h3 style="margin-bottom:12px;color:var(--text-primary);">Start Your Formation Journey</h3>
          <p style="color:var(--text-secondary);margin-bottom:24px;">Choose a school to begin your transformation</p>
          <a href="/schools.html" class="btn btn-primary">Explore Schools</a>
        </div>
      `;
      return;
    }
    
    // Fetch current course
    const courseDoc = await db.collection('courses').doc(currentCourseId).get();
    if (!courseDoc.exists) {
      throw new Error('Course not found');
    }
    
    const course = courseDoc.data();
    let moduleName = 'Course Overview';
    
    // Fetch current module if available
    if (currentModuleId) {
      const moduleDoc = await db.collection('modules').doc(currentModuleId).get();
      if (moduleDoc.exists) {
        moduleName = moduleDoc.data().title || moduleName;
      }
    }
    
    // Calculate progress percentage
    const completedModules = progress.completedModules || [];
    const totalModules = course.moduleCount || 1;
    const progressPercent = Math.round((completedModules.length / totalModules) * 100);
    
    // Format last activity time
    const lastActivityText = lastActivity 
      ? formatTimestamp(lastActivity) 
      : 'Not started';
    
    // Render journey card
    continueJourneyCard.innerHTML = `
      <div class="journey-content">
        <div class="progress-ring-small">
          <svg width="60" height="60">
            <circle class="progress-ring-bg" cx="30" cy="30" r="26" />
            <circle class="progress-ring-progress" cx="30" cy="30" r="26" 
              style="stroke-dasharray: ${163.36 * (progressPercent / 100)}, 163.36;" />
          </svg>
          <div class="progress-text-small">${progressPercent}%</div>
        </div>
        
        <div class="journey-details">
          <h4 class="journey-course-title">${escapeHtml(course.title)}</h4>
          <p class="journey-module-name">${escapeHtml(moduleName)}</p>
          <p class="journey-timestamp">Last activity: ${lastActivityText}</p>
        </div>
        
        <button class="btn-continue" onclick="window.location.href='/module.html?id=${currentModuleId || ''}'">
    if (continueJourneyCard) {
      continueJourneyCard.innerHTML = `
        <div class="empty-state-inline" style="text-align:center;padding:40px 20px;">
          <div style="font-size:3rem;margin-bottom:16px;">🎓</div>
          <p style="color:var(--text-secondary);margin-bottom:24px;">Start a course to track your progress</p>
          <a href="/schools.html" class="btn btn-primary">Explore Schools</a>
        </div>
      `;
    }tch (error) {
    console.error('Error loading Continue Journey:', error);
    continueJourneyCard.innerHTML = `
      <div class="error-state">
        <p>⚠️ Could not load your current course</p>
        <a href="/schools.html" class="btn btn-link">Browse Schools</a>
      </div>
    `;
  }
}

// ================================================================
// 🧠 SECTION 2: IDENTITY STATUS
// ================================================================

async function loadIdentityStatus(uid) {
  try {
    const progress = currentUserData.progress || {};
    const completedModules = progress.completedModules || [];
    const streak = progress.streak || 0;
    
    // Calculate Teleios Level (based on completed modules)
    let level = 'Beginner';
    if (completedModules.length >= 30) level = 'Master';
    else if (completedModules.length >= 20) level = 'Advanced';
    else if (completedModules.length >= 10) level = 'Intermediate';
    else if (completedModules.length >= 5) level = 'Apprentice';
    
    // Update Teleios Level
    if (teleiosLevel) {
      teleiosLevel.textContent = level;
    }
    
    // Update Streak
    if (streakValue) {
      streakValue.textContent = `${streak} ${streak === 1 ? 'day' : 'days'}`;
    }
    
    // Calculate overall completion percentage (all courses)
    const ownedCourses = currentUserData.ownedCourses || [];
    const totalOwnedModules = ownedCourses.length * 10; // Estimate 10 modules per course
    const overallPercent = totalOwnedModules > 0 
      ? Math.round((completedModules.length / totalOwnedModules) * 100)
      : 0;
    
    // Update Progress Ring
    if (completionPercent) {
      completionPercent.textContent = `${overallPercent}%`;
    }
    
    if (completionRingCircle) {
      const circumference = 2 * Math.PI * 34; // r=34
      const offset = circumference - (circumference * overallPercent) / 100;
      completionRingCircle.style.strokeDasharray = `${circumference}`;
      completionRingCircle.style.strokeDashoffset = `${offset}`;
    }
    
  } catch (error) {
    console.error('Error loading Identity Status:', error);
    if (teleiosLevel) teleiosLevel.textContent = 'N/A';
    if (streakValue) streakValue.textContent = '0 days';
    if (!weekWorkContainer) {
      console.warn('weekWorkContainer element not found');
      return;
    }
    
    const progress = currentUserData.progress || {};
    const currentModuleId = progress.currentModuleId;
    
    if (!currentModuleId) {
      weekWorkContainer.innerHTML = `
        <div class="empty-state-inline" style="text-align:center;padding:40px 20px;">
          <div style="font-size:3rem;margin-bottom:16px;">📚</div>
          <p style="color:var(--text-secondary);">Enroll in a course to see your weekly work</p
async function loadThisWeeksWork(uid) {
  try {
    const progress = currentUserData.progress || {};
    const currentModuleId = progress.currentModuleId;
    
    if (!currentModuleId) {
      weekWorkContainer.innerHTML = `
        <div class="empty-state-inline">
          <p>No active module. Start a course to see this week's work.</p>
          <a href="/schools.html" class="btn btn-primary">Browse Schools</a>
        </div>
      `;
      return;
    }
    
    // Fetch current module
    const moduleDoc = await db.collection('modules').doc(currentModuleId).get();
    if (!moduleDoc.exists) {
      throw new Error('Module not found');
    }
    
    const module = moduleDoc.data();
    const linkedBoardId = module.linkedBoardId;
    
    // Fetch linked board if exists
    let boardTitle = 'No discussion board';
    let boardLink = '#';
    
    if (linkedBoardId) {
      const boardDoc = await db.collection('boards').doc(linkedBoardId).get();
      if (boardDoc.exists) {
        boardTitle = boardDoc.data().title || 'Discussion Board';
        boardLink = `/board.html?id=${linkedBoardId}`;
      }
    }
    
    // Render week's work
    weekWorkContainer.innerHTML = `
      <div class="week-work-card">
        <h4 class="week-module-title">${escapeHtml(module.title)}</h4>
        <p class="week-module-description">${escapeHtml(module.description || 'Continue your formation journey')}</p>
        
    if (weekWorkContainer) {
      weekWorkContainer.innerHTML = `
        <div class="empty-state-inline" style="text-align:center;padding:40px 20px;">
          <div style="font-size:3rem;margin-bottom:16px;">📚</div>
          <p style="color:var(--text-secondary);">Enroll in a course to see your weekly work</p>
        </div>
      `;
    }    ${linkedBoardId ? `
            <a href="${boardLink}" class="btn btn-outline">
              💬 ${escapeHtml(boardTitle)}
            </a>
          ` : ''}
        </div>
      </div>
    if (!discussionsContainer) {
      console.warn('discussionsContainer element not found');
      return;
    }
    
    // Fetch all boards that are course-linked (have linkedCourseId)
    const boardsQuery = await db.collection('boards')
      .where('linkedCourseId', '!=', null)
      .orderBy('linkedCourseId')
      .orderBy('createdAt', 'desc')
      .limit(3)
      .get();
    
    if (boardsQuery.empty) {
      discussionsContainer.innerHTML = `
        <div class="empty-state-inline" style="text-align:center;padding:40px 20px;">
          <div style="font-size:3rem;margin-bottom:16px;">💬</div>
          <p style="color:var(--text-secondary);">Join a course to participate in discussions
// ================================================================
// 💬 SECTION 4: ACTIVE DISCUSSIONS (Course-linked boards only)
// ================================================================

async function loadActiveDiscussions(uid) {
  try {
    // Fetch all boards that are course-linked (have linkedCourseId)
    const boardsQuery = await db.collection('boards')
      .where('linkedCourseId', '!=', null)
      .orderBy('linkedCourseId')
      .orderBy('createdAt', 'desc')
      .limit(3)
      .get();
    
    if (boardsQuery.empty) {
      discussionsContainer.innerHTML = `
        <div class="empty-state-inline">
          <p>No course discussions yet. Start a course to join discussions.</p>
        </div>
      `;
      return;
    }
    
    // Render discussion previews
    discussionsContainer.innerHTML = '';
    
    for (const doc of boardsQuery.docs) {
      const board = doc.data();
      
      // Get last comment count
      const commentsSnapshot = await db.collection('boards').doc(doc.id)
        .collection('comments')
        .orderBy('createdAt', 'desc')
        .limit(1)
    if (discussionsContainer) {
      discussionsContainer.innerHTML = `
        <div class="empty-state-inline" style="text-align:center;padding:40px 20px;">
          <div style="font-size:3rem;margin-bottom:16px;">💬</div>
          <p style="color:var(--text-secondary);">Course discussions will appear here</p>
        </div>
      `;
    }  : commentsSnapshot.docs[0].data().createdAt;
      
      const discussionCard = document.createElement('div');
      discussionCard.className = 'discussion-card';
      discussionCard.onclick = () => window.location.href = `/board.html?id=${doc.id}`;
      
      discussionCard.innerHTML = `
        <div class="discussion-icon">💬</div>
        <div class="discussion-content">
          <h5 class="discussion-title">${escapeHtml(board.title)}</h5>
          <p class="discussion-meta">Last activity: ${formatTimestamp(lastActivity)}</p>
        </div>
        <span class="discussion-arrow">→</span>
      `;
      
      discussionsContainer.appendChild(discussionCard);
    }
    
  } catch (error) {
    console.error('Error loading Active Discussions:', error);
    discussionsContainer.innerHTML = `
      <div class="error-state">
        <p>⚠️ Could not load discussions</p>
      </div>
    `;
  }
}

// ================================================================
// 🎯 SECTION 5: NEXT ACTION (Single CTA)
// ================================================================

function setupNextAction() {
  const progress = currentUserData.progress || {};
  const currentCourseId = progress.currentCourseId;
  const currentModuleId = progress.currentModuleId;
  
  if (!currentCourseId || !currentModuleId) {
    // No active progress - show empty state
    if (noProgressMessage) noProgressMessage.style.display = 'block';
    if (nextActionButton) nextActionButton.style.display = 'none';
    return;
  }
  
  // Show next action button
  if (noProgressMessage) noProgressMessage.style.display = 'none';
  if (nextActionButton) {
    nextActionButton.style.display = 'flex';
    nextActionButton.onclick = () => window.location.href = `/module.html?id=${currentModuleId}`;
  }
  
  // Set button text dynamically
  if (nextActionText) {
    // Try to get course/module name for better CTA
    db.collection('modules').doc(currentModuleId).get()
      .then(doc => {
        if (doc.exists) {
          const moduleName = doc.data().title || 'Continue Learning';
          nextActionText.textContent = `Continue: ${moduleName}`;
        } else {
          nextActionText.textContent = 'Continue Learning →';
        }
      })
      .catch(() => {
        nextActionText.textContent = 'Continue Learning →';
      });
  }
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

// Network connectivity monitoring
window.addEventListener('online', () => {
  console.log('Connection restored');
  // Auto-reload if user was stuck on error
  if (loadingOverlay && loadingOverlay.style.display === 'none') {
    window.location.reload();
  }
});

window.addEventListener('offline', () => {
  console.warn('Connection lost');
  if (loadingOverlay) showLoading(false);
  alert('You are offline. Please check your internet connection.');
});
