/**
 * CE2 group hallway roles: host/facilitator pin + light moderation.
 * Usage: node scripts/test-ce2-group-roles.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function loadIife(relPath, extras) {
  const code = read(relPath);
  const sandbox = Object.assign(
    {
      console: console,
      Date: Date,
      Number: Number,
      String: String,
      Math: Math,
      Array: Array,
      Object: Object,
      Error: Error,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      firebase: {
        firestore: {
          FieldValue: {
            delete: function () {
              return { _delete: true };
            },
          },
          Timestamp: { now: function () { return { seconds: 1 }; } },
        },
      },
    },
    extras || {}
  );
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.runInNewContext(code, sandbox, { filename: relPath });
  return sandbox;
}

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  ok  ' + name);
  } catch (err) {
    failed += 1;
    console.error('  FAIL  ' + name);
    console.error('       ' + (err && err.stack ? err.stack.split('\n')[0] : err));
  }
}

const rules = read('firestore.rules');
const html = read('public/communication-v2/index.html');
const v2 = read('public/communication-v2/communication-v2.js');
const css = read('public/communication-v2/communication-v2.css');
const adminJs = read('public/js/admin.js');
const pkg = JSON.parse(read('package.json'));
const sandbox = loadIife('public/communication-v2/ce2-moderation.js');
const actionsSandbox = loadIife('public/communication-v2/ce2-message-actions.js', {
  Ce2Moderation: sandbox.Ce2Moderation,
});
const mod = sandbox.Ce2Moderation;
const ma = actionsSandbox.Ce2MessageActions;

console.log('\nCE2 group roles — helpers\n');

test('moderation VERSION is 5 and exposes hallway role helpers', function () {
  assert.strictEqual(mod.VERSION, 5);
  assert.ok(mod.resolveMemberRole);
  assert.ok(mod.canPinAnnouncement);
  assert.ok(mod.canModerateMessage);
  assert.ok(mod.canChangeMemberRole);
  assert.ok(mod.canRemoveMember);
  assert.strictEqual(mod.ROLES.HOST, 'host');
});

test('legacy creator and missing role on createdBy resolve to host', function () {
  assert.strictEqual(mod.resolveMemberRole({ role: 'creator' }, {}, 'ada'), 'host');
  assert.strictEqual(mod.resolveMemberRole({ role: 'host' }, {}, 'ada'), 'host');
  assert.strictEqual(
    mod.resolveMemberRole({}, { createdBy: 'ada' }, 'ada'),
    'host'
  );
  assert.strictEqual(
    mod.resolveMemberRole({ role: 'member' }, { createdBy: 'ada' }, 'ada'),
    'member'
  );
  assert.strictEqual(mod.resolveMemberRole({ role: 'facilitator' }, {}, 'bob'), 'facilitator');
  assert.strictEqual(mod.resolveMemberRole({}, { createdBy: 'ada' }, 'bob'), 'member');
});

test('members cannot pin or moderate; host and facilitator can', function () {
  const member = { uid: 'm1', isAdmin: false };
  const host = { uid: 'h1', isAdmin: false };
  const fac = { uid: 'f1', isAdmin: false };
  const admin = { uid: 'a1', isAdmin: true };

  assert.strictEqual(mod.canPinAnnouncement('member', member, 'group'), false);
  assert.strictEqual(mod.canModerateMessage('member', member, 'group'), false);
  assert.strictEqual(mod.canPinAnnouncement('host', host, 'group'), true);
  assert.strictEqual(mod.canModerateMessage('facilitator', fac, 'group'), true);
  assert.strictEqual(mod.canPinAnnouncement('member', admin, 'group'), true);
  assert.strictEqual(mod.canModerateMessage('member', member, 'direct'), false);
  assert.strictEqual(mod.canPinAnnouncement('member', member, 'direct'), true);
});

test('only host (or admin) can promote/demote facilitators; members cannot escalate', function () {
  const host = { uid: 'h1', isAdmin: false };
  const fac = { uid: 'f1', isAdmin: false };
  const member = { uid: 'm1', isAdmin: false };
  const admin = { uid: 'a1', isAdmin: true };

  assert.strictEqual(mod.canChangeMemberRole('member', member, 'member', 'facilitator'), false);
  assert.strictEqual(mod.canChangeMemberRole('facilitator', fac, 'member', 'facilitator'), false);
  assert.strictEqual(mod.canChangeMemberRole('host', host, 'member', 'facilitator'), true);
  assert.strictEqual(mod.canChangeMemberRole('host', host, 'facilitator', 'member'), true);
  assert.strictEqual(mod.canChangeMemberRole('host', host, 'host', 'member'), false);
  assert.strictEqual(mod.canChangeMemberRole('member', admin, 'member', 'facilitator'), true);
  assert.strictEqual(mod.selfJoinRoleValid('member'), true);
  assert.strictEqual(mod.selfJoinRoleValid(null), true);
  assert.strictEqual(mod.selfJoinRoleValid('host'), false);
  assert.strictEqual(mod.selfJoinRoleValid('facilitator'), false);
});

test('remove-member gates: host can drop facilitator/member; facilitator can drop members only', function () {
  const host = { uid: 'h1', isAdmin: false };
  const fac = { uid: 'f1', isAdmin: false };
  const member = { uid: 'm1', isAdmin: false };

  assert.strictEqual(mod.canRemoveMember('member', member, 'member', 'm1', 'm2'), false);
  assert.strictEqual(mod.canRemoveMember('host', host, 'member', 'h1', 'm1'), true);
  assert.strictEqual(mod.canRemoveMember('host', host, 'facilitator', 'h1', 'f1'), true);
  assert.strictEqual(mod.canRemoveMember('host', host, 'host', 'h1', 'h2'), false);
  assert.strictEqual(mod.canRemoveMember('facilitator', fac, 'member', 'f1', 'm1'), true);
  assert.strictEqual(mod.canRemoveMember('facilitator', fac, 'facilitator', 'f1', 'f2'), false);
  assert.strictEqual(mod.canRemoveMember('facilitator', fac, 'host', 'f1', 'h1'), false);
  assert.strictEqual(mod.canRemoveMember('host', host, 'member', 'h1', 'h1'), false);
});

console.log('\nCE2 group roles — Firestore rules\n');

test('rules resolve creator/createdBy to host and block member self-escalation', function () {
  assert.ok(/function ce2ResolvedGroupRole\(groupId, uid\)/.test(rules));
  assert.ok(/function ce2IsGroupHost\(groupId, uid\)/.test(rules));
  assert.ok(/function ce2IsGroupStaff\(groupId, uid\)/.test(rules));
  assert.ok(/function ce2MemberSelfJoinRoleValid\(\)/.test(rules));
  assert.ok(/request\.resource\.data\.role == 'member'/.test(rules));
  assert.ok(/function ce2CanChangeGroupMemberRole\(groupId, memberId\)/.test(rules));
  assert.ok(/ce2ResolvedGroupRole\(groupId, memberId\) != 'host'/.test(rules));
  assert.ok(!/request\.auth\.uid == memberId &&[\s\S]{0,80}role == 'host'/.test(rules));
});

test('pin writes on the group doc require host/facilitator/admin', function () {
  assert.ok(/function ce2GroupPinWriteValid\(groupId\)/.test(rules));
  assert.ok(/ce2GroupPinWriteValid\(groupId\)/.test(rules));
  assert.ok(/ce2IsGroupStaff\(groupId, request\.auth\.uid\)/.test(rules));
  assert.ok(/d\.pinnedBy == request\.auth\.uid/.test(rules));
  const groupUpdate = rules.match(
    /match \/communicationGroups\/\{groupId\} \{[\s\S]*?allow update: if[\s\S]*?;/
  );
  assert.ok(groupUpdate, 'missing group update rule');
  assert.ok(groupUpdate[0].indexOf('ce2GroupPinWriteValid(groupId)') >= 0);
});

test('staff can soft-delete group messages; hard delete stays denied', function () {
  assert.ok(/ce2IsGroupStaff\(groupId, request\.auth\.uid\) &&/.test(rules));
  assert.ok(/ce2MessageUnsendPurgeValid\(\)/.test(rules));
  const groupMsgs = rules.slice(rules.indexOf('match /ce2_messages/{messageId} {'));
  assert.ok(/allow delete: if false/.test(groupMsgs));
  assert.ok(/function ce2CanRemoveGroupMember\(groupId, memberId\)/.test(rules));
  assert.ok(/allow delete: if request\.auth != null &&\s+ce2CanRemoveGroupMember/.test(rules));
});

test('personal inbox pin path is unchanged and still owner-only', function () {
  const inbox = rules.match(/match \/users\/\{userId\}\/ce2_inbox\/\{prefId\} \{[\s\S]*?allow delete:[^;]+;/);
  assert.ok(inbox, 'missing ce2_inbox rules');
  assert.ok(/request\.auth\.uid == userId/.test(inbox[0]));
  assert.ok(rules.indexOf('Per-user inbox mute/pin') >= 0);
});

console.log('\nCE2 group roles — client gates\n');

function menuFor(role, acType, self, extraState) {
  const st = Object.assign(
    {
      me: { uid: 'me', isAdmin: false },
      myGroupRole: role,
      convMeta: { pinnedMessageId: '' },
      userMsgPrefs: { hidden: {}, saved: {}, blocked: {} },
      groupRoles: { other: 'member' },
    },
    extraState || {}
  );
  ma.init({
    getState: function () {
      return st;
    },
    canDeleteMessage: function () {
      return !self && role !== 'member';
    },
    canUnsendMessage: function () {
      return false;
    },
    setReply: function () {},
    unsendMessage: function () {
      return Promise.resolve();
    },
    handleCe2Error: function () {},
    removeGroupMember: function () {
      return Promise.resolve();
    },
  });
  return ma.buildMenuItems(
    { id: 'm1', senderId: self ? 'me' : 'other', content: 'Hello class', deleted: false },
    { type: acType, id: 'g1', groupRole: role, needsJoin: false },
    self,
    true
  );
}

test('group pin and remove-member stay off the member long-press menu', function () {
  const items = menuFor('member', 'group', false);
  const ids = items.map(function (i) {
    return i.id;
  });
  assert.ok(ids.indexOf('pin') < 0, 'member must not see group announcement pin');
  assert.ok(ids.indexOf('remove_member') < 0, 'member must not see remove-from-group');
  assert.ok(ids.indexOf('delete') < 0, 'member must not delete someone else');
});

test('host long-press can pin announcement, delete for group, and remove member', function () {
  const items = menuFor('host', 'group', false);
  const byId = {};
  items.forEach(function (i) {
    byId[i.id] = i;
  });
  assert.ok(byId.pin, 'host should see pin');
  assert.strictEqual(byId.pin.label, 'Pin announcement');
  assert.ok(byId.delete, 'host should see delete');
  assert.strictEqual(byId.delete.label, 'Delete for group');
  assert.ok(byId.remove_member, 'host should see remove from group');
});

test('direct-thread pin stays available to ordinary members', function () {
  const items = menuFor('member', 'direct', false);
  const pin = items.filter(function (i) {
    return i.id === 'pin';
  })[0];
  assert.ok(pin, 'DM pin is a conversation pin, not a group announcement');
  assert.strictEqual(pin.label, 'Pin');
});

test('join writes member role; creator/admin writes host', function () {
  assert.ok(v2.indexOf("role: 'member'") >= 0);
  assert.ok(v2.indexOf('myGroupRole') >= 0);
  assert.ok(v2.indexOf("CommunicationState.groupCreatedBy = ''") >= 0);
  assert.ok(v2.indexOf('canModerateMessage') >= 0);
  assert.ok(v2.indexOf('ce2GroupSettingsBtn') >= 0);
  assert.ok(adminJs.indexOf("role: 'host'") >= 0);
  assert.ok(adminJs.indexOf("role: 'creator'") < 0);
});

test('thread chrome has role badge, settings sheet, and compact pinned chip', function () {
  assert.ok(html.indexOf('id="ce2ThreadRoleBadge"') >= 0);
  assert.ok(html.indexOf('id="ce2GroupSettingsBtn"') >= 0);
  assert.ok(html.indexOf('id="ce2GroupSettingsSheet"') >= 0);
  assert.ok(/\.ce2-thread-role-badge/.test(css));
  assert.ok(/\.ce2-pinned-banner-kicker/.test(css));
  assert.ok(/\.ce2-group-settings-toggle/.test(css));
});

test('does not rewrite the frozen keyboard block', function () {
  assert.ok(html.indexOf('ce2-keyboard-stable-v60') >= 0);
  assert.ok(v2.indexOf('function applyViewportPanCounter') >= 0);
  assert.ok(v2.indexOf('function applyComposerKeyboardLift') >= 0);
});

test('cache-bust sits above live 126 / 92 / 27 / 3', function () {
  const jsVer = html.match(/communication-v2\.js\?v=(\d+)/);
  const cssVer = html.match(/communication-v2\.css\?v=(\d+)/);
  const actionsVer = html.match(/ce2-message-actions\.js\?v=(\d+)/);
  const modVer = html.match(/ce2-moderation\.js\?v=(\d+)/);
  assert.ok(jsVer && Number(jsVer[1]) > 131);
  assert.ok(cssVer && Number(cssVer[1]) > 92);
  assert.ok(actionsVer && Number(actionsVer[1]) > 27);
  assert.ok(modVer && Number(modVer[1]) > 4);
});

test('messenger falls back if a stale Ce2Moderation bundle lacks resolveMemberRole', function () {
  assert.ok(v2.indexOf("typeof m[name] === 'function'") >= 0);
  assert.ok(v2.indexOf('function resolveMemberRole(memberData, groupData, uid)') >= 0);
  assert.ok(v2.indexOf('function loadMyGroupRole') >= 0);
  assert.ok(v2.indexOf("if (!me || !groupId || !moderation) return 'member'") < 0);
});

test('validate script includes this test', function () {
  assert.ok(pkg.scripts.validate.indexOf('test-ce2-group-roles.js') >= 0);
  assert.ok(pkg.scripts['test:ce2-group-roles']);
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed\n');
  process.exit(1);
}
console.log('\n✅ CE2 group role tests passed\n');
