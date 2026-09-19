/**
 * Unit tests for sharing a board / formation moment into a CE2 thread
 * and returning to that conversation from the board.
 * Usage: node scripts/test-ce2-formation-share.js
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

function loadShare(extra) {
  const code = read('public/communication-v2/ce2-share.js');
  const store = {};
  const sandbox = Object.assign(
    {
      console: console,
      URL: URL,
      URLSearchParams: URLSearchParams,
      Date: Date,
      Math: Math,
      Object: Object,
      Array: Array,
      String: String,
      JSON: JSON,
      encodeURIComponent: encodeURIComponent,
      location: { origin: 'https://sbd.marriageducation.com' },
      sessionStorage: {
        getItem: function (k) {
          return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
        },
        setItem: function (k, v) {
          store[k] = String(v);
        },
        removeItem: function (k) {
          delete store[k];
        },
      },
    },
    extra || {}
  );
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  sandbox._store = store;
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

console.log('\nCE2 formation / board moment → thread\n');

test('Ce2Share VERSION is 5', function () {
  assert.strictEqual(share.VERSION, 5);
});

test('buildBoardSharePayload is a card payload, not a raw URL dump', function () {
  const payload = share.buildBoardSharePayload({
    boardId: 'b1',
    postId: 'p1',
    token: 'bs_tok',
    title: 'Sabbath rest',
    excerpt: 'A formation note from the board.',
    note: 'Worth reading together',
    thumbnailUrl: 'https://cdn.example/t.jpg',
    mediaType: 'image',
  });
  assert.strictEqual(payload.boardId, 'b1');
  assert.strictEqual(payload.postId, 'p1');
  assert.strictEqual(payload.token, 'bs_tok');
  assert.strictEqual(payload.title, 'Sabbath rest');
  assert.strictEqual(payload.excerpt, 'A formation note from the board.');
  assert.strictEqual(payload.note, 'Worth reading together');
  assert.strictEqual(payload.thumbnailUrl, 'https://cdn.example/t.jpg');
  assert.strictEqual(payload.mediaType, 'image');
  assert.ok(payload.url.indexOf('boardId=b1') !== -1);
  assert.ok(payload.url.indexOf('post=p1') !== -1);
  assert.ok(payload.url.indexOf('ce2token=bs_tok') !== -1);
  assert.strictEqual(new URL(payload.url).searchParams.get('from'), null);
  assert.ok(share.isValidBoardSharePayload(payload));
});

test('buildBoardSharePayload always includes a token string for rules', function () {
  const payload = share.buildBoardSharePayload({ boardId: 'b', postId: 'p' });
  assert.strictEqual(payload.token, '');
  assert.ok(share.isValidBoardSharePayload(payload));
  assert.strictEqual(share.isValidBoardSharePayload({ boardId: 'b', postId: 'p' }), false);
});

test('shareContentFromNote falls back to Shared a board post', function () {
  assert.strictEqual(share.shareContentFromNote('  hello  '), 'hello');
  assert.strictEqual(share.shareContentFromNote(''), share.DEFAULT_SHARE_CONTENT);
  assert.strictEqual(share.DEFAULT_SHARE_CONTENT, 'Shared a board post');
});

test('card render stays a board-share card with Open post + return params', function () {
  const payload = share.buildBoardSharePayload({
    boardId: 'board-1',
    postId: 'post-2',
    token: 'tok',
    title: 'Sunday formation',
    excerpt: 'Short excerpt',
  });
  const html = share.renderBoardShareHtml(
    { boardShare: payload },
    escapeHtml,
    { type: 'direct', id: 'd_aaa_bbb' }
  );
  assert.ok(/<div class="ce2-board-share">/.test(html));
  assert.ok(/<span class="ce2-board-share-kicker">Board share<\/span>/.test(html));
  assert.ok(/<span class="ce2-board-share-cta">Open post<\/span>/.test(html));
  assert.ok(html.indexOf('from=ce2') !== -1);
  assert.ok(html.indexOf('conv=d_aaa_bbb') !== -1);
  assert.ok(html.indexOf('Sunday formation') !== -1);
  assert.ok(!/<a class="ce2-board-share"/.test(html));
});

test('group thread return params land on Open post', function () {
  const html = share.renderBoardShareHtml(
    { boardShare: { boardId: 'b1', postId: 'p1', title: 'Hello' } },
    escapeHtml,
    { type: 'group', id: 'formation-circle-1' }
  );
  assert.ok(/from=ce2/.test(html));
  assert.ok(/group=formation-circle-1/.test(html));
  assert.ok(!/conv=/.test(html));
});

test('shareThreadTarget maps return info to DM or group', function () {
  const dm = share.shareThreadTarget({ type: 'direct', id: 'd_1_2' });
  assert.strictEqual(dm.type, 'direct');
  assert.strictEqual(dm.id, 'd_1_2');
  const group = share.shareThreadTarget({ type: 'group', id: 'g1' });
  assert.strictEqual(group.type, 'group');
  assert.strictEqual(group.id, 'g1');
  const fromConv = share.shareThreadTarget({ from: 'ce2', conv: 'd_a_b' });
  assert.strictEqual(fromConv.type, 'direct');
  assert.strictEqual(fromConv.id, 'd_a_b');
});

test('sortShareTargets puts the open conversation first', function () {
  const sorted = share.sortShareTargets(
    [
      { type: 'direct', id: 'd_old', name: 'Older', lastActivityAt: 10 },
      { type: 'group', id: 'g1', name: 'Formation circle', lastActivityAt: 50 },
      { type: 'direct', id: 'd_open', name: 'Open DM', lastActivityAt: 1 },
    ],
    { type: 'direct', id: 'd_open' }
  );
  assert.strictEqual(sorted[0].id, 'd_open');
  assert.ok(share.isPreferredShareTarget(sorted[0], { type: 'direct', id: 'd_open' }));
  assert.strictEqual(sorted[1].id, 'g1');
});

test('boardsHrefWithReturn tags the community hop for a later return', function () {
  const dm = share.boardsHrefWithReturn({ type: 'direct', id: 'd_aaa_bbb' });
  assert.strictEqual(dm, '/boards.html?from=ce2&conv=d_aaa_bbb');
  const group = share.boardsHrefWithReturn({ type: 'group', id: 'g1' });
  assert.strictEqual(group, '/boards.html?from=ce2&group=g1');
  assert.strictEqual(share.boardsHrefWithReturn(null), '/boards.html?from=ce2');
});

test('persist / read messenger return survives the board hop', function () {
  const local = loadShare();
  assert.strictEqual(local.readStoredMessengerReturn(), null);
  local.persistMessengerReturn({ type: 'group', id: 'formation-1' });
  const stored = local.readStoredMessengerReturn();
  assert.ok(stored);
  assert.strictEqual(stored.from, 'ce2');
  assert.strictEqual(stored.group, 'formation-1');
  assert.strictEqual(stored.conv, '');
  local.clearStoredMessengerReturn();
  assert.strictEqual(local.readStoredMessengerReturn(), null);
});

test('shouldKeepStoredReturn covers SBD surfaces, not random sites', function () {
  assert.ok(share.shouldKeepStoredReturn('/communication-v2/'));
  assert.ok(share.shouldKeepStoredReturn('/board.html'));
  assert.ok(share.shouldKeepStoredReturn('/boards.html'));
  assert.ok(share.shouldKeepStoredReturn('/dashboard.html'));
  assert.ok(share.shouldKeepStoredReturn('/group.html'));
  assert.ok(!share.shouldKeepStoredReturn('/shop.html'));
  assert.ok(!share.shouldKeepStoredReturn('https://evil.example/phish'));
});

test('messenger + drawer has Choose from a board and keeps paste as fallback', function () {
  const html = read('public/communication-v2/index.html');
  const drawer = html.match(/<div id="ce2ComposerDrawer"[\s\S]*?<\/footer>/);
  assert.ok(drawer);
  assert.ok(drawer[0].indexOf('id="ce2ShareFromBoard"') !== -1);
  assert.ok(drawer[0].indexOf('Choose from a board') !== -1);
  assert.ok(drawer[0].indexOf('id="ce2BoardShareUrl"') !== -1);
  assert.ok(drawer[0].indexOf('Share a board post as a card') !== -1);
  const bar = html.match(
    /<div class="ce2-composer-bar">([\s\S]*?)<\/div>\s*<div id="ce2ComposerDrawer"/
  );
  assert.ok(bar[1].indexOf('ce2ShareFromBoard') < 0);
});

test('messenger wires the + share entry without rewriting keyboard helpers', function () {
  const v2 = read('public/communication-v2/communication-v2.js');
  assert.ok(v2.indexOf('function openBoardPickerFromComposer') !== -1);
  assert.ok(v2.indexOf('openBoardPickerFromComposer()') !== -1);
  assert.ok(v2.indexOf('ce2ShareFromBoard') !== -1);
  assert.ok(v2.indexOf('boardsHrefWithReturn') !== -1);
  assert.ok(v2.indexOf('function applyViewportPanCounter') !== -1);
  assert.ok(v2.indexOf('function applyComposerKeyboardLift') !== -1);
  assert.ok(v2.indexOf('function measureComposerKeyboardLift') !== -1);
});

test('board page share action lists conversations and returns to messenger', function () {
  const src = read('src/pages/board.html');
  const pub = read('public/board.html');
  const boardJs = read('public/js/board.js');
  [src, pub].forEach(function (html) {
    assert.ok(html.indexOf('Share into messenger') !== -1);
    assert.ok(html.indexOf('Share via DM') === -1);
    assert.ok(html.indexOf('id="shareDmModal"') !== -1);
    assert.ok(html.indexOf('Search conversations') !== -1);
    assert.ok(html.indexOf('id="messengerReturnBar"') !== -1);
    assert.ok(html.indexOf('Back to messenger') !== -1);
  });
  assert.ok(boardJs.indexOf('function sendPostToThread') !== -1);
  assert.ok(boardJs.indexOf('function sendPostAsGroup') !== -1);
  assert.ok(boardJs.indexOf('function fetchShareTargets') !== -1);
  assert.ok(boardJs.indexOf('function afterBoardShareIntoThread') !== -1);
  assert.ok(boardJs.indexOf('Open in messenger') !== -1);
  assert.ok(boardJs.indexOf('buildBoardSharePayload') !== -1);
  assert.ok(boardJs.indexOf('shouldKeepStoredReturn') !== -1);
});

test('community boards preserve from=ce2 when opening a board', function () {
  const boardsJs = read('public/js/boards-v2.js');
  const src = read('src/pages/boards.html');
  const pub = read('public/boards.html');
  assert.ok(boardsJs.indexOf('function messengerReturnBoardHref') !== -1);
  assert.ok(boardsJs.indexOf('withMessengerReturn') !== -1);
  assert.ok(src.indexOf('ce2-share.js') !== -1);
  assert.ok(pub.indexOf('ce2-share.js') !== -1);
});

test('drawer action is a 44px mobile target', function () {
  const css = read('public/communication-v2/communication-v2.css');
  const block = css.match(/\.ce2-drawer-action\s*\{[^}]+\}/);
  assert.ok(block, 'expected .ce2-drawer-action rule');
  assert.ok(/min-height:\s*44px/.test(block[0]));
});

test('validate script includes this test', function () {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.scripts.validate.indexOf('test-ce2-formation-share.js') >= 0);
});

test('cache-bust is above live for share / messenger / board assets', function () {
  const html = read('public/communication-v2/index.html');
  const shareVer = html.match(/ce2-share\.js\?v=(\d+)/);
  const jsVer = html.match(/communication-v2\.js\?v=(\d+)/);
  const cssVer = html.match(/communication-v2\.css\?v=(\d+)/);
  assert.ok(shareVer && Number(shareVer[1]) >= 12, 'ce2-share cache-bust must be at or above 12');
  assert.ok(jsVer && Number(jsVer[1]) >= 126, 'communication-v2.js cache-bust must be at or above 126');
  assert.ok(cssVer && Number(cssVer[1]) >= 92, 'communication-v2.css cache-bust must be at or above 92');

  const srcBoard = read('src/pages/board.html');
  const pubBoard = read('public/board.html');
  assert.ok(/board-media\.css\?v=66/.test(srcBoard));
  const pubCss = pubBoard.match(/board-media\.css\?v=(\d+)/);
  assert.ok(pubCss && Number(pubCss[1]) > 1789602190003);
  const pubShare = pubBoard.match(/ce2-share\.js\?v=(\d+)/);
  const pubBoardJs = pubBoard.match(/board\.js\?v=(\d+)/);
  assert.ok(pubShare && Number(pubShare[1]) >= 1789602190005);
  assert.ok(pubBoardJs && Number(pubBoardJs[1]) >= 1789695000003);
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed\n');
  process.exit(1);
}
console.log('\n✅ CE2 formation / board moment share tests passed\n');
