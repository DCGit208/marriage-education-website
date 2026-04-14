const admin = require('firebase-admin');
const path = require('path');
const SA = path.resolve('/Users/achugustave/Documents/Marriageducation/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(SA)) });
const db = admin.firestore();

async function check() {
  const snap = await db.collection('users').get();
  console.log('Total users:', snap.size);
  snap.forEach(doc => {
    const d = doc.data();
    console.log(`[${doc.id.substring(0,8)}...] tier:${d.tier||'free'} role:${d.role||'member'} email:${d.email||''} name:${d.name||''} groups:${(d.groups||[]).length}`);
  });
  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
