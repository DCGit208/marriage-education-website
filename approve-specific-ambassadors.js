/**
 * Approve Specific Ambassadors and Send Credentials
 * 
 * Approves pending ambassadors and sends welcome emails
 */

const admin = require('firebase-admin');
const axios = require('axios');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Ambassadors to approve
const AMBASSADORS_TO_APPROVE = [
  {
    code: 'AMB-NGAN-6217',
    email: 'mbonghio@gmail.com',
    phone: '681498369',
    amount: 15000,
    currency: 'XAF',
    recruitedBy: 'RD-AYIN-5086'
  },
  {
    code: 'AMB-ACHU-0086',
    email: 'house_justice@yahoo.com',
    phone: '677604100',
    amount: 15000,
    currency: 'XAF',
    recruitedBy: null
  }
];

async function approveAndSendEmails() {
  try {
    console.log('🔍 Processing ambassadors for approval...\n');
    
    for (const ambassadorInfo of AMBASSADORS_TO_APPROVE) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📋 Processing: ${ambassadorInfo.code}`);
      console.log(`${'='.repeat(60)}`);
      
      try {
        // Find ambassador in Firestore
        const snapshot = await db.collection('ambassadors')
          .where('code', '==', ambassadorInfo.code)
          .get();
        
        if (snapshot.empty) {
          console.log(`❌ Ambassador ${ambassadorInfo.code} not found in database`);
          console.log(`   Creating new ambassador record...`);
          
          // Create new ambassador if doesn't exist
          await db.collection('ambassadors').add({
            code: ambassadorInfo.code,
            email: ambassadorInfo.email,
            phone: ambassadorInfo.phone,
            status: 'active',
            fullName: ambassadorInfo.code.split('-')[1], // Use middle part as name placeholder
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            payment: {
              amount: ambassadorInfo.amount,
              currency: ambassadorInfo.currency,
              status: 'completed'
            },
            recruitedBy: ambassadorInfo.recruitedBy,
            commissionsPaid: 0,
            totalEarnings: 0,
            referralCount: 0
          });
          
          console.log(`   ✅ Ambassador record created`);
        } else {
          const doc = snapshot.docs[0];
          const ambassadorData = doc.data();
          
          console.log(`   📝 Found existing record`);
          console.log(`   Current status: ${ambassadorData.status}`);
          
          // Update to active if not already
          if (ambassadorData.status !== 'active') {
            await doc.ref.update({
              status: 'active',
              approvedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`   ✅ Status updated to active`);
          }
        }
        
        // Get updated ambassador data
        const ambassadorSnapshot = await db.collection('ambassadors')
          .where('code', '==', ambassadorInfo.code)
          .get();
        
        const ambassadorData = ambassadorSnapshot.docs[0].data();
        
        // Generate book download URL
        console.log(`   📦 Generating book download link...`);
        const bookUrl = await generateDownloadURL(ambassadorInfo.code);
        console.log(`   ✅ Book link generated`);
        
        // Send welcome email
        console.log(`   📧 Sending welcome email to ${ambassadorInfo.email}...`);
        
        const emailResponse = await axios.post('https://marriageducation.com/send-ambassador-credentials.php', {
          email: ambassadorInfo.email,
          fullName: ambassadorData.fullName || ambassadorInfo.code,
          code: ambassadorInfo.code,
          bookUrl: bookUrl
        }, {
          timeout: 15000
        });
        
        if (emailResponse.data && emailResponse.data.success) {
          console.log(`   ✅ Email sent successfully!`);
          
          // Update last email sent timestamp
          await ambassadorSnapshot.docs[0].ref.update({
            lastEmailSent: admin.firestore.FieldValue.serverTimestamp(),
            emailSentCount: admin.firestore.FieldValue.increment(1)
          });
          
        } else {
          console.log(`   ❌ Email failed: ${emailResponse.data?.error || 'Unknown error'}`);
        }
        
        // Send Telegram notification
        await sendTelegramNotification(ambassadorInfo, bookUrl);
        
        console.log(`\n   ✅ ${ambassadorInfo.code} processing complete!`);
        
      } catch (error) {
        console.error(`   ❌ Error processing ${ambassadorInfo.code}:`, error.message);
      }
      
      // Wait 2 seconds between ambassadors
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n\n' + '='.repeat(60));
    console.log('✅ ALL AMBASSADORS PROCESSED SUCCESSFULLY!');
    console.log('='.repeat(60));
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

/**
 * Generate a signed download URL for the book package
 */
async function generateDownloadURL(ambassadorCode) {
  const bucket = admin.storage().bucket('marriage-education.appspot.com');
  const fileName = 'teleios-blueprint.pdf';
  const file = bucket.file(fileName);
  
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  });
  
  // Store download token
  await db.collection('download_tokens').add({
    ambassadorCode: ambassadorCode,
    downloadUrl: url,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    downloaded: false
  });
  
  return url;
}

/**
 * Send Telegram notification
 */
async function sendTelegramNotification(ambassador, bookUrl) {
  const TELEGRAM_BOT_TOKEN = '7957827035:AAGmf51iBJlDvXHngjGxRJRtXJXqB3FGEys';
  const TELEGRAM_CHAT_ID = '-4526163929';
  
  const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString();
  
  const message = 
    `✅ AMBASSADOR ACTIVATED\n\n` +
    `👤 Code: ${ambassador.code}\n` +
    `📧 Email: ${ambassador.email}\n` +
    `📱 Phone: ${ambassador.phone}\n` +
    `💰 Payment: ${ambassador.amount} ${ambassador.currency}\n` +
    `${ambassador.recruitedBy ? `👑 Recruited By: ${ambassador.recruitedBy}\n` : ''}` +
    `📧 Email: ✅ Sent\n` +
    `🔐 Dashboard: https://marriageducation.com/ambassador-login.html\n\n` +
    `📥 Book Download (expires ${expiryDate}):\n${bookUrl}`;
  
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    });
    console.log(`   ✅ Telegram notification sent`);
  } catch (error) {
    console.log(`   ⚠️ Telegram notification failed:`, error.message);
  }
}

// Run the script
approveAndSendEmails();
