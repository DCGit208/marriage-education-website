const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'marriage-education.firebasestorage.app'
});

const db = admin.firestore();

// iPage SMTP Configuration
const transporter = nodemailer.createTransport({
  host: 'smtp.ipage.com',
  port: 587,
  secure: false,
  auth: {
    user: 'orders@marriageducation.com',
    pass: 'Fi5%%%orderBTH123'
  },
  tls: {
    rejectUnauthorized: false
  }
});

async function sendEmail() {
  const ambassadorCode = 'AMB-MAGA-2373';
  const email = 'bthedugrp@gmail.com';
  
  console.log(`\n📧 Sending email to: ${email}`);
  console.log(`   Ambassador Code: ${ambassadorCode}\n`);
  
  try {
    // Ensure ambassador exists
    const snapshot = await db.collection('ambassadors')
      .where('code', '==', ambassadorCode)
      .get();
    
    if (snapshot.empty) {
      console.log('Creating ambassador record...');
      await db.collection('ambassadors').add({
        code: ambassadorCode,
        email: email,
        phone: '677604100',
        status: 'active',
        fullName: 'Ambassador MAGA',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('✅ Ambassador created');
    } else {
      console.log('✅ Ambassador exists');
    }
    
    // Generate book URL using token-based public URL (not signed URL)
    const bucket = admin.storage().bucket();
    const file = bucket.file('ebooks/sbd-for-dummies.pdf');
    
    // Get or create download token
    const [metadata] = await file.getMetadata();
    let token = metadata.metadata?.firebaseStorageDownloadTokens;
    
    if (!token) {
      // Generate new token if doesn't exist
      const { v4: uuidv4 } = require('uuid');
      token = uuidv4();
      await file.setMetadata({
        metadata: {
          firebaseStorageDownloadTokens: token
        }
      });
      console.log('✅ Created new download token');
    }
    
    // Construct public download URL with token
    const bucketName = 'marriage-education.firebasestorage.app';
    const encodedFilename = encodeURIComponent('ebooks/sbd-for-dummies.pdf');
    const bookUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedFilename}?alt=media&token=${token}`;
    
    console.log('✅ Book URL generated\n');
    
    // Send via iPage SMTP
    console.log('📧 Sending via iPage SMTP (smtp.ipage.com:587)...\n');
    
    const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString();
    
    const mailOptions = {
      from: '"Marriage Education" <orders@marriageducation.com>',
      to: email,
      subject: `Welcome Ambassador ${ambassadorCode} - Your Credentials Inside`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #00b894 0%, #00a085 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1>Welcome, Ambassador!</h1>
          </div>
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
            <p>Congratulations! Your ambassador registration has been approved.</p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #00b894;">
              <h3>Your Ambassador Credentials</h3>
              <p><strong>Ambassador Code:</strong> <span style="font-family: monospace; font-size: 20px; color: #00b894;">${ambassadorCode}</span></p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Dashboard:</strong> <a href="https://marriageducation.com/ambassador-login.html">Login Here</a></p>
            </div>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #00b894;">
              <h3>Your Book Download</h3>
              <p>Download your book package now. Expires: ${expiryDate}</p>
              <a href="${bookUrl}" style="display: inline-block; background: #00b894; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">Download Book</a>
            </div>
            
            <h3>Next Steps:</h3>
            <ol>
              <li>Download and read your book package</li>
              <li>Log in to your ambassador dashboard</li>
              <li>Get your unique referral link</li>
              <li>Start sharing and earning commissions!</li>
            </ol>
          </div>
        </div>
      `,
      text: `Welcome Ambassador ${ambassadorCode}!\n\nYour credentials:\nCode: ${ambassadorCode}\nEmail: ${email}\nDashboard: https://marriageducation.com/ambassador-login.html\n\nBook Download: ${bookUrl}\nExpires: ${expiryDate}`
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ EMAIL SENT SUCCESSFULLY!');
    console.log('   Message ID:', info.messageId);
    console.log('   Response:', info.response);
    console.log('\n📬 CHECK YOUR INBOX NOW at:', email);
    console.log('   - Check Inbox');
    console.log('   - Check Spam/Junk folder');
    console.log('   - Check Promotions tab (Gmail)');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.code) console.error('   Error Code:', error.code);
    if (error.response) console.error('   SMTP Response:', error.response);
    process.exit(1);
  }
}

sendEmail();
