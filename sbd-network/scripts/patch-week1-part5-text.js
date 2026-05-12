/**
 * Patch: correct the "Cameroon and beyond" phrase in teleios-week-1 part-5
 * Old: "...across Cameroon and beyond."
 * New: "...across your community and the world."
 */
const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

const svc = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../serviceAccountKey.json'), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();

async function run() {
  const ref  = db.collection('modules').doc('teleios-week-1');
  const snap = await ref.get();

  if (!snap.exists) {
    console.error('❌ modules/teleios-week-1 not found');
    process.exit(1);
  }

  const data  = snap.data();
  const parts = data.parts || [];

  let patched = false;
  const OLD   = 'across Cameroon and beyond';
  const NEW   = 'across your community and the world';

  const updatedParts = parts.map(part => {
    if (part.id === 'part-5' && part.content && part.content.includes(OLD)) {
      patched = true;
      return { ...part, content: part.content.replaceAll(OLD, NEW) };
    }
    return part;
  });

  if (!patched) {
    console.log('⚠️  Phrase not found in part-5 — already corrected or wrong part ID.');
    process.exit(0);
  }

  await ref.update({ parts: updatedParts });
  console.log('✅ Patched: teleios-week-1 / part-5 — "Cameroon and beyond" → "your community and the world"');
  process.exit(0);
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
