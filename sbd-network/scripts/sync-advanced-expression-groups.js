/**
 * One-time / maintenance: align users.groups with advanced expression milestone.
 * Dry run: node scripts/sync-advanced-expression-groups.js --dry-run
 */
'use strict';

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const adv = require(path.join(__dirname, '../../functions/lib/advanced-expression-access'));

const SA = path.resolve(__dirname, '../../serviceAccountKey.json');
const DRY = process.argv.includes('--dry-run');

if (!fs.existsSync(SA)) {
  console.error('Missing serviceAccountKey.json at', SA);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(require(SA)) });
}
const db = admin.firestore();

async function main() {
  const snap = await db.collection('users').get();
  let grant = 0;
  let revoke = 0;
  let skip = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const groups = data.groups || [];
    const eligible = adv.hasAdvancedExpressionAccess(data);
    const hasAdv = adv.ADVANCED_EXPRESSION_GROUP_IDS.some((g) => groups.includes(g));

    if (eligible && !hasAdv) {
      grant++;
      console.log(`GRANT ${doc.id} ${data.email || data.name || ''}`);
      if (!DRY) {
        await doc.ref.update({
          groups: admin.firestore.FieldValue.arrayUnion(...adv.ADVANCED_EXPRESSION_GROUP_IDS),
          'progress.advancedExpressionUnlocked': true,
          'progress.advancedExpressionUnlockedAt': admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    } else if (!eligible && hasAdv && data.role !== 'admin' && !adv.isAdminGrantedElite(data)) {
      revoke++;
      console.log(`REVOKE ${doc.id} ${data.email || data.name || ''}`);
      if (!DRY) {
        await doc.ref.update({
          groups: groups.filter((g) => !adv.ADVANCED_EXPRESSION_GROUP_IDS.includes(g)),
        });
      }
    } else {
      skip++;
    }
  }

  console.log(`\nDone. grant=${grant} revoke=${revoke} skip=${skip} dryRun=${DRY}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
