/**
 * CE2 leftover public R2 media — detect + membership-gated migrate / re-send.
 * Usage: node scripts/test-ce2-r2-media-migrate.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const PUBLIC_BASE = 'https://pub-6524d7976da94b11bb645c445abecb63.r2.dev';
const WORKER_ORIGIN = 'https://sbd-upload-signer.sbdnetwork.workers.dev';

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
      fetch: function () {
        return Promise.reject(new Error('fetch not stubbed'));
      },
      getCurrentUser: function () {
        return {
          uid: 'alice',
          getIdToken: async function () {
            return 'id-token';
          },
        };
      },
      location: { origin: 'https://sbd.marriageducation.com', href: 'https://sbd.marriageducation.com/' },
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

async function testAsync(name, fn) {
  try {
    await fn();
    console.log('  ok  ' + name);
  } catch (err) {
    failed += 1;
    console.error('  FAIL  ' + name);
    console.error('       ' + (err && err.stack ? err.stack.split('\n')[0] : err));
  }
}

const html = read('public/communication-v2/index.html');
const workerSrc = read('workers/upload-signer/src/index.js');
const uploadSrc = read('public/js/upload.js');
const v2Src = read('public/communication-v2/communication-v2.js');
const actionsSrc = read('public/communication-v2/ce2-message-actions.js');
const css = read('public/communication-v2/communication-v2.css');
const pkg = JSON.parse(read('package.json'));

console.log('\nCE2 legacy public R2 migrate\n');

test('cache-bust moved forward for migrate UI/JS', function () {
  const jsVer = html.match(/communication-v2\.js\?v=(\d+)/);
  const upVer = html.match(/upload\.js\?v=(\d+)/);
  const actionsVer = html.match(/ce2-message-actions\.js\?v=(\d+)/);
  const cssVer = html.match(/communication-v2\.css\?v=(\d+)/);
  assert.ok(jsVer && Number(jsVer[1]) >= 124, 'communication-v2.js cache-bust');
  assert.ok(upVer && Number(upVer[1]) >= 12, 'upload.js cache-bust');
  assert.ok(actionsVer && Number(actionsVer[1]) >= 27, 'ce2-message-actions.js cache-bust');
  assert.ok(cssVer && Number(cssVer[1]) >= 90, 'communication-v2.css cache-bust');
  assert.ok(html.indexOf('ce2-keyboard-stable-v60') >= 0);
});

test('Worker and clients expose a membership-gated migrate path', function () {
  assert.ok(workerSrc.indexOf("pathname === '/migrate-ce2-media'") >= 0);
  assert.ok(workerSrc.indexOf('executeCe2MediaMigrate') >= 0);
  assert.ok(workerSrc.indexOf('uidCanAccessCe2ScopeCached') >= 0);
  assert.ok(workerSrc.indexOf('if (!env.CE2_BUCKET)') >= 0);
  const migrateBlock = workerSrc.slice(
    workerSrc.indexOf("pathname === '/migrate-ce2-media'"),
    workerSrc.indexOf('POST /register-push')
  );
  assert.ok(migrateBlock.indexOf('signedUrl') < 0, 'migrate must not mint or log signed URLs');
  assert.ok(uploadSrc.indexOf('function isLegacyPublicCe2MediaUrl') >= 0);
  assert.ok(uploadSrc.indexOf('function migrateCe2MessageMedia') >= 0);
  assert.ok(uploadSrc.indexOf('/migrate-ce2-media') >= 0);
  assert.ok(v2Src.indexOf('appendLegacyMediaNotice') >= 0);
  assert.ok(v2Src.indexOf('Move to private') >= 0);
  assert.ok(v2Src.indexOf('Upload again') >= 0);
  assert.ok(v2Src.indexOf('Anyone with the link can open it') >= 0);
  assert.ok(actionsSrc.indexOf('migrate_media') >= 0);
  assert.ok(css.indexOf('.ce2-media-privacy') >= 0);
  assert.ok(pkg.scripts.validate.indexOf('test-ce2-r2-media-migrate.js') >= 0);
});

test('frozen keyboard lock is not a mutation target', function () {
  assert.ok(html.indexOf('ce2-keyboard-stable-v60') >= 0);
  const lock = read('public/communication-v2/KEYBOARD-STABLE.lock');
  assert.ok(lock.length > 0);
});

const uploadSandbox = loadIife('public/js/upload.js');

test('detect-legacy: public CE2 dm_* URLs vs private locators vs UGC', function () {
  assert.ok(
    uploadSandbox.isLegacyPublicCe2MediaUrl(
      PUBLIC_BASE + '/dm_audio/1710000000_ab12_voice.webm'
    )
  );
  assert.ok(
    uploadSandbox.isLegacyPublicCe2MediaUrl(
      PUBLIC_BASE + '/dm_attachments/d_alice_bob/photo.jpg'
    )
  );
  assert.ok(
    uploadSandbox.isLegacyPublicCe2MediaUrl(
      PUBLIC_BASE + '/ce2/dm_videos/d_alice_bob/clip.mp4'
    ),
    'ce2/ prefix on the public CDN is still world-readable leftover'
  );
  assert.ok(
    !uploadSandbox.isLegacyPublicCe2MediaUrl(
      WORKER_ORIGIN + '/media?key=ce2%2Fdm_audio%2Fd_alice_bob%2Fvoice.webm'
    )
  );
  assert.ok(!uploadSandbox.isLegacyPublicCe2MediaUrl('ce2/dm_audio/d_alice_bob/voice.webm'));
  assert.ok(
    !uploadSandbox.isLegacyPublicCe2MediaUrl(PUBLIC_BASE + '/ugc-photos/pic.jpg'),
    'board/UGC public assets must stay untouched'
  );
  assert.ok(!uploadSandbox.isLegacyPublicCe2MediaUrl(PUBLIC_BASE + '/ugc-videos/clip.mp4'));
  assert.ok(!uploadSandbox.isLegacyPublicCe2MediaUrl(PUBLIC_BASE + '/course-covers/cover.jpg'));
  assert.ok(
    !uploadSandbox.isLegacyPublicCe2MediaUrl(
      'https://firebasestorage.googleapis.com/v0/b/x/o/dm_audio%2Ffile'
    )
  );
});

test('collectLegacyCe2MediaFields only returns leftover CE2 pointers', function () {
  const fields = uploadSandbox.collectLegacyCe2MediaFields({
    audioUrl: PUBLIC_BASE + '/dm_audio/old.webm',
    imageUrl: WORKER_ORIGIN + '/media?key=ce2%2Fdm_attachments%2Fd_a_b%2Fnew.jpg',
    videoUrl: PUBLIC_BASE + '/ugc-videos/board-clip.mp4',
    content: 'hello',
  });
  assert.strictEqual(JSON.stringify(Array.from(fields)), JSON.stringify(['audioUrl']));
});

(async function run() {
  const migrate = await import(
    pathToFileURL(path.join(ROOT, 'workers/upload-signer/src/ce2-media-migrate.js')).href
  );
  const policy = await import(
    pathToFileURL(path.join(ROOT, 'workers/upload-signer/src/upload-policy.js')).href
  );

  await testAsync('Worker parse only accepts our public base, not arbitrary hosts', async function () {
    const ours = migrate.parseLegacyPublicCe2Media(
      PUBLIC_BASE + '/dm_audio/old.webm',
      PUBLIC_BASE
    );
    assert.ok(ours);
    assert.strictEqual(ours.sourceKey, 'dm_audio/old.webm');
    assert.strictEqual(ours.folder, 'dm_audio');

    const other = migrate.parseLegacyPublicCe2Media(
      'https://evil.r2.dev/dm_audio/old.webm',
      PUBLIC_BASE
    );
    assert.strictEqual(other, null);

    const ugc = migrate.parseLegacyPublicCe2Media(
      PUBLIC_BASE + '/ugc-photos/pic.jpg',
      PUBLIC_BASE
    );
    assert.strictEqual(ugc, null);
    assert.strictEqual(
      migrate.classifyMediaRef(PUBLIC_BASE + '/ugc-photos/pic.jpg', PUBLIC_BASE),
      'public-ugc'
    );
  });

  await testAsync('dest key is conversation-scoped ce2/… and rejects other scopes', async function () {
    const unscoped = migrate.parseLegacyPublicCe2Media(
      PUBLIC_BASE + '/dm_attachments/photo.jpg',
      PUBLIC_BASE
    );
    assert.strictEqual(
      migrate.destPrivateKeyForLegacy(unscoped, 'd_alice_bob'),
      'ce2/dm_attachments/d_alice_bob/photo.jpg'
    );
    const scopedWrong = migrate.parseLegacyPublicCe2Media(
      PUBLIC_BASE + '/dm_audio/d_other/voice.webm',
      PUBLIC_BASE
    );
    assert.strictEqual(migrate.destPrivateKeyForLegacy(scopedWrong, 'd_alice_bob'), '');
    assert.ok(policy.isCe2PrivateObjectKey('ce2/dm_attachments/d_alice_bob/photo.jpg'));
  });

  await testAsync('buildMigratePlan skips UGC and already-private locators', async function () {
    const plan = migrate.buildMigratePlan(
      {
        conversationId: 'd_alice_bob',
        audioUrl: PUBLIC_BASE + '/dm_audio/old.webm',
        imageUrl: WORKER_ORIGIN + '/media?key=ce2%2Fdm_attachments%2Fd_alice_bob%2Fnew.jpg',
        videoUrl: PUBLIC_BASE + '/ugc-videos/board.mp4',
      },
      'd_alice_bob',
      PUBLIC_BASE,
      {},
      WORKER_ORIGIN
    );
    assert.strictEqual(plan.copies.length, 1);
    assert.strictEqual(plan.copies[0].field, 'audioUrl');
    assert.strictEqual(plan.copies[0].sourceKey, 'dm_audio/old.webm');
    assert.strictEqual(plan.copies[0].destKey, 'ce2/dm_audio/d_alice_bob/old.webm');
    assert.ok(plan.updates.audioUrl.indexOf('/media?key=') >= 0);
    assert.ok(!plan.updates.imageUrl);
    assert.ok(!plan.updates.videoUrl);
    assert.ok(plan.skipped.some((s) => s.field === 'videoUrl' && s.reason === 'public-ugc'));
  });

  function migrateHarness(overrides) {
    const publicKeys = new Set((overrides.publicKeys || ['dm_audio/old.webm']));
    const privateKeys = new Set(overrides.privateKeys || []);
    const writes = [];
    const copies = [];
    const deletes = [];
    const members = overrides.members || { alice: true };
    const docs = overrides.docs || {
      'ce2_conversations/d_alice_bob/ce2_messages/m1': {
        conversationId: 'd_alice_bob',
        audioUrl: PUBLIC_BASE + '/dm_audio/old.webm',
        senderId: 'alice',
      },
    };
    return {
      copies: copies,
      writes: writes,
      deletes: deletes,
      input: Object.assign(
        {
          callerUid: 'alice',
          conversationId: 'd_alice_bob',
          conversationType: 'direct',
          messageId: 'm1',
          publicBase: PUBLIC_BASE,
          workerOrigin: WORKER_ORIGIN,
          now: function () {
            return '2026-09-19T12:00:00.000Z';
          },
          uidCanAccess: async function (uid) {
            return !!members[uid];
          },
          readMessage: async function (docPath) {
            return docs[docPath] || null;
          },
          writeMessageFields: async function (docPath, fields) {
            writes.push({ docPath: docPath, fields: fields });
          },
          copyObject: async function (copy) {
            copies.push(copy);
            if (!publicKeys.has(copy.sourceKey)) return { ok: false, reason: 'not_found' };
            privateKeys.add(copy.destKey);
            return { ok: true, bytes: 12 };
          },
          deletePublicObject: async function (sourceKey) {
            deletes.push(sourceKey);
          },
        },
        overrides.input || {}
      ),
    };
  }

  await testAsync('migrate copies into private key and rewrites the message pointer', async function () {
    const h = migrateHarness({});
    const result = await migrate.executeCe2MediaMigrate(h.input);
    assert.ok(result.ok);
    assert.deepStrictEqual(result.copied, ['audioUrl']);
    assert.strictEqual(h.copies[0].destKey, 'ce2/dm_audio/d_alice_bob/old.webm');
    assert.strictEqual(h.writes.length, 1);
    assert.ok(h.writes[0].fields.audioUrl.indexOf('ce2%2Fdm_audio%2Fd_alice_bob%2Fold.webm') >= 0);
    assert.strictEqual(h.writes[0].fields.mediaPrivacy, 'private');
    assert.strictEqual(h.deletes.length, 0, 'default leaves the public object for forwarded copies');
  });

  await testAsync('membership gate denies strangers', async function () {
    const h = migrateHarness({ members: { alice: true } });
    h.input.callerUid = 'eve';
    const result = await migrate.executeCe2MediaMigrate(h.input);
    assert.strictEqual(result.status, 403);
    assert.strictEqual(result.error, 'Forbidden');
    assert.strictEqual(h.copies.length, 0);
    assert.strictEqual(h.writes.length, 0);
  });

  await testAsync('re-send replacements only accept same-scope private keys', async function () {
    const h = migrateHarness({
      publicKeys: [],
      input: {
        replacements: {
          audioUrl: WORKER_ORIGIN + '/media?key=ce2%2Fdm_audio%2Fd_alice_bob%2Freup.webm',
        },
      },
    });
    const result = await migrate.executeCe2MediaMigrate(h.input);
    assert.ok(result.ok);
    assert.deepStrictEqual(result.replaced, ['audioUrl']);
    assert.strictEqual(h.copies.length, 0);
    assert.ok(h.writes[0].fields.audioUrl.indexOf('reup.webm') >= 0);

    const rejected = migrate.replacementObjectKey(
      'ce2/dm_audio/d_other/x.webm',
      'd_alice_bob'
    );
    assert.strictEqual(rejected, '');
    const ugcReplace = migrate.replacementObjectKey(
      PUBLIC_BASE + '/ugc-photos/pic.jpg',
      'd_alice_bob'
    );
    assert.strictEqual(ugcReplace, '');
  });

  await testAsync('source_missing returns a re-send signal and does not wipe the pointer', async function () {
    const h = migrateHarness({ publicKeys: [] });
    const result = await migrate.executeCe2MediaMigrate(h.input);
    assert.strictEqual(result.code, 'source_missing');
    assert.strictEqual(result.status, 409);
    assert.strictEqual(h.writes.length, 0);
  });

  await testAsync('already-private messages are a no-op; UGC-only messages stay public', async function () {
    const privateH = migrateHarness({
      docs: {
        'ce2_conversations/d_alice_bob/ce2_messages/m1': {
          conversationId: 'd_alice_bob',
          audioUrl: WORKER_ORIGIN + '/media?key=ce2%2Fdm_audio%2Fd_alice_bob%2Fvoice.webm',
        },
      },
    });
    const priv = await migrate.executeCe2MediaMigrate(privateH.input);
    assert.ok(priv.ok);
    assert.ok(priv.alreadyPrivate);
    assert.strictEqual(privateH.writes.length, 0);

    const ugcH = migrateHarness({
      docs: {
        'ce2_conversations/d_alice_bob/ce2_messages/m1': {
          conversationId: 'd_alice_bob',
          imageUrl: PUBLIC_BASE + '/ugc-photos/board.jpg',
        },
      },
    });
    const ugc = await migrate.executeCe2MediaMigrate(ugcH.input);
    assert.ok(ugc.ok);
    assert.ok(ugc.untouchedUgc);
    assert.strictEqual(ugcH.copies.length, 0);
    assert.strictEqual(ugcH.writes.length, 0);
  });

  await testAsync('resolveR2MediaUrl still plays public leftovers until migrated', async function () {
    let called = null;
    const sandbox = loadIife('public/js/upload.js', {
      fetch: function (url, opts) {
        called = { url: String(url), opts: opts };
        return Promise.resolve({
          ok: true,
          json: async function () {
            return { signedUrl: WORKER_ORIGIN + '/media?key=x&sig=1', expiresAt: 9e12 };
          },
        });
      },
    });
    const publicUrl = PUBLIC_BASE + '/dm_audio/old.webm';
    const passed = await sandbox.resolveR2MediaUrl(publicUrl);
    assert.strictEqual(passed, publicUrl);
    assert.strictEqual(called, null);
    assert.ok(sandbox.isLegacyPublicCe2MediaUrl(publicUrl));
  });

  await testAsync('client migrateCe2MessageMedia posts to the Worker and never sends a publicUrl upload', async function () {
    let called = null;
    const sandbox = loadIife('public/js/upload.js', {
      fetch: function (url, opts) {
        called = { url: String(url), body: JSON.parse(opts.body) };
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async function () {
            return {
              ok: true,
              locators: {
                audioUrl: WORKER_ORIGIN + '/media?key=ce2%2Fdm_audio%2Fd_alice_bob%2Fold.webm',
              },
            };
          },
        });
      },
    });
    const result = await sandbox.migrateCe2MessageMedia({
      conversationId: 'd_alice_bob',
      conversationType: 'direct',
      messageId: 'm1',
    });
    assert.ok(called.url.indexOf('/migrate-ce2-media') >= 0);
    assert.strictEqual(called.body.conversationId, 'd_alice_bob');
    assert.strictEqual(called.body.messageId, 'm1');
    assert.ok(!called.body.deletePublic);
    assert.ok(result.ok);
    assert.ok(result.locators.audioUrl.indexOf('/media?key=') >= 0);
  });

  if (failed) {
    console.error('\n' + failed + ' test(s) failed\n');
    process.exit(1);
  }
  console.log('\n✅ CE2 legacy public R2 migrate tests passed\n');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
