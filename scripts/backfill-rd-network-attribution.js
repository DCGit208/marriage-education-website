#!/usr/bin/env node
/**
 * backfill-rd-network-attribution.js
 * Stamps rdCode + regional_director_code on ambassadors missing regional linkage.
 *
 * Usage:
 *   node scripts/backfill-rd-network-attribution.js --dry-run
 *   node scripts/backfill-rd-network-attribution.js
 *   node scripts/backfill-rd-network-attribution.js --rd=RD-AYIN-5087
 */

const admin = require('firebase-admin');
const path = require('path');

const dryRun = process.argv.includes('--dry-run');
const rdFilter = (process.argv.find((a) => a.startsWith('--rd=')) || '').split('=')[1] || '';

const serviceAccountPath = path.resolve(__dirname, '../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });
const db = admin.firestore();

function norm(c) {
  return String(c || '').trim().toUpperCase();
}

function pickRd(...candidates) {
  for (const c of candidates) {
    const v = norm(c);
    if (v.startsWith('RD-')) return v;
  }
  return null;
}

async function resolveRdUpline(ambData, cache) {
  const direct = pickRd(
    ambData.rdCode,
    ambData.regional_director_code,
    ambData.recruited_by_rd,
    ambData.recruitedBy,
    ambData.recruited_by
  );
  if (direct) return direct;

  const seniorCode = norm(ambData.senior_code || ambData.recruited_by_senior);
  if (seniorCode.startsWith('AMB-')) {
    if (cache[seniorCode]) return cache[seniorCode];
    const snap = await db.collection('ambassadors').doc(seniorCode).get();
    if (!snap.exists) return null;
    const s = snap.data();
    const rd = pickRd(s.rdCode, s.regional_director_code, s.recruited_by_rd, s.recruitedBy, s.recruited_by);
    cache[seniorCode] = rd;
    if (rd) return rd;
    return resolveRdUpline(s, cache);
  }
  return null;
}

async function run() {
  const snap = await db.collection('ambassadors').get();
  const cache = {};
  let updated = 0;
  let skipped = 0;
  let noRd = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (norm(data.ambassador_type) === 'regional_director') {
      skipped++;
      continue;
    }

    const existingRd = pickRd(data.rdCode, data.regional_director_code);
    const resolved = await resolveRdUpline(data, cache);
    if (!resolved) {
      noRd++;
      continue;
    }
    if (rdFilter && resolved !== norm(rdFilter)) {
      skipped++;
      continue;
    }
    if (existingRd === resolved && norm(data.regional_director_code) === resolved) {
      skipped++;
      continue;
    }

    console.log(`  ${dryRun ? 'DRY' : 'UPD'} ${doc.id} → rdCode/regional_director_code=${resolved}`);
    if (!dryRun) {
      await doc.ref.update({
        rdCode: resolved,
        regional_director_code: resolved,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    updated++;
  }

  console.log(`\nDone. updated=${updated} skipped=${skipped} no_rd_upline=${noRd}${dryRun ? ' (dry-run)' : ''}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
