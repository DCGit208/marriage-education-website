/**
 * Seed teleios-week-2 through teleios-week-6 from courses-catalogue.json
 * Uses the content field (legacy render path in lesson.html) which already
 * falls back gracefully when parts array is empty.
 * 
 * Source: courses-catalogue.json → courseId: "teleios-blueprint"
 * Target: Firestore modules/teleios-week-{2..6}
 */

const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

const SA = path.resolve(__dirname, '../../serviceAccountKey.json');
if (!fs.existsSync(SA)) { console.error('❌ serviceAccountKey.json not found at:', SA); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(require(SA)) });
const db = admin.firestore();

// ── Load content from parent project's courses-catalogue.json ─────
const CATALOGUE = path.resolve(__dirname, '../../courses-catalogue.json');
if (!fs.existsSync(CATALOGUE)) { console.error('❌ courses-catalogue.json not found at:', CATALOGUE); process.exit(1); }

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, 'utf8'));
const courses   = Array.isArray(catalogue) ? catalogue : (catalogue.courses || []);
const teleios   = courses.find(c => c.courseId === 'teleios-blueprint');
if (!teleios) { console.error('❌ teleios-blueprint not found in catalogue'); process.exit(1); }

const modules = teleios.modules || [];
console.log(`✓  Found teleios-blueprint with ${modules.length} modules`);

async function seed() {
  // Weeks 2-6 (index 1-5 in the modules array)
  for (let i = 1; i <= 5; i++) {
    const mod    = modules[i];
    const weekNo = i + 1;
    const docId  = `teleios-week-${weekNo}`;

    if (!mod) { console.warn(`⚠️  No module at index ${i} — skipping week ${weekNo}`); continue; }

    const snap = await db.collection('modules').doc(docId).get();
    if (!snap.exists) { console.warn(`⚠️  ${docId} does not exist in Firestore — skipping`); continue; }

    const existing = snap.data();

    // Only update content + metadata — preserve all other fields (parts, locks, etc.)
    await db.collection('modules').doc(docId).update({
      title:       mod.title || existing.title,
      content:     mod.content || '',
      reflectionQuestions: mod.reflection_questions || [],
      downloads:   mod.downloads || [],
      week:        weekNo,
      unlockTier:  'foundation',
      accessLevel: 'foundation',
      isLocked:    false,
      lockMessage: '',
      updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅  ${docId} seeded — "${mod.title.substring(0, 55)}" (${mod.content.length} chars)`);
  }

  // Update the course doc to include moduleIds so schools.js can link them
  const courseDocId = 'course-1-the-teleios-blueprint-full-human-maturity';
  await db.collection('courses').doc(courseDocId).update({
    moduleIds:    ['teleios-week-1','teleios-week-2','teleios-week-3','teleios-week-4','teleios-week-5','teleios-week-6'],
    accessLevel:  'foundation',
    requiredTier: 'foundation',
    updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`✅  courses/${courseDocId} updated with moduleIds + accessLevel: foundation`);

  console.log('\n🎉 Done. teleios-week-2 through teleios-week-6 are now live.');
  process.exit(0);
}

seed().catch(e => { console.error('❌', e); process.exit(1); });
