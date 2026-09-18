/**
 * Unit tests for CE2 offline send queue (text + voice metadata).
 * Usage: node scripts/test-ce2-offline-queue.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');

function makeStorage() {
  const map = {};
  return {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null;
    },
    setItem: function (k, v) {
      map[k] = String(v);
    },
    removeItem: function (k) {
      delete map[k];
    },
  };
}

function loadQueue(extras) {
  const code = fs.readFileSync(
    path.join(ROOT, 'public/communication-v2/ce2-offline-queue.js'),
    'utf8'
  );
  const sandbox = Object.assign(
    {
      console: console,
      Date: Date,
      Math: Math,
      Object: Object,
      Array: Array,
      String: String,
      Number: Number,
      Error: Error,
      JSON: JSON,
      localStorage: makeStorage(),
      navigator: { onLine: true },
    },
    extras || {}
  );
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'ce2-offline-queue.js' });
  assert.ok(sandbox.Ce2OfflineQueue, 'Ce2OfflineQueue did not load');
  return sandbox.Ce2OfflineQueue;
}

function loadReceipts() {
  const code = fs.readFileSync(
    path.join(ROOT, 'public/communication-v2/ce2-receipts.js'),
    'utf8'
  );
  const sandbox = {
    console: console,
    Date: Date,
    Object: Object,
    firebase: {
      firestore: {
        Timestamp: { now: function () { return { seconds: 1 }; } },
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'ce2-receipts.js' });
  return sandbox.Ce2Receipts;
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

console.log('\nCE2 offline send queue\n');

const q = loadQueue();
const receipts = loadReceipts();
const html = fs.readFileSync(
  path.join(ROOT, 'public/communication-v2/index.html'),
  'utf8'
);
const threadJs = fs.readFileSync(
  path.join(ROOT, 'public/communication-v2/communication-v2.js'),
  'utf8'
);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('VERSION 2 keeps the existing localStorage key and cap 20', function () {
  assert.strictEqual(q.VERSION, 2);
  assert.strictEqual(q.KEY, 'ce2_offline_queue_v1');
  assert.strictEqual(q.MAX, 20);
  assert.strictEqual(typeof q.enqueue, 'function');
  assert.strictEqual(typeof q.remove, 'function');
  assert.strictEqual(typeof q.list, 'function');
  assert.strictEqual(typeof q.update, 'function');
  assert.strictEqual(typeof q.isRetryableError, 'function');
});

test('enqueue assigns an id, list returns it, remove drops it', function () {
  const qq = loadQueue();
  const item = qq.enqueue({ convId: 'c1', text: 'hello' });
  assert.ok(item.id);
  assert.strictEqual(qq.list().length, 1);
  assert.strictEqual(qq.list()[0].text, 'hello');
  assert.strictEqual(qq.list()[0].status, 'queued');
  assert.strictEqual(qq.list()[0].retryable, true);
  qq.remove(item.id);
  assert.strictEqual(qq.list().length, 0);
});

test('enqueue upserts by id and preserves order', function () {
  const qq = loadQueue();
  qq.enqueue({ id: 'a', text: 'one' });
  qq.enqueue({ id: 'b', text: 'two' });
  qq.enqueue({ id: 'a', text: 'one-updated', status: 'sending' });
  const list = qq.list();
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].id, 'a');
  assert.strictEqual(list[0].text, 'one-updated');
  assert.strictEqual(list[0].status, 'sending');
  assert.strictEqual(list[1].id, 'b');
});

test('cap 20 drops the oldest, not the newest', function () {
  const qq = loadQueue();
  for (let i = 0; i < 22; i++) {
    qq.enqueue({ id: 'n' + i, text: 'm' + i });
  }
  const list = qq.list();
  assert.strictEqual(list.length, 20);
  assert.strictEqual(list[0].id, 'n2');
  assert.strictEqual(list[19].id, 'n21');
});

test('listForConversation filters to that thread', function () {
  const qq = loadQueue();
  qq.enqueue({ id: '1', convId: 'dm1', text: 'a' });
  qq.enqueue({ id: '2', convId: 'dm2', text: 'b' });
  qq.enqueue({ id: '3', convId: 'dm1', text: 'c' });
  const mine = qq.listForConversation('dm1');
  assert.strictEqual(mine.length, 2);
  assert.strictEqual(mine[0].text, 'a');
  assert.strictEqual(mine[1].text, 'c');
});

test('update patches status without changing id', function () {
  const qq = loadQueue();
  qq.enqueue({ id: 'x', text: 'hi', status: 'queued' });
  const next = qq.update('x', { status: 'failed', retryable: false });
  assert.strictEqual(next.id, 'x');
  assert.strictEqual(qq.get('x').status, 'failed');
  assert.strictEqual(qq.get('x').retryable, false);
  assert.strictEqual(qq.get('x').text, 'hi');
});

test('permission and rules errors are not retryable (no hot-loop)', function () {
  assert.strictEqual(q.isRetryableError({ code: 'permission-denied' }), false);
  assert.strictEqual(q.isRetryableError({ code: 'unauthenticated' }), false);
  assert.strictEqual(
    q.isRetryableError({ message: 'Missing or insufficient permissions.' }),
    false
  );
  assert.strictEqual(q.isRetryableError({ code: 'storage/unauthorized' }), false);
  assert.strictEqual(q.isFatalPermissionError({ code: 'permission-denied' }), true);
});

test('network / timeout / offline errors are retryable', function () {
  assert.strictEqual(q.isRetryableError({ code: 'unavailable' }), true);
  assert.strictEqual(
    q.isRetryableError({ message: 'Send timed out — check your connection and try again.' }),
    true
  );
  assert.strictEqual(q.isRetryableError({ message: 'Failed to fetch' }), true);
  assert.strictEqual(q.isRetryableError({ message: 'NetworkError when attempting to fetch' }), true);
  const offlineQ = loadQueue({ navigator: { onLine: false } });
  assert.strictEqual(offlineQ.isRetryableError({ message: 'something went wrong' }), true);
});

test('missing voice blob is not retryable', function () {
  const err = new Error('Voice note is gone from this device. Record it again to send.');
  err._blobMissing = true;
  assert.strictEqual(q.isRetryableError(err), false);
});

test('receipts expose Queued without treating it as Failed', function () {
  assert.strictEqual(receipts.VERSION, 5);
  assert.strictEqual(receipts.statusLabel('queued'), 'Queued');
  assert.strictEqual(
    receipts.deliveryStatus(
      { senderId: 'me', _pending: true, _queued: true, createdAt: { seconds: 1 } },
      'me'
    ),
    'queued'
  );
  assert.strictEqual(
    receipts.deliveryStatus(
      { senderId: 'me', _queued: true, _failed: true, createdAt: { seconds: 1 } },
      'me'
    ),
    'failed'
  );
});

test('queue never stores a blob field', function () {
  const qq = loadQueue();
  qq.enqueue({
    id: 'v1',
    kind: 'voice',
    voiceLocalId: 'loc1',
    convId: 'c1',
  });
  const raw = qq.list()[0];
  assert.strictEqual(raw.blob, undefined);
  assert.strictEqual(raw.blobBuffer, undefined);
  assert.ok(!JSON.stringify(raw).match(/blobBuffer/));
});

test('communication-v2.js hooks queue at send/fail/retry/restore', function () {
  assert.ok(threadJs.indexOf('function hydratePendingFromQueue') >= 0);
  assert.ok(threadJs.indexOf('function queueOfflineTextSend') >= 0);
  assert.ok(threadJs.indexOf('function applySendFailureToPending') >= 0);
  assert.ok(threadJs.indexOf('ce2OfflineFlushInFlight') >= 0);
  assert.ok(threadJs.indexOf('isRetryableError') >= 0);
  assert.ok(threadJs.indexOf('Queued — will send when you reconnect.') >= 0);
  assert.ok(
    threadJs.indexOf('This voice note is gone from the device. Record it again to send.') >= 0
  );
  assert.ok(threadJs.indexOf('item.retryable === false') >= 0);
  assert.ok(threadJs.indexOf('hydratePendingFromQueue(CommunicationState.activeConversation)') >= 0);
  assert.ok(threadJs.indexOf('Saved offline — will send when you reconnect.') < 0);
});

test('frozen keyboard / audio / delivery markers stay in the thread file', function () {
  assert.ok(threadJs.indexOf('ce2-keyboard-stable-v60') >= 0);
  assert.ok(threadJs.indexOf("var CE2_DELIVERY_ROLLBACK = 'ce2-delivery-stable-v90'") >= 0);
  assert.ok(threadJs.indexOf('ce2-audio-stable-1d') >= 0 || html.indexOf('ce2-audio-stable-1d') >= 0);
});

test('cache-bust sits strictly above live 113 / 82 / 1 / 4', function () {
  const jsVer = html.match(/communication-v2\.js\?v=(\d+)/);
  const cssVer = html.match(/communication-v2\.css\?v=(\d+)/);
  const queueVer = html.match(/ce2-offline-queue\.js\?v=(\d+)/);
  const receiptsVer = html.match(/ce2-receipts\.js\?v=(\d+)/);
  const pwaVer = html.match(/ce2-pwa\.js\?v=(\d+)/);
  assert.ok(jsVer && Number(jsVer[1]) > 113);
  assert.ok(cssVer && Number(cssVer[1]) >= 82);
  assert.ok(queueVer && Number(queueVer[1]) > 1);
  assert.ok(receiptsVer && Number(receiptsVer[1]) > 4);
  assert.ok(pwaVer && Number(pwaVer[1]) >= 6);
  assert.ok(html.indexOf('communication-v2.js?v=113') < 0);
  assert.ok(html.indexOf('ce2-offline-queue.js?v=1"') < 0);
});

test('validate script includes the offline queue test', function () {
  assert.ok(pkg.scripts.validate.indexOf('test-ce2-offline-queue.js') >= 0);
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed\n');
  process.exit(1);
}
console.log('\n✅ CE2 offline queue tests passed\n');
