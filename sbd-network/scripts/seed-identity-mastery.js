/**
 * Seed Identity Mastery (School 1 Course 03) from courses-catalogue.json
 *
 * Source: courses-catalogue.json → courseId: "identity-mastery"
 * Target: Firestore modules/identity-mastery-week-{1..4}
 * Course: course-3-identity-mastery-understanding-image-likeness-human-design
 *
 * Usage:
 *   node sbd-network/scripts/seed-identity-mastery.js
 */

const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');

const SA = path.resolve(__dirname, '../../serviceAccountKey.json');
if (!fs.existsSync(SA)) {
  console.error('❌ serviceAccountKey.json not found at:', SA);
  process.exit(1);
}

const certFn = (admin.credential && admin.credential.cert) || admin.cert;
admin.initializeApp({ credential: certFn(require(SA)) });
const db = typeof admin.firestore === 'function' ? admin.firestore() : getFirestore();
const serverTimestamp = () =>
  (admin.firestore && admin.firestore.FieldValue)
    ? admin.firestore.FieldValue.serverTimestamp()
    : FieldValue.serverTimestamp();

const CATALOGUE = path.resolve(__dirname, '../../courses-catalogue.json');
if (!fs.existsSync(CATALOGUE)) {
  console.error('❌ courses-catalogue.json not found at:', CATALOGUE);
  process.exit(1);
}

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, 'utf8'));
const courses = Array.isArray(catalogue) ? catalogue : (catalogue.courses || []);
const course = courses.find(c => c.courseId === 'identity-mastery');
if (!course) {
  console.error('❌ identity-mastery not found in catalogue');
  process.exit(1);
}

const modules = course.modules || [];
if (modules.length < 4) {
  console.error(`❌ Expected 4 modules, found ${modules.length}`);
  process.exit(1);
}

const COURSE_DOC_ID = 'course-3-identity-mastery-understanding-image-likeness-human-design';
const SCHOOL_ID = 'school-1-teleios';
const MODULE_IDS = [1, 2, 3, 4].map(w => `identity-mastery-week-${w}`);

async function seed() {
  console.log(`✓ Found identity-mastery with ${modules.length} modules\n`);

  for (let i = 0; i < 4; i++) {
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
      duration: weekNo <= 2 ? '7-9 hours' : '8-10 hours',
      linkedBoardId: `board-identity-mastery-week-${weekNo}`,
      unlockTier: 'foundation',
      accessLevel: 'foundation',
      order: weekNo,
      isLocked: false,
      lockMessage: null,
      reflectionQuestions: mod.reflection_questions || [],
      downloads: mod.downloads || [],
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
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
    durationWeeks: 4,
    updatedAt: serverTimestamp(),
  };

  if (courseSnap.exists) {
    await courseRef.update(payload);
    console.log(`\n✅  courses/${COURSE_DOC_ID} updated with moduleIds`);
  } else {
    await courseRef.set({
      id: COURSE_DOC_ID,
      title: 'Identity Mastery: Understanding Image, Likeness & Human Design',
      schoolId: SCHOOL_ID,
      courseNo: 3,
      price: 149,
      catalogueId: 'identity-mastery',
      createdAt: serverTimestamp(),
      ...payload,
    });
    console.log(`\n✅  courses/${COURSE_DOC_ID} created`);
  }

  console.log('\n🎉 Identity Mastery weeks 1–4 seeded (Foundation-tier).');
  process.exit(0);
}

seed().catch(e => {
  console.error('❌', e);
  process.exit(1);
});
