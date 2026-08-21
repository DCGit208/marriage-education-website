/** Seed Course 13 Temperament Intelligence — modules/temperament-intel-week-{1..3} */
const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');
const SA = path.resolve(__dirname, '../../serviceAccountKey.json');
if (!fs.existsSync(SA)) { console.error('❌ missing SA'); process.exit(1); }
const certFn = (admin.credential && admin.credential.cert) || admin.cert;
admin.initializeApp({ credential: certFn(require(SA)) });
const db = typeof admin.firestore === 'function' ? admin.firestore() : getFirestore();
const serverTimestamp = () => (admin.firestore && admin.firestore.FieldValue) ? admin.firestore.FieldValue.serverTimestamp() : FieldValue.serverTimestamp();
const catalogue = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../courses-catalogue.json'), 'utf8'));
const courses = Array.isArray(catalogue) ? catalogue : (catalogue.courses || []);
const course = courses.find((c) => c.courseId === 'temperament-intelligence');
if (!course || (course.modules || []).length < 3) { console.error('❌ temperament-intelligence'); process.exit(1); }
const COURSE_DOC_ID = 'course-13-temperament-intelligence-for-marriage';
const MODULE_IDS = [1, 2, 3].map((w) => `temperament-intel-week-${w}`);
async function seed() {
  for (let i = 0; i < 3; i++) {
    const mod = course.modules[i];
    const weekNo = i + 1;
    await db.collection('modules').doc(MODULE_IDS[i]).set({
      id: MODULE_IDS[i], courseId: COURSE_DOC_ID, schoolId: 'school-1-teleios', week: weekNo,
      title: 'Week ' + weekNo + ': ' + mod.title, content: mod.content || '',
      duration: weekNo === 3 ? '9-11 hours' : '8-10 hours', linkedBoardId: 'board-temperament-intel-week-' + weekNo,
      unlockTier: 'foundation', accessLevel: 'foundation', requiredTier: 'foundation', totalWeeks: 3, order: weekNo,
      isLocked: false, lockMessage: null, reflectionQuestions: mod.reflection_questions || [], downloads: mod.downloads || [],
      updatedAt: serverTimestamp(), createdAt: serverTimestamp(),
    }, { merge: true });
    console.log('✅', MODULE_IDS[i], (mod.content || '').trim().split(/\s+/).length, 'words');
  }
  const ref = db.collection('courses').doc(COURSE_DOC_ID);
  const payload = { moduleIds: MODULE_IDS, accessLevel: 'foundation', requiredTier: 'foundation', durationWeeks: 3, updatedAt: serverTimestamp() };
  if ((await ref.get()).exists) await ref.update(payload);
  else await ref.set({ id: COURSE_DOC_ID, title: 'Temperament Intelligence for Marriage', schoolId: 'school-1-teleios', courseNo: 13, price: 99, catalogueId: 'temperament-intelligence', createdAt: serverTimestamp(), ...payload });
  console.log('🎉 Course 13 seeded');
  process.exit(0);
}
seed().catch((e) => { console.error(e); process.exit(1); });
