/**
 * Resend Email to house_justice@yahoo.com
 */

const axios = require('axios');
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function resendToSpecificEmail() {
  const targetEmail = 'house_justice@yahoo.com';
  const ambassadorCode = 'AMB-ACHU-0086';
  
  console.log(`📧 Resending email to ${targetEmail}...\n`);
  
  try {
    // Get ambassador data
    const snapshot = await db.collection('ambassadors')
      .where('code', '==', ambassadorCode)
      .get();
    
    if (snapshot.empty) {
      console.log('❌ Ambassador not found');
      process.exit(1);
    }
    
    const ambassadorData = snapshot.docs[0].data();
    
    // Generate new book download URL
    console.log('📦 Generating book download link...');
    const bucket = admin.storage().bucket('marriage-education.appspot.com');
    const file = bucket.file('teleios-blueprint.pdf');
    
    const [bookUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    
    console.log('✅ Book link generated');
    
    // Send email via improved PHP script
    console.log('📨 Sending email...');
    
    const response = await axios.post('https://marriageducation.com/send-ambassador-credentials.php', {
      email: targetEmail,
      fullName: ambassadorData.fullName || 'Ambassador',
      code: ambassadorCode,
      bookUrl: bookUrl
    }, {
      timeout: 15000
    });
    
    if (response.data && response.data.success) {
      console.log('✅ SUCCESS! Email sent to', targetEmail);
      console.log('\n📬 Check your inbox AND spam/junk folder');
      console.log('💡 If in spam, mark it as "Not Spam" to receive future emails');
    } else {
      console.log('❌ Failed:', response.data?.error || 'Unknown error');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

resendToSpecificEmail();
