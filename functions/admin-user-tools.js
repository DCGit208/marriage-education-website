/**
 * Admin tools — lookup Auth users by email, repair orphan profiles, delete auth-only accounts.
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { creditSbdSubscriptionCommissions } = require('./sbd-subscription-commission');

const FOUNDATION_GROUPS = [
  'group-sbd-community',
  'group-teleios-formation',
  'group-sbd-dummies',
];

function deriveSbdReferralCode(sellerCode) {
  const c = String(sellerCode || '').trim().toUpperCase();
  if (!c) return null;
  if (c.startsWith('SBD-')) return c;
  if (c.startsWith('AMB-')) return c.replace(/^AMB-/, 'SBD-');
  if (c.startsWith('RD-')) return c.replace(/^RD-/, 'SBD-');
  return c;
}

async function assertSbdAdmin(db, context) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  if (context.auth.token.admin === true) {
    return { uid: context.auth.uid, email: context.auth.token.email || '' };
  }
  const callerSnap = await db.collection('users').doc(context.auth.uid).get();
  const callerData = callerSnap.exists ? callerSnap.data() : {};
  const role = String(callerData.role || '').toLowerCase();
  if (role === 'admin' || callerData.isAdmin === true) {
    return { uid: context.auth.uid, email: context.auth.token.email || callerData.email || '' };
  }
  throw new functions.https.HttpsError('permission-denied', 'Admin access required');
}

async function findSellerBySbdReferralCode(db, refCode) {
  const code = String(refCode || '').trim().toUpperCase();
  if (!code) return null;

  const ambSnap = await db.collection('ambassadors').where('sbdReferralCode', '==', code).limit(1).get();
  if (!ambSnap.empty) {
    const doc = ambSnap.docs[0];
    return { type: 'ambassador', ref: doc.ref, data: doc.data(), id: doc.id };
  }

  const rdSnap = await db.collection('regional_directors').where('sbdReferralCode', '==', code).limit(1).get();
  if (!rdSnap.empty) {
    const doc = rdSnap.docs[0];
    return { type: 'rd', ref: doc.ref, data: doc.data(), id: doc.id };
  }

  if (code.startsWith('SBD-')) {
    const rdCode = code.replace(/^SBD-/, 'RD-');
    const rdDoc = await db.collection('regional_directors').doc(rdCode).get();
    if (rdDoc.exists) {
      return { type: 'rd', ref: rdDoc.ref, data: rdDoc.data(), id: rdDoc.id };
    }
  }

  return null;
}

function registerAdminUserTools(db, exportsObj) {
  exportsObj.adminLookupUserByEmail = functions.https.onCall(async (data, context) => {
    await assertSbdAdmin(db, context);
    const email = String(data?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      throw new functions.https.HttpsError('invalid-argument', 'Valid email required');
    }

    let authUser = null;
    try {
      authUser = await admin.auth().getUserByEmail(email);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        return { found: false, email, auth: null, firestore: null, orphan: false };
      }
      throw err;
    }

    const uid = authUser.uid;
    const userSnap = await db.collection('users').doc(uid).get();
    let firestoreByEmail = null;
    if (!userSnap.exists) {
      const q = await db.collection('users').where('email', '==', email).limit(1).get();
      if (!q.empty) {
        firestoreByEmail = { uid: q.docs[0].id, data: q.docs[0].data() };
      }
    }

    return {
      found: true,
      email,
      orphan: !!authUser && !userSnap.exists && !firestoreByEmail,
      auth: {
        uid,
        email: authUser.email || email,
        displayName: authUser.displayName || '',
        disabled: !!authUser.disabled,
        createdAt: authUser.metadata?.creationTime || null,
        lastSignIn: authUser.metadata?.lastSignInTime || null,
      },
      firestore: userSnap.exists
        ? { uid, exists: true, data: userSnap.data() }
        : firestoreByEmail
          ? { uid: firestoreByEmail.uid, exists: true, data: firestoreByEmail.data, uidMismatch: true }
          : { uid, exists: false },
    };
  });

  exportsObj.adminRepairOrphanUser = functions.https.onCall(async (data, context) => {
    await assertSbdAdmin(db, context);
    const uid = String(data?.uid || '').trim();
    const name = String(data?.name || '').trim();
    const email = String(data?.email || '').trim().toLowerCase();
    const tier = String(data?.tier || 'foundation').trim().toLowerCase();
    const ambassadorCode = String(data?.ambassadorCode || data?.referralCode || '').trim().toUpperCase();
    const creditReferral = data?.creditReferral !== false;

    if (!uid) throw new functions.https.HttpsError('invalid-argument', 'uid required');

    let authUser;
    try {
      authUser = await admin.auth().getUser(uid);
    } catch (err) {
      throw new functions.https.HttpsError('not-found', 'Auth user not found for uid');
    }

    const resolvedEmail = email || (authUser.email || '').toLowerCase();
    const resolvedName = name || authUser.displayName || resolvedEmail.split('@')[0] || 'Member';
    const referredBy = ambassadorCode ? deriveSbdReferralCode(ambassadorCode) : null;

    const existing = await db.collection('users').doc(uid).get();
    if (existing.exists) {
      throw new functions.https.HttpsError('already-exists', 'Firestore profile already exists — use Manage User instead');
    }

    const farFuture = admin.firestore.Timestamp.fromDate(new Date('2099-12-31'));
    const payload = {
      uid,
      name: resolvedName,
      email: resolvedEmail,
      signupApp: 'sbd-network',
      role: 'member',
      tier: tier === 'free' ? 'free' : tier,
      groups: tier === 'foundation' ? FOUNDATION_GROUPS.slice() : tier === 'free' ? ['group-sbd-community'] : [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActive: admin.firestore.FieldValue.serverTimestamp(),
      repairedAt: admin.firestore.FieldValue.serverTimestamp(),
      repairedBy: context.auth.uid,
      repairReason: 'admin_orphan_repair',
    };

    if (referredBy) payload.referredBy = referredBy;

    if (tier !== 'free') {
      payload.subscription = {
        tier,
        status: 'active',
        source: 'admin',
        ambassadorCode: ambassadorCode && ambassadorCode.startsWith('AMB-') ? ambassadorCode : undefined,
        startDate: admin.firestore.FieldValue.serverTimestamp(),
        endDate: farFuture,
      };
    } else {
      payload.subscription = { tier: 'free', status: 'inactive' };
    }

    await db.collection('users').doc(uid).set(payload);

    let referralCredit = null;
    if (creditReferral && referredBy && tier === 'foundation') {
      referralCredit = await creditSbdSubscriptionCommissions({
        db,
        findSellerByReferralCode: findSellerBySbdReferralCode,
        uid,
        referralCode: referredBy,
        productId: 'foundation-monthly',
        tierKey: 'foundation',
        idempotencyKey: `admin_repair_${uid}_${Date.now()}`,
        chargeKind: 'initial',
      });
    }

    if (referredBy) {
      const ambSnap = await db.collection('ambassadors').where('sbdReferralCode', '==', referredBy).limit(1).get();
      if (!ambSnap.empty) {
        await ambSnap.docs[0].ref.update({
          'sbdReferrals.signups': admin.firestore.FieldValue.increment(1),
        });
      }
    }

    return {
      ok: true,
      uid,
      email: resolvedEmail,
      referredBy,
      tier,
      referralCredit,
    };
  });

  exportsObj.adminDeleteAuthUser = functions.https.onCall(async (data, context) => {
    await assertSbdAdmin(db, context);
    const uid = String(data?.uid || '').trim();
    if (!uid) throw new functions.https.HttpsError('invalid-argument', 'uid required');
    if (uid === context.auth.uid) {
      throw new functions.https.HttpsError('failed-precondition', 'Cannot delete your own account from admin');
    }

    const userSnap = await db.collection('users').doc(uid).get();
    if (userSnap.exists) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'User has a Firestore profile — use Hard Delete in Manage User instead'
      );
    }

    await admin.auth().deleteUser(uid);
    return { ok: true, uid, deleted: 'auth_only' };
  });
}

module.exports = { registerAdminUserTools, deriveSbdReferralCode };
