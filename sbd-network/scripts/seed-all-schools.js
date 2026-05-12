/**
 * seed-all-schools.js
 * =====================================================================
 * Seeds ALL 44 courses + modules for Schools 1–4.
 * Also:
 *   • Fixes Teleios Blueprint tier (weeks 4-6 → foundation, not premium)
 *   • Fixes schools 3 & 4 unlockTier → 'elite' in Firestore
 *   • Updates SBD For Dummies module tier (all 13 weeks → foundation)
 *
 * Run:
 *   node scripts/seed-all-schools.js              (seed everything)
 *   node scripts/seed-all-schools.js --school 2   (seed only School 2)
 *   node scripts/seed-all-schools.js --dry-run     (log only, no writes)
 *
 * Canonical source:
 *   Course titles/durations/prices → /Documents/Marriageducation/schoolcourses.json
 *   School 1 module titles         → /Documents/Marriageducation/courses-catalogue.json
 *   Schools 2-4 module titles      → defined inline below
 *   Access control rules           → /sbd-network/public/js/tier-access.js
 *
 * Tier matrix (canonical April 13 2026):
 *   School 1  → accessLevel: 'foundation'  drip: true  (Elite bypasses drip)
 *   School 2  → accessLevel: 'premium'     drip: true  (Elite bypasses drip)
 *   School 3  → accessLevel: 'elite'       drip: false (instant access)
 *   School 4  → accessLevel: 'elite'       drip: false (instant access)
 * =====================================================================
 */
'use strict';

const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const SA = path.resolve(__dirname, '../../serviceAccountKey.json');
if (!fs.existsSync(SA)) {
  console.error('❌  serviceAccountKey.json not found:', SA);
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(require(SA)) });
const db = admin.firestore();

const DRY_RUN     = process.argv.includes('--dry-run');
const ONLY_SCHOOL = (() => {
  const idx = process.argv.indexOf('--school');
  return idx !== -1 ? parseInt(process.argv[idx + 1], 10) : null;
})();

if (DRY_RUN)     console.log('🔍  DRY RUN — no writes will occur\n');
if (ONLY_SCHOOL) console.log(`📚  Seeding School ${ONLY_SCHOOL} only\n`);

// ── Load source data ──────────────────────────────────────────────────────────
const CATALOGUE_PATH    = path.resolve(__dirname, '../../courses-catalogue.json');
const SCHOOLCOURSES_PATH = path.resolve(__dirname, '../../schoolcourses.json');

if (!fs.existsSync(CATALOGUE_PATH)) {
  console.error('❌  courses-catalogue.json not found:', CATALOGUE_PATH);
  process.exit(1);
}
if (!fs.existsSync(SCHOOLCOURSES_PATH)) {
  console.error('❌  schoolcourses.json not found:', SCHOOLCOURSES_PATH);
  process.exit(1);
}

const catalogue    = JSON.parse(fs.readFileSync(CATALOGUE_PATH, 'utf8'));
const schoolCourses = JSON.parse(fs.readFileSync(SCHOOLCOURSES_PATH, 'utf8'));
const catMap = {};
catalogue.forEach(c => { catMap[c.courseId] = c; });

// ── Helpers ───────────────────────────────────────────────────────────────────
const TS = admin.firestore.FieldValue.serverTimestamp;

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
}

function weeksFromDuration(dur) {
  const m = String(dur).match(/(\d+)\s*week/i);
  if (m) return parseInt(m[1], 10);
  // 90 minutes, 2 hours → 1 module session
  if (/hour|minute/i.test(dur)) return 1;
  return 4;
}

// ── School 1 — canonical courseIds (from tier-access.js SCHOOL_1_SEQUENCE) ───
const SCHOOL_1_IDS = [
  'course-1-the-teleios-blueprint-full-human-maturity',
  'course-2-the-anthropology-of-wholeness-becoming-fully-human',
  'course-3-identity-mastery-understanding-image-likeness-human-design',
  'course-4-the-four-faculties-training',
  'course-5-anthropocentric-development-how-humans-grow',
  'course-6-the-personal-development-masterclass',
  'course-7-the-science-of-self-command',
  'course-8-the-heart-of-relationship-level-1',
  'course-9-relationship-relatednesses-level-2',
  'course-10-relationship-mastery-intensive-level-3',
  'course-11-the-perfect-self-program-practicing-from-perfection',
  'course-12-emotional-literacy-for-couples-singles',
  'course-13-temperament-intelligence-for-marriage',
];

// Catalogue keys aligned to SCHOOL_1_IDS (index 0 = course 1, etc.)
const SCHOOL_1_CAT_KEYS = [
  'teleios-blueprint',
  'anthropology-wholeness',
  'identity-mastery',
  'four-faculties-training',
  'anthropocentric-development',
  'personal-development-masterclass',
  'science-of-self-command',
  'heart-of-relationship-l1',
  'relationship-relatednesses-l2',
  'relationship-mastery-intensive-l3',
  'perfect-self-program',
  'emotional-literacy',
  'temperament-intelligence',
];

// ── School 2 — module titles (not in catalogue) ───────────────────────────────
// courseNo → array of week titles
const SCHOOL_2_MODULES = {
  14: [ // Sexual Literacy 101 — 90 minutes (1 session)
    'Session 1: What Is Sexual Literacy? — An Introduction to Sex By Design',
  ],
  15: [ // Sex = Marriage: The Only Equation That Works — 8 weeks
    'Week 1: The Only Equation That Works — Introduction',
    'Week 2: What Is Sex? The Design Question',
    'Week 3: What Is Marriage? The Covenant Structure',
    'Week 4: Why the Equation Works — Theological Foundations',
    'Week 5: When the Equation Is Broken — Cultural Analysis',
    'Week 6: Restoring the Equation in Your Marriage',
    'Week 7: Living the Equation — Daily Practice',
    'Week 8: Sex = Marriage Mastery Assessment',
  ],
  16: [ // The Anatomy of Desire — 2 hours (2 sessions)
    'Session 1: The Design of Desire — An Introduction',
    'Session 2: Your Desire Map — Personal Assessment',
  ],
  17: [ // The Sexual Self — 4 weeks
    'Week 1: Who Are You Sexually? — Self-Discovery',
    'Week 2: Understanding Your Sexual Blueprint',
    'Week 3: Aligning Your Sexual Self with Covenant',
    'Week 4: Your Sexual Identity in Marriage',
  ],
  18: [ // The Art of Sexuality — 8 weeks
    'Week 1: Sexuality as a Lifestyle, Not an Act',
    'Week 2: The Language of the Body',
    'Week 3: Covenant Aesthetics — Beauty & Design',
    'Week 4: Arousal & Desire Architecture',
    'Week 5: Intimacy Rhythms & Seasons',
    'Week 6: The Masculine & Feminine Sexual Dynamic',
    'Week 7: Advanced Sexual Arts',
    'Week 8: Art of Sexuality — Integration & Mastery',
  ],
  19: [ // The Art of Seduction — 6 weeks
    'Week 1: Seduction Defined — Covenant vs. Counterfeit',
    'Week 2: The Seductive Lifestyle',
    'Week 3: Physical Seduction — Presence & Aesthetics',
    'Week 4: Emotional & Psychological Seduction',
    'Week 5: The Long Game — Sustaining Attraction in Marriage',
    'Week 6: Seduction Mastery in Marriage',
  ],
  20: [ // The Art of Nakedness — 5 weeks
    'Week 1: Nakedness as Covenant — Theology of the Body',
    'Week 2: Stewardship of the Body',
    'Week 3: The Aesthetic of Muliebrity',
    'Week 4: The Aesthetic of Virility',
    'Week 5: Nakedness as a Daily Practice',
  ],
  21: [ // The Sexual Imagination Course — 6 weeks
    'Week 1: What Is Sanctified Sexual Imagination?',
    'Week 2: Pics & Pearls — Covenant vs. Counterfeit Imagery',
    'Week 3: Building a Holy Sexual Imagination',
    'Week 4: Visual Stewardship & Protection',
    'Week 5: The Covenant Imagination in Practice',
    'Week 6: Sexual Imagination Mastery',
  ],
  22: [ // The Conjugal Intelligence MasterClass — 12 weeks
    'Week 1: What Is Conjugal Intelligence?',
    'Week 2: Emotional Attunement in Marriage',
    'Week 3: Sexual Communication',
    'Week 4: Desire & Arousal Mastery',
    'Week 5: The Body as Communication',
    'Week 6: Covenant Intimacy Architecture',
    'Week 7: Advanced Conjugal Practice',
    'Week 8: Conjugal Leadership (Virility)',
    'Week 9: Conjugal Receptivity (Muliebrity)',
    'Week 10: Sustaining Conjugal Excellence',
    'Week 11: Repair & Renewal',
    'Week 12: Conjugal Intelligence Certification',
  ],
  23: [ // The Arousal Mastery Program — 6 weeks
    'Week 1: The Science & Theology of Arousal',
    'Week 2: Understanding Your Arousal Architecture',
    'Week 3: Initiating & Sustaining Arousal',
    'Week 4: Arousal for Her',
    'Week 5: Arousal for Him',
    'Week 6: Mutual Arousal Mastery',
  ],
  24: [ // The Art of Fucking — 6 weeks (covenant sexual union course)
    'Week 1: The Theology of Conjugal Union',
    'Week 2: Physical Intimacy as Covenant Language',
    'Week 3: Advanced Intimate Communication',
    'Week 4: The One-Flesh Act — Design & Practice',
    'Week 5: Covenant Sexual Creativity',
    'Week 6: Conjugal Union Mastery',
  ],
  25: [ // Erotic Devotion: The Song of Solomon Program — 8 weeks
    'Week 1: The Song of Solomon — An Introduction',
    'Week 2: Desire & Longing in Covenant',
    'Week 3: The Language of Erotic Love in Scripture',
    'Week 4: Covenant Eros — What Is Permitted',
    'Week 5: The Shulamite Woman — Muliebrity Studies',
    "Week 6: Solomon's Pursuit — Virility Studies",
    'Week 7: Applying the Song to Your Marriage',
    'Week 8: Erotic Devotion Mastery',
  ],
  26: [ // Nakedness Stewardship & Fashion House (Muliebrity Edition) — 6 weeks
    'Week 1: Introduction to Muliebrity Fashion',
    'Week 2: The Body as Covenant Asset',
    "Week 3: Dressing for Your Husband's Eyes",
    'Week 4: The Muliebrity Wardrobe System',
    'Week 5: Public vs. Covenant Expression',
    'Week 6: Muliebrity Fashion Mastery',
  ],
  27: [ // Nakedness Stewardship & Authority (Virility Edition) — 6 weeks
    'Week 1: Introduction to Virility Aesthetics',
    'Week 2: The Male Body as Covenant Authority',
    'Week 3: Grooming & Presentation',
    'Week 4: The Virility Wardrobe System',
    'Week 5: Physical Authority in Practice',
    'Week 6: Virility Aesthetics Mastery',
  ],
  28: [ // Bedroom Governance & Sexual Responsibility Training — 5 weeks
    'Week 1: What Is Bedroom Governance?',
    'Week 2: Sexual Leadership & Responsibility in Covenant',
    'Week 3: Boundaries, Consent & Covenant Rights',
    'Week 4: Sexual Accountability in Marriage',
    'Week 5: Bedroom Governance Mastery',
  ],
};

// ── School 3 — Marriage Systems (Elite) ──────────────────────────────────────
const SCHOOL_3_MODULES = {
  29: [ // Marriage System Design — 6 weeks
    'Week 1: What Is a Marriage System?',
    'Week 2: Covenant Architecture — Roles, Rules & Rhythms',
    'Week 3: The Governance Hierarchy',
    'Week 4: Systems That Sustain Intimacy',
    'Week 5: Conflict & Failure Recovery Systems',
    'Week 6: Building Your Personalized Marriage System',
  ],
  30: [ // Covenant Governance — 6 weeks
    "Week 1: Headship & Submission — God's Design",
    'Week 2: Decision-Making in Covenant',
    'Week 3: Authority & Accountability Structures',
    'Week 4: Financial Governance',
    'Week 5: Household Order & Rule-Making',
    'Week 6: Leading Your Family With Grace',
  ],
  31: [ // The Fidelity Curriculum — 8 weeks
    'Week 1: What Fidelity Actually Means',
    'Week 2: The Physiology of Attraction & Temptation',
    'Week 3: Emotional Fidelity — Protecting the Heart',
    'Week 4: Digital Fidelity — Screens, Boundaries & Covenant',
    'Week 5: Sexual Fidelity — Exclusive Covenant Practice',
    'Week 6: Rebuilding After Infidelity',
    'Week 7: Fidelity as Spiritual Discipline',
    'Week 8: The Unbreakable Covenant Pledge',
  ],
  32: [ // Communication for Covenant Couples — 5 weeks
    'Week 1: The Language of Covenant',
    'Week 2: Active Listening & Reflection',
    'Week 3: Difficult Conversations',
    'Week 4: Non-Verbal Communication & Presence',
    'Week 5: Communication Mastery Integration',
  ],
  33: [ // Conflict Mastery & Marital Peacekeeping — 4 weeks
    'Week 1: Understanding Conflict Patterns',
    'Week 2: De-escalation Techniques',
    'Week 3: Productive Disagreement',
    'Week 4: Repair, Forgiveness & Restoration',
  ],
  34: [ // The Household Management Program — 5 weeks
    'Week 1: The Home as Sacred Space',
    'Week 2: Financial Systems & Stewardship',
    'Week 3: Time & Schedule Management',
    'Week 4: Division of Household Roles',
    'Week 5: Household Systems Review',
  ],
  35: [ // The Daily Liturgies of Marriage — 4 weeks
    'Week 1: Why Couples Need Rituals',
    'Week 2: Morning & Evening Covenant Rituals',
    'Week 3: Sacred Intimacy Practices',
    'Week 4: Annual & Seasonal Marriage Rhythms',
  ],
  36: [ // The One-Flesh Intensive — 6 weeks
    'Week 1: One-Flesh Theology',
    'Week 2: Physical Unity & Presence',
    'Week 3: Spiritual Unity & Prayer',
    'Week 4: Emotional Fusion & Safety',
    'Week 5: Sexual One-Flesh Practice',
    'Week 6: Living as One Flesh Daily',
  ],
};

// ── School 4 — Civilization & Family Leadership (Elite) ──────────────────────
const SCHOOL_4_MODULES = {
  37: [ // Marriage Builds Nations — 8 weeks
    'Week 1: The Civilizational Purpose of Marriage',
    "Week 2: UDHR Article 16 — The Family as Society's Foundation",
    'Week 3: How Families Shape Culture',
    'Week 4: Marriage & Economic Stability',
    'Week 5: Marriage & Political Order',
    'Week 6: The Marriage Crisis & Civilizational Decline',
    'Week 7: Rebuilding Civilizational Marriage',
    'Week 8: Your Marriage as Nation-Building',
  ],
  38: [ // The Political Theology of Home — 6 weeks
    'Week 1: Authority Begins at Home',
    'Week 2: The Home as Political Unit',
    'Week 3: Biblical Household Codes',
    'Week 4: The Public Witness of Marriage',
    'Week 5: Church, State & Family',
    'Week 6: Living the Political Theology of Home',
  ],
  39: [ // Family Systems Architecture — 6 weeks
    'Week 1: What Is Family Architecture?',
    'Week 2: Identity, Mission & Vision',
    'Week 3: Family Governance Structures',
    'Week 4: Communication Systems',
    'Week 5: Financial & Legacy Architecture',
    'Week 6: Your Family Blueprint',
  ],
  40: [ // Parenting Through Teleios Principles — 8 weeks
    'Week 1: The Teleios Parent',
    'Week 2: Identity Formation in Children',
    'Week 3: Age-Appropriate Development',
    'Week 4: Discipline & Formation',
    'Week 5: Emotional Parenting',
    'Week 6: Sexual Education in the Home',
    'Week 7: Faith & Covenant Formation',
    'Week 8: Raising Teleios Adults',
  ],
  41: [ // Raising Sons & Daughters Through Sexual Literacy — 6 weeks
    'Week 1: What Children Need to Know & When',
    'Week 2: Teaching Boys Sexual Identity & Virility',
    'Week 3: Teaching Girls Sexual Identity & Muliebrity',
    'Week 4: Age-Appropriate Sexual Education',
    'Week 5: Protecting Children from Sexual Harm',
    'Week 6: The Family as Sexual Literacy School',
  ],
  42: [ // Family Culture & Human Flourishing Program — 5 weeks
    'Week 1: What Is Family Culture?',
    'Week 2: Creating Covenant Family Traditions',
    'Week 3: Language, Story & Identity',
    'Week 4: Family Culture & Human Flourishing',
    'Week 5: Documenting & Passing On Your Family Legacy',
  ],
  43: [ // The Civilizational Intelligence Masterclass — 10 weeks
    'Week 1: Civilizational Intelligence Defined',
    'Week 2: Marriage in World History',
    'Week 3: The Sexual Revolution & Its Consequences',
    'Week 4: Family Structure & Social Outcomes',
    'Week 5: Demographic Crisis & Covenant Marriage',
    'Week 6: Economic Analysis of Family Structure',
    'Week 7: Legal & Political Frameworks',
    'Week 8: Church & Cultural Renewal',
    'Week 9: The New Civilizational Architecture',
    'Week 10: Your Civilizational Assignment',
  ],
  44: [ // Human Rights & Marriage (UDHR 16 Curriculum) — 4 weeks
    'Week 1: UDHR Article 16 in Full',
    'Week 2: Marriage as a Human Right — The Philosophical Case',
    'Week 3: Legal Threats to Covenant Marriage',
    'Week 4: Advocacy & Protection of Marriage Rights',
  ],
};

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  let totalCourses = 0;
  let totalModules = 0;

  // We'll use multiple batches (Firestore limit: 500 ops per batch)
  const batches = [];
  let currentBatch = db.batch();
  let currentBatchOps = 0;

  function queueSet(ref, data, options = {}) {
    if (currentBatchOps >= 400) {
      batches.push(currentBatch);
      currentBatch = db.batch();
      currentBatchOps = 0;
    }
    if (options.merge) {
      currentBatch.set(ref, data, { merge: true });
    } else {
      currentBatch.set(ref, data);
    }
    currentBatchOps++;
  }

  async function commitAll() {
    batches.push(currentBatch);
    if (DRY_RUN) {
      console.log(`\n🔍  Would commit ${batches.length} batch(es)`);
      return;
    }
    for (let i = 0; i < batches.length; i++) {
      await batches[i].commit();
      console.log(`   ✅  Batch ${i + 1}/${batches.length} committed`);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // STEP 1 — Fix schools 3 & 4 unlockTier → 'elite'
  // ────────────────────────────────────────────────────────────────────────────
  console.log('🏛️  STEP 1: Fixing schools 3 & 4 unlockTier → elite\n');
  ['school-3-marriage-systems', 'school-4-civilization-leadership'].forEach(schoolId => {
    const ref = db.collection('schools').doc(schoolId);
    queueSet(ref, { unlockTier: 'elite', updatedAt: TS() }, { merge: true });
    console.log(`   ✓ ${schoolId} → unlockTier: 'elite'`);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // STEP 2 — Fix Teleios Blueprint modules (weeks 4-6 → foundation)
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n📘 STEP 2: Fixing Teleios Blueprint — all 6 weeks → foundation tier\n');
  const catTeleios = catMap['teleios-blueprint'];
  for (let wk = 1; wk <= 6; wk++) {
    const mod = catTeleios?.modules?.[wk - 1];
    const ref = db.collection('modules').doc(`teleios-week-${wk}`);
    const data = {
      id:           `teleios-week-${wk}`,
      courseId:     'course-1-the-teleios-blueprint-full-human-maturity',
      schoolId:     'school-1-teleios',
      week:          wk,
      title:         mod ? mod.title : `Week ${wk}: The Teleios Blueprint`,
      content:       mod ? (mod.content || `# Week ${wk}\n\nContent from The Teleios Blueprint.`) : `# Week ${wk}\n\nContent from The Teleios Blueprint.`,
      duration:      '8-10 hours',
      accessLevel:   'foundation',
      unlockTier:    'foundation',
      requiredTier:  'foundation',
      isLocked:      false,
      lockMessage:   null,
      order:          wk,
      reflectionQuestions: mod?.reflection_questions || [],
      downloads:           mod?.downloads || [],
      createdAt:     TS(),
      updatedAt:     TS(),
    };
    queueSet(ref, data);
    console.log(`   ✓ teleios-week-${wk}: "${data.title.substring(0, 55)}" [foundation]`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // STEP 3 — Fix SBD For Dummies modules (all 13 weeks → foundation)
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n📗 STEP 3: Fixing SBD For Dummies — all 13 weeks → foundation tier\n');
  const catSBD = catMap['sex-by-design-for-dummies'];
  for (let wk = 1; wk <= 13; wk++) {
    const mod = catSBD?.modules?.[wk - 1];
    const ref = db.collection('modules').doc(`sbd-week-${wk}`);
    const data = {
      id:           `sbd-week-${wk}`,
      courseId:     'sex-by-design-for-dummies',
      schoolId:     'standalone',
      week:          wk,
      title:         mod ? mod.title : `Week ${wk}: SBD For Dummies`,
      content:       mod ? (mod.content || `# Week ${wk}\n\nContent from Sex By Design For Dummies.`) : `# Week ${wk}\n\nContent from Sex By Design For Dummies.`,
      duration:      '6-8 hours',
      accessLevel:   'foundation',
      unlockTier:    'foundation',
      requiredTier:  'foundation',
      isLocked:      false,
      lockMessage:   null,
      order:          wk,
      reflectionQuestions: mod?.reflection_questions || [],
      downloads:           mod?.downloads || [],
      createdAt:     TS(),
      updatedAt:     TS(),
    };
    queueSet(ref, data);
    console.log(`   ✓ sbd-week-${wk}: "${data.title.substring(0, 55)}" [foundation]`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // STEP 4 — Seed courses collection (all 44)
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n📋 STEP 4: Seeding courses collection (all 44 courses)\n');

  const schoolIdMap = {
    1: 'school-1-teleios',
    2: 'school-2-sexual-literacy',
    3: 'school-3-marriage-systems',
    4: 'school-4-civilization-leadership',
  };
  const accessLevelMap = { 1: 'foundation', 2: 'premium', 3: 'elite', 4: 'elite' };
  const dripMap        = { 1: true, 2: true, 3: false, 4: false };

  schoolCourses.forEach((course, globalIdx) => {
    const schoolNo  = course.school;
    const courseNo  = course.no;
    const schoolOrder = courseNo - (schoolNo === 1 ? 0 : schoolNo === 2 ? 13 : schoolNo === 3 ? 28 : 36);
    const weeks     = weeksFromDuration(course.duration);

    // Use canonical IDs for School 1, generate for Schools 2-4
    let cId;
    if (schoolNo === 1) {
      cId = SCHOOL_1_IDS[courseNo - 1];
    } else {
      cId = `course-${courseNo}-${slugify(course.title)}`;
    }

    const accessLevel = accessLevelMap[schoolNo];
    const data = {
      id:           cId,
      title:         course.title,
      schoolId:      schoolIdMap[schoolNo],
      schoolNo:      schoolNo,
      order:          schoolOrder,
      globalOrder:   courseNo,
      weeks,
      duration:      course.duration,
      price:          course.price_usd,
      badge:          course.badge || null,
      accessLevel,
      unlockTier:    accessLevel,
      drip:           dripMap[schoolNo],
      description:   '',
      createdAt:     TS(),
      updatedAt:     TS(),
    };

    const ref = db.collection('courses').doc(cId);
    queueSet(ref, data);
    totalCourses++;
    console.log(`   ✓ [S${schoolNo}] course-${courseNo}: "${course.title.substring(0, 50)}" (${course.duration}, $${course.price_usd}) [${accessLevel}]`);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // STEP 5 — Seed modules: School 1 (courses 1-13 from catalogue)
  // ────────────────────────────────────────────────────────────────────────────
  if (!ONLY_SCHOOL || ONLY_SCHOOL === 1) {
    console.log('\n🟦 STEP 5: Seeding School 1 modules (from courses-catalogue.json)\n');

    SCHOOL_1_CAT_KEYS.forEach((catKey, idx) => {
      const courseNo   = idx + 1;
      const cId        = SCHOOL_1_IDS[idx];
      const catCourse  = catMap[catKey];

      if (!catCourse) {
        console.warn(`   ⚠️  No catalogue entry for ${catKey} — skipping`);
        return;
      }

      // Skip course 1 — already handled in STEP 2 (Teleios Blueprint)
      if (courseNo === 1) {
        console.log(`   ↩️  course-1 (Teleios Blueprint) already seeded in STEP 2`);
        return;
      }

      const modules = catCourse.modules || [];
      modules.forEach((mod, modIdx) => {
        const wk     = modIdx + 1;
        const modId  = `${catKey}-week-${wk}`;
        const ref    = db.collection('modules').doc(modId);

        const data = {
          id:           modId,
          courseId:      cId,
          schoolId:      'school-1-teleios',
          week:           wk,
          title:          mod.title || `Week ${wk}`,
          content:        mod.content || `# Week ${wk}: ${mod.title}\n\nModule content from The Teleios School.`,
          duration:       '7-9 hours',
          accessLevel:    'foundation',
          unlockTier:     'foundation',
          requiredTier:   'foundation',
          isLocked:       false,
          lockMessage:    null,
          order:           wk,
          reflectionQuestions: mod.reflection_questions || [],
          downloads:           mod.downloads || [],
          createdAt:     TS(),
          updatedAt:     TS(),
        };

        queueSet(ref, data);
        totalModules++;
        console.log(`   ✓ ${modId}: "${mod.title.substring(0, 55)}" [foundation]`);
      });
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // STEP 6 — Seed modules: School 2 (courses 14-28)
  // ────────────────────────────────────────────────────────────────────────────
  if (!ONLY_SCHOOL || ONLY_SCHOOL === 2) {
    console.log('\n🟩 STEP 6: Seeding School 2 modules (Sexual Literacy)\n');

    // Collect School 2 courses from schoolcourses.json (school === 2)
    const s2Courses = schoolCourses.filter(c => c.school === 2);

    s2Courses.forEach(course => {
      const courseNo   = course.no;
      const weeks      = weeksFromDuration(course.duration);
      const cId        = `course-${courseNo}-${slugify(course.title)}`;
      const moduleTitles = SCHOOL_2_MODULES[courseNo];

      if (!moduleTitles) {
        console.warn(`   ⚠️  No module titles defined for course ${courseNo} — skipping modules`);
        return;
      }

      moduleTitles.forEach((title, modIdx) => {
        const wk    = modIdx + 1;
        const modId = `course-${courseNo}-week-${wk}`;
        const ref   = db.collection('modules').doc(modId);

        const data = {
          id:           modId,
          courseId:      cId,
          schoolId:      'school-2-sexual-literacy',
          week:           wk,
          title,
          content:       `# ${title}\n\nModule content — ${course.title}.`,
          duration:       wk === 1 && weeks === 1 ? course.duration : '7-9 hours',
          accessLevel:    'premium',
          unlockTier:     'premium',
          requiredTier:   'premium',
          isLocked:       false,
          lockMessage:    null,
          order:           wk,
          reflectionQuestions: [],
          downloads:           [],
          createdAt:     TS(),
          updatedAt:     TS(),
        };

        queueSet(ref, data);
        totalModules++;
        console.log(`   ✓ ${modId}: "${title.substring(0, 55)}" [premium]`);
      });
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // STEP 7 — Seed modules: School 3 (courses 29-36, Elite)
  // ────────────────────────────────────────────────────────────────────────────
  if (!ONLY_SCHOOL || ONLY_SCHOOL === 3) {
    console.log('\n🟧 STEP 7: Seeding School 3 modules (Marriage Systems — Elite)\n');

    const s3Courses = schoolCourses.filter(c => c.school === 3);

    s3Courses.forEach(course => {
      const courseNo     = course.no;
      const cId          = `course-${courseNo}-${slugify(course.title)}`;
      const moduleTitles = SCHOOL_3_MODULES[courseNo];

      if (!moduleTitles) {
        console.warn(`   ⚠️  No module titles for course ${courseNo}`);
        return;
      }

      moduleTitles.forEach((title, modIdx) => {
        const wk    = modIdx + 1;
        const modId = `course-${courseNo}-week-${wk}`;
        const ref   = db.collection('modules').doc(modId);

        const data = {
          id:           modId,
          courseId:      cId,
          schoolId:      'school-3-marriage-systems',
          week:           wk,
          title,
          content:       `# ${title}\n\nModule content — ${course.title}.`,
          duration:       '7-9 hours',
          accessLevel:    'elite',
          unlockTier:     'elite',
          requiredTier:   'elite',
          isLocked:       false,
          lockMessage:    null,
          order:           wk,
          reflectionQuestions: [],
          downloads:           [],
          createdAt:     TS(),
          updatedAt:     TS(),
        };

        queueSet(ref, data);
        totalModules++;
        console.log(`   ✓ ${modId}: "${title.substring(0, 55)}" [elite]`);
      });
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // STEP 8 — Seed modules: School 4 (courses 37-44, Elite)
  // ────────────────────────────────────────────────────────────────────────────
  if (!ONLY_SCHOOL || ONLY_SCHOOL === 4) {
    console.log('\n🟫 STEP 8: Seeding School 4 modules (Civilization — Elite)\n');

    const s4Courses = schoolCourses.filter(c => c.school === 4);

    s4Courses.forEach(course => {
      const courseNo     = course.no;
      const cId          = `course-${courseNo}-${slugify(course.title)}`;
      const moduleTitles = SCHOOL_4_MODULES[courseNo];

      if (!moduleTitles) {
        console.warn(`   ⚠️  No module titles for course ${courseNo}`);
        return;
      }

      moduleTitles.forEach((title, modIdx) => {
        const wk    = modIdx + 1;
        const modId = `course-${courseNo}-week-${wk}`;
        const ref   = db.collection('modules').doc(modId);

        const data = {
          id:           modId,
          courseId:      cId,
          schoolId:      'school-4-civilization-leadership',
          week:           wk,
          title,
          content:       `# ${title}\n\nModule content — ${course.title}.`,
          duration:       '7-9 hours',
          accessLevel:    'elite',
          unlockTier:     'elite',
          requiredTier:   'elite',
          isLocked:       false,
          lockMessage:    null,
          order:           wk,
          reflectionQuestions: [],
          downloads:           [],
          createdAt:     TS(),
          updatedAt:     TS(),
        };

        queueSet(ref, data);
        totalModules++;
        console.log(`   ✓ ${modId}: "${title.substring(0, 55)}" [elite]`);
      });
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // COMMIT
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n💾  Committing to Firestore...\n');
  await commitAll();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('✅  COMPLETE');
  console.log(`   Courses seeded : ${totalCourses}`);
  console.log(`   Modules seeded : ${totalModules}`);
  console.log(`   Total ops      : ${totalCourses + totalModules + 2 + 6 + 13} (courses + modules + school fixes + teleios fix + sbd fix)`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌  FATAL ERROR:', err);
    process.exit(1);
  });
