const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')(functions.config().stripe?.secret_key);
const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const axios = require('axios');
const crypto = require('crypto');
const { defineSecret } = require('firebase-functions/params');
const { PaymentOperation } = require('@hachther/mesomb');
const { jsPDF } = require('jspdf');
const { creditRecruitmentBonusesV2 } = require('./recruitment-bonus-service');
const { POLICY_VERSION: RECRUITMENT_POLICY_VERSION } = require('./recruitment-bonus-policy');
const { isExcludedUplineCode } = require('./upline-exclusions');
const {
  creditSbdSubscriptionCommissions,
  normalizeCode: normalizeSbdReferralCode,
  isFoundationYearly,
  FOUNDATION_YEARLY_USD,
  YEARLY_REVENUE_BASE_FCFA,
  XAF_PER_USD
} = require('./sbd-subscription-commission');
const { registerAdminUserTools } = require('./admin-user-tools');
const { registerStudioCanonAi } = require('./studio-canon-ai');

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

// Initialize Resend. The SDK throws when constructed without a key, so the
// client is created on first use to keep an unconfigured key from taking down
// every function in this module at load time.
const RESEND_KEY = functions.config().resend?.key || process.env.RESEND_API_KEY || '';
let resendClient = null;
const resend = {
  get emails() {
    if (!resendClient) {
      if (!RESEND_KEY) {
        throw new Error('Resend API key is not configured. Set functions config resend.key or the RESEND_API_KEY env var.');
      }
      resendClient = new Resend(RESEND_KEY);
    }
    return resendClient.emails;
  }
};

// Telegram Configuration
const TELEGRAM_BOT_TOKEN = functions.config().telegram?.bot_token;
const TELEGRAM_CHAT_ID = functions.config().telegram?.chat_id;

// SBD-Network MeSomb credentials. These are Cloud Secret Manager secrets,
// bound only to the functions that need them. Never expose them to the browser.
const MESOMB_APPLICATION_KEY = defineSecret('MESOMB_APPLICATION_KEY');
const MESOMB_ACCESS_KEY = defineSecret('MESOMB_ACCESS_KEY');
const MESOMB_SECRET_KEY = defineSecret('MESOMB_SECRET_KEY');
const MESOMB_WEBHOOK_SECRET = defineSecret('MESOMB_WEBHOOK_SECRET');

function getMesombCredentials() {
  // Secret Manager values can accidentally include surrounding whitespace
  // when copied/pasted. Normalize that without logging credential material.
  const applicationKey = String(MESOMB_APPLICATION_KEY.value() || process.env.MESOMB_APPLICATION_KEY || '').trim();
  const accessKey = String(MESOMB_ACCESS_KEY.value() || process.env.MESOMB_ACCESS_KEY || '').trim();
  const secretKey = String(MESOMB_SECRET_KEY.value() || process.env.MESOMB_SECRET_KEY || '').trim();

  if (!applicationKey || !accessKey || !secretKey) {
    throw new Error('SBD-Network MeSomb credentials are not configured on the server.');
  }

  return { applicationKey, accessKey, secretKey };
}

/**
 * MeSomb collect adapter for SBD Network.
 *
 * Use the official SDK for request signing and collection, matching the
 * known-working Q4-Life Community Connect integration. Keep credentials
 * server-side and pass the external reference through for reconciliation.
 */
async function sbdMesombCollect({
  applicationKey, accessKey, secretKey, amount, payer, service,
  country = 'CM', currency = 'XAF', nonce, trxID,
  customer, products
}) {
  // Match the known-working Community Connect integration: SDK constructor,
  // unique alphanumeric nonce, and trxID (the SDK's supported reference field).
  const client = new PaymentOperation({ applicationKey, accessKey, secretKey });
  const safeNonce = nonce || Array.from({ length: 40 }, () =>
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[crypto.randomInt(62)]
  ).join('');
  return client.makeCollect({
    amount,
    payer,
    service,
    country,
    currency,
    nonce: safeNonce,
    trxID,
    customer,
    products,
    fees: true,
    conversion: false,
    mode: 'asynchronous'
  });
}

function verifySbdMeSombWebhook({ rawBody, signatureHeader, webhookSecret, toleranceSeconds = 300 }) {
  if (!webhookSecret) throw new Error('SBD-Network MeSomb webhook secret is not configured.');
  if (!signatureHeader) throw new Error('Missing X-MeSomb-Webhook-Signature header.');

  const parts = String(signatureHeader).split(',');
  const timestampPart = parts.find(part => part.trim().startsWith('t='));
  const signaturePart = parts.find(part => part.trim().startsWith('v1='));
  if (!timestampPart || !signaturePart) throw new Error('Invalid MeSomb webhook signature format.');

  const timestamp = timestampPart.trim().slice(2);
  const receivedSignature = signaturePart.trim().slice(3);
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) throw new Error('Invalid MeSomb webhook timestamp.');

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestampNumber);
  if (age > toleranceSeconds) throw new Error('MeSomb webhook timestamp is outside the allowed tolerance.');

  const signedPayload = timestamp + '.' + rawBody;
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  const receivedBuffer = Buffer.from(receivedSignature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    throw new Error('Invalid MeSomb webhook signature.');
  }

  return true;
}

async function getSbdMesombPlan(productId) {
  const canonicalProductId = resolveSbdProductId(productId);
  const resolved = await resolveSbdCatalogProduct(canonicalProductId);
  if (!resolved || !resolved.product) return null;

  // SBD catalog amounts are USD cents. Mobile Money collects in XAF.
  // 600 XAF/USD preserves the existing Foundation amounts exactly.
  const product = resolved.product;
  const amountXaf = Math.round((Number(product.amount) || 0) * 6);
  if (!amountXaf) return null;

  return {
    amountXaf,
    accessMonths: Number(product.months) > 0 ? Number(product.months) : 1,
    label: product.name || canonicalProductId
  };
}

function extractMesombTransaction(response) {
  if (!response) return null;
  if (response.transaction) return response.transaction;
  if (Array.isArray(response.transactions) && response.transactions[0]) return response.transactions[0];
  if (Array.isArray(response.results) && response.results[0]) return response.results[0];
  if (Array.isArray(response) && response[0]) return response[0];
  return null;
}

async function finalizeSbdMesombPayment(pending, transaction) {
  const transactionId = transaction?.pk || transaction?.id || pending.transactionId;
  const status = String(transaction?.status || '').toUpperCase();
  if (!transactionId || status !== 'SUCCESS') {
    return { success: false, status: status || 'PENDING', transactionId: transactionId || null };
  }

  const ref = db.collection('mesomb_payments').doc(pending.reference);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('MeSomb payment record not found.');
  const current = snap.data();
  if (current.status === 'completed') {
    return { success: true, status: 'SUCCESS', transactionId };
  }

  const session = {
    id: 'mesomb_' + transactionId,
    mode: 'payment',
    amount_total: Number(pending.amountXaf),
    currency: 'xaf',
    customer_details: {
      email: pending.email,
      name: pending.name,
      phone: pending.phone
    },
    manualAccessMonths: Number(pending.accessMonths || 1),
    manualCommissionKey: 'mesomb_' + transactionId,
    manualChargeKind: 'initial',
    manualAmount: Number(pending.amountXaf),
    manualCurrency: 'XAF',
    manualChannel: 'mesomb',
    manualPaymentMethod: pending.service === 'ORANGE' ? 'orange_money' : 'mtn_momo'
  };

  await unlockSbdContent(pending.uid, pending.productId, session);

  await ref.set({
    status: 'completed',
    transactionId,
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { success: true, status: 'SUCCESS', transactionId };
}



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
 * Write-through unified payment ledger record.
 * This is additive and does not replace existing collections.
 */
async function writeUnifiedPaymentRecord(record) {
  try {
    const source = String(record.source || 'unknown').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const reference = String(record.reference || record.external_reference || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-');
    const ledgerId = `${source}__${reference}`;

    await db.collection('payments').doc(ledgerId).set({
      ...record,
      source,
      reference,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    // Non-blocking: ledger write should never break payment operations.
    console.warn('[LEDGER] Failed to write payment record:', error.message);
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
    'sbd-dummies': 'sbd-for-dummies.pdf',
    'sbd-dummies-digital-print': 'sbd-for-dummies.pdf',
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
    'naked-and-not-ashamed': 'naked-not-ashamed.pdf',
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
 * Owned-book PDF URL for Library readers (auth required).
 * Product IDs like sbd-dummies map to ebooks/*.pdf in Storage.
 */
exports.getOwnedBookPdfUrl = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in to download.');
  }
  const productId = String((data && data.productId) || '').trim();
  if (!productId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing productId.');
  }

  const uid = context.auth.uid;
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.exists ? (userSnap.data() || {}) : {};
  const owned = Array.isArray(user.ownedProducts) ? user.ownedProducts : [];
  const role = String(user.role || '').toLowerCase();
  const isPrivileged = role === 'admin' || role === 'superadmin' || user.isContentDesigner === true
    || (Array.isArray(user.roles) && user.roles.indexOf('content_designer') !== -1);

  const courseHints = {
    'sbd-dummies': ['sbd-dummies-course', 'sex-by-design-for-dummies', 'course-14-sex-by-design-for-dummies'],
    'sbd-dummies-digital-print': ['sbd-dummies-course', 'sex-by-design-for-dummies'],
  };
  const ownedCourses = Array.isArray(user.ownedCourses) ? user.ownedCourses
    : (user.progress && Array.isArray(user.progress.unlockedCourses) ? user.progress.unlockedCourses : []);
  const hints = courseHints[productId] || [];
  const ownsViaCourse = hints.some((id) => ownedCourses.indexOf(id) !== -1);
  const owns = isPrivileged
    || owned.indexOf(productId) !== -1
    || ownsViaCourse
    || (owned.indexOf('sbd-for-dummies') !== -1
      && (productId === 'sbd-dummies' || productId === 'sbd-dummies-digital-print'));

  if (!owns) {
    throw new functions.https.HttpsError('permission-denied', 'This title is not on your shelf.');
  }

  try {
    const url = await generateDownloadURL(productId);
    return { url: url, productId: productId };
  } catch (err) {
    console.error('[getOwnedBookPdfUrl]', err);
    throw new functions.https.HttpsError('not-found', err.message || 'PDF not available.');
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

        if (!ambassadorCode) {
          console.error('[STRIPE] Ambassador webhook missing code:', session.metadata);
          return res.json({ received: true, action: 'ambassador-missing-code' });
        }

        try {
          let paymentIntent = session;
          if (event.type === 'checkout.session.completed') {
            const piRef = session.payment_intent;
            if (!piRef) {
              console.error('[STRIPE] Ambassador checkout session missing payment_intent:', session.id);
              return res.json({ received: true, action: 'ambassador-missing-payment-intent' });
            }
            paymentIntent = await stripe.paymentIntents.retrieve(
              typeof piRef === 'string' ? piRef : piRef.id
            );
          }

          if (paymentIntent.status !== 'succeeded') {
            console.log('[STRIPE] Ambassador webhook ignored — payment not succeeded:', paymentIntent.status);
            return res.json({ received: true, action: 'ambassador-not-succeeded', status: paymentIntent.status });
          }

          await processSuccessfulAmbassadorStripePayment(paymentIntent, {});
          return res.json({ received: true, action: 'ambassador-activated', code: ambassadorCode });
        } catch (activationError) {
          console.error('[STRIPE] Ambassador activation failed:', activationError.message);

          if (TELEGRAM_BOT_TOKEN) {
            const errorMsg = `🚨 STRIPE AMBASSADOR ACTIVATION FAILED\n\n` +
              `Code: ${ambassadorCode}\n` +
              `Email: ${session.metadata?.email || session.customer_details?.email || 'N/A'}\n` +
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
        const canonicalProductId = resolveSbdProductId(productId);

        // Stripe Checkout does not accept cancel_at inside subscription_data.
        // Schedule fixed-term SBD subscriptions after Checkout creates the
        // subscription, using the subscription ID from the completed session.
        if (session.subscription) {
          const catalogProduct = SBD_CATALOG_SERVER[canonicalProductId];
          const termMonths = Number(catalogProduct?.termMonths || 0);
          if (termMonths > 0) {
            try {
              const cancelAt = new Date();
              cancelAt.setMonth(cancelAt.getMonth() + termMonths);
              await stripe.subscriptions.update(
                typeof session.subscription === 'string'
                  ? session.subscription
                  : session.subscription.id,
                { cancel_at: Math.floor(cancelAt.getTime() / 1000) }
              );
              console.log(
                `[SBD] Scheduled subscription cancellation: product=${canonicalProductId} termMonths=${termMonths}`
              );
            } catch (subscriptionError) {
              console.error(
                '[SBD] Failed to schedule fixed-term subscription cancellation:',
                subscriptionError.message
              );
            }
          }
        }

        const tgMeta = await unlockSbdContent(uid, canonicalProductId, session);
        const prodName = SBD_CATALOG_SERVER[canonicalProductId]?.name || canonicalProductId;
        const amt      = session.amount_total ? `$${(session.amount_total / 100).toFixed(2)}` : 'N/A';
        const payer    = session.customer_details?.email || uid;

        const yearlyTag = isFoundationYearly(canonicalProductId)
          ? `\n🎯 YEARLY DEPLOYMENT ($${FOUNDATION_YEARLY_USD} · 10/5/5 stack)\n`
          : '\n';

        let payMsg =
          '✅ SBD NETWORK PAYMENT\n' +
          yearlyTag +
          `\n📦 ${prodName}\n` +
          `💵 ${amt}\n` +
          `👤 ${payer}\n` +
          `🆔 ${uid}\n`;

        if (session.metadata?.guest === '1') {
          payMsg += '🆕 Guest checkout (DTC landing)\n';
        }

        if (tgMeta) {
          if (tgMeta.referredBy) {
            payMsg += `🔗 Referral ref: ${tgMeta.referredBy}\n`;
          } else {
            payMsg += '🔗 Referral ref: (none — direct/organic)\n';
          }
          if (tgMeta.referrerAmbassadorCode) {
            payMsg += '👥 Referrer: ' + tgMeta.referrerAmbassadorCode;
            if (tgMeta.referrerFullName) payMsg += ` (${tgMeta.referrerFullName})`;
            payMsg += '\n';
          }
          if (tgMeta.referralCredited) {
            payMsg += `✅ Referral commission recorded: ${tgMeta.ambassadorCommissionFCFA || 0} FCFA (tier ${tgMeta.tierKeyed || '—'})`;
            if (isFoundationYearly(canonicalProductId)) {
              payMsg += ` · ~$${((tgMeta.ambassadorCommissionFCFA || 0) / 600).toFixed(2)}`;
            }
            if (tgMeta.seniorAmbassadorCode) {
              payMsg += `\n👑 Senior override: ${tgMeta.seniorAmbassadorCode} (+${tgMeta.seniorCommissionFCFA || 0} FCFA)`;
            }
            if (tgMeta.rdCode) {
              payMsg += `\n🌍 RD override: ${tgMeta.rdCode} (+${tgMeta.rdCommissionFCFA || 0} FCFA)`;
            }
            payMsg += '\n';
          } else if (tgMeta.referralSkipReason) {
            payMsg += `ℹ️ Referral payout: not applied (${tgMeta.referralSkipReason})\n`;
          }
        }

        payMsg += '\n👉 Admin: https://marriageducation.com/admin-dashboard.html';

        await sendTelegram(payMsg, false);

        if (session.metadata?.guest === '1') {
          try {
            const loginEmail = session.metadata?.loginEmail || payer;
            await sendSbdBuyerAccessEmail({
              email: loginEmail,
              name: session.customer_details?.name || '',
              productId: canonicalProductId,
              productName: prodName
            });
          } catch (buyerMailErr) {
            console.error('[SBD] Buyer welcome email failed:', buyerMailErr.message);
            await sendTelegram(
              `⚠️ SBD buyer welcome email failed\n👤 ${payer}\n🆔 ${uid}\n❌ ${buyerMailErr.message}`,
              false
            );
          }
        }

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

  // ── SBD subscription renewal commissions (invoice.payment_succeeded) ──
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object;
    try {
      const meta = await handleSbdStripeInvoice(invoice);
      if (meta?.credited && invoice.billing_reason === 'subscription_cycle' && TELEGRAM_BOT_TOKEN) {
        await sendTelegram(
          `🔁 SBD SUBSCRIPTION RENEWAL COMMISSION\n\n` +
          `Invoice: ${invoice.id}\n` +
          `Direct: ${meta.ambassadorCommissionFCFA || 0} FCFA\n` +
          (meta.seniorAmbassadorCode ? `Senior ${meta.seniorAmbassadorCode}: +${meta.seniorCommissionFCFA || 0} FCFA\n` : '') +
          (meta.rdCode ? `RD ${meta.rdCode}: +${meta.rdCommissionFCFA || 0} FCFA\n` : '') +
          `Policy: ${meta.policyVersion || '2026-04-v1'}`,
          false
        );
      }
    } catch (invErr) {
      console.error('[SBD] invoice.payment_succeeded commission error:', invErr.message);
    }
    return res.json({ received: true, action: 'sbd-invoice' });
  }

  // ── SBD subscription scheduled to cancel / past_due (access through period end only) ──
  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object;
    try {
      const snap = await db.collection('users').where('stripeSubscriptionId', '==', sub.id).limit(1).get();
      if (!snap.empty) {
        const currentPeriodEnd = Number(sub.current_period_end || 0);
        const stripeStatus = String(sub.status || '');
        const subscriptionUpdate = {
          'subscription.cancelAtPeriodEnd': sub.cancel_at_period_end === true,
          'subscription.stripeStatus': stripeStatus || null,
        };

        if (sub.cancel_at_period_end === true && currentPeriodEnd > 0) {
          // Explicit cancel: access continues through paid period (Stripe's "grace")
          subscriptionUpdate['subscription.endDate'] =
            admin.firestore.Timestamp.fromMillis(currentPeriodEnd * 1000);
          subscriptionUpdate['subscription.status'] = 'active';
        } else if (stripeStatus === 'past_due' || stripeStatus === 'unpaid') {
          // Failed renewal: keep access only through current_period_end while Stripe retries.
          // No extra grace days beyond the paid period.
          if (currentPeriodEnd > 0) {
            subscriptionUpdate['subscription.endDate'] =
              admin.firestore.Timestamp.fromMillis(currentPeriodEnd * 1000);
          }
          subscriptionUpdate['subscription.status'] = 'active';
        } else if (stripeStatus === 'active' || stripeStatus === 'trialing') {
          subscriptionUpdate['subscription.endDate'] =
            admin.firestore.Timestamp.fromDate(new Date('2099-12-31'));
          subscriptionUpdate['subscription.status'] = 'active';
        } else if (stripeStatus === 'canceled' || stripeStatus === 'incomplete_expired') {
          subscriptionUpdate['subscription.status'] = 'cancelled';
          subscriptionUpdate['subscription.endDate'] =
            admin.firestore.Timestamp.fromDate(new Date());
        }

        await snap.docs[0].ref.update(subscriptionUpdate);
        console.log(
          `[SBD] Sub ${sub.id} updated — status=${stripeStatus} cancelAtPeriodEnd=${sub.cancel_at_period_end === true}`
        );
      }
    } catch (e) {
      console.error('[SBD] subscription.updated error:', e);
    }
    return res.json({ received: true, action: 'sbd-sub-updated' });
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
          'subscription.cancelAtPeriodEnd': false,
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
  }});

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
      ambassador_data,
      payment_channel: paymentChannelRaw,
      momo_network,
      payment_method,
      payee_number,
      payee_name
    } = data;

    const paymentChannel = String(paymentChannelRaw || 'manual').toLowerCase();
    const isCampayAutomated = paymentChannel === 'campay';
    const resolvedMomoNetwork = String(momo_network || '').toLowerCase() === 'orange' ? 'orange' : 'mtn';
    const resolvedPaymentMethod = payment_method
      || (isCampayAutomated ? 'campay_momo' : (resolvedMomoNetwork === 'orange' ? 'orange_money' : 'momo'));

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
      payment_channel: paymentChannel,
      momo_network: isCampayAutomated ? 'campay' : resolvedMomoNetwork,
      payment_method: resolvedPaymentMethod,
      payee_number: payee_number || (resolvedMomoNetwork === 'orange' ? '237 699 651 555' : '237 677 604 100'),
      payee_name: payee_name || 'Achu Gustave Mokom',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };

    // Ambassador registration — always persist code + recruiter even if session form data was partial
    if (type === 'ambassador' || product_id === 'ambassador-registration') {
      paymentData.ambassador_code = ambassador_code || reference;
      paymentData.regional_director =
        regional_director ||
        ambassador_data?.regional_director_code ||
        ambassador_data?.recruitedBy ||
        referral_code ||
        '';
      paymentData.ambassador_data = ambassador_data || {
        code: ambassador_code || reference,
        recruitedBy: paymentData.regional_director
      };
      const normalizedRecruiter = normalizeAmbassadorRecruiterPaymentFields(paymentData);
      paymentData.regional_director = normalizedRecruiter.regional_director;
      paymentData.referral_code = normalizedRecruiter.referral_code;
      paymentData.ambassador_data = normalizedRecruiter.ambassador_data;
      if (normalizedRecruiter.recruiter_code_normalized_from) {
        paymentData.recruiter_code_normalized_from = normalizedRecruiter.recruiter_code_normalized_from;
        paymentData.recruiter_code_normalized_at = normalizedRecruiter.recruiter_code_normalized_at;
      }
    }

    await db.collection('pending_payments').doc(reference).set(paymentData);

    await writeUnifiedPaymentRecord({
      source: isCampayAutomated ? 'campay_collect' : 'manual_payment',
      reference,
      external_reference: reference,
      record_type: 'customer_payment',
      channel: isCampayAutomated ? 'campay' : 'manual',
      payment_method: isCampayAutomated
        ? 'campay_momo'
        : (resolvedMomoNetwork === 'orange' ? 'orange_money' : 'momo'),
      payment_category: type || 'book-purchase',
      product_id,
      product_name,
      amount: Number(amount || 0),
      currency: currency || 'XAF',
      customer_email: email || '',
      customer_phone: phone || '',
      ambassador_code: ambassador_code || '',
      recruiter_code: regional_director || rd_code || '',
      status: isCampayAutomated ? 'pending_collect' : 'pending',
      action_required: !isCampayAutomated,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });

    if (!isCampayAutomated) {
      // Send admin notification email (non-blocking - don't fail payment if email fails)
      try {
        await sendAdminPaymentNotification(paymentData);
        console.log('[EMAIL] Admin notification sent');
      } catch (emailError) {
        console.warn('[EMAIL] Admin notification failed (continuing anyway):', emailError.message);
      }

      // Send Telegram notification for manual MoMo pending approval only
      try {
        if (TELEGRAM_BOT_TOKEN) {
          const typeLabel = type === 'ambassador' ? '🎯 Ambassador Registration' :
            type === 'rd' ? '👑 RD Registration' : '📚 Book Purchase';
          const networkLabel = resolvedMomoNetwork === 'orange' ? 'Orange Money' : 'MTN MoMo';
          const pendingMsg = `🔔 NEW PAYMENT PENDING APPROVAL\n\n` +
            `📋 Reference: ${reference}\n` +
            `📚 Type: ${typeLabel}\n` +
            `📦 Product: ${product_name}\n` +
            `💰 Amount: ${amount} ${currency || 'XAF'}\n` +
            `🏦 Network: ${networkLabel}\n` +
            `📥 Payee: ${paymentData.payee_number} (${paymentData.payee_name})\n` +
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
      }
    }

    return {
      success: true,
      message: isCampayAutomated
        ? 'CamPay checkout prepared'
        : 'Payment submitted for approval'
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
  try {
    const { reference } = data;
    const result = await getPaymentFulfillment().fulfillPendingPayment(reference, {
      channel: 'manual',
      payment_method: 'momo'
    });
    console.log(`[APPROVE] Payment ${reference} approved`);
    return result;
  } catch (error) {
    console.error('approvePayment error:', error);
    if (TELEGRAM_BOT_TOKEN) {
      await sendTelegram(`❌ PAYMENT APPROVAL ERROR\n\nReference: ${data.reference}\nError: ${error.message}`, false);
    }
    if (error instanceof functions.https.HttpsError) throw error;
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

    const notifRef = db.collection('admin_notifications').doc(notification_id);
    const notifDoc = await notifRef.get();
    const notifData = notifDoc.exists ? notifDoc.data() : {};
    const newAmbassadorCode = notifData.ambassador_code || '';

    await notifRef.update({
      status: 'paid',
      paid_at: admin.firestore.FieldValue.serverTimestamp()
    });

    let recruiterName = 'Unknown';
    let remainingPending = 0;
    const payAmount = Number(amount) || 0;

    if (rd_code && rd_code.startsWith('RD-')) {
      const rdRef = db.collection('regional_directors').doc(rd_code);
      const rdDoc = await rdRef.get();

      if (rdDoc.exists) {
        const rdData = rdDoc.data();
        recruiterName = rdData.name || 'Unknown';

        await rdRef.update({
          recruitment_bonus_pending: admin.firestore.FieldValue.increment(-payAmount),
          recruitment_bonus_paid: admin.firestore.FieldValue.increment(payAmount),
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });

        const recruitmentHistory = rdData.recruitment_history || [];
        const updatedHistory = recruitmentHistory.map(entry => {
          if (
            entry.status === 'pending' &&
            entry.amount === payAmount &&
            (!newAmbassadorCode || entry.ambassador_code === newAmbassadorCode)
          ) {
            return { ...entry, status: 'paid', paid_at: new Date().toISOString() };
          }
          return entry;
        });
        await rdRef.update({ recruitment_history: updatedHistory });
        remainingPending = Math.max(0, (rdData.recruitment_bonus_pending || 0) - payAmount);
      }
    } else if (rd_code && rd_code.startsWith('AMB-')) {
      const ambRef = db.collection('ambassadors').doc(rd_code);
      const ambDoc = await ambRef.get();

      if (ambDoc.exists) {
        const ambData = ambDoc.data();
        recruiterName = ambData.name || ambData.fullName || 'Unknown';

        await ambRef.update({
          recruitment_bonus_pending: admin.firestore.FieldValue.increment(-payAmount),
          recruitment_bonus_paid: admin.firestore.FieldValue.increment(payAmount),
          commission_earned: admin.firestore.FieldValue.increment(payAmount),
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });

        const recruitmentHistory = ambData.recruitment_history || [];
        const updatedHistory = recruitmentHistory.map(entry => {
          if (
            entry.status === 'pending' &&
            entry.amount === payAmount &&
            (!newAmbassadorCode || entry.ambassador_code === newAmbassadorCode)
          ) {
            return { ...entry, status: 'paid', paid_at: new Date().toISOString() };
          }
          return entry;
        });
        await ambRef.update({ recruitment_history: updatedHistory });
        remainingPending = Math.max(0, (ambData.recruitment_bonus_pending || 0) - payAmount);
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
      throw new functions.https.HttpsError('already-exists', 'Dashboard already set up. Use "Forgot Password" if you need to reset.');    }
    
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

  // Provision SBD Network referral code + Foundation app access (RD- → SBD-)
  if (rd && rd.email) {
    try {
      await provisionSBDAccess(rd.email, rdCode, rd.name || rd.fullName || rd.email);
    } catch (sbdErr) {
      console.error(`[SBD] RD provision failed for ${rdCode}:`, sbdErr.message);
    }
  }
  
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

const AMBASSADOR_RECRUITMENT_BONUS_FCFA = 1500; // see docs/RECRUITMENT-BONUS-POLICY.md
const RD_NETWORK_RECRUITMENT_OVERRIDE_FCFA = 750; // DEPRECATED — replaced by upline pool in v2026-03-v2

/** Canonical AMB-/RD-/SNR- recruiter codes (underscores → hyphens). Does not activate anyone. */
function normalizeReferralCode(raw) {
  let c = String(raw || '').trim().toUpperCase();
  if (!c) return '';
  if (/^(AMB|RD|SNR)([_-]|$)/.test(c)) {
    c = c.replace(/_/g, '-');
  }
  return c.replace(/-+/g, '-');
}

function applyRecruiterFieldsToAmbassadorData(ambassadorData, recruiterRaw) {
  const data = { ...(ambassadorData || {}) };
  const recruiter = normalizeReferralCode(
    recruiterRaw || data.recruitedBy || data.regional_director_code || data.regional_director || ''
  );
  if (!recruiter) return data;

  data.recruitedBy = recruiter;
  if (recruiter.startsWith('RD-')) {
    data.regional_director_code = recruiter;
    data.regional_director = recruiter;
    data.recruited_by_type = data.recruited_by_type || 'regional_director';
  } else if (recruiter.startsWith('AMB-') || recruiter.startsWith('SNR-')) {
    data.senior_code = recruiter;
    data.recruited_by_type = data.recruited_by_type || 'senior_ambassador';
  }
  return data;
}

function normalizeAmbassadorRecruiterPaymentFields(payment) {
  const out = { ...payment };
  const recruiterRaw =
    out.regional_director ||
    out.referral_code ||
    out.ambassador_data?.recruitedBy ||
    out.ambassador_data?.regional_director_code ||
    '';
  const recruiter = normalizeReferralCode(recruiterRaw);
  out.regional_director = recruiter;
  out.referral_code = recruiter ? recruiter : normalizeReferralCode(out.referral_code);
  out.ambassador_data = applyRecruiterFieldsToAmbassadorData(out.ambassador_data, recruiter);
  if (recruiter && recruiter !== recruiterRaw) {
    out.recruiter_code_normalized_from = String(recruiterRaw || '');
    out.recruiter_code_normalized_at = admin.firestore.FieldValue.serverTimestamp();
  }
  return out;
}

function pickRdCode(...candidates) {
  for (const code of candidates) {
    const normalized = String(code || '').trim().toUpperCase();
    if (normalized.startsWith('RD-') && !isExcludedUplineCode(normalized)) return normalized;
  }
  return null;
}

async function resolveAmbassadorRdUpline(ambData) {
  const directRd = pickRdCode(
    ambData.rdCode,
    ambData.recruited_by_rd,
    ambData.regional_director_code,
    ambData.recruitedBy,
    ambData.recruited_by
  );
  if (directRd) return directRd;

  const seniorCode = ambData.senior_code || ambData.recruited_by_senior;
  if (seniorCode && seniorCode.startsWith('AMB-')) {
    const seniorDoc = await db.collection('ambassadors').doc(seniorCode).get();
    if (seniorDoc.exists) {
      const seniorData = seniorDoc.data();
      return pickRdCode(
        seniorData.rdCode,
        seniorData.recruited_by_rd,
        seniorData.regional_director_code,
        seniorData.recruitedBy,
        seniorData.recruited_by
      );
    }
  }
  return null;
}

/** @deprecated Use creditRecruitmentBonusesV2 (docs/RECRUITMENT-BONUS-POLICY.md v2026-03-v3). Kept for reference only. */
async function creditRdNetworkRecruitmentOverride({
  rdCode,
  recruitingAmbassadorCode,
  recruitingAmbassadorName,
  newAmbassadorCode,
  newAmbassadorName
}) {
  const rdRef = db.collection('regional_directors').doc(rdCode);
  const rdDoc = await rdRef.get();
  if (!rdDoc.exists) {
    console.warn(`[RD OVERRIDE] RD not found: ${rdCode}`);
    return;
  }

  const rdData = rdDoc.data();
  const overrideAmount = RD_NETWORK_RECRUITMENT_OVERRIDE_FCFA;

  await rdRef.update({
    recruitment_bonus_earned: admin.firestore.FieldValue.increment(overrideAmount),
    recruitment_bonus_pending: admin.firestore.FieldValue.increment(overrideAmount),
    network_recruitment_override_earned: admin.firestore.FieldValue.increment(overrideAmount),
    network_recruitment_override_pending: admin.firestore.FieldValue.increment(overrideAmount),
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  });

  const recruitmentHistory = rdData.recruitment_history || [];
  recruitmentHistory.push({
    type: 'network_override',
    recruiting_ambassador_code: recruitingAmbassadorCode,
    recruiting_ambassador_name: recruitingAmbassadorName,
    ambassador_code: newAmbassadorCode,
    ambassador_name: newAmbassadorName,
    amount: overrideAmount,
    date: new Date().toISOString(),
    status: 'pending'
  });
  await rdRef.update({ recruitment_history: recruitmentHistory });

  await db.collection('admin_notifications').add({
    type: 'rd_recruitment_bonus',
    recruiter_type: 'rd_network_override',
    rd_code: rdCode,
    rd_name: rdData.name || 'Unknown',
    recruiting_ambassador_code: recruitingAmbassadorCode,
    recruiting_ambassador_name: recruitingAmbassadorName,
    ambassador_code: newAmbassadorCode,
    ambassador_name: newAmbassadorName,
    amount: overrideAmount,
    status: 'pending',
    created_at: admin.firestore.FieldValue.serverTimestamp()
  });

  if (TELEGRAM_BOT_TOKEN) {
    const rdTotalPending = (rdData.recruitment_bonus_pending || 0) + overrideAmount;
    const rdMsg = `💰 RD NETWORK OVERRIDE (RECRUITMENT)\n\n` +
      `RD: ${rdCode}\n` +
      `Name: ${rdData.name || 'Unknown'}\n` +
      `Team recruiter: ${recruitingAmbassadorCode} (${recruitingAmbassadorName})\n` +
      `New Ambassador: ${newAmbassadorCode}\n` +
      `Name: ${newAmbassadorName}\n` +
      `Override: ${overrideAmount.toLocaleString()} FCFA (5%)\n\n` +
      `Total Pending: ${rdTotalPending.toLocaleString()} FCFA\n\n` +
      `👉 Admin Dashboard: https://marriageducation.com/admin-dashboard.html`;
    await sendTelegram(rdMsg, false);
  }

  console.log(`[RD OVERRIDE] ${rdCode} +${overrideAmount} FCFA for recruit via ${recruitingAmbassadorCode}`);
}

function normalizeAmbassadorPayment(payment, reference) {
  const ref = String(payment.reference || reference || '').trim();
  const ambassadorCode = String(payment.ambassador_code || ref).trim();
  const recruiterNormalized = normalizeAmbassadorRecruiterPaymentFields({
    ...payment,
    reference: ref,
    ambassador_code: ambassadorCode
  });
  const regional_director = recruiterNormalized.regional_director || '';
  let ambassadorData = recruiterNormalized.ambassador_data
    ? { ...recruiterNormalized.ambassador_data }
    : {};

  if (!ambassadorData.recruitedBy && regional_director) {
    ambassadorData = applyRecruiterFieldsToAmbassadorData(ambassadorData, regional_director);
  }
  if (!ambassadorData.code) {
    ambassadorData.code = ambassadorCode;
  }

  if (!ambassadorData.fullName) {
    const token = ambassadorCode.replace(/^AMB-/, '').split('-')[0] || 'Ambassador';
    const pretty =
      token.length > 1
        ? token.charAt(0) + token.slice(1).toLowerCase()
        : token;
    ambassadorData.fullName = pretty;
    ambassadorData.firstName = ambassadorData.firstName || pretty;
    ambassadorData.lastName = ambassadorData.lastName || '';
  }

  return {
    ...payment,
    reference: ref,
    ambassador_code: ambassadorCode,
    regional_director,
    ambassador_data: ambassadorData
  };
}

async function activateAmbassador(payment, reference) {
  const normalized = normalizeAmbassadorPayment(payment, reference);
  const ambassadorCode = normalized.ambassador_code;
  const ambassadorData = normalized.ambassador_data;
  payment = normalized;

  if (!ambassadorCode) {
    throw new Error(`Missing ambassador code for payment ${normalized.reference || reference || 'unknown'}`);
  }
  if (!ambassadorData) {
    throw new Error(`Missing ambassador_data for ${ambassadorCode}`);
  }
  if (!payment.email) {
    throw new Error(`Missing customer email for ${ambassadorCode}`);
  }

  let rdCodeForNewAmbassador = payment.regional_director || '';
  if (rdCodeForNewAmbassador.startsWith('AMB-')) {
    const recruiterSnap = await db.collection('ambassadors').doc(rdCodeForNewAmbassador).get();
    if (recruiterSnap.exists) {
      const recruiterRd = await resolveAmbassadorRdUpline(recruiterSnap.data());
      if (recruiterRd) rdCodeForNewAmbassador = recruiterRd;
    }
  }

  const existingAmb = await db.collection('ambassadors').doc(ambassadorCode).get();
  if (existingAmb.exists && existingAmb.data()?.status === 'active') {
    console.log(`[AMBASSADOR] ${ambassadorCode} already active — skipping account create`);
  } else {

  // Create ambassador account in Firestore
  const ambassadorAccount = {
    ...ambassadorData,
    ambassadorCode: ambassadorCode,
    code: ambassadorCode,  // For consistency with queries
    email: payment.email,  // Ensure email is included for login
    phone: payment.phone,  // Ensure phone is included
    recruitedBy: payment.regional_director?.startsWith('AMB-')
      ? payment.regional_director
      : (ambassadorData.recruitedBy || ''),
    senior_code: ambassadorData.senior_code ||
      (payment.regional_director?.startsWith('AMB-') ? payment.regional_director : ''),
    rdCode: rdCodeForNewAmbassador.startsWith('RD-') ? rdCodeForNewAmbassador : (ambassadorData.rdCode || ''),
    regional_director_code: rdCodeForNewAmbassador.startsWith('RD-')
      ? rdCodeForNewAmbassador
      : (ambassadorData.regional_director_code || ''),
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
  }

  // Recruitment bonuses — policy v2026-03-v3 (see docs/RECRUITMENT-BONUS-POLICY.md)
  const existingBonusSnap = await db.collection('admin_notifications')
    .where('ambassador_code', '==', ambassadorCode)
    .where('type', '==', 'rd_recruitment_bonus')
    .limit(1)
    .get();

  if (payment.regional_director && existingBonusSnap.empty) {
    try {
      await creditRecruitmentBonusesV2({
        db,
        newAmbassadorCode: ambassadorCode,
        newAmbassadorName: ambassadorData.fullName,
        directRecruiterCode: payment.regional_director,
        sendTelegram
      });
    } catch (error) {
      console.error('[RECRUITMENT] Bonus credit failed:', error.message);
      if (TELEGRAM_BOT_TOKEN) {
        await sendTelegram(
          `⚠️ Recruitment bonus failed for ${ambassadorCode}\n` +
          `Recruiter: ${payment.regional_director}\n` +
          `Error: ${error.message}\n` +
          `Policy: ${RECRUITMENT_POLICY_VERSION}`,
          false
        );
      }
    }
  }

  // Generate book download URL - use simple redirect to avoid SendGrid click tracking issues
  const paymentRef = payment.reference;
  const bookUrl = `https://us-central1-marriage-education.cloudfunctions.net/downloadBook?ref=${paymentRef}`;
  console.log(`[BOOK] Generated simple download URL for ${ambassadorCode}: ${bookUrl}`);
  
  // Send ambassador credentials + book link email
  const accessEmailResult = await sendAmbassadorAccessEmail({
    email: payment.email,
    ambassadorCode,
    ambassadorName: ambassadorData.fullName,
    bookUrl
  });
  const emailSent = accessEmailResult.sent;
  const emailError = accessEmailResult.error;

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
    await provisionSBDAccess(payment.email, ambassadorCode, ambassadorData.fullName, {
      rdCode: rdCodeForNewAmbassador.startsWith('RD-') ? rdCodeForNewAmbassador : undefined,
    });
    console.log(`[SBD] Access provisioned for ${ambassadorCode}`);
  } catch (sbdError) {
    console.error(`[SBD] Provisioning failed (non-critical) for ${ambassadorCode}:`, sbdError.message);
    const sbdOpts = {
      rdCode: rdCodeForNewAmbassador.startsWith('RD-') ? rdCodeForNewAmbassador : undefined,
    };
    try {
      await db.collection('ambassadors').doc(ambassadorCode).update({
        sbdProvisionPending: true,
        sbdProvisionLastError: sbdError.message,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await provisionSBDAccess(payment.email, ambassadorCode, ambassadorData.fullName, sbdOpts);
      await db.collection('ambassadors').doc(ambassadorCode).update({
        sbdProvisionPending: admin.firestore.FieldValue.delete(),
        sbdProvisionLastError: admin.firestore.FieldValue.delete(),
      });
      console.log(`[SBD] Retry succeeded for ${ambassadorCode}`);
      if (TELEGRAM_BOT_TOKEN) {
        await sendTelegram(
          `✅ SBD Network access repaired for ${ambassadorCode} (auto-retry after initial error).`,
          false
        );
      }
    } catch (retryErr) {
      console.error(`[SBD] Retry failed for ${ambassadorCode}:`, retryErr.message);
      if (TELEGRAM_BOT_TOKEN) {
        await sendTelegram(
          `⚠️ SBD provisioning queued for ${ambassadorCode}\n` +
          `Email: ${payment.email}\n` +
          `Error: ${retryErr.message}\n\n` +
          `Ambassador is active. Auto-repair will retry — no manual step needed.`,
          false
        );
      }
    }
  }

  console.log(`[COMPLETE] Ambassador ${ambassadorCode} activated and notified`);
}

/**
 * Re-run ambassador activation for an approved payment (admin recovery).
 */
async function reprocessAmbassadorActivationCore(reference) {
  const paymentDoc = await db.collection('pending_payments').doc(reference).get();
  if (!paymentDoc.exists) {
    throw new Error(`Payment not found: ${reference}`);
  }

  const payment = paymentDoc.data();
  if (payment.product_id !== 'ambassador-registration' && payment.type !== 'ambassador') {
    throw new Error('Not an ambassador registration payment');
  }

  await activateAmbassador(payment, reference);
  const normalized = normalizeAmbassadorPayment(payment, reference);

  return {
    success: true,
    ambassador_code: normalized.ambassador_code,
    message: 'Ambassador activation reprocessed'
  };
}

const { createPendingPaymentFulfillment } = require('./pending-payment-fulfillment');
let _paymentFulfillment = null;
function getPaymentFulfillment() {
  if (!_paymentFulfillment) {
    _paymentFulfillment = createPendingPaymentFulfillment({
      db,
      admin,
      writeUnifiedPaymentRecord,
      normalizeAmbassadorPayment,
      activateAmbassador,
      activateRD,
      trackAmbassadorSale,
      trackReferralSale,
      generateDownloadURL,
      sendDownloadEmail,
      sendTelegram,
      TELEGRAM_BOT_TOKEN,
      unlockSbdContent,
      sendSbdBuyerAccessEmail
    });
  }
  return _paymentFulfillment;
}

exports.reprocessAmbassadorActivation = functions.https.onCall(async (data, context) => {
  try {
    const reference = String(data?.reference || '').trim();
    if (!reference) {
      throw new functions.https.HttpsError('invalid-argument', 'reference is required');
    }
    return await reprocessAmbassadorActivationCore(reference);
  } catch (error) {
    console.error('reprocessAmbassadorActivation error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/** HTTP recovery endpoint (service-account auth) for admin scripts */
exports.reprocessAmbassadorActivationHttp = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const reference = String(req.body?.reference || req.query?.reference || '').trim();
    if (!reference) {
      return res.status(400).json({ error: 'reference is required' });
    }
    const result = await reprocessAmbassadorActivationCore(reference);
    return res.json(result);
  } catch (error) {
    console.error('reprocessAmbassadorActivationHttp error:', error);
    return res.status(500).json({ error: error.message });
  }
});

async function sendAmbassadorAccessEmail({ email, ambassadorCode, ambassadorName, bookUrl }) {
  try {
    const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString();

    await resend.emails.send({
      to: email,
      from: 'Marriage Education <orders@marriageducation.com>',
      subject: `Account Activated: ${ambassadorCode}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">🎉 Welcome, Ambassador!</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Your account is now active</p>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <p style="font-size: 16px; color: #333;">Dear ${ambassadorName || 'Ambassador'},</p>
            
            <p style="color: #555;">Congratulations! Your ambassador account has been approved and activated.</p>
            
            <div style="background: #fff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #667eea;">Your Credentials</h3>
              <p style="margin: 5px 0;"><strong>Ambassador Code:</strong> ${ambassadorCode}</p>
              <p style="margin: 5px 0;"><strong>Name:</strong> ${ambassadorName || 'Ambassador'}</p>
              <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
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
    });

    console.log(`[EMAIL] Ambassador credentials sent to ${email} via Resend`);
    return { sent: true, error: null };
  } catch (error) {
    console.error('[EMAIL ERROR] Failed to send ambassador access email:', error.message);
    return { sent: false, error: error.message };
  }
}

exports.resendAmbassadorAccessEmail = functions.https.onCall(async (data, context) => {
  try {
    const ambassadorCode = String(data?.ambassadorCode || '').trim();
    const email = String(data?.email || '').trim().toLowerCase();

    if (!ambassadorCode || !email) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: ambassadorCode, email');
    }

    let ambassadorDoc = await db.collection('ambassadors').doc(ambassadorCode).get();
    if (!ambassadorDoc.exists) {
      const pendingDoc = await db.collection('pending_payments').doc(ambassadorCode).get();
      if (pendingDoc.exists) {
        const pending = pendingDoc.data();
        const isCampay =
          pending.payment_channel === 'campay' || !!pending.campay_reference;
        if (
          (pending.status === 'approved' || isCampay) &&
          (pending.product_id === 'ambassador-registration' || pending.type === 'ambassador')
        ) {
          await getPaymentFulfillment().fulfillPendingPayment(ambassadorCode, {
            channel: isCampay ? 'campay' : pending.payment_channel || 'manual',
            payment_method: isCampay ? 'campay_momo' : 'momo',
            gateway_reference: pending.campay_reference || null,
            skipIfApproved: false
          });
          ambassadorDoc = await db.collection('ambassadors').doc(ambassadorCode).get();
        }
      }
    }

    if (!ambassadorDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Ambassador account not found. Complete payment first or contact support.'
      );
    }

    const ambassador = ambassadorDoc.data();
    const bookUrl = `https://us-central1-marriage-education.cloudfunctions.net/downloadBook?ref=${ambassadorCode}`;

    const sendResult = await sendAmbassadorAccessEmail({
      email,
      ambassadorCode,
      ambassadorName: ambassador.fullName || ambassador.name || 'Ambassador',
      bookUrl
    });

    if (!sendResult.sent) {
      throw new functions.https.HttpsError('internal', sendResult.error || 'Failed to resend access email.');
    }

    if (TELEGRAM_BOT_TOKEN) {
      const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString();
      await sendTelegram(
        `✅ AMBASSADOR ACCESS EMAIL RESENT\n\n` +
          `🎯 Code: ${ambassadorCode}\n` +
          `📧 Email: ${email}\n\n` +
          `📥 Book Download (expires ${expiryDate}):\n${bookUrl}\n\n` +
          `🔐 Dashboard: https://marriageducation.com/ambassador-login.html`,
        false
      );
    }

    return {
      success: true,
      message: 'Access email resent successfully.',
      ambassadorCode,
      email,
      book_url: bookUrl
    };
  } catch (error) {
    console.error('[EMAIL] resendAmbassadorAccessEmail error:', error.message);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'Failed to resend access email.');
  }
});

exports.resendAmbassadorStripeAccessEmail = functions.https.onCall(async (data, context) => {
  try {
    const ambassadorCode = String(data?.ambassadorCode || '').trim();
    const email = String(data?.email || '').trim().toLowerCase();

    if (!ambassadorCode || !email) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: ambassadorCode, email');
    }

    const stripePaymentDoc = await db.collection('stripe_payments').doc(ambassadorCode).get();
    if (!stripePaymentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Stripe payment record not found for this ambassador code.');
    }

    const stripePayment = stripePaymentDoc.data();
    if (stripePayment.payment_method !== 'stripe' || stripePayment.status !== 'approved') {
      throw new functions.https.HttpsError('failed-precondition', 'This ambassador is not eligible for Stripe access email resend.');
    }

    if (String(stripePayment.email || '').toLowerCase() !== email) {
      throw new functions.https.HttpsError('permission-denied', 'Email does not match the paid ambassador record.');
    }

    const ambassadorDoc = await db.collection('ambassadors').doc(ambassadorCode).get();
    if (!ambassadorDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Ambassador account not found.');
    }

    const ambassador = ambassadorDoc.data();
    const bookUrl = `https://us-central1-marriage-education.cloudfunctions.net/downloadBook?ref=${ambassadorCode}`;
    const sendResult = await sendAmbassadorAccessEmail({
      email,
      ambassadorCode,
      ambassadorName: ambassador.fullName || ambassador.name || 'Ambassador',
      bookUrl
    });

    if (!sendResult.sent) {
      throw new functions.https.HttpsError('internal', sendResult.error || 'Failed to resend access email.');
    }

    return { success: true, message: 'Access email resent successfully.', ambassadorCode, email };
  } catch (error) {
    console.error('[STRIPE] resendAmbassadorStripeAccessEmail error:', error.message);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'Failed to resend Stripe access email.');
  }
});

// ── SBD Network Access Provisioner ───────────────────────────────
// Called after ambassador / RD activation. Creates a Firebase Auth account
// on the same project (marriage-education) and writes a users/ doc so
// the seller can log into sbd-network.web.app with Foundation tier.
function deriveSbdReferralCode(sellerCode) {
  const c = String(sellerCode || '').trim().toUpperCase();
  if (!c) return null;
  if (c.startsWith('SBD-')) return c;
  if (c.startsWith('AMB-')) return c.replace(/^AMB-/, 'SBD-');
  if (c.startsWith('RD-')) return c.replace(/^RD-/, 'SBD-');
  return null;
}

function mapStripePriceToSbdProduct(priceId) {
  const pid = String(priceId || '').trim();
  if (!pid) return null;
  for (const [productId, meta] of Object.entries(SBD_CATALOG_SERVER)) {
    if (meta.stripePriceId && String(meta.stripePriceId).trim() === pid) {
      return productId;
    }
  }
  return null;
}

/**
 * Credit SBD tier subscription commissions (2026-04-v1). Idempotent per Stripe invoice id.
 */
async function handleSbdStripeInvoice(invoice) {
  if (!invoice || invoice.status !== 'paid') {
    return { credited: false, referralSkipReason: 'invoice_not_paid' };
  }

  const billingReason = invoice.billing_reason || '';
  if (billingReason !== 'subscription_cycle' && billingReason !== 'subscription_create') {
    return { credited: false, referralSkipReason: 'not_subscription_billing' };
  }

  let uid = invoice.metadata?.uid || null;
  let productId = resolveSbdProductId(invoice.metadata?.productId);

  if (invoice.subscription) {
    const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id;
    const sub = await stripe.subscriptions.retrieve(subId);
    uid = uid || sub.metadata?.uid || null;
    productId = productId || resolveSbdProductId(sub.metadata?.productId);
    if (!productId && sub.items?.data?.length) {
      productId = mapStripePriceToSbdProduct(sub.items.data[0].price?.id);
    }
  }

  if (!productId && invoice.lines?.data?.length) {
    productId = mapStripePriceToSbdProduct(invoice.lines.data[0].price?.id);
  }

  if (!uid && invoice.customer) {
    const custId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer.id;
    const snap = await db.collection('users').where('stripeCustomerId', '==', custId).limit(1).get();
    if (!snap.empty) uid = snap.docs[0].id;
  }

  if (!uid) {
    console.warn('[SBD] invoice commission skipped — no uid:', invoice.id);
    return { credited: false, referralSkipReason: 'no_uid' };
  }

  productId = resolveSbdProductId(productId);
  const rule = SBD_UNLOCK_RULES[productId];
  if (!rule?.tier) {
    return { credited: false, referralSkipReason: 'non_tier_product' };
  }

  const userSnap = await db.collection('users').doc(uid).get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const chargeKind = billingReason === 'subscription_create' ? 'initial' : 'renewal';

  return creditSbdSubscriptionCommissions({
    db,
    findSellerByReferralCode: findSellerBySbdReferralCode,
    uid,
    referralCode: userData.referredBy,
    productId,
    tierKey: rule.tier,
    idempotencyKey: `invoice_${invoice.id}`,
    chargeKind
  });
}

async function findSellerBySbdReferralCode(refCode) {
  let code = String(refCode || '').trim().toUpperCase();
  if (!code) return null;
  if (/^(AMB|RD|SNR|SBD)[_-]/.test(code)) code = code.replace(/_/g, '-');
  code = code.replace(/-+/g, '-');

  // Accept AMB-… / SNR-… and map to SBD-… for lookup
  if (code.startsWith('AMB-') || code.startsWith('SNR-')) {
    const ambDoc = await db.collection('ambassadors').doc(code.replace(/^SNR-/, 'AMB-')).get();
    if (ambDoc.exists) {
      return { type: 'ambassador', ref: ambDoc.ref, data: ambDoc.data(), id: ambDoc.id };
    }
    code = code.replace(/^(AMB|SNR)-/, 'SBD-');
  }

  const ambSnap = await db.collection('ambassadors')
    .where('sbdReferralCode', '==', code).limit(1).get();
  if (!ambSnap.empty) {
    const doc = ambSnap.docs[0];
    return { type: 'ambassador', ref: doc.ref, data: doc.data(), id: doc.id };
  }

  const rdSnap = await db.collection('regional_directors')
    .where('sbdReferralCode', '==', code).limit(1).get();
  if (!rdSnap.empty) {
    const doc = rdSnap.docs[0];
    return { type: 'rd', ref: doc.ref, data: doc.data(), id: doc.id };
  }

  if (code.startsWith('SBD-')) {
    const rdCode = code.replace(/^SBD-/, 'RD-');
    const rdDoc = await db.collection('regional_directors').doc(rdCode).get();
    if (rdDoc.exists) {
      return { type: 'rd', ref: rdDoc.ref, data: rdDoc.data(), id: rdDoc.id };
    }
    const ambFromSbd = code.replace(/^SBD-/, 'AMB-');
    const ambDoc = await db.collection('ambassadors').doc(ambFromSbd).get();
    if (ambDoc.exists) {
      return { type: 'ambassador', ref: ambDoc.ref, data: ambDoc.data(), id: ambDoc.id };
    }
  }

  return null;
}

/** Normalize operator codes to SBD-… form for users.referredBy */
function normalizeToSbdReferralCode(raw) {
  let code = normalizeSbdReferralCode(raw);
  if (!code) return '';
  if (code.startsWith('AMB-') || code.startsWith('SNR-')) {
    return code.replace(/^(AMB|SNR)-/, 'SBD-');
  }
  if (code.startsWith('RD-')) {
    return code.replace(/^RD-/, 'SBD-');
  }
  return code;
}

function firestoreSafeObject(obj) {
  const out = {};
  Object.keys(obj || {}).forEach((key) => {
    if (obj[key] !== undefined) out[key] = obj[key];
  });
  return out;
}

async function resolveRdCodeForSeller(sellerCodeUpper, options) {
  options = options || {};
  if (options.rdCode && String(options.rdCode).startsWith('RD-')) {
    return String(options.rdCode).trim().toUpperCase();
  }
  if (sellerCodeUpper.startsWith('RD-')) return sellerCodeUpper;
  if (!sellerCodeUpper.startsWith('AMB-')) return null;

  const ambSnap = await db.collection('ambassadors').doc(sellerCodeUpper).get();
  if (!ambSnap.exists) return null;
  return resolveAmbassadorRdUpline(ambSnap.data());
}

async function provisionSBDAccess(email, sellerCode, fullName, options) {
  options = options || {};
  const emailLower = (email || '').toLowerCase().trim();
  const sellerCodeUpper = String(sellerCode || '').trim().toUpperCase();
  const sbdReferralCode = deriveSbdReferralCode(sellerCodeUpper);
  if (!sbdReferralCode || !emailLower) {
    console.warn('[SBD] Skipping provision — missing email or seller code:', sellerCode);
    return;
  }

  const rdCodeForUser = await resolveRdCodeForSeller(sellerCodeUpper, options);

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

    // Send password-reset email so seller can set their own password
    const resetLink = await admin.auth().generatePasswordResetLink(emailLower);
    // Fire-and-forget — don't await so it can't block provisioning
    sendSBDWelcomeEmail(emailLower, fullName, sellerCodeUpper, sbdReferralCode, resetLink)
      .catch(e => console.error('[SBD] Welcome email failed:', e.message));
  }

  // 2. Write / merge users doc (SBD Network reads this for tier)
  // Never overwrite an existing admin role
  const existingDoc = await db.collection('users').doc(uid).get();
  const existingRole = existingDoc.exists ? existingDoc.data().role : null;
  if (existingRole !== 'admin') {
    const subscription = firestoreSafeObject({
      tier: 'foundation',
      status: 'active',
      source: 'ambassador',
      ambassadorCode: sellerCodeUpper.startsWith('AMB-') ? sellerCodeUpper : undefined,
      rdCode: rdCodeForUser || undefined,
    });

    await db.collection('users').doc(uid).set(firestoreSafeObject({
      uid,
      name: fullName,
      email: emailLower,
      tier: 'foundation',
      subscription,      role: 'member',
      sbdReferralCode,
      groups: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActive: admin.firestore.FieldValue.serverTimestamp(),
    }), { merge: true });
  }

  const sbdPatch = {
    sbdReferralCode,
    sbdAccessProvisioned: true,
    sbdUid: uid,
  };

  // 3. Write sbdReferralCode onto seller doc(s)
  if (sellerCodeUpper.startsWith('RD-')) {
    const rdRef = db.collection('regional_directors').doc(sellerCodeUpper);
    const rdSnap = await rdRef.get();
    const existingRefs = rdSnap.exists ? (rdSnap.data().sbdReferrals || {}) : {};
    await rdRef.set({
      ...sbdPatch,
      sbdReferrals: existingRefs.signups != null ? existingRefs : { signups: 0, subscribers: 0 },
    }, { merge: true });

    const ambCode = sellerCodeUpper.replace(/^RD-/, 'AMB-');
    const ambRef = db.collection('ambassadors').doc(ambCode);
    const ambSnap = await ambRef.get();
    if (ambSnap.exists) {
      const ambRefs = ambSnap.data().sbdReferrals || { signups: 0, subscribers: 0 };
      await ambRef.update({ ...sbdPatch, sbdReferrals: ambRefs });
    }
  } else if (sellerCodeUpper.startsWith('AMB-')) {
    const ambRef = db.collection('ambassadors').doc(sellerCodeUpper);
    const ambSnap = await ambRef.get();
    if (!ambSnap.exists) {
      console.warn('[SBD] Ambassador doc missing:', sellerCodeUpper);
      return;
    }
    const ambRefs = ambSnap.data().sbdReferrals || { signups: 0, subscribers: 0 };
    await ambRef.update({ ...sbdPatch, sbdReferrals: ambRefs });
  } else {
    console.warn('[SBD] Unrecognized seller code format:', sellerCodeUpper);
    return;
  }

  console.log(`[SBD] ${sellerCodeUpper} → uid:${uid} tier:foundation referral:${sbdReferralCode}`);
}

/** Repair active ambassadors/RDs missing SBD access (e.g. after undefined rdCode bug). */
async function repairUnprovisionedSbdAccessJob() {
  const result = { repaired: [], failed: [], skipped: 0 };

  async function tryProvision(code, data, collection) {
    const status = String(data.status || '').toLowerCase();
    if (status !== 'active' && status !== 'approved') {
      result.skipped++;
      return;
    }
    if (data.sbdAccessProvisioned === true) {
      result.skipped++;
      return;
    }
    const email = (data.email || data.contactEmail || '').toLowerCase().trim();
    if (!email) {
      result.failed.push({ code, collection, error: 'missing email' });
      return;
    }
    const name = data.fullName || data.name || email;
    try {
      const rdCode = collection === 'ambassadors'
        ? await resolveRdCodeForSeller(code, {})
        : code;
      await provisionSBDAccess(email, code, name, {
        rdCode: rdCode && String(rdCode).startsWith('RD-') ? rdCode : undefined,
      });
      result.repaired.push(code);
      console.log(`[SBD REPAIR] OK ${code}`);
    } catch (err) {
      result.failed.push({ code, collection, error: err.message });
      console.error(`[SBD REPAIR] FAIL ${code}:`, err.message);
    }
  }

  const ambSnap = await db.collection('ambassadors').get();
  for (const doc of ambSnap.docs) {
    if (!doc.id.startsWith('AMB-')) continue;
    await tryProvision(doc.id, doc.data(), 'ambassadors');
  }

  const rdSnap = await db.collection('regional_directors').get();
  for (const doc of rdSnap.docs) {
    if (!doc.id.startsWith('RD-')) continue;
    await tryProvision(doc.id, doc.data(), 'regional_directors');
  }

  return result;
}

exports.repairUnprovisionedSbdAccess = functions.runWith({ timeoutSeconds: 300, memory: '512MB' })
  .https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    try {
      const result = await repairUnprovisionedSbdAccessJob();
      res.status(200).json({ ok: true, ...result });
    } catch (err) {
      console.error('[SBD REPAIR]', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

exports.scheduledSbdProvisionRepair = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async () => {
    const result = await repairUnprovisionedSbdAccessJob();
    console.log('[SBD REPAIR] scheduled run', JSON.stringify({
      repaired: result.repaired.length,
      failed: result.failed.length,
      skipped: result.skipped,
    }));
    return null;
  });

exports.autoRepairSbdAccessOnAmbassador = functions.firestore
  .document('ambassadors/{code}')
  .onWrite(async (change, context) => {
    const after = change.after.exists ? change.after.data() : null;
    if (!after) return null;
    const code = context.params.code;
    if (!code.startsWith('AMB-')) return null;
    if (after.sbdAccessProvisioned === true) return null;
    if (after.sbdProvisionInProgress === true) return null;
    if (after.sbdProvisionPending !== true) return null;

    const email = (after.email || after.contactEmail || '').toLowerCase().trim();
    if (!email) return null;

    const ref = change.after.ref;
    try {
      await ref.update({ sbdProvisionInProgress: true });
      const rdCode = await resolveRdCodeForSeller(code, {});
      await provisionSBDAccess(email, code, after.fullName || after.name || email, {
        rdCode: rdCode && String(rdCode).startsWith('RD-') ? rdCode : undefined,
      });
      await ref.update({
        sbdProvisionInProgress: admin.firestore.FieldValue.delete(),
        sbdProvisionPending: admin.firestore.FieldValue.delete(),
        sbdProvisionLastError: admin.firestore.FieldValue.delete(),
      });
      console.log(`[SBD] Trigger repair OK ${code}`);
    } catch (err) {
      console.error(`[SBD] Trigger repair FAIL ${code}:`, err.message);
      await ref.update({
        sbdProvisionInProgress: admin.firestore.FieldValue.delete(),
        sbdProvisionLastError: err.message,
      });
    }
    return null;
  });

async function sendSBDWelcomeEmail(email, fullName, ambassadorCode, sbdReferralCode, resetLink) {
  const referralLink = `https://sbd-network.web.app/auth?ref=${sbdReferralCode}`;

  await resend.emails.send({
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

/**
 * Welcome email for DTC 12-Month Foundation Access (and other guest) buyers.
 */
async function sendSbdBuyerAccessEmail(opts) {
  const email = String(opts.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Missing buyer email for welcome message');
  }
  const name = String(opts.name || '').trim() || 'Student';
  const productName = opts.productName || 'Foundation Access — 12 Months';
  const learnUrl = 'https://sbd-network.web.app/learn?tier=foundation';
  const loginUrl = 'https://sbd-network.web.app/auth';
  const resetLink = await admin.auth().generatePasswordResetLink(email, {
    url: learnUrl
  });

  await resend.emails.send({
    to: email,
    from: 'Marriage Education <orders@marriageducation.com>',
    subject: `Your Foundation Access is ready — School 1 for 12 months`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#0a3d32 0%,#00b894 100%);color:#fff;padding:32px;text-align:center;">
          <p style="margin:0;letter-spacing:0.12em;text-transform:uppercase;font-size:12px;opacity:0.85;">Marriage Education</p>
          <h1 style="margin:10px 0 0;font-size:26px;">Foundation Access — Yearly</h1>
          <p style="margin:10px 0 0;opacity:0.9;">One payment. Twelve months. School 1 on SBD Network.</p>
        </div>
        <div style="padding:30px;background:#f7faf9;">
          <p style="font-size:16px;color:#333;">Dear ${name},</p>
          <p style="color:#555;">Thank you for purchasing <strong>${productName}</strong>. Your Foundation-tier access is active on the SBD Network.</p>

          <div style="background:#fff;border-left:4px solid #00b894;padding:16px;margin:22px 0;">
            <h3 style="margin:0 0 10px;color:#0a3d32;">Your login</h3>
            <p style="margin:6px 0;"><strong>App:</strong> <a href="${learnUrl}">sbd-network.web.app/learn?tier=foundation</a></p>
            <p style="margin:6px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin:6px 0;"><strong>Password:</strong> Set it with the button below (required once)</p>
          </div>

          <div style="text-align:center;margin:28px 0;">
            <a href="${resetLink}" style="display:inline-block;background:#00b894;color:#fff;font-weight:700;padding:14px 32px;text-decoration:none;border-radius:8px;font-size:15px;">Set password &amp; open Foundation →</a>
          </div>

          <p style="color:#555;font-size:14px;">Already have a password? <a href="${loginUrl}">Sign in here</a>, then go to Foundation.</p>
          <p style="color:#777;font-size:13px;margin-top:24px;">Questions? Contact <a href="mailto:orders@marriageducation.com">orders@marriageducation.com</a></p>
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
 * Idempotent: persist Stripe payment, activate ambassador, notify Telegram.
 * Skips duplicate work when stripe_payments is already approved.
 */
async function processSuccessfulAmbassadorStripePayment(paymentIntent, { email, ambassadorData } = {}) {
  const ambassadorCode = paymentIntent.metadata?.ambassadorCode;
  if (!ambassadorCode) {
    throw new Error('Missing ambassador code in Stripe metadata');
  }

  const meta = paymentIntent.metadata || {};
  const resolvedEmail = String(
    email || meta.email || paymentIntent.receipt_email || ''
  ).trim().toLowerCase();

  let parsedAmbassadorData = ambassadorData || null;
  if (!parsedAmbassadorData && meta.ambassadorData) {
    try {
      parsedAmbassadorData = JSON.parse(meta.ambassadorData);
    } catch (e) {
      console.warn('[STRIPE] Failed to parse ambassadorData from metadata:', e.message);
    }
  }
  if (!parsedAmbassadorData) {
    parsedAmbassadorData = {
      fullName: meta.fullName || 'Ambassador',
      email: resolvedEmail,
      phone: meta.phone || ''
    };
  }

  const existingPaymentDoc = await db.collection('stripe_payments').doc(ambassadorCode).get();
  const alreadyApproved = existingPaymentDoc.exists && existingPaymentDoc.data()?.status === 'approved';

  const stripeRecruiterRaw =
    meta.recruitedBy || parsedAmbassadorData.regional_director_code || parsedAmbassadorData.recruitedBy || '';
  const stripeRecruiter = normalizeReferralCode(stripeRecruiterRaw);
  const paymentForActivation = {
    reference: ambassadorCode,
    ambassador_code: ambassadorCode,
    email: resolvedEmail,
    phone: meta.phone || parsedAmbassadorData.phone || '',
    regional_director: stripeRecruiter,
    ambassador_data: applyRecruiterFieldsToAmbassadorData(parsedAmbassadorData, stripeRecruiter)
  };

  if (!alreadyApproved) {
    await db.collection('stripe_payments').doc(ambassadorCode).set({
      reference: ambassadorCode,
      payment_intent_id: paymentIntent.id,
      product_id: 'ambassador-registration',
      product_name: 'Ambassador Registration',
      amount: Math.round(paymentIntent.amount / 100),
      currency: paymentIntent.currency || 'usd',
      email: resolvedEmail,
      phone: paymentForActivation.phone,
      type: 'ambassador',
      payment_method: 'stripe',
      status: 'approved',
      ambassador_code: ambassadorCode,
      regional_director: paymentForActivation.regional_director,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      approved_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await writeUnifiedPaymentRecord({
      source: 'stripe_ambassador',
      reference: ambassadorCode,
      external_reference: paymentIntent.id,
      record_type: 'customer_payment',
      channel: 'stripe',
      payment_method: 'card',
      payment_category: 'ambassador-registration',
      product_id: 'ambassador-registration',
      product_name: 'Ambassador Registration',
      amount: Math.round(paymentIntent.amount / 100),
      currency: paymentIntent.currency || 'usd',
      customer_email: resolvedEmail,
      customer_phone: paymentForActivation.phone,
      ambassador_code: ambassadorCode,
      recruiter_code: paymentForActivation.regional_director,
      status: 'approved',
      action_required: false,
      approved_at: admin.firestore.FieldValue.serverTimestamp(),
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });

    await activateAmbassador(paymentForActivation);

    if (TELEGRAM_BOT_TOKEN) {
      const activationMsg = `✅ AMBASSADOR ACTIVATED (Auto via Stripe)\n\n` +
        `🎯 Code: ${ambassadorCode}\n` +
        `👤 Name: ${paymentForActivation.ambassador_data?.fullName || 'N/A'}\n` +
        `📧 Email: ${resolvedEmail}\n` +
        `💰 Amount: $${(paymentIntent.amount / 100).toFixed(2)} ${(paymentIntent.currency || 'USD').toUpperCase()}\n` +
        `👑 Recruited By: ${paymentForActivation.regional_director || 'None'}\n\n` +
        `🔗 Dashboard: https://marriageducation.com/ambassador/dashboard.html`;
      await sendTelegram(activationMsg, false);
    }

    console.log('[STRIPE] ✅ Ambassador activated via Stripe:', ambassadorCode);
  } else {
    console.log('[STRIPE] Ambassador payment already approved:', ambassadorCode);
  }

  return { ambassadorCode, alreadyApproved };
}

/**
 * Finalize ambassador registration after client-side 3DS (SCA) completes.
 */
exports.completeAmbassadorStripePayment = functions.https.onCall(async (data, context) => {
  try {
    const paymentIntentId = String(data?.paymentIntentId || '').trim();
    const ambassadorCode = String(data?.ambassadorCode || '').trim();
    const email = String(data?.email || '').trim().toLowerCase();
    const ambassadorData = data?.ambassadorData || null;

    if (!paymentIntentId || !ambassadorCode || !email) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: paymentIntentId, ambassadorCode, email');
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.metadata?.type !== 'ambassador') {
      throw new functions.https.HttpsError('failed-precondition', 'Not an ambassador registration payment.');
    }
    if (paymentIntent.metadata?.ambassadorCode !== ambassadorCode) {
      throw new functions.https.HttpsError('permission-denied', 'Payment does not match ambassador code.');
    }

    const piEmail = String(paymentIntent.metadata?.email || paymentIntent.receipt_email || '').trim().toLowerCase();
    if (piEmail && piEmail !== email) {
      throw new functions.https.HttpsError('permission-denied', 'Email does not match payment record.');
    }

    if (paymentIntent.status !== 'succeeded') {
      return {
        success: false,
        status: paymentIntent.status,
        error: 'Payment has not completed yet.'
      };
    }

    await processSuccessfulAmbassadorStripePayment(paymentIntent, { email, ambassadorData });

    return {
      success: true,
      status: 'succeeded',
      paymentIntentId,
      ambassadorCode
    };
  } catch (error) {
    console.error('[STRIPE] completeAmbassadorStripePayment error:', error.message);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'Failed to complete ambassador payment.');
  }
});

/**
 * Create Stripe PaymentIntent for Ambassador Registration
 * Frontend calls this to get clientSecret for card payment
 */
exports.createAmbassadorCheckout = functions.https.onCall(async (data, context) => {
  try {
    const {
      paymentMethodId,
      email,
      currency,
      allowOneUsdTest,
      ambassadorCode,
      ambassadorData,
      description
    } = data;

    if (!paymentMethodId || !email || !ambassadorCode) {
      throw new Error('Missing required fields: paymentMethodId, email, ambassadorCode');
    }

    const requestedCurrency = String(currency || 'usd').toLowerCase();
    if (requestedCurrency !== 'usd') {
      throw new functions.https.HttpsError('invalid-argument', 'Only USD is supported for Stripe ambassador checkout.');
    }

    // Do not trust client amount. Default charge is $30; allow $1 only when explicit test flag is set.
    const resolvedAmount = allowOneUsdTest === true ? 100 : 3000;

    const ambassadorMetadata = {
      type: 'ambassador',
      ambassadorCode: String(ambassadorCode).slice(0, 100),
      email: String(email || '').slice(0, 200),
      phone: String(ambassadorData?.phone || '').slice(0, 50),
      fullName: String(
        ambassadorData?.fullName ||
        `${ambassadorData?.firstName || ''} ${ambassadorData?.lastName || ''}`.trim()
      ).slice(0, 200),
      recruitedBy: String(ambassadorData?.regional_director_code || ambassadorData?.recruitedBy || '').slice(0, 100)
    };

    const paymentIntent = await stripe.paymentIntents.create({
      amount: resolvedAmount,
      currency: requestedCurrency,
      payment_method: paymentMethodId,
      confirm: true,
      receipt_email: email,
      description: description || `Ambassador Registration - ${ambassadorCode}`,
      metadata: ambassadorMetadata,
      return_url: `https://marriageducation.com/ambassador/stripe-confirmation.html?code=${ambassadorCode}&email=${encodeURIComponent(email)}`
    });

    console.log('[STRIPE] PaymentIntent created:', paymentIntent.id, 'status:', paymentIntent.status);

    if (paymentIntent.status === 'succeeded') {
      await processSuccessfulAmbassadorStripePayment(paymentIntent, { email, ambassadorData });
      return {
        success: true,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        chargedAmount: resolvedAmount,
        chargedCurrency: requestedCurrency
      };
    }

    if (paymentIntent.status === 'requires_action') {
      return {
        success: false,
        requiresAction: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status
      };
    }

    return {
      success: false,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      error: 'Payment was not completed. Please try again or use a different card.'
    };
  } catch (error) {
    console.error('[STRIPE] createAmbassadorCheckout error:', error.message);
    // Return card/user errors as client-actionable responses instead of generic 500.
    if (error?.type === 'StripeCardError' || error?.raw?.type === 'card_error') {
      throw new functions.https.HttpsError('failed-precondition', error.message || 'Card payment failed.');
    }
    if (error?.type === 'StripeInvalidRequestError' || error?.raw?.type === 'invalid_request_error') {
      throw new functions.https.HttpsError('invalid-argument', error.message || 'Invalid payment request.');
    }
    throw new functions.https.HttpsError('internal', error.message || 'Payment processing error.');
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

const SBD_STRIPE_PRICE_IDS = {
  'foundation-monthly': process.env.SBD_PRICE_FOUNDATION_MONTHLY_V2 || '',
  'foundation-yearly': process.env.SBD_PRICE_FOUNDATION_YEARLY || '',
  'foundation-1year': process.env.SBD_PRICE_FOUNDATION_1YEAR || '',
  'foundation-2year': process.env.SBD_PRICE_FOUNDATION_2YEAR || '',
  'premium-monthly': process.env.SBD_PRICE_PREMIUM_MONTHLY || '',
  'elite-monthly': process.env.SBD_PRICE_ELITE_MONTHLY || '',
  'teleios-blueprint': process.env.SBD_PRICE_TELEIOS_BLUEPRINT || '',
  'starter-bundle': process.env.SBD_PRICE_STARTER_BUNDLE || '',  'teleios-bundle': process.env.SBD_PRICE_TELEIOS_BUNDLE || '',
  'elite-bundle': process.env.SBD_PRICE_ELITE_BUNDLE || '',
  'sbd-dummies': process.env.SBD_PRICE_SBD_DUMMIES || '',
  'the-woman-the-wife-the-mother': process.env.SBD_PRICE_THE_WOMAN_THE_WIFE_THE_MOTHER_BUNDLE || process.env.SBD_PRICE_THE_WOMAN_THE_WIFE_THE_MOTHER || '',
  'the-woman-the-wife-the-mother-book': process.env.SBD_PRICE_THE_WOMAN_THE_WIFE_THE_MOTHER_BOOK || '',
  'the-woman-the-wife-the-mother-course': process.env.SBD_PRICE_THE_WOMAN_THE_WIFE_THE_MOTHER_COURSE || '',
  'the-woman-the-wife-the-mother-bundle': process.env.SBD_PRICE_THE_WOMAN_THE_WIFE_THE_MOTHER_BUNDLE || '',
  'the-sex-by-design-compendium': process.env.SBD_PRICE_THE_SEX_BY_DESIGN_COMPENDIUM || '',
  'sbd-dummies-digital-print': process.env.SBD_PRICE_SBD_DUMMIES_DIGITAL_PRINT || '',
  'sbd-canonical': process.env.SBD_PRICE_SBD_CANONICAL || '',
  'sbd-standard': process.env.SBD_PRICE_SBD_STANDARD || '',
  'sbd-real-couples': process.env.SBD_PRICE_SBD_REAL_COUPLES || '',
  'sbd-the-heart-of-relationship': process.env.SBD_PRICE_SBD_THE_HEART_OF_RELATIONSHIP || '',
  'sbd-unequally-yoked-together': process.env.SBD_PRICE_SBD_UNEQUALLY_YOKED_TOGETHER || '',
  'sbd-2-the-impregnable-assemblage': process.env.SBD_PRICE_SBD_2_THE_IMPREGNABLE_ASSEMBLAGE || '',
  'marriage-porn-beyond': process.env.SBD_PRICE_MARRIAGE_PORN_BEYOND || '',
  'naked-and-not-ashamed': process.env.SBD_PRICE_NAKED_AND_NOT_ASHAMED || '',
  'marriage-equals-sexuality': process.env.SBD_PRICE_MARRIAGE_EQUALS_SEXUALITY || '',
  'the-arts-of-marriage': process.env.SBD_PRICE_THE_ARTS_OF_MARRIAGE || '',
  'the-art-of-sexuality': process.env.SBD_PRICE_THE_ART_OF_SEXUALITY || '',
  'the-art-of-seduction': process.env.SBD_PRICE_THE_ART_OF_SEDUCTION || '',
  'the-art-of-fucking': process.env.SBD_PRICE_THE_ART_OF_FUCKING || '',
  'sbd-magazine-annual-subscription': process.env.SBD_PRICE_SBD_MAGAZINE_ANNUAL_SUBSCRIPTION || '',
  'sbd-magazine-single-issue': process.env.SBD_PRICE_SBD_MAGAZINE_SINGLE_ISSUE || '',
  'sbd-digital-archive-access': process.env.SBD_PRICE_SBD_DIGITAL_ARCHIVE_ACCESS || '',
  'complete-sbd-library': process.env.SBD_PRICE_COMPLETE_SBD_LIBRARY || '',
  'sbd-complete-package': process.env.SBD_PRICE_SBD_COMPLETE_PACKAGE || '',
  'arts-of-marriage-collection': process.env.SBD_PRICE_ARTS_OF_MARRIAGE_COLLECTION || '',
  'marriage-foundation-bundle': process.env.SBD_PRICE_MARRIAGE_FOUNDATION_BUNDLE || '',
  'sbd-starter-magazine': process.env.SBD_PRICE_SBD_STARTER_MAGAZINE || '',
  'newlywed-special': process.env.SBD_PRICE_NEWLYWED_SPECIAL || '',
  'anniversary-celebration': process.env.SBD_PRICE_ANNIVERSARY_CELEBRATION || '',
  'sexual-literacy-101': process.env.SBD_PRICE_SEXUAL_LITERACY_101 || '',
  'anatomy-of-desire': process.env.SBD_PRICE_ANATOMY_OF_DESIRE || '',
  'teleios-blueprint-mini': process.env.SBD_PRICE_TELEIOS_BLUEPRINT_MINI || '',
  'marriage-builds-nations-intro': process.env.SBD_PRICE_MARRIAGE_BUILDS_NATIONS_INTRO || '',
  'sbd-dummies-course-13wk': process.env.SBD_PRICE_SBD_DUMMIES_COURSE_13WK || '',
  'sbd-dummies-core-curriculum': process.env.SBD_PRICE_SBD_DUMMIES_CORE_CURRICULUM || '',
  'art-of-marriage-course': process.env.SBD_PRICE_ART_OF_MARRIAGE_COURSE || '',
  'sexual-mastery-bundle': process.env.SBD_PRICE_SEXUAL_MASTERY_BUNDLE || '',
  'teleios-development-bundle': process.env.SBD_PRICE_TELEIOS_DEVELOPMENT_BUNDLE || '',
  'marriage-governance-bundle': process.env.SBD_PRICE_MARRIAGE_GOVERNANCE_BUNDLE || '',
  'teleios-blueprint-full': process.env.SBD_PRICE_TELEIOS_BLUEPRINT_FULL || '',
  'teleios-level-2': process.env.SBD_PRICE_TELEIOS_LEVEL_2 || '',
  'anthropology-of-wholeness': process.env.SBD_PRICE_ANTHROPOLOGY_OF_WHOLENESS || '',
  'identity-mastery': process.env.SBD_PRICE_IDENTITY_MASTERY || '',
  'four-faculties-training': process.env.SBD_PRICE_FOUR_FACULTIES_TRAINING || '',
  'anthropocentric-development': process.env.SBD_PRICE_ANTHROPOCENTRIC_DEVELOPMENT || '',
  'personal-development-masterclass': process.env.SBD_PRICE_PERSONAL_DEVELOPMENT_MASTERCLASS || '',
  'science-of-self-command': process.env.SBD_PRICE_SCIENCE_OF_SELF_COMMAND || '',
  'heart-of-relationship-l1': process.env.SBD_PRICE_HEART_OF_RELATIONSHIP_L1 || '',
  'relationship-relatednesses-l2': process.env.SBD_PRICE_RELATIONSHIP_RELATEDNESSES_L2 || '',
  'relationship-mastery-intensive-l3': process.env.SBD_PRICE_RELATIONSHIP_MASTERY_INTENSIVE_L3 || '',
  'perfect-self-program': process.env.SBD_PRICE_PERFECT_SELF_PROGRAM || '',
  'emotional-literacy': process.env.SBD_PRICE_EMOTIONAL_LITERACY || '',
  'temperament-intelligence': process.env.SBD_PRICE_TEMPERAMENT_INTELLIGENCE || '',
  'sex-equals-marriage': process.env.SBD_PRICE_SEX_EQUALS_MARRIAGE || '',
  'sexual-self': process.env.SBD_PRICE_SEXUAL_SELF || '',
  'course-art-of-sexuality': process.env.SBD_PRICE_COURSE_ART_OF_SEXUALITY || '',
  'course-art-of-seduction': process.env.SBD_PRICE_COURSE_ART_OF_SEDUCTION || '',
  'course-art-of-nakedness': process.env.SBD_PRICE_COURSE_ART_OF_NAKEDNESS || '',
  'sexual-imagination-pics-pearls': process.env.SBD_PRICE_SEXUAL_IMAGINATION_PICS_PEARLS || '',
  'conjugal-intelligence-masterclass': process.env.SBD_PRICE_CONJUGAL_INTELLIGENCE_MASTERCLASS || '',
  'arousal-mastery': process.env.SBD_PRICE_AROUSAL_MASTERY || '',
  'course-art-of-fucking': process.env.SBD_PRICE_COURSE_ART_OF_FUCKING || '',
  'erotic-devotion-song-of-solomon': process.env.SBD_PRICE_EROTIC_DEVOTION_SONG_OF_SOLOMON || '',
  'nakedness-muliebrity': process.env.SBD_PRICE_NAKEDNESS_MULIEBRITY || '',
  'nakedness-virility': process.env.SBD_PRICE_NAKEDNESS_VIRILITY || '',
  'bedroom-governance': process.env.SBD_PRICE_BEDROOM_GOVERNANCE || '',
  'marriage-porn-beyond-course-individual': process.env.SBD_PRICE_MARRIAGE_PORN_BEYOND_COURSE_INDIVIDUAL || '',
  'marriage-porn-beyond-course-couple': process.env.SBD_PRICE_MARRIAGE_PORN_BEYOND_COURSE_COUPLE || '',
  'marriage-system-design': process.env.SBD_PRICE_MARRIAGE_SYSTEM_DESIGN || '',
  'covenant-governance': process.env.SBD_PRICE_COVENANT_GOVERNANCE || '',
  'fidelity-curriculum': process.env.SBD_PRICE_FIDELITY_CURRICULUM || '',
  'communication-covenant-couples': process.env.SBD_PRICE_COMMUNICATION_COVENANT_COUPLES || '',
  'conflict-mastery': process.env.SBD_PRICE_CONFLICT_MASTERY || '',
  'household-management': process.env.SBD_PRICE_HOUSEHOLD_MANAGEMENT || '',
  'daily-liturgies-marriage': process.env.SBD_PRICE_DAILY_LITURGIES_MARRIAGE || '',
  'one-flesh-intensive': process.env.SBD_PRICE_ONE_FLESH_INTENSIVE || '',
  'marriage-builds-nations': process.env.SBD_PRICE_MARRIAGE_BUILDS_NATIONS || '',
  'political-theology-of-home': process.env.SBD_PRICE_POLITICAL_THEOLOGY_OF_HOME || '',
  'family-systems-architecture': process.env.SBD_PRICE_FAMILY_SYSTEMS_ARCHITECTURE || '',
  'parenting-teleios': process.env.SBD_PRICE_PARENTING_TELEIOS || '',
  'raising-sexual-literacy-children': process.env.SBD_PRICE_RAISING_SEXUAL_LITERACY_CHILDREN || '',
  'family-culture-flourishing': process.env.SBD_PRICE_FAMILY_CULTURE_FLOURISHING || '',
  'civilizational-intelligence-masterclass': process.env.SBD_PRICE_CIVILIZATIONAL_INTELLIGENCE_MASTERCLASS || '',
  'human-rights-marriage-udhr16': process.env.SBD_PRICE_HUMAN_RIGHTS_MARRIAGE_UDHR16 || '',
  'diploma-sexual-literacy-conjugal': process.env.SBD_PRICE_DIPLOMA_SEXUAL_LITERACY_CONJUGAL || '',
  'diploma-teleios-personal-development': process.env.SBD_PRICE_DIPLOMA_TELEIOS_PERSONAL_DEVELOPMENT || '',
  'sbd-certified-facilitator': process.env.SBD_PRICE_SBD_CERTIFIED_FACILITATOR || '',
  'private-coaching-hourly': process.env.SBD_PRICE_PRIVATE_COACHING_HOURLY || '',
  'marriage-labs-weekend': process.env.SBD_PRICE_MARRIAGE_LABS_WEEKEND || '',
  'sbd-academy-lifetime-pass': process.env.SBD_PRICE_SBD_ACADEMY_LIFETIME_PASS || '',
};

const SBD_CATALOG_SERVER = {
  'foundation-monthly': { name: 'Foundation School — Monthly', amount: 1100, mode: 'subscription', interval: 'month', tier: 'foundation', revenueBaseFCFA: 5000, stripePriceId: SBD_STRIPE_PRICE_IDS['foundation-monthly'] },
  'foundation-yearly': { name: 'Foundation School — One-Time Access', amount: 14417, mode: 'payment', tier: 'foundation', months: 12, revenueBaseFCFA: 5000, stripePriceId: SBD_STRIPE_PRICE_IDS['foundation-yearly'] },
  'foundation-1year': { name: 'Foundation School — 1-Year Subscription', amount: 1500, mode: 'subscription', interval: 'month', termMonths: 12, tier: 'foundation', revenueBaseFCFA: 5000, stripePriceId: SBD_STRIPE_PRICE_IDS['foundation-1year'] },
  'foundation-2year': { name: 'Foundation School — 2-Year Subscription', amount: 1100, mode: 'subscription', interval: 'month', termMonths: 24, tier: 'foundation', revenueBaseFCFA: 5000, stripePriceId: SBD_STRIPE_PRICE_IDS['foundation-2year'] },
  'premium-monthly': { name: 'Premium Tier', amount: 2000, mode: 'subscription', tier: 'premium', revenueBaseFCFA: 5000, stripePriceId: SBD_STRIPE_PRICE_IDS['premium-monthly'] },
  'elite-monthly': { name: 'Elite Tier', amount: 5000, mode: 'subscription', tier: 'elite', revenueBaseFCFA: 5000, stripePriceId: SBD_STRIPE_PRICE_IDS['elite-monthly'] },
  'teleios-blueprint': { name: 'Teleios Blueprint (Book)', amount: 24700, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['teleios-blueprint'] },
  'starter-bundle': { name: 'Starter Bundle', amount: 3700, mode: 'payment', tier: 'premium', stripePriceId: SBD_STRIPE_PRICE_IDS['starter-bundle'] },
  'teleios-bundle': { name: 'Teleios Bundle', amount: 29700, mode: 'payment', tier: 'premium', stripePriceId: SBD_STRIPE_PRICE_IDS['teleios-bundle'] },
  'elite-bundle': { name: 'Elite Formation Bundle', amount: 49700, mode: 'payment', tier: 'elite', stripePriceId: SBD_STRIPE_PRICE_IDS['elite-bundle'] },
  'sbd-dummies': { name: 'SBD for Dummies', amount: 2700, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sbd-dummies'] },
  'the-woman-the-wife-the-mother-book': { name: 'The Woman, The Wife, The Mother — Book', amount: 5000, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['the-woman-the-wife-the-mother-book'] },
  'the-woman-the-wife-the-mother-course': { name: 'The Woman, The Wife, The Mother — 13-Week Formation', amount: 25000, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['the-woman-the-wife-the-mother-course'] },
  'the-woman-the-wife-the-mother-bundle': { name: 'The Woman, The Wife, The Mother — Book + Course', amount: 30000, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['the-woman-the-wife-the-mother-bundle'] },
  'the-woman-the-wife-the-mother': { name: 'The Woman, The Wife, The Mother — Book + Course', amount: 30000, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['the-woman-the-wife-the-mother-bundle'] },
  'the-sex-by-design-compendium': { name: 'The Sex by Design Compendium', amount: 3499, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['the-sex-by-design-compendium'] },
  'sbd-dummies-digital-print': { name: 'SBD for Dummies — Digital + Print', amount: 4000, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sbd-dummies-digital-print'] },
  'sbd-canonical': { name: 'SBD Canonical', amount: 2999, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sbd-canonical'] },
  'sbd-standard': { name: 'SBD Standard', amount: 2499, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sbd-standard'] },
  'sbd-real-couples': { name: 'SBD Real Couples', amount: 2499, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sbd-real-couples'] },
  'sbd-the-heart-of-relationship': { name: 'SBD The Heart of Relationship', amount: 2499, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sbd-the-heart-of-relationship'] },
  'sbd-unequally-yoked-together': { name: 'SBD Unequally Yoked Together', amount: 2499, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sbd-unequally-yoked-together'] },
  'sbd-2-the-impregnable-assemblage': { name: 'SBD 2 — The Impregnable Assemblage', amount: 2999, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sbd-2-the-impregnable-assemblage'] },
  'marriage-porn-beyond': { name: 'Marriage=Porn & Beyond', amount: 2999, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['marriage-porn-beyond'] },
  'naked-and-not-ashamed': { name: 'Naked & Not Ashamed', amount: 2499, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['naked-and-not-ashamed'] },
  'marriage-equals-sexuality': { name: 'Marriage = Sexuality', amount: 2499, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['marriage-equals-sexuality'] },
  'the-arts-of-marriage': { name: 'The Arts of Marriage', amount: 2499, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['the-arts-of-marriage'] },
  'the-art-of-sexuality': { name: 'The Art of Sexuality', amount: 2499, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['the-art-of-sexuality'] },
  'the-art-of-seduction': { name: 'The Art of Seduction', amount: 2499, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['the-art-of-seduction'] },
  'the-art-of-fucking': { name: 'The Art of Fucking', amount: 2499, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['the-art-of-fucking'] },
  'sbd-magazine-annual-subscription': { name: 'SBD Magazine — Annual Subscription', amount: 5000, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sbd-magazine-annual-subscription'] },
  'sbd-magazine-single-issue': { name: 'SBD Magazine — Single Issue', amount: 2000, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sbd-magazine-single-issue'] },
  'sbd-digital-archive-access': { name: 'SBD Digital Archive Access', amount: 3000, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sbd-digital-archive-access'] },
  'complete-sbd-library': { name: 'Complete SBD Library', amount: 500000, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['complete-sbd-library'] },
  'sbd-complete-package': { name: 'SBD for Dummies Complete Package', amount: 41700, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sbd-complete-package'] },
  'arts-of-marriage-collection': { name: 'Arts of Marriage Complete Collection', amount: 5999, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['arts-of-marriage-collection'] },
  'marriage-foundation-bundle': { name: 'Marriage Foundation Bundle', amount: 5499, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['marriage-foundation-bundle'] },
  'sbd-starter-magazine': { name: 'SBD Starter + Magazine Bundle', amount: 8999, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sbd-starter-magazine'] },
  'newlywed-special': { name: 'Newlywed Special Bundle', amount: 4999, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['newlywed-special'] },
  'anniversary-celebration': { name: 'Anniversary Celebration Bundle', amount: 6999, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['anniversary-celebration'] },
  'sexual-literacy-101': { name: 'Sexual Literacy 101', amount: 2500, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sexual-literacy-101'] },
  'anatomy-of-desire': { name: 'The Anatomy of Desire', amount: 4900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['anatomy-of-desire'] },
  'teleios-blueprint-mini': { name: 'The Teleios Blueprint (Mini)', amount: 3900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['teleios-blueprint-mini'] },
  'marriage-builds-nations-intro': { name: 'Marriage Builds Nations (Intro)', amount: 2900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['marriage-builds-nations-intro'] },
  'sbd-dummies-course-13wk': { name: 'Sex By Design for Dummies — 13-Week Course', amount: 30000, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sbd-dummies-course-13wk'] },
  'sbd-dummies-core-curriculum': { name: 'Sex By Design Core Curriculum', amount: 49700, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sbd-dummies-core-curriculum'] },
  'art-of-marriage-course': { name: 'The Art of Marriage — Course', amount: 29700, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['art-of-marriage-course'] },
  'sexual-mastery-bundle': { name: 'Sexual Mastery Bundle', amount: 39900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sexual-mastery-bundle'] },
  'teleios-development-bundle': { name: 'Teleios Development Bundle', amount: 29900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['teleios-development-bundle'] },
  'marriage-governance-bundle': { name: 'Marriage Governance Bundle', amount: 34900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['marriage-governance-bundle'] },
  'teleios-blueprint-full': { name: 'The Teleios Blueprint: Full Human Maturity', amount: 24700, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['teleios-blueprint-full'] },
  'teleios-level-2': { name: 'Teleios Level 2: Advanced Development', amount: 39700, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['teleios-level-2'] },
  'anthropology-of-wholeness': { name: 'The Anthropology of Wholeness', amount: 14900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['anthropology-of-wholeness'] },
  'identity-mastery': { name: 'Identity Mastery', amount: 14900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['identity-mastery'] },
  'four-faculties-training': { name: 'The Four Faculties Training', amount: 19900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['four-faculties-training'] },
  'anthropocentric-development': { name: 'Anthropocentric Development', amount: 12900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['anthropocentric-development'] },
  'personal-development-masterclass': { name: 'Personal Development MasterClass', amount: 69700, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['personal-development-masterclass'] },
  'science-of-self-command': { name: 'The Science of Self-Command', amount: 19900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['science-of-self-command'] },
  'heart-of-relationship-l1': { name: 'The Heart of Relationship (Level 1)', amount: 14900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['heart-of-relationship-l1'] },
  'relationship-relatednesses-l2': { name: 'Relationship Relatednesses (Level 2)', amount: 19900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['relationship-relatednesses-l2'] },
  'relationship-mastery-intensive-l3': { name: 'Relationship Mastery Intensive (Level 3)', amount: 34900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['relationship-mastery-intensive-l3'] },
  'perfect-self-program': { name: 'The Perfect Self Program', amount: 14900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['perfect-self-program'] },
  'emotional-literacy': { name: 'Emotional Literacy for Couples & Singles', amount: 12900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['emotional-literacy'] },
  'temperament-intelligence': { name: 'Temperament Intelligence for Marriage', amount: 9900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['temperament-intelligence'] },
  'sex-equals-marriage': { name: 'Sex = Marriage: The Only Equation', amount: 35000, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sex-equals-marriage'] },
  'sexual-self': { name: 'The Sexual Self', amount: 14900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sexual-self'] },
  'course-art-of-sexuality': { name: 'The Art of Sexuality — Course', amount: 39700, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['course-art-of-sexuality'] },
  'course-art-of-seduction': { name: 'The Art of Seduction — Course', amount: 34700, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['course-art-of-seduction'] },
  'course-art-of-nakedness': { name: 'The Art of Nakedness — Course', amount: 19900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['course-art-of-nakedness'] },
  'sexual-imagination-pics-pearls': { name: 'Sexual Imagination (Pics & Pearls)', amount: 24900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sexual-imagination-pics-pearls'] },
  'conjugal-intelligence-masterclass': { name: 'Conjugal Intelligence MasterClass', amount: 89700, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['conjugal-intelligence-masterclass'] },
  'arousal-mastery': { name: 'Arousal Mastery Program', amount: 29900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['arousal-mastery'] },
  'course-art-of-fucking': { name: 'The Art of Fucking — Course', amount: 34900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['course-art-of-fucking'] },
  'erotic-devotion-song-of-solomon': { name: 'Erotic Devotion: Song of Solomon', amount: 29900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['erotic-devotion-song-of-solomon'] },
  'nakedness-muliebrity': { name: 'Nakedness Stewardship — Muliebrity', amount: 24900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['nakedness-muliebrity'] },
  'nakedness-virility': { name: 'Nakedness Stewardship — Virility', amount: 24900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['nakedness-virility'] },
  'bedroom-governance': { name: 'Bedroom Governance & Responsibility', amount: 19900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['bedroom-governance'] },
  'marriage-porn-beyond-course-individual': { name: 'Marriage=Porn & Beyond — Individual', amount: 44700, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['marriage-porn-beyond-course-individual'] },
  'marriage-porn-beyond-course-couple': { name: 'Marriage=Porn & Beyond — Couple', amount: 59700, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['marriage-porn-beyond-course-couple'] },
  'marriage-system-design': { name: 'Marriage System Design', amount: 29700, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['marriage-system-design'] },
  'covenant-governance': { name: 'Covenant Governance', amount: 24900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['covenant-governance'] },
  'fidelity-curriculum': { name: 'The Fidelity Curriculum', amount: 34900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['fidelity-curriculum'] },
  'communication-covenant-couples': { name: 'Communication for Covenant Couples', amount: 19900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['communication-covenant-couples'] },
  'conflict-mastery': { name: 'Conflict Mastery & Marital Peacekeeping', amount: 17900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['conflict-mastery'] },
  'household-management': { name: 'Household Management Program', amount: 19900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['household-management'] },
  'daily-liturgies-marriage': { name: 'Daily Liturgies of Marriage', amount: 14900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['daily-liturgies-marriage'] },
  'one-flesh-intensive': { name: 'The One-Flesh Intensive', amount: 27900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['one-flesh-intensive'] },
  'marriage-builds-nations': { name: 'Marriage Builds Nations', amount: 29900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['marriage-builds-nations'] },
  'political-theology-of-home': { name: 'The Political Theology of Home', amount: 24900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['political-theology-of-home'] },
  'family-systems-architecture': { name: 'Family Systems Architecture', amount: 27900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['family-systems-architecture'] },
  'parenting-teleios': { name: 'Parenting Through Teleios Principles', amount: 29900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['parenting-teleios'] },
  'raising-sexual-literacy-children': { name: 'Raising Sons & Daughters Through Sexual Literacy', amount: 24900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['raising-sexual-literacy-children'] },
  'family-culture-flourishing': { name: 'Family Culture & Human Flourishing', amount: 19900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['family-culture-flourishing'] },
  'civilizational-intelligence-masterclass': { name: 'Civilizational Intelligence Masterclass', amount: 69700, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['civilizational-intelligence-masterclass'] },
  'human-rights-marriage-udhr16': { name: 'Human Rights & Marriage (UDHR 16)', amount: 17900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['human-rights-marriage-udhr16'] },
  'diploma-sexual-literacy-conjugal': { name: 'Diploma in Sexual Literacy & Conjugal Mastery', amount: 250000, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['diploma-sexual-literacy-conjugal'] },
  'diploma-teleios-personal-development': { name: 'Diploma in Teleios Personal Development', amount: 200000, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['diploma-teleios-personal-development'] },
  'sbd-certified-facilitator': { name: 'SBD Certified Facilitator Training', amount: 149700, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sbd-certified-facilitator'] },
  'private-coaching-hourly': { name: 'SBD Private Coaching (Dr. Coach)', amount: 15000, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['private-coaching-hourly'] },
  'marriage-labs-weekend': { name: 'SBD Marriage Labs — Weekend Intensive', amount: 89900, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['marriage-labs-weekend'] },
  'sbd-academy-lifetime-pass': { name: 'SBD Academy Lifetime Access Pass', amount: 500000, mode: 'payment', stripePriceId: SBD_STRIPE_PRICE_IDS['sbd-academy-lifetime-pass'] },
};

const SBD_UNLOCK_RULES = {
  'foundation-monthly': { tier: 'foundation', months: 1 },
  'foundation-yearly': { tier: 'foundation', months: 12 },
  'foundation-1year': { tier: 'foundation', months: 12, subscriptionTermMonths: 12 },
  'foundation-2year': { tier: 'foundation', months: 24, subscriptionTermMonths: 24 },
  'premium-monthly': { tier: 'premium', months: 1 },
  'elite-monthly': { tier: 'elite', months: 1 },
  'teleios-blueprint': { courses: ['teleios-blueprint'] },
  'starter-bundle': { products: ['sbd-dummies'], tier: 'premium', months: 1 },
  'teleios-bundle': { products: ['teleios-bundle'] },
  'elite-bundle': { products: ['elite-bundle'] },
  'sbd-dummies': { courses: ['sbd-dummies-course'] },
  'the-woman-the-wife-the-mother-book': {
    products: ['the-woman-the-wife-the-mother-book'],
    issueIds: ['issue-woman-wife-mother-2026'],
  },
  'the-woman-the-wife-the-mother-course': {
    courses: ['the-woman-the-wife-the-mother'],
    products: ['the-woman-the-wife-the-mother-course'],
  },
  'the-woman-the-wife-the-mother-bundle': {
    courses: ['the-woman-the-wife-the-mother'],
    products: ['the-woman-the-wife-the-mother-book', 'the-woman-the-wife-the-mother-course', 'the-woman-the-wife-the-mother-bundle'],
    issueIds: ['issue-woman-wife-mother-2026'],
  },
  'the-woman-the-wife-the-mother': {
    courses: ['the-woman-the-wife-the-mother'],
    products: ['the-woman-the-wife-the-mother-book', 'the-woman-the-wife-the-mother-course', 'the-woman-the-wife-the-mother-bundle'],
    issueIds: ['issue-woman-wife-mother-2026'],
  },
  'the-sex-by-design-compendium': { products: ['the-sex-by-design-compendium'] },
  'sbd-dummies-digital-print': { products: ['sbd-dummies-digital-print'] },
  'sbd-canonical': { products: ['sbd-canonical'] },
  'sbd-standard': { products: ['sbd-standard'] },
  'sbd-real-couples': { products: ['sbd-real-couples'] },
  'sbd-the-heart-of-relationship': { products: ['sbd-the-heart-of-relationship'] },
  'sbd-unequally-yoked-together': { products: ['sbd-unequally-yoked-together'] },
  'sbd-2-the-impregnable-assemblage': { products: ['sbd-2-the-impregnable-assemblage'] },
  'marriage-porn-beyond': { products: ['marriage-porn-beyond'] },
  'naked-and-not-ashamed': { products: ['naked-and-not-ashamed'] },
  'marriage-equals-sexuality': { products: ['marriage-equals-sexuality'] },
  'the-arts-of-marriage': { products: ['the-arts-of-marriage'] },
  'the-art-of-sexuality': { products: ['the-art-of-sexuality'] },
  'the-art-of-seduction': { products: ['the-art-of-seduction'] },
  'the-art-of-fucking': { products: ['the-art-of-fucking'] },
  'sbd-magazine-annual-subscription': { products: ['sbd-magazine-annual-subscription'] },
  'sbd-magazine-single-issue': { products: ['sbd-magazine-single-issue'] },
  'sbd-digital-archive-access': { products: ['sbd-digital-archive-access'] },
  'complete-sbd-library': { products: ['complete-sbd-library'] },
  'sbd-complete-package': { products: ['sbd-complete-package'] },
  'arts-of-marriage-collection': { products: ['arts-of-marriage-collection'] },
  'marriage-foundation-bundle': { products: ['marriage-foundation-bundle'] },
  'sbd-starter-magazine': { products: ['sbd-starter-magazine'] },
  'newlywed-special': { products: ['newlywed-special'] },
  'anniversary-celebration': { products: ['anniversary-celebration'] },
  'sexual-literacy-101': { products: ['sexual-literacy-101'] },
  'anatomy-of-desire': { products: ['anatomy-of-desire'] },
  'teleios-blueprint-mini': { products: ['teleios-blueprint-mini'] },
  'marriage-builds-nations-intro': { products: ['marriage-builds-nations-intro'] },
  'sbd-dummies-course-13wk': { products: ['sbd-dummies-course-13wk'] },
  'sbd-dummies-core-curriculum': { products: ['sbd-dummies-core-curriculum'] },
  'art-of-marriage-course': { products: ['art-of-marriage-course'] },
  'sexual-mastery-bundle': { products: ['sexual-mastery-bundle'] },
  'teleios-development-bundle': { products: ['teleios-development-bundle'] },
  'marriage-governance-bundle': { products: ['marriage-governance-bundle'] },
  'teleios-blueprint-full': { products: ['teleios-blueprint-full'] },
  'teleios-level-2': { products: ['teleios-level-2'] },
  'anthropology-of-wholeness': { products: ['anthropology-of-wholeness'] },
  'identity-mastery': { products: ['identity-mastery'] },
  'four-faculties-training': { products: ['four-faculties-training'] },
  'anthropocentric-development': { products: ['anthropocentric-development'] },
  'personal-development-masterclass': { products: ['personal-development-masterclass'] },
  'science-of-self-command': { products: ['science-of-self-command'] },
  'heart-of-relationship-l1': { products: ['heart-of-relationship-l1'] },
  'relationship-relatednesses-l2': { products: ['relationship-relatednesses-l2'] },
  'relationship-mastery-intensive-l3': { products: ['relationship-mastery-intensive-l3'] },
  'perfect-self-program': { products: ['perfect-self-program'] },
  'emotional-literacy': { products: ['emotional-literacy'] },
  'temperament-intelligence': { products: ['temperament-intelligence'] },
  'sex-equals-marriage': { products: ['sex-equals-marriage'] },
  'sexual-self': { products: ['sexual-self'] },
  'course-art-of-sexuality': { products: ['course-art-of-sexuality'] },
  'course-art-of-seduction': { products: ['course-art-of-seduction'] },
  'course-art-of-nakedness': { products: ['course-art-of-nakedness'] },
  'sexual-imagination-pics-pearls': { products: ['sexual-imagination-pics-pearls'] },
  'conjugal-intelligence-masterclass': { products: ['conjugal-intelligence-masterclass'] },
  'arousal-mastery': { products: ['arousal-mastery'] },
  'course-art-of-fucking': { products: ['course-art-of-fucking'] },
  'erotic-devotion-song-of-solomon': { products: ['erotic-devotion-song-of-solomon'] },
  'nakedness-muliebrity': { products: ['nakedness-muliebrity'] },
  'nakedness-virility': { products: ['nakedness-virility'] },
  'bedroom-governance': { products: ['bedroom-governance'] },
  'marriage-porn-beyond-course-individual': { products: ['marriage-porn-beyond-course-individual'] },
  'marriage-porn-beyond-course-couple': { products: ['marriage-porn-beyond-course-couple'] },
  'marriage-system-design': { products: ['marriage-system-design'] },
  'covenant-governance': { products: ['covenant-governance'] },
  'fidelity-curriculum': { products: ['fidelity-curriculum'] },
  'communication-covenant-couples': { products: ['communication-covenant-couples'] },
  'conflict-mastery': { products: ['conflict-mastery'] },
  'household-management': { products: ['household-management'] },
  'daily-liturgies-marriage': { products: ['daily-liturgies-marriage'] },
  'one-flesh-intensive': { products: ['one-flesh-intensive'] },
  'marriage-builds-nations': { products: ['marriage-builds-nations'] },
  'political-theology-of-home': { products: ['political-theology-of-home'] },
  'family-systems-architecture': { products: ['family-systems-architecture'] },
  'parenting-teleios': { products: ['parenting-teleios'] },
  'raising-sexual-literacy-children': { products: ['raising-sexual-literacy-children'] },
  'family-culture-flourishing': { products: ['family-culture-flourishing'] },
  'civilizational-intelligence-masterclass': { products: ['civilizational-intelligence-masterclass'] },
  'human-rights-marriage-udhr16': { products: ['human-rights-marriage-udhr16'] },
  'diploma-sexual-literacy-conjugal': { products: ['diploma-sexual-literacy-conjugal'] },
  'diploma-teleios-personal-development': { products: ['diploma-teleios-personal-development'] },
  'sbd-certified-facilitator': { products: ['sbd-certified-facilitator'] },
  'private-coaching-hourly': { products: ['private-coaching-hourly'] },
  'marriage-labs-weekend': { products: ['marriage-labs-weekend'] },
  'sbd-academy-lifetime-pass': { products: ['sbd-academy-lifetime-pass'] },
};

const SBD_PRODUCT_ALIASES = require('./sbd-product-aliases.json').aliases || {};

function resolveSbdProductId(rawProductId) {
  const normalized = typeof rawProductId === 'string' ? rawProductId.trim() : '';
  if (!normalized) return '';
  return SBD_PRODUCT_ALIASES[normalized] || normalized;
}

/**
 * Resolve checkout product from static catalog, else Course Studio shopProducts.
 */
async function resolveSbdCatalogProduct(productId) {
  const canonicalProductId = resolveSbdProductId(productId);
  const staticProduct = SBD_CATALOG_SERVER[canonicalProductId];
  if (staticProduct) {
    return { id: canonicalProductId, product: staticProduct, source: 'static' };
  }

  try {
    const snap = await db.collection('shopProducts').doc(canonicalProductId).get();
    if (!snap.exists) return null;
    const p = snap.data() || {};
    if (p.status === 'inactive') return null;
    if (!(p.studioPublished || p.checkoutEnabled || p.studioManaged)) return null;
    const amount = Math.round(Number(p.priceUsd || 0) * 100);
    if (!(amount >= 0)) return null;
    return {
      id: canonicalProductId,
      source: 'firestore',
      product: {
        name: p.name || canonicalProductId,
        amount: amount,
        mode: p.recurring ? 'subscription' : 'payment',
        tier: (p.unlocks && p.unlocks.tier) || p.tier || null,
        stripePriceId: (typeof p.stripePriceId === 'string' ? p.stripePriceId.trim() : '') || '',
      },
    };
  } catch (err) {
    console.warn('[SBD] resolveSbdCatalogProduct failed:', err.message);
    return null;
  }
}

/**
 * Unlock rules: static map first, else derive from shopProducts.unlocks.
 */
async function resolveSbdUnlockRule(productId) {
  const canonicalProductId = resolveSbdProductId(productId);
  if (SBD_UNLOCK_RULES[canonicalProductId]) {
    return SBD_UNLOCK_RULES[canonicalProductId];
  }

  try {
    const snap = await db.collection('shopProducts').doc(canonicalProductId).get();
    if (!snap.exists) return null;
    const p = snap.data() || {};
    if (!(p.studioPublished || p.checkoutEnabled || p.studioManaged)) return null;
    const unlocks = p.unlocks || {};
    const rule = {};
    if (unlocks.tier) {
      rule.tier = unlocks.tier;
      rule.months = unlocks.months || 1;
    }
    const courses = unlocks.courseIds || unlocks.courses || [];
    if (Array.isArray(courses) && courses.length) rule.courses = courses;
    const products = unlocks.productIds || unlocks.products || [];
    rule.products = Array.from(new Set([canonicalProductId].concat(products)));
    if (Array.isArray(unlocks.issueIds) && unlocks.issueIds.length) {
      rule.issueIds = unlocks.issueIds;
    }
    return rule;
  } catch (err) {
    console.warn('[SBD] resolveSbdUnlockRule failed:', err.message);
    return null;
  }
}

const advExprLib = require('./lib/advanced-expression-access');
const SBD_ADVANCED_EXPRESSION_GROUPS = advExprLib.ADVANCED_EXPRESSION_GROUP_IDS;
const SBD_TIER_GROUPS = {
  free:       ['group-sbd-community'],
  foundation: ['group-sbd-community', 'group-teleios-formation', 'group-sbd-dummies'],
  premium:    ['group-sbd-community', 'group-teleios-formation', 'group-sbd-dummies', 'group-sexual-literacy', 'CYUhNHqGvf7bhVIR6D13'],
  elite:      ['group-sbd-community', 'group-teleios-formation', 'group-sbd-dummies', 'group-sexual-literacy', 'CYUhNHqGvf7bhVIR6D13', 'group-marriage-systems', 'group-civilization-leadership'],
};

/** SBD Life editorial entitlements (shop → Firestore). */
const SBD_LIFE_SHOP_PRODUCTS = {
  'sbd-magazine-annual-subscription': 'annual',
  'sbd-magazine-single-issue': 'single_issue',
  'sbd-digital-archive-access': 'archive',
};
const SBD_LIFE_DEFAULT_ISSUE_ID = 'issue-attraction-formation-2026';

async function resolveCurrentSbdLifeIssueId() {
  try {
    const featured = await db.collection('sbdLifeTrending').doc('featured').get();
    if (featured.exists) {
      const data = featured.data() || {};
      if (Array.isArray(data.issueIds) && data.issueIds[0]) {
        return data.issueIds[0];
      }
      if (Array.isArray(data.articleIds) && data.articleIds[0]) {
        const art = await db.collection('sbdLifeArticles').doc(data.articleIds[0]).get();
        if (art.exists && art.data().issueId) {
          return art.data().issueId;
        }
      }
    }
  } catch (err) {
    console.warn('[SBD Life] resolveCurrentSbdLifeIssueId:', err.message);
  }
  return SBD_LIFE_DEFAULT_ISSUE_ID;
}

async function grantSbdLifeEntitlements(uid, productId, session) {
  const canonicalProductId = resolveSbdProductId(productId);
  const grantType = SBD_LIFE_SHOP_PRODUCTS[canonicalProductId];
  if (!grantType) {
    return { granted: false };
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const oneYear = admin.firestore.Timestamp.fromMillis(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const sessionId = session?.id || null;

  if (grantType === 'annual') {
    await db.collection('sbdLifeSubscriptions').doc(uid).set(
      {
        userId: uid,
        plan: 'annual',
        status: 'active',
        productId: canonicalProductId,
        archiveAccess: true,
        source: 'shop_stripe',
        stripeSessionId: sessionId,
        startedAt: now,
        expiresAt: oneYear,
        updatedAt: now,
      },
      { merge: true }
    );
    console.log(`[SBD Life] Annual subscription granted uid=${uid}`);
    return { granted: true, type: 'annual', expiresAt: oneYear };
  }

  if (grantType === 'archive') {
    await db.collection('sbdLifeSubscriptions').doc(uid).set(
      {
        userId: uid,
        plan: 'archive',
        status: 'active',
        productId: canonicalProductId,
        archiveAccess: true,
        source: 'shop_stripe',
        stripeSessionId: sessionId,
        startedAt: now,
        expiresAt: null,
        updatedAt: now,
      },
      { merge: true }
    );
    console.log(`[SBD Life] Archive access granted uid=${uid}`);
    return { granted: true, type: 'archive' };
  }

  if (grantType === 'single_issue') {
    const issueId = await resolveCurrentSbdLifeIssueId();
    await db
      .collection('users')
      .doc(uid)
      .collection('sbdLifePurchasedIssues')
      .doc(issueId)
      .set(
        {
          userId: uid,
          issueId: issueId,
          productId: canonicalProductId,
          status: 'active',
          source: 'shop_stripe',
          stripeSessionId: sessionId,
          purchasedAt: now,
        },
        { merge: true }
      );
    console.log(`[SBD Life] Issue purchase granted uid=${uid} issue=${issueId}`);
    return { granted: true, type: 'single_issue', issueId: issueId };
  }

  return { granted: false };
}

async function unlockSbdContent(uid, productId, session) {
  const canonicalProductId = resolveSbdProductId(productId);
  const rule = await resolveSbdUnlockRule(canonicalProductId);
  if (!rule) {
    console.warn(`[SBD] No unlock rule for: ${canonicalProductId}`);
    return null;
  }

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data() : {};

  const catalogResolved = await resolveSbdCatalogProduct(canonicalProductId);
  const productName = catalogResolved?.product?.name ||
    SBD_CATALOG_SERVER[canonicalProductId]?.name ||
    canonicalProductId;

  const tgMeta = {
    referredBy: userData.referredBy || null,
    signupApp: userData.signupApp || null,
    referralCredited: false,
    referralSkipReason: rule.tier ? null : 'non_tier_product',
    referrerAmbassadorCode: null,
    referrerFullName: null,
    seniorAmbassadorCode: null,
    ambassadorCommissionFCFA: null,
    seniorCommissionFCFA: null,
    rdCode: null,
    rdCommissionFCFA: null,
    tierKeyed: rule.tier || null,
    productId: canonicalProductId,
    productName: productName,
  };

  if (rule.tier) {
    // Stripe recurring: endDate = 2099 (Stripe webhooks manage cancel / period end).
    // Manual MoMo yearly: fixed term (months) — no auto-renewal.
    // One-time bundles: endDate = now + N months from unlock rule.
    // Foundation Access is a one-time payment for 12 months. Monthly Foundation,
    // Premium, and Elite remain recurring subscriptions.
    const isRecurring = ['foundation-monthly', 'foundation-1year', 'foundation-2year', 'premium-monthly', 'elite-monthly'].includes(canonicalProductId);
    let endDate;
    if (session?.manualAccessMonths) {
      endDate = new Date();
      endDate.setMonth(endDate.getMonth() + Number(session.manualAccessMonths));
    } else if (isRecurring) {
      endDate = new Date('2099-12-31');
    } else {
      endDate = new Date();
      endDate.setMonth(endDate.getMonth() + Number(rule.months || 12));
    }

    // ── SBD commissions — idempotent per Stripe invoice, one-time Stripe session, or manual payment ref ──
    try {
      let commissionResult = null;
      let invoiceId = session?.invoice || null;
      if (!invoiceId && session?.id && session?.mode === 'subscription') {
        const fullSession = await stripe.checkout.sessions.retrieve(session.id);
        invoiceId = fullSession.invoice || null;
      }
      if (invoiceId) {
        const invoice = await stripe.invoices.retrieve(
          typeof invoiceId === 'string' ? invoiceId : invoiceId.id
        );
        commissionResult = await handleSbdStripeInvoice(invoice);
      } else if (session?.manualCommissionKey) {
        commissionResult = await creditSbdSubscriptionCommissions({
          db,
          findSellerByReferralCode: findSellerBySbdReferralCode,
          uid,
          referralCode: userData.referredBy,
          productId: canonicalProductId,
          tierKey: rule.tier,
          idempotencyKey: session.manualCommissionKey,
          chargeKind: session.manualChargeKind || 'initial'
        });
      } else if (canonicalProductId === 'foundation-yearly' && session?.id) {
        commissionResult = await creditSbdSubscriptionCommissions({
          db,
          findSellerByReferralCode: findSellerBySbdReferralCode,
          uid,
          referralCode: userData.referredBy,
          productId: canonicalProductId,
          tierKey: rule.tier,
          idempotencyKey: `checkout_${session.id}`,
          chargeKind: 'initial'
        });
      }

      if (commissionResult) {
        Object.assign(tgMeta, {
          referralCredited: !!commissionResult.credited,
          referralSkipReason: commissionResult.referralSkipReason || null,
          referrerAmbassadorCode: commissionResult.referrerAmbassadorCode || null,
          referrerFullName: commissionResult.referrerFullName || null,
          seniorAmbassadorCode: commissionResult.seniorAmbassadorCode || null,
          ambassadorCommissionFCFA: commissionResult.ambassadorCommissionFCFA,
          seniorCommissionFCFA: commissionResult.seniorCommissionFCFA,
          rdCode: commissionResult.rdCode || null,
          rdCommissionFCFA: commissionResult.rdCommissionFCFA
        });
      } else {
        tgMeta.referralSkipReason = 'no_charge_reference';
      }
    } catch (refErr) {
      console.error('[SBD] Commission credit failed (non-critical):', refErr.message);
      tgMeta.referralSkipReason = 'credit_error';
    }

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
      'subscription.cancelAtPeriodEnd': false,
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

  if (rule.products && rule.products.length > 0) {
    await userRef.update({ ownedProducts: admin.firestore.FieldValue.arrayUnion(...rule.products) });
  }

  if (rule.issueIds && rule.issueIds.length > 0) {
    const now = admin.firestore.FieldValue.serverTimestamp();
    for (const issueId of rule.issueIds) {
      await db
        .collection('users')
        .doc(uid)
        .collection('sbdLifePurchasedIssues')
        .doc(issueId)
        .set(
          {
            userId: uid,
            issueId,
            productId: canonicalProductId,
            status: 'active',
            source: 'shop_stripe',
            stripeSessionId: session?.id || null,
            purchasedAt: now,
          },
          { merge: true }
        );
    }
  }

  // Audit trail
  const orderAmount = session?.manualAmount != null
    ? Number(session.manualAmount) || 0
    : (session?.amount_total ? session.amount_total / 100 : 0);
  const orderCurrency = session?.manualCurrency
    || session?.currency?.toUpperCase()
    || 'USD';
  const paymentChannel = session?.manualChannel || 'stripe';

  await db.collection('orders').add({
    app: 'sbd-network',
    userId: uid,
    productId: canonicalProductId,
    productName: productName,
    amount: orderAmount,
    currency: orderCurrency,
    status: 'completed',
    stripeSessionId: session?.id && !String(session.id).startsWith('pending_') ? session.id : null,
    pendingPaymentRef: session?.manualCommissionKey || null,
    channel: paymentChannel,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await writeUnifiedPaymentRecord({
    source: paymentChannel === 'stripe' ? 'stripe_sbd' : 'manual_payment',
    reference: session?.id || `${uid}-${canonicalProductId}`,
    external_reference: session?.payment_intent || session?.id || '',
    record_type: 'customer_payment',
    channel: paymentChannel,
    payment_method: paymentChannel === 'stripe' ? 'card' : (session?.manualPaymentMethod || 'momo'),
    payment_category: canonicalProductId,
    product_id: canonicalProductId,
    product_name: productName,
    amount: orderAmount,
    currency: orderCurrency,
    customer_email: session?.customer_details?.email || '',
    customer_phone: session?.customer_details?.phone || '',
    ambassador_code: '',
    recruiter_code: '',
    status: 'completed',
    action_required: false,
    approved_at: admin.firestore.FieldValue.serverTimestamp(),
    created_at: admin.firestore.FieldValue.serverTimestamp()
  });

  try {
    await grantSbdLifeEntitlements(uid, canonicalProductId, session);
  } catch (lifeErr) {
    console.error('[SBD Life] Entitlement grant failed (non-critical):', lifeErr.message);
  }

  console.log(`[SBD] Unlocked: uid=${uid} product=${canonicalProductId}`);
  return tgMeta;
}

/**
 * Backup: client checkout-success can sync SBD Life entitlements if webhook is delayed.
 */
exports.syncSbdLifeShopEntitlement = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }
  const sessionId = typeof data?.sessionId === 'string' ? data.sessionId.trim() : '';
  const productId = resolveSbdProductId(data?.productId);
  if (!sessionId || !productId) {
    throw new functions.https.HttpsError('invalid-argument', 'sessionId and productId required.');
  }
  if (!SBD_LIFE_SHOP_PRODUCTS[productId]) {
    return { ok: true, skipped: true, reason: 'not_sbd_life_product' };
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.app !== 'sbd' || session.metadata?.uid !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Session does not belong to this user.');
  }
  if (session.metadata?.productId && resolveSbdProductId(session.metadata.productId) !== productId) {
    throw new functions.https.HttpsError('invalid-argument', 'Product mismatch.');
  }
  if (session.payment_status !== 'paid') {
    return { ok: false, reason: 'payment_not_completed' };
  }

  const life = await grantSbdLifeEntitlements(context.auth.uid, productId, session);
  return { ok: true, life: life };
});

/**
 * Grant advanced expression community groups when formation milestone is met.
 */
async function grantAdvancedExpressionIfEligible(uid, userData) {
  if (!userData || userData.role === 'admin') return false;
  if (advExprLib.isAdvancedExpressionRevoked(userData)) {
    console.log(`[SBD] Advanced expression grant skipped (admin revoked): uid=${uid}`);
    return false;
  }
  if (!advExprLib.computeFormationMilestoneMet(userData)) return false;
  const userRef = db.collection('users').doc(uid);
  const updates = {
    groups: admin.firestore.FieldValue.arrayUnion(...SBD_ADVANCED_EXPRESSION_GROUPS),
    'access.advancedExpressionRevoked': false,
  };
  if (userData.progress?.advancedExpressionUnlocked !== true) {
    updates['progress.advancedExpressionUnlocked'] = true;
    updates['progress.advancedExpressionUnlockedAt'] = admin.firestore.FieldValue.serverTimestamp();
  }
  await userRef.update(updates);
  console.log(`[SBD] Advanced expression unlocked for uid=${uid}`);
  return true;
}

exports.onUserAdvancedExpressionUnlock = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const beforeCourses = JSON.stringify(before.progress?.completedCourses || []);
    const afterCourses = JSON.stringify(after.progress?.completedCourses || []);
    if (beforeCourses === afterCourses) return null;
    if (advExprLib.isAdvancedExpressionRevoked(after)) return null;
    if (!advExprLib.computeFormationMilestoneMet(after)) return null;
    if (after.progress?.advancedExpressionUnlocked === true) {
      const groups = after.groups || [];
      const hasAll = SBD_ADVANCED_EXPRESSION_GROUPS.every((g) => groups.includes(g));
      if (hasAll) return null;
    }
    try {
      await grantAdvancedExpressionIfEligible(context.params.userId, after);
    } catch (e) {
      console.error('[SBD] grantAdvancedExpressionIfEligible:', e.message);
    }
    return null;
  });

/**
 * Telegram: new SBD PWA self-serve signup (users doc created from PWA auth).
 * Gated on signupApp === 'sbd-network' so ambassador provisioning and other user writes stay silent.
 */
exports.onSbdPwaUserSignupNotify = functions.firestore
  .document('users/{userId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() || {};
    if (data.signupApp !== 'sbd-network') {
      return null;
    }
    const uid = context.params.userId;
    const name = data.name || data.displayName || '—';
    const email = data.email || '—';
    const ref = data.referredBy || '';
    const refLine = ref
      ? `🔗 Referral ref: ${ref}`
      : '🔗 Referral ref: (none — direct signup)';

    const msg =
      '📱 SBD PWA — NEW SIGNUP\n\n' +
      `👤 ${name}\n` +
      `📧 ${email}\n` +
      `🆔 ${uid}\n` +
      `${refLine}\n\n` +
      '👉 Admin: https://marriageducation.com/admin-dashboard.html';

    try {
      await sendTelegram(msg, false);
    } catch (e) {
      console.warn('[SBD] PWA signup Telegram failed:', e.message);
    }
    return null;
  });

/**
 * Create SBD Network Stripe Checkout Session
 * Called from sbd-network app; returns Stripe-hosted checkout URL.
 */
exports.createSbdCheckoutSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in to purchase.');
  }

  const { productId } = data;
  const canonicalProductId = resolveSbdProductId(productId);
  const uid   = context.auth.uid;
  const email = context.auth.token.email || '';

  const resolved = await resolveSbdCatalogProduct(canonicalProductId);
  if (!resolved || !resolved.product) {
    throw new functions.https.HttpsError('invalid-argument', `Unknown product: ${canonicalProductId}`);
  }
  const product = resolved.product;

  const baseUrl    = 'https://sbd-network.web.app';
  const cancelTier = product.tier || canonicalProductId.replace('-monthly', '');
  const priceData  = {
    currency: 'usd',
    product_data: { name: product.name },
    unit_amount: product.amount,
    ...(product.mode === 'subscription' ? { recurring: { interval: product.interval || 'month' } } : {}),
  };
  const trimmedPriceId = typeof product.stripePriceId === 'string' ? product.stripePriceId.trim() : '';
  const lineItem = trimmedPriceId
    ? { price: trimmedPriceId, quantity: 1 }
    : { price_data: priceData, quantity: 1 };

  let subscriptionData = null;
  if (product.mode === 'subscription') {
    subscriptionData = {
      metadata: { app: 'sbd', uid, productId: canonicalProductId },
    };
  }

  const session = await stripe.checkout.sessions.create({
    customer_email: email,
    metadata: { app: 'sbd', uid, productId: canonicalProductId },
    ...(subscriptionData ? { subscription_data: subscriptionData } : {}),
    mode: product.mode,
    line_items: [lineItem],
    success_url: `${baseUrl}/checkout-success.html?product=${canonicalProductId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${baseUrl}/payment?tier=${cancelTier}&cancelled=true`,
  });

  console.log(`[SBD Checkout] uid=${uid} product=${canonicalProductId} source=${resolved.source} session=${session.id}`);
  return { url: session.url };
});

/**
 * SBD-Network MeSomb webhook.
 *
 * This is the server-to-server confirmation path for automated Mobile Money.
 * The customer does not need to submit a screenshot or wait for an admin.
 * MeSomb signs each webhook; we verify that signature before fulfillment.
 */
exports.sbdMeSombWebhook = functions.runWith({
  secrets: [MESOMB_WEBHOOK_SECRET]
}).https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const rawBody = Buffer.isBuffer(req.rawBody)
      ? req.rawBody.toString('utf8')
      : (typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(req.body || {}));

    verifySbdMeSombWebhook({
      rawBody,
      signatureHeader: req.get('X-MeSomb-Webhook-Signature'),
      webhookSecret: MESOMB_WEBHOOK_SECRET.value()
    });

    const event = JSON.parse(rawBody);
    const eventId = String(
      req.get('X-MeSomb-Webhook-Event-Id') || event.id || ''
    ).trim();

    if (!eventId) {
      return res.status(400).send('Missing webhook event ID');
    }

    const eventRef = db.collection('mesomb_webhook_events').doc(eventId);
    const existingEvent = await eventRef.get();
    if (existingEvent.exists && existingEvent.data()?.processed === true) {
      return res.status(200).send('Already processed');
    }

    const eventType = String(event.event_type || event.type || '').toLowerCase();
    const transaction = event.data?.object || event.data?.transaction || event.transaction || {};
    const status = String(transaction.status || event.status || '').toUpperCase();

    // This endpoint is the production SBD-Network endpoint. Never fulfill
    // a development/test webhook against a production payment record.
    if (event.livemode !== true) {
      await eventRef.set({
        processed: true,
        ignored: true,
        reason: 'non_live_event',
        eventType,
        receivedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return res.status(200).send('Non-live event ignored');
    }

    if (!['payment.transaction.succeeded', 'payment.transaction.success', 'payment.succeeded'].includes(eventType)) {
      await eventRef.set({
        processed: true,
        ignored: true,
        eventType,
        livemode: event.livemode === true,
        receivedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return res.status(200).send('Ignored');
    }

    if (status !== 'SUCCESS' && status !== 'SUCCEEDED') {
      await eventRef.set({
        processed: true,
        ignored: true,
        eventType,
        status,
        livemode: event.livemode === true,
        receivedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return res.status(200).send('Not successful');
    }

    const reference = String(
      transaction.reference ||
      transaction.trxID ||
      transaction.trx_id ||
      transaction.external_reference ||
      ''
    ).trim();

    const transactionId = String(
      transaction.id ||
      transaction.pk ||
      transaction.transaction_id ||
      ''
    ).trim();

    let pendingRef = reference ? db.collection('mesomb_payments').doc(reference) : null;
    let pendingSnap = pendingRef ? await pendingRef.get() : null;

    // Fallback for payloads that contain the MeSomb transaction ID but not our
    // local reference.
    if ((!pendingSnap || !pendingSnap.exists) && transactionId) {
      const byTransaction = await db.collection('mesomb_payments')
        .where('transactionId', '==', transactionId)
        .limit(1)
        .get();
      if (!byTransaction.empty) {
        pendingRef = byTransaction.docs[0].ref;
        pendingSnap = byTransaction.docs[0];
      }
    }

    if (!pendingSnap || !pendingSnap.exists) {
      console.warn('[SBD MeSomb Webhook] No matching pending payment', {
        eventId,
        reference,
        transactionId
      });
      await eventRef.set({
        processed: true,
        unmatched: true,
        eventType,
        reference,
        transactionId,
        receivedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return res.status(200).send('No matching payment');
    }

    const pending = pendingSnap.data();

    // Never grant access for a webhook that does not match the amount/currency
    // recorded when the SBD checkout was created.
    const webhookAmount = Number(
      transaction.amount ?? transaction.trxamount ?? transaction.amountXaf
    );
    if (Number.isFinite(webhookAmount) && webhookAmount !== Number(pending.amountXaf)) {
      console.error('[SBD MeSomb Webhook] Amount mismatch', {
        eventId,
        reference: pending.reference,
        expected: pending.amountXaf,
        received: webhookAmount
      });
      await eventRef.set({
        processed: true,
        rejected: true,
        reason: 'amount_mismatch',
        expectedAmount: Number(pending.amountXaf),
        receivedAmount: webhookAmount,
        receivedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return res.status(200).send('Amount mismatch');
    }

    const webhookService = String(transaction.service || '').toUpperCase();
    if (webhookService && pending.service && webhookService !== String(pending.service).toUpperCase()) {
      console.error('[SBD MeSomb Webhook] Service mismatch', {
        eventId,
        reference: pending.reference,
        expected: pending.service,
        received: webhookService
      });
      await eventRef.set({
        processed: true,
        rejected: true,
        reason: 'service_mismatch',
        expectedService: String(pending.service).toUpperCase(),
        receivedService: webhookService,
        receivedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return res.status(200).send('Service mismatch');
    }

    const webhookCurrency = String(transaction.currency || '').toUpperCase();
    if (webhookCurrency && webhookCurrency !== 'XAF') {
      console.error('[SBD MeSomb Webhook] Currency mismatch', {
        eventId,
        reference: pending.reference,
        received: webhookCurrency
      });
      await eventRef.set({
        processed: true,
        rejected: true,
        reason: 'currency_mismatch',
        receivedCurrency: webhookCurrency,
        receivedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return res.status(200).send('Currency mismatch');
    }

    const transactionForFulfillment = {
      ...transaction,
      id: transactionId || transaction.id,
      pk: transaction.pk || transactionId,
      status: 'SUCCESS'
    };

    const completed = await finalizeSbdMesombPayment(
      { ...pending, reference: pending.reference || pendingSnap.id },
      transactionForFulfillment
    );

    await eventRef.set({
      processed: true,
      eventType,
      livemode: event.livemode === true,
      reference: pending.reference || pendingSnap.id,
      transactionId: transactionId || null,
      status: 'SUCCESS',
      processedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log('[SBD MeSomb Webhook] Fulfilled SBD payment', {
      eventId,
      reference: pending.reference || pendingSnap.id,
      transactionId: transactionId || null
    });

    return res.status(200).json({
      received: true,
      success: completed.success === true
    });
  } catch (error) {
    console.error('[SBD MeSomb Webhook] Error:', error);
    return res.status(400).send('Webhook rejected');
  }
});

/**
 * MeSomb Mobile Money checkout for Foundation School.
 *
 * One-time Foundation Access: 86,502 FCFA -> 12 months.
 * Subscription plans: collect the current monthly installment (9,000 / 6,600 FCFA)
 * and grant one month. MeSomb collect is a transaction API; it does not replace
 * Stripe's 12/24-month subscription schedule.
 */
exports.createSbdMeSombPayment = functions.runWith({
  secrets: [MESOMB_APPLICATION_KEY, MESOMB_ACCESS_KEY, MESOMB_SECRET_KEY]
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in to pay with Mobile Money.');
  }

  const productId = resolveSbdProductId(data?.productId);
  const plan = await getSbdMesombPlan(productId);
  const phone = String(data?.phone || '').replace(/\D/g, '');
  const service = String(data?.service || data?.momo_network || 'MTN').toUpperCase() === 'ORANGE' ? 'ORANGE' : 'MTN';

  if (!plan) {
    throw new functions.https.HttpsError('invalid-argument', 'This Mobile Money payment option is not available for this product.');
  }
  if (phone.length < 9 || phone.length > 15) {
    throw new functions.https.HttpsError('invalid-argument', 'Enter a valid MTN or Orange Money phone number.');
  }

  const uid = context.auth.uid;
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.exists ? userSnap.data() : {};
  const email = context.auth.token.email || user.email || '';
  const name = user.name || context.auth.token.name || 'Student';
  const reference = 'SBD-MESOMB-' + Date.now() + '-' + uid.slice(-6);

  const pending = {
    reference, uid, email, name, phone, service, productId,
    productName: plan.label, amountXaf: plan.amountXaf,
    accessMonths: plan.accessMonths, status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };
  await db.collection('mesomb_payments').doc(reference).set(pending);

  try {
    const credentials = getMesombCredentials();
    const response = await sbdMesombCollect({
      ...credentials,
      amount: plan.amountXaf,
      payer: phone,
      nonce: undefined,
      service,
      country: 'CM',
      currency: 'XAF',
      trxID: reference,
      message: 'Marriage Education — ' + plan.label,
      customer: {
        email,
        firstName: String(name).split(/\s+/)[0] || 'Student',
        lastName: String(name).split(/\s+/).slice(1).join(' ') || '',
        country: 'CM'
      },
      products: [{
        id: productId,
        name: plan.label,
        quantity: 1,
        amount: plan.amountXaf
      }]
    });

    const transaction = extractMesombTransaction(response);
    const transactionId = transaction?.pk || transaction?.id || null;
    const status = String(transaction?.status || '').toUpperCase();

    await db.collection('mesomb_payments').doc(reference).set({
      transactionId,
      providerMessage: response?.message || null,
      providerSuccess: response?.success === true,
      status: status || 'PENDING',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    if (status === 'SUCCESS') {
      const completed = await finalizeSbdMesombPayment(pending, transaction);
      return { ...completed, reference, amountXaf: plan.amountXaf, accessMonths: plan.accessMonths };
    }

    if (status === 'FAILED') {
      return { success: false, status: 'FAILED', reference, message: 'Your Mobile Money payment could not be completed. Please try again.' };
    }

    return {
      success: false, pending: true, status: status || 'PENDING',
      reference, transactionId, amountXaf: plan.amountXaf,
      accessMonths: plan.accessMonths,
      message: 'Payment request sent. Approve it on your phone. We are checking the payment automatically.'
    };
  } catch (error) {
    await db.collection('mesomb_payments').doc(reference).set({
      status: 'failed', error: error.message,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.error('[SBD MeSomb] collect failed:', error);
    throw new functions.https.HttpsError('internal', 'We could not start the Mobile Money payment. Please try again or use another payment method.');
  }
});

/**
 * Poll a pending MeSomb transaction and finalize it once SUCCESS is reported.
 */
exports.checkSbdMeSombPayment = functions.runWith({
  secrets: [MESOMB_APPLICATION_KEY, MESOMB_ACCESS_KEY, MESOMB_SECRET_KEY]
}).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');

  const reference = String(data?.reference || '').trim();
  if (!reference) throw new functions.https.HttpsError('invalid-argument', 'Payment reference is required.');

  const ref = db.collection('mesomb_payments').doc(reference);
  const snap = await ref.get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'MeSomb payment record not found.');

  const pending = snap.data();
  if (pending.uid !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Payment does not belong to this account.');
  }
  if (pending.status === 'completed') {
    return { success: true, status: 'SUCCESS', reference, transactionId: pending.transactionId || null };
  }
  if (!pending.transactionId) {
    return { success: false, pending: true, status: pending.status || 'PENDING', reference };
  }

  try {
    const credentials = getMesombCredentials();
    const client = new PaymentOperation(credentials);
    // MeSomb's documented SDK method is getTransactions(). The stored ID is
    // the provider transaction primary key returned by makeCollect().
    const response = await client.getTransactions([pending.transactionId]);
    const transaction = extractMesombTransaction(response);
    const status = String(transaction?.status || '').toUpperCase();

    await ref.set({
      status: status || pending.status || 'PENDING',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    if (status === 'SUCCESS') {
      const completed = await finalizeSbdMesombPayment(pending, transaction);
      return { ...completed, reference };
    }

    return {
      success: false, pending: status !== 'FAILED',
      status: status || 'PENDING', reference,
      message: status === 'FAILED' ? 'MeSomb reports that the payment failed.' : 'Payment is still pending.'
    };
  } catch (error) {
    console.error('[SBD MeSomb] status check failed:', error);
    throw new functions.https.HttpsError('internal', 'Unable to check the MeSomb payment status.');
  }
});

/**
 * Guest (DTC) checkout for 12-Month Foundation Access — one-time payment; no prior auth required.
 * Creates/finds Auth user, attributes referral, returns Stripe Checkout URL.
 */
exports.createSbdGuestCheckoutSession = functions.https.onCall(async (data) => {
  const email = String(data?.email || '').trim().toLowerCase();
  const name = String(data?.name || '').trim() || 'Student';
  const sponsorEmail = String(data?.sponsorEmail || '').trim().toLowerCase();
  const sponsorName = String(data?.sponsorName || '').trim();
  const isSponsored = !!sponsorEmail;
  const rawRef = String(data?.ref || data?.referredBy || '').trim();
  const referredBy = normalizeToSbdReferralCode(rawRef);
  const requireReferral = data?.requireReferral === true;
  const productId = resolveSbdProductId(data?.productId || 'foundation-yearly');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new functions.https.HttpsError('invalid-argument', 'A valid learner email is required.');
  }

  if (isSponsored && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sponsorEmail)) {
    throw new functions.https.HttpsError('invalid-argument', 'A valid sponsor email is required.');
  }

  if (isSponsored && sponsorEmail === email) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Sponsor email must be different from the learner login email.'
    );
  }

  if (requireReferral && !referredBy) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'A valid operator referral code is required (SBD-XXXX).'
    );
  }

  if (referredBy) {
    const sellerCheck = await findSellerBySbdReferralCode(referredBy);
    if (!sellerCheck) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Referral code not recognized. Check the operator code (SBD-XXXX) and try again.'
      );
    }
  }

  if (productId !== 'foundation-yearly') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'This guest checkout is for 12-Month Foundation Access only.'
    );
  }

  const resolved = await resolveSbdCatalogProduct(productId);
  if (!resolved || !resolved.product) {
    throw new functions.https.HttpsError('invalid-argument', `Unknown product: ${productId}`);
  }
  const product = resolved.product;

  let uid = null;
  let isNew = false;
  try {
    const existing = await admin.auth().getUserByEmail(email);
    uid = existing.uid;
  } catch (notFoundErr) {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    const tempPassword = Array.from({ length: 14 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join('');
    const userRecord = await admin.auth().createUser({
      email,
      password: tempPassword,
      displayName: name,
      emailVerified: false,
    });
    uid = userRecord.uid;
    isNew = true;
  }

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const existingData = userSnap.exists ? userSnap.data() : {};
  const patch = {
    uid,
    email,
    name: existingData.name || name,
    role: existingData.role === 'admin' ? 'admin' : (existingData.role || 'member'),
    signupApp: existingData.signupApp || 'foundation-yearly-landing',
    lastActive: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (isSponsored) {
    patch.sponsoredByEmail = sponsorEmail;
    if (sponsorName) patch.sponsoredByName = sponsorName;
  }
  if (isNew || !userSnap.exists) {
    patch.createdAt = admin.firestore.FieldValue.serverTimestamp();
    patch.groups = existingData.groups || [];
  }
  if (!existingData.referredBy && referredBy) {
    patch.referredBy = referredBy;
  }
  await userRef.set(firestoreSafeObject(patch), { merge: true });

  if (referredBy && !existingData.referredBy) {
    try {
      const seller = await findSellerBySbdReferralCode(referredBy);
      if (seller) {        await seller.ref.update({
          'sbdReferrals.signups': admin.firestore.FieldValue.increment(1)
        });
      }
    } catch (signupErr) {
      console.warn('[SBD Guest] signup increment skipped:', signupErr.message);
    }
  }

  const landingCancel = referredBy
    ? `https://marriageducation.com/foundation-access.html?ref=${encodeURIComponent(referredBy)}&cancelled=1`
    : 'https://marriageducation.com/foundation-access.html?cancelled=1';

  const priceData = {
    currency: 'usd',
    product_data: { name: product.name },
    unit_amount: product.amount,
  };
  const trimmedPriceId = typeof product.stripePriceId === 'string' ? product.stripePriceId.trim() : '';
  const lineItem = trimmedPriceId
    ? { price: trimmedPriceId, quantity: 1 }
    : { price_data: priceData, quantity: 1 };

  const receiptEmail = isSponsored ? sponsorEmail : email;
  const meta = {
    app: 'sbd',
    uid,
    productId,
    guest: '1',
    referredBy: referredBy || '',
    loginEmail: email,
    sponsored: isSponsored ? '1' : '0',
    sponsorEmail: isSponsored ? sponsorEmail : '',
    sponsorName: isSponsored ? (sponsorName || '') : '',
  };

  const session = await stripe.checkout.sessions.create({
    customer_email: receiptEmail,
    client_reference_id: uid,
    metadata: meta,
    mode: 'payment',
    line_items: [lineItem],
    success_url:
      `https://sbd-network.web.app/checkout-success.html?product=${productId}` +
      `&session_id={CHECKOUT_SESSION_ID}&guest=1`,
    cancel_url: landingCancel,
  });

  console.log(
    `[SBD Guest Checkout] uid=${uid} new=${isNew} product=${productId} ` +
    `ref=${referredBy || 'none'} sponsored=${isSponsored} session=${session.id}`
  );

  return {
    url: session.url,
    uid,
    isNew,
    productId,
    sponsored: isSponsored,
  };
});

/**
 * Guest 12-Month Foundation Access — Manual MoMo / Orange Money path. One-time payment; no auto-renewal.
 * Creates Auth user + pending_payments; admin approve unlocks Foundation + commissions.
 */
exports.createSbdGuestManualPayment = functions.https.onCall(async (data) => {
  const email = String(data?.email || '').trim().toLowerCase();
  const name = String(data?.name || '').trim() || 'Student';
  const phone = String(data?.phone || '').trim();
  const sponsorEmail = String(data?.sponsorEmail || '').trim().toLowerCase();
  const sponsorName = String(data?.sponsorName || '').trim();
  const isSponsored = !!sponsorEmail;
  const rawRef = String(data?.ref || data?.referredBy || '').trim();
  const referredBy = normalizeToSbdReferralCode(rawRef);
  const momoNetwork = String(data?.momo_network || 'mtn').toLowerCase() === 'orange' ? 'orange' : 'mtn';
  const productId = resolveSbdProductId(data?.productId || 'foundation-yearly');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new functions.https.HttpsError('invalid-argument', 'A valid learner email is required.');
  }
  if (!phone || phone.replace(/\D/g, '').length < 9) {
    throw new functions.https.HttpsError('invalid-argument', 'A valid MoMo phone number is required.');
  }
  if (isSponsored && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sponsorEmail)) {
    throw new functions.https.HttpsError('invalid-argument', 'A valid sponsor email is required.');
  }
  if (isSponsored && sponsorEmail === email) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Sponsor email must be different from the learner login email.'
    );
  }
  if (productId !== 'foundation-yearly') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Manual MoMo guest checkout is for Foundation Access — 12 Months only.'
    );
  }
  if (referredBy) {
    const sellerCheck = await findSellerBySbdReferralCode(referredBy);
    if (!sellerCheck) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Referral code not recognized. Check the operator code (SBD-XXXX) and try again.'
      );
    }
  }

  let uid = null;
  let isNew = false;
  try {
    const existing = await admin.auth().getUserByEmail(email);
    uid = existing.uid;
  } catch (notFoundErr) {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    const tempPassword = Array.from({ length: 14 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join('');
    const userRecord = await admin.auth().createUser({
      email,
      password: tempPassword,
      displayName: name,
      emailVerified: false,
    });
    uid = userRecord.uid;
    isNew = true;
  }

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const existingData = userSnap.exists ? userSnap.data() : {};
  const patch = {
    uid,
    email,
    name: existingData.name || name,
    role: existingData.role === 'admin' ? 'admin' : (existingData.role || 'member'),
    signupApp: existingData.signupApp || 'foundation-yearly-landing',
    lastActive: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (phone) patch.phone = phone;
  if (isSponsored) {
    patch.sponsoredByEmail = sponsorEmail;
    if (sponsorName) patch.sponsoredByName = sponsorName;
  }
  if (isNew || !userSnap.exists) {
    patch.createdAt = admin.firestore.FieldValue.serverTimestamp();
    patch.groups = existingData.groups || [];
  }
  if (!existingData.referredBy && referredBy) {
    patch.referredBy = referredBy;
  }
  await userRef.set(firestoreSafeObject(patch), { merge: true });

  if (referredBy && !existingData.referredBy) {
    try {
      const seller = await findSellerBySbdReferralCode(referredBy);
      if (seller) {
        await seller.ref.update({
          'sbdReferrals.signups': admin.firestore.FieldValue.increment(1)
        });
      }
    } catch (signupErr) {
      console.warn('[SBD MoMo] signup increment skipped:', signupErr.message);
    }
  }

  const reference = `FY-${Date.now().toString(36).toUpperCase()}-${uid.slice(0, 6).toUpperCase()}`;
  const amount = YEARLY_REVENUE_BASE_FCFA; // 86,502 FCFA ($144.17 @ 600), one-time for 12-month access
  const payeeNumber = momoNetwork === 'orange' ? '237 699 651 555' : '237 677 604 100';
  const payeeName = 'Achu Gustave Mokom';
  const contactEmail = isSponsored ? sponsorEmail : email;

  const paymentData = {
    reference,
    product_id: productId,
    product_name: 'Foundation Access — 12 Months',
    amount,
    currency: 'XAF',
    email: contactEmail,
    loginEmail: email,
    name,
    phone,
    uid,
    guest: true,
    app: 'sbd',
    type: 'sbd_subscription',
    referral_code: referredBy || '',
    referredBy: referredBy || '',
    sponsored: isSponsored,
    sponsorEmail: isSponsored ? sponsorEmail : '',
    sponsorName: isSponsored ? sponsorName : '',
    status: 'pending',
    payment_channel: 'manual',
    momo_network: momoNetwork,
    payment_method: momoNetwork === 'orange' ? 'orange_money' : 'momo',
    payee_number: payeeNumber,
    payee_name: payeeName,
    created_at: admin.firestore.FieldValue.serverTimestamp()
  };

  await db.collection('pending_payments').doc(reference).set(paymentData);

  await writeUnifiedPaymentRecord({
    source: 'manual_payment',
    reference,
    external_reference: reference,
    record_type: 'customer_payment',
    channel: 'manual',
    payment_method: paymentData.payment_method,
    payment_category: 'sbd_subscription',
    product_id: productId,
    product_name: paymentData.product_name,
    amount,
    currency: 'XAF',
    customer_email: contactEmail,
    customer_phone: phone,
    ambassador_code: '',
    recruiter_code: referredBy || '',
    status: 'pending',
    action_required: true,
    created_at: admin.firestore.FieldValue.serverTimestamp()
  });

  try {
    const networkLabel = momoNetwork === 'orange' ? 'Orange Money' : 'MTN MoMo';
    await sendTelegram(
      `🔔 FOUNDATION ACCESS — MOMO PENDING\n\n` +
      `📋 Reference: ${reference}\n` +
      `💰 Amount: ${amount.toLocaleString()} XAF ($${FOUNDATION_YEARLY_USD})\n` +
      `🏦 Network: ${networkLabel}\n` +
      `📥 Payee: ${payeeNumber} (${payeeName})\n` +
      `👤 Learner: ${email}\n` +
      `📱 Phone: ${phone}\n` +
      (referredBy ? `🔗 Referral: ${referredBy}\n` : '🔗 Referral: (none)\n') +
      (isSponsored ? `🎁 Sponsor: ${sponsorEmail}\n` : '') +
      `\n👉 Approve: https://marriageducation.com/admin-dashboard.html`,
      false
    );
  } catch (tgErr) {
    console.warn('[SBD MoMo] Telegram failed:', tgErr.message);
  }

  console.log(`[SBD Guest MoMo] uid=${uid} new=${isNew} ref=${reference} referral=${referredBy || 'none'}`);

  return {
    success: true,
    reference,
    uid,
    isNew,
    productId,
    amount,
    currency: 'XAF',
    payee_number: payeeNumber,
    payee_name: payeeName,
    momo_network: momoNetwork,
    message: 'Payment submitted for approval'
  };
});

/**
 * Authenticated SBD Network checkout — Manual MoMo for 12-Month Foundation Access only.
 * Monthly tiers stay Stripe-only (recurring billing).
 */
exports.createSbdManualPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in to purchase.');
  }

  const uid = context.auth.uid;
  const productId = resolveSbdProductId(data?.productId || 'foundation-yearly');
  const phone = String(data?.phone || '').trim();
  const momoNetwork = String(data?.momo_network || 'mtn').toLowerCase() === 'orange' ? 'orange' : 'mtn';

  if (productId !== 'foundation-yearly') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Manual MoMo is only available for Foundation Access — 12 Months ($144.17). Monthly plans use Stripe.'
    );
  }
  if (!phone || phone.replace(/\D/g, '').length < 9) {
    throw new functions.https.HttpsError('invalid-argument', 'A valid MoMo phone number is required.');
  }

  const userSnap = await db.collection('users').doc(uid).get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const email = String(context.auth.token.email || userData.email || '').trim().toLowerCase();
  const name = String(userData.name || context.auth.token.name || 'Student').trim();
  const referredBy = normalizeToSbdReferralCode(userData.referredBy || '');

  if (!email) {
    throw new functions.https.HttpsError('failed-precondition', 'Your account needs an email address.');
  }

  const amount = YEARLY_REVENUE_BASE_FCFA;
  const payeeNumber = momoNetwork === 'orange' ? '237 699 651 555' : '237 677 604 100';
  const payeeName = 'Achu Gustave Mokom';
  const reference = `FY-${Date.now().toString(36).toUpperCase()}-${uid.slice(0, 6).toUpperCase()}`;

  await db.collection('users').doc(uid).set({
    phone: phone,
    lastActive: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  const paymentData = {
    reference,
    product_id: productId,
    product_name: 'Foundation Access — 12 Months',
    amount,
    currency: 'XAF',
    email,
    loginEmail: email,
    name,
    phone,
    uid,
    guest: false,
    app: 'sbd',
    type: 'sbd_subscription',
    referral_code: referredBy || '',
    referredBy: referredBy || '',
    status: 'pending',
    payment_channel: 'manual',
    momo_network: momoNetwork,
    payment_method: momoNetwork === 'orange' ? 'orange_money' : 'momo',
    payee_number: payeeNumber,
    payee_name: payeeName,
    created_at: admin.firestore.FieldValue.serverTimestamp()
  };

  await db.collection('pending_payments').doc(reference).set(paymentData);

  await writeUnifiedPaymentRecord({
    source: 'manual_payment',
    reference,
    external_reference: reference,
    record_type: 'customer_payment',
    channel: 'manual',
    payment_method: paymentData.payment_method,
    payment_category: 'sbd_subscription',
    product_id: productId,
    product_name: paymentData.product_name,
    amount,
    currency: 'XAF',
    customer_email: email,
    customer_phone: phone,
    ambassador_code: '',
    recruiter_code: referredBy || '',
    status: 'pending',
    action_required: true,
    created_at: admin.firestore.FieldValue.serverTimestamp()
  });

  try {
    const networkLabel = momoNetwork === 'orange' ? 'Orange Money' : 'MTN MoMo';
    await sendTelegram(
      `🔔 FOUNDATION ACCESS — MOMO PENDING (SBD app)\n\n` +
      `📋 Reference: ${reference}\n` +
      `💰 Amount: ${amount.toLocaleString()} XAF ($${FOUNDATION_YEARLY_USD})\n` +
      `🏦 Network: ${networkLabel}\n` +
      `📥 Payee: ${payeeNumber} (${payeeName})\n` +
      `👤 ${email}\n` +
      `📱 ${phone}\n` +
      (referredBy ? `🔗 Referral: ${referredBy}\n` : '🔗 Referral: (none)\n') +
      `\n👉 Approve: https://marriageducation.com/admin-dashboard.html`,
      false
    );
  } catch (tgErr) {
    console.warn('[SBD MoMo auth] Telegram failed:', tgErr.message);
  }

  console.log(`[SBD MoMo] uid=${uid} ref=${reference} referral=${referredBy || 'none'}`);

  return {
    success: true,
    reference,
    uid,
    productId,
    amount,
    currency: 'XAF',
    payee_number: payeeNumber,
    payee_name: payeeName,
    momo_network: momoNetwork,
    accessMonths: 12,
    message: 'Payment submitted for approval'
  };
});

/**
 * Open Stripe's hosted customer portal for SBD subscribers.
 * The portal configuration enforces cancellation at the end of the paid period.
 */
exports.createSbdBillingPortalSession = functions.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in to manage billing.');
  }

  const uid = context.auth.uid;
  const userSnap = await db.collection('users').doc(uid).get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const customerId = typeof userData.stripeCustomerId === 'string'
    ? userData.stripeCustomerId.trim()
    : '';

  if (!customerId) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'No Stripe billing account is connected to this profile.'
    );
  }

  try {
    const configRef = db.collection('admin').doc('stripeBillingPortal');
    const configSnap = await configRef.get();
    let configurationId = configSnap.exists
      ? String(configSnap.data()?.configurationId || '').trim()
      : '';

    if (!configurationId) {
      const configuration = await stripe.billingPortal.configurations.create({
        business_profile: {
          headline: 'Manage your SBD Network subscription',
        },
        features: {
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          subscription_cancel: {
            enabled: true,
            mode: 'at_period_end',
          },
        },
      });
      configurationId = configuration.id;
      await configRef.set({
        configurationId,
        cancellationMode: 'at_period_end',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      configuration: configurationId,
      return_url: 'https://sbd-network.web.app/profile.html',
    });

    return { url: session.url };
  } catch (err) {
    console.error('[SBD Billing Portal]', err);
    throw new functions.https.HttpsError(
      'internal',
      'Unable to open billing management right now. Please try again.'
    );
  }
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
        price: 500000,
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
    
    // Map FCFA to XOF (Stripe-supported CFA Franc)
    const stripeCurrency = finalCurrency === 'fcfa' ? 'xof' : finalCurrency;
    
    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: stripeCurrency,
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
        app: product_id.startsWith('sbd-') ? 'sbd' : 'marriage',
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

    const phoneStored = data.phoneE164 || data.phone;
    const countryCode = data.country || 'CM';
    const currency = data.currency || (countryCode === 'CM' ? 'XAF' : 'USD');
    
    // Save to Firestore for backup — merge by AMB code or email (avoid duplicate auto-IDs on resubmit)
    try {
      const backupPayload = {
        ...data,
        phone: phoneStored,
        phoneE164: phoneStored,
        country: countryCode,
        currency,
        submittedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'cloud_function'
      };
      const ambCode = (data.code || '').toString().trim().toUpperCase();
      if (ambCode.startsWith('AMB-')) {
        await db.collection('ambassadors').doc(ambCode).set(backupPayload, { merge: true });
        console.log('[Ambassador] Merged backup to:', ambCode);
      } else if (data.email) {
        const emailSnap = await db.collection('ambassadors')
          .where('email', '==', data.email)
          .limit(1)
          .get();
        if (!emailSnap.empty) {
          await emailSnap.docs[0].ref.set(backupPayload, { merge: true });
          console.log('[Ambassador] Merged backup to existing email doc:', emailSnap.docs[0].id);
        } else {
          await db.collection('ambassadors').add(backupPayload);
          console.log('[Ambassador] Created backup application doc for:', data.email);
        }
      } else {
        await db.collection('ambassadors').add(backupPayload);
      }
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
              <td style="padding: 8px 0;">${phoneStored}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; font-weight: bold;">Country:</td>
              <td style="padding: 8px 0;">${data.countryName || countryCode}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; font-weight: bold;">City:</td>
              <td style="padding: 8px 0;">${data.city}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; font-weight: bold;">Region:</td>
              <td style="padding: 8px 0;">${data.region}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; font-weight: bold;">Entry fee:</td>
              <td style="padding: 8px 0;">${currency === 'USD' ? '$' + (data.entryAmount || 30) + ' USD' : (data.entryAmount || 15000) + ' FCFA'}</td>
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
        }      }
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
    
    // 3. Calculate commissions (10% + 5% + 5% = 20%)
    const baseCommission = product.price * (product.commission_rate || 0.10);
    
    const commissions = {
      total_commission: baseCommission * 2.0, // 20% total
      ambassador_amount: baseCommission,       // 10%
      ambassador_id: customer.source_ambassador,
      senior_amount: customer.source_senior ? baseCommission * 0.5 : 0,  // 5%
      senior_id: customer.source_senior,
      rd_amount: customer.source_rd ? baseCommission * 0.5 : 0,  // 5%
      rd_id: customer.source_rd,
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
        rd: commissions.rd_amount
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
  
  // 4. Update volume tracking
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
    const rdSbdCode = deriveSbdReferralCode(rdCode) || rdCode.replace(/^RD-/, 'SBD-');
    const rdRef = db.collection('regional_directors').doc(rdCode);
    batch.set(rdRef, {
      ...fullAmbassadorData,
      code: rdCode,
      rd_code: rdCode,
      ambassador_code: ambassadorCode,      ambassador_type: 'regional_director',
      sbdReferralCode: fullAmbassadorData.sbdReferralCode || rdSbdCode,
      sbdReferrals: fullAmbassadorData.sbdReferrals || { signups: 0, subscribers: 0 },
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

    if (fullAmbassadorData.email) {
      try {
        await provisionSBDAccess(
          fullAmbassadorData.email,
          rdCode,
          fullAmbassadorData.fullName || fullAmbassadorData.name || fullAmbassadorData.email
        );
      } catch (sbdErr) {
        console.error(`[SBD] RD promotion provision failed for ${rdCode}:`, sbdErr.message);
      }
    }
    
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
      message: `You've been promoted to Executive Network Director for recruiting 1+ Regional Directors! Earn by replicating full RD infrastructure — scale recurring override across multiple mature networks.`,
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
              <li>✅ <strong>TOP TIER LEADERSHIP</strong> — elite status in the organization</li>
              <li>✅ You earn by <strong>replicating full RD infrastructure</strong> — not by an extra override layer</li>
              <li>✅ Each mature RD network you develop generates recurring RD override (~250M FCFA/month at scale)</li>
              <li>✅ Manage multiple Regional Directors and their networks</li>
              <li>✅ Access the <strong>Executive Dashboard</strong> with advanced analytics</li>
            </ul>
            
            <h3>Your Network:</h3>
            <ul>
              <li>Regional Directors Recruited: ${fullAmbassadorData.directRDCount || fullAmbassadorData.rds_recruited || 1}+</li>
              <li>Total Network: 1,000+ ambassadors across multiple RD territories</li>
              <li>Product commissions remain 10% + 5% + 5% (Ambassador · Senior · RD) — no executive slice</li>
            </ul>
            
            <h3>Next Steps:</h3>
            <ol>
              <li>Login to your dashboard: <a href="https://marriageducation.com/ambassador-login.html">Ambassador Login</a></li>
              <li>Access your Executive Network Director Dashboard</li>
              <li>Monitor network-wide performance and RD development</li>
              <li>Focus on duplicating RD deployments to scale recurring override income</li>
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
        `Earn by replicating RD infrastructure — no executive override layer\n` +
        `Target: scale multiple mature RD networks (~250M FCFA/month each at scale)`;
      
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
        const { userA, userB } = d.data();        if (!historyMap.has(userA)) historyMap.set(userA, new Set());
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

// ============================================
// COMMERCE ENGINE V1 (SANDBOX — isolated from production checkout)
// ============================================
const commerceEngineV1 = require('./commerceEngine');
exports.commerceV1InitiateCheckout = commerceEngineV1.commerceV1InitiateCheckout;
exports.commerceV1SimulatePayment = commerceEngineV1.commerceV1SimulatePayment;
exports.commerceV1GetDashboard = commerceEngineV1.commerceV1GetDashboard;
exports.commerceV1CampayWebhook = commerceEngineV1.commerceV1CampayWebhook;
exports.commerceV1ProcessPayoutBatch = commerceEngineV1.commerceV1ProcessPayoutBatch;
exports.commerceV1RunPayoutBatch = commerceEngineV1.commerceV1RunPayoutBatch;

// ============================================
// DOS — Deployment Operations System (Phase 0 metrics)
// ============================================
const dosMetrics = require('./dos/metricsAggregator');

exports.refreshDosMetrics = functions.https.onCall(async (data) => {
  const code = (data && (data.ambassadorCode || data.code)) || '';
  if (!code) {
    throw new functions.https.HttpsError('invalid-argument', 'ambassadorCode is required');
  }
  const doc = await db.collection('ambassadors').doc(code).get();
  if (!doc.exists) {
    throw new functions.https.HttpsError('not-found', 'Ambassador not found');
  }
  const payload = await dosMetrics.syncDosMetrics(db, code, doc.data());
  return { success: true, metrics: payload };
});

exports.onAmbassadorWriteSyncDosMetrics = functions.firestore
  .document('ambassadors/{ambassadorCode}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) {
      return null;
    }
    const ambassadorCode = context.params.ambassadorCode;
    try {
      await dosMetrics.syncDosMetrics(db, ambassadorCode, change.after.data());
    } catch (err) {
      console.error('[DOS] syncDosMetrics failed for', ambassadorCode, err);
    }
    return null;
  });

// ============================================
// Commerce OS Tier 1 — wallet & payout
// ============================================
const walletPayoutTier1 = require('./wallet-payout-tier1');
const walletTier1Api = walletPayoutTier1.registerWalletPayoutTier1(db, exports);

const { registerSbdCommissionPayout } = require('./sbd-commission-payout');
registerSbdCommissionPayout(db, exports, {
  assertAdmin: walletTier1Api.assertAdmin
});

const { registerPaymentInquiries } = require('./payment-inquiries');
registerPaymentInquiries(db, exports, {
  assertAdmin: walletTier1Api.assertAdmin,
  sendTelegram
});

// ============================================
// Commerce OS Tier 2 — CamPay production pilot
// ============================================
const { registerCommerceOsTier2 } = require('./commerce-os-tier2');
registerCommerceOsTier2(db, admin, exports, {
  fulfillPendingPayment: (reference, options) =>
    getPaymentFulfillment().fulfillPendingPayment(reference, options),
  assertAdmin: walletTier1Api.assertAdmin,
  markPayoutBatchPaidCore: (data, adminUser) =>
    walletTier1Api.markPayoutBatchPaidCore(data, adminUser),
  normalizeAmbassadorRecruiterPaymentFields,
  writeUnifiedPaymentRecord
});

registerAdminUserTools(db, exports);
registerStudioCanonAi(db, exports);

const { registerNotificationMaintenance } = require('./notification-maintenance');
registerNotificationMaintenance(db, exports);

const { registerAdminCommunication } = require('./admin-communication');
registerAdminCommunication(db, exports, {
  assertAdmin: walletTier1Api.assertAdmin,
  transporter,
  smtpFrom: SMTP_CONFIG.from
});