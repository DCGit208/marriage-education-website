#!/usr/bin/env node
/**
 * Extract a Library book pack from ebooks/sbd-for-dummies.pdf
 * → public/data/books/sbd-dummies.json
 *
 * Usage (from repo root Marriageducation/ or sbd-network/):
 *   python3 scripts/extract-sbd-dummies-book.py
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = fs.existsSync(path.join(__dirname, '../ebooks/sbd-for-dummies.pdf'))
  ? path.join(__dirname, '..')
  : path.join(__dirname, '../..');

const script = path.join(__dirname, 'extract-sbd-dummies-book.py');
const r = spawnSync('python3', [script], { cwd: root, stdio: 'inherit' });
process.exit(r.status || 0);
