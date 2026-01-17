#!/usr/bin/env node
/**
 * FIRESTORE MIGRATION SCRIPT
 * 
 * Purpose: Add new fields to existing ambassadors for Marriage Foundation Access framework
 * Strategy: Add new fields while PRESERVING old fields for backward compatibility
 * 
 * New Fields Added:
 * - role, track, credentialStatus, credentialType, credentialEarnedAt
 * - schoolProgress object
 * - accessUnitsDeployed (mirrors booksSold), familiesSupported, youthReached, communitiesImpacted
 * - advocacyEarnings (mirrors commissionEarned)
 * - deploymentStats object
 * - eligibleFor object
 * 
 * OLD FIELDS PRESERVED:
 * - booksSold, commissionEarned (kept for backward compatibility)
 */

const admin = require('firebase-admin');

// Use Firebase config from environment or directly initialize with project ID
admin.initializeApp({
  projectId: 'marriage-education',
  // Will use Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS env var
});

const db = admin.firestore();

async function migrateAmbassadors() {
  console.log('\n🚀 Starting Firestore Migration...\n');
  
  try {
    const snapshot = await db.collection('ambassadors').get();
    
    console.log(`📊 Found ${snapshot.size} ambassadors to migrate\n`);
    
    let migratedCount = 0;
    let errorCount = 0;
    
    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        const ambassadorId = doc.id;
        
        // Build update object with new fields
        const updates = {
          // Role & Credential System
          role: data.role || 'Marriage Literacy Ambassador',
          track: data.track || "Women's Track",
          credentialStatus: data.credentialStatus || 'locked', // locked | in-progress | earned
          credentialType: data.credentialType || 'CRLA',
          credentialEarnedAt: data.credentialEarnedAt || null,
          
          // School Progress
          schoolProgress: data.schoolProgress || {
            currentWeek: 1,
            weeksCompleted: [],
            totalWeeks: 6,
            percentComplete: 0,
            startedAt: null,
            expectedCompletionDate: null
          },
          
          // NEW Impact Metrics (while keeping old ones)
          accessUnitsDeployed: data.accessUnitsDeployed || data.booksSold || 0,
          familiesSupported: data.familiesSupported || 0,
          youthReached: data.youthReached || 0,
          communitiesImpacted: data.communitiesImpacted || 0,
          advocacyEarnings: data.advocacyEarnings || data.commissionEarned || 0,
          
          // Deployment Breakdown
          deploymentStats: data.deploymentStats || {
            personalAccess: 0,
            sponsoredAccess: 0,
            communitySupport: 0
          },
          
          // Progression Pathways
          eligibleFor: data.eligibleFor || {
            paidAdvocacy: false,
            regionalDirector: false,
            advancedCounselor: false
          },
          
          // Update timestamp
          updated_at: admin.firestore.FieldValue.serverTimestamp()
          
          // NOTE: We DO NOT remove booksSold or commissionEarned
          // They stay for backward compatibility
        };
        
        await db.collection('ambassadors').doc(ambassadorId).update(updates);
        
        migratedCount++;
        console.log(`✅ Migrated: ${ambassadorId} (${data.firstName || 'Unknown'} ${data.lastName || ''})`);
        
      } catch (error) {
        errorCount++;
        console.error(`❌ Error migrating ${doc.id}:`, error.message);
      }
    }
    
    console.log(`\n📊 Migration Complete!`);
    console.log(`   ✅ Successfully migrated: ${migratedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`\n💡 Old fields (booksSold, commissionEarned) preserved for backward compatibility`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

migrateAmbassadors();
