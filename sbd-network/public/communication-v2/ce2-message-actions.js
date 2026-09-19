/**
 * CE2 — message context menu actions (long-press / right-click).
 */
(function (global) {
  'use strict';

  var deps = null;
  /** Align with unsend window (communication-v2.js). */
  var EDIT_WINDOW_MS = 60 * 60 * 1000;
  var REACTIONS = ['👍', '❤️', '🙏', '✨', '😂', '😮', '😢'];
  /** Swipe-to-reply: rightward, iMessage/WhatsApp-style; ignore left-edge back gestures. */
  var SWIPE_REPLY = {
    EDGE_GUARD: 28,
    LOCK_PX: 12,
    MOVE_CANCEL_PX: 14,
    THRESHOLD: 56,
    MAX_X: 72,
  };
  var TEMPLATES = [
    { label: 'Grace & peace', text: 'Grace and peace to you in this formation season.' },
    { label: 'Thank you', text: 'Thank you — receiving this with gratitude.' },
    { label: 'Praying with you', text: 'Praying with you. Standing in covenant.' },
    { label: 'Will review', text: 'I will review this and respond after formation reflection.' },
    { label: 'Check-in', text: 'Checking in — how is your formation walk this week?' },
  ];

  var msgMenuUiWired = false;
  var msgMenuSuppressClick = false;
  var MSG_MENU_LONG_PRESS_MS = 480;
  var MSG_MENU_MOVE_PX = 14;
  var activeCtx = null;
  var menuSession = null;
  var MENU_SUB_SECTIONS = ['Safety', 'More', 'Formation'];
  /** Submenu labels only — styling stays neutral (mature system-menu pattern). */
  var MENU_NAV_META = {
    Safety: { aria: 'Safety — block, report, hide' },
    More: { aria: 'More — pin, star, and other tools' },
    Formation: { aria: 'Formation — notes, prayer, templates' },
  };

  function aggregateReactions(reactions, myUid) {
    var groups = {};
    var order = [];
    Object.keys(reactions || {}).forEach(function (uid) {
      var emoji = reactions[uid];
      if (!emoji || typeof emoji !== 'string') return;
      if (!groups[emoji]) {
        groups[emoji] = { emoji: emoji, count: 0, uids: [], mine: false };
        order.push(emoji);
      }
      groups[emoji].count += 1;
      groups[emoji].uids.push(uid);
      if (myUid && uid === myUid) groups[emoji].mine = true;
    });
    return order.map(function (e) {
      return groups[e];
    });
  }

  function applyReactionToggle(reactions, uid, emoji) {
    var next = Object.assign({}, reactions || {});
    if (!uid || !emoji) return next;
    if (next[uid] === emoji) delete next[uid];
    else next[uid] = emoji;
    return next;
  }

  function reactionWritePatch(uid, nextReactions, deleteValue) {
    var patch = {};
    if (!uid) return patch;
    if (nextReactions && nextReactions[uid]) patch['reactions.' + uid] = nextReactions[uid];
    else patch['reactions.' + uid] = deleteValue !== undefined ? deleteValue : { _delete: true };
    return patch;
  }

  /**
   * Pure swipe-axis helper. Vertical stays scroll; left-edge stays back-gesture;
   * rightward horizontal can commit reply after THRESHOLD.
   */
  function decideSwipeReply(dx, dy, startX, lockedAxis) {
    var absDx = Math.abs(dx);
    var absDy = Math.abs(dy);
    var cancelLongPress =
      absDx > SWIPE_REPLY.MOVE_CANCEL_PX || absDy > SWIPE_REPLY.MOVE_CANCEL_PX;
    var axis = lockedAxis || null;

    if (typeof startX === 'number' && startX < SWIPE_REPLY.EDGE_GUARD) {
      return {
        axis: axis || (cancelLongPress ? 'v' : null),
        translateX: 0,
        iconOpacity: 0,
        commit: false,
        cancelLongPress: cancelLongPress,
      };
    }

    if (!axis) {
      if (absDx < SWIPE_REPLY.LOCK_PX && absDy < SWIPE_REPLY.LOCK_PX) {
        return {
          axis: null,
          translateX: 0,
          iconOpacity: 0,
          commit: false,
          cancelLongPress: false,
        };
      }
      axis = absDy >= absDx ? 'v' : 'h';
    }

    if (axis === 'v' || dx <= 0) {
      return {
        axis: axis,
        translateX: 0,
        iconOpacity: 0,
        commit: false,
        cancelLongPress: cancelLongPress,
      };
    }

    var x =
      dx > SWIPE_REPLY.MAX_X ? SWIPE_REPLY.MAX_X + (dx - SWIPE_REPLY.MAX_X) * 0.2 : dx;
    if (x > SWIPE_REPLY.MAX_X + 16) x = SWIPE_REPLY.MAX_X + 16;

    return {
      axis: 'h',
      translateX: x,
      iconOpacity: Math.min(dx / SWIPE_REPLY.THRESHOLD, 1),
      commit: dx >= SWIPE_REPLY.THRESHOLD,
      cancelLongPress: true,
    };
  }

  function eventPoint(e) {
    if (e.touches && e.touches[0]) return e.touches[0];
    if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0];
    return e;
  }

  function state() {
    return deps && deps.getState ? deps.getState() : null;
  }

  function el(id) {
    return deps && deps.el ? deps.el(id) : document.getElementById(id);
  }

  function syncComposerInputHeight(input) {
    if (deps && deps.syncComposerInputHeight) deps.syncComposerInputHeight(input);
  }

  function db() {
    return deps && deps.db;
  }

  function messageCol(ac) {
    ac = resolveAcForWrite(ac);
    if (!ac || !ac.id) return null;
    var d = db();
    if (!d) return null;
    return ac.type === 'direct'
      ? d.collection('ce2_conversations').doc(ac.id).collection('ce2_messages')
      : d.collection('communicationGroups').doc(ac.id).collection('ce2_messages');
  }

  function resolveAcForWrite(ac) {
    if (!ac) return null;
    if (ac.id) return ac;
    if (ac.type !== 'direct' || !ac.otherUid || !deps.directConvId) return ac;
    var st = state();
    var me = st && st.me;
    if (!me) return ac;
    return Object.assign({}, ac, { id: deps.directConvId(me.uid, ac.otherUid) });
  }

  function patchLocalMessage(msgId, patch) {
    var st = state();
    if (!st || !msgId) return;
    function mapList(list) {
      if (!list || !list.length) return list;
      var changed = false;
      var next = list.map(function (m) {
        if (m.id !== msgId) return m;
        changed = true;
        return Object.assign({}, m, patch);
      });
      return changed ? next : list;
    }
    st.messages = mapList(st.messages) || st.messages;
    st.lastServerMessages = mapList(st.lastServerMessages) || st.lastServerMessages;
  }

  function convDocRef(ac) {
    if (!ac) return null;
    var d = db();
    if (!d) return null;
    return ac.type === 'direct'
      ? d.collection('ce2_conversations').doc(ac.id)
      : d.collection('communicationGroups').doc(ac.id);
  }

  function prefsKey(uid, suffix) {
    return 'ce2_' + suffix + '_' + uid;
  }

  function loadLocalJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveLocalJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (_) {}
  }

  function hiddenSet(st, ac) {
    if (!st || !st.userMsgPrefs || !ac) return {};
    var hk = ac.type + ':' + ac.id;
    return st.userMsgPrefs.hidden[hk] || {};
  }

  function isMessageHidden(m, ac) {
    var st = state();
    if (!m || !m.id || !st) return false;
    var hs = hiddenSet(st, ac);
    return !!hs[m.id];
  }

  function isMessageSaved(m) {
    var st = state();
    return !!(st && st.userMsgPrefs && st.userMsgPrefs.saved[m.id]);
  }

  function isUserBlocked(uid) {
    var st = state();
    return !!(st && st.userMsgPrefs && st.userMsgPrefs.blocked[uid]);
  }

  function messageCopyText(m) {
    if (!m || m.deleted) return '';
    var t = String(m.content || '').trim();
    if (t) return t;
    if (m.messageType === 'board_share' && m.boardShare) return 'Board post';
    return '';
  }

  function messageMediaUrl(m) {
    if (!m) return '';
    return m.imageUrl || m.videoUrl || m.audioUrl || '';
  }

  function boardPostUrl(m) {
    var sh = deps && deps.share ? deps.share() : null;
    if (!m || !m.boardShare || !sh || !sh.shareHref) return '';
    var bs = m.boardShare;
    var href = sh.shareHref(bs.boardId, bs.postId, bs.token);
    if (sh.withMessengerReturn) {
      var st = state();
      href = sh.withMessengerReturn(href, (st && st.activeConversation) || { from: 'ce2' });
    }
    return href;
  }

  function directPeerUid(ac) {
    if (!ac || ac.type !== 'direct') return '';
    if (ac.otherUid) return ac.otherUid;
    var st = state();
    if (st && st.selectedDiscoveryUid) return st.selectedDiscoveryUid;
    return '';
  }

  /** Who to block: DM contact, or message sender in groups. */
  function blockTargetUid(ac, m, self) {
    if (ac && ac.type === 'direct') {
      var peer = directPeerUid(ac);
      if (peer) return peer;
    }
    if (!self && m && m.senderId) return m.senderId;
    return '';
  }

  function canEditMessage(m, self) {
    if (!self || !m || m.deleted || m._pending) return false;
    if (!m.id || String(m.id).indexOf('pending-') === 0) return false;
    var st = state();
    var me = st && st.me;
    if (!me || m.senderId !== me.uid) return false;
    var content = String(m.content || '').trim();
    if (!content) return false;
    if (me.isAdmin) return true;
    if (deps.messageTimeMs) {
      var ms = deps.messageTimeMs(m);
      if (ms && Date.now() - ms > EDIT_WINDOW_MS) return false;
    }
    return true;
  }

  function copyText(text, okMsg) {
    if (deps && deps.copyMessageText) {
      deps.copyMessageText(text, okMsg);
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        statusMsg(okMsg || 'Copied');
      });
    }
  }

  function statusMsg(msg) {
    var st = state();
    if (!st) return;
    st.statusMessage = msg;
    if (deps.requestRender) deps.requestRender({ threadOnly: true });
    setTimeout(function () {
      if (st.statusMessage === msg) {
        st.statusMessage = null;
        if (deps.requestRender) deps.requestRender({ threadOnly: true });
      }
    }, 1600);
  }

  function errMsg(msg) {
    statusMsg(msg);
    var st = state();
    if (st) st.error = msg;
    if (deps.requestRender) deps.requestRender({ threadOnly: true });
  }

  async function audit(type, detail) {
    var d = db();
    var st = state();
    if (!d || !st || !st.me) return;
    try {
      await d.collection('ce2_audit_log').add({
        type: type,
        uid: st.me.uid,
        detail: detail || {},
        createdAt: firebase.firestore.Timestamp.now(),
      });
    } catch (e) {
      console.warn('ce2_audit', e);
    }
  }

  function buildMenuItems(m, ac, self, canRead) {
    var items = [];
    var st = state();
    if (!st || !m) return items;

    if (m._pending && self) {
      if (m._failed) {
        items.push({
          id: 'retry_send',
          label: 'Retry send',
          run: function () {
            if (deps.retryFailedMessage) deps.retryFailedMessage(m.id);
          },
        });
        items.push({
          id: 'discard_send',
          label: 'Discard',
          danger: true,
          run: function () {
            if (deps.removeOptimisticMessage) deps.removeOptimisticMessage(m.id);
            statusMsg('Message discarded');
            if (deps.requestRender) deps.requestRender({ threadOnly: true });
          },
        });
        return items;
      }
      items.push({
        id: 'cancel_send',
        label: 'Cancel send',
        danger: true,
        run: function () {
          if (deps.removeOptimisticMessage) deps.removeOptimisticMessage(m.id);
          statusMsg('Send cancelled');
        },
      });
      return items;
    }

    if (!canRead || m.deleted) return items;

    var SEC = 'Actions';
    var SEC_SAFE = 'Safety';
    var SEC_MORE = 'More';
    var SEC_FORM = 'Formation';

    function item(id, label, run, opts) {
      opts = opts || {};
      return {
        id: id,
        label: label,
        run: run,
        danger: !!opts.danger,
        section: opts.section || SEC,
      };
    }

    var copyT = messageCopyText(m);
    var media = messageMediaUrl(m);
    var bUrl = boardPostUrl(m);
    var pinnedId =
      st.convMeta && st.convMeta.pinnedMessageId ? st.convMeta.pinnedMessageId : '';
    var blockUid = blockTargetUid(ac, m, self);
    var groupRole = (ac && ac.groupRole) || st.myGroupRole || 'member';
    var roleMod = global.Ce2Moderation;
    var isGroupThread = !!(ac && ac.type === 'group');
    var canPinGroup =
      !isGroupThread ||
      (roleMod && roleMod.canPinAnnouncement(groupRole, st.me, 'group'));
    var canModGroup =
      isGroupThread && roleMod && roleMod.canModerateMessage(groupRole, st.me, 'group');

    items.push(item('reply', 'Reply', function () { deps.setReply(m); }, { section: SEC }));

    if (self && canEditMessage(m, self)) {
      items.push(item('edit', 'Edit message', function () { showEditSheet(m, ac); }, { section: SEC }));
    }

    var canDelete =
      deps.canDeleteMessage && deps.canDeleteMessage(m);
    if (!canDelete && deps.canUnsendMessage) {
      canDelete = deps.canUnsendMessage(m);
    }
    if (canDelete) {
      var stMe = st && st.me;
      var deleteLabel =
        (stMe && stMe.isAdmin && !self) || (canModGroup && !self)
          ? 'Delete for group'
          : 'Delete';
      items.push(
        item(
          'delete',
          deleteLabel,
          function () { deps.unsendMessage(m, ac).catch(deps.handleCe2Error); },
          { section: SEC, danger: true }
        )
      );
    }

    items.push(item('react', 'React', function () { showReactSheet(m, ac); }, { section: SEC }));
    items.push(item('forward', 'Forward', function () { showForwardSheet(m, ac); }, { section: SEC }));

    if (copyT) {
      items.push(item('copy', 'Copy', function () { copyText(copyT); }, { section: SEC }));
    }
    if (
      typeof messageHasLegacyPublicCe2Media === 'function' &&
      messageHasLegacyPublicCe2Media(m)
    ) {
      items.push(
        item(
          'migrate_media',
          'Move to private storage',
          function () {
            if (deps.migrateLegacyMedia) deps.migrateLegacyMedia(m, ac);
          },
          { section: SEC_MORE }
        )
      );
    }

    if (media) {
      items.push(
        item('copy_link', 'Copy link', function () { copyText(media, 'Link copied'); }, { section: SEC })
      );
      if (m.imageUrl) {
        items.push(
          item(
            'download',
            'Save image',
            function () {
              var href = m.imageUrl;
              var go = function (src) {
                var a = document.createElement('a');
                a.href = src;
                a.download = 'ce2-image.jpg';
                a.target = '_blank';
                a.rel = 'noopener';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              };
              if (typeof resolveR2MediaUrl === 'function') {
                resolveR2MediaUrl(href).then(go).catch(function () { go(href); });
              } else {
                go(href);
              }
            },
            { section: SEC }
          )
        );
      }
    }
    if (bUrl) {
      items.push(
        item('open_board', 'Open board post', function () {
          global.open(bUrl, '_blank', 'noopener,noreferrer');
        }, { section: SEC })
      );
    }

    if (blockUid) {
      var blockLabel =
        ac && ac.type === 'direct'
          ? isUserBlocked(blockUid)
            ? 'Unblock contact'
            : 'Block contact'
          : isUserBlocked(blockUid)
            ? 'Unblock member'
            : 'Block member';
      items.push(
        item(
          'block',
          blockLabel,
          function () { toggleBlock(blockUid); },
          { section: SEC_SAFE, danger: !isUserBlocked(blockUid) }
        )
      );
    }

    if (!self && m.senderId) {
      items.push(
        item('report', 'Report', function () { reportMessage(m, ac); }, { section: SEC_SAFE, danger: true })
      );
    }

    items.push(
      item('hide', isMessageHidden(m, ac) ? 'Unhide' : 'Hide for me', function () {
        toggleHide(m, ac);
      }, { section: SEC_SAFE })
    );

    items.push(
      item('info', 'Message info', function () { showMessageInfo(m, ac, self); }, { section: SEC_MORE })
    );
    if (canPinGroup) {
      items.push(
        item(
          'pin',
          pinnedId === m.id
            ? isGroupThread
              ? 'Unpin announcement'
              : 'Unpin'
            : isGroupThread
              ? 'Pin announcement'
              : 'Pin',
          function () {
            togglePin(m, ac, pinnedId === m.id);
          },
          { section: SEC_MORE }
        )
      );
    }
    if (canModGroup && !self && m.senderId && roleMod && roleMod.canRemoveMember) {
      var canKick = roleMod.canRemoveMember(
        groupRole,
        st.me,
        (st.groupRoles && st.groupRoles[m.senderId]) || 'member',
        st.me && st.me.uid,
        m.senderId
      );
      if (canKick && deps.removeGroupMember) {
        items.push(
          item(
            'remove_member',
            'Remove from group',
            function () {
              deps.removeGroupMember(ac, m.senderId).catch(deps.handleCe2Error);
            },
            { section: SEC_SAFE, danger: true }
          )
        );
      }
    }
    items.push(
      item('star', isMessageSaved(m) ? 'Unstar' : 'Star', function () { toggleStar(m, ac); }, {
        section: SEC_MORE,
      })
    );
    items.push(
      item('search', 'Find in chat', function () { openThreadSearch(m); }, { section: SEC_MORE })
    );

    if (m.shareable) {
      items.push(
        item('share_board', 'Share to board', function () {
          var input = el('ce2Input');
          var drawer = el('ce2ComposerDrawer');
          var moreBtn = el('ce2ComposerMore');
          if (drawer) drawer.hidden = false;
          if (moreBtn) moreBtn.classList.add('is-open');
          if (input) {
            input.value = (input.value ? input.value + '\n' : '') + (copyT || 'Shared from Messages');
            syncComposerInputHeight(input);
            input.focus();
          }
          statusMsg('Add a board link in composer (+) to share');
        }, { section: SEC_MORE })
      );
    }

    if (ac && ac.type === 'group' && !ac.needsJoin) {
      items.push(item('mention', '@Mention', function () { showMentionSheet(ac); }, { section: SEC_MORE }));
    }

    items.push(
      item('formation_note', 'Add to formation notes', function () { addFormationNote(m, ac); }, {
        section: SEC_FORM,
      })
    );
    items.push(
      item(
        'prayer',
        m.formationTag === 'prayer' ? 'Remove prayer tag' : 'Mark as prayer',
        function () { toggleFormationTag(m, ac, 'prayer'); },
        { section: SEC_FORM }
      )
    );
    items.push(
      item(
        'checkin',
        m.formationTag === 'check_in' ? 'Remove check-in tag' : 'Mark as check-in',
        function () { toggleFormationTag(m, ac, 'check_in'); },
        { section: SEC_FORM }
      )
    );
    if (!self) {
      items.push(
        item('mentor_review', 'Request mentor review', function () { requestMentorReview(m, ac); }, {
          section: SEC_FORM,
        })
      );
    }
    items.push(item('template', 'Template reply', function () { showTemplateSheet(); }, { section: SEC_FORM }));

    if (deps.showDebugUi && deps.showDebugUi()) {
      items.push(
        item(
          'classification',
          'Classification: ' + (m.classification || 'foundation'),
          function () { statusMsg('Classification: ' + (m.classification || 'foundation')); },
          { section: SEC_MORE }
        )
      );
    }

    return items;
  }

  function groupMenuBySection(actions) {
    var groups = { Actions: [], Safety: [], More: [], Formation: [] };
    (actions || []).forEach(function (action) {
      var sec = action.section || 'Actions';
      if (groups[sec]) groups[sec].push(action);
      else groups.Actions.push(action);
    });
    return groups;
  }

  function menuRowCountForView(view, groups) {
    if (!groups) return 0;
    if (view === 'root') {
      var n = groups.Actions.length;
      var navN = 0;
      MENU_SUB_SECTIONS.forEach(function (sec) {
        if (groups[sec] && groups[sec].length) navN += 1;
      });
      if (navN > 0) return n + navN + 1;
      return n;
    }
    return (groups[view] ? groups[view].length : 0) + 2;
  }

  /** Rough height before layout; nav cards are taller than plain rows. */
  function estimateMenuHeight(view, groups) {
    if (!groups) return 200;
    if (view === 'root') {
      var h = 16 + groups.Actions.length * 46;
      var navN = 0;
      MENU_SUB_SECTIONS.forEach(function (sec) {
        if (groups[sec] && groups[sec].length) navN += 1;
      });
      if (navN > 0) h += 28 + navN * 46;
      h += 56;
      return h;
    }
    var sub = groups[view] ? groups[view].length : 0;
    return 16 + 44 + 48 + sub * 44;
  }

  function animateMenuList(list, direction) {
    if (!list) return;
    list.classList.remove('ce2-msg-menu-list--enter-back', 'ce2-msg-menu-list--enter-forward');
    list.classList.add(
      direction === 'back' ? 'ce2-msg-menu-list--enter-back' : 'ce2-msg-menu-list--enter-forward'
    );
    requestAnimationFrame(function () {
      list.classList.remove('ce2-msg-menu-list--enter-back', 'ce2-msg-menu-list--enter-forward');
    });
  }

  function appendMenuReactRow(list, m, ac) {
    var li = document.createElement('li');
    li.className = 'ce2-msg-menu-react';
    var st = state();
    var myUid = st && st.me && st.me.uid;
    var mine = (m && m.reactions && myUid && m.reactions[myUid]) || '';
    REACTIONS.forEach(function (emoji) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ce2-msg-menu-react-btn' + (mine === emoji ? ' is-mine' : '');
      btn.textContent = emoji;
      btn.setAttribute(
        'aria-label',
        mine === emoji ? 'Remove ' + emoji + ' reaction' : 'React with ' + emoji
      );
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeMessageMenu();
        setReaction(m, ac, emoji).catch(function (err) {
          if (deps.handleCe2Error) deps.handleCe2Error(err, 'react');
        });
      });
      li.appendChild(btn);
    });
    list.appendChild(li);
  }

  function appendMenuActionRow(list, action) {
    var li = document.createElement('li');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ce2-msg-menu-item' + (action.danger ? ' is-danger' : '');
    btn.setAttribute('role', 'menuitem');
    btn.textContent = action.label;
    btn.addEventListener('click', function () {
      closeMessageMenu();
      action.run();
    });
    li.appendChild(btn);
    list.appendChild(li);
  }

  function appendMenuNavRow(list, sectionName) {
    var meta = MENU_NAV_META[sectionName] || { aria: sectionName };
    var li = document.createElement('li');
    li.className = 'ce2-msg-menu-row--divided';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ce2-msg-menu-item is-nav';
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-label', meta.aria || sectionName);
    btn.setAttribute('data-nav-section', sectionName);

    var label = document.createElement('span');
    label.className = 'ce2-msg-menu-item-label';
    label.textContent = sectionName;

    var chev = document.createElement('span');
    chev.className = 'ce2-msg-menu-chevron';
    chev.setAttribute('aria-hidden', 'true');

    btn.appendChild(label);
    btn.appendChild(chev);
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      renderMessageMenuView(sectionName, 'forward');
    });
    li.appendChild(btn);
    list.appendChild(li);
  }

  function appendMenuBackRow(list) {
    var li = document.createElement('li');
    li.className = 'ce2-msg-menu-back-wrap';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ce2-msg-menu-item is-back';
    btn.setAttribute('role', 'menuitem');
    var chev = document.createElement('span');
    chev.className = 'ce2-msg-menu-chevron is-back-chevron';
    chev.setAttribute('aria-hidden', 'true');
    var label = document.createElement('span');
    label.className = 'ce2-msg-menu-item-label';
    label.textContent = 'Back';
    btn.appendChild(chev);
    btn.appendChild(label);
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      renderMessageMenuView('root', 'back');
    });
    li.appendChild(btn);
    list.appendChild(li);
  }

  function appendMenuSubhead(list, sectionName) {
    var li = document.createElement('li');
    li.className = 'ce2-msg-menu-group-label';
    li.setAttribute('aria-hidden', 'true');
    li.textContent = sectionName;
    list.appendChild(li);
  }

  function positionMessageMenuPanel() {
    if (!menuSession) return;
    var panel = el('ce2MsgMenuPanel');
    var menu = el('ce2MsgMenu');
    if (!panel || !menu) return;

    menu.classList.remove('is-flip-above');

    if (menuSession.isSheet) {
      panel.style.left = '';
      panel.style.top = '';
      panel.style.bottom = '';
      panel.style.maxHeight = 'min(70vh, calc(100dvh - 24px))';
      panel.style.overflowY = 'auto';
      return;
    }

    if (menuSession.clientX == null || menuSession.clientY == null) return;

    var pad = 12;
    var offset = 8;
    var view = menuSession.view || 'root';
    var groups = menuSession.groups;
    var maxH = Math.floor(window.innerHeight * 0.85);

    panel.style.left = '';
    panel.style.top = '';
    panel.style.bottom = '';
    panel.style.maxHeight = '';
    panel.style.overflowY = '';

    var ph = panel.offsetHeight;
    if (!ph || ph < 48) {
      ph = estimateMenuHeight(view, groups);
    }

    var pw = panel.offsetWidth || Math.min(280, window.innerWidth - pad * 2);
    if (ph > maxH) {
      panel.style.maxHeight = maxH + 'px';
      panel.style.overflowY = 'auto';
      ph = maxH;
    }

    var cx = menuSession.clientX;
    var cy = menuSession.clientY;
    var x = cx - pw * 0.35;
    x = Math.max(pad, Math.min(x, window.innerWidth - pw - pad));

    var spaceBelow = window.innerHeight - cy - pad;
    var spaceAbove = cy - pad;
    var openAbove = ph + offset > spaceBelow && spaceAbove >= spaceBelow;
    if (ph + offset > spaceBelow && spaceAbove > spaceBelow) openAbove = true;
    if (ph + offset <= spaceBelow) openAbove = false;

    var y;
    if (openAbove) {
      y = cy - ph - offset;
      menu.classList.add('is-flip-above');
    } else {
      y = cy + offset;
    }

    y = Math.max(pad, Math.min(y, window.innerHeight - ph - pad));

    if (y + ph > window.innerHeight - pad) {
      y = window.innerHeight - ph - pad;
    }

    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
  }

  function renderMessageMenuView(view, animDir) {
    if (!menuSession) return;
    var list = el('ce2MsgMenuList');
    var panel = el('ce2MsgMenuPanel');
    if (!list || !panel) return;

    var prevView = menuSession.view;
    menuSession.view = view || 'root';
    var groups = menuSession.groups;
    list.innerHTML = '';

    if (view === 'root') {
      panel.setAttribute('aria-label', 'Message actions');
      panel.classList.remove('ce2-msg-menu-panel--sub');
      if (menuSession.m && !menuSession.m._pending && !menuSession.m.deleted) {
        appendMenuReactRow(list, menuSession.m, menuSession.ac);
      }
      groups.Actions.forEach(function (action, idx) {
        appendMenuActionRow(list, action);
        if (idx < groups.Actions.length - 1) {
          var li = list.lastElementChild;
          if (li) li.classList.add('ce2-msg-menu-row--divided');
        }
      });

      var navSections = MENU_SUB_SECTIONS.filter(function (sec) {
        return groups[sec] && groups[sec].length;
      });
      if (navSections.length) {
        var divider = document.createElement('li');
        divider.className = 'ce2-msg-menu-divider';
        divider.setAttribute('aria-hidden', 'true');
        list.appendChild(divider);

        var groupLabel = document.createElement('li');
        groupLabel.className = 'ce2-msg-menu-group-label';
        groupLabel.setAttribute('aria-hidden', 'true');
        groupLabel.textContent = 'More options';
        list.appendChild(groupLabel);

        navSections.forEach(function (sec) {
          appendMenuNavRow(list, sec);
        });
      }
    } else {
      panel.setAttribute('aria-label', view);
      panel.classList.add('ce2-msg-menu-panel--sub');
      appendMenuBackRow(list);
      appendMenuSubhead(list, view);
      (groups[view] || []).forEach(function (action, idx) {
        appendMenuActionRow(list, action);
        if (idx < groups[view].length - 1) {
          var row = list.lastElementChild;
          if (row) row.classList.add('ce2-msg-menu-row--divided');
        }
      });
    }

    if (animDir) animateMenuList(list, animDir);
    else if (prevView && prevView !== view) animateMenuList(list, view === 'root' ? 'back' : 'forward');

    requestAnimationFrame(function () {
      positionMessageMenuPanel();
    });
  }

  function closeMessageMenu() {
    var menu = el('ce2MsgMenu');
    if (!menu) return;
    menu.hidden = true;
    menu.setAttribute('aria-hidden', 'true');
    menu.classList.remove('is-open', 'is-sheet', 'is-popover', 'is-flip-above');
    document.body.classList.remove('ce2-msg-menu-open');
    document.querySelectorAll('.ce2-row-menu-target').forEach(function (r) {
      r.classList.remove('ce2-row-menu-target');
    });
    document.querySelectorAll('.ce2-bubble-pressing').forEach(function (r) {
      r.classList.remove('ce2-bubble-pressing');
    });
    var panel = el('ce2MsgMenuPanel');
    if (panel) {
      panel.style.left = '';
      panel.style.top = '';
      panel.style.bottom = '';
      panel.style.maxHeight = '';
      panel.style.overflowY = '';
      panel.setAttribute('aria-label', 'Message actions');
      panel.classList.remove('ce2-msg-menu-panel--sub');
    }
    menuSession = null;
    if (menu && menu.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }

  function openMessageMenu(actions, anchorRow, clientX, clientY, ctx) {
    if (!actions || !actions.length) return;

    var menu = el('ce2MsgMenu');
    var list = el('ce2MsgMenuList');
    var panel = el('ce2MsgMenuPanel');
    if (!menu || !list || !panel) return;

    closeMessageMenu();
    activeCtx = null;
    ctx = ctx || {};

    var sheet = deps.isCoarsePointer ? deps.isCoarsePointer() : false;
    menuSession = {
      groups: groupMenuBySection(actions),
      anchorRow: anchorRow,
      clientX: clientX,
      clientY: clientY,
      isSheet: sheet,
      view: 'root',
      m: ctx.m || null,
      ac: ctx.ac || null,
    };

    menu.classList.add(sheet ? 'is-sheet' : 'is-popover');
    if (anchorRow) anchorRow.classList.add('ce2-row-menu-target');

    renderMessageMenuView('root');

    menu.hidden = false;
    menu.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () {
      menu.classList.add('is-open');
      document.body.classList.add('ce2-msg-menu-open');
      requestAnimationFrame(function () {
        positionMessageMenuPanel();
      });
      if (navigator.vibrate) navigator.vibrate(10);
    });
  }

  function ensureSwipeReplyIcon(row) {
    var icon = row.querySelector('.ce2-swipe-reply-icon');
    if (icon) return icon;
    icon = document.createElement('span');
    icon.className = 'ce2-swipe-reply-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '↩';
    row.insertBefore(icon, row.firstChild);
    return icon;
  }

  function applySwipeVisual(row, x, opacity) {
    var bubble = row.querySelector('.ce2-bubble');
    var foot = row.querySelector('.ce2-msg-foot');
    var icon = ensureSwipeReplyIcon(row);
    var t = 'translateX(' + Math.max(0, x) + 'px)';
    row.classList.add('ce2-row-swiping');
    if (bubble) {
      bubble.style.transition = 'none';
      bubble.style.transform = t;
    }
    if (foot) {
      foot.style.transition = 'none';
      foot.style.transform = t;
    }
    icon.style.transition = 'none';
    icon.style.opacity = String(opacity || 0);
    icon.classList.toggle('is-armed', (opacity || 0) >= 1);
  }

  function clearSwipeVisual(row, animate) {
    var bubble = row.querySelector('.ce2-bubble');
    var foot = row.querySelector('.ce2-msg-foot');
    var icon = row.querySelector('.ce2-swipe-reply-icon');
    var trans = animate ? 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)' : 'none';
    row.classList.remove('ce2-row-swiping');
    if (bubble) {
      bubble.style.transition = trans;
      bubble.style.transform = '';
    }
    if (foot) {
      foot.style.transition = trans;
      foot.style.transform = '';
    }
    if (icon) {
      icon.style.transition = animate ? 'opacity 0.22s ease' : 'none';
      icon.style.opacity = '0';
      icon.classList.remove('is-armed');
    }
  }

  function canSwipeReply(m, canRead) {
    if (!m || !canRead || m.deleted || m._pending) return false;
    if (!m.id || String(m.id).indexOf('pending-') === 0) return false;
    return true;
  }

  function wireMessageRow(row, m, ac, self, canRead) {
    var actionsFn = function () {
      return buildMenuItems(m, ac, self, canRead);
    };
    if (!actionsFn().length) return;

    row.classList.add('ce2-row-actionable');
    row.dataset.messageId = m.id || '';

    function openAt(clientX, clientY) {
      var actions = actionsFn();
      if (actions.length) openMessageMenu(actions, row, clientX, clientY, { m: m, ac: ac });
    }

    row.addEventListener('contextmenu', function (e) {
      if (deps.isInteractiveMsgTarget && deps.isInteractiveMsgTarget(e.target)) return;
      if (!e.target.closest('.ce2-row')) return;
      if (!actionsFn().length) return;
      e.preventDefault();
      openAt(e.clientX, e.clientY);
    });

    var pressTimer = null;
    var pressX = 0;
    var pressY = 0;
    var swipeAxis = null;
    var swipeActive = false;
    var swipeTracking = false;

    function clearPress() {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      row.classList.remove('ce2-bubble-pressing');
    }

    function resetSwipeState() {
      swipeAxis = null;
      swipeActive = false;
      swipeTracking = false;
    }

    function onPressStart(e) {
      if (e.button !== undefined && e.button !== 0) return;
      if (deps.isInteractiveMsgTarget && deps.isInteractiveMsgTarget(e.target)) return;
      if (typeof document !== 'undefined' && document.body &&
          document.body.classList.contains('ce2-msg-menu-open')) return;
      if (!e.target.closest('.ce2-bubble') && !e.target.closest('.ce2-msg-foot')) return;
      clearPress();
      resetSwipeState();
      var pt = eventPoint(e);
      pressX = pt.clientX;
      pressY = pt.clientY;
      swipeTracking = true;
      row.classList.add('ce2-bubble-pressing');
      pressTimer = setTimeout(function () {
        pressTimer = null;
        if (swipeActive) return;
        row.classList.remove('ce2-bubble-pressing');
        swipeTracking = false;
        msgMenuSuppressClick = true;
        openAt(pressX, pressY);
      }, MSG_MENU_LONG_PRESS_MS);
    }

    function onPressMove(e) {
      if (!swipeTracking && !pressTimer) return;
      var pt = eventPoint(e);
      var dx = pt.clientX - pressX;
      var dy = pt.clientY - pressY;
      var decision = decideSwipeReply(dx, dy, pressX, swipeAxis);
      if (decision.cancelLongPress) clearPress();
      if (decision.axis) swipeAxis = decision.axis;
      if (!canSwipeReply(m, canRead) || !(deps && deps.setReply)) return;
      if (decision.axis === 'h') {
        swipeActive = true;
        applySwipeVisual(row, decision.translateX, decision.iconOpacity);
      }
    }

    function onPressEnd(e) {
      var cancelled = !!(e && e.type === 'touchcancel');
      var wasSwiping = swipeActive;
      var dx = 0;
      if (e) {
        var pt = eventPoint(e);
        dx = pt.clientX - pressX;
      }
      var decision = decideSwipeReply(dx, 0, pressX, swipeAxis);
      clearPress();
      if (wasSwiping) {
        msgMenuSuppressClick = true;
        clearSwipeVisual(row, true);
        if (!cancelled && decision.commit && deps.setReply) {
          deps.setReply(m);
          if (navigator.vibrate) navigator.vibrate(8);
        }
      }
      resetSwipeState();
    }

    row.addEventListener('touchstart', onPressStart, { passive: true });
    row.addEventListener('touchmove', onPressMove, { passive: true });
    row.addEventListener('touchend', onPressEnd, { passive: true });
    row.addEventListener('touchcancel', onPressEnd, { passive: true });

    row.addEventListener(
      'click',
      function (e) {
        if (msgMenuSuppressClick) {
          e.preventDefault();
          e.stopPropagation();
          msgMenuSuppressClick = false;
        }
      },
      true
    );
  }

  function wireMessageMenuUi() {
    if (msgMenuUiWired) return;
    msgMenuUiWired = true;
    var backdrop = el('ce2MsgMenuBackdrop');
    if (backdrop) backdrop.addEventListener('click', closeMessageMenu);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeMessageMenu();
        closeAllSheets();
        activeCtx = null;
      }
    });
    wireSheetClose('ce2MsgInfoClose', 'ce2MsgInfo');
    wireSheetClose('ce2ForwardClose', 'ce2ForwardSheet', true);
    wireSheetClose('ce2EditCancel', 'ce2EditSheet', true);
    wireSheetClose('ce2ReactClose', 'ce2ReactSheet');
    wireSheetClose('ce2TemplateClose', 'ce2TemplateSheet');
    wireSheetClose('ce2MentionClose', 'ce2MentionSheet');
    var editSave = el('ce2EditSave');
    if (editSave) {
      editSave.addEventListener('click', function () {
        saveEdit().catch(function (e) {
          if (deps.handleCe2Error) deps.handleCe2Error(e, 'edit');
          else errMsg((e && e.message) || 'Could not save edit.');
        });
      });
    }
    function syncThreadSearchToggleUi() {
      var bar = el('ce2ThreadSearch');
      var toggle = el('ce2ThreadSearchToggle');
      if (!toggle) return;
      var open = !!(bar && !bar.hidden);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.classList.toggle('is-active', open);
    }

    function closeThreadSearchBar() {
      var st = state();
      if (st) {
        st.threadSearchQuery = '';
        st.threadSearchSenderId = '';
        st.threadSearchStartMs = 0;
        st.threadSearchEndMs = 0;
      }
      var bar = el('ce2ThreadSearch');
      var input = el('ce2ThreadSearchInput');
      if (bar) bar.hidden = true;
      if (input) input.value = '';
      if (global.Ce2ThreadSearch && global.Ce2ThreadSearch.onClose) {
        global.Ce2ThreadSearch.onClose();
      }
      syncThreadSearchToggleUi();
      if (deps.requestRender) deps.requestRender({ threadOnly: true });
    }

    var searchClose = el('ce2ThreadSearchClose');
    if (searchClose) {
      searchClose.addEventListener('click', closeThreadSearchBar);
    }
    var searchToggle = el('ce2ThreadSearchToggle');
    if (searchToggle) {
      searchToggle.addEventListener('click', function () {
        var bar = el('ce2ThreadSearch');
        if (bar && !bar.hidden) {
          closeThreadSearchBar();
          return;
        }
        openThreadSearchBar('');
      });
    }
    var searchInput = el('ce2ThreadSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        var st = state();
        if (st) st.threadSearchQuery = searchInput.value.trim().toLowerCase();
        if (global.Ce2ThreadSearch && global.Ce2ThreadSearch.scheduleSearch) {
          global.Ce2ThreadSearch.scheduleSearch();
        } else if (deps.requestRender) {
          deps.requestRender({ threadOnly: true });
        }
      });
    }
  }

  function wireSheetClose(btnId, sheetId, clearCtx) {
    var btn = el(btnId);
    var sheet = el(sheetId);
    if (!btn || !sheet) return;
    function closeSheet() {
      sheet.hidden = true;
      if (clearCtx) activeCtx = null;
    }
    btn.addEventListener('click', closeSheet);
    var backdrop = sheet.querySelector('.ce2-sheet-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeSheet);
  }

  function closeAllSheets() {
    ['ce2MsgInfo', 'ce2ForwardSheet', 'ce2EditSheet', 'ce2ReactSheet', 'ce2TemplateSheet', 'ce2MentionSheet', 'ce2NotifyPrefsSheet', 'ce2GroupSettingsSheet'].forEach(
      function (id) {
        var s = el(id);
        if (s) s.hidden = true;
      }
    );
    if (deps.syncViewport) deps.syncViewport();
  }

  function showSheet(id) {
    closeMessageMenu();
    var s = el(id);
    if (s) s.hidden = false;
  }

  function showMessageInfo(m, ac, self) {
    var body = el('ce2MsgInfoBody');
    if (!body) return;
    var rc = deps.receipts ? deps.receipts() : null;
    var otherRead =
      ac && ac.type === 'direct' && state().convMeta
        ? (state().convMeta.lastRead || {})[ac.otherUid]
        : null;
    var status =
      rc && self
        ? rc.deliveryStatus(
            m,
            state().me.uid,
            otherRead,
            m._failed ? { otherOnline: false } : undefined
          )
        : '';
    body.innerHTML =
      '<dl class="ce2-info-dl">' +
      '<dt>Sent</dt><dd>' +
      deps.escapeHtml(deps.fmtTime(m.createdAt) || '—') +
      '</dd>' +
      '<dt>Classification</dt><dd>' +
      deps.escapeHtml(m.classification || 'foundation') +
      '</dd>' +
      '<dt>Shareable</dt><dd>' +
      (m.shareable ? 'Yes' : 'No') +
      '</dd>' +
      (status ? '<dt>Status</dt><dd>' + deps.escapeHtml(rc.statusLabel(status)) + '</dd>' : '') +
      (m.editedAt ? '<dt>Edited</dt><dd>' + deps.escapeHtml(deps.fmtTime(m.editedAt)) + '</dd>' : '') +
      (m.formationTag ? '<dt>Formation</dt><dd>' + deps.escapeHtml(m.formationTag) + '</dd>' : '') +
      '<dt>Message ID</dt><dd class="ce2-info-mono">' +
      deps.escapeHtml(m.id || 'pending') +
      '</dd></dl>';
    showSheet('ce2MsgInfo');
    activeCtx = { m: m, ac: ac };
  }

  function showReactSheet(m, ac) {
    var row = el('ce2ReactRow');
    if (!row) return;
    row.innerHTML = '';
    var st = state();
    var mine = (st && st.me && m.reactions && m.reactions[st.me.uid]) || '';
    REACTIONS.forEach(function (emoji) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ce2-react-btn' + (mine === emoji ? ' is-mine' : '');
      btn.textContent = emoji;
      btn.setAttribute(
        'aria-label',
        mine === emoji ? 'Remove ' + emoji + ' reaction' : 'React with ' + emoji
      );
      btn.addEventListener('click', function () {
        setReaction(m, ac, emoji).catch(function (err) {
          if (deps.handleCe2Error) deps.handleCe2Error(err, 'react');
        });
        closeAllSheets();
      });
      row.appendChild(btn);
    });
    showSheet('ce2ReactSheet');
    activeCtx = { m: m, ac: ac };
  }

  function reactionDeleteValue() {
    if (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue) {
      return firebase.firestore.FieldValue.delete();
    }
    return { _delete: true };
  }

  async function setReaction(m, ac, emoji) {
    var col = messageCol(ac);
    var st = state();
    var me = st && st.me;
    if (!col || !m || !m.id || !me || String(m.id).indexOf('pending-') === 0) return;
    var prev = Object.assign({}, m.reactions || {});
    var next = applyReactionToggle(prev, me.uid, emoji);
    var patch = reactionWritePatch(me.uid, next, reactionDeleteValue());

    m.reactions = next;
    patchLocalMessage(m.id, { reactions: next });
    var host =
      typeof document !== 'undefined'
        ? document.querySelector('.ce2-row[data-message-id="' + m.id + '"]')
        : null;
    if (host) syncReactionsRow(host, m, ac);

    try {
      await col.doc(m.id).update(patch);
    } catch (err) {
      m.reactions = prev;
      patchLocalMessage(m.id, { reactions: prev });
      if (host) syncReactionsRow(host, m, ac);
      throw err;
    }
  }

  function showEditSheet(m, ac) {
    var composer = el('ce2Input');
    if (composer && typeof composer.blur === 'function') composer.blur();
    var ta = el('ce2EditInput');
    if (ta) {
      ta.disabled = false;
      ta.removeAttribute('tabindex');
      ta.value = m.content || '';
    }
    if (typeof window !== 'undefined' && window.Ce2Format && window.Ce2Format.onEditOpen) {
      window.Ce2Format.onEditOpen();
    }
    showSheet('ce2EditSheet');
    activeCtx = { m: m, ac: ac };
    if (deps.syncFocusableInputs) deps.syncFocusableInputs();
    if (ta) {
      window.setTimeout(function () {
        if (deps.syncFocusableInputs) deps.syncFocusableInputs();
        ta.disabled = false;
        ta.removeAttribute('tabindex');
        ta.focus();
        try {
          ta.setSelectionRange(ta.value.length, ta.value.length);
        } catch (_) {}
        if (deps.syncViewport) {
          deps.syncViewport();
          window.setTimeout(deps.syncViewport, 120);
          window.setTimeout(deps.syncViewport, 320);
        }
      }, 80);
    }
  }

  async function saveEdit() {
    var ctx = activeCtx;
    if (!ctx || !ctx.m || !ctx.ac) {
      errMsg('Edit session expired — open the menu again.');
      return;
    }
    if (!ctx.m.id || String(ctx.m.id).indexOf('pending-') === 0) {
      errMsg('Wait until the message finishes sending, then edit.');
      return;
    }
    var ta = el('ce2EditInput');
    var text = (ta && ta.value || '').trim();
    if (!text) {
      errMsg('Message cannot be empty.');
      return;
    }
    if (text === String(ctx.m.content || '').trim()) {
      closeAllSheets();
      activeCtx = null;
      return;
    }
    var col = messageCol(ctx.ac);
    if (!col) {
      errMsg('Cannot save edit — reopen this thread.');
      return;
    }
    var editedAt = firebase.firestore.Timestamp.now();
    await col.doc(ctx.m.id).update({
      content: text,
      editedAt: editedAt,
    });
    patchLocalMessage(ctx.m.id, { content: text, editedAt: editedAt });
    closeAllSheets();
    activeCtx = null;
    statusMsg('Message edited');
    if (deps.requestRender) deps.requestRender({ threadOnly: true });
  }

  function showForwardSheet(m, ac) {
    var list = el('ce2ForwardList');
    var st = state();
    if (!list || !st) return;
    list.innerHTML = '';
    var targets = [];
    (st.threads || []).forEach(function (t) {
      if ((t.convId || t.id) === ac.id && ac.type === 'direct') return;
      targets.push({
        label: t.label || 'Direct',
        type: 'direct',
        convId: t.convId || t.id,
        otherUid: t.otherUid,
        peerUser: t.peerUser,
      });
    });
    (st.visibleGroups || []).forEach(function (g) {
      if (ac.type === 'group' && g.id === ac.id) return;
      targets.push({ label: g.name, type: 'group', id: g.id });
    });
    if (!targets.length) {
      list.innerHTML = '<li class="ce2-placeholder">No other threads available</li>';
    } else {
      targets.forEach(function (t) {
        var li = document.createElement('li');
        li.className = 'ce2-li';
        li.textContent = t.label;
        li.addEventListener('click', function () {
          forwardToTarget(m, ac, t).catch(deps.handleCe2Error);
          closeAllSheets();
        });
        list.appendChild(li);
      });
    }
    showSheet('ce2ForwardSheet');
    activeCtx = { m: m, ac: ac };
  }

  async function forwardToTarget(m, ac, target) {
    var st = state();
    var me = st.me;
    if (!me || !deps.canReadMessageContent(me, m, ac)) return;

    var gate = { ok: true };
    if (deps.canForwardToTarget) {
      gate = await deps.canForwardToTarget(m, ac, target);
      if (!gate.ok) {
        errMsg(gate.reason || 'Cannot forward to this thread.');
        return;
      }
    }

    var preview = messageCopyText(m) || 'Forwarded message';
    var classification = m.classification || 'foundation';
    var g = deps.gov && deps.gov();
    if (deps.governanceEnabled && deps.governanceEnabled() && g && typeof gate.floor === 'number' && gate.floor >= 0) {
      classification = g.clampClassification(classification, gate.floor);
    }

    var forwardFrom = {
      messageId: m.id,
      senderId: m.senderId,
      preview: preview.slice(0, 200),
      conversationId: ac.id,
    };

    var patch = {
      conversationId: '',
      senderId: me.uid,
      tier: me.isAdmin ? 'elite' : me.tier,
      classification: classification,
      shareable: false,
      content: '↪ ' + preview,
      messageType: m.messageType || 'text',
      createdAt: firebase.firestore.Timestamp.now(),
      forwardFrom: forwardFrom,
    };

    if (m.imageUrl) patch.imageUrl = m.imageUrl;
    if (m.imageThumbUrl) patch.imageThumbUrl = m.imageThumbUrl;
    if (m.videoUrl) patch.videoUrl = m.videoUrl;
    if (m.videoPosterUrl) patch.videoPosterUrl = m.videoPosterUrl;
    if (m.audioUrl) patch.audioUrl = m.audioUrl;

    if (target.type === 'direct') {
      if (deps.ensureDirectConv) await deps.ensureDirectConv(target.otherUid);
      var convId = target.convId || deps.directConvId(me.uid, target.otherUid);
      patch.conversationId = convId;
      patch.receiverId = target.otherUid;
      await db()
        .collection('ce2_conversations')
        .doc(convId)
        .collection('ce2_messages')
        .add(patch);
    } else {
      patch.conversationId = target.id;
      patch.receiverId = '';
      await db()
        .collection('communicationGroups')
        .doc(target.id)
        .collection('ce2_messages')
        .add(patch);
    }
    statusMsg('Forwarded');
    await audit('message_forwarded', { messageId: m.id, to: target.type });
  }

  async function togglePin(m, ac, unpin) {
    var ref = convDocRef(ac);
    var me = state().me;
    if (!ref || !me || !m.id) return;
    if (unpin) {
      await ref.update({ pinnedMessageId: firebase.firestore.FieldValue.delete(), pinnedAt: firebase.firestore.FieldValue.delete(), pinnedBy: firebase.firestore.FieldValue.delete() });
      statusMsg('Unpinned');
    } else {
      await ref.update({
        pinnedMessageId: m.id,
        pinnedAt: firebase.firestore.Timestamp.now(),
        pinnedBy: me.uid,
      });
      statusMsg('Pinned');
    }
  }

  async function toggleStar(m, ac) {
    var st = state();
    var me = st.me;
    if (!me || !m.id) return;
    var d = db();
    var ref = d.collection('users').doc(me.uid).collection('ce2_saved').doc(m.id);
    if (isMessageSaved(m)) {
      await ref.delete();
      delete st.userMsgPrefs.saved[m.id];
      statusMsg('Removed from starred');
    } else {
      await ref.set({
        messageId: m.id,
        conversationId: ac.id,
        conversationType: ac.type,
        preview: messageCopyText(m).slice(0, 200),
        savedAt: firebase.firestore.Timestamp.now(),
      });
      st.userMsgPrefs.saved[m.id] = true;
      statusMsg('Starred');
    }
  }

  function toggleHide(m, ac) {
    var st = state();
    if (!st || !m.id) return;
    var hk = ac.type + ':' + ac.id;
    if (!st.userMsgPrefs.hidden[hk]) st.userMsgPrefs.hidden[hk] = {};
    if (st.userMsgPrefs.hidden[hk][m.id]) {
      delete st.userMsgPrefs.hidden[hk][m.id];
      statusMsg('Message visible');
    } else {
      st.userMsgPrefs.hidden[hk][m.id] = true;
      saveLocalJson(prefsKey(st.me.uid, 'hidden'), st.userMsgPrefs.hidden);
      statusMsg('Hidden for you');
    }
    if (deps.requestRender) deps.requestRender({ threadOnly: true });
  }

  async function reportMessage(m, ac) {
    var st = state();
    var me = st.me;
    if (!me) return;
    await db().collection('ce2_message_reports').add({
      reporterId: me.uid,
      messageId: m.id,
      conversationId: ac.id,
      conversationType: ac.type,
      senderId: m.senderId,
      preview: messageCopyText(m).slice(0, 300),
      status: 'open',
      createdAt: firebase.firestore.Timestamp.now(),
    });
    await audit('message_reported', { messageId: m.id, conversationId: ac.id });
    statusMsg('Report submitted');
  }

  async function toggleBlock(uid) {
    var st = state();
    var me = st.me;
    if (!me || !uid) return;
    var ref = db().collection('users').doc(me.uid).collection('ce2_blocks').doc(uid);
    if (isUserBlocked(uid)) {
      await ref.delete();
      delete st.userMsgPrefs.blocked[uid];
      statusMsg('User unblocked');
    } else {
      await ref.set({ blockedAt: firebase.firestore.Timestamp.now() });
      st.userMsgPrefs.blocked[uid] = true;
      statusMsg('User blocked');
    }
    saveLocalJson(prefsKey(me.uid, 'blocked'), st.userMsgPrefs.blocked);
    if (deps.scheduleLoadThreads) deps.scheduleLoadThreads(me.uid);
    if (deps.requestRender) deps.requestRender({ throttle: true });
  }

  async function toggleFormationTag(m, ac, tag) {
    var col = messageCol(ac);
    if (!col || !m.id) return;
    var patch = {};
    if (m.formationTag === tag) {
      patch.formationTag = firebase.firestore.FieldValue.delete();
    } else {
      patch.formationTag = tag;
    }
    await col.doc(m.id).update(patch);
    statusMsg(m.formationTag === tag ? 'Tag removed' : 'Tagged');
  }

  async function addFormationNote(m, ac) {
    var st = state();
    var me = st.me;
    if (!me) return;
    await db()
      .collection('users')
      .doc(me.uid)
      .collection('ce2_formation_notes')
      .add({
        messageId: m.id,
        conversationId: ac.id,
        preview: messageCopyText(m).slice(0, 500),
        createdAt: firebase.firestore.Timestamp.now(),
      });
    statusMsg('Saved to formation notes');
  }

  async function requestMentorReview(m, ac) {
    await audit('mentor_review_requested', {
      messageId: m.id,
      conversationId: ac.id,
      preview: messageCopyText(m).slice(0, 200),
    });
    statusMsg('Mentor review requested');
  }

  function showTemplateSheet() {
    var list = el('ce2TemplateList');
    if (!list) return;
    list.innerHTML = '';
    TEMPLATES.forEach(function (t) {
      var li = document.createElement('li');
      li.className = 'ce2-li';
      li.textContent = t.label;
      li.addEventListener('click', function () {
        var input = el('ce2Input');
        if (input) {
          input.value = t.text;
          syncComposerInputHeight(input);
          input.focus();
        }
        closeAllSheets();
      });
      list.appendChild(li);
    });
    showSheet('ce2TemplateSheet');
  }

  function showMentionSheet(ac) {
    var list = el('ce2MentionList');
    var st = state();
    if (!list || !st) return;
    list.innerHTML = '<li class="ce2-placeholder">Loading members…</li>';
    showSheet('ce2MentionSheet');
    db()
      .collection('communicationGroups')
      .doc(ac.id)
      .collection('members')
      .limit(40)
      .get()
      .then(function (snap) {
        list.innerHTML = '';
        if (snap.empty) {
          list.innerHTML = '<li class="ce2-placeholder">No members found</li>';
          return;
        }
        var jobs = [];
        snap.forEach(function (doc) {
          jobs.push(
            db()
              .collection('users')
              .doc(doc.id)
              .get()
              .then(function (ud) {
                var name = ud.exists ? ud.data().displayName || ud.data().name || 'Member' : 'Member';
                var li = document.createElement('li');
                li.className = 'ce2-li';
                li.textContent = name;
                li.addEventListener('click', function () {
                  var input = el('ce2Input');
                  if (input) {
                    input.value = (input.value ? input.value + ' ' : '') + '@' + name.split(' ')[0] + ' ';
                    syncComposerInputHeight(input);
                    input.focus();
                  }
                  closeAllSheets();
                });
                list.appendChild(li);
              })
          );
        });
        return Promise.all(jobs);
      })
      .catch(function () {
        list.innerHTML = '<li class="ce2-placeholder">Could not load members</li>';
      });
  }

  function openThreadSearchBar(prefill) {
    var st = state();
    var bar = el('ce2ThreadSearch');
    var input = el('ce2ThreadSearchInput');
    var toggle = el('ce2ThreadSearchToggle');
    if (!bar || !input) return;
    bar.hidden = false;
    var text = typeof prefill === 'string' ? prefill : '';
    input.value = text;
    if (st) st.threadSearchQuery = text.trim().toLowerCase();
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'true');
      toggle.classList.add('is-active');
    }
    input.focus();
    if (global.Ce2ThreadSearch && global.Ce2ThreadSearch.onOpen) {
      global.Ce2ThreadSearch.onOpen();
    }
    if (deps.requestRender) deps.requestRender({ threadOnly: true });
  }

  function openThreadSearch(m) {
    openThreadSearchBar(messageCopyText(m).slice(0, 40));
  }

  async function loadUserPrefs(uid, opts) {
    var st = state();
    if (!st) return;
    opts = opts || {};
    st.userMsgPrefs = st.userMsgPrefs || {
      hidden: loadLocalJson(prefsKey(uid, 'hidden'), {}),
      saved: {},
      blocked: loadLocalJson(prefsKey(uid, 'blocked'), {}),
    };
    st.userMsgPrefs.hidden = loadLocalJson(prefsKey(uid, 'hidden'), st.userMsgPrefs.hidden || {});
    if (!opts.lite) {
      try {
        var snap = await db().collection('users').doc(uid).collection('ce2_saved').limit(200).get();
        st.userMsgPrefs.saved = {};
        snap.forEach(function (doc) {
          st.userMsgPrefs.saved[doc.id] = true;
        });
      } catch (e) {
        console.warn('ce2_saved', e);
      }
    }
    try {
      var blocks = await db().collection('users').doc(uid).collection('ce2_blocks').limit(100).get();
      blocks.forEach(function (doc) {
        st.userMsgPrefs.blocked[doc.id] = true;
      });
    } catch (e) {
      console.warn('ce2_blocks', e);
    }
  }

  async function loadSavedPrefs(uid) {
    return loadUserPrefs(uid, { lite: false });
  }

  function findPinnedMessage(st, pinId) {
    if (!st || !pinId) return null;
    function from(list) {
      if (!list || !list.length) return null;
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].id === pinId) return list[i];
      }
      return null;
    }
    return from(st.messages) || from(st.lastServerMessages) || from(st.searchJumpMessages);
  }

  function renderPinnedBanner(scroll, ac) {
    if (!scroll || !ac) return;
    var existing = scroll.querySelector('.ce2-pinned-banner');
    if (existing) existing.remove();
    var st = state();
    var pinId = st.convMeta && st.convMeta.pinnedMessageId;
    if (!pinId) return;
    var pinned = findPinnedMessage(st, pinId);
    var preview = pinned && !pinned.deleted ? messageCopyText(pinned) : '';
    var bar = document.createElement('button');
    bar.type = 'button';
    bar.className = 'ce2-pinned-banner';
    bar.setAttribute('aria-label', 'Jump to pinned announcement');
    var kicker = document.createElement('span');
    kicker.className = 'ce2-pinned-banner-kicker';
    kicker.textContent = 'Pinned';
    var text = document.createElement('span');
    text.className = 'ce2-pinned-banner-text';
    text.textContent = (preview || 'Announcement').slice(0, 80);
    bar.appendChild(kicker);
    bar.appendChild(text);
    bar.addEventListener('click', function () {
      if (deps.jumpToMessage) {
        deps.jumpToMessage(pinId);
        return;
      }
      var row = scroll.querySelector('[data-message-id="' + pinId + '"]');
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    var firstRow = scroll.querySelector('.ce2-row');
    if (firstRow) scroll.insertBefore(bar, firstRow);
    else scroll.appendChild(bar);
  }

  function reactionsHostBubble(host) {
    if (!host) return null;
    if (host.classList && host.classList.contains('ce2-bubble')) return host;
    return host.querySelector ? host.querySelector('.ce2-bubble') : null;
  }

  function appendReactionsRow(bubble, m, ac) {
    syncReactionsRow(bubble, m, ac);
  }

  function syncReactionsRow(host, m, ac) {
    var bubble = reactionsHostBubble(host);
    if (!bubble || !m) return;
    ac = ac || (state() && state().activeConversation);
    var st = state();
    var myUid = st && st.me && st.me.uid;
    var grouped = aggregateReactions(m.reactions, myUid);
    var existing = bubble.querySelector('.ce2-msg-reactions');
    var canWrite =
      !m.deleted && !m._pending && m.id && String(m.id).indexOf('pending-') !== 0;

    if (!grouped.length) {
      if (existing) existing.remove();
      return;
    }

    var row = existing;
    if (!row) {
      row = document.createElement('div');
      row.className = 'ce2-msg-reactions';
      bubble.appendChild(row);
    }
    row.innerHTML = '';

    grouped.forEach(function (g) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ce2-msg-reaction' + (g.mine ? ' is-mine' : '');
      btn.dataset.emoji = g.emoji;
      var label = document.createElement('span');
      label.className = 'ce2-msg-reaction-emoji';
      label.textContent = g.emoji;
      btn.appendChild(label);
      if (g.count > 1) {
        var count = document.createElement('span');
        count.className = 'ce2-msg-reaction-count';
        count.textContent = String(g.count);
        btn.appendChild(count);
      }
      btn.setAttribute(
        'aria-label',
        (g.mine ? 'Remove your ' : 'React with ') +
          g.emoji +
          (g.count > 1 ? ', ' + g.count : '')
      );
      btn.title = g.uids.join(', ');
      if (canWrite) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          setReaction(m, ac, g.emoji).catch(function (err) {
            if (deps.handleCe2Error) deps.handleCe2Error(err, 'react');
          });
        });
      } else {
        btn.disabled = true;
      }
      row.appendChild(btn);
    });

    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'ce2-msg-reaction ce2-msg-reaction-add';
    addBtn.setAttribute('aria-label', 'Add reaction');
    addBtn.textContent = '+';
    addBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      showReactSheet(m, ac);
    });
    row.appendChild(addBtn);

    row.onclick = function (e) {
      if (e.target === row) {
        e.preventDefault();
        e.stopPropagation();
        showReactSheet(m, ac);
      }
    };
  }

  function renderFormationBadge(bubble, m) {
    if (!m.formationTag) return;
    var tag = document.createElement('span');
    tag.className = 'ce2-formation-tag';
    tag.textContent = m.formationTag === 'prayer' ? '🙏 Prayer' : '✓ Check-in';
    bubble.insertBefore(tag, bubble.firstChild);
  }

  function renderForwardQuote(bubble, m) {
    if (!m.forwardFrom || !m.forwardFrom.preview) return;
    var q = document.createElement('div');
    q.className = 'ce2-forward-quote';
    q.textContent = '↪ ' + m.forwardFrom.preview;
    bubble.insertBefore(q, bubble.firstChild);
  }

  function renderEditedLabel(foot, m) {
    if (!m.editedAt) return;
    var ed = document.createElement('span');
    ed.className = 'ce2-msg-edited';
    ed.textContent = ' · edited';
    foot.appendChild(ed);
  }

  function messageMatchesSearch(m, q) {
    var ts = global.Ce2ThreadSearch;
    var st = state();
    if (ts && ts.messageMatches) {
      return ts.messageMatches(m, {
        word: q || (st && st.threadSearchQuery) || '',
        senderId: st && st.threadSearchSenderId,
        startMs: st && st.threadSearchStartMs,
        endMs: st && st.threadSearchEndMs,
      });
    }
    if (!q) return false;
    var t = messageCopyText(m).toLowerCase();
    return t.indexOf(q) >= 0;
  }

  global.Ce2MessageActions = {
    VERSION: 2,
    init: function (d) {
      deps = d;
    },
    loadUserPrefs: loadUserPrefs,
    loadSavedPrefs: loadSavedPrefs,
    buildMenuItems: buildMenuItems,
    wireMessageRow: wireMessageRow,
    wireMessageMenuUi: wireMessageMenuUi,
    closeMessageMenu: closeMessageMenu,
    isMessageHidden: isMessageHidden,
    isMessageSaved: isMessageSaved,
    isUserBlocked: isUserBlocked,
    renderPinnedBanner: renderPinnedBanner,
    appendReactionsRow: appendReactionsRow,
    syncReactionsRow: syncReactionsRow,
    renderFormationBadge: renderFormationBadge,
    renderForwardQuote: renderForwardQuote,
    renderEditedLabel: renderEditedLabel,
    messageMatchesSearch: messageMatchesSearch,
    messageCopyText: messageCopyText,
    aggregateReactions: aggregateReactions,
    applyReactionToggle: applyReactionToggle,
    reactionWritePatch: reactionWritePatch,
    decideSwipeReply: decideSwipeReply,
    canSwipeReply: canSwipeReply,
    REACTIONS: REACTIONS,
    SWIPE_REPLY: SWIPE_REPLY,
  };
})(typeof window !== 'undefined' ? window : global);
