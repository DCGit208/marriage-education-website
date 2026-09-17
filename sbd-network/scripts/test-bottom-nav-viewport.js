/**
 * Unit tests for site-wide bottom-nav visualViewport pinning.
 * Usage: node scripts/test-bottom-nav-viewport.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');

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

function loadViewport() {
  const code = fs.readFileSync(
    path.join(ROOT, 'public/js/bottom-nav-viewport.js'),
    'utf8'
  );
  const sandbox = {
    console: console,
    Math: Math,
    document: undefined,
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'bottom-nav-viewport.js' });
  assert.ok(sandbox.SbdBottomNavViewport, 'SbdBottomNavViewport did not load');
  return sandbox.SbdBottomNavViewport;
}

const api = loadViewport();
const css = fs.readFileSync(path.join(ROOT, 'public/css/bottom-nav.css'), 'utf8');
const ce2 = fs.readFileSync(
  path.join(ROOT, 'public/communication-v2/communication-v2.js'),
  'utf8'
);

console.log('\nBottom nav visualViewport pin\n');

test('occludedBottom is 0 when visual and layout heights match', function () {
  assert.strictEqual(api.occludedBottom({ height: 700, offsetTop: 0 }, 700), 0);
});

test('occludedBottom equals Safari chrome gap when visual viewport shrinks', function () {
  assert.strictEqual(api.occludedBottom({ height: 650, offsetTop: 0 }, 700), 50);
});

test('occludedBottom accounts for visualViewport.offsetTop pan', function () {
  assert.strictEqual(api.occludedBottom({ height: 400, offsetTop: 80 }, 700), 220);
});

test('occludedBottom clamps negative offsetTop', function () {
  assert.strictEqual(api.occludedBottom({ height: 400, offsetTop: -20 }, 700), 300);
});

test('occludedBottom is 0 without visualViewport', function () {
  assert.strictEqual(api.occludedBottom(null, 700), 0);
});

test('navTopPx places the bar at the visual viewport bottom', function () {
  assert.strictEqual(api.navTopPx({ height: 650, offsetTop: 0 }, 80), 570);
  assert.strictEqual(api.navTopPx({ height: 400, offsetTop: 80 }, 80), 400);
});

test('navTopPx is null without visualViewport', function () {
  assert.strictEqual(api.navTopPx(null, 80), null);
});

test('applyBottomNavViewport sets --bn-vv-bottom and top on .bottom-nav', function () {
  const nav = { offsetHeight: 80, style: { top: '', bottom: '' } };
  const root = {
    style: {
      props: {},
      setProperty: function (k, v) { this.props[k] = v; },
    },
  };
  const doc = {
    documentElement: root,
    querySelectorAll: function () { return [nav]; },
  };
  const gap = api.applyBottomNavViewport(
    doc,
    { height: 650, offsetTop: 0 },
    700
  );
  assert.strictEqual(gap, 50);
  assert.strictEqual(root.style.props['--bn-vv-bottom'], '50px');
  assert.strictEqual(nav.style.top, '570px');
  assert.strictEqual(nav.style.bottom, 'auto');
});

test('applyBottomNavViewport skips top pin when nav height is 0', function () {
  const nav = { offsetHeight: 0, style: { top: '1px', bottom: 'auto' } };
  const root = {
    style: {
      props: {},
      setProperty: function (k, v) { this.props[k] = v; },
    },
  };
  const doc = {
    documentElement: root,
    querySelectorAll: function () { return [nav]; },
  };
  api.applyBottomNavViewport(doc, { height: 650, offsetTop: 0 }, 700);
  assert.strictEqual(root.style.props['--bn-vv-bottom'], '50px');
  assert.strictEqual(nav.style.top, '');
  assert.strictEqual(nav.style.bottom, '');
});

test('applyBottomNavViewport no-ops without .bottom-nav', function () {
  const root = {
    style: {
      props: {},
      setProperty: function (k, v) { this.props[k] = v; },
    },
  };
  const doc = {
    documentElement: root,
    querySelectorAll: function () { return []; },
  };
  const gap = api.applyBottomNavViewport(doc, { height: 650, offsetTop: 0 }, 700);
  assert.strictEqual(gap, 0);
  assert.strictEqual(root.style.props['--bn-vv-bottom'], undefined);
});

test('bottom-nav.css exposes --bn-vv-bottom for FAB/toast offset', function () {
  assert.ok(css.includes('--bn-vv-bottom'), 'missing --bn-vv-bottom');
  assert.ok(
    css.includes('var(--bn-vv-bottom, 0px)'),
    'FAB/toast must use --bn-vv-bottom'
  );
});

test('page transitions do not transform <body> (fixed containing block)', function () {
  assert.ok(
    css.includes('.page-enter > *:not(.bottom-nav)'),
    'page-enter must not transform body'
  );
  assert.ok(
    !css.match(/^\.page-enter\s+\{/m),
    'old body-level .page-enter animation must be gone'
  );
});

test('CE2 frozen keyboard path is untouched', function () {
  assert.ok(ce2.includes('function applyViewportPanCounter'));
  assert.ok(ce2.includes('function measureComposerKeyboardLift'));
  assert.ok(ce2.includes('function applyComposerKeyboardLift'));
  assert.ok(ce2.includes('function applyComposerKeyboardInset'));
  assert.ok(
    !ce2.includes('SbdBottomNavViewport'),
    'CE2 must not call site bottom-nav viewport helper'
  );
});

test('nav partial and dashboard load bottom-nav-viewport.js', function () {
  const nav = fs.readFileSync(path.join(ROOT, 'src/partials/nav.html'), 'utf8');
  const dash = fs.readFileSync(path.join(ROOT, 'public/dashboard.html'), 'utf8');
  const boards = fs.readFileSync(path.join(ROOT, 'public/boards.html'), 'utf8');
  assert.ok(nav.includes('bottom-nav-viewport.js'));
  assert.ok(dash.includes('bottom-nav-viewport.js'));
  assert.ok(boards.includes('bottom-nav-viewport.js'));
});

console.log('');
if (failed) {
  console.error('Failed: ' + failed);
  process.exit(1);
}
console.log('All bottom-nav viewport tests passed.');
