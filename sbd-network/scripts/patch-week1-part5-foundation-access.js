/**
 * Patch: Replace "What Is Marriage Foundation Access?" section in teleios-week-1 part-5
 */
const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

const svc = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../serviceAccountKey.json'), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();

const OLD = `## What Is Marriage Foundation Access?

Marriage Foundation Access is the democratization of marriage literacy.

For too long, covenant-grade marriage education has been:

- **Expensive** — accessible only to the wealthy
- **Western-centric** — ignoring African contexts
- **Church-exclusive** — missing those outside religious communities
- **Theory-heavy** — disconnected from daily life

Marriage Foundation Access changes this through:

- **Affordability:** Books, courses, and schools priced for African incomes
- **Contextualization:** Content rooted in African realities while maintaining biblical foundations
- **Accessibility:** Multiple pathways — free, sponsored, community-based
- **Practicality:** Tools, not just theory`;

const NEW = `## What Is Marriage Foundation Access?

Marriage Foundation Access is the removal of barriers to structured marriage intelligence.

For too long, covenant-grade marriage formation has been:

- **Fragmented** — scattered across books, traditions, and unstructured teaching
- **Inconsistent** — shaped by culture rather than grounded in design
- **Restricted** — limited by cost, access, or institutional boundaries
- **Theoretical** — lacking practical application in daily life

Marriage Foundation Access changes this by providing:

- **Structured Access** — a clear, progressive system for understanding marriage
- **Universal Relevance** — grounded in human design, not geography or culture
- **Accessibility** — multiple entry points (free, guided, and advanced)
- **Application** — tools that translate directly into lived experience`;

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

  const updatedParts = parts.map(part => {
    if (part.id === 'part-5' && part.content && part.content.includes('democratization of marriage literacy')) {
      patched = true;
      return { ...part, content: part.content.replace(OLD, NEW) };
    }
    return part;
  });

  if (!patched) {
    console.log('⚠️  Section not found in part-5 — may already be updated.');
    process.exit(0);
  }

  await ref.update({ parts: updatedParts });
  console.log('✅ Patched: teleios-week-1 / part-5 — "What Is Marriage Foundation Access?" section updated');
  process.exit(0);
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
