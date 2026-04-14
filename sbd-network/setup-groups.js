// setup-groups.js
// Creates the 4 canonical community groups and assigns unassigned boards to AMTS.
// Run once: node setup-groups.js

const admin = require('firebase-admin');
const serviceAccount = require('/Users/achugustave/Documents/Marriageducation/serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANONICAL_GROUPS = [
  {
    id: 'sexual-mastery',
    title: 'Sexual Mastery',
    description: 'Mastery of the sexual arts within marriage.',
    requiredTier: 'elite',
    order: 1,
  },
  {
    id: 'marriage-systems',
    title: 'Marriage Systems',
    description: 'Systems, structures and strategy for elite marriage.',
    requiredTier: 'elite',
    order: 2,
  },
  {
    id: 'advanced-muliebrity-training-school',
    title: 'Advanced Muliebrity Training School',
    description: 'The complete Muliebrity training environment.',
    requiredTier: 'elite',
    order: 3,
  },
  {
    id: 'virility',
    title: 'Virility',
    description: 'Male power, drive and physical mastery.',
    requiredTier: 'elite',
    order: 4,
  },
];

async function main() {
  console.log('=== Setting up canonical groups ===\n');

  // 1. Create or update the 4 canonical groups
  for (const g of CANONICAL_GROUPS) {
    const ref = db.collection('groups').doc(g.id);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.update({
        title: g.title,
        description: g.description,
        requiredTier: g.requiredTier,
        order: g.order,
      });
      console.log(`✓ Updated group: ${g.title}`);
    } else {
      await ref.set({
        title: g.title,
        description: g.description,
        requiredTier: g.requiredTier,
        order: g.order,
        archived: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`✓ Created group: ${g.title}`);
    }
  }

  // 2. Delete or skip old auto-ID groups named "Muliebrity Board" (old name)
  console.log('\n=== Checking for old Muliebrity Board group ===');
  const oldSnap = await db.collection('groups')
    .where('title', '==', 'Muliebrity Board')
    .get();
  if (!oldSnap.empty) {
    for (const doc of oldSnap.docs) {
      if (doc.id !== 'advanced-muliebrity-training-school') {
        // Reassign any boards pointing to this old ID
        const boardsWithOldGroup = await db.collection('boards')
          .where('groupId', '==', doc.id)
          .get();
        let moved = 0;
        for (const b of boardsWithOldGroup.docs) {
          await b.ref.update({ groupId: 'advanced-muliebrity-training-school' });
          moved++;
        }
        console.log(`  Moved ${moved} board(s) from old group (${doc.id}) → AMTS`);
        await doc.ref.delete();
        console.log(`  Deleted old group: ${doc.id}`);
      }
    }
  } else {
    console.log('  No old "Muliebrity Board" found — nothing to clean up.');
  }

  // 3. Move all boards NOT pointing to a canonical group → AMTS
  // Boards that SHOULD be in AMTS per system design (all 20 Muliebrity boards)
  const CANONICAL_IDS = new Set(CANONICAL_GROUPS.map(g => g.id));
  console.log('\n=== Assigning boards to canonical AMTS group ===');
  const allBoards = await db.collection('boards').get();
  let assigned = 0;
  for (const doc of allBoards.docs) {
    const data = doc.data();
    if (!data.groupId || !CANONICAL_IDS.has(data.groupId)) {
      await doc.ref.update({ groupId: 'advanced-muliebrity-training-school' });
      console.log(`  ✓ "${data.title}" → AMTS (was: ${data.groupId || 'none'})`);
      assigned++;
    }
  }
  console.log(`\n✅ Done. ${assigned} board(s) moved to AMTS.`);

  // 4. Print summary
  console.log('\n=== Final group summary ===');
  const finalGroups = await db.collection('groups').orderBy('order').get();
  for (const g of finalGroups.docs) {
    const d = g.data();
    const boardsInGroup = await db.collection('boards').where('groupId', '==', g.id).get();
    console.log(`  [${g.id}] "${d.title}" — tier: ${d.requiredTier} — boards: ${boardsInGroup.size}`);
  }
}

main().catch(console.error).finally(() => process.exit());
