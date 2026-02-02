const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkPayment() {
  const doc = await db.collection('pending_payments').doc('AMB-BIHP-0272').get();
  const d = doc.data();
  
  console.log('\n📋 Payment Data Analysis:');
  console.log('- Has ambassador_data:', !!d.ambassador_data);
  console.log('- Has ambassador_code:', !!d.ambassador_code);
  console.log('- Has regional_director:', !!d.regional_director);
  
  if (d.ambassador_data) {
    console.log('\n✅ ambassador_data content:');
    console.log(JSON.stringify(d.ambassador_data, null, 2));
  } else {
    console.log('\n❌ ambassador_data is MISSING - this is why activation failed!');
    console.log('\n💡 The payment page likely received NULL from sessionStorage');
    console.log('   because the user took too long or refreshed the page.');
  }
  
  process.exit(0);
}

checkPayment();
