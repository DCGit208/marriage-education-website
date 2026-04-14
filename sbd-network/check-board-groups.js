// check-board-groups.js — inspect current board groupId values
const admin = require('firebase-admin');
const serviceAccount = require('/Users/achugustave/Documents/Marriageducation/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('boards').get();
  const groupIds = new Set();
  snap.forEach(doc => {
    const d = doc.data();
    groupIds.add(d.groupId || '(none)');
    console.log(`"${d.title}" → groupId: ${d.groupId || '(none)'}`);
  });
  console.log('\nDistinct groupIds:', [...groupIds]);
  // Check if those groups exist
  for (const gid of groupIds) {
    if (gid === '(none)') continue;
    const g = await db.collection('groups').doc(gid).get();
    console.log(`Group ${gid}: ${g.exists ? `exists — "${g.data().title}"` : 'DOES NOT EXIST'}`);
  }
}
main().catch(console.error).finally(() => process.exit());
