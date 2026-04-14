// ================================================================
// SEED COMMUNITY STRUCTURE — Groups & Boards per Tier
// Aligned to SBD-ACADEMY-LEARNING-SYSTEM.md (April 2026)
//
// TIER → SCHOOL MAPPING:
//   Free        → Intro/welcome only, read access
//   Foundation  → School 1 (Teleios) + SBD For Dummies standalone
//   Premium     → Foundation + School 2 (Sexual Literacy)
//   Elite       → Premium + School 3 & 4 + AMTS + Virility advanced boards
//
// EXISTING ELITE BOARDS: Kept as-is (inside advanced-muliebrity-training-school)
// Two orphan groups fixed: The Marriage Project → premium, SBD-ADV Training → elite
// 4 zero/low-traffic AMTS boards archived (General Board, General, Organizational Skills, Sexual Hygiene)
// ================================================================

const admin = require('firebase-admin');
const path  = require('path');

const SA = path.resolve(__dirname, '../../serviceAccountKey.json');
if (!require('fs').existsSync(SA)) { console.error('❌ serviceAccountKey.json not found'); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(require(SA)) });
const db  = admin.firestore();
const now = admin.firestore.FieldValue.serverTimestamp();

// ----------------------------------------------------------------
// NEW GROUPS TO CREATE
// ----------------------------------------------------------------
const NEW_GROUPS = [
  // FREE
  {
    id: 'group-sbd-community',
    title: 'SBD Community',
    description: 'The general porch — introductions, open discussion, and your first steps into the SBD Network.',
    requiredTier: 'free',
    order: 1,
    icon: '🌱',
  },
  // FOUNDATION — School 1 + SBD Dummies
  {
    id: 'group-teleios-formation',
    title: 'Teleios Formation Circle',
    description: 'Week-by-week discussion for The Teleios Blueprint and all School 1 courses. Build wholeness together.',
    requiredTier: 'foundation',
    order: 2,
    icon: '🏗',
  },
  {
    id: 'group-sbd-dummies',
    title: 'SBD Dummies Study Hall',
    description: 'Discussion boards for Sex By Design For Dummies — the complete marriage handbook. All 13 weeks, chapter by chapter.',
    requiredTier: 'foundation',
    order: 3,
    icon: '📚',
  },
  // PREMIUM — School 2
  {
    id: 'group-sexual-literacy',
    title: 'Sexual Literacy & Conjugal Mastery Circle',
    description: 'Discussion space for School 2 — sexuality as lifestyle, conjugal mastery, seduction, and nakedness stewardship.',
    requiredTier: 'premium',
    order: 4,
    icon: '⚡',
  },
  // ELITE — School 3 & 4
  {
    id: 'group-marriage-systems',
    title: 'Marriage Systems & Fidelity',
    description: 'School 3 discussion — covenant governance, household management, conflict resolution, and the liturgies of one-flesh unity.',
    requiredTier: 'elite',
    order: 5,
    icon: '🟧',
  },
  {
    id: 'group-civilization-leadership',
    title: 'Civilization & Family Leadership',
    description: 'School 4 — marriage as civilizational infrastructure. Raising teleios children, generational legacy, and UDHR 16.',
    requiredTier: 'elite',
    order: 6,
    icon: '🟫',
  },
];

// ----------------------------------------------------------------
// NEW BOARDS TO CREATE
// ----------------------------------------------------------------
const NEW_BOARDS = [

  // ── FREE ──────────────────────────────────────────────────────
  {
    id: 'board-welcome',
    title: '👋 Welcome & Introductions',
    description: 'Introduce yourself. Where are you from, why are you here, what are you building?',
    groupId: 'group-sbd-community',
    requiredTier: 'free',
    order: 1,
  },
  {
    id: 'board-formation-talk',
    title: '💬 Formation Talk',
    description: 'Open discussion on personal development, wholeness, and covenant marriage — all welcome.',
    groupId: 'group-sbd-community',
    requiredTier: 'free',
    order: 2,
  },
  {
    id: 'board-ask-dr-achu',
    title: '❓ Ask Dr. Coach Achu',
    description: 'Submit one public question. Real answers from Dr. Coach Achu Gustave.',
    groupId: 'group-sbd-community',
    requiredTier: 'free',
    order: 3,
  },

  // ── FOUNDATION — Teleios / School 1 ──────────────────────────
  {
    id: 'board-teleios-weekly',
    title: '📖 The Teleios Blueprint — Week Discussion',
    description: 'Post your reflections, questions, and breakthroughs for each week of The Teleios Blueprint.',
    groupId: 'group-teleios-formation',
    requiredTier: 'foundation',
    order: 1,
  },
  {
    id: 'board-school1-deep-dive',
    title: '🧠 School 1 Deep Dive',
    description: 'Discussions covering Identity Mastery, The Four Faculties, Emotional Literacy, Temperament Intelligence, and all other School 1 programs.',
    groupId: 'group-teleios-formation',
    requiredTier: 'foundation',
    order: 2,
  },
  {
    id: 'board-wins-testimonials',
    title: '🏆 Wins & Testimonials',
    description: 'Document your breakthroughs. Real transformation stories from real members.',
    groupId: 'group-teleios-formation',
    requiredTier: 'foundation',
    order: 3,
  },
  {
    id: 'board-cohort-accountability',
    title: '🤝 Cohort Accountability',
    description: 'Partner up. Set weekly goals. Hold each other to formation standards.',
    groupId: 'group-teleios-formation',
    requiredTier: 'foundation',
    order: 4,
  },
  // Foundation — SBD Dummies Study Hall
  {
    id: 'board-sbd-dummies-chapters',
    title: '📘 Chapter-by-Chapter Discussion',
    description: 'Week-by-week breakdown of Sex By Design For Dummies — all 13 weeks. Post your notes, questions, and insights per chapter.',
    groupId: 'group-sbd-dummies',
    requiredTier: 'foundation',
    order: 1,
  },
  {
    id: 'board-sbd-dummies-questions',
    title: '🙋 SBD Dummies Q&A',
    description: 'Ask questions about the handbook content. Peer answers, Dr. Achu responses.',
    groupId: 'group-sbd-dummies',
    requiredTier: 'foundation',
    order: 2,
  },
  {
    id: 'board-sex-equals-marriage',
    title: '💍 Sex = Marriage Discussions',
    description: 'Deep discussion on the central thesis — the only equation that works. Based on Week 5 and School 2 crossover.',
    groupId: 'group-sbd-dummies',
    requiredTier: 'foundation',
    order: 3,
  },

  // ── PREMIUM — Sexual Literacy / School 2 ─────────────────────
  {
    id: 'board-sexual-literacy-discussion',
    title: '🧠 Sexual Literacy Discussion',
    description: 'Deeper course discussion for School 2 — sexuality as lifestyle, conjugal mastery, seduction, and nakedness stewardship.',
    groupId: 'group-sexual-literacy',
    requiredTier: 'premium',
    order: 1,
  },
  {
    id: 'board-marriage-psychology-lab',
    title: '⚡ Marriage Psychology Lab',
    description: 'Applied concepts from Art of Sexuality, Art of Seduction, Art of Nakedness, and the full Conjugal Intelligence MasterClass.',
    groupId: 'group-sexual-literacy',
    requiredTier: 'premium',
    order: 2,
  },
  {
    id: 'board-muliebrity-virility-expressions',
    title: '👑 Muliebrity & Virility Expressions',
    description: 'Discussion on Muliebrity Baron and Virility Baron concepts from SBD Dummies. Feminine excellence and masculine authority in practice.',
    groupId: 'group-sexual-literacy',
    requiredTier: 'premium',
    order: 3,
  },
  {
    id: 'board-conjugal-imagination',
    title: '🔥 Conjugal Imagination Workshop',
    description: 'For Sexual Imagination Course and advanced conjugal content. Imagination, arousal architecture, and covenantal intimacy.',
    groupId: 'group-sexual-literacy',
    requiredTier: 'premium',
    order: 4,
  },

  // ── ELITE — School 3: Marriage Systems & Fidelity ────────────
  {
    id: 'board-covenant-governance',
    title: '📐 Covenant Governance & Household Systems',
    description: 'Marriage System Design, Covenant Governance, and Household Management courses — applied discussion.',
    groupId: 'group-marriage-systems',
    requiredTier: 'elite',
    order: 1,
  },
  {
    id: 'board-fidelity-conflict',
    title: '🛡 Fidelity & Conflict Mastery',
    description: 'Fidelity Curriculum and Conflict Mastery course discussions. Hold the covenant when it costs something.',
    groupId: 'group-marriage-systems',
    requiredTier: 'elite',
    order: 2,
  },
  {
    id: 'board-daily-liturgies',
    title: '🕯 Daily Liturgies of Marriage',
    description: 'The daily practices that sustain one-flesh unity. Communication, rhythm, ritual, and the One-Flesh Intensive.',
    groupId: 'group-marriage-systems',
    requiredTier: 'elite',
    order: 3,
  },

  // ── ELITE — School 4: Civilization & Family Leadership ────────
  {
    id: 'board-marriage-builds-nations',
    title: '🌍 Marriage Builds Nations',
    description: 'Marriage as civilizational infrastructure. UDHR 16, political theology of home, and generational covenant.',
    groupId: 'group-civilization-leadership',
    requiredTier: 'elite',
    order: 1,
  },
  {
    id: 'board-raising-teleios-children',
    title: '👶 Raising Teleios Children',
    description: 'Parenting through teleios principles. Raising sons and daughters through sexual literacy and civilizational purpose.',
    groupId: 'group-civilization-leadership',
    requiredTier: 'elite',
    order: 2,
  },
  {
    id: 'board-family-legacy',
    title: '🏛 Family Culture & Legacy',
    description: 'Family Systems Architecture, Family Culture & Human Flourishing, and Civilizational Intelligence Masterclass discussions.',
    groupId: 'group-civilization-leadership',
    requiredTier: 'elite',
    order: 3,
  },
];

// ----------------------------------------------------------------
// EXISTING GROUPS TO FIX (set tier on orphan groups)
// ----------------------------------------------------------------
const GROUP_TIER_FIXES = [
  { id: 'CYUhNHqGvf7bhVIR6D13', requiredTier: 'premium', title: 'The Marriage Project' },
  { id: 'z8lmnHLoFUBBZaRp2Vdd', requiredTier: 'elite',   title: 'SBD-ADV Training' },
];

// ----------------------------------------------------------------
// EXISTING BOARDS TO ARCHIVE (zero/negligible traffic, duplicates)
// ----------------------------------------------------------------
const BOARDS_TO_ARCHIVE = [
  // exact titles from Firestore — these are confirmed 0-post duplicates
  { title: 'General Board',         groupId: 'advanced-muliebrity-training-school' },
  { title: 'General',               groupId: 'advanced-muliebrity-training-school' },
  { title: 'Organizational Skills', groupId: 'advanced-muliebrity-training-school' },
  { title: 'Sexual Hygiene et al',  groupId: 'advanced-muliebrity-training-school' },
];

// ================================================================
// EXECUTION
// ================================================================
async function run() {
  console.log('\n📋 SBD Community Seed — Tier-Aligned Board Structure\n');
  const batch = db.batch();
  let ops = 0;

  // 1. Create new groups
  console.log('── Creating new groups ──────────────────────────────');
  for (const g of NEW_GROUPS) {
    const ref = db.collection('groups').doc(g.id);
    const snap = await ref.get();
    if (snap.exists) {
      console.log(`  [SKIP] Group already exists: ${g.title}`);
    } else {
      batch.set(ref, { ...g, archived: false, createdAt: now });
      console.log(`  [CREATE] [${g.requiredTier}] ${g.title}`);
      ops++;
    }
  }

  // 2. Create new boards
  console.log('\n── Creating new boards ──────────────────────────────');
  for (const b of NEW_BOARDS) {
    const ref = db.collection('boards').doc(b.id);
    const snap = await ref.get();
    if (snap.exists) {
      console.log(`  [SKIP] Board already exists: ${b.title}`);
    } else {
      batch.set(ref, { ...b, archived: false, postCount: 0, createdAt: now });
      console.log(`  [CREATE] [${b.requiredTier}] ${b.title}`);
      ops++;
    }
  }

  // 3. Fix orphan groups
  console.log('\n── Fixing orphan group tiers ────────────────────────');
  for (const fix of GROUP_TIER_FIXES) {
    const ref = db.collection('groups').doc(fix.id);
    batch.update(ref, { requiredTier: fix.requiredTier });
    console.log(`  [FIX] ${fix.title} → requiredTier: ${fix.requiredTier}`);
    ops++;
  }

  // Commit batch
  if (ops > 0) {
    await batch.commit();
    console.log(`\n✅ Batch committed: ${ops} operations`);
  } else {
    console.log('\n⚠️  Nothing new to create.');
  }

  // 4. Archive low-traffic boards (separate — need to find by title)
  console.log('\n── Archiving low-traffic boards ─────────────────────');
  const archiveSnap = await db.collection('boards')
    .where('groupId', '==', 'advanced-muliebrity-training-school')
    .get();

  const archiveBatch = db.batch();
  let archived = 0;
  archiveSnap.docs.forEach(doc => {
    const data = doc.data();
    const shouldArchive = BOARDS_TO_ARCHIVE.some(a => a.title === data.title && a.groupId === data.groupId);
    if (shouldArchive) {
      archiveBatch.update(doc.ref, { archived: true });
      console.log(`  [ARCHIVE] ${data.title} (${data.postCount || 0} posts)`);
      archived++;
    }
  });

  if (archived > 0) {
    await archiveBatch.commit();
    console.log(`\n✅ Archived ${archived} boards`);
  } else {
    console.log('  No boards to archive (may already be archived)');
  }

  // 5. Summary
  console.log('\n══════════════════════════════════════════════════════');
  console.log('COMMUNITY STRUCTURE SUMMARY');
  console.log('──────────────────────────────────────────────────────');
  console.log('FREE       → SBD Community (3 boards: Welcome, Formation Talk, Ask Dr. Achu)');
  console.log('FOUNDATION → Teleios Formation Circle (4 boards)');
  console.log('           → SBD Dummies Study Hall (3 boards)');
  console.log('PREMIUM    → Sexual Literacy & Conjugal Mastery Circle (4 boards)');
  console.log('ELITE      → Marriage Systems & Fidelity (3 boards)');
  console.log('           → Civilization & Family Leadership (3 boards)');
  console.log('           → Advanced Muliebrity Training School (all existing boards, KEPT)');
  console.log('           → Virility, Sexual Mastery, Marriage Systems (existing elite groups)');
  console.log('══════════════════════════════════════════════════════\n');

  process.exit(0);
}

run().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
