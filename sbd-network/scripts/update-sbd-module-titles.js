/**
 * Syncs SBD For Dummies module data from courses-catalogue.json → Firestore
 * Reads the catalogue directly — zero manual transcription.
 * ALL fields from each module are written exactly as they appear in the JSON.
 *
 * Run: node scripts/update-sbd-module-titles.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');
const catalogue = require('../../courses-catalogue.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Find the SBD For Dummies entry in the catalogue
const sbdCourse = catalogue.find(c => c.courseId === 'sex-by-design-for-dummies');
if (!sbdCourse) {
  console.error('ERROR: sex-by-design-for-dummies not found in courses-catalogue.json');
  process.exit(1);
}

async function run() {
  console.log(`Found course: "${sbdCourse.title}" — ${sbdCourse.modules.length} modules\n`);

  let updated = 0;
  let errors = 0;

  for (const mod of sbdCourse.modules) {
    const docId = `sbd-week-${mod.moduleId}`;
    const ref = db.collection('modules').doc(docId);
    const snap = await ref.get();

    if (!snap.exists) {
      console.log(`  ⚠️  NOT FOUND: ${docId} — skipping`);
      errors++;
      continue;
    }

    // Build the exact payload from the catalogue, no modifications
    const payload = {
      title:               mod.title,
      chapter:             mod.chapter             || null,
      duration:            mod.duration            || null,
      duration_hours:      mod.duration_hours      || null,
      content:             mod.content             || null,
      topics:              mod.topics              || [],
      keyTerms:            mod.keyTerms            || [],
      exercises:           mod.exercises           || [],
      readings:            mod.readings            || [],
      reflection_questions: mod.reflection_questions || [],
      downloads:           mod.downloads           || [],
      learning_objectives: mod.learning_objectives || [],
      core_teachings:      mod.core_teachings      || [],
    };

    // Remove null fields to avoid overwriting intentional Firestore values
    Object.keys(payload).forEach(k => { if (payload[k] === null) delete payload[k]; });

    await ref.update(payload);
    console.log(`  ✅ ${docId}: "${mod.title}"`);
    updated++;
  }

  console.log(`\nDone. Updated: ${updated}  |  Errors: ${errors}`);
  process.exit(0);
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

