#!/usr/bin/env node
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('/Users/achugustave/Documents/Marriageducation/serviceAccountKey.json')) });
const db = admin.firestore();
db.collection('boards').get().then(async snap => {
  const batch = db.batch();
  let n = 0;
  snap.forEach(doc => {
    if (!doc.data().requiredTier) {
      batch.update(doc.ref, { requiredTier: 'elite' });
      n++;
    }
  });
  await batch.commit();
  console.log('Backfilled requiredTier:elite on', n, 'boards');
}).catch(console.error).finally(() => process.exit());
