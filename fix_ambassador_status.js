const admin = require('firebase-admin');
const db = admin.firestore();

async function fixStatus() {
  try {
    const doc = await db.collection('ambassadors').doc('AMB-GUST-1783').get();
    if (doc.exists) {
      const data = doc.data();
      console.log('Current status:', data.status);
      console.log('Full data:', JSON.stringify(data, null, 2));
    } else {
      console.log('Ambassador not found');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

fixStatus();
