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
  var messengerNotifUnsub = null;
  var messengerNotifFirst = true;
  var ce2BootedUid = null;
  var ce2UiWired = false;
  var renderRaf = 0;
  var MESSAGE_PAGE = 50;
  /** Off until real-time delivery is stable — stale typing pulses confuse users. */
  var CE2_TYPING_INDICATOR_ENABLED = false;
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
    highlightMessageId: null,
    offline: false,
    discoveryLoaded: false,
    shareDraft: null,
    _renderedMsgIds: null,
    _metaLastMessageId: null,
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
    if (!groupId || !data) return;
    var me = CommunicationState.me;
    var rc = receipts();
    var g = (CommunicationState.visibleGroups || []).find(function (row) {
      return row.id === groupId;
    });
    if (!g || !me || !rc) return;
    g.unread = rc.unreadCount(data, me.uid);
    if (data.lastPreview) g.lastPreview = String(data.lastPreview).trim();
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
   */
  function normalizeCe2User(uid, raw) {
    const d = raw || {};
    const tier = normalizeTier(d.tier);
    return {
      uid,
      email: d.email || null,
      name: d.name || d.displayName || d.email || 'Member',
      tier,
      tierLevel:
        typeof d.tierLevel === 'number' && !Number.isNaN(d.tierLevel)
          ? d.tierLevel
          : (gov() && gov().tierRank ? gov().tierRank(tier) : 0),
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

  function receipts() {
    return typeof window !== 'undefined' ? window.Ce2Receipts : null;
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
    CommunicationState.typingLabel = null;
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

  function hideTypingIndicator() {
    CommunicationState.typingLabel = null;
    updateTypingLineOnly();
  }

  function updateTypingFromMeta(data, ac) {
    if (!CE2_TYPING_INDICATOR_ENABLED) {
      hideTypingIndicator();
      return;
    }
    var pr = presence();
    var me = CommunicationState.me;
    if (!pr || !me || !data) {
      hideTypingIndicator();
      return;
    }
    var input = el('ce2Input');
    if (
      CommunicationState.sending ||
      (input &&
        (document.activeElement === input || (input.value || '').trim().length > 0))
    ) {
      hideTypingIndicator();
      return;
    }
    var rc = receipts();
    var typing = data.typing || {};
    var nowSec = Date.now() / 1000;
    var activeUids = Object.keys(typing).filter(function (uid) {
      if (uid === me.uid) return false;
      var ts = typing[uid];
      if (!ts || !pr.isTypingActive(ts)) return false;
      var typSec = rc ? rc.tsSeconds(ts) : 0;
      if (!typSec || nowSec - typSec > 3) return false;
      if (data.lastSenderId === uid && data.lastMessageAt) {
        var msgSec = rc.tsSeconds(data.lastMessageAt);
        if (typSec <= msgSec) return false;
      }
      return true;
    });
    CommunicationState.typingLabel = formatTypingLabel(activeUids, ac);
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

  function formatTypingLabel(activeUids, ac) {
    if (!activeUids || !activeUids.length) return null;
    if (ac && ac.type === 'direct' && activeUids.length === 1) {
      var peerName = (ac.title || '').trim() || 'They';
      return peerName + ' is typing…';
    }
    if (activeUids.length === 1) {
      return 'Someone is typing…';
    }
    if (activeUids.length === 2) {
      return '2 people are typing…';
    }
    return activeUids.length + ' people are typing…';
  }

  function watchConvMeta(ac) {
    stopConvMetaWatch();
    var me = CommunicationState.me;
    var ref = getMetaDocRef(ac);
    if (!ref || !me) return;
    var pr = presence();
    var rc = receipts();
    convMetaUnsub = ref.onSnapshot(
      function (snap) {
        var data = snap.exists ? snap.data() : null;
        CommunicationState.convMeta = data;
        var acNow = CommunicationState.activeConversation;
        if (data && acNow && !acNow.needsJoin) {
          handleMetaMessageDelivery(data);
          updateTypingFromMeta(data, acNow);
        } else {
          CommunicationState.typingLabel = null;
          updateTypingLineOnly();
        }
        if (!acNow || acNow.needsJoin) return;
        if (acNow.type === 'group' && snap.exists) {
          syncVisibleGroupMeta(acNow.id, snap.data());
          requestRender({ throttle: true });
        } else if (acNow.type === 'direct') {
          updateReadReceiptFooters(acNow);
        }
      },
      function () {}
    );
    var input = el('ce2Input');
    if (CE2_TYPING_INDICATOR_ENABLED && pr && input) {
      typingInputUnsub = pr.bindTypingInput(input, ref, me.uid, 5000);
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
    var groups = 0;
    var direct = 0;
    (CommunicationState.visibleGroups || []).forEach(function (g) {
      if (g.unread > 0) groups += g.unread;
    });
    (CommunicationState.threads || []).forEach(function (t) {
      if (t.unread > 0) direct += t.unread;
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
      canUnsendMessage: canUnsendMessage,
      unsendMessage: unsendMessage,
      handleCe2Error: handleCe2Error,
      render: render,
      requestRender: requestRender,
      copyMessageText: copyMessageText,
      removeOptimisticMessage: removeOptimisticMessage,
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
      syncComposerInputHeight: syncCe2ComposerInputHeight,
      isCoarsePointer: function () {
        return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
      },
      isInteractiveMsgTarget: function (node) {
        return !!(
          node &&
          node.closest &&
          node.closest('a, button, audio, video, input, textarea, select, label')
        );
      },
    });
    window.Ce2MessageActions.wireMessageMenuUi();
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
    if (!canReadClassification(reader, message.classification)) return false;
    if (!governanceEnabled() || !activeConversation) return true;
    if (typeof activeConversation.securityLevel !== 'number') return true;
    if (message.senderId === (reader && reader.uid)) return true;
    var g = gov();
    return g.classificationAllowedAtFloor(message.classification, activeConversation.securityLevel);
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
    var rc = receipts();
    var ref = getMetaDocRef(ac);
    var me = CommunicationState.me;
    if (rc && ref && me) {
      rc.markRead(ref, me.uid).then(function () {
        if (ac && ac.type === 'group') scheduleLoadGroups(me.uid);
        else scheduleLoadThreads(me.uid);
      });
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

  function sidebarListLoadingHtml(label) {
    return (
      '<li class="ce2-placeholder ce2-placeholder-loading" aria-busy="true">' +
      escapeHtml(label || 'Loading…') +
      '</li>'
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
          li.className =
            'ce2-li' + (CommunicationState.selectedGroupId === g.id ? ' is-selected' : '');
          li.dataset.groupId = g.id;
          var gMeta = listMetaLine(u.uid, 'g:' + g.id, g.lastPreview || '');
          var gSub = gMeta.text;
          if (!gSub && !gMeta.isDraft) {
            gSub = 'requires ' + g.requiredTier + (g.mentorLed ? ' · mentor-led' : '');
          }
          li.innerHTML =
            '<div class="ce2-li-row"><span class="ce2-avatar">' +
            escapeHtml(personInitial(g.name)) +
            '</span><span class="ce2-li-body"><div class="ce2-li-name-row"><div class="ce2-li-name">' +
            escapeHtml(g.name) +
            '</div>' +
            (g.unread
              ? '<span class="ce2-unread-badge">' +
                (g.unread > 99 ? '99+' : String(g.unread)) +
                '</span>'
              : '') +
            '</div><div class="ce2-li-meta' +
            (gMeta.isDraft ? ' ce2-li-meta--draft' : '') +
            '">' +
            escapeHtml(gSub) +
            '</div></span></div>';
          li.dataset.action = 'select-group';
          li.dataset.groupName = g.name || 'Group';
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
          li.className =
            'ce2-li' +
            (CommunicationState.activeConversation &&
            CommunicationState.activeConversation.id === t.id &&
            CommunicationState.activeConversation.type === 'direct'
              ? ' is-selected'
              : '');
          li.innerHTML =
            '<div class="ce2-li-row"><span class="ce2-avatar">' +
            escapeHtml(personInitial(t.label)) +
            '</span><span class="ce2-li-body"><div class="ce2-li-name-row"><div class="ce2-li-name">' +
            escapeHtml(t.label) +
            '</div>' +
            (t.unread
              ? '<span class="ce2-unread-badge">' +
                (t.unread > 99 ? '99+' : String(t.unread)) +
                '</span>'
              : '') +
            '</div><div class="ce2-li-meta' +
            (tMeta.isDraft ? ' ce2-li-meta--draft' : '') +
            '">' +
            escapeHtml(tMeta.text) +
            '</div></span></div>';
          li.dataset.action = 'open-thread';
          li.dataset.convId = t.id;
          li.dataset.otherUid = t.otherUid || '';
          li.dataset.label = t.label || 'Direct';
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
            '<div class="ce2-li-row"><span class="ce2-avatar">' +
            escapeHtml(personInitial(x.name)) +
            '</span><span class="ce2-li-body"><div class="ce2-li-name">' +
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
    }

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

  function patchThreadPreviewLocal(ac, preview) {
    if (!ac || !preview) return;
    var text = String(preview).slice(0, 140);
    if (ac.type === 'direct') {
      var threads = CommunicationState.threads || [];
      for (var i = 0; i < threads.length; i++) {
        if (threads[i].convId === ac.id || threads[i].id === ac.id) {
          threads[i].sub = text;
          return;
        }
      }
      return;
    }
    if (ac.type === 'group') {
      var groups = CommunicationState.visibleGroups || [];
      for (var j = 0; j < groups.length; j++) {
        if (groups[j].id === ac.id) {
          groups[j].lastPreview = text;
          return;
        }
      }
    }
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
      CommunicationState.typingLabel = null;
      updateTypingLineOnly();
      return;
    }

    CommunicationState._metaLastMessageId = msgId;
    CommunicationState.typingLabel = null;
    updateTypingLineOnly();

    var preview = {
      id: msgId,
      senderId: data.lastSenderId,
      content: data.lastPreview || '',
      createdAt: data.lastMessageAt || firebase.firestore.Timestamp.now(),
      conversationId: ac.id,
      messageType: data.lastMessageType || 'text',
    };
    forceAppendIncomingMessage(preview, ac, true);
    patchThreadPreviewLocal(ac, preview.content);
    fetchAndShowMessage(msgId, ac);
  }

  function reconcileRenderedMessage(msg, ac) {
    var scroll = el('ce2MessageScroll');
    if (!scroll || !msg || !msg.id) return;
    var row = scroll.querySelector('[data-message-id="' + msg.id + '"]');
    if (!row || !row.classList.contains('is-meta-preview')) return;
    row.replaceWith(buildMessageRow(msg, ac));
    if (root.Ce2AudioPlayback) root.Ce2AudioPlayback.syncAll();
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

    CommunicationState.typingLabel = null;
    updateTypingLineOnly();

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
    patchThreadPreviewLocal(ac, content);
  }

  function fetchAndShowMessage(messageId, ac) {
    if (!messageId || !ac || isMessageAlreadyRendered(messageId)) return;
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
        CommunicationState.typingLabel = null;
        updateTypingLineOnly();
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
    CommunicationState.typingLabel = null;
    updateTypingLineOnly();
    forceAppendIncomingMessage(preview, ac, true);
    patchThreadPreviewLocal(ac, preview.content);
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
      CommunicationState.typingLabel = null;
      updateTypingLineOnly();

      var msg = Object.assign({ id: msgId }, data);
      mergeMessageIntoState(msg);
      forceAppendIncomingMessage(msg, ac, true);
      patchThreadPreviewLocal(ac, data.content || '');
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
    return (CommunicationState.messages || []).filter(function (m) {
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
    var typingEl = el('ce2TypingLine');
    if (!typingEl) return;
    var typingText = typingEl.querySelector('.ce2-typing-text');
    var show =
      CE2_TYPING_INDICATOR_ENABLED &&
      CommunicationState.typingLabel &&
      ac &&
      !ac.needsJoin;
    if (show) {
      typingEl.hidden = false;
      if (typingText) typingText.textContent = CommunicationState.typingLabel;
      else typingEl.textContent = CommunicationState.typingLabel;
    } else {
      typingEl.hidden = true;
      if (typingText) typingText.textContent = '';
      else typingEl.textContent = '';
    }
  }

  function updateReadReceiptFooters(ac) {
    if (!ac || ac.type !== 'direct' || !CommunicationState.me) return;
    var scroll = el('ce2MessageScroll');
    if (!scroll) return;
    var rc = receipts();
    if (!rc) return;
    var otherRead =
      CommunicationState.convMeta && CommunicationState.convMeta.lastRead
        ? CommunicationState.convMeta.lastRead[ac.otherUid]
        : null;
    scroll.querySelectorAll('.ce2-row.is-self').forEach(function (row) {
      var mid = row.dataset.messageId;
      if (!mid || String(mid).indexOf('pending-') === 0) return;
      var m = CommunicationState.messages.find(function (x) {
        return x.id === mid;
      });
      if (!m) return;
      var footMeta = row.querySelector('.ce2-msg-foot-meta');
      if (!footMeta) return;
      var status = rc.deliveryStatus(m, CommunicationState.me.uid, otherRead);
      footMeta.textContent =
        (status ? rc.statusLabel(status) + ' · ' : '') + (fmtTime(m.createdAt) || '');
    });
  }

  function buildMessageRow(m, ac) {
    var ma = msgActions();
    const self = CommunicationState.me && m.senderId === CommunicationState.me.uid;
    var searchQ = CommunicationState.threadSearchQuery || '';
    var searchHit = searchQ && ma && ma.messageMatchesSearch(m, searchQ);
    var isHighlight =
      CommunicationState.highlightMessageId &&
      m.id === CommunicationState.highlightMessageId;
    const row = document.createElement('div');
    row.className =
      'ce2-row' +
      (self ? ' is-self' : '') +
      (m._pending ? ' is-pending' : '') +
      (m.uploadState === 'failed' ? ' is-voice-failed' : '') +
      (searchHit ? ' is-search-hit' : '') +
      (isHighlight ? ' is-highlighted' : '');
    row.dataset.messageId = m.id || '';
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
      if (ma) ma.appendReactionsRow(bubble, m);
    } else {
      bubble.appendChild(
        document.createTextNode('This space unlocks through formation progression.')
      );
    }
    row.appendChild(bubble);
    const foot = document.createElement('div');
    foot.className = 'ce2-msg-foot';
    var rc = receipts();
    var otherRead =
      ac && ac.type === 'direct' && CommunicationState.convMeta
        ? (CommunicationState.convMeta.lastRead || {})[ac.otherUid]
        : null;
    var status =
      rc && self && !m._pending
        ? rc.deliveryStatus(m, CommunicationState.me.uid, otherRead)
        : m._pending
          ? 'pending'
          : '';
    var footMeta = document.createElement('span');
    footMeta.className = 'ce2-msg-foot-meta';
    if (m._voiceLocalId && m.uploadState === 'uploading') {
      footMeta.textContent =
        'Uploading voice… ' + Math.round((m.uploadProgress || 0) * 100) + '%';
    } else if (m._voiceLocalId && m.uploadState === 'retrying') {
      footMeta.textContent = 'Retrying upload…';
    } else if (m._voiceLocalId && m.uploadState === 'failed') {
      footMeta.textContent = 'Failed to send';
    } else {
      footMeta.textContent = m._pending
        ? 'Sending…'
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
      CommunicationState.highlightMessageId
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

    if (!CommunicationState.messages.length) {
      invalidateMessageRenderCache();
      closeMessageMenu();
      scroll.innerHTML = '<div class="ce2-placeholder">No messages yet.</div>';
      updateTypingLineOnly();
      return;
    }

    var visibleMsgs = getVisibleMessages(ac);
    if (tryIncrementalMessageRender(scroll, ac, visibleMsgs, stickBottom)) {
      return;
    }

    invalidateMessageRenderCache();
    closeMessageMenu();
    scroll.innerHTML = '';
    if (CommunicationState.hasMoreMessages) {
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
  }


  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
      bubble.insertAdjacentHTML('beforeend', sh.renderBoardShareHtml(m, escapeHtml));
      if (m.content) {
        var cap = document.createElement('p');
        cap.className = 'ce2-msg-caption';
        cap.textContent = m.content;
        bubble.appendChild(cap);
      }
      return;
    }
    if (m.imageUrl) {
      var img = document.createElement('img');
      img.className = 'ce2-msg-image';
      img.alt = 'Attachment';
      img.loading = 'lazy';
      img.src = m.imageUrl;
      bubble.appendChild(img);
    }
    if (m.videoUrl) {
      var vid = document.createElement('video');
      vid.className = 'ce2-msg-video';
      vid.controls = true;
      vid.preload = 'metadata';
      vid.src = m.videoUrl;
      bubble.appendChild(vid);
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
      var cell =
        kind === 'video'
          ? '<video src="' + escapeHtml(src) + '" class="ce2-attach-thumb-vid" muted playsinline></video>'
          : kind === 'audio'
            ? '<span class="ce2-attach-thumb-aud">🎙</span>'
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
      var attMod = attachments();
      var uploadingVideo =
        slot.localFile && attMod && attMod.isVideoFile && attMod.isVideoFile(slot.localFile);
      var uploadingCell =
        uploadingVideo
          ? '<video src="' +
            escapeHtml(slot.localPreviewUrl) +
            '" class="ce2-attach-thumb-vid" muted playsinline></video>'
          : '<img src="' +
            escapeHtml(slot.localPreviewUrl) +
            '" alt="" class="ce2-attach-thumb-img">';
      html +=
        '<div class="ce2-attach-cell ce2-attach-cell-uploading">' +
        uploadingCell +
        '<span class="ce2-attach-pct">' +
        pct +
        '%</span></div>';
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
          if (!firstSnap && me && ac) {
            snap.docChanges().forEach(function (change) {
              if (change.type !== 'added') return;
              var data = change.doc.data();
              if (!data.senderId || data.senderId === me.uid) return;
              var msgId = change.doc.id;
              if (isMessageAlreadyRendered(msgId)) return;
              CommunicationState._metaLastMessageId = msgId;
              CommunicationState.typingLabel = null;
              updateTypingLineOnly();
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
          syncMessagePanelFromSnap(ac);
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

  async function loadOlderMessages() {
    var ac = CommunicationState.activeConversation;
    var me = CommunicationState.me;
    if (!ac || !me || CommunicationState.loadingOlder || !CommunicationState.messages.length) {
      return;
    }
    if (!CommunicationState.oldestMessageDoc) return;
    CommunicationState.loadingOlder = true;
    render();
    try {
      var col =
        ac.type === 'direct'
          ? db.collection('ce2_conversations').doc(ac.id).collection('ce2_messages')
          : db.collection('communicationGroups').doc(ac.id).collection('ce2_messages');
      var snap = await col
        .orderBy('createdAt', 'asc')
        .endBefore(CommunicationState.oldestMessageDoc)
        .limitToLast(MESSAGE_PAGE)
        .get();
      if (!snap.docs.length) {
        CommunicationState.hasMoreMessages = false;
        return;
      }
      CommunicationState.oldestMessageDoc = snap.docs[0];
      var older = snap.docs.map(function (d) {
        return Object.assign({ id: d.id }, d.data());
      });
      CommunicationState.hasMoreMessages = snap.docs.length >= MESSAGE_PAGE;
      CommunicationState.lastServerMessages = older.concat(CommunicationState.lastServerMessages);
      CommunicationState.messages = mergeServerAndPending(CommunicationState.lastServerMessages);
    } catch (err) {
      handleCe2Error(err);
    } finally {
      CommunicationState.loadingOlder = false;
      requestRender();
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
    if (snap.exists) {
      var cdata = snap.data();
      if (typeof cdata.securityLevel === 'number') {
        security = { tier: cdata.securityTier || 'foundation', level: cdata.securityLevel };
      }
    }
    if (!security) {
      security = await loadConversationSecurity(readyId);
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
      var uid = u.uid;
      CommunicationState.visibleGroups = snap.docs
        .map(function (d) {
          const x = d.data();
          return {
            id: d.id,
            name: x.name || 'Group',
            requiredTier: normalizeTier(x.requiredTier),
            mentorLed: !!x.mentorLed,
            allowCrossTier: !!x.allowCrossTier,
            unread: rc ? rc.unreadCount(x, uid) : 0,
            lastPreview: (x.lastPreview && String(x.lastPreview).trim()) || '',
          };
        })
        .sort(function (a, b) {
          var unreadDiff = (b.unread || 0) - (a.unread || 0);
          if (unreadDiff) return unreadDiff;
          return (a.name || '').localeCompare(b.name || '');
        });
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
          })
          .catch(function () {});
      })
    );

    CommunicationState.threads = [];
    var rc = receipts();
    for (var j = 0; j < rows.length; j++) {
      var row = rows[j];
      var otherUid = row.other;
      var peerUser = otherUid ? userMap[otherUid] : null;
      var label = otherUid
        ? (peerUser && peerUser.name) || otherUid.slice(0, 8) + '…'
        : 'Direct';
      var preview = (row.data.lastPreview && String(row.data.lastPreview).trim()) || '';
      var unread = rc ? rc.unreadCount(row.data, uid) : 0;
      CommunicationState.threads.push({
        id: row.doc.id,
        convId: row.doc.id,
        otherUid: otherUid,
        label: label,
        tier: peerUser ? peerUser.tier : 'foundation',
        peerUser: peerUser,
        sub: preview || fmtTime(row.data.lastMessageAt) || '',
        unread: unread,
      });
    }
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
      var qLower = await db.collection('users').where('tier', 'in', lowerTiers).limit(50).get();
      qLower.forEach(function (doc) {
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
    var q2 = await db.collection('users').where('tier', 'in', tierQueries).limit(40).get();
    var myPeerTier = normalizeTier(u.tier);
    q2.forEach(function (doc) {
      if (doc.id === u.uid) return;
      var nu = normalizeCe2User(doc.id, doc.data());
      if (normalizeTier(nu.tier) !== myPeerTier) return;
      if (!canCommunicate(u, nu)) return;
      if (isUserBlockedUid(doc.id)) return;
      CommunicationState.visibleUsers.push(nu);
    });
    } catch (err) {
      console.warn('loadDiscovery', err);
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

  async function writeGroupMessageNotifications(ac, preview, me) {
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
                url: '/communication-v2/?conv=' + encodeURIComponent(convId),
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
              url: '/communication-v2/?group=' + encodeURIComponent(ac.id),
              convId: ac.id,
            }),
          }
        );
        writeGroupMessageNotifications(ac, preview, me);
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
    var preview = (
      root.Ce2Format && root.Ce2Format.stripFormattingForPreview
        ? root.Ce2Format.stripFormattingForPreview(patch.content || '')
        : patch.content || ''
    ).slice(0, 140);
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

  function canUnsendMessage(m) {
    if (!m || !CommunicationState.me || m.senderId !== CommunicationState.me.uid) return false;
    if (m.deleted || m._pending) return false;
    if (!m.id || String(m.id).indexOf('pending-') === 0) return false;
    var me = CommunicationState.me;
    if (me.isAdmin) return true;
    var ms = messageTimeMs(m);
    if (!ms) return false;
    return Date.now() - ms <= UNSEND_WINDOW_MS;
  }

  async function unsendMessage(m, ac) {
    if (!m || !ac) return;
    if (!canUnsendMessage(m)) {
      CommunicationState.error =
        'You can delete your own messages within 1 hour of sending (admins anytime).';
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
    await col.doc(m.id).update({
      deleted: true,
      deletedAt: firebase.firestore.Timestamp.now(),
      content: 'Message removed',
    });
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
          triggerCe2Push(ac, 'Voice message', me, messageId);
          patchThreadPreviewLocal(ac, 'Voice message');
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
          CommunicationState.statusMessage =
            'Voice note failed to upload. Tap Retry or Discard.';
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
      var retryBtn = e.target.closest('.ce2-voice-retry');
      if (retryBtn) {
        e.preventDefault();
        var rid = retryBtn.getAttribute('data-voice-local-id');
        if (rid) retryVoiceNote(rid);
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
    var boardParsed = sh && boardUrl ? sh.parseBoardPostUrl(boardUrl) : null;

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
      var token = await sh.mintBoardShareToken(db, me.uid, boardParsed.boardId, boardParsed.postId, text);
      boardShare = {
        boardId: boardParsed.boardId,
        postId: boardParsed.postId,
        token: token,
        title: text || 'Board post',
      };
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
      if (mediaItem && mediaItem.kind === 'image') patch.imageUrl = mediaItem.url;
      if (mediaItem && mediaItem.kind === 'video') patch.videoUrl = mediaItem.url;
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
      patchThreadPreviewLocal(ac, patches[patches.length - 1].content || '');
      if (patches.length > 1) {
        CommunicationState.statusMessage = patches.length + ' messages sent';
      }
    } catch (err) {
      pendingIds.forEach(function (pid) {
        removeOptimisticMessage(pid);
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
    var searchFocused = !!(active && active.id === 'ce2ThreadSearchInput');
    var editFocused = !!(active && active.closest && active.closest('.ce2-sheet--edit'));

    document.querySelectorAll('.ce2-sheet').forEach(function (sheet) {
      var off = sheet.hidden || (composerFocused && !editFocused) || (searchFocused && !editFocused);
      sheet.querySelectorAll('input, textarea, select').forEach(function (node) {
        node.disabled = off;
        if (off) node.setAttribute('tabindex', '-1');
        else node.removeAttribute('tabindex');
      });
    });
    var searchBar = el('ce2ThreadSearch');
    var searchInput = el('ce2ThreadSearchInput');
    if (searchInput) {
      var searchOff = !searchBar || searchBar.hidden || composerFocused || editFocused;
      searchInput.disabled = searchOff;
      if (searchOff) searchInput.setAttribute('tabindex', '-1');
      else searchInput.removeAttribute('tabindex');
    }
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
      requestAnimationFrame(syncCe2VisualViewport);
    });
    editInput.addEventListener('blur', function () {
      window.setTimeout(syncCe2VisualViewport, 200);
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
    wireCe2DelegatedClick();
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
        patchThreadPreviewLocal(patchAc, patch.content || '');
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
        loadGroupsForUser(CommunicationState.me),
        loadThreads(user.uid),
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
        return;
      }
      if (ce2BootedUid === user.uid) return;
      ce2BootedUid = user.uid;
      stopMessagesWatch();
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
      (CE2_DELIVERY_EXPERIMENTAL ? ' experimental=on' : '')
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
})();
