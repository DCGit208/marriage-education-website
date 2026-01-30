/**
 * Send emails via iPage SMTP to all pending ambassadors
 */

const axios = require('axios');
const admin = require('firebase-admin');

const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const AMBASSADORS = [
  { code: 'AMB-MAKO-7550', email: 'bthedugrp@gmail.com', name: 'MAKO' },
  { code: 'AMB-ACHU-0086', email: 'house_justice@yahoo.com', name: 'ACHU' },
  { code: 'AMB-NGAN-6217', email: 'mbonghio@gmail.com', name: 'NGAN' }
];

async function sendAllEmails() {
  console.log('📧 Sending emails via iPage SMTP\n');
  console.log('='.repeat(60));
  
  for (const amb of AMBASSADORS) {
    console.log(`\n📨 Processing: ${amb.code} (${amb.email})`);
    
    try {
      // Generate book URL
      const bucket = admin.storage().bucket('marriage-education.appspot.com');
      const file = bucket.file('teleios-blueprint.pdf');
      
      const [bookUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      
      console.log('   ✅ Book link generated');
      
      // Send via SMTP
      console.log('   📧 Sending via iPage SMTP...');
      
      const response = await axios.post('https://marriageducation.com/send-smtp-simple.php', {
        email: amb.email,
        fullName: `Ambassador ${amb.name}`,
        code: amb.code,
        bookUrl: bookUrl
      }, {
        timeout: 20000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.data && response.data.success) {
        console.log(`   ✅ SUCCESS! Email sent to ${amb.email}`);
      } else {
        console.log(`   ❌ FAILED:`, response.data?.error || 'Unknown error');
      }
      
    } catch (error) {
      console.log(`   ❌ ERROR:`, error.message);
      if (error.response) {
        console.log(`   Response:`, error.response.data);
      }
    }
    
    // Wait 3 seconds between emails
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ ALL EMAILS PROCESSED!');
  console.log('\n📬 CHECK INBOXES NOW:');
  AMBASSADORS.forEach(amb => {
    console.log(`   - ${amb.email}`);
  });
  
  process.exit(0);
}

sendAllEmails();
