/**
 * migrate.js — ONE-TIME script
 * Strips the hardcoded nav block from each public/*.html page,
 * adds <!-- NAV_INJECT --> placeholder + data-page on <body>,
 * and writes the template to src/pages/.
 *
 * Run once: node migrate.js
 * After this, use build.js for ongoing builds.
 */

const fs   = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, 'public');
const OUT_DIR    = path.join(__dirname, 'src/pages');

// page filename → data-page value used by build.js
const PAGE_DATA = {
  'learn.html':    'learn',
  'schools.html':  'learn',
  'courses.html':  'learn',
  'tier.html':     'learn',
  'lesson.html':   'learn',
  'boards.html':   'boards',
  'board.html':    'boards',
  'group.html':    'boards',
  'shop.html':     'shop',
  'profile.html':  'profile',
  'dating.html':   '',
  'dm.html':       '',
  'mv-house.html': '',
  'member.html':   '',
  'explore.html':  '',
};

// Matches from the newline before the hamburger block through ham-nav.js script tag.
// Handles optional <!-- HAMBURGER --> comment before <div id="menuBtn"
const NAV_BLOCK_REGEX = /\n[ \t]*(?:<!-- HAMBURGER -->\n[ \t]*)?<div id="menuBtn"[\s\S]*?<script defer src="\/js\/ham-nav\.js[^"]*"><\/script>[ \t]*/;

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

let migrated = 0;
let skipped  = 0;

for (const [file, dataPage] of Object.entries(PAGE_DATA)) {
  const srcPath  = path.join(PUBLIC_DIR, file);
  const destPath = path.join(OUT_DIR, file);

  if (!fs.existsSync(srcPath)) {
    console.log(`⚠  ${file} — not found in public/, skipping`);
    skipped++;
    continue;
  }

  let content = fs.readFileSync(srcPath, 'utf8');

  if (!NAV_BLOCK_REGEX.test(content)) {
    console.log(`⚠  ${file} — no nav block matched, skipping`);
    skipped++;
    continue;
  }

  // Strip nav block → placeholder
  content = content.replace(NAV_BLOCK_REGEX, '\n\n    <!-- NAV_INJECT -->');

  // Add data-page to <body> if not already there
  if (!/<body[^>]*\sdata-page/.test(content)) {
    content = content.replace(
      /(<body\b)([^>]*>)/,
      `$1 data-page="${dataPage}"$2`
    );
  }

  // Add generator comment after <!DOCTYPE html>
  content = content.replace(
    '<!DOCTYPE html>',
    `<!DOCTYPE html>\n<!-- TEMPLATE: Edit this file in src/pages/${file} — run: node build.js -->`
  );

  fs.writeFileSync(destPath, content, 'utf8');
  migrated++;
  console.log(`✓  ${file}  →  src/pages/${file}  (data-page="${dataPage}")`);
}

console.log(`\n✅ Migrated ${migrated} files. Skipped ${skipped}.`);
console.log(`\nNext step: node build.js`);
