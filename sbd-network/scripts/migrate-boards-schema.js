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

async function migrateBoardsSchema() {
  console.log('\n🔄 MIGRATING BOARDS SCHEMA (DATA PRESERVED)...\n');

  try {
    // Get all existing boards
    const boardsSnapshot = await db.collection('boards').get();
    
    console.log(`📊 FOUND ${boardsSnapshot.size} BOARDS\n`);

    if (boardsSnapshot.empty) {
      console.log('⚠️  No boards found in database. Migration skipped.');
      console.log('✅ Schema will be applied when boards are created.\n');
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;

    for (const doc of boardsSnapshot.docs) {
      const boardId = doc.id;
      const existingData = doc.data();

      // Check if board already has new schema fields
      if (existingData.hasOwnProperty('schoolId') && existingData.hasOwnProperty('courseId')) {
        console.log(`   ⏭️  Skipping "${existingData.title || boardId}" (already migrated)`);
        skippedCount++;
        continue;
      }

      // Non-destructive migration: Add new fields without overwriting existing data
      const updateData = {
        ...existingData,
        // Formation System associations (null = general board not linked to Formation)
        schoolId: existingData.schoolId || null,
        courseId: existingData.courseId || null,
        moduleId: existingData.moduleId || null,
        
        // Board categorization
        boardType: existingData.boardType || 'general', // 'general', 'course', 'module', 'community'
        
        // Access control
        accessLevel: existingData.accessLevel || 'free', // 'free', 'foundation', 'premium', 'elite'
        
        // Engagement metrics (preserve if exist)
        postCount: existingData.postCount || 0,
        memberCount: existingData.memberCount || 0,
        
        // Timestamps
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await db.collection('boards').doc(boardId).update(updateData);
      console.log(`   ✅ Migrated "${existingData.title || boardId}"`);
      updatedCount++;
    }

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('✅ BOARDS SCHEMA MIGRATION COMPLETE');
    console.log('════════════════════════════════════════════════════════════');
    console.log(`📊 SUMMARY:`);
    console.log(`   • Total boards: ${boardsSnapshot.size}`);
    console.log(`   • Migrated: ${updatedCount}`);
    console.log(`   • Skipped (already migrated): ${skippedCount}`);
    console.log(`   • All posts and comments preserved ✅`);
    console.log('════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ ERROR migrating boards schema:', error);
    process.exit(1);
  }

  process.exit(0);
}

migrateBoardsSchema();
