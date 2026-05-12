// fix-missing-pages.js — migrate dating.html and mv-house.html
const fs = require('fs');

const files = ['public/dating.html', 'public/mv-house.html'];

// Matches from <!-- HAMBURGER --> through the closing </nav> of the bottom-nav
const NAV_BLOCK = /\n[ \t]*<!-- HAMBURGER -->[\s\S]*?<\/nav>/;
// Matches the stray ham-nav.js script tag at bottom of these pages
const HAM_SCRIPT = /\n[ \t]*<script src="\/js\/ham-nav\.js[^"]*"><\/script>/;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  if (!NAV_BLOCK.test(content)) {
    console.log('WARN: no match in', file);
    return;
  }

  content = content.replace(NAV_BLOCK, '\n\n    <!-- NAV_INJECT -->');
  content = content.replace(HAM_SCRIPT, '');

  if (!/<body[^>]*data-page/.test(content)) {
    content = content.replace(/(<body\b)([^>]*>)/, '$1 data-page=""$2');
  }

  const base = file.replace('public/', '');
  content = content.replace(
    '<!DOCTYPE html>',
    '<!DOCTYPE html>\n<!-- TEMPLATE: Edit in src/pages/' + base + ' — run: node build.js -->'
  );

  const dest = 'src/pages/' + base;
  fs.writeFileSync(dest, content, 'utf8');
  console.log('✓', file, '->', dest);
});

console.log('\nDone. Now run: node build.js');
