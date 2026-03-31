// ================================================================
// SEARCH PAGE
// ================================================================

let searchCurrentUser = null;
let currentTab = 'all';
let searchQuery = '';
let boardFilter = '';
let authorFilter = '';
let dateFilter = '';
let searchTimeout = null;
let allBoards = [];

// DOM Elements
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const searchResults = document.getElementById('searchResults');
const resultsCounter = document.getElementById('resultsCounter');
const resultsCount = document.getElementById('resultsCount');
const noResults = document.getElementById('noResults');
const loadingOverlay = document.getElementById('loadingOverlay');
const searchPlaceholder = document.querySelector('.search-placeholder');

// Filter elements
const toggleFiltersBtn = document.getElementById('toggleFiltersBtn');
const searchFilters = document.querySelector('.search-filters');
const boardFilterSelect = document.getElementById('boardFilter');
const authorFilterInput = document.getElementById('authorFilter');
const dateFilterSelect = document.getElementById('dateFilter');

// Tab elements
const searchTabs = document.querySelectorAll('.search-tab');

// Helper function to escape HTML
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Helper function to linkify mentions and hashtags
function linkifyContent(text) {
  if (!text) return '';
  let result = esc(text);
  // Linkify @mentions
  result = result.replace(/@(\w+)/g, '<a href="/member.html?username=$1" class="mention-link">@$1</a>');
  // Linkify #hashtags
  result = result.replace(/#(\w+)/g, '<a href="/search.html?q=%23$1" class="hashtag-link">#$1</a>');
  return result;
}

// Format timestamp
function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) return date.toLocaleDateString();
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

// Get date filter range
function getDateRange() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (dateFilter) {
    case 'today':
      return { start: firebase.firestore.Timestamp.fromDate(today) };
    case 'week':
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { start: firebase.firestore.Timestamp.fromDate(weekAgo) };
    case 'month':
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return { start: firebase.firestore.Timestamp.fromDate(monthAgo) };
    case 'year':
      const yearAgo = new Date(today);
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      return { start: firebase.firestore.Timestamp.fromDate(yearAgo) };
    default:
      return null;
  }
}

// Search posts
async function searchPosts() {
  const results = [];
  let query = db.collection('posts');

  // Apply filters
  if (boardFilter) {
    query = query.where('boardId', '==', boardFilter);
  }

  if (dateFilter) {
    const dateRange = getDateRange();
    if (dateRange) {
      query = query.where('timestamp', '>=', dateRange.start);
    }
  }

  // Order by timestamp (most recent first)
  query = query.orderBy('timestamp', 'desc').limit(50);

  try {
    const snapshot = await query.get();
    
    snapshot.forEach(doc => {
      const post = { id: doc.id, ...doc.data() };
      
      // Client-side text filtering
      if (searchQuery) {
        const queryLower = searchQuery.toLowerCase();
        const content = (post.content || '').toLowerCase();
        const authorName = (post.authorName || '').toLowerCase();
        
        // Check if query matches content, author, or hashtags
        const matchesContent = content.includes(queryLower);
        const matchesAuthor = authorName.includes(queryLower);
        const matchesHashtag = searchQuery.startsWith('#') && 
                              (post.hashtags || []).some(tag => tag.toLowerCase() === queryLower.slice(1));
        
        if (!matchesContent && !matchesAuthor && !matchesHashtag) {
          return;
        }
      }

      // Author filter
      if (authorFilter) {
        const authorLower = authorFilter.toLowerCase();
        const postAuthor = (post.authorName || '').toLowerCase();
        if (!postAuthor.includes(authorLower)) {
          return;
        }
      }

      results.push(post);
    });

    return results;
  } catch (error) {
    console.error('Error searching posts:', error);
    return [];
  }
}

// Search comments
async function searchComments() {
  const results = [];
  let query = db.collection('comments');

  if (dateFilter) {
    const dateRange = getDateRange();
    if (dateRange) {
      query = query.where('timestamp', '>=', dateRange.start);
    }
  }

  query = query.orderBy('timestamp', 'desc').limit(50);

  try {
    const snapshot = await query.get();
    const postIds = new Set();

    snapshot.forEach(doc => {
      const comment = { id: doc.id, ...doc.data() };
      
      // Client-side filtering
      if (searchQuery) {
        const queryLower = searchQuery.toLowerCase();
        const text = (comment.text || '').toLowerCase();
        const authorName = (comment.authorName || '').toLowerCase();
        
        const matchesText = text.includes(queryLower);
        const matchesAuthor = authorName.includes(queryLower);
        const matchesHashtag = searchQuery.startsWith('#') && 
                              (comment.hashtags || []).some(tag => tag.toLowerCase() === queryLower.slice(1));
        
        if (!matchesText && !matchesAuthor && !matchesHashtag) {
          return;
        }
      }

      if (authorFilter) {
        const authorLower = authorFilter.toLowerCase();
        const commentAuthor = (comment.authorName || '').toLowerCase();
        if (!commentAuthor.includes(authorLower)) {
          return;
        }
      }

      results.push(comment);
      postIds.add(comment.postId);
    });

    // Fetch post info for board filtering
    if (boardFilter && postIds.size > 0) {
      const posts = await Promise.all(
        Array.from(postIds).map(id => db.collection('posts').doc(id).get())
      );
      const validPostIds = new Set();
      posts.forEach(doc => {
        if (doc.exists && doc.data().boardId === boardFilter) {
          validPostIds.add(doc.id);
        }
      });
      return results.filter(c => validPostIds.has(c.postId));
    }

    return results;
  } catch (error) {
    console.error('Error searching comments:', error);
    return [];
  }
}

// Search hashtags
async function searchHashtags() {
  if (!searchQuery.startsWith('#')) return [];
  
  const tag = searchQuery.slice(1).toLowerCase();
  const results = new Map(); // Use map to count occurrences

  try {
    // Search posts
    const postsSnapshot = await db.collection('posts')
      .where('hashtags', 'array-contains', tag)
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    postsSnapshot.forEach(doc => {
      const post = doc.data();
      (post.hashtags || []).forEach(hashtag => {
        if (hashtag.toLowerCase().includes(tag)) {
          const count = results.get(hashtag) || 0;
          results.set(hashtag, count + 1);
        }
      });
    });

    // Search comments
    const commentsSnapshot = await db.collection('comments')
      .where('hashtags', 'array-contains', tag)
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    commentsSnapshot.forEach(doc => {
      const comment = doc.data();
      (comment.hashtags || []).forEach(hashtag => {
        if (hashtag.toLowerCase().includes(tag)) {
          const count = results.get(hashtag) || 0;
          results.set(hashtag, count + 1);
        }
      });
    });

    // Convert to array and sort by count
    return Array.from(results.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error('Error searching hashtags:', error);
    return [];
  }
}

// Search users
async function searchUsers() {
  if (!searchQuery) return [];
  
  const queryLower = searchQuery.replace('@', '').toLowerCase();
  const results = [];

  try {
    const snapshot = await db.collection('users').limit(100).get();
    
    snapshot.forEach(doc => {
      const user = { id: doc.id, ...doc.data() };
      const name = (user.name || '').toLowerCase();
      const username = user.username || 
                      name.replace(/\s+/g, '') ||
                      (user.email || '').split('@')[0].toLowerCase();
      
      if (name.includes(queryLower) || username.toLowerCase().includes(queryLower)) {
        results.push({ ...user, username });
      }
    });

    return results.slice(0, 20);
  } catch (error) {
    console.error('Error searching users:', error);
    return [];
  }
}

// Render search results
function renderResults(posts, comments, hashtags, users) {
  searchResults.innerHTML = '';
  let totalResults = 0;

  // Show posts
  if ((currentTab === 'all' || currentTab === 'posts') && posts.length > 0) {
    const postsSection = document.createElement('div');
    postsSection.className = 'result-section';
    postsSection.innerHTML = `<h3 class="result-section-title">Posts (${posts.length})</h3>`;
    
    posts.forEach(post => {
      const resultCard = document.createElement('div');
      resultCard.className = 'result-card';
      resultCard.innerHTML = `
        <div class="result-meta">
          <span class="result-author">${esc(post.authorName || 'Anonymous')}</span>
          <span class="result-date">${formatDate(post.timestamp)}</span>
        </div>
        <div class="result-content">${linkifyContent(post.content || 'No content')}</div>
        ${post.imageUrl ? `<div class="result-media"><img src="${esc(post.imageUrl)}" alt="Post image"></div>` : ''}
        <div class="result-actions">
          <a href="/board.html?id=${esc(post.boardId)}&post=${esc(post.id)}" class="result-link">View post →</a>
        </div>
      `;
      postsSection.appendChild(resultCard);
    });
    
    searchResults.appendChild(postsSection);
    totalResults += posts.length;
  }

  // Show comments
  if ((currentTab === 'all' || currentTab === 'comments') && comments.length > 0) {
    const commentsSection = document.createElement('div');
    commentsSection.className = 'result-section';
    commentsSection.innerHTML = `<h3 class="result-section-title">Comments (${comments.length})</h3>`;
    
    comments.forEach(comment => {
      const resultCard = document.createElement('div');
      resultCard.className = 'result-card';
      resultCard.innerHTML = `
        <div class="result-meta">
          <span class="result-author">${esc(comment.authorName || 'Anonymous')}</span>
          <span class="result-date">${formatDate(comment.timestamp)}</span>
        </div>
        <div class="result-content">${linkifyContent(comment.text || 'No content')}</div>
        <div class="result-actions">
          <a href="/board.html?post=${esc(comment.postId)}&comment=${esc(comment.id)}" class="result-link">View comment →</a>
        </div>
      `;
      commentsSection.appendChild(resultCard);
    });
    
    searchResults.appendChild(commentsSection);
    totalResults += comments.length;
  }

  // Show hashtags
  if ((currentTab === 'all' || currentTab === 'hashtags') && hashtags.length > 0) {
    const hashtagsSection = document.createElement('div');
    hashtagsSection.className = 'result-section';
    hashtagsSection.innerHTML = `<h3 class="result-section-title">Hashtags (${hashtags.length})</h3>`;
    
    hashtags.forEach(({ tag, count }) => {
      const resultCard = document.createElement('div');
      resultCard.className = 'result-card hashtag-card';
      resultCard.innerHTML = `
        <div class="hashtag-info">
          <span class="hashtag-tag">#${esc(tag)}</span>
          <span class="hashtag-count">${count} ${count === 1 ? 'post' : 'posts'}</span>
        </div>
        <a href="/search.html?q=%23${encodeURIComponent(tag)}&tab=posts" class="result-link">View posts →</a>
      `;
      hashtagsSection.appendChild(resultCard);
    });
    
    searchResults.appendChild(hashtagsSection);
    totalResults += hashtags.length;
  }

  // Show users
  if ((currentTab === 'all' || currentTab === 'users') && users.length > 0) {
    const usersSection = document.createElement('div');
    usersSection.className = 'result-section';
    usersSection.innerHTML = `<h3 class="result-section-title">Users (${users.length})</h3>`;
    
    users.forEach(user => {
      const resultCard = document.createElement('div');
      resultCard.className = 'result-card user-card';
      resultCard.innerHTML = `
        <div class="user-info">
          ${user.photoURL ? `<img src="${esc(user.photoURL)}" alt="${esc(user.name)}" class="user-avatar">` : `<div class="user-avatar-placeholder">${esc((user.name || 'U')[0].toUpperCase())}</div>`}
          <div class="user-details">
            <div class="user-name">${esc(user.name || 'Anonymous')}</div>
            <div class="user-username">@${esc(user.username)}</div>
          </div>
        </div>
        <a href="/member.html?uid=${esc(user.id)}" class="result-link">View profile →</a>
      `;
      usersSection.appendChild(resultCard);
    });
    
    searchResults.appendChild(usersSection);
    totalResults += users.length;
  }

  // Update results counter
  resultsCount.textContent = totalResults;
  resultsCounter.style.display = totalResults > 0 ? 'block' : 'none';
  noResults.style.display = totalResults === 0 && searchQuery ? 'block' : 'none';
  searchPlaceholder.style.display = !searchQuery ? 'block' : 'none';
}

// Perform search
async function performSearch() {
  if (!searchQuery && !boardFilter && !authorFilter && !dateFilter) {
    searchResults.innerHTML = '';
    searchPlaceholder.style.display = 'block';
    resultsCounter.style.display = 'none';
    noResults.style.display = 'none';
    return;
  }

  loadingOverlay.style.display = 'flex';
  searchPlaceholder.style.display = 'none';

  try {
    let posts = [];
    let comments = [];
    let hashtags = [];
    let users = [];

    if (currentTab === 'all' || currentTab === 'posts') {
      posts = await searchPosts();
    }

    if (currentTab === 'all' || currentTab === 'comments') {
      comments = await searchComments();
    }

    if (currentTab === 'all' || currentTab === 'hashtags') {
      hashtags = await searchHashtags();
    }

    if (currentTab === 'all' || currentTab === 'users') {
      users = await searchUsers();
    }

    renderResults(posts, comments, hashtags, users);
  } catch (error) {
    console.error('Search error:', error);
    alert('Search failed: ' + error.message);
  } finally {
    loadingOverlay.style.display = 'none';
  }
}

// Debounced search
function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    performSearch();
  }, 300);
}

// Load boards for filter
async function loadBoards() {
  try {
    const snapshot = await db.collection('boards').orderBy('title').get();
    boardFilterSelect.innerHTML = '<option value="">All Boards</option>';
    
    snapshot.forEach(doc => {
      const board = doc.data();
      allBoards.push({ id: doc.id, ...board });
      const option = document.createElement('option');
      option.value = doc.id;
      option.textContent = board.title || 'Untitled Board';
      boardFilterSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading boards:', error);
  }
}

// Initialize
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  searchCurrentUser = user;

  // Initialize notifications and DM badge
  if (typeof initNotifications === 'function') initNotifications(user.uid);
  if (typeof initDmBadge === 'function') initDmBadge(user.uid);

  // Load boards for filter
  await loadBoards();

  // Check for query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get('q');
  const tab = urlParams.get('tab');

  if (query) {
    searchInput.value = decodeURIComponent(query);
    searchQuery = searchInput.value;
    clearSearchBtn.style.display = 'inline-block';
  }

  if (tab) {
    currentTab = tab;
    searchTabs.forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
  }

  // Perform initial search if query exists
  if (searchQuery) {
    performSearch();
  }
});

// Event Listeners
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  clearSearchBtn.style.display = searchQuery ? 'inline-block' : 'none';
  debounceSearch();
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  clearSearchBtn.style.display = 'none';
  searchInput.focus();
  performSearch();
});

searchTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    currentTab = tab.dataset.tab;
    searchTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    performSearch();
  });
});

toggleFiltersBtn.addEventListener('click', () => {
  const isVisible = searchFilters.style.display !== 'none';
  searchFilters.style.display = isVisible ? 'none' : 'block';
  toggleFiltersBtn.textContent = isVisible ? 'Advanced Filters ▼' : 'Advanced Filters ▲';
});

boardFilterSelect.addEventListener('change', (e) => {
  boardFilter = e.target.value;
  performSearch();
});

authorFilterInput.addEventListener('input', (e) => {
  authorFilter = e.target.value.trim();
  debounceSearch();
});

dateFilterSelect.addEventListener('change', (e) => {
  dateFilter = e.target.value;
  performSearch();
});
