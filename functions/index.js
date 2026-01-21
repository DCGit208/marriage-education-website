const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')(functions.config().stripe?.secret_key);
const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');
const axios = require('axios');
const { jsPDF } = require('jspdf');

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
 * Escape special characters for Telegram Markdown
 */
function escapeMarkdown(text) {
  // Escape special Markdown characters: _ * [ ] ( ) ~ ` > # + - = | { } . !
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Send Telegram message to admin
 */
async function sendTelegram(message, useMarkdown = false) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('[Telegram] Not configured');
    return false;
  }
  
  try {
    const payload = {
      chat_id: TELEGRAM_CHAT_ID,
      text: message
    };
    
    // Only add parse_mode if explicitly requested
    if (useMarkdown) {
      payload.parse_mode = 'Markdown';
    }
    
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, payload);
    console.log('[Telegram] Message sent');
    return true;
  } catch (error) {
    console.error('[Telegram] Error:', error.message);
    if (error.response) {
      console.error('[Telegram] Response:', error.response.data);
    }
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
 * Register New RD (Public - Allow registration, create pending record)
 */
exports.registerRD = functions.https.onCall(async (data, context) => {
  try {
    const { firstName, lastName, email, phone, city, region, leadershipExperience, motivation, networkSize, recruitmentTarget, isAmbassador, existingAmbCode } = data;

    // Generate RD code from last name
    const lastName4 = lastName.substring(0, 4).toUpperCase();
    const random = Math.floor(1000 + Math.random() * 9000);
    const code = `RD-${lastName4}-${random}`;

    const rdData = {
      code,
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      email,
      phone,
      city: city || '',
      region: region || '',
      leadershipExperience: leadershipExperience || '',
      motivation: motivation || '',
      networkSize: networkSize || '',
      recruitmentTarget: recruitmentTarget || '',
      isAmbassador: isAmbassador === 'yes',
      existingAmbCode: existingAmbCode || '',
      status: 'pending_payment',
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
      message: 'RD registered successfully. Please proceed to payment.'
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
      rd_code,
      type,
      ambassador_code,
      regional_director,
      ambassador_data
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
      type: type || 'book-purchase',
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };

    // Add ambassador-specific data
    if (type === 'ambassador' && ambassador_data) {
      paymentData.ambassador_code = ambassador_code;
      paymentData.regional_director = regional_director || '';
      paymentData.ambassador_data = ambassador_data;
    }

    await db.collection('pending_payments').doc(reference).set(paymentData);

    // Send admin notification email (non-blocking - don't fail payment if email fails)
    try {
      if (SENDGRID_API_KEY) {
        await sendAdminPaymentNotification(paymentData);
      } else {
        await sendAdminPaymentNotificationSMTP(paymentData);
      }
      console.log('[EMAIL] Admin notification sent');
    } catch (emailError) {
      console.warn('[EMAIL] Admin notification failed (continuing anyway):', emailError.message);
      // Don't throw - payment submission should succeed even if email fails
    }

    // Send Telegram notification for new pending payment (plain text)
    if (TELEGRAM_BOT_TOKEN) {
      const typeLabel = type === 'ambassador' ? '🎯 Ambassador Registration' : 
                       type === 'rd' ? '👑 RD Registration' : '📚 Book Purchase';
      const pendingMsg = `🔔 NEW PAYMENT PENDING APPROVAL\n\n` +
        `📋 Reference: ${reference}\n` +
        `📚 Type: ${typeLabel}\n` +
        `📦 Product: ${product_name}\n` +
        `💰 Amount: ${amount} ${currency || 'XAF'}\n` +
        `👤 Customer: ${email}\n` +
        `📱 Phone: ${phone || 'N/A'}\n` +
        `${ambassador_code ? `🎯 Ambassador Code: ${ambassador_code}\n` : ''}` +
        `${regional_director ? `👑 Recruited By: ${regional_director}\n` : ''}` +
        `${ambassador_ref ? `🎯 Ambassador: ${ambassador_ref}\n` : ''}` +
        `${referral_code ? `🔗 Referral: ${referral_code}\n` : ''}` +
        `${rd_code ? `👑 RD: ${rd_code}\n` : ''}\n` +
        `👉 Review: https://marriageducation.com/admin-dashboard.html`;
      
      await sendTelegram(pendingMsg, false);
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
      
      // Send Telegram notification for RD registration (plain text)
      if (TELEGRAM_BOT_TOKEN) {
        const rdMsg = `✅ RD REGISTRATION APPROVED\n\n` +
          `👑 Code: ${payment.rd_code}\n` +
          `👤 Name: ${payment.name || 'N/A'}\n` +
          `📧 Email: ${payment.email}\n` +
          `📱 Phone: ${payment.phone}\n` +
          `💰 Fee: ${payment.amount} ${payment.currency}`;
        await sendTelegram(rdMsg, false);
      }

      return {
        success: true,
        message: 'RD registration approved',
        rd_code: payment.rd_code,
        email_sent: true
      };
    }

    // Handle Ambassador registration activation
    if (payment.product_id === 'ambassador-registration' && payment.ambassador_data) {
      await activateAmbassador(payment);

      return {
        success: true,
        message: 'Ambassador registration approved',
        ambassador_code: payment.ambassador_code,
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

    // Send comprehensive Telegram notification to admin (plain text)
    if (TELEGRAM_BOT_TOKEN) {
      const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString();
      const adminMsg = `✅ PAYMENT APPROVED & SENT\n\n` +
        `📋 Reference: ${payment.reference}\n` +
        `👤 Customer: ${payment.email}\n` +
        `📱 Phone: ${payment.phone || 'N/A'}\n` +
        `📚 Product: ${payment.product_name}\n` +
        `💰 Amount: ${payment.amount} ${payment.currency}\n\n` +
        `📧 Email: ${emailSent ? '✅' : '❌'}\n` +
        `${payment.ambassador_ref ? `🎯 Ambassador: ${payment.ambassador_ref}\n` : ''}` +
        `${payment.referral_code ? `🔗 Referral: ${payment.referral_code}\n` : ''}` +
        `${payment.rd_code ? `👑 RD: ${payment.rd_code}\n` : ''}\n` +
        `📥 Download (expires ${expiryDate}):\n${downloadUrl}`;
      
      await sendTelegram(adminMsg, false);
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
    
    // Send error notification to admin (plain text)
    if (TELEGRAM_BOT_TOKEN) {
      await sendTelegram(`❌ PAYMENT APPROVAL ERROR\n\nReference: ${data.reference}\nError: ${error.message}`, false);
    }
    
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Reject Payment (Admin Only)
 */
/**
 * Reject Payment (Admin Only) - HTTP endpoint (unauthenticated)
 */
exports.rejectPaymentHttp = functions.https.onRequest(async (req, res) => {
  // Enable CORS for all requests
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[REJECT] HTTP Function called with data:', req.body);
    const { reference, reason } = req.body;

    if (!reference) {
      return res.status(400).json({ error: 'Payment reference required' });
    }

    console.log(`[REJECT] Fetching payment document: ${reference}`);
    const paymentRef = db.collection('pending_payments').doc(reference);
    const paymentDoc = await paymentRef.get();

    if (!paymentDoc.exists) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    console.log(`[REJECT] Payment found. Current status: ${paymentDoc.data().status}`);

    // Update payment status to rejected
    console.log(`[REJECT] Updating payment ${reference} to rejected status`);
    await paymentRef.update({
      status: 'rejected',
      rejection_reason: reason || 'No reason provided',
      rejected_at: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`[REJECT] Payment ${reference} successfully updated to rejected`);

    // Send Telegram notification
    if (TELEGRAM_BOT_TOKEN) {
      const payment = paymentDoc.data();
      const rejectMsg = `❌ PAYMENT REJECTED\n\n` +
        `📋 Reference: ${reference}\n` +
        `👤 Customer: ${payment.email}\n` +
        `💰 Amount: ${payment.amount} ${payment.currency}\n` +
        `📝 Reason: ${reason || 'Not specified'}`;
      
      await sendTelegram(rejectMsg, false);
    }

    return res.status(200).json({
      success: true,
      message: 'Payment rejected successfully'
    });
  } catch (error) {
    console.error('[REJECT] Error:', error.code, error.message);
    console.error('[REJECT] Full error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Reject Payment (Admin Only) - Cloud Function version (keeping for backwards compatibility)
 */
exports.rejectPayment = functions.https.onCall(async (data, context) => {
  // TODO: Re-enable admin authentication after implementing Firebase Auth in admin panel
  // TEMPORARY: Disabled for testing
  // if (!context.auth || !context.auth.token.admin) {
  //   throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  // }

  try {
    console.log('[REJECT] Function called with data:', data);
    const { reference, reason } = data;

    if (!reference) {
      throw new functions.https.HttpsError('invalid-argument', 'Payment reference required');
    }

    console.log(`[REJECT] Fetching payment document: ${reference}`);
    const paymentRef = db.collection('pending_payments').doc(reference);
    const paymentDoc = await paymentRef.get();

    if (!paymentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Payment not found');
    }

    console.log(`[REJECT] Payment found. Current status: ${paymentDoc.data().status}`);

    // Update payment status to rejected
    console.log(`[REJECT] Updating payment ${reference} to rejected status`);
    await paymentRef.update({
      status: 'rejected',
      rejection_reason: reason || 'No reason provided',
      rejected_at: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`[REJECT] Payment ${reference} successfully updated to rejected`);

    // Send Telegram notification
    if (TELEGRAM_BOT_TOKEN) {
      const payment = paymentDoc.data();
      const rejectMsg = `❌ PAYMENT REJECTED\n\n` +
        `📋 Reference: ${reference}\n` +
        `👤 Customer: ${payment.email}\n` +
        `💰 Amount: ${payment.amount} ${payment.currency}\n` +
        `📝 Reason: ${reason || 'Not specified'}`;
      
      await sendTelegram(rejectMsg, false);
    }

    return {
      success: true,
      message: 'Payment rejected successfully'
    };
  } catch (error) {
    console.error('[REJECT] Error:', error.code, error.message);
    console.error('[REJECT] Full error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Mark RD Recruitment Payment as Paid (Admin Only)
 */
exports.markRDPaymentPaid = functions.https.onCall(async (data, context) => {
  try {
    const { notification_id, rd_code, amount } = data;

    console.log(`[RD PAYMENT] Marking payment as paid:`, { notification_id, rd_code, amount });

    // Update notification status
    await db.collection('admin_notifications').doc(notification_id).update({
      status: 'paid',
      paid_at: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update RD's pending balance
    const rdRef = db.collection('regional_directors').doc(rd_code);
    const rdDoc = await rdRef.get();
    
    if (rdDoc.exists) {
      await rdRef.update({
        recruitment_bonus_pending: admin.firestore.FieldValue.increment(-amount),
        recruitment_bonus_paid: admin.firestore.FieldValue.increment(amount),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });

      // Update recruitment_history status
      const rdData = rdDoc.data();
      const recruitmentHistory = rdData.recruitment_history || [];
      const updatedHistory = recruitmentHistory.map(entry => {
        if (entry.status === 'pending' && entry.amount === amount) {
          return { ...entry, status: 'paid', paid_at: new Date().toISOString() };
        }
        return entry;
      });

      await rdRef.update({
        recruitment_history: updatedHistory
      });

      console.log(`[RD PAYMENT] ${rd_code} payment marked as paid: ${amount} FCFA`);

      // Send Telegram confirmation
      if (TELEGRAM_BOT_TOKEN) {
        const remainingPending = (rdData.recruitment_bonus_pending || 0) - amount;
        const telegramMsg = `✅ RD PAYMENT MARKED AS PAID\n\n` +
          `RD: ${rd_code}\n` +
          `Name: ${rdData.name || 'Unknown'}\n` +
          `Amount Paid: ${amount.toLocaleString()} FCFA\n` +
          `Remaining Pending: ${remainingPending.toLocaleString()} FCFA`;
        
        await sendTelegram(telegramMsg, false);
      }
    }

    return {
      success: true,
      message: 'Payment marked as paid successfully'
    };
  } catch (error) {
    console.error('[RD PAYMENT] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
/**
 * Fix All Ambassador Statuses to 'active' (Admin utility)
 */
exports.fixAllAmbassadorStatuses = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  try {
    console.log('[STATUS-FIX] Starting ambassador status fix to active...');
    
    const ambassadorsSnapshot = await db.collection('ambassadors').get();
    console.log(`[STATUS-FIX] Found ${ambassadorsSnapshot.size} ambassadors`);
    
    let updated = 0;
    let alreadyActive = 0;
    const statusList = {};
    
    for (const doc of ambassadorsSnapshot.docs) {
      const ambassador = doc.data();
      const code = doc.id;
      const currentStatus = ambassador.status || 'no-status';
      
      // Track status distribution
      statusList[currentStatus] = (statusList[currentStatus] || 0) + 1;
      
      if (currentStatus === 'active') {
        alreadyActive++;
        continue;
      }
      
      // Update to 'active'
      await db.collection('ambassadors').doc(code).update({
        status: 'active',
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`[STATUS-FIX] ${code}: ${currentStatus} → active`);
      updated++;
    }
    
    const result = {
      success: true,
      total: ambassadorsSnapshot.size,
      updated: updated,
      alreadyActive: alreadyActive,
      statusDistribution: statusList
    };
    
    console.log('[STATUS-FIX] Complete:', result);
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('[STATUS-FIX] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Fix Missing Email Fields in Ambassador Records (One-time admin utility)
 */
exports.fixAmbassadorEmails = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  try {
    console.log('[FIX] Starting ambassador email fix...');
    
    // Get all ambassadors
    const ambassadorsSnapshot = await db.collection('ambassadors').get();
    console.log(`[FIX] Found ${ambassadorsSnapshot.size} ambassadors`);
    
    let fixed = 0;
    let alreadyHaveEmail = 0;
    let noPaymentFound = 0;
    
    for (const doc of ambassadorsSnapshot.docs) {
      const ambassador = doc.data();
      const code = doc.id;
      
      if (ambassador.email) {
        alreadyHaveEmail++;
        continue;
      }
      
      console.log(`[FIX] ${code} missing email, searching payments...`);
      
      // Find corresponding payment
      const paymentsSnapshot = await db.collection('pending_payments')
        .where('ambassador_code', '==', code)
        .limit(1)
        .get();
      
      if (paymentsSnapshot.empty) {
        console.log(`[FIX] ${code} - No payment found`);
        noPaymentFound++;
        continue;
      }
      
      const payment = paymentsSnapshot.docs[0].data();
      
      if (payment.email) {
        await db.collection('ambassadors').doc(code).update({
          email: payment.email,
          phone: payment.phone || '',
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`[FIX] ${code} - Added email: ${payment.email}`);
        fixed++;
      }
    }
    
    const result = {
      success: true,
      total: ambassadorsSnapshot.size,
      fixed: fixed,
      alreadyHaveEmail: alreadyHaveEmail,
      noPaymentFound: noPaymentFound
    };
    
    console.log('[FIX] Complete:', result);
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('[FIX] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Register Referral Code (Book Sharer Rewards)
 */
exports.registerReferralCode = functions.https.onCall(async (data, context) => {
  try {
    const { name, email } = data;

    if (!name || !email) {
      throw new functions.https.HttpsError('invalid-argument', 'Name and email required');
    }

    // Check if email already has a code
    const existingQuery = await db.collection('referral_codes')
      .where('email', '==', email.toLowerCase())
      .limit(1)
      .get();

    if (!existingQuery.empty) {
      const existingCode = existingQuery.docs[0].data();
      
      // Send reminder email with existing credentials
      try {
        await sendBookSharerWelcomeEmail(existingCode.email, existingCode.name, existingCode.code, existingCode.password, true);
      } catch (emailError) {
        console.error('Failed to send reminder email:', emailError);
      }
      
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

    // Generate random password (12 characters: uppercase, lowercase, numbers, special)
    const passwordChars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
    const password = Array.from({ length: 12 }, () => 
      passwordChars.charAt(Math.floor(Math.random() * passwordChars.length))
    ).join('');

    // Create Firebase Auth user
    let authUserId = null;
    try {
      const userRecord = await admin.auth().createUser({
        email: email.toLowerCase(),
        password: password,
        displayName: name,
        emailVerified: false
      });
      authUserId = userRecord.uid;
      console.log(`✅ Created Firebase Auth user: ${authUserId} for ${email}`);
    } catch (authError) {
      console.error('Firebase Auth creation error:', authError);
      // Continue even if Auth creation fails - user can reset password later
    }

    const referralData = {
      code,
      name,
      email: email.toLowerCase(),
      password, // Store for reference (user can change in dashboard)
      auth_uid: authUserId,
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

    // Send welcome email with credentials
    try {
      await sendBookSharerWelcomeEmail(email, name, code, password, false);
      console.log(`✅ Sent welcome email to ${email}`);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't throw - user still has access via code
    }

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

/**
 * sendBookSharerWelcomeEmail
 * - Sends welcome email with dashboard credentials
 */
async function sendBookSharerWelcomeEmail(email, name, code, password, isReminder) {
  const subject = isReminder 
    ? '✅ Your Book Sharer Dashboard Login Details'
    : '🎉 Welcome to Book Sharer Rewards - Your Dashboard is Ready!';
  
  const referralUrl = `https://marriageducation.com/sbd-campaign?referral=${code}`;
  const dashboardUrl = 'https://marriageducation.com/book-sharer-dashboard';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
        .credentials { background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
        .credential-item { margin: 10px 0; font-size: 14px; }
        .credential-label { font-weight: 600; color: #6b7280; }
        .credential-value { font-family: 'Courier New', monospace; background: white; padding: 8px 12px; border-radius: 4px; display: inline-block; margin-top: 5px; }
        .button { display: inline-block; background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 10px 5px; }
        .referral-box { background: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0; word-break: break-all; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        .highlight { color: #10b981; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">${isReminder ? '🔑 Your Login Details' : '🎉 Welcome, ' + name + '!'}</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">${isReminder ? 'Access your dashboard below' : 'Your Book Sharer Dashboard is Ready'}</p>
        </div>
        
        <div class="content">
          ${isReminder ? '' : `
          <h2 style="color: #10b981; margin-top: 0;">Start Earning Today! 💰</h2>
          <p>You're now part of the <strong>Book Sharer Rewards Program</strong>. Share your unique link and earn <span class="highlight">1,000 FCFA per sale</span> (paid every 10 sales).</p>
          `}
          
          <div class="credentials">
            <h3 style="margin-top: 0; color: #059669;">🔐 Your Dashboard Login</h3>
            
            <div class="credential-item">
              <div class="credential-label">📧 Email:</div>
              <div class="credential-value">${email}</div>
            </div>
            
            <div class="credential-item">
              <div class="credential-label">🔑 Password:</div>
              <div class="credential-value">${password}</div>
            </div>
            
            <div class="credential-item">
              <div class="credential-label">💼 Referral Code:</div>
              <div class="credential-value">${code}</div>
            </div>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${dashboardUrl}" class="button">🚀 Go to Dashboard</a>
          </div>
          
          <h3 style="color: #059669;">📣 Your Referral Link:</h3>
          <div class="referral-box">
            <a href="${referralUrl}" style="color: #2563eb; word-break: break-all;">${referralUrl}</a>
          </div>
          
          <h3 style="color: #059669;">💡 What's Next?</h3>
          <ol style="line-height: 1.8;">
            <li><strong>Login to Dashboard:</strong> Track sales, commission, and milestone progress in real-time</li>
            <li><strong>Share Your Link:</strong> Post on WhatsApp, Facebook, or email to friends/family</li>
            <li><strong>Watch Earnings Grow:</strong> Get 1,000 FCFA per sale, paid every 10 sales (10,000 FCFA payout)</li>
            <li><strong>Change Password:</strong> Go to Settings in your dashboard to update your password</li>
          </ol>
          
          <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              <strong>💼 Pro Tip:</strong> The more you share, the more you earn! Every 10 sales = 10,000 FCFA direct payment.
            </p>
          </div>
        </div>
        
        <div class="footer">
          <p>Need help? Contact us at <a href="mailto:orders@marriageducation.com" style="color: #10b981;">orders@marriageducation.com</a></p>
          <p style="font-size: 12px; color: #9ca3af;">Marriage Education | Building Strong Families</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: '"Marriage Education" <orders@marriageducation.com>',
    to: email,
    subject: subject,
    html: html
  };

  return transporter.sendMail(mailOptions);
}

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
  
  // Send email via SMTP (same as ambassador - working solution)
  try {
    await sendRDCredentialsEmailSMTP(rd);
    console.log(`✅ RD credentials email sent to ${rd.email}`);
  } catch (error) {
    console.error(`❌ Failed to send RD credentials email to ${rd.email}:`, error);
    
    // Send Telegram notification if email fails
    if (TELEGRAM_BOT_TOKEN) {
      const msg = `⚠️ RD EMAIL FAILED - Manual Delivery Needed\n\n` +
        `Code: ${rd.code}\n` +
        `Name: ${rd.name}\n` +
        `Email: ${rd.email}\n` +
        `Phone: ${rd.phone}\n\n` +
        `❌ Error: ${error.message}\n\n` +
        `📧 Please manually send credentials to ${rd.email}:\n` +
        `Login: https://marriageducation.com/rd-login.html`;
      
      await sendTelegram(msg, false);
      console.log('[RD EMAIL] Failure notification sent to admin via Telegram');
    }
  }
}

async function activateAmbassador(payment) {
  const ambassadorCode = payment.ambassador_code;
  const ambassadorData = payment.ambassador_data;
  
  if (!ambassadorCode || !ambassadorData) {
    console.error('Missing ambassador code or data');
    return;
  }

  // Create ambassador account in Firestore
  const ambassadorAccount = {
    ...ambassadorData,
    ambassadorCode: ambassadorCode,
    code: ambassadorCode,  // For consistency with queries
    email: payment.email,  // Ensure email is included for login
    phone: payment.phone,  // Ensure phone is included
    rdCode: payment.regional_director || '',  // Store RD code for team queries
    status: 'active',  // Both old and new login pages accept 'active'
    booksSold: 0,
    commissionEarned: 0,
    level: 'Starter',
    activated_at: admin.firestore.FieldValue.serverTimestamp(),
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  };

  await db.collection('ambassadors').doc(ambassadorCode).set(ambassadorAccount);
  console.log(`[AMBASSADOR] Account created: ${ambassadorCode}`);

  // Update RD statistics if recruited by RD
  if (payment.regional_director && payment.regional_director.startsWith('RD-')) {
    try {
      const rdRef = db.collection('regional_directors').doc(payment.regional_director);
      const rdDoc = await rdRef.get();
      
      if (rdDoc.exists) {
        const recruitmentBonus = 1500; // 10% of 15,000 FCFA signup fee
        
        // Update RD with recruitment bonus
        await rdRef.update({
          downline_count: admin.firestore.FieldValue.increment(1),
          team_ambassadors: admin.firestore.FieldValue.increment(1),
          recruitment_bonus_earned: admin.firestore.FieldValue.increment(recruitmentBonus),
          recruitment_bonus_pending: admin.firestore.FieldValue.increment(recruitmentBonus),
          recruitment_count: admin.firestore.FieldValue.increment(1),
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Add to recruitment history
        const rdData = rdDoc.data();
        const recruitmentHistory = rdData.recruitment_history || [];
        recruitmentHistory.push({
          ambassador_code: ambassadorCode,
          ambassador_name: ambassadorData.fullName,
          amount: recruitmentBonus,
          date: new Date().toISOString(),
          status: 'pending'
        });
        
        await rdRef.update({
          recruitment_history: recruitmentHistory
        });
        
        console.log(`[RD] Updated ${payment.regional_director} - earned ${recruitmentBonus} FCFA recruitment bonus`);
        
        // Create admin notification for RD payment
        await db.collection('admin_notifications').add({
          type: 'rd_recruitment_bonus',
          rd_code: payment.regional_director,
          rd_name: rdData.name || 'Unknown',
          ambassador_code: ambassadorCode,
          ambassador_name: ambassadorData.fullName,
          amount: recruitmentBonus,
          status: 'pending',
          created_at: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Send Telegram notification to admin about RD recruitment bonus
        if (TELEGRAM_BOT_TOKEN) {
          const rdTotalPending = (rdData.recruitment_bonus_pending || 0) + recruitmentBonus;
          const rdMsg = `💰 RD RECRUITMENT BONUS\n\n` +
            `RD: ${payment.regional_director}\n` +
            `Name: ${rdData.name || 'Unknown'}\n` +
            `New Ambassador: ${ambassadorCode}\n` +
            `Ambassador Name: ${ambassadorData.fullName}\n` +
            `Bonus: 1,500 FCFA\n\n` +
            `RD Total Pending: ${rdTotalPending.toLocaleString()} FCFA\n\n` +
            `👉 Admin Dashboard: https://marriageducation.com/admin-dashboard.html`;
          
          await sendTelegram(rdMsg, false);
          console.log('[Telegram] RD recruitment bonus notification sent');
        }
      }
    } catch (error) {
      console.error('Error updating RD stats:', error);
    }
  }

  // Generate book download URL
  const bookUrl = await generateDownloadURL('book');
  console.log(`[BOOK] Generated download URL for ${ambassadorCode}`);
  
  // Send ambassador credentials + book link email
  let emailSent = false;
  let emailError = null;
  try {
    await sendAmbassadorCredentialsEmailSMTP({
      email: payment.email,
      fullName: ambassadorData.fullName,
      code: ambassadorCode,
      bookUrl: bookUrl
    });
    emailSent = true;
    console.log(`[EMAIL] Ambassador credentials sent to ${payment.email}`);
  } catch (error) {
    emailError = error.message;
    console.error(`[EMAIL ERROR] Failed to send credentials to ${payment.email}:`, error);
  }

  // Send Telegram notification with ALL details including book link
  if (TELEGRAM_BOT_TOKEN) {
    const emailStatus = emailSent ? '✅ Sent' : '❌ Failed';
    const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString();
    
    const msg = `✅ AMBASSADOR REGISTRATION APPROVED\n\n` +
      `🎯 Code: ${ambassadorCode}\n` +
      `👤 Name: ${ambassadorData.fullName}\n` +
      `📧 Email: ${payment.email}\n` +
      `📱 Phone: ${payment.phone}\n` +
      `${payment.regional_director ? `👑 Recruited By: ${payment.regional_director}\n` : ''}` +
      `💰 Fee: ${payment.amount} ${payment.currency}\n\n` +
      `📧 Email Status: ${emailStatus}\n` +
      `🔐 Dashboard: https://marriage-education.web.app/ambassador-login.html\n\n` +
      `📥 Book Download (expires ${expiryDate}):\n${bookUrl}`;
    
    await sendTelegram(msg, false);
  }
  
  console.log(`[COMPLETE] Ambassador ${ambassadorCode} activated and notified`);
}

async function sendAmbassadorCredentialsEmailSMTP(ambassador) {
  const mailOptions = {
    from: `"Marriage Education" <${SMTP_CONFIG.from}>`,
    to: ambassador.email,
    subject: `🎉 Welcome Ambassador - ${ambassador.code}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #00b894 0%, #00a085 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1>🎯 Welcome, Ambassador ${ambassador.fullName}!</h1>
        </div>
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <p>Congratulations! Your ambassador registration has been approved.</p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #00b894;">
            <h3>📋 Your Ambassador Credentials</h3>
            <p><strong>Ambassador Code:</strong> <span style="font-family: monospace; font-size: 20px; color: #00b894;">${ambassador.code}</span></p>
            <p><strong>Email:</strong> ${ambassador.email}</p>
            <p><strong>Dashboard:</strong> <a href="https://marriage-education.web.app/ambassador-login.html" style="color: #00b894;">Login Here</a></p>
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #00b894;">
            <h3>📚 Your Book Download</h3>
            <p>Download your book package now. This link expires in 7 days.</p>
            <a href="${ambassador.bookUrl}" style="display: inline-block; background: #00b894; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 10px 0;">📥 Download Book</a>
          </div>
          
          <h3>🚀 Next Steps:</h3>
          <ol>
            <li>Download and read your book package</li>
            <li>Log in to your ambassador dashboard</li>
            <li>Get your unique referral link</li>
            <li>Start sharing and earning commissions!</li>
          </ol>
          
          <p><strong>Questions?</strong> Reply to this email or contact support@marriageducation.com</p>
        </div>
      </div>
    `
  };

  try {
    console.log(`[EMAIL] Sending ambassador credentials to ${ambassador.email}`);
    await transporter.sendMail(mailOptions);
    console.log(`✅ SMTP email sent to ${ambassador.email}`);
  } catch (error) {
    console.error('❌ Failed to send ambassador credentials email:', error);
    throw error;
  }
}

async function trackAmbassadorSale(ambassadorCode, amount) {
  try {
    // Query ambassador by document ID (ambassadorCode is the document ID)
    const ambassadorRef = db.collection('ambassadors').doc(ambassadorCode);
    const ambassadorDoc = await ambassadorRef.get();

    if (!ambassadorDoc.exists) {
      console.error(`Ambassador not found: ${ambassadorCode}`);
      return;
    }

    const ambassador = ambassadorDoc.data();

    // Calculate commission (10% tiered)
    const commissionAmount = amount * 0.10;

    await ambassadorRef.update({
      booksSold: admin.firestore.FieldValue.increment(1),
      commissionEarned: admin.firestore.FieldValue.increment(commissionAmount)
    });
    
    console.log(`[COMMISSION] ${ambassadorCode}: +${commissionAmount} FCFA (Total books: ${(ambassador.booksSold || 0) + 1})`);

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
      <p><a href="https://marriageducation.com/admin-dashboard.html">Approve Payment</a></p>
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
    subject: `🎉 Milestone Reached: ${milestone} Access Units Deployed!`,
    html: `
      <h2>Congratulations! 🎉</h2>
      <p>You've deployed <strong>${milestone} access units</strong> to Marriage Foundation education!</p>
      <p><strong>Advocacy Earnings:</strong> ${commission} FCFA</p>
      <p><strong>Total Access Units:</strong> ${milestone}</p>
      <p>Keep sharing the Marriage Foundation to earn more!</p>
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
      <p><a href="https://marriageducation.com/admin-dashboard.html">Approve Payment</a></p>
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
  if (!transporter) {
    throw new Error('SMTP not configured');
  }
  
  const mailOptions = {
    from: `"Marriage Education" <${SMTP_CONFIG.from}>`,
    to: rd.email,
    subject: `👑 Welcome Regional Director - ${rd.code}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
          .credentials { background: white; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; }
          .btn { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
          .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; padding: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 28px;">👑 Welcome, Regional Director!</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Your account is now active</p>
          </div>
          
          <div class="content">
            <p>Dear ${rd.name},</p>
            
            <p>Congratulations! Your Regional Director account has been approved and activated.</p>
            
            <div class="credentials">
              <h3 style="margin-top: 0; color: #667eea;">Your Credentials</h3>
              <p><strong>RD Code:</strong> ${rd.code}</p>
              <p><strong>Name:</strong> ${rd.name}</p>
              <p><strong>Email:</strong> ${rd.email}</p>
              <p><strong>Phone:</strong> ${rd.phone}</p>
            </div>
            
            <p>You can now access your Regional Director dashboard to:</p>
            <ul>
              <li>View your team of ambassadors</li>
              <li>Track sales and commissions</li>
              <li>Recruit new ambassadors</li>
              <li>Monitor your region's performance</li>
            </ul>
            
            <div style="text-align: center;">
              <a href="https://marriageducation.com/rd-login.html" class="btn">Login to Dashboard</a>
            </div>
            
            <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">Use your RD code and phone number to login.</p>
          </div>
          
          <div class="footer">
            <p>Marriage Education | Regional Director Program</p>
            <p>Questions? Contact us at support@marriageducation.com</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  return await transporter.sendMail(mailOptions);
}

async function sendReferralMilestoneEmailSMTP(referral, milestone, commission) {
  const mailOptions = {
    from: 'orders@marriageducation.com',
    to: referral.email,
    subject: `🎉 Milestone Reached: ${milestone} Access Units Deployed!`,
    html: `
      <h2>Congratulations! 🎉</h2>
      <p>You've deployed <strong>${milestone} access units</strong> to Marriage Foundation education!</p>
      <p><strong>Advocacy Earnings:</strong> ${commission} FCFA</p>
      <p><strong>Total Access Units:</strong> ${milestone}</p>
      <p>Keep sharing the Marriage Foundation to earn more!</p>
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

/**
 * Submit Ambassador Application
 * Receives ambassador registration data and sends email notification
 */
exports.submitAmbassadorApplication = functions.https.onRequest(async (req, res) => {
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
    const data = req.body;
    
    console.log('[Ambassador] Received application:', data.fullName);
    
    // Validate required fields
    const requiredFields = ['fullName', 'email', 'phone', 'city', 'region', 'motivation', 'commitment'];
    const missingFields = requiredFields.filter(field => !data[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
    
    // Save to Firestore for backup (in addition to client-side save)
    try {
      await db.collection('ambassadors').add({
        ...data,
        submittedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'cloud_function'
      });
      console.log('[Ambassador] Saved to Firestore:', data.code);
    } catch (firestoreError) {
      console.warn('[Ambassador] Firestore save failed:', firestoreError.message);
      // Continue with email even if Firestore fails
    }
    
    // Prepare email content
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #8B0000; margin-bottom: 20px;">🎯 New Ambassador Application</h2>
          
          <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
            <p style="margin: 5px 0;"><strong>Ambassador Code:</strong> ${data.code}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: orange;">Pending Approval</span></p>
          </div>
          
          <h3 style="color: #333; margin-top: 25px;">Personal Information</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; font-weight: bold;">Full Name:</td>
              <td style="padding: 8px 0;">${data.fullName}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; font-weight: bold;">Email:</td>
              <td style="padding: 8px 0;">${data.email}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; font-weight: bold;">Phone:</td>
              <td style="padding: 8px 0;">${data.phone}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; font-weight: bold;">City:</td>
              <td style="padding: 8px 0;">${data.city}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; font-weight: bold;">Region:</td>
              <td style="padding: 8px 0;">${data.region}</td>
            </tr>
          </table>
          
          <h3 style="color: #333; margin-top: 25px;">Social Media Presence</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            ${data.instagram ? `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; font-weight: bold;">Instagram:</td>
              <td style="padding: 8px 0;">${data.instagram} (${data.instagramFollowers || 0} followers)</td>
            </tr>` : ''}
            ${data.facebook ? `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; font-weight: bold;">Facebook:</td>
              <td style="padding: 8px 0;">${data.facebook} (${data.facebookFollowers || 0} followers)</td>
            </tr>` : ''}
            ${data.tiktok ? `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; font-weight: bold;">TikTok:</td>
              <td style="padding: 8px 0;">${data.tiktok}</td>
            </tr>` : ''}
            ${data.linkedin ? `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; font-weight: bold;">LinkedIn:</td>
              <td style="padding: 8px 0;">${data.linkedin}</td>
            </tr>` : ''}
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; font-weight: bold;">Primary Platform:</td>
              <td style="padding: 8px 0;">${data.primaryPlatform}</td>
            </tr>
          </table>
          
          <h3 style="color: #333; margin-top: 25px;">Application Details</h3>
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 15px;">
            <p style="margin: 0 0 10px 0;"><strong>Motivation:</strong></p>
            <p style="margin: 0; color: #555;">${data.motivation}</p>
          </div>
          
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; font-weight: bold;">Sales Experience:</td>
              <td style="padding: 8px 0;">${data.salesExperience}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; font-weight: bold;">Commitment Level:</td>
              <td style="padding: 8px 0;">${data.commitment}</td>
            </tr>
            ${data.referralSource ? `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; font-weight: bold;">Referral Source:</td>
              <td style="padding: 8px 0;">${data.referralSource}</td>
            </tr>` : ''}
            ${data.recruitedBy ? `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; font-weight: bold;">Recruited By:</td>
              <td style="padding: 8px 0;"><span style="color: #8B0000; font-weight: bold;">${data.recruitedBy}</span></td>
            </tr>` : ''}
            ${data.referredBy ? `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; font-weight: bold;">Referred By:</td>
              <td style="padding: 8px 0;">${data.referredBy}</td>
            </tr>` : ''}
          </table>
          
          <div style="margin-top: 30px; padding: 20px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 5px;">
            <p style="margin: 0; color: #856404;"><strong>⚠️ Action Required:</strong> Please review this application and approve/reject via the admin dashboard.</p>
          </div>
          
          <div style="margin-top: 30px; text-align: center;">
            <a href="https://marriageducation.com/admin/ambassador-applications.html" 
               style="display: inline-block; padding: 12px 30px; background-color: #8B0000; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
              Review Application
            </a>
          </div>
        </div>
        
        <div style="margin-top: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>This is an automated notification from Marriage Education Ambassador Program</p>
        </div>
      </div>
    `;
    
    // Send email via SMTP (iPage)
    let emailSent = false;
    let emailMethod = 'none';
    
    if (transporter) {
      try {
        await transporter.sendMail({
          from: SMTP_CONFIG.from,
          to: 'ambassadors@marriageducation.com',
          replyTo: data.email,
          subject: `🎯 New Ambassador Application - ${data.fullName} (${data.code})`,
          html: emailHtml
        });
        emailSent = true;
        emailMethod = 'SMTP';
        console.log('[Ambassador] Email sent via SMTP');
      } catch (smtpError) {
        console.warn('[Ambassador] SMTP failed:', smtpError.message);
      }
    }
    
    // Fallback to SendGrid if SMTP fails
    if (!emailSent && SENDGRID_API_KEY) {
      try {
        await sgMail.send({
          from: 'ambassadors@marriageducation.com',
          to: 'ambassadors@marriageducation.com',
          replyTo: data.email,
          subject: `🎯 New Ambassador Application - ${data.fullName} (${data.code})`,
          html: emailHtml
        });
        emailSent = true;
        emailMethod = 'SendGrid';
        console.log('[Ambassador] Email sent via SendGrid');
      } catch (sendgridError) {
        console.warn('[Ambassador] SendGrid failed:', sendgridError.message);
      }
    }
    
    // Send Telegram notification (plain text for reliability)
    try {
      await sendTelegram(
        `🎯 NEW AMBASSADOR APPLICATION\n\n` +
        `Code: ${data.code}\n` +
        `Name: ${data.fullName}\n` +
        `Email: ${data.email}\n` +
        `Phone: ${data.phone}\n` +
        `Location: ${data.city}, ${data.region}\n` +
        `Platform: ${data.primaryPlatform}\n` +
        `Status: Pending Approval\n\n` +
        `Review: https://marriageducation.com/admin/ambassador-applications.html`,
        false // Don't use Markdown
      );
      console.log('[Ambassador] Telegram notification sent');
    } catch (telegramError) {
      console.warn('[Ambassador] Telegram failed:', telegramError.message);
    }
    
    if (!emailSent) {
      throw new Error('Failed to send email notification via any method');
    }
    
    // Return success
    res.json({
      success: true,
      message: 'Ambassador application submitted successfully',
      code: data.code,
      recipient: 'ambassadors@marriageducation.com',
      method: emailMethod
    });
    
  } catch (error) {
    console.error('[Ambassador] Submission error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// CERTIFICATE GENERATION SYSTEM
// ============================================

/**
 * Generate Course Certificate
 * Called after student passes the final exam with 80%+
 * Creates PDF certificate, uploads to Storage, creates Firestore record
 */
exports.generateCourseCertificate = functions.https.onCall(async (data, context) => {
  try {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { courseId, quizScore } = data;

    if (!courseId || quizScore === undefined) {
      throw new functions.https.HttpsError('invalid-argument', 'courseId and quizScore are required');
    }

    console.log(`[Certificate] Generating for user ${userId}, course ${courseId}, score ${quizScore}%`);

    // Fetch user data
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }
    const userData = userDoc.data();
    const studentName = userData.displayName || userData.email || 'Student';

    // Fetch course data
    const courseDoc = await db.collection('courses').doc(courseId).get();
    if (!courseDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Course not found');
    }
    const courseData = courseDoc.data();
    const courseTitle = courseData.title || 'Course';

    // Check if certificate already exists
    const existingCert = await db.collection('certificates')
      .where('userId', '==', userId)
      .where('courseId', '==', courseId)
      .where('type', '==', 'course')
      .limit(1)
      .get();

    if (!existingCert.empty) {
      console.log('[Certificate] Certificate already exists, returning existing');
      const certData = existingCert.docs[0].data();
      return {
        success: true,
        certificateId: existingCert.docs[0].id,
        pdfUrl: certData.pdfUrl,
        message: 'Certificate already issued'
      };
    }

    // Generate certificate number
    const year = new Date().getFullYear();
    const random = Math.floor(100000 + Math.random() * 900000);
    const certificateNumber = `CERT-${year}-${random}`;

    // Create PDF certificate
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    // Certificate styling
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Border
    doc.setLineWidth(2);
    doc.setDrawColor(102, 126, 234); // #667eea
    doc.rect(10, 10, pageWidth - 20, pageHeight - 20);

    doc.setLineWidth(0.5);
    doc.setDrawColor(118, 75, 162); // #764ba2
    doc.rect(12, 12, pageWidth - 24, pageHeight - 24);

    // Header
    doc.setFontSize(16);
    doc.setTextColor(102, 126, 234);
    doc.text('MARRIAGE EDUCATION', pageWidth / 2, 30, { align: 'center' });

    // Certificate of Completion
    doc.setFontSize(40);
    doc.setTextColor(30, 41, 59); // #1e293b
    doc.text('Certificate of Completion', pageWidth / 2, 55, { align: 'center' });

    // Awarded to
    doc.setFontSize(14);
    doc.setTextColor(100, 116, 139);
    doc.text('This is to certify that', pageWidth / 2, 75, { align: 'center' });

    // Student name
    doc.setFontSize(32);
    doc.setTextColor(102, 126, 234);
    doc.setFont(undefined, 'bold');
    doc.text(studentName, pageWidth / 2, 95, { align: 'center' });

    // Has successfully completed
    doc.setFontSize(14);
    doc.setTextColor(100, 116, 139);
    doc.setFont(undefined, 'normal');
    doc.text('has successfully completed the course', pageWidth / 2, 110, { align: 'center' });

    // Course title
    doc.setFontSize(24);
    doc.setTextColor(30, 41, 59);
    doc.setFont(undefined, 'bold');
    doc.text(courseTitle, pageWidth / 2, 130, { align: 'center' });

    // Score
    doc.setFontSize(16);
    doc.setTextColor(16, 185, 129); // Green
    doc.text(`Final Score: ${quizScore}%`, pageWidth / 2, 145, { align: 'center' });

    // Date
    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139);
    doc.setFont(undefined, 'normal');
    const completionDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    doc.text(`Completion Date: ${completionDate}`, pageWidth / 2, 160, { align: 'center' });

    // Certificate number
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text(`Certificate No: ${certificateNumber}`, pageWidth / 2, 175, { align: 'center' });

    // Signature line
    doc.setLineWidth(0.5);
    doc.setDrawColor(226, 232, 240);
    doc.line(pageWidth / 2 - 40, 190, pageWidth / 2 + 40, 190);

    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text('Dr. Achu-Favour Chungwi-Ibiam', pageWidth / 2, 197, { align: 'center' });
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text('Founder & Lead Instructor', pageWidth / 2, 203, { align: 'center' });

    // Convert PDF to buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    // Upload to Firebase Storage
    const fileName = `certificates/${userId}/${courseId}_${Date.now()}.pdf`;
    const file = bucket.file(fileName);

    await file.save(pdfBuffer, {
      metadata: {
        contentType: 'application/pdf',
        metadata: {
          userId: userId,
          courseId: courseId,
          certificateNumber: certificateNumber,
          generatedAt: new Date().toISOString()
        }
      }
    });

    // Make the file publicly accessible
    await file.makePublic();

    // Get public URL
    const pdfUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    // Create Firestore certificate record
    const certificateRef = await db.collection('certificates').add({
      userId: userId,
      courseId: courseId,
      type: 'course',
      certificateNumber: certificateNumber,
      studentName: studentName,
      courseTitle: courseTitle,
      quizScore: quizScore,
      issuedAt: admin.firestore.FieldValue.serverTimestamp(),
      completionDate: completionDate,
      pdfUrl: pdfUrl,
      fileName: fileName,
      verificationUrl: `https://marriageducation.com/verify-certificate?cert=${certificateNumber}`
    });

    // Update enrollment record to mark certificate as issued
    const enrollmentQuery = await db.collection('enrollments')
      .where('userId', '==', userId)
      .where('courseId', '==', courseId)
      .limit(1)
      .get();

    if (!enrollmentQuery.empty) {
      await enrollmentQuery.docs[0].ref.update({
        certificateIssued: true,
        certificateId: certificateRef.id,
        certificateIssuedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Send email with certificate
    try {
      await sendCertificateEmail(userData.email, studentName, courseTitle, pdfUrl, certificateNumber);
      console.log('[Certificate] Email sent successfully');
    } catch (emailError) {
      console.warn('[Certificate] Failed to send email:', emailError.message);
    }

    console.log(`[Certificate] Generated successfully: ${certificateRef.id}`);

    return {
      success: true,
      certificateId: certificateRef.id,
      certificateNumber: certificateNumber,
      pdfUrl: pdfUrl,
      message: 'Certificate generated successfully'
    };

  } catch (error) {
    console.error('[Certificate] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Send certificate email notification
 */
async function sendCertificateEmail(recipientEmail, studentName, courseTitle, pdfUrl, certificateNumber) {
  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .certificate-box { background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
        .btn { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; padding: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; font-size: 28px;">🎉 Congratulations!</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">You've Earned Your Certificate</p>
        </div>
        
        <div class="content">
          <p>Dear ${studentName},</p>
          
          <p>Congratulations on successfully completing <strong>${courseTitle}</strong>!</p>
          
          <div class="certificate-box">
            <h2 style="color: #667eea; margin-top: 0;">📜 Certificate Ready</h2>
            <p style="color: #6b7280; margin: 10px 0;">Certificate No: <strong>${certificateNumber}</strong></p>
            <a href="${pdfUrl}" class="btn">Download Certificate</a>
          </div>
          
          <p>Your certificate is a testament to your commitment and achievement. You can:</p>
          <ul>
            <li>Download and print your certificate</li>
            <li>Share it on social media (LinkedIn, Facebook, etc.)</li>
            <li>Add it to your professional portfolio</li>
            <li>Access it anytime from your student dashboard</li>
          </ul>
          
          <p>Keep up the great work on your learning journey!</p>
          
          <p style="margin-top: 30px;">
            <strong>The Marriage Education Team</strong><br>
            <a href="https://marriageducation.com">marriageducation.com</a>
          </p>
        </div>
        
        <div class="footer">
          <p>Marriage Education | Building Strong Foundations for Lasting Relationships</p>
          <p>This email was sent to ${recipientEmail}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Try SendGrid first, fallback to SMTP
  if (SENDGRID_API_KEY) {
    await sgMail.send({
      to: recipientEmail,
      from: 'certificates@marriageducation.com',
      subject: `🎉 Your Certificate is Ready - ${courseTitle}`,
      html: emailHtml
    });
  } else if (transporter) {
    await transporter.sendMail({
      from: SMTP_CONFIG.from,
      to: recipientEmail,
      subject: `🎉 Your Certificate is Ready - ${courseTitle}`,
      html: emailHtml
    });
  } else {
    throw new Error('No email service configured');
  }
}
