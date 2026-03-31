/**
 * LIST SCHOOLS - Quick inspection script
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

async function listSchools() {
  const schoolsSnapshot = await db.collection('schools').get();
  
  console.log(`\n📚 Found ${schoolsSnapshot.size} schools:\n`);
  
  schoolsSnapshot.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id}`);
    console.log(`   Name: ${data.name || 'N/A'}`);
    console.log(`   Order: ${data.order || 'N/A'}`);
    console.log(`   Courses: ${data.totalCourses || data.moduleCount || 'N/A'}`);
    console.log(`   Unlock: ${data.unlockTier || data.accessLevel || 'N/A'}`);
    console.log('');
  });
}

listSchools()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
