const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');

if (!fs.existsSync(SERVICE_ACCOUNT)) {
  console.error('❌ Service account key not found');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(SERVICE_ACCOUNT)
});

const db = admin.firestore();

async function showActualData() {
  console.log('\n📊 ACTUAL DATA THAT WILL APPEAR ON WEBSITE\n');
  console.log('═'.repeat(60));
  
  // Schools
  console.log('\n📚 SCHOOLS (What Learn tab will show):\n');
  const schoolsSnapshot = await db.collection('schools').orderBy('order', 'asc').get();
  
  schoolsSnapshot.forEach(doc => {
    const school = doc.data();
    console.log(`   ${school.icon || '🎓'} ${school.name}`);
    console.log(`      ID: ${school.id}`);
    console.log(`      Description: ${school.description}`);
    console.log(`      Courses: ${school.totalCourses}`);
    console.log(`      Value: $${school.portfolioValue?.toLocaleString() || '0'}`);
    console.log(`      Unlock Tier: ${school.unlockTier}\n`);
  });
  
  // Products
  console.log('\n👗 MV HOUSE PRODUCTS (What MV House tab will show):\n');
  const productsSnapshot = await db.collection('products').get();
  
  const mvHouseProducts = productsSnapshot.docs.filter(d => {
    const data = d.data();
    const id = data.id || d.id;
    return (id.startsWith('muliebrity-') || id.startsWith('virility-')) && 
           data.subcategory && 
           ['corporate', 'casual_home', 'casual_day', 'casual_night', 'official'].includes(data.subcategory);
  }).map(d => d.data());
  
  const muliebrity = mvHouseProducts.filter(p => p.id.startsWith('muliebrity-'));
  const virility = mvHouseProducts.filter(p => p.id.startsWith('virility-'));
  
  console.log(`   MULIEBRITY (Women's): ${muliebrity.length} products`);
  muliebrity.forEach(p => {
    console.log(`      👗 ${p.name} - ${p.price?.toLocaleString()} ${p.currency} [${p.subcategory}]`);
  });
  
  console.log(`\n   VIRILITY (Men's): ${virility.length} products`);
  virility.forEach(p => {
    console.log(`      🤵 ${p.name} - ${p.price?.toLocaleString()} ${p.currency} [${p.subcategory}]`);
  });
  
  console.log('\n═'.repeat(60));
  console.log('\n✅ This is EXACTLY what users will see on the website\n');
  
  process.exit(0);
}

showActualData();
