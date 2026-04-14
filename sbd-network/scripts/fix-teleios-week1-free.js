// Fix teleios-week-1: accessLevel / unlockTier → 'free' (Week 1 is free for all)
const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');
if (!fs.existsSync(SERVICE_ACCOUNT)) {
  console.error('❌ serviceAccountKey.json not found at:', SERVICE_ACCOUNT);
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT)) });
const db = admin.firestore();

async function fix() {
  const ref = db.collection('modules').doc('teleios-week-1');
  const doc = await ref.get();
  if (!doc.exists) { console.error('❌ teleios-week-1 not found'); process.exit(1); }

  const before = doc.data();
  console.log('Before — accessLevel:', before.accessLevel, '| unlockTier:', before.unlockTier);

  await ref.update({
    accessLevel:  'free',
    unlockTier:   'free',
    isLocked:     false,
    lockMessage:  null,
    updatedAt:    admin.firestore.FieldValue.serverTimestamp()
  });

  const after = (await ref.get()).data();
  console.log('After  — accessLevel:', after.accessLevel, '| unlockTier:', after.unlockTier);
  console.log('✅ teleios-week-1 is now free for all users');
}

fix().then(() => process.exit(0)).catch(e => { console.error('❌', e); process.exit(1); });
