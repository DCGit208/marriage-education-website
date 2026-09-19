/**
 * Unit tests for CE2 board-share → messenger return links.
 * Usage: node scripts/test-ce2-board-return.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');

function loadShare() {
  const code = fs.readFileSync(
    path.join(ROOT, 'public/communication-v2/ce2-share.js'),
    'utf8'
  );
  const sandbox = {
    console: console,
    URL: URL,
    URLSearchParams: URLSearchParams,
    Date: Date,
    Math: Math,
    Object: Object,
    Array: Array,
    String: String,
    encodeURIComponent: encodeURIComponent,
    location: { origin: 'https://sbd.marriageducation.com' },
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'ce2-share.js' });
  assert.ok(sandbox.Ce2Share, 'Ce2Share did not load');
  return sandbox.Ce2Share;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
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

const share = loadShare();

console.log('\nCE2 board → messenger return\n');

test('shareHref stays a clean board URL (no from/conv)', function () {
  const href = share.shareHref('board-1', 'post-2', 'bs_token');
  const u = new URL(href);
  assert.strictEqual(u.searchParams.get('boardId'), 'board-1');
  assert.strictEqual(u.searchParams.get('post'), 'post-2');
  assert.strictEqual(u.searchParams.get('ce2token'), 'bs_token');
  assert.strictEqual(u.searchParams.get('from'), null);
  assert.strictEqual(u.searchParams.get('conv'), null);
});

test('withMessengerReturn tags a direct conversation', function () {
  const href = share.withMessengerReturn(
    share.shareHref('b1', 'p1', ''),
    { type: 'direct', id: 'd_aaa_bbb' }
  );
  const u = new URL(href);
  assert.strictEqual(u.searchParams.get('from'), 'ce2');
  assert.strictEqual(u.searchParams.get('conv'), 'd_aaa_bbb');
  assert.strictEqual(u.searchParams.get('group'), null);
});

test('withMessengerReturn tags a group conversation', function () {
  const href = share.withMessengerReturn(
    'https://sbd.marriageducation.com/board.html?boardId=b1&post=p1',
    { type: 'group', id: 'formation-circle-1' }
  );
  const u = new URL(href);
  assert.strictEqual(u.searchParams.get('from'), 'ce2');
  assert.strictEqual(u.searchParams.get('group'), 'formation-circle-1');
  assert.strictEqual(u.searchParams.get('conv'), null);
});

test('withMessengerReturn(null) leaves the href unchanged', function () {
  const raw = share.shareHref('b1', 'p1', 'tok');
  assert.strictEqual(share.withMessengerReturn(raw, null), raw);
});

test('messengerReturnHref restores CE2 conv deep-link', function () {
  assert.strictEqual(
    share.messengerReturnHref({ from: 'ce2', conv: 'd_aaa_bbb' }),
    '/communication-v2/?conv=d_aaa_bbb'
  );
});

test('messengerReturnHref restores CE2 group deep-link', function () {
  assert.strictEqual(
    share.messengerReturnHref({ type: 'group', id: 'g1' }),
    '/communication-v2/?group=g1'
  );
});

test('messengerReturnHref falls back to messenger hub', function () {
  assert.strictEqual(share.messengerReturnHref({ from: 'ce2' }), '/communication-v2/');
  assert.strictEqual(share.messengerReturnHref(null), '/communication-v2/');
});

test('unsafe ids are stripped (no open-redirect / query injection)', function () {
  const href = share.messengerReturnHref({
    from: 'ce2',
    conv: 'https://evil.example/phish',
  });
  assert.strictEqual(href, '/communication-v2/');
  const tagged = share.withMessengerReturn(share.shareHref('b', 'p', ''), {
    conv: '../../other',
  });
  const u = new URL(tagged);
  assert.strictEqual(u.searchParams.get('from'), 'ce2');
  assert.strictEqual(u.searchParams.get('conv'), null);
});

test('parseMessengerReturnFromSearch requires from=ce2', function () {
  assert.strictEqual(
    share.parseMessengerReturnFromSearch('boardId=b&post=p&conv=d_aaa_bbb'),
    null
  );
  const parsed = share.parseMessengerReturnFromSearch(
    'boardId=b&post=p&from=ce2&conv=d_aaa_bbb'
  );
  assert.ok(parsed);
  assert.strictEqual(parsed.from, 'ce2');
  assert.strictEqual(parsed.conv, 'd_aaa_bbb');
  assert.strictEqual(parsed.group, '');
});

test('renderBoardShareHtml Open post href includes messenger return', function () {
  const html = share.renderBoardShareHtml(
    {
      boardShare: {
        boardId: 'b1',
        postId: 'p1',
        token: 'tok',
        title: 'Hello',
        url: 'https://sbd.marriageducation.com/board.html?boardId=b1&post=p1&ce2token=tok',
      },
    },
    escapeHtml,
    { type: 'direct', id: 'd_uid1_uid2' }
  );
  assert.ok(/<div class="ce2-board-share">/.test(html));
  assert.ok(/<a class="ce2-board-share-body" href="/.test(html));
  assert.ok(!/<a class="ce2-board-share"/.test(html));
  assert.ok(html.indexOf('from=ce2') !== -1);
  assert.ok(html.indexOf('conv=d_uid1_uid2') !== -1);
  assert.ok(html.indexOf('Open post') !== -1);
  assert.ok(!/Open post\s*→/.test(html), 'CTA must not use a raw arrow');
});

test('renderBoardShareHtml still tags from=ce2 without a thread id', function () {
  const html = share.renderBoardShareHtml(
    { boardShare: { boardId: 'b1', postId: 'p1', title: 'Hello' } },
    escapeHtml
  );
  assert.ok(html.indexOf('from=ce2') !== -1);
  assert.ok(html.indexOf('conv=') === -1);
});

test('board page template includes a hidden Back to messenger control', function () {
  const src = fs.readFileSync(path.join(ROOT, 'src/pages/board.html'), 'utf8');
  const pub = fs.readFileSync(path.join(ROOT, 'public/board.html'), 'utf8');
  [src, pub].forEach(function (html) {
    assert.ok(html.indexOf('id="messengerReturnBar"') !== -1);
    assert.ok(html.indexOf('Back to messenger') !== -1);
    assert.ok(html.indexOf('messenger-return-bar') !== -1);
  });
});

test('messenger return control is position:fixed (not sticky)', function () {
  const css = fs.readFileSync(path.join(ROOT, 'public/css/board-media.css'), 'utf8');
  const block = css.match(/\.messenger-return-bar\s*\{[^}]+\}/);
  assert.ok(block, 'expected .messenger-return-bar rule');
  assert.ok(/position:\s*fixed/.test(block[0]), 'Back to messenger must stay on-screen while scrolling');
  assert.ok(!/position:\s*sticky/.test(block[0]));
  assert.ok(/bottom:\s*calc\(76px/.test(block[0]), 'chip sits above the bottom nav / safe area');
});

test('board cache-bust for board-media.css is above live', function () {
  const src = fs.readFileSync(path.join(ROOT, 'src/pages/board.html'), 'utf8');
  const pub = fs.readFileSync(path.join(ROOT, 'public/board.html'), 'utf8');
  assert.ok(/board-media\.css\?v=66/.test(src));
  const pubVer = pub.match(/board-media\.css\?v=(\d+)/);
  assert.ok(pubVer, 'public board.html must version board-media.css');
  assert.ok(Number(pubVer[1]) > 1789602190001, 'public CSS cache-bust must be above live v=1789602190001');
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed\n');
  process.exit(1);
}
console.log('\n✅ CE2 board return tests passed\n');
