/**
 * Resend Ambassador Credentials Emails
 * 
 * This script fetches the last 3 approved ambassadors
 * and resends their welcome emails with credentials
 */

const admin = require('firebase-admin');
const axios = require('axios');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function resendAmbassadorEmails() {
  try {
    console.log('🔍 Fetching approved ambassadors...\n');
    
    // Query for all approved/active ambassadors (no orderBy to avoid index requirement)
    const snapshot = await db.collection('ambassadors')
      .where('status', 'in', ['active', 'approved'])
      .get();
    
    if (snapshot.empty) {
      console.log('❌ No approved ambassadors found.');
      return;
    }
    
    // Collect all ambassadors and sort by creation date locally
    const allAmbassadors = [];
    snapshot.docs.forEach(doc => {
      allAmbassadors.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Sort by creation date (most recent first) and take last 3
    allAmbassadors.sort((a, b) => {
      const timeA = a.createdAt?._seconds || 0;
      const timeB = b.createdAt?._seconds || 0;
      return timeB - timeA;
    });
    
    const ambassadors = allAmbassadors.slice(0, 3);
    
    console.log(`✅ Found ${snapshot.docs.length} total, sending to last 3\n`);
    
    // Display ambassadors
    console.log('📋 Ambassadors to email:');
    ambassadors.forEach((amb, idx) => {
      console.log(`\n${idx + 1}. ${amb.fullName}`);
      console.log(`   Code: ${amb.code}`);
      console.log(`   Email: ${amb.email}`);
      console.log(`   Status: ${amb.status}`);
      console.log(`   Created: ${amb.createdAt ? new Date(amb.createdAt._seconds * 1000).toLocaleString() : 'Unknown'}`);
    });
    
    console.log('\n\n🚀 Sending emails...\n');
    
    // Send emails for each ambassador
    for (const ambassador of ambassadors) {
      try {
        // Generate book download URL (valid for 7 days)
        const bookUrl = await generateDownloadURL(ambassador.code);
        
        console.log(`\n📧 Sending email to ${ambassador.fullName} (${ambassador.email})...`);
        
        // Call the PHP email script
        const response = await axios.post('https://marriageducation.com/send-ambassador-credentials.php', {
          email: ambassador.email,
          fullName: ambassador.fullName,
          code: ambassador.code,
          bookUrl: bookUrl
        }, {
          timeout: 10000
        });
        
        if (response.data && response.data.success) {
          console.log(`   ✅ SUCCESS: Email sent to ${ambassador.email}`);
          
          // Update Firestore to mark email as sent (use id, not code)
          try {
            await db.collection('ambassadors').doc(ambassador.id).update({
              lastEmailSent: admin.firestore.FieldValue.serverTimestamp(),
              emailSentCount: admin.firestore.FieldValue.increment(1)
            });
          } catch (updateError) {
            // Ignore update errors - email was already sent
          }
          
        } else {
          console.log(`   ❌ FAILED: ${response.data?.error || 'Unknown error'}`);
        }
        
      } catch (error) {
        console.log(`   ❌ ERROR sending to ${ambassador.email}:`, error.message);
      }
      
      // Wait 2 seconds between emails to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n\n✅ Email resend process complete!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

/**
 * Generate a signed download URL for the book package
 */
async function generateDownloadURL(ambassadorCode) {
  const bucket = admin.storage().bucket('marriage-education.appspot.com');
  const fileName = 'teleios-blueprint.pdf'; // Adjust to your actual book file
  const file = bucket.file(fileName);
  
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  });
  
  // Store download token in Firestore for tracking
  await db.collection('download_tokens').doc(ambassadorCode).set({
    ambassadorCode: ambassadorCode,
    downloadUrl: url,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    downloaded: false
  });
  
  return url;
}

// Run the script
resendAmbassadorEmails();
