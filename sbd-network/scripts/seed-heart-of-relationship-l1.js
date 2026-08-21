/**
 * Seed Heart of Relationship Level 1 (School 1 Course 08)
 * Source: courses-catalogue.json → heart-of-relationship-l1
 * Target: modules/heart-rel-l1-week-{1..4}
 * Course: course-8-the-heart-of-relationship-level-1
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
const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, 'utf8'));
const courses = Array.isArray(catalogue) ? catalogue : (catalogue.courses || []);
const course = courses.find((c) => c.courseId === 'heart-of-relationship-l1');
if (!course) {
  console.error('❌ heart-of-relationship-l1 not found');
  process.exit(1);
}

const modules = course.modules || [];
if (modules.length < 4) {
  console.error('❌ Expected 4 modules, found', modules.length);
  process.exit(1);
}

const COURSE_DOC_ID = 'course-8-the-heart-of-relationship-level-1';
const SCHOOL_ID = 'school-1-teleios';
const MODULE_IDS = [1, 2, 3, 4].map((w) => `heart-rel-l1-week-${w}`);

async function seed() {
  console.log('✓ Found heart-of-relationship-l1 with', modules.length, 'modules\n');

  for (let i = 0; i < 4; i++) {
    const mod = modules[i];
    const weekNo = i + 1;
    const docId = MODULE_IDS[i];
    await db.collection('modules').doc(docId).set(
      {
        id: docId,
        courseId: COURSE_DOC_ID,
        schoolId: SCHOOL_ID,
        week: weekNo,
        title: 'Week ' + weekNo + ': ' + mod.title,
        content: mod.content || '',
        duration: weekNo === 4 ? '9-11 hours' : '8-10 hours',
        linkedBoardId: 'board-heart-rel-l1-week-' + weekNo,
        unlockTier: 'foundation',
        accessLevel: 'foundation',
        requiredTier: 'foundation',
        totalWeeks: 4,
        order: weekNo,
        isLocked: false,
        lockMessage: null,
        reflectionQuestions: mod.reflection_questions || [],
        downloads: mod.downloads || [],
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
    const words = (mod.content || '').trim().split(/\s+/).filter(Boolean).length;
    console.log('✅  ' + docId + ' — "' + mod.title + '" (' + words + ' words)');
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
    console.log('\n✅  courses/' + COURSE_DOC_ID + ' updated');
  } else {
    await courseRef.set({
      id: COURSE_DOC_ID,
      title: 'The Heart of Relationship (Level 1)',
      schoolId: SCHOOL_ID,
      courseNo: 8,
      price: 149,
      catalogueId: 'heart-of-relationship-l1',
      createdAt: serverTimestamp(),
      ...payload,
    });
    console.log('\n✅  courses/' + COURSE_DOC_ID + ' created');
  }

  console.log('\n🎉 Heart of Relationship L1 weeks 1–4 seeded (Foundation-tier).');
  process.exit(0);
}

seed().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
