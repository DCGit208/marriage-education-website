// ================================================================
// MENTIONS & HASHTAGS SYSTEM
// ================================================================

// Parse @mentions from text and return array of usernames
function parseMentions(text) {
  if (!text) return [];
  const mentionRegex = /@(\w+)/g;
  const matches = [];
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    matches.push(match[1].toLowerCase());
  }
  return [...new Set(matches)]; // Remove duplicates
}

// Parse #hashtags from text and return array of tags
function parseHashtags(text) {
  if (!text) return [];
  const hashtagRegex = /#(\w+)/g;
  const matches = [];
  let match;
  while ((match = hashtagRegex.exec(text)) !== null) {
    matches.push(match[1].toLowerCase());
  }
  return [...new Set(matches)]; // Remove duplicates
}

// Convert usernames to user IDs by querying Firestore
async function resolveMentions(usernames) {
  if (!usernames || usernames.length === 0) return [];
  
  const userIds = [];
  
  // Query users by username (case-insensitive) or name
  for (const username of usernames) {
    try {
      // First try to find by username field
      let snapshot = await db.collection('users')
        .where('username', '==', username.toLowerCase())
        .limit(1)
        .get();
      
      if (!snapshot.empty) {
        userIds.push(snapshot.docs[0].id);
        continue;
      }
      
      // Fallback: search by name (since username field might not exist yet)
      // Get all users and match client-side
      const allUsersSnap = await db.collection('users').limit(100).get();
      
      for (const doc of allUsersSnap.docs) {
        const userData = doc.data();
        const name = (userData.name || '').toLowerCase().replace(/\s+/g, '');
        const email = (userData.email || '').split('@')[0].toLowerCase();
        
        if (name === username.toLowerCase() || email === username.toLowerCase()) {
          userIds.push(doc.id);
          break;
        }
      }
    } catch (error) {
      console.warn('Error resolving mention:', username, error);
    }
  }
  
  return userIds;
}

// Make @mentions clickable in HTML
function linkifyMentions(text) {
  if (!text) return '';
  return text.replace(/@(\w+)/g, '<a href="/member.html?username=$1" class="mention-link">@$1</a>');
}

// Make #hashtags clickable in HTML
function linkifyHashtags(text) {
  if (!text) return '';
  return text.replace(/#(\w+)/g, '<a href="/search.html?q=%23$1" class="hashtag-link">#$1</a>');
}

// Apply both mentions and hashtags linking
function linkifyContent(text) {
  if (!text) return '';
  let result = text;
  result = linkifyMentions(result);
  result = linkifyHashtags(result);
  return result;
}

// Search users for autocomplete (returns up to 5 matches)
async function searchUsersForMention(query, boardId = null) {
  if (!query || query.length < 1) return [];
  
  const searchQuery = query.toLowerCase();
  const results = [];
  
  try {
    // If boardId provided, only search within board members
    let usersRef = db.collection('users');
    
    if (boardId) {
      // Get board to find groupId
      const boardDoc = await db.collection('boards').doc(boardId).get();
      if (boardDoc.exists && boardDoc.data().groupId) {
        const groupId = boardDoc.data().groupId;
        usersRef = usersRef.where('groups', 'array-contains', groupId);
      }
    }
    
    // Firestore doesn't support case-insensitive search or LIKE queries
    // So we fetch users and filter client-side (limit to 50 for performance)
    const snapshot = await usersRef.limit(50).get();
    
    snapshot.forEach(doc => {
      const userData = doc.data();
      // Generate username from existing data if not set
      const username = userData.username || 
                      (userData.name || '').toLowerCase().replace(/\s+/g, '') ||
                      (userData.email || '').split('@')[0].toLowerCase() ||
                      'user';
      const name = userData.name || 'Anonymous';
      const nameL = name.toLowerCase();
      
      // Match username or display name
      if (username.includes(searchQuery) || nameL.includes(searchQuery)) {
        results.push({
          uid: doc.id,
          username: username,
          name: name,
          photoURL: userData.photoURL || null
        });
      }
    });
    
    // Sort by relevance (exact matches first)
    results.sort((a, b) => {
      const aUsername = a.username.toLowerCase();
      const bUsername = b.username.toLowerCase();
      if (aUsername === searchQuery) return -1;
      if (bUsername === searchQuery) return 1;
      if (aUsername.startsWith(searchQuery)) return -1;
      if (bUsername.startsWith(searchQuery)) return 1;
      return 0;
    });
    
    return results.slice(0, 5); // Return top 5 matches
    
  } catch (error) {
    console.error('Error searching users for mention:', error);
    return [];
  }
}

// Initialize mention autocomplete for a textarea
function initMentionAutocomplete(textarea, boardId = null) {
  let autocompleteDiv = null;
  let selectedIndex = -1;
  let currentResults = [];
  let mentionStartPos = -1;
  
  // Create autocomplete dropdown
  function createAutocomplete() {
    if (autocompleteDiv) return autocompleteDiv;
    
    autocompleteDiv = document.createElement('div');
    autocompleteDiv.className = 'mention-autocomplete';
    autocompleteDiv.style.display = 'none';
    document.body.appendChild(autocompleteDiv);
    
    return autocompleteDiv;
  }
  
  // Position autocomplete below cursor
  function positionAutocomplete() {
    if (!autocompleteDiv) return;
    
    const rect = textarea.getBoundingClientRect();
    autocompleteDiv.style.position = 'fixed';
    autocompleteDiv.style.left = rect.left + 'px';
    autocompleteDiv.style.top = (rect.bottom + 5) + 'px';
    autocompleteDiv.style.width = Math.min(300, rect.width) + 'px';
  }
  
  // Show autocomplete with results
  function showAutocomplete(results) {
    if (!results || results.length === 0) {
      hideAutocomplete();
      return;
    }
    
    const dropdown = createAutocomplete();
    currentResults = results;
    selectedIndex = 0;
    
    dropdown.innerHTML = results.map((user, index) => `
      <div class="mention-item ${index === 0 ? 'selected' : ''}" data-index="${index}">
        ${user.photoURL ? `<img src="${user.photoURL}" alt="${user.name}">` : '<div class="mention-avatar-placeholder"></div>'}
        <div class="mention-info">
          <div class="mention-name">${escapeHTML(user.name)}</div>
          <div class="mention-username">@${escapeHTML(user.username)}</div>
        </div>
      </div>
    `).join('');
    
    // Add click handlers
    dropdown.querySelectorAll('.mention-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        selectMention(index);
      });
    });
    
    positionAutocomplete();
    dropdown.style.display = 'block';
  }
  
  // Hide autocomplete
  function hideAutocomplete() {
    if (autocompleteDiv) {
      autocompleteDiv.style.display = 'none';
    }
    currentResults = [];
    selectedIndex = -1;
    mentionStartPos = -1;
  }
  
  // Select a mention from autocomplete
  function selectMention(index) {
    if (!currentResults[index]) return;
    
    const user = currentResults[index];
    const text = textarea.value;
    const beforeMention = text.substring(0, mentionStartPos);
    const afterMention = text.substring(textarea.selectionStart);
    
    textarea.value = beforeMention + '@' + user.username + ' ' + afterMention;
    textarea.selectionStart = textarea.selectionEnd = beforeMention.length + user.username.length + 2;
    
    hideAutocomplete();
    textarea.focus();
  }
  
  // Handle input
  textarea.addEventListener('input', async (e) => {
    const text = textarea.value;
    const cursorPos = textarea.selectionStart;
    
    // Find @ before cursor
    let atPos = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (text[i] === '@') {
        atPos = i;
        break;
      }
      if (text[i] === ' ' || text[i] === '\n') {
        break;
      }
    }
    
    if (atPos === -1) {
      hideAutocomplete();
      return;
    }
    
    // Extract query after @
    const query = text.substring(atPos + 1, cursorPos);
    
    // Query must be at least 1 char and no spaces
    if (query.length < 1 || query.includes(' ')) {
      hideAutocomplete();
      return;
    }
    
    mentionStartPos = atPos;
    
    // Search for users
    const results = await searchUsersForMention(query, boardId);
    showAutocomplete(results);
  });
  
  // Handle keyboard navigation
  textarea.addEventListener('keydown', (e) => {
    if (!autocompleteDiv || autocompleteDiv.style.display === 'none') return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
      updateSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateSelection();
    } else if (e.key === 'Enter' && currentResults.length > 0) {
      e.preventDefault();
      selectMention(selectedIndex);
    } else if (e.key === 'Escape') {
      hideAutocomplete();
    }
  });
  
  // Update selected item styling
  function updateSelection() {
    if (!autocompleteDiv) return;
    
    autocompleteDiv.querySelectorAll('.mention-item').forEach((item, index) => {
      item.classList.toggle('selected', index === selectedIndex);
    });
  }
  
  // Hide autocomplete when clicking outside
  document.addEventListener('click', (e) => {
    if (e.target !== textarea && !autocompleteDiv?.contains(e.target)) {
      hideAutocomplete();
    }
  });
  
  // Hide on window resize/scroll
  window.addEventListener('resize', hideAutocomplete);
  window.addEventListener('scroll', hideAutocomplete, true);
  
  // Cleanup function
  return () => {
    if (autocompleteDiv) {
      autocompleteDiv.remove();
      autocompleteDiv = null;
    }
  };
}

// Helper function to escape HTML
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
