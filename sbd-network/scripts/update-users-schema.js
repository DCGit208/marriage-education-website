const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');

if (!fs.existsSync(SERVICE_ACCOUNT)) {
  console.error('❌ Service account key not found at:', SERVICE_ACCOUNT);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(SERVICE_ACCOUNT)
});

const db = admin.firestore();

async function updateUsersSchema() {
  console.log('\n📝 UPDATING USERS SCHEMA (NON-DESTRUCTIVE)...\n');

  try {
    // Get all existing users
    const usersSnapshot = await db.collection('users').get();
    
    console.log(`📊 FOUND ${usersSnapshot.size} USERS\n`);

    if (usersSnapshot.empty) {
      console.log('⚠️  No users found in database. Schema update skipped.');
      console.log('✅ Schema will be applied when users sign up.\n');
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;

    for (const doc of usersSnapshot.docs) {
      const userId = doc.id;
      const existingData = doc.data();

      // Check if user already has new schema fields
      if (existingData.tier && existingData.courseEnrollments) {
        console.log(`   ⏭️  Skipping ${existingData.displayName || userId} (already updated)`);
        skippedCount++;
        continue;
      }

      // Non-destructive update: Add new fields without overwriting existing data
      const updateData = {
        tier: existingData.tier || 'free', // Default to free tier
        courseEnrollments: existingData.courseEnrollments || [],
        progressTracking: existingData.progressTracking || {
          completedModules: [],
          completedCourses: [],
          totalWatchTime: 0
        },
        subscriptionStatus: existingData.subscriptionStatus || 'none',
        accessFeatures: existingData.accessFeatures || {
          learn: true,
          boards: true,
          mvHouse: false, // Elite tier only
          shop: false // Premium+ tier
        },
        // Preserve all existing data
        ...existingData
      };

      await db.collection('users').doc(userId).update(updateData);
      console.log(`   ✅ Updated ${existingData.displayName || userId}`);
      updatedCount++;
    }

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('✅ USERS SCHEMA UPDATE COMPLETE');
    console.log('════════════════════════════════════════════════════════════');
    console.log(`📊 SUMMARY:`);
    console.log(`   • Total users: ${usersSnapshot.size}`);
    console.log(`   • Updated: ${updatedCount}`);
    console.log(`   • Skipped (already updated): ${skippedCount}`);
    console.log('════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ ERROR updating users schema:', error);
    process.exit(1);
  }

  process.exit(0);
}

updateUsersSchema();
