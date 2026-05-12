const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

async function run() {
  // Check school-1-teleios courses
  const snap = await db.collection('courses').where('schoolId', '==', 'school-1-teleios').get();
  console.log('\nSchool-1 courses:', snap.size);
  snap.docs.forEach(d => {
    const data = d.data();
    console.log(`  ${d.id} | accessLevel: ${data.accessLevel} | isActive: ${data.isActive} | schoolId: ${data.schoolId}`);
  });

  // Check school doc unlockRequirements
  const school = await db.collection('schools').doc('school-1-teleios').get();
  const sd = school.data();
  console.log('\nSchool-1 doc:');
  console.log('  unlockRequirements:', JSON.stringify(sd.unlockRequirements));
  console.log('  accessLevel:', sd.accessLevel);
  console.log('  unlockTier:', sd.unlockTier);

  // Check a sample user doc to see if progress exists
  const users = await db.collection('users').limit(3).get();
  console.log('\nSample users:');
  users.docs.forEach(d => {
    const data = d.data();
    console.log(`  ${d.id} | tier: ${data.tier || data.subscriptionTier} | hasProgress: ${!!data.progress}`);
  });

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
