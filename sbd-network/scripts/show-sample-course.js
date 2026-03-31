/**
 * SAMPLE COURSE DATA
 * Shows actual Firestore document structure
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

async function showSampleCourse() {
  console.log('\n📖 SAMPLE COURSE DATA STRUCTURE\n');
  console.log('='.repeat(80));
  
  // Get a foundation tier course
  const foundationQuery = await db.collection('courses')
    .where('title', '==', 'The Teleios Blueprint: Full Human Maturity')
    .limit(1)
    .get();
  
  if (!foundationQuery.empty) {
    const doc = foundationQuery.docs[0];
    const data = doc.data();
    
    console.log('\n🔓 FOUNDATION TIER COURSE EXAMPLE:\n');
    console.log(`Document ID: ${doc.id}\n`);
    console.log(JSON.stringify(data, null, 2));
  }
  
  // Get a premium tier course
  const premiumQuery = await db.collection('courses')
    .where('title', '==', 'The Art of Sexuality')
    .limit(1)
    .get();
  
  if (!premiumQuery.empty) {
    const doc = premiumQuery.docs[0];
    const data = doc.data();
    
    console.log('\n\n🔒 PREMIUM TIER COURSE EXAMPLE:\n');
    console.log(`Document ID: ${doc.id}\n`);
    console.log(JSON.stringify(data, null, 2));
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Course schema includes:');
  console.log('   - id, courseNo, schoolId (relationships)');
  console.log('   - title, price, duration, durationWeeks (core info)');
  console.log('   - badge, note, description (marketing)');
  console.log('   - totalModules (content structure)');
  console.log('   - accessLevel (foundation/premium tier)');
  console.log('   - featured, enrollmentCount, averageRating (engagement)');
  console.log('   - isActive, createdAt, updatedAt (metadata)\n');
}

showSampleCourse()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  });
