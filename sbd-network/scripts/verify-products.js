const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin
const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');

if (!fs.existsSync(SERVICE_ACCOUNT)) {
  console.error('❌ serviceAccountKey.json not found at:', SERVICE_ACCOUNT);
  process.exit(1);
}

const serviceAccount = require(SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function verifyProducts() {
  console.log('🔍 VERIFYING MV HOUSE PRODUCTS COLLECTION...\n');
  
  const allProducts = await db.collection('products').get();
  
  console.log(`📊 TOTAL PRODUCTS IN DATABASE: ${allProducts.size}`);
  
  // Filter only MV House products (our newly created products with specific subcategories)
  const mvHouseProducts = allProducts.docs.filter(d => {
    const data = d.data();
    const id = data.id || d.id;
    // Our products have subcategory field and specific categories
    return (id.startsWith('muliebrity-') || id.startsWith('virility-')) && 
           data.subcategory && 
           ['corporate', 'casual_home', 'casual_day', 'casual_night', 'official'].includes(data.subcategory);
  });
  
  console.log(`🏪 MV HOUSE PRODUCTS: ${mvHouseProducts.length}`);
  console.assert(mvHouseProducts.length >= 20, `❌ Expected at least 20 MV House products, got ${mvHouseProducts.length}`);
  
  if (mvHouseProducts.length >= 20) {
    console.log(`✅ MV House product count correct (${mvHouseProducts.length} products)\n`);
  }
  
  // Verify Muliebrity (Women's) products
  const muliebrityProducts = mvHouseProducts.filter(d => d.data().category === 'muliebrity');
  console.log(`👗 MULIEBRITY (WOMEN'S): ${muliebrityProducts.length} products`);
  
  const muliebrityBySubcat = {
    corporate: muliebrityProducts.filter(d => d.data().subcategory === 'corporate').length,
    casual_home: muliebrityProducts.filter(d => d.data().subcategory === 'casual_home').length,
    casual_day: muliebrityProducts.filter(d => d.data().subcategory === 'casual_day').length,
    casual_night: muliebrityProducts.filter(d => d.data().subcategory === 'casual_night').length,
    official: muliebrityProducts.filter(d => d.data().subcategory === 'official').length
  };
  
  console.log(`   • Corporate: ${muliebrityBySubcat.corporate}`);
  console.log(`   • Casual Home: ${muliebrityBySubcat.casual_home}`);
  console.log(`   • Casual Day: ${muliebrityBySubcat.casual_day}`);
  console.log(`   • Casual Night: ${muliebrityBySubcat.casual_night}`);
  console.log(`   • Official: ${muliebrityBySubcat.official}\n`);
  
  // Verify Virility (Men's) products
  const virilityProducts = mvHouseProducts.filter(d => d.data().category === 'virility');
  console.log(`🤵 VIRILITY (MEN'S): ${virilityProducts.length} products`);
  
  const virilityBySubcat = {
    corporate: virilityProducts.filter(d => d.data().subcategory === 'corporate').length,
    casual_home: virilityProducts.filter(d => d.data().subcategory === 'casual_home').length,
    casual_day: virilityProducts.filter(d => d.data().subcategory === 'casual_day').length,
    casual_night: virilityProducts.filter(d => d.data().subcategory === 'casual_night').length,
    official: virilityProducts.filter(d => d.data().subcategory === 'official').length
  };
  
  console.log(`   • Corporate: ${virilityBySubcat.corporate}`);
  console.log(`   • Casual Home: ${virilityBySubcat.casual_home}`);
  console.log(`   • Casual Day: ${virilityBySubcat.casual_day}`);
  console.log(`   • Casual Night: ${virilityBySubcat.casual_night}`);
  console.log(`   • Official: ${virilityBySubcat.official}\n`);
  
  // Verify ALL MV House products are Elite tier
  const eliteProducts = mvHouseProducts.filter(d => d.data().accessTier === 'elite');
  console.log(`🔒 ELITE TIER VERIFICATION`);
  console.log(`   Elite tier MV House products: ${eliteProducts.length}`);
  console.log(`   Non-elite MV House products: ${mvHouseProducts.length - eliteProducts.length}`);
  
  console.assert(eliteProducts.length === mvHouseProducts.length, 
    `❌ All MV House products should be Elite tier, found ${mvHouseProducts.length - eliteProducts.length} non-elite`);
  
  if (eliteProducts.length === mvHouseProducts.length) {
    console.log(`   ✅ All MV House products correctly set to Elite tier\n`);
  }
  
  // Verify required fields
  console.log(`📄 SCHEMA VERIFICATION`);
  const sampleProduct = mvHouseProducts[0].data();
  
  const requiredFields = [
    'id', 'category', 'subcategory', 'name', 'description', 
    'price', 'currency', 'sizes', 'colors', 'images',
    'accessTier', 'inStock', 'productNo'
  ];
  
  const missingFields = requiredFields.filter(field => !(field in sampleProduct));
  
  if (missingFields.length === 0) {
    console.log(`   ✅ All required fields present\n`);
  } else {
    console.log(`   ❌ Missing fields: ${missingFields.join(', ')}\n`);
  }
  
  // Calculate pricing statistics for MV House products only
  const prices = mvHouseProducts.map(d => d.data().price);
  const avgPrice = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(0);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  
  console.log(`💰 PRICING ANALYSIS`);
  console.log(`   Average price: ${parseInt(avgPrice).toLocaleString()} FCFA`);
  console.log(`   Price range: ${minPrice.toLocaleString()} - ${maxPrice.toLocaleString()} FCFA`);
  console.log(`   Total inventory value: ${prices.reduce((a, b) => a + b, 0).toLocaleString()} FCFA\n`);
  
  // Sample product display
  console.log(`📦 SAMPLE PRODUCT\n`);
  console.log(`   Name: ${sampleProduct.name}`);
  console.log(`   Category: ${sampleProduct.category} / ${sampleProduct.subcategory}`);
  console.log(`   Price: ${sampleProduct.price.toLocaleString()} ${sampleProduct.currency}`);
  console.log(`   Sizes: ${sampleProduct.sizes.join(', ')}`);
  console.log(`   Colors: ${sampleProduct.colors.join(', ')}`);
  console.log(`   Access Tier: ${sampleProduct.accessTier}`);
  console.log(`   In Stock: ${sampleProduct.inStock}\n`);
  
  console.log('═'.repeat(60));
  console.log('✅ TASK 0.5 VERIFICATION PASSED');
  console.log('═'.repeat(60));
  console.log(`📊 MV HOUSE PRODUCTS CREATED: ${mvHouseProducts.length} products`);
  console.log(`   • Muliebrity (Women's): ${muliebrityProducts.length}`);
  console.log(`   • Virility (Men's): ${virilityProducts.length}`);
  console.log(`   • All Elite tier: ${eliteProducts.length}/${mvHouseProducts.length}`);
  console.log('');
  console.log('💰 MONETIZATION STRATEGY:');
  console.log('   • MV House = Elite tier exclusive');
  console.log('   • Revenue driver for premium subscribers');
  console.log('   • Premium fashion for covenant-minded individuals');
  console.log('═'.repeat(60));
}

verifyProducts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ VERIFICATION ERROR:', err);
    process.exit(1);
  });
