/**
 * build.js — Pre-deploy build script
 * Reads HTML templates from src/pages/, injects the shared nav partial
 * (with the correct "active" tab for each page), writes output to public/.
 *
 * Usage:
 *   node build.js               — build all pages
 *   npm run deploy              — build + firebase deploy --only hosting
 */

const fs   = require('fs');
const path = require('path');
const { syncProductAliases } = require('./scripts/sync-product-aliases');
const { syncShopImages } = require('./scripts/sync-shop-images');

// ── Guardrail: must run from sbd-network/ ──────────────────────────
if (!fs.existsSync(path.join(__dirname, 'src/pages'))) {
  console.error('❌ build.js must be run from the sbd-network/ directory.');
  console.error('   Run: cd /Users/achugustave/Documents/Marriageducation/sbd-network && node build.js');
  process.exit(1);
}

const SRC_DIR      = path.join(__dirname, 'src/pages');
const PARTIAL_PATH = path.join(__dirname, 'src/partials/nav.html');
const PUBLIC_DIR   = path.join(__dirname, 'public');

// data-page value → which data-tab anchor gets the "active" class
const TAB_MAP = {
  home:    'home',
  learn:   'learn',
  boards:  'boards',
  shop:    'shop',
  profile: 'you',
};

function buildNav(pageName) {
  const nav      = fs.readFileSync(PARTIAL_PATH, 'utf8');
  const activeTab = TAB_MAP[pageName] || '';
  if (!activeTab) return nav;

  // Each bn-tab anchor has: class="bn-tab" data-tab="<value>"
  // We swap in "active" on the matching one only.
  return nav.replace(
    `class="bn-tab" data-tab="${activeTab}"`,
    `class="bn-tab active" data-tab="${activeTab}"`
  );
}

const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.html'));
let built   = 0;
let skipped = 0;

for (const file of files) {
  const srcPath  = path.join(SRC_DIR, file);
  const destPath = path.join(PUBLIC_DIR, file);

  let content = fs.readFileSync(srcPath, 'utf8');

  if (!content.includes('<!-- NAV_INJECT -->')) {
    console.log(`⚠  ${file} — no NAV_INJECT marker, skipped`);
    skipped++;
    continue;
  }

  // Read data-page from <body data-page="...">
  const match    = content.match(/<body[^>]*\sdata-page="([^"]*)"/);
  const pageName = match ? match[1] : '';

  const nav = buildNav(pageName);
  content   = content.replace('<!-- NAV_INJECT -->', nav);

  fs.writeFileSync(destPath, content, 'utf8');
  built++;
  console.log(`✓  ${file}  (active tab: ${TAB_MAP[pageName] || 'none'})`);
}

console.log(`\n✅ Built ${built}/${files.length} pages → public/`);
if (skipped) console.log(`   Skipped ${skipped} (no NAV_INJECT marker)`);

try {
  const aliasSync = syncProductAliases();
  console.log(`🔧 Product aliases synced (${aliasSync.aliasCount} entries)`);
  const imgSync = syncShopImages();
  console.log(`🔧 Shop images synced (${imgSync.total} files, ${imgSync.copied} updated)`);
} catch (err) {
  console.error('❌ shop asset sync failed:', err.message);
  process.exit(1);
}

// ── Auto-stamp ALL versioned JS/CSS assets in every built page ────
// Replaces every ?v=<number> on ANY .js or .css reference with the
// current timestamp so browsers ALWAYS fetch the latest file after
// a deploy — not a stale iOS/PWA cache version.
const cssVer = Date.now();

function stampVersions(html) {
  let result = html
    .replace(/\.css\?v=\d+/g, `.css?v=${cssVer}`)
    .replace(/\.js\?v=\d+/g,  `.js?v=${cssVer}`);
  // Inject/update build-version meta tag so sw-update-checker can self-heal
  if (result.includes('<meta name="build-version"')) {
    result = result.replace(
      /<meta name="build-version" content="[^"]*">/,
      `<meta name="build-version" content="${cssVer}">`
    );
  } else {
    result = result.replace(
      '<meta charset="UTF-8">',
      `<meta charset="UTF-8">\n  <meta name="build-version" content="${cssVer}">`
    );
  }
  return result;
}

for (const file of files) {
  const destPath = path.join(PUBLIC_DIR, file);
  if (!fs.existsSync(destPath)) continue;
  let html = fs.readFileSync(destPath, 'utf8');
  const stamped = stampVersions(html);
  if (stamped !== html) fs.writeFileSync(destPath, stamped, 'utf8');
}
console.log(`🔧 All JS/CSS assets version stamped: v${cssVer}`);

// Also update any public-only pages that aren't in src/pages/
const publicFiles = fs.readdirSync(path.join(__dirname, 'public'))
  .filter(f => f.endsWith('.html'));
for (const file of publicFiles) {
  const p = path.join(__dirname, 'public', file);
  let html = fs.readFileSync(p, 'utf8');
  const stamped = stampVersions(html);
  if (stamped !== html) fs.writeFileSync(p, stamped, 'utf8');
}


// Stamps a new version on every build so stale caches are always evicted
// on the next SW activation, without requiring manual version bumps.
const swPath = path.join(__dirname, 'public/service-worker.js');
const swContent = fs.readFileSync(swPath, 'utf8');
const newVersion = `sbd-network-v${Date.now()}`;
const updatedSw = swContent.replace(
  /const CACHE_VERSION = 'sbd-network-v[^']+';/,
  `const CACHE_VERSION = '${newVersion}';`
);
fs.writeFileSync(swPath, updatedSw, 'utf8');
console.log(`\n🔧 SW cache version stamped: ${newVersion}`);

// Write /version.json so the PWA can fetch it fresh from the network
// (bypasses HTML cache entirely — the only reliable way to detect new
// deploys on iOS home screen apps).
const versionJson = JSON.stringify({ version: String(cssVer) });
fs.writeFileSync(path.join(__dirname, 'public/version.json'), versionJson, 'utf8');
console.log(`🔧 version.json written: ${cssVer}`);

