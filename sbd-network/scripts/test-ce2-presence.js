/**
 * Unit tests for CE2 online / last-seen presence (ce2-presence.js).
 * Usage: node scripts/test-ce2-presence.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');

function loadIife(relPath, extras) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
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
      setInterval: setInterval,
      clearInterval: clearInterval,
      firebase: {
        firestore: {
          FieldValue: {
            serverTimestamp: function () {
              return { _server: true };
            },
            delete: function () {
              return { _delete: true };
            },
          },
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

console.log('\nCE2 presence (online / last-seen)\n');
const sandbox = loadIife('public/communication-v2/ce2-presence.js');
const pr = sandbox.Ce2Presence;
assert.ok(pr, 'Ce2Presence did not load');

test('keeps typing APIs for existing CE2 wiring', function () {
  assert.strictEqual(typeof pr.pulseTyping, 'function');
  assert.strictEqual(typeof pr.clearTyping, 'function');
  assert.strictEqual(typeof pr.watchTyping, 'function');
  assert.strictEqual(typeof pr.bindTypingInput, 'function');
  assert.strictEqual(typeof pr.isTypingActive, 'function');
  assert.strictEqual(typeof pr.setTypingMuted, 'function');
});

test('VERSION is 6', function () {
  assert.strictEqual(pr.VERSION, 6);
});

test('recent lastActive is online', function () {
  const now = Date.now();
  const rec = pr.statusFromTs({ seconds: Math.floor(now / 1000) }, now);
  assert.strictEqual(rec.state, 'online');
  assert.strictEqual(pr.formatLabel(rec, now), 'Online');
});

test('lastActive a few minutes ago is away', function () {
  const now = Date.now();
  const rec = pr.statusFromTs(now - 4 * 60 * 1000, now);
  assert.strictEqual(rec.state, 'away');
  assert.strictEqual(pr.formatLabel(rec, now), 'Away');
});

test('lastActive within an hour is active recently, not a clock time', function () {
  const now = Date.now();
  const rec = pr.statusFromTs(now - 25 * 60 * 1000, now);
  assert.strictEqual(rec.state, 'offline');
  assert.strictEqual(pr.formatLabel(rec, now), 'Active recently');
  assert.ok(!/\d{1,2}:\d{2}/.test(rec.label));
});

test('same calendar day beyond an hour is last seen today', function () {
  const now = new Date();
  now.setHours(18, 0, 0, 0);
  const then = new Date(now.getTime());
  then.setHours(8, 0, 0, 0);
  const rec = pr.statusFromTs(then.getTime(), now.getTime());
  assert.strictEqual(rec.state, 'offline');
  assert.strictEqual(rec.label, 'Last seen today');
});

test('yesterday is last seen yesterday', function () {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const then = new Date(now.getTime() - 86400000);
  then.setHours(15, 0, 0, 0);
  const rec = pr.statusFromTs(then.getTime(), now.getTime());
  assert.strictEqual(rec.label, 'Last seen yesterday');
});

test('does not surface last-seen older than a week', function () {
  const now = Date.now();
  const rec = pr.statusFromTs(now - 10 * 24 * 60 * 60 * 1000, now);
  assert.strictEqual(rec.state, 'offline');
  assert.strictEqual(rec.label, '');
});

test('refreshRecords expires online to away without a new snapshot', function () {
  const map = {
    peer: pr.statusFromTs(Date.now() - 30 * 1000, Date.now() - 30 * 1000),
  };
  assert.strictEqual(map.peer.state, 'online');
  const changed = pr.refreshRecords(map, Date.now() + 3 * 60 * 1000);
  assert.strictEqual(changed, true);
  assert.strictEqual(map.peer.state, 'away');
});

test('applyDot shows online and hides unknown', function () {
  const el = {
    hidden: true,
    attrs: {},
    setAttribute: function (k, v) {
      this.attrs[k] = v;
    },
    removeAttribute: function (k) {
      delete this.attrs[k];
    },
  };
  pr.applyDot(el, { state: 'online', label: 'Online' });
  assert.strictEqual(el.hidden, false);
  assert.strictEqual(el.attrs['data-state'], 'online');
  pr.applyDot(el, { state: 'unknown' });
  assert.strictEqual(el.hidden, true);
});

test('recordFromUserData prefers lastActive', function () {
  const now = Date.now();
  const rec = pr.recordFromUserData(
    { lastActive: now - 1000, lastSeen: now - 9 * 60 * 1000 },
    now
  );
  assert.strictEqual(rec.state, 'online');
});

const v2 = fs.readFileSync(
  path.join(ROOT, 'public/communication-v2/communication-v2.js'),
  'utf8'
);
const css = fs.readFileSync(
  path.join(ROOT, 'public/communication-v2/communication-v2.css'),
  'utf8'
);
const html = fs.readFileSync(
  path.join(ROOT, 'public/communication-v2/index.html'),
  'utf8'
);

test('does not rewrite frozen keyboard function bodies (v60 contract still present)', function () {
  assert.ok(v2.indexOf('function applyViewportPanCounter') >= 0);
  assert.ok(v2.indexOf('function applyComposerKeyboardLift') >= 0);
  assert.ok(v2.indexOf('function measureComposerKeyboardLift') >= 0);
  assert.ok(v2.indexOf('function applyComposerKeyboardInset') >= 0);
  assert.ok(v2.indexOf("ce2-keyboard-stable-v60") >= 0);
  assert.ok(css.indexOf('ce2-keyboard-stable-v60') >= 0 || css.indexOf('ce2-kb-active') >= 0);
});

test('delivery and audio stable markers remain', function () {
  assert.ok(v2.indexOf('ce2-delivery-stable-v90') >= 0);
  assert.ok(v2.indexOf('ce2-audio-stable-1d') >= 0);
  assert.ok(v2.indexOf('var CE2_TYPING_INDICATOR_ENABLED = true') >= 0);
});

test('hub and header presence hooks are wired', function () {
  assert.ok(v2.indexOf('function startPresenceLayer') >= 0);
  assert.ok(v2.indexOf('function applyPresenceUi') >= 0);
  assert.ok(v2.indexOf('avatarWithPresence') >= 0);
  assert.ok(html.indexOf('ce2ThreadPresenceDot') >= 0);
  assert.ok(html.indexOf('ce2-presence.js?v=6') >= 0);
  assert.ok(/communication-v2\.js\?v=\d+/.test(html));
  assert.ok(/communication-v2\.css\?v=\d+/.test(html));
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed\n');
  process.exit(1);
}
console.log('\n✅ CE2 presence tests passed\n');
