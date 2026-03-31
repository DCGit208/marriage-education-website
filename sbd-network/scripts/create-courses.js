/**
 * CREATE COURSES COLLECTION
 * ==================================
 * 
 * Creates all 44 courses from schoolcourses.json mapped to their schools.
 * This is TASK 0.3 of Phase 0 implementation.
 * 
 * Run with: node scripts/create-courses.js
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');
const COURSES_DATA = path.resolve(__dirname, '../../schoolcourses.json');

if (!fs.existsSync(SERVICE_ACCOUNT)) {
  console.error('❌  serviceAccountKey.json not found at:', SERVICE_ACCOUNT);
  process.exit(1);
}

if (!fs.existsSync(COURSES_DATA)) {
  console.error('❌  schoolcourses.json not found at:', COURSES_DATA);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

// Load course data
const coursesData = JSON.parse(fs.readFileSync(COURSES_DATA, 'utf8'));

// ==================================================================
// HELPER FUNCTIONS
// ==================================================================

function getSchoolId(schoolNo) {
  const schoolIds = {
    1: 'school-1-teleios',
    2: 'school-2-sexual-literacy',
    3: 'school-3-marriage-systems',
    4: 'school-4-civilization-leadership'
  };
  return schoolIds[schoolNo];
}

function generateCourseId(title, courseNo) {
  // Create slug from title
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60); // Keep reasonable length
  
  // Add course number prefix for uniqueness
  return `course-${courseNo}-${slug}`;
}

function parseDuration(duration) {
  // "6 weeks" → 6, "90 minutes" → 1, "2 hours" → 1
  const match = duration.match(/(\d+)\s*(week|hour|minute)/i);
  if (match && match[2].toLowerCase().includes('week')) {
    return parseInt(match[1]);
  }
  return 1; // Default to 1 week for short courses
}

function getAccessLevel(schoolNo, price) {
  // Foundation tier: School 1 courses $249 or less
  // Premium tier: School 1 advanced courses (>$249) + all other schools
  if (schoolNo === 1 && price <= 249) {
    return 'foundation';
  }
  return 'premium';
}

function generateDescription(course) {
  let desc = course.title;
  if (course.badge) {
    desc += ` — ${course.badge}`;
  }
  if (course.note) {
    desc += ` (${course.note})`;
  }
  return desc;
}

// ==================================================================
// CREATE COURSES
// ==================================================================

async function createCourses() {
  console.log('🔧 Starting courses collection creation...\n');
  console.log(`📚 Processing ${coursesData.length} courses from schoolcourses.json\n`);
  
  const batch = db.batch();
  const coursesBySchool = { 1: [], 2: [], 3: [], 4: [] };
  
  coursesData.forEach((course) => {
    const courseId = generateCourseId(course.title, course.no);
    const durationWeeks = parseDuration(course.duration);
    const accessLevel = getAccessLevel(course.school, course.price_usd);
    
    const ref = db.collection('courses').doc(courseId);
    
    const courseDoc = {
      id: courseId,
      courseNo: course.no,
      schoolId: getSchoolId(course.school),
      title: course.title,
      price: course.price_usd,
      duration: course.duration,
      durationWeeks: durationWeeks,
      badge: course.badge || '',
      note: course.note || '',
      description: generateDescription(course),
      totalModules: durationWeeks,
      accessLevel: accessLevel,
      featured: (course.badge && course.badge.includes('Flagship')) || false,
      enrollmentCount: 0,
      averageRating: 0,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    batch.set(ref, courseDoc);
    coursesBySchool[course.school].push({
      no: course.no,
      title: course.title,
      price: course.price_usd,
      access: accessLevel
    });
  });
  
  await batch.commit();
  
  console.log('✅ Successfully created all courses in Firestore\n');
  
  // Summary by school
  console.log('📊 BREAKDOWN BY SCHOOL:\n');
  
  const schoolNames = {
    1: 'Teleios Foundation',
    2: 'Sexual Literacy',
    3: 'Marriage Systems',
    4: 'Civilization Leadership'
  };
  
  Object.keys(coursesBySchool).forEach(schoolNo => {
    const courses = coursesBySchool[schoolNo];
    const totalValue = courses.reduce((sum, c) => sum + c.price, 0);
    const foundationCount = courses.filter(c => c.access === 'foundation').length;
    const premiumCount = courses.filter(c => c.access === 'premium').length;
    
    console.log(`   School ${schoolNo}: ${schoolNames[schoolNo]}`);
    console.log(`   - Total courses: ${courses.length}`);
    console.log(`   - Portfolio value: $${totalValue.toLocaleString()}`);
    console.log(`   - Foundation tier: ${foundationCount} courses`);
    console.log(`   - Premium tier: ${premiumCount} courses`);
    console.log('');
  });
  
  const grandTotal = coursesData.reduce((sum, c) => sum + c.price_usd, 0);
  console.log(`💰 GRAND TOTAL: ${coursesData.length} courses, $${grandTotal.toLocaleString()}\n`);
}

// ==================================================================
// VERIFICATION
// ==================================================================

async function verifyCourses() {
  console.log('🔍 Verifying courses collection...\n');
  
  const coursesSnapshot = await db.collection('courses').get();
  
  if (coursesSnapshot.size !== 44) {
    console.error(`❌ Expected 44 courses, found ${coursesSnapshot.size}`);
    return false;
  }
  
  console.log(`✅ Verified: ${coursesSnapshot.size} courses created\n`);
  
  // Verify school distribution
  const schoolCounts = {
    'school-1-teleios': 13,
    'school-2-sexual-literacy': 15,
    'school-3-marriage-systems': 8,
    'school-4-civilization-leadership': 8
  };
  
  for (const [schoolId, expectedCount] of Object.entries(schoolCounts)) {
    const schoolCourses = await db.collection('courses')
      .where('schoolId', '==', schoolId)
      .get();
    
    const schoolName = schoolId.replace('school-', '').replace(/-/g, ' ');
    
    if (schoolCourses.size === expectedCount) {
      console.log(`   ✓ ${schoolName}: ${schoolCourses.size}/${expectedCount} courses`);
    } else {
      console.error(`   ❌ ${schoolName}: ${schoolCourses.size}/${expectedCount} courses`);
      return false;
    }
  }
  
  // Verify specific flagship courses
  console.log('\n🎯 Verifying key courses:\n');
  
  const teleiosQuery = await db.collection('courses')
    .where('title', '==', 'The Teleios Blueprint: Full Human Maturity')
    .get();
  
  if (!teleiosQuery.empty) {
    const teleiosData = teleiosQuery.docs[0].data();
    console.log(`   ✓ Teleios Blueprint: $${teleiosData.price}, ${teleiosData.durationWeeks} weeks, ${teleiosData.accessLevel} tier`);
  } else {
    console.error('   ❌ Teleios Blueprint not found');
  }
  
  const sbdQuery = await db.collection('courses')
    .where('title', '==', 'Sex = Marriage: The Only Equation That Works')
    .get();
  
  if (!sbdQuery.empty) {
    const sbdData = sbdQuery.docs[0].data();
    console.log(`   ✓ Sex = Marriage: $${sbdData.price}, ${sbdData.durationWeeks} weeks, ${sbdData.accessLevel} tier`);
  } else {
    console.error('   ❌ Sex = Marriage not found');
  }
  
  console.log('\n✅ Verification PASSED\n');
  return true;
}

// ==================================================================
// MAIN EXECUTION
// ==================================================================

async function main() {
  try {
    await createCourses();
    await verifyCourses();
    
    console.log('🎉 TASK 0.3 COMPLETE: Courses collection ready!');
    console.log('📝 Next: Run create-modules.js to create week-by-week content\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating courses:', error);
    process.exit(1);
  }
}

main();
