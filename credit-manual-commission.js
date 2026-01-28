// Manual Commission Credit Script
// For retroactive commission processing

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function creditManualCommission() {
  try {
    console.log('🔄 Processing manual commission credit...');
    
    const purchaseData = {
      customerEmail: 'bthedugrp@gmail.com',
      customerName: 'BTheduGrp Customer',
      productId: 'sbd-dummies-book',
      referralCode: 'AMB-EVEL-6730'
    };
    
    console.log('📋 Purchase details:', purchaseData);
    
    // Get product details
    const productDoc = await db.collection('products').doc(purchaseData.productId).get();
    
    if (!productDoc.exists) {
      throw new Error(`Product ${purchaseData.productId} not found in Firestore`);
    }
    
    const product = productDoc.data();
    console.log('✅ Product found:', product.name, '- Price:', product.price, 'FCFA');
    
    // Calculate commission (10% base)
    const baseCommission = product.price * (product.commission_rate || 0.10);
    console.log('💰 Base commission:', baseCommission, 'FCFA');
    
    // Parse referral code to get upline
    const codePrefix = purchaseData.referralCode.substring(0, 3);
    let ambassadorCode = null;
    let seniorCode = null;
    let rdCode = null;
    
    if (codePrefix === 'AMB') {
      ambassadorCode = purchaseData.referralCode;
      
      // Get ambassador to find senior and RD
      const ambassadorDoc = await db.collection('ambassadors').doc(ambassadorCode).get();
      if (ambassadorDoc.exists) {
        const ambData = ambassadorDoc.data();
        seniorCode = ambData.senior_ambassador_code || null;
        rdCode = ambData.regional_director_code || null;
      }
    } else if (codePrefix === 'SNR') {
      seniorCode = purchaseData.referralCode;
      
      // Get senior to find RD
      const seniorDoc = await db.collection('senior_ambassadors').doc(seniorCode).get();
      if (seniorDoc.exists) {
        rdCode = seniorDoc.data().regional_director_code || null;
      }
    } else if (codePrefix === 'RD-') {
      rdCode = purchaseData.referralCode;
    }
    
    console.log('🔗 Upline chain:', { ambassadorCode, seniorCode, rdCode });
    
    // Get or create customer
    const customerQuery = await db.collection('customers')
      .where('email', '==', purchaseData.customerEmail.toLowerCase())
      .limit(1)
      .get();
    
    let customerRef;
    
    if (!customerQuery.empty) {
      customerRef = customerQuery.docs[0].ref;
      console.log('✅ Existing customer found');
    } else {
      // Create new customer
      customerRef = db.collection('customers').doc();
      await customerRef.set({
        email: purchaseData.customerEmail.toLowerCase(),
        name: purchaseData.customerName,
        source_ambassador: ambassadorCode,
        source_senior: seniorCode,
        source_rd: rdCode,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('✅ New customer created with attribution');
    }
    
    // Create sale record
    const saleRef = db.collection('sales').doc();
    await saleRef.set({
      customer_id: customerRef.id,
      customer_email: purchaseData.customerEmail.toLowerCase(),
      customer_name: purchaseData.customerName,
      product_id: purchaseData.productId,
      product_name: product.name,
      product_category: product.category,
      product_price: product.price,
      commission_amount: baseCommission,
      source_ambassador: ambassadorCode,
      source_senior: seniorCode,
      source_rd: rdCode,
      sale_date: admin.firestore.FieldValue.serverTimestamp(),
      payment_method: 'stripe',
      status: 'completed',
      manually_credited: true
    });
    console.log('✅ Sale record created');
    
    // Credit commissions
    const batch = db.batch();
    const monthKey = new Date().toISOString().substring(0, 7); // YYYY-MM
    
    if (ambassadorCode) {
      const ambassadorRef = db.collection('ambassadors').doc(ambassadorCode);
      batch.update(ambassadorRef, {
        commissionEarned: admin.firestore.FieldValue.increment(baseCommission),
        access_units_deployed: admin.firestore.FieldValue.increment(1),
        [`deployment_by_category.${product.category}`]: admin.firestore.FieldValue.increment(1),
        [`revenue_by_category.${product.category}`]: admin.firestore.FieldValue.increment(baseCommission),
        [`monthly_earnings.${monthKey}.total`]: admin.firestore.FieldValue.increment(baseCommission),
        [`monthly_earnings.${monthKey}.${product.category}`]: admin.firestore.FieldValue.increment(baseCommission),
        last_sale_date: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('💰 Ambassador commission:', baseCommission, 'FCFA');
    }
    
    if (seniorCode) {
      const seniorOverride = baseCommission * 0.5; // 5% override (half of 10%)
      const seniorRef = db.collection('senior_ambassadors').doc(seniorCode);
      batch.update(seniorRef, {
        total_override_commission: admin.firestore.FieldValue.increment(seniorOverride),
        team_sales: admin.firestore.FieldValue.increment(1)
      });
      console.log('💰 Senior override:', seniorOverride, 'FCFA');
    }
    
    if (rdCode) {
      const rdOverride = baseCommission * 0.5; // 5% override
      const rdRef = db.collection('regional_directors').doc(rdCode);
      batch.update(rdRef, {
        total_override_commission: admin.firestore.FieldValue.increment(rdOverride),
        region_sales: admin.firestore.FieldValue.increment(1)
      });
      console.log('💰 RD override:', rdOverride, 'FCFA');
    }
    
    await batch.commit();
    console.log('✅ Commission batch committed');
    
    console.log('\n🎉 Manual commission credit completed successfully!');
    console.log('📊 Summary:');
    console.log('  - Product:', product.name);
    console.log('  - Price:', product.price, 'FCFA');
    console.log('  - Ambassador:', ambassadorCode, '-', baseCommission, 'FCFA');
    if (seniorCode) console.log('  - Senior:', seniorCode, '-', baseCommission * 0.5, 'FCFA');
    if (rdCode) console.log('  - RD:', rdCode, '-', baseCommission * 0.5, 'FCFA');
    
  } catch (error) {
    console.error('❌ Error processing manual commission:', error);
    throw error;
  } finally {
    process.exit();
  }
}

// Run the credit
creditManualCommission();
