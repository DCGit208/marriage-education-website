/**
 * AMBASSADOR PROMOTION ENGINE
 * 
 * Automatically promotes ambassadors to senior status when they hit thresholds:
 * - Deploy 500+ units across portfolio
 * - Recruit 10 ambassadors to their team
 * 
 * Handles:
 * - Status upgrade (regular → senior)
 * - Database updates across collections
 * - Notification triggers
 * - Team linkage updates
 */

const admin = require('firebase-admin');
const db = admin.firestore();

/**
 * Check if ambassador qualifies for promotion to senior
 */
async function checkPromotionEligibility(ambassadorCode) {
  try {
    const ambassadorRef = db.collection('ambassadors').doc(ambassadorCode);
    const ambassadorSnap = await ambassadorRef.get();
    
    if (!ambassadorSnap.exists) {
      console.log(`❌ Ambassador ${ambassadorCode} not found`);
      return { eligible: false, reason: 'not_found' };
    }
    
    const ambassador = ambassadorSnap.data();
    
    // Skip if already senior
    if (ambassador.ambassador_type === 'senior') {
      return { eligible: false, reason: 'already_senior' };
    }
    
    // Check criteria
    const unitsDeployed = ambassador.units_deployed || ambassador.access_units_deployed || 0;
    const recruitsCount = ambassador.recruits_count || 0;
    
    const meetsUnitsThreshold = unitsDeployed >= 500;
    const meetsRecruitsThreshold = recruitsCount >= 10;
    
    console.log(`📊 ${ambassadorCode} eligibility check:`, {
      units: unitsDeployed,
      recruits: recruitsCount,
      unitsEligible: meetsUnitsThreshold,
      recruitsEligible: meetsRecruitsThreshold
    });
    
    if (meetsUnitsThreshold || meetsRecruitsThreshold) {
      return {
        eligible: true,
        reason: meetsUnitsThreshold ? 'units_threshold' : 'recruits_threshold',
        data: { unitsDeployed, recruitsCount }
      };
    }
    
    return { eligible: false, reason: 'thresholds_not_met', data: { unitsDeployed, recruitsCount } };
    
  } catch (error) {
    console.error(`❌ Error checking eligibility for ${ambassadorCode}:`, error);
    return { eligible: false, reason: 'error', error: error.message };
  }
}

/**
 * Promote ambassador to senior status
 */
async function promoteToSenior(ambassadorCode, reason) {
  try {
    console.log(`🎉 Promoting ${ambassadorCode} to Senior Ambassador (reason: ${reason})`);
    
    const ambassadorRef = db.collection('ambassadors').doc(ambassadorCode);
    const ambassadorSnap = await ambassadorRef.get();
    
    if (!ambassadorSnap.exists) {
      throw new Error(`Ambassador ${ambassadorCode} not found`);
    }
    
    const ambassador = ambassadorSnap.data();
    const batch = db.batch();
    
    // 1. Update ambassador record
    batch.update(ambassadorRef, {
      ambassador_type: 'senior',
      promotion_date: admin.firestore.FieldValue.serverTimestamp(),
      promotion_reason: reason,
      promoted_at: new Date().toISOString(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 2. Create senior_ambassadors record (for easier querying)
    const seniorRef = db.collection('senior_ambassadors').doc(ambassadorCode);
    batch.set(seniorRef, {
      ...ambassador,
      ambassador_type: 'senior',
      promotion_date: admin.firestore.FieldValue.serverTimestamp(),
      promotion_reason: reason,
      team_count: 0,
      team_override_earned: 0,
      seniors_recruited: 0, // Track for RD promotion later
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 3. Update recruiter's count if they have one
    if (ambassador.recruited_by || ambassador.senior_code) {
      const recruiterCode = ambassador.recruited_by || ambassador.senior_code;
      const recruiterRef = db.collection('ambassadors').doc(recruiterCode);
      const recruiterSnap = await recruiterRef.get();
      
      if (recruiterSnap.exists) {
        const recruiterData = recruiterSnap.data();
        if (recruiterData.ambassador_type === 'senior') {
          // Increment seniors_recruited for RD promotion tracking
          batch.update(recruiterRef, {
            seniors_recruited: admin.firestore.FieldValue.increment(1)
          });
          
          // Also update in senior_ambassadors collection
          batch.update(db.collection('senior_ambassadors').doc(recruiterCode), {
            seniors_recruited: admin.firestore.FieldValue.increment(1)
          });
        }
      }
    }
    
    // 4. Create promotion notification
    const notificationRef = db.collection('notifications').doc();
    batch.set(notificationRef, {
      type: 'promotion',
      title: '🎉 Congratulations! You\'re now a Senior Ambassador!',
      message: `You've been promoted to Senior Ambassador for ${reason === 'units_threshold' ? 'deploying 500+ units' : 'recruiting 10 ambassadors'}. You can now build your team and earn 5% override commissions!`,
      ambassador_code: ambassadorCode,
      read: false,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    await batch.commit();
    
    console.log(`✅ ${ambassadorCode} promoted to Senior Ambassador successfully`);
    
    // TODO: Send email notification
    // await sendPromotionEmail(ambassador.email, ambassador.name, reason);
    
    return {
      success: true,
      ambassadorCode: ambassadorCode,
      newStatus: 'senior',
      reason: reason
    };
    
  } catch (error) {
    console.error(`❌ Error promoting ${ambassadorCode}:`, error);
    throw error;
  }
}

/**
 * Callable Cloud Function: Manual promotion check
 */
exports.checkPromotion = async (ambassadorCode) => {
  const eligibility = await checkPromotionEligibility(ambassadorCode);
  
  if (eligibility.eligible) {
    return await promoteToSenior(ambassadorCode, eligibility.reason);
  }
  
  return {
    success: false,
    eligible: false,
    reason: eligibility.reason,
    data: eligibility.data
  };
};

/**
 * Firestore Trigger: Auto-check promotion on ambassador update
 */
exports.onAmbassadorUpdate = async (change, context) => {
  const before = change.before.data();
  const after = change.after.data();
  const ambassadorCode = context.params.ambassadorCode;
  
  // Skip if already senior
  if (after.ambassador_type === 'senior') {
    return null;
  }
  
  // Check if units or recruits changed
  const unitsChanged = (after.units_deployed || 0) !== (before.units_deployed || 0);
  const recruitsChanged = (after.recruits_count || 0) !== (before.recruits_count || 0);
  
  if (!unitsChanged && !recruitsChanged) {
    return null;
  }
  
  console.log(`📊 ${ambassadorCode} stats changed, checking promotion eligibility...`);
  
  const eligibility = await checkPromotionEligibility(ambassadorCode);
  
  if (eligibility.eligible) {
    console.log(`🎯 ${ambassadorCode} is eligible for promotion!`);
    await promoteToSenior(ambassadorCode, eligibility.reason);
  } else {
    console.log(`⏳ ${ambassadorCode} not yet eligible:`, eligibility.data);
  }
  
  return null;
};

/**
 * Update recruits count when new ambassador is registered with senior_code
 */
exports.onNewAmbassadorRegistered = async (snap, context) => {
  const newAmbassador = snap.data();
  const seniorCode = newAmbassador.senior_code;
  
  if (!seniorCode) {
    console.log('No senior_code found for new ambassador');
    return null;
  }
  
  console.log(`👥 New ambassador recruited by ${seniorCode}`);
  
  // Increment recruits_count for the senior
  const seniorRef = db.collection('ambassadors').doc(seniorCode);
  await seniorRef.update({
    recruits_count: admin.firestore.FieldValue.increment(1),
    team_count: admin.firestore.FieldValue.increment(1),
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // Also update in senior_ambassadors if exists
  const seniorAmbRef = db.collection('senior_ambassadors').doc(seniorCode);
  const seniorAmbSnap = await seniorAmbRef.get();
  if (seniorAmbSnap.exists) {
    await seniorAmbRef.update({
      team_count: admin.firestore.FieldValue.increment(1)
    });
  }
  
  console.log(`✅ Updated recruits count for ${seniorCode}`);
  
  // Check if senior should be promoted to RD (needs 50 seniors)
  const seniorSnap = await seniorRef.get();
  const seniorData = seniorSnap.data();
  
  if (seniorData.seniors_recruited >= 50 && seniorData.ambassador_type !== 'regional_director') {
    console.log(`👑 ${seniorCode} eligible for RD promotion!`);
    // TODO: Implement RD promotion logic
  }
  
  return null;
};

module.exports = {
  checkPromotionEligibility,
  promoteToSenior
};
