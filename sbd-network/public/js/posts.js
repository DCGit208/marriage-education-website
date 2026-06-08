// ================================================================
// POSTS MANAGEMENT
// ================================================================

function _eligibleForBoardNotif(userData, boardId, boardMeta) {
  if (typeof NotificationAccess !== 'undefined') {
    return NotificationAccess.userCanReceiveBoardNotification(userData, boardId, boardMeta || {});
  }
  return false;
}

async function _fetchBoardMeta(boardId) {
  if (!boardId) return { groupId: null, requiredTier: 'free', title: 'board' };
  try {
    const boardDoc = await db.collection('boards').doc(boardId).get();
    if (!boardDoc.exists) return { groupId: null, requiredTier: 'free', title: 'board' };
    const d = boardDoc.data();
    return {
      groupId: d.groupId || null,
      requiredTier: d.requiredTier || 'free',
      title: d.title || 'board',
    };
  } catch (_) {
    return { groupId: null, requiredTier: 'free', title: 'board' };
  }
}

function _wantsNotifType(prefs, type) {
  const d = prefs || {};
  if (type === 'new_post') return d.newPosts === true;
  if (type === 'new_comment') return d.comments !== false;
  if (type === 'new_reaction') return d.reactions !== false;
  if (type === 'mention_post' || type === 'mention_comment') return d.mentions !== false;
  return true;
}

async function _loadNotifPrefsMap(userIds) {
  const map = {};
  const unique = [...new Set((userIds || []).filter(Boolean))];
  await Promise.all(unique.map(async (uid) => {
    try {
      const doc = await db.collection('users').doc(uid).collection('settings').doc('notifications').get();
      map[uid] = doc.exists ? doc.data() : {};
    } catch (_) {
      map[uid] = {};
    }
  }));
  return map;
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

function _normalizeBoardMetrics(board) {
  return {
    postsCount: board.postsCount ?? board.postCount ?? 0,
    commentsCount: board.commentsCount ?? 0,
    likesCount: board.likesCount ?? 0,
    activity24h: board.activity24h ?? 0,
    activeUsers24h: board.activeUsers24h ?? 0,
    lastActivityAt: board.lastActivityAt || board.lastPostAt || board.createdAt || null,
  };
}

async function _ensureBoardRankingFields(boardRef, boardData) {
  const update = {};
  if (boardData.postsCount === undefined) update.postsCount = boardData.postCount ?? 0;
  if (boardData.commentsCount === undefined) update.commentsCount = 0;
  if (boardData.likesCount === undefined) update.likesCount = 0;
  if (boardData.activity24h === undefined) update.activity24h = 0;
  if (boardData.activeUsers24h === undefined) update.activeUsers24h = 0;
  if (boardData.lastActivityAt === undefined && (boardData.lastPostAt || boardData.createdAt)) {
    update.lastActivityAt = boardData.lastPostAt || boardData.createdAt;
  }
  if (boardData.rankScore === undefined) update.rankScore = 0;
  if (boardData.updatedAt === undefined) update.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

  if (Object.keys(update).length) {
    await boardRef.update(update);
  }
}

function _recomputeBoardRankNonBlocking(boardId) {
  (async () => {
    try {
      const boardRef = db.collection('boards').doc(boardId);
      const snap = await boardRef.get();
      if (!snap.exists) return;

      const data = snap.data() || {};
      await _ensureBoardRankingFields(boardRef, data);

      const merged = { ...data, ..._normalizeBoardMetrics(data) };
      const rank = computeBoardRank(merged);
      await boardRef.update({ rankScore: rank });
    } catch (e) {
      console.warn('[BoardRank] recompute skipped:', e);
    }
  })();
}

function _buildBoardActivityUpdate(previewText, at = null) {
  const activityAt = at || firebase.firestore.FieldValue.serverTimestamp();
  return {
    lastActivityAt:  activityAt,
    lastPostAt:      activityAt,
    lastPostPreview: previewText || '📎 Media',
  };
}

// Create a new post
async function createPost(boardId, content, imageUrl, videoUrl, allPhotos, boardName, thumbUrl, allVideos, allThumbs, groupId, linkPreview = null, allMedia = null, poll = null, scheduledAt = null) {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  
  try {
    // Get user data
    const userDoc = await db.collection('users').doc(user.uid).get();
    const userData = userDoc.data() || {};
    
    // Parse mentions and hashtags
    const mentionUsernames = typeof parseMentions === 'function' ? parseMentions(content) : [];
    const hashtags = typeof parseHashtags === 'function' ? parseHashtags(content) : [];
    const mentionedUserIds = mentionUsernames.length > 0 && typeof resolveMentions === 'function' 
      ? await resolveMentions(mentionUsernames) 
      : [];
    
    // Create post object
    const postData = {
      boardId: boardId,
      authorId: user.uid,
      authorName: userData.name || user.displayName || 'Anonymous',
      content: content,
      imageUrl: imageUrl || null,
      allPhotos: (allPhotos && allPhotos.length > 1) ? allPhotos : [],
      videoUrl: videoUrl || null,
      allVideos: (allVideos && allVideos.length > 1) ? allVideos : [],
      thumbUrl: thumbUrl || null,
      allThumbs: (allThumbs && allThumbs.length) ? allThumbs : [],
      allMedia: allMedia || null,
      timestamp: scheduledAt || firebase.firestore.Timestamp.fromDate(new Date()),
      commentCount: 0,
      isPinned: false,
      linkPreview: linkPreview || null,
      ...(mentionedUserIds.length > 0 ? { mentions: mentionedUserIds } : {}),
      ...(hashtags.length > 0 ? { hashtags } : {}),
      ...(poll ? { poll } : {}),
      ...(scheduledAt ? { isScheduled: true, scheduledAt } : {}),
    };
    
    // Add post to Firestore
    const postRef = await db.collection('posts').add(postData);

    // Stamp board with last activity time so group page can sort by recency
    db.collection('boards').doc(boardId).update({
      ..._buildBoardActivityUpdate(content ? content.slice(0, 80) : '📎 Media', postData.timestamp),
      postsCount: firebase.firestore.FieldValue.increment(1),
      activity24h: firebase.firestore.FieldValue.increment(1),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {}).finally(() => _recomputeBoardRankNonBlocking(boardId));

    console.log('Post created:', postRef.id);

    // Write in-app notifications for all other members (fire-and-forget)
    _writePostNotifications(postRef.id, boardId, boardName, postData.authorName, content)
      .catch(e => console.warn('[Notifications] Write error:', e));

    // Notify mentioned users (fire-and-forget)
    if (mentionedUserIds.length > 0) {
      _writeMentionNotifications(postRef.id, boardId, boardName, postData.authorName, content, mentionedUserIds, 'post')
        .catch(e => console.warn('[Notifications] Mention notification error:', e));
    }

    // Trigger FCM push (fire-and-forget — only works once VAPID key is configured)
    if (typeof _triggerPushNewPost === 'function') {
      _triggerPushNewPost(boardId, boardName, postRef.id, postData.authorName, content, groupId || null);
    }

    return postRef.id;
    
  } catch (error) {
    console.error('Error creating post:', error);
    throw error;
  }
}

// Delete a post
async function deletePost(postId) {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  
  try {
    // Get post
    const postDoc = await db.collection('posts').doc(postId).get();
    
    if (!postDoc.exists) {
      throw new Error('Post not found');
    }
    
    const post = postDoc.data();
    
    // Check if user is author or admin
    const isAdmin = await isUserAdmin();
    if (post.authorId !== user.uid && !isAdmin) {
      throw new Error('Not authorized to delete this post');
    }
    
    // Delete all comments first
    const commentsSnapshot = await db.collection('comments')
      .where('postId', '==', postId)
      .get();
    
    const batch = db.batch();
    commentsSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Delete the post
    batch.delete(db.collection('posts').doc(postId));
    
    await batch.commit();
    
    console.log('Post deleted:', postId);
    
  } catch (error) {
    console.error('Error deleting post:', error);
    throw error;
  }
}

// Edit a post's content
async function editPost(postId, newContent) {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const postDoc = await db.collection('posts').doc(postId).get();
  if (!postDoc.exists) throw new Error('Post not found');

  const post = postDoc.data();
  const isAdmin = await isUserAdmin();
  if (post.authorId !== user.uid && !isAdmin) throw new Error('Not authorized to edit this post');

  await db.collection('posts').doc(postId).update({
    content: newContent.trim(),
    editedAt: firebase.firestore.Timestamp.fromDate(new Date()),
  });
}

// Add a comment to a post
async function addComment(postId, text, replyTo = null) {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  
  try {
    // Get user data
    const userDoc = await db.collection('users').doc(user.uid).get();
    const userData = userDoc.data();
    
    // Parse mentions and hashtags
    const mentionUsernames = typeof parseMentions === 'function' ? parseMentions(text) : [];
    const hashtags = typeof parseHashtags === 'function' ? parseHashtags(text) : [];
    const mentionedUserIds = mentionUsernames.length > 0 && typeof resolveMentions === 'function' 
      ? await resolveMentions(mentionUsernames) 
      : [];
    
    // Create comment object
    const commentData = {
      postId: postId,
      authorId: user.uid,
      authorName: userData.name || user.displayName || 'Anonymous',
      text: text,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      ...(mentionedUserIds.length > 0 ? { mentions: mentionedUserIds } : {}),
      ...(hashtags.length > 0 ? { hashtags } : {}),
      ...(replyTo ? { replyTo } : {}),
    };
    
    // Add comment to Firestore
    const commentRef = await db.collection('comments').add(commentData);

    // Fetch post data first, then update commentCount
    const postDoc = await db.collection('posts').doc(postId).get();
    await db.collection('posts').doc(postId).update({
      commentCount: firebase.firestore.FieldValue.increment(1)
    });

    // Bump board's last activity so group page sorts by most recent comment too
    if (postDoc.exists && postDoc.data().boardId) {
      const activityBoardId = postDoc.data().boardId;
      db.collection('boards').doc(activityBoardId).update({
        ..._buildBoardActivityUpdate(`💬 ${commentData.authorName}: ${text.slice(0, 60)}`),
        commentsCount: firebase.firestore.FieldValue.increment(1),
        activity24h: firebase.firestore.FieldValue.increment(1),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {}).finally(() => _recomputeBoardRankNonBlocking(activityBoardId));
    }

    // Notify all group members about the new comment (fire-and-forget)
    if (postDoc.exists) {
      const postMeta = postDoc.data();
      const boardId  = postMeta.boardId || null;

      _writeCommentNotifications(commentRef.id, postId, boardId, postMeta.authorId, commentData.authorName, text)
        .catch(e => console.error('[Notifications] Comment notification FAILED:', e, { commentRef: commentRef.id, postId, boardId }));

      // Notify mentioned users (fire-and-forget)
      if (mentionedUserIds.length > 0 && boardId) {
        const boardDoc = await db.collection('boards').doc(boardId).get();
        const boardName = boardDoc.exists ? (boardDoc.data().title || boardId) : boardId;
        _writeMentionNotifications(commentRef.id, boardId, boardName, commentData.authorName, text, mentionedUserIds, 'comment', postId)
          .catch(e => console.warn('[Notifications] Mention notification error:', e));
      }

      // FCM push to all group members
      if (typeof _triggerPushForComment === 'function' && boardId) {
        db.collection('boards').doc(boardId).get().then(bDoc => {
          const bName   = bDoc.exists ? (bDoc.data().title   || boardId) : boardId;
          const gId     = bDoc.exists ? (bDoc.data().groupId || null)    : null;
          _triggerPushForComment(boardId, bName, postId, commentRef.id, commentData.authorName, text, gId);
        }).catch(() => {
          _triggerPushForComment(boardId, boardId, postId, commentRef.id, commentData.authorName, text, null);
        });
      }
    }

    console.log('Comment added:', commentRef.id);
    return commentRef.id;

  } catch (error) {
    console.error('Error adding comment:', error);
    throw error;
  }
}

// Write Firestore notification docs for all members except the poster
async function _writePostNotifications(postId, boardId, boardName, authorName, content) {
  const currentUid = getCurrentUser()?.uid;
  if (!currentUid) return;

  const boardMeta = await _fetchBoardMeta(boardId);
  const groupId = boardMeta.groupId;
  if (!groupId) return;

  const usersSnap = await db.collection('users').where('groups', 'array-contains', groupId).get();
  if (!usersSnap || usersSnap.empty) return;

  const eligibleIds = [];
  usersSnap.forEach(userDoc => {
    if (userDoc.id === currentUid) return;
    if (!_eligibleForBoardNotif(userDoc.data(), boardId, boardMeta)) return;
    eligibleIds.push(userDoc.id);
  });
  const prefsMap = await _loadNotifPrefsMap(eligibleIds);

  const batch = db.batch();
  const body  = `${authorName}: ${(content || 'Shared a photo or video').substring(0, 80)}`;
  usersSnap.forEach(userDoc => {
    if (userDoc.id === currentUid) return;
    if (!_eligibleForBoardNotif(userDoc.data(), boardId, boardMeta)) return;
    if (!_wantsNotifType(prefsMap[userDoc.id], 'new_post')) return;
    const ref = db.collection('notifications').doc();
    batch.set(ref, {
      userId:    userDoc.id,
      type:      'new_post',
      title:     `New post in ${boardName || 'SBD Network'}`,
      body,
      boardId,
      postId,
      read:      false,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
}

// Write Firestore notification docs for all group members when a comment is added
async function _writeCommentNotifications(commentId, postId, boardId, postAuthorId, commenterName, text) {
  const currentUid = getCurrentUser()?.uid;
  console.log('[Notif:comment] start', { currentUid, commentId, postId, boardId, postAuthorId });

  if (!currentUid) {
    console.warn('[Notif:comment] SKIP — no authenticated user');
    return;
  }
  if (!boardId) {
    console.warn('[Notif:comment] SKIP — boardId is null/undefined. Post may be missing boardId field.');
    // Fall through to direct author notification below
  }

  const now  = firebase.firestore.FieldValue.serverTimestamp();
  const body = `${commenterName}: ${text.substring(0, 80)}`;
  const batch = db.batch();
  const notifiedUids = new Set();

  let boardMeta = { groupId: null, requiredTier: 'free', title: 'board' };
  if (boardId) boardMeta = await _fetchBoardMeta(boardId);

  const prefsMap = {};

  // ── Step 1: notify the post author when they can access this board ──
  if (postAuthorId && postAuthorId !== currentUid) {
    let authorEligible = true;
    if (boardId) {
      try {
        const authorDoc = await db.collection('users').doc(postAuthorId).get();
        authorEligible = authorDoc.exists &&
          _eligibleForBoardNotif(authorDoc.data(), boardId, boardMeta);
      } catch (_) {
        authorEligible = false;
      }
    }
    Object.assign(prefsMap, await _loadNotifPrefsMap(authorEligible ? [postAuthorId] : []));
    if (authorEligible && _wantsNotifType(prefsMap[postAuthorId], 'new_comment')) {
      const ref = db.collection('notifications').doc();
      batch.set(ref, {
        userId:    postAuthorId,
        type:      'new_comment',
        title:     'New comment on your post',
        body,
        boardId:   boardId || null,
        postId,
        commentId,
        read:      false,
        timestamp: now,
      });
      notifiedUids.add(postAuthorId);
      console.log('[Notif:comment] queued notification for post author:', postAuthorId);
    }
  } else if (postAuthorId === currentUid) {
    console.log('[Notif:comment] commenter IS post author — skipping author notification');
  } else {
    console.warn('[Notif:comment] postAuthorId missing — cannot notify post author');
  }

  // ── Step 2: notify other group members who can access this board ──────────
  if (boardId) {
    const groupId = boardMeta.groupId;
    const boardName = boardMeta.title;
    console.log('[Notif:comment] board resolved:', { boardName, groupId, requiredTier: boardMeta.requiredTier });

    if (groupId) {
      let usersSnap;
      try {
        usersSnap = await db.collection('users').where('groups', 'array-contains', groupId).get();
        console.log('[Notif:comment] group members found:', usersSnap.size, '(groupId:', groupId, ')');
      } catch (e) {
        console.error('[Notif:comment] Failed to query group members:', e);
      }

      if (usersSnap && !usersSnap.empty) {
        const memberIds = [];
        usersSnap.forEach(userDoc => {
          if (userDoc.id === currentUid) return;
          if (notifiedUids.has(userDoc.id)) return;
          if (!_eligibleForBoardNotif(userDoc.data(), boardId, boardMeta)) return;
          memberIds.push(userDoc.id);
        });
        Object.assign(prefsMap, await _loadNotifPrefsMap(memberIds));

        usersSnap.forEach(userDoc => {
          if (userDoc.id === currentUid)    return; // don't notify commenter
          if (notifiedUids.has(userDoc.id)) return; // already notified (post author)
          if (!_eligibleForBoardNotif(userDoc.data(), boardId, boardMeta)) return;
          if (!_wantsNotifType(prefsMap[userDoc.id], 'new_comment')) return;
          const ref = db.collection('notifications').doc();
          batch.set(ref, {
            userId:    userDoc.id,
            type:      'new_comment',
            title:     `New comment in ${boardName}`,
            body,
            boardId,
            postId,
            commentId,
            read:      false,
            timestamp: now,
          });
          notifiedUids.add(userDoc.id);
        });
        console.log('[Notif:comment] total notifications queued:', notifiedUids.size);
      } else {
        console.warn('[Notif:comment] No group members found for groupId:', groupId,
          '— Check that users have this groupId in their "groups" array (admin panel → Manage Groups)');
      }
    } else {
      console.warn('[Notif:comment] board has no groupId — skipping group broadcast');
    }
  }

  if (notifiedUids.size === 0) {
    console.warn('[Notif:comment] Nothing to commit — 0 notifications queued. Post author may BE the commenter, or no groupId on board.');
    return;
  }

  try {
    await batch.commit();
    console.log('[Notif:comment] batch committed OK for', notifiedUids.size, 'user(s)');
  } catch (e) {
    console.error('[Notif:comment] batch.commit FAILED:', e);
    throw e;
  }
}

// Write mention notifications for users tagged in posts/comments
async function _writeMentionNotifications(contentId, boardId, boardName, authorName, content, mentionedUserIds, type = 'post', postId = null) {
  const currentUid = getCurrentUser()?.uid;
  if (!currentUid || !mentionedUserIds || mentionedUserIds.length === 0) return;

  const boardMeta = boardId ? await _fetchBoardMeta(boardId) : null;
  const mentionType = type === 'comment' ? 'mention_comment' : 'mention_post';
  const prefsMap = await _loadNotifPrefsMap(mentionedUserIds);
  const batch = db.batch();
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const body = `${authorName} mentioned you: ${content.substring(0, 80)}`;

  for (const userId of mentionedUserIds) {
    if (userId === currentUid) continue;

    if (boardId && boardMeta) {
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists || !_eligibleForBoardNotif(userDoc.data(), boardId, boardMeta)) continue;
      } catch (_) {
        continue;
      }
    }
    if (!_wantsNotifType(prefsMap[userId], mentionType)) continue;

    const ref = db.collection('notifications').doc();
    const notifData = {
      userId: userId,
      type: type === 'comment' ? 'mention_comment' : 'mention_post',
      title: `${authorName} mentioned you in ${boardName}`,
      body,
      boardId: boardId || null,
      read: false,
      timestamp: now,
    };

    if (type === 'comment') {
      notifData.postId = postId;
      notifData.commentId = contentId;
    } else {
      notifData.postId = contentId;
    }

    batch.set(ref, notifData);
  }

  try {
    await batch.commit();
    console.log('[Notif:mention] notified eligible users');
  } catch (e) {
    console.error('[Notif:mention] batch.commit FAILED:', e);
    throw e;
  }
}


// Edit a comment's text
async function editComment(commentId, newText) {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const commentDoc = await db.collection('comments').doc(commentId).get();
  if (!commentDoc.exists) throw new Error('Comment not found');
  const comment = commentDoc.data();
  const isAdmin = await isUserAdmin();
  if (comment.authorId !== user.uid && !isAdmin) throw new Error('Not authorized to edit this comment');
  await db.collection('comments').doc(commentId).update({
    text:     newText.trim(),
    editedAt: firebase.firestore.Timestamp.fromDate(new Date()),
  });
}

async function deleteComment(commentId, postId) {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  
  try {
    // Get comment
    const commentDoc = await db.collection('comments').doc(commentId).get();
    
    if (!commentDoc.exists) {
      throw new Error('Comment not found');
    }
    
    const comment = commentDoc.data();
    
    // Check if user is author or admin
    const isAdmin = await isUserAdmin();
    if (comment.authorId !== user.uid && !isAdmin) {
      throw new Error('Not authorized to delete this comment');
    }
    
    // Delete comment
    await db.collection('comments').doc(commentId).delete();
    
    // Update post's comment count
    await db.collection('posts').doc(postId).update({
      commentCount: firebase.firestore.FieldValue.increment(-1)
    });
    
    console.log('Comment deleted:', commentId);
    
  } catch (error) {
    console.error('Error deleting comment:', error);
    throw error;
  }
}

// Render video player
function renderVideoPlayer(videoUrl) {
  if (!videoUrl) return '';
  
  // Check if YouTube URL
  if (isYouTubeUrl(videoUrl)) {
    const embedUrl = getYouTubeEmbedUrl(videoUrl);
    return `
      <div class="video-container">
        <iframe 
          src="${embedUrl}" 
          frameborder="0" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen>
        </iframe>
      </div>
    `;
  }
  
  // Direct video URL
  return `
    <div class="video-container">
      <video controls>
        <source src="${videoUrl}" type="video/mp4">
        Your browser does not support the video tag.
      </video>
    </div>
  `;
}

console.log('Posts module loaded');

// ── Pin / Unpin a post (admin only) ──────────────────────────────
async function pinPost(postId, currentlyPinned) {
  const isAdmin = await isUserAdmin();
  if (!isAdmin) throw new Error('Only admins can pin posts');
  await db.collection('posts').doc(postId).update({ isPinned: !currentlyPinned });
}

// ── Toggle emoji reaction ─────────────────────────────────────────
async function reactToPost(postId, emoji, userId) {
  const postRef = db.collection('posts').doc(postId);
  const postDoc = await postRef.get();
  if (!postDoc.exists) throw new Error('Post not found');
  const postData = postDoc.data();
  const existing = (postData.reactions || {})[emoji] || [];
  const already  = existing.includes(userId);
  await postRef.update({
    [`reactions.${emoji}`]: already
      ? firebase.firestore.FieldValue.arrayRemove(userId)
      : firebase.firestore.FieldValue.arrayUnion(userId),
  });

  if (postData.boardId) {
    db.collection('boards').doc(postData.boardId).update({
      likesCount: firebase.firestore.FieldValue.increment(already ? -1 : 1),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {}).finally(() => _recomputeBoardRankNonBlocking(postData.boardId));
  }

  // Notify post author when someone reacts (not on removal, not self-reaction)
  if (!already && postData.authorId && postData.authorId !== userId) {
    const boardMeta = postData.boardId ? await _fetchBoardMeta(postData.boardId) : null;
    const authorDoc = await db.collection('users').doc(postData.authorId).get();
    if (postData.boardId && boardMeta &&
        (!authorDoc.exists || !_eligibleForBoardNotif(authorDoc.data(), postData.boardId, boardMeta))) {
      return;
    }
    const prefsMap = await _loadNotifPrefsMap([postData.authorId]);
    if (!_wantsNotifType(prefsMap[postData.authorId], 'new_reaction')) return;
    const reactorDoc = await db.collection('users').doc(userId).get();
    const reactorName = reactorDoc.exists ? (reactorDoc.data().name || 'Someone') : 'Someone';
    db.collection('notifications').add({
      userId:    postData.authorId,
      type:      'new_reaction',
      title:     'Someone reacted to your post',
      body:      `${reactorName} reacted ${emoji} to your post`,
      boardId:   postData.boardId || null,
      postId,
      read:      false,
      timestamp: firebase.firestore.Timestamp.fromDate(new Date()),
    }).catch(() => {});
  }
}

// ── Toggle emoji reaction on a comment ─────────────────────────────
async function reactToComment(commentId, emoji, userId) {
  const commentRef = db.collection('comments').doc(commentId);
  const commentDoc = await commentRef.get();
  if (!commentDoc.exists) throw new Error('Comment not found');
  const commentData = commentDoc.data();
  const existing = (commentData.reactions || {})[emoji] || [];
  const already  = existing.includes(userId);
  await commentRef.update({
    [`reactions.${emoji}`]: already
      ? firebase.firestore.FieldValue.arrayRemove(userId)
      : firebase.firestore.FieldValue.arrayUnion(userId),
  });

  // Notify comment author when someone reacts (not on removal, not self-reaction)
  let boardId = null;
  if (commentData.postId) {
    const pDoc = await db.collection('posts').doc(commentData.postId).get();
    if (pDoc.exists) boardId = pDoc.data().boardId || null;
  }

  if (boardId) {
    db.collection('boards').doc(boardId).update({
      likesCount: firebase.firestore.FieldValue.increment(already ? -1 : 1),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {}).finally(() => _recomputeBoardRankNonBlocking(boardId));
  }

  if (!already && commentData.authorId && commentData.authorId !== userId) {
    const boardMeta = boardId ? await _fetchBoardMeta(boardId) : null;
    const authorDoc = await db.collection('users').doc(commentData.authorId).get();
    if (boardId && boardMeta &&
        (!authorDoc.exists || !_eligibleForBoardNotif(authorDoc.data(), boardId, boardMeta))) {
      return;
    }
    const prefsMap = await _loadNotifPrefsMap([commentData.authorId]);
    if (!_wantsNotifType(prefsMap[commentData.authorId], 'new_reaction')) return;
    const reactorDoc = await db.collection('users').doc(userId).get();
    const reactorName = reactorDoc.exists ? (reactorDoc.data().name || 'Someone') : 'Someone';
    db.collection('notifications').add({
      userId:    commentData.authorId,
      type:      'new_reaction',
      title:     'Someone reacted to your comment',
      body:      `${reactorName} reacted ${emoji} to your comment`,
      boardId,
      postId:    commentData.postId || null,
      commentId,
      read:      false,
      timestamp: firebase.firestore.Timestamp.fromDate(new Date()),
    }).catch(() => {});
  }
}

// ── Forward a post to one or more boards ─────────────────────────
// targetBoardIds  – string OR array of strings
// forwardMessage  – optional caption
// selectedMedia   – optional filtered media array
// authorName      – caller passes currentUserData.name to avoid an extra read
async function forwardPost(post, targetBoardIds, forwardMessage = '', selectedMedia = null, authorName = '') {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const name = authorName || (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.name)
    || user.displayName || 'Anonymous';

  let allMedia, imageUrl, allPhotos, videoUrl, allVideos, thumbUrl, allThumbs;
  if (selectedMedia && selectedMedia.length > 0) {
    allMedia  = selectedMedia;
    imageUrl  = null; allPhotos = []; videoUrl = null; allVideos = []; thumbUrl = null; allThumbs = [];
  } else {
    allMedia  = post.allMedia  || null;
    imageUrl  = post.imageUrl  || null;
    allPhotos = post.allPhotos || [];
    videoUrl  = post.videoUrl  || null;
    allVideos = post.allVideos || [];
    thumbUrl  = post.thumbUrl  || null;
    allThumbs = post.allThumbs || [];
  }

  const preview = forwardMessage || (post.content ? post.content.slice(0, 80) : '📎 Media');
  const now     = firebase.firestore.Timestamp.fromDate(new Date());
  const ids     = Array.isArray(targetBoardIds) ? targetBoardIds : [targetBoardIds];

  await Promise.all(ids.map(targetBoardId =>
    db.collection('posts').add({
      boardId:              targetBoardId,
      authorId:             user.uid,
      authorName:           name,
      content:              forwardMessage,
      imageUrl,
      allPhotos,
      videoUrl,
      allVideos,
      allMedia,
      thumbUrl,
      allThumbs,
      timestamp:            now,
      commentCount:         0,
      isPinned:             false,
      forwardedFrom:        post.id,
      forwardedAuthorName:  post.authorName || 'Member',
      forwardedContent:     post.content   || '',
      reactions:            {},
    }).then(() => {
      db.collection('boards').doc(targetBoardId).update({
        ..._buildBoardActivityUpdate(preview, now),
        postsCount: firebase.firestore.FieldValue.increment(1),
        activity24h: firebase.firestore.FieldValue.increment(1),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {}).finally(() => _recomputeBoardRankNonBlocking(targetBoardId));
    })
  ));
}
