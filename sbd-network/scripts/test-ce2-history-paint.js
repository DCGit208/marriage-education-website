/**
 * CE2 history paint — load-older prepend + bounded reply jump.
 * Usage: node scripts/test-ce2-history-paint.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const v2 = fs.readFileSync(
  path.join(ROOT, 'public/communication-v2/communication-v2.js'),
  'utf8'
);
const html = fs.readFileSync(
  path.join(ROOT, 'public/communication-v2/index.html'),
  'utf8'
);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

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

function sliceFn(src, name) {
  const start = src.indexOf('function ' + name);
  assert.ok(start >= 0, 'missing function ' + name);
  let depth = 0;
  let started = false;
  let i = start;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      depth += 1;
      started = true;
    } else if (ch === '}') {
      depth -= 1;
      if (started && depth === 0) {
        i += 1;
        break;
      }
    }
  }
  return src.slice(start, i);
}

function evalFns(names) {
  const sandbox = {};
  names.forEach(function (name) {
    vm.runInNewContext(sliceFn(v2, name), sandbox, { filename: name });
  });
  return sandbox;
}

console.log('\nCE2 history paint\n');

const ids = evalFns(['renderedIdsAreAppend', 'renderedIdsArePrepend']);

test('prepend / append id helpers distinguish load-older from live append', function () {
  const live = ['m40', 'm41', 'm42'];
  const afterOlder = ['m10', 'm11', 'm40', 'm41', 'm42'];
  const afterNew = ['m40', 'm41', 'm42', 'm43'];
  assert.strictEqual(ids.renderedIdsArePrepend(live, afterOlder), true);
  assert.strictEqual(ids.renderedIdsAreAppend(live, afterOlder), false);
  assert.strictEqual(ids.renderedIdsAreAppend(live, afterNew), true);
  assert.strictEqual(ids.renderedIdsArePrepend(live, afterNew), false);
  assert.strictEqual(ids.renderedIdsArePrepend(live, live), false);
  assert.strictEqual(ids.renderedIdsAreAppend(['a'], ['b', 'c']), false);
});

test('jump window plus live tail is a prepend of the live ids', function () {
  const live = [];
  for (var i = 950; i < 1000; i++) live.push('m' + i);
  const jump = [];
  for (var j = 0; j < 36 + 16; j++) jump.push('j' + j);
  const combined = jump.concat(live);
  assert.strictEqual(ids.renderedIdsArePrepend(live, combined), true);
  assert.strictEqual(combined.length, 50 + 36 + 16);
});

const loadOlder = sliceFn(v2, 'loadOlderMessages');
const incremental = sliceFn(v2, 'tryIncrementalMessageRender');
const fillForward = sliceFn(v2, 'fillForwardToLive');
const ensureHit = sliceFn(v2, 'ensureSearchHitVisible');
const renderPanel = sliceFn(v2, 'renderMessagePanel');

test('loadOlderMessages does not assign message-pane innerHTML or full-render twice', function () {
  assert.ok(loadOlder.indexOf('innerHTML') === -1, 'loadOlder must not touch innerHTML');
  assert.ok(
    loadOlder.indexOf('if (!opts.quiet) render()') === -1,
    'must not full-render a loading state before the fetch'
  );
  assert.ok(
    !/\brender\(\)/.test(loadOlder),
    'loadOlder must not call render() — that was the first of two full paints'
  );
  assert.ok(loadOlder.indexOf('syncMessageHistoryChrome') !== -1);
  assert.ok(loadOlder.indexOf('requestRender({ threadOnly: true })') !== -1);
});

test('incremental renderer prepends older rows and restores scroll instead of wiping', function () {
  assert.ok(incremental.indexOf('renderedIdsArePrepend') !== -1);
  assert.ok(incremental.indexOf('insertBeforeFirstMessageRow') !== -1);
  assert.ok(incremental.indexOf('scroll.scrollTop = prevTop + (scroll.scrollHeight - prevHeight)') !== -1);
  assert.ok(incremental.indexOf('renderedIdsAreAppend') !== -1);
  assert.ok(
    incremental.indexOf('CommunicationState.loadingOlder ||') === -1,
    'loadingOlder must not force a full pane rebuild'
  );
  assert.ok(
    incremental.indexOf('CommunicationState.highlightMessageId ||') === -1,
    'highlight must not force a full pane rebuild'
  );
  assert.ok(
    incremental.indexOf('searchJumpMessages') === -1,
    'searchJumpMessages must not gate incremental render'
  );
  assert.ok(
    incremental.indexOf('threadSearchQuery') === -1,
    'in-thread search must not force a full pane rebuild for the session'
  );
});

test('reply jump does not page an unbounded combined list', function () {
  assert.ok(v2.indexOf('var JUMP_FORWARD_MAX_PAGES = 0') !== -1);
  assert.ok(v2.indexOf('var JUMP_BEFORE = 36') !== -1);
  assert.ok(v2.indexOf('var JUMP_AFTER = 16') !== -1);
  assert.ok(v2.indexOf('var JUMP_PAINT_CAP = MESSAGE_PAGE + JUMP_BEFORE + JUMP_AFTER') !== -1);
  assert.ok(fillForward.indexOf('pages < 20') === -1);
  assert.ok(fillForward.indexOf('JUMP_FORWARD_MAX_PAGES <= 0') !== -1);
  assert.ok(fillForward.indexOf('connectRenderedJumpList') !== -1);
  assert.ok(ensureHit.indexOf('pages < 8') === -1);
  assert.ok(ensureHit.indexOf('loadOlderMessages') === -1);
  assert.ok(ensureHit.indexOf('loadSearchJumpWindow(hit)') !== -1);
});

test('live window stays MESSAGE_PAGE 50; jump uses bounded before/after', function () {
  assert.ok(v2.indexOf('var MESSAGE_PAGE = 50') !== -1);
  const attach = sliceFn(v2, 'attachMessagesListener');
  assert.ok(attach.indexOf('.limitToLast(MESSAGE_PAGE)') !== -1);
  const loadWin = sliceFn(v2, 'loadSearchJumpWindow');
  assert.ok(loadWin.indexOf('limitToLast(JUMP_BEFORE)') !== -1);
  assert.ok(loadWin.indexOf('.limit(JUMP_AFTER)') !== -1);
  assert.ok(loadWin.indexOf('fillForwardToLive') !== -1);
});

test('full pane wipe remains a fallback, not the load-older or jump path', function () {
  const innerAssigns = renderPanel.split('scroll.innerHTML');
  assert.ok(
    innerAssigns.length - 1 <= 3,
    'renderMessagePanel should only innerHTML empty/loading/no-messages + fallback wipe'
  );
  assert.ok(renderPanel.indexOf('if (tryIncrementalMessageRender') !== -1);
  assert.ok(v2.indexOf('function jumpToLatestMessage') !== -1);
  assert.ok(v2.indexOf('clearSearchJump()') !== -1);
  assert.ok(html.indexOf('id="ce2JumpLatest"') !== -1);
});

test('cache-bust for communication-v2.js is strictly newer than live 117', function () {
  const jsVer = html.match(/communication-v2\.js\?v=(\d+)/);
  assert.ok(jsVer && Number(jsVer[1]) > 117);
  const cssVer = html.match(/communication-v2\.css\?v=(\d+)/);
  assert.ok(cssVer && Number(cssVer[1]) >= 86);
  const replyVer = html.match(/ce2-reply\.js\?v=(\d+)/);
  assert.ok(replyVer && Number(replyVer[1]) >= 4);
  const searchVer = html.match(/ce2-thread-search\.js\?v=(\d+)/);
  assert.ok(searchVer && Number(searchVer[1]) >= 1);
});

test('validate script includes the history-paint test', function () {
  assert.ok(pkg.scripts.validate.indexOf('test-ce2-history-paint.js') >= 0);
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed\n');
  process.exit(1);
}
console.log('\n✅ CE2 history paint tests passed\n');
