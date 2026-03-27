#!/usr/bin/env node
// bump-sw-version.js
// Bumps the SW cache version AND syncs changelog.json so the What's New
// popup fires automatically for all users on the next app open.
//
// Usage:
//   node scripts/bump-sw-version.js                          (generic "New update" entry)
//   node scripts/bump-sw-version.js --dry-run                (preview, no writes)
//   node scripts/bump-sw-version.js "Title" "Change 1" ...  (custom release notes)
//
// Via deploy.sh:
//   ./deploy.sh                             (generic entry)
//   ./deploy.sh "Boards Tab" "📋 ..."      (custom release notes)

const fs   = require('fs');
const path = require('path');

const SW_PATH        = path.join(__dirname, '..', 'public', 'service-worker.js');
const CHANGELOG_PATH = path.join(__dirname, '..', 'public', 'changelog.json');
const DRY_RUN        = process.argv.includes('--dry-run');

// CLI args (strip flags)
const args    = process.argv.slice(2).filter(a => !a.startsWith('--'));
const title   = args[0] || 'New update';
const changes = args.slice(1);

// ── 1. Bump SW version ──────────────────────────────────────────
const src   = fs.readFileSync(SW_PATH, 'utf8');
const match = src.match(/sbd-network-v(\d+)/);
if (!match) {
  console.error('ERROR: Could not find "sbd-network-vN" in', SW_PATH);
  process.exit(1);
}

const oldVersion = parseInt(match[1], 10);
const newVersion = oldVersion + 1;
const oldTag     = `sbd-network-v${oldVersion}`;
const newTag     = `sbd-network-v${newVersion}`;
const updatedSW  = src.replaceAll(oldTag, newTag);

// ── 2. Sync changelog.json ──────────────────────────────────────
const log = JSON.parse(fs.readFileSync(CHANGELOG_PATH, 'utf8'));

const newEntry = {
  version:  String(newVersion),
  date:     new Date().toISOString().slice(0, 10),
  title,
  emoji:    '🚀',
  changes:  changes.length ? changes : [`🚀 Improvements and fixes in v${newVersion}`],
};

// Prepend new entry; remove any existing entry for the same version (idempotent)
log.versions = [newEntry, ...(log.versions || []).filter(v => String(v.version) !== String(newVersion))];
log.current  = String(newVersion);

// ── 3. Write (or dry-run) ───────────────────────────────────────
if (DRY_RUN) {
  console.log(`[dry-run] Would bump: ${oldTag} → ${newTag}`);
  console.log(`[dry-run] changelog.json current: "${log.current}" entry title: "${title}"`);
} else {
  fs.writeFileSync(SW_PATH, updatedSW, 'utf8');
  fs.writeFileSync(CHANGELOG_PATH, JSON.stringify(log, null, 2) + '\n', 'utf8');
  console.log(`Bumped SW cache: ${oldTag} → ${newTag}`);
  console.log(`Updated changelog.json → v${newVersion}: "${title}"`);
}
