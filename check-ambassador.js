const admin = require('firebase-admin');
const serviceAccount = require('./marriage-education-firebase-adminsdk.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkAmbassador() {
  const email = 'bthedugrp@gmail.com';
  
  const snapshot = await db.collection('ambassadors')
    .where('email', '==', email)
    .get();
  
  if (snapshot.empty) {
    console.log('❌ No ambassador found with email:', email);
    return;
  }
  
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log('\n✅ Ambassador Found:');
    console.log('Code:', doc.id);
    console.log('Name:', data.fullName);
    console.log('Email:', data.email);
    console.log('Status:', data.status);
    console.log('Recruited By:', data.recruitedBy || 'Direct');
    console.log('\nDashboard URL: https://marriageducation.com/ambassador-login.html');
    console.log('Use your ambassador code and email to login');
  });
}

checkAmbassador().then(() => process.exit(0)).catch(e => {console.error(e); process.exit(1);});
