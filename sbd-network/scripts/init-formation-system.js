/**
 * FORMATION SYSTEM INITIALIZATION SCRIPT
 * ==================================
 * 
 * Initializes schools, courses, and modules for the SBD Network formation system.
 * This script EXTENDS the existing database WITHOUT deleting or modifying existing data.
 * 
 * Run with: node scripts/init-formation-system.js
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
// SCHOOLS DATA
// ==================================================================

const schools = [
  {
    id: 'teleios',
    name: 'Teleios School',
    slug: 'teleios',
    description: 'Foundation of identity, wholeness, and maturity. Become who you were designed to be.',
    longDescription: 'The Teleios School is the foundational starting point for all formation. Here you learn the core identity principles that undergird everything else.',
    order: 1,
    icon: '🧠',
    color: '#00bcd4',
    requiredForAccess: null,
    unlockRequirements: {
      completedSchools: [],
      completedCourses: []
    },
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  },
  {
    id: 'sexual-literacy',
    name: 'Sexual Literacy School',
    slug: 'sexual-literacy',
    description: 'Master the design of sexuality. Understand covenant, not culture.',
    longDescription: 'Sexual Literacy teaches you to read and understand sexuality as it was designed - as covenant language, not cultural noise.',
    order: 2,
    icon: '📚',
    color: '#9c27b0',
    requiredForAccess: 'teleios',
    unlockRequirements: {
      completedSchools: [],
      completedCourses: ['teleios-foundation'] // Must at least START Teleios
    },
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  },
  {
    id: 'muliebrity',
    name: 'Muliebrity School',
    slug: 'muliebrity',
    description: 'Feminine excellence and authority. Step into covenant womanhood.',
    longDescription: 'Muliebrity is the advanced school for women who have completed their foundation and are ready to express feminine authority.',
    order: 3,
    icon: '👑',
    color: '#e91e63',
    requiredForAccess: 'sexual-literacy',
    unlockRequirements: {
      completedSchools: ['teleios'],
      completedCourses: ['teleios-foundation', 'sexual-literacy-core']
    },
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  },
  {
    id: 'virility',
    name: 'Virility School',
    slug: 'virility',
    description: 'Masculine authority and leadership. Step into covenant manhood.',
    longDescription: 'Virility is the advanced school for men who have completed their foundation and are ready to express masculine authority.',
    order: 4,
    icon: '⚔️',
    color: '#2196f3',
    requiredForAccess: 'sexual-literacy',
    unlockRequirements: {
      completedSchools: ['teleios'],
      completedCourses: ['teleios-foundation', 'sexual-literacy-core']
    },
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }
];

// ==================================================================
// COURSES DATA
// ==================================================================

const courses = [
  // TELEIOS COURSES
  {
    id: 'teleios-foundation',
    schoolId: 'teleios',
    title: 'Teleios Foundation Course',
    slug: 'teleios-foundation',
    description: '12-week journey to wholeness and mature identity',
    longDescription: 'This course takes you through the foundational principles of identity, authority, and covenant relationships.',
    order: 1,
    accessLevel: 'foundation', // foundation, premium, elite
    isPremium: false,
    isElite: false,
    moduleCount: 12,
    estimatedWeeks: 12,
    instructor: 'Dr. Achu Gustav',
    thumbnail: '/assets/courses/teleios-foundation.jpg',
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  },
  
  // SEXUAL LITERACY COURSES
  {
    id: 'sexual-literacy-core',
    schoolId: 'sexual-literacy',
    title: 'Sexual Literacy Core',
    slug: 'sexual-literacy-core',
    description: 'Learn to read sexuality as design language',
    longDescription: 'Understand the grammar, vocabulary, and syntax of sexual design.',
    order: 1,
    accessLevel: 'premium',
    isPremium: true,
    isElite: false,
    moduleCount: 10,
    estimatedWeeks: 10,
    instructor: 'Dr. Achu Gustav',
    thumbnail: '/assets/courses/sexual-literacy.jpg',
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  },
  
  // MULIEBRITY COURSES
  {
    id: 'muliebrity-expression',
    schoolId: 'muliebrity',
    title: 'Muliebrity Expression',
    slug: 'muliebrity-expression',
    description: 'Advanced feminine formation and expression',
    longDescription: 'Step into the fullness of feminine authority and covenant womanhood.',
    order: 1,
    accessLevel: 'elite',
    isPremium: false,
    isElite: true,
    moduleCount: 8,
    estimatedWeeks: 8,
    instructor: 'Dr. Achu Gustav',
    thumbnail: '/assets/courses/muliebrity.jpg',
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  },
  
  // VIRILITY COURSES
  {
    id: 'virility-authority',
    schoolId: 'virility',
    title: 'Virility Authority',
    slug: 'virility-authority',
    description: 'Advanced masculine formation and leadership',
    longDescription: 'Step into the fullness of masculine authority and covenant manhood.',
    order: 1,
    accessLevel: 'elite',
    isPremium: false,
    isElite: true,
    moduleCount: 8,
    estimatedWeeks: 8,
    instructor: 'Dr. Achu Gustav',
    thumbnail: '/assets/courses/virility.jpg',
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }
];

// ==================================================================
// MODULES DATA (Sample - you'll map to existing boards)
// ==================================================================

const modules = [
  // Teleios Foundation Modules (Weeks 1-12)
  {
    id: 'teleios-week-1',
    courseId: 'teleios-foundation',
    title: 'Week 1: Understanding Identity',
    slug: 'week-1-identity',
    description: 'Who are you designed to be? Understanding core identity.',
    order: 1,
    linkedBoardId: null, // TO BE MAPPED TO EXISTING BOARD
    isLocked: false, // First module always unlocked
    unlockRequirements: {
      previousModuleId: null
    },
    assignment: {
      title: 'Identity Reflection',
      description: 'Write 3 paragraphs reflecting on your current understanding of your identity.',
      submissionRequired: false,
      submissionType: 'text'
    },
    resources: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  },
  {
    id: 'teleios-week-2',
    courseId: 'teleios-foundation',
    title: 'Week 2: Authority & Responsibility',
    slug: 'week-2-authority',
    description: 'Understanding the connection between authority and responsibility.',
    order: 2,
    linkedBoardId: null,
    isLocked: true,
    unlockRequirements: {
      previousModuleId: 'teleios-week-1'
    },
    assignment: {
      title: 'Authority Assessment',
      description: 'Identify areas where you exercise authority and corresponding responsibilities.',
      submissionRequired: false,
      submissionType: 'text'
    },
    resources: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  },
  {
    id: 'teleios-week-3',
    courseId: 'teleios-foundation',
    title: 'Week 3: Covenant Relationships',
    slug: 'week-3-covenant',
    description: 'The foundation of covenant vs. contract thinking.',
    order: 3,
    linkedBoardId: null,
    isLocked: true,
    unlockRequirements: {
      previousModuleId: 'teleios-week-2'
    },
    assignment: null,
    resources: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }
  // ... Add remaining weeks 4-12 as needed
];

// ==================================================================
// INITIALIZATION FUNCTIONS
// ==================================================================

async function initializeSchools() {
  console.log('🏫 Initializing schools...');
  
  for (const school of schools) {
    try {
      await db.collection('schools').doc(school.id).set(school);
      console.log(`✅ Created school: ${school.name}`);
    } catch (error) {
      console.error(`❌ Error creating school ${school.name}:`, error);
    }
  }
}

async function initializeCourses() {
  console.log('\n📚 Initializing courses...');
  
  for (const course of courses) {
    try {
      await db.collection('courses').doc(course.id).set(course);
      console.log(`✅ Created course: ${course.title}`);
    } catch (error) {
      console.error(`❌ Error creating course ${course.title}:`, error);
    }
  }
}

async function initializeModules() {
  console.log('\n📖 Initializing modules...');
  
  for (const module of modules) {
    try {
      await db.collection('modules').doc(module.id).set(module);
      console.log(`✅ Created module: ${module.title}`);
    } catch (error) {
      console.error(`❌ Error creating module ${module.title}:`, error);
    }
  }
}

async function listExistingBoards() {
  console.log('\n🔍 Listing existing boards for manual mapping...');
  
  try {
    const boardsSnapshot = await db.collection('boards').get();
    console.log(`\nFound ${boardsSnapshot.size} existing boards:\n`);
    
    boardsSnapshot.forEach(doc => {
      const board = doc.data();
      console.log(`ID: ${doc.id}`);
      console.log(`Title: ${board.title || 'Untitled'}`);
      console.log(`Description: ${board.description || 'No description'}`);
      console.log(`---`);
    });
    
    console.log('\n📝 Next steps:');
    console.log('1. Map board IDs to module linkedBoardId fields');
    console.log('2. Run update-board-mapping.js script');
    console.log('3. Add schoolId, courseId, moduleId, accessLevel to each board\n');
    
  } catch (error) {
    console.error('❌ Error listing boards:', error);
  }
}

// ==================================================================
// MAIN EXECUTION
// ==================================================================

async function main() {
  console.log('🚀 Starting Formation System Initialization\n');
  console.log('⚠️  This script will CREATE new collections without modifying existing data.\n');
  
  try {
    await initializeSchools();
    await initializeCourses();
    await initializeModules();
    await listExistingBoards();
    
    console.log('\n✨ Initialization complete!');
    console.log('\n📋 Summary:');
    console.log(`- ${schools.length} schools created`);
    console.log(`- ${courses.length} courses created`);
    console.log(`- ${modules.length} sample modules created`);
    console.log('\n⚠️  IMPORTANT NEXT STEPS:');
    console.log('1. Review the board list above');
    console.log('2. Create board mapping configuration');
    console.log('3. Run board update script');
    console.log('4. Test access control functions\n');
    
  } catch (error) {
    console.error('\n❌ Fatal error during initialization:', error);
  } finally {
    process.exit(0);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { schools, courses, modules };
