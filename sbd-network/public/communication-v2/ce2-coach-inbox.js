/**
 * CE2 coach inbox — hosts/facilitators (and admins) see who needs a nudge.
 * Assembled client-side from members + users.lastActive + group lastRead /
 * unreadCount + the coach's existing DM threads. No aggregate collection.
 */
(function (global) {
  'use strict';

  var VERSION = 1;
  var MESSENGER_PATH = '/communication-v2/';
  var QUIET_MS = 3 * 24 * 60 * 60 * 1000;
  var BEHIND_MS = 3 * 24 * 60 * 60 * 1000;
  var JOIN_GRACE_MS = 24 * 60 * 60 * 1000;
  var DM_UNREAD_MIN = 1;
  var GROUP_UNREAD_MIN = 3;
  var MAX_ROWS = 40;
  var MAX_MEMBERS_PER_GROUP = 40;
  var UID_RE = /^[A-Za-z0-9._-]{1,128}$/;

  var REASON_COPY = {
    quiet: 'Quiet — no recent activity',
    behind: 'Behind on the group thread',
    waiting: 'Unread with you',
  };

  function moderation() {
    return global.Ce2Moderation || null;
  }

  function presence() {
    return global.Ce2Presence || null;
  }

  function safeUid(value) {
    var s = String(value || '').trim();
    return UID_RE.test(s) ? s : '';
  }

  function firstName(label) {
    var pr = presence();
    if (pr && typeof pr.firstName === 'function') return pr.firstName(label);
    var s = String(label || '').trim();
    if (!s) return '';
    return s.split(/\s+/)[0];
  }

  function tsToMs(ts) {
    var pr = presence();
    if (pr && typeof pr.tsToMs === 'function') return pr.tsToMs(ts);
    if (ts == null || ts === '') return 0;
    try {
      if (typeof ts.toMillis === 'function') return ts.toMillis();
      if (typeof ts.toDate === 'function') return ts.toDate().getTime();
      if (typeof ts.seconds === 'number') {
        return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
      }
      if (ts instanceof Date) return ts.getTime();
      if (typeof ts === 'number' && isFinite(ts)) {
        return ts < 1e12 ? ts * 1000 : ts;
      }
    } catch (_) {}
    return 0;
  }

  function canSeeCoachInbox(user, staffedCount) {
    if (!user) return false;
    if (user.isAdmin) return true;
    return (staffedCount || 0) > 0;
  }

  function isStaffRole(role, user) {
    var resolved = role === 'creator' ? 'host' : role;
    var mod = moderation();
    if (mod && typeof mod.isGroupStaff === 'function') {
      return !!mod.isGroupStaff(resolved, user);
    }
    if (user && user.isAdmin) return true;
    return resolved === 'host' || resolved === 'facilitator';
  }

  function resolveRole(memberData, groupData, uid) {
    var mod = moderation();
    if (mod && typeof mod.resolveMemberRole === 'function') {
      return mod.resolveMemberRole(memberData, groupData, uid);
    }
    var raw = memberData && memberData.role != null ? String(memberData.role).toLowerCase() : '';
    if (raw === 'host' || raw === 'creator') return 'host';
    if (raw === 'facilitator') return 'facilitator';
    if (!raw && uid && groupData && groupData.createdBy === uid) return 'host';
    return 'member';
  }

  function isAttentionCandidate(memberRole, viewer, memberUid) {
    if (!viewer || !memberUid) return false;
    if (memberUid === viewer.uid) return false;
    return !isStaffRole(memberRole, null);
  }

  function staffedGroupsFromMemberships(user, groups) {
    var out = [];
    (groups || []).forEach(function (g) {
      if (!g || !g.id) return;
      var role = resolveRole({ role: g.role }, { createdBy: g.createdBy }, user && user.uid);
      if (isStaffRole(role, user)) {
        out.push({
          id: g.id,
          name: g.name || 'Group',
          role: role,
          createdBy: g.createdBy || '',
        });
      }
    });
    return out;
  }

  function evaluateAttention(input, nowMs) {
    input = input || {};
    nowMs = nowMs || Date.now();
    var reasons = [];
    var lastActiveMs = tsToMs(input.lastActive);
    var joinedMs = tsToMs(input.joinedAt);
    var lastReadMs = tsToMs(input.groupLastRead);
    var lastMsgMs = tsToMs(input.groupLastMessageAt);
    var ageActive = lastActiveMs ? nowMs - lastActiveMs : Infinity;
    var memberAge = joinedMs ? nowMs - joinedMs : Infinity;
    var unread = typeof input.groupUnread === 'number' ? input.groupUnread : 0;
    var dmUnread = typeof input.dmUnread === 'number' ? input.dmUnread : 0;

    if (ageActive >= QUIET_MS && (lastActiveMs || memberAge >= JOIN_GRACE_MS)) {
      reasons.push('quiet');
    }

    if (lastMsgMs) {
      var messageAge = nowMs - lastMsgMs;
      if (!lastReadMs) {
        if (messageAge >= BEHIND_MS) reasons.push('behind');
      } else if (lastMsgMs - lastReadMs >= BEHIND_MS) {
        reasons.push('behind');
      }
      if (reasons.indexOf('behind') < 0 && unread >= GROUP_UNREAD_MIN) {
        reasons.push('behind');
      }
    }

    if (dmUnread >= DM_UNREAD_MIN) reasons.push('waiting');

    var severity = 0;
    if (reasons.indexOf('waiting') >= 0) severity += 3;
    if (reasons.indexOf('behind') >= 0) severity += 2;
    if (reasons.indexOf('quiet') >= 0) severity += 1;

    return {
      needsNudge: reasons.length > 0,
      reasons: reasons,
      severity: severity,
      lastActiveMs: lastActiveMs || 0,
      joinedMs: joinedMs || 0,
      sortAt: lastActiveMs || joinedMs || 0,
    };
  }

  function reasonLabel(reason) {
    return REASON_COPY[reason] || reason || '';
  }

  function mentionDraft(name) {
    var token = firstName(name);
    return token ? '@' + token + ' ' : '';
  }

  function nudgeDraft(name, groupName) {
    var first = firstName(name) || 'there';
    var group = String(groupName || 'the group').trim() || 'the group';
    return 'Hey ' + first + ' — checking in from ' + group + '. How are you doing this week?';
  }

  function threadUnreadFor(threads, uid) {
    var list = threads || [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].otherUid === uid) {
        return list[i].unread || 0;
      }
    }
    return 0;
  }

  function buildInboxRows(bundle, nowMs) {
    bundle = bundle || {};
    nowMs = nowMs || Date.now();
    var viewer = bundle.viewer;
    var rows = [];
    if (!canSeeCoachInbox(viewer, (bundle.staffedGroups || []).length)) return rows;

    var users = bundle.users || {};
    var groupMeta = bundle.groupMeta || {};
    var memberships = bundle.memberships || [];
    var threads = bundle.threads || [];
    var groupNameById = {};
    (bundle.staffedGroups || []).forEach(function (g) {
      if (g && g.id) groupNameById[g.id] = g.name || 'Group';
    });

    memberships.forEach(function (mem) {
      if (!mem || !mem.uid || !mem.groupId) return;
      if (!isAttentionCandidate(mem.role, viewer, mem.uid)) return;
      var user = users[mem.uid] || {};
      var meta = groupMeta[mem.groupId] || {};
      var lastRead =
        meta.lastRead && typeof meta.lastRead === 'object' ? meta.lastRead[mem.uid] : null;
      var unreadMap = meta.unreadCount && typeof meta.unreadCount === 'object' ? meta.unreadCount : {};
      var evald = evaluateAttention(
        {
          lastActive: user.lastActive || user.ce2PresenceAt || user.lastSeen,
          joinedAt: mem.joinedAt,
          groupLastRead: lastRead,
          groupLastMessageAt: meta.lastMessageAt,
          groupUnread: typeof unreadMap[mem.uid] === 'number' ? unreadMap[mem.uid] : 0,
          dmUnread: threadUnreadFor(threads, mem.uid),
        },
        nowMs
      );
      if (!evald.needsNudge) return;
      var name = String(user.name || user.displayName || '').trim() || 'Member';
      var groupName = groupNameById[mem.groupId] || mem.groupName || 'Group';
      rows.push({
        uid: mem.uid,
        name: name,
        firstName: firstName(name) || 'Member',
        groupId: mem.groupId,
        groupName: groupName,
        role: mem.role || 'member',
        reasons: evald.reasons,
        reasonLabels: evald.reasons.map(reasonLabel),
        severity: evald.severity,
        lastActiveMs: evald.lastActiveMs,
        mentionDraft: mentionDraft(name),
        nudgeDraft: nudgeDraft(name, groupName),
        sortAt: evald.sortAt,
      });
    });

    rows.sort(function (a, b) {
      if (b.severity !== a.severity) return b.severity - a.severity;
      return (a.sortAt || 0) - (b.sortAt || 0);
    });
    return rows.slice(0, MAX_ROWS);
  }

  function parseCoachParams(search) {
    var q;
    try {
      q = typeof search === 'string' ? new URLSearchParams(search) : search;
    } catch (_) {
      return null;
    }
    if (!q || typeof q.get !== 'function') return null;
    var mention = safeUid(q.get('mention') || '');
    var group = safeUid(q.get('group') || '');
    var uid = safeUid(q.get('uid') || '');
    var nudge = String(q.get('nudge') || '') === '1';
    var coach = String(q.get('coach') || '') === '1';
    if (mention && group) {
      return { kind: 'mention', groupId: group, uid: mention };
    }
    if (nudge && uid) {
      return { kind: 'nudge', uid: uid };
    }
    if (coach) {
      return { kind: 'inbox', groupId: group || '' };
    }
    return null;
  }

  function coachHref(opts) {
    opts = opts || {};
    if (opts.kind === 'mention' && safeUid(opts.groupId) && safeUid(opts.uid)) {
      return (
        MESSENGER_PATH +
        '?group=' +
        encodeURIComponent(opts.groupId) +
        '&mention=' +
        encodeURIComponent(opts.uid)
      );
    }
    if (opts.kind === 'nudge' && safeUid(opts.uid)) {
      return MESSENGER_PATH + '?uid=' + encodeURIComponent(opts.uid) + '&nudge=1';
    }
    var href = MESSENGER_PATH + '?coach=1';
    if (opts.groupId && safeUid(opts.groupId)) {
      href += '&group=' + encodeURIComponent(opts.groupId);
    }
    return href;
  }

  function rowHtml(row, escapeHtml) {
    var esc = escapeHtml || function (s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
    };
    var chips = (row.reasonLabels || [])
      .map(function (label) {
        return '<span class="ce2-coach-chip">' + esc(label) + '</span>';
      })
      .join('');
    return (
      '<div class="ce2-li-row">' +
      '<span class="ce2-avatar" aria-hidden="true">' +
      esc((row.firstName || 'M').slice(0, 1).toUpperCase()) +
      '</span>' +
      '<span class="ce2-li-body"><div class="ce2-li-name">' +
      esc(row.name) +
      '</div><div class="ce2-li-meta">' +
      esc(row.groupName) +
      '</div><div class="ce2-coach-chips">' +
      chips +
      '</div>' +
      '<div class="ce2-coach-actions">' +
      '<button type="button" class="ce2-btn ce2-btn-ghost ce2-coach-act" data-coach-act="dm">Open DM</button>' +
      '<button type="button" class="ce2-btn ce2-btn-ghost ce2-coach-act" data-coach-act="group">In group</button>' +
      '<button type="button" class="ce2-btn ce2-btn-ghost ce2-coach-act" data-coach-act="nudge">Nudge</button>' +
      '</div></span></div>'
    );
  }

  global.Ce2CoachInbox = {
    VERSION: VERSION,
    QUIET_MS: QUIET_MS,
    BEHIND_MS: BEHIND_MS,
    JOIN_GRACE_MS: JOIN_GRACE_MS,
    DM_UNREAD_MIN: DM_UNREAD_MIN,
    GROUP_UNREAD_MIN: GROUP_UNREAD_MIN,
    MAX_ROWS: MAX_ROWS,
    MAX_MEMBERS_PER_GROUP: MAX_MEMBERS_PER_GROUP,
    canSeeCoachInbox: canSeeCoachInbox,
    isStaffRole: isStaffRole,
    isAttentionCandidate: isAttentionCandidate,
    staffedGroupsFromMemberships: staffedGroupsFromMemberships,
    resolveRole: resolveRole,
    evaluateAttention: evaluateAttention,
    buildInboxRows: buildInboxRows,
    reasonLabel: reasonLabel,
    mentionDraft: mentionDraft,
    nudgeDraft: nudgeDraft,
    firstName: firstName,
    tsToMs: tsToMs,
    parseCoachParams: parseCoachParams,
    coachHref: coachHref,
    rowHtml: rowHtml,
    safeUid: safeUid,
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
