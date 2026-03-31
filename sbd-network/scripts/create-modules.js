const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');

if (!fs.existsSync(SERVICE_ACCOUNT)) {
  console.error('❌ serviceAccountKey.json not found at:', SERVICE_ACCOUNT);
  process.exit(1);
}

const serviceAccount = require(SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Load Foundation School module content from courses-catalogue.json
const cataloguePath = path.join(__dirname, '../../public/courses-catalogue.json');
const catalogue = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));
const foundationCourse = catalogue.find(c => c.courseId === 'foundation-school');

async function createModules() {
  const batch = db.batch();
  let moduleCount = 0;
  
  console.log('Creating modules collection...\n');
  
  // ===============================================
  // FOUNDATION SCHOOL (6 weeks, 100% FREE)
  // ===============================================
  console.log('📚 FOUNDATION SCHOOL (6 modules, 100% free access)');
  
  foundationCourse.modules.forEach((module, index) => {
    const moduleId = `foundation-week-${index + 1}`;
    const ref = db.collection('modules').doc(moduleId);
    
    batch.set(ref, {
      id: moduleId,
      courseId: 'foundation-school',
      schoolId: 'school-1-teleios',
      week: index + 1,
      title: module.title,
      content: module.content,
      duration: '7-9 hours',
      linkedBoardId: `board-${moduleId}`,
      unlockTier: 'free', // Completely free - everyone can access
      accessLevel: 'free',
      order: index + 1,
      reflectionQuestions: module.reflection_questions || [],
      downloads: module.downloads || [],
      isLocked: false,
      lockMessage: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`  ✓ Week ${index + 1}: ${module.title.substring(0, 50)}... [FREE]`);
    moduleCount++;
  });
  
  console.log(`  → 6 modules created (100% accessible)\n`);
  
  // ===============================================
  // TELEIOS BLUEPRINT (6 weeks, 50% ACCESSIBLE)
  // Weeks 1-3: Foundation tier (50% free)
  // Weeks 4-6: Premium tier required (50% locked)
  // ===============================================
  console.log('📚 TELEIOS BLUEPRINT (6 modules, 50% locked)');
  
  const teleiosModules = [
    { week: 1, title: 'Foundations - You Were Created Teleios', accessLevel: 'foundation' },
    { week: 2, title: 'The Four Integrated Faculties', accessLevel: 'foundation' },
    { week: 3, title: 'The Four Attributes of Personal Development', accessLevel: 'foundation' },
    { week: 4, title: 'The Axiomatic Dimensions of Wholeness', accessLevel: 'premium' },
    { week: 5, title: 'The Civilizational Scaling of Teleios', accessLevel: 'premium' },
    { week: 6, title: 'The Teleios Marriage Blueprint', accessLevel: 'premium' }
  ];
  
  teleiosModules.forEach(module => {
    const moduleId = `teleios-week-${module.week}`;
    const ref = db.collection('modules').doc(moduleId);
    
    const isLocked = module.accessLevel === 'premium';
    const lockStatus = isLocked ? '[🔒 LOCKED]' : '[🔓 FREE]';
    
    batch.set(ref, {
      id: moduleId,
      courseId: 'course-1-the-teleios-blueprint-full-human-maturity',
      schoolId: 'school-1-teleios',
      week: module.week,
      title: `Week ${module.week}: ${module.title}`,
      content: '# Module content to be added from book chapters',
      duration: '8-10 hours',
      linkedBoardId: `board-teleios-week-${module.week}`,
      unlockTier: module.accessLevel,
      accessLevel: module.accessLevel,
      order: module.week,
      isLocked,
      lockMessage: isLocked
        ? `🔒 Premium tier required. You've completed 50% of Teleios Blueprint (weeks 1-3). Unlock weeks 4-6 with Premium subscription to complete your certification.`
        : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`  ✓ Week ${module.week}: ${module.title} ${lockStatus}`);
    moduleCount++;
  });
  
  console.log(`  → 6 modules created (3 free, 3 locked = 50% accessible)\n`);
  
  // ===============================================
  // SBD FOR DUMMIES (13 weeks, 30% ACCESSIBLE)
  // Weeks 1-4: Foundation tier (30% free)
  // Weeks 5-13: Premium tier required (70% locked)
  // ===============================================
  console.log('📚 SEX BY DESIGN FOR DUMMIES (13 modules, 70% locked)');
  
  const sbdModules = [
    { week: 1, title: 'Introduction - The Crisis of Sexual Illiteracy', accessLevel: 'foundation' },
    { week: 2, title: 'Chapter 1 - What Is Sex?', accessLevel: 'foundation' },
    { week: 3, title: 'Chapter 2 - Sexual Anthropology Basics', accessLevel: 'foundation' },
    { week: 4, title: 'Chapter 3 - Design Foundations', accessLevel: 'foundation' },
    { week: 5, title: 'Chapter 4 - The Complete Sexual Doctrine', accessLevel: 'premium' },
    { week: 6, title: 'Chapter 5 - Marriage & Sexual Union', accessLevel: 'premium' },
    { week: 7, title: 'Chapter 6 - Procreation & Family Design', accessLevel: 'premium' },
    { week: 8, title: 'Chapter 7 - Pleasure & Desire Theology', accessLevel: 'premium' },
    { week: 9, title: 'Chapter 8 - Gender & Complementarity', accessLevel: 'premium' },
    { week: 10, title: 'Chapter 9 - Fidelity & Covenant Sexuality', accessLevel: 'premium' },
    { week: 11, title: 'Chapter 10 - Sexual Stewardship Practices', accessLevel: 'premium' },
    { week: 12, title: 'Chapter 11 - Cultural Application & Advocacy', accessLevel: 'premium' },
    { week: 13, title: 'Chapter 12 - Mastery Integration & Certification', accessLevel: 'premium' }
  ];
  
  sbdModules.forEach(module => {
    const moduleId = `sbd-week-${module.week}`;
    const ref = db.collection('modules').doc(moduleId);
    
    const isLocked = module.accessLevel === 'premium';
    const lockStatus = isLocked ? '[🔒 LOCKED]' : '[🔓 FREE]';
    
    batch.set(ref, {
      id: moduleId,
      courseId: 'course-14-sex-by-design-for-dummies',
      schoolId: 'school-2-sexual-literacy',
      week: module.week,
      title: `Week ${module.week}: ${module.title}`,
      content: '# Module content to be added from Sex By Design book',
      duration: '6-8 hours',
      linkedBoardId: `board-sbd-week-${module.week}`,
      unlockTier: module.accessLevel,
      accessLevel: module.accessLevel,
      order: module.week,
      isLocked,
      lockMessage: isLocked
        ? `🔒 Premium tier required. You've completed 4 of 13 weeks (30% of SBD for Dummies). Upgrade to Premium to unlock the complete sexual literacy doctrine.`
        : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`  ✓ Week ${module.week}: ${module.title} ${lockStatus}`);
    moduleCount++;
  });
  
  console.log(`  → 13 modules created (4 free, 9 locked = 30% accessible)\n`);
  
  // Commit batch
  await batch.commit();
  
  console.log(`\n✅ SUCCESS: Created ${moduleCount} modules`);
  console.log(`\n📊 BREAKDOWN:`);
  console.log(`   • Foundation School: 6 modules (100% free)`);
  console.log(`   • Teleios Blueprint: 6 modules (50% locked at week 4)`);
  console.log(`   • SBD for Dummies: 13 modules (70% locked at week 5)`);
  console.log(`   • TOTAL: 25 modules\n`);
}

createModules()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ ERROR:', err);
    process.exit(1);
  });
