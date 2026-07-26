#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const dest = path.join(repoRoot, 'functions/canon-ai/bundled');

function copyFile(rel) {
  const src = path.join(repoRoot, rel);
  if (!fs.existsSync(src)) return false;
  const out = path.join(dest, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(src, out);
  console.log('  ✓', rel);
  return true;
}

function copyDir(rel) {
  const src = path.join(repoRoot, rel);
  if (!fs.existsSync(src)) return;
  fs.readdirSync(src, { withFileTypes: true }).forEach(function (ent) {
    const child = path.join(rel, ent.name);
    if (ent.isDirectory()) copyDir(child);
    else if (ent.name.endsWith('.md')) copyFile(child);
  });
}

function run() {
  fs.mkdirSync(dest, { recursive: true });
  console.log('Copying canon bundle → functions/canon-ai/bundled/');
  copyFile('SBD-UNIFIED-CANON.md');
  copyDir('docs/canon');
  copyDir('docs/content');
  console.log('Done.');
}

if (require.main === module) run();

module.exports = { run };
