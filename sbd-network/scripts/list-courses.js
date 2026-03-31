/**
 * LIST ALL COURSES - Inspection script
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

async function listCourses() {
  const coursesSnapshot = await db.collection('courses').orderBy('courseNo').get();
  
  console.log(`\n📚 Found ${coursesSnapshot.size} courses:\n`);
  
  // Group by prefix pattern
  const oldCourses = [];
  const newCourses = [];
  
  coursesSnapshot.forEach(doc => {
    const data = doc.data();
    const info = {
      id: doc.id,
      no: data.courseNo || 'N/A',
      title: (data.title || '').substring(0, 60),
      school: data.schoolId || 'N/A',
      price: data.price || 'N/A'
    };
    
    if (doc.id.startsWith('course-')) {
      newCourses.push(info);
    } else {
      oldCourses.push(info);
    }
  });
  
  console.log(`📦 OLD COURSES (${oldCourses.length}):\n`);
  oldCourses.slice(0, 10).forEach(c => {
    console.log(`   ${c.id} | ${c.title}`);
  });
  if (oldCourses.length > 10) {
    console.log(`   ... and ${oldCourses.length - 10} more`);
  }
  
  console.log(`\n✨ NEW COURSES (${newCourses.length}):\n`);
  newCourses.slice(0, 10).forEach(c => {
    console.log(`   #${c.no} | ${c.title} | $${c.price}`);
  });
  if (newCourses.length > 10) {
    console.log(`   ... and ${newCourses.length - 10} more`);
  }
}

listCourses()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
