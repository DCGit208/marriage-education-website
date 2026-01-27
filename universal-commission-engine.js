/**
 * UNIVERSAL COMMISSION ENGINE
 * 
 * Processes commission for ANY product deployment across the entire portfolio.
 * Handles:
 * - Ambassador direct earnings (10%)
 * - Senior Ambassador team override (5%)
 * - Regional Director network override (5%)
 * - Category-based tracking
 * - Monthly target monitoring ($3,000 USD / 1,800,000 FCFA)
 * - Real-time dashboard updates
 * 
 * Uses correct terminology: "deploy", "advocacy earnings", "facilitate access"
 */

const admin = require('firebase-admin');
const { getOrCreateCustomer, getCustomerAttribution } = require('./customer-attribution');

const db = admin.firestore();

/**
 * MAIN FUNCTION: Process Product Deployment
 * 
 * Called when ANY product is deployed (purchased) through the ecosystem.
 * 
 * @param {object} deploymentData - Deployment details
 * @param {string} deploymentData.product_id - Product ID from products collection
 * @param {string} deploymentData.customer_email - Customer email
 * @param {string} deploymentData.customer_phone - Customer phone
 * @param {string} deploymentData.customer_name - Customer name
 * @param {string} deploymentData.ref_code - Referral code (AMB-X-001)
 * @param {number} deploymentData.amount_paid - Amount paid in FCFA
 * @param {string} deploymentData.payment_id - Payment transaction ID
 * @returns {object} - Commission breakdown and tracking IDs
 */
async function processProductDeployment(deploymentData) {
  console.log('🚀 Processing product deployment:', deploymentData.product_id);
  
  try {
    // 1. Get product details
    const product = await getProductDetails(deploymentData.product_id);
    if (!product) {
      throw new Error(`Product not found: ${deploymentData.product_id}`);
    }
    
    console.log(`📦 Product: ${product.name} (${product.category}) - ${product.price.toLocaleString()} FCFA`);
    
    // 2. Get or create customer with attribution
    const customer = await getOrCreateCustomer(
      deploymentData.customer_email,
      deploymentData.customer_phone,
      deploymentData.customer_name,
      deploymentData.ref_code
    );
    
    console.log(`👤 Customer: ${customer.name} (${customer.id})`);
    console.log(`🎯 Attribution: AMB=${customer.source_ambassador}, SNR=${customer.source_senior}, RD=${customer.source_rd}`);
    
    // 3. Calculate commissions
    const commissions = calculateCommissions(product, customer);
    
    console.log('💰 Commission breakdown:', commissions);
    
    // 4. Record sale
    const saleRef = await recordSale(deploymentData, product, customer, commissions);
    
    console.log(`📝 Sale recorded: ${saleRef.id}`);
    
    // 5. Update customer purchase history
    await updateCustomerHistory(customer.id, saleRef.id, product, commissions);
    
    // 6. Credit commissions to all levels
    await creditCommissions(customer, product, commissions, saleRef.id);
    
    // 7. Check monthly targets
    await checkMonthlyTargets(customer);
    
    console.log('✅ Deployment processed successfully!');
    
    return {
      success: true,
      sale_id: saleRef.id,
      product: product.name,
      customer_id: customer.id,
      commissions: commissions,
      ambassador_id: customer.source_ambassador,
      senior_id: customer.source_senior,
      rd_id: customer.source_rd
    };
    
  } catch (error) {
    console.error('❌ Error processing deployment:', error);
    throw error;
  }
}

/**
 * Get product details from products collection
 */
async function getProductDetails(productId) {
  const productDoc = await db.collection('products').doc(productId).get();
  
  if (!productDoc.exists) return null;
  
  return {
    id: productDoc.id,
    ...productDoc.data()
  };
}

/**
 * Calculate commission breakdown
 * Standard: 10% ambassador + 5% senior + 5% RD = 20% total
 */
function calculateCommissions(product, customer) {
  const baseCommission = product.price * product.commission_rate;
  
  const breakdown = {
    total_commission: baseCommission * 2, // 20% total (10% + 5% + 5%)
    
    // Direct ambassador earnings (10%)
    ambassador_amount: baseCommission,
    ambassador_id: customer.source_ambassador,
    
    // Senior team override (5%)
    senior_amount: customer.source_senior ? baseCommission * 0.5 : 0,
    senior_id: customer.source_senior,
    
    // RD network override (5%)
    rd_amount: customer.source_rd ? baseCommission * 0.5 : 0,
    rd_id: customer.source_rd,
    
    // Metadata
    product_category: product.category,
    product_price: product.price,
    commission_rate: product.commission_rate
  };
  
  return breakdown;
}

/**
 * Record sale in universal sales collection
 */
async function recordSale(deploymentData, product, customer, commissions) {
  const saleData = {
    // Product info
    product_id: product.id,
    product_name: product.name,
    product_category: product.category,
    product_price: product.price,
    
    // Customer info
    customer_id: customer.id,
    customer_email: customer.email,
    customer_name: customer.name,
    
    // Attribution (permanent)
    source_ambassador: customer.source_ambassador,
    source_senior: customer.source_senior,
    source_rd: customer.source_rd,
    
    // Payment info
    amount_paid: deploymentData.amount_paid,
    payment_id: deploymentData.payment_id,
    payment_status: 'completed',
    
    // Commission breakdown
    commissions: {
      total: commissions.total_commission,
      ambassador: commissions.ambassador_amount,
      senior: commissions.senior_amount,
      rd: commissions.rd_amount
    },
    
    // Terminology compliance
    deployment_type: 'access_facilitation',
    earnings_type: 'advocacy_earnings',
    
    // Metadata
    sale_date: admin.firestore.FieldValue.serverTimestamp(),
    created_at: admin.firestore.FieldValue.serverTimestamp()
  };
  
  return await db.collection('sales').add(saleData);
}

/**
 * Update customer purchase history
 */
async function updateCustomerHistory(customerId, saleId, product, commissions) {
  const customerRef = db.collection('customers').doc(customerId);
  
  await customerRef.update({
    purchase_history: admin.firestore.FieldValue.arrayUnion({
      sale_id: saleId,
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
  
  console.log(`✅ Customer history updated: ${customerId}`);
}

/**
 * Credit commissions to all levels instantly
 */
async function creditCommissions(customer, product, commissions, saleId) {
  const batch = db.batch();
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // 1. Credit Ambassador (10% direct)
  if (commissions.ambassador_id) {
    const ambassadorRef = db.collection('ambassadors').doc(commissions.ambassador_id);
    
    batch.update(ambassadorRef, {
      // Overall stats
      commissionEarned: admin.firestore.FieldValue.increment(commissions.ambassador_amount),
      
      // Category-based tracking
      [`deployment_by_category.${product.category}`]: admin.firestore.FieldValue.increment(1),
      [`revenue_by_category.${product.category}`]: admin.firestore.FieldValue.increment(commissions.ambassador_amount),
      
      // Monthly earnings tracking
      [`monthly_earnings.${monthKey}.total`]: admin.firestore.FieldValue.increment(commissions.ambassador_amount),
      [`monthly_earnings.${monthKey}.${product.category}`]: admin.firestore.FieldValue.increment(commissions.ambassador_amount),
      
      // Access units deployed
      access_units_deployed: admin.firestore.FieldValue.increment(1),
      
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Credited ambassador ${commissions.ambassador_id}: ${commissions.ambassador_amount.toLocaleString()} FCFA`);
  }
  
  // 2. Credit Senior Ambassador (5% team override)
  if (commissions.senior_id) {
    const seniorRef = db.collection('ambassadors').doc(commissions.senior_id);
    
    batch.update(seniorRef, {
      // Overall stats
      commissionEarned: admin.firestore.FieldValue.increment(commissions.senior_amount),
      team_override_earned: admin.firestore.FieldValue.increment(commissions.senior_amount),
      
      // Category-based team override tracking
      [`team_revenue_by_category.${product.category}`]: admin.firestore.FieldValue.increment(commissions.senior_amount),
      
      // Monthly earnings
      [`monthly_earnings.${monthKey}.total`]: admin.firestore.FieldValue.increment(commissions.senior_amount),
      [`monthly_earnings.${monthKey}.team_override`]: admin.firestore.FieldValue.increment(commissions.senior_amount),
      
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Credited senior ${commissions.senior_id}: ${commissions.senior_amount.toLocaleString()} FCFA (override)`);
  }
  
  // 3. Credit Regional Director (5% network override)
  if (commissions.rd_id) {
    const rdRef = db.collection('regional_directors').doc(commissions.rd_id);
    
    batch.update(rdRef, {
      // Overall stats
      totalCommissionEarned: admin.firestore.FieldValue.increment(commissions.rd_amount),
      network_override_earned: admin.firestore.FieldValue.increment(commissions.rd_amount),
      
      // Category-based network tracking
      [`network_deployment_by_category.${product.category}`]: admin.firestore.FieldValue.increment(1),
      [`network_revenue_by_category.${product.category}`]: admin.firestore.FieldValue.increment(commissions.rd_amount),
      
      // Monthly earnings
      [`monthly_earnings.${monthKey}.total`]: admin.firestore.FieldValue.increment(commissions.rd_amount),
      [`monthly_earnings.${monthKey}.network_override`]: admin.firestore.FieldValue.increment(commissions.rd_amount),
      
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Credited RD ${commissions.rd_id}: ${commissions.rd_amount.toLocaleString()} FCFA (override)`);
  }
  
  // Execute batch
  await batch.commit();
  
  console.log('✅ All commissions credited instantly');
  
  // Send notifications
  await sendCommissionNotifications(customer, product, commissions, saleId);
}

/**
 * Check if monthly targets hit and send celebrations
 */
async function checkMonthlyTargets(customer) {
  const TARGET_MONTHLY = 1800000; // 1.8M FCFA = $3,000 USD
  
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // Check ambassador target
  if (customer.source_ambassador) {
    const ambassadorDoc = await db.collection('ambassadors').doc(customer.source_ambassador).get();
    const ambassador = ambassadorDoc.data();
    
    const monthlyEarnings = ambassador.monthly_earnings?.[monthKey]?.total || 0;
    
    if (monthlyEarnings >= TARGET_MONTHLY) {
      console.log(`🎉 AMBASSADOR HIT $3K TARGET! ${monthlyEarnings.toLocaleString()} FCFA this month`);
      
      // Send celebration notification
      await sendTargetHitNotification(customer.source_ambassador, monthlyEarnings, 'ambassador');
    } else {
      const remaining = TARGET_MONTHLY - monthlyEarnings;
      const progress = ((monthlyEarnings / TARGET_MONTHLY) * 100).toFixed(1);
      console.log(`📊 Ambassador progress: ${progress}% (${remaining.toLocaleString()} FCFA to target)`);
    }
  }
  
  // Similar checks for senior and RD...
}

/**
 * Send commission notifications
 */
async function sendCommissionNotifications(customer, product, commissions, saleId) {
  // TODO: Implement email/SMS notifications
  console.log('📧 Sending commission notifications...');
  
  // Example notification structure:
  // - Ambassador: "🎉 New advocacy earnings! You facilitated access to [Product] - earned [Amount] FCFA"
  // - Senior: "💼 Team override earned: Your ambassador deployed [Product] - you earned [Amount] FCFA"
  // - RD: "🏆 Network override: [Product] deployed in your network - earned [Amount] FCFA"
}

/**
 * Send target hit celebration
 */
async function sendTargetHitNotification(userId, amount, level) {
  // TODO: Implement celebration notifications
  console.log(`🎊 Sending $3K target celebration to ${level} ${userId}`);
  
  // Email subject: "🎉 YOU HIT YOUR $3,000 TARGET THIS MONTH!"
  // Include: Confetti animation, income breakdown by category, next milestone info
}

/**
 * Get monthly income breakdown for dashboard
 */
async function getMonthlyIncomeBreakdown(ambassadorId, month) {
  const ambassadorDoc = await db.collection('ambassadors').doc(ambassadorId).get();
  const ambassador = ambassadorDoc.data();
  
  const monthKey = month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const earnings = ambassador.monthly_earnings?.[monthKey] || {};
  
  return {
    total: earnings.total || 0,
    by_category: {
      books: earnings.books || 0,
      schools: earnings.schools || 0,
      courses: earnings.courses || 0,
      premium: earnings.premium || 0,
      corporate: earnings.corporate || 0,
      community: earnings.community || 0
    },
    team_override: earnings.team_override || 0,
    target: 1800000,
    target_met: (earnings.total || 0) >= 1800000
  };
}

// Export functions
module.exports = {
  processProductDeployment,
  getProductDetails,
  calculateCommissions,
  creditCommissions,
  checkMonthlyTargets,
  getMonthlyIncomeBreakdown
};
