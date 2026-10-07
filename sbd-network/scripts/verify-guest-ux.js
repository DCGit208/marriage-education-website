/**
 * Guest-facing hosting/auth guards: fail if /pricing 404s, / sends guests
 * to auth, or demo/backup pages stay publicly routable.
 * Usage: node scripts/verify-guest-ux.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function check(name, fn) {
  try {
    fn();
    console.log(`✓  ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
    console.error(`✗  ${name}: ${err.message}`);
  }
}

const firebaseJson = JSON.parse(read('firebase.json'));
const hosting = firebaseJson.hosting;
const redirects = hosting.redirects || [];
const ignore = hosting.ignore || [];

function redirectDest(source) {
  const hit = redirects.find((r) => r.source === source);
  return hit ? hit.destination : null;
}

check('`/` redirects to /dashboard', () => {
  assert.strictEqual(redirectDest('/'), '/dashboard');
});

check('`/index` and `/index.html` redirect to /dashboard (not /auth)', () => {
  assert.strictEqual(redirectDest('/index'), '/dashboard');
  assert.strictEqual(redirectDest('/index.html'), '/dashboard');
});

const legacySources = [
  '/paywall-demo',
  '/paywall-demo.html',
  '/video-preview-demo',
  '/video-preview-demo.html',
  '/dashboard-old',
  '/dashboard-old.html',
  '/mv-house-OLD-BACKUP',
  '/mv-house-OLD-BACKUP.html',
];

check('demo/backup pages redirect off the public tree', () => {
  legacySources.forEach((source) => {
    const dest = redirectDest(source);
    assert.ok(dest === '/dashboard' || dest === '/auth', `${source} missing hosting redirect`);
  });
});

check('demo/backup HTML is ignored by Hosting', () => {
  ['paywall-demo.html', 'video-preview-demo.html', 'dashboard-old.html', 'mv-house-OLD-BACKUP.html']
    .forEach((file) => {
      assert.ok(ignore.includes(file), `${file} not in hosting.ignore`);
    });
});

check('pricing.html exists with live tier messaging', () => {
  const html = read('public/pricing.html');
  assert.ok(html.includes('Choose Your Level of Access'));
  assert.ok(html.includes('Explore'));
  assert.ok(html.includes('$11'));
  assert.ok(html.includes('$20'));
  assert.ok(html.includes('$50'));
  assert.ok(html.includes('data-tier="foundation"'));
  assert.ok(html.includes('data-tier="premium"'));
  assert.ok(html.includes('data-tier="elite"'));
});

check('auth-guard allows `/` and /pricing for guests', () => {
  const src = read('public/js/auth-guard.js');
  assert.ok(src.includes("'/'"), 'missing `/` guest route');
  assert.ok(src.includes("'/pricing'"));
  assert.ok(src.includes('sbdUserId'), 'missing immediate guest bounce');
  assert.ok(src.includes('sbd-auth-pending'));
});

check('firebase.js treats /pricing and /resources as public guest routes', () => {
  const src = read('public/js/firebase.js');
  assert.ok(src.includes("normalized === '/pricing'"));
  assert.ok(src.includes("normalized === '/resources'"));
});

check('certificates hide member chrome until auth', () => {
  const html = read('public/certificates.html');
  assert.ok(html.includes('sbd-auth-pending'));
  assert.ok(/<head[\s\S]*auth-guard\.js[\s\S]*<\/head>/i.test(html), 'auth-guard.js must load in <head>');
  assert.ok(html.includes("visibility: hidden"));
});

check('service worker does not swallow `/` → /dashboard', () => {
  const src = read('public/service-worker.js');
  assert.ok(src.includes('HOSTING_REDIRECT_PATHS'));
  assert.ok(src.includes("'/dashboard-old'"));
  assert.ok(src.includes("url.pathname === '/'") || src.includes("HOSTING_REDIRECT_PATHS.has"));
});

check('index.html sends guests to the public dashboard', () => {
  const html = read('public/index.html');
  assert.ok(html.includes("location.replace('/dashboard')"));
});

if (failures.length) {
  console.error(`\n❌ ${failures.length} guest UX check(s) failed`);
  process.exit(1);
}

console.log('\n✅ Guest UX checks passed');
