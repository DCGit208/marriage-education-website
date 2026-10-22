/**
 * Backfill SBD reader access for past "Sex by Design for Dummies" buyers.
 *
 * Usage:
 *   node scripts/backfill-sbd-dummies-reader-access.js            (dry run: lists buyers only)
 *   node scripts/backfill-sbd-dummies-reader-access.js --apply    (creates/reuses reader accounts and grants ownedProducts)
 *
 * No emails are sent and no passwords are created or shown. Buyers can use
 * "Forgot password" on sbd.marriageducation.com to set their own password.
 */

const path = require('path');
const admin = require('firebase-admin');

const keyPath = path.join(__dirname, '../serviceAccountKey.json');
admin.initializeApp(require('fs').existsSync(keyPath)
  ? { credential: admin.credential.cert(require(keyPath)), projectId: 'marriage-education' }
  : { projectId: 'marriage-education' });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
const PRODUCT_IDS = new Set([
  'sbd-book', 'sbd-for-dummies', 'sbd-dummies', 'sbd-dummies-digital-print', 'sbd-founding',
  'sbd-1', 'sbd-3', 'sbd-5', 'sbd-10', 'sbd-20', 'sbd-50', 'sbd-100'
]);

function isDummies(payment) {
  const id = String(payment.product_id || '').toLowerCase();
  return PRODUCT_IDS.has(id) || String(payment.product_name || '').toLowerCase().includes('dummies');
}

async function collectBuyers() {
  const buyers = new Map();
  const snap = await db.collection('pending_payments').where('status', '==', 'approved').get();
  snap.forEach((doc) => {
    const p = doc.data();
    const email = String(p.email || '').trim().toLowerCase();
    if (!email.includes('@') || !isDummies(p)) return;
    if (!buyers.has(email)) buyers.set(email, { email, name: p.name || p.full_name || '', refs: [] });
    buyers.get(email).refs.push(p.reference || doc.id);
  });
  await collectAmbassadors(buyers);
  return [...buyers.values()];
}

// Ambassadors receive the Dummies book on registration; it is read in the SBD app.
async function collectAmbassadors(buyers) {
  const snap = await db.collection('ambassadors').get();
  snap.forEach((doc) => {
    const a = doc.data();
    const status = String(a.status || '').toLowerCase();
    const email = String(a.email || '').trim().toLowerCase();
    if (!email.includes('@') || (status !== 'active' && status !== 'approved')) return;
    if (!buyers.has(email)) buyers.set(email, { email, name: a.fullName || a.name || '', refs: [] });
    buyers.get(email).refs.push(doc.id);
  });
}

async function grant(buyer) {
  let user;
  try {
    user = await admin.auth().getUserByEmail(buyer.email);
  } catch {
    user = await admin.auth().createUser({
      email: buyer.email,
      displayName: buyer.name || 'Reader',
      emailVerified: false
    });
  }
  const ref = db.collection('users').doc(user.uid);
  await ref.set({
    uid: user.uid,
    email: buyer.email,
    ownedProducts: admin.firestore.FieldValue.arrayUnion('sbd-dummies', 'sbd-for-dummies', 'sbd-dummies-digital-print'),
    sbdAccessProvisioned: true,
    sbdUid: user.uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return user.uid;
}

(async () => {
  const buyers = await collectBuyers();
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${buyers.length} Dummies buyer(s)/ambassador(s) found`);
  for (const b of buyers) {
    if (!APPLY) {
      console.log(`- ${b.email} (${b.refs.join(', ')})`);
      continue;
    }
    try {
      const uid = await grant(b);
      console.log(`✅ ${b.email} -> ${uid}`);
    } catch (err) {
      console.error(`❌ ${b.email}: ${err.message}`);
    }
  }
  if (!APPLY) console.log('\nRe-run with --apply to grant access.');
  process.exit(0);
})();
