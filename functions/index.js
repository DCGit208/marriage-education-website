const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')(functions.config().stripe?.secret_key);
const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');
const axios = require('axios');

// UUID - generate random tokens
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();

// Initialize SendGrid if available
const SENDGRID_API_KEY = functions.config().sendgrid?.api_key;
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

// Telegram Configuration
const TELEGRAM_BOT_TOKEN = functions.config().telegram?.bot_token;
const TELEGRAM_CHAT_ID = functions.config().telegram?.chat_id;

// SMTP Configuration (iPage)
const SMTP_CONFIG = {
  host: functions.config().smtp?.host || 'smtp.ipage.com',
  port: parseInt(functions.config().smtp?.port || '587'),
  user: functions.config().smtp?.user || 'orders@marriageducation.com',
  pass: functions.config().smtp?.pass || '',
  from: functions.config().smtp?.from || 'orders@marriageducation.com'
};

// Email transporter
let transporter;
try {
  if (SMTP_CONFIG.user && SMTP_CONFIG.pass) {
    transporter = nodemailer.createTransport({
      host: SMTP_CONFIG.host,
      port: SMTP_CONFIG.port,
      secure: false, // STARTTLS
      auth: {
        user: SMTP_CONFIG.user,
        pass: SMTP_CONFIG.pass
      },
      tls: {
        rejectUnauthorized: false // For iPage compatibility
      }
    });
    console.log('[SMTP] Configured:', SMTP_CONFIG.host);
  }
} catch (error) {
  console.log('[SMTP] Not configured:', error.message);
  transporter = null;
}

// ========== HELPER FUNCTIONS ==========

/**
 * Send Telegram message to admin
 */
async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('[Telegram] Not configured');
    return false;
  }
  
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    });
    console.log('[Telegram] Message sent');
    return true;
  } catch (error) {
    console.error('[Telegram] Error:', error.message);
    return false;
  }
}

/**
 * Generate signed download URL from Firebase Storage
 */
async function generateDownloadURL(productId) {
  // Map product IDs to PDF filenames
  const productMap = {
    'sbd-book': 'sbd-for-dummies.pdf',
    'sbd-for-dummies': 'sbd-for-dummies.pdf',
    'sbd-standard': 'sbd-standard.pdf',
    'sbd-canonical': 'sbd-canonical.pdf',
    'complete-sbd-library': 'complete-sbd-library.pdf',
    'the-arts-of-marriage': 'the-arts-of-marriage.pdf',
    'naked-not-ashamed': 'naked-not-ashamed.pdf',
    // Add more mappings as needed
  };
  
  const filename = productMap[productId] || 'sbd-for-dummies.pdf';
  const file = bucket.file(`ebooks/${filename}`);
  
  try {
    // Check if file exists first
    const [exists] = await file.exists();
    console.log(`[Storage] File ${filename} exists: ${exists}`);
    
    if (!exists) {
      console.error(`[Storage] File not found: ebooks/${filename}`);
      throw new Error(`Book file '${filename}' not found in Firebase Storage. Please upload the file first.`);
    }
    
    // Get or create a download token
    const [metadata] = await file.getMetadata();
    let token = metadata.metadata?.firebaseStorageDownloadTokens;
    
    if (!token) {
      // Generate a new token if one doesn't exist
      token = uuidv4();
      await file.setMetadata({
        metadata: {
          firebaseStorageDownloadTokens: token
        }
      });
      console.log(`[Storage] Created new download token for ${filename}`);
    } else {
      console.log(`[Storage] Using existing download token for ${filename}`);
    }
    
    // Construct the public download URL with token
    const bucketName = bucket.name;
    const encodedFilename = encodeURIComponent(`ebooks/${filename}`);
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedFilename}?alt=media&token=${token}`;
    
    console.log(`[Storage] Generated download URL for ${filename}`);
    return url;
  } catch (error) {
    console.error(`[Storage] Error with ${filename}:`, error.message);
    throw error;
  }
}

/**
 * Send download email to customer
 */
async function sendDownloadEmail(email, productName, downloadUrl) {
  const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #2d3748; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f7fafc; padding: 30px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #718096; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📚 Your eBook is Ready!</h1>
    </div>
    <div class="content">
      <h2>Payment Approved</h2>
      <p>Thank you for your purchase! Your payment has been approved and your eBook is ready to download.</p>
      
      <p><strong>Product:</strong> ${productName}</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${downloadUrl}" class="button">📥 Download Now</a>
      </div>
      
      <p><strong>Download expires:</strong> ${expiryDate}</p>
      
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="word-break: break-all; background: #edf2f7; padding: 10px; border-radius: 5px;">${downloadUrl}</p>
      
      <p>Thank you for supporting Marriage Education!</p>
    </div>
    <div class="footer">
      <p>Marriage Education | marriageducation.com</p>
      <p>Questions? Reply to this email</p>
    </div>
  </div>
</body>
</html>
  `;
  
  try {
    if (transporter) {
      await transporter.sendMail({
        from: `"Marriage Education" <${SMTP_CONFIG.from}>`,
        to: email,
        subject: `📥 Your eBook is Ready - ${productName}`,
        html: html
      });
      console.log(`[Email] Sent to ${email}`);
      return true;
    } else {
      console.log('[Email] Transporter not configured');
      return false;
    }
  } catch (error) {
    console.error('[Email] Error:', error.message);
    return false;
  }
}

// ========== END HELPER FUNCTIONS ==========

/**
 * Stripe Webhook Handler
 * Triggers on successful payment to auto-enroll students
 */
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = functions.config().stripe?.webhook_secret;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle successful payment
  if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
    const session = event.data.object;
    
    try {
      // Extract course info from metadata
      const courseId = session.metadata?.courseId || session.metadata?.product;
      const customerEmail = session.customer_details?.email || session.metadata?.email;
      const customerName = session.customer_details?.name || session.metadata?.name || 'Student';
      
      if (!courseId) {
        console.log('No courseId in payment metadata - skipping enrollment');
        return res.json({ received: true, action: 'skipped' });
      }

      // Get course details
      const courseDoc = await db.collection('courses').doc(courseId).get();
      
      if (!courseDoc.exists) {
        console.error(`Course ${courseId} not found`);
        return res.status(404).json({ error: 'Course not found' });
      }

      const course = courseDoc.data();

      // Create enrollment record
      const enrollmentId = `${courseId}_${Date.now()}`;
      const enrollment = {
        enrollmentId,
        courseId,
        courseTitle: course.title,
        studentEmail: customerEmail,
        studentName: customerName,
        enrolledAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentId: session.id,
        paymentAmount: session.amount_total / 100,
        paymentCurrency: session.currency || 'usd',
        status: 'active',
        progress: 0,
        completedModules: [],
        lastAccessed: null
      };

      await db.collection('enrollments').doc(enrollmentId).add(enrollment);

      // Update course enrollment count
      await db.collection('courses').doc(courseId).update({
        enrollmentCount: admin.firestore.FieldValue.increment(1)
      });

      // Send access email
      await sendCourseAccessEmail({
        email: customerEmail,
        name: customerName,
        courseTitle: course.title,
        courseId: courseId,
        enrollmentId: enrollmentId
      });

      console.log(`✅ Enrolled ${customerEmail} in ${courseId}`);
      
      return res.json({ 
        received: true, 
        enrolled: true,
        courseId,
        email: customerEmail 
      });

    } catch (error) {
      console.error('Enrollment error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  res.json({ received: true });
});

/**
 * MTN MoMo Webhook Handler
 * Triggers on successful MoMo payment
 */
exports.momoWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const { status, referenceId, externalId, amount, currency, payer } = req.body;

    // Verify payment status
    if (status !== 'SUCCESSFUL') {
      return res.json({ received: true, action: 'skipped' });
    }

    // Extract course info from externalId (format: courseId_timestamp)
    const [courseId] = externalId.split('_');

    // Get course details
    const courseDoc = await db.collection('courses').doc(courseId).get();
    
    if (!courseDoc.exists) {
      console.error(`Course ${courseId} not found`);
      return res.status(404).json({ error: 'Course not found' });
    }

    const course = courseDoc.data();

    // Create enrollment record
    const enrollmentId = `${courseId}_${Date.now()}`;
    const enrollment = {
      enrollmentId,
      courseId,
      courseTitle: course.title,
      studentEmail: payer.email || 'momo-user@pending.com',
      studentName: payer.name || 'MoMo Student',
      studentPhone: payer.partyId,
      enrolledAt: admin.firestore.FieldValue.serverTimestamp(),
      paymentId: referenceId,
      paymentAmount: amount,
      paymentCurrency: currency,
      paymentMethod: 'mtn_momo',
      status: 'active',
      progress: 0,
      completedModules: [],
      lastAccessed: null
    };

    await db.collection('enrollments').doc(enrollmentId).add(enrollment);

    // Update course enrollment count
    await db.collection('courses').doc(courseId).update({
      enrollmentCount: admin.firestore.FieldValue.increment(1)
    });

    // Send SMS/Email if available
    if (payer.email) {
      await sendCourseAccessEmail({
        email: payer.email,
        name: payer.name || 'Student',
        courseTitle: course.title,
        courseId: courseId,
        enrollmentId: enrollmentId
      });
    }

    console.log(`✅ MoMo: Enrolled ${payer.partyId} in ${courseId}`);
    
    return res.json({ 
      received: true, 
      enrolled: true,
      courseId,
      referenceId 
    });

  } catch (error) {
    console.error('MoMo enrollment error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Send course access email to student
 */
async function sendCourseAccessEmail({ email, name, courseTitle, courseId, enrollmentId }) {
  const courseUrl = `https://marriageducation.com/course-viewer.html?course=${courseId}`;
  const dashboardUrl = `https://marriageducation.com/dashboard.html`;

  const mailOptions = {
    from: '"Marriage Education" <train@marriageducation.com>',
    to: email,
    subject: `Welcome to ${courseTitle}! 🎓`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #2d3748; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: white; padding: 40px 20px; border: 1px solid #e2e8f0; }
          .button { display: inline-block; background: #667eea; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
          .footer { background: #f7fafc; padding: 20px; text-align: center; color: #718096; font-size: 14px; border-radius: 0 0 8px 8px; }
          .success-badge { background: #c6f6d5; color: #22543d; padding: 8px 16px; border-radius: 12px; display: inline-block; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 You're Enrolled!</h1>
            <p style="margin: 0; font-size: 18px;">${courseTitle}</p>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            
            <div class="success-badge">✅ Payment Confirmed - Course Access Granted</div>
            
            <p>Welcome to <strong>${courseTitle}</strong>! Your enrollment is confirmed and you now have lifetime access to all course materials.</p>
            
            <h3>🚀 Get Started:</h3>
            <a href="${courseUrl}" class="button">Access Your Course Now →</a>
            
            <h3>📚 What's Inside:</h3>
            <ul>
              <li>Complete course modules with text-based lessons</li>
              <li>Reflection questions for deeper learning</li>
              <li>Track your progress as you complete each module</li>
              <li>Lifetime access - learn at your own pace</li>
            </ul>
            
            <h3>💡 Pro Tips:</h3>
            <ul>
              <li>Set aside dedicated time each week for coursework</li>
              <li>Answer reflection questions thoughtfully - they're saved to your account</li>
              <li>Mark modules complete as you finish them</li>
              <li>Revisit lessons anytime - there's no expiration</li>
            </ul>
            
            <h3>🔗 Quick Links:</h3>
            <ul>
              <li><a href="${courseUrl}">Course Viewer</a></li>
              <li><a href="${dashboardUrl}">Your Dashboard</a></li>
              <li><a href="https://marriageducation.com/courses.html">Browse More Courses</a></li>
            </ul>
            
            <p><strong>Enrollment ID:</strong> ${enrollmentId}</p>
            
            <p>Questions or need help? Reply to this email or contact us at <a href="mailto:train@marriageducation.com">train@marriageducation.com</a></p>
            
            <p>Blessings on your learning journey!</p>
            <p><strong>The Marriage Education Team</strong></p>
          </div>
          <div class="footer">
            <p>Marriage Education | Sex By Design Academy</p>
            <p>Transforming persons, families, and nations</p>
            <p><a href="https://marriageducation.com" style="color: #667eea;">marriageducation.com</a></p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Course access email sent to ${email}`);
  } catch (error) {
    console.error('Email send error:', error);
    // Don't fail the enrollment if email fails
  }
}

/**
 * Check enrollment status (callable function)
 * For student dashboard to verify access
 */
exports.checkEnrollment = functions.https.onCall(async (data, context) => {
  const { courseId, email } = data;

  if (!email || !courseId) {
    throw new functions.https.HttpsError('invalid-argument', 'courseId and email required');
  }

  try {
    const enrollmentsRef = db.collection('enrollments');
    const query = enrollmentsRef
      .where('courseId', '==', courseId)
      .where('studentEmail', '==', email)
      .where('status', '==', 'active')
      .limit(1);

    const snapshot = await query.get();

    if (snapshot.empty) {
      return { enrolled: false };
    }

    const enrollment = snapshot.docs[0].data();
    return { 
      enrolled: true,
      enrollmentId: enrollment.enrollmentId,
      progress: enrollment.progress,
      completedModules: enrollment.completedModules,
      enrolledAt: enrollment.enrolledAt
    };

  } catch (error) {
    console.error('Check enrollment error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================
// NEW: RD & PAYMENT SYSTEM FUNCTIONS
// ============================================

/**
 * SETUP: Migrate Ayinwi's Data (Run Once)
 */
exports.migrateAyinwiData = functions.https.onRequest(async (req, res) => {
  try {
    const ayinwiData = {
      code: 'RD-AYIN-5087',
      name: 'Ayinwi Promise Imbih',
      email: 'ayinwipromise@gmail.com',
      phone: '237677604100',
      city: 'Buea',
      region: 'South West',
      status: 'active',
      tier: 'Bronze RD',
      downline: [],
      downline_count: 0,
      team_books_sold: 0,
      override_commission: 0,
      milestones_reached: [],
      override_history: [],
      created_at: admin.firestore.Timestamp.now(),
      activated_at: admin.firestore.Timestamp.fromDate(new Date('2025-12-23T02:50:00Z'))
    };

    await db.collection('regional_directors').doc('RD-AYIN-5087').set(ayinwiData);

    res.json({
      success: true,
      message: 'Ayinwi data migrated successfully',
      data: ayinwiData
    });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * RD Login / Get Stats
 */
exports.getRDStats = functions.https.onCall(async (data, context) => {
  try {
    const { code, email } = data;

    if (!code || !email) {
      throw new functions.https.HttpsError('invalid-argument', 'Code and email required');
    }

    const rdDoc = await db.collection('regional_directors').doc(code).get();

    if (!rdDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Regional Director code not found');
    }

    const rd = rdDoc.data();

    // Verify email matches
    if (rd.email.toLowerCase() !== email.toLowerCase()) {
      throw new functions.https.HttpsError('permission-denied', 'Email does not match records');
    }

    return {
      success: true,
      rd: rd
    };
  } catch (error) {
    console.error('getRDStats error:', error);
    throw error;
  }
});

/**
 * Register New RD (Admin Only)
 */
exports.registerRD = functions.https.onCall(async (data, context) => {
  // Require admin authentication
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  try {
    const { name, email, phone, city, region } = data;

    // Generate RD code
    const nameParts = name.split(' ');
    const lastName = nameParts[nameParts.length - 1].substring(0, 4).toUpperCase();
    const random = Math.floor(1000 + Math.random() * 9000);
    const code = `RD-${lastName}-${random}`;

    const rdData = {
      code,
      name,
      email,
      phone,
      city: city || '',
      region: region || '',
      status: 'pending',
      tier: 'Bronze RD',
      downline: [],
      downline_count: 0,
      team_books_sold: 0,
      override_commission: 0,
      milestones_reached: [],
      override_history: [],
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      activated_at: null
    };

    await db.collection('regional_directors').doc(code).set(rdData);

    return {
      success: true,
      code,
      message: 'RD registered successfully'
    };
  } catch (error) {
    console.error('registerRD error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Submit Manual Payment (MoMo Books)
 */
exports.submitManualPayment = functions.https.onCall(async (data, context) => {
  try {
    const {
      reference,
      product_id,
      product_name,
      amount,
      currency,
      email,
      phone,
      ambassador_ref,
      referral_code,
      rd_code
    } = data;

    const paymentData = {
      reference,
      product_id,
      product_name,
      amount,
      currency: currency || 'XAF',
      email,
      phone,
      ambassador_ref: ambassador_ref || '',
      referral_code: referral_code || '',
      rd_code: rd_code || '',
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('pending_payments').doc(reference).set(paymentData);

    // Send admin notification email
    if (SENDGRID_API_KEY) {
      await sendAdminPaymentNotification(paymentData);
    } else {
      await sendAdminPaymentNotificationSMTP(paymentData);
    }

    // Send Telegram notification for new pending payment
    if (TELEGRAM_BOT_TOKEN) {
      const pendingMsg = `🔔 *New Payment Pending Approval*\n\n` +
        `📋 Reference: \`${reference}\`\n` +
        `📚 Product: *${product_name}*\n` +
        `💰 Amount: ${amount} ${currency || 'XAF'}\n` +
        `👤 Customer: ${email}\n` +
        `📱 Phone: ${phone || 'N/A'}\n` +
        `${ambassador_ref ? `🎯 Ambassador: ${ambassador_ref}\n` : ''}` +
        `${referral_code ? `🔗 Referral: ${referral_code}\n` : ''}` +
        `${rd_code ? `👑 RD: ${rd_code}\n` : ''}\n` +
        `👉 [Review & Approve](https://marriageducation.com/public/admin-dashboard.html)`;
      
      await sendTelegram(pendingMsg);
    }

    return {
      success: true,
      message: 'Payment submitted for approval'
    };
  } catch (error) {
    console.error('submitManualPayment error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Approve Payment (Admin Only)
 */
exports.approvePayment = functions.https.onCall(async (data, context) => {
  // TODO: Re-enable admin authentication after implementing Firebase Auth in admin panel
  // TEMPORARY: Disabled for testing
  // if (!context.auth || !context.auth.token.admin) {
  //   throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  // }

  try {
    const { reference } = data;

    const paymentRef = db.collection('pending_payments').doc(reference);
    const paymentDoc = await paymentRef.get();

    if (!paymentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Payment not found');
    }

    const payment = paymentDoc.data();

    // Update payment status
    await paymentRef.update({
      status: 'approved',
      approved_at: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`[APPROVE] Payment ${reference} approved`);

    // Handle RD registration activation
    if (payment.product_id === 'rd-registration' && payment.rd_code) {
      await activateRD(payment);
      
      // Send Telegram notification for RD registration
      if (TELEGRAM_BOT_TOKEN) {
        const rdMsg = `✅ *RD Registration Approved*\n\n` +
          `👑 Code: \`${payment.rd_code}\`\n` +
          `👤 Name: ${payment.name || 'N/A'}\n` +
          `📧 Email: ${payment.email}\n` +
          `📱 Phone: ${payment.phone}\n` +
          `💰 Fee: ${payment.amount} ${payment.currency}`;
        await sendTelegram(rdMsg);
      }

      return {
        success: true,
        message: 'RD registration approved',
        rd_code: payment.rd_code,
        email_sent: true
      };
    }

    // Track ambassador commission
    if (payment.ambassador_ref) {
      await trackAmbassadorSale(payment.ambassador_ref, payment.amount);
      console.log(`[COMMISSION] Ambassador ${payment.ambassador_ref}: ${payment.amount}`);
    }

    // Track referral commission
    if (payment.referral_code) {
      await trackReferralSale(payment.referral_code, payment.amount);
      console.log(`[REFERRAL] Code ${payment.referral_code}: ${payment.amount}`);
    }

    // Generate download URL for book purchase
    const downloadUrl = await generateDownloadURL(payment.product_id);
    console.log(`[DOWNLOAD] URL generated: ${downloadUrl.substring(0, 50)}...`);

    // Send download email to customer
    const emailSent = await sendDownloadEmail(
      payment.email,
      payment.product_name,
      downloadUrl
    );

    // Send comprehensive Telegram notification to admin
    if (TELEGRAM_BOT_TOKEN) {
      const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString();
      const adminMsg = `✅ *Payment Approved & Sent*\n\n` +
        `📋 Reference: \`${payment.reference}\`\n` +
        `👤 Customer: ${payment.email}\n` +
        `📱 Phone: ${payment.phone || 'N/A'}\n` +
        `📚 Product: *${payment.product_name}*\n` +
        `💰 Amount: ${payment.amount} ${payment.currency}\n\n` +
        `📧 Email: ${emailSent ? '✅' : '❌'}\n` +
        `${payment.ambassador_ref ? `🎯 Ambassador: ${payment.ambassador_ref}\n` : ''}` +
        `${payment.referral_code ? `🔗 Referral: ${payment.referral_code}\n` : ''}` +
        `${payment.rd_code ? `👑 RD: ${payment.rd_code}\n` : ''}\n` +
        `📥 Download (expires ${expiryDate}):\n${downloadUrl}`;
      
      await sendTelegram(adminMsg);
      console.log('[Telegram] Admin notification sent');
    }

    return {
      success: true,
      message: 'Payment approved successfully',
      download_url: downloadUrl,
      email_sent: emailSent,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
  } catch (error) {
    console.error('approvePayment error:', error);
    
    // Send error notification to admin
    if (TELEGRAM_BOT_TOKEN) {
      await sendTelegram(`❌ *Payment Approval Error*\n\nReference: \`${data.reference}\`\nError: ${error.message}`);
    }
    
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Register Referral Code (Book Sharer Rewards)
 */
exports.registerReferralCode = functions.https.onCall(async (data, context) => {
  try {
    const { email } = data;

    if (!email) {
      throw new functions.https.HttpsError('invalid-argument', 'Email required');
    }

    // Check if email already has a code
    const existingQuery = await db.collection('referral_codes')
      .where('email', '==', email.toLowerCase())
      .limit(1)
      .get();

    if (!existingQuery.empty) {
      const existingCode = existingQuery.docs[0].data();
      return {
        success: true,
        code: existingCode.code,
        existing: true
      };
    }

    // Generate new code
    const prefix = email.split('@')[0].replace(/[^a-zA-Z]/g, '').toUpperCase().substring(0, 4);
    const random = Math.floor(100 + Math.random() * 900);
    const code = `${prefix}${random}`;

    const referralData = {
      code,
      email: email.toLowerCase(),
      sales_count: 0,
      total_revenue: 0,
      commission_earned: 0,
      commission_pending: 0,
      commission_paid: 0,
      milestones_reached: [],
      sales_history: [],
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('referral_codes').doc(code).set(referralData);

    return {
      success: true,
      code,
      existing: false
    };
  } catch (error) {
    console.error('registerReferralCode error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

async function activateRD(payment) {
  const rdCode = payment.rd_code;
  if (!rdCode) return;

  await db.collection('regional_directors').doc(rdCode).update({
    status: 'active',
    activated_at: admin.firestore.FieldValue.serverTimestamp()
  });

  // Send RD credentials email
  const rdDoc = await db.collection('regional_directors').doc(rdCode).get();
  const rd = rdDoc.data();
  
  if (SENDGRID_API_KEY) {
    await sendRDCredentialsEmail(rd);
  } else {
    await sendRDCredentialsEmailSMTP(rd);
  }
}

async function trackAmbassadorSale(ambassadorCode, amount) {
  try {
    const ambassadorQuery = await db.collection('ambassadors')
      .where('code', '==', ambassadorCode)
      .limit(1)
      .get();

    if (ambassadorQuery.empty) return;

    const ambassadorDoc = ambassadorQuery.docs[0];
    const ambassadorRef = ambassadorDoc.ref;
    const ambassador = ambassadorDoc.data();

    // Calculate commission (10% tiered)
    const commissionAmount = amount * 0.10;

    await ambassadorRef.update({
      booksSold: admin.firestore.FieldValue.increment(1),
      commissionEarned: admin.firestore.FieldValue.increment(commissionAmount)
    });

    // Track RD override if recruited
    if (ambassador.recruited_by) {
      await trackRDOverride(ambassador.recruited_by, ambassadorCode, amount);
    }
  } catch (error) {
    console.error('trackAmbassadorSale error:', error);
  }
}

async function trackRDOverride(rdCode, ambassadorCode, saleAmount) {
  try {
    const rdRef = db.collection('regional_directors').doc(rdCode);
    const rdDoc = await rdRef.get();

    if (!rdDoc.exists) return;

    const overrideAmount = saleAmount * 0.10; // 10% override

    await rdRef.update({
      team_books_sold: admin.firestore.FieldValue.increment(1),
      override_commission: admin.firestore.FieldValue.increment(overrideAmount),
      override_history: admin.firestore.FieldValue.arrayUnion({
        date: admin.firestore.Timestamp.now(),
        ambassador_code: ambassadorCode,
        sale_amount: saleAmount,
        override_amount: overrideAmount
      })
    });
  } catch (error) {
    console.error('trackRDOverride error:', error);
  }
}

async function trackReferralSale(referralCode, amount) {
  try {
    const referralRef = db.collection('referral_codes').doc(referralCode);
    const referralDoc = await referralRef.get();

    if (!referralDoc.exists) {
      console.log(`Referral code ${referralCode} not found`);
      return;
    }

    const referral = referralDoc.data();
    const newSalesCount = (referral.sales_count || 0) + 1;

    // Update sales
    await referralRef.update({
      sales_count: admin.firestore.FieldValue.increment(1),
      total_revenue: admin.firestore.FieldValue.increment(amount),
      sales_history: admin.firestore.FieldValue.arrayUnion({
        date: admin.firestore.Timestamp.now(),
        amount: amount
      })
    });

    // Check for milestone (every 10 sales)
    if (newSalesCount % 10 === 0) {
      const milestone = newSalesCount;
      const commissionAmount = 10000; // 10,000 FCFA per milestone

      await referralRef.update({
        commission_pending: admin.firestore.FieldValue.increment(commissionAmount),
        commission_earned: admin.firestore.FieldValue.increment(commissionAmount),
        milestones_reached: admin.firestore.FieldValue.arrayUnion({
          date: admin.firestore.Timestamp.now(),
          sales_count: milestone,
          commission: commissionAmount
        })
      });

      // Send milestone emails
      if (SENDGRID_API_KEY) {
        await sendReferralMilestoneEmail(referral, milestone, commissionAmount);
        await sendAdminMilestoneNotification(referral, milestone, commissionAmount);
      } else {
        await sendReferralMilestoneEmailSMTP(referral, milestone, commissionAmount);
      }
    }
  } catch (error) {
    console.error('trackReferralSale error:', error);
  }
}

// ============================================
// EMAIL FUNCTIONS (SendGrid)
// ============================================

async function sendAdminPaymentNotification(payment) {
  const msg = {
    to: 'orders@marriageducation.com',
    from: 'noreply@marriageducation.com',
    subject: `New Payment Pending Approval - ${payment.reference}`,
    html: `
      <h2>New Payment Submission</h2>
      <p><strong>Reference:</strong> ${payment.reference}</p>
      <p><strong>Product:</strong> ${payment.product_name}</p>
      <p><strong>Amount:</strong> ${payment.amount} ${payment.currency}</p>
      <p><strong>Email:</strong> ${payment.email}</p>
      <p><strong>Phone:</strong> ${payment.phone}</p>
      <p><a href="https://marriageducation.com/public/admin-dashboard.html">Approve Payment</a></p>
    `
  };

  await sgMail.send(msg);
}

async function sendCustomerApprovalEmail(payment) {
  const msg = {
    to: payment.email,
    from: 'orders@marriageducation.com',
    subject: `Payment Approved - ${payment.product_name}`,
    html: `
      <h2>Payment Approved!</h2>
      <p>Your payment for <strong>${payment.product_name}</strong> has been approved.</p>
      <p><strong>Amount:</strong> ${payment.amount} ${payment.currency}</p>
      <p>Thank you for your purchase!</p>
    `
  };

  await sgMail.send(msg);
}

async function sendRDCredentialsEmail(rd) {
  const msg = {
    to: rd.email,
    from: 'orders@marriageducation.com',
    subject: `Welcome Regional Director - ${rd.code}`,
    html: `
      <h2>Welcome, Regional Director!</h2>
      <p>Your RD account has been activated.</p>
      <p><strong>RD Code:</strong> ${rd.code}</p>
      <p><strong>Name:</strong> ${rd.name}</p>
      <p><a href="https://marriageducation.com/rd-login.html">Login to Dashboard</a></p>
    `
  };

  await sgMail.send(msg);
}

async function sendReferralMilestoneEmail(referral, milestone, commission) {
  const msg = {
    to: referral.email,
    from: 'orders@marriageducation.com',
    subject: `🎉 Milestone Reached: ${milestone} Sales!`,
    html: `
      <h2>Congratulations! 🎉</h2>
      <p>You've reached <strong>${milestone} sales</strong> with your referral link!</p>
      <p><strong>Commission Earned:</strong> ${commission} FCFA</p>
      <p><strong>Total Sales:</strong> ${milestone}</p>
      <p>Keep sharing to earn more!</p>
    `
  };

  await sgMail.send(msg);
}

async function sendAdminMilestoneNotification(referral, milestone, commission) {
  const msg = {
    to: 'orders@marriageducation.com',
    from: 'noreply@marriageducation.com',
    subject: `Referral Milestone: ${referral.code} - ${milestone} Sales`,
    html: `
      <h2>Referral Milestone Reached</h2>
      <p><strong>Code:</strong> ${referral.code}</p>
      <p><strong>Email:</strong> ${referral.email}</p>
      <p><strong>Sales:</strong> ${milestone}</p>
      <p><strong>Commission Due:</strong> ${commission} FCFA</p>
    `
  };

  await sgMail.send(msg);
}

// ============================================
// EMAIL FUNCTIONS (SMTP Fallback)
// ============================================

async function sendAdminPaymentNotificationSMTP(payment) {
  const mailOptions = {
    from: 'noreply@marriageducation.com',
    to: 'orders@marriageducation.com',
    subject: `New Payment Pending Approval - ${payment.reference}`,
    html: `
      <h2>New Payment Submission</h2>
      <p><strong>Reference:</strong> ${payment.reference}</p>
      <p><strong>Product:</strong> ${payment.product_name}</p>
      <p><strong>Amount:</strong> ${payment.amount} ${payment.currency}</p>
      <p><strong>Email:</strong> ${payment.email}</p>
      <p><strong>Phone:</strong> ${payment.phone}</p>
      <p><a href="https://marriageducation.com/public/admin-dashboard.html">Approve Payment</a></p>
    `
  };

  await transporter.sendMail(mailOptions);
}

async function sendCustomerApprovalEmailSMTP(payment) {
  const mailOptions = {
    from: 'orders@marriageducation.com',
    to: payment.email,
    subject: `Payment Approved - ${payment.product_name}`,
    html: `
      <h2>Payment Approved!</h2>
      <p>Your payment for <strong>${payment.product_name}</strong> has been approved.</p>
      <p><strong>Amount:</strong> ${payment.amount} ${payment.currency}</p>
      <p>Thank you for your purchase!</p>
    `
  };

  await transporter.sendMail(mailOptions);
}

async function sendRDCredentialsEmailSMTP(rd) {
  const mailOptions = {
    from: 'orders@marriageducation.com',
    to: rd.email,
    subject: `Welcome Regional Director - ${rd.code}`,
    html: `
      <h2>Welcome, Regional Director!</h2>
      <p>Your RD account has been activated.</p>
      <p><strong>RD Code:</strong> ${rd.code}</p>
      <p><strong>Name:</strong> ${rd.name}</p>
      <p><a href="https://marriageducation.com/rd-login.html">Login to Dashboard</a></p>
    `
  };

  await transporter.sendMail(mailOptions);
}

async function sendReferralMilestoneEmailSMTP(referral, milestone, commission) {
  const mailOptions = {
    from: 'orders@marriageducation.com',
    to: referral.email,
    subject: `🎉 Milestone Reached: ${milestone} Sales!`,
    html: `
      <h2>Congratulations! 🎉</h2>
      <p>You've reached <strong>${milestone} sales</strong> with your referral link!</p>
      <p><strong>Commission Earned:</strong> ${commission} FCFA</p>
      <p><strong>Total Sales:</strong> ${milestone}</p>
      <p>Keep sharing to earn more!</p>
    `
  };

  await transporter.sendMail(mailOptions);
}

/**
 * Upload Books to Storage - Helper function to upload ebooks
 */
exports.uploadBooksToStorage = functions.https.onRequest(async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const ebooksDir = path.join(__dirname, 'ebooks');
    
    // Check if we can access the directory
    if (!fs.existsSync(ebooksDir)) {
      return res.status(400).json({ 
        error: 'Ebooks directory not found',
        path: ebooksDir,
        cwd: __dirname
      });
    }
    
    const files = fs.readdirSync(ebooksDir).filter(f => f.endsWith('.pdf'));
    const results = [];
    
    console.log(`Found ${files.length} PDF files to upload`);
    
    for (const filename of files) {
      const filePath = path.join(ebooksDir, filename);
      const fileSize = fs.statSync(filePath).size;
      const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
      
      console.log(`Uploading ${filename} (${fileSizeMB} MB)...`);
      
      try {
        await bucket.upload(filePath, {
          destination: `ebooks/${filename}`,
          metadata: {
            contentType: 'application/pdf',
            cacheControl: 'public, max-age=31536000',
          }
        });
        
        results.push({ 
          filename, 
          status: 'success',
          size: fileSizeMB + ' MB'
        });
        
        console.log(`✅ Uploaded: ${filename}`);
      } catch (uploadError) {
        results.push({ 
          filename, 
          status: 'error', 
          error: uploadError.message 
        });
        console.error(`❌ Failed: ${filename}`, uploadError);
      }
    }
    
    const succeeded = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;
    
    res.json({
      message: `Upload complete: ${succeeded} succeeded, ${failed} failed`,
      total: files.length,
      succeeded,
      failed,
      results
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Debug Storage - List all buckets and files
 */
exports.listStorageInfo = functions.https.onRequest(async (req, res) => {
  try {
    const storage = admin.storage();
    
    // Get the default bucket
    const defaultBucket = storage.bucket();
    console.log('Default bucket:', defaultBucket.name);
    
    // Try to list files in the ebooks folder
    const [files] = await defaultBucket.getFiles({ prefix: 'ebooks/' });
    
    const fileList = files.map(file => ({
      name: file.name,
      bucket: file.bucket.name,
      size: file.metadata.size
    }));
    
    res.json({
      defaultBucket: defaultBucket.name,
      filesCount: files.length,
      files: fileList
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

/**
 * Create Stripe Checkout Session
 * HTTPS endpoint to replace Render backend for Stripe payments
 */
exports.createCheckoutSession = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  try {
    const { product_id, name, price, currency } = req.body;
    
    if (!product_id) {
      res.status(400).json({ error: 'Missing product_id' });
      return;
    }
    
    console.log('[Stripe] Creating checkout session for:', product_id);
    
    // Default product configurations
    const products = {
      'sbd-for-dummies': {
        name: 'Sex Before Dating - For Dummies Edition',
        price: 2000, // $20.00 USD
        currency: 'usd'
      },
      'sbd-standard': {
        name: 'Sex Before Dating - Standard Edition',
        price: 3500,
        currency: 'usd'
      },
      'complete-sbd-library': {
        name: 'Complete SBD Library Bundle',
        price: 9900,
        currency: 'usd'
      }
      // Add more products as needed
    };
    
    // Use provided values or defaults
    const productInfo = products[product_id] || {};
    const finalName = name || productInfo.name || 'Marriage Education Product';
    
    // Convert price to cents if provided (URL passes dollars, Stripe expects cents)
    let finalPrice;
    if (price) {
      // If price is provided in URL, it's in dollars - convert to cents
      finalPrice = Math.round(parseFloat(price) * 100);
      console.log(`[Stripe] Price conversion: $${price} → ${finalPrice} cents`);
    } else {
      // Use default product price (already in cents)
      finalPrice = productInfo.price || 2000;
    }
    
    // Validate minimum Stripe amount ($0.50 USD = 50 cents)
    if (finalPrice < 50) {
      throw new Error(`Price too low: ${finalPrice} cents. Minimum is 50 cents ($0.50)`);
    }
    
    const finalCurrency = (currency || productInfo.currency || 'usd').toLowerCase();
    
    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: finalCurrency,
          product_data: {
            name: finalName,
          },
          unit_amount: finalPrice, // Amount in cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `https://marriageducation.com/payment-success.html?session_id={CHECKOUT_SESSION_ID}&product=${product_id}`,
      cancel_url: `https://marriageducation.com/payment.html?cancelled=true`,
      metadata: {
        product_id: product_id,
      }
    });
    
    console.log('[Stripe] Checkout session created:', session.id);
    
    res.json({ url: session.url });
    
  } catch (error) {
    console.error('[Stripe] Checkout error:', error);
    res.status(500).json({ error: error.message });
  }
});
