/**
 * Unit tests for CE2 legacy FCM token migration onto owner-only ce2_push.
 * Usage: node scripts/test-ce2-push-migrate.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const helpers = require(path.join(ROOT, 'functions/ce2-push-helpers.js'));
const { createMigrator } = require(path.join(ROOT, 'functions/ce2-push-migrate.js'));
const deliveryMod = require(path.join(ROOT, 'functions/ce2-push-delivery.js'));

const pwaSrc = fs.readFileSync(path.join(ROOT, 'public/communication-v2/ce2-pwa.js'), 'utf8');
const notifSrc = fs.readFileSync(path.join(ROOT, 'public/js/notifications.js'), 'utf8');
const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
const fnSrc =
  fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8') +
  '\n' +
  fs.readFileSync(path.join(ROOT, 'functions/ce2-push-delivery.js'), 'utf8') +
  '\n' +
  fs.readFileSync(path.join(ROOT, 'functions/ce2-push-migrate.js'), 'utf8');
const workerSrc = fs.readFileSync(
  path.join(ROOT, 'workers/upload-signer/src/index.js'),
  'utf8'
);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const html = fs.readFileSync(path.join(ROOT, 'public/communication-v2/index.html'), 'utf8');

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
  console.log('\n✅ CE2 push migrate tests passed\n');
}

console.log('\nCE2 push token migration\n');

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
      orderBy: function () {
        return this;
      },
      startAfter: function (doc) {
        this._after = doc && doc.id;
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
          })
          .sort();
        let start = 0;
        if (this._after) {
          const idx = ids.indexOf(this._after);
          start = idx >= 0 ? idx + 1 : 0;
        }
        const limited = ids.slice(start, start + (this._limit || ids.length));
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
      set: async function (data, opts) {
        const merge = !!(opts && opts.merge);
        const next = merge && docs[pathKey] ? Object.assign({}, docs[pathKey]) : {};
        Object.keys(data || {}).forEach(function (key) {
          next[key] = data[key];
        });
        docs[pathKey] = next;
      },
      update: async function (data) {
        if (docs[pathKey] == null) {
          const err = new Error('NOT_FOUND');
          err.code = 5;
          throw err;
        }
        const next = Object.assign({}, docs[pathKey]);
        Object.keys(data || {}).forEach(function (key) {
          const value = data[key];
          if (value && typeof value === 'object' && value.__ce2Delete) {
            delete next[key];
          } else {
            next[key] = value;
          }
        });
        docs[pathKey] = next;
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

function createTestMigrator(dbDocs) {
  const db = createMemoryFirestore(dbDocs);
  const logs = [];
  const migrator = createMigrator({
    getDb: function () {
      return db;
    },
    FieldValue: {
      serverTimestamp: function () {
        return 'ts';
      },
      delete: function () {
        return { __ce2Delete: true };
      },
    },
    logger: {
      info: function (msg, meta) {
        logs.push({ level: 'info', msg: msg, meta: meta });
      },
      warn: function (msg, meta) {
        logs.push({ level: 'warn', msg: msg, meta: meta });
      },
      error: function (msg, meta) {
        logs.push({ level: 'error', msg: msg, meta: meta });
      },
    },
  });
  return { migrator: migrator, db: db, logs: logs };
}

test('plan prefers existing ce2_push and only clears leftover public fields', function () {
  const keep = helpers.planLegacyPushMigration({
    userData: { fcmToken: 'legacy-fcm', name: 'Bob' },
    ce2PushToken: 'priv-token',
  });
  assert.strictEqual(keep.action, 'clear_legacy');
  assert.strictEqual(keep.tokenToWrite, '');
  assert.strictEqual(keep.clearLegacy, true);

  const migrate = helpers.planLegacyPushMigration({
    userData: { fcmToken: 'legacy-fcm' },
    ce2PushToken: '',
  });
  assert.strictEqual(migrate.action, 'migrate');
  assert.strictEqual(migrate.tokenToWrite, 'legacy-fcm');

  const noop = helpers.planLegacyPushMigration({
    userData: { name: 'Bob' },
    ce2PushToken: 'priv-token',
  });
  assert.strictEqual(noop.action, 'noop');
  assert.strictEqual(noop.clearLegacy, false);
});

test('legacy field order is fcmToken then pushToken then notificationToken', function () {
  assert.strictEqual(
    helpers.pickLegacyUserDocPushToken({
      pushToken: 'p',
      notificationToken: 'n',
    }),
    'p'
  );
  assert.strictEqual(
    helpers.pickLegacyUserDocPushToken({ notificationToken: 'n' }),
    'n'
  );
  assert.ok(helpers.legacyPushFieldsPresent({ fcmToken: '' }));
  assert.ok(!helpers.legacyPushFieldsPresent({ name: 'Bob' }));
});

test('migrate copies leftover public token onto ce2_push then strips the user doc', async function () {
  const harness = createTestMigrator({
    'users/bob': { name: 'Bob', fcmToken: 'legacy-fcm', pushToken: 'also-public' },
  });
  const result = await harness.migrator.migrateUser('bob');
  assert.strictEqual(result.action, 'migrate');
  assert.strictEqual(harness.db._docs['users/bob/ce2_push/token'].fcmToken, 'legacy-fcm');
  assert.ok(!Object.prototype.hasOwnProperty.call(harness.db._docs['users/bob'], 'fcmToken'));
  assert.ok(!Object.prototype.hasOwnProperty.call(harness.db._docs['users/bob'], 'pushToken'));
  assert.strictEqual(harness.db._docs['users/bob'].name, 'Bob');
});

test('migrate does not overwrite an existing ce2_push token with a stale legacy value', async function () {
  const harness = createTestMigrator({
    'users/bob': { name: 'Bob', fcmToken: 'stale-legacy' },
    'users/bob/ce2_push/token': { fcmToken: 'fresh-private' },
  });
  const result = await harness.migrator.migrateUser('bob');
  assert.strictEqual(result.action, 'clear_legacy');
  assert.strictEqual(harness.db._docs['users/bob/ce2_push/token'].fcmToken, 'fresh-private');
  assert.ok(!Object.prototype.hasOwnProperty.call(harness.db._docs['users/bob'], 'fcmToken'));
});

test('lookup still delivers via legacy token while migrating it onto ce2_push', async function () {
  const dbDocs = {
    'ce2_conversations/d_ada_bob': { type: 'direct', participantIds: ['ada', 'bob'] },
    'ce2_conversations/d_ada_bob/ce2_messages/m1': {
      senderId: 'ada',
      receiverId: 'bob',
      conversationId: 'd_ada_bob',
      content: 'Hello there from class',
      messageType: 'text',
      classification: 'foundation',
    },
    'users/ada': { name: 'Ada' },
    'users/bob': { name: 'Bob', fcmToken: 'legacy-fcm' },
  };
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
          return 'ok';
        },
      };
    },
    FieldValue: {
      serverTimestamp: function () {
        return 'ts';
      },
      delete: function () {
        return { __ce2Delete: true };
      },
    },
    logger: { warn: function () {}, error: function () {}, info: function () {} },
  });
  await delivery.notifyDirectMessageCreated({
    convId: 'd_ada_bob',
    messageId: 'm1',
    message: dbDocs['ce2_conversations/d_ada_bob/ce2_messages/m1'],
    source: 'trigger',
  });
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].token, 'legacy-fcm');
  assert.strictEqual(db._docs['users/bob/ce2_push/token'].fcmToken, 'legacy-fcm');
  assert.ok(!Object.prototype.hasOwnProperty.call(db._docs['users/bob'], 'fcmToken'));
});

test('sweep migrates leftover users and skips already-private docs', async function () {
  const harness = createTestMigrator({
    'users/ada': { name: 'Ada' },
    'users/bob': { name: 'Bob', fcmToken: 'bob-legacy' },
    'users/cam': { name: 'Cam', pushToken: 'cam-legacy' },
    'users/cam/ce2_push/token': { fcmToken: 'cam-private' },
    'users/deb': { name: 'Deb' },
    'users/deb/ce2_push/token': { fcmToken: 'deb-private' },
  });
  const result = await harness.migrator.sweepLegacyPushTokens({ pageSize: 10, maxUsers: 20 });
  assert.strictEqual(result.scanned, 4);
  assert.strictEqual(result.migrated, 1);
  assert.strictEqual(result.cleared, 1);
  assert.strictEqual(harness.db._docs['users/bob/ce2_push/token'].fcmToken, 'bob-legacy');
  assert.strictEqual(harness.db._docs['users/cam/ce2_push/token'].fcmToken, 'cam-private');
  assert.ok(!Object.prototype.hasOwnProperty.call(harness.db._docs['users/bob'], 'fcmToken'));
  assert.ok(!Object.prototype.hasOwnProperty.call(harness.db._docs['users/cam'], 'pushToken'));
});

test('callable gate: self-migrate ok, other users require admin, sweep requires admin', function () {
  assert.strictEqual(
    helpers.resolveMigrateTarget({ callerUid: 'bob', targetUid: 'bob' }).ok,
    true
  );
  assert.strictEqual(
    helpers.resolveMigrateTarget({
      callerUid: 'bob',
      targetUid: 'cam',
      isAdmin: false,
    }).reason,
    'cross_user_denied'
  );
  assert.strictEqual(
    helpers.resolveMigrateTarget({
      callerUid: 'ada',
      targetUid: 'cam',
      isAdmin: true,
    }).ok,
    true
  );
  assert.strictEqual(
    helpers.resolveMigrateTarget({ callerUid: 'bob', sweep: true, isAdmin: false }).reason,
    'admin_required'
  );
  assert.strictEqual(
    helpers.resolveMigrateTarget({ callerUid: 'ada', sweep: true, isAdmin: true }).ok,
    true
  );
  assert.strictEqual(helpers.resolveMigrateTarget({}).reason, 'unauthenticated');
  assert.ok(helpers.isAdminUserData({ role: 'admin' }));
  assert.ok(helpers.isAdminUserData({}, { admin: true }));
  assert.ok(!helpers.isAdminUserData({ role: 'member' }));
});

test('ce2_push rules stay owner-only and user-doc writes still cannot add public tokens', function () {
  const start = rules.indexOf('match /users/{userId}/ce2_push/{docId} {');
  assert.ok(start >= 0);
  const block = rules.slice(start, start + 500);
  assert.ok(/request\.auth\.uid == userId/.test(block));
  assert.ok(/docId == 'token'/.test(block));
  assert.ok(!/allow read:\s*if request\.auth != null;/.test(block.split('match /ce2_share_tokens')[0]));
  assert.ok(rules.indexOf("!ce2UserPushSecretsPresent(request.resource.data)") >= 0);
  assert.ok(rules.indexOf('ce2UserPushSecretsUnchangedOrStripped') >= 0);
  assert.ok(rules.indexOf('cannot be hidden by rules during') >= 0);
});

test('client persist writes ce2_push for the signed-in user only and refuses other uids', function () {
  assert.ok(pwaSrc.indexOf('function persistCe2PushToken') >= 0);
  assert.ok(pwaSrc.indexOf('function migrateOwnLegacyPushToken') >= 0);
  assert.ok(pwaSrc.indexOf('me.uid !== userId') >= 0);
  assert.ok(pwaSrc.indexOf("collection('ce2_push')") >= 0);
  assert.ok(pwaSrc.indexOf("update({ fcmToken: token })") < 0);
  assert.ok(pwaSrc.indexOf('onTokenRefresh') >= 0);
  assert.ok(notifSrc.indexOf('function _migrateOwnLegacyPushToken') >= 0);
  assert.ok(notifSrc.indexOf('me.uid !== userId') >= 0);
  assert.ok(notifSrc.indexOf("collection('ce2_push')") >= 0);
  assert.ok(notifSrc.indexOf("update({ fcmToken: token })") < 0);
  assert.ok(!/collection\('users'\)\.doc\([^)]*recipient/.test(pwaSrc));
});

test('functions expose callable + scheduled sweep and never log raw tokens', function () {
  assert.ok(fnSrc.indexOf('exports.migrateCe2PushTokens') >= 0);
  assert.ok(fnSrc.indexOf('exports.sweepLegacyCe2PushTokens') >= 0);
  assert.ok(fnSrc.indexOf('onSchedule') >= 0);
  assert.ok(fnSrc.indexOf('cross_user_denied') >= 0 || fnSrc.indexOf('Cannot migrate another user') >= 0);
  assert.ok(!/console\.(log|info|debug)\(.*fcmToken/i.test(fnSrc));
  assert.ok(!/logger\.(info|warn|error)\([^)]*tokenToWrite/.test(fnSrc));
  assert.ok(fnSrc.indexOf('migratedFrom: "legacy_user_doc"') >= 0);
  const infoLogs = fnSrc.match(/logger\.info\([\s\S]{0,180}/g) || [];
  infoLogs.forEach(function (chunk) {
    assert.ok(!/fcmToken|tokenToWrite|legacy-fcm/.test(chunk));
  });
});

test('worker board/DM lookup prefers ce2_push after public fields are cleared', function () {
  assert.ok(workerSrc.indexOf('lookupOwnerCe2PushToken') >= 0);
  assert.ok(workerSrc.indexOf('preferCe2PushThenLegacy') >= 0);
  assert.ok(workerSrc.indexOf("users/${id}/ce2_push/token") >= 0);
});

test('cache-bust pwa after persist/migrate client change', function () {
  const pwaVer = html.match(/ce2-pwa\.js\?v=(\d+)/);
  assert.ok(pwaVer && Number(pwaVer[1]) >= 8);
  assert.ok(html.indexOf('ce2-pwa.js?v=7') < 0);
});

test('validate script includes the migrate test', function () {
  assert.ok(pkg.scripts.validate.indexOf('test-ce2-push-migrate.js') >= 0);
});

test('migrate logs never include the raw token value', async function () {
  const harness = createTestMigrator({
    'users/bob': { name: 'Bob', fcmToken: 'super-secret-token' },
  });
  await harness.migrator.migrateUser('bob');
  const blob = JSON.stringify(harness.logs);
  assert.ok(blob.indexOf('super-secret-token') < 0);
  assert.ok(harness.logs.some(function (row) {
    return row.msg === 'CE2 push token migrate' && row.meta && row.meta.action === 'migrate';
  }));
});

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
