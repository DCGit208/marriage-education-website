/**
 * DETAILED COURSE REVIEW
 * Shows all 44 courses organized by school
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

async function reviewCourses() {
  console.log('\n📚 DETAILED COURSE REVIEW - TASK 0.3\n');
  console.log('='.repeat(80));
  
  const schoolIds = [
    { id: 'school-1-teleios', name: 'SCHOOL 1: TELEIOS FOUNDATION' },
    { id: 'school-2-sexual-literacy', name: 'SCHOOL 2: SEXUAL LITERACY' },
    { id: 'school-3-marriage-systems', name: 'SCHOOL 3: MARRIAGE SYSTEMS' },
    { id: 'school-4-civilization-leadership', name: 'SCHOOL 4: CIVILIZATION LEADERSHIP' }
  ];
  
  for (const school of schoolIds) {
    console.log(`\n${school.name}`);
    console.log('-'.repeat(80));
    
    const courses = await db.collection('courses')
      .where('schoolId', '==', school.id)
      .get();
    
    let schoolTotal = 0;
    let foundationCount = 0;
    let premiumCount = 0;
    
    // Sort courses by courseNo
    const sortedCourses = courses.docs.sort((a, b) => {
      return (a.data().courseNo || 0) - (b.data().courseNo || 0);
    });
    
    sortedCourses.forEach((doc, index) => {
      const data = doc.data();
      schoolTotal += data.price;
      
      if (data.accessLevel === 'foundation') foundationCount++;
      if (data.accessLevel === 'premium') premiumCount++;
      
      // Format duration
      const duration = data.duration || `${data.durationWeeks} weeks`;
      
      // Format price
      const priceStr = `$${data.price}`.padEnd(6);
      
      // Format duration
      const durationStr = duration.padEnd(12);
      
      // Access level indicator
      const access = data.accessLevel === 'foundation' ? '🔓 FREE' : '🔒 PREMIUM';
      
      // Badge
      const badge = data.badge ? ` [${data.badge}]` : '';
      
      console.log(`   ${(index + 1).toString().padStart(2)}. ${data.title}`);
      console.log(`       ${priceStr} | ${durationStr} | ${access}${badge}`);
      if (data.note) {
        console.log(`       Note: ${data.note}`);
      }
    });
    
    console.log(`\n   SUBTOTAL: ${courses.size} courses | $${schoolTotal.toLocaleString()} | Foundation: ${foundationCount} | Premium: ${premiumCount}`);
  }
  
  // Grand totals
  console.log('\n' + '='.repeat(80));
  const allCourses = await db.collection('courses').get();
  let grandTotal = 0;
  let totalFoundation = 0;
  let totalPremium = 0;
  
  allCourses.forEach(doc => {
    const data = doc.data();
    grandTotal += data.price;
    if (data.accessLevel === 'foundation') totalFoundation++;
    if (data.accessLevel === 'premium') totalPremium++;
  });
  
  console.log(`\n📊 GRAND TOTAL:`);
  console.log(`   - Total courses: ${allCourses.size}`);
  console.log(`   - Portfolio value: $${grandTotal.toLocaleString()}`);
  console.log(`   - Foundation tier: ${totalFoundation} courses (Foundation users get partial access)`);
  console.log(`   - Premium tier: ${totalPremium} courses (Premium subscription required)`);
  
  console.log('\n💡 KEY INSIGHTS:');
  console.log(`   - School 1 (Teleios): Entry point with ${totalFoundation} courses in Foundation tier`);
  console.log(`   - Schools 2-4: All Premium tier content (revenue drivers)`);
  console.log(`   - Average course value: $${Math.round(grandTotal / allCourses.size)}`);
  
  console.log('\n='.repeat(80));
  console.log('\n✅ TASK 0.3 COMPLETE\n');
}

reviewCourses()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  });
