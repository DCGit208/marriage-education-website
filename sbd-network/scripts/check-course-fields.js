const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');
const svc   = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../serviceAccountKey.json'), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();
db.collection('courses').where('schoolId','==','school-1-teleios').get().then(snap => {
  snap.docs.slice(0,5).forEach(d => {
    const data = d.data();
    console.log(d.id.slice(0,40), '| moduleCount:', data.moduleCount, '| estimatedWeeks:', data.estimatedWeeks, '| duration:', data.duration, '| weeks:', data.weeks, '| totalModules:', data.totalModules);
  });
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
