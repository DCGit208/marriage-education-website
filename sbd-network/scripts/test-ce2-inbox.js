/**
 * Unit tests for CE2 conversation-list inbox (unread, mute, pin, previews).
 * Usage: node scripts/test-ce2-inbox.js
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
          Timestamp: {
            now: function () {
              return { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
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

function ts(secondsAgo) {
  return { seconds: Math.floor(Date.now() / 1000) - secondsAgo };
}

console.log('\nCE2 inbox list\n');
const inbox = loadIife('public/communication-v2/ce2-inbox.js').Ce2Inbox;
const receipts = loadIife('public/communication-v2/ce2-receipts.js').Ce2Receipts;
assert.ok(inbox, 'Ce2Inbox did not load');
assert.ok(receipts, 'Ce2Receipts did not load');

test('VERSION is 1 and preview/sort APIs are exported', function () {
  assert.strictEqual(inbox.VERSION, 1);
  assert.strictEqual(typeof inbox.formatLastPreview, 'function');
  assert.strictEqual(typeof inbox.sortInboxRows, 'function');
  assert.strictEqual(typeof inbox.unreadBadgeMode, 'function');
  assert.strictEqual(typeof inbox.mergeUnreadFromMeta, 'function');
});

test('receipts VERSION is 4', function () {
  assert.strictEqual(receipts.VERSION, 4);
});

test('own lastSenderId never counts as unread', function () {
  const meta = {
    lastSenderId: 'me',
    lastMessageAt: ts(1),
    unreadCount: { me: 4, them: 1 },
    lastRead: {},
  };
  assert.strictEqual(receipts.unreadCount(meta, 'me'), 0);
  assert.strictEqual(receipts.unreadCount(meta, 'them'), 1);
});

test('incrementUnreadPatch skips the sender', function () {
  const patch = receipts.incrementUnreadPatch('me', ['me', 'them', 'other'], { them: 2 });
  assert.strictEqual(patch['unreadCount.me'], undefined);
  assert.strictEqual(patch['unreadCount.them'], 3);
  assert.strictEqual(patch['unreadCount.other'], 1);
  assert.strictEqual(patch.lastSenderId, 'me');
});

test('lastRead at or after lastMessageAt clears unread even if the map is stale', function () {
  const meta = {
    lastSenderId: 'them',
    lastMessageAt: ts(5),
    lastRead: { me: ts(1) },
    unreadCount: { me: 9 },
  };
  assert.strictEqual(receipts.unreadCount(meta, 'me'), 0);
});

test('unread stays until lastRead catches lastMessageAt', function () {
  const meta = {
    lastSenderId: 'them',
    lastMessageAt: ts(1),
    lastRead: { me: ts(30) },
    unreadCount: { me: 2 },
  };
  assert.strictEqual(receipts.unreadCount(meta, 'me'), 2);
});

test('opening a thread locally zeros unread without waiting for a snapshot', function () {
  const row = { id: 'd1', unread: 7 };
  inbox.applyLocalRead(row, 1000);
  assert.strictEqual(row.unread, 0);
  assert.strictEqual(row._localReadAt, 1000);
});

test('stale snapshot cannot restore unread after a local read', function () {
  const row = inbox.applyLocalRead({ id: 'd1', unread: 3 }, Date.now());
  inbox.mergeUnreadFromMeta(
    row,
    {
      lastSenderId: 'them',
      lastMessageAt: ts(1),
      lastRead: {},
      unreadCount: { me: 3 },
    },
    'me',
    receipts.unreadCount
  );
  assert.strictEqual(row.unread, 0);
});

test('snapshot unread is accepted after lastRead lands', function () {
  const now = Date.now();
  const row = inbox.applyLocalRead({ id: 'd1', unread: 2 }, now - 500);
  inbox.mergeUnreadFromMeta(
    row,
    {
      lastSenderId: 'them',
      lastMessageAt: ts(20),
      lastRead: { me: { seconds: now / 1000 } },
      unreadCount: { me: 0 },
    },
    'me',
    receipts.unreadCount
  );
  assert.strictEqual(row.unread, 0);
  assert.strictEqual(row._localReadAt, 0);
});

test('muted unread uses a quiet dot, not a numeric badge', function () {
  assert.strictEqual(inbox.unreadBadgeMode(4, false), 'count');
  assert.strictEqual(inbox.unreadBadgeMode(4, true), 'dot');
  assert.strictEqual(inbox.unreadBadgeMode(0, true), 'none');
  assert.strictEqual(inbox.formatUnreadCount(120), '99+');
  assert.strictEqual(inbox.shoutingUnread({ unread: 5, muted: true }), 0);
  assert.strictEqual(inbox.shoutingUnread({ unread: 5, muted: false }), 5);
});

test('mute/pin prefs are per-user keys, not shared conversation fields', function () {
  assert.strictEqual(inbox.prefId('direct', 'd_a_b'), 'd__d_a_b');
  assert.strictEqual(inbox.prefId('group', 'g1'), 'g__g1');
  const payload = inbox.prefWritePayload('direct', 'd_a_b', { muted: true, pinned: true, sortAt: 99 });
  assert.strictEqual(payload.muted, true);
  assert.strictEqual(payload.pinned, true);
  assert.strictEqual(payload.sortAt, 99);
  assert.strictEqual(payload.threadType, 'direct');
  assert.strictEqual(payload.threadId, 'd_a_b');
  const parsed = inbox.parsePrefId('g__circle');
  assert.strictEqual(parsed.kind, 'group');
  assert.strictEqual(parsed.threadId, 'circle');
});

test('pinned threads stay above recency, then sort by last activity', function () {
  const rows = inbox.sortInboxRows([
    { id: 'old', label: 'Old pin', pinned: true, lastActivityAt: 10 },
    { id: 'hot', label: 'Hot', pinned: false, lastActivityAt: 50 },
    { id: 'newpin', label: 'New pin', pinned: true, lastActivityAt: 40 },
    { id: 'quiet', label: 'Quiet', pinned: false, lastActivityAt: 20 },
  ]);
  assert.deepStrictEqual(
    rows.map(function (r) {
      return r.id;
    }),
    ['newpin', 'old', 'hot', 'quiet']
  );
});

test('muted incoming messages do not sort-bump', function () {
  const pref = { muted: true, pinned: false, sortAt: 100 };
  assert.strictEqual(inbox.sortAtForIncoming(pref, 500, false), 100);
  assert.strictEqual(inbox.sortAtForIncoming(pref, 500, true), 500);
  assert.strictEqual(inbox.sortAtForIncoming({ muted: false }, 500, false), 500);
});

test('preview labels voice, photo, video, and board posts', function () {
  assert.strictEqual(inbox.formatLastPreview({ messageType: 'voice' }), 'Voice note');
  assert.strictEqual(inbox.formatLastPreview({ content: 'Voice message' }), 'Voice note');
  assert.strictEqual(inbox.formatLastPreview({ messageType: 'image' }), 'Photo');
  assert.strictEqual(inbox.formatLastPreview({ imageUrl: 'https://x/p.jpg' }), 'Photo');
  assert.strictEqual(inbox.formatLastPreview({ messageType: 'video' }), 'Video');
  assert.strictEqual(
    inbox.formatLastPreview({ messageType: 'board_share', boardShare: { title: 'Sabbath rest' } }),
    'Sabbath rest'
  );
  assert.strictEqual(inbox.formatLastPreview({ messageType: 'board_share' }), 'Board post');
});

test('preview keeps a short text snippet and quoted reply', function () {
  const long = 'This is a fairly long body that should be clipped for the inbox row preview line.';
  const snippet = inbox.formatLastPreview({ content: long });
  assert.ok(snippet.length <= inbox.PREVIEW_MAX + 1);
  assert.ok(snippet.indexOf('…') >= 0);
  assert.strictEqual(
    inbox.formatLastPreview({
      content: 'I agree',
      replyTo: { preview: 'Can we meet after class tonight?' },
    }),
    '↩ Can we meet after class tonight? · I agree'
  );
});

test('preview never dumps raw payloads', function () {
  assert.strictEqual(inbox.formatLastPreview({ content: '{"boardId":"x","postId":"y"}' }), '');
  assert.strictEqual(inbox.formatLastPreview({ lastPreview: 'data:image/jpeg;base64,aaaa' }), '');
  assert.ok(inbox.looksLikePayloadDump('{not a message}'));
});

test('cache-bust versions stay strictly above live 110/80/3/6', function () {
  const html = fs.readFileSync(
    path.join(ROOT, 'public/communication-v2/index.html'),
    'utf8'
  );
  const jsVer = html.match(/communication-v2\.js\?v=(\d+)/);
  const cssVer = html.match(/communication-v2\.css\?v=(\d+)/);
  const inboxVer = html.match(/ce2-inbox\.js\?v=(\d+)/);
  const receiptsVer = html.match(/ce2-receipts\.js\?v=(\d+)/);
  const presenceVer = html.match(/ce2-presence\.js\?v=(\d+)/);
  assert.ok(jsVer && Number(jsVer[1]) > 110);
  assert.ok(cssVer && Number(cssVer[1]) > 80);
  assert.ok(inboxVer && Number(inboxVer[1]) >= 1);
  assert.ok(receiptsVer && Number(receiptsVer[1]) >= 4);
  assert.ok(presenceVer && Number(presenceVer[1]) >= 6);
  assert.ok(html.indexOf('communication-v2.js?v=110') < 0);
  assert.ok(html.indexOf('communication-v2.css?v=80') < 0);
});

test('validate script includes the inbox test', function () {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts.validate.indexOf('test-ce2-inbox.js') >= 0);
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed\n');
  process.exit(1);
}
console.log('\n✅ CE2 inbox tests passed\n');
