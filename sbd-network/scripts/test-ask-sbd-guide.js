/**
 * ASK SBD guided assistant regression checks.
 * Usage: node scripts/test-ask-sbd-guide.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
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

const dash = read('public/dashboard.html');
const js = read('public/js/ask-sbd-guide.js');
const css = read('public/css/ask-sbd-guide.css');
const pkg = JSON.parse(read('package.json'));

function loadGuideApi() {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox, { filename: 'ask-sbd-guide.js' });
  return sandbox.SbdAskGuide;
}

console.log('\nASK SBD guided assistant\n');

test('dashboard includes the additive ASK SBD assets', function () {
  assert.ok(
    dash.includes('/css/ask-sbd-guide.css?v=2'),
    'dashboard must load ASK SBD CSS with a cache-bust'
  );
  assert.ok(
    dash.includes('/js/ask-sbd-guide.js?v=2'),
    'dashboard must load ASK SBD JS with a cache-bust'
  );
  assert.ok(dash.indexOf('ask-sbd-guide.css') < dash.indexOf('</head>'));
  assert.ok(dash.indexOf('ask-sbd-guide.js') < dash.indexOf('</head>'));
});

test('assistant is scripted and does not introduce AI or network dependencies', function () {
  assert.ok(js.includes('This MVP is intentionally not AI'));
  assert.ok(js.includes('QUESTIONS'));
  assert.ok(js.includes('approved SBD guidance'));
  assert.strictEqual(/fetch\s*\(/.test(js), false, 'must not call fetch');
  assert.strictEqual(/XMLHttpRequest/.test(js), false, 'must not call XMLHttpRequest');
  assert.strictEqual(/firebase|firestore|openai|gemini|anthropic/i.test(js), false, 'must not depend on backend/AI SDKs');
});

test('front-facing copy avoids technical implementation language', function () {
  assert.strictEqual(js.includes('This guide is scripted, not AI.'), false);
  assert.strictEqual(js.includes('not live AI'), false);
  assert.strictEqual(js.includes('ASK SBD answered'), false);
  assert.ok(js.includes('Quick answers for understanding the platform. Choose a topic, or ask something more specific.'));
  assert.ok(js.includes('Recommended guidance'));
  assert.ok(js.includes('Ask directly, or swipe the prompts for ideas.'));
});

test('assistant covers the core landing-page clarity questions', function () {
  ['what-is', 'membership', 'start', 'boards', 'mv-house', 'shop'].forEach(function (id) {
    assert.ok(js.includes("id: '" + id + "'"), 'missing question ' + id);
  });
  ['/pricing.html', '/learn.html', '/boards.html', '/communication-v2/', '/mv-house.html', '/shop.html'].forEach(function (href) {
    assert.ok(js.includes("href: '" + href) || js.includes('href: "' + href), 'missing CTA ' + href);
  });
});

test('assistant stays closed until explicitly launched', function () {
  assert.ok(js.includes('id="askSbdSheet" hidden'), 'sheet must render hidden by default');
  assert.ok(js.includes('id="askSbdAdvanced" hidden'), 'advanced assistant must render hidden by default');
  assert.ok(js.includes('aria-expanded="false"'), 'launcher must default closed for assistive tech');
  assert.ok(css.includes('.ask-sbd-sheet[hidden]'), 'CSS must preserve hidden sheet state');
  assert.ok(css.includes('.ask-sbd-advanced[hidden]'), 'CSS must preserve hidden advanced state');
  assert.ok(css.includes('bottom: calc(78px + env(safe-area-inset-bottom) + var(--bn-vv-bottom, 0px))'));
});

test('advanced Ask Anything mode is opt-in and curated', function () {
  assert.ok(js.includes('askSbdAdvancedOpen'), 'missing Ask Anything open control');
  assert.ok(js.includes('askSbdForm'), 'missing typed assistant form');
  assert.ok(js.includes('ADVANCED_TOPICS'), 'missing curated advanced topics');
  assert.ok(js.includes('findAdvancedAnswer'), 'missing curated matcher');
  assert.ok(js.includes('details:'), 'advanced topics should include deeper curated guidance');
  assert.ok(js.includes('moreHtml'), 'missing collapsed detail renderer');
  assert.strictEqual(js.includes("answerAdvanced('where should I start')"), false, 'advanced mode must not auto-render an answer');
  assert.ok(js.includes("els.advancedOutput.innerHTML = ''"), 'advanced output should start empty');
  ['marriage-communication', 'membership-fit', 'where-start', 'boards-community', 'mv-house-expression', 'courses-certificates', 'shop-resources', 'facilitator-help'].forEach(function (id) {
    assert.ok(js.includes("id: '" + id + "'"), 'missing advanced topic ' + id);
  });
});

test('advanced prompt chips stay in a horizontal swipe row', function () {
  const promptBlock = css.match(/\.ask-sbd-prompts\s*\{[\s\S]*?\n\}/);
  const chipBlock = css.match(/\.ask-sbd-prompt\s*\{[\s\S]*?\n\}/);
  assert.ok(promptBlock, 'missing advanced prompts style block');
  assert.ok(chipBlock, 'missing advanced prompt chip style block');
  assert.ok(promptBlock[0].includes('overflow-x: auto'), 'prompts should swipe horizontally');
  assert.strictEqual(promptBlock[0].includes('flex-wrap: wrap'), false, 'prompts must not stack into rows');
  assert.ok(chipBlock[0].includes('flex: 0 0 auto'), 'prompt chips should stay in one row');
});

test('advanced answers expose deeper guidance only when expanded', function () {
  const api = loadGuideApi();
  const answer = api.findAdvancedAnswer('which membership plan fits me');
  assert.ok(answer.details, 'matched answer should include collapsed detail text');
  const html = api.advancedAnswerHtml(answer, 'which membership plan fits me');
  assert.ok(html.includes('<details class="ask-sbd-more">'));
  assert.ok(html.includes('<summary>Show more</summary>'));
  assert.ok(html.includes('approved SBD guidance'));
  assert.strictEqual(html.includes('<script>'), false);

  const moreBlock = css.match(/\.ask-sbd-more\s*\{[\s\S]*?\n\}/);
  assert.ok(moreBlock, 'missing collapsed detail style block');
  assert.ok(moreBlock[0].includes('border-top'), 'collapsed detail should be visually separated');
});

test('advanced answer matching and rendering are safe', function () {
  const api = loadGuideApi();
  assert.ok(api, 'missing SbdAskGuide API');
  assert.strictEqual(api.VERSION, 2);
  assert.strictEqual(api.findAdvancedAnswer('I need help with my spouse communication').id, 'marriage-communication');
  assert.strictEqual(api.findAdvancedAnswer('which pricing tier should I use').id, 'membership-fit');
  assert.strictEqual(api.findAdvancedAnswer('tell me about fashion and feminine expression').id, 'mv-house-expression');

  const html = api.advancedAnswerHtml(
    {
      title: '<unsafe>',
      body: 'Body <script>alert(1)</script>',
      ctas: [{ label: '<Go>', href: '/learn.html?x="<bad>"' }],
    },
    '<query>'
  );
  assert.ok(html.includes('&lt;unsafe&gt;'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&quot;&lt;bad&gt;&quot;'));
  assert.strictEqual(html.includes('<script>'), false);
});

test('assistant uses unique classes and does not target frozen navigation surfaces', function () {
  assert.strictEqual(/sideMenu|menuOverlay|ham-drawer|keyboard|ce2-keyboard/i.test(js), false);
  assert.strictEqual(/sideMenu|menuOverlay|ham-drawer|keyboard|ce2-keyboard/i.test(css), false);
  assert.ok(css.includes('.ask-sbd-launcher'));
  assert.ok(css.includes('.ask-sbd-advanced-open'));
  assert.ok(css.includes('.ask-sbd-more'));
  assert.ok(js.includes('root.SbdAskGuide'));
});

test('validate script includes this test', function () {
  assert.ok(pkg.scripts.validate.includes('test-ask-sbd-guide.js'));
  assert.ok(pkg.scripts['test:ask-sbd']);
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed\n');
  process.exit(1);
}
console.log('\n✅ ASK SBD guide tests passed\n');
