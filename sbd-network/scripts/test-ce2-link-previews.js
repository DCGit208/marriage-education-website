/**
 * Unit tests for CE2 allowlisted link previews (no open-web unfurl).
 * Usage: node scripts/test-ce2-link-previews.js
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
      URL: URL,
      URLSearchParams: URLSearchParams,
      location: { origin: 'https://sbd.marriageducation.com' },
    },
    extras || {}
  );
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.runInNewContext(code, sandbox, { filename: relPath });
  return sandbox;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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

function renderMessageHtml(lk, content, opts) {
  opts = opts || {};
  if (opts.messageType === 'board_share' && opts.boardShareHtml) {
    return opts.boardShareHtml;
  }
  const previewUrl = lk.firstPreviewableUrl(content);
  const previewHtml = lk.renderPreviewHtmlForMessage(content, escapeHtml);
  const displayText = previewHtml ? lk.stripPreviewedUrls(content, previewUrl) : content;
  let html = '';
  if (displayText) {
    html += '<div class="ce2-msg-text">' + lk.linkifyHtml(escapeHtml(displayText)) + '</div>';
  }
  if (previewHtml) html += previewHtml;
  return html;
}

function thumbIsInsideOpenLink(html) {
  const bodyOpen = html.search(/<a\b[^>]*class="ce2-link-preview-body"/);
  if (bodyOpen < 0) return false;
  const after = html.slice(bodyOpen);
  const bodyClose = after.indexOf('</a>');
  if (bodyClose < 0) return true;
  return after.slice(0, bodyClose).indexOf('ce2-link-preview-thumb') >= 0;
}

console.log('\nCE2 link previews\n');

const links = loadIife('public/communication-v2/ce2-links.js').Ce2Links;
const share = loadIife('public/communication-v2/ce2-share.js').Ce2Share;
assert.ok(links, 'Ce2Links did not load');
assert.ok(share, 'Ce2Share did not load');

test('Ce2Links VERSION is 2', function () {
  assert.strictEqual(links.VERSION, 2);
});

test('allowlist is unchanged and does not add open-web hosts', function () {
  assert.deepStrictEqual(Array.from(links.ALLOWED_HOSTS), [
    'sbd-network.web.app',
    'sbd-network.firebaseapp.com',
    'marriageducation.com',
    'www.marriageducation.com',
    'localhost',
    '127.0.0.1',
  ]);
  assert.ok(Array.from(links.ALLOWED_HOSTS).indexOf('youtube.com') < 0);
  assert.ok(Array.from(links.ALLOWED_HOSTS).indexOf('google.com') < 0);
});

test('live host sbd.marriageducation.com is already allowed via subdomain match', function () {
  assert.ok(links.hostAllowed('sbd.marriageducation.com'));
  assert.ok(links.ALLOWED_HOSTS.indexOf('sbd.marriageducation.com') < 0);
  assert.strictEqual(
    links.validateMessageLinks('https://sbd.marriageducation.com/learn').ok,
    true
  );
});

test('external hosts stay blocked', function () {
  const check = links.validateMessageLinks('see https://youtube.com/watch?v=1 and https://evil.example/x');
  assert.strictEqual(check.ok, false);
  assert.ok(check.blocked.length >= 2);
  assert.ok(check.external.length >= 2);
});

test('allowed DM/group link renders a title card, not only the raw URL', function () {
  const dmUrl = 'https://sbd.marriageducation.com/learn';
  const groupUrl = 'https://sbd-network.web.app/dashboard';
  const dm = renderMessageHtml(links, dmUrl);
  const group = renderMessageHtml(links, groupUrl);
  assert.ok(dm.indexOf('ce2-link-preview') >= 0, 'DM allowed link must render a preview card');
  assert.ok(group.indexOf('ce2-link-preview') >= 0, 'group allowed link must render a preview card');
  assert.ok(dm.indexOf('Formation') >= 0 || dm.indexOf('Learn') >= 0);
  assert.ok(group.indexOf('Home') >= 0);
  assert.ok(dm.indexOf('ce2-link-preview-title') >= 0);
  assert.ok(dm.indexOf('ce2-link-preview-excerpt') >= 0);
  assert.ok(dm.indexOf('ce2-msg-text') < 0, 'bare URL must not remain the whole message');
  assert.notStrictEqual(dm.trim(), dmUrl);
  assert.ok(!/^<div class="ce2-msg-text"><a[^>]*>https?:/.test(dm));
});

test('text plus an allowed link keeps the words and still shows a card', function () {
  const html = renderMessageHtml(links, 'Read this https://sbd.marriageducation.com/learn');
  assert.ok(html.indexOf('Read this') >= 0);
  assert.ok(html.indexOf('ce2-link-preview') >= 0);
  const textBlock = html.match(/<div class="ce2-msg-text">([\s\S]*?)<\/div>/);
  assert.ok(textBlock);
  assert.ok(textBlock[1].indexOf('https://sbd.marriageducation.com/learn') < 0);
});

test('external link never becomes a preview card', function () {
  const html = renderMessageHtml(links, 'https://youtube.com/watch?v=dQw4w9WgXcQ');
  assert.ok(html.indexOf('ce2-link-preview') < 0);
  assert.strictEqual(links.previewFromUrl('https://news.ycombinator.com/'), null);
  assert.strictEqual(links.renderLinkPreviewHtml('https://example.com/a', escapeHtml), '');
  assert.strictEqual(links.firstPreviewableUrl('https://google.com/search?q=sbd'), '');
});

test('thumbnail and open-link are split tap targets (PR #8)', function () {
  const html = links.renderLinkPreviewHtml('https://sbd.marriageducation.com/courses', escapeHtml);
  assert.ok(/<button type="button" class="ce2-link-preview-thumb/.test(html));
  assert.ok(/aria-label="Reply to this message"/.test(html));
  const thumbClose = html.indexOf('</button>');
  const bodyIdx = html.indexOf('ce2-link-preview-body');
  assert.ok(thumbClose > 0 && bodyIdx > thumbClose, 'thumb button must close before the body link');
  assert.ok(!thumbIsInsideOpenLink(html), 'thumbnail must not sit inside the open-link <a>');
  assert.ok(/<a class="ce2-link-preview-body" href="https:\/\/sbd\.marriageducation\.com\/courses"/.test(html));
  assert.ok(!/<button[^>]*href=/.test(html));
});

test('board-post URLs do not grow a second weaker preview', function () {
  const boardUrl =
    'https://sbd.marriageducation.com/board.html?boardId=circle-1&post=post-99';
  assert.strictEqual(links.isBoardPostUrl(boardUrl), true);
  assert.strictEqual(links.previewFromUrl(boardUrl), null);
  assert.strictEqual(links.renderPreviewHtmlForMessage(boardUrl, escapeHtml), '');
  const shareHtml = share.renderBoardShareHtml(
    {
      boardShare: {
        boardId: 'circle-1',
        postId: 'post-99',
        title: 'Sabbath rest',
        excerpt: 'A note from the floor',
        url: boardUrl,
      },
    },
    escapeHtml
  );
  const combined = renderMessageHtml(links, boardUrl, {
    messageType: 'board_share',
    boardShareHtml: shareHtml,
  });
  assert.ok(combined.indexOf('ce2-board-share') >= 0);
  assert.ok(combined.indexOf('ce2-link-preview') < 0);
});

test('unknown allowed path still unfurls from the route, without scraping', function () {
  const src = fs.readFileSync(path.join(ROOT, 'public/communication-v2/ce2-links.js'), 'utf8');
  assert.ok(!/\bfetch\s*\(/.test(src), 'ce2-links must not fetch user-supplied URLs');
  assert.ok(!/XMLHttpRequest/.test(src));
  const preview = links.previewFromUrl('https://localhost/admin-course-builder');
  assert.ok(preview);
  assert.ok(preview.title);
  assert.notStrictEqual(preview.title, 'https://localhost/admin-course-builder');
  assert.ok(preview.excerpt);
});

test('thread renderer wires preview cards and keeps thumb reply', function () {
  const src = fs.readFileSync(path.join(ROOT, 'public/communication-v2/communication-v2.js'), 'utf8');
  assert.ok(src.indexOf('renderPreviewHtmlForMessage') !== -1);
  assert.ok(src.indexOf('stripPreviewedUrls') !== -1);
  assert.ok(src.indexOf('ce2-link-preview-thumb') !== -1);
  assert.ok(src.indexOf('setReply(shareMsg)') !== -1);
  assert.ok(
    src.indexOf(
      "node.closest('.ce2-media-tap, .ce2-board-share-thumb, .ce2-link-preview-thumb')"
    ) !== -1
  );
});

test('CSS keeps the thumb outside the body link and cover-crops when an image exists', function () {
  const css = fs.readFileSync(path.join(ROOT, 'public/communication-v2/communication-v2.css'), 'utf8');
  const thumb = css.match(/\.ce2-link-preview-thumb\s*\{[^}]+\}/);
  const img = css.match(/\.ce2-link-preview-thumb-img\s*\{[^}]+\}/);
  assert.ok(thumb && /aspect-ratio:\s*16\s*\/\s*9/.test(thumb[0]));
  assert.ok(img && /object-fit:\s*cover/.test(img[0]));
  assert.ok(img && /pointer-events:\s*none/.test(img[0]));
  assert.ok(/\.ce2-link-preview-thumb-ph::before/.test(css));
});

test('cache-bust versions stay strictly above live 116/84/4/1', function () {
  const html = fs.readFileSync(
    path.join(ROOT, 'public/communication-v2/index.html'),
    'utf8'
  );
  const jsVer = html.match(/communication-v2\.js\?v=(\d+)/);
  const cssVer = html.match(/communication-v2\.css\?v=(\d+)/);
  const replyVer = html.match(/ce2-reply\.js\?v=(\d+)/);
  const linksVer = html.match(/ce2-links\.js\?v=(\d+)/);
  const inboxVer = html.match(/ce2-inbox\.js\?v=(\d+)/);
  const shareVer = html.match(/ce2-share\.js\?v=(\d+)/);
  const mediaVer = html.match(/ce2-media-view\.js\?v=(\d+)/);
  const actionsVer = html.match(/ce2-message-actions\.js\?v=(\d+)/);
  const offlineVer = html.match(/ce2-offline-queue\.js\?v=(\d+)/);
  const receiptsVer = html.match(/ce2-receipts\.js\?v=(\d+)/);
  const searchVer = html.match(/ce2-thread-search\.js\?v=(\d+)/);
  assert.ok(jsVer && Number(jsVer[1]) > 116, 'communication-v2.js must be newer than live v=116');
  assert.ok(cssVer && Number(cssVer[1]) > 84, 'communication-v2.css must be newer than live v=84');
  assert.ok(replyVer && Number(replyVer[1]) >= 4, 'ce2-reply.js must not go backwards from live v=4');
  assert.ok(linksVer && Number(linksVer[1]) > 1, 'ce2-links.js must be newer than live v=1');
  assert.ok(inboxVer && Number(inboxVer[1]) >= 2, 'ce2-inbox.js must be bumped for Link labels');
  assert.ok(shareVer && Number(shareVer[1]) >= 10);
  assert.ok(mediaVer && Number(mediaVer[1]) >= 3);
  assert.ok(actionsVer && Number(actionsVer[1]) >= 24);
  assert.ok(offlineVer && Number(offlineVer[1]) >= 2);
  assert.ok(receiptsVer && Number(receiptsVer[1]) >= 5);
  assert.ok(searchVer && Number(searchVer[1]) >= 1);
  assert.ok(html.indexOf('ce2-keyboard-stable-v60') !== -1);
});

test('validate script includes the link-preview test', function () {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts.validate.indexOf('test-ce2-link-previews.js') >= 0);
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed\n');
  process.exit(1);
}
console.log('\n✅ CE2 link preview tests passed\n');
