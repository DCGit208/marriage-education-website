const ChatState = {
  activeConversationId: null,
  messages: []
};

let currentUserId = null;
let unsubscribeMessages = null;
let eventsBound = false;

const chatBody = document.getElementById('chatBody');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const backBtn = document.getElementById('backBtn');
const chatTitle = document.querySelector('.chat-title');

function resolveConversationId() {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get('convId') ||
    params.get('conversationId') ||
    params.get('conv') ||
    null
  );
}

function formatTime(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function renderChatUI() {
  if (!chatBody) return;

  if (!ChatState.activeConversationId) {
    if (chatTitle) chatTitle.textContent = 'Conversation';
    chatBody.innerHTML = '<div class="chat-empty">No conversation selected.</div>';
    return;
  }

  if (chatTitle) chatTitle.textContent = 'Conversation';

  if (!ChatState.messages.length) {
    chatBody.innerHTML = '<div class="chat-empty">No messages yet. Start the conversation.</div>';
    return;
  }

  const html = ChatState.messages.map((msg) => {
    const mine = msg.senderId === currentUserId;
    const rowClass = mine ? 'mine' : 'theirs';
    const text = escapeHtml(msg.text || '');
    const time = formatTime(msg.timestamp);

    return `
      <div class="chat-row ${rowClass}">
        <div class="chat-bubble">
          <p class="chat-text">${text}</p>
          <span class="chat-meta">${escapeHtml(time)}</span>
        </div>
      </div>
    `;
  }).join('');

  chatBody.innerHTML = html;
  chatBody.scrollTop = chatBody.scrollHeight;
}

function closeChat() {
  if (typeof unsubscribeMessages === 'function') {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }
  ChatState.activeConversationId = null;
  ChatState.messages = [];
  renderChatUI();
}

function attachMessageListener() {
  if (!ChatState.activeConversationId) {
    ChatState.messages = [];
    renderChatUI();
    return;
  }

  if (typeof unsubscribeMessages === 'function') {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  unsubscribeMessages = db
    .collection('conversations')
    .doc(ChatState.activeConversationId)
    .collection('messages')
    .orderBy('timestamp', 'asc')
    .onSnapshot(
      (snap) => {
        ChatState.messages = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderChatUI();
      },
      (err) => {
        console.error('[DM-V2] message listener error:', err);
        ChatState.messages = [];
        renderChatUI();
      }
    );
}

async function sendMessage() {
  if (!ChatState.activeConversationId || !currentUserId || !messageInput) return;

  const text = messageInput.value.trim();
  if (!text) return;

  messageInput.value = '';

  const convRef = db.collection('conversations').doc(ChatState.activeConversationId);
  const now = firebase.firestore.FieldValue.serverTimestamp();

  await convRef.collection('messages').add({
    senderId: currentUserId,
    text,
    timestamp: now,
    edited: false,
    deleted: false
  });

  await convRef.update({
    lastMessage: text.slice(0, 100),
    lastMessageAt: now,
    [`lastRead.${currentUserId}`]: now
  }).catch(() => {});
}

function preventScrollBehavior() {
  // Scroll isolation is enforced in CSS: html/body/chat-root hidden overflow,
  // and chat-body as the single scroll container.
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  // Prevent page scroll
  preventScrollBehavior();

  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      try {
        await sendMessage();
      } catch (err) {
        console.error('[DM-V2] send failed:', err);
      }
    });
  }

  if (messageInput) {
    messageInput.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      try {
        await sendMessage();
      } catch (err) {
        console.error('[DM-V2] send failed:', err);
      }
    });

    // Scroll to bottom on input focus and typing
    messageInput.addEventListener('focus', () => {
      setTimeout(() => {
        if (chatBody) {
          chatBody.scrollTop = chatBody.scrollHeight;
        }
      }, 100);
    });

    messageInput.addEventListener('input', () => {
      if (chatBody) {
        chatBody.scrollTop = chatBody.scrollHeight;
      }
    });
  }

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (ChatState.activeConversationId) {
        closeChat();
      } else {
        window.history.back();
      }
    });
  }
}

function initDmV2(user) {
  currentUserId = user.uid;
  ChatState.activeConversationId = resolveConversationId();
  ChatState.messages = [];
  renderChatUI();
  attachMessageListener();
}

auth.onAuthStateChanged((user) => {
  if (!user) {
    window.location.href = '/auth';
    return;
  }

  bindEvents();
  initDmV2(user);
});
