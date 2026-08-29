/**
 * Smoke test for admin communication recipient resolution (no send).
 * Usage: node functions/test-admin-communication.js [recipientType]
 */

const admin = require('firebase-admin');
const { resolveRecipients, RECIPIENT_LABELS } = require('./admin-communication');

async function main() {
  const recipientType = process.argv[2] || 'rds';

  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();

  const recipients = await resolveRecipients(db, recipientType);
  console.log(`Audience: ${RECIPIENT_LABELS[recipientType] || recipientType}`);
  console.log(`Recipients found: ${recipients.length}`);
  recipients.slice(0, 10).forEach((r) => {
    console.log(`  - ${r.email} (${r.name}) [${r.sourceType}:${r.sourceId}]`);
  });
  if (recipients.length > 10) {
    console.log(`  ... and ${recipients.length - 10} more`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
