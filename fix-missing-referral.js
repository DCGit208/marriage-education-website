/**
 * Fix Missing Referral Code
 * Adds referral code FAIT154 to the recent SBD purchase that was made
 * before the referral tracking fix was deployed
 */

const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function fixMissingReferral() {
  try {
    console.log('🔍 Searching for recent SBD purchases without referral codes...\n');
    
    // Find recent sales for SBD products (last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const salesRef = db.collection('sales');
    const recentSales = await salesRef
      .where('timestamp', '>=', yesterday)
      .orderBy('timestamp', 'desc')
      .get();
    
    console.log(`Found ${recentSales.size} recent sales in last 24 hours\n`);
    
    if (recentSales.empty) {
      console.log('❌ No recent sales found');
      return;
    }
    
    // Find sales without referral codes for SBD products
    const salesWithoutReferral = [];
    
    recentSales.forEach(doc => {
      const data = doc.data();
      const productId = data.product_id || '';
      const hasReferral = data.ambassador_ref || data.referral_code;
      
      // Check if it's an SBD product and missing referral
      if (productId.includes('sbd') && !hasReferral) {
        salesWithoutReferral.push({
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toDate()
        });
      }
    });
    
    console.log(`Found ${salesWithoutReferral.length} SBD sales without referral codes:\n`);
    
    salesWithoutReferral.forEach(sale => {
      console.log(`📦 ${sale.product_id} - ${sale.product_name}`);
      console.log(`   💰 ${sale.amount} ${sale.currency}`);
      console.log(`   📧 ${sale.email || 'N/A'}`);
      console.log(`   🕐 ${sale.timestamp}`);
      console.log(`   🆔 ${sale.id}\n`);
    });
    
    if (salesWithoutReferral.length === 0) {
      console.log('✅ All recent sales already have referral codes!');
      return;
    }
    
    // Ask which sale to update
    console.log('\n📝 Adding referral code FAIT154 to the most recent sale...\n');
    
    const saleToUpdate = salesWithoutReferral[0]; // Most recent
    
    // Update the sale with referral code
    await salesRef.doc(saleToUpdate.id).update({
      ambassador_ref: 'FAIT154',
      referral_code: 'FAIT154',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      referral_fixed: true,
      referral_fixed_date: new Date().toISOString()
    });
    
    console.log('✅ Successfully added referral code FAIT154 to sale:', saleToUpdate.id);
    console.log('📊 Product:', saleToUpdate.product_name);
    console.log('💰 Amount:', saleToUpdate.amount, saleToUpdate.currency);
    console.log('📧 Email:', saleToUpdate.email || 'N/A');
    console.log('\n🎯 Ambassador FAIT154 will now receive commission for this sale!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

// Run the fix
fixMissingReferral()
  .then(() => {
    console.log('\n✅ Fix completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fix failed:', error);
    process.exit(1);
  });
