const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
const axios = require('axios');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const functions = admin.functions();

async function approvePayment() {
  try {
    const approvePayment = functions.httpsCallable('approvePayment');
    const result = await approvePayment({ reference: 'AMB-TEST-8087' });
    
    console.log('\n✅ APPROVAL SUCCESS:', result.data);
    console.log('\n📧 Check your email: bthedugrp@gmail.com');
    console.log('📱 Check Telegram for notification with login link\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ APPROVAL FAILED:', error.message);
    process.exit(1);
  }
}

approvePayment();
