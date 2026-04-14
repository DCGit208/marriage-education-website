// Fix Schools 3+4 unlockTier: 'premium' → 'elite'
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');
if (!fs.existsSync(SERVICE_ACCOUNT)) {
  console.error('❌ serviceAccountKey.json not found at:', SERVICE_ACCOUNT);
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT)) });
const db = admin.firestore();

async function fixSchoolTiers() {
  const toFix = ['school-3-marriage-systems', 'school-4-civilization-leadership'];

  console.log('Checking schools before fix...\n');
  for (const id of toFix) {
    const doc = await db.collection('schools').doc(id).get();
    if (!doc.exists) { console.log(`  ⚠️  ${id} — NOT FOUND`); continue; }
    console.log(`  Before: ${id} → unlockTier: '${doc.data().unlockTier}'`);
  }

  console.log('\nApplying fix...\n');
  for (const id of toFix) {
    const ref = db.collection('schools').doc(id);
    const doc = await ref.get();
    if (!doc.exists) { console.log(`  ⚠️  ${id} — skipped (not found)`); continue; }
    await ref.update({ unlockTier: 'elite', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log(`  ✅ ${id} → unlockTier: 'elite'`);
  }

  console.log('\nVerifying after fix...\n');
  for (const id of toFix) {
    const doc = await db.collection('schools').doc(id).get();
    if (!doc.exists) continue;
    const tier = doc.data().unlockTier;
    const status = tier === 'elite' ? '✅' : '❌';
    console.log(`  ${status} ${id} → unlockTier: '${tier}'`);
  }

  console.log('\nDone.');
}

fixSchoolTiers()
  .then(() => process.exit(0))
  .catch(err => { console.error('❌ ERROR:', err); process.exit(1); });
