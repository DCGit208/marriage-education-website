/**
 * Seed Anthropology of Wholeness (School 1 Course 02) from courses-catalogue.json
 *
 * Source: courses-catalogue.json → courseId: "anthropology-wholeness"
 * Target: Firestore modules/anthropology-wholeness-week-{1..4}
 * Course: course-2-the-anthropology-of-wholeness-becoming-fully-human
 *
 * Usage (from repo root or sbd-network):
 *   node sbd-network/scripts/seed-anthropology-wholeness.js
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
const course = courses.find(c => c.courseId === 'anthropology-wholeness');
if (!course) {
  console.error('❌ anthropology-wholeness not found in catalogue');
  process.exit(1);
}

const modules = course.modules || [];
if (modules.length < 4) {
  console.error(`❌ Expected 4 modules, found ${modules.length}`);
  process.exit(1);
}

const COURSE_DOC_ID = 'course-2-the-anthropology-of-wholeness-becoming-fully-human';
const SCHOOL_ID = 'school-1-teleios';
const MODULE_IDS = [1, 2, 3, 4].map(w => `anthropology-wholeness-week-${w}`);

async function seed() {
  console.log(`✓ Found anthropology-wholeness with ${modules.length} modules\n`);

  for (let i = 0; i < 4; i++) {
    const mod = modules[i];
    const weekNo = i + 1;
    const docId = MODULE_IDS[i];
    const ref = db.collection('modules').doc(docId);

    await ref.set({
      id: docId,
      courseId: COURSE_DOC_ID,
      schoolId: SCHOOL_ID,
      week: weekNo,
      title: `Week ${weekNo}: ${mod.title}`,
      content: mod.content || '',
      duration: weekNo <= 2 ? '7-9 hours' : '8-10 hours',
      linkedBoardId: `board-anthropology-wholeness-week-${weekNo}`,
      unlockTier: 'foundation',
      accessLevel: 'foundation',
      order: weekNo,
      isLocked: false,
      lockMessage: null,
      reflectionQuestions: mod.reflection_questions || [],
      downloads: mod.downloads || [],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const words = (mod.content || '').trim().split(/\s+/).filter(Boolean).length;
    console.log(`✅  ${docId} — "${mod.title}" (${words} words, ${(mod.content || '').length} chars)`);
  }

  const courseRef = db.collection('courses').doc(COURSE_DOC_ID);
  const courseSnap = await courseRef.get();
  if (courseSnap.exists) {
    await courseRef.update({
      moduleIds: MODULE_IDS,
      accessLevel: 'foundation',
      requiredTier: 'foundation',
      durationWeeks: 4,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`\n✅  courses/${COURSE_DOC_ID} updated with moduleIds`);
  } else {
    await courseRef.set({
      id: COURSE_DOC_ID,
      title: 'The Anthropology of Wholeness: Becoming Fully Human',
      schoolId: SCHOOL_ID,
      courseNo: 2,
      moduleIds: MODULE_IDS,
      accessLevel: 'foundation',
      requiredTier: 'foundation',
      durationWeeks: 4,
      price: 149,
      catalogueId: 'anthropology-wholeness',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`\n✅  courses/${COURSE_DOC_ID} created`);
  }

  console.log('\n🎉 Anthropology of Wholeness weeks 1–4 seeded (Foundation-tier).');
  process.exit(0);
}

seed().catch(e => {
  console.error('❌', e);
  process.exit(1);
});
