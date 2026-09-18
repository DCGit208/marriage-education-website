/**
 * Unit tests for CE2 reply-quote jump (video / photo / voice / text).
 * Usage: node scripts/test-ce2-reply-jump.js
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

console.log('\nCE2 reply-quote jump\n');
const sandbox = loadIife('public/communication-v2/ce2-reply.js');
const rm = sandbox.Ce2Reply;
assert.ok(rm, 'Ce2Reply did not load');

const html = fs.readFileSync(
  path.join(ROOT, 'public/communication-v2/index.html'),
  'utf8'
);
const css = fs.readFileSync(
  path.join(ROOT, 'public/communication-v2/communication-v2.css'),
  'utf8'
);
const v2 = fs.readFileSync(
  path.join(ROOT, 'public/communication-v2/communication-v2.js'),
  'utf8'
);
const media = fs.readFileSync(
  path.join(ROOT, 'public/communication-v2/ce2-media-view.js'),
  'utf8'
);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

test('VERSION is 4 and jump helpers are exported', function () {
  assert.strictEqual(rm.VERSION, 4);
  assert.strictEqual(typeof rm.buildReplyPayload, 'function');
  assert.strictEqual(typeof rm.renderReplyQuoteHtml, 'function');
  assert.strictEqual(typeof rm.findReplyJumpFocus, 'function');
  assert.strictEqual(typeof rm.computeThreadScrollTop, 'function');
  assert.strictEqual(typeof rm.applyThreadScrollTop, 'function');
  assert.strictEqual(typeof rm.queryMessageRow, 'function');
  assert.strictEqual(typeof rm.connectJumpToLatest, 'function');
  assert.strictEqual(typeof rm.laterMessagesUnreachable, 'function');
  assert.strictEqual(typeof rm.shouldShowLatestControl, 'function');
});

test('video payload preview is Video and keeps the message id', function () {
  const withCaption = rm.buildReplyPayload(
    { id: 'vid-1', senderId: 'ada', content: 'Video', videoUrl: 'https://cdn.example/a.mp4' },
    'Ada'
  );
  assert.strictEqual(withCaption.messageId, 'vid-1');
  assert.strictEqual(withCaption.preview, 'Video');
  const emptyCaption = rm.buildReplyPayload(
    { id: 'vid-2', senderId: 'ada', content: '', videoUrl: 'https://cdn.example/b.mp4' },
    'Ada'
  );
  assert.strictEqual(emptyCaption.preview, 'Video');
  assert.strictEqual(emptyCaption.messageId, 'vid-2');
});

test('photo, voice, and text payloads still jump by id', function () {
  assert.strictEqual(
    rm.buildReplyPayload({ id: 'p1', imageUrl: 'https://cdn.example/x.jpg', content: '' }, 'Ben')
      .preview,
    'Photo'
  );
  assert.strictEqual(
    rm.buildReplyPayload({ id: 'a1', audioUrl: 'https://cdn.example/v.m4a', content: '' }, 'Ben')
      .preview,
    'Voice message'
  );
  const text = rm.buildReplyPayload({ id: 't1', content: 'Peace to this circle' }, 'Ben');
  assert.strictEqual(text.preview, 'Peace to this circle');
  assert.strictEqual(text.messageId, 't1');
});

test('quote html is a button with data-reply-to-id for video previews', function () {
  const htmlQuote = rm.renderReplyQuoteHtml(
    { messageId: 'vid-1', senderName: 'Ada', preview: 'Video' },
    escapeHtml
  );
  assert.ok(/<button type="button" class="ce2-reply-quote"/.test(htmlQuote));
  assert.ok(htmlQuote.indexOf('data-reply-to-id="vid-1"') !== -1);
  assert.ok(htmlQuote.indexOf('Video') !== -1);
  assert.ok(htmlQuote.indexOf('Ada') !== -1);
});

test('queryMessageRow finds the row by data-message-id', function () {
  const rows = {
    'vid-1': { id: 'vid-1' },
  };
  const root = {
    querySelector: function (sel) {
      const m = /data-message-id="([^"]+)"/.exec(sel);
      if (!m) return null;
      return rows[m[1]] || null;
    },
  };
  assert.strictEqual(rm.queryMessageRow(root, 'vid-1').id, 'vid-1');
  assert.strictEqual(rm.queryMessageRow(root, 'missing'), null);
});

test('jump focus prefers the video tap-to-play control', function () {
  const nodes = {
    '.ce2-media-tap--video': { kind: 'video-tap' },
    '.ce2-media-tap': { kind: 'photo-tap' },
    '.ce2-bubble': { kind: 'bubble' },
  };
  const row = {
    querySelector: function (sel) {
      return nodes[sel] || null;
    },
  };
  assert.strictEqual(rm.findReplyJumpFocus(row).kind, 'video-tap');
  delete nodes['.ce2-media-tap--video'];
  assert.strictEqual(rm.findReplyJumpFocus(row).kind, 'photo-tap');
  delete nodes['.ce2-media-tap'];
  assert.strictEqual(rm.findReplyJumpFocus(row).kind, 'bubble');
});

test('thread scroll pins a below-fold video to the top of the pane', function () {
  const pane = { top: 100, bottom: 700, height: 600 };
  const video = { top: 820, bottom: 1000, height: 180 };
  const next = rm.computeThreadScrollTop(pane, video, 400, { padTop: 12 });
  assert.strictEqual(next, 400 + (820 - 100) - 12);
  const above = rm.computeThreadScrollTop(pane, { top: 20, bottom: 80, height: 60 }, 400, {
    padTop: 12,
  });
  assert.strictEqual(above, 400 + (20 - 100) - 12);
  assert.ok(above >= 0);
  assert.strictEqual(rm.computeThreadScrollTop(pane, { top: 112, bottom: 160 }, 50, { padTop: 12 }), 50);
});

test('applyThreadScrollTop writes the pane, not the window, and clamps', function () {
  const scroll = { scrollHeight: 2000, clientHeight: 500, scrollTop: 10 };
  assert.strictEqual(rm.applyThreadScrollTop(scroll, 300), 300);
  assert.strictEqual(scroll.scrollTop, 300);
  assert.strictEqual(rm.applyThreadScrollTop(scroll, 99999), 1500);
  assert.strictEqual(rm.applyThreadScrollTop(scroll, -40), 0);
});

test('connectJumpToLatest keeps later live messages after an old video', function () {
  const jumpSlice = [
    { id: 'vid', createdAtMs: 100, videoUrl: 'https://cdn.example/a.mp4' },
    { id: 'c1', createdAtMs: 110 },
  ];
  const live = [
    { id: 'c1', createdAtMs: 110 },
    { id: 'c2', createdAtMs: 120 },
    { id: 'latest', createdAtMs: 200 },
  ];
  const merged = rm.connectJumpToLatest(jumpSlice, live);
  assert.strictEqual(
    merged
      .map(function (m) {
        return m.id;
      })
      .join(','),
    'vid,c1,c2,latest'
  );
  assert.strictEqual(
    rm.laterMessagesUnreachable(merged, 'vid', ['c1', 'c2', 'latest']),
    false
  );
  assert.strictEqual(
    rm.laterMessagesUnreachable(jumpSlice, 'vid', ['c1', 'c2', 'latest']),
    true
  );
});

test('latest control shows when scrolled up and hides at the bottom', function () {
  assert.strictEqual(rm.shouldShowLatestControl({ threadOpen: true, atLatest: false }), true);
  assert.strictEqual(rm.shouldShowLatestControl({ threadOpen: true, atLatest: true }), false);
  assert.strictEqual(rm.shouldShowLatestControl({ threadOpen: false, atLatest: false }), false);
  assert.ok(rm.isScrolledToLatest({ scrollHeight: 1000, scrollTop: 960, clientHeight: 50 }, 56));
  assert.ok(!rm.isScrolledToLatest({ scrollHeight: 1000, scrollTop: 100, clientHeight: 50 }, 56));
});

test('quote tap uses search-style history paging instead of an in-window no-op', function () {
  const jumpFn = v2.slice(
    v2.indexOf('function scrollToReplyMessage'),
    v2.indexOf('function renderThreadChrome')
  );
  assert.ok(jumpFn.indexOf('ensureSearchHitVisible(hit)') !== -1);
  assert.ok(jumpFn.indexOf('findLoadedMessageById') !== -1);
  assert.ok(jumpFn.indexOf('scrollIntoView') === -1);
  assert.ok(v2.indexOf('function ensureSearchHitVisible') !== -1);
  assert.ok(v2.indexOf('function loadSearchJumpWindow') !== -1);
  assert.ok(v2.indexOf('loadSearchJumpWindow(hit)') !== -1);
  assert.ok(v2.indexOf('scheduleScrollToHighlightedMessage') !== -1);
  assert.ok(v2.indexOf('stickBottom && !CommunicationState.highlightMessageId') !== -1);
  assert.ok(v2.indexOf("setTimeout(function () {\n        if (CommunicationState.highlightMessageId === messageId) {\n          CommunicationState.highlightMessageId = null;\n          render({ threadOnly: true });") === -1);
});

test('jump window is merged with the live tail so later messages stay reachable', function () {
  assert.ok(v2.indexOf('function fillForwardToLive') !== -1);
  assert.ok(v2.indexOf('function connectRenderedJumpList') !== -1);
  assert.ok(v2.indexOf('connectJumpToLatest') !== -1);
  const loadWin = v2.slice(
    v2.indexOf('async function loadSearchJumpWindow'),
    v2.indexOf('async function fillForwardToLive')
  );
  assert.ok(loadWin.indexOf('fillForwardToLive') !== -1);
  assert.ok(loadWin.indexOf('connectRenderedJumpList') !== -1);
  assert.ok(v2.indexOf('list = CommunicationState.searchJumpMessages;') === -1);
  const visible = v2.slice(
    v2.indexOf('function getVisibleMessages'),
    v2.indexOf('function getVisibleMessages') + 520
  );
  assert.ok(visible.indexOf('connectRenderedJumpList') !== -1);
});

test('Latest chip jumps to the bottom and hides once there', function () {
  assert.ok(html.indexOf('id="ce2JumpLatest"') !== -1);
  assert.ok(html.indexOf('Jump to latest message') !== -1);
  assert.ok(/\.ce2-jump-latest\[hidden\]/.test(css));
  assert.ok(v2.indexOf('function jumpToLatestMessage') !== -1);
  assert.ok(v2.indexOf('function syncJumpLatestControl') !== -1);
  assert.ok(v2.indexOf('function bindJumpLatestControl') !== -1);
  assert.ok(v2.indexOf('clearSearchJump: jumpToLatestMessage') !== -1);
  const jumpLatest = v2.slice(
    v2.indexOf('function jumpToLatestMessage'),
    v2.indexOf('function syncJumpLatestControl')
  );
  assert.ok(jumpLatest.indexOf('scroll.scrollTop = scroll.scrollHeight') !== -1);
  assert.ok(jumpLatest.indexOf('clearSearchJump()') !== -1);
});

test('quote click still stopPropagates and reads data-reply-to-id', function () {
  assert.ok(v2.indexOf("e.target.closest('.ce2-reply-quote[data-reply-to-id]')") !== -1);
  assert.ok(v2.indexOf("scrollToReplyMessage(quoteBtn.getAttribute('data-reply-to-id'))") !== -1);
  assert.ok(v2.indexOf('e.stopPropagation();') !== -1);
});

test('jump lands on existing tap-to-play, not a new player', function () {
  assert.ok(media.indexOf("btn.className = 'ce2-media-tap ce2-media-tap--video'") !== -1);
  assert.ok(media.indexOf("hint.textContent = 'Tap to play'") !== -1);
  assert.ok(media.indexOf('function activateMediaTap') !== -1);
  const jumpBlock = v2.slice(
    v2.indexOf('function scrollToHighlightedMessage'),
    v2.indexOf('async function applyCe2EntryParams')
  );
  assert.ok(jumpBlock.indexOf('activateMediaTap') === -1);
  assert.ok(jumpBlock.indexOf('findReplyJumpFocus') !== -1);
  assert.ok(jumpBlock.indexOf('applyThreadScrollTop') !== -1);
});

test('DM and group message collections stay on the shared jump path', function () {
  const col = v2.slice(
    v2.indexOf('function messagesCollection'),
    v2.indexOf('function messagesCollection') + 520
  );
  assert.ok(col.indexOf("ac.type === 'direct'") !== -1);
  assert.ok(col.indexOf("collection('ce2_messages')") !== -1);
  assert.ok(v2.indexOf('ensureSearchHitVisible(hit)') !== -1);
});

test('highlighted video keeps scroll-margin so it is not under chrome', function () {
  assert.ok(/\.ce2-row\.is-highlighted\s*\{[^}]*scroll-margin-top:\s*12px/.test(css));
  assert.ok(/\.ce2-row\.is-highlighted\s*\{[^}]*scroll-margin-bottom:\s*96px/.test(css));
  assert.ok(/\.ce2-media-tap--video\s*\{[^}]*min-height:\s*132px/.test(css));
});

test('cache-bust sits strictly above live 115 / 83 / 3', function () {
  const jsVer = html.match(/communication-v2\.js\?v=(\d+)/);
  const cssVer = html.match(/communication-v2\.css\?v=(\d+)/);
  const replyVer = html.match(/ce2-reply\.js\?v=(\d+)/);
  const queueVer = html.match(/ce2-offline-queue\.js\?v=(\d+)/);
  const receiptsVer = html.match(/ce2-receipts\.js\?v=(\d+)/);
  const searchVer = html.match(/ce2-thread-search\.js\?v=(\d+)/);
  const actionsVer = html.match(/ce2-message-actions\.js\?v=(\d+)/);
  const shareVer = html.match(/ce2-share\.js\?v=(\d+)/);
  const mediaVer = html.match(/ce2-media-view\.js\?v=(\d+)/);
  assert.ok(jsVer && Number(jsVer[1]) > 115);
  assert.ok(cssVer && Number(cssVer[1]) > 83);
  assert.ok(replyVer && Number(replyVer[1]) > 3);
  assert.ok(queueVer && Number(queueVer[1]) >= 2);
  assert.ok(receiptsVer && Number(receiptsVer[1]) >= 5);
  assert.ok(searchVer && Number(searchVer[1]) >= 1);
  assert.ok(actionsVer && Number(actionsVer[1]) >= 24);
  assert.ok(shareVer && Number(shareVer[1]) >= 10);
  assert.ok(mediaVer && Number(mediaVer[1]) >= 3);
  assert.ok(html.indexOf('communication-v2.js?v=115') < 0);
  assert.ok(html.indexOf('ce2-reply.js?v=3"') < 0);
});

test('frozen keyboard, delivery, audio, inbox, search, push, queue stay intact', function () {
  assert.ok(html.indexOf('ce2-keyboard-stable-v60') !== -1);
  assert.ok(html.indexOf('ce2-audio-stable-1d') !== -1);
  assert.ok(html.indexOf('ce2-delivery-stable-v90') !== -1);
  assert.ok(v2.indexOf('function applyComposerKeyboardLift') !== -1);
  assert.ok(v2.indexOf('function handleMetaMessageDelivery') !== -1);
  assert.ok(v2.indexOf('initCe2ThreadSearch') !== -1);
  assert.ok(v2.indexOf('flushCe2OfflineQueue') !== -1);
  const inboxVer = html.match(/ce2-inbox\.js\?v=(\d+)/);
  assert.ok(inboxVer && Number(inboxVer[1]) >= 1);
  assert.ok(html.indexOf('ce2-thread-search.js?v=1') !== -1);
  assert.ok(html.indexOf('ce2-push.js?v=1') !== -1);
  assert.ok(html.indexOf('ce2-offline-queue.js?v=2') !== -1);
});

test('validate script includes the reply-jump test', function () {
  assert.ok(pkg.scripts.validate.indexOf('test-ce2-reply-jump.js') >= 0);
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed\n');
  process.exit(1);
}
console.log('\n✅ CE2 reply-quote jump tests passed\n');
