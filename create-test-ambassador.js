/**
 * CREATE TEST AMBASSADOR
 * Quick script to create a test ambassador for commission testing
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function createTestAmbassador() {
  console.log('🧪 Creating test ambassador...\n');
  
  const testAmbassador = {
    code: 'AMB-X-001',
    ambassadorCode: 'AMB-X-001',
    fullName: 'Test Ambassador',
    firstName: 'Test',
    lastName: 'Ambassador',
    email: 'test.ambassador@marriageducation.com',
    phone: '+237678901234',
    city: 'Yaoundé',
    region: 'Centre',
    status: 'active',
    booksSold: 0,
    commissionEarned: 0,
    level: 'Starter',
    rdCode: '',
    recruited_by_rd: null,
    recruited_by_senior: null,
    ambassador_type: 'regular',
    
    // Multi-product tracking fields
    access_units_deployed: 0,
    deployment_by_category: {
      books: 0,
      schools: 0,
      courses: 0,
      premium: 0,
      corporate: 0,
      community: 0
    },
    revenue_by_category: {
      books: 0,
      schools: 0,
      courses: 0,
      premium: 0,
      corporate: 0,
      community: 0
    },
    monthly_earnings: {},
    
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    activated_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  };
  
  try {
    await db.collection('ambassadors').doc('AMB-X-001').set(testAmbassador);
    console.log('✅ Test ambassador created successfully!\n');
    console.log('📋 Details:');
    console.log('   Code: AMB-X-001');
    console.log('   Name: Test Ambassador');
    console.log('   Email: test.ambassador@marriageducation.com');
    console.log('   Status: active');
    console.log('\n🧪 You can now use this code in your commission tests!\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

createTestAmbassador();
