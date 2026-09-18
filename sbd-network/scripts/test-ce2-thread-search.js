/**
 * Unit tests for CE2 in-thread search (word / person / day + jump).
 * Usage: node scripts/test-ce2-thread-search.js
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
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      firebase: {
        firestore: {
          Timestamp: {
            fromMillis: function (ms) {
              return { _ms: ms, seconds: Math.floor(ms / 1000) };
            },
          },
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

function testAsync(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(function () {
      console.log('  ok  ' + name);
    })
    .catch(function (err) {
      failed += 1;
      console.error('  FAIL  ' + name);
      console.error('       ' + (err && err.stack ? err.stack.split('\n')[0] : err));
    });
}

console.log('\nCE2 in-thread search\n');
const sandbox = loadIife('public/communication-v2/ce2-thread-search.js');
const ts = sandbox.Ce2ThreadSearch;
assert.ok(ts, 'Ce2ThreadSearch did not load');

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
const actions = fs.readFileSync(
  path.join(ROOT, 'public/communication-v2/ce2-message-actions.js'),
  'utf8'
);
const indexes = fs.readFileSync(path.join(ROOT, 'firestore.indexes.json'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function msg(id, opts) {
  opts = opts || {};
  return {
    id: id,
    senderId: opts.senderId || 'ada',
    content: opts.content || '',
    createdAt: opts.createdAt != null ? opts.createdAt : { seconds: 1700000000 },
    deleted: !!opts.deleted,
    messageType: opts.messageType || 'text',
    boardShare: opts.boardShare || null,
    imageUrl: opts.imageUrl || '',
    audioUrl: opts.audioUrl || '',
  };
}

test('VERSION is 2 and search APIs are exported', function () {
  assert.strictEqual(ts.VERSION, 2);
  assert.strictEqual(typeof ts.searchableText, 'function');
  assert.strictEqual(typeof ts.messageMatches, 'function');
  assert.strictEqual(typeof ts.resolvePersonFilter, 'function');
  assert.strictEqual(typeof ts.dayBounds, 'function');
  assert.strictEqual(typeof ts.runSearch, 'function');
  assert.strictEqual(typeof ts.needsHistoryLoad, 'function');
  assert.ok(ts.MAX_HITS <= 40);
  assert.ok(ts.MAX_SCAN <= 480);
  assert.ok(ts.PAGE_SIZE <= 80);
});

test('searchableText matches content and board-share title/note', function () {
  assert.strictEqual(ts.searchableText(msg('1', { content: 'Hello circle' })), 'Hello circle');
  assert.ok(
    ts
      .searchableText(
        msg('2', {
          content: 'Shared a board post',
          messageType: 'board_share',
          boardShare: { title: 'Week 3 notes', note: 'Please review' },
        })
      )
      .toLowerCase()
      .indexOf('week 3 notes') >= 0
  );
  assert.ok(
    ts
      .searchableText(
        msg('3', {
          content: '',
          boardShare: { title: 'Formation board', note: 'private note' },
        })
      )
      .indexOf('private note') >= 0
  );
  assert.strictEqual(ts.searchableText(msg('4', { content: 'x', deleted: true })), '');
});

test('word match is case-insensitive and ignores deleted', function () {
  const m = msg('1', { content: 'Peace to this Formation' });
  assert.strictEqual(ts.messageMatches(m, { word: 'formation' }), true);
  assert.strictEqual(ts.messageMatches(m, { word: 'FORMATION' }), true);
  assert.strictEqual(ts.messageMatches(m, { word: 'missing' }), false);
  assert.strictEqual(
    ts.messageMatches(msg('2', { content: 'formation', deleted: true }), { word: 'formation' }),
    false
  );
});

test('person filter supports uid, name, and from me', function () {
  const people = [
    { uid: 'me1', name: 'Ada Lovelace', isMe: true },
    { uid: 'u2', name: 'Ben Smith' },
  ];
  assert.strictEqual(ts.resolvePersonFilter('from me', people, 'me1').uid, 'me1');
  assert.strictEqual(ts.resolvePersonFilter('me', people, 'me1').uid, 'me1');
  assert.strictEqual(ts.resolvePersonFilter('Ben', people, 'me1').uid, 'u2');
  assert.strictEqual(ts.resolvePersonFilter('u2', people, 'me1').uid, 'u2');
  assert.strictEqual(ts.resolvePersonFilter('', people, 'me1').uid, '');
  assert.strictEqual(ts.resolvePersonFilter('Nobody', people, 'me1').unmatched, true);
  assert.strictEqual(
    ts.messageMatches(msg('1', { senderId: 'u2', content: 'hi' }), {
      word: 'hi',
      senderId: 'me1',
    }),
    false
  );
  assert.strictEqual(
    ts.messageMatches(msg('2', { senderId: 'me1', content: 'hi' }), {
      word: 'hi',
      senderId: 'me1',
    }),
    true
  );
});

test('date bounds are a local calendar day', function () {
  const b = ts.dayBounds('2026-03-15');
  assert.ok(b);
  assert.strictEqual(b.endMs - b.startMs, 86400000);
  const start = new Date(b.startMs);
  assert.strictEqual(start.getHours(), 0);
  assert.strictEqual(start.getDate(), 15);
  assert.strictEqual(ts.dayBounds('nope'), null);
  const onDay = msg('1', {
    content: 'that day',
    createdAt: { seconds: Math.floor(b.startMs / 1000) + 3600 },
  });
  const offDay = msg('2', {
    content: 'that day',
    createdAt: { seconds: Math.floor(b.endMs / 1000) + 10 },
  });
  assert.strictEqual(
    ts.messageMatches(onDay, { word: 'that day', startMs: b.startMs, endMs: b.endMs }),
    true
  );
  assert.strictEqual(
    ts.messageMatches(offDay, { word: 'that day', startMs: b.startMs, endMs: b.endMs }),
    false
  );
});

test('empty search is idle; unmatched person is a clear empty state', function () {
  assert.strictEqual(ts.hasActiveFilters({}), false);
  assert.strictEqual(ts.statusCopy({ status: 'idle', hits: [] }), ts.idleCopy());
  assert.ok(/Type a word/.test(ts.idleCopy()));
  assert.ok(/No messages match/.test(ts.statusCopy({ status: 'empty', hits: [] })));
  assert.ok(
    /participant/.test(ts.statusCopy({ status: 'empty', reason: 'person', hits: [] }))
  );
});

test('snippets stay short and include the hit', function () {
  const long = 'aaaa ' + 'word'.repeat(40) + ' target-term sits here in the rest of the line';
  const snip = ts.snippet(long, 'target-term', 40);
  assert.ok(snip.length <= 44);
  assert.ok(snip.toLowerCase().indexOf('target') >= 0);
});

test('hit list is capped', function () {
  const many = [];
  for (let i = 0; i < 80; i++) {
    many.push(
      msg('m' + i, {
        content: 'peace',
        createdAt: { seconds: 1700000000 + i },
      })
    );
  }
  const hits = ts.collectHits(many, { word: 'peace' }, {}, 'me', 40);
  assert.strictEqual(hits.length, 40);
});

test('needsHistoryLoad is true only when the hit is not already loaded', function () {
  assert.strictEqual(ts.needsHistoryLoad({ id: 'old-1' }, ['a', 'b']), true);
  assert.strictEqual(ts.needsHistoryLoad({ id: 'a' }, ['a', 'b']), false);
  assert.strictEqual(ts.needsHistoryLoad(null, ['a']), false);
});

test('search plan stays bounded (no whole-database scan)', function () {
  const open = ts.searchPlan({ word: 'grace' });
  assert.ok(open.maxScan <= 480);
  assert.ok(open.pageSize <= 80);
  assert.ok(open.maxHits <= 40);
  const dated = ts.searchPlan({
    word: 'grace',
    startMs: 1,
    endMs: 2,
    senderId: 'u2',
  });
  assert.ok(dated.maxScan <= 240);
  assert.strictEqual(dated.senderId, 'u2');
});

Promise.resolve()
  .then(function () {
    return testAsync('runSearch returns idle when filters are empty', function () {
      return ts.runSearch({ query: {}, loadedMessages: [msg('1', { content: 'hi' })] }).then(
        function (result) {
          assert.strictEqual(result.status, 'idle');
          assert.ok(Array.isArray(result.hits));
          assert.strictEqual(result.hits.length, 0);
        }
      );
    });
  })
  .then(function () {
    return testAsync('runSearch matches loaded messages and caps Firestore pages', function () {
      const loaded = [
        msg('new', {
          content: 'grace today',
          senderId: 'ada',
          createdAt: { seconds: 200 },
        }),
        msg('mid', {
          content: 'nope',
          senderId: 'ben',
          createdAt: { seconds: 150 },
        }),
      ];
      const pages = [
        {
          docs: [
            {
              id: 'old',
              data: function () {
                return {
                  content: 'grace yesterday',
                  senderId: 'ada',
                  createdAt: { seconds: 50 },
                };
              },
            },
          ],
        },
        { docs: [] },
      ];
      let calls = 0;
      return ts
        .runSearch({
          query: { word: 'grace' },
          loadedMessages: loaded,
          messagesCol: { _fake: true },
          meUid: 'me',
          namesByUid: { ada: 'Ada' },
          queryPage: function () {
            calls += 1;
            return Promise.resolve(pages[calls - 1] || { docs: [] });
          },
        })
        .then(function (result) {
          assert.strictEqual(result.status, 'ok');
          assert.strictEqual(result.hits.length, 2);
          assert.strictEqual(result.hits[0].id, 'new');
          assert.strictEqual(result.hits[0].senderLabel, 'Ada');
          assert.ok(result.hits[0].snippet.toLowerCase().indexOf('grace') >= 0);
          assert.ok(calls >= 1);
          assert.ok(calls <= 2);
        });
    });
  })
  .then(function () {
    return testAsync('person + day query pages include sender and createdAt bounds', function () {
      const bounds = ts.dayBounds('2026-01-02');
      let planSeen = null;
      return ts
        .runSearch({
          query: {
            word: 'hello',
            senderId: 'ada',
            startMs: bounds.startMs,
            endMs: bounds.endMs,
          },
          loadedMessages: [],
          messagesCol: { _fake: true },
          queryPage: function (col, plan) {
            planSeen = plan;
            return Promise.resolve({ docs: [] });
          },
        })
        .then(function (result) {
          assert.strictEqual(result.status, 'empty');
          assert.strictEqual(planSeen.senderId, 'ada');
          assert.strictEqual(planSeen.startMs, bounds.startMs);
          assert.strictEqual(planSeen.endMs, bounds.endMs);
        });
    });
  })
  .then(function () {
    test('thread chrome has word, person, day, and hit list controls', function () {
      assert.ok(html.indexOf('id="ce2ThreadSearchToggle"') >= 0);
      assert.ok(html.indexOf('id="ce2ThreadSearchInput"') >= 0);
      assert.ok(html.indexOf('id="ce2ThreadSearchPerson"') >= 0);
      assert.ok(html.indexOf('id="ce2ThreadSearchDay"') >= 0);
      assert.ok(html.indexOf('id="ce2ThreadSearchHits"') >= 0);
      assert.ok(html.indexOf('id="ce2ThreadSearchStatus"') >= 0);
      assert.ok(/ce2-thread-search\.js\?v=\d+/.test(html));
      assert.ok(/Type a word, pick a person, or choose a day/.test(html));
    });

    test('cache-bust sits strictly above live 111 / 81', function () {
      const jsVer = html.match(/communication-v2\.js\?v=(\d+)/);
      const cssVer = html.match(/communication-v2\.css\?v=(\d+)/);
      const searchVer = html.match(/ce2-thread-search\.js\?v=(\d+)/);
      const actionsVer = html.match(/ce2-message-actions\.js\?v=(\d+)/);
      assert.ok(jsVer && Number(jsVer[1]) > 111);
      assert.ok(cssVer && Number(cssVer[1]) > 81);
      assert.ok(searchVer && Number(searchVer[1]) >= 2);
      assert.ok(actionsVer && Number(actionsVer[1]) > 23);
    });

    test('jump loads history when the hit is outside the current window', function () {
      assert.ok(v2.indexOf('function ensureSearchHitVisible') >= 0);
      assert.ok(v2.indexOf('function loadSearchJumpWindow') >= 0);
      assert.ok(v2.indexOf('function messagesCollection') >= 0);
      assert.ok(v2.indexOf("collection('ce2_messages')") >= 0);
      assert.ok(v2.indexOf('searchJumpMessages') >= 0);
      assert.ok(v2.indexOf('ce2SearchJumpBack') >= 0);
      assert.ok(v2.indexOf('initCe2ThreadSearch') >= 0);
      assert.ok(v2.indexOf('loadSearchJumpWindow(hit)') >= 0);
      assert.ok(v2.indexOf('var JUMP_FORWARD_MAX_PAGES = 0') >= 0);
    });

    test('person filter is filled from DM peer and group members', function () {
      assert.ok(v2.indexOf('function listThreadSearchParticipants') >= 0);
      assert.ok(v2.indexOf('function hydrateThreadSearchParticipants') >= 0);
      assert.ok(v2.indexOf("ac.type === 'direct'") >= 0);
      assert.ok(v2.indexOf("ac.type === 'group'") >= 0);
      assert.ok(v2.indexOf('memberIds') >= 0);
    });

    test('search styles cover hits, empty, and highlight', function () {
      assert.ok(/\.ce2-thread-search-hits/.test(css));
      assert.ok(/\.ce2-thread-search-status\.is-empty/.test(css));
      assert.ok(/\.ce2-thread-search-hit-snip/.test(css));
      assert.ok(/ce2-hit-flash/.test(css));
      assert.ok(/\.ce2-row\.is-highlighted/.test(css));
    });

    test('composite senderId + createdAt index is declared for Hosting deploys', function () {
      const parsed = JSON.parse(indexes);
      const found = parsed.indexes.some(function (idx) {
        if (idx.collectionGroup !== 'ce2_messages') return false;
        const paths = (idx.fields || []).map(function (f) {
          return f.fieldPath + ':' + (f.order || '');
        });
        return (
          paths.indexOf('senderId:ASCENDING') >= 0 &&
          paths.indexOf('createdAt:DESCENDING') >= 0
        );
      });
      assert.ok(found, 'missing ce2_messages senderId + createdAt index');
    });

    test('message-actions still opens Find in chat and now runs thread search', function () {
      const src = fs.readFileSync(
        path.join(ROOT, 'public/communication-v2/ce2-message-actions.js'),
        'utf8'
      );
      assert.ok(src.indexOf("item('search', 'Find in chat'") >= 0, 'Find in chat menu');
      assert.ok(src.indexOf('Ce2ThreadSearch.scheduleSearch') >= 0, 'scheduleSearch hook');
      assert.ok(src.indexOf('Ce2ThreadSearch.onOpen') >= 0, 'onOpen hook');
      assert.ok(src.indexOf('Ce2ThreadSearch.onClose') >= 0, 'onClose hook');
      assert.ok(src.indexOf('messageMatches') >= 0, 'messageMatches hook');
    });

    test('does not rewrite frozen keyboard, delivery, audio, or inbox mute/pin', function () {
      assert.ok(v2.indexOf('function applyViewportPanCounter') >= 0);
      assert.ok(v2.indexOf('function applyComposerKeyboardLift') >= 0);
      assert.ok(v2.indexOf('function measureComposerKeyboardLift') >= 0);
      assert.ok(v2.indexOf('function applyComposerKeyboardInset') >= 0);
      assert.ok(v2.indexOf('ce2-keyboard-stable-v60') >= 0);
      assert.ok(v2.indexOf('ce2-delivery-stable-v90') >= 0);
      assert.ok(v2.indexOf('ce2-audio-stable-1d') >= 0);
      assert.ok(v2.indexOf('function handleMetaMessageDelivery') >= 0);
      assert.ok(v2.indexOf('ma.syncReactionsRow') >= 0);
      assert.ok(v2.indexOf('bindInboxGestures') >= 0);
      assert.ok(v2.indexOf('inboxPrefs') >= 0);
      const inboxVer = html.match(/ce2-inbox\.js\?v=(\d+)/);
      assert.ok(inboxVer && Number(inboxVer[1]) >= 1);
    });

    test('validate script includes the thread-search test', function () {
      assert.ok(pkg.scripts.validate.indexOf('test-ce2-thread-search.js') >= 0);
    });
  })
  .then(function () {
    if (failed) {
      console.error('\n' + failed + ' test(s) failed\n');
      process.exit(1);
    }
    console.log('\n✅ CE2 in-thread search tests passed\n');
  });
