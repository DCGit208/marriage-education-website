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

async function createProducts() {
  const batch = db.batch();
  let productCount = 0;
  
  console.log('Creating MV House products collection...\n');
  
  // ===============================================
  // MV HOUSE PRODUCTS (20+ items, ALL ELITE TIER)
  // ===============================================
  // Revenue driver: Elite tier access required
  // Categories: corporate, casual_home, casual_day, casual_night, official
  // ===============================================
  
  const products = [
    // MULIEBRITY COLLECTION (Women's)
    {
      id: 'muliebrity-corporate-001',
      category: 'muliebrity',
      subcategory: 'corporate',
      name: 'Executive Power Dress - Navy',
      description: 'Tailored corporate dress for professional women. Classic navy with modern cut.',
      price: 45000, // FCFA
      currency: 'FCFA',
      sizes: ['S', 'M', 'L', 'XL'],
      colors: ['Navy', 'Black', 'Charcoal'],
      images: ['/products/muliebrity-corporate-001.jpg'],
      inStock: true,
      featured: true
    },
    {
      id: 'muliebrity-corporate-002',
      category: 'muliebrity',
      subcategory: 'corporate',
      name: 'Professional Blazer Set',
      description: 'Two-piece blazer and skirt set. Perfect for office and formal events.',
      price: 65000,
      currency: 'FCFA',
      sizes: ['S', 'M', 'L', 'XL'],
      colors: ['Black', 'Grey', 'Burgundy'],
      images: ['/products/muliebrity-corporate-002.jpg'],
      inStock: true,
      featured: true
    },
    {
      id: 'muliebrity-casual-home-001',
      category: 'muliebrity',
      subcategory: 'casual_home',
      name: 'Cozy Lounge Set',
      description: 'Comfortable home wear set. Soft cotton blend for relaxation.',
      price: 25000,
      currency: 'FCFA',
      sizes: ['S', 'M', 'L', 'XL'],
      colors: ['Cream', 'Lavender', 'Sage'],
      images: ['/products/muliebrity-casual-home-001.jpg'],
      inStock: true,
      featured: false
    },
    {
      id: 'muliebrity-casual-day-001',
      category: 'muliebrity',
      subcategory: 'casual_day',
      name: 'Weekend Brunch Dress',
      description: 'Elegant casual dress for daytime outings. Breathable and stylish.',
      price: 35000,
      currency: 'FCFA',
      sizes: ['S', 'M', 'L', 'XL'],
      colors: ['Coral', 'White', 'Sky Blue'],
      images: ['/products/muliebrity-casual-day-001.jpg'],
      inStock: true,
      featured: false
    },
    {
      id: 'muliebrity-casual-night-001',
      category: 'muliebrity',
      subcategory: 'casual_night',
      name: 'Evening Cocktail Dress',
      description: 'Sophisticated evening dress. Perfect for dinner dates and events.',
      price: 55000,
      currency: 'FCFA',
      sizes: ['S', 'M', 'L', 'XL'],
      colors: ['Black', 'Emerald', 'Wine Red'],
      images: ['/products/muliebrity-casual-night-001.jpg'],
      inStock: true,
      featured: true
    },
    {
      id: 'muliebrity-official-001',
      category: 'muliebrity',
      subcategory: 'official',
      name: 'Gala Evening Gown',
      description: 'Luxurious formal gown. Designed for prestigious occasions.',
      price: 95000,
      currency: 'FCFA',
      sizes: ['S', 'M', 'L', 'XL'],
      colors: ['Gold', 'Royal Blue', 'Black'],
      images: ['/products/muliebrity-official-001.jpg'],
      inStock: true,
      featured: true
    },
    {
      id: 'muliebrity-corporate-003',
      category: 'muliebrity',
      subcategory: 'corporate',
      name: 'Business Trousers - Classic',
      description: 'Tailored business trousers. Comfortable fit for long workdays.',
      price: 30000,
      currency: 'FCFA',
      sizes: ['S', 'M', 'L', 'XL'],
      colors: ['Black', 'Navy', 'Grey'],
      images: ['/products/muliebrity-corporate-003.jpg'],
      inStock: true,
      featured: false
    },
    {
      id: 'muliebrity-casual-day-002',
      category: 'muliebrity',
      subcategory: 'casual_day',
      name: 'Kaftan Dress - African Print',
      description: 'Contemporary African print kaftan. Celebrates cultural heritage.',
      price: 40000,
      currency: 'FCFA',
      sizes: ['S', 'M', 'L', 'XL'],
      colors: ['Multicolor Pattern A', 'Multicolor Pattern B'],
      images: ['/products/muliebrity-casual-day-002.jpg'],
      inStock: true,
      featured: true
    },
    {
      id: 'muliebrity-casual-night-002',
      category: 'muliebrity',
      subcategory: 'casual_night',
      name: 'Little Black Dress',
      description: 'Timeless LBD. Essential for every woman\'s wardrobe.',
      price: 48000,
      currency: 'FCFA',
      sizes: ['S', 'M', 'L', 'XL'],
      colors: ['Black'],
      images: ['/products/muliebrity-casual-night-002.jpg'],
      inStock: true,
      featured: false
    },
    {
      id: 'muliebrity-official-002',
      category: 'muliebrity',
      subcategory: 'official',
      name: 'Wedding Guest Ensemble',
      description: 'Elegant outfit for wedding ceremonies. Refined and modest.',
      price: 75000,
      currency: 'FCFA',
      sizes: ['S', 'M', 'L', 'XL'],
      colors: ['Champagne', 'Rose Gold', 'Silver'],
      images: ['/products/muliebrity-official-002.jpg'],
      inStock: true,
      featured: false
    },
    
    // VIRILITY COLLECTION (Men's)
    {
      id: 'virility-corporate-001',
      category: 'virility',
      subcategory: 'corporate',
      name: 'Executive Suit - Charcoal',
      description: 'Premium two-piece suit for business leaders. Tailored fit.',
      price: 85000,
      currency: 'FCFA',
      sizes: ['M', 'L', 'XL', 'XXL'],
      colors: ['Charcoal', 'Navy', 'Black'],
      images: ['/products/virility-corporate-001.jpg'],
      inStock: true,
      featured: true
    },
    {
      id: 'virility-corporate-002',
      category: 'virility',
      subcategory: 'corporate',
      name: 'Business Shirt Collection',
      description: 'Set of 3 premium dress shirts. Classic colors for versatility.',
      price: 45000,
      currency: 'FCFA',
      sizes: ['M', 'L', 'XL', 'XXL'],
      colors: ['White', 'Light Blue', 'Grey'],
      images: ['/products/virility-corporate-002.jpg'],
      inStock: true,
      featured: false
    },
    {
      id: 'virility-casual-home-001',
      category: 'virility',
      subcategory: 'casual_home',
      name: 'Weekend Loungewear Set',
      description: 'Comfortable home wear. Relaxed fit for leisure time.',
      price: 28000,
      currency: 'FCFA',
      sizes: ['M', 'L', 'XL', 'XXL'],
      colors: ['Navy', 'Grey', 'Olive'],
      images: ['/products/virility-casual-home-001.jpg'],
      inStock: true,
      featured: false
    },
    {
      id: 'virility-casual-day-001',
      category: 'virility',
      subcategory: 'casual_day',
      name: 'Smart Casual Chinos',
      description: 'Versatile chinos for day outings. Pairs well with any top.',
      price: 32000,
      currency: 'FCFA',
      sizes: ['M', 'L', 'XL', 'XXL'],
      colors: ['Khaki', 'Navy', 'Black'],
      images: ['/products/virility-casual-day-001.jpg'],
      inStock: true,
      featured: false
    },
    {
      id: 'virility-casual-night-001',
      category: 'virility',
      subcategory: 'casual_night',
      name: 'Evening Polo Set',
      description: 'Premium polo shirts for evening occasions. Sophisticated casual.',
      price: 38000,
      currency: 'FCFA',
      sizes: ['M', 'L', 'XL', 'XXL'],
      colors: ['Black', 'Burgundy', 'Forest Green'],
      images: ['/products/virility-casual-night-001.jpg'],
      inStock: true,
      featured: false
    },
    {
      id: 'virility-official-001',
      category: 'virility',
      subcategory: 'official',
      name: 'Tuxedo - Classic Black',
      description: 'Formal tuxedo for prestigious events. Impeccable tailoring.',
      price: 120000,
      currency: 'FCFA',
      sizes: ['M', 'L', 'XL', 'XXL'],
      colors: ['Black'],
      images: ['/products/virility-official-001.jpg'],
      inStock: true,
      featured: true
    },
    {
      id: 'virility-corporate-003',
      category: 'virility',
      subcategory: 'corporate',
      name: 'Power Blazer',
      description: 'Statement blazer for business meetings. Commands presence.',
      price: 58000,
      currency: 'FCFA',
      sizes: ['M', 'L', 'XL', 'XXL'],
      colors: ['Navy', 'Grey', 'Black'],
      images: ['/products/virility-corporate-003.jpg'],
      inStock: true,
      featured: false
    },
    {
      id: 'virility-casual-day-002',
      category: 'virility',
      subcategory: 'casual_day',
      name: 'African Print Shirt',
      description: 'Contemporary African print casual shirt. Cultural pride.',
      price: 35000,
      currency: 'FCFA',
      sizes: ['M', 'L', 'XL', 'XXL'],
      colors: ['Multicolor Pattern A', 'Multicolor Pattern B'],
      images: ['/products/virility-casual-day-002.jpg'],
      inStock: true,
      featured: true
    },
    {
      id: 'virility-casual-night-002',
      category: 'virility',
      subcategory: 'casual_night',
      name: 'Dinner Jacket',
      description: 'Stylish dinner jacket. Perfect for upscale evening venues.',
      price: 68000,
      currency: 'FCFA',
      sizes: ['M', 'L', 'XL', 'XXL'],
      colors: ['Black', 'Midnight Blue'],
      images: ['/products/virility-casual-night-002.jpg'],
      inStock: true,
      featured: false
    },
    {
      id: 'virility-official-002',
      category: 'virility',
      subcategory: 'official',
      name: 'Three-Piece Suit - Premium',
      description: 'Luxury three-piece suit. For weddings and formal ceremonies.',
      price: 135000,
      currency: 'FCFA',
      sizes: ['M', 'L', 'XL', 'XXL'],
      colors: ['Charcoal', 'Navy', 'Black'],
      images: ['/products/virility-official-002.jpg'],
      inStock: true,
      featured: true
    }
  ];
  
  console.log(`🏪 MV HOUSE PRODUCTS (${products.length} items, all Elite tier)\n`);
  
  products.forEach((product, index) => {
    const ref = db.collection('products').doc(product.id);
    
    batch.set(ref, {
      ...product,
      accessTier: 'elite', // ALL products require Elite tier (revenue driver)
      schoolId: 'school-1-teleios', // Associated with School 1
      productNo: index + 1,
      isActive: true,
      salesCount: 0,
      rating: 0,
      reviewCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    const categoryIcon = product.category === 'muliebrity' ? '👗' : '🤵';
    console.log(`  ${categoryIcon} ${product.name} - ${product.price.toLocaleString()} FCFA [${product.subcategory}]`);
    productCount++;
  });
  
  await batch.commit();
  
  console.log(`\n✅ SUCCESS: Created ${productCount} MV House products`);
  console.log(`\n📊 BREAKDOWN:`);
  console.log(`   • Muliebrity (Women's): ${products.filter(p => p.category === 'muliebrity').length} products`);
  console.log(`   • Virility (Men's): ${products.filter(p => p.category === 'virility').length} products`);
  console.log(`   • All products: Elite tier access required`);
  console.log(`   • Categories: corporate, casual_home, casual_day, casual_night, official\n`);
}

createProducts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ ERROR:', err);
    process.exit(1);
  });
