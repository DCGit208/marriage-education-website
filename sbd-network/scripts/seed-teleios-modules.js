// Seed Teleios Blueprint 6 modules into Firestore
// All 6 weeks are Foundation-tier (full course accessible at foundation+)
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');
if (!fs.existsSync(SERVICE_ACCOUNT)) {
  console.error('❌ serviceAccountKey.json not found at:', SERVICE_ACCOUNT);
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT)) });
const db = admin.firestore();

const TELEIOS_MODULES = [
  { week: 1, title: 'Foundations — You Were Created Teleios',          accessLevel: 'foundation' },
  { week: 2, title: 'The Four Integrated Faculties',                   accessLevel: 'foundation' },
  { week: 3, title: 'The Four Attributes of Personal Development',     accessLevel: 'foundation' },
  { week: 4, title: 'The Axiomatic Dimensions of Wholeness',           accessLevel: 'foundation' },
  { week: 5, title: 'The Civilizational Scaling of Teleios',           accessLevel: 'foundation' },
  { week: 6, title: 'The Teleios Marriage Blueprint',                  accessLevel: 'foundation' },
];

async function seedTeleiosModules() {
  console.log('Seeding Teleios Blueprint modules...\n');

  // Check what's already there
  const existing = await db.collection('modules')
    .where('courseId', '==', 'course-1-the-teleios-blueprint-full-human-maturity')
    .get();
  
  if (existing.size > 0) {
    console.log(`⚠️  Found ${existing.size} existing Teleios modules. Overwriting with correct data...\n`);
  }

  const batch = db.batch();

  TELEIOS_MODULES.forEach(module => {
    const moduleId = `teleios-week-${module.week}`;
    const ref = db.collection('modules').doc(moduleId);

    batch.set(ref, {
      id: moduleId,
      courseId: 'course-1-the-teleios-blueprint-full-human-maturity',
      schoolId: 'school-1-teleios',
      week: module.week,
      title: `Week ${module.week}: ${module.title}`,
      content: `# Week ${module.week}: ${module.title}\n\nModule content to be added from The Teleios Blueprint book chapters.`,
      duration: '8-10 hours',
      linkedBoardId: `board-teleios-week-${module.week}`,
      unlockTier: module.accessLevel,
      accessLevel: module.accessLevel,
      order: module.week,
      isLocked: false,
      lockMessage: null,
      reflectionQuestions: [],
      downloads: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: false });

    console.log(`  ✓ Week ${module.week}: ${module.title} [${module.accessLevel.toUpperCase()}]`);
  });

  await batch.commit();

  console.log('\n✅ 6 Teleios Blueprint modules seeded (all Foundation-tier)');
}

seedTeleiosModules()
  .then(() => process.exit(0))
  .catch(err => { console.error('❌ ERROR:', err); process.exit(1); });
