/**
 * FIX COURSE TIERS — canonical per SBD-ACADEMY-LEARNING-SYSTEM.md
 * =================================================================
 * 1. Course 6 (Personal Development MasterClass) → foundation
 * 2. Course 10 (Relationship Mastery Intensive L3) → foundation
 *    (ALL School 1 courses are Foundation-accessible — progressive unlock)
 * 3. Schools 3 & 4 courses (nos. 29-44) → elite
 *    (was 'premium' — spec says Elite only)
 * 4. Create sex-by-design-for-dummies course document (Foundation standalone)
 * 5. Update 13 SBD Dummies module courseIds → 'sex-by-design-for-dummies'
 *
 * Run: node scripts/fix-course-tiers.js
 */

const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

const SA = path.resolve(__dirname, '../../serviceAccountKey.json');
if (!fs.existsSync(SA)) { console.error('❌ serviceAccountKey.json not found'); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(require(SA)) });
const db = admin.firestore();
const TS = admin.firestore.FieldValue.serverTimestamp;

async function run() {
  const coursesSnap = await db.collection('courses').get();
  const batch = db.batch();
  let fixed = 0;

  // ── 1 & 2: Fix individual School 1 courses tagged 'premium' → 'foundation' ──
  const school1PremiumFix = coursesSnap.docs.filter(d => {
    const data = d.data();
    return data.schoolId === 'school-1-teleios' && data.accessLevel === 'premium';
  });

  for (const doc of school1PremiumFix) {
    batch.update(doc.ref, { accessLevel: 'foundation', updatedAt: TS() });
    console.log(`  ✅ [School 1 → foundation] Course ${doc.data().courseNo}: ${doc.data().title}`);
    fixed++;
  }

  // ── 3: Fix Schools 3 & 4: 'premium' → 'elite' ────────────────────────────
  const eliteSchools = ['school-3-marriage-systems', 'school-4-civilization-leadership'];
  const school34Fix = coursesSnap.docs.filter(d => {
    const data = d.data();
    return eliteSchools.includes(data.schoolId) && data.accessLevel !== 'elite';
  });

  for (const doc of school34Fix) {
    batch.update(doc.ref, { accessLevel: 'elite', updatedAt: TS() });
    console.log(`  ✅ [${doc.data().schoolId} → elite] Course ${doc.data().courseNo}: ${doc.data().title}`);
    fixed++;
  }

  // ── 4: Create sex-by-design-for-dummies course doc ───────────────────────
  const sbdCourseRef = db.collection('courses').doc('sex-by-design-for-dummies');
  const sbdCourseSnap = await sbdCourseRef.get();
  if (!sbdCourseSnap.exists) {
    batch.set(sbdCourseRef, {
      id:           'sex-by-design-for-dummies',
      title:        'Sex By Design For Dummies: The Complete Marriage Handbook for Human Flourishing',
      shortTitle:   'SBD For Dummies',
      schoolId:     null,           // standalone — not from a school
      courseNo:     null,
      accessLevel:  'foundation',   // Foundation tier and above
      isActive:     true,
      totalModules: 13,
      durationWeeks: 13,
      duration:     '13 weeks',
      description:  'The complete marriage handbook for human flourishing. Derived from the SBD flagship ebook. Foundation tier and above.',
      badge:        'Foundation Flagship',
      instructor:   'Dr. Coach Achu Gustave',
      certificate:  'Certificate of Completion in Sexual Literacy & Covenant Marriage',
      createdAt:    TS(),
      updatedAt:    TS(),
    });
    console.log('  ✅ [CREATED] sex-by-design-for-dummies course document');
    fixed++;
  } else {
    // Ensure accessLevel is foundation and isActive is true
    batch.update(sbdCourseRef, { accessLevel: 'foundation', isActive: true, updatedAt: TS() });
    console.log('  ✓  sex-by-design-for-dummies already exists — ensured foundation + isActive');
  }

  await batch.commit();
  console.log(`\n✅ Course tier fixes committed (${fixed} changes)\n`);

  // ── 5: Update SBD module courseIds → 'sex-by-design-for-dummies' ─────────
  console.log('Updating SBD Dummies module courseIds…');
  const sbdModsSnap = await db.collection('modules')
    .where('courseId', '==', 'course-14-sex-by-design-for-dummies')
    .get();

  if (sbdModsSnap.empty) {
    // Already updated or different ID in use
    const altSnap = await db.collection('modules')
      .where('courseId', '==', 'sex-by-design-for-dummies')
      .get();
    if (altSnap.empty) {
      console.warn('  ⚠️  No SBD Dummies modules found under either courseId');
    } else {
      console.log(`  ✓  ${altSnap.size} SBD modules already use courseId: sex-by-design-for-dummies`);
    }
  } else {
    const modBatch = db.batch();
    sbdModsSnap.docs.forEach(doc => {
      modBatch.update(doc.ref, { courseId: 'sex-by-design-for-dummies', updatedAt: TS() });
      console.log(`  ✅ Module ${doc.data().week} courseId updated`);
    });
    await modBatch.commit();
    console.log(`  ✅ ${sbdModsSnap.size} SBD modules updated\n`);
  }

  console.log('Done. Canonical tier structure:\n');
  console.log('  Foundation: Teleios Blueprint (6wks) + SBD For Dummies (13wks) + School 1 progressive');
  console.log('  Premium:    School 1 (full) + School 2 (15 courses)');
  console.log('  Elite:      Schools 3 & 4 + MV House');

  process.exit(0);
}

run().catch(e => { console.error('❌', e); process.exit(1); });
