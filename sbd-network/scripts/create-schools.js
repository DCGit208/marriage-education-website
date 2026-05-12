/**
 * CREATE SCHOOLS COLLECTION
 * ==================================
 * 
 * Creates the 4 main schools in the SBD Network formation system.
 * This is TASK 0.2 of Phase 0 implementation.
 * 
 * Run with: node scripts/create-schools.js
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');

if (!fs.existsSync(SERVICE_ACCOUNT)) {
  console.error('❌  serviceAccountKey.json not found at:', SERVICE_ACCOUNT);
  console.error('    It should be at: /Users/achugustave/Documents/Marriageducation/serviceAccountKey.json');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

// ==================================================================
// SCHOOLS DATA (from schoolcourses.json analysis)
// ==================================================================

const schools = [
  {
    id: 'school-1-teleios',
    name: 'Teleios Foundation School',
    order: 1,
    description: 'Personal development and covenant maturity. Build the foundation of wholeness required for all covenant relationships.',
    unlockTier: 'foundation',
    unlockRequirements: [],
    totalCourses: 13,
    portfolioValue: 2843, // $247+$149+$149+$199+$129+$697+$199+$149+$199+$349+$149+$129+$99
    badge: 'Foundational Certificate',
    icon: '🏛️',
    color: '#ff3366'
  },
  {
    id: 'school-2-sexual-literacy',
    name: 'Sexual Literacy School',
    order: 2,
    description: 'Biblical sexuality from Genesis to practice. Understand the design, purpose, and stewardship of sexual intimacy.',
    unlockTier: 'premium',
    unlockRequirements: ['started-school-1'], // Must start Teleios first
    totalCourses: 15,
    portfolioValue: 4306, // $25+$350+$49+$149+$397+$347+$199+$249+$897+$299+$349+$299+$249+$249+$199
    badge: 'Sexual Literacy Certificate',
    icon: '🔥',
    color: '#ff6b9d'
  },
  {
    id: 'school-3-marriage-systems',
    name: 'Marriage Systems School',
    order: 3,
    description: 'Covenant governance, communication, and household management. Build a marriage that works structurally.',
    unlockTier: 'elite',
    unlockRequirements: ['completed-course-sex-by-design'], // Must complete SBD
    totalCourses: 8,
    portfolioValue: 1900, // $297+$249+$349+$199+$179+$199+$149+$279
    badge: 'Marriage Systems Certificate',
    icon: '💍',
    color: '#9d5cff'
  },
  {
    id: 'school-4-civilization-leadership',
    name: 'Civilization Leadership School',
    order: 4,
    description: 'Marriage builds nations. Family systems architecture and generational stability for cultural impact.',
    unlockTier: 'elite',
    unlockRequirements: ['completed-school-3'], // Must complete Marriage Systems
    totalCourses: 8,
    portfolioValue: 2450, // $299+$249+$279+$299+$249+$199+$697+$179
    badge: 'Civilization Leadership Certificate',
    icon: '🏛️',
    color: '#ffd700'
  }
];

// ==================================================================
// CREATE FUNCTION
// ==================================================================

async function createSchools() {
  console.log('🔧 Starting schools collection creation...\n');
  
  const batch = db.batch();
  
  schools.forEach((school, index) => {
    const ref = db.collection('schools').doc(school.id);
    batch.set(ref, {
      ...school,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`   ${index + 1}. ${school.name} (${school.totalCourses} courses, $${school.portfolioValue.toLocaleString()})`);
  });
  
  await batch.commit();
  console.log('\n✅ Successfully created 4 schools in Firestore');
  console.log('📊 Total courses: 44');
  console.log('💰 Total portfolio value: $11,499\n');
}

// ==================================================================
// VERIFICATION FUNCTION
// ==================================================================

async function verifySchools() {
  console.log('🔍 Verifying schools collection...\n');
  
  const schoolsSnapshot = await db.collection('schools').orderBy('order').get();
  
  if (schoolsSnapshot.size !== 4) {
    console.error(`❌ Expected 4 schools, found ${schoolsSnapshot.size}`);
    return false;
  }
  
  let totalCourses = 0;
  let totalValue = 0;
  
  schoolsSnapshot.forEach(doc => {
    const data = doc.data();
    totalCourses += data.totalCourses;
    totalValue += data.portfolioValue;
    console.log(`   ✓ ${data.name}`);
    console.log(`     - ID: ${data.id}`);
    console.log(`     - Courses: ${data.totalCourses}`);
    console.log(`     - Value: $${data.portfolioValue.toLocaleString()}`);
    console.log(`     - Unlock Tier: ${data.unlockTier}`);
    console.log('');
  });
  
  console.log(`✅ Verification PASSED`);
  console.log(`   Total courses: ${totalCourses} (expected 44)`);
  console.log(`   Total value: $${totalValue.toLocaleString()} (expected $11,499)\n`);
  
  return true;
}

// ==================================================================
// MAIN EXECUTION
// ==================================================================

async function main() {
  try {
    await createSchools();
    await verifySchools();
    
    console.log('🎉 TASK 0.2 COMPLETE: Schools collection ready!');
    console.log('📝 Next: Run create-courses.js to populate individual course data\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating schools:', error);
    process.exit(1);
  }
}

main();
