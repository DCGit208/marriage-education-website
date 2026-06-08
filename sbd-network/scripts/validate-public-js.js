/**
 * Fail fast before deploy if any public JS file has a syntax error.
 * Usage: node scripts/validate-public-js.js
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', 'public');
const SKIP_DIRS = new Set(['node_modules', '.git']);

function collectJsFiles(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      collectJsFiles(full, out);
      continue;
    }
    if (name.endsWith('.js')) out.push(full);
  }
}

const files = [];
collectJsFiles(ROOT, files);
files.sort();

if (!files.length) {
  console.error('❌ No JS files found under public/ — check path.');
  process.exit(1);
}

const failures = [];
for (const file of files) {
  const rel = path.relative(path.join(__dirname, '..'), file);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures.push({
      file: rel,
      detail: (result.stderr || result.stdout || 'Syntax error').trim(),
    });
  }
}

if (failures.length) {
  console.error(`\n❌ JS syntax check failed (${failures.length} file(s)):\n`);
  failures.forEach(({ file, detail }) => {
    console.error(`  • ${file}`);
    console.error(`    ${detail.split('\n')[0]}\n`);
  });
  console.error('Fix syntax errors before deploying. Run: npm run validate');
  process.exit(1);
}

console.log(`✅ JS syntax OK (${files.length} files under public/)`);
