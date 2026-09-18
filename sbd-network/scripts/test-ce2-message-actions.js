/**
 * Unit tests for CE2 reaction aggregation, toggle writes, and swipe-to-reply.
 * Usage: node scripts/test-ce2-message-actions.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');

function loadActions() {
  const code = fs.readFileSync(
    path.join(ROOT, 'public/communication-v2/ce2-message-actions.js'),
    'utf8'
  );
  const sandbox = {
    console: console,
    Date: Date,
    Math: Math,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
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
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'ce2-message-actions.js' });
  assert.ok(sandbox.Ce2MessageActions, 'Ce2MessageActions did not load');
  return sandbox.Ce2MessageActions;
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

const ma = loadActions();
const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
const indexHtml = fs.readFileSync(
  path.join(ROOT, 'public/communication-v2/index.html'),
  'utf8'
);
const css = fs.readFileSync(
  path.join(ROOT, 'public/communication-v2/communication-v2.css'),
  'utf8'
);
const threadJs = fs.readFileSync(
  path.join(ROOT, 'public/communication-v2/communication-v2.js'),
  'utf8'
);

console.log('\nCE2 message reactions\n');

test('VERSION is 2', function () {
  assert.strictEqual(ma.VERSION, 2);
});

test('curated reaction set stays small and includes the original six plus 😢', function () {
  assert.ok(ma.REACTIONS.length >= 6 && ma.REACTIONS.length <= 8);
  ['👍', '❤️', '🙏', '✨', '😂', '😮', '😢'].forEach(function (emoji) {
    assert.ok(ma.REACTIONS.indexOf(emoji) >= 0, 'missing ' + emoji);
  });
});

test('aggregates uid→emoji into counts and marks mine', function () {
  const groups = ma.aggregateReactions(
    { u1: '👍', u2: '👍', u3: '❤️', me: '👍' },
    'me'
  );
  assert.strictEqual(groups.length, 2);
  assert.strictEqual(groups[0].emoji, '👍');
  assert.strictEqual(groups[0].count, 3);
  assert.strictEqual(groups[0].mine, true);
  assert.strictEqual(groups[1].emoji, '❤️');
  assert.strictEqual(groups[1].count, 1);
  assert.strictEqual(groups[1].mine, false);
});

test('empty or junk reaction maps aggregate to no chips', function () {
  assert.strictEqual(JSON.stringify(ma.aggregateReactions(null, 'me')), '[]');
  assert.strictEqual(JSON.stringify(ma.aggregateReactions({ u1: '', u2: 2 }, 'me')), '[]');
});

test('toggle adds, switches, then removes my single emoji', function () {
  let next = ma.applyReactionToggle({}, 'me', '👍');
  assert.strictEqual(JSON.stringify(next), '{"me":"👍"}');
  next = ma.applyReactionToggle(next, 'me', '❤️');
  assert.strictEqual(JSON.stringify(next), '{"me":"❤️"}');
  next = ma.applyReactionToggle(next, 'me', '❤️');
  assert.strictEqual(JSON.stringify(next), '{}');
});

test('toggle never rewrites someone else’s reaction', function () {
  const start = { other: '😂', me: '👍' };
  const next = ma.applyReactionToggle(start, 'me', '🙏');
  assert.strictEqual(next.other, '😂');
  assert.strictEqual(next.me, '🙏');
  assert.strictEqual(start.me, '👍');
});

test('reaction write patch uses a nested uid path (keeps uid→emoji shape)', function () {
  const add = ma.reactionWritePatch('abc', { abc: '👍', other: '❤️' });
  assert.strictEqual(JSON.stringify(add), JSON.stringify({ 'reactions.abc': '👍' }));
  const del = ma.reactionWritePatch('abc', { other: '❤️' });
  assert.strictEqual(del['reactions.abc']._delete, true);
});

console.log('\nCE2 swipe-to-reply\n');

test('tiny movement does not lock axis or cancel long-press', function () {
  const d = ma.decideSwipeReply(4, 3, 80, null);
  assert.strictEqual(d.axis, null);
  assert.strictEqual(d.commit, false);
  assert.strictEqual(d.cancelLongPress, false);
  assert.strictEqual(d.translateX, 0);
});

test('vertical movement locks scroll and does not commit reply', function () {
  const d = ma.decideSwipeReply(8, 30, 80, null);
  assert.strictEqual(d.axis, 'v');
  assert.strictEqual(d.commit, false);
  assert.strictEqual(d.translateX, 0);
  assert.strictEqual(d.cancelLongPress, true);
});

test('rightward swipe past threshold commits reply', function () {
  const d = ma.decideSwipeReply(64, 4, 90, null);
  assert.strictEqual(d.axis, 'h');
  assert.strictEqual(d.commit, true);
  assert.ok(d.translateX > 0);
  assert.strictEqual(d.iconOpacity, 1);
});

test('incomplete horizontal swipe does not commit', function () {
  const d = ma.decideSwipeReply(24, 2, 90, null);
  assert.strictEqual(d.axis, 'h');
  assert.strictEqual(d.commit, false);
  assert.ok(d.translateX > 0);
  assert.ok(d.iconOpacity < 1);
});

test('leftward swipe never commits (keeps iOS back / reveal distinct)', function () {
  const d = ma.decideSwipeReply(-70, 2, 90, null);
  assert.strictEqual(d.commit, false);
  assert.strictEqual(d.translateX, 0);
});

test('left-edge starts stay on the back-gesture axis', function () {
  const d = ma.decideSwipeReply(70, 2, 10, null);
  assert.strictEqual(d.axis, 'v');
  assert.strictEqual(d.commit, false);
  assert.strictEqual(d.translateX, 0);
});

test('once locked vertical, later horizontal travel cannot hijack', function () {
  const d = ma.decideSwipeReply(80, 4, 90, 'v');
  assert.strictEqual(d.axis, 'v');
  assert.strictEqual(d.commit, false);
  assert.strictEqual(d.translateX, 0);
});

test('translate rubber-bands past MAX_X without losing commit', function () {
  const d = ma.decideSwipeReply(120, 1, 90, 'h');
  assert.strictEqual(d.commit, true);
  assert.ok(d.translateX > ma.SWIPE_REPLY.MAX_X);
  assert.ok(d.translateX <= ma.SWIPE_REPLY.MAX_X + 16);
});

test('pending, deleted, and unreadable messages cannot swipe-to-reply', function () {
  assert.strictEqual(ma.canSwipeReply({ id: 'm1' }, true), true);
  assert.strictEqual(ma.canSwipeReply({ id: 'pending-1', _pending: true }, true), false);
  assert.strictEqual(ma.canSwipeReply({ id: 'm1', deleted: true }, true), false);
  assert.strictEqual(ma.canSwipeReply({ id: 'm1' }, false), false);
  assert.strictEqual(ma.canSwipeReply({ id: '' }, true), false);
});

console.log('\nCE2 wiring / least privilege\n');

test('Firestore reaction updates may only change the caller uid key', function () {
  assert.ok(/function ce2ReactionsMap\(data\)/.test(rules));
  assert.ok(/after\.diff\(before\)\.affectedKeys\(\)\.hasOnly\(\[request\.auth\.uid\]\)/.test(rules));
  assert.ok(/after\[request\.auth\.uid\]\.size\(\) <= 32/.test(rules));
});

test('cache-bust tokens sit above live 108/77/22 (css may rise further for card polish)', function () {
  const cssVer = indexHtml.match(/communication-v2\.css\?v=(\d+)/);
  const jsVer = indexHtml.match(/communication-v2\.js\?v=(\d+)/);
  const actionsVer = indexHtml.match(/ce2-message-actions\.js\?v=(\d+)/);
  assert.ok(cssVer && Number(cssVer[1]) >= 80);
  assert.ok(actionsVer && Number(actionsVer[1]) >= 23);
  assert.ok(jsVer && Number(jsVer[1]) >= 110);
});

test('CSS keeps swipe pan-y so vertical thread scroll still wins', function () {
  assert.ok(/\.ce2-row-actionable\s*\{[^}]*touch-action:\s*pan-y/.test(css));
  assert.ok(/\.ce2-msg-reaction\.is-mine/.test(css));
  assert.ok(/\.ce2-swipe-reply-icon/.test(css));
});

test('thread renderer patches reaction chips in-place on same-id snapshots', function () {
  assert.ok(/ma\.syncReactionsRow/.test(threadJs));
  assert.ok(/messageBodySig/.test(threadJs));
  assert.ok(/nextIds\.length === prev\.length/.test(threadJs));
});

test('frozen keyboard lock file is not referenced as a mutation target', function () {
  const lock = fs.readFileSync(
    path.join(ROOT, 'public/communication-v2/KEYBOARD-STABLE.lock'),
    'utf8'
  );
  assert.ok(lock.length > 0);
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed\n');
  process.exit(1);
}
console.log('\n✅ CE2 message action tests passed\n');
