#!/usr/bin/env node
/**
 * Mark duplicate ambassador signup records (same email or phone).
 * Keeps one canonical doc per person; losers get status merged_duplicate + merged_into.
 *
 * Usage:
 *   node scripts/dedupe-ambassador-duplicates.js --dry-run
 *   node scripts/dedupe-ambassador-duplicates.js --rd=RD-AYIN-5087
 *   node scripts/dedupe-ambassador-duplicates.js
 */

const admin = require('firebase-admin');
const path = require('path');

const dryRun = process.argv.includes('--dry-run');
const rdFilter = (process.argv.find((a) => a.startsWith('--rd=')) || '').split('=')[1] || '';

const serviceAccountPath = path.resolve(__dirname, '../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });
const db = admin.firestore();

function normEmail(d) {
  return String((d.email || d.contactEmail) || '').trim().toLowerCase();
}

function normPhone(d) {
  return String(d.phoneE164 || d.phone || d.phoneNumber || '').replace(/\D/g, '');
}

function normName(d) {
  return String(d.fullName || d.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function groupKey(id, d) {
  const phone = normPhone(d);
  const name = normName(d);
  if (phone.length >= 8 && name) return 'person:' + phone + '|' + name;
  const email = normEmail(d);
  if (email) return 'email:' + email;
  if (phone.length >= 8) return 'phone:' + phone;
  if (name) return 'name:' + name;
  return 'id:' + id;
}

function score(id, d) {
  let s = 0;
  if (id.startsWith('AMB-')) s += 10000;
  s += Number(d.recruits_count != null ? d.recruits_count : d.directAmbassadorCount || 0) * 100;
  s += Number(d.accessUnitsDeployed || d.sales_count || d.booksSold || 0) * 10;
  const st = String(d.status || '').toLowerCase();
  if (st === 'active') s += 500;
  if (st === 'approved') s += 200;
  if (st === 'merged_duplicate') s -= 50000;
  const created = d.createdAt;
  if (created && created.toDate) s += created.toDate().getTime() / 1e10;
  return s;
}

function linkedToRd(d, rd) {
  const r = rd.toUpperCase();
  return [d.rdCode, d.regional_director_code, d.recruitedBy, d.recruited_by]
    .map((c) => String(c || '').trim().toUpperCase())
    .includes(r);
}

async function loadDocs() {
  if (rdFilter) {
    const rd = rdFilter.toUpperCase();
    const seen = new Map();
    for (const field of ['rdCode', 'regional_director_code', 'recruitedBy']) {
      const snap = await db.collection('ambassadors').where(field, '==', rd).get();
      snap.forEach((doc) => {
        if (!seen.has(doc.id)) seen.set(doc.id, doc);
      });
    }
    return [...seen.values()];
  }
  const snap = await db.collection('ambassadors').get();
  return snap.docs;
}

async function run() {
  const docs = await loadDocs();
  const groups = {};

  docs.forEach((doc) => {
    const d = doc.data();
    if (String(d.status || '').toLowerCase() === 'merged_duplicate') return;
    if (d.is_rd_linked_account || d.rd_linked_account) return;
    if (rdFilter && !linkedToRd(d, rdFilter)) return;
    const key = groupKey(doc.id, d);
    if (!groups[key]) groups[key] = [];
    groups[key].push({ id: doc.id, data: d, ref: doc.ref });
  });

  let groupsWithDupes = 0;
  let marked = 0;

  for (const [key, members] of Object.entries(groups)) {
    if (members.length < 2) continue;
    groupsWithDupes++;
    members.sort((a, b) => score(b.id, b.data) - score(a.id, a.data));
    const winner = members[0];
    const losers = members.slice(1);

    console.log('\n' + key + ' → keep ' + winner.id + ' (' + (winner.data.fullName || winner.data.name || '') + ')');
    for (const loser of losers) {
      console.log('  merge ' + loser.id + ' → ' + winner.id);
      if (!dryRun) {
        await loser.ref.update({
          status: 'merged_duplicate',
          merged_into: winner.id,
          merged_at: admin.firestore.FieldValue.serverTimestamp(),
          merge_reason: 'duplicate_signup_email_or_phone'
        });
      }
      marked++;
    }
  }

  console.log('\n---');
  console.log('Scope:', rdFilter || 'all ambassadors');
  console.log('Duplicate groups:', groupsWithDupes);
  console.log('Records' + (dryRun ? ' that would be' : '') + ' marked merged_duplicate:', marked);
  if (dryRun) console.log('(dry-run — no writes)');
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
