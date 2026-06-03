/**
 * Messaging V2 — formation-governed communication (replaces legacy /dm).
 * Layout: CSS classes only. Firestore rules enforce tier + conversation security.
 */
(function () {
  'use strict';

  var messagesUnsub = null;
  var bootedUid = null;

  var TIER_LEVEL = {
    foundation: 0,
    free: 0,
    premium: 1,
    elite: 2,
    ambassador: 3,
    senior_ambassador: 4,
    rd: 5,
    admin: 6,
  };

  var ChatState = {
    currentConversationId: null,
    currentConversationTier: null,
    currentConversationLevel: 0,
    currentUserTier: null,
    currentView: 'inbox',
    keyboardVisible: false,
    activeParticipants: [],
    attachmentMode: false,
    discoveryMode: 'mentors',
    me: null,
    threads: [],
    groups: [],
    messages: [],
    discoveryUsers: [],
    activeGroupId: null,
    activeDirectUid: null,
    loading: true,
    statusMessage: null,
  };

  function el(id) {
    return document.getElementById(id);
  }

  function normalizeTier(raw) {
    var t = (raw && String(raw).toLowerCase()) || 'foundation';
    if (t === 'free') return 'foundation';
    if (TIER_LEVEL[t] !== undefined) return t;
    return 'foundation';
  }

  function tierLevel(tier) {
    var t = normalizeTier(tier);
    if (t === 'admin') return TIER_LEVEL.admin;
    return TIER_LEVEL[t] !== undefined ? TIER_LEVEL[t] : 0;
  }

  function effectiveTierLevel(u) {
    if (!u) return 0;
    return u.isAdmin ? TIER_LEVEL.admin : tierLevel(u.tier);
  }

  function normalizeUser(uid, raw) {
    var d = raw || {};
    var tier = normalizeTier(d.tier);
    return {
      uid: uid,
      name: d.name || d.displayName || d.email || 'Member',
      email: d.email || null,
      tier: tier,
      tierLevel: typeof d.tierLevel === 'number' ? d.tierLevel : tierLevel(tier),
      role: d.role || 'member',
      mentor: !!d.mentor,
      messagingEnabled: d.messagingEnabled !== false,
      isAdmin: d.role === 'admin',
    };
  }

  function calculateConversationSecurityLevel(participants) {
    if (!participants || !participants.length) {
      return { tier: 'foundation', level: 0 };
    }
    var minLevel = 99;
    var minTier = 'foundation';
    participants.forEach(function (p) {
      var lvl = typeof p.tierLevel === 'number' ? p.tierLevel : tierLevel(p.tier);
      if (lvl < minLevel) {
        minLevel = lvl;
        minTier = normalizeTier(p.tier);
      }
    });
    return { tier: minTier, level: minLevel };
  }

  function canDiscoverUser(viewer, target) {
    if (!viewer || !target || viewer.uid === target.uid) return false;
    if (!viewer.messagingEnabled || !target.messagingEnabled) return false;
    if (viewer.isAdmin || target.isAdmin) return true;
    if (tierLevel(viewer.tier) >= tierLevel(target.tier)) return true;
    if (target.mentor) return true;
    return false;
  }

  function canSendContent(contentTier, conversationLevel) {
    return tierLevel(contentTier) <= conversationLevel;
  }

  function directConvId(a, b) {
    return 'fc_' + [a, b].sort().join('_');
  }

  function setView(view) {
    ChatState.currentView = view;
    var app = el('mv2App');
    if (app) app.setAttribute('data-view', view);
    var back = el('mv2Back');
    if (back) {
      back.href = view === 'chat' ? '#' : '/dashboard.html';
      back.setAttribute('aria-label', view === 'chat' ? 'Back to inbox' : 'Back to home');
    }
    render();
  }

  function setKeyboardVisible(on) {
    ChatState.keyboardVisible = !!on;
    var app = el('mv2App');
    if (app) app.classList.toggle('is-keyboard-open', ChatState.keyboardVisible);
  }

  function showAlert(msg, ok) {
    var node = el('mv2Alert');
    if (!node) return;
    if (!msg) {
      node.textContent = '';
      node.classList.add('is-hidden');
      node.classList.remove('is-ok');
      return;
    }
    node.textContent = msg;
    node.classList.remove('is-hidden');
    node.classList.toggle('is-ok', !!ok);
  }

  function render() {
    var pill = el('mv2TierPill');
    if (pill && ChatState.me) {
      pill.textContent = (ChatState.me.isAdmin ? 'admin' : ChatState.me.tier) + ' · sec ' + ChatState.currentConversationLevel;
    }

    renderThreadList();
    renderGroupList();
    renderDiscovery();
    renderChat();
  }

  function renderThreadList() {
    var list = el('mv2ThreadList');
    if (!list) return;
    if (ChatState.loading) {
      list.innerHTML = '<li class="mv2-empty">Loading…</li>';
      return;
    }
    if (!ChatState.threads.length) {
      list.innerHTML =
        '<li class="mv2-empty">No direct threads yet. Tap <strong>Discover members</strong> above, choose a person, then send a message.</li>';
      return;
    }
    list.innerHTML = ChatState.threads
      .map(function (t) {
        var active = ChatState.currentConversationId === t.id && !ChatState.activeGroupId;
        return (
          '<li class="mv2-list-item"><button type="button" class="mv2-list-btn' +
          (active ? ' is-active' : '') +
          '" data-thread="' +
          t.id +
          '"><strong>' +
          escapeHtml(t.title) +
          '</strong><span>' +
          escapeHtml(t.preview || 'No messages') +
          ' · ' +
          escapeHtml(t.securityTier || 'foundation') +
          '</span></button></li>'
        );
      })
      .join('');
  }

  function renderGroupList() {
    var list = el('mv2GroupList');
    if (!list) return;
    if (!ChatState.groups.length) {
      var groupHint = ChatState.me && ChatState.me.isAdmin
        ? 'No formation groups yet. Tap <strong>Quick setup</strong> above, or Admin Panel → Messages V2 → Create group.'
        : 'No formation groups at your tier yet. Your mentor or admin will add you to a circle.';
      list.innerHTML = '<li class="mv2-empty">' + groupHint + '</li>';
      return;
    }
    list.innerHTML = ChatState.groups
      .map(function (g) {
        var active = ChatState.activeGroupId === g.id;
        return (
          '<li class="mv2-list-item"><button type="button" class="mv2-list-btn' +
          (active ? ' is-active' : '') +
          '" data-group="' +
          g.id +
          '"><strong>' +
          escapeHtml(g.name) +
          '</strong><span>' +
          escapeHtml(g.groupType || 'formation_group') +
          ' · min ' +
          escapeHtml(g.minimumTier || 'foundation') +
          '</span></button></li>'
        );
      })
      .join('');
  }

  function renderDiscovery() {
    var list = el('mv2DiscoveryList');
    if (!list || ChatState.currentView !== 'discovery') return;
    if (!ChatState.discoveryUsers.length) {
      list.innerHTML = '<li class="mv2-empty">' + escapeHtml(discoveryEmpty()) + '</li>';
      return;
    }
    list.innerHTML = ChatState.discoveryUsers
      .map(function (u) {
        return (
          '<li class="mv2-list-item"><button type="button" class="mv2-list-btn" data-open-user="' +
          u.uid +
          '"><strong>' +
          escapeHtml(u.name) +
          '</strong><span>' +
          escapeHtml(u.tier) +
          (u.mentor ? ' · mentor' : '') +
          '</span></button></li>'
        );
      })
      .join('');
  }

  function discoveryEmpty() {
    if (ChatState.discoveryMode === 'mentors') {
      return 'No mentors found. Admin: enable Mentor on a user in Admin Panel → Users, or run Quick setup.';
    }
    if (ChatState.discoveryMode === 'lower') {
      return 'No members below your tier. Try another tab, or add test users in Firestore.';
    }
    if (ChatState.me && ChatState.me.isAdmin) {
      return 'No same-tier admins. As admin, use the <strong>Lower tiers</strong> tab to find members.';
    }
    return 'No members at your tier besides you.';
  }

  function renderChat() {
    var title = el('mv2ChatTitle');
    var meta = el('mv2ChatMeta');
    var scroll = el('mv2MessageScroll');
    if (!title || !meta || !scroll) return;
    if (ChatState.currentView !== 'chat') return;

    if (!ChatState.currentConversationId) {
      title.textContent = 'Select a conversation';
      meta.textContent = '';
      scroll.innerHTML = '<p class="mv2-empty">Choose a thread or discovery member.</p>';
      return;
    }

    title.textContent = ChatState.chatTitle || 'Conversation';
    meta.textContent =
      'Thread security: ' +
      (ChatState.currentConversationTier || 'foundation') +
      ' (level ' +
      ChatState.currentConversationLevel +
      ')';

    if (!ChatState.messages.length) {
      scroll.innerHTML = '<p class="mv2-empty">No messages yet. Higher-tier guidance is filtered to this security level.</p>';
      return;
    }

    var meUid = ChatState.me && ChatState.me.uid;
    scroll.innerHTML = ChatState.messages
      .map(function (m) {
        var mine = m.senderUid === meUid;
        var blocked = m.blockedForViewer;
        var body = blocked
          ? 'This space unlocks through formation progression.'
          : escapeHtml(m.content || '');
        return (
          '<article class="mv2-msg ' +
          (mine ? 'is-mine' : 'is-theirs') +
          (blocked ? ' mv2-msg-blocked' : '') +
          '">' +
          body +
          '<span class="mv2-msg-tier">' +
          escapeHtml(m.contentTier || 'foundation') +
          ' · ' +
          escapeHtml(m.messageType || 'text') +
          '</span></article>'
        );
      })
      .join('');
    scroll.scrollTop = scroll.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function lowerTierQueriesForUser(u) {
    var rank = tierLevel(u.isAdmin ? 'admin' : u.tier);
    if (rank >= TIER_LEVEL.elite) return ['foundation', 'free', 'premium', 'elite'];
    if (rank >= TIER_LEVEL.premium) return ['foundation', 'free', 'premium'];
    if (rank > TIER_LEVEL.foundation) return ['foundation', 'free'];
    return [];
  }

  function updateDiscoveryTabs() {
    var lowerBtn = document.querySelector('.mv2-tab-lower');
    var canLower = lowerTierQueriesForUser(ChatState.me || {}).length > 0;
    if (lowerBtn) lowerBtn.classList.toggle('is-hidden', !canLower);
    if (!canLower && ChatState.discoveryMode === 'lower') {
      ChatState.discoveryMode = 'peers';
      document.querySelectorAll('.mv2-tab').forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-discovery') === 'peers');
      });
    }
  }

  function db() {
    return firebase.firestore();
  }

  async function loadMe(uid) {
    var snap = await db().collection('users').doc(uid).get();
    ChatState.me = normalizeUser(uid, snap.exists ? snap.data() : {});
    ChatState.currentUserTier = ChatState.me.tier;
    updateDiscoveryTabs();
  }

  async function loadThreads(uid) {
    var snap = await db()
      .collection('formation_conversations')
      .where('participantIds', 'array-contains', uid)
      .get();
    ChatState.threads = snap.docs
      .map(function (d) {
        var data = d.data();
        var other =
          (data.participantIds || []).filter(function (id) {
            return id !== uid;
          })[0] || '';
        return {
          id: d.id,
          title: data.title || data.otherName || other || 'Direct',
          preview: data.lastPreview || '',
          securityTier: data.securityTier || 'foundation',
          securityLevel: data.securityLevel || 0,
          otherUid: other,
        };
      })
      .sort(function (a, b) {
        return (b.lastMessageAt || 0) - (a.lastMessageAt || 0);
      });
  }

  async function loadGroups() {
    var me = ChatState.me;
    if (!me) return;
    var snap = await db().collection('formation_groups').get();
    ChatState.groups = [];
    snap.forEach(function (d) {
      var g = d.data();
      var minLvl = tierLevel(g.minimumTier || 'foundation');
      var userLvl = tierLevel(me.isAdmin ? 'admin' : me.tier);
      if (me.isAdmin || userLvl >= minLvl) {
        ChatState.groups.push({
          id: d.id,
          name: g.name || 'Group',
          minimumTier: g.minimumTier || 'foundation',
          groupType: g.groupType || 'formation_group',
        });
      }
    });
    ChatState.groups.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
  }

  async function loadDiscovery() {
    var me = ChatState.me;
    if (!me) return;
    var users = [];
    var mode = ChatState.discoveryMode;

    if (mode === 'mentors') {
      var mSnap = await db().collection('users').where('mentor', '==', true).limit(40).get();
      mSnap.forEach(function (doc) {
        if (doc.id === me.uid) return;
        var u = normalizeUser(doc.id, doc.data());
        if (canDiscoverUser(me, u)) users.push(u);
      });
    } else if (mode === 'peers') {
      if (me.isAdmin) {
        var adminTiers = ['foundation', 'free', 'premium', 'elite'];
        for (var a = 0; a < adminTiers.length; a++) {
          var aSnap = await db().collection('users').where('tier', '==', adminTiers[a]).limit(30).get();
          aSnap.forEach(function (doc) {
            if (doc.id === me.uid) return;
            var u = normalizeUser(doc.id, doc.data());
            if (canDiscoverUser(me, u)) users.push(u);
          });
        }
      } else if (me.tier === 'foundation') {
        var fSnap = await db()
          .collection('users')
          .where('tier', 'in', ['foundation', 'free'])
          .limit(40)
          .get();
        fSnap.forEach(function (doc) {
          if (doc.id === me.uid) return;
          var u = normalizeUser(doc.id, doc.data());
          if (canDiscoverUser(me, u)) users.push(u);
        });
      } else {
        var pSnap = await db().collection('users').where('tier', '==', me.tier).limit(40).get();
        pSnap.forEach(function (doc) {
          if (doc.id === me.uid) return;
          var u = normalizeUser(doc.id, doc.data());
          if (canDiscoverUser(me, u)) users.push(u);
        });
      }
    } else if (mode === 'lower') {
      var tiers = lowerTierQueriesForUser(me);
      var myLvl = effectiveTierLevel(me);
      for (var i = 0; i < tiers.length; i++) {
        var tSnap = await db().collection('users').where('tier', '==', tiers[i]).limit(25).get();
        tSnap.forEach(function (doc) {
          if (doc.id === me.uid) return;
          var u = normalizeUser(doc.id, doc.data());
          if (myLvl > effectiveTierLevel(u) && canDiscoverUser(me, u)) users.push(u);
        });
      }
    }

    var seen = {};
    ChatState.discoveryUsers = users.filter(function (u) {
      if (seen[u.uid]) return false;
      seen[u.uid] = true;
      return true;
    });
  }

  function stopMessagesListener() {
    if (messagesUnsub) {
      messagesUnsub();
      messagesUnsub = null;
    }
  }

  function listenMessages(convId, isGroup) {
    stopMessagesListener();
    var col = isGroup
      ? db().collection('formation_groups').doc(convId).collection('formation_messages')
      : db().collection('formation_conversations').doc(convId).collection('formation_messages');

    messagesUnsub = col.orderBy('createdAt', 'asc').limit(200).onSnapshot(
      function (snap) {
        var sec = ChatState.currentConversationLevel;
        ChatState.messages = snap.docs.map(function (d) {
          var m = d.data();
          var ct = m.contentTier || 'foundation';
          var blocked = tierLevel(ct) > sec && m.senderUid !== (ChatState.me && ChatState.me.uid);
          return {
            id: d.id,
            senderUid: m.senderUid,
            content: m.content,
            contentTier: ct,
            messageType: m.messageType || 'text',
            blockedForViewer: blocked,
          };
        });
        renderChat();
      },
      function (err) {
        showAlert(err.message || 'Could not load messages.');
      }
    );
  }

  async function ensureDirect(otherUid) {
    var me = ChatState.me;
    var otherSnap = await db().collection('users').doc(otherUid).get();
    if (!otherSnap.exists) throw new Error('User not found.');
    var other = normalizeUser(otherUid, otherSnap.data());
    if (!canDiscoverUser(me, other)) {
      throw new Error('Formation policy blocks this conversation.');
    }
    var security = calculateConversationSecurityLevel([me, other]);
    var convId = directConvId(me.uid, otherUid);
    var ref = db().collection('formation_conversations').doc(convId);
    var snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        conversationId: convId,
        participants: [me.uid, otherUid].sort(),
        participantIds: [me.uid, otherUid].sort(),
        securityTier: security.tier,
        securityLevel: security.level,
        type: 'direct',
        title: other.name,
        createdAt: firebase.firestore.Timestamp.now(),
        lastMessageAt: firebase.firestore.Timestamp.now(),
        lastPreview: '',
      });
    }
    return { convId: convId, security: security, other: other };
  }

  async function openDirect(otherUid) {
    var result = await ensureDirect(otherUid);
    ChatState.activeGroupId = null;
    ChatState.activeDirectUid = otherUid;
    ChatState.currentConversationId = result.convId;
    ChatState.currentConversationTier = result.security.tier;
    ChatState.currentConversationLevel = result.security.level;
    ChatState.chatTitle = result.other.name;
    ChatState.activeParticipants = [ChatState.me, result.other];
    setView('chat');
    listenMessages(result.convId, false);
  }

  async function ensureGroupMember(groupId) {
    var me = ChatState.me;
    if (!me) return;
    var memberRef = db().collection('formation_groups').doc(groupId).collection('members').doc(me.uid);
    var snap = await memberRef.get();
    if (!snap.exists) {
      await memberRef.set({ joinedAt: firebase.firestore.Timestamp.now() });
    }
  }

  async function openGroup(groupId) {
    var g = ChatState.groups.find(function (x) {
      return x.id === groupId;
    });
    if (!g) return;
    await ensureGroupMember(groupId);
    var me = ChatState.me;
    var sec = { tier: g.minimumTier, level: tierLevel(g.minimumTier) };
    ChatState.activeGroupId = groupId;
    ChatState.activeDirectUid = null;
    ChatState.currentConversationId = groupId;
    ChatState.currentConversationTier = sec.tier;
    ChatState.currentConversationLevel = sec.level;
    ChatState.chatTitle = g.name;
    setView('chat');
    listenMessages(groupId, true);
  }

  async function sendMessage() {
    var input = el('mv2Input');
    var text = (input && input.value.trim()) || '';
    if (!text || !ChatState.currentConversationId || !ChatState.me) return;

    var contentTier = ChatState.me.isAdmin ? 'admin' : ChatState.me.tier;
    if (!canSendContent(contentTier, ChatState.currentConversationLevel)) {
      contentTier = ChatState.currentConversationTier || 'foundation';
    }
    if (!canSendContent(contentTier, ChatState.currentConversationLevel)) {
      showAlert('Content tier exceeds this thread security level.');
      await logAuditClient('content_tier_blocked', { conversationId: ChatState.currentConversationId });
      return;
    }

    var payload = {
      conversationId: ChatState.currentConversationId,
      senderUid: ChatState.me.uid,
      content: text,
      contentTier: contentTier,
      minimumTier: ChatState.currentConversationTier,
      messageType: 'text',
      createdAt: firebase.firestore.Timestamp.now(),
    };

    var isGroup = !!ChatState.activeGroupId;
    if (isGroup) {
      await ensureGroupMember(ChatState.currentConversationId);
      await db()
        .collection('formation_groups')
        .doc(ChatState.currentConversationId)
        .collection('formation_messages')
        .add(payload);
      await db()
        .collection('formation_groups')
        .doc(ChatState.currentConversationId)
        .set(
          { lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(), lastPreview: text.slice(0, 120) },
          { merge: true }
        );
    } else {
      payload.receiverUid = ChatState.activeDirectUid;
      await db()
        .collection('formation_conversations')
        .doc(ChatState.currentConversationId)
        .collection('formation_messages')
        .add(payload);
      await db()
        .collection('formation_conversations')
        .doc(ChatState.currentConversationId)
        .set(
          { lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(), lastPreview: text.slice(0, 120) },
          { merge: true }
        );
    }
    if (input) input.value = '';
    showAlert(null);
  }

  async function logAuditClient(type, detail) {
    try {
      await db().collection('formation_audit_log').add({
        type: type,
        uid: ChatState.me && ChatState.me.uid,
        detail: detail || {},
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      /* non-blocking */
    }
  }

  async function adminQuickSetup() {
    var me = ChatState.me;
    if (!me || !me.isAdmin) return;
    var groupRef = await db().collection('formation_groups').add({
      name: 'Formation Welcome Circle',
      minimumTier: 'foundation',
      maximumTier: 'elite',
      groupType: 'mentor_group',
      visibility: 'formation',
      createdAt: firebase.firestore.Timestamp.now(),
    });
    await groupRef.collection('members').doc(me.uid).set({
      joinedAt: firebase.firestore.Timestamp.now(),
    });
    await db().collection('users').doc(me.uid).set({ mentor: true }, { merge: true });
    await loadMe(me.uid);
    await refreshAll();
    showAlert('Test group created. Open it below or use Discover → Lower tiers.', true);
  }

  function wireUi() {
    var setupBtn = el('mv2AdminSetupBtn');
    if (setupBtn && ChatState.me && ChatState.me.isAdmin) {
      setupBtn.classList.remove('is-hidden');
      setupBtn.addEventListener('click', function () {
        adminQuickSetup().catch(function (err) {
          showAlert(err.message || 'Setup failed.');
        });
      });
    }

    el('mv2DiscoveryBtn').addEventListener('click', function () {
      if (ChatState.me && ChatState.me.isAdmin && ChatState.discoveryMode === 'mentors') {
        ChatState.discoveryMode = 'lower';
        document.querySelectorAll('.mv2-tab').forEach(function (b) {
          b.classList.toggle('is-active', b.getAttribute('data-discovery') === 'lower');
        });
      }
      setView('discovery');
      loadDiscovery().then(render);
    });
    el('mv2DiscoveryBack').addEventListener('click', function () {
      setView('inbox');
    });
    el('mv2RefreshBtn').addEventListener('click', function () {
      refreshAll();
    });

    document.querySelectorAll('.mv2-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        ChatState.discoveryMode = btn.getAttribute('data-discovery') || 'mentors';
        document.querySelectorAll('.mv2-tab').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        loadDiscovery().then(render);
      });
    });

    el('mv2ThreadList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-thread]');
      if (!btn) return;
      var t = ChatState.threads.find(function (x) {
        return x.id === btn.getAttribute('data-thread');
      });
      if (t && t.otherUid) openDirect(t.otherUid);
    });

    el('mv2GroupList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-group]');
      if (!btn) return;
      openGroup(btn.getAttribute('data-group'));
    });

    el('mv2DiscoveryList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-open-user]');
      if (!btn) return;
      openDirect(btn.getAttribute('data-open-user'));
    });

    el('mv2SendBtn').addEventListener('click', function () {
      sendMessage().catch(function (err) {
        showAlert(err.message || 'Send failed.');
      });
    });

    var input = el('mv2Input');
    input.addEventListener('focus', function () {
      setKeyboardVisible(true);
    });
    input.addEventListener('blur', function () {
      setKeyboardVisible(false);
    });

    el('mv2Back').addEventListener('click', function (e) {
      if (ChatState.currentView === 'chat') {
        e.preventDefault();
        stopMessagesListener();
        ChatState.currentConversationId = null;
        setView('inbox');
      }
    });
  }

  async function refreshAll() {
    if (!ChatState.me) return;
    ChatState.loading = true;
    render();
    try {
      await Promise.all([loadThreads(ChatState.me.uid), loadGroups(), loadDiscovery()]);
    } catch (err) {
      console.error('mv2 refresh:', err);
      showAlert(err.message || 'Could not load messages. Check connection and try Refresh.');
    }
    ChatState.loading = false;
    render();
  }

  async function boot() {
    document.documentElement.classList.add('mv2-html-lock');
    document.body.classList.add('mv2-body-lock');

    firebase.auth().onAuthStateChanged(async function (user) {
      if (!user) return;
      if (bootedUid === user.uid) return;
      bootedUid = user.uid;
      try {
        await loadMe(user.uid);
        wireUi();
        await refreshAll();
        var params = new URLSearchParams(window.location.search);
        var openUid = params.get('uid');
        if (openUid) {
          try {
            await openDirect(openUid);
          } catch (openErr) {
            showAlert(openErr.message || 'Could not open conversation.');
          }
        }
        if (!ChatState.threads.length && !ChatState.groups.length) {
          showAlert('Inbox empty — tap Discover members or Quick setup (admin) to begin.', true);
        }
      } catch (err) {
        showAlert(err.message || 'Failed to load messenger.');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
