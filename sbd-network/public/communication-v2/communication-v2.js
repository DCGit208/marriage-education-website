/**
 * Communication Engine V2 — isolated shell (legacy /dm + /conversations untouched).
 * State-driven single render pipeline; Firestore rules enforce tier + classification.
 * STABLE_ROLLBACK: ce2-keyboard-v60 + ce2-audio-stable-1d + ce2-delivery-stable-v90
 * See ROLLBACK-KEYBOARD-v60.md, ROLLBACK-AUDIO-1D.md, ROLLBACK-DELIVERY-v90.md
 */
(function () {
  'use strict';

  /** iPhone PWA keyboard stable rollback (header A + gap closed, May 2026) */
  var CE2_KEYBOARD_ROLLBACK = 'ce2-keyboard-stable-v60';
  var CE2_KEYBOARD_STABLE_VERSION = 'v60';
  var CE2_DELIVERY_ROLLBACK = 'ce2-delivery-stable-v90';
  var CE2_DELIVERY_STABLE_VERSION = 'v90';

  function ce2DeliveryExperimentalFromUrl() {
    try {
      if (/ce2_delivery_fast=0/i.test(window.location.search || '')) return false;
      return /ce2_delivery_fast=1/i.test(window.location.search || '');
    } catch (_) {
      return false;
    }
  }

  /** New delivery experiments only when ?ce2_delivery_fast=1 — see DELIVERY-PERF-GUARDRAILS.md */
  var CE2_DELIVERY_EXPERIMENTAL = ce2DeliveryExperimentalFromUrl();

  var root =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof window !== 'undefined'
        ? window
        : self;

  /** @type {firebase.firestore.Unsubscribe | null} */
  let messagesUnsub = null;
  var convMetaUnsub = null;
  var typingInputUnsub = null;
  var typingExpireTimer = null;
  var messengerNotifUnsub = null;
  var inboxPrefsUnsub = null;
  var directInboxUnsub = null;
  var groupInboxUnsub = null;
  var inboxLongPressTimer = null;
  var inboxLongPressFired = false;
  var presenceWatchSet = null;
  var presenceHeartbeatStop = null;
  var presenceTickTimer = null;
  var MAX_PRESENCE_WATCHES = 36;
  var messengerNotifFirst = true;
  var ce2BootedUid = null;
  var ce2UiWired = false;
  var renderRaf = 0;
  var MESSAGE_PAGE = 50;
  /** In-thread typing cue (header + above composer). Pulses typing.{uid} on the conv/group doc. */
  var CE2_TYPING_INDICATOR_ENABLED = true;
  var MAX_COMPOSER_ATTACHMENTS = 6;
  /** How long senders can remove their own messages (soft delete). */
  var UNSEND_WINDOW_MS = 60 * 60 * 1000;
  /** Prevents duplicate Firestore sends per voice recording (Phase 1B). */
  var voiceUploadCommitted = Object.create(null);

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
    statusMessage: null,
    /** @type {'groups'|'direct'|'discover'} Mobile hub tab when no thread open */
    mobileHubPanel: 'groups',
    pendingMessages: [],
    lastServerMessages: [],
    sending: false,
    pendingImageUrl: null,
    pendingMedia: null,
    /** @type {Record<string, object>} per-thread composer (uploads survive thread switches) */
    threadComposer: {},
    convMeta: null,
    replyTo: null,
    typingLabel: null,
    typingUids: [],
    memberIds: [],
    hasMoreMessages: false,
    loadingOlder: false,
    oldestMessageDoc: null,
    _openToken: 0,
    _loadThreadsTimer: null,
    _pendingThreadOnly: false,
    voiceRecording: false,
    voiceRecordingCancel: false,
    voiceRecordingLocked: false,
    userMsgPrefs: { hidden: {}, saved: {}, blocked: {} },
    savedItems: [],
    threadSearchQuery: '',
    threadSearchSenderId: '',
    threadSearchStartMs: 0,
    threadSearchEndMs: 0,
    highlightMessageId: null,
    searchJumpMessages: null,
    searchJumpOldestDoc: null,
    searchJumpHasMore: false,
    offline: false,
    discoveryLoaded: false,
    shareDraft: null,
    _renderedMsgIds: null,
    _metaLastMessageId: null,
    presenceByUid: {},
    /** @type {Record<string, {muted:boolean, pinned:boolean, sortAt:number}>} */
    inboxPrefs: {},
  };

  function threadComposerKey(ac) {
    if (!ac) return '';
    if (ac.type === 'direct') {
      return 'd:' + (ac.id || (CommunicationState.me && ac.otherUid
        ? directConvId(CommunicationState.me.uid, ac.otherUid)
        : ac.otherUid || ''));
    }
    return 'g:' + (ac.id || '');
  }

  function persistActiveComposerDraft() {
    var ac = CommunicationState.activeConversation;
    var input = el('ce2Input');
    var me = CommunicationState.me;
    if (!ac || !me || !input || !root.Ce2Drafts) return;
    var key = threadComposerKey(ac);
    root.Ce2Drafts.flush(me.uid, key);
    root.Ce2Drafts.save(me.uid, key, input.value);
  }

  function initComposerDraftPersistence() {
    if (root.__ce2DraftPersistenceBound) return;
    root.__ce2DraftPersistenceBound = true;
    function flushDrafts() {
      persistActiveComposerDraft();
      if (root.Ce2Drafts && root.Ce2Drafts.flushAll) root.Ce2Drafts.flushAll();
    }
    window.addEventListener('pagehide', flushDrafts);
    window.addEventListener('beforeunload', flushDrafts);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushDrafts();
    });
  }

  function syncCe2ThreadUrl(ac) {
    if (!ac || ac.needsJoin || typeof history === 'undefined' || !history.replaceState) return;
    try {
      var url = new URL(window.location.href);
      url.searchParams.delete('uid');
      url.searchParams.delete('msg');
      url.searchParams.delete('title');
      url.searchParams.delete('text');
      url.searchParams.delete('url');
      if (ac.type === 'direct' && ac.id) {
        url.searchParams.set('conv', ac.id);
        url.searchParams.delete('group');
      } else if (ac.type === 'group' && ac.id) {
        url.searchParams.set('group', ac.id);
        url.searchParams.delete('conv');
      }
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (_) {}
  }

  function clearComposerDraft(ac) {
    var me = CommunicationState.me;
    ac = ac || CommunicationState.activeConversation;
    if (!ac || !me || !root.Ce2Drafts) return;
    root.Ce2Drafts.clear(me.uid, threadComposerKey(ac));
  }

  function restoreComposerDraft(ac) {
    var input = el('ce2Input');
    var me = CommunicationState.me;
    if (!ac || !me || !input) return;
    if (CommunicationState.shareDraft) {
      input.value = CommunicationState.shareDraft.slice(0, 4000);
      CommunicationState.shareDraft = null;
      syncCe2ComposerInputHeight(input);
      if (root.Ce2Format) root.Ce2Format.syncInputMirror();
      return;
    }
    var text = root.Ce2Drafts ? root.Ce2Drafts.load(me.uid, threadComposerKey(ac)) : '';
    input.value = text || '';
    syncCe2ComposerInputHeight(input);
    if (root.Ce2Format) root.Ce2Format.syncInputMirror();
  }

  function listMetaLine(uid, threadKey, fallbackSub) {
    if (uid && root.Ce2Drafts && root.Ce2Drafts.has(uid, threadKey)) {
      return {
        text: 'Draft: ' + root.Ce2Drafts.preview(uid, threadKey, 44),
        isDraft: true,
      };
    }
    return { text: fallbackSub || '', isDraft: false };
  }

  function syncVisibleGroupMeta(groupId, data) {
    syncInboxRowFromMeta({ type: 'group', id: groupId }, data);
  }

  function findInboxRow(kind, threadId) {
    if (kind === 'group') {
      return (CommunicationState.visibleGroups || []).find(function (row) {
        return row.id === threadId;
      });
    }
    return (CommunicationState.threads || []).find(function (row) {
      return row.id === threadId || row.convId === threadId;
    });
  }

  function syncInboxRowFromMeta(ac, data) {
    if (!ac || !ac.id || !data) return;
    var me = CommunicationState.me;
    var rc = receipts();
    var ib = inbox();
    var kind = ac.type === 'group' ? 'group' : 'direct';
    var row = findInboxRow(kind, ac.id);
    if (!row || !me) return;
    var preview = formatInboxPreview({
      lastPreview: data.lastPreview,
      lastMessageType: data.lastMessageType,
      content: data.lastPreview,
      lastSenderId: data.lastSenderId,
    });
    if (kind === 'group') row.lastPreview = preview;
    else row.sub = preview;
    row.lastActivityAt = ib ? ib.tsMs(data.lastMessageAt) : 0;
    row.lastSenderId = data.lastSenderId || '';
    applyInboxPrefToRow(row, kind, data.lastSenderId);
    if (rc && ib) {
      ib.mergeUnreadFromMeta(row, data, me.uid, rc.unreadCount);
    } else if (rc) {
      row.unread = rc.unreadCount(data, me.uid);
    }
    var open = CommunicationState.activeConversation;
    if (open && open.id === ac.id && !open.needsJoin) {
      row.unread = 0;
      if (ib) ib.applyLocalRead(row);
    }
    sortVisibleInboxLists();
  }

  function clearThreadUnreadLocal(ac) {
    if (!ac || !ac.id) return;
    var ib = inbox();
    var kind = ac.type === 'group' ? 'group' : 'direct';
    var row = findInboxRow(kind, ac.id);
    if (row) {
      if (ib) ib.applyLocalRead(row);
      else row.unread = 0;
    }
    var me = CommunicationState.me;
    if (me && CommunicationState.convMeta) {
      var unreadMap = Object.assign({}, CommunicationState.convMeta.unreadCount || {});
      unreadMap[me.uid] = 0;
      CommunicationState.convMeta = Object.assign({}, CommunicationState.convMeta, {
        unreadCount: unreadMap,
      });
    }
  }

  function getComposerSlot(ac) {
    ac = ac || CommunicationState.activeConversation;
    if (!ac) return null;
    var key = threadComposerKey(ac);
    if (!CommunicationState.threadComposer[key]) {
      CommunicationState.threadComposer[key] = {
        pendingMedia: null,
        pendingImageUrl: null,
        pendingAttachments: [],
        attachQueue: [],
        localPreviewUrl: null,
        localFile: null,
        uploading: false,
        uploadProgress: 0,
        uploadFinalizing: false,
        uploadAbort: null,
        queuedSend: null,
        pendingSendAfterUpload: false,
      };
    }
    return CommunicationState.threadComposer[key];
  }

  function syncGlobalsFromComposerSlot() {
    var slot = getComposerSlot();
    if (!slot) {
      CommunicationState.pendingMedia = null;
      CommunicationState.pendingImageUrl = null;
      return;
    }
    CommunicationState.pendingMedia = slot.pendingMedia;
    CommunicationState.pendingImageUrl = slot.pendingImageUrl;
  }

  function revokeLocalPreview(url) {
    if (url && String(url).indexOf('blob:') === 0) {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
    }
  }

  function cancelComposerUpload(slot) {
    if (!slot) return;
    if (slot.uploadAbort) {
      try {
        slot.uploadAbort.abort();
      } catch (_) {}
      slot.uploadAbort = null;
    }
    slot.uploading = false;
    slot.uploadProgress = 0;
    slot.uploadFinalizing = false;
  }

  function clearComposerSlot(slot) {
    if (!slot) return;
    cancelComposerUpload(slot);
    revokeLocalPreview(slot.localPreviewUrl);
    slot.pendingMedia = null;
    slot.pendingImageUrl = null;
    slot.pendingAttachments = [];
    slot.attachQueue = [];
    slot.localPreviewUrl = null;
    slot.localFile = null;
    slot.queuedSend = null;
    slot.pendingSendAfterUpload = false;
    slot.uploadFinalizing = false;
    syncGlobalsFromComposerSlot();
  }

  function composerMediaList(slot) {
    if (!slot) return [];
    if (slot.pendingAttachments && slot.pendingAttachments.length) {
      return slot.pendingAttachments.slice();
    }
    if (slot.pendingMedia && slot.pendingMedia.url) return [slot.pendingMedia];
    return [];
  }

  function syncPendingMediaFromAttachments(slot) {
    if (!slot) return;
    var list = slot.pendingAttachments || [];
    if (list.length) {
      slot.pendingMedia = list[list.length - 1];
      slot.pendingImageUrl = slot.pendingMedia.url;
    } else {
      slot.pendingMedia = null;
      slot.pendingImageUrl = null;
    }
  }

  function normalizeTier(raw) {
    var g = gov();
    if (g && g.normalizeTier) return g.normalizeTier(raw);
    const t = (raw && String(raw).toLowerCase()) || 'foundation';
    if (t === 'free') return 'foundation';
    return t;
  }

  /**
   * CE2 user view — never writes; defaults only in memory (no overwrite of Firestore).
   * Messaging tier prefers active subscription.tier (Elite billing) over a stale users.tier.
   */
  function normalizeCe2User(uid, raw) {
    const d = raw || {};
    const g = gov();
    const tier =
      g && g.resolveMessagingTier ? g.resolveMessagingTier(d) : normalizeTier(d.tier);
    return {
      uid,
      email: d.email || null,
      name: d.name || d.displayName || d.email || 'Member',
      tier,
      tierLevel: g && g.tierRank ? g.tierRank(tier) : 0,
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
      isAdmin:
        String(d.role || '').toLowerCase() === 'admin' ||
        (Array.isArray(d.roles) &&
          d.roles.some(function (r) {
            return String(r || '').toLowerCase() === 'admin';
          })),
      messagingEnabled: d.messagingEnabled !== false,
      raw: d,
    };
  }

  function mod() {
    return typeof window !== 'undefined' ? window.Ce2Moderation : null;
  }

  function links() {
    return typeof window !== 'undefined' ? window.Ce2Links : null;
  }

  function share() {
    return typeof window !== 'undefined' ? window.Ce2Share : null;
  }

  function attachments() {
    return typeof window !== 'undefined' ? window.Ce2Attachments : null;
  }

  function presence() {
    return typeof window !== 'undefined' ? window.Ce2Presence : null;
  }

  function ingestPresenceFromUser(uid, data) {
    var pr = presence();
    if (!pr || !uid || !pr.recordFromUserData) return;
    CommunicationState.presenceByUid[uid] = pr.recordFromUserData(data || {});
  }

  function collectPresenceUids() {
    var ordered = [];
    var seen = {};
    var me = CommunicationState.me;
    function add(uid) {
      if (!uid || seen[uid] || (me && uid === me.uid)) return;
      seen[uid] = true;
      ordered.push(uid);
    }
    var ac = CommunicationState.activeConversation;
    if (ac && ac.type === 'direct') add(ac.otherUid);
    if (ac && ac.type === 'group') {
      (CommunicationState.memberIds || []).forEach(add);
    }
    (CommunicationState.threads || []).forEach(function (t) {
      add(t.otherUid);
    });
    if (CommunicationState.mobileHubPanel === 'discover') {
      (CommunicationState.visibleUsers || []).forEach(function (x) {
        add(x.uid);
      });
    }
    return ordered.slice(0, MAX_PRESENCE_WATCHES);
  }

  function countOnlineUids(uids) {
    var n = 0;
    (uids || []).forEach(function (uid) {
      var rec = CommunicationState.presenceByUid[uid];
      if (rec && rec.state === 'online') n += 1;
    });
    return n;
  }

  function presenceHeaderText(ac) {
    if (!ac || ac.needsJoin || showDebugUi()) return null;
    var typingText = currentTypingLabel(ac);
    if (typingText) return typingText;
    var pr = presence();
    if (!pr) return null;
    if (ac.type === 'direct' && ac.otherUid) {
      var rec = CommunicationState.presenceByUid[ac.otherUid];
      if (!rec) return null;
      return pr.formatLabel(rec) || null;
    }
    if (ac.type === 'group') {
      var n = countOnlineUids(CommunicationState.memberIds);
      if (n === 1) return '1 online';
      if (n > 1) return n + ' online';
    }
    return null;
  }

  function applyPresenceUi() {
    var pr = presence();
    if (!pr || !pr.applyDot) return;
    document.querySelectorAll('[data-presence-uid]').forEach(function (wrap) {
      var uid = wrap.getAttribute('data-presence-uid');
      var rec = uid ? CommunicationState.presenceByUid[uid] : null;
      pr.applyDot(wrap.querySelector('.ce2-presence-dot'), rec);
    });
    updateTypingLineOnly();
    var ac = CommunicationState.activeConversation;
    if (ac && ac.type === 'direct') updateReadReceiptFooters(ac);
  }

  function applyPresenceHeader() {
    var pr = presence();
    var ac = CommunicationState.activeConversation;
    var meta = el('ce2ThreadMeta');
    var dot = el('ce2ThreadPresenceDot');
    var threadOpen = !!(ac && !ac.needsJoin);
    var rec =
      threadOpen && ac.type === 'direct' && ac.otherUid
        ? CommunicationState.presenceByUid[ac.otherUid]
        : null;
    var groupOnline =
      threadOpen && ac.type === 'group' ? countOnlineUids(CommunicationState.memberIds) : 0;
    if (dot && pr && pr.applyDot) {
      if (rec && (rec.state === 'online' || rec.state === 'away')) {
        pr.applyDot(dot, rec);
      } else if (groupOnline > 0) {
        pr.applyDot(dot, { state: 'online', label: groupOnline + ' online' });
      } else {
        pr.applyDot(dot, null);
      }
    } else if (dot) {
      dot.hidden = true;
    }
    if (!meta) return;
    var typingText = currentTypingLabel(ac);
    var presenceText = presenceHeaderText(ac);
    meta.classList.toggle('ce2-thread-meta--typing', !!typingText);
    meta.classList.toggle('ce2-thread-meta--presence', !!presenceText && !typingText);
    meta.classList.toggle(
      'is-online',
      !typingText && (!!(presenceText && rec && rec.state === 'online') || groupOnline > 0)
    );
    meta.classList.toggle(
      'is-away',
      !typingText && !!(presenceText && rec && rec.state === 'away')
    );
    if (presenceText) meta.textContent = presenceText;
    else if (ac) meta.textContent = formatThreadMeta(ac);
  }

  function onPresenceRecord(uid, rec) {
    if (!uid || !rec) return;
    CommunicationState.presenceByUid[uid] = rec;
    applyPresenceUi();
  }

  function syncPresenceWatches() {
    var pr = presence();
    if (!pr || !pr.createWatchSet || typeof db === 'undefined') return;
    if (!presenceWatchSet) {
      presenceWatchSet = pr.createWatchSet(db, onPresenceRecord);
    }
    presenceWatchSet.sync(collectPresenceUids());
  }

  function startPresenceLayer(uid) {
    var pr = presence();
    if (!pr || !uid || typeof db === 'undefined') return;
    if (presenceHeartbeatStop) {
      try {
        presenceHeartbeatStop();
      } catch (_) {}
      presenceHeartbeatStop = null;
    }
    if (pr.startHeartbeat) {
      presenceHeartbeatStop = pr.startHeartbeat(db, uid);
    }
    if (presenceTickTimer) clearInterval(presenceTickTimer);
    presenceTickTimer = setInterval(function () {
      if (!pr.refreshRecords) return;
      if (pr.refreshRecords(CommunicationState.presenceByUid)) applyPresenceUi();
    }, 15000);
    syncPresenceWatches();
  }

  function stopPresenceLayer() {
    if (presenceHeartbeatStop) {
      try {
        presenceHeartbeatStop();
      } catch (_) {}
      presenceHeartbeatStop = null;
    }
    if (presenceWatchSet) {
      presenceWatchSet.stop();
      presenceWatchSet = null;
    }
    if (presenceTickTimer) {
      clearInterval(presenceTickTimer);
      presenceTickTimer = null;
    }
    CommunicationState.presenceByUid = {};
    stopInboxWatches();
  }

  function avatarWithPresence(label, presenceUid) {
    var initial = escapeHtml(personInitial(label));
    if (!presenceUid) {
      return '<span class="ce2-avatar">' + initial + '</span>';
    }
    return (
      '<span class="ce2-avatar-wrap" data-presence-uid="' +
      escapeHtml(presenceUid) +
      '"><span class="ce2-avatar">' +
      initial +
      '</span><span class="ce2-presence-dot" hidden aria-hidden="true"></span></span>'
    );
  }

  function receipts() {
    return typeof window !== 'undefined' ? window.Ce2Receipts : null;
  }

  function inbox() {
    return typeof window !== 'undefined' ? window.Ce2Inbox : null;
  }

  function inboxStrip(text) {
    if (root.Ce2Format && root.Ce2Format.stripFormattingForPreview) {
      return root.Ce2Format.stripFormattingForPreview(text || '');
    }
    return text || '';
  }

  function formatInboxPreview(meta) {
    var ib = inbox();
    if (!ib) {
      return inboxStrip((meta && (meta.content || meta.lastPreview)) || '').slice(0, 72);
    }
    return ib.formatLastPreview(meta, { strip: inboxStrip });
  }

  function getInboxPref(kind, threadId) {
    var ib = inbox();
    var id = ib ? ib.prefId(kind, threadId) : '';
    var prefs = CommunicationState.inboxPrefs || {};
    return (id && prefs[id]) || { muted: false, pinned: false, sortAt: 0 };
  }

  function applyInboxPrefToRow(row, kind, lastSenderId) {
    var ib = inbox();
    var me = CommunicationState.me;
    if (!ib || !row) return row;
    return ib.applyPrefToRow(
      row,
      getInboxPref(kind, row.id || row.convId),
      lastSenderId,
      me && me.uid
    );
  }

  function sortVisibleInboxLists() {
    var ib = inbox();
    if (!ib) return;
    CommunicationState.visibleGroups = ib.sortInboxRows(CommunicationState.visibleGroups || []);
    CommunicationState.threads = ib.sortInboxRows(CommunicationState.threads || []);
  }

  function inboxPrefsCol(uid) {
    return db.collection('users').doc(uid).collection('ce2_inbox');
  }

  function persistInboxPref(kind, threadId, patch) {
    var me = CommunicationState.me;
    var ib = inbox();
    if (!me || !ib || !threadId) return Promise.resolve();
    var id = ib.prefId(kind, threadId);
    if (!id) return Promise.resolve();
    var prev = getInboxPref(kind, threadId);
    var next = ib.normalizePref(Object.assign({}, prev, patch || {}));
    CommunicationState.inboxPrefs[id] = next;
    var payload = ib.prefWritePayload(kind, threadId, next);
    payload.updatedAt = firebase.firestore.Timestamp.now();
    return inboxPrefsCol(me.uid)
      .doc(id)
      .set(payload, { merge: true })
      .catch(function (err) {
        console.warn('[CE2 inbox pref]', err);
      });
  }

  function ingestInboxPrefDoc(doc) {
    var ib = inbox();
    if (!ib || !doc) return;
    CommunicationState.inboxPrefs[doc.id] = ib.normalizePref(doc.data() || {});
  }

  function applyInboxPrefsToLists() {
    (CommunicationState.visibleGroups || []).forEach(function (g) {
      applyInboxPrefToRow(g, 'group', g.lastSenderId);
    });
    (CommunicationState.threads || []).forEach(function (t) {
      applyInboxPrefToRow(t, 'direct', t.lastSenderId);
    });
    sortVisibleInboxLists();
  }

  async function loadInboxPrefs(uid) {
    CommunicationState.inboxPrefs = {};
    if (!uid) return;
    try {
      var snap = await inboxPrefsCol(uid).limit(200).get();
      snap.forEach(ingestInboxPrefDoc);
    } catch (err) {
      console.warn('[CE2 inbox prefs]', err);
    }
  }

  function stopInboxWatches() {
    if (inboxPrefsUnsub) {
      inboxPrefsUnsub();
      inboxPrefsUnsub = null;
    }
    if (directInboxUnsub) {
      directInboxUnsub();
      directInboxUnsub = null;
    }
    if (groupInboxUnsub) {
      groupInboxUnsub();
      groupInboxUnsub = null;
    }
  }

  function watchInboxPrefs(uid) {
    if (inboxPrefsUnsub) {
      inboxPrefsUnsub();
      inboxPrefsUnsub = null;
    }
    if (!uid) return;
    inboxPrefsUnsub = inboxPrefsCol(uid).limit(200).onSnapshot(
      function (snap) {
        CommunicationState.inboxPrefs = {};
        snap.forEach(ingestInboxPrefDoc);
        applyInboxPrefsToLists();
        requestRender({ throttle: true });
      },
      function () {}
    );
  }

  function inboxListSig(kind, row, data, uid) {
    var ib = inbox();
    var rc = receipts();
    var unread = rc ? rc.unreadCount(data, uid) : 0;
    return [
      kind,
      row && row.id,
      data.lastMessageId || '',
      data.lastPreview || '',
      data.lastMessageType || '',
      data.lastSenderId || '',
      ib ? ib.tsMs(data.lastMessageAt) : 0,
      unread,
    ].join('|');
  }

  function mergeInboxSnapRows(kind, snap, uid) {
    if (!snap) return;
    var missing = false;
    var changed = false;
    snap.docs.forEach(function (doc) {
      var data = doc.data() || {};
      var row = findInboxRow(kind, doc.id);
      if (!row) {
        if (kind === 'direct') {
          var other = (data.participantIds || []).filter(function (p) {
            return p !== uid;
          })[0];
          if (other && isUserBlockedUid(other)) return;
        }
        missing = true;
        return;
      }
      var sig = inboxListSig(kind, row, data, uid);
      if (row._inboxSig === sig) return;
      row._inboxSig = sig;
      changed = true;
      syncInboxRowFromMeta({ type: kind, id: doc.id }, data);
    });
    if (missing) {
      if (kind === 'group') scheduleLoadGroups(uid);
      else scheduleLoadThreads(uid);
      return;
    }
    if (changed) {
      sortVisibleInboxLists();
      CommunicationState._pendingThreadOnly = false;
      requestRender({ throttle: true });
    }
  }

  function watchDirectInbox(uid) {
    if (directInboxUnsub) {
      directInboxUnsub();
      directInboxUnsub = null;
    }
    if (!uid) return;
    directInboxUnsub = db
      .collection('ce2_conversations')
      .where('participantIds', 'array-contains', uid)
      .orderBy('lastMessageAt', 'desc')
      .limit(30)
      .onSnapshot(
        function (snap) {
          mergeInboxSnapRows('direct', snap, uid);
        },
        function () {}
      );
  }

  function watchGroupInbox(u) {
    if (groupInboxUnsub) {
      groupInboxUnsub();
      groupInboxUnsub = null;
    }
    if (!u) return;
    var q;
    if (u.isAdmin) {
      q = db.collection('communicationGroups').limit(40);
    } else {
      var g = gov();
      var allowedTiers =
        g && g.tiersAtOrBelowRank ? g.tiersAtOrBelowRank(tierRank(u)) : ['foundation'];
      if (allowedTiers.indexOf('free') < 0 && allowedTiers.indexOf('foundation') >= 0) {
        allowedTiers.push('free');
      }
      if (!allowedTiers.length) allowedTiers.push('foundation');
      q = db.collection('communicationGroups').where('requiredTier', 'in', allowedTiers).limit(40);
    }
    groupInboxUnsub = q.onSnapshot(
      function (snap) {
        mergeInboxSnapRows('group', snap, u.uid);
      },
      function () {}
    );
  }

  function startInboxLayer(u) {
    if (!u) return;
    watchInboxPrefs(u.uid);
    watchDirectInbox(u.uid);
    watchGroupInbox(u);
  }

  function closeInboxMenu() {
    var menu = el('ce2InboxMenu');
    if (menu) menu.hidden = true;
    document.body.classList.remove('ce2-inbox-menu-open');
  }

  function inboxMenuTargetFromLi(li) {
    if (!li) return null;
    var kind = li.dataset.inboxKind || (li.dataset.action === 'select-group' ? 'group' : 'direct');
    var id = li.dataset.inboxId || li.dataset.groupId || li.dataset.convId;
    if (!id) return null;
    return { kind: kind, id: id, label: li.dataset.label || li.dataset.groupName || 'Conversation' };
  }

  function openInboxMenu(li) {
    var target = inboxMenuTargetFromLi(li);
    if (!target) return;
    var pref = getInboxPref(target.kind, target.id);
    var menu = el('ce2InboxMenu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'ce2InboxMenu';
      menu.className = 'ce2-inbox-menu';
      menu.innerHTML =
        '<div class="ce2-inbox-menu-backdrop" data-inbox-menu="close"></div>' +
        '<div class="ce2-inbox-menu-panel" role="menu">' +
        '<p class="ce2-inbox-menu-title" id="ce2InboxMenuTitle"></p>' +
        '<button type="button" class="ce2-inbox-menu-item" data-inbox-act="pin"></button>' +
        '<button type="button" class="ce2-inbox-menu-item" data-inbox-act="mute"></button>' +
        '</div>';
      document.body.appendChild(menu);
      menu.addEventListener('click', function (e) {
        if (e.target.closest('[data-inbox-menu="close"]')) {
          closeInboxMenu();
          return;
        }
        var btn = e.target.closest('[data-inbox-act]');
        if (!btn) return;
        var act = btn.getAttribute('data-inbox-act');
        var kind = menu.dataset.inboxKind;
        var id = menu.dataset.inboxId;
        if (!kind || !id) return;
        if (act === 'pin') toggleInboxPin(kind, id);
        if (act === 'mute') toggleInboxMute(kind, id);
        closeInboxMenu();
      });
    }
    menu.dataset.inboxKind = target.kind;
    menu.dataset.inboxId = target.id;
    var title = el('ce2InboxMenuTitle');
    if (title) title.textContent = target.label;
    var pinBtn = menu.querySelector('[data-inbox-act="pin"]');
    var muteBtn = menu.querySelector('[data-inbox-act="mute"]');
    if (pinBtn) pinBtn.textContent = pref.pinned ? 'Unpin' : 'Pin to top';
    if (muteBtn) muteBtn.textContent = pref.muted ? 'Unmute' : 'Mute notifications';
    menu.hidden = false;
    document.body.classList.add('ce2-inbox-menu-open');
  }

  function toggleInboxPin(kind, threadId) {
    var row = findInboxRow(kind, threadId);
    var pref = getInboxPref(kind, threadId);
    var pinned = !pref.pinned;
    if (row) row.pinned = pinned;
    persistInboxPref(kind, threadId, { pinned: pinned, muted: !!pref.muted, sortAt: pref.sortAt });
    applyInboxPrefsToLists();
    CommunicationState._pendingThreadOnly = false;
    requestRender();
  }

  function toggleInboxMute(kind, threadId) {
    var row = findInboxRow(kind, threadId);
    var pref = getInboxPref(kind, threadId);
    var muted = !pref.muted;
    var sortAt = muted ? (row && row.lastActivityAt) || Date.now() : 0;
    if (row) {
      row.muted = muted;
      row.sortAt = muted ? sortAt : row.lastActivityAt || 0;
    }
    persistInboxPref(kind, threadId, { muted: muted, pinned: !!pref.pinned, sortAt: sortAt });
    applyInboxPrefsToLists();
    CommunicationState._pendingThreadOnly = false;
    requestRender();
  }

  function bindInboxGestures() {
    var sidebar = el('ce2Sidebar');
    if (!sidebar || sidebar._ce2InboxGestures) return;
    sidebar._ce2InboxGestures = true;
    sidebar.addEventListener(
      'click',
      function (e) {
        var more = e.target.closest('.ce2-li-more');
        if (!more) return;
        e.preventDefault();
        e.stopPropagation();
        var li = more.closest('.ce2-li[data-action]');
        if (li) openInboxMenu(li);
      },
      true
    );
    function onPointerDown(e) {
      var more = e.target.closest('.ce2-li-more');
      if (more) return;
      var li = e.target.closest('.ce2-li[data-inbox-kind]');
      if (!li) return;
      inboxLongPressFired = false;
      if (inboxLongPressTimer) clearTimeout(inboxLongPressTimer);
      inboxLongPressTimer = setTimeout(function () {
        inboxLongPressTimer = null;
        inboxLongPressFired = true;
        openInboxMenu(li);
      }, 520);
    }
    function onPointerEnd() {
      if (inboxLongPressTimer) {
        clearTimeout(inboxLongPressTimer);
        inboxLongPressTimer = null;
      }
    }
    sidebar.addEventListener('pointerdown', onPointerDown);
    sidebar.addEventListener('pointerup', onPointerEnd);
    sidebar.addEventListener('pointercancel', onPointerEnd);
    sidebar.addEventListener('contextmenu', function (e) {
      var li = e.target.closest('.ce2-li[data-inbox-kind]');
      if (!li) return;
      e.preventDefault();
      inboxLongPressFired = true;
      openInboxMenu(li);
    });
  }

  function replyModule() {
    return typeof window !== 'undefined' ? window.Ce2Reply : null;
  }

  function getMetaDocRef(ac) {
    if (!ac || !ac.id) return null;
    if (ac.type === 'direct') {
      return db.collection('ce2_conversations').doc(ac.id);
    }
    if (ac.type === 'group') {
      return db.collection('communicationGroups').doc(ac.id);
    }
    return null;
  }

  function stopConvMetaWatch() {
    if (convMetaUnsub) {
      convMetaUnsub();
      convMetaUnsub = null;
    }
    if (typingInputUnsub) {
      typingInputUnsub();
      typingInputUnsub = null;
    }
    CommunicationState.convMeta = null;
    hideTypingIndicator();
  }

  function stopMessengerNotifWatch() {
    if (messengerNotifUnsub) {
      messengerNotifUnsub();
      messengerNotifUnsub = null;
    }
    messengerNotifFirst = true;
  }

  function isNotifForOpenThread(n) {
    var ac = CommunicationState.activeConversation;
    if (!ac || ac.needsJoin || !n) return false;
    if (n.type === 'direct_message') {
      if (ac.type !== 'direct') return false;
      if (n.convId && ac.id && n.convId === ac.id) return true;
      if (n.senderId && ac.otherUid && n.senderId === ac.otherUid) return true;
      return false;
    }
    if (n.type === 'group_message') {
      var gid = n.groupId || n.convId;
      return ac.type === 'group' && !!gid && ac.id === gid;
    }
    return false;
  }

  function composerInputFocused() {
    var input = el('ce2Input');
    return !!(input && typeof document !== 'undefined' && document.activeElement === input);
  }

  function typingNameForUid(uid, ac) {
    if (!uid) return '';
    if (ac && ac.type === 'direct') {
      return (ac.title || '').trim();
    }
    var rec = CommunicationState.presenceByUid[uid];
    if (rec && rec.name) return rec.name;
    var users = CommunicationState.visibleUsers || [];
    for (var i = 0; i < users.length; i++) {
      if (users[i].uid === uid && users[i].name) return users[i].name;
    }
    var threads = CommunicationState.threads || [];
    for (var j = 0; j < threads.length; j++) {
      if (threads[j].otherUid === uid && threads[j].label) return threads[j].label;
    }
    return '';
  }

  function currentTypingLabel(ac) {
    if (!CE2_TYPING_INDICATOR_ENABLED) return null;
    var uids = CommunicationState.typingUids || [];
    if (!uids.length) return CommunicationState.typingLabel || null;
    var pr = presence();
    if (pr && pr.formatTypingLabel) {
      return (
        pr.formatTypingLabel(uids, function (uid) {
          return typingNameForUid(uid, ac);
        }) || null
      );
    }
    return CommunicationState.typingLabel || null;
  }

  function clearTypingExpireTimer() {
    if (typingExpireTimer) {
      clearTimeout(typingExpireTimer);
      typingExpireTimer = null;
    }
  }

  function scheduleTypingExpire(typing) {
    clearTypingExpireTimer();
    var pr = presence();
    if (!pr || !typing) return;
    var ttlMs = (pr.TYPING_TTL_SEC || 8) * 1000;
    var now = Date.now();
    var soonest = Infinity;
    Object.keys(typing).forEach(function (uid) {
      var ms = pr.tsToMs ? pr.tsToMs(typing[uid]) : 0;
      if (!ms) return;
      var expires = ms + ttlMs;
      if (expires > now && expires < soonest) soonest = expires;
    });
    if (soonest === Infinity) return;
    typingExpireTimer = setTimeout(function () {
      typingExpireTimer = null;
      var ac = CommunicationState.activeConversation;
      updateTypingFromMeta(CommunicationState.convMeta, ac);
    }, Math.min(ttlMs, Math.max(250, soonest - now + 40)));
  }

  function hideTypingIndicator() {
    CommunicationState.typingUids = [];
    CommunicationState.typingLabel = null;
    clearTypingExpireTimer();
    updateTypingLineOnly();
  }

  function dropTypist(uid) {
    if (!uid) {
      updateTypingLineOnly();
      return;
    }
    var list = CommunicationState.typingUids || [];
    var next = list.filter(function (u) {
      return u !== uid;
    });
    CommunicationState.typingUids = next;
    CommunicationState.typingLabel = currentTypingLabel(CommunicationState.activeConversation);
    updateTypingLineOnly();
  }

  function updateTypingFromMeta(data, ac) {
    if (!CE2_TYPING_INDICATOR_ENABLED) {
      hideTypingIndicator();
      return;
    }
    var pr = presence();
    var me = CommunicationState.me;
    if (!pr || !me || !data || !ac || ac.needsJoin) {
      hideTypingIndicator();
      return;
    }
    var typing = data.typing || {};
    var activeUids = pr.activeTypingUids
      ? pr.activeTypingUids(typing, me.uid)
      : Object.keys(typing).filter(function (uid) {
          return uid !== me.uid && pr.isTypingActive(typing[uid]);
        });
    var rc = receipts();
    if (data.lastSenderId && data.lastMessageAt && rc && rc.tsSeconds) {
      var msgSec = rc.tsSeconds(data.lastMessageAt);
      activeUids = activeUids.filter(function (uid) {
        if (uid !== data.lastSenderId) return true;
        var typSec = rc.tsSeconds(typing[uid]);
        return !msgSec || !typSec || typSec > msgSec;
      });
    }
    CommunicationState.typingUids = activeUids;
    CommunicationState.typingLabel = currentTypingLabel(ac);
    scheduleTypingExpire(typing);
    updateTypingLineOnly();
  }

  function watchMessengerNotifs() {
    stopMessengerNotifWatch();
    var me = CommunicationState.me;
    if (!me) return;
    messengerNotifUnsub = db
      .collection('notifications')
      .where('userId', '==', me.uid)
      .where('read', '==', false)
      .onSnapshot(
        function (snap) {
          if (messengerNotifFirst) {
            messengerNotifFirst = false;
            return;
          }
          snap.docChanges().forEach(function (change) {
            if (change.type !== 'added') return;
            ingestIncomingNotif(change.doc.data());
          });
        },
        function () {}
      );
  }

  function watchConvMeta(ac) {
    stopConvMetaWatch();
    var me = CommunicationState.me;
    var ref = getMetaDocRef(ac);
    if (!ref || !me) return;
    var pr = presence();
    convMetaUnsub = ref.onSnapshot(
      function (snap) {
        var data = snap.exists ? snap.data() : null;
        CommunicationState.convMeta = data;
        var acNow = CommunicationState.activeConversation;
        if (data && acNow && !acNow.needsJoin) {
          handleMetaMessageDelivery(data);
          updateTypingFromMeta(data, acNow);
        } else {
          hideTypingIndicator();
        }
        if (!acNow || acNow.needsJoin) return;
        if (snap.exists) {
          syncInboxRowFromMeta(acNow, snap.data());
          requestRender({ throttle: true });
        }
        if (acNow.type === 'direct') {
          updateReadReceiptFooters(acNow);
        }
      },
      function () {}
    );
    var input = el('ce2Input');
    if (CE2_TYPING_INDICATOR_ENABLED && pr && input) {
      var unbindTyping = pr.bindTypingInput(input, ref, me.uid, 5000);
      function onComposerFocusChange() {
        updateTypingLineOnly();
      }
      input.addEventListener('focus', onComposerFocusChange);
      input.addEventListener('blur', onComposerFocusChange);
      typingInputUnsub = function () {
        input.removeEventListener('focus', onComposerFocusChange);
        input.removeEventListener('blur', onComposerFocusChange);
        if (unbindTyping) unbindTyping();
      };
    }
  }

  async function loadGroupMemberIds(groupId) {
    var ids = [];
    try {
      var snap = await db
        .collection('communicationGroups')
        .doc(groupId)
        .collection('members')
        .limit(80)
        .get();
      snap.forEach(function (d) {
        ids.push(d.id);
      });
    } catch (_) {}
    return ids;
  }

  function syncReplyBanner() {
    var banner = el('ce2ReplyBanner');
    var text = el('ce2ReplyBannerText');
    if (!banner) return;
    if (!CommunicationState.replyTo) {
      banner.hidden = true;
      if (text) text.innerHTML = '';
      return;
    }
    banner.hidden = false;
    if (text) {
      text.innerHTML =
        '<span class="ce2-reply-banner-kicker">Replying to</span>' +
        '<span class="ce2-reply-banner-name">' +
        escapeHtml(CommunicationState.replyTo.senderName || 'Member') +
        '</span>' +
        '<span class="ce2-reply-banner-preview">' +
        escapeHtml(CommunicationState.replyTo.preview || '') +
        '</span>';
    }
  }

  function computeUnreadTotals() {
    var ib = inbox();
    var shout = ib
      ? function (row) {
          return ib.shoutingUnread(row);
        }
      : function (row) {
          return row && row.unread > 0 ? row.unread : 0;
        };
    var groups = 0;
    var direct = 0;
    (CommunicationState.visibleGroups || []).forEach(function (g) {
      groups += shout(g);
    });
    (CommunicationState.threads || []).forEach(function (t) {
      direct += shout(t);
    });
    return { total: groups + direct, groups: groups, direct: direct };
  }

  function renderHubUnreadBadges() {
    var counts = computeUnreadTotals();
    var totalEl = el('ce2HubUnreadTotal');
    if (totalEl) {
      if (counts.total > 0) {
        totalEl.textContent = counts.total > 99 ? '99+' : String(counts.total);
        totalEl.hidden = false;
        totalEl.setAttribute('aria-label', counts.total + ' unread messages');
      } else {
        totalEl.textContent = '';
        totalEl.hidden = true;
      }
    }
    document.querySelectorAll('.ce2-hub-tab').forEach(function (btn) {
      var hub = btn.getAttribute('data-hub');
      if (hub !== 'groups' && hub !== 'direct') return;
      var n = hub === 'groups' ? counts.groups : counts.direct;
      var badge = btn.querySelector('.ce2-hub-tab-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'ce2-hub-tab-badge';
        btn.appendChild(badge);
      }
      if (n > 0) {
        badge.textContent = n > 99 ? '99+' : String(n);
        badge.hidden = false;
      } else {
        badge.textContent = '';
        badge.hidden = true;
      }
    });
    if ('setAppBadge' in navigator) {
      if (counts.total > 0) navigator.setAppBadge(counts.total).catch(function () {});
    }
  }

  function clearReply() {
    CommunicationState.replyTo = null;
    syncReplyBanner();
  }

  function setReply(message) {
    var rm = replyModule();
    var me = CommunicationState.me;
    if (!rm || !message) return;
    var name =
      message.senderId === (me && me.uid)
        ? 'You'
        : CommunicationState.activeConversation
          ? CommunicationState.activeConversation.title
          : 'Member';
    CommunicationState.replyTo = rm.buildReplyPayload(message, name);
    syncReplyBanner();
    var input = el('ce2Input');
    if (input) input.focus();
  }

  function copyMessageText(text, okMsg) {
    function doneOk() {
      CommunicationState.statusMessage = okMsg || 'Copied';
      requestRender({ threadOnly: true });
      setTimeout(function () {
        if (CommunicationState.statusMessage === (okMsg || 'Copied')) {
          CommunicationState.statusMessage = null;
          requestRender({ threadOnly: true });
        }
      }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(doneOk)
        .catch(function () {
          CommunicationState.error = 'Could not copy to clipboard.';
          render();
        });
      return;
    }
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      doneOk();
    } catch (err) {
      CommunicationState.error = 'Could not copy to clipboard.';
      render();
    }
  }

  function initCe2MessageActions() {
    if (typeof window === 'undefined' || !window.Ce2MessageActions) return;
    window.Ce2MessageActions.init({
      getState: function () { return CommunicationState; },
      db: db,
      el: el,
      escapeHtml: escapeHtml,
      fmtTime: fmtTime,
      setReply: setReply,
      canUnsendMessage: canDeleteMessage,
      canDeleteMessage: canDeleteMessage,
      unsendMessage: unsendMessage,
      handleCe2Error: handleCe2Error,
      render: render,
      requestRender: requestRender,
      copyMessageText: copyMessageText,
      removeOptimisticMessage: removeOptimisticMessage,
      retryFailedMessage: retryFailedMessage,
      markOptimisticFailed: markOptimisticFailed,
      canReadMessageContent: canReadMessageContent,
      ensureDirectConv: ensureDirectConv,
      directConvId: directConvId,
      messageTimeMs: messageTimeMs,
      receipts: receipts,
      share: share,
      showDebugUi: showDebugUi,
      canCommunicate: canCommunicate,
      canForwardToTarget: canForwardToTarget,
      gov: gov,
      governanceEnabled: governanceEnabled,
      scheduleLoadThreads: scheduleLoadThreads,
      syncViewport: function () {
        syncCe2VisualViewport();
      },
      syncFocusableInputs: syncCe2FocusableInputs,
      syncComposerInputHeight: syncCe2ComposerInputHeight,
      isCoarsePointer: function () {
        return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
      },
      isInteractiveMsgTarget: function (node) {
        if (!node || !node.closest) return false;
        // Photo thumbs and OG/board-share thumbs must still long-press to Reply.
        if (node.closest('.ce2-media-tap, .ce2-board-share-thumb')) return false;
        return !!node.closest(
          'a, button:not(.ce2-media-tap):not(.ce2-board-share-thumb), audio, video, input, textarea, select, label'
        );
      },
    });
    window.Ce2MessageActions.wireMessageMenuUi();
  }

  function messagesCollection(ac) {
    if (!ac || !ac.id) return null;
    return ac.type === 'direct'
      ? db.collection('ce2_conversations').doc(ac.id).collection('ce2_messages')
      : db.collection('communicationGroups').doc(ac.id).collection('ce2_messages');
  }

  function listThreadSearchParticipants() {
    var ac = CommunicationState.activeConversation;
    var me = CommunicationState.me;
    var people = [];
    if (!ac) return people;
    if (me) {
      people.push({ uid: me.uid, name: me.name || 'Me', isMe: true });
    }
    if (ac.type === 'direct' && ac.otherUid) {
      people.push({
        uid: ac.otherUid,
        name: ac.title || typingNameForUid(ac.otherUid, ac) || 'Member',
        isMe: false,
      });
    } else if (ac.type === 'group') {
      (CommunicationState.memberIds || []).forEach(function (uid) {
        if (me && uid === me.uid) return;
        people.push({
          uid: uid,
          name: typingNameForUid(uid, ac) || 'Member',
          isMe: false,
        });
      });
    }
    return people;
  }

  function hydrateThreadSearchParticipants() {
    var people = listThreadSearchParticipants();
    var jobs = [];
    people.forEach(function (p) {
      if (!p || p.isMe || !p.uid) return;
      if (p.name && p.name !== 'Member') return;
      if (jobs.length >= 24) return;
      jobs.push(
        db
          .collection('users')
          .doc(p.uid)
          .get()
          .then(function (doc) {
            if (!doc.exists) return;
            var d = doc.data() || {};
            var name = String(d.name || d.displayName || '').trim();
            if (!name) return;
            var rec = CommunicationState.presenceByUid[p.uid] || {};
            rec.name = name;
            CommunicationState.presenceByUid[p.uid] = rec;
          })
          .catch(function () {})
      );
    });
    return Promise.all(jobs);
  }

  function clearSearchJump() {
    CommunicationState.searchJumpMessages = null;
    CommunicationState.searchJumpOldestDoc = null;
    CommunicationState.searchJumpHasMore = false;
    if (root.Ce2ThreadSearch && root.Ce2ThreadSearch.syncLatestButton) {
      root.Ce2ThreadSearch.syncLatestButton();
    }
    requestRender({ threadOnly: true });
  }

  function toFsTimestamp(value) {
    var ms = typeof value === 'number' ? value : messageTimeMs({ createdAt: value });
    if (!ms) return null;
    return firebase.firestore.Timestamp.fromMillis(ms);
  }

  async function loadSearchJumpWindow(hit) {
    var ac = CommunicationState.activeConversation;
    var col = messagesCollection(ac);
    if (!ac || !col || !hit || !hit.id) return false;
    var ts = toFsTimestamp(hit.createdAt || hit.createdAtMs);
    if (!ts) {
      try {
        var doc = await col.doc(hit.id).get();
        if (!doc.exists) return false;
        var data = Object.assign({ id: doc.id }, doc.data());
        ts = toFsTimestamp(data.createdAt);
        hit = Object.assign({}, hit, data);
      } catch (_) {
        return false;
      }
    }
    if (!ts) return false;
    var beforeSnap = await col
      .orderBy('createdAt', 'asc')
      .endAt(ts)
      .limitToLast(36)
      .get();
    var afterSnap = await col
      .orderBy('createdAt', 'asc')
      .startAfter(ts)
      .limit(16)
      .get();
    var msgs = beforeSnap.docs
      .concat(afterSnap.docs)
      .map(function (d) {
        return Object.assign({ id: d.id }, d.data());
      });
    if (
      !msgs.some(function (m) {
        return m.id === hit.id;
      })
    ) {
      try {
        var missing = await col.doc(hit.id).get();
        if (missing.exists) {
          msgs.push(Object.assign({ id: missing.id }, missing.data()));
          msgs = sortMessagesByTime(msgs);
        }
      } catch (_) {}
    }
    if (!msgs.length) return false;
    CommunicationState.searchJumpMessages = msgs;
    CommunicationState.searchJumpOldestDoc = beforeSnap.docs[0] || null;
    CommunicationState.searchJumpHasMore = beforeSnap.docs.length >= 36;
    return true;
  }

  async function ensureSearchHitVisible(hit) {
    if (!hit || !hit.id) return;
    var ac = CommunicationState.activeConversation;
    if (!ac) return;
    CommunicationState.highlightMessageId = hit.id;
    function inList(list) {
      return (list || []).some(function (m) {
        return m.id === hit.id;
      });
    }
    if (inList(CommunicationState.messages)) {
      CommunicationState.searchJumpMessages = null;
      CommunicationState.searchJumpOldestDoc = null;
      CommunicationState.searchJumpHasMore = false;
      requestRender({ threadOnly: true });
      window.requestAnimationFrame(scrollToHighlightedMessage);
      return;
    }
    var pages = 0;
    while (CommunicationState.hasMoreMessages && pages < 8) {
      await loadOlderMessages({ quiet: true, skipRender: true });
      pages += 1;
      if (inList(CommunicationState.messages)) {
        requestRender({ threadOnly: true });
        window.requestAnimationFrame(scrollToHighlightedMessage);
        return;
      }
    }
    var loaded = await loadSearchJumpWindow(hit);
    requestRender({ threadOnly: true });
    if (loaded) {
      window.requestAnimationFrame(scrollToHighlightedMessage);
    }
    if (root.Ce2ThreadSearch && root.Ce2ThreadSearch.syncLatestButton) {
      root.Ce2ThreadSearch.syncLatestButton();
    }
  }

  function initCe2ThreadSearch() {
    if (!root.Ce2ThreadSearch) return;
    root.Ce2ThreadSearch.init({
      getState: function () {
        return CommunicationState;
      },
      el: el,
      db: db,
      escapeHtml: escapeHtml,
      fmtTime: fmtTime,
      messageTimeMs: messageTimeMs,
      requestRender: requestRender,
      syncFocusableInputs: syncCe2FocusableInputs,
      messagesCollection: messagesCollection,
      listParticipants: listThreadSearchParticipants,
      hydrateParticipants: hydrateThreadSearchParticipants,
      jumpToHit: function (hit) {
        ensureSearchHitVisible(hit).catch(handleCe2Error);
      },
      clearSearchJump: clearSearchJump,
      isMessageHidden: function (m, ac) {
        var ma = msgActions();
        return !!(ma && ma.isMessageHidden(m, ac));
      },
    });
  }

  function closeMessageMenu() {
    if (window.Ce2MessageActions) window.Ce2MessageActions.closeMessageMenu();
  }

  function wireMessageRowMenu(row, m, ac, self, canRead) {
    if (window.Ce2MessageActions) {
      window.Ce2MessageActions.wireMessageRow(row, m, ac, self, canRead);
    }
  }

  function msgActions() {
    return typeof window !== 'undefined' ? window.Ce2MessageActions : null;
  }

  function showDebugUi() {
    var me = CommunicationState.me;
    return !!(me && me.isAdmin && localStorage.getItem('ce2_debug') === '1');
  }

  function personInitial(label) {
    var s = (label && String(label).trim()) || '?';
    return s.charAt(0).toUpperCase();
  }

  function formatThreadMeta(ac) {
    if (!ac) return '';
    if (ac.needsJoin) {
      return 'Join this formation group to read and send messages.';
    }
    if (showDebugUi()) {
      return (
        (ac.type || '') +
        ' · floor ' +
        (typeof ac.securityLevel === 'number' ? ac.securityLevel : '—') +
        (ac.sub ? ' · ' + ac.sub : '')
      );
    }
    if (governanceEnabled() && typeof ac.securityLevel === 'number') {
      var t = ac.securityTier || 'foundation';
      return (
        'Protected · ' +
        t.charAt(0).toUpperCase() +
        t.slice(1) +
        ' formation space'
      );
    }
    return ac.type === 'group' ? 'Formation group' : 'Direct message';
  }

  /** Formation tier for DM/discovery policy (tier string only; tierLevel is not messaging rank). */
  function tierRank(u) {
    if (!u) return 0;
    if (u.isAdmin) return 6;
    var g = gov();
    if (g && g.tierRank) return g.tierRank(u.tier);
    return 0;
  }

  /** Discovery filters use profile tier only — admin role does not widen peer/lower lists. */
  function formationTierRank(u) {
    if (!u) return 0;
    var g = gov();
    if (g && g.formationRankFromParticipant) return g.formationRankFromParticipant(u);
    if (g && g.tierRank) return g.tierRank(u.tier);
    return 0;
  }

  function classRank(cls) {
    var g = gov();
    if (g && g.classRank) return g.classRank(cls);
    return 99;
  }

  /** Match Firestore ce2GroupContentFloor + clamp classification before group send. */
  async function resolveGroupSendPolicy(groupId, classification, me) {
    var snap = await db.collection('communicationGroups').doc(groupId).get();
    var gdata = snap.exists ? snap.data() : {};
    var g = gov();
    var requiredTier = normalizeTier(gdata.requiredTier || 'foundation');
    var requiredRank = g && g.tierRank ? g.tierRank(requiredTier) : 0;
    var userRank = tierRank(me);
    if (!me.isAdmin && userRank < requiredRank) {
      var tierErr = new Error(
        'This group requires ' +
          requiredTier +
          ' tier. Your profile is ' +
          (me.tier || 'foundation') +
          ' — ask an admin to confirm your tier in Admin → Manage user.'
      );
      tierErr.code = 'tier-mismatch';
      throw tierErr;
    }
    var floorRank =
      typeof gdata.securityLevel === 'number'
        ? gdata.securityLevel
        : requiredRank;
    var cls = classification || 'foundation';
    if (g && g.clampClassification) {
      cls = g.clampClassification(cls, floorRank);
    } else if (classRank(cls) > floorRank) {
      cls = g && g.tierLabelFromRank ? g.tierLabelFromRank(floorRank) : requiredTier;
    }
    return { classification: cls, requiredTier: requiredTier, floorRank: floorRank };
  }

  async function ensureGroupReadyToSend(ac, me) {
    if (!ac || ac.type !== 'group' || !ac.id) return ac;
    var joined = await isGroupMember(ac.id);
    if (!joined) {
      await joinGroupById(ac.id, ac.title || 'Group');
      ac = CommunicationState.activeConversation;
    } else if (ac.needsJoin) {
      ac = Object.assign({}, ac, { needsJoin: false });
      CommunicationState.activeConversation = ac;
    }
    return ac;
  }

  /** Tiers a user may discover below their own (higher → lower messaging policy). */
  function lowerTierQueriesForUser(u) {
    var g = gov();
    var rank = formationTierRank(u);
    if (g && g.tiersBelowRank) return g.tiersBelowRank(rank);
    if (rank >= 2) return ['foundation', 'free', 'premium'];
    if (rank >= 1) return ['foundation', 'free'];
    return [];
  }

  function peerTierQueriesForUser(u) {
    if (!u) return ['foundation', 'free'];
    var t = normalizeTier(u.tier);
    if (t === 'foundation') return ['foundation', 'free'];
    return [t];
  }

  async function queryUsersMatchingTiers(tiers, limitN) {
    var unique = [];
    (tiers || []).forEach(function (t) {
      if (t && unique.indexOf(t) < 0) unique.push(t);
    });
    if (!unique.length) return [];
    var byId = {};
    function ingest(snap) {
      if (!snap) return;
      snap.forEach(function (doc) {
        if (!byId[doc.id]) byId[doc.id] = doc;
      });
    }
    var snap = await db.collection('users').where('tier', 'in', unique).limit(limitN || 40).get();
    ingest(snap);
    var billing = unique.filter(function (t) {
      return t === 'elite' || t === 'premium' || t === 'foundation' || t === 'free';
    });
    if (billing.length) {
      try {
        var snap2 = await db
          .collection('users')
          .where('subscription.tier', 'in', billing)
          .limit(limitN || 40)
          .get();
        ingest(snap2);
      } catch (err) {
        console.warn('subscription.tier discovery query', err);
      }
    }
    return Object.keys(byId).map(function (id) {
      return byId[id];
    });
  }

  function discoveryEmptyMessage(mode, u) {
    if (mode === 'mentees') {
      return 'No recent mentee threads. Open a member from Discovery or wait for them to message you.';
    }
    if (mode === 'mentors') {
      return 'No mentors listed. In Admin Panel → Users → Manage, enable Mentor on at least one account.';
    }
    if (mode === 'lower') {
      if (!lowerTierQueriesForUser(u).length) {
        return 'Foundation tier cannot discover lower tiers — only same tier and mentors.';
      }
      return 'No members found below your tier. They must have tier foundation or premium in their profile.';
    }
    return 'No other ' + normalizeTier(u.tier) + ' members found.';
  }

  function updateDiscoveryTabs(u) {
    var lowerBtn = document.querySelector('.ce2-tab-lower');
    var hint = el('ce2DiscoveryHint');
    var canSeeLower = lowerTierQueriesForUser(u).length > 0;
    if (lowerBtn) lowerBtn.hidden = !canSeeLower;
    if (hint) {
      hint.textContent = canSeeLower
        ? 'Mentors, same tier, or lower tiers — filtered queries only.'
        : 'Mentors and same tier — filtered queries only.';
    }
    if (!canSeeLower && CommunicationState.discoveryMode === 'lower') {
      CommunicationState.discoveryMode = 'peers';
      document.querySelectorAll('.ce2-tab').forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-discovery') === 'peers');
      });
    }
  }

  /** Policy mirror of Firestore helpers (UX hints; enforcement is server-side). */
  function canCommunicate(sender, receiver) {
    if (!sender || !receiver) return false;
    if (sender.isAdmin || receiver.isAdmin) return true;
    const sr = tierRank(sender);
    const rr = tierRank(receiver);
    if (sr >= rr) return true;
    if (receiver.mentor) return true;
    return false;
  }

  function isUserBlockedUid(uid) {
    if (!uid) return false;
    var ma = msgActions();
    return !!(ma && ma.isUserBlocked && ma.isUserBlocked(uid));
  }

  function canReadClassification(reader, classification) {
    if (!reader) return false;
    var g = gov();
    if (g && g.canReadClassificationAsUser) {
      var raw = reader.raw || {};
      return g.canReadClassificationAsUser(
        {
          tier: reader.tier || raw.tier,
          subscription: raw.subscription,
          mentor: reader.mentor,
        },
        classification,
        {
          isAdmin: !!reader.isAdmin,
          mentor: !!reader.mentor,
        }
      );
    }
    if (reader.isAdmin) return true;
    if (classification === 'public') return true;
    if (classification === 'mentor') return reader.mentor || reader.isAdmin;
    return tierRank(reader) >= classRank(classification);
  }

  function gov() {
    return typeof window !== 'undefined' ? window.Ce2Governance : null;
  }

  function governanceEnabled() {
    var g = gov();
    return !!(g && g.isEnabled && g.isEnabled());
  }

  async function canForwardToTarget(sourceMsg, sourceAc, target) {
    var me = CommunicationState.me;
    if (!me || !sourceMsg || !sourceAc || !target) {
      return { ok: false, reason: 'Cannot forward this message.' };
    }
    if (!canReadMessageContent(me, sourceMsg, sourceAc)) {
      return { ok: false, reason: 'You cannot forward content you are not allowed to read.' };
    }
    var classification = sourceMsg.classification || 'foundation';
    var g = gov();

    if (target.type === 'direct') {
      if (!target.otherUid) {
        return { ok: false, reason: 'Invalid direct thread.' };
      }
      var peer = target.peerUser;
      if (!peer) {
        try {
          var udoc = await db.collection('users').doc(target.otherUid).get();
          peer = normalizeCe2User(target.otherUid, udoc.exists ? udoc.data() : {});
        } catch (_) {
          peer = { uid: target.otherUid, tier: 'foundation' };
        }
      }
      if (!canCommunicate(me, peer)) {
        return {
          ok: false,
          reason:
            'Formation policy blocks forwarding to this member (tier / mentor rules).',
        };
      }
      var convId = target.convId || target.id || directConvId(me.uid, target.otherUid);
      var floor = -1;
      try {
        var csnap = await db.collection('ce2_conversations').doc(convId).get();
        if (csnap.exists && typeof csnap.data().securityLevel === 'number') {
          floor = csnap.data().securityLevel;
        }
      } catch (_) {}
      if (
        governanceEnabled() &&
        g &&
        typeof floor === 'number' &&
        floor >= 0 &&
        !g.classificationAllowedAtFloor(classification, floor)
      ) {
        return {
          ok: false,
          reason: 'Forwarded content exceeds this thread security level.',
        };
      }
      return { ok: true, convId: convId, classification: classification, floor: floor };
    }

    if (target.type === 'group') {
      if (!target.id) return { ok: false, reason: 'Invalid group.' };
      var member = await isGroupMember(target.id);
      if (!member && !me.isAdmin) {
        return { ok: false, reason: 'Join the group before forwarding into it.' };
      }
      var floorG = -1;
      try {
        var gsnap = await db.collection('communicationGroups').doc(target.id).get();
        if (gsnap.exists) {
          var gd = gsnap.data();
          floorG =
            typeof gd.securityLevel === 'number'
              ? gd.securityLevel
              : g
                ? g.groupSecurityFromRequiredTier(gd.requiredTier || 'foundation').level
                : 0;
        }
      } catch (_) {}
      if (
        governanceEnabled() &&
        g &&
        typeof floorG === 'number' &&
        !g.classificationAllowedAtFloor(classification, floorG)
      ) {
        return {
          ok: false,
          reason: 'Forwarded content exceeds this group security level.',
        };
      }
      return { ok: true, classification: classification, floor: floorG };
    }

    return { ok: false, reason: 'Unknown forward target.' };
  }

  async function logCe2Audit(type, detail) {
    if (!governanceEnabled()) return;
    var me = CommunicationState.me;
    try {
      await db.collection('ce2_audit_log').add({
        type: type,
        uid: me ? me.uid : '',
        detail: detail || {},
        createdAt: firebase.firestore.Timestamp.now(),
      });
    } catch (e) {
      console.warn('ce2_audit_log', e);
    }
  }

  function canReadMessageContent(reader, message, activeConversation) {
    // Personal eligibility only. Conversation securityLevel clamps *send*
    // (downward formation flow). Applying it on receive hid Elite-classified
    // history in DMs whose stored floor lagged paid subscription.tier.
    void activeConversation;
    return canReadClassification(reader, message && message.classification);
  }

  function syncClassificationSelect(activeConversation) {
    var sel = el('ce2ClassSelect');
    if (!sel) return;
    var g = gov();
    if (!governanceEnabled() || !activeConversation || typeof activeConversation.securityLevel !== 'number') {
      Array.prototype.forEach.call(sel.options, function (opt) {
        opt.disabled = false;
      });
      return;
    }
    var allowed = g.classificationsAtOrBelowFloor(activeConversation.securityLevel);
    Array.prototype.forEach.call(sel.options, function (opt) {
      opt.disabled = allowed.indexOf(opt.value) < 0;
    });
    if (allowed.indexOf(sel.value) < 0 && allowed.length) {
      sel.value = allowed[allowed.length - 1];
    }
  }

  function directConvId(a, b) {
    const s = [a, b].sort();
    return 'd_' + s[0] + '_' + s[1];
  }

  /** Classifications this user may query (aligns with Firestore read rules). */
  function allowedClassifications(u) {
    if (!u) return ['public', 'foundation'];
    if (u.isAdmin || u.mentor) {
      return [
        'public',
        'foundation',
        'premium',
        'elite',
        'ambassador',
        'senior_ambassador',
        'rd',
        'mentor',
      ];
    }
    var list = ['public', 'foundation'];
    if (tierRank(u) >= 1) list.push('premium');
    if (tierRank(u) >= 2) list.push('elite');
    return list;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function resetCe2UiBlockers() {
    document.body.classList.remove('ham-drawer-open', 'ce2-msg-menu-open');
    document.body.style.pointerEvents = '';
    document.body.style.opacity = '';
    document.body.style.touchAction = '';
    clearCe2SheetPanelStyles();
    var ma = msgActions();
    if (ma && ma.closeMessageMenu) ma.closeMessageMenu();
    document.querySelectorAll('.ce2-sheet').forEach(function (sheet) {
      sheet.hidden = true;
    });
    var menu = el('ce2MsgMenu');
    if (menu) {
      menu.hidden = true;
      menu.setAttribute('aria-hidden', 'true');
      menu.classList.remove('is-open', 'is-sheet', 'is-popover', 'is-flip-above');
    }
  }

  function switchHubPanel(hub) {
    resetCe2UiBlockers();
    CommunicationState.mobileHubPanel = hub || 'groups';
    CommunicationState.error = null;
    CommunicationState.statusMessage = null;
    render();

    var me = CommunicationState.me;
    if (!me) return;

    if (hub === 'saved') {
      var actions = msgActions();
      var chain = actions && actions.loadSavedPrefs
        ? actions.loadSavedPrefs(me.uid)
        : Promise.resolve();
      chain
        .then(function () {
          return loadSavedItems(me.uid);
        })
        .then(function () {
          render();
        })
        .catch(function (err) {
          console.warn('switchHubPanel saved', err);
          render();
        });
      return;
    }

    if (hub === 'discover') {
      ensureDiscoveryLoaded()
        .then(function () {
          syncPresenceWatches();
          render();
        })
        .catch(function (err) {
          console.warn('switchHubPanel discover', err);
          render();
        });
    }
  }

  var lastHubTapMs = 0;

  function activateHubTab(btn) {
    if (!btn) return;
    var hub = btn.getAttribute('data-hub');
    if (!hub) return;
    var now = Date.now();
    if (now - lastHubTapMs < 350) return;
    lastHubTapMs = now;
    switchHubPanel(hub);
  }

  function bindHubNav() {
    if (document.body.dataset.ce2HubBound) return;
    document.body.dataset.ce2HubBound = '1';

    document.addEventListener(
      'click',
      function (e) {
        var btn = e.target.closest('.ce2-hub-tab');
        if (btn) activateHubTab(btn);
      },
      false
    );
  }

  root.ce2SwitchHub = function (hub) {
    switchHubPanel(hub);
  };

  function promiseWithTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        window.setTimeout(function () {
          reject(new Error((label || 'operation') + ' timed out'));
        }, ms);
      }),
    ]);
  }

  function requestRender(opts) {
    opts = opts || {};
    if (opts.threadOnly) CommunicationState._pendingThreadOnly = true;
    if (opts.throttle && !opts.threadOnly) {
      if (CommunicationState._throttleRenderTimer) return;
      CommunicationState._throttleRenderTimer = setTimeout(function () {
        CommunicationState._throttleRenderTimer = null;
        requestRender({ threadOnly: CommunicationState._pendingThreadOnly });
        CommunicationState._pendingThreadOnly = false;
      }, 120);
      return;
    }
    if (renderRaf) return;
    var threadOnly = CommunicationState._pendingThreadOnly;
    CommunicationState._pendingThreadOnly = false;
    renderRaf = requestAnimationFrame(function () {
      renderRaf = 0;
      render(threadOnly ? { threadOnly: true } : {});
    });
  }

  function bumpThreadOpenToken() {
    CommunicationState._openToken = (CommunicationState._openToken || 0) + 1;
    return CommunicationState._openToken;
  }

  function scheduleLoadThreads(uid) {
    if (!uid) return;
    if (CommunicationState._loadThreadsTimer) {
      clearTimeout(CommunicationState._loadThreadsTimer);
    }
    CommunicationState._loadThreadsTimer = setTimeout(function () {
      CommunicationState._loadThreadsTimer = null;
      loadThreads(uid).then(function () {
        requestRender({ throttle: true });
      }).catch(function () {});
    }, 800);
  }

  function scheduleLoadGroups(uid) {
    if (!uid) return;
    if (CommunicationState._loadGroupsTimer) {
      clearTimeout(CommunicationState._loadGroupsTimer);
    }
    CommunicationState._loadGroupsTimer = setTimeout(function () {
      CommunicationState._loadGroupsTimer = null;
      loadGroupsForUser(CommunicationState.me).then(function () {
        requestRender({ throttle: true });
      }).catch(function () {});
    }, 800);
  }

  function markThreadReadOnce(ac) {
    clearThreadUnreadLocal(ac);
    CommunicationState._pendingThreadOnly = false;
    requestRender({ throttle: true });
    var rc = receipts();
    var ref = getMetaDocRef(ac);
    var me = CommunicationState.me;
    if (rc && ref && me) {
      rc.markRead(ref, me.uid).catch(function () {});
    }
  }

  function messageTimeMs(m) {
    if (!m || !m.createdAt) return 0;
    try {
      var ts = m.createdAt;
      if (ts.toMillis) return ts.toMillis();
      if (typeof ts.seconds === 'number') return ts.seconds * 1000;
      if (ts.toDate) return ts.toDate().getTime();
      if (ts instanceof Date) return ts.getTime();
      return 0;
    } catch (_) {
      return 0;
    }
  }

  function sortMessagesByTime(msgs) {
    return msgs.slice().sort(function (a, b) {
      return messageTimeMs(a) - messageTimeMs(b);
    });
  }

  function mergeServerAndPending(serverMsgs) {
    var pending = CommunicationState.pendingMessages || [];
    var strip =
      root.Ce2Format && root.Ce2Format.stripFormattingForPreview
        ? function (t) {
            return root.Ce2Format.stripFormattingForPreview(t || '');
          }
        : function (t) {
            return t || '';
          };
    var stillPending = pending.filter(function (p) {
      return !serverMsgs.some(function (s) {
        if (s.senderId !== p.senderId) return false;
        if (s.content === p.content) return true;
        return strip(s.content) === strip(p.content);
      });
    });
    CommunicationState.pendingMessages = stillPending;
    return sortMessagesByTime(serverMsgs.concat(stillPending));
  }

  function confirmSentMessage(pendingId, serverId, patch, ac) {
    if (!pendingId || !serverId || !ac) return;
    CommunicationState.pendingMessages = (CommunicationState.pendingMessages || []).filter(
      function (p) {
        return p.id !== pendingId;
      }
    );
    var msg = Object.assign({}, patch, {
      id: serverId,
      createdAt: firebase.firestore.Timestamp.now(),
    });
    delete msg._pending;
    var list = (CommunicationState.lastServerMessages || []).slice();
    if (!list.some(function (m) {
      return m.id === serverId;
    })) {
      list.push(msg);
      list = sortMessagesByTime(list);
    }
    CommunicationState.lastServerMessages = list;
    CommunicationState.messages = mergeServerAndPending(list);
    CommunicationState._metaLastMessageId = serverId;

    var scroll = el('ce2MessageScroll');
    if (!scroll) {
      requestRender({ threadOnly: true });
      return;
    }
    var oldRow = scroll.querySelector('[data-message-id="' + pendingId + '"]');
    if (oldRow) {
      var newRow = buildMessageRow(msg, ac);
      oldRow.replaceWith(newRow);
      if (CommunicationState._renderedMsgIds) {
        CommunicationState._renderedMsgIds = CommunicationState._renderedMsgIds.map(
          function (id) {
            return id === pendingId ? serverId : id;
          }
        );
      }
      updateReadReceiptFooters(ac);
    } else {
      requestRender({ threadOnly: true });
    }
  }

  function pushOptimisticMessage(patch) {
    var opt = Object.assign({}, patch, {
      id: 'pending-' + Date.now(),
      _pending: true,
    });
    if (!CommunicationState.pendingMessages) CommunicationState.pendingMessages = [];
    CommunicationState.pendingMessages.push(opt);
    CommunicationState.messages = mergeServerAndPending(
      CommunicationState.lastServerMessages || []
    );
    var scroll = el('ce2MessageScroll');
    var ac = CommunicationState.activeConversation;
    var visible = ac ? getVisibleMessages(ac) : [];
    var stickBottom =
      scroll &&
      scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 56;
    if (
      scroll &&
      ac &&
      tryIncrementalMessageRender(scroll, ac, visible, stickBottom)
    ) {
      return opt.id;
    }
    requestRender({ threadOnly: true });
    return opt.id;
  }

  function removeOptimisticMessage(pendingId) {
    CommunicationState.pendingMessages = (CommunicationState.pendingMessages || []).filter(
      function (p) {
        return p.id !== pendingId;
      }
    );
    CommunicationState.messages = mergeServerAndPending(
      CommunicationState.lastServerMessages || []
    );
  }

  function markOptimisticFailed(pendingId, err) {
    var reason = (err && err.message) || 'Send failed';
    var found = false;
    CommunicationState.pendingMessages = (CommunicationState.pendingMessages || []).map(
      function (p) {
        if (p.id !== pendingId) return p;
        found = true;
        return Object.assign({}, p, {
          _pending: true,
          _failed: true,
          _failReason: reason,
        });
      }
    );
    if (!found) return;
    CommunicationState.messages = mergeServerAndPending(
      CommunicationState.lastServerMessages || []
    );
  }

  function patchForRetry(pending) {
    var patch = Object.assign({}, pending);
    delete patch.id;
    delete patch._pending;
    delete patch._failed;
    delete patch._failReason;
    delete patch.uploadState;
    delete patch.uploadProgress;
    delete patch._voiceLocalId;
    delete patch._localAudioUrl;
    return patch;
  }

  async function retryFailedMessage(pendingId) {
    var pending = (CommunicationState.pendingMessages || []).find(function (p) {
      return p.id === pendingId;
    });
    if (!pending) return;
    var ac = CommunicationState.activeConversation;
    var me = CommunicationState.me;
    if (!ac || !me) return;
    if (pending.conversationId && ac.id && pending.conversationId !== ac.id) {
      CommunicationState.statusMessage = 'Open that thread to retry this message.';
      render();
      return;
    }
    if (pending._voiceLocalId) {
      retryVoiceNote(pending._voiceLocalId);
      return;
    }
    CommunicationState.pendingMessages = (CommunicationState.pendingMessages || []).map(
      function (p) {
        if (p.id !== pendingId) return p;
        var next = Object.assign({}, p);
        delete next._failed;
        delete next._failReason;
        next._pending = true;
        return next;
      }
    );
    CommunicationState.messages = mergeServerAndPending(
      CommunicationState.lastServerMessages || []
    );
    requestRender({ threadOnly: true });
    try {
      var patch = patchForRetry(pending);
      var messageId = await commitCe2Message(ac, patch, me);
      confirmSentMessage(pendingId, messageId, patch, ac);
      triggerCe2Push(ac, patch.content || '', me, messageId);
      patchThreadPreviewLocal(ac, patch);
      CommunicationState.statusMessage = null;
      CommunicationState.error = null;
    } catch (err) {
      markOptimisticFailed(pendingId, err);
      handleCe2Error(
        err,
        ac && ac.type === 'direct' ? 'send' : ac && ac.type === 'group' ? 'group' : null
      );
      requestRender({ threadOnly: true });
    }
  }

  function sidebarListLoadingHtml(label) {
    return (
      '<li class="ce2-placeholder ce2-placeholder-loading" aria-busy="true">' +
      escapeHtml(label || 'Loading…') +
      '</li>'
    );
  }

  function inboxRowClass(row, selected) {
    var cls = 'ce2-li ce2-li--inbox';
    if (selected) cls += ' is-selected';
    if (row && row.pinned) cls += ' is-pinned';
    if (row && row.muted) cls += ' is-muted';
    if (row && row.unread > 0) cls += ' has-unread';
    return cls;
  }

  function inboxBadgeHtml(row) {
    var ib = inbox();
    var unread = (row && row.unread) || 0;
    var mode = ib ? ib.unreadBadgeMode(unread, !!(row && row.muted)) : unread > 0 ? 'count' : 'none';
    if (mode === 'dot') {
      return '<span class="ce2-unread-dot" aria-label="Unread"></span>';
    }
    if (mode === 'count') {
      var label = ib ? ib.formatUnreadCount(unread) : unread > 99 ? '99+' : String(unread);
      return '<span class="ce2-unread-badge">' + escapeHtml(label) + '</span>';
    }
    if (row && row.muted) {
      return '<span class="ce2-li-muted-icon" title="Muted" aria-label="Muted">🔕</span>';
    }
    return '';
  }

  function inboxRowInnerHtml(name, presenceUid, sub, row, isDraft) {
    var pin = row && row.pinned ? '<span class="ce2-li-pin" title="Pinned" aria-hidden="true">📌</span>' : '';
    var metaCls = 'ce2-li-meta';
    if (isDraft) metaCls += ' ce2-li-meta--draft';
    else if (row && row.unread > 0 && !row.muted) metaCls += ' ce2-li-meta--unread';
    return (
      '<div class="ce2-li-row">' +
      avatarWithPresence(name, presenceUid || '') +
      '<span class="ce2-li-body"><div class="ce2-li-name-row"><div class="ce2-li-name">' +
      escapeHtml(name) +
      pin +
      '</div>' +
      inboxBadgeHtml(row) +
      '</div><div class="' +
      metaCls +
      '">' +
      escapeHtml(sub || '') +
      '</div></span>' +
      '<button type="button" class="ce2-li-more" aria-label="Conversation options" title="Pin or mute">⋮</button>' +
      '</div>'
    );
  }

  function renderSidebarLists() {
    const pill = el('ce2TierPill');
    const u = CommunicationState.me;

    const gList = el('ce2GroupList');
    const tList = el('ce2ThreadList');
    const dList = el('ce2DiscoveryList');
    const sList = el('ce2SavedList');

    if (CommunicationState.loading) {
      if (gList) gList.innerHTML = sidebarListLoadingHtml('Loading groups…');
      if (tList) tList.innerHTML = sidebarListLoadingHtml('Loading conversations…');
      if (dList) dList.innerHTML = sidebarListLoadingHtml('Loading discovery…');
      if (sList) sList.innerHTML = sidebarListLoadingHtml('Loading starred…');
      if (pill) pill.textContent = u ? '…' : '…';
      return;
    }

    if (pill && u) {
      var tierLabel = u.isAdmin
        ? 'Admin'
        : (u.tier || 'foundation').replace(/_/g, ' ');
      tierLabel = tierLabel.charAt(0).toUpperCase() + tierLabel.slice(1);
      pill.textContent = showDebugUi()
        ? (u.isAdmin ? 'admin' : u.tier) +
          ' · f' +
          u.formationLevel +
          ' · c' +
          u.communicationLevel
        : tierLabel;
    }

    if (gList) {
      gList.innerHTML = '';
      if (!CommunicationState.visibleGroups.length) {
        gList.innerHTML =
          '<li class="ce2-placeholder">No formation groups yet. As admin: open <strong>Admin Panel → Messages V2</strong> and create a CE2 group, then refresh this page.</li>';
      } else {
        CommunicationState.visibleGroups.forEach(function (g) {
          const li = document.createElement('li');
          var selected = CommunicationState.selectedGroupId === g.id;
          li.className = inboxRowClass(g, selected);
          li.dataset.groupId = g.id;
          var gMeta = listMetaLine(u.uid, 'g:' + g.id, g.lastPreview || '');
          var gSub = gMeta.text;
          if (!gSub && !gMeta.isDraft) {
            gSub = 'requires ' + g.requiredTier + (g.mentorLed ? ' · mentor-led' : '');
          }
          li.innerHTML = inboxRowInnerHtml(g.name, '', gSub, g, gMeta.isDraft);
          li.dataset.action = 'select-group';
          li.dataset.groupName = g.name || 'Group';
          li.dataset.inboxKind = 'group';
          li.dataset.inboxId = g.id;
          gList.appendChild(li);
        });
      }
    }

    if (tList) {
      tList.innerHTML = '';
      if (!CommunicationState.threads.length) {
        tList.innerHTML =
          '<li class="ce2-placeholder">No CE2 direct threads yet. Open someone from Discovery.</li>';
      } else {
        CommunicationState.threads.forEach(function (t) {
          var tMeta = listMetaLine(u.uid, 'd:' + t.id, t.sub || '');
          const li = document.createElement('li');
          var selected = !!(
            CommunicationState.activeConversation &&
            CommunicationState.activeConversation.id === t.id &&
            CommunicationState.activeConversation.type === 'direct'
          );
          li.className = inboxRowClass(t, selected);
          li.innerHTML = inboxRowInnerHtml(t.label, t.otherUid || '', tMeta.text, t, tMeta.isDraft);
          li.dataset.action = 'open-thread';
          li.dataset.convId = t.id;
          li.dataset.otherUid = t.otherUid || '';
          li.dataset.label = t.label || 'Direct';
          li.dataset.inboxKind = 'direct';
          li.dataset.inboxId = t.id;
          tList.appendChild(li);
        });
      }
    }

    if (dList) {
      dList.innerHTML = '';
      if (!CommunicationState.discoveryLoaded && !CommunicationState.loading) {
        dList.innerHTML =
          '<li class="ce2-placeholder">Open Discover to load members.</li>';
      } else if (!CommunicationState.visibleUsers.length) {
        dList.innerHTML =
          '<li class="ce2-placeholder">' +
          escapeHtml(
            discoveryEmptyMessage(CommunicationState.discoveryMode, u || CommunicationState.me || {})
          ) +
          '</li>';
      } else {
        CommunicationState.visibleUsers.forEach(function (x) {
          const li = document.createElement('li');
          li.className =
            'ce2-li' +
            (CommunicationState.selectedDiscoveryUid === x.uid ? ' is-selected' : '');
          li.innerHTML =
            '<div class="ce2-li-row">' +
            avatarWithPresence(x.name, x.uid || '') +
            '<span class="ce2-li-body"><div class="ce2-li-name">' +
            escapeHtml(x.name) +
            '</div><div class="ce2-li-meta">' +
            escapeHtml(x.tier) +
            (x.mentor ? ' · mentor' : '') +
            '</div></span></div>';
          li.innerHTML = li.innerHTML.replace('</span></div>', '</span></div>');
          li.dataset.action = 'open-discovery';
          li.dataset.peerUid = x.uid;
          li.dataset.peerName = x.name || 'Member';
          li.dataset.peerTier = x.tier || '';
          li.dataset.peerMentor = x.mentor ? '1' : '0';
          dList.appendChild(li);
        });
      }
    }

    if (sList) {
      sList.innerHTML = '';
      var saved = CommunicationState.savedItems || [];
      if (!saved.length) {
        sList.innerHTML =
          '<li class="ce2-placeholder">No starred messages yet. Long-press a message and choose Star.</li>';
      } else {
        saved.forEach(function (item) {
          var li = document.createElement('li');
          li.className = 'ce2-li';
          li.dataset.action = 'open-saved';
          li.dataset.convId = item.conversationId || '';
          li.dataset.convType = item.conversationType || 'direct';
          li.dataset.messageId = item.messageId || item.id || '';
          li.innerHTML =
            '<div class="ce2-li-row"><span class="ce2-avatar">★</span><span class="ce2-li-body"><div class="ce2-li-name">' +
            escapeHtml((item.preview || 'Message').slice(0, 60)) +
            '</div><div class="ce2-li-meta">' +
            escapeHtml(item.conversationType || 'direct') +
            '</div></span></div>';
          sList.appendChild(li);
        });
      }
    }
    renderHubUnreadBadges();
  }

  function scrollToReplyMessage(messageId) {
    if (!messageId) return;
    var scroll = el('ce2MessageScroll');
    if (!scroll) return;
    CommunicationState.highlightMessageId = messageId;
    render({ threadOnly: true });
    requestAnimationFrame(function () {
      var row = scroll.querySelector('.ce2-row[data-message-id="' + messageId + '"]');
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function () {
        if (CommunicationState.highlightMessageId === messageId) {
          CommunicationState.highlightMessageId = null;
          render({ threadOnly: true });
        }
      }, 2200);
    });
  }

  function renderThreadChrome() {
    const ac = CommunicationState.activeConversation;
    var shell = el('ce2App');
    var workspace = el('ce2Workspace');
    var sidebar = el('ce2Sidebar');
    var threadOpen = !!(ac && !ac.needsJoin);
    if (shell) shell.classList.toggle('ce2-thread-open', threadOpen);
    if (workspace) {
      workspace.classList.toggle('ce2-thread-open', threadOpen);
      workspace.classList.toggle('ce2-hub-mode', !threadOpen);
    }
    if (!threadOpen) {
      clearComposerKeyboardInset();
    }
    if (sidebar && !threadOpen) {
      var hub = CommunicationState.mobileHubPanel || 'groups';
      sidebar.classList.remove(
        'ce2-hub-groups',
        'ce2-hub-direct',
        'ce2-hub-discover',
        'ce2-hub-saved'
      );
      sidebar.classList.add('ce2-hub-' + hub);
    }
    document.querySelectorAll('.ce2-hub-tab').forEach(function (btn) {
      var on = btn.getAttribute('data-hub') === CommunicationState.mobileHubPanel;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var backList = el('ce2BackToList');
    if (backList) backList.hidden = !threadOpen;

    var searchToggle = el('ce2ThreadSearchToggle');
    var searchBar = el('ce2ThreadSearch');
    if (searchToggle) {
      searchToggle.hidden = !threadOpen;
      if (!threadOpen && searchBar) {
        searchBar.hidden = true;
        searchToggle.setAttribute('aria-expanded', 'false');
        searchToggle.classList.remove('is-active');
        CommunicationState.threadSearchQuery = '';
        CommunicationState.threadSearchSenderId = '';
        CommunicationState.threadSearchStartMs = 0;
        CommunicationState.threadSearchEndMs = 0;
        CommunicationState.searchJumpMessages = null;
        CommunicationState.searchJumpOldestDoc = null;
        CommunicationState.searchJumpHasMore = false;
        if (root.Ce2ThreadSearch && root.Ce2ThreadSearch.resetUi) {
          root.Ce2ThreadSearch.resetUi();
        }
      } else if (searchBar) {
        var searchOpen = !searchBar.hidden;
        searchToggle.setAttribute('aria-expanded', searchOpen ? 'true' : 'false');
        searchToggle.classList.toggle('is-active', searchOpen);
      }
    }

    const title = el('ce2ThreadTitle');
    const meta = el('ce2ThreadMeta');
    if (title) title.textContent = ac ? ac.title : 'Select a conversation';
    if (meta) {
      meta.textContent = ac
        ? formatThreadMeta(ac)
        : CommunicationState.loading
          ? 'Loading…'
          : CommunicationState.error || CommunicationState.statusMessage || '';
      if (!ac) {
        meta.classList.remove(
          'ce2-thread-meta--presence',
          'ce2-thread-meta--typing',
          'is-online',
          'is-away'
        );
      }
    }
    applyPresenceUi();

    var voiceBtn = el('ce2VoiceBtn');
    if (voiceBtn) {
      voiceBtn.classList.toggle('is-recording', !!CommunicationState.voiceRecording);
      voiceBtn.classList.toggle('is-cancel-armed', !!CommunicationState.voiceRecordingCancel);
      voiceBtn.disabled = !!(ac && ac.needsJoin);
    }
  }

  function invalidateMessageRenderCache() {
    CommunicationState._renderedMsgIds = null;
  }

  function patchThreadPreviewLocal(ac, previewOrText) {
    if (!ac) return;
    var meta =
      previewOrText && typeof previewOrText === 'object'
        ? previewOrText
        : { content: previewOrText, lastPreview: previewOrText };
    var text = formatInboxPreview(meta);
    if (!text) return;
    var me = CommunicationState.me;
    var kind = ac.type === 'group' ? 'group' : 'direct';
    var row = findInboxRow(kind, ac.id);
    if (!row) return;
    if (kind === 'direct') row.sub = text;
    else row.lastPreview = text;
    var senderId = meta.senderId || '';
    var fromSelf = !!(me && senderId && senderId === me.uid);
    if (!senderId && me) {
      fromSelf = true;
      senderId = me.uid;
    }
    row.lastActivityAt = Date.now();
    row.lastSenderId = senderId || row.lastSenderId || '';
    applyInboxPrefToRow(row, kind, senderId);
    if (fromSelf && row.muted) {
      row.sortAt = row.lastActivityAt;
      persistInboxPref(kind, ac.id, { muted: true, pinned: !!row.pinned, sortAt: row.sortAt });
    }
    sortVisibleInboxLists();
    CommunicationState._pendingThreadOnly = false;
    requestRender({ throttle: true });
  }

  function clearComposerTyping(ac) {
    var pr = presence();
    var me = CommunicationState.me;
    var ref = getMetaDocRef(ac);
    if (pr) {
      if (pr.setTypingMuted) pr.setTypingMuted(5000);
      if (CE2_TYPING_INDICATOR_ENABLED && ref && me) pr.clearTyping(ref, me.uid);
    }
    hideTypingIndicator();
  }

  function handleMetaMessageDelivery(data) {
    var ac = CommunicationState.activeConversation;
    var me = CommunicationState.me;
    if (!ac || !me || ac.needsJoin || !data || !data.lastMessageId) return;

    if (data.lastSenderId === me.uid) {
      CommunicationState._metaLastMessageId = data.lastMessageId;
      return;
    }

    var msgId = data.lastMessageId;
    if (isMessageAlreadyRendered(msgId)) {
      CommunicationState._metaLastMessageId = msgId;
      dropTypist(data.lastSenderId);
      return;
    }

    CommunicationState._metaLastMessageId = msgId;
    dropTypist(data.lastSenderId);

    var preview = {
      id: msgId,
      senderId: data.lastSenderId,
      content: data.lastPreview || '',
      createdAt: data.lastMessageAt || firebase.firestore.Timestamp.now(),
      conversationId: ac.id,
      messageType: data.lastMessageType || 'text',
      _fromMeta: true,
    };
    forceAppendIncomingMessage(preview, ac, true);
    patchThreadPreviewLocal(ac, preview);
    markThreadReadOnce(ac);
    fetchAndShowMessage(msgId, ac);
  }

  function messageBodySig(m) {
    if (!m) return '';
    var edited = '';
    if (m.editedAt) {
      if (typeof m.editedAt.seconds === 'number') edited = String(m.editedAt.seconds);
      else if (typeof m.editedAt.toMillis === 'function') edited = String(m.editedAt.toMillis());
      else edited = '1';
    }
    return [
      m.deleted ? '1' : '0',
      m.content || '',
      edited,
      m.formationTag || '',
      m.imageUrl || '',
      m.videoUrl || '',
      m.audioUrl || '',
      m.uploadState || '',
      m._pending ? 'p' : '',
      m._failed ? 'f' : '',
    ].join('\x1f');
  }

  function reconcileRenderedMessage(msg, ac) {
    var scroll = el('ce2MessageScroll');
    if (!scroll || !msg || !msg.id) return;
    var row = scroll.querySelector('[data-message-id="' + msg.id + '"]');
    if (!row) return;
    if (row.classList.contains('is-meta-preview')) {
      row.replaceWith(buildMessageRow(msg, ac));
      if (root.Ce2AudioPlayback) root.Ce2AudioPlayback.syncAll();
      return;
    }
    var ma = msgActions();
    if (ma && ma.syncReactionsRow) ma.syncReactionsRow(row, msg, ac);
  }

  function isMessageAlreadyRendered(msgId) {
    if (!msgId) return true;
    if (
      CommunicationState._renderedMsgIds &&
      CommunicationState._renderedMsgIds.indexOf(msgId) >= 0
    ) {
      return true;
    }
    var scroll = el('ce2MessageScroll');
    return !!(
      scroll && scroll.querySelector('[data-message-id="' + msgId + '"]')
    );
  }

  function mergeMessageIntoState(msg) {
    var list = (CommunicationState.lastServerMessages || []).slice();
    var found = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === msg.id) {
        list[i] = Object.assign({}, list[i], msg);
        found = true;
        break;
      }
    }
    if (!found) list = sortMessagesByTime(list.concat([msg]));
    CommunicationState.lastServerMessages = list;
    CommunicationState.messages = mergeServerAndPending(list);
  }

  function forceAppendIncomingMessage(msg, ac, scrollToEnd) {
    var scroll = el('ce2MessageScroll');
    if (!scroll || !msg || !msg.id || !ac) return false;
    if (isMessageAlreadyRendered(msg.id)) return true;

    mergeMessageIntoState(msg);

    var stickBottom =
      scrollToEnd !== false &&
      scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 56;

    if (CommunicationState._renderedMsgIds && scroll.querySelector('.ce2-row')) {
      var row = buildMessageRow(msg, ac);
      if (msg._fromMeta || msg._fromNotif) row.classList.add('is-meta-preview');
      scroll.appendChild(row);
      CommunicationState._renderedMsgIds =
        CommunicationState._renderedMsgIds.concat([msg.id]);
    } else {
      var visible = getVisibleMessages(ac);
      if (!tryIncrementalMessageRender(scroll, ac, visible, stickBottom)) {
        renderMessagePanel();
        return true;
      }
    }

    if (stickBottom) scroll.scrollTop = scroll.scrollHeight;
    updateTypingLineOnly();
    if (root.Ce2AudioPlayback) root.Ce2AudioPlayback.syncAll();
    return true;
  }

  function ingestIncomingNotif(n) {
    if (CE2_DELIVERY_EXPERIMENTAL) return;
    if (!n) return;
    var type = n.type;
    if (!type) return;
    if (type !== 'direct_message' && type !== 'group_message') return;
    if (!isNotifForOpenThread(n)) return;

    var ac = CommunicationState.activeConversation;
    if (!ac) return;

    var msgId = n.messageId;
    if (!msgId) {
      msgId =
        'notif-' +
        String(n.senderId || 'x') +
        '-' +
        messageTimeMs({ createdAt: n.timestamp });
    }
    if (isMessageAlreadyRendered(msgId)) return;

    dropTypist(n.senderId);

    var content = n.body || '';
    if (type === 'group_message') {
      var colon = content.indexOf(': ');
      if (colon > 0 && colon < 48) content = content.slice(colon + 2);
    }

    var preview = {
      id: msgId,
      senderId: n.senderId || (ac.type === 'direct' ? ac.otherUid : ''),
      content: content,
      createdAt: n.timestamp || firebase.firestore.Timestamp.now(),
      conversationId: ac.id,
      messageType: n.messageType || 'text',
      _fromNotif: true,
    };

    CommunicationState._metaLastMessageId = msgId;
    forceAppendIncomingMessage(preview, ac, true);
    patchThreadPreviewLocal(ac, preview);
    markThreadReadOnce(ac);
  }

  function fetchAndShowMessage(messageId, ac) {
    if (!messageId || !ac) return;
    var col =
      ac.type === 'direct'
        ? db.collection('ce2_conversations').doc(ac.id).collection('ce2_messages')
        : db.collection('communicationGroups').doc(ac.id).collection('ce2_messages');
    col
      .doc(messageId)
      .get()
      .then(function (doc) {
        if (!doc.exists) return;
        var acNow = CommunicationState.activeConversation;
        if (!acNow || acNow.id !== ac.id) return;
        var msg = Object.assign({ id: doc.id }, doc.data());
        CommunicationState._metaLastMessageId = messageId;
        dropTypist(msg.senderId);
        if (isMessageAlreadyRendered(messageId)) {
          mergeMessageIntoState(msg);
          reconcileRenderedMessage(msg, acNow);
          return;
        }
        forceAppendIncomingMessage(msg, acNow, true);
      })
      .catch(function () {});
  }

  function tryShowMessageFromMeta(meta) {
    var ac = CommunicationState.activeConversation;
    var me = CommunicationState.me;
    if (!ac || !me || ac.needsJoin || !meta) return;
    if (!meta.lastMessageId || !meta.lastSenderId) return;
    if (meta.lastSenderId === me.uid) return;

    var msgId = meta.lastMessageId;
    if (isMessageAlreadyRendered(msgId)) {
      CommunicationState._metaLastMessageId = msgId;
      return;
    }
    if (CommunicationState._metaLastMessageId === msgId) {
      fetchAndShowMessage(msgId, ac);
      return;
    }

    var preview = {
      id: msgId,
      senderId: meta.lastSenderId,
      content: meta.lastPreview || '',
      createdAt: meta.lastMessageAt,
      conversationId: ac.id,
      messageType: meta.lastMessageType || 'text',
      _fromMeta: true,
    };

    CommunicationState._metaLastMessageId = msgId;
    dropTypist(meta.lastSenderId);
    forceAppendIncomingMessage(preview, ac, true);
    patchThreadPreviewLocal(ac, preview);
    markThreadReadOnce(ac);
    fetchAndShowMessage(msgId, ac);
  }

  function applyIncomingMessageChanges(snap, ac, me) {
    if (!snap || !ac || !me) return false;
    var scroll = el('ce2MessageScroll');
    if (!scroll) return false;
    var handled = false;
    var stickBottom =
      scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 56;

    snap.docChanges().forEach(function (change) {
      if (change.type !== 'added') return;
      if (change.doc.metadata.hasPendingWrites) return;
      var data = change.doc.data();
      if (!data.senderId || data.senderId === me.uid) return;

      var msgId = change.doc.id;
      CommunicationState._metaLastMessageId = msgId;
      dropTypist(data.senderId);

      var msg = Object.assign({ id: msgId }, data);
      mergeMessageIntoState(msg);
      forceAppendIncomingMessage(msg, ac, true);
      patchThreadPreviewLocal(ac, msg);
      markThreadReadOnce(ac);
      handled = true;
    });
    return handled;
  }

  function syncMessagePanelFromSnap(ac) {
    var scroll = el('ce2MessageScroll');
    if (!scroll || !ac) return;
    var visible = getVisibleMessages(ac);
    var stickBottom =
      scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 56;
    if (tryIncrementalMessageRender(scroll, ac, visible, stickBottom)) {
      return;
    }
    renderMessagePanel();
  }

  function getVisibleMessages(ac) {
    var ma = msgActions();
    var list = CommunicationState.messages || [];
    if (
      CommunicationState.searchJumpMessages &&
      CommunicationState.searchJumpMessages.length
    ) {
      list = CommunicationState.searchJumpMessages;
    }
    return list.filter(function (m) {
      if (
        m._pending &&
        m.conversationId &&
        ac &&
        ac.id &&
        m.conversationId !== ac.id
      ) {
        return false;
      }
      if (ma && ma.isMessageHidden(m, ac)) return false;
      return true;
    });
  }

  function updateTypingLineOnly() {
    var ac = CommunicationState.activeConversation;
    var label = currentTypingLabel(ac);
    CommunicationState.typingLabel = label;
    var typingEl = el('ce2TypingLine');
    if (typingEl) {
      var typingText = typingEl.querySelector('.ce2-typing-text');
      var showLine =
        !!label &&
        ac &&
        !ac.needsJoin &&
        !composerInputFocused();
      if (showLine) {
        typingEl.hidden = false;
        if (typingText) typingText.textContent = label;
        else typingEl.textContent = label;
      } else {
        typingEl.hidden = true;
        if (typingText) typingText.textContent = '';
        else typingEl.textContent = '';
      }
    }
    applyPresenceHeader();
  }

  function otherDeliveryExtras(ac) {
    var extras = { otherOnline: false, otherLastActiveMs: 0 };
    if (!ac || ac.type !== 'direct' || !ac.otherUid) return extras;
    var rec = CommunicationState.presenceByUid[ac.otherUid];
    if (!rec) return extras;
    extras.otherOnline = rec.state === 'online';
    extras.otherLastActiveMs = rec.atMs || 0;
    return extras;
  }

  function selfDeliveryStatus(m, ac) {
    var rc = receipts();
    if (!rc || !CommunicationState.me) return '';
    var otherRead =
      ac && ac.type === 'direct' && CommunicationState.convMeta
        ? (CommunicationState.convMeta.lastRead || {})[ac.otherUid]
        : null;
    return rc.deliveryStatus(m, CommunicationState.me.uid, otherRead, otherDeliveryExtras(ac));
  }

  function updateReadReceiptFooters(ac) {
    if (!ac || ac.type !== 'direct' || !CommunicationState.me) return;
    var scroll = el('ce2MessageScroll');
    if (!scroll) return;
    var rc = receipts();
    if (!rc) return;
    scroll.querySelectorAll('.ce2-row.is-self').forEach(function (row) {
      var mid = row.dataset.messageId;
      if (!mid) return;
      var m = CommunicationState.messages.find(function (x) {
        return x.id === mid;
      });
      if (!m) return;
      var footMeta = row.querySelector('.ce2-msg-foot-meta');
      if (!footMeta) return;
      var status = selfDeliveryStatus(m, ac);
      row.classList.toggle('is-pending', status === 'pending');
      row.classList.toggle('is-failed', status === 'failed');
      row.classList.toggle('is-sent', status === 'sent');
      row.classList.toggle('is-delivered', status === 'delivered');
      row.classList.toggle('is-read', status === 'read');
      row.setAttribute('data-delivery', status || '');
      if (m._voiceLocalId && m.uploadState === 'uploading') {
        footMeta.textContent =
          'Uploading voice… ' + Math.round((m.uploadProgress || 0) * 100) + '%';
        return;
      }
      if (m._voiceLocalId && m.uploadState === 'retrying') {
        footMeta.textContent = 'Retrying upload…';
        return;
      }
      if (status === 'failed') {
        footMeta.textContent = rc.statusLabel('failed');
        return;
      }
      footMeta.textContent = m._pending
        ? rc.statusLabel('pending')
        : (status ? rc.statusLabel(status) + ' · ' : '') + (fmtTime(m.createdAt) || '');
    });
  }

  function buildMessageRow(m, ac) {
    var ma = msgActions();
    const self = CommunicationState.me && m.senderId === CommunicationState.me.uid;
    var searchQ = CommunicationState.threadSearchQuery || '';
    var searchHit = ma && ma.messageMatchesSearch(m, searchQ);
    var isHighlight =
      CommunicationState.highlightMessageId &&
      m.id === CommunicationState.highlightMessageId;
    var status = self ? selfDeliveryStatus(m, ac) : '';
    const row = document.createElement('div');
    row.className =
      'ce2-row' +
      (self ? ' is-self' : '') +
      (status === 'pending' || m._pending ? ' is-pending' : '') +
      (status === 'failed' || m._failed || m.uploadState === 'failed' ? ' is-failed' : '') +
      (status === 'sent' ? ' is-sent' : '') +
      (status === 'delivered' ? ' is-delivered' : '') +
      (status === 'read' ? ' is-read' : '') +
      (m.uploadState === 'failed' ? ' is-voice-failed' : '') +
      (searchHit ? ' is-search-hit' : '') +
      (isHighlight ? ' is-highlighted' : '');
    row.dataset.messageId = m.id || '';
    if (status) row.setAttribute('data-delivery', status);
    row.dataset.bodySig = messageBodySig(m);
    const reader = CommunicationState.me;
    const canRead = canReadMessageContent(reader, m, ac);
    const bubble = document.createElement('div');
    bubble.className =
      'ce2-bubble' +
      (canRead ? '' : ' ce2-bubble-locked') +
      (canRead && m.replyTo ? ' ce2-bubble--has-reply' : '');
    if (ma && canRead) {
      ma.renderForwardQuote(bubble, m);
      ma.renderFormationBadge(bubble, m);
    }
    if (showDebugUi()) {
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
    }
    if (canRead) {
      appendMessageBody(bubble, m);
      if (ma) ma.appendReactionsRow(bubble, m, ac);
    } else {
      bubble.appendChild(
        document.createTextNode('This space unlocks through formation progression.')
      );
    }
    row.appendChild(bubble);
    const foot = document.createElement('div');
    foot.className = 'ce2-msg-foot';
    var rc = receipts();
    var footMeta = document.createElement('span');
    footMeta.className = 'ce2-msg-foot-meta';
    footMeta.setAttribute('role', 'status');
    if (m._voiceLocalId && m.uploadState === 'uploading') {
      footMeta.textContent =
        'Uploading voice… ' + Math.round((m.uploadProgress || 0) * 100) + '%';
    } else if (m._voiceLocalId && m.uploadState === 'retrying') {
      footMeta.textContent = 'Retrying upload…';
    } else if (status === 'failed' || (m._voiceLocalId && m.uploadState === 'failed')) {
      footMeta.textContent = (rc && rc.statusLabel('failed')) || 'Failed to send';
    } else {
      footMeta.textContent = m._pending
        ? (rc && rc.statusLabel('pending')) || 'Sending…'
        : (rc && status ? rc.statusLabel(status) + ' · ' : '') + (fmtTime(m.createdAt) || '');
    }
    if (ma && ma.isMessageSaved(m)) {
      var star = document.createElement('span');
      star.className = 'ce2-msg-star';
      star.textContent = ' ★';
      star.title = 'Starred';
      footMeta.appendChild(star);
    }
    foot.appendChild(footMeta);
    if (self && (status === 'failed' || m._failed) && !m._voiceLocalId) {
      var retryWrap = document.createElement('div');
      retryWrap.className = 'ce2-send-failed-actions';
      retryWrap.innerHTML =
        '<button type="button" class="ce2-send-retry" data-pending-id="' +
        escapeHtml(m.id || '') +
        '">Retry</button>';
      foot.appendChild(retryWrap);
    }
    if (ma) ma.renderEditedLabel(foot, m);
    row.appendChild(foot);
    wireMessageRowMenu(row, m, ac, self, canRead);
    return row;
  }

  function tryIncrementalMessageRender(scroll, ac, visibleMsgs, stickBottom) {
    if (
      !scroll ||
      !ac ||
      CommunicationState.loadingOlder ||
      CommunicationState.threadSearchQuery ||
      CommunicationState.highlightMessageId ||
      (CommunicationState.searchJumpMessages &&
        CommunicationState.searchJumpMessages.length)
    ) {
      return false;
    }
    var prev = CommunicationState._renderedMsgIds;
    if (!prev || !prev.length || !scroll.querySelector('.ce2-row')) {
      return false;
    }
    var nextIds = visibleMsgs.map(function (m) {
      return m.id;
    });

    if (
      nextIds.length === prev.length &&
      prev.length > 0 &&
      prev[prev.length - 1] !== nextIds[nextIds.length - 1] &&
      String(prev[prev.length - 1]).indexOf('pending-') === 0
    ) {
      var prefixOk = true;
      for (var p = 0; p < prev.length - 1; p++) {
        if (prev[p] !== nextIds[p]) {
          prefixOk = false;
          break;
        }
      }
      if (prefixOk) {
        var oldRow = scroll.querySelector(
          '[data-message-id="' + prev[prev.length - 1] + '"]'
        );
        if (oldRow) oldRow.remove();
        scroll.appendChild(buildMessageRow(visibleMsgs[visibleMsgs.length - 1], ac));
        CommunicationState._renderedMsgIds = nextIds;
        if (stickBottom) {
          scroll.scrollTop = scroll.scrollHeight;
        }
        updateTypingLineOnly();
        if (root.Ce2MediaView && root.Ce2MediaView.afterMessagePanelRender) {
          root.Ce2MediaView.afterMessagePanelRender(scroll);
        }
        return true;
      }
    }

    if (nextIds.length > prev.length) {
      var samePrefix = true;
      for (var i = 0; i < prev.length; i++) {
        if (prev[i] !== nextIds[i]) {
          samePrefix = false;
          break;
        }
      }
      if (samePrefix) {
        for (var j = prev.length; j < visibleMsgs.length; j++) {
          scroll.appendChild(buildMessageRow(visibleMsgs[j], ac));
        }
        CommunicationState._renderedMsgIds = nextIds;
        if (stickBottom) {
          scroll.scrollTop = scroll.scrollHeight;
        }
        updateTypingLineOnly();
        if (root.Ce2AudioPlayback) root.Ce2AudioPlayback.syncAll();
        if (root.Ce2MediaView && root.Ce2MediaView.afterMessagePanelRender) {
          root.Ce2MediaView.afterMessagePanelRender(scroll);
        }
        return true;
      }
    }

    if (nextIds.length === prev.length) {
      var sameIds = true;
      for (var k = 0; k < prev.length; k++) {
        if (prev[k] !== nextIds[k]) {
          sameIds = false;
          break;
        }
      }
      if (sameIds) {
        var ma = msgActions();
        for (var r = 0; r < visibleMsgs.length; r++) {
          var msg = visibleMsgs[r];
          var rowEl = scroll.querySelector('[data-message-id="' + msg.id + '"]');
          if (!rowEl) continue;
          if (rowEl.dataset.bodySig !== messageBodySig(msg)) {
            rowEl.replaceWith(buildMessageRow(msg, ac));
            continue;
          }
          if (ma && ma.syncReactionsRow) ma.syncReactionsRow(rowEl, msg, ac);
        }
        updateTypingLineOnly();
        return true;
      }
    }

    return false;
  }

  function renderMessagePanel() {
    const ac = CommunicationState.activeConversation;
    const scroll = el('ce2MessageScroll');
    if (!scroll) return;

    var stickBottom =
      scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 56;

    if (!ac) {
      invalidateMessageRenderCache();
      closeMessageMenu();
      scroll.innerHTML = CommunicationState.loading
        ? '<div class="ce2-placeholder ce2-placeholder-loading">Loading messages…</div>'
        : '<div class="ce2-placeholder">Choose a formation group or direct thread.</div>';
      updateTypingLineOnly();
      return;
    }

    if (
      !CommunicationState.messages.length &&
      !(
        CommunicationState.searchJumpMessages &&
        CommunicationState.searchJumpMessages.length
      )
    ) {
      invalidateMessageRenderCache();
      closeMessageMenu();
      scroll.innerHTML = '<div class="ce2-placeholder">No messages yet.</div>';
      updateTypingLineOnly();
      return;
    }

    var visibleMsgs = getVisibleMessages(ac);
    if (tryIncrementalMessageRender(scroll, ac, visibleMsgs, stickBottom)) {
      if (root.Ce2MediaView && root.Ce2MediaView.afterMessagePanelRender) {
        root.Ce2MediaView.afterMessagePanelRender(scroll);
      }
      return;
    }

    invalidateMessageRenderCache();
    closeMessageMenu();
    scroll.innerHTML = '';
    var jumping = !!(
      CommunicationState.searchJumpMessages &&
      CommunicationState.searchJumpMessages.length
    );
    var hasMore = jumping
      ? CommunicationState.searchJumpHasMore
      : CommunicationState.hasMoreMessages;
    if (jumping) {
      var backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'ce2-btn ce2-btn-ghost ce2-search-jump-back';
      backBtn.id = 'ce2SearchJumpBack';
      backBtn.textContent = 'Back to latest messages';
      scroll.appendChild(backBtn);
    }
    if (hasMore) {
      var olderBtn = document.createElement('button');
      olderBtn.type = 'button';
      olderBtn.className = 'ce2-btn ce2-btn-ghost ce2-load-older';
      olderBtn.id = 'ce2LoadOlder';
      olderBtn.textContent = CommunicationState.loadingOlder
        ? 'Loading…'
        : 'Load older messages';
      olderBtn.disabled = CommunicationState.loadingOlder;
      scroll.appendChild(olderBtn);
    }
    var ma = msgActions();
    if (ma) ma.renderPinnedBanner(scroll, ac);
    visibleMsgs.forEach(function (m) {
      scroll.appendChild(buildMessageRow(m, ac));
    });
    CommunicationState._renderedMsgIds = visibleMsgs.map(function (m) {
      return m.id;
    });
    updateTypingLineOnly();
    if (stickBottom) {
      scroll.scrollTop = scroll.scrollHeight;
    }
    if (CommunicationState.highlightMessageId) {
      window.requestAnimationFrame(scrollToHighlightedMessage);
    }
    if (root.Ce2AudioPlayback) {
      root.Ce2AudioPlayback.syncAll();
    }
    if (root.Ce2MediaView && root.Ce2MediaView.afterMessagePanelRender) {
      root.Ce2MediaView.afterMessagePanelRender(scroll);
    }
  }

  function render(opts) {
    opts = opts || {};
    var shell = el('ce2App');
    if (shell) shell.classList.toggle('is-booting', !!CommunicationState.loading);
    if (opts.threadOnly) {
      renderThreadChrome();
      renderMessagePanel();
      updateComposerState();
      updateAttachPreview();
      syncReplyBanner();
      syncAttachInputState();
      syncCe2FocusableInputs();
      syncComposerAlert();
      return;
    }
    syncComposerAlert();
    updateComposerState();
    if (CommunicationState.me) updateDiscoveryTabs(CommunicationState.me);
    updateAttachPreview();
    syncReplyBanner();
    syncAttachInputState();
    renderSidebarLists();
    renderThreadChrome();
    renderMessagePanel();
    syncCe2FocusableInputs();
    applyPresenceUi();
  }


  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function appendMessageVideo(bubble, m) {
    if (root.Ce2MediaView && root.Ce2MediaView.appendChatVideo) {
      root.Ce2MediaView.appendChatVideo(bubble, m);
      return;
    }
    if (!bubble || !m || !m.videoUrl) return;
    var wrap = document.createElement('div');
    wrap.className = 'ce2-msg-video-wrap';
    var vid = document.createElement('video');
    vid.className = 'ce2-msg-video';
    vid.controls = true;
    vid.preload = 'none';
    vid.playsInline = true;
    vid.setAttribute('playsinline', '');
    if (m.videoPosterUrl) vid.poster = m.videoPosterUrl;
    wrap.appendChild(vid);
    bubble.appendChild(wrap);
  }

  function appendMessageImage(bubble, m) {
    if (root.Ce2MediaView && root.Ce2MediaView.appendChatImage) {
      root.Ce2MediaView.appendChatImage(bubble, m);
      return;
    }
    if (!bubble || !m || !m.imageUrl) return;
    var img = document.createElement('img');
    img.className = 'ce2-msg-image';
    img.alt = 'Attachment';
    img.loading = 'lazy';
    if (m.imageThumbUrl) img.src = m.imageThumbUrl;
    img.dataset.fullUrl = m.imageUrl;
    bubble.appendChild(img);
  }

  function appendMessageBody(bubble, m) {
    if (m.deleted) {
      var removed = document.createElement('p');
      removed.className = 'ce2-msg-removed';
      removed.textContent = 'Message removed';
      bubble.appendChild(removed);
      return;
    }
    var rm = replyModule();
    var sh = share();
    var lk = links();
    if (m.replyTo && rm) {
      bubble.insertAdjacentHTML('beforeend', rm.renderReplyQuoteHtml(m.replyTo, escapeHtml));
    }
    if (m.messageType === 'board_share' && m.boardShare && sh) {
      bubble.insertAdjacentHTML(
        'beforeend',
        sh.renderBoardShareHtml(m, escapeHtml, CommunicationState.activeConversation)
      );
      return;
    }
    if (m.imageUrl) {
      appendMessageImage(bubble, m);
    }
    if (m.videoUrl) {
      appendMessageVideo(bubble, m);
    }
    if (m.messageType === 'voice' || m.audioUrl || m._localAudioUrl) {
      var audioWrap = document.createElement('div');
      audioWrap.className = 'ce2-msg-audio-wrap';
      var playSrc = m.audioUrl || m._localAudioUrl;
      var canPlayVoice =
        playSrc && m.uploadState !== 'uploading' && m.uploadState !== 'retrying';
      if (canPlayVoice) {
        var playback = root.Ce2AudioPlayback;
        var voiceMsgId = m.id || m._voiceLocalId;
        if (playback && voiceMsgId) {
          playback.attachBubble(audioWrap, {
            id: voiceMsgId,
            url: playSrc,
            durationMs: m.audioDurationMs || m.durationMs || 0,
            mime: m.audioMime,
            peaks: m.audioWaveformPeaks,
          });
        } else {
          var aud = document.createElement('audio');
          aud.className = 'ce2-msg-audio';
          aud.preload = 'metadata';
          aud.controls = true;
          aud.src = playSrc;
          audioWrap.appendChild(aud);
        }
      }
      if (m.uploadState === 'uploading' || m.uploadState === 'retrying') {
        var pct = Math.round((m.uploadProgress || 0) * 100);
        var prog = document.createElement('div');
        prog.className = 'ce2-voice-upload-progress';
        prog.innerHTML =
          '<span class="ce2-voice-upload-bar" style="width:' + pct + '%"></span>';
        audioWrap.appendChild(prog);
        var uplbl = document.createElement('p');
        uplbl.className = 'ce2-voice-upload-label';
        uplbl.textContent =
          (m.uploadState === 'retrying' ? 'Retrying… ' : 'Uploading… ') + pct + '%';
        audioWrap.appendChild(uplbl);
      }
      if (m.uploadState === 'failed' && m._voiceLocalId) {
        var actions = document.createElement('div');
        actions.className = 'ce2-voice-failed-actions';
        actions.innerHTML =
          '<button type="button" class="ce2-voice-retry" data-voice-local-id="' +
          escapeHtml(m._voiceLocalId) +
          '">Retry</button>' +
          '<button type="button" class="ce2-voice-discard" data-voice-local-id="' +
          escapeHtml(m._voiceLocalId) +
          '">Discard</button>';
        audioWrap.appendChild(actions);
      }
      bubble.appendChild(audioWrap);
    }
    var text = m.content || '';
    if (
      text &&
      !(
        m.messageType === 'voice' &&
        text === 'Voice message' &&
        (m.audioUrl || m._localAudioUrl)
      )
    ) {
      var para = document.createElement('div');
      para.className = 'ce2-msg-text';
      var html = escapeHtml(text);
      if (root.Ce2Format && root.Ce2Format.formatMessageHtml) {
        html = root.Ce2Format.formatMessageHtml(html);
      }
      if (lk && lk.linkifyHtml) {
        para.innerHTML = lk.linkifyHtml(html);
      } else {
        para.innerHTML = html;
      }
      bubble.appendChild(para);
    }
  }

  function clearComposerPending() {
    clearComposerSlot(getComposerSlot());
    var preview = el('ce2AttachPreview');
    if (preview) {
      preview.hidden = true;
      preview.innerHTML = '';
    }
    setAttachStatus('', '');
  }

  function updateAttachPreview() {
    var preview = el('ce2AttachPreview');
    if (!preview) return;
    syncGlobalsFromComposerSlot();
    var slot = getComposerSlot();
    var list = slot ? composerMediaList(slot) : [];
    var hasQueue = slot && (slot.attachQueue.length || slot.uploading);
    if (!slot || (!list.length && !slot.localPreviewUrl && !hasQueue)) {
      preview.hidden = true;
      preview.innerHTML = '';
      return;
    }
    preview.hidden = false;
    var html = '<div class="ce2-attach-grid">';
    list.forEach(function (pm, idx) {
      var src = pm.url || '';
      var kind = pm.kind || 'image';
      var thumbSrc = pm.thumbUrl || pm.posterUrl || '';
      var cell =
        kind === 'video'
          ? thumbSrc
            ? '<img src="' +
              escapeHtml(thumbSrc) +
              '" alt="" class="ce2-attach-thumb-img ce2-attach-thumb-vid-poster">'
            : '<span class="ce2-attach-thumb-vid-ph">Video</span>'
          : kind === 'audio'
            ? '<span class="ce2-attach-thumb-aud">🎙</span>'
            : thumbSrc
              ? '<img src="' + escapeHtml(thumbSrc) + '" alt="" class="ce2-attach-thumb-img">'
              : '<img src="' + escapeHtml(src) + '" alt="" class="ce2-attach-thumb-img">';
      html +=
        '<div class="ce2-attach-cell">' +
        cell +
        '<button type="button" class="ce2-attach-cell-remove" data-attach-idx="' +
        idx +
        '" aria-label="Remove">×</button></div>';
    });
    if (slot.uploading && slot.localPreviewUrl) {
      var pct = Math.round((slot.uploadProgress || 0) * 100);
      var uploadLabel = slot.uploadFinalizing ? 'Finalizing…' : pct + '%';
      var attMod = attachments();
      var uploadingVideo =
        slot.localFile && attMod && attMod.isVideoFile && attMod.isVideoFile(slot.localFile);
      var uploadingCell =
        uploadingVideo
          ? '<span class="ce2-attach-thumb-vid-ph">Video…</span>'
          : '<img src="' +
            escapeHtml(slot.localPreviewUrl) +
            '" alt="" class="ce2-attach-thumb-img">';
      html +=
        '<div class="ce2-attach-cell ce2-attach-cell-uploading">' +
        uploadingCell +
        '<span class="ce2-attach-pct">' +
        uploadLabel +
        '</span></div>';
    }
    html += '</div>';
    if (slot.attachQueue.length) {
      html +=
        '<p class="ce2-attach-queue-hint">' +
        (slot.attachQueue.length + (slot.uploading ? 1 : 0)) +
        ' in queue…</p>';
    }
    html +=
      '<div class="ce2-attach-preview-actions">' +
      '<button type="button" class="ce2-attach-clear" id="ce2AttachClear" aria-label="Remove all">Clear all</button>' +
      (slot.uploading
        ? '<button type="button" class="ce2-attach-cancel" id="ce2AttachCancel" aria-label="Cancel upload">Cancel</button>'
        : '') +
      '</div>';
    preview.innerHTML = html;
    preview.querySelectorAll('.ce2-attach-cell-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.getAttribute('data-attach-idx'), 10);
        if (!isNaN(i)) removeComposerAttachment(i);
      });
    });
    var clr = el('ce2AttachClear');
    if (clr) {
      clr.addEventListener('click', function () {
        clearComposerPending();
        render();
      });
    }
    var cancelBtn = el('ce2AttachCancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        if (slot.uploadAbort) {
          try { slot.uploadAbort.abort(); } catch (_) {}
        }
        slot.attachQueue = [];
        slot.uploading = false;
        slot.pendingSendAfterUpload = false;
        updateAttachPreview();
        render();
      });
    }
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

  function showAlert(message, kind) {
    var banner = el('ce2Alert');
    if (!banner) return;
    if (!message) {
      banner.className = 'ce2-alert ce2-alert-hidden';
      banner.textContent = '';
      return;
    }
    banner.className = 'ce2-alert' + (kind === 'ok' ? ' ce2-alert-ok' : '');
    banner.textContent = message;
  }

  function syncComposerAlert() {
    if (CommunicationState.error) {
      showAlert(CommunicationState.error, 'err');
    } else if (CommunicationState.statusMessage) {
      showAlert(CommunicationState.statusMessage, 'ok');
    } else {
      showAlert('', '');
    }
  }

  function setAttachStatus(message, kind) {
    var node = el('ce2AttachStatus');
    if (!node) return;
    if (!message) {
      node.hidden = true;
      node.textContent = '';
      node.className = 'ce2-attach-status';
      return;
    }
    node.hidden = false;
    node.textContent = message;
    node.className =
      'ce2-attach-status' + (kind === 'ok' ? ' ce2-attach-status--ok' : ' ce2-attach-status--err');
  }

  function surfaceComposerError(message) {
    CommunicationState.statusMessage = null;
    CommunicationState.error = message || 'Something went wrong.';
    setAttachStatus(message || 'Something went wrong.', 'err');
    syncComposerAlert();
  }

  function syncAttachInputState() {
    var wrap = el('ce2AttachWrap');
    var input = el('ce2AttachInput');
    if (!wrap || !input) return;
    var ac = CommunicationState.activeConversation;
    var enabled = !!(ac && !ac.needsJoin);
    wrap.classList.toggle('is-disabled', !enabled);
    input.disabled = !enabled;
    if (!enabled) {
      input.value = '';
    }
  }

  function ce2PermissionHint(err, context) {
    if (!err || err.code !== 'permission-denied') return null;
    if (isMessagingSuspended()) {
      return 'Messaging is paused for your account. Contact an administrator.';
    }
    if (context === 'edit') {
      return (
        'Edit was not saved. You can edit your own text messages within 1 hour of sending ' +
        '(admins can edit their own messages anytime).'
      );
    }
    if (context === 'direct' || context === 'send') {
      return (
        'Cannot send in this direct thread. If messaging was suspended for your account, ask an administrator to restore it in Admin → Messages V2. ' +
        'Otherwise refresh the page and try again — if it persists, contact support with your account email.'
      );
    }
    if (context === 'join') {
      return (
        'Could not join this group. Ask an admin to add you under Admin → Messages V2 → Manage members, and confirm your profile tier matches the group (e.g. elite for Elite groups).'
      );
    }
    if (context === 'group') {
      return (
        'Message was not saved. Join the group first (Join button if shown), open the composer drawer and set classification to Elite or lower, or ask an admin to confirm your profile tier matches this group.'
      );
    }
    if (context === 'messages' || context === 'group') {
      return (
        'Cannot load messages for this thread. Join the formation group first, or ask an admin to add you under Admin → Messages V2 → Manage members.'
      );
    }
    if (context === 'boot') {
      return 'Could not load your messenger profile. Sign out and back in, or ask an admin to confirm your users/{uid} document exists with role and tier.';
    }
    return null;
  }

  function handleCe2Error(err, context) {
    console.error('[CE2]', context || 'error', err);
    CommunicationState.statusMessage = null;
    CommunicationState.error =
      ce2PermissionHint(err, context) ||
      (err && err.message) ||
      'Request failed — check tier, group membership, or Firestore rules.';
    syncComposerAlert();
    render();
  }

  function isMessagingSuspended() {
    var me = CommunicationState.me;
    if (me && me.isAdmin) return false;
    var m = mod();
    if (!me) return false;
    if (m && typeof m.isMessagingEnabled === 'function') {
      return !m.isMessagingEnabled({ messagingEnabled: me.messagingEnabled });
    }
    return me.messagingEnabled === false;
  }

  function updateComposerState() {
    var sendBtn = el('ce2SendBtn');
    var input = el('ce2Input');
    var ac = CommunicationState.activeConversation;
    var suspended = isMessagingSuspended();
    if (!sendBtn) return;
    var peerBlocked =
      ac && ac.type === 'direct' && ac.otherUid && isUserBlockedUid(ac.otherUid);
    var blocked =
      !ac ||
      (ac.type === 'group' && ac.needsJoin) ||
      CommunicationState.sending ||
      suspended ||
      peerBlocked;
    sendBtn.disabled = blocked;
    if (input) input.disabled = suspended || peerBlocked;
    sendBtn.title = suspended
      ? 'Messaging is paused for your account. Contact support.'
      : peerBlocked
        ? 'You blocked this contact. Unblock from message menu → Safety.'
        : blocked
          ? 'Select a thread and join the group first (tap Join selected group).'
          : 'Send message';
    syncClassificationSelect(ac);
  }

  function stopMessagesWatch() {
    if (root.Ce2AudioPlayback) {
      root.Ce2AudioPlayback.stop();
    }
    stopConvMetaWatch();
    stopMessengerNotifWatch();
    if (messagesUnsub) {
      messagesUnsub();
      messagesUnsub = null;
    }
    CommunicationState.pendingMessages = [];
    CommunicationState.lastServerMessages = [];
    CommunicationState.messages = [];
    CommunicationState.hasMoreMessages = false;
    CommunicationState.oldestMessageDoc = null;
    CommunicationState._renderedMsgIds = null;
    CommunicationState._metaLastMessageId = null;
    CommunicationState.searchJumpMessages = null;
    CommunicationState.searchJumpOldestDoc = null;
    CommunicationState.searchJumpHasMore = false;
    clearReply();
  }

  function attachMessagesListener(messagesCol) {
    var ac = CommunicationState.activeConversation;
    var errContext = ac && ac.type === 'group' ? 'group' : 'messages';
    var firstSnap = true;
    messagesUnsub = messagesCol
      .orderBy('createdAt', 'asc')
      .limitToLast(MESSAGE_PAGE)
      .onSnapshot(
        function (snap) {
          var me = CommunicationState.me;
          if (!firstSnap && me && ac && !CE2_DELIVERY_EXPERIMENTAL) {
            snap.docChanges().forEach(function (change) {
              if (change.type !== 'added') return;
              var data = change.doc.data();
              if (!data.senderId || data.senderId === me.uid) return;
              var msgId = change.doc.id;
              if (isMessageAlreadyRendered(msgId)) return;
              CommunicationState._metaLastMessageId = msgId;
              dropTypist(data.senderId);
              var msg = Object.assign({ id: msgId }, data);
              mergeMessageIntoState(msg);
              forceAppendIncomingMessage(msg, ac, true);
            });
          }
          if (firstSnap && snap.docs.length) {
            CommunicationState._metaLastMessageId = snap.docs[snap.docs.length - 1].id;
          }
          firstSnap = false;

          CommunicationState.hasMoreMessages = snap.docs.length >= MESSAGE_PAGE;
          if (snap.docs.length) {
            CommunicationState.oldestMessageDoc = snap.docs[0];
          }
          CommunicationState.lastServerMessages = snap.docs.map(function (d) {
            return Object.assign({ id: d.id }, d.data());
          });
          CommunicationState.messages = mergeServerAndPending(
            CommunicationState.lastServerMessages
          );
          (CommunicationState.lastServerMessages || []).forEach(function (m) {
            reconcileRenderedMessage(m, ac);
          });
          if (firstSnap || !CE2_DELIVERY_EXPERIMENTAL) {
            syncMessagePanelFromSnap(ac);
          }
        },
        function (err) {
          stopMessagesWatch();
          if (ac && ac.type === 'group') {
            CommunicationState.activeConversation = Object.assign({}, ac, { needsJoin: true });
            CommunicationState.messages = [];
          }
          handleCe2Error(err, errContext);
        }
      );
  }

  async function loadOlderMessages(opts) {
    opts = opts || {};
    var ac = CommunicationState.activeConversation;
    var me = CommunicationState.me;
    var jumping = !!(
      CommunicationState.searchJumpMessages &&
      CommunicationState.searchJumpMessages.length
    );
    if (!ac || !me || CommunicationState.loadingOlder) {
      return;
    }
    if (!jumping && !CommunicationState.messages.length) {
      return;
    }
    var oldest = jumping
      ? CommunicationState.searchJumpOldestDoc
      : CommunicationState.oldestMessageDoc;
    if (!oldest) return;
    CommunicationState.loadingOlder = true;
    if (!opts.quiet) render();
    try {
      var col = messagesCollection(ac);
      if (!col) return;
      var snap = await col
        .orderBy('createdAt', 'asc')
        .endBefore(oldest)
        .limitToLast(MESSAGE_PAGE)
        .get();
      if (!snap.docs.length) {
        if (jumping) CommunicationState.searchJumpHasMore = false;
        else CommunicationState.hasMoreMessages = false;
        return;
      }
      var older = snap.docs.map(function (d) {
        return Object.assign({ id: d.id }, d.data());
      });
      if (jumping) {
        CommunicationState.searchJumpOldestDoc = snap.docs[0];
        CommunicationState.searchJumpHasMore = snap.docs.length >= MESSAGE_PAGE;
        CommunicationState.searchJumpMessages = older.concat(
          CommunicationState.searchJumpMessages
        );
      } else {
        CommunicationState.oldestMessageDoc = snap.docs[0];
        CommunicationState.hasMoreMessages = snap.docs.length >= MESSAGE_PAGE;
        CommunicationState.lastServerMessages = older.concat(
          CommunicationState.lastServerMessages
        );
        CommunicationState.messages = mergeServerAndPending(
          CommunicationState.lastServerMessages
        );
      }
    } catch (err) {
      handleCe2Error(err);
    } finally {
      CommunicationState.loadingOlder = false;
      if (!opts.skipRender) requestRender();
    }
  }

  async function isGroupMember(groupId) {
    var me = CommunicationState.me;
    if (!me || !groupId) return false;
    var snap = await db
      .collection('communicationGroups')
      .doc(groupId)
      .collection('members')
      .doc(me.uid)
      .get();
    return snap.exists;
  }

  function selectGroupOnly(groupId, name) {
    persistActiveComposerDraft();
    stopMessagesWatch();
    CommunicationState.messages = [];
    CommunicationState.activeGroup = groupId;
    CommunicationState.activeConversation = {
      type: 'group',
      id: groupId,
      title: name || 'Group',
      sub: 'communicationGroups/' + groupId,
      needsJoin: true,
    };
    isGroupMember(groupId).then(function (joined) {
      if (joined) {
        openGroupThread(groupId, name).catch(handleCe2Error);
      } else {
        render();
      }
    }).catch(handleCe2Error);
  }

  async function openDirectThread(convId, otherUid, label) {
    persistActiveComposerDraft();
    var openToken = bumpThreadOpenToken();
    stopMessagesWatch();
    CommunicationState.activeGroup = null;
    CommunicationState.sending = false;

    var me = CommunicationState.me;
    if (!me) {
      throw new Error('Not signed in.');
    }

    if (!otherUid && convId) {
      try {
        var convSnap = await db.collection('ce2_conversations').doc(convId).get();
        if (convSnap.exists) {
          otherUid = (convSnap.data().participantIds || []).filter(function (p) {
            return p !== me.uid;
          })[0];
        }
      } catch (_) {}
    }

    if (!otherUid) {
      throw new Error('Invalid recipient — open them again from Discovery.');
    }

    if (isUserBlockedUid(otherUid)) {
      throw new Error(
        'You blocked this contact. Long-press any message → Safety → Unblock contact to message again.'
      );
    }

    var readyId = directConvId(me.uid, otherUid);
    var convRef = db.collection('ce2_conversations').doc(readyId);
    var snap = await convRef.get();
    if (!snap.exists) {
      readyId = await ensureDirectConv(otherUid);
      snap = await convRef.get();
    }
    if (openToken !== CommunicationState._openToken) return;

    var security = null;
    var storedLevel = -1;
    if (snap.exists) {
      var cdata = snap.data();
      if (typeof cdata.securityLevel === 'number') {
        storedLevel = cdata.securityLevel;
        security = { tier: cdata.securityTier || 'foundation', level: cdata.securityLevel };
      }
    }
    var liveSecurity = await resolveDirectSecurity(otherUid);
    if (openToken !== CommunicationState._openToken) return;
    var gRaise = gov();
    if (
      liveSecurity &&
      gRaise &&
      gRaise.shouldRaiseConversationSecurity &&
      gRaise.shouldRaiseConversationSecurity(storedLevel, liveSecurity.level)
    ) {
      security = liveSecurity;
      convRef
        .set(
          { securityTier: liveSecurity.tier, securityLevel: liveSecurity.level },
          { merge: true }
        )
        .catch(function (secErr) {
          console.warn('[CE2] raise conversation security', secErr);
        });
    } else if (!security) {
      security = liveSecurity || (await loadConversationSecurity(readyId));
    }
    if (openToken !== CommunicationState._openToken) return;

    CommunicationState.activeConversation = {
      type: 'direct',
      id: readyId,
      otherUid: otherUid,
      title: label || 'Direct',
      sub: '',
      needsJoin: false,
      convReady: true,
    };
    applySecurityToActiveConversation(security);
    CommunicationState.error = null;
    CommunicationState.selectedDiscoveryUid = otherUid;

    attachMessagesListener(
      db.collection('ce2_conversations').doc(readyId).collection('ce2_messages')
    );
    watchConvMeta(CommunicationState.activeConversation);
    markThreadReadOnce(CommunicationState.activeConversation);
    syncGlobalsFromComposerSlot();
    updateAttachPreview();
    restoreComposerDraft(CommunicationState.activeConversation);
    syncCe2ThreadUrl(CommunicationState.activeConversation);
    syncPresenceWatches();
    render();
  }

  async function openGroupThread(groupId, name) {
    persistActiveComposerDraft();
    var openToken = bumpThreadOpenToken();
    stopMessagesWatch();
    CommunicationState.activeGroup = groupId;
    CommunicationState.sending = false;

    var joined = await isGroupMember(groupId);
    if (!joined) {
      CommunicationState.messages = [];
      CommunicationState.activeConversation = {
        type: 'group',
        id: groupId,
        title: name || 'Group',
        sub: 'communicationGroups/' + groupId,
        needsJoin: true,
      };
      render();
      return;
    }

    var groupMeta = CommunicationState.visibleGroups.find(function (g) {
      return g.id === groupId;
    });
    CommunicationState.activeConversation = {
      type: 'group',
      id: groupId,
      title: name || 'Group',
      sub: '',
      needsJoin: false,
    };
    var gSec = null;
    var g = gov();
    var moderation = mod();
    if (
      governanceEnabled() &&
      g &&
      moderation &&
      typeof moderation.resolveGroupSecurityFromMembers === 'function'
    ) {
      gSec = await moderation.resolveGroupSecurityFromMembers(
        db,
        groupId,
        groupMeta ? groupMeta.requiredTier : 'foundation',
        g
      );
    } else if (governanceEnabled() && g) {
      gSec = g.groupSecurityFromRequiredTier(
        groupMeta ? groupMeta.requiredTier : 'foundation'
      );
    }
    applySecurityToActiveConversation(gSec);
    CommunicationState.error = null;

    if (openToken !== CommunicationState._openToken) return;

    CommunicationState.memberIds = await loadGroupMemberIds(groupId);
    if (openToken !== CommunicationState._openToken) return;

    attachMessagesListener(
      db.collection('communicationGroups').doc(groupId).collection('ce2_messages')
    );
    watchConvMeta(CommunicationState.activeConversation);
    markThreadReadOnce(CommunicationState.activeConversation);
    syncGlobalsFromComposerSlot();
    updateAttachPreview();
    restoreComposerDraft(CommunicationState.activeConversation);
    syncCe2ThreadUrl(CommunicationState.activeConversation);
    syncPresenceWatches();
    render();
  }

  async function loadGroupsForUser(u) {
    const rank = tierRank(u);
    const g = gov();
    const allowedTiers =
      g && g.tiersAtOrBelowRank ? g.tiersAtOrBelowRank(rank) : ['foundation'];
    if (allowedTiers.indexOf('free') < 0 && allowedTiers.indexOf('foundation') >= 0) {
      allowedTiers.push('free');
    }
    if (!allowedTiers.length) allowedTiers.push('foundation');

    try {
      var snap;
      if (u.isAdmin) {
        snap = await db.collection('communicationGroups').limit(40).get();
      } else {
        snap = await db
          .collection('communicationGroups')
          .where('requiredTier', 'in', allowedTiers)
          .limit(40)
          .get();
      }
      var rc = receipts();
      var ib = inbox();
      var uid = u.uid;
      CommunicationState.visibleGroups = snap.docs
        .map(function (d) {
          const x = d.data();
          var preview = formatInboxPreview({
            lastPreview: x.lastPreview,
            lastMessageType: x.lastMessageType,
            content: x.lastPreview,
            lastSenderId: x.lastSenderId,
          });
          var row = {
            id: d.id,
            name: x.name || 'Group',
            requiredTier: normalizeTier(x.requiredTier),
            mentorLed: !!x.mentorLed,
            allowCrossTier: !!x.allowCrossTier,
            unread: rc ? rc.unreadCount(x, uid) : 0,
            lastPreview: preview,
            lastActivityAt: ib ? ib.tsMs(x.lastMessageAt) : 0,
            lastSenderId: x.lastSenderId || '',
          };
          applyInboxPrefToRow(row, 'group', x.lastSenderId);
          if (ib && rc) ib.mergeUnreadFromMeta(row, x, uid, rc.unreadCount);
          return row;
        });
      sortVisibleInboxLists();
    } catch (err) {
      console.warn('loadGroupsForUser', err);
      CommunicationState.visibleGroups = [];
      if (err && err.code === 'failed-precondition') {
        CommunicationState.error =
          'Formation groups index is still building. Refresh in a minute.';
      }
    }
  }

  async function loadThreads(uid) {
    let snap = await db
      .collection('ce2_conversations')
      .where('participantIds', 'array-contains', uid)
      .orderBy('lastMessageAt', 'desc')
      .limit(30)
      .get()
      .catch(function (err) {
        console.warn('loadThreads (ordered)', err);
        return null;
      });

    if (!snap) {
      snap = await db
        .collection('ce2_conversations')
        .where('participantIds', 'array-contains', uid)
        .limit(30)
        .get()
        .catch(function (err) {
          console.warn('loadThreads', err);
          return null;
        });
    }

    if (!snap) {
      CommunicationState.threads = [];
      if (!CommunicationState.error) {
        CommunicationState.error =
          'Could not load conversations. Check connection or refresh the page.';
      }
      return;
    }

    var rows = [];
    var otherUidSet = {};
    for (var i = 0; i < snap.docs.length; i++) {
      var d = snap.docs[i];
      var data = d.data();
      var other = (data.participantIds || []).filter(function (p) {
        return p !== uid;
      })[0];
      if (other && isUserBlockedUid(other)) continue;
      if (other) otherUidSet[other] = true;
      rows.push({ doc: d, data: data, other: other });
    }

    var otherUids = Object.keys(otherUidSet);
    var userMap = {};
    await Promise.all(
      otherUids.map(function (other) {
        return db
          .collection('users')
          .doc(other)
          .get()
          .then(function (udoc) {
            if (udoc.exists) userMap[other] = normalizeCe2User(other, udoc.data());
            ingestPresenceFromUser(other, udoc.exists ? udoc.data() : {});
          })
          .catch(function () {});
      })
    );

    var rc = receipts();
    var ib = inbox();
    var existingById = {};
    (CommunicationState.threads || []).forEach(function (t) {
      existingById[t.id] = t;
    });
    var nextThreads = [];
    for (var j = 0; j < rows.length; j++) {
      var row = rows[j];
      var otherUid = row.other;
      var peerUser = otherUid ? userMap[otherUid] : null;
      var label = otherUid
        ? (peerUser && peerUser.name) || otherUid.slice(0, 8) + '…'
        : 'Direct';
      var preview = formatInboxPreview({
        lastPreview: row.data.lastPreview,
        lastMessageType: row.data.lastMessageType,
        content: row.data.lastPreview,
        lastSenderId: row.data.lastSenderId,
      });
      var prev = existingById[row.doc.id];
      var thread = {
        id: row.doc.id,
        convId: row.doc.id,
        otherUid: otherUid,
        label: label,
        tier: peerUser ? peerUser.tier : 'foundation',
        peerUser: peerUser,
        sub: preview || fmtTime(row.data.lastMessageAt) || '',
        unread: rc ? rc.unreadCount(row.data, uid) : 0,
        lastActivityAt: ib ? ib.tsMs(row.data.lastMessageAt) : 0,
        lastSenderId: row.data.lastSenderId || '',
        _localReadAt: prev && prev._localReadAt ? prev._localReadAt : 0,
      };
      applyInboxPrefToRow(thread, 'direct', row.data.lastSenderId);
      if (ib && rc) ib.mergeUnreadFromMeta(thread, row.data, uid, rc.unreadCount);
      nextThreads.push(thread);
    }
    CommunicationState.threads = nextThreads;
    sortVisibleInboxLists();
    syncPresenceWatches();
  }

  async function loadSavedItems(uid) {
    CommunicationState.savedItems = [];
    try {
      var snap = await db
        .collection('users')
        .doc(uid)
        .collection('ce2_saved')
        .orderBy('savedAt', 'desc')
        .limit(80)
        .get();
      snap.forEach(function (doc) {
        var d = doc.data();
        CommunicationState.savedItems.push({
          id: doc.id,
          messageId: d.messageId || doc.id,
          conversationId: d.conversationId,
          conversationType: d.conversationType || 'direct',
          preview: d.preview || '',
          savedAt: d.savedAt,
        });
      });
    } catch (e) {
      console.warn('loadSavedItems', e);
    }
  }

  function scrollToHighlightedMessage() {
    var id = CommunicationState.highlightMessageId;
    if (!id) return;
    var scroll = el('ce2MessageScroll');
    if (!scroll) return;
    var row = scroll.querySelector('[data-message-id="' + id + '"]');
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(function () {
      CommunicationState.highlightMessageId = null;
    }, 4000);
  }

  async function applyCe2EntryParams(uid) {
    var q;
    try {
      q = new URLSearchParams(window.location.search);
    } catch (_) {
      return;
    }
    var peerUid = q.get('uid');
    var conv = q.get('conv');
    var msg = q.get('msg');
    if (msg) CommunicationState.highlightMessageId = msg;
    var shareTitle = q.get('title') || '';
    var shareText = q.get('text') || '';
    var shareUrl = q.get('url') || '';
    var sharePrefill = [shareTitle, shareText, shareUrl].filter(Boolean).join('\n').trim();

    if (peerUid) {
      if (sharePrefill) {
        CommunicationState.shareDraft = sharePrefill;
      }
      var peerDoc = await db.collection('users').doc(peerUid).get();
      var peer = normalizeCe2User(
        peerUid,
        peerDoc.exists ? peerDoc.data() : { name: 'Member' }
      );
      if (canCommunicate(CommunicationState.me, peer)) {
        await openDirectThread(directConvId(uid, peerUid), peerUid, peer.name);
      }
      return;
    }

    if (sharePrefill) {
      CommunicationState.shareDraft = sharePrefill;
      CommunicationState.mobileHubPanel = 'discover';
      var shareInput = el('ce2Input');
      if (shareInput && sharePrefill) {
        shareInput.value = sharePrefill.slice(0, 4000);
        syncCe2ComposerInputHeight(shareInput);
      }
      CommunicationState.statusMessage = 'Shared content ready — pick a thread and send.';
      return;
    }
    var groupId = q.get('group');
    if (groupId) {
      var gmeta = (CommunicationState.visibleGroups || []).find(function (g) {
        return g.id === groupId;
      });
      await openGroupThread(groupId, gmeta ? gmeta.name : 'Group');
      return;
    }
    if (!conv) return;
    var thread = (CommunicationState.threads || []).find(function (t) {
      return t.id === conv;
    });
    if (thread) {
      await openDirectThread(conv, thread.otherUid, thread.label);
      return;
    }
    var csnap = await db.collection('ce2_conversations').doc(conv).get();
    if (!csnap.exists) return;
    var data = csnap.data();
    var other = (data.participantIds || []).filter(function (p) {
      return p !== uid;
    })[0];
    if (other) await openDirectThread(conv, other, 'Conversation');
  }

  function ensureDiscoveryLoaded(forceReload) {
    var me = CommunicationState.me;
    if (!me) return Promise.resolve();
    if (CommunicationState.discoveryLoaded && !forceReload) return Promise.resolve();
    return loadDiscovery(me)
      .then(function () {
        CommunicationState.discoveryLoaded = true;
      })
      .catch(function () {
        CommunicationState.discoveryLoaded = true;
      });
  }

  function reloadDiscoveryForActiveTab() {
    var me = CommunicationState.me;
    if (!me) return Promise.resolve();
    return loadDiscovery(me).then(function () {
      CommunicationState.discoveryLoaded = true;
    });
  }

  async function loadDiscovery(u) {
    CommunicationState.visibleUsers = [];
    try {
    if (CommunicationState.discoveryMode === 'mentees') {
      (CommunicationState.threads || []).forEach(function (t) {
        if (!t.otherUid || isUserBlockedUid(t.otherUid)) return;
        CommunicationState.visibleUsers.push(
          normalizeCe2User(t.otherUid, { name: t.label, tier: t.tier || 'foundation' })
        );
      });
      return;
    }
    if (CommunicationState.discoveryMode === 'mentors') {
      const q = await db.collection('users').where('mentor', '==', true).limit(25).get();
      q.forEach(function (doc) {
        if (doc.id === u.uid && !u.mentor) return;
        var nu = normalizeCe2User(doc.id, doc.data());
        if (!canCommunicate(u, nu) && doc.id !== u.uid) return;
        if (isUserBlockedUid(doc.id)) return;
        CommunicationState.visibleUsers.push(nu);
      });
      return;
    }

    if (CommunicationState.discoveryMode === 'lower') {
      var lowerTiers = lowerTierQueriesForUser(u);
      if (!lowerTiers.length) return;
      var qLowerDocs = await queryUsersMatchingTiers(lowerTiers, 50);
      qLowerDocs.forEach(function (doc) {
        if (doc.id === u.uid) return;
        var nu = normalizeCe2User(doc.id, doc.data());
        if (!canCommunicate(u, nu)) return;
        if (isUserBlockedUid(doc.id)) return;
        if (formationTierRank(nu) >= formationTierRank(u) && !nu.mentor) return;
        CommunicationState.visibleUsers.push(nu);
      });
      CommunicationState.visibleUsers.sort(function (a, b) {
        return formationTierRank(a) - formationTierRank(b) || (a.name || '').localeCompare(b.name || '');
      });
      return;
    }

    var tierQueries = peerTierQueriesForUser(u);
    var q2docs = await queryUsersMatchingTiers(tierQueries, 40);
    var myPeerTier = normalizeTier(u.tier);
    q2docs.forEach(function (doc) {
      if (doc.id === u.uid) return;
      var nu = normalizeCe2User(doc.id, doc.data());
      if (normalizeTier(nu.tier) !== myPeerTier) return;
      if (!canCommunicate(u, nu)) return;
      if (isUserBlockedUid(doc.id)) return;
      CommunicationState.visibleUsers.push(nu);
    });
    } catch (err) {
      console.warn('loadDiscovery', err);
    } finally {
      (CommunicationState.visibleUsers || []).forEach(function (nu) {
        if (nu && nu.uid) ingestPresenceFromUser(nu.uid, nu.raw || {});
      });
      syncPresenceWatches();
    }
  }

  async function resolveDirectSecurity(otherUid) {
    const me = CommunicationState.me;
    var otherDoc = await db.collection('users').doc(otherUid).get();
    var other = normalizeCe2User(otherUid, otherDoc.exists ? otherDoc.data() : {});
    var g = gov();
    if (governanceEnabled() && g) {
      return g.calculateConversationSecurityLevel([
        { tier: me.tier },
        { tier: other.tier },
      ]);
    }
    return null;
  }

  async function ensureDirectConv(otherUid) {
    const me = CommunicationState.me;
    const convId = directConvId(me.uid, otherUid);
    var ref = db.collection('ce2_conversations').doc(convId);
    var snap = await ref.get();
    if (snap.exists) return convId;

    var security = await resolveDirectSecurity(otherUid);
    var sorted = [me.uid, otherUid].sort();
    var now = firebase.firestore.Timestamp.now();

    var createPayload = {
      participantIds: sorted,
      type: 'direct',
      createdAt: now,
      lastMessageAt: now,
      lastPreview: '',
    };
    if (security) {
      createPayload.securityTier = security.tier;
      createPayload.securityLevel = security.level;
    }
    await ref.set(createPayload);
    return convId;
  }

  async function loadConversationSecurity(convId, fallbackGroupTier) {
    if (!convId) return null;
    if (fallbackGroupTier !== undefined) {
      var g = gov();
      if (governanceEnabled() && g) {
        return g.groupSecurityFromRequiredTier(fallbackGroupTier);
      }
      return null;
    }
    var snap = await db.collection('ce2_conversations').doc(convId).get();
    if (!snap.exists) return await resolveDirectSecurity(
      CommunicationState.activeConversation && CommunicationState.activeConversation.otherUid
    );
    var data = snap.data();
    if (typeof data.securityLevel === 'number') {
      return { tier: data.securityTier || 'foundation', level: data.securityLevel };
    }
    return await resolveDirectSecurity(
      (data.participantIds || []).filter(function (p) {
        return p !== (CommunicationState.me && CommunicationState.me.uid);
      })[0]
    );
  }

  function applySecurityToActiveConversation(security) {
    if (!security || !CommunicationState.activeConversation) return;
    CommunicationState.activeConversation.securityTier = security.tier;
    CommunicationState.activeConversation.securityLevel = security.level;
  }

  async function writeDirectMessageNotification(recipientUid, preview, me, convId, messageId) {
    if (!recipientUid || !me || recipientUid === me.uid) return;
    try {
      var senderName = ((me && me.name) || 'Someone').trim() || 'Someone';
      var plainPreview =
        root.Ce2Format && root.Ce2Format.stripFormattingForPreview
          ? root.Ce2Format.stripFormattingForPreview(preview || 'New message')
          : preview || 'New message';
      await db.collection('notifications').add({
        userId: recipientUid,
        type: 'direct_message',
        title: senderName,
        body: plainPreview.slice(0, 80),
        senderId: me.uid,
        convId: convId || '',
        messageId: messageId || '',
        read: false,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.warn('[CE2 DM Notif]', e);
    }
  }

  async function writeGroupMessageNotifications(ac, preview, me, messageId) {
    if (!ac || ac.type !== 'group' || !ac.id || !me) return;
    try {
      var memberIds = CommunicationState.memberIds;
      if (!memberIds || !memberIds.length) {
        memberIds = await loadGroupMemberIds(ac.id);
      }
      if (!memberIds.length) return;
      var groupName = ac.title || 'Group';
      var senderName = ((me && me.name) || 'Someone').trim() || 'Someone';
      var plainPreview =
        root.Ce2Format && root.Ce2Format.stripFormattingForPreview
          ? root.Ce2Format.stripFormattingForPreview(preview || 'New message')
          : preview || 'New message';
      var body = senderName + ': ' + plainPreview.slice(0, 80);
      var batch = db.batch();
      var count = 0;
      memberIds.forEach(function (uid) {
        if (uid === me.uid || count >= 40) return;
        var ref = db.collection('notifications').doc();
        batch.set(ref, {
          userId: uid,
          type: 'group_message',
          title: groupName,
          body: body,
          groupId: ac.id,
          convId: ac.id,
          messageId: messageId || '',
          read: false,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });
        count += 1;
      });
      if (count) await batch.commit();
    } catch (e) {
      console.warn('[CE2 Group Notif]', e);
    }
  }

  async function triggerCe2Push(ac, preview, me, messageId) {
    if (!ac || !me) return;
    if (ac.type === 'direct') {
      if (!ac.otherUid || ac.otherUid === me.uid) return;
    } else if (ac.type !== 'group' || !ac.id) {
      return;
    }
    try {
      var user = firebase.auth().currentUser;
      if (!user) return;
      var senderName = ((me && me.name) || 'Someone').trim() || 'Someone';
      var idToken = await user.getIdToken();
      var messageText = (
        root.Ce2Format && root.Ce2Format.stripFormattingForPreview
          ? root.Ce2Format.stripFormattingForPreview(preview || 'New message')
          : preview || 'New message'
      ).slice(0, 100);

      if (ac.type === 'direct' && ac.otherUid) {
        var recipDoc = await db.collection('users').doc(ac.otherUid).get();
        if (!recipDoc.exists) return;
        var token = recipDoc.data().fcmToken;
        var convId = ac.id || directConvId(me.uid, ac.otherUid);
        if (token) {
          var dmUrl = '/communication-v2/?conv=' + encodeURIComponent(convId);
          if (messageId) dmUrl += '&msg=' + encodeURIComponent(messageId);
          await fetch(
            'https://us-central1-marriage-education.cloudfunctions.net/notifyDmV2',
            {
              method: 'POST',
              headers: {
                Authorization: 'Bearer ' + idToken,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                senderId: user.uid,
                recipientId: ac.otherUid,
                message: messageText,
                recipientToken: token,
                senderName: senderName,
                title: senderName,
                body: messageText,
                url: dmUrl,
                convId: convId,
                messageId: messageId || '',
              }),
            }
          );
        }
        writeDirectMessageNotification(ac.otherUid, preview, me, convId, messageId);
        return;
      }

      if (ac.type === 'group' && ac.id) {
        var groupUrl = '/communication-v2/?group=' + encodeURIComponent(ac.id);
        if (messageId) groupUrl += '&msg=' + encodeURIComponent(messageId);
        await fetch(
          'https://us-central1-marriage-education.cloudfunctions.net/notifyGroupV2',
          {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + idToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              senderId: user.uid,
              groupId: ac.id,
              message: messageText,
              senderName: senderName,
              groupName: ac.title || 'Group',
              url: groupUrl,
              convId: ac.id,
              messageId: messageId || '',
            }),
          }
        );
        writeGroupMessageNotifications(ac, preview, me, messageId);
      }
    } catch (e) {
      console.warn('[CE2 Push]', e);
    }
  }

  function buildConversationMetaPatch(ac, patch, me, messageId, now) {
    var rc = receipts();
    if (!rc || !ac) return null;
    now = now || firebase.firestore.Timestamp.now();
    var unreadMap =
      CommunicationState.convMeta && CommunicationState.convMeta.unreadCount
        ? CommunicationState.convMeta.unreadCount
        : {};
    var recipients =
      ac.type === 'direct' ? [ac.otherUid] : CommunicationState.memberIds || [];
    var preview = formatInboxPreview({
      lastPreview: patch.content || '',
      content: patch.content || '',
      messageType: patch.messageType || 'text',
      lastMessageType: patch.messageType || 'text',
      imageUrl: patch.imageUrl,
      videoUrl: patch.videoUrl,
      audioUrl: patch.audioUrl,
      boardShare: patch.boardShare,
      replyTo: patch.replyTo,
      deleted: patch.deleted,
    });
    var metaPatch = {
      lastMessageAt: now,
      lastPreview: preview,
      lastSenderId: me.uid,
      lastMessageId: messageId,
      lastMessageType: patch.messageType || 'text',
    };
    Object.assign(metaPatch, rc.markReadPatch(me.uid));
    Object.assign(metaPatch, rc.incrementUnreadPatch(me.uid, recipients, unreadMap));
    metaPatch['typing.' + me.uid] = firebase.firestore.FieldValue.delete();
    return metaPatch;
  }

  function pushConversationMetaAsync(ac, patch, me, messageId) {
    var metaRef = getMetaDocRef(ac);
    if (!metaRef) return;
    var metaPatch = buildConversationMetaPatch(ac, patch, me, messageId);
    if (!metaPatch) return;
    metaRef.set(metaPatch, { merge: true }).catch(function () {});
  }

  function firestoreWriteTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (_resolve, reject) {
        setTimeout(function () {
          reject(new Error('Send timed out — check your connection and try again.'));
        }, ms || 25000);
      }),
    ]);
  }

  async function commitCe2Message(ac, patch, me) {
    var now = firebase.firestore.Timestamp.now();
    var stored = Object.assign({}, patch);
    stored.createdAt = now;

    if (ac.type === 'direct') {
      if (!ac.otherUid) {
        throw new Error('Missing recipient — reopen this thread from Discovery.');
      }
      stored.receiverId = ac.otherUid;
      if (!ac.id || !ac.convReady) {
        var convId = await ensureDirectConv(ac.otherUid);
        ac.id = convId;
        ac.convReady = true;
      }
      stored.conversationId = ac.id;
      var dCol = db
        .collection('ce2_conversations')
        .doc(ac.id)
        .collection('ce2_messages');
      var dRef = dCol.doc();
      await firestoreWriteTimeout(dRef.set(stored), 25000);

      var dMetaRef = getMetaDocRef(ac);
      var dMetaPatch = buildConversationMetaPatch(ac, patch, me, dRef.id, now);
      if (dMetaRef && dMetaPatch) {
        dMetaRef.set(dMetaPatch, { merge: true }).catch(function (metaErr) {
          console.warn('[CE2] conversation meta update failed', metaErr);
        });
      }
      return dRef.id;
    }

    stored.conversationId = ac.id;
    delete stored.receiverId;
    var gCol = db
      .collection('communicationGroups')
      .doc(ac.id)
      .collection('ce2_messages');
    var gRef = gCol.doc();
    await firestoreWriteTimeout(gRef.set(stored), 25000);

    var gMetaRef = getMetaDocRef(ac);
    var gMetaPatch = buildConversationMetaPatch(ac, patch, me, gRef.id, now);
    if (gMetaRef && gMetaPatch) {
      gMetaRef.set(gMetaPatch, { merge: true }).catch(function (metaErr) {
        console.warn('[CE2] group meta update failed', metaErr);
      });
    }
    return gRef.id;
  }

  function canDeleteMessage(m) {
    if (!m || !CommunicationState.me) return false;
    if (m.deleted || m._pending) return false;
    if (!m.id || String(m.id).indexOf('pending-') === 0) return false;
    var me = CommunicationState.me;
    if (me.isAdmin) return true;
    if (m.senderId !== me.uid) return false;
    var ms = messageTimeMs(m);
    if (!ms) return false;
    return Date.now() - ms <= UNSEND_WINDOW_MS;
  }

  var canUnsendMessage = canDeleteMessage;

  function messageMediaUrls(m) {
    if (!m) return [];
    return [m.imageUrl, m.imageThumbUrl, m.videoUrl, m.audioUrl, m.videoPosterUrl].filter(Boolean);
  }

  async function purgeMessageMediaFromR2(m) {
    var urls = messageMediaUrls(m);
    if (!urls.length) return;
    if (typeof deleteMediaUrlsFromR2 === 'function') {
      await deleteMediaUrlsFromR2(urls);
      return;
    }
    var user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!user || typeof UPLOAD_WORKER_URL === 'undefined') return;
    var idToken = await user.getIdToken().catch(function () {
      return null;
    });
    if (!idToken) return;
    await Promise.all(
      urls.map(function (url) {
        return fetch(UPLOAD_WORKER_URL + '/delete', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + idToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: url }),
        }).catch(function () {});
      })
    );
  }

  function buildUnsendPatch(m) {
    var del = firebase.firestore.FieldValue.delete();
    var patch = {
      deleted: true,
      deletedAt: firebase.firestore.Timestamp.now(),
      content: 'Message removed',
      messageType: 'text',
      imageUrl: del,
      imageThumbUrl: del,
      videoUrl: del,
      videoPosterUrl: del,
      audioUrl: del,
      boardShare: del,
      audioDurationMs: del,
      audioMime: del,
      audioWaveformPeaks: del,
      durationMs: del,
    };
    return patch;
  }

  function applyLocalUnsend(mId) {
    var deletedAt = firebase.firestore.Timestamp.now();
    function mapList(list) {
      if (!list || !list.length) return list;
      var changed = false;
      var next = list.map(function (msg) {
        if (msg.id !== mId) return msg;
        changed = true;
        var out = Object.assign({}, msg, {
          deleted: true,
          deletedAt: deletedAt,
          content: 'Message removed',
          messageType: 'text',
        });
        delete out.imageUrl;
        delete out.imageThumbUrl;
        delete out.videoUrl;
        delete out.videoPosterUrl;
        delete out.audioUrl;
        delete out.boardShare;
        delete out.audioDurationMs;
        delete out.audioMime;
        delete out.audioWaveformPeaks;
        delete out.durationMs;
        return out;
      });
      return changed ? next : list;
    }
    CommunicationState.messages = mapList(CommunicationState.messages) || CommunicationState.messages;
    CommunicationState.lastServerMessages =
      mapList(CommunicationState.lastServerMessages) || CommunicationState.lastServerMessages;
  }

  async function refreshMetaAfterUnsend(m, ac) {
    var meta = CommunicationState.convMeta;
    if (!meta || !m || meta.lastMessageId !== m.id) return;
    var metaRef = getMetaDocRef(ac);
    if (!metaRef) return;
    try {
      await metaRef.set(
        {
          lastPreview: 'Message removed',
          lastMessageType: 'text',
        },
        { merge: true }
      );
      CommunicationState.convMeta = Object.assign({}, meta, {
        lastPreview: 'Message removed',
        lastMessageType: 'text',
      });
    } catch (e) {
      console.warn('[CE2] meta after unsend', e);
    }
  }

  async function unsendMessage(m, ac) {
    if (!m || !ac) return;
    if (!canDeleteMessage(m)) {
      CommunicationState.error =
        'You can delete your own messages within 1 hour of sending. Admins can delete any message.';
      render();
      return;
    }
    if (!m.id || String(m.id).indexOf('pending-') === 0) {
      CommunicationState.error = 'Wait until the message finishes sending, then delete.';
      render();
      return;
    }
    var col =
      ac.type === 'direct'
        ? db.collection('ce2_conversations').doc(ac.id).collection('ce2_messages')
        : db.collection('communicationGroups').doc(ac.id).collection('ce2_messages');
    try {
      await purgeMessageMediaFromR2(m);
    } catch (purgeErr) {
      console.warn('[CE2] R2 purge before delete', purgeErr);
    }
    var patch = buildUnsendPatch(m);
    await col.doc(m.id).update(patch);
    applyLocalUnsend(m.id);
    await refreshMetaAfterUnsend(m, ac);
    CommunicationState.statusMessage = 'Message deleted';
    requestRender({ threadOnly: true });
  }

  function addComposerFiles(fileList) {
    var ac = CommunicationState.activeConversation;
    if (!ac || ac.needsJoin) {
      surfaceComposerError('Open a thread before attaching a photo or video.');
      render();
      return;
    }
    var slot = getComposerSlot(ac);
    if (!slot) {
      surfaceComposerError('Could not prepare composer. Refresh and try again.');
      render();
      return;
    }
    var att = attachments();
    if (!att || !att.uploadCe2Media || !att.validateComposerFile) {
      surfaceComposerError('Photo upload is not ready. Refresh the page and try again.');
      render();
      return;
    }
    if (att.r2Ready && !att.r2Ready()) {
      surfaceComposerError('Upload service not ready. Sign in and refresh the page.');
      render();
      return;
    }
    var files = Array.from(fileList || []);
    if (!files.length) return;
    var room =
      MAX_COMPOSER_ATTACHMENTS -
      (slot.pendingAttachments.length + slot.attachQueue.length + (slot.uploading ? 1 : 0));
    if (room <= 0) {
      CommunicationState.statusMessage =
        'Maximum ' + MAX_COMPOSER_ATTACHMENTS + ' attachments per send.';
      render();
      return;
    }
    var added = 0;
    files.slice(0, room).forEach(function (file) {
      try {
        if (att && att.validateComposerFile) att.validateComposerFile(file);
        slot.attachQueue.push(file);
        added++;
      } catch (err) {
        CommunicationState.error =
          (err && err.message) || 'Could not attach that file.';
      }
    });
    if (!added) {
      syncComposerAlert();
      render();
      return;
    }
    CommunicationState.error = null;
    if (files.length > room) {
      CommunicationState.statusMessage =
        'Only ' + MAX_COMPOSER_ATTACHMENTS + ' attachments allowed; extra files skipped.';
      setAttachStatus(CommunicationState.statusMessage, 'ok');
    } else {
      CommunicationState.statusMessage = 'Uploading…';
      setAttachStatus('Uploading attachment…', 'ok');
    }
    processAttachQueue(ac);
    updateAttachPreview();
    syncComposerAlert();
    render();
  }

  function startComposerUpload(file) {
    if (file && file.type && file.type.startsWith('audio/')) {
      startVoiceNoteUpload(file, {});
      return;
    }
    addComposerFiles([file]);
  }

  function newVoiceLocalId() {
    return 'voice-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }

  function findPendingVoiceMessage(localId) {
    return (CommunicationState.pendingMessages || []).find(function (p) {
      return p._voiceLocalId === localId;
    });
  }

  function updatePendingVoiceMessage(localId, patch) {
    var list = CommunicationState.pendingMessages || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i]._voiceLocalId === localId) {
        Object.assign(list[i], patch);
        break;
      }
    }
    CommunicationState.messages = mergeServerAndPending(
      CommunicationState.lastServerMessages || []
    );
  }

  function composerVoiceMeta() {
    var classEl = el('ce2ClassSelect');
    var shareEl = el('ce2Shareable');
    return {
      classification: classEl ? classEl.value || 'foundation' : 'foundation',
      shareable: shareEl ? !!shareEl.checked : true,
      replyTo: CommunicationState.replyTo || null,
    };
  }

  function applyVoiceMetadata(patch, meta, file) {
    meta = meta || {};
    if (meta.durationMs) patch.audioDurationMs = meta.durationMs;
    if (meta.audioWaveformPeaks && meta.audioWaveformPeaks.length) {
      patch.audioWaveformPeaks = meta.audioWaveformPeaks;
    }
    if (meta.audioMime || (file && file.type)) {
      patch.audioMime = meta.audioMime || file.type;
    }
    return patch;
  }

  function startVoiceNoteUpload(file, meta) {
    meta = meta || {};
    var ac = CommunicationState.activeConversation;
    var me = CommunicationState.me;
    if (!ac || !me || ac.needsJoin || !file) return;
    if (isMessagingSuspended()) {
      CommunicationState.error =
        'Messaging is paused for your account. Contact an administrator if you believe this is an error.';
      render();
      return;
    }

    var localId = meta.localId || newVoiceLocalId();
    if (voiceUploadCommitted[localId]) return;

    var existing = findPendingVoiceMessage(localId);
    if (!existing) {
      var cm = composerVoiceMeta();
      var blobUrl = URL.createObjectURL(file);
      pushOptimisticMessage({
        messageType: 'voice',
        content: 'Voice message',
        senderId: me.uid,
        tier: me.isAdmin ? 'elite' : me.tier,
        classification: cm.classification,
        shareable: cm.shareable,
        replyTo: cm.replyTo,
        conversationId: ac.id || '',
        _voiceLocalId: localId,
        uploadState: meta.retry ? 'retrying' : 'uploading',
        uploadProgress: 0,
        _localAudioUrl: blobUrl,
        durationMs: meta.durationMs || 0,
        audioDurationMs: meta.durationMs || 0,
        audioWaveformPeaks: meta.audioWaveformPeaks || null,
        audioMime: meta.audioMime || file.type || '',
        createdAt: firebase.firestore.Timestamp.now(),
      });
      if (!meta.retry) clearReply();
    } else {
      updatePendingVoiceMessage(localId, {
        uploadState: meta.retry ? 'retrying' : 'uploading',
        uploadProgress: 0,
      });
    }

    requestRender({ threadOnly: true });
    runVoiceNoteUpload(localId, file, ac, meta);
  }

  function persistVoiceOutbox(file, ac, localId, pendingId, meta) {
    var ob = root.Ce2AudioOutbox;
    if (!ob) return Promise.resolve();
    var cm = composerVoiceMeta();
    meta = meta || {};
    return ob
      .init()
      .then(function () {
        return ob.putFromFile(file, {
          localId: localId,
          conversationId: ac.id || '',
          convType: ac.type || 'direct',
          otherUid: ac.otherUid || '',
          durationMs: meta.durationMs || 0,
          audioWaveformPeaks: meta.audioWaveformPeaks || null,
          audioMime: meta.audioMime || file.type || '',
          classification: cm.classification,
          shareable: cm.shareable,
          replyTo: cm.replyTo,
          pendingId: pendingId || '',
          retryCount: meta.retryCount || 0,
        });
      })
      .catch(function (e) {
        console.warn('[CE2 audio outbox]', e);
      });
  }

  function runVoiceNoteUpload(localId, file, ac, uploadMeta) {
    uploadMeta = uploadMeta || {};
    if (voiceUploadCommitted[localId]) return;
    var me = CommunicationState.me;
    if (!me || !ac) return;

    var pending = findPendingVoiceMessage(localId);
    var pendingId = pending && pending.id;

    if (CommunicationState.offline) {
      updatePendingVoiceMessage(localId, { uploadState: 'failed' });
      persistVoiceOutbox(file, ac, localId, pendingId, {
        durationMs: (pending && pending.durationMs) || uploadMeta.durationMs,
        audioWaveformPeaks:
          (pending && pending.audioWaveformPeaks) || uploadMeta.audioWaveformPeaks,
        audioMime: (pending && pending.audioMime) || uploadMeta.audioMime,
      }).then(function () {
        CommunicationState.statusMessage =
          'Voice note saved — tap Retry when you are back online.';
        requestRender({ threadOnly: true });
      });
      return;
    }

    var att = attachments();
    if (!att || !att.uploadCe2Media) {
      updatePendingVoiceMessage(localId, { uploadState: 'failed' });
      handleCe2Error(new Error('Media upload is not available.'));
      return;
    }

    var uploadOpts = {
      onProgress: function (p) {
        updatePendingVoiceMessage(localId, {
          uploadState: 'uploading',
          uploadProgress: p,
        });
        requestRender({ threadOnly: true });
      },
    };

    att
      .uploadCe2Media(file, uploadOpts)
      .then(function (result) {
        if (voiceUploadCommitted[localId]) return;

        var gSend = gov();
        var classification =
          (pending && pending.classification) || composerVoiceMeta().classification;
        var shareable = pending ? !!pending.shareable : true;
        if (
          governanceEnabled() &&
          gSend &&
          ac &&
          typeof ac.securityLevel === 'number'
        ) {
          classification = gSend.clampClassification(classification, ac.securityLevel);
        }

        var now = firebase.firestore.Timestamp.now();
        var patch = {
          conversationId: ac.id,
          senderId: me.uid,
          tier: me.isAdmin ? 'elite' : me.tier,
          classification: classification,
          shareable: shareable,
          content: 'Voice message',
          messageType: 'voice',
          audioUrl: result.url,
          createdAt: now,
        };
        if (pending && pending.replyTo) patch.replyTo = pending.replyTo;
        if (ac.type === 'direct') {
          patch.receiverId = ac.otherUid;
        } else {
          patch.receiverId = '';
        }
        applyVoiceMetadata(patch, {
          durationMs: (pending && pending.durationMs) || uploadMeta.durationMs,
          audioWaveformPeaks:
            (pending && pending.audioWaveformPeaks) || uploadMeta.audioWaveformPeaks,
          audioMime: (pending && pending.audioMime) || uploadMeta.audioMime,
        }, file);

        voiceUploadCommitted[localId] = true;
        updatePendingVoiceMessage(localId, { uploadState: 'sent', uploadProgress: 1 });

        return commitCe2Message(ac, patch, me).then(function (messageId) {
          triggerCe2Push(ac, 'Voice note', me, messageId);
          patchThreadPreviewLocal(ac, patch);
          if (root.Ce2AudioOutbox) {
            root.Ce2AudioOutbox.remove(localId).catch(function () {});
          }
          if (pending && pending._localAudioUrl) {
            try {
              URL.revokeObjectURL(pending._localAudioUrl);
            } catch (_) {}
          }
          removeOptimisticMessage(pendingId);
          CommunicationState.statusMessage = null;
          requestRender({ threadOnly: true });
        });
      })
      .catch(function (err) {
        if (err && err.message === 'Upload cancelled') return;
        updatePendingVoiceMessage(localId, { uploadState: 'failed' });
        persistVoiceOutbox(file, ac, localId, pendingId, {
          durationMs: (pending && pending.durationMs) || uploadMeta.durationMs,
          audioWaveformPeaks:
            (pending && pending.audioWaveformPeaks) || uploadMeta.audioWaveformPeaks,
          audioMime: (pending && pending.audioMime) || uploadMeta.audioMime,
        }).then(function () {
          var detail = err && err.message ? String(err.message) : 'unknown error';
          CommunicationState.statusMessage =
            'Voice note failed to upload (' + detail + '). Tap Retry or Discard.';
          requestRender({ threadOnly: true });
        });
      });
  }

  function retryVoiceNote(localId) {
    var ob = root.Ce2AudioOutbox;
    if (!ob) return;
    ob.init()
      .then(function () {
        return ob.get(localId);
      })
      .then(function (entry) {
        if (!entry) {
          CommunicationState.error = 'Voice note no longer available to retry.';
          render();
          return;
        }
        return ob.incrementRetry(localId).then(function () {
          return entry;
        });
      })
      .then(function (entry) {
        if (!entry) return;
        var ac = CommunicationState.activeConversation;
        if (ac && entry.conversationId && ac.id && ac.id !== entry.conversationId) {
          CommunicationState.statusMessage =
            'Open the conversation for this voice note to retry.';
          render();
          return;
        }
        var file = ob.toFile(entry);
        startVoiceNoteUpload(file, {
          localId: localId,
          retry: true,
          durationMs: entry.durationMs,
          audioWaveformPeaks: entry.audioWaveformPeaks,
          audioMime: entry.mime,
        });
      })
      .catch(function (e) {
        console.warn('[CE2 retryVoiceNote]', e);
      });
  }

  function discardVoiceNote(localId) {
    var pending = findPendingVoiceMessage(localId);
    if (pending) {
      if (pending._localAudioUrl) {
        try {
          URL.revokeObjectURL(pending._localAudioUrl);
        } catch (_) {}
      }
      removeOptimisticMessage(pending.id);
    }
    var ob = root.Ce2AudioOutbox;
    if (ob) {
      ob.init()
        .then(function () {
          return ob.remove(localId);
        })
        .catch(function () {});
    }
    delete voiceUploadCommitted[localId];
    requestRender({ threadOnly: true });
  }

  function hydrateVoiceOutboxPending() {
    var ob = root.Ce2AudioOutbox;
    var me = CommunicationState.me;
    if (!ob || !me) return Promise.resolve();
    return ob
      .init()
      .then(function () {
        return ob.list();
      })
      .then(function (items) {
        (items || []).forEach(function (entry) {
          if (voiceUploadCommitted[entry.localId]) return;
          if (findPendingVoiceMessage(entry.localId)) return;
          var blobUrl = URL.createObjectURL(
            new Blob([entry.blobBuffer], { type: entry.mime || 'audio/webm' })
          );
          pushOptimisticMessage({
            messageType: 'voice',
            content: 'Voice message',
            senderId: me.uid,
            tier: me.isAdmin ? 'elite' : me.tier,
            classification: entry.classification || 'foundation',
            shareable: entry.shareable !== false,
            replyTo: entry.replyTo || null,
            conversationId: entry.conversationId || '',
            _voiceLocalId: entry.localId,
            uploadState: 'failed',
            uploadProgress: 0,
            _localAudioUrl: blobUrl,
            durationMs: entry.durationMs || 0,
            audioDurationMs: entry.durationMs || 0,
            audioWaveformPeaks: entry.audioWaveformPeaks || null,
            audioMime: entry.mime || '',
            createdAt: firebase.firestore.Timestamp.fromMillis(
              entry.createdAt || Date.now()
            ),
          });
        });
        requestRender({ throttle: true });
      })
      .catch(function (e) {
        console.warn('[CE2 hydrateVoiceOutbox]', e);
      });
  }

  function flushCe2AudioOutbox() {
    var ob = root.Ce2AudioOutbox;
    if (!ob || CommunicationState.offline || !CommunicationState.me) return Promise.resolve();
    return ob
      .init()
      .then(function () {
        return ob.list();
      })
      .then(function (items) {
        if (!items || !items.length) return;
        var ac = CommunicationState.activeConversation;
        if (!ac || !ac.id) return;
        for (var i = 0; i < items.length; i++) {
          var entry = items[i];
          if (voiceUploadCommitted[entry.localId]) continue;
          if (entry.conversationId !== ac.id) continue;
          var pending = findPendingVoiceMessage(entry.localId);
          if (!pending || pending.uploadState === 'failed') {
            var file = ob.toFile(entry);
            startVoiceNoteUpload(file, {
              localId: entry.localId,
              retry: true,
              durationMs: entry.durationMs,
            });
            break;
          }
        }
      })
      .catch(function (e) {
        console.warn('[CE2 flushCe2AudioOutbox]', e);
      });
  }

  function bindCe2VoiceUploadActions() {
    var scroll = el('ce2MessageScroll');
    if (!scroll || scroll.dataset.ce2VoiceActionsBound) return;
    scroll.dataset.ce2VoiceActionsBound = '1';
    scroll.addEventListener('click', function (e) {
      var quoteBtn = e.target.closest('.ce2-reply-quote[data-reply-to-id]');
      if (quoteBtn) {
        e.preventDefault();
        e.stopPropagation();
        scrollToReplyMessage(quoteBtn.getAttribute('data-reply-to-id'));
        return;
      }
      var shareThumb = e.target.closest('.ce2-board-share-thumb');
      if (shareThumb) {
        e.preventDefault();
        e.stopPropagation();
        var shareRow = shareThumb.closest('.ce2-row');
        var shareId = shareRow && shareRow.dataset.messageId;
        var shareMsg = shareId
          ? (CommunicationState.messages || []).find(function (x) {
              return x.id === shareId;
            }) ||
            (CommunicationState.lastServerMessages || []).find(function (x) {
              return x.id === shareId;
            })
          : null;
        if (shareMsg) setReply(shareMsg);
        return;
      }
      var retryBtn = e.target.closest('.ce2-voice-retry');
      if (retryBtn) {
        e.preventDefault();
        var rid = retryBtn.getAttribute('data-voice-local-id');
        if (rid) retryVoiceNote(rid);
        return;
      }
      var sendRetryBtn = e.target.closest('.ce2-send-retry');
      if (sendRetryBtn) {
        e.preventDefault();
        var pid = sendRetryBtn.getAttribute('data-pending-id');
        if (pid) retryFailedMessage(pid);
        return;
      }
      var discardBtn = e.target.closest('.ce2-voice-discard');
      if (discardBtn) {
        e.preventDefault();
        var did = discardBtn.getAttribute('data-voice-local-id');
        if (did) discardVoiceNote(did);
      }
    });
  }

  function processAttachQueue(ac) {
    var slot = getComposerSlot(ac);
    if (!slot || slot.uploading || !slot.attachQueue.length) return;

    var att = attachments();
    if (!att || !att.uploadCe2Media) {
      handleCe2Error(new Error('Media upload is not available.'));
      return;
    }

    var file = slot.attachQueue[0];
    try {
      if (att.validateComposerFile) att.validateComposerFile(file);
    } catch (err) {
      slot.attachQueue.shift();
      handleCe2Error(err);
      processAttachQueue(ac);
      return;
    }

    slot.attachQueue.shift();
    var threadKey = threadComposerKey(ac);
    slot.localFile = file;
    revokeLocalPreview(slot.localPreviewUrl);
    slot.localPreviewUrl = URL.createObjectURL(file);
    slot.uploading = true;
    slot.uploadProgress = 0;
    slot.uploadFinalizing = false;
    slot.uploadAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;
    syncGlobalsFromComposerSlot();
    updateAttachPreview();
    render();
    var lastProgressUi = 0;
    var uploadOpts = {
      onProgress: function (p) {
        var s = CommunicationState.threadComposer[threadKey];
        if (!s) return;
        s.uploadProgress = p;
        s.uploadFinalizing = p >= 0.995;
        if (s.uploadFinalizing) {
          CommunicationState.statusMessage = 'Finalizing upload…';
          setAttachStatus('Finalizing upload…', 'ok');
        }
        var now = Date.now();
        if (now - lastProgressUi < 200) return;
        lastProgressUi = now;
        if (
          CommunicationState.activeConversation &&
          threadComposerKey(CommunicationState.activeConversation) === threadKey
        ) {
          updateAttachPreview();
        }
      },
    };
    if (slot.uploadAbort) uploadOpts.signal = slot.uploadAbort.signal;
    att
      .uploadCe2Media(file, uploadOpts)
      .then(function (result) {
        var s = CommunicationState.threadComposer[threadKey];
        if (!s) return;
        if (!s.pendingAttachments) s.pendingAttachments = [];
        s.pendingAttachments.push(result);
        syncPendingMediaFromAttachments(s);
        s.uploading = false;
        s.uploadProgress = 1;
        s.uploadFinalizing = false;
        s.uploadAbort = null;
        s.localFile = null;
        revokeLocalPreview(s.localPreviewUrl);
        s.localPreviewUrl = null;
        syncGlobalsFromComposerSlot();
        CommunicationState.error = null;
        CommunicationState.statusMessage = 'Attachment ready — tap Send.';
        setAttachStatus('Attachment ready — tap Send.', 'ok');
        updateAttachPreview();
        syncComposerAlert();
        render();
        processAttachQueue(ac);
        if (
          s.pendingSendAfterUpload &&
          !s.uploading &&
          !s.attachQueue.length &&
          CommunicationState.activeConversation &&
          threadComposerKey(CommunicationState.activeConversation) === threadKey
        ) {
          s.pendingSendAfterUpload = false;
          sendMessage();
        }
      })
      .catch(function (err) {
        var s = CommunicationState.threadComposer[threadKey];
        if (!s) return;
        s.uploading = false;
        s.uploadFinalizing = false;
        s.uploadAbort = null;
        s.localFile = null;
        revokeLocalPreview(s.localPreviewUrl);
        s.localPreviewUrl = null;
        syncGlobalsFromComposerSlot();
        if (err && err.message === 'Upload cancelled') {
          s.pendingSendAfterUpload = false;
          updateAttachPreview();
          render();
          processAttachQueue(ac);
          return;
        }
        s.pendingSendAfterUpload = false;
        var label =
          (file && file.name) ||
          (att && att.mediaKindForFile && att.mediaKindForFile(file) === 'video' ? 'Video' : 'Photo');
        handleCe2Error(
          err && err.message
            ? new Error(label + ' upload failed: ' + err.message)
            : new Error(label + ' upload failed.')
        );
        updateAttachPreview();
        processAttachQueue(ac);
      });
  }

  function removeComposerAttachment(index) {
    var slot = getComposerSlot();
    if (!slot || !slot.pendingAttachments) return;
    slot.pendingAttachments.splice(index, 1);
    syncPendingMediaFromAttachments(slot);
    syncGlobalsFromComposerSlot();
    updateAttachPreview();
    render();
  }

  function ce2BoardShareThumbnail(post) {
    if (!post) return { thumbnailUrl: '', mediaType: '' };
    if (Array.isArray(post.allMedia) && post.allMedia.length > 0) {
      var firstImage = post.allMedia.find(function (item) {
        return item && item.type === 'image' && item.url;
      });
      if (firstImage) return { thumbnailUrl: firstImage.url, mediaType: 'image' };
      var firstVideo = post.allMedia.find(function (item) {
        return item && item.type === 'video' && item.url;
      });
      if (firstVideo) {
        return {
          thumbnailUrl: firstVideo.thumbUrl || post.thumbUrl || post.imageUrl || '',
          mediaType: 'video',
        };
      }
    }
    if (post.imageUrl) return { thumbnailUrl: post.imageUrl, mediaType: 'image' };
    if (Array.isArray(post.allPhotos) && post.allPhotos[0]) {
      return { thumbnailUrl: post.allPhotos[0], mediaType: 'image' };
    }
    if (post.thumbUrl) return { thumbnailUrl: post.thumbUrl, mediaType: 'video' };
    if (Array.isArray(post.allThumbs) && post.allThumbs[0]) {
      return { thumbnailUrl: post.allThumbs[0], mediaType: 'video' };
    }
    return { thumbnailUrl: '', mediaType: post.videoUrl ? 'video' : '' };
  }

  async function buildBoardShareFromParsed(boardParsed, text, sh) {
    var titleText = (text || '').trim();
    if (boardParsed.url) {
      titleText = titleText.replace(boardParsed.url, '').trim();
    }
    var token = '';
    try {
      token = await sh.mintBoardShareToken(
        db,
        CommunicationState.me.uid,
        boardParsed.boardId,
        boardParsed.postId,
        titleText || 'Board post'
      );
    } catch (err) {
      console.warn('[CE2 Board Share] token mint skipped:', err);
    }

    var postData = null;
    try {
      var postDoc = await db.collection('posts').doc(boardParsed.postId).get();
      if (postDoc.exists) postData = postDoc.data() || null;
    } catch (err) {
      console.warn('[CE2 Board Share] post preview skipped:', err);
    }

    var thumb = ce2BoardShareThumbnail(postData);
    var excerpt = postData && postData.content ? String(postData.content).slice(0, 200) : '';
    return {
      boardId: boardParsed.boardId,
      postId: boardParsed.postId,
      token: token,
      url: sh.shareHref(boardParsed.boardId, boardParsed.postId, token),
      thumbnailUrl: thumb.thumbnailUrl || '',
      mediaType: thumb.mediaType || '',
      note: titleText || '',
      title: excerpt || titleText || 'Board post',
      excerpt: excerpt || '',
    };
  }

  async function sendMessage() {
    var me = CommunicationState.me;
    var ac = CommunicationState.activeConversation;
    if (!me || !ac) {
      CommunicationState.error = 'Select a thread first: pick someone under Discovery, or create & join a formation group.';
      render();
      return;
    }
    if (isMessagingSuspended()) {
      CommunicationState.error =
        'Messaging is paused for your account. Contact an administrator if you believe this is an error.';
      logCe2Audit('messaging_suspended', { reason: 'client_block' });
      render();
      return;
    }
    if (CommunicationState.sending) return;

    if (ac.type === 'group' && ac.needsJoin) {
      try {
        var gnameJoin =
          (CommunicationState.visibleGroups.find(function (g) {
            return g.id === ac.id;
          }) || {}).name || ac.title;
        await joinGroupById(ac.id, gnameJoin);
        ac = CommunicationState.activeConversation;
      } catch (joinErr) {
        handleCe2Error(joinErr, 'group');
        return;
      }
    }

    if (ac.type === 'group' && ac.id) {
      try {
        ac = await ensureGroupReadyToSend(ac, me);
        me = CommunicationState.me || me;
      } catch (prepErr) {
        handleCe2Error(prepErr, prepErr.code === 'tier-mismatch' ? 'group' : 'group');
        return;
      }
    }

    var text = (el('ce2Input') && el('ce2Input').value || '').trim();
    var boardUrlInput = el('ce2BoardShareUrl');
    var boardUrl = boardUrlInput ? boardUrlInput.value.trim() : '';
    syncGlobalsFromComposerSlot();
    var slot = getComposerSlot();
    var mediaList = slot ? composerMediaList(slot) : [];
    var sh = share();
    var boardParsed = sh && (boardUrl || text) ? sh.parseBoardPostUrl(boardUrl || text) : null;

    if (slot && (slot.uploading || slot.attachQueue.length)) {
      if (!text && !boardParsed && !mediaList.length) {
        slot.pendingSendAfterUpload = true;
        CommunicationState.statusMessage = 'Will send when uploads finish…';
        render();
        return;
      }
    }

    if (!text && !mediaList.length && !boardParsed) {
      if (slot && (slot.uploading || slot.attachQueue.length)) {
        CommunicationState.statusMessage = 'Still uploading — wait for the preview, then tap Send.';
        syncComposerAlert();
        render();
        return;
      }
      surfaceComposerError(
        'Nothing to send. Attach a photo or video, wait for the preview to appear, then tap Send.'
      );
      render();
      return;
    }

    if (boardParsed && mediaList.length) {
      CommunicationState.error = 'Send a board link separately from photo/video attachments.';
      render();
      return;
    }

    var lk = links();
    if (text && lk && lk.validateMessageLinks) {
      var linkCheck = lk.validateMessageLinks(text);
      if (!linkCheck.ok) {
        CommunicationState.error =
          'External links are not allowed in Messages. Use SBD board share or paste marriageducation.com / sbd-network.web.app links only.';
        render();
        return;
      }
    }

    var classification = el('ce2ClassSelect').value || 'foundation';
    var shareable = el('ce2Shareable').checked;

    if (ac.type === 'group' && ac.id) {
      try {
        var groupPolicy = await resolveGroupSendPolicy(ac.id, classification, me);
        classification = groupPolicy.classification;
        if (el('ce2ClassSelect')) el('ce2ClassSelect').value = classification;
      } catch (policyErr) {
        handleCe2Error(policyErr, 'group');
        return;
      }
    }

    var gSend = gov();
    if (
      governanceEnabled() &&
      gSend &&
      ac &&
      typeof ac.securityLevel === 'number'
    ) {
      classification = gSend.clampClassification(classification, ac.securityLevel);
      if (el('ce2ClassSelect')) el('ce2ClassSelect').value = classification;
    }

    if (!canReadClassification(me, classification)) {
      CommunicationState.error =
        'Your covenant access does not allow sending at classification: ' + classification;
      render();
      return;
    }

    if (ac.type === 'direct' && ac.otherUid && isUserBlockedUid(ac.otherUid)) {
      CommunicationState.error =
        'You blocked this contact. Unblock from message menu → Safety to send again.';
      render();
      return;
    }

    if (CommunicationState.offline) {
      if (text && !mediaList.length && !boardParsed && root.Ce2OfflineQueue) {
        root.Ce2OfflineQueue.enqueue({
          id: 'q_' + Date.now(),
          convId: ac.id,
          convType: ac.type,
          otherUid: ac.otherUid || '',
          text: text,
          classification: classification,
          shareable: shareable,
        });
        el('ce2Input').value = '';
        if (root.Ce2Format) root.Ce2Format.syncInputMirror();
        syncCe2ComposerInputHeight();
        requestAnimationFrame(function () {
          syncCe2ComposerInputHeight();
        });
        clearComposerDraft(ac);
        CommunicationState.statusMessage =
          'Saved offline — will send when you reconnect.';
        render();
        return;
      }
      CommunicationState.error = 'You are offline. Reconnect to send messages.';
      render();
      return;
    }

    var g = gov();
    if (
      governanceEnabled() &&
      g &&
      ac &&
      typeof ac.securityLevel === 'number' &&
      !g.classificationAllowedAtFloor(classification, ac.securityLevel)
    ) {
      CommunicationState.error =
        'Content cannot exceed this thread security (' +
        (ac.securityTier || 'foundation') +
        '). Advanced formation material cannot flow downward.';
      logCe2Audit('content_tier_blocked', {
        conversationId: ac.id,
        classification: classification,
        securityLevel: ac.securityLevel,
      });
      render();
      return;
    }

    if (governanceEnabled() && g && ac && typeof ac.securityLevel === 'number') {
      classification = g.clampClassification(classification, ac.securityLevel);
    }

    var now = firebase.firestore.Timestamp.now();
    var boardShare = null;
    if (boardParsed && sh) {
      boardShare = await buildBoardShareFromParsed(boardParsed, text, sh);
      if (!text) text = 'Shared a board post';
    }

    function mediaLabel(item) {
      if (!item) return '';
      if (item.kind === 'video') return 'Video';
      if (item.kind === 'audio') return 'Voice message';
      return 'Photo';
    }

    function buildPatch(bodyText, mediaItem) {
      var messageType = 'text';
      if (boardShare) messageType = 'board_share';
      else if (mediaItem) {
        messageType =
          mediaItem.kind === 'video'
            ? 'video'
            : mediaItem.kind === 'audio'
              ? 'voice'
              : 'image';
      }
      var patch = {
        conversationId: ac.id,
        senderId: me.uid,
        tier: me.isAdmin ? 'elite' : me.tier,
        classification: classification,
        shareable: shareable,
        content: bodyText || mediaLabel(mediaItem) || '',
        messageType: messageType,
        createdAt: now,
      };
      if (mediaItem && mediaItem.kind === 'image') {
        patch.imageUrl = mediaItem.url;
        if (mediaItem.thumbUrl) patch.imageThumbUrl = mediaItem.thumbUrl;
      }
      if (mediaItem && mediaItem.kind === 'video') {
        patch.videoUrl = mediaItem.url;
        if (mediaItem.posterUrl || mediaItem.thumbUrl) {
          patch.videoPosterUrl = mediaItem.posterUrl || mediaItem.thumbUrl;
        }
      }
      if (mediaItem && mediaItem.kind === 'audio') patch.audioUrl = mediaItem.url;
      if (boardShare) patch.boardShare = boardShare;
      if (CommunicationState.replyTo) patch.replyTo = CommunicationState.replyTo;
      if (ac.type === 'direct') {
        patch.receiverId = ac.otherUid;
        patch.conversationId = ac.id || directConvId(me.uid, ac.otherUid);
        if (governanceEnabled() && gSend && typeof ac.securityLevel === 'number') {
          patch.classification = gSend.clampClassification(patch.classification, ac.securityLevel);
        }
      } else if (ac.type === 'group') {
        patch.conversationId = ac.id;
      }
      return patch;
    }

    var patches = [];
    if (boardShare) {
      patches.push(buildPatch(text, null));
    } else if (mediaList.length) {
      mediaList.forEach(function (item, idx) {
        patches.push(buildPatch(idx === 0 ? text : '', item));
      });
    } else {
      patches.push(buildPatch(text, null));
    }

    clearComposerTyping(ac);

    var pendingIds = patches.map(function (p) {
      return pushOptimisticMessage(p);
    });
    el('ce2Input').value = '';
    if (root.Ce2Format) root.Ce2Format.syncInputMirror();
    syncCe2ComposerInputHeight();
    requestAnimationFrame(function () {
      syncCe2ComposerInputHeight();
    });
    clearComposerDraft(ac);
    if (root.Ce2Format) root.Ce2Format.syncInputMirror();
    if (boardUrlInput) boardUrlInput.value = '';
    if (mediaList.length) clearComposerPending();
    clearReply();
    CommunicationState.error = null;
    CommunicationState.statusMessage = null;
    CommunicationState.sending = true;
    updateComposerState();

    var sendBtn = el('ce2SendBtn');
    if (sendBtn) sendBtn.disabled = true;

    try {
      var lastMessageId = null;
      for (var i = 0; i < patches.length; i++) {
        lastMessageId = await commitCe2Message(ac, patches[i], me);
        confirmSentMessage(pendingIds[i], lastMessageId, patches[i], ac);
      }
      triggerCe2Push(ac, patches[patches.length - 1].content || '', me, lastMessageId);
      patchThreadPreviewLocal(ac, patches[patches.length - 1]);
      if (patches.length > 1) {
        CommunicationState.statusMessage = patches.length + ' messages sent';
      }
    } catch (err) {
      pendingIds.forEach(function (pid) {
        markOptimisticFailed(pid, err);
      });
      handleCe2Error(
        err,
        ac && ac.type === 'direct' ? 'send' : ac && ac.type === 'group' ? 'group' : null
      );
    } finally {
      CommunicationState.sending = false;
      updateComposerState();
      requestRender({ threadOnly: true });
    }
  }

  async function joinGroupById(gid, gname) {
    var me = CommunicationState.me;
    if (!gid || !me) throw new Error('Select a group first.');
    var memberRef = db
      .collection('communicationGroups')
      .doc(gid)
      .collection('members')
      .doc(me.uid);
    var memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
      await memberRef.set({ joinedAt: firebase.firestore.Timestamp.now() });
    }
    // Admin-added members already have a doc — skip joinedAt update (rules tier gate).
    CommunicationState.selectedGroupId = gid;
    await openGroupThread(gid, gname || 'Group');
    CommunicationState.error = null;
    CommunicationState.statusMessage = 'Joined group — you can send messages now.';
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
      var gname =
        (CommunicationState.visibleGroups.find(function (g) {
          return g.id === gid;
        }) || {}).name || 'Group';
      await joinGroupById(gid, gname);
    } catch (err) {
      handleCe2Error(err, 'join');
    }
    render();
  }

  function wireCe2DelegatedClick() {
    if (ce2UiWired) return;
    var sidebar = el('ce2Sidebar');
    if (!sidebar) return;
    ce2UiWired = true;
    sidebar.addEventListener('click', function (e) {
      if (inboxLongPressFired) {
        inboxLongPressFired = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      var li = e.target.closest('.ce2-li[data-action]');
      if (!li || !CommunicationState.me) return;
      var action = li.dataset.action;
      if (action === 'select-group') {
        CommunicationState.mobileHubPanel = 'groups';
        CommunicationState.selectedGroupId = li.dataset.groupId;
        CommunicationState.selectedDiscoveryUid = null;
        selectGroupOnly(li.dataset.groupId, li.dataset.groupName || 'Group');
        render();
        return;
      }
      if (action === 'open-thread') {
        bumpThreadOpenToken();
        CommunicationState.mobileHubPanel = 'direct';
        openDirectThread(li.dataset.convId, li.dataset.otherUid, li.dataset.label).catch(handleCe2Error);
        return;
      }
      if (action === 'open-saved') {
        bumpThreadOpenToken();
        CommunicationState.highlightMessageId = li.dataset.messageId || null;
        var convType = li.dataset.convType || 'direct';
        if (convType === 'group') {
          CommunicationState.mobileHubPanel = 'groups';
          openGroupThread(li.dataset.convId, 'Group').catch(handleCe2Error);
        } else {
          CommunicationState.mobileHubPanel = 'direct';
          var thread = (CommunicationState.threads || []).find(function (t) {
            return t.id === li.dataset.convId;
          });
          openDirectThread(
            li.dataset.convId,
            thread ? thread.otherUid : '',
            thread ? thread.label : 'Conversation'
          ).catch(handleCe2Error);
        }
        return;
      }
      if (action === 'open-discovery') {
        bumpThreadOpenToken();
        CommunicationState.mobileHubPanel = 'discover';
        var peer = normalizeCe2User(li.dataset.peerUid, {
          name: li.dataset.peerName,
          tier: li.dataset.peerTier,
          mentor: li.dataset.peerMentor === '1',
        });
        CommunicationState.selectedDiscoveryUid = peer.uid;
        if (!canCommunicate(CommunicationState.me, peer)) {
          CommunicationState.error =
            'Policy: lower tier cannot open thread upward (unless they are a mentor).';
          render();
          return;
        }
        CommunicationState.error = null;
        openDirectThread(
          directConvId(CommunicationState.me.uid, peer.uid),
          peer.uid,
          peer.name
        ).catch(handleCe2Error);
      }
    });
  }

  function scrollMessagesToEnd() {
    var scroll = el('ce2MessageScroll');
    if (!scroll) return;
    scroll.scrollTop = scroll.scrollHeight;
  }

  function dismissThreadSearch() {
    var bar = el('ce2ThreadSearch');
    var closeBtn = el('ce2ThreadSearchClose');
    if (bar && !bar.hidden && closeBtn) closeBtn.click();
  }

  /* === CE2 keyboard module (v60 stable) — see ROLLBACK-KEYBOARD-v60.md; do not merge header/composer paths === */
  var ce2ComposerKbRaf = 0;
  var CE2_COMPOSER_KB_TRIM = 2;

  function ce2KbDebugEnabled() {
    return /ce2_kb_debug=1/i.test(window.location.search || '');
  }

  function ce2UseLegacyComposerLift() {
    try {
      if (/ce2_kb_legacy=1/i.test(window.location.search || '')) return true;
      if (/ce2_kb_legacy=0/i.test(window.location.search || '')) return false;
    } catch (_) {}
    return false;
  }

  function ce2KeyboardOccludedHeight(vv) {
    if (!vv) return 0;
    var vvOffset = Math.max(0, Math.round(vv.offsetTop || 0));
    return Math.max(0, Math.round(window.innerHeight - vv.height - vvOffset));
  }

  /** v59 frozen — header stability: body pan counter only */
  function applyViewportPanCounter(vv, composerFocused, editFocused, kbOccluded) {
    var vvOffset = 0;
    if (vv) {
      vvOffset = Math.max(0, Math.round(vv.offsetTop || 0));
    }
    document.documentElement.style.setProperty('--ce2-vv-offset', vvOffset + 'px');

    var kbActive = composerFocused || editFocused || kbOccluded > 0;
    document.body.classList.toggle('ce2-kb-active', kbActive);

    if (kbActive && (window.scrollX || window.scrollY)) {
      window.scrollTo(0, 0);
    }
  }

  /** v60 — measure gap to keyboard top; does not touch header/shell */
  function measureComposerKeyboardLift(vv) {
    if (!vv) return 0;
    var composer = document.querySelector('.ce2-thread-open .ce2-composer');
    if (!composer) return 0;

    var keyboardTop = vv.offsetTop + vv.height;
    var prevTransform = composer.style.transform;
    composer.style.transform = 'none';
    var composerBottom = composer.getBoundingClientRect().bottom;
    composer.style.transform = prevTransform;

    return Math.max(0, Math.round(composerBottom - keyboardTop - CE2_COMPOSER_KB_TRIM));
  }

  function applyComposerKeyboardLift(vv, composerFocused, kbOccluded) {
    var lift = 0;
    if (composerFocused && vv) {
      if (ce2UseLegacyComposerLift()) {
        lift = kbOccluded;
      } else {
        lift = measureComposerKeyboardLift(vv);
        if (kbOccluded > 0) {
          lift = Math.min(lift, kbOccluded);
        }
      }
    }

    document.documentElement.style.setProperty('--ce2-composer-kb', lift + 'px');
    document.body.classList.toggle('ce2-composer-kb-active', composerFocused && lift > 0);

    if (composerFocused) {
      requestAnimationFrame(scrollMessagesToEnd);
    }

    if (ce2KbDebugEnabled()) {
      console.log('[CE2 kb] lift=' + lift + ' occluded=' + kbOccluded + ' legacy=' + ce2UseLegacyComposerLift());
    }
  }

  function applyComposerKeyboardInset() {
    ce2ComposerKbRaf = 0;
    var vv = window.visualViewport;
    var kbOccluded = ce2KeyboardOccludedHeight(vv);

    var active = document.activeElement;
    var composerFocused = !!(active && active.closest && active.closest('.ce2-composer'));
    var editFocused = !!(active && active.closest && active.closest('.ce2-sheet--edit'));

    applyViewportPanCounter(vv, composerFocused, editFocused, kbOccluded);
    applyComposerKeyboardLift(vv, composerFocused, kbOccluded);

    document.documentElement.style.setProperty('--ce2-edit-kb', kbOccluded + 'px');

    var editSheet = el('ce2EditSheet');
    if (editSheet) {
      editSheet.classList.toggle('ce2-sheet--above-keyboard', kbOccluded > 0 && !editSheet.hidden);
    }

    if (ce2KbDebugEnabled() && vv) {
      console.log('[CE2 kb] vv', {
        offsetTop: vv.offsetTop,
        height: vv.height,
        kbOccluded: kbOccluded,
        vvOffset: Math.round(vv.offsetTop || 0)
      });
    }
  }

  function scheduleComposerKeyboardInset() {
    if (ce2ComposerKbRaf) return;
    ce2ComposerKbRaf = requestAnimationFrame(applyComposerKeyboardInset);
  }

  function scheduleComposerKeyboardInsetBurst() {
    scheduleComposerKeyboardInset();
    [120, 320].forEach(function (ms) {
      window.setTimeout(scheduleComposerKeyboardInset, ms);
    });
  }

  function clearComposerKeyboardInset() {
    document.documentElement.style.setProperty('--ce2-composer-kb', '0px');
    document.documentElement.style.setProperty('--ce2-vv-offset', '0px');
    document.body.classList.remove('ce2-kb-active', 'ce2-composer-kb-active');
    clearCe2SheetPanelStyles();
  }

  function syncCe2VisualViewport() {
    scheduleComposerKeyboardInset();
  }

  /** iOS form accessory (↑↓✓ bar) shows when multiple inputs exist — only one active field at a time */
  function syncCe2FocusableInputs() {
    var active = document.activeElement;
    var composerFocused = !!(active && active.closest && active.closest('.ce2-composer'));
    var searchIds =
      root.Ce2ThreadSearch && root.Ce2ThreadSearch.SEARCH_FIELD_IDS
        ? root.Ce2ThreadSearch.SEARCH_FIELD_IDS
        : ['ce2ThreadSearchInput'];
    var searchFocused = !!(active && searchIds.indexOf(active.id) >= 0);
    var editFocused = !!(active && active.closest && active.closest('.ce2-sheet--edit'));

    document.querySelectorAll('.ce2-sheet').forEach(function (sheet) {
      var off;
      if (sheet.id === 'ce2EditSheet') {
        off = sheet.hidden;
      } else {
        off =
          sheet.hidden ||
          (composerFocused && !editFocused) ||
          (searchFocused && !editFocused);
      }
      sheet.querySelectorAll('input, textarea, select').forEach(function (node) {
        node.disabled = off;
        if (off) node.setAttribute('tabindex', '-1');
        else node.removeAttribute('tabindex');
      });
    });
    var searchBar = el('ce2ThreadSearch');
    searchIds.forEach(function (id) {
      var node = el(id);
      if (!node) return;
      var off = !searchBar || searchBar.hidden || composerFocused || editFocused;
      if (searchFocused && active && node !== active) off = true;
      node.disabled = off;
      if (off) node.setAttribute('tabindex', '-1');
      else node.removeAttribute('tabindex');
    });
    var composerInput = el('ce2Input');
    if (composerInput) {
      var composerOff = searchFocused || editFocused;
      composerInput.disabled = composerOff;
      if (composerOff) composerInput.setAttribute('tabindex', '-1');
      else composerInput.removeAttribute('tabindex');
    }
    var drawer = el('ce2ComposerDrawer');
    var drawerOff = !drawer || drawer.hidden;
    ['ce2BoardShareUrl', 'ce2ClassSelect'].forEach(function (id) {
      var node = el(id);
      if (!node) return;
      node.disabled = drawerOff;
      if (drawerOff) node.setAttribute('tabindex', '-1');
      else node.removeAttribute('tabindex');
    });
    var shareCb = el('ce2Shareable');
    if (shareCb) {
      shareCb.disabled = drawerOff;
      if (drawerOff) shareCb.setAttribute('tabindex', '-1');
      else shareCb.removeAttribute('tabindex');
    }
  }

  function clearCe2SheetPanelStyles() {
    document.querySelectorAll('.ce2-sheet').forEach(function (sheet) {
      sheet.classList.remove('ce2-sheet--above-keyboard');
    });
    document.documentElement.style.setProperty('--ce2-edit-kb', '0px');
  }

  function bindCe2ComposerKeyboard() {
    if (window.__ce2ComposerKbBound) return;
    window.__ce2ComposerKbBound = true;
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleComposerKeyboardInset);
      window.visualViewport.addEventListener('scroll', scheduleComposerKeyboardInset);
    }
  }

  function bindCe2EditInput() {
    var editInput = el('ce2EditInput');
    if (!editInput || editInput.__ce2EditKbBound) return;
    editInput.__ce2EditKbBound = true;
    editInput.addEventListener('focus', function () {
      syncCe2FocusableInputs();
      requestAnimationFrame(syncCe2VisualViewport);
    });
    editInput.addEventListener('blur', function () {
      window.setTimeout(function () {
        syncCe2FocusableInputs();
        syncCe2VisualViewport();
      }, 200);
    });
  }

  var composerInputRaf = 0;

  function syncCe2ComposerInputHeight(target, opts) {
    opts = opts || {};
    var input = target || el('ce2Input');
    if (!input) return;
    var cs = window.getComputedStyle(input);
    var max = parseInt(cs.maxHeight, 10);
    if (!max || isNaN(max)) max = 132;
    var min = parseInt(cs.minHeight, 10);
    if (!min || isNaN(min)) min = 38;
    var shell = input.closest && input.closest('.ce2-input-shell');
    var empty = !String(input.value || '').length;
    input.style.overflowY = 'hidden';
    input.style.height = '0px';
    var next = Math.min(Math.max(input.scrollHeight, min), max);
    input.style.height = next + 'px';
    input.style.overflowY = input.scrollHeight > max ? 'auto' : 'hidden';
    input.__ce2ComposerHeightPx = next;
    if (shell) {
      if (empty && next <= min) shell.style.minHeight = '';
      else shell.style.minHeight = next + 'px';
    }
    if (!opts.skipMirror && root.Ce2Format && root.Ce2Format.syncInputMirror) {
      root.Ce2Format.syncInputMirror();
    }
  }

  function runComposerInputChange() {
    var input = el('ce2Input');
    if (!input) return;
    if (root.Ce2Format && root.Ce2Format.syncInputMirrorFast) {
      root.Ce2Format.syncInputMirrorFast();
    } else if (root.Ce2Format && root.Ce2Format.syncInputMirror) {
      root.Ce2Format.syncInputMirror();
    }
    var ac = CommunicationState.activeConversation;
    var me = CommunicationState.me;
    if (ac && me && root.Ce2Drafts) {
      root.Ce2Drafts.scheduleSave(me.uid, threadComposerKey(ac), input.value);
    }
    var prev = input.__ce2ComposerHeightPx || 0;
    syncCe2ComposerInputHeight(input, { skipMirror: true });
    var next = parseInt(input.style.height, 10) || 0;
    input.__ce2ComposerHeightPx = next;
    if (next > prev && document.activeElement === input) {
      requestAnimationFrame(scrollMessagesToEnd);
    }
  }

  function onCe2ComposerInputChange() {
    if (composerInputRaf) return;
    composerInputRaf = requestAnimationFrame(function () {
      composerInputRaf = 0;
      runComposerInputChange();
    });
  }

  function bindCe2ComposerInput() {
    initComposerDraftPersistence();
    var input = el('ce2Input');
    if (!input || input.__ce2InputBound) return;
    input.__ce2InputBound = true;
    syncCe2ComposerInputHeight(input);

    input.addEventListener('input', onCe2ComposerInputChange);
    input.addEventListener('paste', function () {
      requestAnimationFrame(onCe2ComposerInputChange);
    });

    input.addEventListener('focus', function () {
      dismissThreadSearch();
      syncCe2FocusableInputs();
      scheduleComposerKeyboardInsetBurst();
      requestAnimationFrame(function () {
        scheduleComposerKeyboardInset();
        scrollMessagesToEnd();
      });
    });
    input.addEventListener('blur', function () {
      persistActiveComposerDraft();
      if (root.Ce2Format && root.Ce2Format.flushInputMirrorFormat) {
        root.Ce2Format.flushInputMirrorFormat();
      }
      setTimeout(function () {
        syncCe2FocusableInputs();
        clearComposerKeyboardInset();
      }, 200);
    });
  }

  function initCe2AudioPlayback() {
    if (!root.Ce2AudioPlayback) return;
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && root.Ce2AudioPlayback) {
        root.Ce2AudioPlayback.pause();
      }
    });
  }

  function initCe2AudioRecorder() {
    if (!root.Ce2AudioRecorder) return;
    root.Ce2AudioRecorder.init({
      getState: function () {
        return CommunicationState;
      },
      requestRender: requestRender,
      onFileReady: function (file, meta) {
        CommunicationState.error = null;
        setAttachStatus('', '');
        startVoiceNoteUpload(file, meta || {});
      },
      onError: function (err) {
        surfaceComposerError((err && err.message) || 'Voice recording failed.');
        render();
      },
      onHint: function (msg) {
        setAttachStatus(msg, 'ok');
        syncComposerAlert();
      },
    });
  }

  function wireUi() {
    bindCe2ComposerKeyboard();
    bindCe2EditInput();
    bindCe2ComposerInput();
    if (root.Ce2Format && typeof root.Ce2Format.init === 'function') {
      root.Ce2Format.init({
        getInput: function () {
          return el('ce2Input');
        },
        onInputChange: onCe2ComposerInputChange,
      });
    }
    initCe2AudioPlayback();
    initCe2AudioRecorder();
    bindCe2VoiceUploadActions();
    initCe2MessageActions();
    initCe2ThreadSearch();
    wireCe2DelegatedClick();
    bindInboxGestures();
    bindHubNav();

    document.querySelectorAll('.ce2-tab').forEach(function (btn) {
      function onDiscoveryTab(e) {
        if (e.type === 'pointerup' && e.pointerType === 'mouse' && e.button !== 0) return;
        document.querySelectorAll('.ce2-tab').forEach(function (b) {
          b.classList.remove('is-active');
        });
        btn.classList.add('is-active');
        CommunicationState.discoveryMode = btn.getAttribute('data-discovery') || 'mentors';
        render();
        if (CommunicationState.me) {
          reloadDiscoveryForActiveTab()
            .then(function () {
              render();
            })
            .catch(function () {
              render();
            });
        }
      }
      btn.addEventListener('pointerup', onDiscoveryTab);
      btn.addEventListener('click', onDiscoveryTab);
    });

    var sendBtn = el('ce2SendBtn');
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);

    var joinBtn = el('ce2JoinDemo');
    if (joinBtn) joinBtn.addEventListener('click', joinSelectedGroup);

    var moreBtn = el('ce2ComposerMore');
    var drawer = el('ce2ComposerDrawer');
    if (moreBtn && drawer) {
      moreBtn.addEventListener('click', function () {
        var open = drawer.hidden;
        drawer.hidden = !open;
        moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        moreBtn.classList.toggle('is-open', open);
        syncCe2FocusableInputs();
      });
    }

    var attachWrap = el('ce2AttachWrap');
    var attachInput = el('ce2AttachInput');
    if (attachWrap && attachInput) {
      attachWrap.addEventListener('click', function (e) {
        if (attachWrap.classList.contains('is-disabled')) {
          e.preventDefault();
          surfaceComposerError('Open a thread before attaching a photo or video.');
          render();
        }
      });
      attachInput.addEventListener('change', function () {
        var files = attachInput.files;
        if (!files || !files.length) {
          attachInput.value = '';
          return;
        }
        try {
          addComposerFiles(files);
        } catch (err) {
          surfaceComposerError((err && err.message) || 'Could not attach file.');
          render();
        }
        attachInput.value = '';
      });
    }
    syncAttachInputState();

    var replyCancel = el('ce2ReplyCancel');
    if (replyCancel) {
      replyCancel.addEventListener('click', clearReply);
    }

    document.addEventListener('click', function (e) {
      if (e.target && e.target.id === 'ce2LoadOlder') {
        loadOlderMessages().catch(handleCe2Error);
      }
      if (e.target && e.target.id === 'ce2SearchJumpBack') {
        clearSearchJump();
      }
    });

    var backListBtn = el('ce2BackToList');
    if (backListBtn) {
      backListBtn.addEventListener('click', function () {
        bumpThreadOpenToken();
        stopMessagesWatch();
        CommunicationState.activeConversation = null;
        CommunicationState.messages = [];
        CommunicationState.selectedDiscoveryUid = null;
        CommunicationState.mobileHubPanel = 'discover';
        CommunicationState.error = null;
        CommunicationState.statusMessage = null;
        CommunicationState.sending = false;
        render();
      });
    }
  }

  async function flushCe2OfflineQueue() {
    var q = root.Ce2OfflineQueue;
    var me = CommunicationState.me;
    if (!q || !me || CommunicationState.offline) return;
    var items = q.list();
    if (!items.length) return;
    var sent = 0;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      try {
        var patchAc = {
          type: item.convType || 'direct',
          id: item.convId,
          otherUid: item.otherUid,
          convReady: !!item.convId,
        };
        if (patchAc.type === 'direct' && item.otherUid && !patchAc.id) {
          patchAc.id = await ensureDirectConv(item.otherUid);
          patchAc.convReady = true;
        }
        var now = firebase.firestore.Timestamp.now();
        var patch = {
          content: item.text || '',
          classification: item.classification || 'foundation',
          shareable: !!item.shareable,
          senderId: me.uid,
          createdAt: now,
          messageType: 'text',
        };
        var messageId = await commitCe2Message(patchAc, patch, me);
        triggerCe2Push(patchAc, patch.content || '', me, messageId);
        patchThreadPreviewLocal(patchAc, patch);
        q.remove(item.id);
        sent++;
      } catch (err) {
        console.warn('flushCe2OfflineQueue', err);
        break;
      }
    }
    if (sent) {
      CommunicationState.statusMessage =
        sent === 1 ? 'Sent 1 queued message' : 'Sent ' + sent + ' queued messages';
      scheduleLoadThreads(me.uid);
    }
  }

  root.ce2FlushOfflineQueue = flushCe2OfflineQueue;
  root.syncCe2ComposerInputHeight = syncCe2ComposerInputHeight;
  root.CommunicationState = CommunicationState;
  root.Ce2Runtime = {
    isMessengerThreadOpen: function (notif) {
      return isNotifForOpenThread(notif);
    },
    ingestIncomingNotif: function (notif) {
      ingestIncomingNotif(notif);
    },
    /** QA: paint presence without a second session. stateOrMs = 'online'|'away'|'recent'|epochMs */
    simulatePresence: function (uid, stateOrMs) {
      var pr = presence();
      if (!pr || !uid) return null;
      var ts = Date.now();
      if (stateOrMs === 'away') ts -= 4 * 60 * 1000;
      else if (stateOrMs === 'recent' || stateOrMs === 'offline') ts -= 20 * 60 * 1000;
      else if (typeof stateOrMs === 'number') ts = stateOrMs;
      var rec = pr.statusFromTs(ts);
      CommunicationState.presenceByUid[uid] = rec;
      applyPresenceUi();
      return rec;
    },
    /** QA: paint typing without a second session. uids = string or array of other uids */
    simulateTyping: function (uids, namesByUid) {
      var list = !uids
        ? []
        : Object.prototype.toString.call(uids) === '[object Array]'
          ? uids
          : [uids];
      var ac = CommunicationState.activeConversation;
      CommunicationState.typingUids = list.filter(Boolean);
      if (namesByUid) {
        Object.keys(namesByUid).forEach(function (uid) {
          var rec = CommunicationState.presenceByUid[uid] || {};
          rec.name = namesByUid[uid];
          CommunicationState.presenceByUid[uid] = rec;
        });
      }
      CommunicationState.typingLabel = currentTypingLabel(ac);
      updateTypingLineOnly();
      return CommunicationState.typingLabel;
    },
  };

  async function boot(user) {
    resetCe2UiBlockers();
    if (typeof db.enableNetwork === 'function') {
      db.enableNetwork().catch(function () {});
    }
    CommunicationState.loading = true;
    CommunicationState.visibleGroups = [];
    CommunicationState.threads = [];
    CommunicationState.visibleUsers = [];
    render();

    var uref = db.collection('users').doc(user.uid);
    var udoc;
    try {
      udoc = await uref.get();
    } catch (profileErr) {
      handleCe2Error(profileErr, 'boot');
      CommunicationState.loading = false;
      render();
      return;
    }
    var data = udoc.exists ? udoc.data() : {};
    if (!udoc.exists) {
      CommunicationState.statusMessage =
        'Your network profile is missing — some messenger features may be limited until an admin creates your users document.';
    }
    CommunicationState.me = normalizeCe2User(user.uid, data);
    CommunicationState.loading = false;
    render();
    startPresenceLayer(user.uid);

    if (isMessagingSuspended()) {
      CommunicationState.statusMessage =
        'Messaging is paused for your account. You can read threads but cannot send until restored.';
      showAlert(CommunicationState.statusMessage, 'warn');
    }

    var prefs =
      window.Ce2MessageActions && window.Ce2MessageActions.loadUserPrefs
        ? window.Ce2MessageActions.loadUserPrefs(user.uid, { lite: true })
        : Promise.resolve();

    var listsPromise = promiseWithTimeout(
      Promise.all([
        loadInboxPrefs(user.uid).then(function () {
          return Promise.all([
            loadGroupsForUser(CommunicationState.me),
            loadThreads(user.uid),
          ]);
        }),
        prefs,
      ]),
      15000,
      'CE2 boot'
    ).catch(function (bootErr) {
      console.warn('CE2 boot partial failure', bootErr);
      CommunicationState.statusMessage =
        'Some lists loaded slowly — pull to refresh or switch tabs again.';
    });

    if (window.Ce2Pwa && typeof window.Ce2Pwa.init === 'function') {
      try {
        window.Ce2Pwa.init(user.uid);
      } catch (pwaErr) {
        console.warn('[CE2 PWA]', pwaErr);
      }
    }
    if (window.Ce2Nudges && typeof window.Ce2Nudges.init === 'function') {
      window.Ce2Nudges.init(CommunicationState.me);
    }

    CommunicationState.discoveryLoaded = false;
    var menteesTab = document.querySelector('.ce2-tab-mentees');
    if (menteesTab && (CommunicationState.me.mentor || CommunicationState.me.isAdmin)) {
      menteesTab.hidden = false;
    }

    try {
      await Promise.all([
        listsPromise,
        applyCe2EntryParams(user.uid).catch(function (linkErr) {
          console.warn('applyCe2EntryParams', linkErr);
        }),
      ]);
    } catch (_) {}
    render();
    startInboxLayer(CommunicationState.me);

    if (!CommunicationState.offline) {
      flushCe2OfflineQueue().catch(function (e) {
        console.warn('flushCe2OfflineQueue', e);
      });
      hydrateVoiceOutboxPending().catch(function (e) {
        console.warn('hydrateVoiceOutbox', e);
      });
    }
    window.addEventListener('online', function () {
      CommunicationState.offline = false;
      flushCe2OfflineQueue().catch(function () {});
      hydrateVoiceOutboxPending()
        .then(function () {
          return flushCe2AudioOutbox();
        })
        .catch(function () {});
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    resetCe2UiBlockers();
    window.setTimeout(resetCe2UiBlockers, 400);
    window.setTimeout(resetCe2UiBlockers, 2000);
    wireUi();

    if (typeof auth === 'undefined' || typeof db === 'undefined') {
      CommunicationState.error = 'Firebase not ready.';
      render();
      return;
    }

    auth.onAuthStateChanged(function (user) {
      if (!user) {
        ce2BootedUid = null;
        stopPresenceLayer();
        window.location.href =
          '/auth?next=' + encodeURIComponent(window.location.pathname + window.location.search);
        return;
      }
      if (ce2BootedUid === user.uid) return;
      ce2BootedUid = user.uid;
      stopMessagesWatch();
      stopInboxWatches();
      boot(user).catch(function (err) {
        handleCe2Error(err, 'boot');
        CommunicationState.loading = false;
        render();
      });
    });
  });
  console.log(
    '[CE2] delivery stable ' +
      CE2_DELIVERY_STABLE_VERSION +
      ' rollback=' +
      CE2_DELIVERY_ROLLBACK +
      (CE2_DELIVERY_EXPERIMENTAL ? ' experimental=on pass=A-meta-primary' : '')
  );
  console.log(
    '[CE2] communication-v2.js ' +
      CE2_KEYBOARD_STABLE_VERSION +
      ' (header+gap stable) rollback=' +
      CE2_KEYBOARD_ROLLBACK
  );
  if (root.Ce2AudioRecorder) {
    console.log('[CE2] ce2-audio-recorder.js Phase 1A');
  }
  if (root.Ce2AudioOutbox) {
    console.log('[CE2] ce2-audio-outbox.js Phase 1B');
  }
  if (root.Ce2AudioPlayback) {
    console.log('[CE2] ce2-audio-playback.js Phase 1C');
  }
  if (root.Ce2AudioWaveform) {
    console.log('[CE2] ce2-audio-waveform.js Phase 1D');
  }
  console.log('[CE2] audio rollback=ce2-audio-stable-1d');
  if (presence()) {
    console.log(
      '[CE2] presence v' +
        presence().VERSION +
        ' (online/last-seen · typing ' +
        (CE2_TYPING_INDICATOR_ENABLED ? 'on' : 'off') +
        ')'
    );
  }
})();
