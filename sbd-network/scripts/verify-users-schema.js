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

async function verifyUsersSchema() {
  console.log('\n🔍 VERIFYING USERS SCHEMA...\n');

  try {
    const usersSnapshot = await db.collection('users').get();

    if (usersSnapshot.empty) {
      console.log('⚠️  No users found. Schema cannot be verified.');
      console.log('✅ Schema will be validated when first user signs up.\n');
      process.exit(0);
    }

    console.log(`📊 VERIFYING ${usersSnapshot.size} USERS\n`);

    let validCount = 0;
    let invalidCount = 0;
    const requiredFields = ['tier', 'courseEnrollments', 'progressTracking', 'subscriptionStatus', 'accessFeatures'];

    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      const missingFields = requiredFields.filter(field => !data.hasOwnProperty(field));

      if (missingFields.length === 0) {
        console.log(`   ✅ ${data.displayName || doc.id} - Schema valid`);
        validCount++;
      } else {
        console.log(`   ❌ ${data.displayName || doc.id} - Missing: ${missingFields.join(', ')}`);
        invalidCount++;
      }
    }

    console.log('\n═══════════════════════════════════════════');
    if (invalidCount === 0) {
      console.log('✅ ALL USERS HAVE VALID SCHEMA');
    } else {
      console.log('❌ SCHEMA VERIFICATION FAILED');
    }
    console.log('═══════════════════════════════════════════');
    console.log(`📊 RESULTS:`);
    console.log(`   • Valid: ${validCount}`);
    console.log(`   • Invalid: ${invalidCount}`);
    console.log('═══════════════════════════════════════════\n');

    if (invalidCount > 0) {
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ ERROR verifying users schema:', error);
    process.exit(1);
  }

  process.exit(0);
}

verifyUsersSchema();
