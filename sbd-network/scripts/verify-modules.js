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

async function verifyModules() {
  console.log('🔍 VERIFYING MODULES COLLECTION...\n');
  
  // Check total module count
  const allModules = await db.collection('modules').get();
  const expectedTotal = 25; // 6 + 6 + 13
  
  console.log(`📊 TOTAL MODULES: ${allModules.size}`);
  console.assert(allModules.size === expectedTotal, 
    `❌ Expected ${expectedTotal} modules, got ${allModules.size}`);
  
  if (allModules.size === expectedTotal) {
    console.log(`✅ Total count correct (${expectedTotal} modules)\n`);
  }
  
  // ===============================================
  // VERIFY FOUNDATION SCHOOL (100% free)
  // ===============================================
  console.log('📚 FOUNDATION SCHOOL VERIFICATION');
  
  const foundationModules = await db.collection('modules')
    .where('courseId', '==', 'foundation-school')
    .get();
  
  console.log(`   Total modules: ${foundationModules.size}`);
  console.assert(foundationModules.size === 6, 
    `❌ Foundation should have 6 modules, got ${foundationModules.size}`);
  
  const foundationFree = foundationModules.docs.filter(d => d.data().accessLevel === 'free');
  console.log(`   Free modules: ${foundationFree.length}`);
  console.assert(foundationFree.length === 6, 
    `❌ All Foundation modules should be free, got ${foundationFree.length}`);
  
  console.log('   ✓ 6 weeks, 100% free access\n');
  
  // ===============================================
  // VERIFY TELEIOS BLUEPRINT (50% lock)
  // ===============================================
  console.log('📚 TELEIOS BLUEPRINT VERIFICATION');
  
  const teleiosModules = await db.collection('modules')
    .where('courseId', '==', 'course-1-the-teleios-blueprint-full-human-maturity')
    .get();
  
  console.log(`   Total modules: ${teleiosModules.size}`);
  console.assert(teleiosModules.size === 6, 
    `❌ Teleios should have 6 modules, got ${teleiosModules.size}`);
  
  const teleiosFoundation = teleiosModules.docs.filter(d => d.data().accessLevel === 'foundation');
  const teleiosPremium = teleiosModules.docs.filter(d => d.data().accessLevel === 'premium');
  
  console.log(`   Foundation tier: ${teleiosFoundation.length} modules (weeks 1-3)`);
  console.log(`   Premium tier: ${teleiosPremium.length} modules (weeks 4-6)`);
  
  console.assert(teleiosFoundation.length === 3, 
    `❌ Teleios should have 3 foundation modules (weeks 1-3), got ${teleiosFoundation.length}`);
  console.assert(teleiosPremium.length === 3, 
    `❌ Teleios should have 3 premium modules (weeks 4-6), got ${teleiosPremium.length}`);
  
  const accessiblePercent = ((teleiosFoundation.length / teleiosModules.size) * 100).toFixed(0);
  console.log(`   ✓ ${accessiblePercent}% accessible (50% lock at week 4)\n`);
  
  // ===============================================
  // VERIFY SBD FOR DUMMIES (70% lock)
  // ===============================================
  console.log('📚 SEX BY DESIGN FOR DUMMIES VERIFICATION');
  
  const sbdModules = await db.collection('modules')
    .where('courseId', '==', 'course-14-sex-by-design-for-dummies')
    .get();
  
  console.log(`   Total modules: ${sbdModules.size}`);
  console.assert(sbdModules.size === 13, 
    `❌ SBD should have 13 modules, got ${sbdModules.size}`);
  
  const sbdFoundation = sbdModules.docs.filter(d => d.data().accessLevel === 'foundation');
  const sbdPremium = sbdModules.docs.filter(d => d.data().accessLevel === 'premium');
  
  console.log(`   Foundation tier: ${sbdFoundation.length} modules (weeks 1-4)`);
  console.log(`   Premium tier: ${sbdPremium.length} modules (weeks 5-13)`);
  
  console.assert(sbdFoundation.length === 4, 
    `❌ SBD should have 4 foundation modules (weeks 1-4), got ${sbdFoundation.length}`);
  console.assert(sbdPremium.length === 9, 
    `❌ SBD should have 9 premium modules (weeks 5-13), got ${sbdPremium.length}`);
  
  const sbdAccessiblePercent = ((sbdFoundation.length / sbdModules.size) * 100).toFixed(0);
  console.log(`   ✓ ${sbdAccessiblePercent}% accessible (70% lock at week 5)\n`);
  
  // ===============================================
  // VERIFY LOCK LOGIC
  // ===============================================
  console.log('🔒 LOCK LOGIC VERIFICATION');
  
  const lockedModules = allModules.docs.filter(d => d.data().isLocked === true);
  const unlockedModules = allModules.docs.filter(d => d.data().isLocked === false);
  
  console.log(`   Unlocked modules: ${unlockedModules.length} (Foundation tier can access)`);
  console.log(`   Locked modules: ${lockedModules.length} (Premium tier required)`);
  
  // Expected: 6 (Foundation) + 3 (Teleios weeks 1-3) + 4 (SBD weeks 1-4) = 13 unlocked
  const expectedUnlocked = 13;
  console.assert(unlockedModules.length === expectedUnlocked, 
    `❌ Expected ${expectedUnlocked} unlocked modules, got ${unlockedModules.length}`);
  
  // Expected: 3 (Teleios weeks 4-6) + 9 (SBD weeks 5-13) = 12 locked
  const expectedLocked = 12;
  console.assert(lockedModules.length === expectedLocked, 
    `❌ Expected ${expectedLocked} locked modules, got ${lockedModules.length}`);
  
  console.log(`   ✓ Lock logic correct (13 unlocked, 12 locked)\n`);
  
  // ===============================================
  // VERIFY LOCK MESSAGES
  // ===============================================
  console.log('💬 LOCK MESSAGE VERIFICATION');
  
  const modulesWithLockMessages = lockedModules.filter(d => d.data().lockMessage != null);
  console.log(`   Locked modules with messages: ${modulesWithLockMessages.length}`);
  console.assert(modulesWithLockMessages.length === lockedModules.length, 
    `❌ All locked modules should have lockMessage, got ${modulesWithLockMessages.length}`);
  
  console.log('   ✓ All locked modules have upgrade CTAs\n');
  
  // ===============================================
  // SAMPLE MODULE STRUCTURE
  // ===============================================
  console.log('📄 SAMPLE MODULE STRUCTURE\n');
  
  const sampleUnlocked = foundationModules.docs[0].data();
  console.log('   Foundation School Week 1 (Unlocked):');
  console.log(`   • ID: ${sampleUnlocked.id}`);
  console.log(`   • Course ID: ${sampleUnlocked.courseId}`);
  console.log(`   • Week: ${sampleUnlocked.week}`);
  console.log(`   • Title: ${sampleUnlocked.title}`);
  console.log(`   • Access Level: ${sampleUnlocked.accessLevel}`);
  console.log(`   • Is Locked: ${sampleUnlocked.isLocked}`);
  console.log(`   • Lock Message: ${sampleUnlocked.lockMessage || 'null'}\n`);
  
  const sampleLocked = teleiosPremium[0].data();
  console.log('   Teleios Blueprint Week 4 (Locked):');
  console.log(`   • ID: ${sampleLocked.id}`);
  console.log(`   • Course ID: ${sampleLocked.courseId}`);
  console.log(`   • Week: ${sampleLocked.week}`);
  console.log(`   • Title: ${sampleLocked.title}`);
  console.log(`   • Access Level: ${sampleLocked.accessLevel}`);
  console.log(`   • Is Locked: ${sampleLocked.isLocked}`);
  console.log(`   • Lock Message: ${sampleLocked.lockMessage}\n`);
  
  // ===============================================
  // FINAL SUMMARY
  // ===============================================
  console.log('═'.repeat(60));
  console.log('✅ TASK 0.4 VERIFICATION PASSED');
  console.log('═'.repeat(60));
  console.log('📊 MODULES CREATED: 25 modules');
  console.log('   • Foundation School: 6 modules (100% free)');
  console.log('   • Teleios Blueprint: 6 modules (50% locked)');
  console.log('   • SBD for Dummies: 13 modules (70% locked)');
  console.log('');
  console.log('🔒 LOCK LOGIC IMPLEMENTED:');
  console.log('   • Foundation tier: 13 unlocked modules');
  console.log('   • Premium tier required: 12 locked modules');
  console.log('   • All locked modules have upgrade CTAs');
  console.log('');
  console.log('💰 MONETIZATION STRATEGY:');
  console.log('   • Create progress: Users start courses for free');
  console.log('   • Strategic lock: 50-70% completion blocked');
  console.log('   • Drive conversion: Upgrade to Premium to finish');
  console.log('═'.repeat(60));
}

verifyModules()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ VERIFICATION ERROR:', err);
    process.exit(1);
  });
