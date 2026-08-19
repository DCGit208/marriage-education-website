/**
 * Seed Anthropocentric Development (School 1 Course 05) from courses-catalogue.json
 *
 * Source: courses-catalogue.json -> courseId: "anthropocentric-development"
 * Target: Firestore modules/anthropocentric-development-week-{1..3}
 * Course: course-5-anthropocentric-development-how-humans-grow
 *
 * Usage:
 *   node sbd-network/scripts/seed-anthropocentric-development.js
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SA = path.resolve(__dirname, '../../serviceAccountKey.json');
if (!fs.existsSync(SA)) {
  console.error('❌ serviceAccountKey.json not found at:', SA);
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(SA)) });
const db = admin.firestore();

const CATALOGUE = path.resolve(__dirname, '../../courses-catalogue.json');
if (!fs.existsSync(CATALOGUE)) {
  console.error('❌ courses-catalogue.json not found at:', CATALOGUE);
  process.exit(1);
}

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, 'utf8'));
const courses = Array.isArray(catalogue) ? catalogue : (catalogue.courses || []);
const course = courses.find(c => c.courseId === 'anthropocentric-development');
if (!course) {
  console.error('❌ anthropocentric-development not found in catalogue');
  process.exit(1);
}

const modules = course.modules || [];
if (modules.length < 3) {
  console.error(`❌ Expected 3 modules, found ${modules.length}`);
  process.exit(1);
}

const COURSE_DOC_ID = 'course-5-anthropocentric-development-how-humans-grow';
const SCHOOL_ID = 'school-1-teleios';
const MODULE_IDS = [1, 2, 3].map(w => `anthropocentric-development-week-${w}`);

async function seed() {
  console.log(`✓ Found anthropocentric-development with ${modules.length} modules\n`);

  for (let i = 0; i < 3; i++) {
    const mod = modules[i];
    const weekNo = i + 1;
    const docId = MODULE_IDS[i];

    await db.collection('modules').doc(docId).set({
      id: docId,
      courseId: COURSE_DOC_ID,
      schoolId: SCHOOL_ID,
      week: weekNo,
      title: `Week ${weekNo}: ${mod.title}`,
      content: mod.content || '',
      duration: weekNo === 3 ? '9-11 hours' : '8-10 hours',
      linkedBoardId: `board-anthropocentric-development-week-${weekNo}`,
      unlockTier: 'foundation',
      accessLevel: 'foundation',
      requiredTier: 'foundation',
      order: weekNo,
      isLocked: false,
      lockMessage: null,
      reflectionQuestions: mod.reflection_questions || [],
      downloads: mod.downloads || [],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const words = (mod.content || '').trim().split(/\s+/).filter(Boolean).length;
    console.log(`✅  ${docId} — "${mod.title}" (${words} words)`);
  }

  const courseRef = db.collection('courses').doc(COURSE_DOC_ID);
  const courseSnap = await courseRef.get();
  const payload = {
    moduleIds: MODULE_IDS,
    accessLevel: 'foundation',
    requiredTier: 'foundation',
    durationWeeks: 3,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (courseSnap.exists) {
    await courseRef.update(payload);
    console.log(`\n✅  courses/${COURSE_DOC_ID} updated with moduleIds`);
  } else {
    await courseRef.set({
      id: COURSE_DOC_ID,
      title: 'Anthropocentric Development: How Humans Grow',
      schoolId: SCHOOL_ID,
      courseNo: 5,
      price: 129,
      catalogueId: 'anthropocentric-development',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ...payload,
    });
    console.log(`\n✅  courses/${COURSE_DOC_ID} created`);
  }

  console.log('\n🎉 Anthropocentric Development weeks 1–3 seeded (Foundation-tier).');
  process.exit(0);
}

seed().catch(e => {
  console.error('❌', e);
  process.exit(1);
});
