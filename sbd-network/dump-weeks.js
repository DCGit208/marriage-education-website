const fs = require('fs');
const admin = require('firebase-admin');
const sa = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

db.collection('modules').get().then(snap => {
  ['teleios-week-2','teleios-week-3','teleios-week-4','teleios-week-5','teleios-week-6'].forEach(id => {
    const d = snap.docs.find(x => x.id === id);
    if (!d) return;
    fs.writeFileSync(`/tmp/${id}.txt`, d.data().content || '');
    console.log(`Wrote /tmp/${id}.txt (${(d.data().content||'').length} chars)`);
  });
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
