const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');

if (!fs.existsSync(SERVICE_ACCOUNT)) {
  console.error('❌ Service account key not found at:', SERVICE_ACCOUNT);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(SERVICE_ACCOUNT)
});

const db = admin.firestore();

async function checkBoardSample() {
  const boardsSnapshot = await db.collection('boards').limit(1).get();
  
  if (boardsSnapshot.empty) {
    console.log('No boards found');
    process.exit(0);
  }

  const board = boardsSnapshot.docs[0];
  console.log('\n📋 SAMPLE BOARD DOCUMENT:\n');
  console.log('ID:', board.id);
  console.log('Data:', JSON.stringify(board.data(), null, 2));
}

checkBoardSample();
