const admin = require('firebase-admin');
const sa = require('/Users/achugustave/Documents/Marriageducation/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

db.collection('modules').where('courseId','==','course-1-the-teleios-blueprint-full-human-maturity').get().then(snap => {
  console.log('Total modules:', snap.size);
  snap.docs.sort((a,b)=>(a.data().week||0)-(b.data().week||0)).forEach(d => {
    const m = d.data();
    console.log(JSON.stringify({ id: d.id, week: m.week, title: (m.title||'').substring(0,60), hasParts: Array.isArray(m.parts)&&m.parts.length>0, partCount: Array.isArray(m.parts)?m.parts.length:0 }));
  });
  process.exit(0);
}).catch(e=>{console.error(e.message);process.exit(1);});
