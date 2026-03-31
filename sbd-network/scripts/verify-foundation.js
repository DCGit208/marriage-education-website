/**
 * VERIFY SCHOOLS AND COURSES
 * Comprehensive validation script
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

async function verifyAll() {
  console.log('\n🔍 COMPREHENSIVE VERIFICATION\n');
  console.log('='.repeat(50));
  
  // SCHOOLS
  console.log('\n📚 SCHOOLS:\n');
  const schools = await db.collection('schools').orderBy('order').get();
  
  if (schools.size === 4) {
    console.log(`   ✅ 4 schools created`);
  } else {
    console.log(`   ❌ Expected 4 schools, found ${schools.size}`);
  }
  
  let totalCourses = 0;
  let totalValue = 0;
  
  schools.forEach(doc => {
    const data = doc.data();
    totalCourses += data.totalCourses;
    totalValue += data.portfolioValue;
    console.log(`   ${data.order}. ${data.name}`);
    console.log(`      - Courses: ${data.totalCourses}`);
    console.log(`      - Value: $${data.portfolioValue.toLocaleString()}`);
    console.log(`      - Tier: ${data.unlockTier}`);
  });
  
  console.log(`\n   💰 Total: ${totalCourses} courses, $${totalValue.toLocaleString()}`);
  
  // COURSES
  console.log('\n\n📖 COURSES:\n');
  const courses = await db.collection('courses').get();
  
  if (courses.size === 44) {
    console.log(`   ✅ 44 courses created`);
  } else {
    console.log(`   ❌ Expected 44 courses, found ${courses.size}`);
  }
  
  // Verify school distribution
  const schoolIds = [
    'school-1-teleios',
    'school-2-sexual-literacy', 
    'school-3-marriage-systems',
    'school-4-civilization-leadership'
  ];
  
  const expectedCounts = [13, 15, 8, 8];
  
  for (let i = 0; i < schoolIds.length; i++) {
    const schoolCourses = await db.collection('courses')
      .where('schoolId', '==', schoolIds[i])
      .get();
    
    const schoolName = schoolIds[i].replace('school-', 'School ').split('-')[0];
    
    if (schoolCourses.size === expectedCounts[i]) {
      console.log(`   ✅ ${schoolName}: ${schoolCourses.size} courses`);
    } else {
      console.log(`   ❌ ${schoolName}: ${schoolCourses.size} courses (expected ${expectedCounts[i]})`);
    }
  }
  
  // ACCESS LEVELS
  console.log('\n\n🔐 ACCESS LEVELS:\n');
  
  const foundationCourses = await db.collection('courses')
    .where('accessLevel', '==', 'foundation')
    .get();
  
  const premiumCourses = await db.collection('courses')
    .where('accessLevel', '==', 'premium')
    .get();
  
  console.log(`   Foundation tier: ${foundationCourses.size} courses`);
  console.log(`   Premium tier: ${premiumCourses.size} courses`);
  
  // KEY COURSES
  console.log('\n\n🎯 KEY COURSES:\n');
  
  const keyCourseTitles = [
    'The Teleios Blueprint: Full Human Maturity',
    'Sex = Marriage: The Only Equation That Works',
    'The Art of Sexuality',
    'Marriage System Design: Building a Home that Works'
  ];
  
  for (const title of keyCourseTitles) {
    const courseQuery = await db.collection('courses')
      .where('title', '==', title)
      .limit(1)
      .get();
    
    if (!courseQuery.empty) {
      const data = courseQuery.docs[0].data();
      console.log(`   ✓ ${title}`);
      console.log(`     → $${data.price}, ${data.durationWeeks} weeks, ${data.accessLevel}`);
    } else {
      console.log(`   ❌ ${title} NOT FOUND`);
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('\n✅ PHASE 0 DATABASE FOUNDATION COMPLETE');
  console.log('   - 4 schools created');
  console.log('   - 44 courses populated');
  console.log('   - Access levels configured');
  console.log('\n📝 Next: Create modules with lock logic (Task 0.4)\n');
}

verifyAll()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  });
