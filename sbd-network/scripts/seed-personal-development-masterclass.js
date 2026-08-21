/**
 * Seed Personal Development MasterClass (School 1 Course 06)
 * Weeks 1–8 from courses-catalogue.json (weeks 9–12 remain stubs until written).
 *
 * Target: modules/pd-masterclass-week-{1..8}
 * Course: course-6-the-personal-development-masterclass
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
const course = courses.find(c => c.courseId === 'personal-development-masterclass');
if (!course) {
  console.error('❌ personal-development-masterclass not found');
  process.exit(1);
}

const modules = course.modules || [];
if (modules.length < 8) {
  console.error('❌ Expected at least 8 modules, found', modules.length);
  process.exit(1);
}

const COURSE_DOC_ID = 'course-6-the-personal-development-masterclass';
const SCHOOL_ID = 'school-1-teleios';
const SEED_COUNT = 8;
const MODULE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(w => `pd-masterclass-week-${w}`);

async function seed() {
  console.log('✓ Found personal-development-masterclass with', modules.length, 'modules\n');

  for (let i = 0; i < SEED_COUNT; i++) {
    const mod = modules[i];
    const weekNo = i + 1;
    const docId = MODULE_IDS[i];
    await db.collection('modules').doc(docId).set({
      id: docId,
      courseId: COURSE_DOC_ID,
      schoolId: SCHOOL_ID,
      week: weekNo,
      title: 'Week ' + weekNo + ': ' + mod.title,
      content: mod.content || '',
      duration: '8-10 hours',
      linkedBoardId: 'board-pd-masterclass-week-' + weekNo,
      unlockTier: 'foundation',
      accessLevel: 'foundation',
      requiredTier: 'foundation',
      totalWeeks: 12,
      order: weekNo,
      isLocked: false,
      lockMessage: null,
      reflectionQuestions: mod.reflection_questions || [],
      downloads: mod.downloads || [],
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }, { merge: true });
    const words = (mod.content || '').trim().split(/\s+/).filter(Boolean).length;
    console.log('✅  ' + docId + ' — "' + mod.title + '" (' + words + ' words)');
  }

  const courseRef = db.collection('courses').doc(COURSE_DOC_ID);
  const courseSnap = await courseRef.get();
  const payload = {
    moduleIds: MODULE_IDS,
    accessLevel: 'foundation',
    requiredTier: 'foundation',
    durationWeeks: 12,
    updatedAt: serverTimestamp(),
  };
  if (courseSnap.exists) {
    await courseRef.update(payload);
    console.log('\n✅  courses/' + COURSE_DOC_ID + ' updated');
  } else {
    await courseRef.set({
      id: COURSE_DOC_ID,
      title: 'The Personal Development MasterClass',
      schoolId: SCHOOL_ID,
      courseNo: 6,
      price: 697,
      catalogueId: 'personal-development-masterclass',
      createdAt: serverTimestamp(),
      ...payload,
    });
    console.log('\n✅  courses/' + COURSE_DOC_ID + ' created');
  }

  console.log('\n🎉 PD MasterClass weeks 1–8 seeded (Foundation-tier). Weeks 9–12 still stubs.');
  process.exit(0);
}

seed().catch(e => {
  console.error('❌', e);
  process.exit(1);
});
