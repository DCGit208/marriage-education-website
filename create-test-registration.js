const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'marriage-education.firebasestorage.app'
});

const db = admin.firestore();

async function createTestRegistration() {
  const ambassadorCode = 'AMB-TEST-' + Date.now().toString().slice(-4);
  
  console.log(`\n🧪 Creating test registration: ${ambassadorCode}\n`);
  
  try {
    // Step 1: Create ambassador registration in Firestore (what the form does)
    const ambassadorData = {
      firstName: 'Test',
      lastName: 'User',
      fullName: 'Test User',
      email: 'bthedugrp@gmail.com',
      phone: '677123456',
      whatsapp: '677123456',
      motivation: 'This is a test registration to verify the complete ambassador approval and email delivery system. ' +
        'Testing that all components work together: registration form, payment submission, admin approval, ' +
        'ambassador account creation, email delivery with login credentials, and Telegram notifications. ' +
        'This test ensures the sessionStorage backup to Firestore is working and that the approval flow ' +
        'completes successfully without silent failures.',
      recruitedBy: '',
      code: ambassadorCode,
      role: 'Marriage Literacy Ambassador',
      track: "Women's Track",
      status: 'pending_payment',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('ambassador_registrations').doc(ambassadorCode).set(ambassadorData);
    console.log('✅ Step 1: Ambassador registration saved to Firestore');
    
    // Step 2: Create pending payment (what the payment page does)
    const paymentData = {
      reference: ambassadorCode,
      product_id: 'ambassador-registration',
      product_name: `Ambassador Registration - ${ambassadorCode}`,
      amount: '15000',
      currency: 'XAF',
      email: 'bthedugrp@gmail.com',
      phone: '677123456',
      ambassador_ref: '',
      referral_code: '',
      rd_code: '',
      type: 'ambassador',
      status: 'pending',
      ambassador_code: ambassadorCode,
      regional_director: '',
      ambassador_data: ambassadorData,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('pending_payments').doc(ambassadorCode).set(paymentData);
    console.log('✅ Step 2: Pending payment created with ambassador_data');
    
    console.log(`\n📋 TEST REGISTRATION READY`);
    console.log(`Code: ${ambassadorCode}`);
    console.log(`Email: bthedugrp@gmail.com`);
    console.log(`\n🎯 NEXT STEP: Go to admin dashboard and approve this payment:`);
    console.log(`   https://marriageducation.com/admin-dashboard.html`);
    console.log(`\n   Or run: node approve-test-payment.js ${ambassadorCode}`);
    
    // Create approval script
    const approvalScript = `const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
const axios = require('axios');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const functions = admin.functions();

async function approvePayment() {
  try {
    const approvePayment = functions.httpsCallable('approvePayment');
    const result = await approvePayment({ reference: '${ambassadorCode}' });
    
    console.log('\\n✅ APPROVAL SUCCESS:', result.data);
    console.log('\\n📧 Check your email: bthedugrp@gmail.com');
    console.log('📱 Check Telegram for notification with login link\\n');
    process.exit(0);
  } catch (error) {
    console.error('\\n❌ APPROVAL FAILED:', error.message);
    process.exit(1);
  }
}

approvePayment();
`;
    
    require('fs').writeFileSync('approve-test-payment.js', approvalScript);
    console.log('\n✅ Created approval script: approve-test-payment.js\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createTestRegistration();
