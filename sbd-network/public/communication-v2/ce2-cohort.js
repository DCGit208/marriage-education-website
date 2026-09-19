/**
 * CE2 Cohort OS — link a formation group to a course or board cohort.
 * Idempotent open-or-create by deterministic group id; join is gated.
 */
(function (global) {
  'use strict';

  var VERSION = 1;
  var MESSENGER_PATH = '/communication-v2/';
  var DEFAULT_KEY = 'default';
  var TYPES = { COURSE: 'course', BOARD: 'board' };
  var ID_RE = /^[A-Za-z0-9._-]{1,80}$/;
  var GROUP_ID_RE = /^cohort_(course|board)_[a-z0-9._-]{1,64}_[a-z0-9._-]{1,32}$/;
  var TIER_RANK = {
    free: 0,
    foundation: 0,
    premium: 1,
    elite: 2,
    ambassador: 3,
    senior_ambassador: 4,
    rd: 5,
  };

  function safeId(value) {
    var s = String(value || '').trim();
    return ID_RE.test(s) ? s : '';
  }

  function sanitizeSegment(value, maxLen) {
    var s = String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[.-]+|[.-]+$/g, '');
    if (!s) return '';
    return s.slice(0, maxLen || 64);
  }

  function normalizeKey(value) {
    return sanitizeSegment(value || DEFAULT_KEY, 32) || DEFAULT_KEY;
  }

  function normalizeType(value) {
    var t = String(value || '').toLowerCase().trim();
    if (t === TYPES.BOARD) return TYPES.BOARD;
    if (t === TYPES.COURSE) return TYPES.COURSE;
    return '';
  }

  function cohortGroupId(spec) {
    spec = spec || {};
    var type = normalizeType(spec.cohortType);
    var resourceId =
      type === TYPES.BOARD ? sanitizeSegment(spec.boardId) : sanitizeSegment(spec.courseId);
    var key = normalizeKey(spec.cohortKey);
    if (!type || !resourceId) return '';
    return 'cohort_' + type + '_' + resourceId + '_' + key;
  }

  function isCohortGroupId(groupId) {
    return GROUP_ID_RE.test(String(groupId || ''));
  }

  function hydrateUser(userData) {
    if (!userData) return null;
    if (userData.raw && typeof userData.raw === 'object') {
      return Object.assign({}, userData.raw, {
        uid: userData.uid || userData.raw.uid,
        isAdmin: !!(userData.isAdmin || userData.raw.isAdmin),
        tier: userData.tier || userData.raw.tier,
        roles: userData.roles || userData.raw.roles,
      });
    }
    return userData;
  }

  function isStaff(userData) {
    userData = hydrateUser(userData);
    if (!userData) return false;
    if (userData.isAdmin) return true;
    var role = String(userData.role || '').toLowerCase();
    if (role === 'admin' || role === 'designer') return true;
    var roles = userData.roles || [];
    var i;
    for (i = 0; i < roles.length; i += 1) {
      var r = String(roles[i] || '').toLowerCase();
      if (r === 'admin' || r === 'designer') return true;
    }
    return !!(userData.staffAccess && userData.staffAccess.contentDesigner);
  }

  function policyRank(userData) {
    if (isStaff(userData)) return 6;
    var profile = String((userData && userData.tier) || 'foundation').toLowerCase();
    var sub = (userData && userData.subscription) || {};
    var subActive = sub.status === 'active' || sub.status === 'trialing';
    var subTier = subActive && sub.tier ? String(sub.tier).toLowerCase() : '';
    var a = TIER_RANK[profile] != null ? TIER_RANK[profile] : 0;
    var b = subTier && TIER_RANK[subTier] != null ? TIER_RANK[subTier] : 0;
    return a >= b ? a : b;
  }

  function meetsTier(userData, requiredTier) {
    var need = String(requiredTier || 'foundation').toLowerCase();
    var rank = TIER_RANK[need] != null ? TIER_RANK[need] : 0;
    return policyRank(userData) >= rank;
  }

  function listHas(list, id) {
    return Array.isArray(list) && !!id && list.indexOf(id) >= 0;
  }

  function userOwnsOrEnrolled(userData, courseId) {
    if (!userData || !courseId) return false;
    if (global.CourseAccess && typeof global.CourseAccess.userOwnsCourse === 'function') {
      if (global.CourseAccess.userOwnsCourse(userData, courseId)) return true;
    }
    return listHas(userData.ownedCourses, courseId) || listHas(userData.enrolledCourses, courseId);
  }

  function courseIsPurchaseOnly(course, courseId) {
    if (global.CourseAccess && typeof global.CourseAccess.isPurchaseOnlyCourse === 'function' && course) {
      return !!global.CourseAccess.isPurchaseOnlyCourse(course);
    }
    if (course && course.purchaseOnly === true) return true;
    return courseId === 'the-woman-the-wife-the-mother' || (course && course.id === 'the-woman-the-wife-the-mother');
  }

  function canJoinCourseCohort(userData, groupData, course) {
    var courseId = (groupData && groupData.courseId) || (course && course.id) || '';
    if (!courseId) return false;
    if (isStaff(userData)) return true;
    if (userOwnsOrEnrolled(userData, courseId)) return true;
    if (courseIsPurchaseOnly(course, courseId)) return false;
    if (!meetsTier(userData, groupData.requiredTier || 'foundation')) return false;
    var courseTier =
      (course && (course.accessLevel || course.requiredTier)) || groupData.requiredTier || 'foundation';
    return meetsTier(userData, courseTier);
  }

  function canJoinBoardCohort(userData, groupData, board) {
    board = board || {};
    if (isStaff(userData)) return true;
    if (!meetsTier(userData, groupData.requiredTier || board.requiredTier || 'foundation')) return false;
    var uid = userData.uid || userData.id || '';
    if (uid && listHas(board.members, uid)) return true;
    var gid = board.groupId || '';
    var groups = Array.isArray(userData.groups) ? userData.groups : [];
    if (gid) return groups.indexOf(gid) >= 0;
    return meetsTier(userData, board.requiredTier || groupData.requiredTier || 'foundation');
  }

  function canJoinCohort(userData, groupData, extras) {
    extras = extras || {};
    userData = hydrateUser(userData);
    if (!userData || !groupData) return false;
    var type = normalizeType(groupData.cohortType);
    if (!type) return false;
    if (type === TYPES.COURSE) return canJoinCourseCohort(userData, groupData, extras.course);
    if (type === TYPES.BOARD) return canJoinBoardCohort(userData, groupData, extras.board);
    return false;
  }

  function joinRoleForOpener(opts) {
    opts = opts || {};
    if (opts.alreadyMember) return opts.existingRole || 'member';
    if (!opts.existingGroup) return 'host';
    if (opts.existingGroup.createdBy && opts.uid && opts.existingGroup.createdBy === opts.uid) {
      return 'host';
    }
    return 'member';
  }

  function contextUrlFor(spec) {
    spec = spec || {};
    var type = normalizeType(spec.cohortType);
    if (type === TYPES.COURSE && spec.courseId) {
      return '/courses.html?course=' + encodeURIComponent(spec.courseId);
    }
    if (type === TYPES.BOARD && spec.boardId) {
      return '/board.html?boardId=' + encodeURIComponent(spec.boardId);
    }
    return '';
  }

  function isSafeContextUrl(url) {
    var s = String(url || '');
    return (
      /^\/courses\.html\?course=[A-Za-z0-9._%-]{1,120}$/.test(s) ||
      /^\/board\.html\?boardId=[A-Za-z0-9._%-]{1,120}$/.test(s)
    );
  }

  function buildGroupFields(spec, user, extras) {
    extras = extras || {};
    spec = spec || {};
    var type = normalizeType(spec.cohortType);
    var course = extras.course || {};
    var board = extras.board || {};
    var resourceTitle =
      spec.title ||
      spec.contextTitle ||
      (type === TYPES.BOARD ? board.title : course.title) ||
      (type === TYPES.BOARD ? 'Board cohort' : 'Course cohort');
    var requiredTier =
      spec.requiredTier ||
      (type === TYPES.BOARD
        ? board.requiredTier || 'foundation'
        : course.accessLevel || course.requiredTier || 'foundation');
    var key = normalizeKey(spec.cohortKey);
    var groupId = cohortGroupId(spec);
    var blurb =
      spec.contextBlurb ||
      (type === TYPES.BOARD
        ? 'Board cohort — share formation in this circle.'
        : 'Course cohort — ask, share, and stay with this formation.');
    var fields = {
      name: String(resourceTitle).slice(0, 120),
      requiredTier: String(requiredTier || 'foundation').toLowerCase(),
      mentorLed: spec.mentorLed !== false,
      allowCrossTier: false,
      createdBy: user && (user.uid || user.id) ? user.uid || user.id : '',
      cohortType: type,
      cohortKey: key,
      cohortId: groupId,
      contextTitle: String(resourceTitle).slice(0, 160),
      contextBlurb: String(blurb).slice(0, 280),
      contextUrl: spec.contextUrl && isSafeContextUrl(spec.contextUrl) ? spec.contextUrl : contextUrlFor(spec),
    };
    if (type === TYPES.COURSE) fields.courseId = String(spec.courseId || course.id || '');
    if (type === TYPES.BOARD) fields.boardId = String(spec.boardId || board.id || '');
    return fields;
  }

  function contextHeader(groupData) {
    if (!groupData || !normalizeType(groupData.cohortType)) return null;
    var type = normalizeType(groupData.cohortType);
    var title = groupData.contextTitle || groupData.name || (type === TYPES.BOARD ? 'Board' : 'Course');
    var url = isSafeContextUrl(groupData.contextUrl) ? groupData.contextUrl : contextUrlFor(groupData);
    return {
      kicker: type === TYPES.BOARD ? 'Board cohort' : 'Course cohort',
      title: title,
      url: url,
      cta: type === TYPES.BOARD ? 'Back to board' : 'Back to course',
      blurb: groupData.contextBlurb || '',
      cohortType: type,
    };
  }

  function parseEntryParams(search) {
    var q;
    try {
      q = typeof search === 'string' ? new URLSearchParams(search) : search;
    } catch (_) {
      return null;
    }
    if (!q || typeof q.get !== 'function') return null;
    var cohort = String(q.get('cohort') || '').toLowerCase();
    var course = safeId(q.get('course') || q.get('courseId') || '');
    var board = safeId(q.get('board') || q.get('boardId') || '');
    var key = normalizeKey(q.get('key') || q.get('cohortKey') || DEFAULT_KEY);
    var group = safeId(q.get('group') || '');
    if (cohort === TYPES.COURSE && course) {
      return { kind: 'cohort', spec: { cohortType: TYPES.COURSE, courseId: course, cohortKey: key } };
    }
    if (cohort === TYPES.BOARD && board) {
      return { kind: 'cohort', spec: { cohortType: TYPES.BOARD, boardId: board, cohortKey: key } };
    }
    if (group) return { kind: 'group', groupId: group };
    return null;
  }

  function entryHref(spec) {
    spec = spec || {};
    var type = normalizeType(spec.cohortType);
    var key = normalizeKey(spec.cohortKey);
    var extra = key !== DEFAULT_KEY ? '&key=' + encodeURIComponent(key) : '';
    if (type === TYPES.COURSE && spec.courseId) {
      return MESSENGER_PATH + '?cohort=course&course=' + encodeURIComponent(spec.courseId) + extra;
    }
    if (type === TYPES.BOARD && spec.boardId) {
      return MESSENGER_PATH + '?cohort=board&board=' + encodeURIComponent(spec.boardId) + extra;
    }
    var gid = spec.groupId || cohortGroupId(spec);
    return gid ? groupHref(gid) : MESSENGER_PATH;
  }

  function groupHref(groupId) {
    var id = safeId(groupId);
    return id ? MESSENGER_PATH + '?group=' + encodeURIComponent(id) : MESSENGER_PATH;
  }

  function denyJoinError(message) {
    var err = new Error(message || 'You are not in this formation cohort.');
    err.code = 'cohort-denied';
    return err;
  }

  function timestampNow(extras) {
    extras = extras || {};
    if (extras.now) return extras.now;
    if (global.firebase && global.firebase.firestore && global.firebase.firestore.Timestamp) {
      return global.firebase.firestore.Timestamp.now();
    }
    return { seconds: Math.floor(Date.now() / 1000) };
  }

  async function loadResource(db, spec) {
    if (!db || !spec) return { course: null, board: null };
    if (spec.cohortType === TYPES.COURSE && spec.courseId && db.collection) {
      try {
        var csnap = await db.collection('courses').doc(spec.courseId).get();
        return {
          course: csnap && csnap.exists ? Object.assign({ id: spec.courseId }, csnap.data() || {}) : { id: spec.courseId },
          board: null,
        };
      } catch (_) {
        return { course: { id: spec.courseId }, board: null };
      }
    }
    if (spec.cohortType === TYPES.BOARD && spec.boardId && db.collection) {
      try {
        var bsnap = await db.collection('boards').doc(spec.boardId).get();
        return {
          course: null,
          board: bsnap && bsnap.exists ? Object.assign({ id: spec.boardId }, bsnap.data() || {}) : { id: spec.boardId },
        };
      } catch (_) {
        return { course: null, board: { id: spec.boardId } };
      }
    }
    return { course: null, board: null };
  }

  /**
   * Open the existing cohort group or create it once.
   * First writer becomes host; later eligible members join as member.
   */
  async function openOrCreateCohortGroup(db, user, spec, extras) {
    extras = extras || {};
    var uid = user && (user.uid || user.id);
    user = hydrateUser(user) || user;
    if (!db || !uid) {
      throw new Error('Sign in to open this formation cohort.');
    }
    var type = normalizeType(spec && spec.cohortType);
    if (!type) throw new Error('Choose a course or board cohort.');
    var groupId = cohortGroupId(spec);
    if (!groupId || !isCohortGroupId(groupId)) {
      throw new Error('Invalid cohort.');
    }
    var loaded = extras.course || extras.board ? extras : await loadResource(db, spec);
    var fields = buildGroupFields(spec, { uid: uid }, loaded);
    if (!canJoinCohort(user, fields, loaded)) {
      throw denyJoinError(
        type === TYPES.BOARD
          ? 'This board cohort is for assigned members.'
          : 'This course cohort is for enrolled members.'
      );
    }
    var groupRef = db.collection('communicationGroups').doc(groupId);
    var memberRef = groupRef.collection('members').doc(uid);
    var now = timestampNow(extras);
    var createdFields = Object.assign({}, fields, { createdAt: now, createdBy: uid });

    async function ensureMember(existingGroup, created) {
      var memberSnap = await memberRef.get();
      var already = !!(memberSnap && memberSnap.exists);
      var role = joinRoleForOpener({
        existingGroup: created ? null : existingGroup,
        uid: uid,
        alreadyMember: already,
        existingRole: already ? (memberSnap.data() || {}).role : '',
      });
      if (!already) {
        var payload = { joinedAt: now, role: role };
        if (role === 'host') payload.addedBy = uid;
        await memberRef.set(payload);
      }
      return { groupId: groupId, created: !!created, role: already ? (memberSnap.data() || {}).role || role : role, group: existingGroup };
    }

    if (typeof db.runTransaction === 'function') {
      var txResult = await db.runTransaction(async function (tx) {
        var groupSnap = await tx.get(groupRef);
        if (!groupSnap.exists) {
          tx.set(groupRef, createdFields);
          return { created: true, group: createdFields };
        }
        var existing = groupSnap.data() || {};
        if (!canJoinCohort(user, existing, loaded)) {
          throw denyJoinError();
        }
        return { created: false, group: existing };
      });
      return ensureMember(txResult.group, txResult.created);
    }

    var groupSnap = await groupRef.get();
    if (!groupSnap.exists) {
      await groupRef.set(createdFields);
      return ensureMember(createdFields, true);
    }
    var existing = groupSnap.data() || {};
    if (!canJoinCohort(user, existing, loaded)) {
      throw denyJoinError();
    }
    return ensureMember(existing, false);
  }

  function renderContextHtml(header, escapeHtml) {
    if (!header) return '';
    var esc = escapeHtml || function (s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
    };
    var href = header.url ? esc(header.url) : '/learn.html';
    return (
      '<div class="ce2-cohort-context-text">' +
      '<span class="ce2-cohort-kicker">' +
      esc(header.kicker) +
      '</span>' +
      '<span class="ce2-cohort-title">' +
      esc(header.title) +
      '</span></div>' +
      '<a class="ce2-cohort-context-link" href="' +
      href +
      '">' +
      esc(header.cta) +
      '</a>'
    );
  }

  global.Ce2Cohort = {
    VERSION: VERSION,
    TYPES: TYPES,
    DEFAULT_KEY: DEFAULT_KEY,
    safeId: safeId,
    sanitizeSegment: sanitizeSegment,
    cohortGroupId: cohortGroupId,
    isCohortGroupId: isCohortGroupId,
    isStaff: isStaff,
    canJoinCohort: canJoinCohort,
    joinRoleForOpener: joinRoleForOpener,
    buildGroupFields: buildGroupFields,
    contextHeader: contextHeader,
    contextUrlFor: contextUrlFor,
    isSafeContextUrl: isSafeContextUrl,
    parseEntryParams: parseEntryParams,
    entryHref: entryHref,
    groupHref: groupHref,
    openOrCreateCohortGroup: openOrCreateCohortGroup,
    renderContextHtml: renderContextHtml,
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
