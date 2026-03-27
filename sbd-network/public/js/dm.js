// ================================================================
// DIRECT MESSAGES
// Firestore schema:
//   conversations/{id}  { participantIds:[uid,uid], participantNames:{uid:name},
//                         participantPhotos:{uid:url|null},
//                         lastMessage:'', lastMessageAt:Timestamp,
//                         lastRead:{uid:Timestamp} }
//   conversations/{id}/messages/{mid}  {
//     senderId, text, timestamp,
//     imageUrl?,          // attachment
//     replyTo?: { messageId, senderId, senderName, text },
//     reactions?: { emoji: [uid,...] },
//     deleted?: true
//   }
// ================================================================

let currentUserId   = null;
let currentUserData = null;
let currentIsAdmin  = false;
let activeConvId    = null;
let activeOtherId   = null;
let activeOtherName = null;
let _chatUnsub      = null;
let _convUnsub      = null;
let _chatOldestDoc  = null;  // oldest visible message snapshot doc (for pagination)
let _chatAllLoaded  = false; // true when no older messages remain

// Quote-reply state
let _replyTo = null; // { messageId, senderId, senderName, text }

// Edit state
let _editingMessageId = null;
let _typingTimeout    = null;
let _typingUnsub      = null;
let _isOtherTyping    = false;

const inboxView        = document.getElementById('inboxView');
const chatView         = document.getElementById('chatView');
const conversationList = document.getElementById('conversationList');
const chatMessages     = document.getElementById('chatMessages');
const chatInput        = document.getElementById('chatInput');
const chatSendBtn      = document.getElementById('chatSendBtn');
const dmPageTitle      = document.getElementById('dmPageTitle');
const replyBanner      = document.getElementById('replyBanner');
const replyBannerText  = document.getElementById('replyBannerText');
const replyCancelBtn   = document.getElementById('replyCancelBtn');
const editBanner       = document.getElementById('editBanner');
const editCancelBtn    = document.getElementById('editCancelBtn');
const attachBtn        = document.getElementById('attachBtn');
const attachInput      = document.getElementById('attachInput');

// ── Auth guard ───────────────────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = 'index.html'; return; }
  currentUserId = user.uid;

  if (typeof initNotifications === 'function') initNotifications(user.uid);

  showLoading(true);
  try {
    const userDoc = await db.collection('users').doc(user.uid).get();
    currentUserData = userDoc.exists ? userDoc.data() : {};
    currentIsAdmin  = currentUserData.role === 'admin';

    const groups = currentUserData.groups || [];
    if (!groups.length && !currentIsAdmin) {
      document.getElementById('noGroupDmMessage').style.display = 'block';
    }

    loadInbox();
    // Update own presence timestamp
    db.collection('users').doc(user.uid).update({
      lastActive: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
  } catch (err) {
    console.error('DM init error:', err);
  } finally {
    showLoading(false);
  }
});

// ── Inbox ─────────────────────────────────────────────────────────
function loadInbox() {
  if (_convUnsub) { _convUnsub(); _convUnsub = null; }

  _convUnsub = db.collection('conversations')
    .where('participantIds', 'array-contains', currentUserId)
    .onSnapshot(snap => {
      const docs = snap.docs.slice().sort((a, b) => {
        const ta = a.data().lastMessageAt?.seconds || 0;
        const tb = b.data().lastMessageAt?.seconds || 0;
        return tb - ta;
      });

      conversationList.innerHTML = '';
      if (docs.length === 0) {
        document.getElementById('noConvsMessage').style.display = 'block';
      } else {
        document.getElementById('noConvsMessage').style.display = 'none';
      }

      docs.forEach(doc => {
        const d = doc.data();
        const otherId   = d.participantIds.find(id => id !== currentUserId);
        const otherName = (d.participantNames || {})[otherId] || 'Member';
        const otherPhoto= (d.participantPhotos || {})[otherId] || null;

        const lastReadAt = (d.lastRead || {})[currentUserId] || null;
        const lastMsgAt  = d.lastMessageAt || null;
        const hasUnread  = lastMsgAt && (!lastReadAt || lastMsgAt.seconds > lastReadAt.seconds);

        const item = document.createElement('div');
        item.className = 'convo-item' + (hasUnread ? ' unread' : '');
        const preview      = d.lastMessage || '';
        const lastSenderId = d.lastSenderId || null;
        const unreadCount  = (d.unreadCount || {})[currentUserId] || 0;
        const previewText  = preview
          ? (lastSenderId === currentUserId ? 'You: ' : '') + preview
          : '';
        item.innerHTML = `
          <div class="convo-avatar-wrap" data-puid="${esc(otherId)}">
            ${avatarHtml(otherName, otherPhoto, 'convo-avatar')}
          </div>
          <div class="convo-body">
            <div class="convo-name">${esc(otherName)}</div>
            <div class="convo-preview">${esc(previewText)}</div>
          </div>
          <div class="convo-meta">
            <span class="convo-time">${timeAgo(d.lastMessageAt)}</span>
            ${unreadCount > 0
              ? `<span class="convo-unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>`
              : (hasUnread ? '<span class="convo-dot"></span>' : '')
            }
          </div>
        `;
        item.addEventListener('click', () => openChat(doc.id, otherId, otherName, otherPhoto));
        conversationList.appendChild(item);
      });

      // Presence dots — batch-fetch other users' lastActive timestamps
      const otherIds = docs.map(doc => {
        const d = doc.data();
        return d.participantIds.find(id => id !== currentUserId);
      }).filter(Boolean);
      if (otherIds.length > 0) {
        const chunks = [];
        for (let i = 0; i < otherIds.length; i += 30) chunks.push(otherIds.slice(i, i + 30));
        Promise.all(chunks.map(chunk =>
          db.collection('users').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get()
        )).then(snapshots => {
          const now = Date.now() / 1000;
          snapshots.forEach(snap => {
            snap.forEach(userDoc => {
              const la = userDoc.data().lastActive;
              if (la && la.seconds && (now - la.seconds) < 300) {
                const wrap = conversationList.querySelector(`[data-puid="${userDoc.id}"]`);
                if (wrap && !wrap.querySelector('.presence-dot')) {
                  const dot = document.createElement('div');
                  dot.className = 'presence-dot';
                  wrap.appendChild(dot);
                }
              }
            });
          });
        }).catch(() => {});
      }
    }, err => console.error('Inbox error:', err));
}

// ── Chat view ─────────────────────────────────────────────────────
async function openChat(convId, otherId, otherName, otherPhoto) {
  activeConvId    = convId;
  activeOtherId   = otherId;
  activeOtherName = otherName;
  if (_chatUnsub) { _chatUnsub(); _chatUnsub = null; }
  clearReply();

  inboxView.style.display = 'none';
  chatView.style.display  = 'flex';
  document.body.classList.add('in-chat');
  // Hide bottom nav and extend dm-main to full height so input bar owns the bottom
  const _nav  = document.querySelector('.bottom-nav');
  const _main = document.querySelector('.dm-main');
  if (_nav)  _nav.style.display  = 'none';
  if (_main) _main.style.bottom  = '0';
  dmPageTitle.textContent = otherName;
  document.getElementById('backBtn').onclick = () => closeChat();

  _chatOldestDoc  = null;
  _chatAllLoaded  = false;

  chatMessages.innerHTML = '<div class="chat-loading">Loading…</div>';

  _markRead(convId);

  // Typing indicator listener for this conversation
  if (_typingUnsub) { _typingUnsub(); _typingUnsub = null; }
  _typingUnsub = db.collection('conversations').doc(convId).onSnapshot(convSnap => {
    if (!convSnap.exists) return;
    const typing  = convSnap.data().typing || {};
    const otherAt = typing[otherId];
    _isOtherTyping = !!(otherAt && otherAt.seconds && (Date.now() / 1000 - otherAt.seconds) < 8);
    _showTypingBubble(_isOtherTyping);
  }, () => {});

  // Real-time message listener — limitToLast(50) for pagination
  _chatUnsub = db.collection('conversations').doc(convId)
    .collection('messages')
    .orderBy('timestamp', 'asc')
    .limitToLast(50)
    .onSnapshot(snap => {
      if (!snap.empty && !_chatOldestDoc) {
        _chatOldestDoc = snap.docs[0];
      }
      const wasAtBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 80;
      const prevScrollHeight = chatMessages.scrollHeight;

      // Preserve "load older" button if it exists
      const loaderBtn = chatMessages.querySelector('.load-older-btn');

      chatMessages.innerHTML = '';

      // Re-insert the "load older" button at top
      if (!_chatAllLoaded) {
        const olderBtn = document.createElement('button');
        olderBtn.className = 'load-older-btn';
        olderBtn.textContent = 'Load older messages';
        olderBtn.onclick = () => _loadOlderMessages(convId, otherId, otherName, otherPhoto);
        chatMessages.appendChild(olderBtn);
      }

      let lastDate = '';
      snap.forEach(msgDoc => {
        const m    = msgDoc.data();
        const mine = m.senderId === currentUserId;
        const msgDate = m.timestamp?.toDate ? m.timestamp.toDate().toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'short'}) : '';
        if (msgDate && msgDate !== lastDate) {
          lastDate = msgDate;
          const sep = document.createElement('div');
          sep.className = 'chat-date-sep';
          sep.textContent = msgDate;
          chatMessages.appendChild(sep);
        }
        chatMessages.appendChild(_buildBubble(msgDoc, mine, otherName, otherPhoto, convId));
      });

      _updateReadTicks(snap);
      _showTypingBubble(_isOtherTyping);

      if (wasAtBottom || !loaderBtn) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      } else {
        // Keep scroll position after new messages arrive at bottom
        chatMessages.scrollTop += chatMessages.scrollHeight - prevScrollHeight;
      }
      _markRead(convId);
    }, err => console.error('Chat listener error:', err));

  chatInput.focus();
}

// ── Build a single chat bubble element ───────────────────────────
function _buildBubble(msgDoc, mine, otherName, otherPhoto, convId) {
  const m = msgDoc.data();
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble ' + (mine ? 'mine' : 'theirs');
  bubble.dataset.messageId = msgDoc.id;

  if (m.deleted) {
    bubble.innerHTML = `<div class="bubble-content"><p class="bubble-text bubble-deleted">🚫 Message deleted</p></div>`;
    return bubble;
  }

  const reactionsHtml = _buildReactionsHtml(m.reactions || {}, msgDoc.id, mine);
  let replyHtml = '';
  if (m.replyTo) {
    const rName = m.replyTo.senderName || 'Unknown';
    const rText = m.replyTo.text || (m.replyTo.imageUrl ? '📎 Photo' : '');
    replyHtml = `
      <div class="bubble-reply-preview">
        <span class="bubble-reply-name">${esc(rName)}</span>
        <span class="bubble-reply-text">${esc(rText.slice(0, 80))}</span>
      </div>`;
  }

  let mediaHtml = '';
  if (m.imageUrl) {
    mediaHtml = `<img class="bubble-img" src="${esc(m.imageUrl)}" alt="Image" loading="lazy">`;
  } else if (m.videoUrl) {
    mediaHtml = `<video class="bubble-video" src="${esc(m.videoUrl)}" controls playsinline preload="metadata"></video>`;
  } else if (m.audioUrl) {
    mediaHtml = `<audio class="bubble-audio" src="${esc(m.audioUrl)}" controls preload="metadata"></audio>`;
  }

  const timeStr    = timeAgo(m.timestamp);
  const editedHtml = m.edited ? `<span class="bubble-edited">(edited)</span>` : '';
  const tickHtml   = mine ? `<span class="bubble-tick" data-mid="${msgDoc.id}">✓</span>` : '';

  bubble.innerHTML = `
    ${!mine ? avatarHtml(otherName, otherPhoto, 'bubble-avatar') : ''}
    <div class="bubble-content">
      ${!mine ? `<span class="bubble-name">${esc(otherName)}</span>` : ''}
      ${replyHtml}${mediaHtml}
      ${m.text ? `<p class="bubble-text">${linkify(m.text)}</p>` : ''}
      <div class="bubble-footer">
        ${editedHtml}<span class="bubble-time">${timeStr}</span>${tickHtml}
      </div>
      ${reactionsHtml}
    </div>`;

  _attachBubbleContextMenu(bubble, msgDoc.id, m, mine, otherName);
  return bubble;
}

// ── Load older DM messages (pagination) ──────────────────────────
async function _loadOlderMessages(convId, otherId, otherName, otherPhoto) {
  if (_chatAllLoaded || !_chatOldestDoc) return;
  const olderBtn = chatMessages.querySelector('.load-older-btn');
  if (olderBtn) { olderBtn.textContent = 'Loading…'; olderBtn.disabled = true; }

  try {
    const snap = await db.collection('conversations').doc(convId)
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .endBefore(_chatOldestDoc)
      .limitToLast(30)
      .get();

    if (snap.empty || snap.docs.length < 30) {
      _chatAllLoaded = true;
      if (olderBtn) olderBtn.remove();
    } else {
      _chatOldestDoc = snap.docs[0];
      if (olderBtn) { olderBtn.textContent = 'Load older messages'; olderBtn.disabled = false; }
    }

    if (snap.empty) return;

    const prevScrollHeight = chatMessages.scrollHeight;
    let insertAfter = olderBtn || chatMessages.firstChild;
    let lastDate = '';

    snap.forEach(msgDoc => {
      const m = msgDoc.data();
      const mine = m.senderId === currentUserId;
      const msgDate = m.timestamp?.toDate ? m.timestamp.toDate().toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'short'}) : '';
      if (msgDate && msgDate !== lastDate) {
        lastDate = msgDate;
        const sep = document.createElement('div');
        sep.className = 'chat-date-sep';
        sep.textContent = msgDate;
        chatMessages.insertBefore(sep, insertAfter ? insertAfter.nextSibling : null);
        insertAfter = sep;
      }
      const bub = _buildBubble(msgDoc, mine, otherName, otherPhoto, convId);
      chatMessages.insertBefore(bub, insertAfter ? insertAfter.nextSibling : null);
      insertAfter = bub;
    });

    // Maintain scroll position after prepending
    chatMessages.scrollTop += chatMessages.scrollHeight - prevScrollHeight;
  } catch (err) {
    console.error('Load older error:', err);
    if (olderBtn) { olderBtn.textContent = 'Load older messages'; olderBtn.disabled = false; }
  }
}

function closeChat() {
  if (_chatUnsub)   { _chatUnsub();   _chatUnsub = null; }
  if (_typingUnsub) { _typingUnsub(); _typingUnsub = null; }
  _isOtherTyping = false;
  _clearTyping();
  _showTypingBubble(false);
  activeConvId = activeOtherId = activeOtherName = null;
  clearReply();
  chatView.style.display  = 'none';
  inboxView.style.display = 'block';
  document.body.classList.remove('in-chat');
  // Restore bottom nav and dm-main to inbox layout
  const _nav  = document.querySelector('.bottom-nav');
  const _main = document.querySelector('.dm-main');
  if (_nav)  _nav.style.display  = '';
  if (_main) _main.style.bottom  = '';
  dmPageTitle.textContent = 'Messages';
  document.getElementById('backBtn').onclick = null;
}

function _markRead(convId) {
  db.collection('conversations').doc(convId).update({
    [`lastRead.${currentUserId}`]: firebase.firestore.Timestamp.fromDate(new Date()),
    [`unreadCount.${currentUserId}`]: 0,
  }).catch(() => {});
}

// ── Read receipts ─────────────────────────────────────────────────
function _updateReadTicks(snap) {
  if (!activeConvId) return;
  db.collection('conversations').doc(activeConvId).get().then(convDoc => {
    if (!convDoc.exists) return;
    const otherReadAt = (convDoc.data().lastRead || {})[activeOtherId] || null;
    if (!otherReadAt) return;

    // Find the last message sent by me that was sent before other's lastRead
    const myMsgs = snap.docs.filter(d => d.data().senderId === currentUserId && !d.data().deleted);
    chatMessages.querySelectorAll('.bubble-tick').forEach(el => {
      el.textContent = '✓';
      el.classList.remove('read');
    });
    if (!myMsgs.length) return;
    // Walk backwards to find last bubble other has seen
    for (let i = myMsgs.length - 1; i >= 0; i--) {
      const ts = myMsgs[i].data().timestamp;
      if (ts && otherReadAt.seconds >= ts.seconds) {
        const tick = chatMessages.querySelector(`.bubble-tick[data-mid="${myMsgs[i].id}"]`);
        if (tick) { tick.textContent = '✓✓'; tick.classList.add('read'); }
        break;
      }
    }
  }).catch(() => {});
}

// ── Reactions ─────────────────────────────────────────────────────
const REACTION_EMOJIS = ['❤️','👍','😂','😮','😢','🙏'];

function _buildReactionsHtml(reactions, messageId, mine) {
  const entries = Object.entries(reactions).filter(([, uids]) => uids.length > 0);
  if (!entries.length) return '';
  const chips = entries.map(([emoji, uids]) => {
    const iMine = uids.includes(currentUserId);
    return `<button class="msg-reaction-chip${iMine ? ' mine' : ''}" data-emoji="${esc(emoji)}" data-mid="${messageId}" type="button">${emoji} ${uids.length}</button>`;
  }).join('');
  return `<div class="msg-reactions ${mine ? 'mine' : ''}">${chips}</div>`;
}

async function _toggleReaction(messageId, emoji) {
  if (!activeConvId) return;
  const ref = db.collection('conversations').doc(activeConvId)
    .collection('messages').doc(messageId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const reactions = snap.data().reactions || {};
  const uids = reactions[emoji] || [];
  const already = uids.includes(currentUserId);
  await ref.update({
    [`reactions.${emoji}`]: already
      ? firebase.firestore.FieldValue.arrayRemove(currentUserId)
      : firebase.firestore.FieldValue.arrayUnion(currentUserId),
  });
}

// Delegate reaction chip taps
chatMessages.addEventListener('click', e => {
  const chip = e.target.closest('.msg-reaction-chip');
  if (!chip) return;
  _toggleReaction(chip.dataset.mid, chip.dataset.emoji);
});

// ── Bubble context menu ───────────────────────────────────────────
let _ctxBubble = null;

function _attachBubbleContextMenu(bubble, messageId, msgData, mine, otherName) {
  const trigger = (e) => {
    e.preventDefault();
    _showBubbleMenu(bubble, messageId, msgData, mine);
  };

  // Unified touch handler: swipe-right → reply, long-press → context menu
  let pressTimer = null;
  let _sx = 0, _sy = 0, _swiping = false;
  const SWIPE_THRESHOLD = 60;

  bubble.addEventListener('touchstart', e => {
    _sx = e.touches[0].clientX;
    _sy = e.touches[0].clientY;
    _swiping = false;
    pressTimer = setTimeout(() => { pressTimer = null; trigger({ preventDefault: () => {} }); }, 550);
  }, { passive: true });

  bubble.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - _sx;
    const dy = e.touches[0].clientY - _sy;
    if (dx > 10 && Math.abs(dx) > Math.abs(dy)) {
      // Right swipe — cancel long-press, show swipe UI
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      _swiping = true;
      bubble.style.transition = 'none';
      bubble.style.transform = `translateX(${Math.min(dx, 80)}px)`;
      let icon = bubble.querySelector('.swipe-reply-icon');
      if (!icon) {
        icon = document.createElement('span');
        icon.className = 'swipe-reply-icon';
        icon.textContent = '↩';
        bubble.appendChild(icon);
      }
      icon.style.opacity = String(Math.min((dx - 10) / 50, 1));
    } else {
      // Not a right swipe — cancel long-press (vertical scroll or left swipe)
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    }
  }, { passive: true });

  bubble.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - _sx;
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    // Snap bubble back
    bubble.style.transition = 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)';
    bubble.style.transform = '';
    const icon = bubble.querySelector('.swipe-reply-icon');
    if (icon) {
      icon.style.transition = 'opacity 0.22s';
      icon.style.opacity = '0';
      setTimeout(() => icon.remove(), 240);
    }
    if (_swiping && dx >= SWIPE_THRESHOLD) {
      _setReply(messageId, msgData);
    }
    _swiping = false;
  }, { passive: true });

  // Right-click (desktop)
  bubble.addEventListener('contextmenu', trigger);
}

function _showBubbleMenu(bubble, messageId, msgData, mine) {
  _closeBubbleMenu();

  const menu = document.createElement('div');
  menu.id = 'bubbleCtxMenu';
  menu.className = 'bubble-ctx-menu';

  // Emoji quick-react row
  const emojiRow = document.createElement('div');
  emojiRow.className = 'bubble-ctx-emojis';
  REACTION_EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'ctx-emoji-btn';
    btn.textContent = emoji;
    btn.addEventListener('click', () => { _toggleReaction(messageId, emoji); _closeBubbleMenu(); });
    emojiRow.appendChild(btn);
  });
  menu.appendChild(emojiRow);

  const actions = [
    { label: '↩️ Reply', fn: () => _setReply(messageId, msgData) },
    { label: '📋 Copy', fn: () => { if (msgData.text) navigator.clipboard?.writeText(msgData.text).catch(() => {}); } },
    { label: '↗️ Forward', fn: () => _forwardMessage(msgData) },
  ];
  if (mine && !msgData.deleted) {
    if (msgData.text) {
      actions.push({ label: '✏️ Edit', fn: () => _setEdit(messageId, msgData.text) });
    }
  }
  if ((mine || currentIsAdmin) && !msgData.deleted) {
    actions.push({ label: '🗑️ Delete', fn: () => _deleteMessage(messageId, msgData), danger: true });
  }

  actions.forEach(({ label, fn, danger }) => {
    const btn = document.createElement('button');
    btn.className = 'bubble-ctx-btn' + (danger ? ' danger' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => { fn(); _closeBubbleMenu(); });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  _ctxBubble = menu;

  // Position near the bubble — clamp within visible viewport
  const rect = bubble.getBoundingClientRect();
  const menuH = 180; // estimated; actual may vary
  let top = rect.top - menuH - 8;
  if (top < 8) top = rect.bottom + 8;
  // Also clamp so menu doesn't overflow the bottom of the screen
  const vpH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  if (top + menuH > vpH - 8) top = Math.max(8, vpH - menuH - 8);
  let left = mine ? rect.right - 220 : rect.left;
  if (left + 220 > window.innerWidth) left = window.innerWidth - 228;
  if (left < 8) left = 8;
  menu.style.top  = top + 'px';
  menu.style.left = left + 'px';

  requestAnimationFrame(() => menu.classList.add('open'));
  setTimeout(() => document.addEventListener('click', _closeBubbleMenu, { once: true }), 10);
}

function _closeBubbleMenu() {
  if (_ctxBubble) { _ctxBubble.remove(); _ctxBubble = null; }
}

// ── Quote-reply ───────────────────────────────────────────────────
function _setReply(messageId, msgData) {
  const senderName = msgData.senderId === currentUserId
    ? (currentUserData.name || 'You')
    : (activeOtherName || 'Them');
  _replyTo = { messageId, senderId: msgData.senderId, senderName, text: msgData.text || (msgData.imageUrl ? '📎 Photo' : '') };
  replyBannerText.textContent = `↩ ${senderName}: ${_replyTo.text.slice(0, 60)}`;
  replyBanner.style.display = 'flex';
  chatInput.focus();
}

function clearReply() {
  _replyTo = null;
  if (replyBanner) replyBanner.style.display = 'none';
  if (replyBannerText) replyBannerText.textContent = '';
}

replyCancelBtn && replyCancelBtn.addEventListener('click', clearReply);

// ── Edit message ──────────────────────────────────────────────────
function _setEdit(messageId, currentText) {
  // Can't reply and edit at the same time
  clearReply();
  _editingMessageId = messageId;
  if (editBanner) editBanner.style.display = 'flex';
  chatInput.value = currentText;
  chatInput.style.height = 'auto';
  chatInput.style.height = chatInput.scrollHeight + 'px';
  chatInput.focus();
  // Move cursor to end
  chatInput.selectionStart = chatInput.selectionEnd = chatInput.value.length;
}

function clearEdit() {
  _editingMessageId = null;
  if (editBanner) editBanner.style.display = 'none';
  chatInput.value = '';
  chatInput.style.height = 'auto';
}

editCancelBtn && editCancelBtn.addEventListener('click', clearEdit);

// ── Delete message ────────────────────────────────────────────────
async function _deleteMessage(messageId, msgData) {
  if (!activeConvId) return;
  if (!confirm('Delete this message?')) return;

  // Permanently remove the actual file(s) from R2 via the Worker
  const mediaUrls = [msgData?.imageUrl, msgData?.videoUrl, msgData?.audioUrl].filter(Boolean);
  if (mediaUrls.length) {
    const user = auth.currentUser;
    const idToken = user ? await user.getIdToken().catch(() => null) : null;
    if (idToken) {
      await Promise.all(mediaUrls.map(url =>
        fetch(`${UPLOAD_WORKER_URL}/delete`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        }).catch(() => {})
      ));
    }
  }

  // Soft-delete the Firestore document (clears all media URL fields)
  await db.collection('conversations').doc(activeConvId)
    .collection('messages').doc(messageId)
    .update({
      deleted: true,
      text: '',
      imageUrl: firebase.firestore.FieldValue.delete(),
      videoUrl: firebase.firestore.FieldValue.delete(),
      audioUrl: firebase.firestore.FieldValue.delete(),
    })
    .catch(e => showToast('Could not delete: ' + e.message));
}

// ── Forward message ───────────────────────────────────────────────
function _forwardMessage(msgData) {
  const overlay = document.getElementById('newDmOverlay');
  const modal   = document.getElementById('newDmModal');
  const search  = document.getElementById('newDmSearch');
  const list    = document.getElementById('newDmUserList');
  if (!overlay || !modal) return;

  const header = modal.querySelector('.dm-modal-header span');
  const origHeader = header ? header.textContent : 'New Message';
  if (header) header.textContent = 'Forward to…';

  // Show modal and load candidates
  overlay.style.display = 'block';
  modal.style.display   = 'flex';
  list.innerHTML = '<div class="dm-loading">Loading…</div>';
  search.value = '';

  fetchMessageablePeers().then(users => {
    _candidateUsers = users;
    renderCandidates(users);
  }).catch(() => { list.innerHTML = '<div class="dm-empty-peers">Error loading members.</div>'; });

  const cleanup = () => {
    overlay.style.display = 'none';
    modal.style.display   = 'none';
    if (header) header.textContent = origHeader;
    list.removeEventListener('click', itemClickHandler);
    overlay.removeEventListener('click', cancelHandler);
  };

  const itemClickHandler = async (e) => {
    const row = e.target.closest('[data-uid]');
    if (!row) return;
    cleanup();
    const targetOtherId = row.dataset.uid;

    // Find or create conversation with this user
    const participants = [currentUserId, targetOtherId].sort();
    let convId;
    const existSnap = await db.collection('conversations')
      .where('participantIds', '==', participants).limit(1).get().catch(() => null);
    if (existSnap && !existSnap.empty) {
      convId = existSnap.docs[0].id;
    } else {
      const docRef = await db.collection('conversations').add({
        participantIds: participants,
        participantNames: { [currentUserId]: currentUserData.name || 'Me', [targetOtherId]: '' },
        participantPhotos: {},
        lastMessage: '', lastMessageAt: firebase.firestore.Timestamp.now(),
      });
      convId = docRef.id;
    }

    const savedConvId   = activeConvId;
    const savedOtherId  = activeOtherId;
    activeConvId  = convId;
    activeOtherId = targetOtherId;
    try {
      await _doSend(
        msgData.text   || '',
        msgData.imageUrl || null,
        null,
        msgData.videoUrl || null,
        msgData.audioUrl || null
      );
      showToast('Forwarded!');
    } catch (e) {
      showToast('Forward failed: ' + e.message);
    } finally {
      activeConvId  = savedConvId;
      activeOtherId = savedOtherId;
    }
  };

  const cancelHandler = cleanup;
  list.addEventListener('click', itemClickHandler);
  overlay.addEventListener('click', cancelHandler, { once: true });
}

// ── Attachment (image or video) ───────────────────────────────────
attachBtn && attachBtn.addEventListener('click', () => attachInput && attachInput.click());
attachInput && attachInput.addEventListener('change', async () => {
  const file = attachInput.files[0];
  if (!file || !activeConvId) return;

  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) { showToast('Only images and videos are supported.'); return; }

  const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
  const label   = isVideo ? '100 MB' : '10 MB';
  if (file.size > maxSize) { showToast(`File too large (max ${label}).`); return; }
  attachInput.value = '';

  showToast('Uploading…');
  try {
    const folder = isVideo ? 'dm_videos' : 'dm_attachments';
    const url = await uploadToR2(file, folder);
    if (isVideo) {
      await _doSend('', null, null, url);
    } else {
      await _doSend('', url);
    }
    showToast('Sent!');
  } catch (e) {
    showToast('Upload failed: ' + e.message);
  }
});

// ── Voice messages ────────────────────────────────────────────────
(function () {
  const micBtn = document.getElementById('micBtn');
  if (!micBtn) return;
  let _mediaRecorder = null;
  let _audioChunks   = [];
  let _recording     = false;

  micBtn.addEventListener('click', async () => {
    if (!activeConvId) { showToast('Open a conversation first.'); return; }
    if (_recording) {
      // Stop recording
      _mediaRecorder && _mediaRecorder.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      _audioChunks = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
      _mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      _mediaRecorder.ondataavailable = e => { if (e.data.size > 0) _audioChunks.push(e.data); };
      _mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        _recording = false;
        micBtn.textContent = '🎤';
        micBtn.style.color = '';
        if (!_audioChunks.length) return;
        const blob = new Blob(_audioChunks, { type: _mediaRecorder.mimeType || 'audio/webm' });
        showToast('Sending voice message…');
        try {
          const ext      = blob.type.includes('mp4') ? 'm4a' : 'webm';
          const audioFile = new File([blob], `voice_${Date.now()}.${ext}`, { type: blob.type || 'audio/webm' });
          const audioUrl = await uploadToR2(audioFile, 'dm_audio');
          await _doSend('', null, null, null, audioUrl);
          showToast('Voice message sent!');
        } catch (e) { showToast('Voice send failed: ' + e.message); }
      };
      _mediaRecorder.start();
      _recording = true;
      micBtn.textContent = '⏹️';
      micBtn.style.color = '#e53935';
    } catch (e) { showToast('Microphone access denied.'); }
  });
})();

// ── Send message ──────────────────────────────────────────────────
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || !activeConvId) return;
  chatSendBtn.disabled = true;

  // ── Edit mode: update existing message ───────────────────────────
  if (_editingMessageId) {
    const editId = _editingMessageId;
    clearEdit();
    try {
      await db.collection('conversations').doc(activeConvId)
        .collection('messages').doc(editId)
        .update({ text, edited: true });
    } catch (err) {
      showToast('Could not edit: ' + err.message);
    } finally {
      chatSendBtn.disabled = false;
    }
    return;
  }

  // ── Normal send ───────────────────────────────────────────────────
  chatInput.value = '';
  chatInput.style.height = 'auto';
  clearTimeout(_typingTimeout);
  _clearTyping();
  const reply = _replyTo;
  clearReply();
  try {
    await _doSend(text, null, reply);
  } catch (err) {
    showToast('Could not send: ' + err.message);
    chatInput.value = text;
  } finally {
    chatSendBtn.disabled = false;
  }
}

async function _doSend(text, imageUrl, replyTo, videoUrl, audioUrl) {
  const now = firebase.firestore.Timestamp.fromDate(new Date());
  const msgData = {
    senderId:  currentUserId,
    timestamp: now,
    reactions: {},
  };
  if (text)     msgData.text     = text;
  if (imageUrl) msgData.imageUrl = imageUrl;
  if (videoUrl) msgData.videoUrl = videoUrl;
  if (audioUrl) msgData.audioUrl = audioUrl;
  if (replyTo)  msgData.replyTo  = replyTo;

  await db.collection('conversations').doc(activeConvId)
    .collection('messages').add(msgData);

  const preview = audioUrl ? '🎤 Voice message' : (videoUrl ? '🎥 Video' : (imageUrl ? '📎 Photo' : text.slice(0, 100)));
  await db.collection('conversations').doc(activeConvId).update({
    lastMessage:   preview,
    lastSenderId:  currentUserId,
    lastMessageAt: now,
    [`lastRead.${currentUserId}`]: now,
    [`unreadCount.${activeOtherId}`]: firebase.firestore.FieldValue.increment(1),
  });

  // Fire DM push notification to the other participant
  _triggerDmPush(activeConvId, activeOtherId, text || (audioUrl ? '🎤 Voice message' : (videoUrl ? '🎥 Video' : '📎 Photo'))).catch(() => {});
}

chatSendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = chatInput.scrollHeight + 'px';
  // Typing indicator
  if (activeConvId) {
    clearTimeout(_typingTimeout);
    _sendTyping();
    _typingTimeout = setTimeout(_clearTyping, 5000);
  }
});

// ── Typing indicator helpers ──────────────────────────────────────
function _sendTyping() {
  if (!activeConvId || !currentUserId) return;
  db.collection('conversations').doc(activeConvId).update({
    [`typing.${currentUserId}`]: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => {});
}

function _clearTyping() {
  clearTimeout(_typingTimeout);
  if (!activeConvId || !currentUserId) return;
  db.collection('conversations').doc(activeConvId).update({
    [`typing.${currentUserId}`]: firebase.firestore.FieldValue.delete()
  }).catch(() => {});
}

function _showTypingBubble(show) {
  let el = document.getElementById('dm-typing-bubble');
  if (!show) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'dm-typing-bubble';
    el.className = 'chat-bubble theirs';
    el.innerHTML = `
      <div class="bubble-content">
        <div class="typing-bubble">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>`;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

// ── DM Image Lightbox ─────────────────────────────────────────────
function _initDmLightbox() {
  let lb = document.getElementById('dm-lightbox');
  if (lb) return lb;
  lb = document.createElement('div');
  lb.id = 'dm-lightbox';
  lb.className = 'dm-lightbox';
  lb.innerHTML = `
    <button class="dm-lightbox-close" aria-label="Close lightbox">✕</button>
    <img class="dm-lightbox-img" src="" alt="Full size image">`;
  lb.querySelector('.dm-lightbox-close').addEventListener('click', _closeDmLightbox);
  lb.addEventListener('click', e => { if (e.target === lb) _closeDmLightbox(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') _closeDmLightbox(); });
  document.body.appendChild(lb);
  return lb;
}

function _openDmLightbox(src) {
  const lb = _initDmLightbox();
  lb.querySelector('.dm-lightbox-img').src = src;
  requestAnimationFrame(() => lb.classList.add('active'));
  document.body.style.overflow = 'hidden';
}

function _closeDmLightbox() {
  const lb = document.getElementById('dm-lightbox');
  if (!lb) return;
  lb.classList.remove('active');
  document.body.style.overflow = '';
}

// Lightbox: tap any image in a chat bubble
chatMessages.addEventListener('click', e => {
  const img = e.target.closest('.bubble-img');
  if (img) _openDmLightbox(img.src);
});

// ── DM Push notification ──────────────────────────────────────────
async function _triggerDmPush(convId, recipientId, body) {
  try {
    const user = firebase.auth().currentUser;
    if (!user) return;
    // Get the recipient's FCM token
    const recipDoc = await db.collection('users').doc(recipientId).get();
    if (!recipDoc.exists) return;
    const token = recipDoc.data().fcmToken;
    if (!token) return;

    const senderName = currentUserData.name || 'Someone';
    const idToken = await user.getIdToken();
    await fetch('https://sbd-upload-signer.sbdnetwork.workers.dev/notify-dm', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fcmToken: token,
        title:    `💬 ${senderName}`,
        body:     body.slice(0, 100),
        url:      `/dm.html`,
        convId,
      }),
    });
  } catch (e) {
    console.warn('[DM Push] Failed:', e);
  }
}

// ── New DM modal ──────────────────────────────────────────────────
const newDmBtn     = document.getElementById('newDmBtn');
const newDmOverlay = document.getElementById('newDmOverlay');
const newDmModal   = document.getElementById('newDmModal');
const newDmClose   = document.getElementById('newDmClose');
const newDmSearch  = document.getElementById('newDmSearch');
const newDmUserList= document.getElementById('newDmUserList');

let _candidateUsers = [];

newDmBtn.addEventListener('click', async () => {
  newDmOverlay.style.display = 'block';
  newDmModal.style.display   = 'flex';
  newDmUserList.innerHTML    = '<div class="dm-loading">Loading members…</div>';
  newDmSearch.value = '';
  document.body.style.overflow = 'hidden';

  _candidateUsers = await fetchMessageablePeers();
  renderCandidates(_candidateUsers);
});

function closeNewDm() {
  newDmOverlay.style.display = 'none';
  newDmModal.style.display   = 'none';
  document.body.style.overflow = '';
}

newDmClose.addEventListener('click', closeNewDm);
newDmOverlay.addEventListener('click', closeNewDm);

newDmSearch.addEventListener('input', () => {
  const q = newDmSearch.value.toLowerCase();
  renderCandidates(_candidateUsers.filter(u => u.name.toLowerCase().includes(q)));
});

function renderCandidates(users) {
  if (!users.length) {
    newDmUserList.innerHTML = '<div class="dm-empty-peers">No members found.</div>';
    return;
  }
  newDmUserList.innerHTML = '';
  users.forEach(u => {
    const row = document.createElement('div');
    row.className = 'dm-peer-row';
    row.dataset.uid = u.id;
    row.innerHTML = `
      ${avatarHtml(u.name, u.photoUrl, 'peer-avatar')}
      <span class="peer-name">${esc(u.name)}</span>
    `;
    row.addEventListener('click', () => startConversation(u));
    newDmUserList.appendChild(row);
  });
}

async function fetchMessageablePeers() {
  const myGroups = currentUserData.groups || [];

  let usersSnap;
  if (currentIsAdmin) {
    usersSnap = await db.collection('users').get();
  } else if (myGroups.length) {
    const snapsByGroup = await Promise.all(
      myGroups.map(gid => db.collection('users').where('groups', 'array-contains', gid).get())
    );
    const seen = new Map();
    snapsByGroup.forEach(snap => {
      snap.forEach(doc => {
        if (doc.id !== currentUserId) seen.set(doc.id, doc);
      });
    });
    return Array.from(seen.values()).map(doc => ({
      id: doc.id,
      name: doc.data().name || doc.data().email || 'Member',
      photoUrl: doc.data().photoUrl || null,
    })).sort((a, b) => a.name.localeCompare(b.name));
  } else {
    return [];
  }

  return usersSnap.docs
    .filter(d => d.id !== currentUserId)
    .map(d => ({
      id: d.id,
      name: d.data().name || d.data().email || 'Member',
      photoUrl: d.data().photoUrl || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function startConversation(otherUser) {
  closeNewDm();

  const snap = await db.collection('conversations')
    .where('participantIds', 'array-contains', currentUserId)
    .get();

  const existing = snap.docs.find(doc =>
    doc.data().participantIds.includes(otherUser.id)
  );

  if (existing) {
    openChat(existing.id, otherUser.id, otherUser.name, otherUser.photoUrl);
    return;
  }

  const myName  = currentUserData.name || auth.currentUser?.displayName || 'Member';
  const myPhoto = currentUserData.photoUrl || null;
  const now     = firebase.firestore.Timestamp.fromDate(new Date());

  const docRef = await db.collection('conversations').add({
    participantIds: [currentUserId, otherUser.id],
    participantNames: {
      [currentUserId]: myName,
      [otherUser.id]:  otherUser.name,
    },
    participantPhotos: {
      [currentUserId]: myPhoto,
      [otherUser.id]:  otherUser.photoUrl,
    },
    lastMessage:   '',
    lastMessageAt: now,
    lastRead: {
      [currentUserId]: now,
      [otherUser.id]:  null,
    },
    createdAt: now,
  });

  openChat(docRef.id, otherUser.id, otherUser.name, otherUser.photoUrl);
}

// ── Back button default (inbox → dashboard) ──────────────────────
document.getElementById('backBtn').addEventListener('click', () => {
  if (activeConvId) return;
  window.location.href = 'dashboard.html';
});

// ── Helpers ───────────────────────────────────────────────────────
function avatarHtml(name, photoUrl, cls) {
  if (photoUrl) {
    return `<img class="${cls} avatar-img-sm" src="${esc(photoUrl)}" alt="${esc(name)}">`;
  }
  const initials = (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return `<div class="${cls} avatar-initials-sm">${initials}</div>`;
}

function timeAgo(ts) {
  if (!ts) return '';
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts.seconds * 1000);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function linkify(str) {
  const escaped = esc(str);
  return escaped.replace(
    /(https?:\/\/[^\s<>"]+)/g,
    (url) => {
      let isInternal = false;
      try { isInternal = new URL(url).origin === location.origin; } catch (_) {}
      if (isInternal) {
        return `<a href="${url}" style="color:inherit;text-decoration:underline;word-break:break-all;">${url}</a>`;
      }
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;word-break:break-all;">${url}</a>`;
    }
  );
}

function showToast(msg) {
  const t = document.getElementById('appToast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function showLoading(show) {
  const el = document.getElementById('loadingOverlay');
  if (el) el.style.display = show ? 'flex' : 'none';
}

// ── iOS / Android keyboard: keep input bar above keyboard ────────────
// visualViewport shrinks when the soft keyboard opens. Adjust dm-main
// bottom so the input bar is never hidden behind the keyboard.
(function _initKeyboardAdjust() {
  if (!window.visualViewport) return;
  const dmMain = document.querySelector('.dm-main');
  if (!dmMain) return;

  const adjust = () => {
    const vv = window.visualViewport;
    // keyboardH = pixels the soft keyboard occupies (0 when closed)
    const keyboardH = Math.max(0, window.innerHeight - (vv.offsetTop + vv.height));
    if (keyboardH > 10) {
      // Keyboard open: push dm-main up above the keyboard.
      dmMain.style.bottom = keyboardH + 'px';
    } else {
      // Keyboard closed: remove the inline style — let CSS handle it.
      // In-chat: CSS rule gives env(safe-area-inset-bottom, 0px).
      // Inbox: CSS rule gives calc(60px + env(safe-area-inset-bottom)).
      dmMain.style.bottom = '';
    }
    // Scroll chat to bottom so latest message stays visible
    if (chatMessages && activeConvId) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  };

  window.visualViewport.addEventListener('resize', adjust);
  window.visualViewport.addEventListener('scroll', adjust);
}());

