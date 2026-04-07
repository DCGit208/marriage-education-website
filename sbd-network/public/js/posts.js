// ================================================================
// POSTS MANAGEMENT
// ================================================================

const _NOTIF_TIER_ORDER = { free: 0, foundation: 1, premium: 2, elite: 3 };

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
      lastPostAt:      postData.timestamp,
      lastPostPreview: content ? content.slice(0, 80) : '📎 Media',
    }).catch(() => {});

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
      db.collection('boards').doc(postDoc.data().boardId).update({
        lastPostAt:      firebase.firestore.Timestamp.fromDate(new Date()),
        lastPostPreview: `💬 ${commentData.authorName}: ${text.slice(0, 60)}`,
      }).catch(() => {});
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

  // Resolve the groupId and requiredTier for this board
  let groupId      = null;
  let requiredTier = 'free';
  try {
    const boardDoc = await db.collection('boards').doc(boardId).get();
    if (boardDoc.exists) {
      groupId      = boardDoc.data().groupId      || null;
      requiredTier = boardDoc.data().requiredTier || 'free';
    }
  } catch (_) {}

  // Fetch only users who belong to this group; fall back to all users if groupId unknown
  let usersSnap;
  if (groupId) {
    usersSnap = await db.collection('users').where('groups', 'array-contains', groupId).get();
  } else {
    usersSnap = await db.collection('users').get();
  }
  if (!usersSnap || usersSnap.empty) return;

  const batch = db.batch();
  const body  = `${authorName}: ${(content || 'Shared a photo or video').substring(0, 80)}`;
  usersSnap.forEach(userDoc => {
    if (userDoc.id === currentUid) return;
    // Tier guard — never notify users who cannot access this board
    const uTier = userDoc.data().tier || 'free';
    if ((_NOTIF_TIER_ORDER[uTier] ?? 0) < (_NOTIF_TIER_ORDER[requiredTier] ?? 0)) return;
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

  // ── Step 1: always notify the post author directly (guaranteed delivery) ──
  if (postAuthorId && postAuthorId !== currentUid) {
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
  } else if (postAuthorId === currentUid) {
    console.log('[Notif:comment] commenter IS post author — skipping author notification');
  } else {
    console.warn('[Notif:comment] postAuthorId missing — cannot notify post author');
  }

  // ── Step 2: notify all other group members (if we have a boardId) ──────────
  if (boardId) {
    let groupId          = null;
    let boardName        = 'board';
    let boardRequiredTier = 'free';
    try {
      const boardDoc = await db.collection('boards').doc(boardId).get();
      if (boardDoc.exists) {
        groupId           = boardDoc.data().groupId      || null;
        boardName         = boardDoc.data().title        || 'board';
        boardRequiredTier = boardDoc.data().requiredTier || 'free';
        console.log('[Notif:comment] board resolved:', { boardName, groupId, boardRequiredTier });
      } else {
        console.warn('[Notif:comment] board doc not found:', boardId);
      }
    } catch (e) {
      console.error('[Notif:comment] Failed to fetch board doc:', e);
    }

    if (groupId) {
      let usersSnap;
      try {
        usersSnap = await db.collection('users').where('groups', 'array-contains', groupId).get();
        console.log('[Notif:comment] group members found:', usersSnap.size, '(groupId:', groupId, ')');
      } catch (e) {
        console.error('[Notif:comment] Failed to query group members:', e);
      }

      if (usersSnap && !usersSnap.empty) {
        usersSnap.forEach(userDoc => {
          if (userDoc.id === currentUid)    return; // don't notify commenter
          if (notifiedUids.has(userDoc.id)) return; // already notified (post author)
          // Tier guard — skip users who cannot access this board
          const uTier = userDoc.data().tier || 'free';
          if ((_NOTIF_TIER_ORDER[uTier] ?? 0) < (_NOTIF_TIER_ORDER[boardRequiredTier] ?? 0)) return;
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
      // No groupId on board — fall back to all users (same strategy as _writePostNotifications)
      console.warn('[Notif:comment] board has no groupId — falling back to all-users notification');
      let fallbackSnap;
      try {
        fallbackSnap = await db.collection('users').get();
      } catch (e) {
        console.error('[Notif:comment] Failed to fetch users for fallback:', e);
      }
      if (fallbackSnap && !fallbackSnap.empty) {
        fallbackSnap.forEach(userDoc => {
          if (userDoc.id === currentUid)    return;
          if (notifiedUids.has(userDoc.id)) return;
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
      }
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

  const batch = db.batch();
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const body = `${authorName} mentioned you: ${content.substring(0, 80)}`;

  mentionedUserIds.forEach(userId => {
    if (userId === currentUid) return; // Don't notify yourself
    
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
  });

  try {
    await batch.commit();
    console.log('[Notif:mention] notified', mentionedUserIds.length, 'users');
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

  // Notify post author when someone reacts (not on removal, not self-reaction)
  if (!already && postData.authorId && postData.authorId !== userId) {
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
  if (!already && commentData.authorId && commentData.authorId !== userId) {
    const reactorDoc = await db.collection('users').doc(userId).get();
    const reactorName = reactorDoc.exists ? (reactorDoc.data().name || 'Someone') : 'Someone';
    // Need boardId — fetch from the post
    let boardId = null;
    if (commentData.postId) {
      const pDoc = await db.collection('posts').doc(commentData.postId).get();
      if (pDoc.exists) boardId = pDoc.data().boardId || null;
    }
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
        lastPostAt:      now,
        lastPostPreview: preview,
      }).catch(() => {});
    })
  ));
}
