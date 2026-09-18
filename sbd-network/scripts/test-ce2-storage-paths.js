/**
 * CE2 conversation-scoped Storage paths + membership rules.
 * Usage: node scripts/test-ce2-storage-paths.js
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
      getCurrentUser: function () {
        return { uid: 'u1', getIdToken: async function () { return 't'; } };
      },
    },
    extras || {}
  );
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.runInNewContext(code, sandbox, { filename: relPath });
  return sandbox;
}

function extractMatchBlock(rules, signature) {
  const start = rules.indexOf(signature);
  assert.ok(start >= 0, 'missing ' + signature);
  let brace = -1;
  if (signature.trim().endsWith('{')) {
    brace = start + signature.lastIndexOf('{');
  } else {
    brace = rules.indexOf('{', start);
  }
  assert.ok(brace >= 0, 'missing body for ' + signature);
  let depth = 0;
  let i = brace;
  for (; i < rules.length; i += 1) {
    if (rules[i] === '{') depth += 1;
    else if (rules[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        i += 1;
        break;
      }
    }
  }
  return rules.slice(start, i);
}

function allowReadLine(block) {
  const m = block.match(/allow read:\s*if[^;]+;/);
  assert.ok(m, 'missing allow read in:\n' + block.slice(0, 240));
  return m[0].replace(/\s+/g, ' ');
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

const storage = read('storage.rules');
const rootStorage = read(path.join('..', 'storage.rules'));
const html = read('public/communication-v2/index.html');
const v2 = read('public/communication-v2/communication-v2.js');
const attachSrc = read('public/communication-v2/ce2-attachments.js');
const uploadSrc = read('public/js/upload.js');
const pkg = JSON.parse(read('package.json'));
const workflow = read(path.join('..', '.github/workflows/sbd-network-deploy.yml'));

const uploadSandbox = loadIife('public/js/upload.js');
const attachSandbox = loadIife('public/communication-v2/ce2-attachments.js');

console.log('\nCE2 Storage path shape\n');

test('Firebase Storage helper writes folder/convId/uid/file for CE2 sends', function () {
  const pathStr = uploadSandbox.firebaseStorageObjectPath(
    'dm_attachments',
    'uploader1',
    'photo.jpg',
    { conversationId: 'd_alice_bob' }
  );
  assert.strictEqual(pathStr, 'dm_attachments/d_alice_bob/uploader1/photo.jpg');
  assert.ok(uploadSandbox.isConversationScopedFirebaseStoragePath(pathStr));
  assert.ok(!uploadSandbox.isLegacyFirebaseStoragePath(pathStr));

  const videoPath = uploadSandbox.firebaseStorageObjectPath(
    'dm_videos',
    'uploader1',
    'clip.mp4',
    { conversationId: 'groupAbc' }
  );
  assert.strictEqual(videoPath, 'dm_videos/groupAbc/uploader1/clip.mp4');

  const audioPath = uploadSandbox.firebaseStorageObjectPath(
    'dm_audio',
    'uploader1',
    'voice.webm',
    { conversationId: 'd_alice_bob' }
  );
  assert.strictEqual(audioPath, 'dm_audio/d_alice_bob/uploader1/voice.webm');
});

test('CE2 send path is not the legacy {userId}/{fileId} layout', function () {
  const scoped = uploadSandbox.firebaseStorageObjectPath(
    'dm_attachments',
    'u1',
    'f.jpg',
    { conversationId: 'd_a_b' }
  );
  assert.ok(scoped.indexOf('dm_attachments/u1/') < 0);
  assert.ok(scoped.indexOf('dm_attachments/d_a_b/u1/') === 0);

  const r2Key = uploadSandbox.r2ObjectKey('dm_audio', 'voice.webm', {
    conversationId: 'd_a_b',
  });
  assert.strictEqual(r2Key, 'ce2/dm_audio/d_a_b/voice.webm');
  assert.ok(r2Key.indexOf('dm_audio/voice.webm') < 0);
  assert.ok(r2Key.indexOf('ce2/') === 0);
});

test('legacy callers without conversationId still get the two-segment path', function () {
  const legacy = uploadSandbox.firebaseStorageObjectPath(
    'dm_attachments',
    'u1',
    'f.jpg',
    {}
  );
  assert.strictEqual(legacy, 'dm_attachments/u1/f.jpg');
  assert.ok(uploadSandbox.isLegacyFirebaseStoragePath(legacy));
  assert.ok(!uploadSandbox.isConversationScopedFirebaseStoragePath(legacy));
  assert.strictEqual(
    uploadSandbox.scopedUploadFolder('ugc-photos', 'd_a_b'),
    'ugc-photos'
  );
});

test('CE2 attachment client refuses uploads that omit a conversation/group id', function () {
  const att = attachSandbox.Ce2Attachments;
  assert.ok(att.requireConversationId);
  assert.throws(function () {
    att.requireConversationId({});
  }, /conversation/i);
  assert.throws(function () {
    att.requireConversationId({ conversationId: '' });
  }, /conversation/i);
  assert.throws(function () {
    att.requireConversationId({ conversationId: 'not a id' });
  }, /conversation/i);
  assert.strictEqual(
    att.requireConversationId({ conversationId: 'd_alice_bob' }),
    'd_alice_bob'
  );
  assert.ok(attachSrc.indexOf('withConversationScope(options)') >= 0);
  assert.ok(attachSrc.indexOf("uploadToR2(file, folder, withConversationScope(options))") >= 0);
  assert.ok(attachSrc.indexOf('uploadChatThumb(imageThumb, imgBase, scopedOpts)') >= 0);
  assert.ok(attachSrc.indexOf("uploadMediaFile(posterFile, 'dm_attachments', scopedOpts)") >= 0);
});

test('communication-v2 photo, video, and voice sends pass conversationId', function () {
  const voiceBlock = v2.slice(
    v2.indexOf('function runVoiceNoteUpload'),
    v2.indexOf('function runVoiceNoteUpload') + 1800
  );
  const attachBlock = v2.slice(
    v2.indexOf('function processAttachQueue'),
    v2.indexOf('function processAttachQueue') + 2800
  );
  assert.ok(/conversationId:\s*ac\.id/.test(voiceBlock));
  assert.ok(/conversationId:\s*ac\.id/.test(attachBlock));
  assert.ok(voiceBlock.indexOf('uploadCe2Media(file, uploadOpts)') >= 0);
  assert.ok(attachBlock.indexOf('uploadCe2Media(file, uploadOpts)') >= 0);
});

console.log('\nStorage rules — new layout is membership-only\n');

['dm_attachments', 'dm_videos', 'dm_audio'].forEach(function (prefix) {
  test(prefix + ' new layout is not any-auth and requires membership', function () {
    const sig = 'match /' + prefix + '/{scopeId}/{userId}/{fileId} {';
    const block = extractMatchBlock(storage, sig);
    const read = allowReadLine(block);
    assert.ok(
      read.indexOf('request.auth != null;') < 0,
      'new layout still allows any signed-in read: ' + read
    );
    assert.ok(
      /ce2CanAccessMediaScope\(scopeId\)/.test(read),
      'new layout read is not membership-gated: ' + read
    );
    assert.ok(/function ce2CanAccessMediaScope\(scopeId\)/.test(storage));
    assert.ok(
      storage.indexOf(
        'firestore.exists(/databases/(default)/documents/ce2_conversations/$(scopeId))'
      ) >= 0
    );
    assert.ok(
      storage.indexOf(
        'firestore.exists(/databases/(default)/documents/communicationGroups/$(scopeId)/members/$(request.auth.uid))'
      ) >= 0
    );
    assert.ok(/request\.auth\.uid in firestore\.get/.test(storage));
    assert.ok(/ce2IsAdmin\(\)/.test(storage));
    assert.ok(/request\.auth\.uid == userId/.test(block));
  });

  test(prefix + ' legacy layout is uploader/admin only, not any-auth', function () {
    const sig = 'match /' + prefix + '/{userId}/{fileId} {';
    const block = extractMatchBlock(storage, sig);
    const read = allowReadLine(block);
    assert.ok(
      read.indexOf('request.auth != null;') < 0,
      'legacy layout still allows any signed-in read: ' + read
    );
    assert.ok(/request\.auth\.uid == userId/.test(read));
    assert.ok(/ce2IsAdmin\(\)/.test(read));
  });
});

test('root storage.rules keeps the same CE2 membership layout', function () {
  assert.ok(
    rootStorage.indexOf('match /dm_attachments/{scopeId}/{userId}/{fileId} {') >= 0
  );
  const block = extractMatchBlock(
    rootStorage,
    'match /dm_attachments/{scopeId}/{userId}/{fileId} {'
  );
  const read = allowReadLine(block);
  assert.ok(read.indexOf('request.auth != null;') < 0);
  assert.ok(/ce2CanAccessMediaScope\(scopeId\)/.test(read));
});

console.log('\nR2 worker + cache-bust\n');

test('cache-bust moved forward for changed CE2 upload clients', function () {
  const jsVer = html.match(/communication-v2\.js\?v=(\d+)/);
  const attVer = html.match(/ce2-attachments\.js\?v=(\d+)/);
  const upVer = html.match(/upload\.js\?v=(\d+)/);
  assert.ok(jsVer && Number(jsVer[1]) >= 121, 'communication-v2.js cache-bust');
  assert.ok(attVer && Number(attVer[1]) >= 16, 'ce2-attachments.js cache-bust');
  assert.ok(upVer && Number(upVer[1]) >= 11, 'upload.js cache-bust');
  assert.ok(html.indexOf('ce2-keyboard-stable-v60') >= 0);
});

test('SBD GH Actions still omit storage; validate includes this test', function () {
  assert.ok(/storage omitted/.test(workflow));
  assert.ok(workflow.indexOf('ONLY="${ONLY},firestore:rules,firestore:indexes"') >= 0);
  assert.ok(!/ONLY=.*storage/.test(workflow));
  assert.ok(pkg.scripts.validate.indexOf('test-ce2-storage-paths.js') >= 0);
  assert.ok(pkg.scripts.validate.indexOf('test-ce2-r2-signed-media.js') >= 0);
});

async function runAsync() {
  try {
    const { pathToFileURL } = require('url');
    const policyPath = pathToFileURL(
      path.join(ROOT, 'workers/upload-signer/src/upload-policy.js')
    ).href;
    const policy = await import(policyPath);
    test('upload-signer allows conversation-scoped DM folders and rejects traversal', function () {
      assert.strictEqual(policy.isAllowedUploadFolder('dm_attachments'), true);
      assert.strictEqual(
        policy.isAllowedUploadFolder('dm_attachments/d_alice_bob'),
        true
      );
      assert.strictEqual(policy.isAllowedUploadFolder('dm_audio/group123'), true);
      assert.strictEqual(
        policy.isAllowedUploadFolder('dm_attachments/../secrets'),
        false
      );
      assert.strictEqual(policy.isAllowedUploadFolder('not-a-folder/x'), false);
      assert.strictEqual(policy.isAllowedUploadFolder('dm_attachments/a/b'), false);
      const worker = read('workers/upload-signer/src/index.js');
      assert.ok(worker.indexOf('isAllowedUploadFolder(folder)') >= 0);
      assert.ok(worker.indexOf('buildUploadResponse(folder, key') >= 0);
      assert.ok(worker.indexOf("pathname === '/sign-get'") >= 0);
      assert.ok(worker.indexOf("pathname === '/media'") >= 0);
      assert.ok(
        worker.indexOf('return respond({ publicUrl: `${env.R2_PUBLIC_URL}/${key}` })') < 0,
        'Worker still returns a public CDN URL for every upload, including CE2'
      );
    });
  } catch (err) {
    failed += 1;
    console.error('  FAIL  upload-signer folder policy');
    console.error('       ' + (err && err.stack ? err.stack.split('\n')[0] : err));
  }

  if (failed) {
    console.error('\n' + failed + ' test(s) failed\n');
    process.exit(1);
  }
  console.log('\n✅ CE2 storage path tests passed\n');
}

runAsync();
