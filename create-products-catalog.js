/**
 * CREATE PRODUCTS CATALOG
 * 
 * This script populates the Firestore 'products' collection with the complete
 * marriageducation.com portfolio for multi-product tracking.
 * 
 * Run: node create-products-catalog.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Complete Product Catalog
const products = [
  // ==================== CATEGORY 1: BOOKS ====================
  {
    id: "sbd-dummies-book",
    name: "Sex By Design for Dummies",
    category: "books",
    price: 15000,
    price_usd: 25,
    commission_rate: 0.10,
    target_audience: "engaged couples, newlyweds, anyone seeking marriage literacy",
    value_proposition: "The foundational book for understanding biblical marriage design",
    sales_pitch: "145-page handbook covering eudaemonia, sexual literacy, covenant theology, and practical marriage building",
    marketing_assets: ["sbd-dummies-poster.jpg", "sbd-dummies-video.mp4"],
    upsell_from: [],
    upsell_to: ["sbd-dummies-course", "foundation-school"],
    format: "PDF ebook + physical option",
    pages: 145,
    status: "active"
  },
  {
    id: "marriage-porn-beyond-book",
    name: "Marriage=Porn & Beyond",
    category: "books",
    price: 50000,
    price_usd: 83,
    commission_rate: 0.10,
    target_audience: "couples struggling with pornography, pastors, counselors",
    value_proposition: "Addresses why porn works and how marriage must do better",
    sales_pitch: "Controversial yet biblical approach to defeating pornography through superior marriage",
    marketing_assets: ["marriage-porn-poster.jpg", "marriage-porn-video.mp4"],
    upsell_from: ["sbd-dummies-book"],
    upsell_to: ["marriage-porn-course", "coaching-package-basic"],
    format: "PDF ebook + physical option",
    status: "active"
  },
  {
    id: "art-of-sexuality",
    name: "The Art of Sexuality",
    category: "books",
    price: 25000,
    price_usd: 42,
    commission_rate: 0.10,
    target_audience: "mature couples seeking deeper intimacy understanding",
    value_proposition: "Explores sexuality as covenant art form",
    sales_pitch: "Biblical framework for understanding sexuality beyond physical acts",
    marketing_assets: [],
    upsell_from: ["sbd-dummies-book"],
    upsell_to: ["art-of-nakedness"],
    format: "PDF ebook",
    status: "active"
  },
  {
    id: "art-of-nakedness",
    name: "The Art of Nakedness",
    category: "books",
    price: 25000,
    price_usd: 42,
    commission_rate: 0.10,
    target_audience: "couples exploring covenant intimacy",
    value_proposition: "Genesis 2:25 applied—nakedness as divine asset",
    sales_pitch: "Learn to steward nakedness within covenant marriage",
    marketing_assets: [],
    upsell_from: ["art-of-sexuality"],
    upsell_to: ["pics-pearls"],
    format: "PDF ebook",
    status: "active"
  },
  {
    id: "muliebrity-baron",
    name: "Muliebrity Baron - Secret Powers of Wives",
    category: "books",
    price: 30000,
    price_usd: 50,
    commission_rate: 0.10,
    target_audience: "wives, women's ministry leaders",
    value_proposition: "Reveals the unique powers wives possess in marriage",
    sales_pitch: "Biblical exploration of feminine strength in covenant",
    marketing_assets: [],
    upsell_from: ["sbd-dummies-book"],
    upsell_to: ["foundation-school"],
    format: "PDF ebook",
    status: "active"
  },
  {
    id: "virility-baron",
    name: "Virility Baron - Secret Powers of Husbands",
    category: "books",
    price: 30000,
    price_usd: 50,
    commission_rate: 0.10,
    target_audience: "husbands, men's ministry leaders",
    value_proposition: "Reveals the unique powers husbands possess in marriage",
    sales_pitch: "Biblical exploration of masculine strength in covenant",
    marketing_assets: [],
    upsell_from: ["sbd-dummies-book"],
    upsell_to: ["foundation-school"],
    format: "PDF ebook",
    status: "active"
  },
  {
    id: "pics-pearls",
    name: "Pics & Pearls - Biblical Nakedness vs Pornography",
    category: "books",
    price: 35000,
    price_usd: 58,
    commission_rate: 0.10,
    target_audience: "couples addressing pornography, creating covenant imagery",
    value_proposition: "How to build exclusive erotic imagination within marriage",
    sales_pitch: "Practical guide to covenant imagery and defeating counterfeits",
    marketing_assets: [],
    upsell_from: ["marriage-porn-beyond-book"],
    upsell_to: ["marriage-porn-course"],
    format: "PDF ebook",
    status: "active"
  },
  {
    id: "sbd-compendium",
    name: "SBD Compendium - Complete Navigator",
    category: "books",
    price: 34990,
    price_usd: 58,
    commission_rate: 0.10,
    target_audience: "new ambassadors, first-time buyers",
    value_proposition: "Complete overview and navigation guide to entire SBD series",
    sales_pitch: "Perfect starting point—see the big picture before diving deep",
    marketing_assets: ["sbd-compendium-poster.jpg"],
    upsell_from: [],
    upsell_to: ["sbd-dummies-book", "foundation-school"],
    format: "PDF ebook",
    status: "active"
  },

  // ==================== CATEGORY 2: SCHOOLS ====================
  {
    id: "foundation-school",
    name: "Foundation School - Marriage Literacy Certification",
    category: "schools",
    price: 1200000,
    price_usd: 2000,
    commission_rate: 0.10,
    target_audience: "serious ambassadors, aspiring counselors, engaged couples, church leaders",
    value_proposition: "6-week intensive program with professional certification pathway",
    sales_pitch: "Become a Certified Relationship Literacy Advocate (CRLA) and access career pathways",
    marketing_assets: ["foundation-school-brochure.pdf", "foundation-school-video.mp4"],
    upsell_from: ["sbd-dummies-book", "sbd-compendium"],
    upsell_to: ["advanced-certification", "teleios-blueprint"],
    format: "online + live sessions",
    duration: "6 weeks",
    certification: true,
    status: "active"
  },
  {
    id: "teleios-blueprint",
    name: "Teleios Blueprint School",
    category: "schools",
    price: 1500000,
    price_usd: 2500,
    commission_rate: 0.10,
    target_audience: "CRLA graduates, professional counselors",
    value_proposition: "Advanced training in teleios (maturity/completeness) theology",
    sales_pitch: "Master the philosophical infrastructure behind marriage design",
    marketing_assets: [],
    upsell_from: ["foundation-school"],
    upsell_to: ["counselor-training-academy"],
    format: "online intensive",
    duration: "8 weeks",
    certification: true,
    status: "active"
  },
  {
    id: "advanced-certification",
    name: "Advanced Certification Program",
    category: "schools",
    price: 2000000,
    price_usd: 3333,
    commission_rate: 0.10,
    target_audience: "CRLA-certified ambassadors seeking counseling credentials",
    value_proposition: "Professional counselor certification with practicum",
    sales_pitch: "Transition from ambassador to certified marriage counselor",
    marketing_assets: [],
    upsell_from: ["foundation-school", "teleios-blueprint"],
    upsell_to: ["counselor-training-academy"],
    format: "hybrid (online + in-person practicum)",
    duration: "12 weeks",
    certification: true,
    status: "active"
  },
  {
    id: "counselor-training-academy",
    name: "Counselor Training Academy",
    category: "schools",
    price: 2500000,
    price_usd: 4167,
    commission_rate: 0.10,
    target_audience: "professional counselors, pastors, therapists",
    value_proposition: "Comprehensive marriage counseling training with SBD methodology",
    sales_pitch: "Full professional certification for practicing counselors",
    marketing_assets: [],
    upsell_from: ["advanced-certification"],
    upsell_to: [],
    format: "in-person + online hybrid",
    duration: "16 weeks",
    certification: true,
    status: "active"
  },

  // ==================== CATEGORY 3: COURSES ====================
  {
    id: "sbd-dummies-course",
    name: "Sex By Design for Dummies - 13 Week Course",
    category: "courses",
    price: 300000,
    price_usd: 500,
    commission_rate: 0.10,
    target_audience: "couples who purchased the book and want deeper engagement",
    value_proposition: "13-week guided journey through the book with practical application",
    sales_pitch: "Transform reading into action—weekly modules, exams, and implementation",
    marketing_assets: ["sbd-course-overview.pdf"],
    upsell_from: ["sbd-dummies-book"],
    upsell_to: ["foundation-school"],
    format: "online self-paced",
    duration: "13 weeks",
    certification: false,
    status: "active"
  },
  {
    id: "marriage-porn-course",
    name: "Marriage=Porn & Beyond - 5 Day Course",
    category: "courses",
    price: 250000,
    price_usd: 417,
    commission_rate: 0.10,
    target_audience: "couples addressing pornography, creating covenant alternative",
    value_proposition: "5-day intensive implementation course",
    sales_pitch: "Go beyond reading—build a marriage porn can't compete with",
    marketing_assets: ["marriage-porn-course-overview.pdf"],
    upsell_from: ["marriage-porn-beyond-book"],
    upsell_to: ["coaching-package-basic"],
    format: "online intensive",
    duration: "5 days",
    certification: false,
    status: "active"
  },
  {
    id: "nakedness-literacy-course",
    name: "Nakedness Literacy Course",
    category: "courses",
    price: 200000,
    price_usd: 333,
    commission_rate: 0.10,
    target_audience: "couples ready to explore Genesis 2:25 application",
    value_proposition: "Learn to steward nakedness as covenant asset",
    sales_pitch: "Practical course on unashamed intimacy within marriage",
    marketing_assets: [],
    upsell_from: ["art-of-nakedness"],
    upsell_to: ["pics-pearls-workshop"],
    format: "online self-paced",
    duration: "4 weeks",
    certification: false,
    status: "active"
  },
  {
    id: "covenant-theology-course",
    name: "Covenant Theology Course",
    category: "courses",
    price: 180000,
    price_usd: 300,
    commission_rate: 0.10,
    target_audience: "church leaders, theology students",
    value_proposition: "Deep dive into covenant vs contract marriage",
    sales_pitch: "Understand the theological foundation of biblical marriage",
    marketing_assets: [],
    upsell_from: ["sbd-dummies-book"],
    upsell_to: ["foundation-school"],
    format: "online lecture series",
    duration: "6 weeks",
    certification: false,
    status: "active"
  },
  {
    id: "pics-pearls-workshop",
    name: "Pics & Pearls Workshop",
    category: "courses",
    price: 220000,
    price_usd: 367,
    commission_rate: 0.10,
    target_audience: "couples creating covenant imagery",
    value_proposition: "Hands-on workshop for building exclusive erotic imagination",
    sales_pitch: "Practical exercises for creating your covenant imagery collection",
    marketing_assets: [],
    upsell_from: ["pics-pearls", "nakedness-literacy-course"],
    upsell_to: ["coaching-package-basic"],
    format: "live workshop + workbook",
    duration: "2 days",
    certification: false,
    status: "active"
  },

  // ==================== CATEGORY 4: PREMIUM SERVICES ====================
  {
    id: "coaching-package-basic",
    name: "Personal Coaching Package (Basic)",
    category: "premium",
    price: 500000,
    price_usd: 833,
    commission_rate: 0.10,
    target_audience: "couples needing personalized guidance",
    value_proposition: "4 one-on-one coaching sessions with certified counselor",
    sales_pitch: "Get personalized support for your unique marriage journey",
    marketing_assets: [],
    upsell_from: ["marriage-porn-course", "pics-pearls-workshop"],
    upsell_to: ["coaching-package-premium"],
    format: "1-on-1 video sessions",
    duration: "4 sessions (1 month)",
    certification: false,
    status: "active"
  },
  {
    id: "coaching-package-premium",
    name: "Personal Coaching Package (Premium)",
    category: "premium",
    price: 1000000,
    price_usd: 1667,
    commission_rate: 0.10,
    target_audience: "couples in crisis or seeking intensive support",
    value_proposition: "12 sessions over 3 months with follow-up support",
    sales_pitch: "Comprehensive coaching for marriage transformation",
    marketing_assets: [],
    upsell_from: ["coaching-package-basic"],
    upsell_to: [],
    format: "1-on-1 video sessions + messaging support",
    duration: "12 sessions (3 months)",
    certification: false,
    status: "active"
  },
  {
    id: "couple-intensive",
    name: "Couple Intensive Retreat",
    category: "premium",
    price: 750000,
    price_usd: 1250,
    commission_rate: 0.10,
    target_audience: "couples seeking breakthrough weekend",
    value_proposition: "2-day intensive retreat with counselor",
    sales_pitch: "Deep work in focused environment for rapid transformation",
    marketing_assets: [],
    upsell_from: ["coaching-package-basic"],
    upsell_to: ["coaching-package-premium"],
    format: "in-person 2-day retreat",
    duration: "2 days",
    certification: false,
    status: "active"
  },
  {
    id: "group-facilitation",
    name: "Group Facilitation Training",
    category: "premium",
    price: 400000,
    price_usd: 667,
    commission_rate: 0.10,
    target_audience: "ambassadors, church leaders running marriage groups",
    value_proposition: "Learn to facilitate marriage education groups",
    sales_pitch: "Train to lead marriage literacy groups in your community",
    marketing_assets: [],
    upsell_from: ["foundation-school"],
    upsell_to: [],
    format: "online training + practicum",
    duration: "4 weeks",
    certification: true,
    status: "active"
  },

  // ==================== CATEGORY 5: CORPORATE/INSTITUTIONAL ====================
  {
    id: "corporate-training-basic",
    name: "Corporate Training (Basic Package)",
    category: "corporate",
    price: 5000000,
    price_usd: 8333,
    commission_rate: 0.10,
    target_audience: "HR departments, companies with 50-200 employees",
    value_proposition: "Employee wellness program focused on family strengthening",
    sales_pitch: "Reduce employee stress and improve productivity through marriage education",
    marketing_assets: ["corporate-brochure.pdf"],
    upsell_from: [],
    upsell_to: ["corporate-training-advanced"],
    format: "on-site or virtual workshops",
    duration: "1 day workshop + resources",
    certification: false,
    status: "active"
  },
  {
    id: "corporate-training-advanced",
    name: "Corporate Training (Advanced Package)",
    category: "corporate",
    price: 10000000,
    price_usd: 16667,
    commission_rate: 0.10,
    target_audience: "Large corporations, 200+ employees",
    value_proposition: "Comprehensive employee wellness program with ongoing support",
    sales_pitch: "Multi-month program with workshops, coaching, and resources",
    marketing_assets: ["corporate-brochure-advanced.pdf"],
    upsell_from: ["corporate-training-basic"],
    upsell_to: [],
    format: "multi-session program",
    duration: "6 months",
    certification: false,
    status: "active"
  },
  {
    id: "ngo-partnership",
    name: "NGO Partnership Program",
    category: "corporate",
    price: 20000000,
    price_usd: 33333,
    commission_rate: 0.10,
    target_audience: "NGOs, non-profits focused on family/youth",
    value_proposition: "Co-branded marriage literacy deployment through NGO network",
    sales_pitch: "Amplify your mission through marriage education partnership",
    marketing_assets: ["ngo-partnership-proposal.pdf"],
    upsell_from: [],
    upsell_to: [],
    format: "partnership program",
    duration: "12 months",
    certification: false,
    status: "active"
  },
  {
    id: "government-program",
    name: "Government Marriage Literacy Program",
    category: "corporate",
    price: 50000000,
    price_usd: 83333,
    commission_rate: 0.10,
    target_audience: "Government ministries, municipalities",
    value_proposition: "Nationwide marriage literacy deployment",
    sales_pitch: "Strengthen the nation through systematic marriage education",
    marketing_assets: ["government-proposal.pdf"],
    upsell_from: [],
    upsell_to: [],
    format: "institutional program",
    duration: "Multi-year",
    certification: false,
    status: "active"
  },
  {
    id: "university-program",
    name: "University Marriage Education Program",
    category: "corporate",
    price: 30000000,
    price_usd: 50000,
    commission_rate: 0.10,
    target_audience: "Universities, colleges",
    value_proposition: "Curriculum integration for marriage literacy",
    sales_pitch: "Prepare students for marriage through academic program",
    marketing_assets: ["university-proposal.pdf"],
    upsell_from: [],
    upsell_to: [],
    format: "curriculum + training",
    duration: "Academic year",
    certification: true,
    status: "active"
  },

  // ==================== CATEGORY 6: COMMUNITY PROJECTS ====================
  {
    id: "church-partnership-basic",
    name: "Church Partnership (Basic)",
    category: "community",
    price: 2000000,
    price_usd: 3333,
    commission_rate: 0.10,
    target_audience: "Local churches, 50-200 members",
    value_proposition: "Marriage literacy program for congregation",
    sales_pitch: "Equip your church with biblical marriage education",
    marketing_assets: [],
    upsell_from: [],
    upsell_to: ["church-partnership-advanced"],
    format: "workshop series + resources",
    duration: "3 months",
    certification: false,
    status: "active"
  },
  {
    id: "church-partnership-advanced",
    name: "Church Partnership (Advanced)",
    category: "community",
    price: 5000000,
    price_usd: 8333,
    commission_rate: 0.10,
    target_audience: "Large churches, 200+ members",
    value_proposition: "Comprehensive marriage ministry establishment",
    sales_pitch: "Build a thriving marriage ministry in your church",
    marketing_assets: [],
    upsell_from: ["church-partnership-basic"],
    upsell_to: [],
    format: "full ministry setup + training",
    duration: "12 months",
    certification: true,
    status: "active"
  },
  {
    id: "community-workshop-series",
    name: "Community Workshop Series",
    category: "community",
    price: 1500000,
    price_usd: 2500,
    commission_rate: 0.10,
    target_audience: "Community centers, local organizations",
    value_proposition: "6-week public marriage education series",
    sales_pitch: "Bring marriage literacy to your community",
    marketing_assets: [],
    upsell_from: [],
    upsell_to: [],
    format: "public workshop series",
    duration: "6 weeks",
    certification: false,
    status: "active"
  },
  {
    id: "youth-marriage-literacy",
    name: "Youth Marriage Literacy Program",
    category: "community",
    price: 3000000,
    price_usd: 5000,
    commission_rate: 0.10,
    target_audience: "Youth organizations, schools, churches",
    value_proposition: "Prepare youth for future marriage",
    sales_pitch: "Preventative marriage education for next generation",
    marketing_assets: [],
    upsell_from: [],
    upsell_to: [],
    format: "youth-focused curriculum",
    duration: "12 weeks",
    certification: false,
    status: "active"
  },

  // ==================== ADDITIONAL RESOURCES ====================
  {
    id: "sbd-magazine-subscription",
    name: "SBD Magazine - Annual Subscription",
    category: "books",
    price: 50000,
    price_usd: 83,
    commission_rate: 0.10,
    target_audience: "ongoing learners, ambassadors",
    value_proposition: "Quarterly insights and community connection",
    sales_pitch: "Stay connected with 200+ pages of content per issue",
    marketing_assets: ["magazine-sample.pdf"],
    upsell_from: ["sbd-dummies-book"],
    upsell_to: [],
    format: "digital magazine (3 issues/year)",
    duration: "12 months",
    certification: false,
    status: "active"
  },
  {
    id: "marriage-literacy-challenge",
    name: "14-Day Marriage Literacy Challenge",
    category: "courses",
    price: 5000,
    price_usd: 8,
    commission_rate: 0.10,
    target_audience: "curious beginners, first-time buyers",
    value_proposition: "Low-cost entry point to marriage education",
    sales_pitch: "14 days of guided reflections and community support",
    marketing_assets: [],
    upsell_from: [],
    upsell_to: ["sbd-dummies-book", "sbd-dummies-course"],
    format: "online challenge + group",
    duration: "14 days",
    certification: false,
    status: "active"
  }
];

// Populate Firestore
async function populateProducts() {
  console.log('🚀 Starting product catalog creation...\n');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const product of products) {
    try {
      await db.collection('products').doc(product.id).set({
        ...product,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`✅ Created: ${product.name} (${product.category}) - ${product.price.toLocaleString()} FCFA`);
      successCount++;
    } catch (error) {
      console.error(`❌ Error creating ${product.id}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`\n📊 SUMMARY:`);
  console.log(`✅ Successfully created: ${successCount} products`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`\n📦 CATALOG BREAKDOWN:`);
  
  const breakdown = products.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {});
  
  Object.entries(breakdown).forEach(([category, count]) => {
    console.log(`   ${category}: ${count} products`);
  });
  
  console.log(`\n💰 TOTAL PRODUCTS: ${products.length}`);
  console.log(`\n✨ Product catalog creation complete!`);
}

// Run the script
populateProducts()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
