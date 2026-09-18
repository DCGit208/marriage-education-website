/**
 * CE2 R2 media is membership-gated via signed Worker URLs, not a public CDN.
 * Usage: node scripts/test-ce2-r2-signed-media.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { pathToFileURL } = require('url');

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
      fetch: function () {
        return Promise.reject(new Error('fetch not stubbed'));
      },
      getCurrentUser: function () {
        return {
          uid: 'u1',
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
const mediaSrc = read('public/communication-v2/ce2-media-view.js');
const audioSrc = read('public/communication-v2/ce2-audio-playback.js');
const v2Src = read('public/communication-v2/communication-v2.js');
const actionsSrc = read('public/communication-v2/ce2-message-actions.js');
const wrangler = read('workers/upload-signer/wrangler.toml');
const pkg = JSON.parse(read('package.json'));

console.log('\nCE2 R2 signed media\n');

test('cache-bust moved forward for changed CE2 media clients', function () {
  const jsVer = html.match(/communication-v2\.js\?v=(\d+)/);
  const upVer = html.match(/upload\.js\?v=(\d+)/);
  const mediaVer = html.match(/ce2-media-view\.js\?v=(\d+)/);
  const audioVer = html.match(/ce2-audio-playback\.js\?v=(\d+)/);
  const actionsVer = html.match(/ce2-message-actions\.js\?v=(\d+)/);
  assert.ok(jsVer && Number(jsVer[1]) >= 121, 'communication-v2.js cache-bust');
  assert.ok(upVer && Number(upVer[1]) >= 11, 'upload.js cache-bust');
  assert.ok(mediaVer && Number(mediaVer[1]) >= 4, 'ce2-media-view.js cache-bust');
  assert.ok(audioVer && Number(audioVer[1]) >= 3, 'ce2-audio-playback.js cache-bust');
  assert.ok(actionsVer && Number(actionsVer[1]) >= 25, 'ce2-message-actions.js cache-bust');
  assert.ok(html.indexOf('ce2-keyboard-stable-v60') >= 0);
});

test('clients resolve CE2 R2 locators instead of treating them as permanent public URLs', function () {
  assert.ok(uploadSrc.indexOf('function resolveR2MediaUrl') >= 0);
  assert.ok(uploadSrc.indexOf('function isCe2PrivateMediaLocator') >= 0);
  assert.ok(uploadSrc.indexOf('/sign-get') >= 0);
  assert.ok(uploadSrc.indexOf('ce2UploadLocator') >= 0);
  assert.ok(
    uploadSrc.indexOf('resolve(data.publicUrl)') < 0,
    'upload XHR still stores publicUrl for every R2 upload'
  );
  assert.ok(mediaSrc.indexOf('resolveR2MediaUrl') >= 0);
  assert.ok(mediaSrc.indexOf('assignMediaSrc') >= 0);
  assert.ok(
    mediaSrc.indexOf('img.src = full') < 0 && mediaSrc.indexOf('img.src = stored') < 0,
    'media view still assigns the stored URL as a permanent public src'
  );
  assert.ok(audioSrc.indexOf('resolveR2MediaUrl') >= 0);
  assert.ok(audioSrc.indexOf('resolvePlayUrl') >= 0);
  assert.ok(v2Src.indexOf('resolveR2MediaUrl(playSrc)') >= 0);
  assert.ok(actionsSrc.indexOf('resolveR2MediaUrl') >= 0);
});

test('Worker has an auth-gated read path and a private CE2 bucket binding', function () {
  assert.ok(workerSrc.indexOf("pathname === '/sign-get'") >= 0);
  assert.ok(workerSrc.indexOf('uidCanAccessCe2ScopeCached') >= 0);
  assert.ok(workerSrc.indexOf('serveSignedMedia') >= 0);
  assert.ok(workerSrc.indexOf('ce2PrivateObjectKey') >= 0);
  assert.ok(workerSrc.indexOf('buildUploadResponse') >= 0);
  assert.ok(
    workerSrc.indexOf('return respond({ publicUrl: `${env.R2_PUBLIC_URL}/${key}` })') < 0,
    'Worker still returns a world-readable publicUrl for uploads including CE2'
  );
  assert.ok(/binding\s*=\s*"CE2_BUCKET"/.test(wrangler));
  assert.ok(wrangler.indexOf('sbd-media-ce2') >= 0);
  assert.ok(pkg.scripts.validate.indexOf('test-ce2-r2-signed-media.js') >= 0);
});

const uploadSandbox = loadIife('public/js/upload.js');

test('private CE2 locators are detected; public CDN leftovers are not', function () {
  const locator =
    'https://sbd-upload-signer.sbdnetwork.workers.dev/media?key=ce2%2Fdm_audio%2Fd_alice_bob%2Fvoice.webm';
  assert.ok(uploadSandbox.isCe2PrivateMediaLocator(locator));
  assert.ok(uploadSandbox.isCe2PrivateObjectKey('ce2/dm_audio/d_alice_bob/voice.webm'));
  assert.ok(
    !uploadSandbox.isCe2PrivateMediaLocator(
      'https://pub-6524d7976da94b11bb645c445abecb63.r2.dev/dm_audio/d_alice_bob/voice.webm'
    ),
    'legacy public CDN URLs must remain residual passthrough, not signed as new private keys'
  );
  assert.ok(
    !uploadSandbox.isCe2PrivateMediaLocator(
      'https://firebasestorage.googleapis.com/v0/b/x/o/dm_audio%2Ffile'
    )
  );
});

test('CE2 upload locator rejects a world-readable publicUrl', function () {
  const publicOnly = uploadSandbox.ce2UploadLocator(
    { publicUrl: 'https://pub-6524d7976da94b11bb645c445abecb63.r2.dev/ce2/dm_audio/d_a_b/f.webm' },
    'dm_audio',
    { conversationId: 'd_a_b' }
  );
  assert.strictEqual(publicOnly, '', 'must not persist a public CDN URL for new CE2 media');

  const ok = uploadSandbox.ce2UploadLocator(
    {
      objectKey: 'ce2/dm_audio/d_a_b/f.webm',
      url: 'https://sbd-upload-signer.sbdnetwork.workers.dev/media?key=ce2%2Fdm_audio%2Fd_a_b%2Ff.webm',
    },
    'dm_audio',
    { conversationId: 'd_a_b' }
  );
  assert.ok(ok.indexOf('sbd-upload-signer') >= 0);
  assert.ok(ok.indexOf('r2.dev') < 0);

  const ugc = uploadSandbox.ce2UploadLocator(
    { publicUrl: 'https://pub-6524d7976da94b11bb645c445abecb63.r2.dev/ugc-photos/pic.jpg' },
    'ugc-photos',
    {}
  );
  assert.ok(/ugc-photos\/pic\.jpg/.test(ugc));
});

test('r2ObjectKey for CE2 sends uses the private prefix', function () {
  assert.strictEqual(
    uploadSandbox.r2ObjectKey('dm_attachments', 'photo.jpg', { conversationId: 'd_a_b' }),
    'ce2/dm_attachments/d_a_b/photo.jpg'
  );
  assert.strictEqual(
    uploadSandbox.r2ObjectKey('ugc-photos', 'pic.jpg', {}),
    'ugc-photos/pic.jpg'
  );
});

test('media view does not set img.src to a private locator without resolving', function () {
  const calls = [];
  const created = [];
  function el(tag) {
    const node = {
      tagName: String(tag).toUpperCase(),
      className: '',
      childNodes: [],
      attributes: {},
      src: '',
      classList: {
        _s: new Set(),
        contains: function (c) { return this._s.has(c); },
        add: function (c) { this._s.add(c); node.className = Array.from(this._s).join(' '); },
        remove: function (c) { this._s.delete(c); node.className = Array.from(this._s).join(' '); },
      },
      setAttribute: function (k, v) { this.attributes[k] = String(v); },
      getAttribute: function (k) {
        return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
      },
      appendChild: function (c) { this.childNodes.push(c); return c; },
      querySelector: function () { return this.childNodes[0] || null; },
      addEventListener: function () {},
    };
    created.push(node);
    return node;
  }
  const sandbox = loadIife('public/communication-v2/ce2-media-view.js', {
    document: { createElement: el },
    isCe2PrivateMediaLocator: function (url) {
      return String(url).indexOf('/media?key=') >= 0;
    },
    resolveR2MediaUrl: function (url) {
      calls.push(url);
      return Promise.resolve('https://signed.example/play');
    },
  });
  const bubble = el('div');
  const locator =
    'https://sbd-upload-signer.sbdnetwork.workers.dev/media?key=ce2%2Fdm_attachments%2Fd_a_b%2Fphoto.jpg';
  sandbox.Ce2MediaView.appendChatImage(bubble, {
    imageUrl: locator,
    imageThumbUrl: locator,
  });
  const img = created.find(function (n) {
    return n.className.indexOf('ce2-media-thumb') >= 0;
  });
  assert.ok(img, 'expected thumb img');
  assert.strictEqual(img.src, '', 'must not use the unsigned Worker locator as img.src');
  assert.ok(calls.indexOf(locator) >= 0, 'must resolve via sign-get path');
});

(async function run() {
  const policy = await import(
    pathToFileURL(path.join(ROOT, 'workers/upload-signer/src/upload-policy.js')).href
  );
  const sign = await import(
    pathToFileURL(path.join(ROOT, 'workers/upload-signer/src/ce2-media-sign.js')).href
  );
  const access = await import(
    pathToFileURL(path.join(ROOT, 'workers/upload-signer/src/ce2-media-access.js')).href
  );

  await testAsync('Worker upload response for CE2 has no publicUrl', async function () {
    const privateBody = policy.buildUploadResponse(
      'dm_audio/d_alice_bob',
      'ce2/dm_audio/d_alice_bob/voice.webm',
      { workerOrigin: 'https://sbd-upload-signer.sbdnetwork.workers.dev', publicBase: 'https://pub-x.r2.dev' }
    );
    assert.ok(!privateBody.publicUrl, 'CE2 upload must not return publicUrl');
    assert.ok(!policy.uploadResponseHasPublicCdn(privateBody));
    assert.strictEqual(privateBody.objectKey, 'ce2/dm_audio/d_alice_bob/voice.webm');
    assert.ok(privateBody.url.indexOf('/media?key=') >= 0);
    assert.ok(privateBody.url.indexOf('r2.dev') < 0);

    const publicBody = policy.buildUploadResponse('ugc-photos', 'ugc-photos/pic.jpg', {
      publicBase: 'https://pub-x.r2.dev',
      workerOrigin: 'https://sbd-upload-signer.sbdnetwork.workers.dev',
    });
    assert.strictEqual(publicBody.publicUrl, 'https://pub-x.r2.dev/ugc-photos/pic.jpg');
    assert.ok(!publicBody.objectKey);
  });

  await testAsync('private prefix parse rejects traversal and public folders', async function () {
    assert.ok(policy.isCe2PrivateUploadFolder('dm_attachments/d_alice_bob'));
    assert.ok(!policy.isCe2PrivateUploadFolder('dm_attachments'));
    assert.ok(!policy.isCe2PrivateUploadFolder('ugc-photos'));
    assert.strictEqual(
      policy.ce2PrivateObjectKey('dm_videos/g1', 'clip.mp4'),
      'ce2/dm_videos/g1/clip.mp4'
    );
    assert.ok(!policy.parseCe2PrivateObjectKey('ce2/dm_attachments/../secrets/x'));
    assert.ok(!policy.parseCe2PrivateObjectKey('ugc-photos/pic.jpg'));
    assert.ok(!policy.parseCe2PrivateObjectKey('dm_audio/d_a_b/voice.webm'));
  });

  await testAsync('HMAC GET signatures expire and do not verify with the wrong key', async function () {
    const secret = 'test-media-secret';
    const key = 'ce2/dm_audio/d_a_b/voice.webm';
    const exp = sign.mediaExpiryUnix(Date.now(), 600);
    const sig = await sign.signMediaKey(secret, key, exp);
    assert.ok(await sign.verifyMediaSig(secret, key, exp, sig));
    assert.ok(!(await sign.verifyMediaSig('other', key, exp, sig)));
    assert.ok(!sign.isMediaExpiryValid(Math.floor(Date.now() / 1000) - 120, Date.now(), 30));
    assert.ok(sign.isMediaExpiryValid(exp, Date.now(), 30));
  });

  await testAsync('membership allows DM participants and group members, not strangers', async function () {
    access.resetCe2MembershipCache();
    const docs = {
      'users/alice': { fields: { role: { stringValue: 'member' } } },
      'ce2_conversations/d_alice_bob': {
        fields: {
          participantIds: {
            arrayValue: {
              values: [{ stringValue: 'alice' }, { stringValue: 'bob' }],
            },
          },
        },
      },
      'communicationGroups/g1/members/alice': { fields: { uid: { stringValue: 'alice' } } },
    };
    function fakeFetch(url) {
      const path = decodeURIComponent(String(url).split('/documents/')[1] || '').split('?')[0];
      const body = docs[path];
      return Promise.resolve({
        ok: !!body,
        json: async function () {
          return body || { error: { code: 404 } };
        },
      });
    }
    const deps = { fetchImpl: fakeFetch, accessToken: 'tok' };
    assert.strictEqual(await access.uidCanAccessCe2Scope('alice', 'd_alice_bob', deps), true);
    assert.strictEqual(await access.uidCanAccessCe2Scope('eve', 'd_alice_bob', deps), false);
    assert.strictEqual(await access.uidCanAccessCe2Scope('alice', 'g1', deps), true);
    assert.strictEqual(await access.uidCanAccessCe2Scope('eve', 'g1', deps), false);
  });

  await testAsync('resolveR2MediaUrl calls /sign-get for private locators only', async function () {
    let called = null;
    const sandbox = loadIife('public/js/upload.js', {
      fetch: function (url, opts) {
        called = { url: String(url), opts: opts };
        return Promise.resolve({
          ok: true,
          json: async function () {
            return {
              signedUrl: 'https://sbd-upload-signer.sbdnetwork.workers.dev/media?key=ce2%2Fdm_audio%2Fd_a_b%2Ff.webm&exp=1&sig=abc',
              expiresAt: Math.floor(Date.now() / 1000) + 600,
            };
          },
        });
      },
    });
    const publicUrl =
      'https://pub-6524d7976da94b11bb645c445abecb63.r2.dev/dm_audio/old.webm';
    const passed = await sandbox.resolveR2MediaUrl(publicUrl);
    assert.strictEqual(passed, publicUrl);
    assert.strictEqual(called, null);

    const locator =
      'https://sbd-upload-signer.sbdnetwork.workers.dev/media?key=ce2%2Fdm_audio%2Fd_a_b%2Ff.webm';
    const signed = await sandbox.resolveR2MediaUrl(locator);
    assert.ok(called && called.url.indexOf('/sign-get') >= 0);
    assert.ok(JSON.parse(called.opts.body).key.indexOf('ce2/dm_audio') === 0);
    assert.ok(signed.indexOf('sig=') >= 0);
  });

  if (failed) {
    console.error('\n' + failed + ' test(s) failed\n');
    process.exit(1);
  }
  console.log('\n✅ CE2 R2 signed media tests passed\n');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
