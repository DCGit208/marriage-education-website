/**
 * Seed Relationship Relatednesses Level 2 (School 1 Course 09)
 * Target: modules/rel-relatedness-l2-week-{1..6}
 * Course: course-9-relationship-relatednesses-level-2
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
const course = courses.find((c) => c.courseId === 'relationship-relatednesses-l2');
if (!course) {
  console.error('❌ relationship-relatednesses-l2 not found');
  process.exit(1);
}

const modules = course.modules || [];
if (modules.length < 6) {
  console.error('❌ Expected 6 modules, found', modules.length);
  process.exit(1);
}

const COURSE_DOC_ID = 'course-9-relationship-relatednesses-level-2';
const SCHOOL_ID = 'school-1-teleios';
const MODULE_IDS = [1, 2, 3, 4, 5, 6].map((w) => `rel-relatedness-l2-week-${w}`);

async function seed() {
  console.log('✓ Found relationship-relatednesses-l2 with', modules.length, 'modules\n');

  for (let i = 0; i < 6; i++) {
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
        duration: weekNo === 6 ? '9-11 hours' : '8-10 hours',
        linkedBoardId: 'board-rel-relatedness-l2-week-' + weekNo,
        unlockTier: 'foundation',
        accessLevel: 'foundation',
        requiredTier: 'foundation',
        totalWeeks: 6,
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
    durationWeeks: 6,
    updatedAt: serverTimestamp(),
  };
  if (courseSnap.exists) {
    await courseRef.update(payload);
    console.log('\n✅  courses/' + COURSE_DOC_ID + ' updated');
  } else {
    await courseRef.set({
      id: COURSE_DOC_ID,
      title: 'Relationship Relatednesses (Level 2)',
      schoolId: SCHOOL_ID,
      courseNo: 9,
      price: 199,
      catalogueId: 'relationship-relatednesses-l2',
      createdAt: serverTimestamp(),
      ...payload,
    });
    console.log('\n✅  courses/' + COURSE_DOC_ID + ' created');
  }

  console.log('\n🎉 Relationship Relatednesses L2 weeks 1–6 seeded (Foundation-tier).');
  process.exit(0);
}

seed().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
