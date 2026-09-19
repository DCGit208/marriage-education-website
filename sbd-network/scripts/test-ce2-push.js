/**
 * Unit tests for CE2 push copy, mute skip, deep-link click, and PWA badge.
 * Usage: node scripts/test-ce2-push.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const helpers = require(path.join(ROOT, 'functions/ce2-push-helpers.js'));
const deliveryMod = require(path.join(ROOT, 'functions/ce2-push-delivery.js'));

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
      URL: URL,
      location: { origin: 'https://sbd.marriageducation.com' },
      module: { exports: {} },
    },
    extras || {}
  );
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: relPath });
  return sandbox;
}

let failed = 0;
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function run() {
  for (let i = 0; i < tests.length; i += 1) {
    const t = tests[i];
    try {
      await t.fn();
      console.log('  ok  ' + t.name);
    } catch (err) {
      failed += 1;
      console.error('  FAIL  ' + t.name);
      console.error('       ' + (err && err.stack ? err.stack.split('\n')[0] : err));
    }
  }
  if (failed) {
    console.error('\n' + failed + ' test(s) failed\n');
    process.exit(1);
  }
  console.log('\n✅ CE2 push tests passed\n');
}

console.log('\nCE2 push / PWA notifications\n');
const pushSandbox = loadIife('public/communication-v2/ce2-push.js');
const inboxSandbox = loadIife('public/communication-v2/ce2-inbox.js');
const Ce2Push = pushSandbox.Ce2Push;
const Ce2Inbox = inboxSandbox.Ce2Inbox;
assert.ok(Ce2Push, 'Ce2Push did not load');
assert.ok(Ce2Inbox, 'Ce2Inbox did not load');

const html = fs.readFileSync(path.join(ROOT, 'public/communication-v2/index.html'), 'utf8');
const swSrc = fs.readFileSync(path.join(ROOT, 'public/service-worker.js'), 'utf8');
const pwaSrc = fs.readFileSync(path.join(ROOT, 'public/communication-v2/ce2-pwa.js'), 'utf8');
const appSrc = fs.readFileSync(
  path.join(ROOT, 'public/communication-v2/communication-v2.js'),
  'utf8'
);
const fnSrc =
  fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8') +
  '\n' +
  fs.readFileSync(path.join(ROOT, 'functions/ce2-push-delivery.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('VERSION is 1 and click/copy APIs are exported', function () {
  assert.strictEqual(Ce2Push.VERSION, 1);
  assert.strictEqual(typeof Ce2Push.buildThreadUrl, 'function');
  assert.strictEqual(typeof Ce2Push.parseThreadTarget, 'function');
  assert.strictEqual(typeof Ce2Push.notificationClickPlan, 'function');
  assert.strictEqual(typeof Ce2Push.shouldSuppressForeground, 'function');
  assert.strictEqual(typeof Ce2Push.applyAppBadge, 'function');
  assert.strictEqual(typeof Ce2Push.pushCopy, 'function');
});

test('DM and group deep links match existing conv/group query params', function () {
  assert.strictEqual(
    Ce2Push.buildThreadUrl({ convId: 'd_a_b', messageId: 'm1' }),
    '/communication-v2/?conv=d_a_b&msg=m1'
  );
  assert.strictEqual(
    Ce2Push.buildThreadUrl({ groupId: 'circle-1' }),
    '/communication-v2/?group=circle-1'
  );
  const dm = Ce2Push.parseThreadTarget('/communication-v2/?conv=d_ada_bob&msg=x');
  assert.strictEqual(dm.kind, 'direct');
  assert.strictEqual(dm.convId, 'd_ada_bob');
  assert.strictEqual(dm.messageId, 'x');
  const group = Ce2Push.parseThreadTarget({
    type: 'group_message',
    groupId: 'g1',
    url: '/communication-v2/?group=g1',
  });
  assert.strictEqual(group.kind, 'group');
  assert.strictEqual(group.groupId, 'g1');
});

test('notification copy uses sender/group title and inbox-style body', function () {
  const dm = Ce2Push.pushCopy({
    kind: 'direct',
    senderName: 'Ada',
    body: 'Hello there from class',
  });
  assert.strictEqual(dm.title, 'Ada');
  assert.strictEqual(dm.body, 'Hello there from class');
  const group = Ce2Push.pushCopy({
    kind: 'group',
    groupName: 'Formation circle',
    body: 'Voice note',
  });
  assert.strictEqual(group.title, 'Formation circle');
  assert.strictEqual(group.body, 'Voice note');
  assert.strictEqual(Ce2Inbox.formatLastPreview({ messageType: 'voice' }), 'Voice note');
  assert.strictEqual(Ce2Inbox.formatLastPreview({ messageType: 'image' }), 'Photo');
  assert.strictEqual(Ce2Inbox.formatLastPreview({ messageType: 'video' }), 'Video');
  assert.strictEqual(Ce2Inbox.formatLastPreview({ messageType: 'board_share' }), 'Board post');
});

test('copy never dumps raw payloads', function () {
  const dumped = Ce2Push.pushCopy({
    kind: 'direct',
    senderName: 'Ada',
    body: '{"boardId":"x","postId":"y"}',
  });
  assert.strictEqual(dumped.body, 'New message');
  assert.ok(Ce2Push.looksLikePayloadDump('data:image/jpeg;base64,aaaa'));
  assert.strictEqual(
    helpers.formatPushPreview({ content: '{"secret":true}' }),
    'New message'
  );
  assert.strictEqual(helpers.formatPushPreview({ messageType: 'voice' }), 'Voice note');
  assert.strictEqual(
    helpers.formatPushPreview({ messageType: 'board_share', boardShare: { title: 'Sabbath rest' } }),
    'Sabbath rest'
  );
});

test('mute pref ids match inbox polish (PR #17)', function () {
  assert.strictEqual(Ce2Push.inboxPrefId('direct', 'd_a_b'), Ce2Inbox.prefId('direct', 'd_a_b'));
  assert.strictEqual(Ce2Push.inboxPrefId('group', 'g1'), 'g__g1');
  assert.strictEqual(helpers.inboxPrefId('direct', 'd_a_b'), 'd__d_a_b');
  assert.strictEqual(helpers.inboxPrefId('group', 'circle'), 'g__circle');
});

test('sender, muted, and unread-for-other-person skip rules', function () {
  assert.strictEqual(helpers.shouldSkipRecipient({ isSender: true }).reason, 'sender');
  assert.strictEqual(helpers.shouldSkipRecipient({ muted: true }).reason, 'muted');
  assert.strictEqual(helpers.shouldSkipRecipient({ canRead: false }).reason, 'visibility');
  assert.strictEqual(helpers.shouldSkipRecipient({ isSender: false, muted: false }).skip, false);
  assert.ok(
    !helpers.recipientCanReadClassification({ tier: 'foundation' }, 'elite')
  );
  assert.ok(helpers.recipientCanReadClassification({ tier: 'elite' }, 'elite'));
  assert.ok(helpers.recipientCanReadClassification({ role: 'admin' }, 'elite'));
});

test('foreground suppress only when that thread is open and visible', function () {
  assert.strictEqual(
    Ce2Push.shouldSuppressForeground({ threadOpen: true, documentVisible: true }),
    true
  );
  assert.strictEqual(
    Ce2Push.shouldSuppressForeground({ threadOpen: true, documentVisible: false }),
    false
  );
  assert.strictEqual(
    Ce2Push.shouldSuppressForeground({ threadOpen: false, documentVisible: true }),
    false
  );
  assert.strictEqual(Ce2Push.shouldSuppressForeground({ muted: true }), true);
  assert.strictEqual(Ce2Push.shouldSuppressForeground({ isSender: true }), true);
  assert.strictEqual(Ce2Push.shouldSuppressForeground({ permissionDenied: true }), true);
});

test('badge uses shouting unread and clears at zero', function () {
  const total = Ce2Push.shoutingUnreadTotal([
    { unread: 3, muted: false },
    { unread: 5, muted: true },
    { unread: 2, muted: false },
  ]);
  assert.strictEqual(total, 5);
  assert.strictEqual(Ce2Inbox.shoutingUnread({ unread: 5, muted: true }), 0);
  const nav = {
    set: 0,
    cleared: 0,
    setAppBadge: function (n) {
      this.set = n;
    },
    clearAppBadge: function () {
      this.cleared += 1;
      this.set = 0;
    },
  };
  Ce2Push.applyAppBadge(nav, 4);
  assert.strictEqual(nav.set, 4);
  Ce2Push.applyAppBadge(nav, 0);
  assert.strictEqual(nav.cleared, 1);
  assert.strictEqual(nav.set, 0);
});

test('notification click focuses an open CE2 window instead of stacking', function () {
  const origin = 'https://sbd.marriageducation.com';
  const ce2Client = { url: origin + '/communication-v2/?conv=old', focused: false };
  const plan = Ce2Push.notificationClickPlan(
    [ce2Client],
    '/communication-v2/?conv=d_a_b',
    origin
  );
  assert.strictEqual(plan.action, 'focus-message');
  assert.strictEqual(plan.client, ce2Client);
  assert.strictEqual(plan.message.type, 'CE2_OPEN_THREAD');
  assert.strictEqual(plan.message.convId, 'd_a_b');
});

test('notification click navigates an already-open same-origin window', function () {
  const origin = 'https://sbd.marriageducation.com';
  const dash = { url: origin + '/dashboard.html' };
  const plan = Ce2Push.notificationClickPlan(
    [dash],
    '/communication-v2/?group=circle',
    origin
  );
  assert.strictEqual(plan.action, 'navigate');
  assert.strictEqual(plan.client, dash);
  assert.ok(plan.url.indexOf('/communication-v2/?group=circle') >= 0);
});

test('board notification click still navigates instead of CE2 postMessage', function () {
  const origin = 'https://sbd.marriageducation.com';
  const ce2Client = { url: origin + '/communication-v2/' };
  const plan = Ce2Push.notificationClickPlan(
    [ce2Client],
    '/board.html?boardId=b1',
    origin
  );
  assert.strictEqual(plan.action, 'navigate');
  assert.strictEqual(plan.client, ce2Client);
  assert.ok(plan.url.indexOf('/board.html?boardId=b1') >= 0);
});

test('closed PWA opens a new window at the thread URL', function () {
  const plan = Ce2Push.notificationClickPlan(
    [],
    '/communication-v2/?conv=d_a_b',
    'https://sbd.marriageducation.com'
  );
  assert.strictEqual(plan.action, 'open');
  assert.strictEqual(
    plan.url,
    'https://sbd.marriageducation.com/communication-v2/?conv=d_a_b'
  );
});

test('FCM payload helpers stringify data and keep relative thread URLs', function () {
  const data = helpers.stringifyData({ type: 'dm', convId: 'd_a_b', n: 1, missing: null });
  assert.strictEqual(data.type, 'dm');
  assert.strictEqual(data.n, '1');
  assert.strictEqual(data.missing, '');
  assert.strictEqual(helpers.buildThreadUrl({ convId: 'd_a_b' }), '/communication-v2/?conv=d_a_b');
});

test('token lookup prefers owner-only ce2_push over legacy user fields', function () {
  assert.strictEqual(
    helpers.pickPreferredPushToken({
      ce2PushToken: 'priv-token',
      fcmToken: 'legacy-fcm',
      pushToken: 'legacy-push',
    }),
    'priv-token'
  );
  assert.strictEqual(
    helpers.pickPreferredPushToken({
      ce2PushToken: '  ',
      fcmToken: 'legacy-fcm',
    }),
    'legacy-fcm'
  );
  assert.strictEqual(
    helpers.pickPreferredPushToken({
      pushToken: 'p',
      notificationToken: 'n',
    }),
    'p'
  );
  assert.strictEqual(helpers.pickPreferredPushToken({}), '');
});

test('created-message payload keeps conv/group deep-link ids', function () {
  const dm = helpers.buildCreatedPushPayload({
    kind: 'direct',
    threadId: 'd_ada_bob',
    messageId: 'm1',
    senderId: 'ada',
    recipientId: 'bob',
    senderName: 'Ada',
    message: { content: 'Hello there from class', messageType: 'text' },
  });
  assert.strictEqual(dm.data.type, 'dm');
  assert.strictEqual(dm.data.convId, 'd_ada_bob');
  assert.strictEqual(dm.data.messageId, 'm1');
  assert.strictEqual(dm.data.senderId, 'ada');
  assert.strictEqual(dm.url, '/communication-v2/?conv=d_ada_bob&msg=m1');
  assert.strictEqual(dm.tag, 'dm-d_ada_bob');
  const group = helpers.buildCreatedPushPayload({
    kind: 'group',
    threadId: 'circle-1',
    messageId: 'm2',
    senderId: 'ada',
    senderName: 'Ada',
    groupName: 'Formation circle',
    message: { content: 'Voice note', messageType: 'voice' },
  });
  assert.strictEqual(group.data.type, 'group_message');
  assert.strictEqual(group.data.groupId, 'circle-1');
  assert.strictEqual(group.data.convId, 'circle-1');
  assert.strictEqual(group.url, '/communication-v2/?group=circle-1&msg=m2');
  assert.strictEqual(group.body, 'Voice note');
});

test('direct recipients skip the sender; deleted messages do not notify', function () {
  assert.deepStrictEqual(
    helpers.resolveDirectRecipientIds({
      senderId: 'ada',
      receiverId: 'bob',
      participantIds: ['ada', 'bob'],
    }),
    ['bob']
  );
  assert.strictEqual(helpers.shouldNotifyCreatedMessage({ senderId: 'ada' }).ok, true);
  assert.strictEqual(
    helpers.shouldNotifyCreatedMessage({ senderId: 'ada', deleted: true }).reason,
    'deleted'
  );
  assert.strictEqual(helpers.shouldNotifyCreatedMessage({}).reason, 'missing_sender');
  assert.ok(
    helpers
      .pushClaimId({
        kind: 'direct',
        threadId: 'd_a_b',
        messageId: 'm1',
        recipientId: 'bob',
      })
      .indexOf('bob') >= 0
  );
});

test('service worker imports helpers, bumps cache, and uses notification data', function () {
  assert.ok(swSrc.indexOf("importScripts('/communication-v2/ce2-push.js')") >= 0);
  assert.ok(swSrc.indexOf("CACHE_VERSION = 'sbd-network-v1789692000001'") >= 0);
  assert.ok(swSrc.indexOf("sbd-network-v1789610000001") < 0);
  assert.ok(swSrc.indexOf('handleNotificationClick') >= 0);
  assert.ok(swSrc.indexOf('CE2_OPEN_THREAD') >= 0 || swSrc.indexOf('notificationClickPlan') >= 0);
  assert.ok(swSrc.indexOf('webpush.notification') < 0);
});

test('functions check mute, skip sender, onCreate trigger, and do not put raw message in data', function () {
  assert.ok(fnSrc.indexOf('isThreadMuted') >= 0);
  assert.ok(fnSrc.indexOf('ce2_inbox') >= 0);
  assert.ok(fnSrc.indexOf('shouldSkipRecipient') >= 0);
  assert.ok(fnSrc.indexOf('webpush:') >= 0);
  assert.ok(fnSrc.indexOf('fcm_options') >= 0);
  assert.ok(fnSrc.indexOf('data: payload') >= 0);
  assert.ok(fnSrc.indexOf('message.slice(0, 300)') < 0);
  assert.ok(fnSrc.indexOf('https://sbd.marriageducation.com') >= 0);
  assert.ok(fnSrc.indexOf('onDocumentCreated') >= 0);
  assert.ok(fnSrc.indexOf('ce2_conversations/{convId}/ce2_messages/{messageId}') >= 0);
  assert.ok(fnSrc.indexOf('communicationGroups/{groupId}/ce2_messages/{messageId}') >= 0);
  assert.ok(fnSrc.indexOf('ce2_push_claims') >= 0);
  assert.ok(fnSrc.indexOf('body.recipientToken') < 0);
  assert.ok(fnSrc.indexOf('notifyDirectMessageCreated') >= 0);
});

test('client always notifies via functions and opens from SW postMessage', function () {
  assert.ok(appSrc.indexOf('bindPushThreadOpen') >= 0);
  assert.ok(appSrc.indexOf('openThreadFromPush') >= 0);
  assert.ok(appSrc.indexOf("type !== 'CE2_OPEN_THREAD'") >= 0);
  assert.ok(appSrc.indexOf('formatInboxPreview(meta)') >= 0);
  assert.ok(pwaSrc.indexOf('shouldSuppressForeground') >= 0);
  assert.ok(pwaSrc.indexOf('document.visibilityState') >= 0);
  assert.ok(pwaSrc.indexOf('showNotification') >= 0);
  assert.ok(!/console\.(log|info|debug)\(.*token/i.test(pwaSrc));
  assert.ok(!/console\.(log|info|debug)\(.*token/i.test(appSrc));
  assert.ok(!/console\.(log|info|debug)\(.*fcmToken/i.test(fnSrc));
});

test('cache-bust sits strictly above live 112 / 82 / 1 / 5', function () {
  const jsVer = html.match(/communication-v2\.js\?v=(\d+)/);
  const cssVer = html.match(/communication-v2\.css\?v=(\d+)/);
  const pwaVer = html.match(/ce2-pwa\.js\?v=(\d+)/);
  const pushVer = html.match(/ce2-push\.js\?v=(\d+)/);
  const searchVer = html.match(/ce2-thread-search\.js\?v=(\d+)/);
  const inboxVer = html.match(/ce2-inbox\.js\?v=(\d+)/);
  assert.ok(jsVer && Number(jsVer[1]) > 112);
  assert.ok(cssVer && Number(cssVer[1]) >= 82);
  assert.ok(pwaVer && Number(pwaVer[1]) > 5);
  assert.ok(pushVer && Number(pushVer[1]) >= 1);
  assert.ok(searchVer && Number(searchVer[1]) >= 1);
  assert.ok(inboxVer && Number(inboxVer[1]) >= 1);
  assert.ok(html.indexOf('communication-v2.js?v=112') < 0);
  assert.ok(html.indexOf('ce2-pwa.js?v=5') < 0);
});

test('validate script includes the push test', function () {
  assert.ok(pkg.scripts.validate.indexOf('test-ce2-push.js') >= 0);
});

function createMemoryFirestore(initial) {
  const docs = Object.assign({}, initial || {});
  function colRef(segments) {
    return {
      doc: function (id) {
        return docRef(segments.concat([id]));
      },
      limit: function (n) {
        this._limit = n;
        return this;
      },
      get: async function () {
        const prefix = segments.join('/') + '/';
        const ids = Object.keys(docs)
          .filter(function (p) {
            if (!p.startsWith(prefix)) return false;
            return p.slice(prefix.length).indexOf('/') < 0;
          })
          .map(function (p) {
            return p.slice(prefix.length);
          });
        const limited = ids.slice(0, this._limit || ids.length);
        const found = limited.map(function (id) {
          return {
            id: id,
            exists: true,
            data: function () {
              return docs[prefix + id];
            },
          };
        });
        return { docs: found, size: found.length };
      },
    };
  }
  function docRef(segments) {
    const pathKey = segments.join('/');
    return {
      id: segments[segments.length - 1],
      collection: function (name) {
        return colRef(segments.concat([name]));
      },
      get: async function () {
        const data = docs[pathKey];
        return {
          exists: data != null,
          id: segments[segments.length - 1],
          data: function () {
            return data;
          },
        };
      },
      create: async function (data) {
        if (docs[pathKey] != null) {
          const err = new Error('ALREADY_EXISTS');
          err.code = 6;
          throw err;
        }
        docs[pathKey] = Object.assign({}, data);
      },
      delete: async function () {
        delete docs[pathKey];
      },
    };
  }
  return {
    collection: function (name) {
      return colRef([name]);
    },
    _docs: docs,
  };
}

function seedCe2Direct(dbDocs, opts) {
  const convId = opts.convId;
  const messageId = opts.messageId;
  const senderId = opts.senderId;
  const recipientId = opts.recipientId;
  dbDocs['ce2_conversations/' + convId] = {
    type: 'direct',
    participantIds: [senderId, recipientId],
  };
  dbDocs['ce2_conversations/' + convId + '/ce2_messages/' + messageId] = {
    senderId: senderId,
    receiverId: recipientId,
    conversationId: convId,
    content: opts.content || 'Hello there from class',
    messageType: opts.messageType || 'text',
    classification: opts.classification || 'foundation',
  };
  dbDocs['users/' + senderId] = { name: opts.senderName || 'Ada', tier: 'elite' };
  dbDocs['users/' + recipientId] = Object.assign(
    { name: 'Bob', tier: opts.recipientTier || 'foundation' },
    opts.recipientUser || {}
  );
  if (opts.ce2PushToken) {
    dbDocs['users/' + recipientId + '/ce2_push/token'] = { fcmToken: opts.ce2PushToken };
  }
  if (opts.muted) {
    dbDocs['users/' + recipientId + '/ce2_inbox/' + helpers.inboxPrefId('direct', convId)] = {
      muted: true,
    };
  }
}

function createTestDelivery(dbDocs) {
  const sent = [];
  const db = createMemoryFirestore(dbDocs);
  const delivery = deliveryMod.createDelivery({
    getDb: function () {
      return db;
    },
    getMessaging: function () {
      return {
        send: async function (msg) {
          sent.push(msg);
          return 'ok-' + sent.length;
        },
      };
    },
    FieldValue: {
      serverTimestamp: function () {
        return 'ts';
      },
    },
    logger: { warn: function () {}, error: function () {} },
  });
  return { delivery: delivery, sent: sent, db: db };
}

test('onCreate DM looks up ce2_push first and includes conv deep-link data', async function () {
  const dbDocs = {};
  seedCe2Direct(dbDocs, {
    convId: 'd_ada_bob',
    messageId: 'm1',
    senderId: 'ada',
    recipientId: 'bob',
    ce2PushToken: 'priv-token',
    recipientUser: { fcmToken: 'legacy-should-not-win' },
  });
  const harness = createTestDelivery(dbDocs);
  const result = await harness.delivery.notifyDirectMessageCreated({
    convId: 'd_ada_bob',
    messageId: 'm1',
    message: dbDocs['ce2_conversations/d_ada_bob/ce2_messages/m1'],
    source: 'trigger',
  });
  assert.strictEqual(result.pushed, 1);
  assert.strictEqual(harness.sent.length, 1);
  assert.strictEqual(harness.sent[0].token, 'priv-token');
  assert.strictEqual(harness.sent[0].data.type, 'dm');
  assert.strictEqual(harness.sent[0].data.convId, 'd_ada_bob');
  assert.strictEqual(harness.sent[0].data.messageId, 'm1');
  assert.ok(String(harness.sent[0].data.url).indexOf('conv=d_ada_bob') >= 0);
  assert.strictEqual(harness.sent[0].notification.title, 'Ada');
});

test('onCreate DM falls back to legacy fcmToken when ce2_push is empty', async function () {
  const dbDocs = {};
  seedCe2Direct(dbDocs, {
    convId: 'd_ada_bob',
    messageId: 'm1',
    senderId: 'ada',
    recipientId: 'bob',
    recipientUser: { fcmToken: 'legacy-fcm' },
  });
  const harness = createTestDelivery(dbDocs);
  await harness.delivery.notifyDirectMessageCreated({
    convId: 'd_ada_bob',
    messageId: 'm1',
    message: dbDocs['ce2_conversations/d_ada_bob/ce2_messages/m1'],
    source: 'trigger',
  });
  assert.strictEqual(harness.sent.length, 1);
  assert.strictEqual(harness.sent[0].token, 'legacy-fcm');
});

test('muted inbox pref skips FCM for that recipient only', async function () {
  const dbDocs = {};
  seedCe2Direct(dbDocs, {
    convId: 'd_ada_bob',
    messageId: 'm1',
    senderId: 'ada',
    recipientId: 'bob',
    ce2PushToken: 'priv-token',
    muted: true,
  });
  const harness = createTestDelivery(dbDocs);
  const result = await harness.delivery.notifyDirectMessageCreated({
    convId: 'd_ada_bob',
    messageId: 'm1',
    message: dbDocs['ce2_conversations/d_ada_bob/ce2_messages/m1'],
    source: 'trigger',
  });
  assert.strictEqual(result.pushed, 0);
  assert.strictEqual(harness.sent.length, 0);
});

test('sender is never notified on DM or group create', async function () {
  const dbDocs = {};
  seedCe2Direct(dbDocs, {
    convId: 'd_ada_bob',
    messageId: 'm1',
    senderId: 'ada',
    recipientId: 'ada',
    ce2PushToken: 'ada-token',
  });
  dbDocs['ce2_conversations/d_ada_bob'] = {
    type: 'direct',
    participantIds: ['ada', 'ada'],
  };
  const dmHarness = createTestDelivery(dbDocs);
  const dmResult = await dmHarness.delivery.notifyDirectMessageCreated({
    convId: 'd_ada_bob',
    messageId: 'm1',
    message: dbDocs['ce2_conversations/d_ada_bob/ce2_messages/m1'],
    source: 'trigger',
  });
  assert.strictEqual(dmHarness.sent.length, 0);
  assert.ok(dmResult.pushed === 0);

  const groupDocs = {
    'communicationGroups/g1': { name: 'Formation circle' },
    'communicationGroups/g1/members/ada': { role: 'creator' },
    'communicationGroups/g1/ce2_messages/m2': {
      senderId: 'ada',
      conversationId: 'g1',
      content: 'Hi group',
      classification: 'foundation',
      messageType: 'text',
    },
    'users/ada': { name: 'Ada', fcmToken: 'ada-token' },
  };
  const groupHarness = createTestDelivery(groupDocs);
  const groupResult = await groupHarness.delivery.notifyGroupMessageCreated({
    groupId: 'g1',
    messageId: 'm2',
    message: groupDocs['communicationGroups/g1/ce2_messages/m2'],
    source: 'trigger',
  });
  assert.strictEqual(groupHarness.sent.length, 0);
  assert.strictEqual(groupResult.pushed, 0);
});

test('Elite classification is not pushed to a foundation recipient', async function () {
  const dbDocs = {};
  seedCe2Direct(dbDocs, {
    convId: 'd_ada_bob',
    messageId: 'm1',
    senderId: 'ada',
    recipientId: 'bob',
    ce2PushToken: 'priv-token',
    classification: 'elite',
    recipientTier: 'foundation',
  });
  const harness = createTestDelivery(dbDocs);
  const result = await harness.delivery.notifyDirectMessageCreated({
    convId: 'd_ada_bob',
    messageId: 'm1',
    message: dbDocs['ce2_conversations/d_ada_bob/ce2_messages/m1'],
    source: 'trigger',
  });
  assert.strictEqual(result.pushed, 0);
  assert.strictEqual(harness.sent.length, 0);
});

test('HTTP fallback and onCreate share a claim so the same message is sent once', async function () {
  const dbDocs = {};
  seedCe2Direct(dbDocs, {
    convId: 'd_ada_bob',
    messageId: 'm1',
    senderId: 'ada',
    recipientId: 'bob',
    ce2PushToken: 'priv-token',
  });
  const harness = createTestDelivery(dbDocs);
  const first = await harness.delivery.notifyDirectMessageCreated({
    convId: 'd_ada_bob',
    messageId: 'm1',
    message: dbDocs['ce2_conversations/d_ada_bob/ce2_messages/m1'],
    source: 'trigger',
  });
  const second = await harness.delivery.notifyDirectFromHttp({
    senderId: 'ada',
    recipientId: 'bob',
    convId: 'd_ada_bob',
    messageId: 'm1',
    senderName: 'Ada',
    bodyText: 'Hello there from class',
    source: 'http',
  });
  assert.strictEqual(first.pushed, 1);
  assert.strictEqual(second.pushed, 0);
  assert.strictEqual(second.reason, 'skipped');
  assert.strictEqual(harness.sent.length, 1);
});

test('group onCreate notifies members except sender and muted, with group deep-link', async function () {
  const dbDocs = {
    'communicationGroups/circle': { name: 'Formation circle' },
    'communicationGroups/circle/members/ada': { role: 'creator' },
    'communicationGroups/circle/members/bob': { role: 'member' },
    'communicationGroups/circle/members/cam': { role: 'member' },
    'communicationGroups/circle/ce2_messages/m9': {
      senderId: 'ada',
      conversationId: 'circle',
      content: 'See you tonight',
      classification: 'foundation',
      messageType: 'text',
    },
    'users/ada': { name: 'Ada' },
    'users/bob': { name: 'Bob' },
    'users/cam': { name: 'Cam', fcmToken: 'cam-legacy' },
    'users/bob/ce2_push/token': { fcmToken: 'bob-priv' },
    ['users/cam/ce2_inbox/' + helpers.inboxPrefId('group', 'circle')]: { muted: true },
  };
  const harness = createTestDelivery(dbDocs);
  const result = await harness.delivery.notifyGroupMessageCreated({
    groupId: 'circle',
    messageId: 'm9',
    message: dbDocs['communicationGroups/circle/ce2_messages/m9'],
    source: 'trigger',
  });
  assert.strictEqual(result.pushed, 1);
  assert.strictEqual(harness.sent.length, 1);
  assert.strictEqual(harness.sent[0].token, 'bob-priv');
  assert.strictEqual(harness.sent[0].data.type, 'group_message');
  assert.strictEqual(harness.sent[0].data.groupId, 'circle');
  assert.ok(String(harness.sent[0].data.url).indexOf('group=circle') >= 0);
  assert.strictEqual(harness.sent[0].notification.title, 'Formation circle');
});

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
