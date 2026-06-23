#!/usr/bin/env node
/**
 * Build-time manifest of WWM repo markdown for Course Studio repo sync UI.
 * Output: public/data/wwm-repo-manifest.json
 */
'use strict';

const fs = require('fs');
const path = require('path');

const MOD_DIR = path.resolve(__dirname, '../../docs/content/woman-wife-mother/course/modules');
const OUT = path.resolve(__dirname, '../public/data/wwm-repo-manifest.json');
const TOTAL_WEEKS = 13;

function wordCount(text) {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

/** Same hash as studio-repo-sync.js (djb2, normalized). */
function hashText(text) {
  const norm = String(text || '').replace(/\r\n/g, '\n').trim();
  let h = 0;
  for (let i = 0; i < norm.length; i++) {
    h = ((h << 5) - h + norm.charCodeAt(i)) | 0;
  }
  return 'djb2-' + (h >>> 0).toString(16);
}

function main() {
  const weeks = {};
  for (let n = 1; n <= TOTAL_WEEKS; n++) {
    const file = `week-${String(n).padStart(2, '0')}.md`;
    const filePath = path.join(MOD_DIR, file);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const stat = fs.statSync(filePath);
    weeks[String(n)] = {
      file,
      words: wordCount(content),
      hash: hashText(content),
      mtime: stat.mtime.toISOString(),
    };
  }

  const manifest = {
    courseId: 'the-woman-the-wife-the-mother',
    generatedAt: new Date().toISOString(),
    weeks,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`📋 WWM repo manifest → ${path.relative(process.cwd(), OUT)} (${Object.keys(weeks).length} weeks)`);
}

main();
