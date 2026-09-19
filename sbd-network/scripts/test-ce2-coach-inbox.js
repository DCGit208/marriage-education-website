/**
 * CE2 coach inbox — staff-only visibility, quiet-member heuristics, deep-link.
 * Usage: node scripts/test-ce2-coach-inbox.js
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
      URL: URL,
      URLSearchParams: URLSearchParams,
      encodeURIComponent: encodeURIComponent,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
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
const pkg = JSON.parse(read('package.json'));
const modBox = loadIife('public/communication-v2/ce2-moderation.js');
const presenceBox = loadIife('public/communication-v2/ce2-presence.js');
const sandbox = loadIife('public/communication-v2/ce2-coach-inbox.js', {
  Ce2Moderation: modBox.Ce2Moderation,
  Ce2Presence: presenceBox.Ce2Presence,
});
const api = sandbox.Ce2CoachInbox;

function daysAgo(n) {
  return { seconds: Math.floor(Date.now() / 1000) - n * 86400 };
}
function hoursAgo(n) {
  return { seconds: Math.floor(Date.now() / 1000) - n * 3600 };
}

console.log('\nCE2 coach inbox — helpers\n');

test('VERSION is 1 and exports staff, heuristic, and deep-link APIs', function () {
  assert.strictEqual(api.VERSION, 1);
  assert.ok(api.canSeeCoachInbox);
  assert.ok(api.isAttentionCandidate);
  assert.ok(api.evaluateAttention);
  assert.ok(api.buildInboxRows);
  assert.ok(api.parseCoachParams);
  assert.ok(api.coachHref);
  assert.ok(api.nudgeDraft);
  assert.ok(api.mentionDraft);
});

test('staff-only visibility: members cannot see the inbox; host/facilitator/admin can', function () {
  const member = { uid: 'm1', isAdmin: false };
  const host = { uid: 'h1', isAdmin: false };
  const fac = { uid: 'f1', isAdmin: false };
  const admin = { uid: 'a1', isAdmin: true };

  assert.strictEqual(api.canSeeCoachInbox(member, 0), false);
  assert.strictEqual(api.canSeeCoachInbox(host, 1), true);
  assert.strictEqual(api.canSeeCoachInbox(fac, 2), true);
  assert.strictEqual(api.canSeeCoachInbox(admin, 0), true);
  assert.strictEqual(api.canSeeCoachInbox(null, 3), false);
});

test('staffedGroupsFromMemberships keeps only groups the viewer hosts or facilitates', function () {
  const host = { uid: 'h1', isAdmin: false };
  const staffed = api.staffedGroupsFromMemberships(host, [
    { id: 'g1', name: 'Teleios', role: 'host', createdBy: 'h1' },
    { id: 'g2', name: 'Peers', role: 'member', createdBy: 'other' },
    { id: 'g3', name: 'Circle', role: 'facilitator', createdBy: 'other' },
  ]);
  assert.strictEqual(staffed.length, 2);
  assert.strictEqual(staffed[0].id, 'g1');
  assert.strictEqual(staffed[1].id, 'g3');

  const member = { uid: 'm1', isAdmin: false };
  assert.strictEqual(
    api.staffedGroupsFromMemberships(member, [
      { id: 'g1', name: 'Teleios', role: 'member', createdBy: 'h1' },
    ]).length,
    0
  );

  const admin = { uid: 'a1', isAdmin: true };
  assert.strictEqual(
    api.staffedGroupsFromMemberships(admin, [
      { id: 'g1', name: 'Teleios', role: 'member', createdBy: 'h1' },
    ]).length,
    1
  );
});

test('attention candidates exclude self and other staff', function () {
  const host = { uid: 'h1', isAdmin: false };
  assert.strictEqual(api.isAttentionCandidate('member', host, 'm1'), true);
  assert.strictEqual(api.isAttentionCandidate('member', host, 'h1'), false);
  assert.strictEqual(api.isAttentionCandidate('host', host, 'h2'), false);
  assert.strictEqual(api.isAttentionCandidate('facilitator', host, 'f1'), false);
  assert.strictEqual(api.isAttentionCandidate('creator', host, 'c1'), false);
});

console.log('\nCE2 coach inbox — quiet-member heuristics\n');

test('lastActive older than 3 days is quiet; recent activity is not', function () {
  const quiet = api.evaluateAttention({ lastActive: daysAgo(5), joinedAt: daysAgo(30) });
  assert.strictEqual(quiet.needsNudge, true);
  assert.ok(quiet.reasons.indexOf('quiet') >= 0);

  const fresh = api.evaluateAttention({ lastActive: hoursAgo(2), joinedAt: daysAgo(30) });
  assert.strictEqual(fresh.needsNudge, false);
});

test('missing lastActive is quiet only after the join grace window', function () {
  const brandNew = api.evaluateAttention({ joinedAt: hoursAgo(3) });
  assert.strictEqual(brandNew.needsNudge, false);

  const settled = api.evaluateAttention({ joinedAt: daysAgo(4) });
  assert.strictEqual(settled.needsNudge, true);
  assert.ok(settled.reasons.indexOf('quiet') >= 0);
});

test('behind on the group thread after 3 days without lastRead', function () {
  const behind = api.evaluateAttention({
    lastActive: hoursAgo(1),
    joinedAt: daysAgo(20),
    groupLastMessageAt: daysAgo(5),
  });
  assert.ok(behind.reasons.indexOf('behind') >= 0);

  const caughtUp = api.evaluateAttention({
    lastActive: hoursAgo(1),
    joinedAt: daysAgo(20),
    groupLastMessageAt: hoursAgo(2),
    groupLastRead: hoursAgo(1),
  });
  assert.ok(caughtUp.reasons.indexOf('behind') < 0);
});

test('high group unread or coach-side DM unread needs a nudge', function () {
  const unread = api.evaluateAttention({
    lastActive: hoursAgo(1),
    joinedAt: daysAgo(10),
    groupLastMessageAt: hoursAgo(2),
    groupLastRead: hoursAgo(1),
    groupUnread: 5,
  });
  assert.ok(unread.reasons.indexOf('behind') >= 0);

  const waiting = api.evaluateAttention({
    lastActive: hoursAgo(1),
    joinedAt: daysAgo(10),
    dmUnread: 2,
  });
  assert.ok(waiting.reasons.indexOf('waiting') >= 0);
  assert.ok(waiting.severity >= 3);
});

test('buildInboxRows hides the list from members and skips staff/self', function () {
  const now = Date.now();
  const bundle = {
    viewer: { uid: 'm1', isAdmin: false },
    staffedGroups: [],
    memberships: [
      { groupId: 'g1', uid: 'quiet1', role: 'member', joinedAt: daysAgo(10) },
    ],
    users: { quiet1: { name: 'Ada Quiet', lastActive: daysAgo(8) } },
    groupMeta: {},
    threads: [],
  };
  assert.strictEqual(api.buildInboxRows(bundle, now).length, 0);

  const hostBundle = {
    viewer: { uid: 'h1', isAdmin: false },
    staffedGroups: [{ id: 'g1', name: 'Teleios', role: 'host', createdBy: 'h1' }],
    memberships: [
      { groupId: 'g1', uid: 'h1', role: 'host', joinedAt: daysAgo(40) },
      { groupId: 'g1', uid: 'f1', role: 'facilitator', joinedAt: daysAgo(20) },
      { groupId: 'g1', uid: 'quiet1', role: 'member', joinedAt: daysAgo(10) },
      { groupId: 'g1', uid: 'active1', role: 'member', joinedAt: daysAgo(10) },
    ],
    users: {
      h1: { name: 'Host', lastActive: hoursAgo(1) },
      f1: { name: 'Fac', lastActive: daysAgo(9) },
      quiet1: { name: 'Ada Quiet', lastActive: daysAgo(8) },
      active1: { name: 'Bea Active', lastActive: hoursAgo(2) },
    },
    groupMeta: { g1: { lastMessageAt: hoursAgo(3), lastRead: { active1: hoursAgo(1) } } },
    threads: [{ otherUid: 'quiet1', unread: 3 }],
  };
  const rows = api.buildInboxRows(hostBundle, now);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].uid, 'quiet1');
  assert.strictEqual(rows[0].groupName, 'Teleios');
  assert.ok(rows[0].reasons.indexOf('quiet') >= 0);
  assert.ok(rows[0].reasons.indexOf('waiting') >= 0);
  assert.ok(rows[0].nudgeDraft.indexOf('Ada') >= 0);
  assert.ok(rows[0].nudgeDraft.indexOf('Teleios') >= 0);
  assert.strictEqual(rows[0].mentionDraft, '@Ada ');
});

test('nudge draft is a starter, not a mass-blast payload', function () {
  const draft = api.nudgeDraft('Ada Quiet', 'Teleios');
  assert.ok(draft.indexOf('Hey Ada') === 0);
  assert.ok(draft.indexOf('checking in') >= 0);
  assert.ok(draft.length < 160);
  assert.strictEqual(api.mentionDraft('Ada Quiet'), '@Ada ');
});

console.log('\nCE2 coach inbox — deep-link\n');

test('parseCoachParams and coachHref round-trip inbox, mention, and nudge', function () {
  const inbox = api.parseCoachParams('coach=1');
  assert.strictEqual(inbox.kind, 'inbox');
  assert.strictEqual(inbox.groupId, '');
  const filtered = api.parseCoachParams('coach=1&group=cohort_course_teleios_default');
  assert.strictEqual(filtered.kind, 'inbox');
  assert.strictEqual(filtered.groupId, 'cohort_course_teleios_default');
  const mention = api.parseCoachParams('group=g1&mention=ada_1');
  assert.strictEqual(mention.kind, 'mention');
  assert.strictEqual(mention.groupId, 'g1');
  assert.strictEqual(mention.uid, 'ada_1');
  const nudge = api.parseCoachParams('uid=ada_1&nudge=1');
  assert.strictEqual(nudge.kind, 'nudge');
  assert.strictEqual(nudge.uid, 'ada_1');
  assert.strictEqual(api.parseCoachParams('group=https://evil.example'), null);
  assert.strictEqual(api.parseCoachParams('mention=ada'), null);

  assert.strictEqual(api.coachHref({ kind: 'inbox' }), '/communication-v2/?coach=1');
  assert.strictEqual(
    api.coachHref({ kind: 'mention', groupId: 'g1', uid: 'ada_1' }),
    '/communication-v2/?group=g1&mention=ada_1'
  );
  assert.strictEqual(
    api.coachHref({ kind: 'nudge', uid: 'ada_1' }),
    '/communication-v2/?uid=ada_1&nudge=1'
  );
});

test('CE2 shell wires staff-only chrome, Open DM / nudge, and deep-link', function () {
  assert.ok(html.indexOf('ce2-coach-inbox.js?v=1') >= 0);
  assert.ok(html.indexOf('id="ce2CoachInboxBtn"') >= 0);
  assert.ok(html.indexOf('id="ce2CoachInboxList"') >= 0);
  assert.ok(html.indexOf('data-hub="coach"') >= 0);
  assert.ok(html.indexOf('data-hub-panel="coach"') >= 0);
  assert.ok(html.indexOf('Coach inbox') >= 0);
  assert.ok(v2.indexOf('openCoachHub') >= 0);
  assert.ok(v2.indexOf('openCoachAction') >= 0);
  assert.ok(v2.indexOf('loadCoachInbox') >= 0);
  assert.ok(v2.indexOf('resolveStaffedGroups') >= 0);
  assert.ok(v2.indexOf('parseCoachParams') >= 0);
  assert.ok(v2.indexOf("data-coach-act") >= 0 || v2.indexOf('data-coach-act') >= 0);
  assert.ok(v2.indexOf('Who needs a nudge') >= 0);
  assert.ok(v2.indexOf("canSeeCoachInbox") >= 0);
  assert.ok(/\.ce2-coach-inbox-toggle/.test(css));
  assert.ok(/\.ce2-coach-chip/.test(css));
  assert.ok(/ce2-hub-coach/.test(css));
});

test('nudge opens the composer starter — it does not auto-send or blast', function () {
  assert.ok(v2.indexOf('nudgeDraft') >= 0);
  assert.ok(v2.indexOf('shareDraft') >= 0);
  assert.ok(v2.indexOf('openDirectThread') >= 0);
  assert.ok(!/sendCoachNudgeBlast|nudgeAll|massNudge/.test(v2));
  assert.ok(html.indexOf('no mass blast') >= 0);
});

console.log('\nCE2 coach inbox — Firestore rules (no new aggregate)\n');

test('no coachInbox collection; members list stays member/admin; comment documents client assembly', function () {
  assert.ok(!/match \/coachInbox/.test(rules));
  assert.ok(!/match \/coach_inbox/.test(rules));
  assert.ok(rules.indexOf('Coach inbox') >= 0);
  assert.ok(rules.indexOf('assembled on the') >= 0);
  assert.ok(/ce2IsGroupStaff/.test(rules));
  const members = rules.match(/match \/members\/\{memberId\} \{[\s\S]*?allow list: if[\s\S]*?;/);
  assert.ok(members, 'missing members list rule');
  assert.ok(/ce2IsGroupMember\(groupId, request\.auth\.uid\)/.test(members[0]));
  assert.ok(/ce2IsAdmin/.test(members[0]));
});

test('does not rewrite the frozen keyboard block', function () {
  assert.ok(html.indexOf('ce2-keyboard-stable-v60') >= 0);
  assert.ok(v2.indexOf('function applyViewportPanCounter') >= 0);
  assert.ok(v2.indexOf('function applyComposerKeyboardLift') >= 0);
});

test('cache-bust sits above live 128 / 94 and loads the new module', function () {
  const jsVer = html.match(/communication-v2\.js\?v=(\d+)/);
  const cssVer = html.match(/communication-v2\.css\?v=(\d+)/);
  const coachVer = html.match(/ce2-coach-inbox\.js\?v=(\d+)/);
  assert.ok(jsVer && Number(jsVer[1]) > 128, 'communication-v2.js cache-bust must be above 128');
  assert.ok(cssVer && Number(cssVer[1]) > 94, 'communication-v2.css cache-bust must be above 94');
  assert.ok(coachVer && Number(coachVer[1]) >= 1);
});

test('validate script includes this test', function () {
  assert.ok(pkg.scripts.validate.indexOf('test-ce2-coach-inbox.js') >= 0);
  assert.ok(pkg.scripts['test:ce2-coach-inbox']);
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed\n');
  process.exit(1);
}
console.log('\n✅ CE2 coach inbox tests passed\n');
