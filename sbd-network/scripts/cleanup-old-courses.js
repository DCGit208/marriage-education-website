/**
 * CLEANUP OLD COURSES
 * Removes courses not belonging to the 4 official schools
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

const VALID_SCHOOL_IDS = [
  'school-1-teleios',
  'school-2-sexual-literacy',
  'school-3-marriage-systems',
  'school-4-civilization-leadership'
];

async function cleanupOldCourses() {
  console.log('🧹 Cleaning up old course documents...\n');
  
  const allCourses = await db.collection('courses').get();
  console.log(`📚 Found ${allCourses.size} total courses\n`);
  
  const toDelete = [];
  const toKeep = [];
  
  allCourses.forEach(doc => {
    const data = doc.data();
    const schoolId = data.schoolId;
    
    if (VALID_SCHOOL_IDS.includes(schoolId)) {
      toKeep.push({ id: doc.id, title: data.title });
    } else {
      toDelete.push({ id: doc.id, title: data.title || 'N/A', schoolId: schoolId || 'N/A' });
    }
  });
  
  console.log(`✓ Keeping: ${toKeep.length} courses (belong to official schools)`);
  console.log(`❌ Deleting: ${toDelete.length} courses (orphaned/old)\n`);
  
  if (toDelete.length === 0) {
    console.log('✅ No cleanup needed - all courses are valid!\n');
    return;
  }
  
  console.log('🗑️  Courses to delete:\n');
  toDelete.slice(0, 10).forEach(c => {
    console.log(`   - ${c.id} | ${c.title.substring(0, 50)} | School: ${c.schoolId}`);
  });
  if (toDelete.length > 10) {
    console.log(`   ... and ${toDelete.length - 10} more\n`);
  }
  
  // Delete in batches
  const batchSize = 500;
  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = db.batch();
    const chunk = toDelete.slice(i, i + batchSize);
    
    chunk.forEach(course => {
      const ref = db.collection('courses').doc(course.id);
      batch.delete(ref);
    });
    
    await batch.commit();
    console.log(`   Deleted batch ${Math.floor(i / batchSize) + 1}`);
  }
  
  console.log(`\n✅ Deleted ${toDelete.length} old course documents`);
  console.log(`✅ Kept ${toKeep.length} official courses\n`);
  
  // Verify final state
  const remaining = await db.collection('courses').get();
  console.log(`📊 Final count: ${remaining.size} courses\n`);
}

cleanupOldCourses()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
