/**
 * CLEANUP OLD SCHOOLS
 * Removes incomplete school documents from previous init script
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

// Old school IDs to remove (incomplete data from init-formation-system.js)
const oldSchoolIds = [
  'teleios',
  'sexual-literacy',
  'muliebrity',
  'virility'
];

async function cleanupOldSchools() {
  console.log('🧹 Cleaning up old incomplete school documents...\n');
  
  const batch = db.batch();
  
  oldSchoolIds.forEach(id => {
    const ref = db.collection('schools').doc(id);
    batch.delete(ref);
    console.log(`   ❌ Deleting: ${id}`);
  });
  
  await batch.commit();
  
  console.log('\n✅ Deleted 4 old school documents');
  console.log('✅ Kept 4 new schools (school-1-teleios, school-2-sexual-literacy, etc.)\n');
  
  // Verify final state
  const remaining = await db.collection('schools').get();
  console.log(`📊 Final count: ${remaining.size} schools\n`);
  
  remaining.forEach(doc => {
    const data = doc.data();
    console.log(`   ✓ ${data.name} (${data.totalCourses} courses, $${data.portfolioValue.toLocaleString()})`);
  });
}

cleanupOldSchools()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
