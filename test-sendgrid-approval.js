const admin = require('firebase-admin');
const serviceAccount = require('./marriage-education-firebase-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'marriage-education.firebasestorage.app'
});

const db = admin.firestore();

async function approveTestPayment() {
  const reference = 'AMB-TEST-8087';
  
  console.log(`\n🔍 Approving payment: ${reference}\n`);
  
  try {
    // Get payment
    const paymentDoc = await db.collection('pending_payments').doc(reference).get();
    
    if (!paymentDoc.exists) {
      console.log('❌ Payment not found');
      return;
    }
    
    const payment = paymentDoc.data();
    console.log('✅ Payment found');
    console.log(`   Email: ${payment.email}`);
    console.log(`   Ambassador Code: ${payment.ambassador_code}`);
    console.log(`   Has ambassador_data: ${!!payment.ambassador_data}\n`);
    
    // Update payment status
    await db.collection('pending_payments').doc(reference).update({
      status: 'approved',
      approved_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('✅ Payment marked as approved');
    
    // Call the approvePayment cloud function
    const functions = require('firebase-functions-test')();
    const approvePaymentFunc = require('./functions/index').approvePayment;
    
    const data = { reference: reference };
    const context = { auth: { uid: 'test-admin' } };
    
    console.log('\n📧 Calling approvePayment function (this will trigger SendGrid email)...\n');
    
    const result = await approvePaymentFunc(data, context);
    
    console.log('✅ Function completed successfully!');
    console.log('   Result:', JSON.stringify(result, null, 2));
    console.log('\n📬 CHECK YOUR INBOX (not spam!) at: bthedugrp@gmail.com\n');
    console.log('🎯 SendGrid should deliver to INBOX within 2-5 seconds!\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

approveTestPayment();
