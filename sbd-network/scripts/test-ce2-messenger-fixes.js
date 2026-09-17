/**
 * Unit tests for CE2 recorder + Elite messaging-tier fixes.
 * Usage: node scripts/test-ce2-messenger-fixes.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const perms = require(path.join(ROOT, 'functions/messaging/permissions.js'));

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
      navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' },
      MediaRecorder: {
        isTypeSupported: function (mime) {
          return mime === 'audio/mp4' || mime.indexOf('audio/webm') === 0;
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

function futureEnd(days) {
  return { seconds: Math.floor(Date.now() / 1000) + days * 86400 };
}

function pastEnd(days) {
  return { seconds: Math.floor(Date.now() / 1000) - days * 86400 };
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

console.log('\nCE2 Elite messaging tier\n');
const govSandbox = loadIife('public/communication-v2/ce2-governance.js');
const gov = govSandbox.Ce2Governance;
assert.ok(gov, 'Ce2Governance did not load');

test('active Elite subscription raises stale premium users.tier', function () {
  const tier = gov.resolveMessagingTier({
    tier: 'premium',
    subscription: { status: 'active', tier: 'elite', endDate: futureEnd(30) },
  });
  assert.strictEqual(tier, 'elite');
  assert.strictEqual(gov.tierRank(tier), 2);
});

test('active Elite subscription is visible to Elite classification', function () {
  const tier = gov.resolveMessagingTier({
    tier: 'foundation',
    subscription: { status: 'active', tier: 'elite', endDate: futureEnd(30) },
  });
  assert.ok(gov.tierRank(tier) >= gov.classRank('elite'));
});

test('expired Elite subscription does not raise rank', function () {
  const tier = gov.resolveMessagingTier({
    tier: 'premium',
    subscription: { status: 'active', tier: 'elite', endDate: pastEnd(2) },
  });
  assert.strictEqual(tier, 'premium');
});

test('cancelled Elite subscription does not raise rank', function () {
  const tier = gov.resolveMessagingTier({
    tier: 'premium',
    subscription: { status: 'cancelled', tier: 'elite', endDate: futureEnd(10) },
  });
  assert.strictEqual(tier, 'premium');
});

test('ambassador rank is not lowered by Elite billing', function () {
  const tier = gov.resolveMessagingTier({
    tier: 'ambassador',
    subscription: { status: 'active', tier: 'elite', endDate: futureEnd(30) },
  });
  assert.strictEqual(tier, 'ambassador');
});

test('senior_ambassador is not treated as Elite billing', function () {
  const tier = gov.resolveMessagingTier({
    tier: 'senior_ambassador',
    subscription: { status: 'active', tier: 'premium', endDate: futureEnd(30) },
  });
  assert.strictEqual(tier, 'senior_ambassador');
  assert.ok(gov.tierRank(tier) > gov.tierRank('elite'));
});

test('raw formation-progress tierLevel does not collapse Elite floor', function () {
  const floor = gov.calculateConversationSecurityLevel([
    { tier: 'elite', tierLevel: 0 },
    { tier: 'elite', tierLevel: 47 },
  ]);
  assert.strictEqual(floor.tier, 'elite');
  assert.strictEqual(floor.level, 2);
});

test('permissions.js matches client Elite billing resolution', function () {
  const user = perms.userFromDoc('abc', {
    tier: 'premium',
    subscription: { status: 'active', tier: 'elite', endDate: futureEnd(30) },
  });
  assert.strictEqual(user.tier, 'elite');
  assert.strictEqual(user.tierLevel, 2);
});

test('permissions.js ignores raw tierLevel progress for security floor', function () {
  const elite = perms.userFromDoc('a', {
    tier: 'premium',
    tierLevel: 0,
    subscription: { status: 'active', tier: 'elite', endDate: futureEnd(30) },
  });
  const other = perms.userFromDoc('b', { tier: 'elite' });
  const floor = perms.calculateConversationSecurityLevel([elite, other]);
  assert.strictEqual(floor.tier, 'elite');
  assert.strictEqual(floor.level, 2);
});

test('lower-tier member can still message an Elite peer downward? no — Elite is higher', function () {
  const premium = perms.userFromDoc('p', { tier: 'premium' });
  const elite = perms.userFromDoc('e', {
    tier: 'premium',
    subscription: { status: 'active', tier: 'elite', endDate: futureEnd(30) },
  });
  assert.strictEqual(perms.canDiscoverUser(premium, elite), false);
  assert.strictEqual(perms.canDiscoverUser(elite, premium), true);
});

console.log('\nCE2 audio recorder helpers\n');
const recSandbox = loadIife('public/communication-v2/ce2-audio-recorder.js');
const rec = recSandbox.Ce2AudioRecorder;
assert.ok(rec, 'Ce2AudioRecorder did not load');

test('Chromium prefers webm even when mp4 isTypeSupported', function () {
  recSandbox.navigator.userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  recSandbox.MediaRecorder.isTypeSupported = function (mime) {
    return mime === 'audio/mp4' || mime.indexOf('audio/webm') === 0;
  };
  assert.strictEqual(rec.isAppleCapture(), false);
  assert.strictEqual(rec.pickMime(), 'audio/webm;codecs=opus');
});

test('iPhone Safari prefers audio/mp4', function () {
  recSandbox.navigator.userAgent =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  recSandbox.MediaRecorder.isTypeSupported = function (mime) {
    return mime === 'audio/mp4' || mime.indexOf('audio/webm') === 0;
  };
  assert.strictEqual(rec.isAppleCapture(), true);
  assert.strictEqual(rec.pickMime(), 'audio/mp4');
});

test('mic denial maps to a readable error', function () {
  const msg = rec.microphoneErrorMessage({ name: 'NotAllowedError', message: 'Denied' });
  assert.ok(/Microphone access was blocked/.test(msg));
});

test('containerMime strips codec params for the uploaded File type', function () {
  assert.strictEqual(rec.containerMime('audio/webm;codecs=opus'), 'audio/webm');
  assert.strictEqual(rec.containerMime('audio/mp4;codecs=mp4a.40.2'), 'audio/mp4');
  assert.strictEqual(rec.containerMime('video/webm'), 'audio/webm');
  assert.strictEqual(rec.containerMime(''), 'audio/webm');
});

console.log('\nBoard-share thumbnail reply markup\n');

const shareSandbox = loadIife('public/communication-v2/ce2-share.js', {
  location: { origin: 'https://sbd-network.web.app' },
});
const share = shareSandbox.Ce2Share;
assert.ok(share, 'Ce2Share did not load');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

test('OG thumbnail is a reply button outside the open-post link', function () {
  const html = share.renderBoardShareHtml(
    {
      content: 'Shared a board post',
      boardShare: {
        boardId: 'b1',
        postId: 'p1',
        token: 'tok',
        url: 'https://sbd-network.web.app/board.html?boardId=b1&post=p1',
        title: 'Formation post',
        excerpt: 'Excerpt text',
        thumbnailUrl: 'https://cdn.example/thumb.jpg',
      },
    },
    escapeHtml
  );
  assert.ok(/<button type="button" class="ce2-board-share-thumb"/.test(html));
  assert.ok(/aria-label="Reply to this message"/.test(html));
  assert.ok(/<a class="ce2-board-share-body" href="https:\/\/sbd-network\.web\.app\/board\.html\?boardId=b1&amp;post=p1"/.test(html) ||
    /<a class="ce2-board-share-body" href="https:\/\/sbd-network\.web\.app\/board\.html\?boardId=b1&post=p1"/.test(html));
  const thumbIdx = html.indexOf('ce2-board-share-thumb');
  const linkIdx = html.indexOf('ce2-board-share-body');
  const thumbClose = html.indexOf('</button>', thumbIdx);
  assert.ok(thumbIdx >= 0 && linkIdx > thumbClose, 'thumbnail button must close before the open-post <a>');
  assert.ok(!/<a class="ce2-board-share"/.test(html));
  assert.ok(html.indexOf('Open post') > linkIdx);
});

test('board share without a thumbnail still opens via the body link', function () {
  const html = share.renderBoardShareHtml(
    {
      boardShare: {
        boardId: 'b1',
        postId: 'p1',
        url: 'https://sbd-network.web.app/board.html?boardId=b1&post=p1',
        title: 'No media',
      },
    },
    escapeHtml
  );
  assert.ok(!/ce2-board-share-thumb/.test(html));
  assert.ok(/<a class="ce2-board-share-body" href="/.test(html));
});

console.log('\nVoice upload MIME + CORS policy\n');

function loadUploadJs() {
  const sandbox = {
    console: console,
    getCurrentUser: function () { return { uid: 'u1', getIdToken: async function () { return 't'; } }; },
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'public/js/upload.js'), 'utf8'),
    sandbox,
    { filename: 'upload.js' }
  );
  return sandbox;
}

const uploadSandbox = loadUploadJs();

test('strips MediaRecorder codec params so the R2 worker allow-list matches', function () {
  const type = uploadSandbox.detectUploadContentType({
    type: 'audio/webm;codecs=opus',
    name: 'voice-1.webm',
  });
  assert.strictEqual(type, 'audio/webm');
});

test('maps m4a recordings to audio/mp4', function () {
  const type = uploadSandbox.detectUploadContentType({
    type: 'audio/mp4',
    name: 'voice-1.m4a',
  });
  assert.strictEqual(type, 'audio/mp4');
});

test('empty-type .webm in dm_audio is audio/webm not video/webm', function () {
  assert.strictEqual(
    uploadSandbox.detectUploadContentType({ type: '', name: 'voice-1.webm' }, 'dm_audio'),
    'audio/webm'
  );
  assert.strictEqual(
    uploadSandbox.detectUploadContentType({ type: 'video/webm', name: 'voice-1.webm' }, 'dm_audio'),
    'audio/webm'
  );
  assert.strictEqual(
    uploadSandbox.detectUploadContentType({ type: '', name: 'clip.webm' }, 'dm_videos'),
    'video/webm'
  );
});

test('empty recordings are rejected before the worker call', function () {
  assert.throws(
    function () {
      uploadSandbox.assertUploadableFile({ size: 0, name: 'voice-1.webm', type: 'audio/webm' });
    },
    /empty/i
  );
  uploadSandbox.assertUploadableFile({ size: 1200, name: 'voice-1.webm', type: 'audio/webm' });
});

test('CORS network errors fall back to Firebase Storage', function () {
  assert.strictEqual(
    uploadSandbox.canFallbackToFirebaseStorage(new Error('Upload failed — network error')),
    true
  );
  assert.strictEqual(
    uploadSandbox.canFallbackToFirebaseStorage(new Error('Content type not allowed')),
    true
  );
  assert.strictEqual(
    uploadSandbox.canFallbackToFirebaseStorage(new Error('Not authenticated')),
    false
  );
});

async function runPolicyTests() {
  const { pathToFileURL } = require('url');
  const policyPath = pathToFileURL(
    path.join(ROOT, 'workers/upload-signer/src/upload-policy.js')
  ).href;
  const policy = await import(policyPath);

  test('sbd.marriageducation.com is a trusted upload origin', function () {
    assert.strictEqual(
      policy.isTrustedUploadOrigin('https://sbd.marriageducation.com', ''),
      true
    );
  });

  test('unlisted origins are not trusted', function () {
    assert.strictEqual(
      policy.isTrustedUploadOrigin('https://evil.example', ''),
      false
    );
  });

  test('worker strips codec params from Content-Type', function () {
    assert.strictEqual(
      policy.stripContentTypeParams('audio/webm;codecs=opus'),
      'audio/webm'
    );
    assert.strictEqual(
      policy.stripContentTypeParams('audio/mp4;codecs=mp4a.40.2'),
      'audio/mp4'
    );
  });
}

runPolicyTests()
  .then(function () {
    if (failed) {
      console.error('\n' + failed + ' test(s) failed\n');
      process.exit(1);
    }
    console.log('\n✅ CE2 messenger fix tests passed\n');
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });

