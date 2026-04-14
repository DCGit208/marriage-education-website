// Fix SBD For Dummies: weeks 5-13 accessLevel/unlockTier → 'foundation'
// Foundation tier gets the FULL course (all 13 weeks)
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');
if (!fs.existsSync(SERVICE_ACCOUNT)) {
  console.error('❌ serviceAccountKey.json not found at:', SERVICE_ACCOUNT);
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT)) });
const db = admin.firestore();

async function fixSbdAccess() {
  console.log('Fetching SBD For Dummies modules...\n');

  const snap = await db.collection('modules')
    .where('courseId', '==', 'course-14-sex-by-design-for-dummies')
    .get();

  if (snap.empty) {
    console.error('❌ No SBD Dummies modules found in Firestore.');
    process.exit(1);
  }

  console.log(`Found ${snap.size} modules.\n`);

  const batch = db.batch();
  let fixed = 0;
  let alreadyOk = 0;

  snap.docs.forEach(doc => {
    const data = doc.data();
    const current = data.unlockTier || data.accessLevel;
    if (current !== 'foundation') {
      batch.update(doc.ref, {
        unlockTier: 'foundation',
        accessLevel: 'foundation',
        isLocked: false,
        lockMessage: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`  ✅ Week ${data.week}: '${current}' → 'foundation' (${data.title})`);
      fixed++;
    } else {
      console.log(`  ✓  Week ${data.week}: already 'foundation' — skipped`);
      alreadyOk++;
    }
  });

  if (fixed > 0) {
    await batch.commit();
    console.log(`\n✅ Fixed ${fixed} modules → foundation`);
  } else {
    console.log(`\n✅ All ${alreadyOk} modules already at foundation tier — nothing to fix`);
  }
  if (alreadyOk > 0) console.log(`   (${alreadyOk} were already correct)`);
}

fixSbdAccess()
  .then(() => process.exit(0))
  .catch(err => { console.error('❌ ERROR:', err); process.exit(1); });
