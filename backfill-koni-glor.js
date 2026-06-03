/**
 * One-time backfill: Credit AMB-GLOR-1135 for recruiting AMB-KONI-8321
 * Run: node backfill-koni-glor.js
 */
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const RECRUITER_CODE  = 'AMB-GLOR-1135';
const RECRUIT_CODE    = 'AMB-KONI-8321';
const RECRUIT_NAME    = 'Koni'; // update if you know full name
const RECRUITMENT_BONUS = 1500;

async function backfill() {
  const ambRef = db.collection('ambassadors').doc(RECRUITER_CODE);
  const ambDoc = await ambRef.get();

  if (!ambDoc.exists) {
    console.error(`❌ Ambassador ${RECRUITER_CODE} not found in Firestore`);
    process.exit(1);
  }

  const ambData = ambDoc.data();
  console.log(`✅ Found ${RECRUITER_CODE}: ${ambData.name || ambData.fullName}`);
  console.log(`   Current recruits_count: ${ambData.recruits_count || 0}`);
  console.log(`   Current recruitment_bonus_pending: ${ambData.recruitment_bonus_pending || 0}`);

  // Check if admin_notifications already has this entry (avoid double-credit)
  const existing = await db.collection('admin_notifications')
    .where('rd_code', '==', RECRUITER_CODE)
    .where('ambassador_code', '==', RECRUIT_CODE)
    .get();

  if (!existing.empty) {
    console.warn(`⚠️  Notification already exists for ${RECRUITER_CODE} → ${RECRUIT_CODE}. Aborting to prevent double-credit.`);
    process.exit(0);
  }

  const currentRecruits = ambData.recruits_count || 0;
  const updatedRecruits  = currentRecruits + 1;

  const updates = {
    recruits_count:            admin.firestore.FieldValue.increment(1),
    directAmbassadorCount:     admin.firestore.FieldValue.increment(1),
    recruitment_count:         admin.firestore.FieldValue.increment(1),
    recruitment_bonus_earned:  admin.firestore.FieldValue.increment(RECRUITMENT_BONUS),
    recruitment_bonus_pending: admin.firestore.FieldValue.increment(RECRUITMENT_BONUS),
    'deployment_by_category.recruitment': admin.firestore.FieldValue.increment(1),
    'revenue_by_category.recruitment':    admin.firestore.FieldValue.increment(RECRUITMENT_BONUS),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Auto-promotion check: Senior at 10 recruits
  if (updatedRecruits >= 10 && ambData.ambassador_type !== 'senior' && ambData.ambassador_type !== 'regional_director') {
    updates.ambassador_type = 'senior';
    updates.role_level      = Math.max(ambData.role_level || 1, 2);
    updates.level           = 'Senior Ambassador';
    updates.promotion_date  = admin.firestore.FieldValue.serverTimestamp();
    console.log(`🎉 AUTO-PROMOTION: ${RECRUITER_CODE} → Senior Ambassador (${updatedRecruits} recruits)`);
  }

  await ambRef.update(updates);
  console.log(`✅ Updated ${RECRUITER_CODE} counters`);

  // Append to recruitment_history
  const history = ambData.recruitment_history || [];
  history.push({
    ambassador_code: RECRUIT_CODE,
    ambassador_name: RECRUIT_NAME,
    amount:  RECRUITMENT_BONUS,
    date:    new Date().toISOString(),
    status:  'pending',
    backfilled: true,
  });
  await ambRef.update({ recruitment_history: history });
  console.log(`✅ Appended to recruitment_history`);

  // Create admin_notifications record (shows in admin bonus table)
  const notifRef = await db.collection('admin_notifications').add({
    type:           'rd_recruitment_bonus',
    recruiter_type: ambData.ambassador_type === 'senior' ? 'senior' : 'ambassador',
    rd_code:        RECRUITER_CODE,
    rd_name:        ambData.name || ambData.fullName || 'Unknown',
    ambassador_code: RECRUIT_CODE,
    ambassador_name: RECRUIT_NAME,
    amount:          RECRUITMENT_BONUS,
    status:          'pending',
    backfilled:      true,
    created_at:      admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`✅ Created admin_notifications doc: ${notifRef.id}`);

  // Final state
  const after = (await ambRef.get()).data();
  console.log(`\n📊 Final state for ${RECRUITER_CODE}:`);
  console.log(`   recruits_count:            ${after.recruits_count}`);
  console.log(`   recruitment_bonus_earned:  ${after.recruitment_bonus_earned} FCFA`);
  console.log(`   recruitment_bonus_pending: ${after.recruitment_bonus_pending} FCFA`);
  console.log(`   ambassador_type:           ${after.ambassador_type}`);
  console.log(`\n✅ Backfill complete. Check admin dashboard → Recruitment Bonuses.`);
  process.exit(0);
}

backfill().catch(err => { console.error('❌ Fatal:', err); process.exit(1); });
