/**
 * Unit tests for CE2 in-thread typing indicators.
 * Usage: node scripts/test-ce2-typing.js
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

function mockDocRef() {
  const writes = [];
  return {
    writes: writes,
    set: function (patch, opts) {
      writes.push({ patch: patch, opts: opts });
      return Promise.resolve();
    },
  };
}

function mockInput(value) {
  const listeners = {};
  return {
    value: value || '',
    listeners: listeners,
    addEventListener: function (ev, fn) {
      listeners[ev] = fn;
    },
    removeEventListener: function (ev) {
      delete listeners[ev];
    },
  };
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

console.log('\nCE2 typing indicators\n');
const sandbox = loadIife('public/communication-v2/ce2-presence.js');
const pr = sandbox.Ce2Presence;
assert.ok(pr, 'Ce2Presence did not load');

test('VERSION is 6 and typing APIs are exported', function () {
  assert.strictEqual(pr.VERSION, 6);
  assert.strictEqual(typeof pr.pulseTyping, 'function');
  assert.strictEqual(typeof pr.clearTyping, 'function');
  assert.strictEqual(typeof pr.watchTyping, 'function');
  assert.strictEqual(typeof pr.bindTypingInput, 'function');
  assert.strictEqual(typeof pr.formatTypingLabel, 'function');
  assert.strictEqual(typeof pr.activeTypingUids, 'function');
  assert.strictEqual(pr.TYPING_TTL_SEC, 8);
  assert.ok(pr.PULSE_GAP_MS >= 1000);
});

test('formatTypingLabel names one, two, and caps extras as and others', function () {
  const names = { a: 'Ada Lovelace', b: 'Ben Smith', c: 'Cara', d: 'Dee' };
  function nameOf(uid) {
    return names[uid];
  }
  assert.strictEqual(pr.formatTypingLabel(['a'], nameOf), 'Ada is typing');
  assert.strictEqual(pr.formatTypingLabel(['a', 'b'], nameOf), 'Ada and Ben are typing');
  assert.strictEqual(
    pr.formatTypingLabel(['a', 'b', 'c'], nameOf),
    'Ada, Ben and others are typing'
  );
  assert.strictEqual(
    pr.formatTypingLabel(['a', 'b', 'c', 'd'], nameOf),
    'Ada, Ben and others are typing'
  );
  assert.strictEqual(pr.formatTypingLabel([], nameOf), '');
  assert.strictEqual(pr.formatTypingLabel(['missing'], nameOf), 'Someone is typing');
});

test('firstName uses the given name token', function () {
  assert.strictEqual(pr.firstName('Ada Lovelace'), 'Ada');
  assert.strictEqual(pr.firstName('  Ben  '), 'Ben');
  assert.strictEqual(pr.firstName(''), '');
});

test('isTypingActive respects the ~8s TTL', function () {
  const now = Date.now();
  assert.strictEqual(pr.isTypingActive({ seconds: Math.floor(now / 1000) }, now), true);
  assert.strictEqual(
    pr.isTypingActive({ seconds: Math.floor(now / 1000) - 3 }, now),
    true
  );
  assert.strictEqual(
    pr.isTypingActive({ seconds: Math.floor(now / 1000) - 9 }, now),
    false
  );
  assert.strictEqual(pr.isTypingActive(null, now), false);
});

test('activeTypingUids drops self and expired stamps', function () {
  const now = Date.now();
  const typing = {
    me: { seconds: Math.floor(now / 1000) },
    ada: { seconds: Math.floor(now / 1000) },
    stale: { seconds: Math.floor(now / 1000) - 20 },
  };
  assert.deepStrictEqual(pr.activeTypingUids(typing, 'me', now), ['ada']);
});

test('pulseTyping / clearTyping write only typing.{uid} with merge', function () {
  const ref = mockDocRef();
  pr.pulseTyping(ref, 'u1');
  pr.clearTyping(ref, 'u1');
  assert.strictEqual(ref.writes.length, 2);
  assert.ok(ref.writes[0].patch['typing.u1']);
  assert.strictEqual(ref.writes[0].patch['typing.u1']._server, true);
  assert.strictEqual(ref.writes[0].opts && ref.writes[0].opts.merge, true);
  assert.strictEqual(ref.writes[1].patch['typing.u1']._delete, true);
  assert.strictEqual(ref.writes[1].opts && ref.writes[1].opts.merge, true);
});

test('watchTyping omits self and expired peers', function () {
  let snapCb = null;
  const ref = {
    onSnapshot: function (ok) {
      snapCb = ok;
      return function () {};
    },
  };
  let seen = null;
  pr.watchTyping(ref, 'me', function (uids) {
    seen = uids;
  });
  const nowSec = Math.floor(Date.now() / 1000);
  snapCb({
    exists: true,
    data: function () {
      return {
        typing: {
          me: { seconds: nowSec },
          ada: { seconds: nowSec },
          old: { seconds: nowSec - 30 },
        },
      };
    },
  });
  assert.deepStrictEqual(seen, ['ada']);
});

test('bindTypingInput pulses immediately, throttles, and clears on empty/blur', function () {
  let now = 1_000_000;
  const timers = [];
  function fakeSetTimeout(fn, ms) {
    const id = timers.length + 1;
    timers.push({ id: id, fn: fn, ms: ms });
    return id;
  }
  function fakeClearTimeout(id) {
    for (let i = 0; i < timers.length; i++) {
      if (timers[i].id === id) timers[i].fn = null;
    }
  }
  const MockDate = function () {
    return new Date(now);
  };
  MockDate.now = function () {
    return now;
  };
  const local = loadIife('public/communication-v2/ce2-presence.js', {
    Date: MockDate,
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
  });
  const localPr = local.Ce2Presence;
  const ref = mockDocRef();
  const input = mockInput('hello');
  const unbind = localPr.bindTypingInput(input, ref, 'me', 5000);
  input.listeners.input();
  assert.strictEqual(ref.writes.length, 1);
  assert.ok(ref.writes[0].patch['typing.me']._server);

  now += 200;
  input.listeners.input();
  assert.strictEqual(ref.writes.length, 1, 'second keystroke inside gap must not write');

  now += localPr.PULSE_GAP_MS;
  input.listeners.input();
  assert.strictEqual(ref.writes.length, 2);

  input.value = '   ';
  input.listeners.input();
  assert.ok(ref.writes[ref.writes.length - 1].patch['typing.me']._delete);

  input.value = 'still typing';
  now += localPr.PULSE_GAP_MS;
  input.listeners.input();
  const afterPulse = ref.writes.length;
  input.listeners.blur();
  assert.ok(ref.writes.length > afterPulse);
  assert.ok(ref.writes[ref.writes.length - 1].patch['typing.me']._delete);
  unbind();
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
const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

test('open-thread composer and header are wired to typing helpers', function () {
  assert.ok(v2.indexOf('var CE2_TYPING_INDICATOR_ENABLED = true') >= 0);
  assert.ok(v2.indexOf('pr.bindTypingInput') >= 0);
  assert.ok(v2.indexOf('function updateTypingFromMeta') >= 0);
  assert.ok(v2.indexOf('function currentTypingLabel') >= 0);
  assert.ok(v2.indexOf('ce2-thread-meta--typing') >= 0);
  assert.ok(v2.indexOf('getMetaDocRef') >= 0);
  assert.ok(v2.indexOf("collection('ce2_conversations')") >= 0);
  assert.ok(v2.indexOf("collection('communicationGroups')") >= 0);
  assert.ok(html.indexOf('id="ce2TypingLine"') >= 0);
  assert.ok(html.indexOf('id="ce2ThreadMeta"') >= 0);
});

test('own typing is filtered and cleared on send', function () {
  assert.ok(v2.indexOf('pr.activeTypingUids') >= 0);
  assert.ok(v2.indexOf('function clearComposerTyping') >= 0);
  assert.ok(v2.indexOf('pr.clearTyping(ref, me.uid)') >= 0);
  assert.ok(v2.indexOf('clearComposerTyping(ac)') >= 0);
  assert.ok(!/metaPatch\['typing\.' \+ me\.uid\]/.test(v2));
  assert.ok(v2.indexOf('uid !== selfUid') >= 0 || v2.indexOf('uid !== me.uid') >= 0);
});

test('typing line CSS is visible when not hidden', function () {
  assert.ok(!/\.ce2-typing-line\s*\{[^}]*display:\s*none\s*!important/.test(css));
  assert.ok(/\.ce2-typing-line\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(css));
  assert.ok(/\.ce2-thread-meta--typing/.test(css));
});

test('cache-bust sits strictly above live 109 / 79 / 5', function () {
  const jsVer = html.match(/communication-v2\.js\?v=(\d+)/);
  const cssVer = html.match(/communication-v2\.css\?v=(\d+)/);
  const prVer = html.match(/ce2-presence\.js\?v=(\d+)/);
  assert.ok(jsVer && Number(jsVer[1]) > 109);
  assert.ok(cssVer && Number(cssVer[1]) > 79);
  assert.ok(prVer && Number(prVer[1]) > 5);
});

test('Firestore typing updates may only change the caller uid key', function () {
  assert.ok(/function ce2TypingMap\(data\)/.test(rules));
  assert.ok(/function ce2TypingOwnKeyOnly\(\)/.test(rules));
  assert.ok(/function ce2TypingKeysOwnOnlyIfPresent\(\)/.test(rules));
  assert.ok(
    /after\.diff\(before\)\.affectedKeys\(\)\.hasOnly\(\[request\.auth\.uid\]\)/.test(rules)
  );
  assert.ok(/after\[request\.auth\.uid\] is timestamp/.test(rules));
  assert.ok(/ce2TypingKeysOwnOnlyIfPresent\(\)/.test(rules));
  assert.ok(
    /ce2ConvMetaUpdateKeysOnly\(\) &&\s*ce2TypingKeysOwnOnlyIfPresent\(\)/.test(rules)
  );
  assert.ok(
    /ce2GroupMetaUpdateKeysOnly\(\) &&\s*ce2TypingKeysOwnOnlyIfPresent\(\)/.test(rules)
  );
});

test('does not rewrite frozen keyboard, delivery, or audio markers', function () {
  assert.ok(v2.indexOf('function applyViewportPanCounter') >= 0);
  assert.ok(v2.indexOf('function applyComposerKeyboardLift') >= 0);
  assert.ok(v2.indexOf('function measureComposerKeyboardLift') >= 0);
  assert.ok(v2.indexOf('function applyComposerKeyboardInset') >= 0);
  assert.ok(v2.indexOf('ce2-keyboard-stable-v60') >= 0);
  assert.ok(v2.indexOf('ce2-delivery-stable-v90') >= 0);
  assert.ok(v2.indexOf('ce2-audio-stable-1d') >= 0);
  assert.ok(v2.indexOf('function handleMetaMessageDelivery') >= 0);
  assert.ok(v2.indexOf('ma.syncReactionsRow') >= 0);
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed\n');
  process.exit(1);
}
console.log('\n✅ CE2 typing tests passed\n');
