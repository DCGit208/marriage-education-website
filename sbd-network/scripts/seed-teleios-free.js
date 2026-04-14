#!/usr/bin/env node
/**
 * seed-teleios-free.js
 * Seeds Firestore with Teleios Blueprint Week 1 as the FREE tier module.
 * Source: Marriageducation project courses-catalogue.json (teleios-blueprint, module 0)
 * This is the Teleios-only content (no advocacy track).
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');
if (!fs.existsSync(SERVICE_ACCOUNT)) {
  console.error('❌ serviceAccountKey.json not found at:', SERVICE_ACCOUNT);
  process.exit(1);
}

const serviceAccount = require(SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Load from Marriageducation project catalogue
const cataloguePath = path.resolve(__dirname, '../../public/courses-catalogue.json');
if (!fs.existsSync(cataloguePath)) {
  console.error('❌ courses-catalogue.json not found at:', cataloguePath);
  process.exit(1);
}

const catalogue = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));
const teleiosCourse = catalogue.find(c => c.courseId === 'teleios-blueprint');

if (!teleiosCourse) {
  console.error('❌ teleios-blueprint course not found in catalogue');
  process.exit(1);
}

const week1Module = teleiosCourse.modules[0];
console.log('✅ Found Teleios Week 1:', week1Module.title);

async function seed() {
  const batch = db.batch();

  // ───────────────────────────────────────────────
  // 1. FREE MODULE: Teleios Week 1
  // ───────────────────────────────────────────────
  const moduleRef = db.collection('modules').doc('teleios-week-1');
  batch.set(moduleRef, {
    id: 'teleios-week-1',
    courseId: 'teleios-blueprint',
    schoolId: 'school-1-teleios',
    week: 1,
    title: week1Module.title,
    content: week1Module.content,
    duration: '7-9 hours',
    accessLevel: 'free',
    requiredTier: 'free',
    isLocked: false,
    lockMessage: null,
    order: 1,
    reflectionQuestions: week1Module.reflection_questions || [],
    downloads: week1Module.downloads || [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  console.log('📄 Queued module: teleios-week-1 (free)');

  // ───────────────────────────────────────────────
  // 2. Tag remaining Teleios weeks as foundation+
  // ───────────────────────────────────────────────
  const tierMap = {
    1: 'foundation',
    2: 'foundation',
    3: 'premium',
    4: 'premium',
    5: 'elite',
    6: 'elite',
  };

  teleiosCourse.modules.slice(1).forEach((mod, idx) => {
    const weekNum = idx + 2;
    const docId = `teleios-week-${weekNum}`;
    const ref = db.collection('modules').doc(docId);
    batch.set(ref, {
      id: docId,
      courseId: 'teleios-blueprint',
      schoolId: 'school-1-teleios',
      week: weekNum,
      title: mod.title,
      content: mod.content,
      duration: '7-9 hours',
      accessLevel: tierMap[weekNum] || 'foundation',
      requiredTier: tierMap[weekNum] || 'foundation',
      isLocked: true,
      lockMessage: `Unlock with ${tierMap[weekNum] || 'Foundation'} tier`,
      order: weekNum,
      reflectionQuestions: mod.reflection_questions || [],
      downloads: mod.downloads || [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`📄 Queued module: ${docId} (${tierMap[weekNum] || 'foundation'})`);
  });

  // ───────────────────────────────────────────────
  // 3. Mark Teleios Blueprint course as free-entry
  // ───────────────────────────────────────────────
  // Update the sbd-network courses collection to flag accessLevel correctly
  const courseRef = db.collection('courses').where('title', '==', teleiosCourse.title);
  const courseSnap = await courseRef.get();
  if (!courseSnap.empty) {
    courseSnap.forEach(doc => {
      batch.update(doc.ref, {
        accessLevel: 'free',
        freePreviewWeeks: 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`📘 Updated course accessLevel: ${doc.id}`);
    });
  }

  await batch.commit();
  console.log('\n✅ Teleios free tier seed complete.');
  console.log('  Module teleios-week-1 is now free-accessible.');
  console.log('  Weeks 2-6 locked at foundation/premium/elite tiers.');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
