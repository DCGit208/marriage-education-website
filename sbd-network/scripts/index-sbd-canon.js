#!/usr/bin/env node
'use strict';

/**
 * Full SBD canon index — repo markdown + courses-catalogue + Firestore LMS.
 * Requires: firebase login / GOOGLE_APPLICATION_CREDENTIALS + gemini API key.
 *
 *   export GEMINI_API_KEY=...
 *   node sbd-network/scripts/index-sbd-canon.js
 *   node sbd-network/scripts/index-sbd-canon.js --force
 */
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');
process.chdir(repoRoot);

require(path.join(repoRoot, 'scripts/copy-canon-bundle.js')).run();

const admin = require('firebase-admin');
const { runFullIndex } = require(path.join(repoRoot, 'functions/canon-ai/indexer'));

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'marriage-education' });
}

const force = process.argv.includes('--force');

console.log('Starting SBD canon full index…');
console.log('Repo root:', repoRoot);

runFullIndex(admin.firestore(), { repoRoot, force })
  .then(function (r) {
    console.log('\n✅ Index complete');
    console.log('  Sources:', r.totalSources);
    console.log('  Indexed:', r.indexed, '| Skipped:', r.skipped);
    console.log('  Chunks:', r.chunks);
    if (r.errors.length) {
      console.log('  Errors:', r.errors.length);
      r.errors.slice(0, 8).forEach(function (e) {
        console.log('   -', e.sourceKey, e.error);
      });
    }
    process.exit(r.errors.length ? 1 : 0);
  })
  .catch(function (err) {
    console.error('Index failed:', err.message || err);
    process.exit(1);
  });
