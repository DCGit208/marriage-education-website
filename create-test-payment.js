// Create a test payment in Firebase for testing the admin dashboard
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./marriage-education-firebase-adminsdk.json');
admin.initializeApp({
  credential: admin.cert(serviceAccount)
});

const db = admin.firestore();

async function createTestPayment() {
  try {
    const testReference = `TEST-${Date.now()}`;
    
    const testPayment = {
      reference: testReference,
      email: 'test@marriageducation.com',
      name: 'Test Customer',
      phone: '+237670000000',
      product_id: 'sbd-for-dummies',
      product_name: 'SBD For Dummies',
      amount: 5000,
      currency: 'FCFA',
      payment_method: 'MOMO',
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      momo_number: '670000000',
      ambassador_ref: null,
      referral_code: null,
      rd_code: null
    };

    await db.collection('pending_payments').doc(testReference).set(testPayment);
    
    console.log('✅ Test payment created successfully!');
    console.log('Reference:', testReference);
    console.log('Email:', testPayment.email);
    console.log('Product:', testPayment.product_name);
    console.log('Amount:', testPayment.amount, testPayment.currency);
    console.log('\nYou can now approve this payment in the admin dashboard.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating test payment:', error);
    process.exit(1);
  }
}

createTestPayment();
