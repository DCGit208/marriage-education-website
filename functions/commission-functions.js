/**
 * MULTI-PRODUCT COMMISSION CLOUD FUNCTIONS
 * 
 * Add these functions to your functions/index.js file to enable
 * multi-product commission tracking across the entire portfolio.
 * 
 * Instructions:
 * 1. Copy the code below
 * 2. Paste at the end of functions/index.js (before the final closing)
 * 3. Deploy: firebase deploy --only functions
 */

// ========== MULTI-PRODUCT COMMISSION SYSTEM ==========

/**
 * Process product deployment with universal commission tracking
 * Replaces old trackAmbassadorSale for multi-product support
 * 
 * Usage from client:
 * const processDeployment = functions.httpsCallable('processProductDeployment');
 * const result = await processDeployment({
 *   product_id: 'sbd-dummies-book',
 *   customer_email: 'john@example.com',
 *   customer_phone: '+237678901234',
 *   customer_name: 'John Doe',
 *   ref_code: 'AMB-X-001',
 *   amount_paid: 15000,
 *   payment_id: 'PAY-12345'
 * });
 */
async function processProductDeployment(data, context) {
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
      total_commission: baseCommission * 2,
      ambassador_amount: baseCommission,
      ambassador_id: customer.source_ambassador,
      senior_amount: customer.source_senior ? baseCommission * 0.5 : 0,
      senior_id: customer.source_senior,
      rd_amount: customer.source_rd ? baseCommission * 0.5 : 0,
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
}

/**
 * Get or create customer with permanent attribution
 */
async function getOrCreateCustomerWithAttribution(email, phone, name, refCode) {
  // Check if customer exists
  const existingQuery = await db.collection('customers').where('email', '==', email).limit(1).get();
  
  if (!existingQuery.empty) {
    const customerDoc = existingQuery.docs[0];
    console.log('✅ Existing customer found:', customerDoc.id);
    return { id: customerDoc.id, ...customerDoc.data() };
  }
  
  // New customer - establish attribution
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
  
  const match = refCode.match(/(AMB|SNR|RD)-([A-Z])-(\d+)/);
  if (!match) return null;
  
  const [, type, region, number] = match;
  const fullCode = `${type}-${region}-${number}`;
  
  if (type === 'AMB' || type === 'SNR') {
    const ambassadorQuery = await db.collection('ambassadors')
      .where('code', '==', fullCode)
      .limit(1)
      .get();
    
    if (ambassadorQuery.empty) return null;
    
    const ambassador = ambassadorQuery.docs[0].data();
    
    return {
      ambassador_id: ambassadorQuery.docs[0].id,
      senior_id: ambassador.recruited_by_senior || null,
      rd_id: ambassador.recruited_by_rd || ambassador.rdCode || null
    };
  } else if (type === 'RD') {
    const rdQuery = await db.collection('regional_directors')
      .where('code', '==', fullCode)
      .limit(1)
      .get();
    
    if (rdQuery.empty) return null;
    
    return {
      ambassador_id: null,
      senior_id: null,
      rd_id: rdQuery.docs[0].id
    };
  }
  
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
  
  // 3. Credit RD (5%)
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
    
    console.log(`✅ Credited RD: ${commissions.rd_amount.toLocaleString()} FCFA (override)`);
  }
  
  await batch.commit();
  console.log('✅ All commissions credited instantly');
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

// ========== EXPORT CLOUD FUNCTIONS ==========

// Add this line to your exports at the bottom of functions/index.js:
// exports.processProductDeployment = functions.https.onCall(processProductDeployment);
