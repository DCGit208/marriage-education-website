#!/usr/bin/env node
/**
 * Sync recruits_count / directAmbassadorCount to verified downline (recruitedBy) in region.
 *
 * Usage:
 *   node scripts/sync-rd-recruit-counts.js --dry-run
 *   node scripts/sync-rd-recruit-counts.js --rd=RD-AYIN-5087
 */

const admin = require('firebase-admin');
const path = require('path');

const dryRun = process.argv.includes('--dry-run');
const rdFilter = (process.argv.find((a) => a.startsWith('--rd=')) || '').split('=')[1] || '';

admin.initializeApp({
  credential: admin.credential.cert(require(path.resolve(__dirname, '../serviceAccountKey.json')))
});
const db = admin.firestore();

function norm(c) {
  return String(c || '').trim().toUpperCase();
}

function isActivated(id, d) {
  if (!id.startsWith('AMB-')) return false;
  if (String(d.status || '').toLowerCase() === 'merged_duplicate') return false;
  if (d.is_rd_linked_account || d.is_form_intake_only) return false;
  return !!d.activated_at;
}

async function loadRegion(rd) {
  const seen = new Map();
  for (const field of ['rdCode', 'regional_director_code', 'recruitedBy']) {
    const snap = await db.collection('ambassadors').where(field, '==', rd).get();
    snap.forEach((doc) => {
      const d = doc.data();
      if (isActivated(doc.id, d) && !seen.has(doc.id)) seen.set(doc.id, d);
    });
  }
  return seen;
}

async function run() {
  const rd = norm(rdFilter || 'RD-AYIN-5087');
  const members = await loadRegion(rd);
  const ids = [...members.keys()];
  const byId = {};
  ids.forEach((id) => { byId[id] = { id, data: members.get(id) }; });

  let updated = 0;
  for (const id of ids) {
    const actual = ids.filter((otherId) => {
      const d = members.get(otherId);
      return norm(d.recruitedBy || d.recruited_by) === id;
    }).length;
    const d = members.get(id);
    const stored = Number(d.recruits_count != null ? d.recruits_count : d.directAmbassadorCount || 0);
    if (stored === actual) continue;
    console.log(id, (d.fullName || d.name || '').trim(), '|', stored, '→', actual);
    if (!dryRun) {
      await db.collection('ambassadors').doc(id).update({
        recruits_count: actual,
        directAmbassadorCount: actual,
        recruits_count_synced_at: admin.firestore.FieldValue.serverTimestamp(),
        recruits_count_source: 'verified_recruitedBy_region'
      });
    }
    updated++;
  }
  console.log('\n---');
  console.log('Region:', rd, '| ambassadors:', ids.length, '| updated:', updated, dryRun ? '(dry-run)' : '');
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
