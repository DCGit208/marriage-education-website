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
const publicPages = {
  pricing: read('public/pricing.html'),
  learn: read('public/learn.html'),
  boards: read('public/boards.html'),
  mvHouse: read('public/mv-house.html'),
  shop: read('public/shop.html'),
  dating: read('public/dating.html'),
};
const sourcePages = {
  learn: read('src/pages/learn.html'),
  boards: read('src/pages/boards.html'),
  mvHouse: read('src/pages/mv-house.html'),
  shop: read('src/pages/shop.html'),
  dating: read('src/pages/dating.html'),
};
const js = read('public/js/ask-sbd-guide.js');
const css = read('public/css/ask-sbd-guide.css');
const shopJs = read('public/js/shop.js');
const pkg = JSON.parse(read('package.json'));

function includesVersionedAsset(html, assetPath) {
  const escaped = assetPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped + '\\?v=\\d+').test(html);
}

function loadGuideApi() {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox, { filename: 'ask-sbd-guide.js' });
  return sandbox.SbdAskGuide;
}

console.log('\nASK SBD guided assistant\n');

test('dashboard includes the additive ASK SBD assets', function () {
  assert.ok(
    includesVersionedAsset(dash, '/css/ask-sbd-guide.css'),
    'dashboard must load ASK SBD CSS with a cache-bust'
  );
  assert.ok(
    includesVersionedAsset(dash, '/js/ask-sbd-guide.js'),
    'dashboard must load ASK SBD JS with a cache-bust'
  );
  assert.ok(dash.indexOf('ask-sbd-guide.css') < dash.indexOf('</head>'));
  assert.ok(dash.indexOf('ask-sbd-guide.js') < dash.indexOf('</head>'));
});

test('key public pages include ASK SBD assets', function () {
  Object.keys(publicPages).forEach(function (page) {
    const html = publicPages[page];
    assert.ok(includesVersionedAsset(html, '/css/ask-sbd-guide.css'), page + ' missing ASK SBD CSS');
    assert.ok(includesVersionedAsset(html, '/js/ask-sbd-guide.js'), page + ' missing ASK SBD JS');
    assert.ok(html.indexOf('ask-sbd-guide.css') < html.indexOf('</head>'), page + ' CSS must be in head');
  });
});

test('generated source pages include ASK SBD assets before build', function () {
  Object.keys(sourcePages).forEach(function (page) {
    const html = sourcePages[page];
    assert.ok(html.includes('/css/ask-sbd-guide.css?v=12'), page + ' source missing ASK SBD CSS');
    assert.ok(html.includes('/js/ask-sbd-guide.js?v=12'), page + ' source missing ASK SBD JS');
    assert.ok(html.indexOf('ask-sbd-guide.css') < html.indexOf('</head>'), page + ' source CSS must be in head');
  });
});

test('assistant is scripted and does not introduce AI or network dependencies', function () {
  assert.ok(js.includes('This MVP is intentionally not AI'));
  assert.ok(js.includes('QUESTIONS'));
  assert.ok(js.includes('ADVANCED_TOPICS'));
  assert.strictEqual(/fetch\s*\(/.test(js), false, 'must not call fetch');
  assert.strictEqual(/XMLHttpRequest/.test(js), false, 'must not call XMLHttpRequest');
  assert.strictEqual(/firebase|firestore|openai|gemini|anthropic/i.test(js), false, 'must not depend on backend/AI SDKs');
});

test('front-facing copy avoids technical implementation language', function () {
  [
    'This guide is scripted, not AI.',
    'not live AI',
    'ASK SBD answered',
    'The goal is not to explain',
    'The best onboarding answer',
    'If the user',
    'the user needs',
    'The bot should',
    'The recommendation should',
    'should be explained',
    'This phase uses',
    'implementation phase',
    'how the assistant generated',
    'internal guardrails',
  ].forEach(function (phrase) {
    assert.strictEqual(js.includes(phrase), false, 'public copy must not include internal phrase: ' + phrase);
  });
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
  assert.ok(js.includes('PAGE_CONTEXTS'), 'missing page-aware prompt contexts');
  assert.ok(js.includes('findAdvancedAnswer'), 'missing curated matcher');
  assert.ok(js.includes('details:'), 'advanced topics should include deeper curated guidance');
  assert.ok(js.includes('moreHtml'), 'missing collapsed detail renderer');
  assert.ok(js.includes('relatedTopicsForResult'), 'missing related follow-up selector');
  assert.ok(js.includes('data-ask-sbd-related-id'), 'missing related follow-up chips');
  assert.strictEqual(js.includes("answerAdvanced('where should I start')"), false, 'advanced mode must not auto-render an answer');
  assert.ok(js.includes("els.advancedOutput.innerHTML = ''"), 'advanced output should start empty');
  [
    'marriage-communication',
    'membership-fit',
    'where-start',
    'boards-community',
    'mv-house-expression',
    'courses-certificates',
    'shop-resources',
    'facilitator-help',
    'locked-content',
    'relationship-season',
    'shop-first-buy',
    'shop-course-personal-development',
    'shop-book-recommendation',
    'learn-one-year-formation-pack',
    'advisor-subscription-level',
    'learn-course-start',
    'boards-what-post',
    'pricing-plan-fit',
    'mv-what',
    'dating-what',
    'dating-locked',
    'dating-score',
    'dating-elite',
    'dating-marriage-track',
  ].forEach(function (id) {
    assert.ok(js.includes("id: '" + id + "'"), 'missing advanced topic ' + id);
  });
});

test('page-aware contexts prioritize relevant prompts', function () {
  const api = loadGuideApi();
  assert.strictEqual(api.VERSION, 14);

  const pricing = api.advancedTopicsForContext(api.detectPageContext('/pricing.html'));
  assert.strictEqual(pricing[0].id, 'pricing-plan-fit');
  assert.strictEqual(pricing[1].id, 'advisor-subscription-level');

  const learn = api.advancedTopicsForContext(api.detectPageContext('/learn.html'));
  assert.strictEqual(learn[0].id, 'learn-course-start');
  assert.strictEqual(learn[1].id, 'learn-one-year-formation-pack');

  const boards = api.advancedTopicsForContext(api.detectPageContext('/boards.html'));
  assert.strictEqual(boards[0].id, 'boards-what-post');

  const mvHouse = api.advancedTopicsForContext(api.detectPageContext('/mv-house.html'));
  assert.strictEqual(mvHouse[0].id, 'mv-what');

  const shop = api.advancedTopicsForContext(api.detectPageContext('/shop.html'));
  assert.strictEqual(shop[0].id, 'shop-first-buy');

  const dating = api.advancedTopicsForContext(api.detectPageContext('/dating.html'));
  assert.strictEqual(dating[0].id, 'dating-what');
  assert.strictEqual(dating[1].id, 'dating-locked');

  const datingElite = api.advancedTopicsForContext(api.detectPageContext('/dating.html', '#elite'));
  assert.strictEqual(datingElite[0].id, 'dating-elite');
  assert.strictEqual(datingElite[1].id, 'dating-marriage-track');

  const pricingPremiumSection = api.advancedTopicsForContext(api.detectSectionContext('/pricing.html', 'pricing-premium'));
  assert.strictEqual(pricingPremiumSection[0].id, 'pricing-premium');

  const datingMarriageSection = api.advancedTopicsForContext(api.detectSectionContext('/dating.html', 'dating-marriage-track'));
  assert.strictEqual(datingMarriageSection[0].id, 'dating-marriage-track');
});

test('page markup exposes live section markers for ASK SBD', function () {
  assert.ok(publicPages.pricing.includes('data-ask-sbd-section="pricing-premium"'));
  assert.ok(publicPages.pricing.includes('data-ask-sbd-section="pricing-elite"'));
  assert.ok(sourcePages.dating.includes('data-ask-sbd-section="dating-locked"'));
  assert.ok(sourcePages.dating.includes('data-ask-sbd-section="dating-premium"'));
  assert.ok(sourcePages.dating.includes('data-ask-sbd-section="dating-elite"'));
  assert.ok(sourcePages.dating.includes('data-ask-sbd-section="dating-marriage-track"'));
  assert.ok(sourcePages.boards.includes('data-ask-sbd-section="boards-groups"'));
  assert.ok(sourcePages.shop.includes('data-ask-sbd-section="shop-resources"'));
});

test('live visible section detection selects the strongest visible marker', function () {
  const api = loadGuideApi();
  const doc = {
    documentElement: { clientHeight: 800 },
    querySelectorAll: function () {
      return [
        {
          getAttribute: function () { return 'pricing-premium'; },
          getBoundingClientRect: function () {
            return { top: -300, bottom: 100, height: 400, width: 320 };
          },
        },
        {
          getAttribute: function () { return 'pricing-elite'; },
          getBoundingClientRect: function () {
            return { top: 180, bottom: 620, height: 440, width: 320 };
          },
        },
      ];
    },
  };
  const context = api.detectMarkedSectionContext('/pricing.html', doc);
  assert.strictEqual(api.advancedTopicsForContext(context)[0].id, 'pricing-elite');
});

test('typed advanced answers use current page or section context when the question is vague', function () {
  const api = loadGuideApi();
  const datingLocked = api.detectSectionContext('/dating.html', 'dating-locked');
  assert.strictEqual(api.findAdvancedAnswer('what should I do next here?', datingLocked).id, 'dating-locked');

  const datingElite = api.detectSectionContext('/dating.html', 'dating-elite');
  assert.strictEqual(api.findAdvancedAnswer('what should I do next here?', datingElite).id, 'dating-elite');

  const pricingElite = api.detectSectionContext('/pricing.html', 'pricing-elite');
  assert.strictEqual(api.findAdvancedAnswer('what does elite unlock?', pricingElite).id, 'pricing-elite');

  const shopContext = api.detectPageContext('/shop.html');
  assert.strictEqual(api.findAdvancedAnswer('recommend a course for personal development in shop', shopContext).id, 'shop-course-personal-development');
  assert.strictEqual(api.findAdvancedAnswer('recommend a book for reflection', shopContext).id, 'shop-book-recommendation');
  assert.strictEqual(api.findAdvancedAnswer('I need help with marriage communication', shopContext).id, 'shop-marriage-communication');
  assert.strictEqual(api.findAdvancedAnswer('I need help with my spouse communication', shopContext).id, 'marriage-communication');

  const learnContext = api.detectPageContext('/learn.html');
  assert.strictEqual(api.findAdvancedAnswer('should I choose the one year formation pack?', learnContext).id, 'learn-one-year-formation-pack');

  const pricingContext = api.detectPageContext('/pricing.html');
  assert.strictEqual(api.findAdvancedAnswer('which level should I subscribe to?', pricingContext).id, 'advisor-subscription-level');
});

test('catalog-aware recommendations render real item cards', function () {
  const api = loadGuideApi();
  const personal = api.findAdvancedTopic('shop-course-personal-development');
  assert.strictEqual(personal.catalog[0].title, 'Personal Development MasterClass');
  assert.strictEqual(personal.catalog[0].href, '/checkout.html?product=personal-development-masterclass');
  assert.strictEqual(personal.catalog[0].reviewHref, '/shop.html?section=academy&category=courses_school1&q=Personal%20Development%20MasterClass');
  assert.ok(personal.catalog.some(function (item) { return item.title === 'Teleios Development Bundle'; }));

  const book = api.findAdvancedTopic('shop-book-recommendation');
  assert.strictEqual(book.catalog[0].title, 'SBD for Dummies');
  assert.strictEqual(book.catalog[0].href, '/checkout.html?product=sbd-dummies');
  assert.strictEqual(book.catalog[0].reviewHref, '/shop.html?section=books_magazine&category=books_sbd_series&q=SBD%20for%20Dummies');

  const communication = api.findAdvancedTopic('shop-marriage-communication');
  assert.ok(communication.catalog.some(function (item) { return item.href === '/checkout.html?product=communication-covenant-couples'; }));

  const html = api.advancedAnswerHtml(personal, null, []);
  assert.ok(html.includes('ask-sbd-catalog-card'));
  assert.ok(html.includes('Personal Development MasterClass'));
  assert.ok(html.includes('/shop.html?section=academy&amp;category=courses_school1&amp;q=Personal%20Development%20MasterClass'));
  assert.strictEqual(html.includes('<script>'), false);
});

test('shop accepts review-first recommendation deep links', function () {
  assert.ok(shopJs.includes('function applyShopUrlParams()'));
  assert.ok(shopJs.includes("params.get('section')"));
  assert.ok(shopJs.includes("params.get('category')"));
  assert.ok(shopJs.includes("params.get('q') || params.get('search')"));
  assert.ok(shopJs.includes('searchInput.value = shopSearchQuery'));
});

test('broad questions show clarifying choice flows', function () {
  const api = loadGuideApi();
  const shopContext = api.detectPageContext('/shop.html');
  assert.strictEqual(api.shouldClarifyQuery('what should I buy?'), true);
  assert.strictEqual(api.shouldClarifyQuery('recommend a course for personal development in shop'), false);

  const answer = api.clarifyingAnswerForContext(shopContext);
  assert.strictEqual(answer.id, 'clarify-next-step');
  const choiceIds = answer.choices.map(function (choice) { return choice.topicId; }).join('|');
  assert.strictEqual(choiceIds, 'shop-course-personal-development|shop-book-recommendation|advisor-subscription-level|shop-marriage-communication');

  const html = api.advancedAnswerHtml(answer, null, []);
  assert.ok(html.includes('ask-sbd-choices'));
  assert.ok(html.includes('data-ask-sbd-related-id="shop-book-recommendation"'));
  assert.strictEqual(html.includes('<script>'), false);
});

test('recommendation chip labels stay concise for mobile rows', function () {
  const api = loadGuideApi();
  assert.strictEqual(api.findAdvancedTopic('shop-course-personal-development').prompt, 'Personal development');
  assert.strictEqual(api.findAdvancedTopic('shop-book-recommendation').prompt, 'Book or resource');
  assert.ok(api.findAdvancedTopic('shop-course-personal-development').prompt.length <= 24);
  assert.ok(api.findAdvancedTopic('shop-book-recommendation').prompt.length <= 24);
});

test('first ASK SBD panel is page-aware from open', function () {
  const api = loadGuideApi();

  const pricingContext = api.detectPageContext('/pricing.html');
  const pricingQuick = api.quickItemsForContext(pricingContext);
  assert.ok(pricingContext.intro.includes('membership'));
  assert.strictEqual(pricingQuick[0].id, 'pricing-plan-fit');
  assert.strictEqual(pricingQuick[1].id, 'advisor-subscription-level');

  const learnContext = api.detectPageContext('/learn.html');
  const learnQuick = api.quickItemsForContext(learnContext);
  assert.ok(learnContext.intro.includes('course'));
  assert.strictEqual(learnQuick[0].id, 'learn-course-start');
  assert.strictEqual(learnQuick[1].id, 'learn-one-year-formation-pack');

  const boardsContext = api.detectPageContext('/boards.html');
  const boardsQuick = api.quickItemsForContext(boardsContext);
  assert.ok(boardsContext.intro.includes('community'));
  assert.strictEqual(boardsQuick[0].id, 'boards-what-post');

  const shopContext = api.detectPageContext('/shop.html');
  const shopQuick = api.quickItemsForContext(shopContext);
  assert.ok(shopContext.intro.includes('resources'));
  assert.strictEqual(shopQuick[0].id, 'shop-first-buy');

  const dashboardQuick = api.quickItemsForContext(api.detectPageContext('/dashboard.html'));
  assert.strictEqual(dashboardQuick[0].id, 'what-is');

  const datingContext = api.detectPageContext('/dating.html');
  const datingQuick = api.quickItemsForContext(datingContext);
  assert.ok(datingContext.intro.includes('Covenant Matching'));
  assert.strictEqual(datingQuick[0].id, 'dating-what');
});

test('advanced prompt chips stay in a horizontal swipe row', function () {
  const questionBlock = css.match(/\.ask-sbd-question\s*\{[\s\S]*?\n\}/);
  const promptBlock = css.match(/\.ask-sbd-prompts\s*\{[\s\S]*?\n\}/);
  const chipBlock = css.match(/\.ask-sbd-prompt\s*\{[\s\S]*?\n\}/);
  assert.ok(questionBlock, 'missing quick question style block');
  assert.ok(promptBlock, 'missing advanced prompts style block');
  assert.ok(chipBlock, 'missing advanced prompt chip style block');
  assert.ok(promptBlock[0].includes('overflow-x: auto'), 'prompts should swipe horizontally');
  assert.strictEqual(promptBlock[0].includes('flex-wrap: wrap'), false, 'prompts must not stack into rows');
  assert.ok(chipBlock[0].includes('flex: 0 0 auto'), 'prompt chips should stay in one row');
  assert.ok(questionBlock[0].includes('text-overflow: ellipsis'), 'quick chips should not bleed into neighbors');
  assert.ok(questionBlock[0].includes('overflow: hidden'), 'quick chips should contain long text');
  assert.ok(chipBlock[0].includes('text-overflow: ellipsis'), 'advanced prompt chips should not bleed into neighbors');
  assert.ok(chipBlock[0].includes('overflow: hidden'), 'advanced prompt chips should contain long text');
});

test('answer cards include page-aware related follow-up chips', function () {
  const api = loadGuideApi();
  const shopContext = api.detectPageContext('/shop.html');
  const answer = api.findAdvancedTopic('shop-first-buy');
  const related = api.relatedTopicsForResult(answer, shopContext);
  const relatedIds = related.map(function (topic) { return topic.id; }).join('|');
  assert.strictEqual(relatedIds, 'shop-course-personal-development|shop-book-recommendation|shop-season-resource');
  const html = api.advancedAnswerHtml(answer, null, related);
  assert.ok(html.includes('Related questions'));
  assert.ok(html.includes('data-ask-sbd-related-id="shop-course-personal-development"'));
  assert.strictEqual(html.includes('<script>'), false);

  const relatedBlock = css.match(/\.ask-sbd-related-row\s*\{[\s\S]*?\n\}/);
  const chipBlock = css.match(/\.ask-sbd-related-chip\s*\{[\s\S]*?\n\}/);
  assert.ok(relatedBlock, 'missing related row style block');
  assert.ok(chipBlock, 'missing related chip style block');
  assert.ok(relatedBlock[0].includes('overflow-x: auto'), 'related chips should swipe horizontally');
  assert.ok(chipBlock[0].includes('flex: 0 0 auto'), 'related chips should stay in one row');
  assert.ok(chipBlock[0].includes('text-overflow: ellipsis'), 'related chips should not bleed into neighbors');
  assert.ok(chipBlock[0].includes('overflow: hidden'), 'related chips should contain long text');
  assert.ok(chipBlock[0].includes('max-width: min(72vw, 240px)'), 'related chips should fit small mobile screens');
});

test('answer cards include a compact best next step', function () {
  const api = loadGuideApi();
  const answer = api.findAdvancedTopic('shop-first-buy');
  assert.ok(answer.nextStep, 'page-native answer should include curated next step');
  const html = api.advancedAnswerHtml(answer, null, []);
  assert.ok(html.includes('ask-sbd-next-step'));
  assert.ok(html.includes('Best next step'));
  assert.ok(html.includes('Choose one resource that matches the need you can practice this week.'));
  assert.strictEqual(html.includes('<script>'), false);

  const fallback = api.nextStepHtml({ ctas: [{ label: 'Open Learn', href: '/learn.html' }] });
  assert.ok(fallback.includes('Use the next step below: Open Learn.'));

  const nextStepBlock = css.match(/\.ask-sbd-next-step\s*\{[\s\S]*?\n\}/);
  assert.ok(nextStepBlock, 'missing next-step style block');
  assert.ok(nextStepBlock[0].includes('border-radius'), 'next-step callout should be card-like');
});

test('advanced answers expose deeper guidance only when expanded', function () {
  const api = loadGuideApi();
  const answer = api.findAdvancedAnswer('which membership plan fits me');
  assert.ok(answer.details, 'matched answer should include collapsed detail text');
  const html = api.advancedAnswerHtml(answer, 'which membership plan fits me');
  assert.ok(html.includes('<details class="ask-sbd-more">'));
  assert.ok(html.includes('<summary>Show more</summary>'));
  assert.ok(html.includes('If you are unsure, start with the free preview.'));
  assert.strictEqual(html.includes('Answers are based on approved SBD guidance'), false);
  assert.strictEqual(html.includes('<script>'), false);

  const moreBlock = css.match(/\.ask-sbd-more\s*\{[\s\S]*?\n\}/);
  assert.ok(moreBlock, 'missing collapsed detail style block');
  assert.ok(moreBlock[0].includes('border-top'), 'collapsed detail should be visually separated');
});

test('advanced answer matching and rendering are safe', function () {
  const api = loadGuideApi();
  assert.ok(api, 'missing SbdAskGuide API');
  assert.strictEqual(api.VERSION, 14);
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
  assert.ok(css.includes('.ask-sbd-next-step'));
  assert.ok(css.includes('.ask-sbd-related-chip'));
  assert.ok(css.includes('.ask-sbd-catalog-card'));
  assert.ok(css.includes('.ask-sbd-choice'));
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
