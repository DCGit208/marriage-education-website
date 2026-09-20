/**
 * PWA home launch drawer guard.
 * Usage: node scripts/test-pwa-drawer-launch.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

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
const hamCss = read('public/css/ham-drawer.css');
const pkg = JSON.parse(read('package.json'));

console.log('\nPWA drawer launch guard\n');

test('dashboard includes an inline first-paint guard before drawer markup', function () {
  const guardIndex = dash.indexOf('ham-drawer-first-paint-guard');
  const drawerIndex = dash.indexOf('id="sideMenu"');
  assert.ok(guardIndex > 0, 'missing first-paint guard');
  assert.ok(drawerIndex > guardIndex, 'guard must appear before the drawer markup');
  assert.ok(
    dash.includes('#sideMenu.side-menu.ham-drawer:not(.open)'),
    'guard must target the closed drawer'
  );
  assert.ok(
    dash.includes('translate3d(-105%, 0, 0) !important'),
    'closed drawer must be forced off canvas before full CSS loads'
  );
  assert.ok(dash.includes('visibility: hidden'), 'closed drawer must be invisible');
  assert.ok(dash.includes('pointer-events: none'), 'closed drawer must not catch taps');
});

test('shared ham-drawer CSS keeps the closed drawer invisible/off-canvas', function () {
  const closed = hamCss.match(/\.side-menu\.ham-drawer\s*\{[\s\S]*?\n\}/);
  assert.ok(closed, 'missing closed ham-drawer block');
  assert.ok(closed[0].includes('transform: translateX(-105%)'));
  assert.ok(closed[0].includes('visibility: hidden'));
  assert.ok(closed[0].includes('pointer-events: none'));

  const open = hamCss.match(/\.side-menu\.ham-drawer\.open\s*\{[\s\S]*?\n\}/);
  assert.ok(open, 'missing open ham-drawer block');
  assert.ok(open[0].includes('transform: translateX(0)'));
  assert.ok(open[0].includes('visibility: visible'));
  assert.ok(open[0].includes('pointer-events: auto'));
});

test('dashboard cache-busts ham-drawer.css above the launch-flash baseline', function () {
  const match = dash.match(/ham-drawer\.css\?v=(\d+)/);
  assert.ok(match, 'missing ham-drawer.css cache-bust');
  assert.ok(Number(match[1]) > 1789601192648, 'ham-drawer cache-bust must advance');
});

test('validate script includes this test', function () {
  assert.ok(pkg.scripts.validate.includes('test-pwa-drawer-launch.js'));
  assert.ok(pkg.scripts['test:pwa-drawer-launch']);
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed\n');
  process.exit(1);
}
console.log('\n✅ PWA drawer launch tests passed\n');
