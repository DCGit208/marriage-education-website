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
  const ambassadorCode = 'AMB-LEIN-4793';
  
  console.log(`\n📧 Fetching ambassador data for: ${ambassadorCode}\n`);
  
  try {
    const ambassadorRef = db.collection('ambassadors').doc(ambassadorCode);
    const ambassadorDoc = await ambassadorRef.get();
    
    if (!ambassadorDoc.exists) {
      console.error(`❌ Ambassador ${ambassadorCode} not found`);
      process.exit(1);
    }
    
    const data = ambassadorDoc.data();
    const email = data.email;
    const fullName = data.fullName;
    const bookUrl = 'https://firebasestorage.googleapis.com/v0/b/marriage-education.firebasestorage.app/o/ebooks%2Fsbd-for-dummies.pdf?alt=media&token=7fd70f22-0412-40c9-9fe6-5e6a05a6fd51';
    
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7);
    const formattedExpiry = expiryDate.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    console.log(`👤 Name: ${fullName}`);
    console.log(`📧 Email: ${email}`);
    console.log(`🎯 Code: ${ambassadorCode}`);
    console.log(`📅 Book expires: ${formattedExpiry}\n`);
    
    const mailOptions = {
      from: '"Marriage Education" <orders@marriageducation.com>',
      to: email,
      subject: `Account Activated: ${ambassadorCode}`,
      html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
</head>
<body style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;'>
    <table width='100%' cellpadding='0' cellspacing='0' style='background: #f4f4f4; padding: 20px;'>
        <tr>
            <td align='center'>
                <table width='600' cellpadding='0' cellspacing='0' style='background: white; border: 1px solid #ddd;'>
                    <tr>
                        <td style='padding: 30px; background: #00b894; color: white; text-align: center;'>
                            <h1 style='margin: 0; font-size: 24px;'>Account Activated</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style='padding: 30px;'>
                            <table width='100%' cellpadding='15' cellspacing='0' style='background: #fff3cd; border: 2px solid #ffc107; margin-bottom: 20px; border-radius: 5px;'>
                                <tr>
                                    <td style='text-align: center;'>
                                        <p style='margin: 0; color: #856404; font-size: 14px; font-weight: bold;'>⚠️ IMPORTANT: Check Your Spam/Junk Folder</p>
                                        <p style='margin: 10px 0 0 0; color: #856404; font-size: 12px;'>If this email arrived in Spam/Junk, please mark it as "Not Junk" or "Not Spam" to ensure you receive future emails in your inbox.</p>
                                    </td>
                                </tr>
                            </table>
                            
                            <p>Hello ${fullName},</p>
                            
                            <p>Your account has been activated. You can now log in using the credentials below.</p>
                            
                            <table width='100%' cellpadding='15' cellspacing='0' style='background: #f8f9fa; border-left: 4px solid #00b894; margin: 20px 0;'>
                                <tr>
                                    <td>
                                        <p style='margin: 5px 0;'><strong>Account Code:</strong> ${ambassadorCode}</p>
                                        <p style='margin: 5px 0;'><strong>Email:</strong> ${email}</p>
                                        <p style='margin: 5px 0;'><strong>Login URL:</strong> marriageducation.com/ambassador-login.html</p>
                                    </td>
                                </tr>
                            </table>
                            
                            <p><strong>Account Resources</strong></p>
                            <p>Your account includes access to digital resources. Download link valid until ${formattedExpiry}:</p>
                            <p><a href='${bookUrl}' style='color: #00b894;'>${bookUrl}</a></p>
                            
                            <p style='margin-top: 30px;'>If you have questions, reply to this email.</p>
                            
                            <p>Marriage Education Team</p>
                        </td>
                    </tr>
                    <tr>
                        <td style='padding: 20px; background: #f8f9fa; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ddd;'>
                            <p style='margin: 5px 0;'>Marriage Education</p>
                            <p style='margin: 5px 0;'>marriageducation.com</p>
                            <p style='margin: 10px 0; font-size: 11px;'>This is an automated account notification. You received this because you registered an account with us.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
      `,
      text: `
Account Activated

⚠️ IMPORTANT: CHECK YOUR SPAM/JUNK FOLDER
If this email arrived in Spam/Junk, please mark it as "Not Junk" or "Not Spam" 
to ensure you receive future emails in your inbox.

Hello ${fullName},

Your account has been activated. You can now log in using the credentials below.

Account Code: ${ambassadorCode}
Email: ${email}
Login URL: marriageducation.com/ambassador-login.html

Account Resources
Your account includes access to digital resources. Download link valid until ${formattedExpiry}:
${bookUrl}

If you have questions, reply to this email.

Marriage Education Team

---
Marriage Education
marriageducation.com
This is an automated account notification. You received this because you registered an account with us.
      `
    };
    
    console.log('📤 Sending email...\n');
    
    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Email sent successfully!');
    console.log(`📧 Message ID: ${info.messageId}`);
    console.log(`📬 Email sent to: ${email}\n`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

sendEmail();
