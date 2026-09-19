/**
 * Phone composer tap targets + CE2 access-rule regressions.
 * Usage: node scripts/test-ce2-access-and-composer.js
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

function loadIife(relPath) {
  const code = read(relPath);
  const sandbox = {
    console: console,
    Date: Date,
    Number: Number,
    String: String,
    Math: Math,
    Array: Array,
    Object: Object,
    Error: Error,
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.runInNewContext(code, sandbox, { filename: relPath });
  return sandbox;
}

function mediaBlocks(css, query) {
  const needle = '@media ' + query;
  const blocks = [];
  let from = 0;
  while (from < css.length) {
    const start = css.indexOf(needle, from);
    if (start < 0) break;
    const brace = css.indexOf('{', start);
    if (brace < 0) break;
    let depth = 0;
    let i = brace;
    for (; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          i += 1;
          break;
        }
      }
    }
    blocks.push(css.slice(start, i));
    from = i;
  }
  return blocks;
}

function extractMatch(rules, signature) {
  const start = rules.indexOf(signature);
  assert.ok(start >= 0, 'missing ' + signature);
  return rules.slice(start, start + 1800);
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

const html = read('public/communication-v2/index.html');
const css = read('public/communication-v2/communication-v2.css');
const v2 = read('public/communication-v2/communication-v2.js');
const pwa = read('public/communication-v2/ce2-pwa.js');
const searchSrc = read('public/communication-v2/ce2-thread-search.js');
const rules = read('firestore.rules');
const indexes = read('firestore.indexes.json');
const fnSrc = read('functions/index.js');
const deliverySrc = read('functions/ce2-push-delivery.js');
const pushFnSrc = fnSrc + '\n' + deliverySrc;
const dmSrc = read('public/js/dm.js');
const boardSrc = read('public/js/board.js');
const notifSrc = read('public/js/notifications.js');
const pkg = JSON.parse(read('package.json'));

console.log('\nCE2 phone composer\n');

test('closed composer bar is attach, mic, field, quieter +, and send', function () {
  const bar = html.match(
    /<div class="ce2-composer-bar">([\s\S]*?)<\/div>\s*<div id="ce2ComposerDrawer"/
  );
  assert.ok(bar, 'missing closed composer bar');
  const closed = bar[1];
  assert.ok(closed.indexOf('id="ce2AttachWrap"') >= 0);
  assert.ok(closed.indexOf('id="ce2VoiceBtn"') >= 0);
  assert.ok(closed.indexOf('id="ce2Input"') >= 0);
  assert.ok(closed.indexOf('id="ce2SendBtn"') >= 0);
  assert.ok(closed.indexOf('id="ce2ComposerMore"') >= 0);
  assert.ok(closed.indexOf('ce2ClassSelect') < 0, 'classification still on the closed bar');
  assert.ok(closed.indexOf('ce2Shareable') < 0, 'shareable still on the closed bar');
  assert.ok(closed.indexOf('ce2FmtBold') < 0, 'format chrome still on the closed bar');
  assert.ok(closed.indexOf('ce2BoardShareUrl') < 0, 'board URL still on the closed bar');
  assert.ok(closed.indexOf('ce2-color-swatch') < 0, 'gold/blue/green still on the closed bar');
});

test('classification, share, format, and board paste live only in the + drawer', function () {
  const drawer = html.match(
    /<div id="ce2ComposerDrawer"[\s\S]*?<\/footer>/
  );
  assert.ok(drawer, 'missing composer drawer');
  assert.ok(drawer[0].indexOf('id="ce2ClassSelect"') >= 0);
  assert.ok(drawer[0].indexOf('id="ce2Shareable"') >= 0);
  assert.ok(drawer[0].indexOf('id="ce2FmtBold"') >= 0);
  assert.ok(drawer[0].indexOf('id="ce2BoardShareUrl"') >= 0);
  assert.ok(drawer[0].indexOf('ce2-color-swatch--gold') >= 0);
});

test('phone composer controls and inbox ⋮ are at least 44px', function () {
  const phone = mediaBlocks(css, '(max-width: 719px)').join('\n');
  assert.ok(phone.indexOf('--ce2-composer-control: 44px') >= 0);
  assert.ok(phone.indexOf('--ce2-composer-control: 36px') < 0);
  assert.ok(/\.ce2-li-more\s*\{[^}]*width:\s*44px/.test(phone));
  assert.ok(/\.ce2-li-more\s*\{[^}]*height:\s*44px/.test(phone));
  assert.ok(/\.ce2-thread-search-toggle\s*\{[^}]*width:\s*44px/.test(phone));
  assert.ok(/min-width:\s*44px/.test(phone));
  assert.ok(/min-height:\s*44px/.test(phone));
  assert.ok(/\.ce2-btn-send\s*\{[^}]*width:\s*44px/.test(phone));
  assert.ok(/\.ce2-btn-send\s*\{[^}]*height:\s*44px/.test(phone));
});

test('does not rewrite the frozen keyboard block', function () {
  assert.ok(html.indexOf('ce2-keyboard-stable-v60') >= 0);
  assert.ok(v2.indexOf('function applyViewportPanCounter') >= 0);
  assert.ok(v2.indexOf('function applyComposerKeyboardLift') >= 0);
  assert.ok(v2.indexOf('function measureComposerKeyboardLift') >= 0);
  assert.ok(/body\.ce2-body-root\.ce2-kb-active\s*\{[^}]*--ce2-vv-offset/.test(css));
  assert.ok(
    /body\.ce2-composer-kb-active \.ce2-thread-open \.ce2-composer\s*\{[^}]*--ce2-composer-kb/.test(
      css
    )
  );
});

console.log('\nCE2 access rules\n');

test('communicationGroups list is no longer any-auth', function () {
  const block = extractMatch(rules, 'match /communicationGroups/{groupId} {');
  const list = block.match(/allow list:\s*if[^;]+;/);
  assert.ok(list, 'missing communicationGroups list rule');
  assert.ok(
    list[0].indexOf('request.auth != null;') < 0,
    'group list still allows any signed-in user'
  );
  assert.ok(/ce2CanListGroup\(resource\.data\)/.test(list[0]));
  assert.ok(/function ce2CanListGroup\(gdata\)/.test(rules));
  assert.ok(/ce2UserMeetsGroupTier\(ud, gdata\)/.test(rules));
});

test('Elite / classification is enforced on ce2_messages read, not UI-only', function () {
  assert.ok(rules.indexOf('classification floor enforced in CE2 UI') < 0);
  assert.ok(/function ce2CanReadStoredMessage\(ud, data\)/.test(rules));
  const storedReads = rules.match(
    /allow read: if[\s\S]{0,500}?ce2CanReadStoredMessage\(/g
  );
  assert.ok(
    storedReads && storedReads.length >= 2,
    'classification floor missing on group or DM message reads'
  );
  assert.ok(rules.indexOf('ce2IsGroupMember(groupId, request.auth.uid) &&') >= 0);
  assert.ok(v2.indexOf('function constrainCe2MessagesQuery') >= 0);
  assert.ok(v2.indexOf(".where('classification', 'in', classes)") >= 0);
});

test('fcmToken is owner-only; notify functions look the token up with admin', function () {
  const pushMatch = extractMatch(rules, 'match /users/{userId}/ce2_push/{docId} {');
  assert.ok(/request\.auth\.uid == userId/.test(pushMatch));
  assert.ok(/docId == 'token'/.test(pushMatch));
  assert.ok(/docId == 'prefs'/.test(pushMatch));
  assert.ok(!/allow read:\s*if request\.auth != null;/.test(pushMatch.split('match /ce2_share_tokens')[0]));
  assert.ok(/function ce2UserPushSecretsUnchangedOrStripped\(\)/.test(rules));
  assert.ok(/!ce2UserPushSecretsPresent\(request\.resource\.data\)/.test(rules));
  assert.ok(pwa.indexOf("collection('ce2_push')") >= 0);
  assert.ok(pwa.indexOf("doc('token')") >= 0);
  assert.ok(pwa.indexOf('migrateOwnLegacyPushToken') >= 0);
  assert.ok(pwa.indexOf("update({ fcmToken: token })") < 0);
  assert.ok(notifSrc.indexOf("collection('ce2_push')") >= 0);
  assert.ok(v2.indexOf('recipientToken') < 0);
  assert.ok(v2.indexOf("recipDoc.data().fcmToken") < 0);
  assert.ok(dmSrc.indexOf('recipientToken') < 0);
  assert.ok(boardSrc.indexOf('recipientToken') < 0);
  assert.ok(/async function lookupPushToken\(recipientId/.test(pushFnSrc));
  assert.ok(/collection\("ce2_push"\)/.test(pushFnSrc));
  assert.ok(pushFnSrc.indexOf('body.recipientToken') < 0);
  assert.ok(/async function resolveRecipient\(recipientId\)/.test(pushFnSrc));
  assert.ok(pushFnSrc.indexOf('onDocumentCreated') >= 0);
  assert.ok(pushFnSrc.indexOf('ce2_conversations/{convId}/ce2_messages/{messageId}') >= 0);
  assert.ok(
    pushFnSrc.indexOf('communicationGroups/{groupId}/ce2_messages/{messageId}') >= 0
  );
});

test('ce2_share_tokens list is no longer any-auth; get-by-id still works', function () {
  const block = extractMatch(rules, 'match /ce2_share_tokens/{tokenId} {');
  assert.ok(/allow get:\s*if request\.auth != null;/.test(block));
  assert.ok(!/allow read:\s*if request\.auth != null;/.test(block));
  assert.ok(/allow list:\s*if request\.auth != null && \(/.test(block));
  assert.ok(/resource\.data\.createdBy == request\.auth\.uid/.test(block));
});

test('message queries keep a classification + createdAt index', function () {
  const parsed = JSON.parse(indexes);
  const found = parsed.indexes.some(function (idx) {
    if (idx.collectionGroup !== 'ce2_messages') return false;
    const paths = (idx.fields || []).map(function (f) {
      return f.fieldPath + ':' + (f.order || '');
    });
    return (
      paths.indexOf('classification:ASCENDING') >= 0 &&
      paths.indexOf('createdAt:ASCENDING') >= 0
    );
  });
  assert.ok(found, 'missing ce2_messages classification + createdAt index');
});

test('governance exposes readable classifications and Elite still needs Elite rank', function () {
  const gov = loadIife('public/communication-v2/ce2-governance.js').Ce2Governance;
  assert.ok(gov.classificationsReadableByUser);
  const foundation = gov.classificationsReadableByUser({ tier: 'foundation' });
  assert.ok(foundation.indexOf('public') >= 0);
  assert.ok(foundation.indexOf('foundation') >= 0);
  assert.ok(foundation.indexOf('elite') < 0);
  const elite = gov.classificationsReadableByUser({
    tier: 'premium',
    subscription: { status: 'active', tier: 'elite' },
  });
  assert.ok(elite.indexOf('elite') >= 0);
  assert.strictEqual(gov.VERSION, 7);
});

test('thread search applies the same classification constraint', function () {
  assert.ok(searchSrc.indexOf('constrainMessagesQuery') >= 0);
  assert.ok(v2.indexOf('constrainMessagesQuery:') >= 0);
});

test('cache-bust sits strictly above live 118 / 86 / 6 / 1', function () {
  const jsVer = html.match(/communication-v2\.js\?v=(\d+)/);
  const cssVer = html.match(/communication-v2\.css\?v=(\d+)/);
  const pwaVer = html.match(/ce2-pwa\.js\?v=(\d+)/);
  const govVer = html.match(/ce2-governance\.js\?v=(\d+)/);
  const searchVer = html.match(/ce2-thread-search\.js\?v=(\d+)/);
  assert.ok(jsVer && Number(jsVer[1]) > 118);
  assert.ok(cssVer && Number(cssVer[1]) > 86);
  assert.ok(pwaVer && Number(pwaVer[1]) > 6);
  assert.ok(govVer && Number(govVer[1]) > 6);
  assert.ok(searchVer && Number(searchVer[1]) > 1);
});

test('validate script includes this test', function () {
  assert.ok(pkg.scripts.validate.indexOf('test-ce2-access-and-composer.js') >= 0);
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed\n');
  process.exit(1);
}
console.log('\n✅ CE2 access + composer tests passed\n');
