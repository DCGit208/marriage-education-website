/**
 * Approve AMB-MAKO-7550 and send to bthedugrp@gmail.com
 */

const axios = require('axios');
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function approveNewAmbassador() {
  const ambassadorCode = 'AMB-MAKO-7550';
  const email = 'bthedugrp@gmail.com';
  const phone = '677604100';
  const recruitedBy = null;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 Processing: ${ambassadorCode}`);
  console.log(`📧 Email: ${email}`);
  console.log(`${'='.repeat(60)}\n`);
  
  try {
    // Find ambassador in Firestore
    const snapshot = await db.collection('ambassadors')
      .where('code', '==', ambassadorCode)
      .get();
    
    if (snapshot.empty) {
      console.log(`❌ Ambassador not found, creating new record...`);
      
      await db.collection('ambassadors').add({
        code: ambassadorCode,
        email: email,
        phone: phone,
        status: 'active',
        fullName: 'MAKO', // Placeholder
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        payment: {
          amount: 15000,
          currency: 'XAF',
          status: 'completed'
        },
        recruitedBy: recruitedBy,
        commissionsPaid: 0,
        totalEarnings: 0,
        referralCount: 0
      });
      
      console.log(`✅ Ambassador record created`);
    } else {
      const doc = snapshot.docs[0];
      await doc.ref.update({
        status: 'active',
        approvedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`✅ Ambassador record updated to active`);
    }
    
    // Generate book download URL
    console.log(`📦 Generating book download link...`);
    const bucket = admin.storage().bucket('marriage-education.appspot.com');
    const file = bucket.file('teleios-blueprint.pdf');
    
    const [bookUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    
    console.log(`✅ Book link generated\n`);
    
    // Send email via UPDATED PHP script (now deployed)
    console.log(`📨 Sending email via UPDATED PHP script...`);
    console.log(`🌐 Endpoint: https://marriageducation.com/send-ambassador-credentials.php\n`);
    
    const response = await axios.post('https://marriageducation.com/send-ambassador-credentials.php', {
      email: email,
      fullName: 'Ambassador MAKO',
      code: ambassadorCode,
      bookUrl: bookUrl
    }, {
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    
    if (response.data && response.data.success) {
      console.log(`\n✅ SUCCESS! Email sent to ${email}`);
      console.log(`\n📬 CHECK YOUR INBOX NOW!`);
      console.log(`   Email: ${email}`);
      console.log(`   Check: Inbox, Spam, Promotions tabs`);
    } else {
      console.log(`\n❌ FAILED: ${response.data?.error || 'Unknown error'}`);
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

approveNewAmbassador();
