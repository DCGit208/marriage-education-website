// One-time patch: corrects the UDHR/perfection line in teleios-week-1 part-2
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

const OLD = 'The UDHR enshrines a biblical principle: marriage requires wholeness. Not perfection as "sinlessness," but perfection as "fitness for purpose"—the structural integrity to sustain covenant under load.';
const NEW = 'The UDHR reflects a biblical principle: marriage requires wholeness. Perfection is the operation of a person within their divine design—our natural state—from which covenant thrives.';

async function patch() {
  const ref  = db.collection('modules').doc('teleios-week-1');
  const snap = await ref.get();
  if (!snap.exists) { console.error('❌ modules/teleios-week-1 not found'); process.exit(1); }

  const parts = snap.data().parts || [];
  const idx   = parts.findIndex(p => p.id === 'part-2');
  if (idx === -1) { console.error('❌ part-2 not found in parts array'); process.exit(1); }

  if (!parts[idx].content.includes(OLD)) {
    console.log('⚠️  Old text not found — already patched or content differs.');
    process.exit(0);
  }

  parts[idx].content = parts[idx].content.replace(OLD, NEW);
  await ref.update({ parts, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  console.log('✅ teleios-week-1 part-2 UDHR line patched in Firestore');
  process.exit(0);
}

patch().catch(e => { console.error(e); process.exit(1); });
