/**
 * Send Ambassador Emails via Resend API
 * Reliable email delivery without PHP mail() issues
 */

const axios = require('axios');
const admin = require('firebase-admin');

// Initialize Firebase
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Resend API Configuration
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_4kUwZSah_EoJWU7gtdZ4DFKrEjJzfDFAG';
const FROM_EMAIL = 'orders@marriageducation.com';
const FROM_NAME = 'Marriage Education';

async function sendEmailViaResend(to, ambassadorCode, fullName, bookUrl) {
  const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #2d3436; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #00b894 0%, #00a085 100%); color: white; padding: 30px; text-align: center; }
        .content { background: #f8f9fa; padding: 30px; }
        .box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #00b894; }
        .code { font-family: monospace; font-size: 20px; color: #00b894; font-weight: bold; }
        .button { display: inline-block; background: #00b894; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        .footer { text-align: center; padding: 20px; color: #636e72; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome, Ambassador ${fullName}!</h1>
        </div>
        <div class="content">
            <p>Congratulations! Your ambassador registration has been approved.</p>
            
            <div class="box">
                <h3>Your Ambassador Credentials</h3>
                <p><strong>Ambassador Code:</strong> <span class="code">${ambassadorCode}</span></p>
                <p><strong>Email:</strong> ${to}</p>
                <p><strong>Dashboard:</strong> <a href="https://marriageducation.com/ambassador-login.html">Login Here</a></p>
            </div>
            
            <div class="box">
                <h3>Your Book Download</h3>
                <p>Download your book package now. This link expires in 7 days (${expiryDate}).</p>
                <a href="${bookUrl}" class="button">Download Book</a>
                <p style="font-size: 12px; color: #636e72; margin-top: 10px;">If the button doesn't work, copy this link:<br>${bookUrl}</p>
            </div>
            
            <h3>Next Steps:</h3>
            <ol>
                <li>Download and read your book package</li>
                <li>Log in to your ambassador dashboard</li>
                <li>Get your unique referral link</li>
                <li>Start sharing and earning commissions!</li>
            </ol>
            
            <p><strong>Questions?</strong> Reply to this email or contact support@marriageducation.com</p>
        </div>
        <div class="footer">
            <p>Marriage Education | marriageducation.com</p>
        </div>
    </div>
</body>
</html>
  `;
  
  const plainText = `
Welcome, Ambassador ${fullName}!

Congratulations! Your ambassador registration has been approved.

YOUR AMBASSADOR CREDENTIALS
============================
Ambassador Code: ${ambassadorCode}
Email: ${to}
Dashboard: https://marriageducation.com/ambassador-login.html

YOUR BOOK DOWNLOAD
==================
Download your book package now. This link expires in 7 days (${expiryDate}).

Book Download Link:
${bookUrl}

NEXT STEPS
==========
1. Download and read your book package
2. Log in to your ambassador dashboard
3. Get your unique referral link
4. Start sharing and earning commissions!

Questions? Reply to this email or contact support@marriageducation.com

---
Marriage Education | marriageducation.com
  `;
  
  const payload = {
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to: [to],
    subject: `Welcome Ambassador ${ambassadorCode} - Your Credentials Inside`,
    html: htmlContent,
    text: plainText,
  };
  
  try {
    const response = await axios.post('https://api.resend.com/emails', payload, {
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    return { success: true, status: response.status };
  } catch (error) {
    console.error('Resend error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}

async function sendAmbassadorEmail(ambassadorCode, email) {
  console.log(`\n📧 Sending to: ${email} (${ambassadorCode})\n`);
  
  try {
    // Get ambassador data
    const snapshot = await db.collection('ambassadors')
      .where('code', '==', ambassadorCode)
      .get();
    
    if (snapshot.empty) {
      console.log('❌ Ambassador not found');
      return;
    }
    
    const ambassadorData = snapshot.docs[0].data();
    
    // Generate book URL
    console.log('📦 Generating book link...');
    const bucket = admin.storage().bucket('marriage-education.appspot.com');
    const file = bucket.file('teleios-blueprint.pdf');
    
    const [bookUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    
    // Send via Resend
    console.log('📨 Sending via Resend API...');
    const result = await sendEmailViaResend(
      email,
      ambassadorCode,
      ambassadorData.fullName || 'Ambassador',
      bookUrl
    );
    
    if (result.success) {
      console.log(`✅ SUCCESS! Email sent to ${email}`);
      console.log(`   Status: ${result.status}`);
    } else {
      console.log(`❌ FAILED:`, result.error);
    }
    
    process.exit(result.success ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node send-via-sendgrid.js <AMBASSADOR_CODE> <EMAIL>'); // now uses Resend
  console.log('Example: node send-via-sendgrid.js AMB-MAKO-7550 bthedugrp@gmail.com');
  process.exit(1);
}

sendAmbassadorEmail(args[0], args[1]);
