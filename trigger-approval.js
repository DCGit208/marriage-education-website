const axios = require('axios');

const FIREBASE_PROJECT = 'marriage-education';
const FUNCTION_REGION = 'us-central1';
const FUNCTION_URL = `https://${FUNCTION_REGION}-${FIREBASE_PROJECT}.cloudfunctions.net/approvePayment`;

async function approvePayment() {
  const ambassadorCode = 'AMB-TEST-4919';
  
  console.log(`\n⚡ Triggering approval for: ${ambassadorCode}\n`);
  
  try {
    const response = await axios.post(FUNCTION_URL, {
      data: { reference: ambassadorCode }
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    
    console.log('✅ APPROVAL SUCCESS!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    console.log('\n📧 CHECK YOUR EMAIL: bthedugrp@gmail.com');
    console.log('📱 CHECK TELEGRAM for notification');
    console.log('\n🔐 Login: https://marriageducation.com/ambassador-login.html');
    console.log(`   Code: ${ambassadorCode}`);
    console.log(`   Email: bthedugrp@gmail.com\n`);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ APPROVAL FAILED:', error.response?.data || error.message);
    process.exit(1);
  }
}

approvePayment();
