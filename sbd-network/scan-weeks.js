const admin = require('firebase-admin');
const sa = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

db.collection('modules').get().then(snap => {
  ['teleios-week-2','teleios-week-3','teleios-week-4','teleios-week-5','teleios-week-6'].forEach(id => {
    const d = snap.docs.find(x => x.id === id);
    if (!d) { console.log(id + ': NOT FOUND'); return; }
    const content = d.data().content || '';
    const lines = content.split('\n').filter(l =>
      l.startsWith('#') ||
      l.startsWith('---') ||
      /track\s*[12]/i.test(l) ||
      /part\s*[0-9]/i.test(l)
    );
    console.log('\n=== ' + id + ' ===');
    lines.forEach(l => console.log(l));
  });
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
