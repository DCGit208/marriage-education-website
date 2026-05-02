const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')(functions.config().stripe?.secret_key);
const nodemailer = require('nodemailer');
const { Resend } = require('resend');
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

// Initialize Resend
const RESEND_KEY = functions.config().resend?.key || 're_PDX9ycaB_HDkbmWkZqdtrASUp1X5oazKM';
const resend = new Resend(RESEND_KEY);

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
    'sbd-founding': 'sbd-for-dummies.pdf',
    'sbd-1': 'sbd-for-dummies.pdf',
    'sbd-3': 'sbd-for-dummies.pdf',
    'sbd-5': 'sbd-for-dummies.pdf',
    'sbd-10': 'sbd-for-dummies.pdf',
    'sbd-100': 'sbd-for-dummies.pdf',
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
    const bucketName = 'marriage-education.firebasestorage.app';
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
async function sendDownloadEmail(email, productName, downloadUrl, paymentRef = null) {
  const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  
  // Create simple redirect URL if payment reference is available
  const simpleDownloadUrl = paymentRef 
    ? `https://us-central1-marriage-education.cloudfunctions.net/downloadBook?ref=${paymentRef}`
    : downloadUrl;
  
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
        <a href="${simpleDownloadUrl}" class="button" style="display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">📥 Download Now</a>
      </div>
      
      <p><strong>Download expires:</strong> ${expiryDate}</p>
      
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #92400e; font-size: 16px;">📱 If the button above doesn't work:</h3>
        
        <p style="margin: 10px 0;"><strong>Option 1 - Copy this link:</strong></p>
        <p style="word-break: break-all; background: white; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 12px;">${simpleDownloadUrl}</p>
        
        <p style="margin: 10px 0;"><strong>Option 2 - Direct download link:</strong></p>
        <p style="word-break: break-all; background: white; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 11px;">${downloadUrl}</p>
        <p style="color: #92400e; font-size: 13px; margin: 5px 0;">⚠️ Copy the ENTIRE link including everything after "?token="</p>
      </div>
      
      <p>Thank you for supporting Marriage Education!</p>
    </div>
    <div class="footer">
      <p>Marriage Education | marriageducation.com</p>
      <p>Questions? Reply to this email or WhatsApp +237 620 031 944</p>
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
 * Simple Download Redirect Handler
 * Provides email-client-friendly download URLs that won't get mangled
 * Usage: https://us-central1-marriage-education.cloudfunctions.net/downloadBook?ref=PAYMENT-REF
 */
exports.downloadBook = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  try {
    const { ref, token } = req.query;
    
    // Method 1: Using payment reference
    if (ref) {
      console.log(`[DOWNLOAD] Request for payment ref: ${ref}`);
      
      // Look up the payment to get product_id
      const paymentDoc = await db.collection('pending_payments').doc(ref).get();
      
      if (!paymentDoc.exists) {
        console.error(`[DOWNLOAD] Payment not found: ${ref}`);
        return res.status(404).send('Payment record not found. Please contact support with your reference number.');
      }
      
      const payment = paymentDoc.data();
      
      // Check if payment is approved
      if (payment.status !== 'approved') {
        console.log(`[DOWNLOAD] Payment not approved: ${ref} (status: ${payment.status})`);
        return res.status(403).send('Payment not yet approved. Please wait for admin approval or contact support.');
      }
      
      // Generate download URL
      const downloadUrl = await generateDownloadURL(payment.product_id);
      console.log(`[DOWNLOAD] Redirecting ${ref} to storage URL`);
      
      // Redirect to the actual file
      return res.redirect(downloadUrl);
    }
    
    // Method 2: Using direct download token (for future use)
    if (token) {
      const tokenDoc = await db.collection('download_tokens').doc(token).get();
      
      if (!tokenDoc.exists) {
        return res.status(404).send('Invalid or expired download token.');
      }
      
      const tokenData = tokenDoc.data();
      
      // Check expiry
      if (tokenData.expires_at && tokenData.expires_at.toDate() < new Date()) {
        return res.status(403).send('Download link has expired. Please contact support.');
      }
      
      const downloadUrl = await generateDownloadURL(tokenData.product_id);
      return res.redirect(downloadUrl);
    }
    
    return res.status(400).send('Missing required parameter: ref or token');
    
  } catch (error) {
    console.error('[DOWNLOAD] Error:', error);
    return res.status(500).send(`Download error: ${error.message}. Please contact support.`);
  }
});

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
      // ── AMBASSADOR REGISTRATION (Auto-approve via Stripe) ──────────────────────
      if (session.metadata?.type === 'ambassador') {
        const ambassadorCode = session.metadata.ambassadorCode;
        const ambassadorEmail = session.customer_details?.email || session.metadata.email;
        const paymentIntentId = session.payment_intent || session.id;
        
        if (!ambassadorCode) {
          console.error('[STRIPE] Ambassador webhook missing code:', session.metadata);
          return res.json({ received: true, action: 'ambassador-missing-code' });
        }
        
        // Create Stripe payment record (auto-approved)
        const stripePaymentData = {
          reference: ambassadorCode,
          payment_intent_id: paymentIntentId,
          product_id: 'ambassador-registration',
          product_name: 'Ambassador Registration',
          amount: Math.round((session.amount_total || 0) / 100),
          currency: session.currency || 'usd',
          email: ambassadorEmail,
          phone: session.metadata.phone || '',
          type: 'ambassador',
          payment_method: 'stripe',
          status: 'approved',
          ambassador_code: ambassadorCode,
          regional_director: session.metadata.recruitedBy || '',
          created_at: admin.firestore.FieldValue.serverTimestamp(),
          approved_at: admin.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('stripe_payments').doc(ambassadorCode).set(stripePaymentData);
        console.log('[STRIPE] Stored ambassador payment:', ambassadorCode);
        
        let ambassadorData = null;
        try {
          if (session.metadata.ambassadorData) {
            ambassadorData = JSON.parse(session.metadata.ambassadorData);
          }
        } catch (e) {
          console.warn('[STRIPE] Failed to parse ambassadorData:', e.message);
        }
        
        const paymentForActivation = {
          reference: ambassadorCode,
          ambassador_code: ambassadorCode,
          email: ambassadorEmail,
          phone: session.metadata.phone || '',
          regional_director: session.metadata.recruitedBy || '',
          ambassador_data: ambassadorData || {
            fullName: session.metadata.fullName || 'Ambassador',
            email: ambassadorEmail,
            phone: session.metadata.phone || ''
          }
        };
        
        try {
          await activateAmbassador(paymentForActivation);
          console.log('[STRIPE] ✅ Ambassador auto-activated:', ambassadorCode);
          
          if (TELEGRAM_BOT_TOKEN) {
            const activationMsg = `✅ AMBASSADOR ACTIVATED (Auto via Stripe)\n\n` +
              `🎯 Code: ${ambassadorCode}\n` +
              `👤 Name: ${paymentForActivation.ambassador_data?.fullName || 'N/A'}\n` +
              `📧 Email: ${ambassadorEmail}\n` +
              `💰 Amount: $${(session.amount_total / 100).toFixed(2)} ${session.currency || 'USD'}\n` +
              `👑 Recruited By: ${session.metadata.recruitedBy || 'None'}\n\n` +
              `🔗 Dashboard: https://marriageducation.com/ambassador-dashboard.html`;
            await sendTelegram(activationMsg, false);
          }
          
          return res.json({ received: true, action: 'ambassador-activated', code: ambassadorCode });
        } catch (activationError) {
          console.error('[STRIPE] Ambassador activation failed:', activationError.message);
          
          if (TELEGRAM_BOT_TOKEN) {
            const errorMsg = `🚨 STRIPE AMBASSADOR ACTIVATION FAILED\n\n` +
              `Code: ${ambassadorCode}\n` +
              `Email: ${ambassadorEmail}\n` +
              `Error: ${activationError.message}\n\n` +
              `⚠️ Manual activation required`;
            await sendTelegram(errorMsg, false);
          }
          
          return res.status(500).json({ error: 'Activation failed', details: activationError.message });
        }
      }
      // ────────────────────────────────────────────────────────────────────────────
      
      // ── SBD Network branch ──────────────────────────────────────────
      if (session.metadata?.app === 'sbd') {
        const uid       = session.metadata.uid;
        const productId = session.metadata.productId;
        if (!uid || !productId) {
          console.error('[SBD] Webhook missing uid or productId:', session.metadata);
          return res.json({ received: true, action: 'sbd-missing-metadata' });
        }
        await unlockSbdContent(uid, productId, session);
        const prodName = SBD_CATALOG_SERVER[productId]?.name || productId;
        const amt      = session.amount_total ? `$${(session.amount_total / 100).toFixed(2)}` : '';
        await sendTelegram(`✅ SBD NETWORK PAYMENT\n\n📦 ${prodName}\n💵 ${amt}\n👤 ${session.customer_details?.email || uid}`);
        return res.json({ received: true, action: 'sbd' });
      }
      // ────────────────────────────────────────────────────────────────

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

  // ── SBD subscription cancelled (recurring billing stopped by user) ──
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    try {
      const snap = await db.collection('users').where('stripeSubscriptionId', '==', sub.id).limit(1).get();
      if (!snap.empty) {
        const userRef   = snap.docs[0].ref;
        const userData  = snap.docs[0].data();
        const userEmail = userData.email || snap.docs[0].id;

        // Save drip position so user can resume on re-subscribe (Decision 3 — Resume)
        const dripStartMs = userData.subscription?.dripStartDate?.toMillis
          ? userData.subscription.dripStartDate.toMillis()
          : null;
        const dripWeeksUnlocked = dripStartMs
          ? Math.max(1, Math.floor((Date.now() - dripStartMs) / (7 * 24 * 60 * 60 * 1000)) + 1)
          : 0;

        await userRef.update({
          tier: 'free',
          'subscription.tier': 'free',
          'subscription.status': 'cancelled',
          'subscription.endDate': admin.firestore.Timestamp.fromDate(new Date()),
          'subscription.dripWeeksUnlocked': dripWeeksUnlocked,
        });
        console.log(`[SBD] Sub ${sub.id} cancelled → ${userEmail} downgraded to free. Drip position saved: week ${dripWeeksUnlocked}`);
        await sendTelegram(`❌ SBD SUBSCRIPTION CANCELLED\n\n👤 ${userEmail}\n🆔 Sub: ${sub.id}\n📍 Drip position saved: week ${dripWeeksUnlocked}`);
      }
    } catch (e) {
      console.error('[SBD] subscription.deleted error:', e);
    }
    return res.json({ received: true, action: 'sbd-sub-cancelled' });
  }
  // ─────────────────────────────────────────────────────────────────────

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
      await sendAdminPaymentNotification(paymentData);
      console.log('[EMAIL] Admin notification sent');
    } catch (emailError) {
      console.warn('[EMAIL] Admin notification failed (continuing anyway):', emailError.message);
      // Don't throw - payment submission should succeed even if email fails
    }

    // Send Telegram notification for new pending payment (plain text, non-blocking)
    try {
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
        console.log('[TELEGRAM] Notification sent');
      }
    } catch (telegramError) {
      console.warn('[TELEGRAM] Notification failed (continuing anyway):', telegramError.message);
      // Don't throw - payment submission should succeed even if Telegram fails
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
    if (payment.product_id === 'ambassador-registration') {
      if (!payment.ambassador_data) {
        // CRITICAL: Missing data - send urgent alert to admin
        console.error('[CRITICAL] Ambassador payment missing ambassador_data:', reference);
        
        if (TELEGRAM_BOT_TOKEN) {
          const alertMsg = `🚨 CRITICAL ERROR - Ambassador Activation Failed\n\n` +
            `Reference: ${reference}\n` +
            `Email: ${payment.email}\n` +
            `Phone: ${payment.phone}\n\n` +
            `❌ ERROR: Missing ambassador_data\n` +
            `This happens when registration form data is lost.\n\n` +
            `⚠️ Payment is approved but ambassador NOT created.\n` +
            `Please manually activate this ambassador:\n` +
            `node fix-ambassador-payment.js ${reference}`;
          
          await sendTelegram(alertMsg, false);
        }
        
        throw new functions.https.HttpsError('failed-precondition', 
          `Ambassador data missing for ${reference}. Registration form may have timed out. Please contact support.`);
      }
      
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
      downloadUrl,
      reference  // Pass payment reference for simple redirect URL
    );

    // Send comprehensive Telegram notification to admin (plain text)
    if (TELEGRAM_BOT_TOKEN) {
      const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString();
      const simpleUrl = `https://us-central1-marriage-education.cloudfunctions.net/downloadBook?ref=${reference}`;
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
        `📥 Simple Download Link:\n${simpleUrl}\n\n` +
        `📥 Direct Download (expires ${expiryDate}):\n${downloadUrl}`;
      
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

    // Update recruiter's pending balance (RD-* or AMB-*)
    let recruiterName = 'Unknown';
    let remainingPending = 0;

    if (rd_code && rd_code.startsWith('RD-')) {
      const rdRef = db.collection('regional_directors').doc(rd_code);
      const rdDoc = await rdRef.get();

      if (rdDoc.exists) {
        const rdData = rdDoc.data();
        recruiterName = rdData.name || 'Unknown';

        await rdRef.update({
          recruitment_bonus_pending: admin.firestore.FieldValue.increment(-amount),
          recruitment_bonus_paid: admin.firestore.FieldValue.increment(amount),
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });

        const recruitmentHistory = rdData.recruitment_history || [];
        const updatedHistory = recruitmentHistory.map(entry => {
          if (entry.status === 'pending' && entry.amount === amount) {
            return { ...entry, status: 'paid', paid_at: new Date().toISOString() };
          }
          return entry;
        });
        await rdRef.update({ recruitment_history: updatedHistory });
        remainingPending = Math.max(0, (rdData.recruitment_bonus_pending || 0) - amount);
      }
    } else if (rd_code && rd_code.startsWith('AMB-')) {
      const ambRef = db.collection('ambassadors').doc(rd_code);
      const ambDoc = await ambRef.get();

      if (ambDoc.exists) {
        const ambData = ambDoc.data();
        recruiterName = ambData.name || ambData.fullName || 'Unknown';

        await ambRef.update({
          recruitment_bonus_pending: admin.firestore.FieldValue.increment(-amount),
          recruitment_bonus_paid: admin.firestore.FieldValue.increment(amount),
          commission_earned: admin.firestore.FieldValue.increment(amount),
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });

        const recruitmentHistory = ambData.recruitment_history || [];
        const updatedHistory = recruitmentHistory.map(entry => {
          if (entry.status === 'pending' && entry.amount === amount) {
            return { ...entry, status: 'paid', paid_at: new Date().toISOString() };
          }
          return entry;
        });
        await ambRef.update({ recruitment_history: updatedHistory });
        remainingPending = Math.max(0, (ambData.recruitment_bonus_pending || 0) - amount);
      }
    }

    console.log(`[RECRUITMENT PAYMENT] ${rd_code} payment marked as paid: ${amount} FCFA`);

    // Send Telegram confirmation
    if (TELEGRAM_BOT_TOKEN) {
      const telegramMsg = `✅ RECRUITMENT BONUS PAYMENT MARKED AS PAID\n\n` +
        `Recruiter: ${rd_code}\n` +
        `Name: ${recruiterName}\n` +
        `Amount Paid: ${amount.toLocaleString()} FCFA\n` +
        `Remaining Pending: ${remainingPending.toLocaleString()} FCFA`;

      await sendTelegram(telegramMsg, false);
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

/**
 * migrateExistingBookSharers
 * - One-time migration for existing referral codes without auth accounts
 * - Generates passwords, creates Firebase Auth users, sends welcome emails
 */
exports.migrateExistingBookSharers = functions.https.onCall(async (data, context) => {
  try {
    // Get ALL referral codes, then filter those without auth_uid
    // (Can't query for missing fields in Firestore)
    const snapshot = await db.collection('referral_codes').get();
    
    if (snapshot.empty) {
      return {
        success: true,
        message: 'No referral codes found in database',
        migrated: 0,
        failed: 0
      };
    }
    
    // Filter to only those without auth_uid
    const usersToMigrate = snapshot.docs.filter(doc => {
      const data = doc.data();
      return !data.auth_uid; // Missing or null auth_uid
    });
    
    if (usersToMigrate.length === 0) {
      return {
        success: true,
        message: 'All users already have dashboard access',
        migrated: 0,
        failed: 0,
        total: snapshot.docs.length
      };
    }
    
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };
    
    for (const doc of usersToMigrate) {
      const code = doc.id;
      const data = doc.data();
      
      try {
        // Skip if no email
        if (!data.email) {
          results.failed++;
          results.errors.push({ code, error: 'No email found' });
          continue;
        }
        
        // Generate random password
        const passwordChars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
        const password = Array.from({ length: 12 }, () => 
          passwordChars.charAt(Math.floor(Math.random() * passwordChars.length))
        ).join('');
        
        // Create Firebase Auth user
        let authUserId = null;
        try {
          const userRecord = await admin.auth().createUser({
            email: data.email.toLowerCase(),
            password: password,
            displayName: data.name || 'Book Sharer',
            emailVerified: false
          });
          authUserId = userRecord.uid;
        } catch (authError) {
          // User might already exist in Auth but not linked
          if (authError.code === 'auth/email-already-exists') {
            const existingUser = await admin.auth().getUserByEmail(data.email.toLowerCase());
            authUserId = existingUser.uid;
            // Update password for existing auth user
            await admin.auth().updateUser(authUserId, { password });
          } else {
            throw authError;
          }
        }
        
        // Update Firestore
        await db.collection('referral_codes').doc(code).update({
          name: data.name || 'Book Sharer',
          password: password,
          auth_uid: authUserId,
          migrated_at: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Send welcome email
        try {
          await sendBookSharerWelcomeEmail(
            data.email,
            data.name || 'Book Sharer',
            code,
            password,
            true // isReminder = true (since they're existing users)
          );
        } catch (emailError) {
          console.error(`Failed to send email to ${data.email}:`, emailError);
          // Don't throw - migration succeeded even if email failed
        }
        
        results.success++;
        console.log(`✅ Migrated: ${code} - ${data.email}`);
        
      } catch (error) {
        results.failed++;
        results.errors.push({ code, error: error.message });
        console.error(`❌ Failed to migrate ${code}:`, error);
      }
    }
    
    return {
      success: true,
      message: `Migrated ${results.success} users, ${results.failed} failed (out of ${usersToMigrate.length} total)`,
      migrated: results.success,
      failed: results.failed,
      total: usersToMigrate.length,
      errors: results.errors
    };
    
  } catch (error) {
    console.error('Migration error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * claimBookSharerDashboard
 * - Self-service function for existing users to claim their dashboard
 * - User provides email, name, and sets their own password
 */
exports.claimBookSharerDashboard = functions.https.onCall(async (data, context) => {
  try {
    const { email, name, password } = data;
    
    if (!email || !name || !password) {
      throw new functions.https.HttpsError('invalid-argument', 'Email, name, and password required');
    }
    
    if (password.length < 8) {
      throw new functions.https.HttpsError('invalid-argument', 'Password must be at least 8 characters');
    }
    
    // Find existing referral code by email
    const snapshot = await db.collection('referral_codes')
      .where('email', '==', email.toLowerCase())
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      throw new functions.https.HttpsError('not-found', 'No referral account found for this email. Please generate a new referral code first.');
    }
    
    const doc = snapshot.docs[0];
    const code = doc.id;
    const existingData = doc.data();
    
    // Check if already has auth account
    if (existingData.auth_uid) {
      throw new functions.https.HttpsError('already-exists', 'Dashboard already set up. Use "Forgot Password" if you need to reset.');
    }
    
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
    } catch (authError) {
      if (authError.code === 'auth/email-already-exists') {
        throw new functions.https.HttpsError('already-exists', 'Email already has an account. Use "Forgot Password" to reset.');
      }
      throw authError;
    }
    
    // Update Firestore with auth details
    await db.collection('referral_codes').doc(code).update({
      name: name,
      password: password,
      auth_uid: authUserId,
      claimed_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Send confirmation email
    try {
      await sendBookSharerWelcomeEmail(email, name, code, password, false);
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
      // Don't throw - claim succeeded
    }
    
    return {
      success: true,
      message: 'Dashboard claimed successfully! You can now login.',
      code: code
    };
    
  } catch (error) {
    console.error('Claim dashboard error:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
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
    // NEW: Volume tracking (FCFA values)
    personalVolume: 0,        // Direct sales by this ambassador
    teamVolume: 0,            // Sales by direct recruits
    networkVolume: 0,         // Sales by entire downline
    // NEW: Count tracking for promotions
    directAmbassadorCount: 0, // Regular ambassadors recruited
    directSeniorCount: 0,     // Seniors recruited (for RD promotion)
    directRDCount: 0,         // RDs recruited (for Executive promotion)
    // NEW: Role level system (0=Customer, 1=Ambassador, 2=Senior, 3=RD, 4=Executive)
    role_level: 1,            // Starts as Ambassador
    activated_at: admin.firestore.FieldValue.serverTimestamp(),
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  };

  await db.collection('ambassadors').doc(ambassadorCode).set(ambassadorAccount);
  console.log(`[AMBASSADOR] Account created: ${ambassadorCode}`);

  // Update recruiter statistics for any recruiter code (RD-* or AMB-*)
  if (payment.regional_director) {
    try {
      const recruiterCode = payment.regional_director;
      const recruitmentBonus = 1500; // 10% of 15,000 FCFA signup fee

      if (recruiterCode.startsWith('RD-')) {
        const rdRef = db.collection('regional_directors').doc(recruiterCode);
        const rdDoc = await rdRef.get();

        if (rdDoc.exists) {
          await rdRef.update({
            downline_count: admin.firestore.FieldValue.increment(1),
            team_ambassadors: admin.firestore.FieldValue.increment(1),
            recruitment_bonus_earned: admin.firestore.FieldValue.increment(recruitmentBonus),
            recruitment_bonus_pending: admin.firestore.FieldValue.increment(recruitmentBonus),
            recruitment_count: admin.firestore.FieldValue.increment(1),
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          });

          const rdData = rdDoc.data();
          const recruitmentHistory = rdData.recruitment_history || [];
          recruitmentHistory.push({
            ambassador_code: ambassadorCode,
            ambassador_name: ambassadorData.fullName,
            amount: recruitmentBonus,
            date: new Date().toISOString(),
            status: 'pending'
          });

          await rdRef.update({ recruitment_history: recruitmentHistory });

          await db.collection('admin_notifications').add({
            type: 'rd_recruitment_bonus',
            recruiter_type: 'regional_director',
            rd_code: recruiterCode, // Legacy field kept for dashboard compatibility
            rd_name: rdData.name || 'Unknown',
            ambassador_code: ambassadorCode,
            ambassador_name: ambassadorData.fullName,
            amount: recruitmentBonus,
            status: 'pending',
            created_at: admin.firestore.FieldValue.serverTimestamp()
          });

          if (TELEGRAM_BOT_TOKEN) {
            const rdTotalPending = (rdData.recruitment_bonus_pending || 0) + recruitmentBonus;
            const rdMsg = `💰 RECRUITMENT BONUS (RD)\n\n` +
              `Recruiter: ${recruiterCode}\n` +
              `Name: ${rdData.name || 'Unknown'}\n` +
              `New Ambassador: ${ambassadorCode}\n` +
              `Ambassador Name: ${ambassadorData.fullName}\n` +
              `Bonus: 1,500 FCFA\n\n` +
              `Total Pending: ${rdTotalPending.toLocaleString()} FCFA\n\n` +
              `👉 Admin Dashboard: https://marriageducation.com/admin-dashboard.html`;
            await sendTelegram(rdMsg, false);
          }
        }
      } else if (recruiterCode.startsWith('AMB-')) {
        const ambRef = db.collection('ambassadors').doc(recruiterCode);
        const ambDoc = await ambRef.get();

        if (ambDoc.exists) {
          const ambData = ambDoc.data();
          const currentRecruits = ambData.recruits_count || 0;
          const updatedRecruits = currentRecruits + 1;

          const ambUpdates = {
            recruits_count: admin.firestore.FieldValue.increment(1),
            directAmbassadorCount: admin.firestore.FieldValue.increment(1),
            recruitment_bonus_earned: admin.firestore.FieldValue.increment(recruitmentBonus),
            recruitment_bonus_pending: admin.firestore.FieldValue.increment(recruitmentBonus),
            recruitment_count: admin.firestore.FieldValue.increment(1),
            'deployment_by_category.recruitment': admin.firestore.FieldValue.increment(1),
            'revenue_by_category.recruitment': admin.firestore.FieldValue.increment(recruitmentBonus),
            rdCode: ambData.rdCode || '',
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          };

          // Auto-promotion: Ambassador → Senior at 10 successful ambassador recruits
          if (updatedRecruits >= 10 && ambData.ambassador_type !== 'senior' && ambData.ambassador_type !== 'regional_director') {
            ambUpdates.ambassador_type = 'senior';
            ambUpdates.role_level = Math.max(ambData.role_level || 1, 2);
            ambUpdates.level = ambData.level || 'Senior Ambassador';
            ambUpdates.promotion_date = admin.firestore.FieldValue.serverTimestamp();
          }

          await ambRef.update(ambUpdates);

          const recruitmentHistory = ambData.recruitment_history || [];
          recruitmentHistory.push({
            ambassador_code: ambassadorCode,
            ambassador_name: ambassadorData.fullName,
            amount: recruitmentBonus,
            date: new Date().toISOString(),
            status: 'pending'
          });
          await ambRef.update({ recruitment_history: recruitmentHistory });

          await db.collection('admin_notifications').add({
            type: 'rd_recruitment_bonus',
            recruiter_type: ambData.ambassador_type === 'senior' ? 'senior' : 'ambassador',
            rd_code: recruiterCode, // Legacy field kept for dashboard compatibility
            rd_name: ambData.name || ambData.fullName || 'Unknown',
            ambassador_code: ambassadorCode,
            ambassador_name: ambassadorData.fullName,
            amount: recruitmentBonus,
            status: 'pending',
            created_at: admin.firestore.FieldValue.serverTimestamp()
          });

          if (TELEGRAM_BOT_TOKEN) {
            const ambTotalPending = (ambData.recruitment_bonus_pending || 0) + recruitmentBonus;
            const ambMsg = `💰 RECRUITMENT BONUS (AMBASSADOR)\n\n` +
              `Recruiter: ${recruiterCode}\n` +
              `Name: ${ambData.name || ambData.fullName || 'Unknown'}\n` +
              `New Ambassador: ${ambassadorCode}\n` +
              `Ambassador Name: ${ambassadorData.fullName}\n` +
              `Bonus: 1,500 FCFA\n` +
              `Recruit Count: ${updatedRecruits}\n\n` +
              `Total Pending: ${ambTotalPending.toLocaleString()} FCFA\n\n` +
              `👉 Admin Dashboard: https://marriageducation.com/admin-dashboard.html`;
            await sendTelegram(ambMsg, false);
          }
        }
      }
    } catch (error) {
      console.error('Error updating recruiter stats:', error);
    }
  }

  // Generate book download URL - use simple redirect to avoid SendGrid click tracking issues
  const paymentRef = payment.reference;
  const bookUrl = `https://us-central1-marriage-education.cloudfunctions.net/downloadBook?ref=${paymentRef}`;
  console.log(`[BOOK] Generated simple download URL for ${ambassadorCode}: ${bookUrl}`);
  
  // Send ambassador credentials + book link email via SendGrid
  // Architecture: Firebase → Resend API → Inbox (95%+ delivery rate)
  let emailSent = false;
  let emailError = null;
  try {

    const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString();
    
    const emailContent = {
      to: payment.email,
      from: 'Marriage Education <orders@marriageducation.com>',
      subject: `Account Activated: ${ambassadorCode}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">🎉 Welcome, Ambassador!</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Your account is now active</p>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <p style="font-size: 16px; color: #333;">Dear ${ambassadorData.fullName},</p>
            
            <p style="color: #555;">Congratulations! Your ambassador account has been approved and activated.</p>
            
            <div style="background: #fff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #667eea;">Your Credentials</h3>
              <p style="margin: 5px 0;"><strong>Ambassador Code:</strong> ${ambassadorCode}</p>
              <p style="margin: 5px 0;"><strong>Name:</strong> ${ambassadorData.fullName}</p>
              <p style="margin: 5px 0;"><strong>Email:</strong> ${payment.email}</p>
            </div>
            
            <div style="background: #fff3cd; border: 2px solid #ffc107; border-radius: 5px; padding: 15px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0; font-weight: bold; color: #856404;">⚠️ IMPORTANT: Check Your Spam/Junk Folder</p>
              <p style="margin: 0; font-size: 14px; color: #856404;">If this email arrived in Spam/Junk, please mark it as &quot;Not Junk&quot; or &quot;Not Spam&quot; and move it to your Inbox. This ensures you receive all future important emails from us.</p>
            </div>
            
            <div style="background: #fff; border: 2px solid #00b894; border-radius: 5px; padding: 15px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #00b894;">📚 Your Welcome Book</h3>
              <p style="margin: 5px 0;">Download your exclusive book package (expires ${expiryDate}):</p>
              <div style="text-align: center; margin: 15px 0;">
                <a href="${bookUrl}" style="display: inline-block; background: #00b894; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Download Book</a>
              </div>
              <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-top: 10px;">
                <p style="margin: 5px 0; font-size: 13px; color: #666;"><strong>If button doesn't work, copy this link:</strong></p>
                <p style="margin: 5px 0; font-size: 11px; word-break: break-all; font-family: monospace; color: #333;">${bookUrl}</p>
              </div>
            </div>
            
            <div style="background: #fff; padding: 15px; margin: 20px 0; border-radius: 5px;">
              <h3 style="margin-top: 0; color: #667eea;">🚀 Next Steps</h3>
              <ol style="color: #555; line-height: 1.8;">
                <li>Download and read your book package</li>
                <li>Log in to your <a href="https://marriageducation.com/ambassador-login.html" style="color: #667eea;">Ambassador Dashboard</a></li>
                <li>Get your unique referral link</li>
                <li>Start sharing and earning commissions!</li>
              </ol>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://marriageducation.com/ambassador-login.html" style="display: inline-block; background: #667eea; color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">Login to Dashboard →</a>
            </div>
            
            <p style="color: #777; font-size: 14px; margin-top: 30px;">Questions? Reply to this email or contact <a href="mailto:orders@marriageducation.com" style="color: #667eea;">orders@marriageducation.com</a></p>
          </div>
          
          <div style="background: #333; color: #fff; padding: 20px; text-align: center; font-size: 12px;">
            <p style="margin: 5px 0;">Marriage Education | Sex By Design Academy</p>
            <p style="margin: 5px 0;">Transforming persons, families, and nations</p>
            <p style="margin: 5px 0;"><a href="https://marriageducation.com" style="color: #667eea;">marriageducation.com</a></p>
          </div>
        </div>
      `
    };

    await resend.emails.send(emailContent);
    emailSent = true;
    console.log(`[EMAIL] Ambassador credentials sent to ${payment.email} via Resend`);
  } catch (error) {
    emailError = error.message;
    console.error(`[EMAIL ERROR] Failed to send via Resend:`, error.message);
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
      `📧 Email Status: ${emailStatus}${emailError ? ` (${emailError})` : ''}\n` +
      `🔐 Dashboard: https://marriageducation.com/ambassador-login.html\n\n` +
      `📥 Book Download (expires ${expiryDate}):\n${bookUrl}`;
    
    await sendTelegram(msg, false);
  }
  
  // ── SBD Network Access Provisioning ─────────────────────────────
  // Isolated block — failure here never blocks ambassador activation
  try {
    await provisionSBDAccess(payment.email, ambassadorCode, ambassadorData.fullName);
    console.log(`[SBD] Access provisioned for ${ambassadorCode}`);
  } catch (sbdError) {
    console.error(`[SBD] Provisioning failed (non-critical) for ${ambassadorCode}:`, sbdError.message);
    if (TELEGRAM_BOT_TOKEN) {
      await sendTelegram(
        `⚠️ SBD Network provisioning failed for ${ambassadorCode}\n` +
        `Email: ${payment.email}\n` +
        `Error: ${sbdError.message}\n\n` +
        `Ambassador is active. SBD access needs manual fix.`,
        false
      );
    }
  }

  console.log(`[COMPLETE] Ambassador ${ambassadorCode} activated and notified`);
}

// ── SBD Network Access Provisioner ───────────────────────────────
// Called after ambassador activation. Creates a Firebase Auth account
// on the same project (marriage-education) and writes a users/ doc so
// the ambassador can log into sbd-network.web.app with Foundation tier.
async function provisionSBDAccess(email, ambassadorCode, fullName) {
  const emailLower = email.toLowerCase();

  // Generate a unique SBD referral code derived from the ambassador code
  // e.g. AMB-MAKO-0599 → SBD-MAKO-0599
  const sbdReferralCode = ambassadorCode.replace(/^AMB-/, 'SBD-');

  // 1. Get or create Firebase Auth user
  let uid = null;
  try {
    const existingUser = await admin.auth().getUserByEmail(emailLower);
    uid = existingUser.uid;
    console.log(`[SBD] Found existing Auth user: ${uid}`);
  } catch (notFoundErr) {
    // User doesn't exist yet — create them with a random temp password
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    const tempPassword = Array.from({ length: 14 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join('');

    const userRecord = await admin.auth().createUser({
      email: emailLower,
      password: tempPassword,
      displayName: fullName,
      emailVerified: false,
    });
    uid = userRecord.uid;
    console.log(`[SBD] Created Auth user: ${uid}`);

    // Send password-reset email so ambassador can set their own password
    const resetLink = await admin.auth().generatePasswordResetLink(emailLower);
    // Fire-and-forget — don't await so it can't block provisioning
    sendSBDWelcomeEmail(emailLower, fullName, ambassadorCode, sbdReferralCode, resetLink)
      .catch(e => console.error('[SBD] Welcome email failed:', e.message));
  }

  // 2. Write / merge users doc (SBD Network reads this for tier)
  // Never overwrite an existing admin role
  const existingDoc = await db.collection('users').doc(uid).get();
  const existingRole = existingDoc.exists ? existingDoc.data().role : null;
  if (existingRole !== 'admin') {
    await db.collection('users').doc(uid).set({
      uid,
      name: fullName,
      email: emailLower,
      tier: 'foundation',
      subscription: {
        tier: 'foundation',
        status: 'active',
        source: 'ambassador',
        ambassadorCode,
      },
      role: 'member',
      sbdReferralCode,
      groups: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActive:  admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  // 3. Write sbdReferralCode back onto the ambassadors doc
  await db.collection('ambassadors').doc(ambassadorCode).update({
    sbdReferralCode,
    sbdAccessProvisioned: true,
    sbdUid: uid,
    sbdReferrals: { signups: 0, subscribers: 0 },
  });

  console.log(`[SBD] ${ambassadorCode} → uid:${uid} tier:foundation referral:${sbdReferralCode}`);
}

async function sendSBDWelcomeEmail(email, fullName, ambassadorCode, sbdReferralCode, resetLink) {
  const { Resend } = require('resend');
  const resendClient = new Resend(process.env.RESEND_API_KEY || functions.config().resend?.api_key);
  const referralLink = `https://sbd-network.web.app/auth?ref=${sbdReferralCode}`;

  await resendClient.emails.send({
    to: email,
    from: 'Marriage Education <orders@marriageducation.com>',
    subject: `Your SBD Network access is ready — ${ambassadorCode}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#0D0D0D 0%,#1a1a1a 100%);color:#EAE3D2;padding:30px;text-align:center;">
          <h1 style="margin:0;font-size:26px;">📖 SBD Network Access</h1>
          <p style="margin:10px 0 0;opacity:0.8;">Your ambassador perks just got bigger</p>
        </div>
        <div style="padding:30px;background:#f9f9f9;">
          <p style="font-size:16px;color:#333;">Dear ${fullName},</p>
          <p style="color:#555;">As an active ambassador, you now have <strong>Foundation-tier access</strong> to the SBD Network app — free for life while you're an ambassador.</p>

          <div style="background:#fff;border-left:4px solid #C6A96B;padding:15px;margin:20px 0;">
            <h3 style="margin-top:0;color:#C6A96B;">Your SBD Network Login</h3>
            <p style="margin:5px 0;"><strong>URL:</strong> <a href="https://sbd-network.web.app">sbd-network.web.app</a></p>
            <p style="margin:5px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin:5px 0;"><strong>Password:</strong> Set yours using the button below</p>
          </div>

          <div style="text-align:center;margin:25px 0;">
            <a href="${resetLink}" style="display:inline-block;background:#C6A96B;color:#0D0D0D;font-weight:700;padding:14px 35px;text-decoration:none;border-radius:8px;font-size:15px;">Set My Password →</a>
          </div>

          <div style="background:#fff;border:2px solid #C6A96B;border-radius:8px;padding:15px;margin:20px 0;">
            <h3 style="margin-top:0;color:#C6A96B;">Your SBD Referral Link</h3>
            <p style="margin:5px 0;color:#555;">Share this link to earn credit when people sign up and subscribe:</p>
            <p style="font-family:monospace;font-size:13px;word-break:break-all;background:#f0f0f0;padding:10px;border-radius:5px;">${referralLink}</p>
            <p style="margin:5px 0;font-size:13px;color:#888;"><strong>Your SBD Referral Code:</strong> ${sbdReferralCode}</p>
          </div>

          <p style="color:#777;font-size:13px;">Questions? Contact <a href="mailto:orders@marriageducation.com">orders@marriageducation.com</a></p>
        </div>
      </div>
    `,
  });
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
            <p><strong>Dashboard:</strong> <a href="https://marriageducation.com/ambassador-login.html" style="color: #00b894;">Login Here</a></p>
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

/**
 * Create Stripe PaymentIntent for Ambassador Registration
 * Frontend calls this to get clientSecret for card payment
 */
exports.createAmbassadorCheckout = functions.https.onCall(async (data, context) => {
  try {
    const {
      paymentMethodId,
      email,
      amount,
      currency,
      ambassadorCode,
      ambassadorData,
      description
    } = data;

    if (!paymentMethodId || !email || !amount || !ambassadorCode) {
      throw new Error('Missing required fields: paymentMethodId, email, amount, ambassadorCode');
    }

    const ambassadorMetadata = {
      type: 'ambassador',
      ambassadorCode,
      email,
      phone: ambassadorData?.phone || '',
      fullName: ambassadorData?.fullName || '',
      recruitedBy: ambassadorData?.regional_director_code || ambassadorData?.recruitedBy || '',
      ambassadorData: ambassadorData ? JSON.stringify(ambassadorData) : '{}'
    };

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency: currency || 'usd',
      payment_method: paymentMethodId,
      confirm: true,
      receipt_email: email,
      description: description || `Ambassador Registration - ${ambassadorCode}`,
      metadata: ambassadorMetadata,
      return_url: `https://marriageducation.com/ambassador-dashboard.html?code=${ambassadorCode}`
    });

    console.log('[STRIPE] PaymentIntent created:', paymentIntent.id, 'status:', paymentIntent.status);

    // Auto-activate ambassador immediately on successful payment intent.
    // This keeps activation working even if webhook routing differs by app/domain.
    if (paymentIntent.status === 'succeeded') {
      const paymentForActivation = {
        reference: ambassadorCode,
        ambassador_code: ambassadorCode,
        email,
        phone: ambassadorData?.phone || '',
        regional_director: ambassadorData?.regional_director_code || ambassadorData?.recruitedBy || '',
        ambassador_data: ambassadorData || {
          fullName: 'Ambassador',
          email,
          phone: ambassadorData?.phone || ''
        }
      };

      await db.collection('stripe_payments').doc(ambassadorCode).set({
        reference: ambassadorCode,
        payment_intent_id: paymentIntent.id,
        product_id: 'ambassador-registration',
        product_name: 'Ambassador Registration',
        amount: Math.round(paymentIntent.amount / 100),
        currency: paymentIntent.currency || 'usd',
        email,
        phone: ambassadorData?.phone || '',
        type: 'ambassador',
        payment_method: 'stripe',
        status: 'approved',
        ambassador_code: ambassadorCode,
        regional_director: ambassadorData?.regional_director_code || ambassadorData?.recruitedBy || '',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        approved_at: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      await activateAmbassador(paymentForActivation);

      if (TELEGRAM_BOT_TOKEN) {
        const activationMsg = `✅ AMBASSADOR ACTIVATED (Auto via Stripe)\n\n` +
          `🎯 Code: ${ambassadorCode}\n` +
          `👤 Name: ${paymentForActivation.ambassador_data?.fullName || 'N/A'}\n` +
          `📧 Email: ${email}\n` +
          `💰 Amount: $${(paymentIntent.amount / 100).toFixed(2)} ${(paymentIntent.currency || 'USD').toUpperCase()}\n` +
          `👑 Recruited By: ${paymentForActivation.regional_director || 'None'}\n\n` +
          `🔗 Dashboard: https://marriageducation.com/ambassador-dashboard.html`;
        await sendTelegram(activationMsg, false);
      }
    }

    return {
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status
    };
  } catch (error) {
    console.error('[STRIPE] createAmbassadorCheckout error:', error.message);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

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

  await resend.emails.send(msg);
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

  await resend.emails.send(msg);
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

  await resend.emails.send(msg);
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

  await resend.emails.send(msg);
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

  await resend.emails.send(msg);
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
// ═══════════════════════════════════════════════════════════════════
// SBD NETWORK — PAYMENT CONSTANTS & HELPERS
// ═══════════════════════════════════════════════════════════════════

const SBD_CATALOG_SERVER = {
  // amount = USD cents (Stripe). revenueBaseFCFA = net revenue after 200 FCFA OPEX, used for commission calc.
  'foundation-monthly': { name: 'SBD Network — Foundation',    amount: 900,   mode: 'subscription', tier: 'foundation', revenueBaseFCFA: 5000 },
  'premium-monthly':    { name: 'SBD Network — Premium',       amount: 2000,  mode: 'subscription', tier: 'premium',    revenueBaseFCFA: 5000 },
  'elite-monthly':      { name: 'SBD Network — Elite',         amount: 5000,  mode: 'subscription', tier: 'elite',      revenueBaseFCFA: 5000 },
  'sbd-dummies':        { name: 'Sex By Design for Dummies',   amount: 2700,  mode: 'payment'                          },
  'teleios-blueprint':  { name: 'Teleios Blueprint',           amount: 24700, mode: 'payment'                          },
  'starter-bundle':     { name: 'Starter Bundle',              amount: 3700,  mode: 'payment',       tier: 'premium'   },
  'teleios-bundle':     { name: 'Teleios Bundle',              amount: 29700, mode: 'payment',       tier: 'premium'   },
  'elite-bundle':       { name: 'Elite Formation Bundle',      amount: 49700, mode: 'payment',       tier: 'elite'     },
};

const SBD_UNLOCK_RULES = {
  'foundation-monthly': { tier: 'foundation', months: 1 },
  'premium-monthly':    { tier: 'premium',    months: 1 },
  'elite-monthly':      { tier: 'elite',      months: 1 },
  'sbd-dummies':        { courses: ['sbd-dummies-course'] },
  'teleios-blueprint':  { courses: ['teleios-blueprint'] },
  'starter-bundle':     { courses: ['sbd-dummies-course'],                        tier: 'premium', months: 1 },
  'teleios-bundle':     { courses: ['teleios-blueprint'],                         tier: 'premium', months: 3 },
  'elite-bundle':       { courses: ['sbd-dummies-course', 'teleios-blueprint'],  tier: 'elite',   months: 6 },
};

const SBD_TIER_GROUPS = {
  free:       ['group-sbd-community'],
  foundation: ['group-sbd-community', 'group-teleios-formation', 'group-sbd-dummies'],
  premium:    ['group-sbd-community', 'group-teleios-formation', 'group-sbd-dummies', 'group-sexual-literacy', 'CYUhNHqGvf7bhVIR6D13'],
  elite:      ['group-sbd-community', 'group-teleios-formation', 'group-sbd-dummies', 'group-sexual-literacy', 'CYUhNHqGvf7bhVIR6D13', 'group-marriage-systems', 'group-civilization-leadership', 'z8lmnHLoFUBBZaRp2Vdd', 'advanced-muliebrity-training-school'],
};

async function unlockSbdContent(uid, productId, session) {
  const rule = SBD_UNLOCK_RULES[productId];
  if (!rule) { console.warn(`[SBD] No unlock rule for: ${productId}`); return; }

  const userRef = db.collection('users').doc(uid);

  if (rule.tier) {
    // Recurring subscriptions: endDate = 2099 (Stripe manages billing cancellation).
    // One-time bundles: endDate = now + N months.
    const isRecurring = ['foundation-monthly', 'premium-monthly', 'elite-monthly'].includes(productId);
    const endDate = isRecurring
      ? new Date('2099-12-31')
      : (() => { const d = new Date(); d.setMonth(d.getMonth() + rule.months); return d; })();

    // Drip resume logic: if user had a saved drip position (from prior cancel),
    // offset the dripStartDate backward so their drip continues from where they left off.
    const userSnap = await userRef.get();

    // ── Ambassador commission credit (first subscription only, no double-count on upgrades) ──
    // Direct Ambassador:  10% of revenueBaseFCFA = 500 FCFA
    // Senior Ambassador:   5% of revenueBaseFCFA = 250 FCFA (override on recruits' sales)
    try {
      const userData = userSnap.exists ? userSnap.data() : {};
      const wasAlreadySubscribed = userData.subscription?.status === 'active';
      const referralCode = userData.referredBy || null;
      if (referralCode && !wasAlreadySubscribed) {
        const ambSnap = await db.collection('ambassadors')
          .where('sbdReferralCode', '==', referralCode).limit(1).get();
        if (!ambSnap.empty) {
          const ambDoc  = ambSnap.docs[0];
          const ambData = ambDoc.data();
          const tierKey        = rule.tier; // 'foundation', 'premium', or 'elite'
          const revenueBase    = SBD_CATALOG_SERVER[productId]?.revenueBaseFCFA || 5000;
          const ambCommission  = Math.round(revenueBase * 0.10); // 500 FCFA

          // ── Credit direct ambassador ──
          await ambDoc.ref.update({
            'sbdReferrals.subscribers':         admin.firestore.FieldValue.increment(1),
            [`sbdReferrals.${tierKey}`]:         admin.firestore.FieldValue.increment(1),
            'sbdReferrals.commissionPending':   admin.firestore.FieldValue.increment(ambCommission),
            'sbdReferrals.commissionEarned':    admin.firestore.FieldValue.increment(ambCommission),
          });
          console.log(`[SBD] Ambassador ${ambData.ambassadorCode} +${ambCommission} FCFA commission (tier=${tierKey})`);

          // ── Senior Ambassador override (5%) ──
          let seniorCode       = null;
          let seniorCommission = 0;
          const uplineCode = ambData.regional_director || null;
          if (uplineCode && uplineCode.startsWith('AMB-')) {
            const seniorSnap = await db.collection('ambassadors').doc(uplineCode).get();
            if (seniorSnap.exists) {
              seniorCommission = Math.round(revenueBase * 0.05); // 250 FCFA
              seniorCode       = uplineCode;
              await seniorSnap.ref.update({
                'sbdReferrals.overrideCommissionPending': admin.firestore.FieldValue.increment(seniorCommission),
                'sbdReferrals.overrideCommissionEarned':  admin.firestore.FieldValue.increment(seniorCommission),
                'sbdReferrals.overrideSubscribers':       admin.firestore.FieldValue.increment(1),
              });
              console.log(`[SBD] Senior Ambassador ${uplineCode} +${seniorCommission} FCFA override (tier=${tierKey})`);
            }
          }

          // ── Audit record in sbd_sales ──
          await db.collection('sbd_sales').add({
            ambassadorCode:          ambData.ambassadorCode || null,
            ambassadorName:          ambData.fullName || '',
            sbdReferralCode:         referralCode,
            subscriberUid:           uid,
            productId,
            tier:                    tierKey,
            revenueBaseFCFA:         revenueBase,
            ambassadorCommission:    ambCommission,
            seniorAmbassadorCode:    seniorCode,
            seniorAmbassadorCommission: seniorCommission,
            status:                  'pending',
            createdAt:               admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    } catch (refErr) {
      console.error('[SBD] Ambassador commission credit failed (non-critical):', refErr.message);
    }
    // ────────────────────────────────────────────────────────────────────────────────────────
    const existingDripWeeks = userSnap.exists
      ? (userSnap.data()?.subscription?.dripWeeksUnlocked || 0)
      : 0;
    const dripStartDate = existingDripWeeks > 0
      ? admin.firestore.Timestamp.fromMillis(Date.now() - existingDripWeeks * 7 * 24 * 60 * 60 * 1000)
      : admin.firestore.Timestamp.now();

    const tierUpdate = {
      tier: rule.tier,
      'subscription.tier': rule.tier,
      'subscription.status': 'active',
      'subscription.startDate': admin.firestore.FieldValue.serverTimestamp(),
      'subscription.endDate': admin.firestore.Timestamp.fromDate(endDate),
      'subscription.lastPayment': admin.firestore.FieldValue.serverTimestamp(),
      'subscription.dripStartDate': dripStartDate,
      'subscription.dripWeeksUnlocked': admin.firestore.FieldValue.delete(),
    };
    if (session?.id)           tierUpdate['subscription.stripeSessionId'] = session.id;
    if (session?.customer)     tierUpdate['stripeCustomerId']              = session.customer;
    if (session?.subscription) tierUpdate['stripeSubscriptionId']         = session.subscription;

    await userRef.update(tierUpdate);

    const groups = SBD_TIER_GROUPS[rule.tier] || [];
    if (groups.length > 0) {
      await userRef.update({ groups: admin.firestore.FieldValue.arrayUnion(...groups) });
    }
  }

  if (rule.courses && rule.courses.length > 0) {
    await userRef.update({ ownedCourses: admin.firestore.FieldValue.arrayUnion(...rule.courses) });
  }

  // Audit trail
  await db.collection('orders').add({
    app: 'sbd-network',
    userId: uid,
    productId,
    productName: SBD_CATALOG_SERVER[productId]?.name || productId,
    amount: session?.amount_total ? session.amount_total / 100 : 0,
    currency: session?.currency?.toUpperCase() || 'USD',
    status: 'completed',
    stripeSessionId: session?.id || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`[SBD] Unlocked: uid=${uid} product=${productId}`);
}

/**
 * Create SBD Network Stripe Checkout Session
 * Called from sbd-network app; returns Stripe-hosted checkout URL.
 */
exports.createSbdCheckoutSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in to purchase.');
  }

  const { productId } = data;
  const uid   = context.auth.uid;
  const email = context.auth.token.email || '';

  const product = SBD_CATALOG_SERVER[productId];
  if (!product) {
    throw new functions.https.HttpsError('invalid-argument', `Unknown product: ${productId}`);
  }

  const baseUrl    = 'https://sbd-network.web.app';
  const cancelTier = product.tier || productId.replace('-monthly', '');
  const priceData  = {
    currency: 'usd',
    product_data: { name: product.name },
    unit_amount: product.amount,
    ...(product.mode === 'subscription' ? { recurring: { interval: 'month' } } : {}),
  };

  const session = await stripe.checkout.sessions.create({
    customer_email: email,
    metadata: { app: 'sbd', uid, productId },
    mode: product.mode,
    line_items: [{ price_data: priceData, quantity: 1 }],
    success_url: `${baseUrl}/checkout-success.html?product=${productId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${baseUrl}/payment?tier=${cancelTier}&cancelled=true`,
  });

  console.log(`[SBD Checkout] uid=${uid} product=${productId} session=${session.id}`);
  return { url: session.url };
});

// ═══════════════════════════════════════════════════════════════════

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
    
    // Fallback to Resend if SMTP fails
    if (!emailSent) {
      try {
        await resend.emails.send({
          from: 'ambassadors@marriageducation.com',
          to: 'ambassadors@marriageducation.com',
          replyTo: data.email,
          subject: `🎯 New Ambassador Application - ${data.fullName} (${data.code})`,
          html: emailHtml
        });
        emailSent = true;
        emailMethod = 'Resend';
        console.log('[Ambassador] Email sent via Resend');
      } catch (resendError) {
        console.warn('[Ambassador] Resend failed:', resendError.message);
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

  // Send via Resend
  await resend.emails.send({
    to: recipientEmail,
    from: 'certificates@marriageducation.com',
    subject: `🎉 Your Certificate is Ready - ${courseTitle}`,
    html: emailHtml
  });
}

// ============================================
// MULTI-PRODUCT COMMISSION SYSTEM
// ============================================

/**
 * Process product deployment with universal commission tracking
 */
exports.processProductDeployment = functions.https.onCall(async (data, context) => {
  console.log('🚀 Processing product deployment:', data.product_id);
  
  try {
    // 1. Get product details
    const productDoc = await db.collection('products').doc(data.product_id).get();
    if (!productDoc.exists) {
      throw new functions.https.HttpsError('not-found', `Product not found: ${data.product_id}`);
    }
    
    const product = { id: productDoc.id, ...productDoc.data() };
    console.log(`📦 Product: ${product.name} (${product.category}) - ${product.price.toLocaleString()} FCFA`);
    
    // 2. Get or create customer with attribution
    const customer = await getOrCreateCustomerWithAttribution(
      data.customer_email,
      data.customer_phone,
      data.customer_name,
      data.ref_code
    );
    
    console.log(`👤 Customer: ${customer.name} (${customer.id})`);
    console.log(`🎯 Attribution: AMB=${customer.source_ambassador}, SNR=${customer.source_senior}, RD=${customer.source_rd}`);
    
    // 3. Calculate commissions (10% + 5% + 5% + 6.67% = 26.67%)
    const baseCommission = product.price * (product.commission_rate || 0.10);
    
    // Get Executive sponsor (if exists) by walking up from RD
    let executiveId = null;
    if (customer.source_rd) {
      const rdDoc = await db.collection('regional_directors').doc(customer.source_rd).get();
      if (rdDoc.exists) {
        const rdData = rdDoc.data();
        // Check if RD has a sponsor who is Executive (role_level 4)
        if (rdData.sponsor_code) {
          const executiveDoc = await db.collection('ambassadors').doc(rdData.sponsor_code).get();
          if (executiveDoc.exists && executiveDoc.data().role_level === 4) {
            executiveId = rdData.sponsor_code;
          }
        }
      }
    }
    
    const commissions = {
      total_commission: baseCommission * 2.667, // 26.67% total
      ambassador_amount: baseCommission,       // 10%
      ambassador_id: customer.source_ambassador,
      senior_amount: customer.source_senior ? baseCommission * 0.5 : 0,  // 5%
      senior_id: customer.source_senior,
      rd_amount: customer.source_rd ? baseCommission * 0.5 : 0,  // 5% (SUSTAINABLE MODEL)
      rd_id: customer.source_rd,
      executive_amount: executiveId ? baseCommission * 0.667 : 0,  // 6.67% (SUSTAINABLE MODEL)
      executive_id: executiveId,
      product_category: product.category
    };
    
    console.log('💰 Commission breakdown:', commissions);
    
    // 4. Record sale
    const saleRef = await db.collection('sales').add({
      product_id: product.id,
      product_name: product.name,
      product_category: product.category,
      product_price: product.price,
      customer_id: customer.id,
      customer_email: customer.email,
      customer_name: customer.name,
      source_ambassador: customer.source_ambassador,
      source_senior: customer.source_senior,
      source_rd: customer.source_rd,
      amount_paid: data.amount_paid || product.price,
      payment_id: data.payment_id,
      payment_status: 'completed',
      commissions: {
        total: commissions.total_commission,
        ambassador: commissions.ambassador_amount,
        senior: commissions.senior_amount,
        rd: commissions.rd_amount,
        executive: commissions.executive_amount
      },
      deployment_type: 'access_facilitation',
      earnings_type: 'advocacy_earnings',
      sale_date: admin.firestore.FieldValue.serverTimestamp(),
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`📝 Sale recorded: ${saleRef.id}`);
    
    // 5. Update customer history
    await db.collection('customers').doc(customer.id).update({
      purchase_history: admin.firestore.FieldValue.arrayUnion({
        sale_id: saleRef.id,
        product_id: product.id,
        product_name: product.name,
        category: product.category,
        price: product.price,
        date: new Date().toISOString()
      }),
      total_purchases: admin.firestore.FieldValue.increment(1),
      lifetime_value: admin.firestore.FieldValue.increment(product.price),
      total_commission_ambassador: admin.firestore.FieldValue.increment(commissions.ambassador_amount),
      total_commission_senior: admin.firestore.FieldValue.increment(commissions.senior_amount),
      total_commission_rd: admin.firestore.FieldValue.increment(commissions.rd_amount),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 6. Credit commissions
    await creditCommissionsToUpline(customer, product, commissions, saleRef.id);
    
    // 7. Check monthly targets
    await checkMonthlyTarget(customer.source_ambassador, 'ambassador');
    
    console.log('✅ Deployment processed successfully!');
    
    return {
      success: true,
      sale_id: saleRef.id,
      product: product.name,
      customer_id: customer.id,
      commissions: commissions
    };
    
  } catch (error) {
    console.error('❌ Error processing deployment:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get or create customer with permanent attribution
 */
async function getOrCreateCustomerWithAttribution(email, phone, name, refCode) {
  const existingQuery = await db.collection('customers').where('email', '==', email).limit(1).get();
  
  if (!existingQuery.empty) {
    const customerDoc = existingQuery.docs[0];
    console.log('✅ Existing customer found:', customerDoc.id);
    return { id: customerDoc.id, ...customerDoc.data() };
  }
  
  console.log('🆕 New customer - establishing attribution...');
  
  const attribution = await parseReferralCodeAndGetUpline(refCode);
  
  if (!attribution) {
    throw new Error('Invalid referral code');
  }
  
  const customerData = {
    email: email,
    phone: phone || '',
    name: name,
    source_ambassador: attribution.ambassador_id,
    source_senior: attribution.senior_id || null,
    source_rd: attribution.rd_id || null,
    first_referral_code: refCode,
    first_touch_date: admin.firestore.FieldValue.serverTimestamp(),
    purchase_history: [],
    total_purchases: 0,
    lifetime_value: 0,
    total_commission_ambassador: 0,
    total_commission_senior: 0,
    total_commission_rd: 0,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  };
  
  const customerRef = await db.collection('customers').add(customerData);
  
  console.log('✅ Customer created with attribution:', customerRef.id);
  
  return { id: customerRef.id, ...customerData };
}

/**
 * Parse referral code and get full upline
 */
async function parseReferralCodeAndGetUpline(refCode) {
  if (!refCode) return null;

  const normalizedCode = String(refCode).trim().toUpperCase();
  if (!normalizedCode) return null;

  async function findAmbassadorByCode(code) {
    const directDoc = await db.collection('ambassadors').doc(code).get();
    if (directDoc.exists) {
      return { id: directDoc.id, ...directDoc.data() };
    }

    const codeQuery = await db.collection('ambassadors')
      .where('code', '==', code)
      .limit(1)
      .get();

    if (!codeQuery.empty) {
      return { id: codeQuery.docs[0].id, ...codeQuery.docs[0].data() };
    }

    const sbdQuery = await db.collection('ambassadors')
      .where('sbdReferralCode', '==', code)
      .limit(1)
      .get();

    if (!sbdQuery.empty) {
      return { id: sbdQuery.docs[0].id, ...sbdQuery.docs[0].data() };
    }

    return null;
  }

  async function findRegionalDirectorByCode(code) {
    const directDoc = await db.collection('regional_directors').doc(code).get();
    if (directDoc.exists) {
      return { id: directDoc.id, ...directDoc.data() };
    }

    const codeQuery = await db.collection('regional_directors')
      .where('code', '==', code)
      .limit(1)
      .get();

    if (!codeQuery.empty) {
      return { id: codeQuery.docs[0].id, ...codeQuery.docs[0].data() };
    }

    const rdCodeQuery = await db.collection('regional_directors')
      .where('rd_code', '==', code)
      .limit(1)
      .get();

    if (!rdCodeQuery.empty) {
      return { id: rdCodeQuery.docs[0].id, ...rdCodeQuery.docs[0].data() };
    }

    return null;
  }

  async function buildAmbassadorAttribution(ambassadorRecord) {
    let seniorId = ambassadorRecord.senior_code || ambassadorRecord.recruited_by_senior || null;
    let rdId = ambassadorRecord.recruited_by_rd || null;
    const recruiterCode = ambassadorRecord.rdCode || null;

    if (!seniorId && recruiterCode && recruiterCode.startsWith('AMB-')) {
      seniorId = recruiterCode;
    }

    if (!rdId && recruiterCode && recruiterCode.startsWith('RD-')) {
      rdId = recruiterCode;
    }

    if (!rdId && seniorId) {
      const seniorDoc = await db.collection('ambassadors').doc(seniorId).get();
      if (seniorDoc.exists) {
        const seniorData = seniorDoc.data();
        rdId = seniorData.recruited_by_rd
          || (seniorData.rdCode && seniorData.rdCode.startsWith('RD-') ? seniorData.rdCode : null)
          || null;
      }
    }

    return {
      ambassador_id: ambassadorRecord.id,
      senior_id: seniorId,
      rd_id: rdId
    };
  }

  if (normalizedCode.startsWith('RD-')) {
    const regionalDirector = await findRegionalDirectorByCode(normalizedCode);
    if (!regionalDirector) return null;

    return {
      ambassador_id: null,
      senior_id: null,
      rd_id: regionalDirector.id
    };
  }

  const ambassadorCode = normalizedCode.startsWith('SNR-')
    ? normalizedCode.replace(/^SNR-/, 'AMB-')
    : normalizedCode;

  const ambassadorRecord = await findAmbassadorByCode(ambassadorCode);
  if (!ambassadorRecord) return null;

  return buildAmbassadorAttribution(ambassadorRecord);

  return null;
}

/**
 * Credit commissions to all levels instantly
 */
async function creditCommissionsToUpline(customer, product, commissions, saleId) {
  const batch = db.batch();
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // 1. Credit Ambassador (10%)
  if (commissions.ambassador_id) {
    const ambassadorRef = db.collection('ambassadors').doc(commissions.ambassador_id);
    
    batch.update(ambassadorRef, {
      commissionEarned: admin.firestore.FieldValue.increment(commissions.ambassador_amount),
      [`deployment_by_category.${product.category}`]: admin.firestore.FieldValue.increment(1),
      [`revenue_by_category.${product.category}`]: admin.firestore.FieldValue.increment(commissions.ambassador_amount),
      [`monthly_earnings.${monthKey}.total`]: admin.firestore.FieldValue.increment(commissions.ambassador_amount),
      [`monthly_earnings.${monthKey}.${product.category}`]: admin.firestore.FieldValue.increment(commissions.ambassador_amount),
      access_units_deployed: admin.firestore.FieldValue.increment(1),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Credited ambassador: ${commissions.ambassador_amount.toLocaleString()} FCFA`);
  }
  
  // 2. Credit Senior (5%)
  if (commissions.senior_id) {
    const seniorRef = db.collection('ambassadors').doc(commissions.senior_id);
    
    batch.update(seniorRef, {
      commissionEarned: admin.firestore.FieldValue.increment(commissions.senior_amount),
      team_override_earned: admin.firestore.FieldValue.increment(commissions.senior_amount),
      [`team_revenue_by_category.${product.category}`]: admin.firestore.FieldValue.increment(commissions.senior_amount),
      [`monthly_earnings.${monthKey}.total`]: admin.firestore.FieldValue.increment(commissions.senior_amount),
      [`monthly_earnings.${monthKey}.team_override`]: admin.firestore.FieldValue.increment(commissions.senior_amount),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Credited senior: ${commissions.senior_amount.toLocaleString()} FCFA (override)`);
  }
  
  // 3. Credit RD (3%)
  if (commissions.rd_id) {
    const rdRef = db.collection('regional_directors').doc(commissions.rd_id);
    
    batch.update(rdRef, {
      totalCommissionEarned: admin.firestore.FieldValue.increment(commissions.rd_amount),
      network_override_earned: admin.firestore.FieldValue.increment(commissions.rd_amount),
      [`network_deployment_by_category.${product.category}`]: admin.firestore.FieldValue.increment(1),
      [`network_revenue_by_category.${product.category}`]: admin.firestore.FieldValue.increment(commissions.rd_amount),
      [`monthly_earnings.${monthKey}.total`]: admin.firestore.FieldValue.increment(commissions.rd_amount),
      [`monthly_earnings.${monthKey}.network_override`]: admin.firestore.FieldValue.increment(commissions.rd_amount),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Credited RD: ${commissions.rd_amount.toLocaleString()} FCFA (5% override)`);
  }
  
  // 4. Credit Executive (6.67%)
  if (commissions.executive_id) {
    const executiveRef = db.collection('ambassadors').doc(commissions.executive_id);
    
    batch.update(executiveRef, {
      commissionEarned: admin.firestore.FieldValue.increment(commissions.executive_amount),
      executive_override_earned: admin.firestore.FieldValue.increment(commissions.executive_amount),
      [`executive_revenue_by_category.${product.category}`]: admin.firestore.FieldValue.increment(commissions.executive_amount),
      [`monthly_earnings.${monthKey}.total`]: admin.firestore.FieldValue.increment(commissions.executive_amount),
      [`monthly_earnings.${monthKey}.executive_override`]: admin.firestore.FieldValue.increment(commissions.executive_amount),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Credited Executive: ${commissions.executive_amount.toLocaleString()} FCFA (6.67% override)`);
  }
  
  // 5. Update volume tracking
  await updateVolumeTracking(customer, product.price);
  
  await batch.commit();
  console.log('✅ All commissions credited instantly');
}

/**
 * Update volume tracking for personal, team, and network sales
 */
async function updateVolumeTracking(customer, saleAmount) {
  try {
    // 1. Update Personal Volume (direct seller)
    if (customer.source_ambassador) {
      await db.collection('ambassadors').doc(customer.source_ambassador).update({
        personalVolume: admin.firestore.FieldValue.increment(saleAmount)
      });
      console.log(`📊 Updated personalVolume for ${customer.source_ambassador}: +${saleAmount} FCFA`);
    }
    
    // 2. Update Team Volume (senior's direct recruits)
    if (customer.source_senior) {
      await db.collection('ambassadors').doc(customer.source_senior).update({
        teamVolume: admin.firestore.FieldValue.increment(saleAmount)
      });
      console.log(`📊 Updated teamVolume for ${customer.source_senior}: +${saleAmount} FCFA`);
    }
    
    // 3. Update Network Volume (RD's entire network)
    if (customer.source_rd) {
      await db.collection('regional_directors').doc(customer.source_rd).update({
        networkVolume: admin.firestore.FieldValue.increment(saleAmount)
      });
      console.log(`📊 Updated networkVolume for ${customer.source_rd}: +${saleAmount} FCFA`);
    }
    
    // 4. Update Executive's network volume (if exists)
    if (customer.source_rd) {
      const rdDoc = await db.collection('regional_directors').doc(customer.source_rd).get();
      if (rdDoc.exists) {
        const rdData = rdDoc.data();
        if (rdData.sponsor_code) {
          const executiveDoc = await db.collection('ambassadors').doc(rdData.sponsor_code).get();
          if (executiveDoc.exists && executiveDoc.data().role_level === 4) {
            await db.collection('ambassadors').doc(rdData.sponsor_code).update({
              networkVolume: admin.firestore.FieldValue.increment(saleAmount)
            });
            console.log(`📊 Updated Executive networkVolume for ${rdData.sponsor_code}: +${saleAmount} FCFA`);
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Error updating volume tracking:', error);
  }
}

/**
 * Check if monthly target hit ($3,000 USD / 1,800,000 FCFA)
 */
async function checkMonthlyTarget(userId, userType) {
  const TARGET = 1800000; // 1.8M FCFA = $3K USD
  
  if (!userId) return;
  
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const collection = userType === 'ambassador' ? 'ambassadors' : 'regional_directors';
  const userDoc = await db.collection(collection).doc(userId).get();
  
  if (!userDoc.exists) return;
  
  const user = userDoc.data();
  const monthlyEarnings = user.monthly_earnings?.[monthKey]?.total || 0;
  
  if (monthlyEarnings >= TARGET) {
    console.log(`🎉 ${userType.toUpperCase()} HIT $3K TARGET! ${monthlyEarnings.toLocaleString()} FCFA`);
    
    // Send celebration notification via Telegram
    const msg = `🎉 $3,000 TARGET HIT!\n\n` +
      `${user.name || userId} (${user.code || userId}) earned ${monthlyEarnings.toLocaleString()} FCFA this month!\n\n` +
      `Target: 1,800,000 FCFA ✅\n` +
      `Achievement: ${((monthlyEarnings / TARGET) * 100).toFixed(1)}% of target`;
    
    await sendTelegram(msg, false);
  }
}

// ============================================
// PROMOTION ENGINE (Senior Ambassador System)
// ============================================

/**
 * Check if ambassador qualifies for promotion to senior
 * Callable function - can be triggered manually or by schedule
 */
exports.checkAmbassadorPromotion = functions.https.onCall(async (data, context) => {
  try {
    const { ambassador_code } = data;
    
    if (!ambassador_code) {
      throw new functions.https.HttpsError('invalid-argument', 'Ambassador code required');
    }
    
    const ambassadorRef = db.collection('ambassadors').doc(ambassador_code);
    const ambassadorSnap = await ambassadorRef.get();
    
    if (!ambassadorSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Ambassador not found');
    }
    
    const ambassador = ambassadorSnap.data();
    
    // Skip if already senior
    if (ambassador.ambassador_type === 'senior') {
      return { eligible: false, reason: 'already_senior' };
    }
    
    // Check criteria - ONLY recruits count (no units threshold)
    const recruitsCount = ambassador.recruits_count || 0;
    
    const meetsRecruitsThreshold = recruitsCount >= 10;
    
    if (meetsRecruitsThreshold) {
      // Promote to senior
      await promoteToSenior(ambassador_code, 'recruits_threshold', ambassador);
      
      return {
        success: true,
        eligible: true,
        reason: 'recruits_threshold',
        data: { recruitsCount }
      };
    }
    
    return {
      eligible: false,
      reason: 'threshold_not_met',
      data: { recruitsCount, recruitsNeeded: 10 - recruitsCount }
    };
    
  } catch (error) {
    console.error('Error checking promotion:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Firestore Trigger: Auto-check promotion when ambassador data changes
 */
exports.onAmbassadorUpdate = functions.firestore
  .document('ambassadors/{ambassadorCode}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const ambassadorCode = context.params.ambassadorCode;
    
    // Skip if already senior
    if (after.ambassador_type === 'senior') {
      return null;
    }
    
    // Check if recruits changed (ONLY criteria for promotion)
    const recruitsChanged = (after.recruits_count || 0) !== (before.recruits_count || 0);
    
    if (!recruitsChanged) {
      return null;
    }
    
    console.log(`📊 ${ambassadorCode} recruits changed, checking promotion eligibility...`);
    
    const recruitsCount = after.recruits_count || 0;
    const meetsRecruitsThreshold = recruitsCount >= 10;
    
    if (meetsRecruitsThreshold) {
      console.log(`🎯 ${ambassadorCode} is eligible for promotion! (${recruitsCount} recruits)`);
      await promoteToSenior(ambassadorCode, 'recruits_threshold', after);
    } else {
      console.log(`⏳ ${ambassadorCode} not yet eligible: ${recruitsCount}/10 recruits`);
    }
    
    return null;
  });

/**
 * Firestore Trigger: Update recruiter stats when new ambassador registered
 */
exports.onNewAmbassadorCreated = functions.firestore
  .document('ambassadors/{ambassadorCode}')
  .onCreate(async (snap, context) => {
    const newAmbassador = snap.data();
    const seniorCode = newAmbassador.senior_code;
    
    if (!seniorCode) {
      console.log('No senior_code found for new ambassador');
      return null;
    }
    
    console.log(`👥 New ambassador ${context.params.ambassadorCode} recruited by ${seniorCode}`);
    
    // Increment recruits_count for the senior
    const seniorRef = db.collection('ambassadors').doc(seniorCode);
    const seniorSnap = await seniorRef.get();
    
    if (!seniorSnap.exists) {
      console.log(`Senior ${seniorCode} not found`);
      return null;
    }
    
    await seniorRef.update({
      recruits_count: admin.firestore.FieldValue.increment(1),
      team_count: admin.firestore.FieldValue.increment(1),
      directAmbassadorCount: admin.firestore.FieldValue.increment(1),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Also update in senior_ambassadors if exists
    const seniorAmbRef = db.collection('senior_ambassadors').doc(seniorCode);
    const seniorAmbSnap = await seniorAmbRef.get();
    if (seniorAmbSnap.exists) {
      await seniorAmbRef.update({
        team_count: admin.firestore.FieldValue.increment(1)
      });
    }
    
    console.log(`✅ Updated recruits count for ${seniorCode}`);
    
    // Send notification to senior about new team member
    await db.collection('notifications').add({
      type: 'new_recruit',
      title: '👥 New Team Member!',
      message: `${newAmbassador.fullName} just joined your team!`,
      ambassador_code: seniorCode,
      read: false,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return null;
  });

/**
 * Promote ambassador to senior status
 */
async function promoteToSenior(ambassadorCode, reason, ambassadorData) {
  try {
    console.log(`🎉 Promoting ${ambassadorCode} to Senior Ambassador (reason: ${reason})`);
    
    const ambassadorRef = db.collection('ambassadors').doc(ambassadorCode);
    
    // Fetch full current ambassador data if not provided
    let fullAmbassadorData = ambassadorData;
    if (!ambassadorData || !ambassadorData.email) {
      const ambassadorSnap = await ambassadorRef.get();
      if (ambassadorSnap.exists) {
        fullAmbassadorData = ambassadorSnap.data();
      }
    }
    
    const batch = db.batch();
    
    // 1. Update ambassador record
    batch.update(ambassadorRef, {
      ambassador_type: 'senior',
      role_level: 2, // Level 2 = Senior Ambassador
      promotion_date: admin.firestore.FieldValue.serverTimestamp(),
      promotion_reason: reason,
      promoted_at: new Date().toISOString(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 2. Create senior_ambassadors record (for easier querying)
    const seniorRef = db.collection('senior_ambassadors').doc(ambassadorCode);
    batch.set(seniorRef, {
      ...fullAmbassadorData,
      ambassador_type: 'senior',
      promotion_date: admin.firestore.FieldValue.serverTimestamp(),
      promotion_reason: reason,
      team_count: 0,
      team_override_earned: 0,
      seniors_recruited: 0, // Track for RD promotion later
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 3. Update recruiter's senior count if they have one
    if (fullAmbassadorData.recruited_by || fullAmbassadorData.senior_code) {
      const recruiterCode = fullAmbassadorData.recruited_by || fullAmbassadorData.senior_code;
      const recruiterRef = db.collection('ambassadors').doc(recruiterCode);
      const recruiterSnap = await recruiterRef.get();
      
      if (recruiterSnap.exists) {
        const recruiterData = recruiterSnap.data();
        
        // Increment directSeniorCount for promotion tracking
        batch.update(recruiterRef, {
          seniors_recruited: admin.firestore.FieldValue.increment(1),
          directSeniorCount: admin.firestore.FieldValue.increment(1)
        });
        
        // Also update in senior_ambassadors collection if recruiter is senior
        if (recruiterData.ambassador_type === 'senior') {
          batch.update(db.collection('senior_ambassadors').doc(recruiterCode), {
            seniors_recruited: admin.firestore.FieldValue.increment(1),
            directSeniorCount: admin.firestore.FieldValue.increment(1)
          });
        }
      }
    }
    
    // 4. Create promotion notification
    const notificationRef = db.collection('notifications').doc();
    batch.set(notificationRef, {
      type: 'promotion',
      title: '🎉 Congratulations! You\'re now a Senior Ambassador!',
      message: `You've been promoted to Senior Ambassador for recruiting 10 ambassadors! You can now earn 5% override commissions on your team's sales. Target: $18,000/month with an active team.`,
      ambassador_code: ambassadorCode,
      read: false,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    await batch.commit();
    
    console.log(`✅ ${ambassadorCode} promoted to Senior Ambassador successfully`);
    
    // Send email notification to promoted ambassador
    if (fullAmbassadorData.email && transporter) {
      try {
        await transporter.sendMail({
          from: SMTP_CONFIG.from,
          to: fullAmbassadorData.email,
          subject: '🎉 You\'ve Been Promoted to Senior Ambassador!',
          html: `
            <h2>🎉 Congratulations, ${fullAmbassadorData.fullName || fullAmbassadorData.firstName}!</h2>
            <p>You've been promoted to <strong>Senior Ambassador</strong> for recruiting 10 ambassadors!</p>
            
            <h3>What This Means:</h3>
            <ul>
              <li>✅ You can now <strong>build your own team</strong></li>
              <li>✅ Earn <strong>5% override commissions</strong> on all team sales</li>
              <li>✅ Access the <strong>Senior Dashboard</strong> with team management tools</li>
              <li>✅ Target: <strong>$18,000/month</strong> with a team of 10 active ambassadors</li>
            </ul>
            
            <h3>Your Stats:</h3>
            <ul>
              <li>Units Deployed: ${fullAmbassadorData.units_deployed || 0}</li>
              <li>Team Recruited: ${fullAmbassadorData.recruits_count || 0}</li>
            </ul>
            
            <h3>Next Steps:</h3>
            <ol>
              <li>Login to your dashboard: <a href="https://marriageducation.com/ambassador-login.html">Ambassador Login</a></li>
              <li>Access your Senior Dashboard to see team management tools</li>
              <li>Share your recruitment link: <br><code>https://marriageducation.com/ambassador-register.html?senior=${ambassadorCode}</code></li>
              <li>Start building your team and earning override commissions!</li>
            </ol>
            
            <p><strong>Your team override earnings will show on your dashboard.</strong></p>
            
            <p>Questions? Reply to this email.</p>
            
            <p>Best regards,<br>Marriage Education Team</p>
          `
        });
        console.log(`📧 Promotion email sent to ${fullAmbassadorData.email}`);
      } catch (emailError) {
        console.error('Failed to send promotion email:', emailError);
      }
    }
    
    // Send Telegram notification
    if (TELEGRAM_BOT_TOKEN) {
      const msg = `🎉 SENIOR AMBASSADOR PROMOTION!\n\n` +
        `Ambassador: ${ambassadorCode}\n` +
        `Name: ${fullAmbassadorData.fullName || 'Unknown'}\n` +
        `Reason: Recruited 10 Ambassadors\n` +
        `Team Size: ${fullAmbassadorData.recruits_count || 0}\n\n` +
        `They can now earn 5% team override commissions!\n` +
        `Target: $18K/month with active team.`;
      
      await sendTelegram(msg, false);
    }
    
    return {
      success: true,
      ambassadorCode: ambassadorCode,
      newStatus: 'senior',
      reason: reason
    };
    
  } catch (error) {
    console.error(`❌ Error promoting ${ambassadorCode}:`, error);
    throw error;
  }
}

// ============================================
// REGIONAL DIRECTOR PROMOTION SYSTEM
// ============================================

/**
 * Check if senior ambassador qualifies for RD promotion
 * Callable function
 */
exports.checkRDPromotion = functions.https.onCall(async (data, context) => {
  try {
    const { ambassador_code } = data;
    
    if (!ambassador_code) {
      throw new functions.https.HttpsError('invalid-argument', 'Ambassador code required');
    }
    
    const ambassadorRef = db.collection('ambassadors').doc(ambassador_code);
    const ambassadorSnap = await ambassadorRef.get();
    
    if (!ambassadorSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Ambassador not found');
    }
    
    const ambassador = ambassadorSnap.data();
    
    // Must be senior first
    if (ambassador.ambassador_type !== 'senior') {
      return { eligible: false, reason: 'not_senior' };
    }
    
    // Check RD criteria: 50 seniors recruited
    const seniorsRecruited = ambassador.seniors_recruited || 0;
    const meetsRDThreshold = seniorsRecruited >= 50;
    
    if (meetsRDThreshold) {
      // Promote to RD
      await promoteToRD(ambassador_code, ambassador);
      
      return {
        success: true,
        eligible: true,
        reason: 'rd_threshold',
        data: { seniorsRecruited }
      };
    }
    
    return {
      eligible: false,
      reason: 'threshold_not_met',
      data: { seniorsRecruited, seniorsNeeded: 50 - seniorsRecruited }
    };
    
  } catch (error) {
    console.error('Error checking RD promotion:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Firestore Trigger: Auto-check RD promotion when senior recruits seniors
 */
exports.onSeniorUpdate = functions.firestore
  .document('ambassadors/{ambassadorCode}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const ambassadorCode = context.params.ambassadorCode;
    
    // Only check if they're already a senior
    if (after.ambassador_type !== 'senior') {
      return null;
    }
    
    // Check if seniors_recruited changed
    const seniorsChanged = (after.seniors_recruited || 0) !== (before.seniors_recruited || 0);
    
    if (!seniorsChanged) {
      return null;
    }
    
    console.log(`📊 ${ambassadorCode} seniors count changed, checking RD eligibility...`);
    
    const seniorsRecruited = after.seniors_recruited || 0;
    const meetsRDThreshold = seniorsRecruited >= 50;
    
    if (meetsRDThreshold) {
      console.log(`👑 ${ambassadorCode} is eligible for RD promotion! (${seniorsRecruited} seniors)`);
      await promoteToRD(ambassadorCode, after);
    } else {
      console.log(`⏳ ${ambassadorCode} not yet eligible: ${seniorsRecruited}/50 seniors`);
    }
    
    return null;
  });

/**
 * Promote senior ambassador to Regional Director
 */
async function promoteToRD(ambassadorCode, ambassadorData) {
  try {
    console.log(`👑 Promoting ${ambassadorCode} to Regional Director`);
    
    const ambassadorRef = db.collection('ambassadors').doc(ambassadorCode);
    
    // Fetch full current data if not provided
    let fullAmbassadorData = ambassadorData;
    if (!ambassadorData || !ambassadorData.email) {
      const ambassadorSnap = await ambassadorRef.get();
      if (ambassadorSnap.exists) {
        fullAmbassadorData = ambassadorSnap.data();
      }
    }
    
    const batch = db.batch();
    
    // 1. Update ambassador record
    batch.update(ambassadorRef, {
      ambassador_type: 'regional_director',
      role_level: 3, // Level 3 = Regional Director
      rd_promotion_date: admin.firestore.FieldValue.serverTimestamp(),
      promoted_to_rd_at: new Date().toISOString(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 2. Create/update regional_directors record
    const rdCode = ambassadorCode.replace('AMB-', 'RD-');
    const rdRef = db.collection('regional_directors').doc(rdCode);
    batch.set(rdRef, {
      ...fullAmbassadorData,
      code: rdCode,
      rd_code: rdCode,
      ambassador_code: ambassadorCode,
      ambassador_type: 'regional_director',
      promotion_date: admin.firestore.FieldValue.serverTimestamp(),
      network_size: fullAmbassadorData.seniors_recruited || 50,
      network_ambassadors: 0, // Will be calculated from team
      network_override_earned: 0,
      monthly_network_earnings: 0,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 3. Create promotion notification
    const notificationRef = db.collection('notifications').doc();
    batch.set(notificationRef, {
      type: 'rd_promotion',
      title: '👑 Congratulations! You\'re now a Regional Director!',
      message: `You've been promoted to Regional Director for recruiting 50 senior ambassadors! You can now earn 3% network override on 500+ ambassadors. Target: $450K-$750K/month.`,
      ambassador_code: ambassadorCode,
      read: false,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    await batch.commit();
    
    console.log(`✅ ${ambassadorCode} promoted to Regional Director successfully`);
    
    // Send email notification
    if (fullAmbassadorData.email && transporter) {
      try {
        await transporter.sendMail({
          from: SMTP_CONFIG.from,
          to: fullAmbassadorData.email,
          subject: '👑 You\'ve Been Promoted to Regional Director!',
          html: `
            <h2>👑 Congratulations, ${fullAmbassadorData.fullName || fullAmbassadorData.firstName}!</h2>
            <p>You've been promoted to <strong>Regional Director</strong> for recruiting 50 senior ambassadors!</p>
            
            <h3>What This Means:</h3>
            <ul>
              <li>✅ Manage a <strong>network of 50 seniors × ~10 ambassadors = 500 total</strong></li>
              <li>✅ Earn <strong>3% network override</strong> on all network sales</li>
              <li>✅ Access the <strong>RD Dashboard</strong> with network management tools</li>
              <li>✅ Target: <strong>$450K-$750K/month</strong> with active network</li>
            </ul>
            
            <h3>Your Network:</h3>
            <ul>
              <li>Senior Ambassadors: ${fullAmbassadorData.seniors_recruited || 0}</li>
              <li>Total Network: ~${(fullAmbassadorData.seniors_recruited || 0) * 10} ambassadors</li>
            </ul>
            
            <h3>Next Steps:</h3>
            <ol>
              <li>Login to your dashboard: <a href="https://marriageducation.com/ambassador-login.html">Ambassador Login</a></li>
              <li>Access your Regional Director Dashboard</li>
              <li>Monitor network performance and senior development</li>
              <li>Your network override earnings will show on your dashboard</li>
            </ol>
            
            <p><strong>Your RD Code: ${rdCode}</strong></p>
            
            <p>Questions? Reply to this email.</p>
            
            <p>Best regards,<br>Marriage Education Team</p>
          `
        });
        console.log(`📧 RD promotion email sent to ${fullAmbassadorData.email}`);
      } catch (emailError) {
        console.error('Failed to send RD promotion email:', emailError);
      }
    }
    
    // Send Telegram notification
    if (TELEGRAM_BOT_TOKEN) {
      const msg = `👑 REGIONAL DIRECTOR PROMOTION!\n\n` +
        `Ambassador: ${ambassadorCode}\n` +
        `Name: ${fullAmbassadorData.fullName || 'Unknown'}\n` +
        `Seniors Recruited: ${fullAmbassadorData.seniors_recruited || 0}\n` +
        `Network Size: ~${(fullAmbassadorData.seniors_recruited || 0) * 10} ambassadors\n\n` +
        `RD Code: ${rdCode}\n` +
        `Target: $450K-$750K/month network override!`;
      
      await sendTelegram(msg, false);
    }
    
    return {
      success: true,
      ambassadorCode: ambassadorCode,
      rdCode: rdCode,
      newStatus: 'regional_director'
    };
    
  } catch (error) {
    console.error(`❌ Error promoting ${ambassadorCode} to RD:`, error);
    throw error;
  }
}

/**
 * Firestore Trigger: Track when RD is created and check sponsor for Executive promotion
 */
exports.onRDPromoted = functions.firestore
  .document('regional_directors/{rdCode}')
  .onCreate(async (snap, context) => {
    const rdData = snap.data();
    const sponsorCode = rdData.senior_code || rdData.recruited_by;
    
    if (!sponsorCode) {
      console.log('No sponsor found for new RD');
      return null;
    }
    
    console.log(`👑 New RD promoted, checking sponsor ${sponsorCode} for Executive eligibility`);
    
    // Increment sponsor's directRDCount
    const sponsorRef = db.collection('ambassadors').doc(sponsorCode);
    const sponsorSnap = await sponsorRef.get();
    
    if (!sponsorSnap.exists) {
      console.log(`Sponsor ${sponsorCode} not found`);
      return null;
    }
    
    await sponsorRef.update({
      directRDCount: admin.firestore.FieldValue.increment(1),
      rds_recruited: admin.firestore.FieldValue.increment(1),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Updated directRDCount for ${sponsorCode}`);
    
    // Check if sponsor eligible for Executive promotion
    const sponsorData = sponsorSnap.data();
    const directRDCount = (sponsorData.directRDCount || 0) + 1;
    
    if (directRDCount >= 1 && sponsorData.ambassador_type === 'regional_director') {
      console.log(`🏆 ${sponsorCode} is eligible for Executive promotion!`);
      await promoteToExecutive(sponsorCode, sponsorData);
    }
    
    return null;
  });

// ============================================
// EXECUTIVE NETWORK DIRECTOR PROMOTION SYSTEM
// ============================================

/**
 * Check if RD qualifies for Executive promotion
 * Callable function
 */
exports.checkExecutivePromotion = functions.https.onCall(async (data, context) => {
  try {
    const { ambassador_code } = data;
    
    if (!ambassador_code) {
      throw new functions.https.HttpsError('invalid-argument', 'Ambassador code required');
    }
    
    const ambassadorRef = db.collection('ambassadors').doc(ambassador_code);
   const ambassadorSnap = await ambassadorRef.get();
    
    if (!ambassadorSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Ambassador not found');
    }
    
    const ambassador = ambassadorSnap.data();
    
    // Must be RD first
    if (ambassador.ambassador_type !== 'regional_director') {
      return { eligible: false, reason: 'not_rd' };
    }
    
    // Check Executive criteria: 1+ RDs recruited
    const rdsRecruited = ambassador.directRDCount || ambassador.rds_recruited || 0;
    const meetsExecutiveThreshold = rdsRecruited >= 1;
    
    if (meetsExecutiveThreshold) {
      // Promote to Executive
      await promoteToExecutive(ambassador_code, ambassador);
      
      return {
        success: true,
        eligible: true,
        reason: 'executive_threshold',
        data: { rdsRecruited }
      };
    }
    
    return {
      eligible: false,
      reason: 'threshold_not_met',
      data: { rdsRecruited, rdsNeeded: 1 - rdsRecruited }
    };
    
  } catch (error) {
    console.error('Error checking Executive promotion:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Promote Regional Director to Executive Network Director
 */
async function promoteToExecutive(ambassadorCode, ambassadorData) {
  try {
    console.log(`🏆 Promoting ${ambassadorCode} to Executive Network Director`);
    
    const ambassadorRef = db.collection('ambassadors').doc(ambassadorCode);
    
    // Fetch full current data if not provided
    let fullAmbassadorData = ambassadorData;
    if (!ambassadorData || !ambassadorData.email) {
      const ambassadorSnap = await ambassadorRef.get();
      if (ambassadorSnap.exists) {
        fullAmbassadorData = ambassadorSnap.data();
      }
    }
    
    const batch = db.batch();
    
    // 1. Update ambassador record
    batch.update(ambassadorRef, {
      ambassador_type: 'executive',
      role_level: 4, // Level 4 = Executive Network Director
      executive_promotion_date: admin.firestore.FieldValue.serverTimestamp(),
      promoted_to_executive_at: new Date().toISOString(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 2. Update regional_directors record
    const rdCode = ambassadorCode.replace('AMB-', 'RD-');
    const rdRef = db.collection('regional_directors').doc(rdCode);
    batch.update(rdRef, {
      ambassador_type: 'executive',
      role_level: 4,
      executive_promotion_date: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 3. Create promotion notification
    const notificationRef = db.collection('notifications').doc();
    batch.set(notificationRef, {
      type: 'executive_promotion',
      title: '🏆 Congratulations! You\'re now an Executive Network Director!',
      message: `You've been promoted to Executive Network Director for recruiting 1+ Regional Directors! You can now earn 9% executive override on your entire network. Target: $1M+/month.`,
      ambassador_code: ambassadorCode,
      read: false,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    await batch.commit();
    
    console.log(`✅ ${ambassadorCode} promoted to Executive Network Director successfully`);
    
    // Send email notification
    if (fullAmbassadorData.email && transporter) {
      try {
        await transporter.sendMail({
          from: SMTP_CONFIG.from,
          to: fullAmbassadorData.email,
          subject: '🏆 You\'ve Been Promoted to Executive Network Director!',
          html: `
            <h2>🏆 Congratulations, ${fullAmbassadorData.fullName || fullAmbassadorData.firstName}!</h2>
            <p>You've been promoted to <strong>Executive Network Director</strong> - the HIGHEST tier in our organization!</p>
            
            <h3>What This Means:</h3>
            <ul>
              <li>✅ <strong>TOP TIER LEADERSHIP</strong> - Elite status in the organization</li>
              <li>✅ Earn <strong>9% executive override (7% + 2% leadership bonus)</strong> on entire network</li>
              <li>✅ Manage multiple Regional Directors and their networks</li>
              <li>✅ Access the <strong>Executive Dashboard</strong> with advanced analytics</li>
              <li>✅ Target: <strong>$1M-$1.5M+/month</strong> with active network</li>
            </ul>
            
            <h3>Your Network:</h3>
            <ul>
              <li>Regional Directors Recruited: ${fullAmbassadorData.directRDCount || fullAmbassadorData.rds_recruited || 1}+</li>
              <li>Total Network: 1,000+ ambassadors across multiple RD territories</li>
              <li>Commission Structure: 10% + 5% + 3% + 9% = 27% total payout</li>
            </ul>
            
            <h3>Next Steps:</h3>
            <ol>
              <li>Login to your dashboard: <a href="https://marriageducation.com/ambassador-login.html">Ambassador Login</a></li>
              <li>Access your Executive Network Director Dashboard</li>
              <li>Monitor network-wide performance and RD development</li>
              <li>Your executive override earnings (9%) will show on your dashboard</li>
            </ol>
            
            <p><strong>🏆 You are now part of an elite group of Executive Network Directors!</strong></p>
            
            <p>Questions? Reply to this email.</p>
            
            <p>Best regards,<br>Marriage Education Team</p>
          `
        });
        console.log(`📧 Executive promotion email sent to ${fullAmbassadorData.email}`);
      } catch (emailError) {
        console.error('Failed to send Executive promotion email:', emailError);
      }
    }
    
    // Send Telegram notification
    if (TELEGRAM_BOT_TOKEN) {
      const msg = `🏆 EXECUTIVE NETWORK DIRECTOR PROMOTION!\n\n` +
        `Ambassador: ${ambassadorCode}\n` +
        `Name: ${fullAmbassadorData.fullName || 'Unknown'}\n` +
        `RDs Recruited: ${fullAmbassadorData.directRDCount || fullAmbassadorData.rds_recruited || 1}+\n` +
        `Network Size: 1,000+ ambassadors\n\n` +
        `🎯 TOP TIER REACHED!\n` +
        `Executive Override: 9% on entire network\n` +
        `Target: $1M+/month!`;
      
      await sendTelegram(msg, false);
    }
    
    return {
      success: true,
      ambassadorCode: ambassadorCode,
      newStatus: 'executive',
      role_level: 4
    };
    
  } catch (error) {
    console.error(`❌ Error promoting ${ambassadorCode} to Executive:`, error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COVENANT MATCHING SYSTEM — v249
// ─────────────────────────────────────────────────────────────────────────────

/**
 * calculateFormationScore (HTTPS Callable)
 * -----------------------------------------
 * Reads the user's course progress + board activity, applies the canonical
 * formation score formula, and writes the result back to users/{uid}.formationScore.
 *
 * Formula:
 *   (courseCompletion × 0.40) + (boardParticipation × 0.25)
 * + (consistency × 0.15)     + (assessmentScores × 0.20)
 *
 * Called client-side via:
 *   firebase.functions().httpsCallable('calculateFormationScore')()
 */
exports.calculateFormationScore = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }
  const uid = context.auth.uid;

  try {
    // ── Course completion ──────────────────────────────────────
    const progressSnap = await db.collection('userProgress')
      .where('userId', '==', uid)
      .get();

    let school1Total = 0, school1Done = 0;
    let school2Total = 0, school2Done = 0;
    let assessTotal  = 0, assessDoneSum = 0;

    progressSnap.forEach(doc => {
      const d = doc.data();
      const school = d.schoolId || '';
      if (school.includes('school-1') || school.includes('teleios')) {
        school1Total++;
        if (d.status === 'complete' || d.completed) school1Done++;
      } else if (school.includes('school-2') || school.includes('sexual-literacy')) {
        school2Total++;
        if (d.status === 'complete' || d.completed) school2Done++;
      }
      if (typeof d.assessmentScore === 'number') {
        assessTotal++;
        assessDoneSum += Math.min(d.assessmentScore, 100) / 100;
      }
    });

    const school1Pct       = school1Total > 0 ? Math.round((school1Done / school1Total) * 100) : 0;
    const school2Pct       = school2Total > 0 ? Math.round((school2Done / school2Total) * 100) : 0;
    const courseCompletion = Math.round((school1Pct + school2Pct) / 2);
    const assessmentScore  = assessTotal > 0 ? Math.round((assessDoneSum / assessTotal) * 100) : 0;

    // ── Board participation ────────────────────────────────────
    const userSnap         = await db.collection('users').doc(uid).get();
    const userData         = userSnap.data() || {};
    const activity         = userData.activity || {};
    const posts            = activity.postsCount  || 0;
    const boards           = activity.boardVisits || 0;
    const boardParticipation = Math.min(100, Math.round((posts * 5) + (boards * 1)));

    // ── Consistency ────────────────────────────────────────────
    const loginStreak  = activity.loginStreak  || 0;
    const weeklyActive = activity.weeklyActive || 0;
    const consistency  = Math.min(100, Math.round((loginStreak * 2) + (weeklyActive * 5)));

    // ── Composite ──────────────────────────────────────────────
    const totalScore = Math.round(
      (courseCompletion    * 0.40) +
      (boardParticipation  * 0.25) +
      (consistency         * 0.15) +
      (assessmentScore     * 0.20)
    );

    const score = {
      courseCompletion,
      school1Pct,
      school2Pct,
      boardParticipation,
      consistency,
      assessmentScore,
      totalScore,
      calculatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('users').doc(uid).update({ formationScore: score });

    return { success: true, formationScore: score };
  } catch (err) {
    console.error('[calculateFormationScore] error:', err);
    throw new functions.https.HttpsError('internal', 'Failed to calculate formation score.');
  }
});

/**
 * triggerMatchingCycle (HTTPS Callable — admin only)
 * ---------------------------------------------------
 * Pairs qualified users who have opted into dating (datingActive === true)
 * but do not yet have an active match.
 *
 * Matching rules:
 *   - Both must have tier === 'elite' and formationScore.totalScore >= 70
 *   - Opposite gender (male ↔ female)
 *   - No existing active match between the two users
 *   - Closest formation score pairing (greedy, sorted by score desc)
 *
 * Creates: matches/{matchId} documents
 * Sends:   /notifications documents for each matched user
 */
exports.triggerMatchingCycle = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }
  // Verify admin role
  const callerSnap = await db.collection('users').doc(context.auth.uid).get();
  const callerData = callerSnap.data() || {};
  if (callerData.role !== 'admin' && callerData.isAdmin !== true) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
  }

  try {
    // Load all active dating candidates
    const snap = await db.collection('users')
      .where('tier', '==', 'elite')
      .where('datingActive', '==', true)
      .get();

    const males   = [];
    const females = [];
    snap.forEach(doc => {
      const d   = doc.data();
      const score = d.formationScore?.totalScore || 0;
      if (score < 70) return;
      const candidate = { uid: doc.id, score, gender: d.gender, displayName: d.displayName || '' };
      if (d.gender === 'male')   males.push(candidate);
      if (d.gender === 'female') females.push(candidate);
    });

    // Sort by score descending for greedy closest-score pairing
    males.sort((a, b)   => b.score - a.score);
    females.sort((a, b) => b.score - a.score);

    // Load existing active matches to prevent duplicates
    const existingSnap = await db.collection('matches').where('status', '==', 'active').get();
    const existingPairs = new Set();
    existingSnap.forEach(d => {
      const { userA, userB } = d.data();
      existingPairs.add(`${userA}:${userB}`);
      existingPairs.add(`${userB}:${userA}`);
    });

    const batch        = db.batch();
    let matchesCreated = 0;

    for (const male of males) {
      if (females.length === 0) break;
      // Find closest-scoring available female
      let bestIdx   = 0;
      let bestDelta = Math.abs(male.score - females[0].score);
      for (let i = 1; i < females.length; i++) {
        const delta = Math.abs(male.score - females[i].score);
        if (delta < bestDelta) { bestDelta = delta; bestIdx = i; }
      }
      const female = females[bestIdx];
      const pairKey = `${male.uid}:${female.uid}`;
      if (existingPairs.has(pairKey)) continue;

      const matchRef = db.collection('matches').doc();
      batch.set(matchRef, {
        userA:      male.uid,
        userAName:  male.displayName,
        userB:      female.uid,
        userBName:  female.displayName,
        status:     'active',
        stage:      1,
        scoreA:     male.score,
        scoreB:     female.score,
        createdAt:  admin.firestore.FieldValue.serverTimestamp(),
      });

      // Notifications
      [male.uid, female.uid].forEach(uid => {
        const notifRef = db.collection('notifications').doc();
        batch.set(notifRef, {
          userId:    uid,
          type:      'new_match',
          message:   'You have a new Covenant Match! Visit your matching dashboard.',
          read:      false,
          link:      '/dating.html',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      females.splice(bestIdx, 1);
      matchesCreated++;
    }

    await batch.commit();
    console.log(`[triggerMatchingCycle] Created ${matchesCreated} new matches.`);
    return { success: true, matchesCreated };
  } catch (err) {
    console.error('[triggerMatchingCycle] error:', err);
    throw new functions.https.HttpsError('internal', 'Matching cycle failed.');
  }
});

/**
 * requestCoachingSession (HTTPS Callable)
 * ----------------------------------------
 * Writes a coaching request to coachingRequests/{id} and notifies admin.
 * Called from submitCoachingRequest() in dating.js (and optionally profile.js).
 */
exports.requestCoachingSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }
  const uid = context.auth.uid;
  const { matchId = null, type = 'relationship', notes = '' } = data || {};

  // Sanitize notes — max 1000 chars
  const safeNotes = String(notes).slice(0, 1000);

  try {
    const userSnap = await db.collection('users').doc(uid).get();
    const userData = userSnap.data() || {};

    const reqRef = await db.collection('coachingRequests').add({
      userId:    uid,
      userName:  userData.displayName || '',
      userEmail: userData.email       || '',
      matchId,
      type,
      status:    'pending',
      notes:     safeNotes,
      score:     userData.formationScore?.totalScore || 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Notify admin
    const adminNotifRef = db.collection('admin_notifications').doc();
    await adminNotifRef.set({
      type:      'coaching_request',
      userId:    uid,
      userName:  userData.displayName || '',
      requestId: reqRef.id,
      message:   `New coaching request from ${userData.displayName || uid}`,
      read:      false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, requestId: reqRef.id };
  } catch (err) {
    console.error('[requestCoachingSession] error:', err);
    throw new functions.https.HttpsError('internal', 'Failed to submit coaching request.');
  }
});

// ─── WARDROBE RE-ENGAGEMENT NUDGE (weekly scheduled) ─────────────────────────
// Fires weekly; finds Elite users whose wardrobe hasn't been updated in 14+ days
// and writes an in-app notification to the notifications collection.

exports.wardrobeReEngagement = functions.pubsub
  .schedule('every 168 hours')
  .onRun(async () => {
    const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
    const cutoff       = new Date(Date.now() - TWO_WEEKS_MS);

    try {
      // Get all Elite users
      const usersSnap = await db.collection('users')
        .where('subscription.tier', '==', 'elite').get();

      const batchWrites = [];

      for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;
        try {
          // Check last saved item
          const wardSnap = await db.collection('wardrobes').doc(uid)
            .collection('items')
            .orderBy('savedAt', 'desc')
            .limit(1)
            .get();

          let shouldNudge = false;
          if (wardSnap.empty) {
            shouldNudge = true;   // Never saved anything
          } else {
            const lastSaved = wardSnap.docs[0].data().savedAt?.toDate?.();
            if (!lastSaved || lastSaved < cutoff) shouldNudge = true;
          }

          if (shouldNudge) {
            const notifRef = db.collection('notifications').doc();
            batchWrites.push({
              ref: notifRef,
              data: {
                userId:    uid,
                type:      'wardrobe_nudge',
                message:   "Your MV House wardrobe hasn't been updated in a while. Browse the boards and save new looks to keep your style fresh! 👗",
                read:      false,
                link:      '/mv-house.html',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              },
            });
          }
        } catch (userErr) {
          console.warn('[wardrobeReEngagement] user error:', uid, userErr.code);
        }
      }

      // Write in batches of 500 (Firestore limit)
      for (let i = 0; i < batchWrites.length; i += 500) {
        const chunk = batchWrites.slice(i, i + 500);
        const batch = db.batch();
        chunk.forEach(({ ref, data }) => batch.set(ref, data));
        await batch.commit();
      }

      console.log(`[wardrobeReEngagement] Sent ${batchWrites.length} nudge notifications.`);
      return null;
    } catch (err) {
      console.error('[wardrobeReEngagement] fatal error:', err);
      return null;
    }
  });

// ═══════════════════════════════════════════════════════════════════
// FORMATION INTELLIGENCE SYSTEM v2 — Cloud Functions
// All writes target: users/{uid}.formationProfile_v2
// Runs IN PARALLEL with existing formationScore system — safe migration.
// ═══════════════════════════════════════════════════════════════════

// ── SHARED: Normalize + Decay (mirrors formation-scoring-v2.js) ──
function _fisNorm(v, max)   { return max ? Math.min((v / max) * 100, 100) : 0; }
function _fisDecay(s, days) { return days > 60 ? s * 0.3 : days > 30 ? s * 0.6 : s; }

// ── SHARED: Compute v2 Score Profile for a single UID ────────────
async function _computeV2Profile(uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const d = snap.data();

  // Admin manual override takes priority
  if (d.formationOverride_v2) {
    return { ...d.formationOverride_v2, lastUpdated: admin.firestore.FieldValue.serverTimestamp(), version: 2 };
  }

  const agg = d.activityAggregates || {};
  const old = d.formationScore     || {};  // old system — school progress cached here

  const school1Progress = old.school1Pct || 0;
  const school2Progress = old.school2Pct || 0;

  // Formation (35%)
  const formation = (school1Progress * 0.5) + (school2Progress * 0.5);

  // Days since last active (for engagement decay)
  const lastTs = d.lastActive || d.lastLoginAt;
  const lastActiveDays = lastTs && lastTs.toMillis
    ? Math.floor((Date.now() - lastTs.toMillis()) / 86400000)
    : 999;

  // Engagement (25%) — weekly anti-gaming caps
  const posts    = Math.min(agg.postsLast7Days    || 0, 5);
  const comments = Math.min(agg.commentsLast7Days || 0, 20);
  const likes    = agg.likesReceivedTotal          || 0;
  const depth    = agg.avgCommentLength            || 0;  // EMA of chars, capped at 200

  const engRaw =
    (_fisNorm(posts,    5)   * 0.30) +
    (_fisNorm(comments, 20)  * 0.25) +
    (_fisNorm(likes,    200) * 0.25) +
    (_fisNorm(depth,    200) * 0.20);
  const engagement = _fisDecay(engRaw, lastActiveDays);

  // Expression / MV House (20%)
  const expression =
    (_fisNorm(agg.recentPurchases       || 0, 10)  * 0.30) +
    (_fisNorm(agg.purchaseCount         || 0, 50)  * 0.20) +
    (_fisNorm(agg.wardrobeCategoryCount || 0, 5)   * 0.20) +
    (_fisNorm(agg.wardrobeCompleteness  || 0, 100) * 0.15) +
    (_fisNorm(agg.customizations        || 0, 10)  * 0.15);

  // Consistency (10%)
  const consistency = _fisNorm(agg.activeDaysLast30 || 0, 30);

  // Validation (10%)
  const validation = Math.min(100, (
    _fisNorm(agg.certificationCount   || 0, 10) +
    _fisNorm(agg.coachingSessionCount || 0, 10)
  ) / 2);

  const totalScore = Math.round(
    (formation   * 0.35) +
    (engagement  * 0.25) +
    (expression  * 0.20) +
    (consistency * 0.10) +
    (validation  * 0.10)
  );

  return {
    formation:       Math.round(formation),
    engagement:      Math.round(engagement),
    expression:      Math.round(expression),
    consistency:     Math.round(consistency),
    validation:      Math.round(validation),
    totalScore,
    school1Progress,
    school2Progress,
    expressionGated: Math.round(expression) < 20,
    lastUpdated:     admin.firestore.FieldValue.serverTimestamp(),
    version:         2,
  };
}

// ── EVENT TRIGGER 1: POST WRITTEN ────────────────────────────────
// Path: posts/{postId}
// Credits postsLast7Days on creation; tracks likesReceivedTotal on reaction changes.
exports.onPostWrittenV2 = functions.firestore
  .document('posts/{postId}')
  .onWrite(async (change, context) => {
    try {
      const after  = change.after.exists  ? change.after.data()  : null;
      const before = change.before.exists ? change.before.data() : null;
      if (!after) return null; // deletion — ignore

      const authorId = after.authorId || after.uid;
      if (!authorId) return null;

      const updates = {};

      // New post (not an update)
      if (!before) {
        updates['activityAggregates.postsLast7Days']    = admin.firestore.FieldValue.increment(1);
        updates['activityAggregates.totalPostsAllTime'] = admin.firestore.FieldValue.increment(1);
      }

      // Reaction / like change — credit post author
      const countReactions = (r) =>
        Object.values(r || {}).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
      const diff = countReactions(after.reactions) - countReactions(before?.reactions);
      if (diff !== 0) {
        updates['activityAggregates.likesReceivedTotal'] = admin.firestore.FieldValue.increment(diff);
      }

      if (Object.keys(updates).length === 0) return null;
      await db.collection('users').doc(authorId).update(updates);

      const profile = await _computeV2Profile(authorId);
      if (profile) await db.collection('users').doc(authorId).update({ formationProfile_v2: profile });

      return null;
    } catch (err) {
      console.error('[FIS_V2] onPostWrittenV2:', err.code || err.message);
      return null;
    }
  });

// ── EVENT TRIGGER 2: COMMENT WRITTEN ─────────────────────────────
// Path: comments/{commentId}
// Credits commentsLast7Days + updates avgCommentLength (discussion depth signal).
exports.onCommentWrittenV2 = functions.firestore
  .document('comments/{commentId}')
  .onWrite(async (change, context) => {
    try {
      const after  = change.after.exists  ? change.after.data()  : null;
      const before = change.before.exists ? change.before.data() : null;
      // Only new comments (not edits or deletions)
      if (!after || before) return null;

      const authorId = after.authorId || after.uid;
      if (!authorId) return null;

      const charLen  = (after.content || after.text || '').length;
      const userSnap = await db.collection('users').doc(authorId).get();
      const curAvg   = userSnap.data()?.activityAggregates?.avgCommentLength || 0;
      const newAvg   = curAvg === 0 ? charLen : Math.round(0.8 * curAvg + 0.2 * charLen);

      await db.collection('users').doc(authorId).update({
        'activityAggregates.commentsLast7Days':    admin.firestore.FieldValue.increment(1),
        'activityAggregates.totalCommentsAllTime': admin.firestore.FieldValue.increment(1),
        'activityAggregates.avgCommentLength':     newAvg,
      });

      const profile = await _computeV2Profile(authorId);
      if (profile) await db.collection('users').doc(authorId).update({ formationProfile_v2: profile });

      return null;
    } catch (err) {
      console.error('[FIS_V2] onCommentWrittenV2:', err.code || err.message);
      return null;
    }
  });

// ── EVENT TRIGGER 3: ORDER COMPLETED ─────────────────────────────
// Path: orders/{orderId}
// Credits purchaseCount + recentPurchases (30-day rolling window).
exports.onOrderCompletedV2 = functions.firestore
  .document('orders/{orderId}')
  .onCreate(async (snap, context) => {
    try {
      const order = snap.data();
      if (order.status !== 'completed' || order.app !== 'sbd-network') return null;

      const uid = order.userId;
      if (!uid) return null;

      const orderMs  = order.createdAt?.toMillis ? order.createdAt.toMillis() : Date.now();
      const isRecent = Date.now() - orderMs < 30 * 86400000;

      const updates = { 'activityAggregates.purchaseCount': admin.firestore.FieldValue.increment(1) };
      if (isRecent) updates['activityAggregates.recentPurchases'] = admin.firestore.FieldValue.increment(1);

      await db.collection('users').doc(uid).update(updates);

      const profile = await _computeV2Profile(uid);
      if (profile) await db.collection('users').doc(uid).update({ formationProfile_v2: profile });

      return null;
    } catch (err) {
      console.error('[FIS_V2] onOrderCompletedV2:', err.code || err.message);
      return null;
    }
  });

// ── EVENT TRIGGER 4: WARDROBE ITEM WRITTEN ───────────────────────
// Path: wardrobes/{uid}/items/{itemId}
// Recounts wardrobe items + distinct categories + completeness %.
exports.onWardrobeItemWrittenV2 = functions.firestore
  .document('wardrobes/{uid}/items/{itemId}')
  .onWrite(async (change, context) => {
    const uid = context.params.uid;
    try {
      const itemsSnap = await db.collection('wardrobes').doc(uid).collection('items').get();
      const totalItems = itemsSnap.size;
      const categories = new Set();
      itemsSnap.forEach(d => {
        const cat = d.data().category || d.data().context || 'uncategorized';
        categories.add(cat);
      });
      const TARGET_LOOKS         = 10;
      const wardrobeCompleteness = Math.min(100, Math.round((totalItems / TARGET_LOOKS) * 100));

      await db.collection('users').doc(uid).update({
        'activityAggregates.wardrobeItemCount':     totalItems,
        'activityAggregates.wardrobeCategoryCount': categories.size,
        'activityAggregates.wardrobeCompleteness':  wardrobeCompleteness,
      });

      const profile = await _computeV2Profile(uid);
      if (profile) await db.collection('users').doc(uid).update({ formationProfile_v2: profile });

      return null;
    } catch (err) {
      console.error('[FIS_V2] onWardrobeItemWrittenV2:', err.code || err.message);
      return null;
    }
  });

// ── DAILY JOB 1: BATCH SCORE RECALCULATION ───────────────────────
// Every 24h — processes only users active in last 30 days. Batch of 100.
exports.runDailyScoreRecalcV2 = functions.pubsub
  .schedule('every 24 hours')
  .timeZone('America/New_York')
  .onRun(async () => {
    try {
      const cutoff = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 86400000));
      const activeSnap = await db.collection('users')
        .where('lastLoginAt', '>=', cutoff)
        .get();

      console.log(`[FIS_V2] Daily recalc: ${activeSnap.size} active users`);

      // Process in chunks of 100 (avoid overwhelming Firestore)
      const docs = activeSnap.docs;
      for (let i = 0; i < docs.length; i += 100) {
        await Promise.all(docs.slice(i, i + 100).map(async (userDoc) => {
          try {
            const profile = await _computeV2Profile(userDoc.id);
            if (profile) {
              await db.collection('users').doc(userDoc.id).update({ formationProfile_v2: profile });
            }
          } catch (e) {
            console.warn('[FIS_V2] recalc skip uid=' + userDoc.id + ':', e.code);
          }
        }));
      }

      console.log('[FIS_V2] Daily recalc complete.');
      return null;
    } catch (err) {
      console.error('[FIS_V2] runDailyScoreRecalcV2 fatal:', err);
      return null;
    }
  });

// ── DAILY JOB 2: MATCHING ENGINE v2 ──────────────────────────────
// Every 24h — generates top 3-5 system-curated matches per eligible user.
// Eligibility: tier >= premium, v2 totalScore >= 60, school1/2 >= 70 (or 60 in low pool),
//              expression >= 20, datingBanned !== true.
exports.runDailyMatchingEngineV2 = functions.pubsub
  .schedule('every 24 hours')
  .timeZone('America/New_York')
  .onRun(async () => {
    try {
      // Load scoring weights from admin settings (falls back to defaults)
      let WEIGHTS = { formation: 0.35, engagement: 0.25, expression: 0.20, consistency: 0.10, validation: 0.10 };
      try {
        const wSnap = await db.collection('admin').doc('settings').collection('scoringWeights').doc('current').get();
        if (wSnap.exists) WEIGHTS = { ...WEIGHTS, ...wSnap.data() };
      } catch (_) { /* use defaults */ }

      // Fetch premium and elite users (both tier fields)
      const [premSnap, eliteSnap, premSubSnap, eliteSubSnap] = await Promise.all([
        db.collection('users').where('tier', '==', 'premium').get(),
        db.collection('users').where('tier', '==', 'elite').get(),
        db.collection('users').where('subscription.tier', '==', 'premium').get(),
        db.collection('users').where('subscription.tier', '==', 'elite').get(),
      ]);

      // Merge and deduplicate
      const userMap = new Map();
      [...premSnap.docs, ...eliteSnap.docs, ...premSubSnap.docs, ...eliteSubSnap.docs]
        .forEach(d => { if (!userMap.has(d.id)) userMap.set(d.id, { uid: d.id, ...d.data() }); });

      // Filter: must have v2 score >= 60 and not banned
      const candidates = [...userMap.values()].filter(u => {
        const p = u.formationProfile_v2;
        return p && p.totalScore >= 60 && u.datingBanned !== true;
      });

      // Low-pool fallback: loosen school threshold if < 50 eligible
      const schoolThreshold = candidates.length < 50 ? 60 : 70;

      const eligible = candidates.filter(u => {
        const p = u.formationProfile_v2;
        return p.school1Progress >= schoolThreshold &&
               p.school2Progress >= schoolThreshold &&
               p.expression >= 20;
      });

      const females = eligible.filter(u => u.gender === 'female');
      const males   = eligible.filter(u => u.gender === 'male');

      console.log(`[FIS_V2] Matching pool: ${females.length}F / ${males.length}M, schoolThresh=${schoolThreshold}`);

      // Load existing active v2 matches to build history (avoid re-matching same pair)
      const existingSnap = await db.collection('matches')
        .where('generatedBy', '==', 'daily-engine-v2')
        .where('status', '==', 'active')
        .get();

      const historyMap = new Map(); // uid → Set of matched UIDs
      existingSnap.forEach(d => {
        const { userA, userB } = d.data();
        if (!historyMap.has(userA)) historyMap.set(userA, new Set());
        if (!historyMap.has(userB)) historyMap.set(userB, new Set());
        historyMap.get(userA).add(userB);
        historyMap.get(userB).add(userA);
      });

      // Compatibility score between two eligible users
      function compatScore(a, b) {
        const pA = a.formationProfile_v2;
        const pB = b.formationProfile_v2;
        const sim = (va, vb) => 1 - Math.abs(va - vb) / 100;
        const intentMatch = (a.marriageIntent === true && b.marriageIntent === true) ? 1 : 0.5;
        return (
          (sim(pA.formation,   pB.formation)   * 0.30) +
          (sim(pA.engagement,  pB.engagement)  * 0.20) +
          (sim(pA.expression,  pB.expression)  * 0.15) +
          (sim(pA.consistency, pB.consistency) * 0.10) +
          (intentMatch                          * 0.15) +
          (0.5                                  * 0.10)  // location-neutral placeholder
        );
      }

      const SCORE_GAP_MAX = 15;
      const matchesToWrite = [];
      const writtenPairs   = new Set();

      // Generate matches: female ↔ male direction
      for (const female of females) {
        const pF      = female.formationProfile_v2;
        const history = historyMap.get(female.uid) || new Set();

        const pool = males.filter(m => {
          const pairKey = [female.uid, m.uid].sort().join('|');
          return !history.has(m.uid) &&
                 !writtenPairs.has(pairKey) &&
                 Math.abs(pF.totalScore - m.formationProfile_v2.totalScore) <= SCORE_GAP_MAX;
        });

        if (pool.length === 0) continue;

        const ranked = pool
          .map(m => ({ m, score: compatScore(female, m) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);

        for (const { m, score } of ranked) {
          const pairKey = [female.uid, m.uid].sort().join('|');
          if (writtenPairs.has(pairKey)) continue;
          writtenPairs.add(pairKey);
          matchesToWrite.push({
            userA:       female.uid,
            userB:       m.uid,
            scoreA:      pF.totalScore,
            scoreB:      m.formationProfile_v2.totalScore,
            compatScore: Math.round(score * 100),
            stage:       1,
            status:      'active',
            feedback:    null,
            generatedBy: 'daily-engine-v2',
            createdAt:   admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      // Write in Firestore batches of 500
      console.log(`[FIS_V2] Writing ${matchesToWrite.length} new matches`);
      for (let i = 0; i < matchesToWrite.length; i += 500) {
        const batch = db.batch();
        matchesToWrite.slice(i, i + 500).forEach(m => batch.set(db.collection('matches').doc(), m));
        await batch.commit();
      }

      console.log('[FIS_V2] Matching engine complete.');
      return null;
    } catch (err) {
      console.error('[FIS_V2] runDailyMatchingEngineV2 fatal:', err);
      return null;
    }
  });

// ── EVENT TRIGGER 5: USER LOGIN (lastLoginAt written by auth flow) ──
// Path: users/{uid}  onUpdate — detects lastLoginAt changes to track activeDaysLast30.
// Also enforces weekly match token reset (lastMatchReset + weeklyMatchesCount).
exports.onUserLoginV2 = functions.firestore
  .document('users/{uid}')
  .onUpdate(async (change, context) => {
    const uid    = context.params.uid;
    const before = change.before.data();
    const after  = change.after.data();

    // Only fire when lastLoginAt actually changes
    const beforeLogin = before.lastLoginAt?.toMillis ? before.lastLoginAt.toMillis() : 0;
    const afterLogin  = after.lastLoginAt?.toMillis  ? after.lastLoginAt.toMillis()  : 0;
    if (afterLogin === beforeLogin) return null;

    try {
      const updates = {};

      // ── Consistency: increment activeDaysLast30 (if not already counted today) ──
      const agg         = after.activityAggregates || {};
      const lastCountMs = agg.lastActiveCountedAt?.toMillis ? agg.lastActiveCountedAt.toMillis() : 0;
      const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
      if (lastCountMs < startOfToday.getTime()) {
        updates['activityAggregates.activeDaysLast30']    = admin.firestore.FieldValue.increment(1);
        updates['activityAggregates.lastActiveCountedAt'] = admin.firestore.FieldValue.serverTimestamp();
      }

      // ── Weekly match token reset (every 7 days) ──────────────────
      const lastReset   = after.lastMatchReset?.toMillis ? after.lastMatchReset.toMillis() : 0;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - lastReset >= sevenDaysMs) {
        updates['weeklyMatchesCount'] = 0;
        updates['lastMatchReset']     = admin.firestore.FieldValue.serverTimestamp();
      }

      if (Object.keys(updates).length === 0) return null;
      await db.collection('users').doc(uid).update(updates);

      // Recompute v2 score (consistency just changed)
      const profile = await _computeV2Profile(uid);
      if (profile) await db.collection('users').doc(uid).update({ formationProfile_v2: profile });

      return null;
    } catch (err) {
      console.error('[FIS_V2] onUserLoginV2:', err.code || err.message);
      return null;
    }
  });

// ── EVENT TRIGGER 6: COURSE PROGRESS COMPLETED ───────────────────
// Path: userProgress/{progressId}
// When a lesson/course is marked complete, refresh school1Pct / school2Pct immediately
// so formation score updates without waiting for the daily batch.
exports.onCourseProgressV2 = functions.firestore
  .document('userProgress/{progressId}')
  .onWrite(async (change, context) => {
    try {
      const after  = change.after.exists  ? change.after.data()  : null;
      const before = change.before.exists ? change.before.data() : null;
      if (!after) return null;

      const uid = after.userId || after.uid;
      if (!uid) return null;

      // Only act when status becomes 'complete'
      const wasComplete = before?.status === 'complete' || before?.completed;
      const isComplete  = after.status  === 'complete' || after.completed;
      if (wasComplete || !isComplete) return null;

      // Recount school progress for this user
      const progressSnap = await db.collection('userProgress')
        .where('userId', '==', uid)
        .get();

      let s1Total = 0, s1Done = 0, s2Total = 0, s2Done = 0;
      progressSnap.forEach(doc => {
        const d      = doc.data();
        const school = d.schoolId || '';
        if (school.includes('school-1') || school.includes('teleios')) {
          s1Total++;
          if (d.status === 'complete' || d.completed) s1Done++;
        } else if (school.includes('school-2') || school.includes('sexual-literacy')) {
          s2Total++;
          if (d.status === 'complete' || d.completed) s2Done++;
        }
      });

      const school1Pct = s1Total > 0 ? Math.round((s1Done / s1Total) * 100) : 0;
      const school2Pct = s2Total > 0 ? Math.round((s2Done / s2Total) * 100) : 0;

      // Update the cached formation score synchronously so _computeV2Profile sees it
      await db.collection('users').doc(uid).update({
        'formationScore.school1Pct': school1Pct,
        'formationScore.school2Pct': school2Pct,
      });

      // Now recompute full v2 profile with the fresh school numbers
      const profile = await _computeV2Profile(uid);
      if (profile) await db.collection('users').doc(uid).update({ formationProfile_v2: profile });

      return null;
    } catch (err) {
      console.error('[FIS_V2] onCourseProgressV2:', err.code || err.message);
      return null;
    }
  });

// ── WEEKLY MATCH COUNT ENFORCEMENT (injected into matching engine) ─
// The daily matching engine respects weeklyMatchesCount already via the
// eligibility check. This helper is also called by on-demand matching.
// Rule: Elite gets 3 free matches/week; extra = paid tokens.
async function _checkAndIncrementWeeklyMatches(uid) {
  const snap = await db.collection('users').doc(uid).get();
  const d    = snap.data() || {};

  // Auto-reset if 7 days elapsed
  const lastReset   = d.lastMatchReset?.toMillis ? d.lastMatchReset.toMillis() : 0;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  let weeklyCount   = typeof d.weeklyMatchesCount === 'number' ? d.weeklyMatchesCount : 0;

  if (Date.now() - lastReset >= sevenDaysMs) {
    weeklyCount = 0;
    await db.collection('users').doc(uid).update({
      weeklyMatchesCount: 0,
      lastMatchReset:     admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  const MAX_FREE = 3;
  const hasFreeSlot = weeklyCount < MAX_FREE ||
    (typeof d.tokensMonthly === 'number' && d.tokensMonthly > 0) ||
    (typeof d.tokensExtra   === 'number' && d.tokensExtra   > 0);

  return { weeklyCount, hasFreeSlot };
}

// ── REVENUE PROFILE TRACKING ──────────────────────────────────────
// Triggered by onOrderCompletedV2 — also updates users/{uid}/revenueProfile.
// This extends the existing onOrderCompletedV2 by writing a revenueProfile sub-doc.
exports.onOrderRevenueProfileV2 = functions.firestore
  .document('orders/{orderId}')
  .onCreate(async (snap, context) => {
    try {
      const order = snap.data();
      if (order.status !== 'completed' || order.app !== 'sbd-network') return null;
      const uid = order.userId;
      if (!uid) return null;

      const amount = order.amount || 0;
      await db.collection('users').doc(uid).update({
        'revenueProfile.totalSpent':    admin.firestore.FieldValue.increment(amount),
        'revenueProfile.orderCount':    admin.firestore.FieldValue.increment(1),
        'revenueProfile.lastPurchaseAt': admin.firestore.FieldValue.serverTimestamp(),
      });

      return null;
    } catch (err) {
      console.error('[FIS_V2] onOrderRevenueProfileV2:', err.code || err.message);
      return null;
    }
  });
