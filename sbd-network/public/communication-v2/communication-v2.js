/**
 * Communication Engine V2 — isolated shell (legacy /dm + /conversations untouched).
 * State-driven single render pipeline; Firestore rules enforce tier + classification.
 */
(function () {
  'use strict';

  /** @type {firebase.firestore.Unsubscribe | null} */
  let messagesUnsub = null;

  const CommunicationState = {
    me: null,
    activeConversation: null,
    activeGroup: null,
    visibleGroups: [],
    visibleUsers: [],
    threads: [],
    messages: [],
    discoveryMode: 'mentors',
    selectedGroupId: null,
    selectedDiscoveryUid: null,
    loading: true,
    error: null,
  };

  function normalizeTier(raw) {
    const t = (raw && String(raw).toLowerCase()) || 'foundation';
    if (t === 'free') return 'foundation';
    if (t === 'foundation' || t === 'premium' || t === 'elite') return t;
    return 'foundation';
  }

  /**
   * CE2 user view — never writes; defaults only in memory (no overwrite of Firestore).
   */
  function normalizeCe2User(uid, raw) {
    const d = raw || {};
    const tier = normalizeTier(d.tier);
    return {
      uid,
      email: d.email || null,
      name: d.name || d.displayName || d.email || 'Member',
      tier,
      formationLevel:
        typeof d.formationLevel === 'number' && !Number.isNaN(d.formationLevel)
          ? d.formationLevel
          : 0,
      communicationLevel:
        typeof d.communicationLevel === 'number' && !Number.isNaN(d.communicationLevel)
          ? d.communicationLevel
          : 0,
      roles: Array.isArray(d.roles) ? d.roles : [],
      mentor: !!d.mentor,
      isAdmin: d.role === 'admin',
      raw: d,
    };
  }

  function tierRank(u) {
    if (!u) return 0;
    if (u.isAdmin) return 3;
    if (u.tier === 'elite') return 2;
    if (u.tier === 'premium') return 1;
    return 0;
  }

  function classRank(cls) {
    if (cls === 'public') return 0;
    if (cls === 'foundation') return 0;
    if (cls === 'premium') return 1;
    if (cls === 'elite') return 2;
    if (cls === 'mentor') return 4;
    return 99;
  }

  /** Policy mirror of Firestore helpers (UX hints; enforcement is server-side). */
  function canCommunicate(sender, receiver) {
    if (!sender || !receiver) return false;
    const sr = tierRank(sender);
    const rr = tierRank(receiver);
    if (sr >= rr) return true;
    if (receiver.mentor) return true;
    return false;
  }

  function canReadClassification(reader, classification) {
    if (!reader) return false;
    if (classification === 'public') return true;
    if (classification === 'mentor') return reader.mentor || reader.isAdmin;
    return tierRank(reader) >= classRank(classification);
  }

  function directConvId(a, b) {
    const s = [a, b].sort();
    return 'd_' + s[0] + '_' + s[1];
  }

  function el(id) {
    return document.getElementById(id);
  }

  function render() {
    const pill = el('ce2TierPill');
    const u = CommunicationState.me;
    if (pill && u) {
      pill.textContent =
        (u.isAdmin ? 'admin' : u.tier) +
        ' · f' +
        u.formationLevel +
        ' · c' +
        u.communicationLevel;
    }

    const gList = el('ce2GroupList');
    if (gList) {
      gList.innerHTML = '';
      if (!CommunicationState.visibleGroups.length) {
        gList.innerHTML =
          '<li class="ce2-placeholder">No groups visible at your tier yet. ' +
          'Admins create <code>communicationGroups</code> documents in Firestore.</li>';
      } else {
        CommunicationState.visibleGroups.forEach(function (g) {
          const li = document.createElement('li');
          li.className =
            'ce2-li' + (CommunicationState.selectedGroupId === g.id ? ' is-selected' : '');
          li.dataset.groupId = g.id;
          li.innerHTML =
            '<div class="ce2-li-name">' +
            escapeHtml(g.name) +
            '</div>' +
            '<div class="ce2-li-meta">requires ' +
            escapeHtml(g.requiredTier) +
            (g.mentorLed ? ' · mentor-led' : '') +
            '</div>';
          li.addEventListener('click', function () {
            CommunicationState.selectedGroupId = g.id;
            CommunicationState.selectedDiscoveryUid = null;
            openGroupThread(g.id, g.name);
            render();
          });
          gList.appendChild(li);
        });
      }
    }

    const tList = el('ce2ThreadList');
    if (tList) {
      tList.innerHTML = '';
      if (!CommunicationState.threads.length) {
        tList.innerHTML =
          '<li class="ce2-placeholder">No CE2 direct threads yet. Open someone from Discovery.</li>';
      } else {
        CommunicationState.threads.forEach(function (t) {
          const li = document.createElement('li');
          li.className =
            'ce2-li' +
            (CommunicationState.activeConversation &&
            CommunicationState.activeConversation.id === t.id &&
            CommunicationState.activeConversation.type === 'direct'
              ? ' is-selected'
              : '');
          li.innerHTML =
            '<div class="ce2-li-name">' + escapeHtml(t.label) + '</div>' +
            '<div class="ce2-li-meta">' + escapeHtml(t.sub) + '</div>';
          li.addEventListener('click', function () {
            openDirectThread(t.id, t.otherUid, t.label);
          });
          tList.appendChild(li);
        });
      }
    }

    const dList = el('ce2DiscoveryList');
    if (dList) {
      dList.innerHTML = '';
      if (!CommunicationState.visibleUsers.length) {
        dList.innerHTML =
          '<li class="ce2-placeholder">No matches (or missing Firestore fields). ' +
          'Try mentors with <code>mentor: true</code> on user docs.</li>';
      } else {
        CommunicationState.visibleUsers.forEach(function (x) {
          const li = document.createElement('li');
          li.className =
            'ce2-li' +
            (CommunicationState.selectedDiscoveryUid === x.uid ? ' is-selected' : '');
          li.innerHTML =
            '<div class="ce2-li-name">' +
            escapeHtml(x.name) +
            '</div>' +
            '<div class="ce2-li-meta">' +
            escapeHtml(x.tier) +
            (x.mentor ? ' · mentor' : '') +
            '</div>';
          li.addEventListener('click', function () {
            CommunicationState.selectedDiscoveryUid = x.uid;
            if (!CommunicationState.me) return;
            if (!canCommunicate(CommunicationState.me, x)) {
              CommunicationState.error = 'Policy: lower tier cannot open thread upward (unless they are a mentor).';
              render();
              return;
            }
            CommunicationState.error = null;
            openDirectThread(directConvId(CommunicationState.me.uid, x.uid), x.uid, x.name);
            render();
          });
          dList.appendChild(li);
        });
      }
    }

    const title = el('ce2ThreadTitle');
    const meta = el('ce2ThreadMeta');
    const ac = CommunicationState.activeConversation;
    if (title) title.textContent = ac ? ac.title : 'Select a thread';
    if (meta) {
      meta.textContent = ac
        ? ac.type + (ac.sub ? ' — ' + ac.sub : '')
        : CommunicationState.loading
          ? 'Loading…'
          : CommunicationState.error || '';
    }

    const scroll = el('ce2MessageScroll');
    if (scroll) {
      scroll.innerHTML = '';
      if (!ac) {
        scroll.innerHTML =
          '<div class="ce2-placeholder">Choose a formation group or direct thread.</div>';
      } else if (!CommunicationState.messages.length) {
        scroll.innerHTML = '<div class="ce2-placeholder">No messages yet.</div>';
      } else {
        CommunicationState.messages.forEach(function (m) {
          const row = document.createElement('div');
          const self = CommunicationState.me && m.senderId === CommunicationState.me.uid;
          row.className = 'ce2-row' + (self ? ' is-self' : '');
          const reader = CommunicationState.me;
          const canRead = canReadClassification(reader, m.classification);
          const bubble = document.createElement('div');
          bubble.className = 'ce2-bubble' + (canRead ? '' : ' ce2-bubble-locked');
          const tags = document.createElement('div');
          tags.className = 'ce2-bubble-tags';
          tags.innerHTML =
            '<span class="ce2-tag">' +
            escapeHtml(m.classification) +
            '</span>' +
            '<span class="ce2-tag">' +
            (m.shareable ? 'shareable' : 'private') +
            '</span>';

          bubble.appendChild(tags);
          if (canRead) {
            bubble.appendChild(document.createTextNode(m.content || ''));
          } else {
            bubble.appendChild(
              document.createTextNode('Restricted — formation / tier clearance required.')
            );
          }

          row.appendChild(bubble);
          const foot = document.createElement('div');
          foot.className = 'ce2-msg-foot';
          foot.textContent = (
            self ? 'You · ' : 'Peer · ') + (fmtTime(m.createdAt) || '…');

          row.appendChild(foot);
          scroll.appendChild(row);
        });
      }
      scroll.scrollTop = scroll.scrollHeight;
    }
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function fmtTime(ts) {
    if (!ts) return '';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return '';
    }
  }

  function stopMessagesWatch() {
    if (messagesUnsub) {
      messagesUnsub();
      messagesUnsub = null;
    }
  }

  function openDirectThread(convId, otherUid, label) {
    stopMessagesWatch();
    CommunicationState.activeConversation = {
      type: 'direct',
      id: convId,
      otherUid: otherUid,
      title: label ? 'DM · ' + label : 'Direct',
      sub: convId,
    };
    CommunicationState.activeGroup = null;

    messagesUnsub = db
      .collection('ce2_conversations')
      .doc(convId)
      .collection('ce2_messages')
      .orderBy('createdAt', 'asc')
      .limit(150)
      .onSnapshot(
        function (snap) {
          CommunicationState.messages = snap.docs.map(function (d) {
            return Object.assign({ id: d.id }, d.data());
          });
          render();
        },
        function (err) {
          console.error(err);
          CommunicationState.error = err.message || 'Message stream error';
          render();
        }
      );
    render();
  }

  function openGroupThread(groupId, name) {
    stopMessagesWatch();
    CommunicationState.activeConversation = {
      type: 'group',
      id: groupId,
      title: name || 'Group',
      sub: 'communicationGroups/' + groupId,
    };
    CommunicationState.activeGroup = groupId;

    messagesUnsub = db
      .collection('communicationGroups')
      .doc(groupId)
      .collection('ce2_messages')
      .orderBy('createdAt', 'asc')
      .limit(200)
      .onSnapshot(
        function (snap) {
          CommunicationState.messages = snap.docs.map(function (d) {
            return Object.assign({ id: d.id }, d.data());
          });
          render();
        },
        function (err) {
          console.error(err);
          CommunicationState.error = err.message || 'Message stream error';
          render();
        }
      );
    render();
  }

  async function loadGroupsForUser(u) {
    const rank = tierRank(u);
    const allowedTiers = [];
    if (rank >= 0) allowedTiers.push('foundation');
    if (rank >= 1) allowedTiers.push('premium');
    if (rank >= 2) allowedTiers.push('elite');
    const snap = await db
      .collection('communicationGroups')
      .where('requiredTier', 'in', allowedTiers)
      .orderBy('name')
      .limit(40)
      .get();
    CommunicationState.visibleGroups = snap.docs.map(function (d) {
      const x = d.data();
      return {
        id: d.id,
        name: x.name || 'Group',
        requiredTier: normalizeTier(x.requiredTier),
        mentorLed: !!x.mentorLed,
        allowCrossTier: !!x.allowCrossTier,
      };
    });
  }

  async function loadThreads(uid) {
    let snap = await db
      .collection('ce2_conversations')
      .where('participantIds', 'array-contains', uid)
      .orderBy('lastMessageAt', 'desc')
      .limit(30)
      .get()
      .catch(function () {
        return null;
      });

    if (!snap) {
      snap = await db
        .collection('ce2_conversations')
        .where('participantIds', 'array-contains', uid)
        .limit(30)
        .get()
        .catch(function () {
          return null;
        });
    }

    if (!snap) {
      CommunicationState.threads = [];
      return;
    }

    CommunicationState.threads = [];
    for (var i = 0; i < snap.docs.length; i++) {
      var d = snap.docs[i];
      var data = d.data();
      var other = (data.participantIds || []).filter(function (p) {
        return p !== uid;
      })[0];
      var label = other ? other.slice(0, 8) + '…' : 'Direct';
      try {
        if (other) {
          var udoc = await db.collection('users').doc(other).get();
          if (udoc.exists) {
            var nu = normalizeCe2User(other, udoc.data());
            label = nu.name || label;
          }
        }
      } catch (_) {}

      CommunicationState.threads.push({
        id: d.id,
        otherUid: other,
        label: label,
        sub: fmtTime(data.lastMessageAt),
      });
    }
  }

  async function loadDiscovery(u) {
    CommunicationState.visibleUsers = [];
    if (CommunicationState.discoveryMode === 'mentors') {
      const q = await db.collection('users').where('mentor', '==', true).limit(25).get();
      q.forEach(function (doc) {
        if (doc.id === u.uid) return;
        var nu = normalizeCe2User(doc.id, doc.data());
        if (!canCommunicate(u, nu)) return;
        CommunicationState.visibleUsers.push(nu);
      });
      return;
    }

    var t = u.tier;
    var tierQueries = t === 'foundation' ? ['foundation', 'free'] : [t];
    var q2 = await db.collection('users').where('tier', 'in', tierQueries).limit(40).get();
    q2.forEach(function (doc) {
      if (doc.id === u.uid) return;
      CommunicationState.visibleUsers.push(normalizeCe2User(doc.id, doc.data()));
    });
  }

  async function ensureDirectConv(otherUid) {
    const me = CommunicationState.me;
    const convId = directConvId(me.uid, otherUid);
    var ref = db.collection('ce2_conversations').doc(convId);
    var snap = await ref.get();
    if (!snap.exists) {
      var sorted = [me.uid, otherUid].sort();
      await ref.set({
        participantIds: sorted,
        type: 'direct',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastPreview: '',
      });
    }
    return convId;
  }

  async function sendMessage() {
    var me = CommunicationState.me;
    var ac = CommunicationState.activeConversation;
    if (!me || !ac) return;

    var text = (el('ce2Input') && el('ce2Input').value || '').trim();
    if (!text) return;

    var classification = el('ce2ClassSelect').value || 'foundation';
    var shareable = el('ce2Shareable').checked;

    if (!canReadClassification(me, classification)) {
      CommunicationState.error =
        'Your covenant access does not allow sending at classification: ' + classification;
      render();
      return;
    }

    var patch = {
      conversationId: ac.id,
      senderId: me.uid,
      tier: me.isAdmin ? 'elite' : me.tier,
      classification: classification,
      shareable: shareable,
      content: text,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    try {
      if (ac.type === 'direct') {
        var convId = await ensureDirectConv(ac.otherUid);
        patch.receiverId = ac.otherUid;
        patch.conversationId = convId;
        var refDm = db
          .collection('ce2_conversations')
          .doc(convId)
          .collection('ce2_messages')
          .doc();
        await refDm.set(patch);

        await db
          .collection('ce2_conversations')
          .doc(convId)
          .update({
            lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastPreview: text.slice(0, 140),
          });
      } else if (ac.type === 'group') {
        patch.conversationId = ac.id;
        patch.receiverId = '';
        var refGm = db
          .collection('communicationGroups')
          .doc(ac.id)
          .collection('ce2_messages')
          .doc();
        await refGm.set(patch);
        await db
          .collection('communicationGroups')
          .doc(ac.id)
          .update({
            lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastPreview: text.slice(0, 140),
          });
      }

      el('ce2Input').value = '';
      CommunicationState.error = null;
      await loadThreads(me.uid);
      render();
    } catch (err) {
      console.error(err);
      CommunicationState.error = err.message || 'Send failed (check rules / membership).';
      render();
    }
  }

  async function joinSelectedGroup() {
    var gid = CommunicationState.selectedGroupId;
    var me = CommunicationState.me;
    if (!gid || !me) {
      CommunicationState.error = 'Select a group first.';
      render();
      return;
    }
    try {
      await db
        .collection('communicationGroups')
        .doc(gid)
        .collection('members')
        .doc(me.uid)
        .set({ joinedAt: firebase.firestore.FieldValue.serverTimestamp() });
      CommunicationState.error = null;
      openGroupThread(gid, (CommunicationState.visibleGroups.find(function (g) { return g.id === gid; }) || {}).name || 'Group');
    } catch (err) {
      console.error(err);
      CommunicationState.error = err.message || 'Join failed (tier / formation gate).';
    }
    render();
  }

  function wireUi() {
    document.querySelectorAll('.ce2-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.ce2-tab').forEach(function (b) {
          b.classList.remove('is-active');
        });
        btn.classList.add('is-active');
        CommunicationState.discoveryMode = btn.getAttribute('data-discovery') || 'mentors';
        if (CommunicationState.me) {
          loadDiscovery(CommunicationState.me).then(render);
        }
      });
    });

    var sendBtn = el('ce2SendBtn');
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);

    var joinBtn = el('ce2JoinDemo');
    if (joinBtn) joinBtn.addEventListener('click', joinSelectedGroup);
  }

  async function boot(user) {
    CommunicationState.loading = true;
    render();

    var uref = db.collection('users').doc(user.uid);
    var udoc = await uref.get();
    var data = udoc.exists ? udoc.data() : {};
    CommunicationState.me = normalizeCe2User(user.uid, data);

    await loadGroupsForUser(CommunicationState.me);
    await loadThreads(user.uid);
    await loadDiscovery(CommunicationState.me);

    CommunicationState.loading = false;
    render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    wireUi();

    if (typeof auth === 'undefined' || typeof db === 'undefined') {
      CommunicationState.error = 'Firebase not ready.';
      render();
      return;
    }

    auth.onAuthStateChanged(function (user) {
      if (!user) return;
      stopMessagesWatch();
      boot(user).catch(function (err) {
        console.error(err);
        CommunicationState.error = err.message || 'Init error';
        CommunicationState.loading = false;
        render();
      });
    });
  });
})();
