// ================================================================
// BOARD PAGE — Media Feed with Photo Lightbox + Video Overlay
// ================================================================

const PAGE_SIZE = (function() {
  try {
    // Reduce initial load for mobile Safari to improve performance
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    const size = (isMobile && isSafari) ? 15 : 25;
    console.log('[Board] PAGE_SIZE set to', size, 'isMobile:', isMobile, 'isSafari:', isSafari);
    return size;
  } catch (e) {
    console.error('[Board] PAGE_SIZE detection error, using default:', e);
    return 15; // Safe default for all devices if detection fails
  }
})();

const urlParams   = new URLSearchParams(window.location.search);
const boardId     = urlParams.get('boardId');

let currentBoardData  = null;
let currentUserId     = null;
let currentIsAdmin    = false;
let currentUserData   = {};
let lastVisible       = null;
let allLoaded         = false;
let isLoading         = false;
let lightboxPhotos    = [];   // [{ url, caption }]
let lightboxIndex     = 0;
let ctxPost           = null;  // post currently targeted by context menu
let ctxCard           = null;  // card element currently targeted
let lastLongPress     = 0;     // timestamp — stops media click from firing after a long-press
let pinnedPosts           = [];    // pinned posts for this board
let pinnedBannerIndex     = 0;    // which pinned post the banner currently shows
let pinnedBannerDismissed = false;
let isSubmitting          = false; // prevents double-submit on Post button
let pendingLinkPreview    = null;  // populated by URL detection in caption textarea
let currentUserBookmarks  = new Set();

// ── DOM refs ─────────────────────────────────────────────────────
const backBtn           = document.getElementById('backBtn');
const logoutBtn         = document.getElementById('logoutBtn');
const boardTitle        = document.getElementById('boardTitle');
const boardDescription  = document.getElementById('boardDescription');
const postCountBadge    = document.getElementById('postCountBadge');
const postsContainer    = document.getElementById('postsContainer');
const noPostsMessage    = document.getElementById('noPostsMessage');
const loadMoreArea      = document.getElementById('loadMoreArea');
const loadMoreBtn       = document.getElementById('loadMoreBtn');
const loadingOverlay    = document.getElementById('loadingOverlay');
const loadingStatus     = document.getElementById('loadingStatus');

// Lightbox
const lightbox          = document.getElementById('lightbox');
const lightboxImg       = document.getElementById('lightboxImg');
const lightboxCaption   = document.getElementById('lightboxCaption');
const lightboxClose     = document.getElementById('lightboxClose');
const lightboxPrev      = document.getElementById('lightboxPrev');
const lightboxNext      = document.getElementById('lightboxNext');

// Video overlay
const videoOverlay        = document.getElementById('videoOverlay');
const overlayVideo        = document.getElementById('overlayVideo');
const videoCaption        = document.getElementById('videoCaption');
const videoOverlayClose   = document.getElementById('videoOverlayClose');
const videoOverlayCounter = document.getElementById('videoOverlayCounter');
const videoOverlayPrev    = document.getElementById('videoOverlayPrev');
const videoOverlayNext    = document.getElementById('videoOverlayNext');

// Context menu
const postCtxOverlay = document.getElementById('postCtxOverlay');
const postCtxMenu    = document.getElementById('postCtxMenu');

// State for multi-video overlay navigation
let overlayVideoList  = [];   // [{url, caption}, ...]
let overlayVideoIndex = 0;

// Create-post modal
const createPostBtn     = document.getElementById('createPostBtn');
const createPostModal   = document.getElementById('createPostModal');
const closeModalBtn     = document.getElementById('closeModalBtn');
const cancelPostBtn     = document.getElementById('cancelPostBtn');
const createPostForm    = document.getElementById('createPostForm');
const postMediaInput    = document.getElementById('postMedia');
const mediaPreviewGrid  = document.getElementById('mediaPreviewGrid');
const addMediaBtn       = document.getElementById('addMediaBtn');

// Track object URLs so we can revoke them when the modal closes
let _mediaObjectURLs = [];

// ── Retry helper for Firestore queries (especially important for Safari) ──
async function retryFirestoreQuery(queryFn, maxRetries = 3, timeoutMs = 20000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Firestore query timeout')), timeoutMs)
      );
      const result = await Promise.race([queryFn(), timeoutPromise]);
      return result;
    } catch (error) {
      console.warn(`[Retry ${attempt}/${maxRetries}] Query failed:`, error.message);
      if (attempt === maxRetries) {
        // Add browser info to error for debugging Safari issues
        error.message = `${error.message} (Browser: ${navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome') ? 'Safari' : 'Other'}, Attempt ${attempt}/${maxRetries})`;
        throw error;
      }
      // Exponential backoff: 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }
  }
}

// ── Auth guard ───────────────────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  console.log('[Board] Auth state changed, user:', user ? user.uid : 'null');
  console.log('[Board] Firebase initialized:', typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0);
  console.log('[Board] Firestore available:', typeof db !== 'undefined');
  
  // Wait for Firebase to be fully initialized (Safari sometimes races)
  let waitCount = 0;
  while ((!firebase || !firebase.apps || !firebase.apps.length || !db) && waitCount < 50) {
    console.log('[Board] Waiting for Firebase initialization...', waitCount);
    await new Promise(resolve => setTimeout(resolve, 100));
    waitCount++;
  }
  
  if (!firebase || !firebase.apps || !firebase.apps.length || !db) {
    console.error('[Board] Firebase failed to initialize after 5 seconds!');
    alert('Firebase initialization failed. Please reload the page.');
    return;
  }
  
  console.log('[Board] Firebase ready, proceeding with auth check');
  
  if (!user) { window.location.href = 'index.html'; return; }
  if (!boardId) {
    window.location.href = 'dashboard.html';
    return;
  }

  currentUserId  = user.uid;

  // Init notifications immediately — must not wait for isUserAdmin() Firestore fetch
  // so the bell and badge work even on slow connections
  if (typeof initNotifications === 'function') initNotifications(currentUserId);
  if (typeof initDmBadge === 'function') initDmBadge(currentUserId);

  currentIsAdmin = await isUserAdmin();

  // Cache user doc for DM sharing + bookmarks
  try {
    const uDoc = await db.collection('users').doc(user.uid).get();
    currentUserData = uDoc.exists ? uDoc.data() : {};
    currentUserBookmarks = new Set(currentUserData.bookmarks || []);
  } catch (_) {}

  try {
    showLoading(true);
    console.log('[Board] Starting load for boardId:', boardId);
    console.log('[Board] User agent:', navigator.userAgent);
    
    // Load critical content first: board info and initial posts
    await Promise.all([
      retryFirestoreQuery(() => loadBoardInfo()).catch(err => {
        console.error('[Board] loadBoardInfo failed:', err);
        throw err;
      }),
      retryFirestoreQuery(() => loadPosts(true)).catch(err => {
        console.error('[Board] loadPosts failed:', err);
        throw err;
      }),
    ]);
    
    console.log('[Board] Main content loaded successfully');
    
    // Load secondary content after main posts are visible
    Promise.all([
      retryFirestoreQuery(() => loadPinnedPosts()).catch(err => console.warn('[Init] loadPinnedPosts error:', err)),
      retryFirestoreQuery(() => loadStories()).catch(err => console.warn('[Init] loadStories error:', err)),
    ]).then(() => {
      console.log('[Board] Secondary content loaded');
    }).catch(err => console.warn('[Init] Secondary load error:', err));

    // Deep-link: ?comment=ID → expand the right post, scroll to that comment
    const targetCommentId = urlParams.get('comment');
    if (targetCommentId) {
      try {
        // Check if postId is in URL (saves a Firestore query)
        let commentPostId = urlParams.get('post');
        
        // If not in URL, fetch comment document to get postId
        if (!commentPostId) {
          const commentDoc = await db.collection('comments').doc(targetCommentId).get();
          if (commentDoc.exists) {
            commentPostId = commentDoc.data().postId;
          }
        }
        
        if (commentPostId) {
          // Find card in DOM; keep loading pages until found or all posts loaded
          let card = postsContainer.querySelector(`[data-post-id="${commentPostId}"]`);
          while (!card && !allLoaded) {
            await loadPosts(false);
            card = postsContainer.querySelector(`[data-post-id="${commentPostId}"]`);
          }
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const section   = card.querySelector('.comment-section');
            const toggleBtn = card.querySelector('.comment-toggle-btn');
            if (section.style.display === 'none' && toggleBtn) toggleBtn.click();
            setTimeout(() => {
              const el = document.getElementById('comment-' + targetCommentId);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('comment-highlight');
                el.addEventListener('animationend', () => el.classList.remove('comment-highlight'), { once: true });
              }
            }, 950);
          }
        }
      } catch (err) {
        console.warn('Deep-link comment error:', err);
      }
    }

    // Deep-link: ?post=ID → scroll to that post card (no comment needed)
    const targetPostId = urlParams.get('post');
    if (targetPostId && !targetCommentId) {
      try {
        let card = postsContainer.querySelector(`[data-post-id="${targetPostId}"]`);
        while (!card && !allLoaded) {
          await loadPosts(false);
          card = postsContainer.querySelector(`[data-post-id="${targetPostId}"]`);
        }
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('pin-highlight');
          card.addEventListener('animationend', () => card.classList.remove('pin-highlight'), { once: true });
        }
      } catch (err) {
        console.warn('Deep-link post error:', err);
      }
    }
  } catch (err) {
    console.error('Board load error:', err);
    console.error('Error details:', {
      message: err.message,
      code: err.code,
      stack: err.stack,
      browser: navigator.userAgent
    });
    
    // Show user-friendly error message
    const errorMsg = document.createElement('div');
    errorMsg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;padding:30px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-width:400px;text-align:center;z-index:10000;';
    errorMsg.innerHTML = `
      <h3 style="margin:0 0 15px 0;color:#ef4444;">Board Loading Error</h3>
      <p style="color:#64748b;margin:0 0 20px 0;line-height:1.5;">${err.message || 'Could not load board content. This might be a connection issue.'}</p>
      <button onclick="window.location.reload()" style="background:#667eea;color:white;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:15px;font-weight:500;">Reload Page</button>
    `;
    document.body.appendChild(errorMsg);
  } finally {
    showLoading(false);
  }
  
  // Initialize mention autocomplete for post creation modal
  const postContentTextarea = document.getElementById('postContent');
  if (postContentTextarea && typeof initMentionAutocomplete === 'function') {
    initMentionAutocomplete(postContentTextarea, boardId);
  }
  
  // Initialize mention autocomplete for edit post modal
  const editPostTextarea = document.getElementById('editPostContent');
  if (editPostTextarea && typeof initMentionAutocomplete === 'function') {
    initMentionAutocomplete(editPostTextarea, boardId);
  }
});

// ── Load board metadata ──────────────────────────────────────────
async function loadBoardInfo() {
  console.log('[loadBoardInfo] Starting for boardId:', boardId);
  try {
    const boardDoc = await db.collection('boards').doc(boardId).get();
    console.log('[loadBoardInfo] Firestore query complete, exists:', boardDoc.exists);

    if (!boardDoc.exists) throw new Error('Board not found');

    currentBoardData = boardDoc.data();
    console.log('[loadBoardInfo] Board data loaded:', currentBoardData.title);

    if (boardTitle)       boardTitle.textContent       = currentBoardData.title || 'Board';
    if (boardDescription) boardDescription.textContent = currentBoardData.description || '';
    if (postCountBadge && currentBoardData.postCount) {
      postCountBadge.textContent = currentBoardData.postCount + ' posts';
    }
    console.log('[loadBoardInfo] UI updated successfully');
  } catch (error) {
    console.error('[loadBoardInfo] Error:', error);
    throw error;
  }
}

// ── Paginated post loading ───────────────────────────────────────
async function loadPosts(reset) {
  if (allLoaded && !reset) return;
  if (isLoading) return;
  isLoading = true;
  
  console.log('[loadPosts] Starting, reset:', reset, 'boardId:', boardId);

  try {
  if (reset) {
    postsContainer.innerHTML = '';
    lastVisible    = null;
    allLoaded      = false;
    lightboxPhotos = [];
  }

  let query = db.collection('posts')
    .where('boardId', '==', boardId)
    .orderBy('timestamp', 'desc')
    .limit(PAGE_SIZE);

  if (lastVisible) query = query.startAfter(lastVisible);
  
  console.log('[loadPosts] Executing Firestore query...');
  const snapshot = await query.get();
  console.log('[loadPosts] Query complete, docs:', snapshot.size);

  if (snapshot.empty && reset) {
    noPostsMessage.style.display = 'block';
    console.log('[loadPosts] No posts found');
    return;
  }

  noPostsMessage.style.display = 'none';

  snapshot.forEach(doc => {
    const post = { id: doc.id, ...doc.data() };
    // Handle scheduled posts
    if (post.isScheduled) {
      const due = post.scheduledAt?.toDate ? post.scheduledAt.toDate() : null;
      if (due && due > new Date()) return; // not yet due
      // Past due — auto-publish (fire-and-forget)
      doc.ref.update({ isScheduled: false }).catch(() => {});
    }
    postsContainer.appendChild(buildPostCard(post));
  });
  
  console.log('[loadPosts] Posts rendered');

  if (snapshot.docs.length > 0) {
    lastVisible = snapshot.docs[snapshot.docs.length - 1];
  }

  if (snapshot.docs.length < PAGE_SIZE) {
    allLoaded = true;
    loadMoreArea.style.display = 'none';
  } else {
    loadMoreArea.style.display = 'flex';
  }
  } catch (err) {
    console.error('[loadPosts] Error:', err);
    throw err;
  } finally {
    isLoading = false;
  }
}

// ── Build one post card ──────────────────────────────────────────
function buildPostCard(post) {
  const card = document.createElement('article');
  card.className = 'post-card';
  card.dataset.postId = post.id;
  
  // Store timestamp for sorting
  if (post.timestamp) {
    // Convert Firestore timestamp to milliseconds
    const timestamp = post.timestamp.toMillis ? post.timestamp.toMillis() : post.timestamp;
    card.dataset.timestamp = timestamp;
  }
  
  // Calculate total reaction count for sorting
  let totalReactions = 0;
  if (post.reactions) {
    Object.values(post.reactions).forEach(uids => {
      if (Array.isArray(uids)) totalReactions += uids.length;
    });
  }
  card.dataset.reactionCount = totalReactions;

  const dateStr = formatDate(post.timestamp);
  const author  = esc(post.authorName || 'Member');

  const hasVideo  = !!(post.videoUrl || post.localVideo);
  const hasPhoto  = !!post.imageUrl;
  const hasPhotos = Array.isArray(post.allPhotos) && post.allPhotos.length > 0;
  const hasText   = !!(post.content && post.content.trim());
  const extraVideos = (Array.isArray(post.allVideos) && post.allVideos.length > 1) ? post.allVideos.slice(1) : [];

  // Register all photos for global lightbox list (legacy-format posts only)
  const postLightboxStartIndex = lightboxPhotos.length;
  if (!(post.allMedia && post.allMedia.length)) {
    if (hasPhoto) {
      lightboxPhotos.push({ url: post.imageUrl, caption: post.content || '' });
    }
    if (hasPhotos) {
      post.allPhotos.forEach(url => {
        if (url !== post.imageUrl) {
          lightboxPhotos.push({ url, caption: post.content || '' });
        }
      });
    }
  }

  let mediaHtml = '';

  if (post.allMedia && post.allMedia.length > 0) {
    // ── Unified mixed-media grid (photos + videos in selection order) ──
    const items = post.allMedia;
    const total = items.length;

    // Register ALL photos for lightbox upfront
    const mixedLightboxStart = lightboxPhotos.length;
    items.forEach(item => {
      if (item.type === 'image') {
        lightboxPhotos.push({ url: item.url, caption: post.content || '' });
      }
    });
    let photoLightboxIdx = mixedLightboxStart;

    // All video URLs for prev/next navigation
    const allVidUrls = items.filter(m => m.type === 'video').map(m => m.url);
    const videosAttr = JSON.stringify(allVidUrls).replace(/"/g, '&quot;');
    const safeCaption = esc(post.content || '');

    // Build ALL cells — first 3 always visible, rest in a collapsible row
    const buildCell = (item) => {
      if (item.type === 'image') {
        const idx = photoLightboxIdx++;
        return `<div class="media-thumb photo-thumb-cell" data-photo-index="${idx}" role="button" tabindex="0" aria-label="View photo"><img src="${esc(item.url)}" alt="Post photo" loading="lazy"><button class="media-reply-btn" type="button" aria-label="Reply to this photo">↩ Reply</button></div>`;
      } else {
        const vidIndex = allVidUrls.indexOf(item.url);
        return `<div class="media-thumb video-thumb" data-video="${esc(item.url)}" data-videos="${videosAttr}" data-video-index="${vidIndex}" data-caption="${safeCaption}" role="button" tabindex="0" aria-label="Play video">${item.thumbUrl ? `<img src="${esc(item.thumbUrl)}" alt="Video thumbnail" loading="lazy">` : '<div class="thumb-placeholder"></div>'}<div class="play-btn-overlay"><span class="play-triangle">▶</span></div><button class="media-reply-btn" type="button" aria-label="Reply to this video">↩ Reply</button></div>`;
      }
    };

    if (total === 1) {
      mediaHtml = buildCell(items[0]);
    } else if (total <= 4) {
      mediaHtml = `<div class="photo-grid photo-grid-${total}">${items.map(buildCell).join('')}</div>`;
    } else {
      // Show first 4 in proper 2×2 grid; expand btn + overflow sit OUTSIDE the clipped grid
      const visibleCells = items.slice(0, 4).map(buildCell).join('');
      const hiddenCells  = items.slice(4).map(buildCell).join('');
      const remainder    = total - 4;
      const expandBtn = `<button class="media-expand-btn" type="button" aria-label="See all media">+ ${remainder} more item${remainder !== 1 ? 's' : ''}</button>`;
      mediaHtml = `<div class="media-expandable">
        <div class="photo-grid photo-grid-4">${visibleCells}</div>
        ${expandBtn}
        <div class="media-overflow-row">${hiddenCells}</div>
      </div>`;
    }

  } else if (hasVideo) {
    const firstUrl    = post.videoUrl || post.localVideo || '';
    const thumbUrl    = post.thumbUrl || post.imageUrl || '';
    const safeCaption = esc(post.content || '');
    const allVideoUrls = [firstUrl, ...extraVideos];
    const totalVideos  = allVideoUrls.length;
    // Use &quot; so the attribute value isn't broken by JSON double-quotes
    const videosAttr   = JSON.stringify(allVideoUrls).replace(/"/g, '&quot;');
    const displayUrls  = allVideoUrls.slice(0, 4);
    const overflow     = totalVideos > 4 ? totalVideos - 4 : 0;
    // Per-video thumbnails; fall back to post.thumbUrl for index 0
    const thumbsArr = Array.isArray(post.allThumbs) ? post.allThumbs : [];

    if (totalVideos === 1) {
      // Single video — full-width thumb
      mediaHtml = `
        <div class="media-thumb video-thumb"
             data-video="${esc(firstUrl)}"
             data-videos="${videosAttr}"
             data-video-index="0"
             data-caption="${safeCaption}"
             role="button" tabindex="0"
             aria-label="Play video">
          ${thumbUrl ? `<img src="${esc(thumbUrl)}" alt="Video thumbnail" loading="lazy">` : '<div class="thumb-placeholder"></div>'}
          <div class="play-btn-overlay"><span class="play-triangle">▶</span></div>
          <button class="media-reply-btn" type="button" aria-label="Reply to this video">↩ Reply</button>
        </div>`;
    } else {
      // Build ALL video cells — first 3 always visible, rest collapsible
      const buildVidCell = (url, i) => {
        const cellThumb = thumbsArr[i] || (i === 0 ? thumbUrl : '');
        const imgHtml   = cellThumb ? `<img src="${esc(cellThumb)}" alt="Video thumbnail" loading="lazy">` : '<div class="thumb-placeholder"></div>';
        return `<div class="media-thumb video-thumb" data-video="${esc(url)}" data-videos="${videosAttr}" data-video-index="${i}" data-caption="${safeCaption}" role="button" tabindex="0" aria-label="Play video ${i + 1} of ${totalVideos}">${imgHtml}<div class="play-btn-overlay"><span class="play-triangle">▶</span></div><button class="media-reply-btn" type="button" aria-label="Reply to this video">↩ Reply</button></div>`;
      };
      if (totalVideos <= 4) {
        const cells = allVideoUrls.map(buildVidCell).join('');
        mediaHtml = `<div class="video-grid video-grid-${totalVideos}">${cells}</div>`;
      } else {
        // Show first 4 in proper 2×2 grid; expand btn + overflow sit OUTSIDE the clipped grid
        const visibleCells = allVideoUrls.slice(0, 4).map(buildVidCell).join('');
        const hiddenCells  = allVideoUrls.slice(4).map(buildVidCell).join('');
        const remainder    = totalVideos - 4;
        const expandBtn = `<button class="media-expand-btn" type="button" aria-label="See all videos">+ ${remainder} more video${remainder !== 1 ? 's' : ''}</button>`;
        mediaHtml = `<div class="media-expandable">
          <div class="video-grid video-grid-4">${visibleCells}</div>
          ${expandBtn}
          <div class="media-overflow-row">${hiddenCells}</div>
        </div>`;
      }
    }
  } else if (hasPhoto || hasPhotos) {
    // Build deduplicated ordered list matching what was pushed to lightboxPhotos
    const allPhotoUrls = [];
    if (hasPhoto) allPhotoUrls.push(post.imageUrl);
    if (hasPhotos) {
      post.allPhotos.forEach(url => {
        if (!allPhotoUrls.includes(url)) allPhotoUrls.push(url);
      });
    }
    const totalPhotos = allPhotoUrls.length;

    if (totalPhotos === 1) {
      mediaHtml = `
        <div class="media-thumb photo-thumb"
             data-photo-index="${postLightboxStartIndex}"
             role="button" tabindex="0"
             aria-label="View photo">
          <img src="${esc(allPhotoUrls[0])}" alt="Post photo" loading="lazy">
          <button class="media-reply-btn" type="button" aria-label="Reply to this photo">↩ Reply</button>
        </div>`;
    } else {
      // Build ALL photo cells — first 3 always visible, rest collapsible
      const buildPhotoCell = (url, i) =>
        `<div class="media-thumb photo-thumb-cell" data-photo-index="${postLightboxStartIndex + i}" role="button" tabindex="0" aria-label="View photo ${i + 1} of ${totalPhotos}"><img src="${esc(url)}" alt="Post photo" loading="lazy"><button class="media-reply-btn" type="button" aria-label="Reply to this photo">↩ Reply</button></div>`;
      if (totalPhotos <= 4) {
        const cells = allPhotoUrls.map(buildPhotoCell).join('');
        mediaHtml = `<div class="photo-grid photo-grid-${totalPhotos}">${cells}</div>`;
      } else {
        // Show first 4 in proper 2×2 grid; expand btn + overflow sit OUTSIDE the clipped grid
        const visibleCells = allPhotoUrls.slice(0, 4).map(buildPhotoCell).join('');
        const hiddenCells  = allPhotoUrls.slice(4).map(buildPhotoCell).join('');
        const remainder    = totalPhotos - 4;
        const expandBtn = `<button class="media-expand-btn" type="button" aria-label="See all photos">+ ${remainder} more photo${remainder !== 1 ? 's' : ''}</button>`;
        mediaHtml = `<div class="media-expandable">
          <div class="photo-grid photo-grid-4">${visibleCells}</div>
          ${expandBtn}
          <div class="media-overflow-row">${hiddenCells}</div>
        </div>`;
      }
    }
  }

  const canDelete    = post.authorId === currentUserId || currentIsAdmin;
  const canEdit      = post.authorId === currentUserId || currentIsAdmin;
  const commentCount = post.commentCount || 0;
  const isBookmarked  = (currentUserBookmarks || new Set()).has(post.id);

  card.innerHTML = `
    <div class="post-meta">
      <span class="post-author"><a href="/member.html?uid=${esc(post.authorId || '')}" class="post-author-link">${author}</a></span>
      <span class="post-date">${dateStr}</span>
      ${post.isPinned ? '<span class="post-pinned-badge">📌 Pinned</span>' : ''}
      <button class="bookmark-btn${isBookmarked ? ' bookmarked' : ''}" data-postid="${esc(post.id)}" type="button" title="${isBookmarked ? 'Remove bookmark' : 'Bookmark'}" aria-label="Bookmark">${isBookmarked ? '🔖' : '🔘'}</button>
    </div>
    ${mediaHtml}
    ${hasText ? `<p class="post-text">${escAndLinkify(post.content)}</p>` : ''}
    ${post.repostedFrom ? `<div class="repost-quote">
      <div class="repost-header">
        <span class="repost-icon">🔄</span>
        <span class="repost-label">Reposted from <strong>${esc(post.repostedFrom.authorName || 'Member')}</strong></span>
      </div>
      ${post.repostedFrom.content ? `<p class="repost-content">${escAndLinkify(post.repostedFrom.content)}</p>` : ''}
    </div>` : ''}
    ${post.forwardedFrom ? `<div class="forwarded-quote"><span class="forwarded-label">↗ Forwarded from ${esc(post.forwardedAuthorName || 'Member')}</span>${post.forwardedContent ? `<p class="forwarded-text">${escAndLinkify(post.forwardedContent)}</p>` : ''}</div>` : ''}
    ${post.linkPreview ? buildLinkPreviewHtml(post.linkPreview) : ''}
    <div class="post-actions">
      <button class="comment-toggle-btn" data-count="${commentCount}" type="button">
        💬 ${commentCount > 0 ? commentCount + ' comment' + (commentCount !== 1 ? 's' : '') : 'Comment'}
      </button>
    </div>
    <div class="comment-section" style="display:none;">
      <ul class="comment-list"></ul>
      <div class="comment-input-row">
        <div class="quote-reply-preview" style="display:none;">
          <div class="quote-reply-inner">
            <span class="quote-reply-author"></span>
            <span class="quote-reply-text"></span>
          </div>
          <button class="quote-reply-cancel" type="button" aria-label="Cancel reply">✕</button>
        </div>
        <div class="comment-input-wrap">
          <textarea class="comment-input" placeholder="Add a comment…" maxlength="500" rows="1"></textarea>
          <button class="comment-send-btn" type="button">Send</button>
        </div>
      </div>
    </div>
  `;

  // Tap to open lightbox — handles single .photo-thumb and grid .photo-thumb-cell
  card.querySelectorAll('.photo-thumb, .photo-thumb-cell').forEach(thumb => {
    const openPhoto = () => {
      if (Date.now() - lastLongPress < 600) return; // swallow click after long-press
      openLightbox(parseInt(thumb.dataset.photoIndex, 10));
    };
    thumb.addEventListener('click', openPhoto);
    thumb.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openPhoto(); });
  });

  // Tap to open video — works for single thumb and every grid cell
  card.querySelectorAll('.video-thumb').forEach(thumb => {
    const openVideo = () => {
      if (Date.now() - lastLongPress < 600) return; // swallow click after long-press
      let urls;
      try { urls = JSON.parse(thumb.dataset.videos || '[]'); } catch { urls = []; }
      if (!urls.length) urls = [thumb.dataset.video];
      const startIndex = parseInt(thumb.dataset.videoIndex || '0', 10);
      openVideoOverlay(urls, startIndex, thumb.dataset.caption);
    };
    thumb.addEventListener('click', openVideo);
    thumb.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openVideo(); } });

    // Lazy first-frame thumbnail: when no stored thumbUrl, extract from the video URL
    const placeholder = thumb.querySelector('.thumb-placeholder');
    if (placeholder) {
      const vUrl = thumb.dataset.video;
      if (vUrl) {
        const vid = document.createElement('video');
        vid.preload   = 'metadata';
        vid.muted     = true;
        vid.playsInline = true;
        // Default 16:9 until real dimensions load
        vid.style.cssText = 'width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#111;pointer-events:none;';
        vid.addEventListener('loadedmetadata', () => {
          if (vid.videoWidth && vid.videoHeight) {
            vid.style.aspectRatio = `${vid.videoWidth} / ${vid.videoHeight}`;
          }
          vid.currentTime = 0.5;
        }, { once: true });
        vid.addEventListener('error', () => { vid.src = ''; }, { once: true });
        vid.src = vUrl;
        thumb.replaceChild(vid, placeholder);
      }
    }
  });

  // Expand "+N more" button — reveals hidden media overflow row inline
  card.querySelectorAll('.media-expand-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const grid       = btn.closest('.media-expandable');
      const overflowRow = grid && grid.querySelector('.media-overflow-row');
      if (!overflowRow) return;
      btn.style.display = 'none';
      overflowRow.classList.add('open');
      // Wire up new cells that just appeared
      overflowRow.querySelectorAll('.photo-thumb-cell').forEach(thumb => {
        thumb.addEventListener('click', () => {
          if (Date.now() - lastLongPress < 600) return;
          openLightbox(parseInt(thumb.dataset.photoIndex, 10));
        });
      });
      overflowRow.querySelectorAll('.video-thumb').forEach(thumb => {
        thumb.addEventListener('click', () => {
          if (Date.now() - lastLongPress < 600) return;
          let urls;
          try { urls = JSON.parse(thumb.dataset.videos || '[]'); } catch { urls = []; }
          if (!urls.length) urls = [thumb.dataset.video];
          openVideoOverlay(urls, parseInt(thumb.dataset.videoIndex || '0', 10), thumb.dataset.caption);
        });
        // Lazy thumbnail extraction for newly revealed video thumbs
        const placeholder = thumb.querySelector('.thumb-placeholder');
        if (placeholder) {
          const vUrl = thumb.dataset.video;
          if (vUrl) {
            const vid = document.createElement('video');
            vid.preload = 'metadata'; vid.muted = true; vid.playsInline = true;
            vid.style.cssText = 'width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#111;pointer-events:none;';
            vid.addEventListener('loadedmetadata', () => { vid.currentTime = 0.5; }, { once: true });
            vid.addEventListener('seeked', () => {
              try {
                const c = document.createElement('canvas');
                c.width = vid.videoWidth || 320; c.height = vid.videoHeight || 240;
                c.getContext('2d').drawImage(vid, 0, 0, c.width, c.height);
                const img = document.createElement('img');
                img.src = c.toDataURL('image/jpeg', 0.7);
                img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
                thumb.replaceChild(img, placeholder);
              } catch(_) {}
              vid.src = '';
            }, { once: true });
            vid.src = vUrl; vid.load();
          }
        }
      });
      overflowRow.querySelectorAll('.media-reply-btn').forEach(btn2 => {
        btn2.addEventListener('click', e2 => {
          e2.stopPropagation(); e2.preventDefault();
          const t = btn2.closest('.media-thumb');
          if (!t) return;
          if (section && section.style.display === 'none') {
            section.style.display = 'block';
            if (!commentsLoaded) { commentsLoaded = true; loadComments(post.id, commentList, toggleBtn, setReplyTo); }
          }
          if (t.classList.contains('video-thumb')) {
            setReplyTo({ authorName: post.authorName || 'Member', mediaUrl: t.dataset.video, mediaType: 'video', thumbUrl: t.querySelector('img')?.src || null });
          } else {
            const entry = lightboxPhotos[parseInt(t.dataset.photoIndex, 10)];
            if (entry) setReplyTo({ authorName: post.authorName || 'Member', mediaUrl: entry.url, mediaType: 'photo', thumbUrl: entry.url });
          }
        });
      });
    });
  });

  // ↩ Reply button on each media cell — stop propagation so it doesn't open lightbox/video
  card.querySelectorAll('.media-reply-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      e.preventDefault();
      const thumb = btn.closest('.media-thumb');
      const isVideo = thumb && thumb.classList.contains('video-thumb');
      let mediaUrl, mediaType, mediaThumbUrl;
      if (isVideo) {
        mediaUrl     = thumb.dataset.video;
        mediaType    = 'video';
        mediaThumbUrl = thumb.querySelector('img') ? thumb.querySelector('img').src : null;
      } else {
        const idx   = parseInt(thumb.dataset.photoIndex, 10);
        const entry = lightboxPhotos[idx];
        mediaUrl     = entry ? entry.url : null;
        mediaType    = 'photo';
        mediaThumbUrl = mediaUrl;
      }
      if (!mediaUrl) return;
      // Ensure comment section is open
      if (section && section.style.display === 'none') {
        section.style.display = 'block';
        if (!commentsLoaded) {
          commentsLoaded = true;
          loadComments(post.id, commentList, toggleBtn, setReplyTo);
        }
      }
      setReplyTo({ authorName: post.authorName || 'Member', mediaUrl, mediaType, thumbUrl: mediaThumbUrl });
    });
  });

  // Comment toggle
  const toggleBtn   = card.querySelector('.comment-toggle-btn');
  const section     = card.querySelector('.comment-section');
  const commentList = card.querySelector('.comment-list');
  let commentsLoaded = false;

  let activeReplyTo = null;
  let setReplyTo    = null; // assigned below, after DOM refs are ready

  toggleBtn.addEventListener('click', async () => {
    const isVisible = section.style.display !== 'none';
    if (isVisible) {
      section.style.display = 'none';
    } else {
      section.style.display = 'block';
      if (!commentsLoaded) {
        commentsLoaded = true;
        await loadComments(post.id, commentList, toggleBtn, setReplyTo);
      }
    }
  });

  // Comment send + quote-reply wiring
  const commentInput   = card.querySelector('.comment-input');
  const sendBtn        = card.querySelector('.comment-send-btn');
  const quotePreview   = card.querySelector('.quote-reply-preview');
  const quoteAuthorEl  = card.querySelector('.quote-reply-author');
  const quoteTextEl    = card.querySelector('.quote-reply-text');
  const quoteCancelBtn = card.querySelector('.quote-reply-cancel');

  // Initialize mention autocomplete for comment input
  if (commentInput && typeof initMentionAutocomplete === 'function') {
    initMentionAutocomplete(commentInput, boardId);
  }

  setReplyTo = (replyData) => {
    // Clean up any leftover media thumb from a previous media reply
    let quoteThumb = quotePreview.querySelector('.quote-media-thumb');
    if (quoteThumb) quoteThumb.remove();

    if (replyData.mediaUrl) {
      // Media reply (photo or video cell)
      activeReplyTo = {
        authorName: replyData.authorName,
        text:       replyData.mediaType === 'video' ? '🎥 Video' : '📷 Photo',
        mediaUrl:   replyData.mediaUrl,
        mediaType:  replyData.mediaType,
        thumbUrl:   replyData.thumbUrl || null,
      };
      quoteAuthorEl.textContent = replyData.authorName;
      quoteTextEl.textContent   = replyData.mediaType === 'video' ? '🎥 Video' : '📷 Photo';
      if (replyData.thumbUrl) {
        quoteThumb = document.createElement('img');
        quoteThumb.className = 'quote-media-thumb';
        quoteThumb.src = replyData.thumbUrl;
        quoteThumb.alt = replyData.mediaType === 'video' ? 'Video' : 'Photo';
        quotePreview.querySelector('.quote-reply-inner').prepend(quoteThumb);
      }
    } else {
      // Comment reply (existing behaviour)
      activeReplyTo             = { id: replyData.id, authorName: replyData.authorName, text: replyData.text };
      quoteAuthorEl.textContent = replyData.authorName;
      quoteTextEl.textContent   = (replyData.text || '').slice(0, 60) + ((replyData.text || '').length > 60 ? '…' : '');
    }
    quotePreview.style.display = 'block';
    commentInput.focus();
  };

  quoteCancelBtn && quoteCancelBtn.addEventListener('click', () => {
    activeReplyTo = null;
    quotePreview.style.display = 'none';
    const qt = quotePreview.querySelector('.quote-media-thumb');
    if (qt) qt.remove();
  });

  // Bookmark button
  const bookmarkBtn = card.querySelector('.bookmark-btn');
  if (bookmarkBtn) {
    bookmarkBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if ('vibrate' in navigator) navigator.vibrate(12);
      if (!currentUserId) return;
      const postId = bookmarkBtn.dataset.postid;
      const already = (currentUserBookmarks || new Set()).has(postId);
      if (already) {
        currentUserBookmarks.delete(postId);
        await db.collection('users').doc(currentUserId).update({
          bookmarks: firebase.firestore.FieldValue.arrayRemove(postId),
        });
        bookmarkBtn.textContent = '🔘';
        bookmarkBtn.classList.remove('bookmarked');
        bookmarkBtn.title = 'Bookmark';
      } else {
        currentUserBookmarks.add(postId);
        await db.collection('users').doc(currentUserId).update({
          bookmarks: firebase.firestore.FieldValue.arrayUnion(postId),
        });
        bookmarkBtn.textContent = '🔖';
        bookmarkBtn.classList.add('bookmarked');
        bookmarkBtn.title = 'Remove bookmark';
      }
    });
  }

  // Auto-grow textarea
  commentInput.addEventListener('input', () => {
    commentInput.style.height = 'auto';
    commentInput.style.height = commentInput.scrollHeight + 'px';
  });

  const sendComment = async () => {
    const text = commentInput.value.trim();
    if (!text) return;
    sendBtn.disabled = true;
    try {
      await addComment(post.id, text, activeReplyTo);
      commentInput.value = '';
      commentInput.style.height = 'auto';
      activeReplyTo = null;
      quotePreview.style.display = 'none';
      commentsLoaded = false;
      await loadComments(post.id, commentList, toggleBtn, setReplyTo);
      commentsLoaded = true;
    } catch (err) {
      alert('Could not post comment: ' + err.message);
    } finally {
      sendBtn.disabled = false;
    }
  };

  sendBtn.addEventListener('click', () => {
    if ('vibrate' in navigator) navigator.vibrate(15);
    sendComment();
  });
  commentInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); }
  });

  // Render post-level reactions (distinct from comments)
  renderReactionChips(card, post.reactions || {}, post.id);

  // Render poll if present
  renderPoll(post, card);

  // Long-press (mobile) or right-click (desktop) → context menu
  let pressTimer = null;
  let touchMoved = false;
  const startPress = (e) => {
    if (e.target.closest('button, a, textarea, input')) return;
    touchMoved = false;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      if (touchMoved) return;
      lastLongPress = Date.now();
      if ('vibrate' in navigator) navigator.vibrate(30);
      openContextMenu(post, card);
    }, 400);
  };
  const cancelPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
  card.addEventListener('touchstart',  startPress,  { passive: true });
  card.addEventListener('touchmove',   () => { touchMoved = true; cancelPress(); }, { passive: true });
  card.addEventListener('touchend',    cancelPress);
  card.addEventListener('touchcancel', cancelPress);
  card.addEventListener('contextmenu', (e) => {
    if (e.target.closest('button, a')) return;
    e.preventDefault();
    lastLongPress = Date.now();
    openContextMenu(post, card);
  });

  return card;
}

// ── Edit-post modal ───────────────────────────────────────────────
function openEditModal(post, card) {
  const modal     = document.getElementById('editPostModal');
  const textarea  = document.getElementById('editPostContent');
  const saveBtn   = document.getElementById('saveEditPostBtn');
  const cancelBtn = document.getElementById('cancelEditPostBtn');

  textarea.value = post.content || '';
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
  modal.style.display   = 'flex';
  document.body.style.overflow = 'hidden';
  textarea.focus();

  // Use .onclick so repeated openings never stack duplicate listeners
  const close = () => {
    modal.style.display = 'none';
    document.body.style.overflow = '';
    saveBtn.onclick   = null;
    cancelBtn.onclick = null;
  };

  cancelBtn.onclick = close;

  saveBtn.onclick = async () => {
    const newContent = textarea.value.trim();
    if (!newContent) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await editPost(post.id, newContent);
      // Update the visible post text in-place
      let textEl = card.querySelector('.post-text');
      if (textEl) {
        textEl.textContent = newContent;
      } else {
        // Post was media-only; add a text element now
        textEl = document.createElement('p');
        textEl.className = 'post-text';
        textEl.textContent = newContent;
        const actions = card.querySelector('.post-actions');
        if (actions) card.insertBefore(textEl, actions);
      }
      post.content = newContent;
      close();
    } catch (err) {
      alert('Could not save: ' + err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  };
}

// ── Lightbox zoom state ─────────────────────────────────────────
let _lbScale = 1;
let _lbLastScale = 1;
function _lbResetZoom() {
  _lbScale = 1; _lbLastScale = 1;
  if (lightboxImg) lightboxImg.style.transform = '';
}

// ── Lightbox ─────────────────────────────────────────────────────
function openLightbox(index) {
  if (!lightboxPhotos.length) return;
  lightboxIndex = Math.max(0, Math.min(index, lightboxPhotos.length - 1));
  showLightboxSlide();
  lightbox.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  lightboxClose.focus();
}

function showLightboxSlide() {
  _lbResetZoom();
  const entry = lightboxPhotos[lightboxIndex];
  lightboxImg.src = '';
  lightboxImg.src = entry.url;
  lightboxCaption.textContent = entry.caption || '';
  lightboxPrev.style.visibility = lightboxIndex > 0 ? 'visible' : 'hidden';
  lightboxNext.style.visibility  = lightboxIndex < lightboxPhotos.length - 1 ? 'visible' : 'hidden';
}

function closeLightbox() {
  _lbResetZoom();
  lightbox.style.display = 'none';
  lightboxImg.src = '';
  document.body.style.overflow = '';
}

lightboxClose.addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', () => { if (lightboxIndex > 0) { lightboxIndex--; showLightboxSlide(); } });
lightboxNext.addEventListener('click', () => { if (lightboxIndex < lightboxPhotos.length - 1) { lightboxIndex++; showLightboxSlide(); } });

document.addEventListener('keydown', e => {
  if (lightbox.style.display !== 'none') {
    if (e.key === 'Escape')     closeLightbox();
    if (e.key === 'ArrowLeft')  { if (lightboxIndex > 0) { lightboxIndex--; showLightboxSlide(); } }
    if (e.key === 'ArrowRight') { if (lightboxIndex < lightboxPhotos.length - 1) { lightboxIndex++; showLightboxSlide(); } }
  }
  if (videoOverlay.style.display !== 'none') {
    if (e.key === 'Escape')     closeVideoOverlay();
    if (e.key === 'ArrowLeft'  && overlayVideoIndex > 0)                          { overlayVideoIndex--; showOverlayVideoSlide(); }
    if (e.key === 'ArrowRight' && overlayVideoIndex < overlayVideoList.length - 1) { overlayVideoIndex++; showOverlayVideoSlide(); }
  }
  if (postCtxMenu && postCtxMenu.style.display !== 'none' && e.key === 'Escape') closeContextMenu();
});

lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });

// ── Lightbox: pinch-to-zoom + swipe navigation ───────────────────
(function () {
  let _startDist = 0;
  let _startX   = 0;
  let _lastTap  = 0;
  function _dist(t) {
    return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  }
  lightboxImg.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      _startDist   = _dist(e.touches);
      _lbLastScale = _lbScale;
    } else if (e.touches.length === 1) {
      _startX = e.touches[0].clientX;
    }
  }, { passive: false });
  lightboxImg.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      _lbScale = Math.min(6, Math.max(1, _lbLastScale * (_dist(e.touches) / _startDist)));
      lightboxImg.style.transform = `scale(${_lbScale})`;
      lightboxPrev.style.visibility = 'hidden';
      lightboxNext.style.visibility = 'hidden';
    }
  }, { passive: false });
  lightboxImg.addEventListener('touchend', e => {
    if (e.touches.length > 0) return;
    if (_lbScale < 1.1) {
      _lbResetZoom();
      if (e.changedTouches.length === 1) {
        const dx = e.changedTouches[0].clientX - _startX;
        if (Math.abs(dx) > 60) {
          if (dx < 0 && lightboxIndex < lightboxPhotos.length - 1) { lightboxIndex++; showLightboxSlide(); }
          else if (dx > 0 && lightboxIndex > 0)                    { lightboxIndex--; showLightboxSlide(); }
          return;
        }
      }
      const now = Date.now();
      if (now - _lastTap < 300) _lbResetZoom();
      _lastTap = now;
    }
    showLightboxSlide(); // re-applies correct nav visibility
  }, { passive: true });
})();

// ── Video overlay ─────────────────────────────────────────────────
function showOverlayVideoSlide() {
  const entry = overlayVideoList[overlayVideoIndex];
  overlayVideo.pause();
  overlayVideo.src = entry.url;
  videoCaption.textContent = entry.caption || '';
  overlayVideo.play().catch(() => {});
  if (videoOverlayPrev) videoOverlayPrev.style.visibility = overlayVideoIndex > 0 ? 'visible' : 'hidden';
  if (videoOverlayNext) videoOverlayNext.style.visibility = overlayVideoIndex < overlayVideoList.length - 1 ? 'visible' : 'hidden';
  // Counter badge: hide when only 1 video
  if (videoOverlayCounter) {
    if (overlayVideoList.length > 1) {
      videoOverlayCounter.textContent = `${overlayVideoIndex + 1} / ${overlayVideoList.length}`;
      videoOverlayCounter.style.display = 'block';
    } else {
      videoOverlayCounter.style.display = 'none';
    }
  }
}

function openVideoOverlay(urls, startIndex, caption) {
  // Accept (urls[], index, caption) or legacy (singleUrl, caption)
  if (typeof urls === 'string') {
    overlayVideoList  = [{ url: urls, caption: startIndex || '' }];
    overlayVideoIndex = 0;
  } else {
    overlayVideoList  = urls.map(u => ({ url: u, caption: caption || '' }));
    overlayVideoIndex = Math.max(0, Math.min(startIndex || 0, urls.length - 1));
  }
  videoOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  showOverlayVideoSlide();
  videoOverlayClose.focus();
}

function closeVideoOverlay() {
  overlayVideo.pause();
  overlayVideo.src = '';
  videoOverlay.style.display = 'none';
  document.body.style.overflow = '';
}

videoOverlayClose.addEventListener('click', closeVideoOverlay);
videoOverlay.addEventListener('click', e => { if (e.target === videoOverlay) closeVideoOverlay(); });
if (videoOverlayPrev) {
  videoOverlayPrev.addEventListener('click', () => {
    if (overlayVideoIndex > 0) { overlayVideoIndex--; showOverlayVideoSlide(); }
  });
}
if (videoOverlayNext) {
  videoOverlayNext.addEventListener('click', () => {
    if (overlayVideoIndex < overlayVideoList.length - 1) { overlayVideoIndex++; showOverlayVideoSlide(); }
  });
}

// ── Swipe gesture for video overlay (left = next, right = prev) ──
(function() {
  let _sx = 0, _sy = 0;
  videoOverlay.addEventListener('touchstart', e => {
    _sx = e.touches[0].clientX;
    _sy = e.touches[0].clientY;
  }, { passive: true });
  videoOverlay.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - _sx;
    const dy = e.changedTouches[0].clientY - _sy;
    // Require predominantly horizontal swipe (dx > dy) with >44px threshold
    if (Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0 && overlayVideoIndex < overlayVideoList.length - 1) {
      overlayVideoIndex++; showOverlayVideoSlide();
    } else if (dx > 0 && overlayVideoIndex > 0) {
      overlayVideoIndex--; showOverlayVideoSlide();
    }
  }, { passive: true });
})();

// ── @mention autocomplete ────────────────────────────────────────
function _handleMentionInput(input, card) {
  const val = input.value;
  const cursorPos = input.selectionStart;
  // Find the last @ before cursor
  const textBefore = val.slice(0, cursorPos);
  const atIndex = textBefore.lastIndexOf('@');
  // Remove existing dropdown
  const existing = card.querySelector('.mention-dropdown');
  if (existing) existing.remove();
  if (atIndex === -1) return;
  const query = textBefore.slice(atIndex + 1).toLowerCase();
  if (query.includes(' ')) return; // space after @ = not a mention

  const groupId = currentBoardData && currentBoardData.groupId;
  if (!groupId) return;

  db.collection('groups').doc(groupId).collection('members').limit(30).get().then(snap => {
    if (!snap || snap.empty) return;
    const matches = snap.docs
      .map(d => d.data())
      .filter(m => m.displayName && m.displayName.toLowerCase().startsWith(query))
      .slice(0, 6);
    if (!matches.length) return;
    const dropdown = document.createElement('ul');
    dropdown.className = 'mention-dropdown';
    dropdown.style.cssText = 'position:absolute;z-index:9999;background:#1a2535;border:1px solid #2a3a55;border-radius:8px;margin:0;padding:4px 0;list-style:none;min-width:160px;box-shadow:0 4px 16px rgba(0,0,0,.4);';
    matches.forEach(m => {
      const li = document.createElement('li');
      li.textContent = m.displayName;
      li.style.cssText = 'padding:7px 14px;cursor:pointer;color:#e0e8f0;font-size:0.9em;white-space:nowrap;';
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const before = val.slice(0, atIndex + 1) + m.displayName + ' ';
        const after  = val.slice(cursorPos);
        input.value  = before + after;
        input.selectionStart = input.selectionEnd = before.length;
        dropdown.remove();
        input.dispatchEvent(new Event('input'));
      });
      dropdown.appendChild(li);
    });
    // Position below the input
    const wrapper = input.closest('.comment-input-row') || input.parentElement;
    wrapper.style.position = 'relative';
    wrapper.appendChild(dropdown);
    // Close on blur
    input.addEventListener('blur', () => setTimeout(() => dropdown.remove(), 150), { once: true });
  }).catch(() => {});
}

// ── Infinite scroll via IntersectionObserver ────────────────────
(function () {
  const sentinel = document.getElementById('loadMoreArea');
  if (loadMoreBtn) loadMoreBtn.style.display = 'none';
  if (!sentinel || typeof IntersectionObserver === 'undefined') {
    // Fallback: manual button for old browsers
    if (loadMoreBtn) {
      loadMoreBtn.style.display = '';
      loadMoreBtn.addEventListener('click', async () => {
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = 'Loading…';
        await loadPosts(false);
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = 'Load more';
      });
    }
    return;
  }
  const io = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !allLoaded && !isLoading) loadPosts(false);
  }, { rootMargin: '400px' });
  io.observe(sentinel);
})();

// ── Create-post modal ────────────────────────────────────────────
function openModal() {
  createPostModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    const caption = document.getElementById('postContent');
    if (caption) caption.focus();
  }, 80);
}

function closeModal() {
  createPostModal.style.display = 'none';
  document.body.style.overflow = '';
  createPostForm && createPostForm.reset();
  _mediaObjectURLs.forEach(u => URL.revokeObjectURL(u));
  _mediaObjectURLs = [];
  if (mediaPreviewGrid) {
    mediaPreviewGrid.innerHTML = '';
    mediaPreviewGrid.style.display = 'none';
  }
  // Reset link preview
  pendingLinkPreview = null;
  const lpBar = document.getElementById('linkPreviewBar');
  if (lpBar) lpBar.style.display = 'none';
  // Reset poll builder
  const _pb = document.getElementById('pollBuilder');
  const _ptb = document.getElementById('pollToggleBtn');
  if (_pb)  _pb.style.display = 'none';
  if (_ptb) _ptb.classList.remove('active');
  // Reset schedule section
  const _ss  = document.getElementById('scheduleSection');
  const _stb = document.getElementById('scheduleToggleBtn');
  if (_ss)  _ss.style.display = 'none';
  if (_stb) _stb.classList.remove('active');
  // Reset story toggle
  const _storBtn = document.getElementById('storyToggleBtn');
  if (_storBtn) _storBtn.classList.remove('active');
}

createPostBtn && createPostBtn.addEventListener('click', () => {
  if ('vibrate' in navigator) navigator.vibrate(22);
  openModal();
});
closeModalBtn && closeModalBtn.addEventListener('click', closeModal);
cancelPostBtn && cancelPostBtn.addEventListener('click', closeModal);
createPostModal && createPostModal.addEventListener('click', e => { if (e.target === createPostModal) closeModal(); });

addMediaBtn && addMediaBtn.addEventListener('click', () => postMediaInput && postMediaInput.click());

if (postMediaInput) {
  postMediaInput.addEventListener('change', () => {
    const files = Array.from(postMediaInput.files);
    _mediaObjectURLs.forEach(u => URL.revokeObjectURL(u));
    _mediaObjectURLs = [];
    if (!files.length || !mediaPreviewGrid) return;
    mediaPreviewGrid.innerHTML = '';
    mediaPreviewGrid.style.display = 'grid';
    files.forEach((file, idx) => {
      const item = document.createElement('div');
      item.className = 'media-thumb-item';
      const url = URL.createObjectURL(file);
      _mediaObjectURLs.push(url);
      if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = 'Photo';
        item.appendChild(img);
      } else {
        // Extract first frame via canvas so iOS Safari shows a real thumbnail
        const badge = document.createElement('span');
        badge.className = 'media-thumb-video-badge';
        badge.textContent = '\u25b6 Video';
        item.appendChild(badge);

        const frameImg = document.createElement('img');
        frameImg.alt = 'Video';
        frameImg.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        // Placeholder while frame extracts
        frameImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        item.insertBefore(frameImg, badge);

        // Extract frame off the main thread using a hidden video + canvas
        const tmpVid = document.createElement('video');
        tmpVid.muted = true;
        tmpVid.playsInline = true;
        tmpVid.preload = 'metadata';
        tmpVid.src = url;
        tmpVid.addEventListener('loadeddata', () => {
          tmpVid.currentTime = 0.5;
        }, { once: true });
        tmpVid.addEventListener('seeked', () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width  = tmpVid.videoWidth  || 320;
            canvas.height = tmpVid.videoHeight || 240;
            canvas.getContext('2d').drawImage(tmpVid, 0, 0, canvas.width, canvas.height);
            frameImg.src = canvas.toDataURL('image/jpeg', 0.7);
          } catch (_) { /* cross-origin or decode error — keep placeholder */ }
          tmpVid.src = '';
        }, { once: true });
        tmpVid.load();
      }
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'media-thumb-remove';
      rm.textContent = '\u2715';
      rm.setAttribute('aria-label', 'Remove');
      rm.addEventListener('click', () => {
        const dt = new DataTransfer();
        Array.from(postMediaInput.files).filter((_, i) => i !== idx).forEach(f => dt.items.add(f));
        postMediaInput.files = dt.files;
        postMediaInput.dispatchEvent(new Event('change'));
      });
      item.appendChild(rm);
      mediaPreviewGrid.appendChild(item);
    });
  });
}

if (createPostForm) {
  createPostForm.addEventListener('submit', async e => {
    e.preventDefault();
    // Synchronous guard — stops double-tap / double-click before any paint happens
    if (isSubmitting) return;

    const content     = document.getElementById('postContent').value.trim();
    const allFiles    = postMediaInput ? Array.from(postMediaInput.files) : [];
    const imageFiles  = allFiles.filter(f => f.type.startsWith('image/'));
    const videoFiles  = allFiles.filter(f => f.type.startsWith('video/'));
    if (!content && !allFiles.length) { alert('Add a caption, photo, or video.'); return; }

    isSubmitting = true;
    const postBtn = createPostForm.querySelector('button[type="submit"]');
    if (postBtn) { postBtn.disabled = true; postBtn.textContent = 'Posting…'; }
    // Disable the add-media button and remove-buttons during upload
    if (addMediaBtn) addMediaBtn.disabled = true;
    const thumbItems = mediaPreviewGrid ? Array.from(mediaPreviewGrid.querySelectorAll('.media-thumb-item')) : [];

    // Helper: show spinning overlay on a specific thumbnail cell
    function _thumbUploading(idx) {
      const cell = thumbItems[idx];
      if (!cell) return;
      cell.querySelectorAll('.media-thumb-remove').forEach(b => b.style.display = 'none');
      const ov = document.createElement('div');
      ov.className = 'media-thumb-uploading';
      ov.innerHTML = '<div class="media-thumb-spinner"></div>';
      cell.appendChild(ov);
    }
    // Helper: replace spinner with ✓ on a specific thumbnail cell
    function _thumbDone(idx) {
      const cell = thumbItems[idx];
      if (!cell) return;
      cell.querySelector('.media-thumb-uploading')?.remove();
      const ov = document.createElement('div');
      ov.className = 'media-thumb-done';
      ov.textContent = '✓';
      cell.appendChild(ov);
    }

    try {
      const user = getCurrentUser();

      // Upload all files in their selection order (parallel), maintaining position for spinners
      const uploadJobs = allFiles.map((file, fileIdx) => {
        _thumbUploading(fileIdx);
        if (file.type.startsWith('image/')) {
          return uploadImage(file, user.uid).then(url => {
            _thumbDone(fileIdx);
            return { type: 'image', url };
          });
        } else {
          const thumbP = generateVideoThumbnail(file).catch(() => null);
          const vidP   = uploadVideo(file, user.uid).then(url => { _thumbDone(fileIdx); return url; });
          return Promise.all([vidP, thumbP]).then(async ([vidUrl, thumbBlob]) => {
            const thumbUrl = thumbBlob ? await uploadImage(thumbBlob, user.uid).catch(() => null) : null;
            return { type: 'video', url: vidUrl, thumbUrl };
          });
        }
      });

      const allMedia = await Promise.all(uploadJobs);

      // Derive legacy fields (for backward compat with old render paths)
      const firstImage = allMedia.find(m => m.type === 'image');
      const firstVideo = allMedia.find(m => m.type === 'video');
      const imageUrl   = firstImage?.url || null;
      const videoUrl   = firstVideo?.url || null;
      const allPhotos  = allMedia.filter(m => m.type === 'image').map(m => m.url);
      const allVideos  = allMedia.filter(m => m.type === 'video').map(m => m.url);
      const thumbUrl   = firstVideo?.thumbUrl || null;
      const allThumbs  = allMedia.filter(m => m.type === 'video').map(m => m.thumbUrl || null);

      if (postBtn) postBtn.textContent = 'Saving…';
      // Collect poll data
      let _pollData = null;
      if (document.getElementById('pollBuilder')?.style.display !== 'none') {
        const _pq   = document.getElementById('pollQuestion')?.value.trim();
        const _opts = Array.from(document.querySelectorAll('#pollOptionsList .poll-option-input'))
          .map(i => i.value.trim()).filter(Boolean);
        if (_pq && _opts.length >= 2) _pollData = { question: _pq, options: _opts, votes: {} };
      }
      // Collect schedule data
      let _scheduledAt = null;
      const _si = document.getElementById('scheduleDateInput');
      if (document.getElementById('scheduleSection')?.style.display !== 'none' && _si?.value) {
        const _d = new Date(_si.value);
        if (!isNaN(_d) && _d > new Date()) _scheduledAt = firebase.firestore.Timestamp.fromDate(_d);
      }
      await createPost(boardId, content, imageUrl, videoUrl, allPhotos, currentBoardData?.title || '', thumbUrl, allVideos, allThumbs, currentBoardData?.groupId || null, pendingLinkPreview, allMedia.length ? allMedia : null, _pollData, _scheduledAt);

      // Also share as Story if toggle is active
      if (document.getElementById('storyToggleBtn')?.classList.contains('active')) {
        try {
          const storyMediaUrl  = imageUrl || videoUrl;
          const storyMediaType = imageUrl ? 'image' : 'video';
          const storyThumbUrl  = storyMediaType === 'video' ? thumbUrl : null;
          if (storyMediaUrl) {
            const now     = firebase.firestore.Timestamp.now();
            const expires = firebase.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 3600 * 1000));
            await db.collection('stories').add({
              boardId,
              authorId:   currentUserId,
              authorName: currentUserData.name || getCurrentUser()?.displayName || 'Member',
              mediaUrl:   storyMediaUrl,
              mediaType:  storyMediaType,
              thumbUrl:   storyThumbUrl,
              caption:    content.slice(0, 120) || '',
              createdAt:  now,
              expiresAt:  expires,
              seenBy:     [currentUserId],
            });
          }
        } catch (storyErr) {
          console.warn('[Story] Could not auto-share to story:', storyErr.message);
        }
      }

      closeModal();
      await Promise.all([loadPosts(true), loadStories()]);
    } catch (err) {
      alert('Error creating post: ' + err.message);
    } finally {
      isSubmitting = false;
      if (postBtn) { postBtn.disabled = false; postBtn.textContent = 'Post'; }
      if (addMediaBtn) addMediaBtn.disabled = false;
    }
  });
}

// ── Link preview ─────────────────────────────────────────────────

function buildLinkPreviewHtml(lp) {
  if (!lp || !lp.url) return '';
  let domain = '';
  try { domain = new URL(lp.url).hostname.replace(/^www\./, ''); } catch (e) { /* ignore */ }
  const imgMarkup = lp.image
    ? `<img class="link-preview-img" src="${esc(lp.image)}" alt="" loading="lazy">`
    : '';
  return `<a class="link-preview-card" href="${esc(lp.url)}" target="_blank" rel="noopener noreferrer">
    ${imgMarkup}
    <div class="link-preview-body">
      ${domain ? `<div class="link-preview-domain">${esc(domain)}</div>` : ''}
      ${lp.title ? `<div class="link-preview-title">${esc(lp.title)}</div>` : ''}
      ${lp.description ? `<div class="link-preview-desc">${esc(lp.description)}</div>` : ''}
    </div>
  </a>`;
}

// URL detection in caption textarea
(function setupLinkPreview() {
  const WORKER_URL = 'https://sbd-upload-signer.sbdnetwork.workers.dev';
  const bar = document.getElementById('linkPreviewBar');
  const dismiss = document.getElementById('dismissLinkPreview');
  const domainEl = document.getElementById('linkPreviewDomain');
  const titleEl = document.getElementById('linkPreviewTitle');
  const thumbEl = document.getElementById('linkPreviewThumb');
  if (!bar || !dismiss) return;

  const urlRegex = /https?:\/\/[^\s"'<>]+/i;
  let lastFetchedUrl = null;
  let debounceTimer = null;

  async function fetchPreview(url) {
    if (lastFetchedUrl === url) return;
    lastFetchedUrl = url;
    try {
      const res = await fetch(`${WORKER_URL}/unfurl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) { hideLinkPreview(); return; }
      const data = await res.json();
      if (!data || data.error) { hideLinkPreview(); return; }
      pendingLinkPreview = data;
      let domain = '';
      try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { /* ignore */ }
      if (domainEl) domainEl.textContent = domain;
      if (titleEl) titleEl.textContent = data.title || url;
      if (thumbEl) {
        if (data.image) { thumbEl.src = data.image; thumbEl.style.display = 'block'; }
        else { thumbEl.style.display = 'none'; }
      }
      bar.style.display = '';
    } catch (err) {
      hideLinkPreview();
    }
  }

  function hideLinkPreview() {
    pendingLinkPreview = null;
    lastFetchedUrl = null;
    bar.style.display = 'none';
  }

  dismiss && dismiss.addEventListener('click', () => {
    hideLinkPreview();
    lastFetchedUrl = 'dismissed';
  });

  // Hook into textarea once modal opens
  document.getElementById('createPostBtn')?.addEventListener('click', () => {
    setTimeout(() => {
      const ta = document.getElementById('postContent');
      if (!ta || ta._lpInitialized) return;
      ta._lpInitialized = true;
      ta.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const match = ta.value.match(urlRegex);
          if (match) fetchPreview(match[0]);
          else hideLinkPreview();
        }, 800);
      });
    }, 100);
  });
})();

// ── Save to Collection ────────────────────────────────────────────

document.getElementById('ctxSaveCollection') && document.getElementById('ctxSaveCollection').addEventListener('click', async () => {
  const post = ctxPost;
  closeContextMenu();
  if (post) await openSaveCollectionModal(post);
});

const COLLECTIONS_WORKER = 'https://sbd-upload-signer.sbdnetwork.workers.dev';

async function _colsCall(action, colPayload) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const idToken = await user.getIdToken();
  const res = await fetch(`${COLLECTIONS_WORKER}/collections`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, collection: colPayload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Worker error');
  return data;
}

async function openSaveCollectionModal(post) {
  const modal = document.getElementById('saveColModal');
  const listEl = document.getElementById('saveColList');
  const closeBtn = document.getElementById('saveColClose');
  const newColBtn = document.getElementById('newColBtn');
  if (!modal || !listEl) return;

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  listEl.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:0.9rem;">Loading…</div>';

  const close = () => { modal.style.display = 'none'; document.body.style.overflow = ''; };
  closeBtn && (closeBtn.onclick = close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  if (!auth.currentUser) { close(); return; }

  let cols = [];
  try {
    const data = await _colsCall('get');
    cols = data.collections || [];
  } catch (err) {
    listEl.innerHTML = '<div style="padding:16px;color:#f55;">Error loading collections.</div>';
    return;
  }

  function renderList() {
    if (!cols.length) {
      listEl.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:0.9rem;">No collections yet. Create one below.</div>';
      return;
    }
    listEl.innerHTML = cols.map(col => {
      const saved = (col.postIds || []).includes(post.id);
      return `<button class="save-col-item" data-colid="${esc(col.id)}" style="display:flex;align-items:center;justify-content:space-between;width:100%;background:none;border:none;border-bottom:1px solid var(--border-color);padding:14px 20px;cursor:pointer;color:var(--text-primary);font-size:0.9rem;text-align:left;">
        <span>${esc(col.name)}</span>
        <span style="color:${saved ? 'var(--accent-primary)' : 'var(--text-muted)'};">${saved ? '✓ Saved' : 'Save'}</span>
      </button>`;
    }).join('');

    listEl.querySelectorAll('.save-col-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const colId = btn.dataset.colid;
        const col = cols.find(c => c.id === colId);
        if (!col) return;
        const postIds = col.postIds || [];
        const isSaved = postIds.includes(post.id);
        const newIds = isSaved ? postIds.filter(p => p !== post.id) : [...postIds, post.id];
        try {
          await _colsCall('update', { id: colId, postIds: newIds });
          col.postIds = newIds;
          showToast(isSaved ? 'Removed from collection' : 'Saved to collection');
          renderList();
        } catch (err) {
          showToast('Error saving to collection');
        }
      });
    });
  }

  renderList();

  if (newColBtn) {
    newColBtn.onclick = async () => {
      const name = window.prompt('Collection name:');
      if (!name || !name.trim()) return;
      try {
        const data = await _colsCall('create', { name: name.trim(), postIds: [post.id] });
        cols.unshift(data.collection);
        renderList();
        showToast('Collection created');
      } catch (err) {
        showToast('Error creating collection');
      }
    };
  }
}

// ── Nav buttons ──────────────────────────────────────────────────
backBtn && backBtn.addEventListener('click', () => {
  const gid = currentBoardData && currentBoardData.groupId;
  window.location.href = gid ? `group.html?id=${gid}` : 'dashboard.html';
});

logoutBtn && logoutBtn.addEventListener('click', async () => {
  await auth.signOut();
  window.location.href = 'index.html';
});

// ── Comments ──────────────────────────────────────────────────────
async function loadComments(postId, commentList, toggleBtn, onReply) {
  commentList.innerHTML = '<li class="comment-loading">Loading…</li>';
  try {
    const snap = await db.collection('comments')
      .where('postId', '==', postId)
      .get();

    // Sort by timestamp client-side (avoids requiring a composite index)
    const docs = snap.docs.slice().sort((a, b) => {
      const ta = a.data().timestamp;
      const tb = b.data().timestamp;
      if (!ta || !tb) return 0;
      return ta.seconds - tb.seconds;
    });

    commentList.innerHTML = '';
    if (docs.length === 0) {
      commentList.innerHTML = '<li class="comment-empty">No comments yet.</li>';
    } else {
      docs.forEach(doc => {
        commentList.appendChild(renderComment({ id: doc.id, ...doc.data() }, onReply));
      });
    }

    if (toggleBtn) {
      updateCommentToggleLabel(toggleBtn, docs.length);
    }
  } catch (err) {
    commentList.innerHTML = '<li class="comment-empty">Could not load comments.</li>';
    console.error('loadComments error:', err);
  }
}

const COMMENT_EMOJIS = ['❤️','😂','👍','🔥','😢','😮','🙏'];

function renderCommentReactionRow(li, reactions) {
  let row = li.querySelector('.comment-reaction-row');
  if (!row) return;
  const entries = Object.entries(reactions || {}).filter(([, uids]) => Array.isArray(uids) && uids.length > 0);
  row.innerHTML = entries.map(([emoji, uids]) => `
    <button class="comment-reaction-chip ${uids.includes(currentUserId) ? 'mine' : ''}"
            data-emoji="${emoji}" type="button">
      ${emoji} <span class="rcount">${uids.length}</span>
    </button>
  `).join('');

  const commentId = li.dataset.commentId;
  row.querySelectorAll('.comment-reaction-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const emoji = chip.dataset.emoji;
      try {
        await reactToComment(commentId, emoji, currentUserId);
        const doc = await db.collection('comments').doc(commentId).get();
        if (doc.exists) {
          const newReactions = doc.data().reactions || {};
          // Sync emoji-btn reacted state
          li.querySelectorAll('.comment-emoji-btn').forEach(b => {
            b.classList.toggle('reacted', (newReactions[b.dataset.emoji] || []).includes(currentUserId));
          });
          renderCommentReactionRow(li, newReactions);
        }
      } catch (err) {
        console.warn('Comment reaction error:', err);
      }
    });
  });
}

function renderComment(comment, onReply) {
  const li = document.createElement('li');
  li.className = 'comment-item';
  li.id = 'comment-' + comment.id;
  li.dataset.commentId = comment.id;

  const canModify = comment.authorId === currentUserId || currentIsAdmin;
  const dateStr   = comment.timestamp ? formatDate(comment.timestamp) : 'just now';

  const quoteBubbleHtml = comment.replyTo ? `
    <div class="comment-quote-bubble">
      <span class="comment-quote-author">${esc(comment.replyTo.authorName || 'Member')}</span>
      ${comment.replyTo.thumbUrl
        ? `<img class="comment-quote-thumb" src="${esc(comment.replyTo.thumbUrl)}" alt="${comment.replyTo.mediaType === 'video' ? 'Video' : 'Photo'}">`
        : `<p class="comment-quote-text">${esc((comment.replyTo.text || '').slice(0, 80))}</p>`
      }
    </div>
  ` : '';

  const emojiBarHtml = COMMENT_EMOJIS.map(e => {
    const uids = (comment.reactions || {})[e] || [];
    return `<button class="comment-emoji-btn${uids.includes(currentUserId) ? ' reacted' : ''}" data-emoji="${e}" type="button">${e}</button>`;
  }).join('');

  li.innerHTML = `
    <div class="comment-meta">
      <span class="comment-author"><a href="/member.html?uid=${esc(comment.authorId || '')}" class="comment-author-link">${esc(comment.authorName || 'Member')}</a></span>
      <span class="comment-date">${dateStr}</span>
      ${onReply ? `<button class="comment-reply-btn" type="button">↩ Reply</button>` : ''}
      ${canModify ? `<button class="edit-comment-btn" type="button" aria-label="Edit comment">✏️ Edit</button>` : ''}
      ${canModify ? `<button class="delete-comment-btn" type="button" aria-label="Delete comment">✕</button>` : ''}
    </div>
    ${quoteBubbleHtml}
    <p class="comment-text">${escAndLinkify(comment.text)}</p>
    <div class="comment-action-bar">
      ${emojiBarHtml}
      <button class="comment-copy-link-btn" type="button" title="Copy link to comment">🔗</button>
    </div>
    <div class="comment-reaction-row"></div>
  `;

  // Wire quote-bubble click → open quoted media
  if (comment.replyTo?.mediaUrl) {
    const quoteBubble = li.querySelector('.comment-quote-bubble');
    if (quoteBubble) {
      quoteBubble.style.cursor = 'pointer';
      quoteBubble.addEventListener('click', () => {
        const { mediaUrl, mediaType } = comment.replyTo;
        if (mediaType === 'video') {
          openVideoOverlay([mediaUrl], 0, '');
        } else {
          // Find in global lightboxPhotos list, or inject temporarily
          let idx = lightboxPhotos.findIndex(p => p.url === mediaUrl);
          if (idx === -1) {
            lightboxPhotos.push({ url: mediaUrl, caption: '' });
            idx = lightboxPhotos.length - 1;
          }
          openLightbox(idx);
        }
      });
    }
  }

  // Render existing reaction chips
  renderCommentReactionRow(li, comment.reactions || {});

  // Wire emoji reaction buttons
  li.querySelectorAll('.comment-emoji-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const emoji = btn.dataset.emoji;
      try {
        await reactToComment(comment.id, emoji, currentUserId);
        const doc = await db.collection('comments').doc(comment.id).get();
        if (doc.exists) {
          comment.reactions = doc.data().reactions || {};
          li.querySelectorAll('.comment-emoji-btn').forEach(b => {
            b.classList.toggle('reacted', (comment.reactions[b.dataset.emoji] || []).includes(currentUserId));
          });
          renderCommentReactionRow(li, comment.reactions);
        }
      } catch (err) {
        console.warn('Comment reaction error:', err);
      }
    });
  });

  // Wire copy-link button
  li.querySelector('.comment-copy-link-btn').addEventListener('click', () => {
    const url = `${location.origin}/board.html?boardId=${encodeURIComponent(boardId)}&comment=${encodeURIComponent(comment.id)}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => showToast('Comment link copied!')).catch(() => prompt('Copy this link:', url));
    } else {
      prompt('Copy this link:', url);
    }
  });

  // Wire reply button
  const replyBtn = li.querySelector('.comment-reply-btn');
  if (replyBtn && onReply) {
    replyBtn.addEventListener('click', () => onReply(comment));
  }

  // Edit comment — inline
  const editBtn = li.querySelector('.edit-comment-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      const textEl = li.querySelector('.comment-text');
      const currentText = comment.text || '';

      // Replace paragraph with a textarea
      const ta = document.createElement('textarea');
      ta.className = 'comment-edit-input';
      ta.value = currentText;
      ta.rows  = Math.max(2, currentText.split('\n').length);
      textEl.replaceWith(ta);
      ta.focus();

      const saveRow = document.createElement('div');
      saveRow.className = 'comment-edit-actions';
      saveRow.innerHTML = `
        <button class="btn btn-primary btn-sm comment-edit-save">Save</button>
        <button class="btn btn-secondary btn-sm comment-edit-cancel">Cancel</button>
      `;
      ta.after(saveRow);

      editBtn.style.display = 'none';

      const cancelEdit = () => {
        ta.replaceWith(textEl);
        saveRow.remove();
        editBtn.style.display = '';
      };

      saveRow.querySelector('.comment-edit-cancel').onclick = cancelEdit;

      saveRow.querySelector('.comment-edit-save').onclick = async () => {
        const newText = ta.value.trim();
        if (!newText) return;
        const saveBtn = saveRow.querySelector('.comment-edit-save');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        try {
          await editComment(comment.id, newText);
          comment.text     = newText;
          textEl.textContent = newText;
          ta.replaceWith(textEl);
          saveRow.remove();
          editBtn.style.display = '';
        } catch (err) {
          alert('Could not save: ' + err.message);
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save';
        }
      };
    });
  }

  // Delete comment
  const delBtn = li.querySelector('.delete-comment-btn');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      if (!confirm('Delete this comment?')) return;
      const card = li.closest('.post-card');
      try {
        await deleteComment(comment.id, comment.postId);
        li.remove();
        if (card) {
          const tb    = card.querySelector('.comment-toggle-btn');
          const count = Math.max(0, parseInt(tb && tb.dataset.count || '1') - 1);
          if (tb) updateCommentToggleLabel(tb, count);
        }
      } catch (err) {
        alert('Could not delete comment: ' + err.message);
      }
    });
  }

  return li;
}

function updateCommentToggleLabel(btn, count) {
  btn.dataset.count = count;
  btn.textContent   = count > 0
    ? `💬 ${count} comment${count !== 1 ? 's' : ''}`
    : '💬 Comment';
}

// ── Helpers ───────────────────────────────────────────────────────
function showLoading(show, message) {
  if (!loadingOverlay) return;
  loadingOverlay.style.display = show ? 'flex' : 'none';
  if (loadingStatus) loadingStatus.textContent = show && message ? message : '';
}

function formatDate(ts) {
  if (!ts) return '';
  let d;
  if (typeof ts.toDate === 'function') {
    // Native Firestore Timestamp object
    d = ts.toDate();
  } else if (ts.seconds !== undefined) {
    // Plain object { seconds, nanoseconds } — happens with seeded / imported data
    d = new Date(ts.seconds * 1000);
  } else {
    d = new Date(ts);
  }
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    + ' · '
    + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Escape HTML and linkify @mentions and #hashtags
function escAndLinkify(str) {
  if (!str) return '';
  // First escape HTML
  let escaped = esc(str);
  // Then linkify if functions are available
  if (typeof linkifyContent === 'function') {
    return linkifyContent(escaped);
  }
  return escaped;
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT MENU — open / close / actions
// ═══════════════════════════════════════════════════════════════

function openContextMenu(post, card) {
  ctxPost = post;
  ctxCard = card;

  // Update pin label
  document.getElementById('ctxPinLabel').textContent = post.isPinned ? 'Unpin' : 'Pin';

  // Show/hide items based on permission
  const canManage = post.authorId === currentUserId || currentIsAdmin;
  document.getElementById('ctxEdit').style.display   = canManage     ? '' : 'none';
  document.getElementById('ctxDelete').style.display = canManage     ? '' : 'none';
  document.getElementById('ctxPin').style.display    = currentIsAdmin ? '' : 'none';
  
  // Show "Post to Story" only if post has media (image or video)
  const hasMedia = !!(post.imageUrl || post.videoUrl || (post.allMedia && post.allMedia.length));
  document.getElementById('ctxPostToStory').style.display = hasMedia ? '' : 'none';

  // Show "Apply This Expression" for Fashion/Style boards (Muliebrity/Virility)
  const applyExpressionBtn = document.getElementById('ctxApplyExpression');
  if (applyExpressionBtn) {
    const boardName = currentBoardData?.name || '';
    console.log('[Apply Expression] Board name:', boardName);
    const isExpressionBoard = /muliebrity|virility|corporate|casual|official|fashion|style/i.test(boardName);
    console.log('[Apply Expression] Is expression board:', isExpressionBoard, 'Has media:', hasMedia);
    applyExpressionBtn.style.display = (isExpressionBoard && hasMedia) ? '' : 'none';
  }

  // Highlight emojis user has already reacted with
  const mySet = new Set(
    Object.entries(post.reactions || {})
      .filter(([, uids]) => Array.isArray(uids) && uids.includes(currentUserId))
      .map(([emoji]) => emoji)
  );
  postCtxMenu.querySelectorAll('.ctx-emoji-btn').forEach(btn => {
    btn.classList.toggle('reacted', mySet.has(btn.dataset.emoji));
  });

  postCtxOverlay.style.display = 'block';
  postCtxMenu.style.display    = 'block';
}

function closeContextMenu() {
  postCtxOverlay.style.display = 'none';
  postCtxMenu.style.display    = 'none';
  ctxPost = null;
  ctxCard = null;
}

// Set up singleton context menu listeners once
postCtxOverlay.addEventListener('click', closeContextMenu);

postCtxMenu.querySelectorAll('.ctx-emoji-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const post = ctxPost;
    if (!post) return;
    const emoji = btn.dataset.emoji;
    // Optimistically update local post.reactions so highlight is correct next open
    post.reactions = post.reactions || {};
    post.reactions[emoji] = post.reactions[emoji] || [];
    const idx = post.reactions[emoji].indexOf(currentUserId);
    if (idx === -1) post.reactions[emoji].push(currentUserId);
    else            post.reactions[emoji].splice(idx, 1);
    const card = ctxCard;
    closeContextMenu();
    try {
      await reactToPost(post.id, emoji, currentUserId);
    } catch (err) {
      console.warn('Reaction error:', err);
    }
    // Re-fetch true server state and re-render chips
    const doc = await db.collection('posts').doc(post.id).get().catch(() => null);
    if (doc && doc.exists) {
      post.reactions = doc.data().reactions || {};
      renderReactionChips(card, post.reactions, post.id);
    }
  });
});

document.getElementById('ctxPostToStory').addEventListener('click', async () => {
  const post = ctxPost;
  closeContextMenu();
  if (!post) return;
  
  // Determine media type and URL
  let mediaUrl, mediaType, thumbUrl = null;
  
  if (post.allMedia && post.allMedia.length > 0) {
    // Use first media item
    const firstMedia = post.allMedia[0];
    mediaUrl = firstMedia.url;
    mediaType = firstMedia.type; // 'image' or 'video'
    thumbUrl = firstMedia.thumbUrl || null;
  } else if (post.videoUrl) {
    mediaUrl = post.videoUrl;
    mediaType = 'video';
    // Try thumbUrl, then imageUrl as fallback thumbnail
    thumbUrl = post.thumbUrl || post.imageUrl || null;
  } else if (post.imageUrl) {
    mediaUrl = post.imageUrl;
    mediaType = 'image';
  } else {
    showToast('No media to share');
    return;
  }
  
  // Create story
  try {
    const now = firebase.firestore.Timestamp.now();
    const expires = firebase.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 3600 * 1000));
    await db.collection('stories').add({
      boardId,
      authorId: currentUserId,
      authorName: currentUserData.name || getCurrentUser()?.displayName || 'Member',
      mediaUrl,
      mediaType,
      thumbUrl: thumbUrl || null,
      caption: post.content ? post.content.slice(0, 120) : '',
      createdAt: now,
      expiresAt: expires,
      seenBy: [currentUserId],
    });
    await loadStories();
    showToast('Posted to your story!');
  } catch (err) {
    console.error('Failed to post to story:', err);
    showToast('Failed to post to story');
  }
});

// Apply This Expression - Save to MV House Wardrobe
document.getElementById('ctxApplyExpression').addEventListener('click', async () => {
  const post = ctxPost;
  closeContextMenu();
  if (!post) return;

  // Determine expression context based on board
  const boardName = currentBoardData?.name || '';
  let context = 'corporate'; // default
  const nameLower = boardName.toLowerCase();
  
  if (nameLower.includes('corporate')) context = 'corporate';
  else if (nameLower.includes('casual')) {
    if (nameLower.includes('night')) context = 'casual-night';
    else if (nameLower.includes('home')) context = 'casual-home';
    else if (nameLower.includes('day')) context = 'casual-day';
    else context = 'casual-day'; // default casual
  }
  else if (nameLower.includes('official')) context = 'official';

  try {
    // Get media from post
    let mediaUrl = null;
    if (post.allMedia && post.allMedia.length > 0) {
      mediaUrl = post.allMedia[0].url;
    } else if (post.imageUrl) {
      mediaUrl = post.imageUrl;
    } else if (post.videoUrl) {
      mediaUrl = post.videoUrl;
    }

    // Create look object
    const look = {
      postId: post.id,
      boardId: boardId,
      boardName: boardName,
      mediaUrl: mediaUrl,
      content: post.content || '',
      expressionType: context,
      savedAt: firebase.firestore.Timestamp.now(),
      status: 'saved'
    };

    // Get existing wardrobe or create new
    const wardrobeRef = db.collection('users')
      .doc(currentUserId)
      .collection('wardrobes')
      .doc(context);

    const wardrobeDoc = await wardrobeRef.get();
    let looks = [];
    let completeness = 0;

    if (wardrobeDoc.exists) {
      looks = wardrobeDoc.data().looks || [];
      completeness = wardrobeDoc.data().completeness || 0;
    }

    // Add new look
    looks.push(look);

    // Calculate completeness (simple: 10 looks = 100%)
    completeness = Math.min(looks.length / 10, 1.0);

    // Update wardrobe
    await wardrobeRef.set({
      looks: looks,
      completeness: completeness,
      updatedAt: firebase.firestore.Timestamp.now()
    }, { merge: true });

    const contextName = context.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    showToast(`✓ Applied to ${contextName} Wardrobe`);

  } catch (err) {
    console.error('Failed to apply expression:', err);
    showToast('Failed to save expression');
  }
});


document.getElementById('ctxReply').addEventListener('click', () => {
  const card = ctxCard;
  closeContextMenu();
  if (!card) return;
  const section = card.querySelector('.comment-section');
  const input   = card.querySelector('.comment-input');
  if (section.style.display === 'none') {
    // Trigger the toggle button so comments load too
    card.querySelector('.comment-toggle-btn').click();
  }
  setTimeout(() => input && input.focus(), 150);
});

document.getElementById('ctxEdit').addEventListener('click', () => {
  const post = ctxPost; const card = ctxCard;
  closeContextMenu();
  if (post && card) openEditModal(post, card);
});

document.getElementById('ctxPin').addEventListener('click', async () => {
  const post = ctxPost; const card = ctxCard;
  closeContextMenu();
  if (!post) return;
  try {
    await pinPost(post.id, post.isPinned);
    post.isPinned = !post.isPinned;
    // Update pin badge in card
    const meta = card.querySelector('.post-meta');
    let badge  = meta.querySelector('.post-pinned-badge');
    if (post.isPinned) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'post-pinned-badge';
        meta.appendChild(badge);
      }
      badge.textContent = '📌 Pinned';
    } else {
      if (badge) badge.remove();
    }
    // Sync pinned banner
    if (post.isPinned) {
      if (!pinnedPosts.find(p => p.id === post.id)) pinnedPosts.unshift(post);
    } else {
      pinnedPosts = pinnedPosts.filter(p => p.id !== post.id);
    }
    pinnedBannerIndex = 0;
    pinnedBannerDismissed = false;
    updatePinnedBanner();
    showToast(post.isPinned ? 'Post pinned' : 'Post unpinned');
  } catch (err) {
    alert('Could not pin: ' + err.message);
  }
});

document.getElementById('ctxCopyLink').addEventListener('click', () => {
  const post = ctxPost;
  closeContextMenu();
  if (!post) return;
  const url = `${location.origin}/board.html?boardId=${encodeURIComponent(boardId)}&post=${encodeURIComponent(post.id)}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => showToast('Link copied!')).catch(() => prompt('Copy this link:', url));
  } else {
    prompt('Copy this link:', url);
  }
});

document.getElementById('ctxForward').addEventListener('click', async () => {
  const post = ctxPost;
  closeContextMenu();
  if (post) await openForwardModal(post);
});

// ── Repost with Thoughts ──────────────────────────────────────────
document.getElementById('ctxRepost').addEventListener('click', async () => {
  const post = ctxPost;
  closeContextMenu();
  if (post) await openRepostModal(post);
});

async function openRepostModal(post) {
  const modal = document.getElementById('repostModal');
  const thoughtsInput = document.getElementById('repostThoughts');
  const originalAuthor = document.getElementById('repostOriginalAuthor');
  const originalContent = document.getElementById('repostOriginalContent');
  const originalMedia = document.getElementById('repostOriginalMedia');
  const boardList = document.getElementById('repostBoardList');
  const closeBtn = document.getElementById('repostModalClose');

  if (!modal) return;

  // Clear previous state
  thoughtsInput.value = '';
  originalAuthor.textContent = post.authorName || 'Member';
  originalContent.textContent = post.content || 'Post with media';
  
  // Show media preview if exists
  originalMedia.innerHTML = '';
  if (post.imageUrl) {
    originalMedia.innerHTML = `<img src="${post.imageUrl}" alt="" style="max-width:100%;max-height:120px;border-radius:8px;object-fit:cover;">`;
  } else if (post.videoUrl) {
    originalMedia.innerHTML = `<video src="${post.videoUrl}" style="max-width:100%;max-height:120px;border-radius:8px;object-fit:cover;" muted></video>`;
  } else if (post.allMedia && post.allMedia.length > 0) {
    const firstMedia = post.allMedia[0];
    if (firstMedia.type === 'image') {
      originalMedia.innerHTML = `<img src="${firstMedia.url}" alt="" style="max-width:100%;max-height:120px;border-radius:8px;object-fit:cover;">`;
    } else if (firstMedia.type === 'video') {
      const thumb = firstMedia.thumbUrl || firstMedia.url;
      originalMedia.innerHTML = `<img src="${thumb}" alt="" style="max-width:100%;max-height:120px;border-radius:8px;object-fit:cover;">`;
    }
  }

  // Simple board selection - default to current board, show option to pick different one
  boardList.innerHTML = `
    <div style="margin-bottom:12px;">
      <button class="btn btn-primary" id="repostToCurrentBoard" style="width:100%;font-size:0.95rem;padding:12px;">
        🔄 Repost to This Board
      </button>
    </div>
    <div style="text-align:center;margin:12px 0;color:var(--text-muted);font-size:0.85rem;">or</div>
    <details style="border:1px solid var(--border-color);border-radius:8px;padding:8px;">
      <summary style="cursor:pointer;padding:8px;font-size:0.9rem;color:var(--text-secondary);">Choose a Different Board</summary>
      <div id="otherBoardsList" style="margin-top:8px;max-height:200px;overflow-y:auto;">
        <div class="loading-skeleton" style="height:40px;border-radius:8px;"></div>
      </div>
    </details>
  `;

  // Handle "Repost to Current Board" button
  modal.addEventListener('click', async (e) => {
    if (e.target.id === 'repostToCurrentBoard') {
      const userThoughts = thoughtsInput.value.trim();
      await submitRepost(post, boardId, userThoughts);
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  });

  // Load other boards asynchronously when details is opened
  const detailsEl = boardList.querySelector('details');
  const otherBoardsList = document.getElementById('otherBoardsList');
  let otherBoardsLoaded = false;

  detailsEl?.addEventListener('toggle', async function() {
    if (this.open && !otherBoardsLoaded) {
      otherBoardsLoaded = true;
      
      try {
        const boardsSnapshot = await db.collection('boards')
          .where('members', 'array-contains', currentUserId)
          .get();
        
        if (boardsSnapshot.empty) {
          otherBoardsList.innerHTML = '<div style="color:var(--text-muted);padding:12px;text-align:center;font-size:0.85rem;">No other boards available.</div>';
          return;
        }
        
        const boards = boardsSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(board => board.id !== boardId); // Exclude current board
        
        if (boards.length === 0) {
          otherBoardsList.innerHTML = '<div style="color:var(--text-muted);padding:12px;text-align:center;font-size:0.85rem;">No other boards available.</div>';
          return;
        }
        
        otherBoardsList.innerHTML = boards.map(board => `
          <div class="forward-board-item" style="display:flex;justify-content:space-between;align-items:center;padding:8px;margin:4px 0;border-radius:6px;background:var(--bg-secondary);">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:500;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(board.title)}</div>
            </div>
            <button class="btn btn-secondary" data-board-id="${board.id}" style="font-size:0.85rem;padding:6px 12px;margin-left:8px;">Repost</button>
          </div>
        `).join('');

        // Handle clicks on other board buttons
        otherBoardsList.querySelectorAll('button[data-board-id]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const targetBoardId = btn.getAttribute('data-board-id');
            const userThoughts = thoughtsInput.value.trim();
            await submitRepost(post, targetBoardId, userThoughts);
            modal.style.display = 'none';
            document.body.style.overflow = '';
          });
        });

      } catch (error) {
        console.error('Error loading boards for repost:', error);
        otherBoardsList.innerHTML = '<div style="color:var(--error);padding:12px;text-align:center;font-size:0.85rem;">Error loading boards.</div>';
      }
    }
  });

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  thoughtsInput.focus();

  const close = () => {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  };

  closeBtn.onclick = close;
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
}

async function submitRepost(originalPost, targetBoardId, userThoughts) {
  try {
    showLoading(true);
    
    const user = getCurrentUser();
    if (!user) throw new Error('Not signed in');

    // ALWAYS fetch the complete post data from Firestore to ensure all fields are present
    let fullPostData = originalPost;
    try {
      console.log('[Repost] Fetching full post data for:', originalPost.id);
      const postDoc = await db.collection('posts').doc(originalPost.id).get();
      if (postDoc.exists) {
        fullPostData = { id: postDoc.id, ...postDoc.data() };
        console.log('[Repost] Full post data:', fullPostData);
        console.log('[Repost] Available fields:', Object.keys(fullPostData));
      } else {
        console.warn('[Repost] Post document does not exist:', originalPost.id);
      }
    } catch (fetchErr) {
      console.error('[Repost] Error fetching full post data:', fetchErr);
    }
    
    // Ensure we have an authorId - try multiple possible field names
    const postAuthorId = fullPostData.authorId || 
                         fullPostData.userId || 
                         fullPostData.author?.id || 
                         fullPostData.author?.uid ||
                         originalPost.authorId ||
                         originalPost.userId;
    
    // If still no author ID, log error and use current user as fallback
    if (!postAuthorId) {
      console.error('[Repost] WARNING: No author ID found in post data. Full data:', fullPostData);
      console.error('[Repost] Using current user ID as fallback');
    }
    
    const safeAuthorId = postAuthorId || currentUserId;
    const safeAuthorName = fullPostData.authorName || 
                          fullPostData.userName || 
                          fullPostData.author?.name ||
                          fullPostData.author?.displayName ||
                          'Member';
    
    console.log('[Repost] Using authorId:', safeAuthorId, 'authorName:', safeAuthorName);
    
    // Create repost data with guaranteed non-undefined values
    const repostData = {
      content: userThoughts || '', // User's thoughts go in the main content
      boardId: targetBoardId,
      authorId: currentUserId,
      authorName: currentUserData.name || user.displayName || 'Member',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      
      // Original post data embedded
      repostedFrom: {
        postId: fullPostData.id,
        authorId: safeAuthorId, // Guaranteed to have a value
        authorName: safeAuthorName,
        content: fullPostData.content || '',
        timestamp: fullPostData.timestamp || firebase.firestore.FieldValue.serverTimestamp(),
      },
      
      // Preserve media references from original post
      imageUrl: fullPostData.imageUrl || null,
      videoUrl: fullPostData.videoUrl || null,
      thumbUrl: fullPostData.thumbUrl || null,
      allMedia: fullPostData.allMedia || null,
      
      reactions: {},
      commentCount: 0,
    };
    
    console.log('[Repost] Submitting repost data:', repostData);

    await db.collection('posts').add(repostData);
    
    showToast('Reposted successfully!');
    
    // If reposting to current board, refresh the feed
    if (targetBoardId === boardId) {
      await loadPosts(true);
    }
    
  } catch (err) {
    console.error('[Repost] Error:', err);
    showToast('Failed to repost: ' + err.message);
  } finally {
    showLoading(false);
  }
}

// ── Share via DM ──────────────────────────────────────────────────
document.getElementById('ctxShareDm').addEventListener('click', async () => {
  const post = ctxPost;
  closeContextMenu();
  if (post) await openShareDmModal(post);
});

async function openShareDmModal(post) {
  const modal    = document.getElementById('shareDmModal');
  const list     = document.getElementById('shareDmUserList');
  const searchEl = document.getElementById('shareDmSearch');
  const closeBtn = document.getElementById('shareDmClose');

  list.innerHTML = '<div style="padding:16px;color:rgba(255,255,255,0.4);">Loading members\u2026</div>';
  searchEl.value = '';
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  const close = () => { modal.style.display = 'none'; document.body.style.overflow = ''; };
  closeBtn.onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };

  let peers = [];
  try {
    peers = await fetchDmPeers();
  } catch (err) {
    list.innerHTML = `<div style="padding:16px;color:#f55;">${err.message}</div>`;
    return;
  }

  const postUrl = `${location.origin}/board.html?boardId=${encodeURIComponent(boardId)}&post=${encodeURIComponent(post.id)}`;
  const preview = post.content ? post.content.slice(0, 80) : '📎 Shared post';

  function renderPeers(filtered) {
    if (!filtered.length) {
      list.innerHTML = '<div style="padding:16px;color:rgba(255,255,255,0.4);">No members found.</div>';
      return;
    }
    list.innerHTML = '';
    filtered.forEach(u => {
      const row = document.createElement('div');
      row.className = 'dm-peer-row';
      row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.04);';
      row.innerHTML = `
        <div style="width:40px;height:40px;border-radius:50%;background:rgba(0,188,212,0.15);border:1px solid var(--border-color);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--accent-primary);font-size:0.95rem;flex-shrink:0;">
          ${u.photoUrl ? `<img src="${u.photoUrl}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">` : u.name.charAt(0).toUpperCase()}
        </div>
        <span style="font-size:0.9rem;color:var(--text-primary);">${esc(u.name)}</span>
      `;
      row.addEventListener('click', async () => {
        row.style.opacity = '0.5';
        row.style.pointerEvents = 'none';
        try {
          await sendPostAsDm(u, postUrl, preview);
          close();
          showToast('Post shared to ' + u.name);
        } catch (err) {
          showToast('Could not share: ' + err.message);
          row.style.opacity = '';
          row.style.pointerEvents = '';
        }
      });
      list.appendChild(row);
    });
  }

  renderPeers(peers);
  searchEl.oninput = () => {
    const q = searchEl.value.toLowerCase();
    renderPeers(peers.filter(u => u.name.toLowerCase().includes(q)));
  };
}

async function fetchDmPeers() {
  const myGroups = currentUserData.groups || [];
  if (currentIsAdmin) {
    const snap = await db.collection('users').get();
    return snap.docs
      .filter(d => d.id !== currentUserId)
      .map(d => ({ id: d.id, name: d.data().name || d.data().email || 'Member', photoUrl: d.data().photoUrl || null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  if (!myGroups.length) return [];
  const snapsByGroup = await Promise.all(
    myGroups.map(gid => db.collection('users').where('groups', 'array-contains', gid).get())
  );
  const seen = new Map();
  snapsByGroup.forEach(snap => snap.forEach(doc => { if (doc.id !== currentUserId) seen.set(doc.id, doc); }));
  return Array.from(seen.values())
    .map(doc => ({ id: doc.id, name: doc.data().name || doc.data().email || 'Member', photoUrl: doc.data().photoUrl || null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function sendPostAsDm(otherUser, postUrl, preview) {
  // Find existing conversation or create one
  const snap = await db.collection('conversations')
    .where('participantIds', 'array-contains', currentUserId)
    .get();
  const existing = snap.docs.find(doc => doc.data().participantIds.includes(otherUser.id));

  const now   = firebase.firestore.Timestamp.fromDate(new Date());
  const myName = currentUserData.name || auth.currentUser?.displayName || 'Member';
  const msgText = `📎 Shared post: ${preview}\n${postUrl}`;

  let convId;
  if (existing) {
    convId = existing.id;
  } else {
    const ref = await db.collection('conversations').add({
      participantIds: [currentUserId, otherUser.id],
      participantNames:  { [currentUserId]: myName, [otherUser.id]: otherUser.name },
      participantPhotos: { [currentUserId]: currentUserData.photoUrl || null, [otherUser.id]: otherUser.photoUrl },
      lastMessage:   '',
      lastMessageAt: now,
      lastRead:      { [currentUserId]: now, [otherUser.id]: null },
      createdAt:     now,
    });
    convId = ref.id;
  }

  await db.collection('conversations').doc(convId).collection('messages').add({
    senderId:  currentUserId,
    text:      msgText,
    timestamp: now,
  });
  await db.collection('conversations').doc(convId).update({
    lastMessage:   msgText.slice(0, 100),
    lastMessageAt: now,
    [`lastRead.${currentUserId}`]: now,
  });
}

document.getElementById('ctxDelete').addEventListener('click', async () => {
  const post = ctxPost; const card = ctxCard;
  closeContextMenu();
  if (!post) return;
  if (!confirm('Delete this post? This cannot be undone.')) return;
  try {
    await deletePost(post.id);
    card.remove();
  } catch (err) {
    alert('Could not delete post: ' + err.message);
  }
});

// ── Reaction chips on post cards ──────────────────────────────────
function renderReactionChips(card, reactions, postId) {
  // Remove old row
  const old = card.querySelector('.post-reactions');
  if (old) old.remove();

  const entries = Object.entries(reactions || {}).filter(([, uids]) => Array.isArray(uids) && uids.length > 0);
  
  // Update reaction count data attribute for sorting
  let totalReactions = 0;
  Object.values(reactions || {}).forEach(uids => {
    if (Array.isArray(uids)) totalReactions += uids.length;
  });
  card.dataset.reactionCount = totalReactions;
  
  if (!entries.length) return;

  const row = document.createElement('div');
  row.className = 'post-reactions';
  row.innerHTML = entries.map(([emoji, uids]) => `
    <button class="reaction-chip ${uids.includes(currentUserId) ? 'mine' : ''}"
            data-emoji="${emoji}" data-post-id="${postId}" type="button">
      ${emoji} <span class="rcount">${uids.length}</span>
    </button>
  `).join('');

  // Insert before .post-actions
  const actions = card.querySelector('.post-actions');
  card.insertBefore(row, actions);

  // Click any chip to toggle
  row.querySelectorAll('.reaction-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const emoji  = chip.dataset.emoji;
      const postId = chip.dataset.postId;
      const post   = ctxPost && ctxPost.id === postId ? ctxPost : { id: postId, reactions: reactions };
      try {
        await reactToPost(postId, emoji, currentUserId);
        const doc = await db.collection('posts').doc(postId).get();
        if (doc.exists) {
          const newReactions = doc.data().reactions || {};
          if (post) post.reactions = newReactions;
          renderReactionChips(card, newReactions, postId);
        }
      } catch (err) {
        console.warn('Reaction error:', err);
      }
    });
  });
}

// ── Forward modal ─────────────────────────────────────────────────
async function openForwardModal(post) {
  const modal      = document.getElementById('forwardModal');
  const list       = document.getElementById('forwardBoardList');
  const closeBtn   = document.getElementById('forwardModalClose');
  const msgInput   = document.getElementById('forwardMessage');
  const pickerWrap = document.getElementById('forwardMediaPicker');

  // ── Build a flat list of all media items in this post ─────────
  const mediaItems = [];
  if (post.allMedia && post.allMedia.length > 0) {
    post.allMedia.forEach(item => mediaItems.push({ type: item.type, url: item.url, thumbUrl: item.thumbUrl || null }));
  } else {
    if (post.videoUrl) mediaItems.push({ type: 'video', url: post.videoUrl, thumbUrl: post.thumbUrl || null });
    if (Array.isArray(post.allVideos)) {
      post.allVideos.forEach((url, i) => {
        if (url && url !== post.videoUrl) mediaItems.push({ type: 'video', url, thumbUrl: (post.allThumbs || [])[i] || null });
      });
    }
    if (post.imageUrl) mediaItems.push({ type: 'image', url: post.imageUrl, thumbUrl: post.imageUrl });
    if (Array.isArray(post.allPhotos)) {
      post.allPhotos.forEach(url => {
        if (url && url !== post.imageUrl) mediaItems.push({ type: 'image', url, thumbUrl: url });
      });
    }
  }

  // ── Render media picker (only when >1 item) ────────────────────
  const selected = new Set(mediaItems.map((_, i) => i)); // all selected by default
  if (mediaItems.length > 1) {
    pickerWrap.style.display = 'block';
    const renderPicker = () => {
      pickerWrap.innerHTML = `<p class="fwd-picker-label">Select items to forward (${selected.size} of ${mediaItems.length})</p>
        <div class="fwd-media-strip">${mediaItems.map((item, i) => {
          const thumb = item.thumbUrl
            ? `<img src="${esc(item.thumbUrl)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:6px;">`
            : `<div style="width:100%;height:100%;background:#222;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:1.6rem;">${item.type === 'video' ? '🎬' : '🖼'}</div>`;
          const playIcon = item.type === 'video' ? '<span class="fwd-play-overlay">▶</span>' : '';
          const check = selected.has(i) ? '<span class="fwd-check">✓</span>' : '';
          return `<div class="fwd-media-cell${selected.has(i) ? ' selected' : ''}" data-idx="${i}">${thumb}${playIcon}${check}</div>`;
        }).join('')}</div>`;
      // wire tap events
      pickerWrap.querySelectorAll('.fwd-media-cell').forEach(cell => {
        cell.addEventListener('click', () => {
          const idx = parseInt(cell.dataset.idx, 10);
          if (selected.has(idx)) {
            if (selected.size > 1) selected.delete(idx); // keep at least 1 selected
          } else {
            selected.add(idx);
          }
          renderPicker();
        });
      });
    };
    renderPicker();
  } else {
    pickerWrap.style.display = 'none';
    pickerWrap.innerHTML = '';
  }

  list.innerHTML   = '<p style="padding:16px;color:rgba(255,255,255,0.4);">Loading boards…</p>';
  msgInput.value   = '';
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  const close = () => { modal.style.display = 'none'; document.body.style.overflow = ''; msgInput.value = ''; pickerWrap.innerHTML = ''; pickerWrap.style.display = 'none'; };
  closeBtn.onclick = close;
  modal.addEventListener('click', e => { if (e.target === modal) close(); }, { once: true });

  try {
    const snap = await db.collection('boards').orderBy('title').get();
    list.innerHTML = '';
    snap.forEach(doc => {
      if (doc.id === boardId) return;
      const btn = document.createElement('button');
      btn.className   = 'forward-board-item';
      btn.textContent = doc.data().title;
      const targetId  = doc.id;
      btn.addEventListener('click', async () => {
        btn.disabled    = true;
        btn.textContent = 'Forwarding…';
        try {
          const message      = msgInput.value.trim();
          // If picker was shown, pass only selected items; otherwise null = forward all
          const chosenMedia  = mediaItems.length > 1
            ? mediaItems.filter((_, i) => selected.has(i))
            : null;
          await forwardPost(post, targetId, message, chosenMedia);
          close();
          showToast('Post forwarded!');
        } catch (err) {
          alert('Could not forward: ' + err.message);
          btn.disabled    = false;
          btn.textContent = doc.data().title;
        }
      });
      list.appendChild(btn);
    });
    if (!list.children.length) {
      list.innerHTML = '<p style="padding:16px;color:rgba(255,255,255,0.4);">No other boards available.</p>';
    }
  } catch (err) {
    list.innerHTML = `<p style="padding:16px;color:#f55;">${err.message}</p>`;
  }
}

// ── Toast ─────────────────────────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById('appToast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

// ═══════════════════════════════════════════════════════════════
// PINNED BANNER + PINNED MESSAGES LIST
// ═══════════════════════════════════════════════════════════════

async function loadPinnedPosts() {
  try {
    const snap = await db.collection('posts')
      .where('boardId', '==', boardId)
      .where('isPinned', '==', true)
      .get();
    pinnedPosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Newest first
    pinnedPosts.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
  } catch (err) {
    console.warn('loadPinnedPosts error:', err);
    pinnedPosts = [];
  }
  pinnedBannerIndex = 0;
  updatePinnedBanner();
}

function updatePinnedBanner() {
  const banner = document.getElementById('pinnedBanner');
  if (!banner) return;
  if (!pinnedPosts.length || pinnedBannerDismissed) {
    banner.style.display = 'none';
    return;
  }
  const post    = pinnedPosts[pinnedBannerIndex];
  const preview = post.content
    ? post.content.slice(0, 80)
    : (post.allVideos?.length ? '📹 Video' : post.imageUrl ? '🖼 Photo' : '📌 Pinned post');
  document.getElementById('pinnedBannerPreview').textContent = preview;
  const countEl = document.getElementById('pinnedBannerCount');
  if (pinnedPosts.length > 1) {
    countEl.textContent  = `${pinnedBannerIndex + 1}/${pinnedPosts.length}`;
    countEl.style.display = 'inline';
  } else {
    countEl.style.display = 'none';
  }
  banner.style.display = 'flex';
}

function scrollToPinnedPost(postId) {
  const card = postsContainer.querySelector(`[data-post-id="${postId}"]`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('pin-highlight');
    card.addEventListener('animationend', () => card.classList.remove('pin-highlight'), { once: true });
  }
}

function openPinnedList() {
  const overlay = document.getElementById('pinnedListOverlay');
  const modal   = document.getElementById('pinnedListModal');
  const list    = document.getElementById('pinnedListItems');
  list.innerHTML = '';
  pinnedPosts.forEach(post => {
    const preview = post.content
      ? post.content.slice(0, 100)
      : (post.allVideos?.length ? '📹 Video' : post.imageUrl ? '🖼 Photo' : '📌 Pinned post');
    const item = document.createElement('div');
    item.className = 'pinned-list-item';
    item.innerHTML = `
      <div class="pinned-list-bar"></div>
      <div class="pinned-list-body">
        <span class="pinned-list-meta">${esc(post.authorName || 'Member')} · ${formatDate(post.timestamp)}</span>
        <span class="pinned-list-preview">${esc(preview)}</span>
      </div>
      ${currentIsAdmin ? '<button class="pinned-list-unpin" data-post-id="' + post.id + '" aria-label="Unpin">✕</button>' : ''}
    `;
    
    // Click on item body → scroll to post
    const itemBody = item.querySelector('.pinned-list-body');
    itemBody.addEventListener('click', () => { closePinnedList(); scrollToPinnedPost(post.id); });
    
    // Click unpin button (admin only) → unpin post
    if (currentIsAdmin) {
      const unpinBtn = item.querySelector('.pinned-list-unpin');
      unpinBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await pinPost(post.id, true); // true = currentlyPinned
          post.isPinned = false;
          pinnedPosts = pinnedPosts.filter(p => p.id !== post.id);
          
          // Update the post card badge if it's in the DOM
          const card = postsContainer.querySelector(`[data-post-id="${post.id}"]`);
          if (card) {
            const badge = card.querySelector('.post-pinned-badge');
            if (badge) badge.remove();
          }
          
          // Refresh pinned list display
          pinnedBannerIndex = 0;
          pinnedBannerDismissed = false;
          updatePinnedBanner();
          
          // If no more pinned posts, close the list
          if (pinnedPosts.length === 0) {
            closePinnedList();
          } else {
            // Refresh the list without closing
            openPinnedList();
          }
          
          showToast('Post unpinned');
        } catch (err) {
          console.error('Unpin error:', err);
          showToast('Failed to unpin post');
        }
      });
    }
    
    list.appendChild(item);
  });
  overlay.style.display = 'block';
  modal.style.display   = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePinnedList() {
  document.getElementById('pinnedListOverlay').style.display = 'none';
  document.getElementById('pinnedListModal').style.display   = 'none';
  document.body.style.overflow = '';
}

// Pinned banner event wiring
const _pinnedBanner      = document.getElementById('pinnedBanner');
const _pinnedListClose   = document.getElementById('pinnedListClose');
const _pinnedListOverlay = document.getElementById('pinnedListOverlay');

if (_pinnedBanner) {
  // Tap the body text area → scroll to current pinned post, then advance index
  _pinnedBanner.querySelector('.pinned-banner-body').addEventListener('click', () => {
    if (!pinnedPosts.length) return;
    scrollToPinnedPost(pinnedPosts[pinnedBannerIndex].id);
    if (pinnedPosts.length > 1) {
      pinnedBannerIndex = (pinnedBannerIndex + 1) % pinnedPosts.length;
      updatePinnedBanner();
    }
  });

  // Tap the count pill → open full pinned list
  const _bannerCount = document.getElementById('pinnedBannerCount');
  if (_bannerCount) {
    _bannerCount.addEventListener('click', (e) => {
      e.stopPropagation();
      openPinnedList();
    });
  }

  // ✕ → dismiss banner for session
  document.getElementById('pinnedBannerClose').addEventListener('click', (e) => {
    e.stopPropagation();
    pinnedBannerDismissed = true;
    _pinnedBanner.style.display = 'none';
  });
}
_pinnedListClose   && _pinnedListClose.addEventListener('click', closePinnedList);
_pinnedListOverlay && _pinnedListOverlay.addEventListener('click', closePinnedList);

// Pull-to-refresh (mobile)
if (typeof initPTR === 'function') {
  initPTR(function () { window.location.reload(); });
}

// ═══════════════════════════════════════════════════════════════
// BOARD SEARCH
// ═══════════════════════════════════════════════════════════════
(function () {
  const inp = document.getElementById('boardSearchInput');
  if (!inp) return;
  inp.addEventListener('input', () => {
    const q = inp.value.toLowerCase().trim();
    postsContainer.querySelectorAll('.post-card').forEach(card => {
      if (!q) { card.style.display = ''; return; }
      const text = [
        card.querySelector('.post-text')?.textContent || '',
        card.querySelector('.post-author-link')?.textContent || '',
        card.querySelector('.poll-question')?.textContent || '',
      ].join(' ').toLowerCase();
      card.style.display = text.includes(q) ? '' : 'none';
    });
  });
})();

// ═══════════════════════════════════════════════════════════════
// CONTENT FILTERS
// ═══════════════════════════════════════════════════════════════
(function () {
  let currentMediaFilter = 'all'; // all, images, videos, text
  let currentSortOrder = 'newest'; // newest, oldest, popular

  // Get all filter chips
  const filterChips = document.querySelectorAll('.filter-chip');
  if (!filterChips.length) return;

  // Handle filter chip clicks
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const filterType = chip.dataset.filterType;
      const value = chip.dataset.value;

      // Update active state for chips in same group
      document.querySelectorAll(`[data-filter-type="${filterType}"]`).forEach(c => {
        c.classList.remove('active');
      });
      chip.classList.add('active');

      // Update filter state
      if (filterType === 'media') {
        currentMediaFilter = value;
      } else if (filterType === 'sort') {
        currentSortOrder = value;
      }

      // Apply filters
      applyContentFilters();
    });
  });

  function applyContentFilters() {
    const cards = Array.from(postsContainer.querySelectorAll('.post-card'));
    
    // Apply media filter
    cards.forEach(card => {
      let show = true;
      
      if (currentMediaFilter === 'images') {
        // Show only posts with images
        show = card.querySelector('.post-image-grid, .post-media-single.is-image, .photo-thumb, .photo-thumb-cell, .photo-grid') !== null;
      } else if (currentMediaFilter === 'videos') {
        // Show only posts with videos
        show = card.querySelector('.post-media-video, .post-media-single.is-video, .video-thumb, .video-grid') !== null;
      } else if (currentMediaFilter === 'text') {
        // Show only text-only posts (no images or videos)
        show = card.querySelector('.post-image-grid, .post-media-single, .post-media-video, .photo-thumb, .photo-thumb-cell, .photo-grid, .video-thumb, .video-grid, .media-thumb') === null;
      }
      
      card.dataset.filterVisible = show ? 'true' : 'false';
      card.style.display = show ? '' : 'none';
    });

    // Apply sort order to visible cards
    const visibleCards = cards.filter(c => c.dataset.filterVisible === 'true');
    
    if (currentSortOrder === 'newest') {
      // Sort by timestamp descending (newest first)
      visibleCards.sort((a, b) => {
        const tsA = parseInt(a.dataset.timestamp || '0', 10);
        const tsB = parseInt(b.dataset.timestamp || '0', 10);
        return tsB - tsA; // Descending order
      });
    } else if (currentSortOrder === 'oldest') {
      // Sort by timestamp ascending (oldest first)
      visibleCards.sort((a, b) => {
        const tsA = parseInt(a.dataset.timestamp || '0', 10);
        const tsB = parseInt(b.dataset.timestamp || '0', 10);
        return tsA - tsB; // Ascending order
      });
    } else if (currentSortOrder === 'popular') {
      // Sort by reaction count descending (most reactions first)
      visibleCards.sort((a, b) => {
        const countA = parseInt(a.dataset.reactionCount || '0', 10);
        const countB = parseInt(b.dataset.reactionCount || '0', 10);
        return countB - countA; // Descending order
      });
    }
    
    // Re-append cards in new order
    visibleCards.forEach(card => postsContainer.appendChild(card));
    
    console.log('[Filters] Applied:', { 
      media: currentMediaFilter, 
      sort: currentSortOrder,
      visibleCount: visibleCards.length,
      totalCount: cards.length
    });
  }

  // Make function globally accessible for when new posts load
  window.applyContentFilters = applyContentFilters;
})();

// ═══════════════════════════════════════════════════════════════
// POLL BUILDER (create-post modal toggles)
// ═══════════════════════════════════════════════════════════════
(function () {
  const pollBtn  = document.getElementById('pollToggleBtn');
  const pollArea = document.getElementById('pollBuilder');
  const schedBtn = document.getElementById('scheduleToggleBtn');
  const schedArea = document.getElementById('scheduleSection');
  const addOpt   = document.getElementById('addPollOptionBtn');
  const optList  = document.getElementById('pollOptionsList');

  pollBtn && pollBtn.addEventListener('click', () => {
    const open = pollArea.style.display === 'none' || !pollArea.style.display;
    pollArea.style.display = open ? 'block' : 'none';
    pollBtn.classList.toggle('active', open);
    if (open && schedArea) { schedArea.style.display = 'none'; schedBtn && schedBtn.classList.remove('active'); }
  });

  schedBtn && schedBtn.addEventListener('click', () => {
    const open = schedArea.style.display === 'none' || !schedArea.style.display;
    schedArea.style.display = open ? 'flex' : 'none';
    schedBtn.classList.toggle('active', open);
    if (open) {
      const inp = document.getElementById('scheduleDateInput');
      if (inp) { const now = new Date(Date.now() + 60000); inp.min = now.toISOString().slice(0, 16); }
      if (pollArea) { pollArea.style.display = 'none'; pollBtn && pollBtn.classList.remove('active'); }
    }
  });

  // Story toggle — simple on/off (no panel, just marks the button active)
  const storyBtn = document.getElementById('storyToggleBtn');
  storyBtn && storyBtn.addEventListener('click', () => {
    storyBtn.classList.toggle('active');
    storyBtn.title = storyBtn.classList.contains('active')
      ? 'Will also share first photo/video as a Story'
      : 'Also share as Story';
  });

  addOpt && addOpt.addEventListener('click', () => {
    if (!optList) return;
    const count = optList.querySelectorAll('.poll-option-input').length;
    if (count >= 4) return;
    const row = document.createElement('div');
    row.className = 'poll-option-row';
    row.innerHTML = `<input type="text" class="poll-option-input" placeholder="Option ${count + 1}" maxlength="80"><button type="button" class="poll-option-rm" aria-label="Remove">✕</button>`;
    row.querySelector('.poll-option-rm').addEventListener('click', () => row.remove());
    optList.appendChild(row);
  });
})();

// ═══════════════════════════════════════════════════════════════
// POLL RENDER (injected into each post card that has poll data)
// ═══════════════════════════════════════════════════════════════
function renderPoll(post, card) {
  if (!post.poll) return;
  const poll = post.poll;
  const totalVotes = Object.values(poll.votes || {}).reduce((s, uids) => s + (Array.isArray(uids) ? uids.length : 0), 0);
  const myVote = Object.entries(poll.votes || {}).find(([, uids]) => Array.isArray(uids) && uids.includes(currentUserId))?.[0];

  const optHtml = (poll.options || []).map((opt, i) => {
    const key   = String(i);
    const count = ((poll.votes || {})[key] || []).length;
    const pct   = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
    const voted = myVote === key;
    return `<div class="poll-option${voted ? ' poll-voted' : ''}" data-idx="${i}" ${myVote === undefined ? 'role="button" tabindex="0"' : ''}>
      <div class="poll-option-bar" style="width:${myVote !== undefined ? pct : 0}%"></div>
      <span class="poll-option-text">${esc(opt)}</span>
      ${myVote !== undefined ? `<span class="poll-option-pct">${pct}%</span>` : ''}
    </div>`;
  }).join('');

  const pollEl = document.createElement('div');
  pollEl.className = 'poll-card';
  pollEl.innerHTML = `
    <div class="poll-question">${esc(poll.question || '')}</div>
    <div class="poll-options">${optHtml}</div>
    <div class="poll-meta">${totalVotes} vote${totalVotes !== 1 ? 's' : ''}</div>
  `;

  if (myVote === undefined) {
    pollEl.querySelectorAll('.poll-option').forEach(optEl => {
      const castVote = () => {
        if (!currentUserId) return;
        const key = String(optEl.dataset.idx);
        db.collection('posts').doc(post.id).update({
          [`poll.votes.${key}`]: firebase.firestore.FieldValue.arrayUnion(currentUserId),
        }).then(async () => {
          const snap = await db.collection('posts').doc(post.id).get();
          const updated = { id: snap.id, ...snap.data() };
          const old = postsContainer.querySelector(`.post-card[data-post-id="${post.id}"]`);
          if (old) old.replaceWith(buildPostCard(updated));
        }).catch(err => console.warn('Poll vote error:', err));
      };
      optEl.addEventListener('click', castVote);
      optEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); castVote(); } });
    });
  }

  const actions = card.querySelector('.post-actions');
  if (actions) card.insertBefore(pollEl, actions);
}

// ═══════════════════════════════════════════════════════════════
// STORIES
// ═══════════════════════════════════════════════════════════════
let _stories  = [];
let _storyIdx = 0;
let _storyTimer = null;

function _storyRelTime(ts) {
  if (!ts) return '';
  const d    = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 3600000)  return Math.max(1, Math.round(diff / 60000)) + 'm ago';
  if (diff < 86400000) return Math.round(diff / 3600000) + 'h ago';
  return Math.round(diff / 86400000) + 'd ago';
}

async function loadStories() {
  if (!boardId || !currentUserId) return;
  // Show strip immediately so "Your Story" is always available
  renderStoriesStrip();
  try {
    // Query by boardId only (no orderBy) — avoids needing a composite index.
    // Sort and filter expiry client-side.
    const snap = await db.collection('stories')
      .where('boardId', '==', boardId)
      .limit(20)
      .get();
    const now = Date.now();
    _stories = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => {
        const exp = s.expiresAt?.toDate ? s.expiresAt.toDate().getTime() : 0;
        return exp > now;
      })
      .sort((a, b) => {
        const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return ta - tb; // oldest first so viewer plays in chronological order
      });
    renderStoriesStrip();
  } catch (err) {
    console.warn('[Stories] Load error (index may be pending):', err.message || err);
  }
}

function renderStoriesStrip() {
  const strip  = document.getElementById('storiesStrip');
  const scroll = document.getElementById('storiesScroll');
  if (!strip || !scroll) return;
  // Remove old story cards (keep the add-story button)
  Array.from(scroll.querySelectorAll('.story-circle:not(.story-add-circle)')).forEach(el => el.remove());
  strip.style.display = 'block';

  _stories.forEach((story, i) => {
    const seen    = (story.seenBy || []).includes(currentUserId);
    const initial = (story.authorName || 'M').charAt(0).toUpperCase();
    const caption = story.caption || '';

    // Background: use story image for image-type, thumbUrl or video preview for video-type
    let bgHTML = '';
    if (story.mediaType === 'image' && story.mediaUrl) {
      bgHTML = `<div class="story-card-bg" style="background-image:url('${story.mediaUrl}')"></div>`;
    } else if (story.mediaType === 'video') {
      // Always show video preview for video stories
      if (story.mediaUrl) {
        const vidId = `story-vid-${i}`;
        // Use thumbnail as poster if available for faster load
        const posterAttr = story.thumbUrl ? `poster="${story.thumbUrl}"` : '';
        bgHTML = `<video id="${vidId}" class="story-card-bg" src="${story.mediaUrl}" ${posterAttr} muted playsinline loop preload="metadata" style="object-fit:cover;"></video>`;
      } else {
        // Fallback if no media URL
        bgHTML = `<div class="story-card-bg" style="background:linear-gradient(160deg,#1c2b3a 0%,#0d1b2a 100%)"></div>`;
      }
    } else {
      bgHTML = `<div class="story-card-bg" style="background:linear-gradient(160deg,#1c2b3a 0%,#0d1b2a 100%)"></div>`;
    }

    const card = document.createElement('div');
    card.className = `story-circle${seen ? '' : ' story-unseen'}`;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `${story.authorName || 'Member'}'s story`);
    card.innerHTML = `
      ${bgHTML}
      <div class="story-card-overlay"></div>
      <div class="story-card-avatar">${initial}</div>
      <div class="story-label"><span class="story-label-inner">${esc(caption)}</span></div>
    `;
    
    // Start video playback after adding to DOM (for all videos)
    if (story.mediaType === 'video' && story.mediaUrl) {
      setTimeout(() => {
        const vidEl = card.querySelector('video.story-card-bg');
        if (vidEl) {
          vidEl.load();
          vidEl.play().catch((err) => {
            // Autoplay blocked - video will show poster/first frame
            console.log('[Story] Video autoplay blocked for story', story.id, err.message);
          });
          // Add error handler to show fallback if video fails to load
          vidEl.addEventListener('error', () => {
            console.warn('[Story] Video load error for story', story.id);
            // If video fails and no poster, show gradient fallback
            if (!story.thumbUrl) {
              const fallback = document.createElement('div');
              fallback.className = 'story-card-bg';
              fallback.style.background = 'linear-gradient(160deg,#1c2b3a 0%,#0d1b2a 100%)';
              vidEl.parentNode.replaceChild(fallback, vidEl);
            }
          });
        }
      }, 100);
    }
    
    // Apply marquee only if caption overflows the card width
    if (caption) {
      requestAnimationFrame(() => {
        const label = card.querySelector('.story-label');
        const inner = card.querySelector('.story-label-inner');
        if (!label || !inner) return;
        const overflow = inner.scrollWidth - label.clientWidth;
        if (overflow > 4) {
          inner.style.setProperty('--slide-dist', `-${overflow + 6}px`);
          inner.style.animation = `story-marquee 4s ease-in-out ${Math.random() * 0.5}s infinite alternate`;
        }
      });
    }
    card.addEventListener('click', () => openStoryViewer(i));
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openStoryViewer(i); });
    scroll.appendChild(card);
  });
}

function openStoryViewer(startIdx) {
  if (!_stories.length) return;
  _storyIdx = Math.max(0, Math.min(startIdx, _stories.length - 1));
  const viewer = document.getElementById('storyViewer');
  if (!viewer) return;
  viewer.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  _renderStory();
}

function _renderStory() {
  const story = _stories[_storyIdx];
  if (!story) { closeStoryViewer(); return; }

  // Mark seen
  if (currentUserId && !(story.seenBy || []).includes(currentUserId)) {
    db.collection('stories').doc(story.id).update({
      seenBy: firebase.firestore.FieldValue.arrayUnion(currentUserId),
    }).catch(() => {});
    story.seenBy = [...(story.seenBy || []), currentUserId];
    renderStoriesStrip();
  }

  document.getElementById('storyAuthorName').textContent = story.authorName || 'Member';
  document.getElementById('storyAuthorTime').textContent = _storyRelTime(story.createdAt);
  document.getElementById('storyAuthorAvatar').textContent = (story.authorName || 'M').charAt(0).toUpperCase();
  document.getElementById('storyCaption').textContent = story.caption || '';

  // Show/hide delete button based on ownership or admin status
  const deleteBtn = document.getElementById('storyDeleteBtn');
  const canDelete = story.authorId === currentUserId || currentIsAdmin;
  if (deleteBtn) deleteBtn.style.display = canDelete ? 'block' : 'none';

  const img = document.getElementById('storyImg');
  const vid = document.getElementById('storyVideo');
  if (story.mediaType === 'video' && story.mediaUrl) {
    img.style.display = 'none';
    vid.src = story.mediaUrl;
    // Set poster if thumbnail available for faster initial display
    if (story.thumbUrl) {
      vid.poster = story.thumbUrl;
    }
    vid.style.display = 'block';
    vid.load();
    vid.play().catch((err) => {
      console.warn('[StoryViewer] Video play failed:', err.message);
      // Show controls if autoplay fails so user can manually play
      vid.setAttribute('controls', 'controls');
    });
  } else {
    vid.pause();
    vid.style.display = 'none';
    img.src = story.mediaUrl || '';
    img.style.display = 'block';
  }

  // Progress bars
  const barsEl = document.getElementById('storyProgressBars');
  barsEl.innerHTML = _stories.map((_, i) =>
    `<div class="story-progress-bar"><div class="story-progress-fill" id="spf-${i}" style="width:${i < _storyIdx ? '100%' : '0%'}"></div></div>`
  ).join('');

  // Nav visibility — tap zones: show/hide handled by pointer-events
  document.getElementById('storyNavPrev').style.pointerEvents = _storyIdx > 0 ? 'auto' : 'none';
  document.getElementById('storyNavNext').style.pointerEvents = _storyIdx < _stories.length - 1 ? 'auto' : 'none';

  // Auto-advance
  clearTimeout(_storyTimer);
  if (story.mediaType === 'video') {
    vid.onended = () => _storyNext();
    vid.ontimeupdate = () => {
      if (vid.duration) {
        const pct  = (vid.currentTime / vid.duration) * 100;
        const fill = document.getElementById(`spf-${_storyIdx}`);
        if (fill) fill.style.width = pct + '%';
      }
    };
  } else {
    const dur = 5000;
    const fill = document.getElementById(`spf-${_storyIdx}`);
    if (fill) { fill.style.transition = `width ${dur}ms linear`; fill.style.width = '100%'; }
    _storyTimer = setTimeout(_storyNext, dur);
  }
}

function _storyNext() {
  clearTimeout(_storyTimer);
  if (_storyIdx < _stories.length - 1) { _storyIdx++; _renderStory(); }
  else closeStoryViewer();
}
function _storyPrev() {
  clearTimeout(_storyTimer);
  if (_storyIdx > 0) { _storyIdx--; _renderStory(); }
}
function closeStoryViewer() {
  clearTimeout(_storyTimer);
  const viewer = document.getElementById('storyViewer');
  if (viewer) viewer.style.display = 'none';
  document.body.style.overflow = '';
  const vid = document.getElementById('storyVideo');
  if (vid) { vid.pause(); vid.src = ''; }
}

// Wire story viewer controls
(function () {
  document.getElementById('storyCloseBtn')?.addEventListener('click', closeStoryViewer);
  document.getElementById('storyNavPrev')?.addEventListener('click', _storyPrev);
  document.getElementById('storyNavNext')?.addEventListener('click', _storyNext);
  // Delete story handler
  document.getElementById('storyDeleteBtn')?.addEventListener('click', async () => {
    const story = _stories[_storyIdx];
    if (!story) return;
    const canDelete = story.authorId === currentUserId || currentIsAdmin;
    if (!canDelete) return;
    
    if (!confirm('Delete this story? This cannot be undone.')) return;
    
    try {
      await db.collection('stories').doc(story.id).delete();
      _stories.splice(_storyIdx, 1);
      if (_stories.length === 0) {
        closeStoryViewer();
        renderStoriesStrip();
      } else {
        if (_storyIdx >= _stories.length) _storyIdx = _stories.length - 1;
        _renderStory();
        renderStoriesStrip();
      }
    } catch (err) {
      alert('Failed to delete story: ' + err.message);
    }
  });
  document.getElementById('storyViewer')?.addEventListener('keydown', e => {
    if (e.key === 'Escape')     closeStoryViewer();
    if (e.key === 'ArrowLeft')  _storyPrev();
    if (e.key === 'ArrowRight') _storyNext();
  });
})();

// Wire Add Story button & modal
(function () {
  const addBtn    = document.getElementById('addStoryBtn');
  const modal     = document.getElementById('addStoryModal');
  const closeBtn  = document.getElementById('addStoryModalClose');
  const cancelBtn = document.getElementById('addStoryCancel');
  const pickBtn   = document.getElementById('storyPickMediaBtn');
  const fileInp   = document.getElementById('storyMediaInput');
  const submitBtn = document.getElementById('addStorySubmit');
  const preview   = document.getElementById('storyMediaPreview');
  const prevImg   = document.getElementById('storyPreviewImg');
  const prevVid   = document.getElementById('storyPreviewVideo');
  const capInp    = document.getElementById('storyCaptionInput');
  let _file = null, _objUrl = null;

  function openAdd() {
    if (!modal) return;
    _file = null;
    if (_objUrl) { URL.revokeObjectURL(_objUrl); _objUrl = null; }
    if (preview) preview.style.display = 'none';
    if (prevImg) { prevImg.src = ''; prevImg.style.display = 'none'; }
    if (prevVid) { prevVid.src = ''; prevVid.style.display = 'none'; }
    if (capInp)  capInp.value = '';
    if (submitBtn) submitBtn.disabled = true;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
  function closeAdd() {
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  addBtn    && addBtn.addEventListener('click', openAdd);
  addBtn    && addBtn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openAdd(); });
  closeBtn  && closeBtn.addEventListener('click', closeAdd);
  cancelBtn && cancelBtn.addEventListener('click', closeAdd);
  modal     && modal.addEventListener('click', e => { if (e.target === modal) closeAdd(); });
  pickBtn   && pickBtn.addEventListener('click', () => fileInp && fileInp.click());

  fileInp && fileInp.addEventListener('change', () => {
    const f = fileInp.files[0];
    if (!f) return;
    _file = f;
    if (_objUrl) URL.revokeObjectURL(_objUrl);
    _objUrl = URL.createObjectURL(f);
    if (f.type.startsWith('image/')) {
      prevImg.src = _objUrl; prevImg.style.display = 'block'; prevVid.style.display = 'none';
    } else {
      prevVid.src = _objUrl; prevVid.style.display = 'block'; prevImg.style.display = 'none';
    }
    if (preview) preview.style.display = 'block';
    if (submitBtn) submitBtn.disabled = false;
  });

  submitBtn && submitBtn.addEventListener('click', async () => {
    if (!_file || !currentUserId) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sharing\u2026';
    try {
      const user = getCurrentUser();
      let mediaUrl, mediaType, thumbUrl = null;
      if (_file.type.startsWith('image/')) {
        mediaUrl = await uploadImage(_file, user.uid); 
        mediaType = 'image';
      } else {
        // Video: upload video + generate & upload thumbnail
        mediaType = 'video';
        // Always try to generate thumbnail for videos
        const thumbBlob = await generateVideoThumbnail(_file).catch((err) => {
          console.warn('[Story] Thumbnail generation failed:', err.message);
          return null;
        });
        mediaUrl = await uploadVideo(_file, user.uid);  
        if (thumbBlob) {
          thumbUrl = await uploadImage(thumbBlob, user.uid).catch((err) => {
            console.warn('[Story] Thumbnail upload failed:', err.message);
            return null;
          });
        }
        // Log for debugging
        console.log('[Story] Video uploaded with thumbnail:', !!thumbUrl);
      }
      const now     = firebase.firestore.Timestamp.now();
      const expires = firebase.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 3600 * 1000));
      await db.collection('stories').add({
        boardId,
        authorId:   currentUserId,
        authorName: currentUserData.name || user.displayName || 'Member',
        mediaUrl, mediaType,
        thumbUrl: thumbUrl || null,
        caption:    capInp?.value.trim() || '',
        createdAt:  now,
        expiresAt:  expires,
        seenBy:     [currentUserId],
      });
      closeAdd();
      await loadStories();
    } catch (err) {
      alert('Could not share story: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Share Story';
    }
  });
})();
