#!/usr/bin/env node
/**
 * Generates public/data/shop-catalog.json from marriageducation.com portfolio.
 *
 * Phased rollout — bump SHOP_ACTIVE_PHASE after Stripe + unlock rules are ready.
 * Run: node scripts/generate-shop-catalog.js
 *      SHOP_ACTIVE_PHASE=2 node scripts/generate-shop-catalog.js
 */
const fs = require('fs');
const path = require('path');
const { loadProductAliases, legacyAliasesByCanonical } = require('./lib/product-aliases');
const { syncProductAliases } = require('./sync-product-aliases');
const { syncShopImages } = require('./sync-shop-images');
const { enrichProductWithProgramDetails } = require('./lib/course-program-details');

/** Products visible in shop = phase <= SHOP_ACTIVE_PHASE. Default to full catalog. */
const SHOP_ACTIVE_PHASE = parseInt(process.env.SHOP_ACTIVE_PHASE || '6', 10);

/** IDs with Stripe checkout + unlock rules in functions/index.js (Phase 1). */
const STRIPE_READY_IDS = new Set([
  'foundation-monthly',
  'premium-monthly',
  'elite-monthly',
  'teleios-blueprint',
  'starter-bundle',
  'teleios-bundle',
  'elite-bundle',
  'sbd-dummies',
  'the-woman-the-wife-the-mother',
  'the-woman-the-wife-the-mother-book',
  'the-woman-the-wife-the-mother-course',
  'the-woman-the-wife-the-mother-bundle',
  'the-sex-by-design-compendium',
  'sbd-dummies-digital-print',
  'sbd-canonical',
  'sbd-standard',
  'sbd-real-couples',
  'sbd-the-heart-of-relationship',
  'sbd-unequally-yoked-together',
  'sbd-2-the-impregnable-assemblage',
  'marriage-porn-beyond',
  'naked-and-not-ashamed',
  'marriage-equals-sexuality',
  'the-arts-of-marriage',
  'the-art-of-sexuality',
  'the-art-of-seduction',
  'the-art-of-fucking',
  'sbd-magazine-annual-subscription',
  'sbd-magazine-single-issue',
  'sbd-digital-archive-access',
  'complete-sbd-library',
  'sbd-complete-package',
  'arts-of-marriage-collection',
  'marriage-foundation-bundle',
  'sbd-starter-magazine',
  'newlywed-special',
  'anniversary-celebration',
  'sexual-literacy-101',
  'anatomy-of-desire',
  'teleios-blueprint-mini',
  'marriage-builds-nations-intro',
  'sbd-dummies-course-13wk',
  'sbd-dummies-core-curriculum',
  'art-of-marriage-course',
  'sexual-mastery-bundle',
  'teleios-development-bundle',
  'marriage-governance-bundle',
  'teleios-blueprint-full',
  'teleios-level-2',
  'anthropology-of-wholeness-book',
  'anthropology-of-wholeness',
  'anthropology-of-wholeness-bundle',
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
  'sex-equals-marriage',
  'sexual-self',
  'course-art-of-sexuality',
  'course-art-of-seduction',
  'course-art-of-nakedness',
  'sexual-imagination-pics-pearls',
  'conjugal-intelligence-masterclass',
  'arousal-mastery',
  'course-art-of-fucking',
  'erotic-devotion-song-of-solomon',
  'nakedness-muliebrity',
  'nakedness-virility',
  'bedroom-governance',
  'marriage-porn-beyond-course-individual',
  'marriage-porn-beyond-course-couple',
  'marriage-system-design',
  'covenant-governance',
  'fidelity-curriculum',
  'communication-covenant-couples',
  'conflict-mastery',
  'household-management',
  'daily-liturgies-marriage',
  'one-flesh-intensive',
  'marriage-builds-nations',
  'political-theology-of-home',
  'family-systems-architecture',
  'parenting-teleios',
  'raising-sexual-literacy-children',
  'family-culture-flourishing',
  'civilizational-intelligence-masterclass',
  'human-rights-marriage-udhr16',
  'diploma-sexual-literacy-conjugal',
  'diploma-teleios-personal-development',
  'sbd-certified-facilitator',
  'private-coaching-hourly',
  'marriage-labs-weekend',
  'sbd-academy-lifetime-pass',
]);

const PHASES = [
  { id: 1, label: 'Membership & proven bundles', note: '8 SKUs — Stripe live today' },
  { id: 2, label: 'Books & magazine', note: 'Add Stripe prices before setting activePhase ≥ 2' },
  { id: 3, label: 'Book bundles (shop.html)', note: 'Complete library, newlywed, etc.' },
  { id: 4, label: 'Entry courses & course bundles', note: 'Sexual Literacy 101, mastery bundles' },
  { id: 5, label: 'Academy schools 1–4', note: '44 school programs' },
  { id: 6, label: 'Diplomas, coaching, lifetime', note: 'High-ticket — manual review OK' },
];
const SECTIONS = [
  { id: 'membership', label: 'Membership' },
  { id: 'books_magazine', label: 'Books & Magazine' },
  { id: 'academy', label: 'Academy' },
  { id: 'bundles_diplomas', label: 'Bundles & Diplomas' },
];
const CATEGORIES = [
  { id: 'network_subscription', label: 'SBD Network Membership', icon: '◆', sort: 1 },
  { id: 'books_sbd_series', label: 'SBD Book Series', icon: '📖', sort: 2 },
  { id: 'books_arts_of_marriage', label: 'Arts of Marriage', icon: '🎨', sort: 3 },
  { id: 'books_standalone', label: 'Other Books', icon: '📙', sort: 4 },
  { id: 'magazine', label: 'Magazine', icon: '📰', sort: 5 },
  { id: 'book_bundles', label: 'Book Bundles', icon: '📦', sort: 6 },
  { id: 'courses_entry', label: 'Start Here', icon: '🎯', sort: 7 },
  { id: 'courses_school1', label: 'School 1 — Teleios', icon: '🟦', sort: 8 },
  { id: 'courses_school2', label: 'School 2 — Sexual Literacy', icon: '🟩', sort: 9 },
  { id: 'courses_school3', label: 'School 3 — Marriage Systems', icon: '🟧', sort: 10 },
  { id: 'courses_school4', label: 'School 4 — Civilization', icon: '🟫', sort: 11 },
  { id: 'course_bundles', label: 'Course Bundles', icon: '🎁', sort: 12 },
  { id: 'diplomas_certifications', label: 'Diplomas & Certs', icon: '🎓', sort: 13 },
  { id: 'coaching_live', label: 'Coaching & Events', icon: '🤝', sort: 14 },
  { id: 'lifetime_pass', label: 'Lifetime Access', icon: '∞', sort: 15 },
];

const CATEGORY_SECTION = {
  network_subscription: 'membership',
  books_sbd_series: 'books_magazine',
  books_arts_of_marriage: 'books_magazine',
  books_standalone: 'books_magazine',
  magazine: 'books_magazine',
  book_bundles: 'bundles_diplomas',
  courses_entry: 'academy',
  courses_school1: 'academy',
  courses_school2: 'academy',
  courses_school3: 'academy',
  courses_school4: 'academy',
  course_bundles: 'academy',
  diplomas_certifications: 'bundles_diplomas',
  coaching_live: 'bundles_diplomas',
  lifetime_pass: 'bundles_diplomas',
};

const BOOK_COVERS = {
  'the-sex-by-design-compendium': '/images/sexbydesigncompendium.jpg',
  'teleios-blueprint': '/assets/book-covers/teleios-blueprint.png',
  'teleios-blueprint-full': '/assets/book-covers/teleios-blueprint.png',
  'anthropology-of-wholeness-book': '/assets/book-covers/anthropology-of-wholeness.webp',
  'sbd-dummies': '/assets/book-covers/sbd-dummies.png',
  'sbd-dummies-digital-print': '/assets/book-covers/sbd-dummies.png',
  'sbd-canonical': '/images/sbd-canonical.jpg',
  'sbd-standard': '/images/sbd-standard.jpg',
  'sbd-real-couples': '/images/SBD-Real-Couples.jpg',
  'sbd-the-heart-of-relationship': '/images/sbd-the-heart-of-relationship.jpg',
  'sbd-unequally-yoked-together': '/images/sbd-unequally yoked together.jpg',
  'sbd-2-the-impregnable-assemblage': '/images/Sex-by-design-2-the-impregnable-assemblage.jpg',
  'marriage-porn-beyond': '/images/Marriage=Porn&Beyond.jpg',
  'naked-and-not-ashamed': '/images/naked-not-ashamed.jpg',
  'marriage-equals-sexuality': '/images/sbd-standard.jpg',
  'the-arts-of-marriage': '/images/sbd-the-heart-of-relationship.jpg',
  'the-art-of-sexuality': '/images/the-art-of-sexuality.jpg',
  'the-art-of-seduction': '/images/sbd-the-art-of-seduction.jpg',
  'the-art-of-fucking': '/images/sbd-the-art-of-fucking.jpg',
  'sbd-magazine-annual-subscription': '/images/Sex-by-design-magazine.jpg',
  'sbd-magazine-single-issue': '/images/Sex-by-design-magazine.jpg',
  'sbd-digital-archive-access': '/images/Sex-by-design-magazine.jpg',
  'complete-sbd-library': '/images/sbd-standard.jpg',
  'sbd-complete-package': '/images/sbd-dummies.jpg',
  'the-woman-the-wife-the-mother': '/images/the-woman-the-wife-the-mother-cover.png',
  'arts-of-marriage-collection': '/images/sbd-the-art-of-seduction.jpg',
  'marriage-foundation-bundle': '/images/sbd-dummies.jpg',
  'sbd-starter-magazine': '/images/Sex-by-design-magazine.jpg',
  'newlywed-special': '/images/naked-not-ashamed.jpg',
  'anniversary-celebration': '/images/sbd-the-heart-of-relationship.jpg',
};

const LEGACY_PRODUCT_ALIASES = legacyAliasesByCanonical(loadProductAliases());

const SCHOOL_VISUAL = {
  school1: { visualKey: 'school1', from: '#1a3a52', to: '#0d1f2e', label: 'School 1 — Teleios' },
  school2: { visualKey: 'school2', from: '#1a3d2e', to: '#0f2418', label: 'School 2 — Sexual Literacy' },
  school3: { visualKey: 'school3', from: '#3d2e1a', to: '#24180f', label: 'School 3 — Marriage Systems' },
  school4: { visualKey: 'school4', from: '#3d281a', to: '#1f150d', label: 'School 4 — Civilization' },
};

function resolveVisualKey(id, category, opts) {
  if (category === 'network_subscription') {
    const tier = opts.unlocks?.tier || id.replace('-monthly', '');
    return 'membership-' + tier;
  }
  if (opts.schoolId && SCHOOL_VISUAL[opts.schoolId]) return opts.schoolId;
  if (category === 'book_bundles' || category === 'course_bundles') return 'bundle';
  if (category === 'diplomas_certifications') return 'diploma';
  if (category === 'coaching_live') return 'coaching';
  if (category === 'lifetime_pass') return 'lifetime';
  if (category === 'magazine') return 'magazine';
  if (category && category.startsWith('courses_')) return 'course';
  if (category && category.startsWith('books_')) return 'book';
  return 'default';
}

function resolveCoverImage(id, category, opts) {
  if (BOOK_COVERS[id]) return BOOK_COVERS[id];
  if (opts.coverImage) return opts.coverImage;
  if (category === 'magazine' || (id && id.indexOf('magazine') >= 0)) {
    return BOOK_COVERS['sbd-magazine-annual-subscription'] || '';
  }
  if (category === 'book_bundles' || (opts.type === 'bundle' && category !== 'course_bundles')) {
    return BOOK_COVERS['complete-sbd-library'] || BOOK_COVERS['sbd-dummies'] || '';
  }
  return '';
}

function toPriceDisplay(priceUsd, suffix = '') {
  const normalized = Number(priceUsd) % 1 === 0 ? Number(priceUsd).toFixed(0) : Number(priceUsd).toFixed(2);
  return `$${normalized}${suffix || ''}`;
}

function inferSourceUrl(sourceHint, category) {
  if (!sourceHint && category && (category.startsWith('courses_') || category === 'course_bundles')) {
    return 'https://marriageducation.com/courses.html';
  }
  if (!sourceHint) return 'https://marriageducation.com/shop.html';
  if (/^https?:\/\//.test(sourceHint)) return sourceHint;
  if (category && (category.startsWith('courses_') || category === 'course_bundles')) {
    return 'https://marriageducation.com/courses.html';
  }
  if (sourceHint.includes('courses') || sourceHint.includes('schools')) return 'https://marriageducation.com/courses.html';
  if (sourceHint.includes('magazine')) return 'https://marriageducation.com/magazine.html';
  return 'https://marriageducation.com/shop.html';
}

function p(id, name, category, priceUsd, opts = {}) {
  const phase = opts.phase ?? 6;
  const priceSuffix = opts.priceSuffix || '';
  return {
    id,
    name,
    category,
    section: opts.section || CATEGORY_SECTION[category] || 'books_magazine',
    subcategory: opts.subcategory || null,
    phase,
    stripeReady: STRIPE_READY_IDS.has(id),
    type: opts.type || 'book',
    priceUsd,
    priceDisplay: opts.priceDisplay || toPriceDisplay(priceUsd, priceSuffix),
    priceSuffix,
    originalPriceUsd: opts.originalPriceUsd || null,
    description: opts.description || '',
    icon: opts.icon || '📘',
    format: opts.format || (opts.type === 'bundle' ? 'bundle' : 'digital'),
    recurring: !!opts.recurring,
    schoolId: opts.schoolId || null,
    requiredTier: opts.requiredTier || 'free',
    sourceUrl: inferSourceUrl(opts.sourceUrl || opts.source, category),
    coverImage: resolveCoverImage(id, category, opts),
    visualKey: opts.visualKey || resolveVisualKey(id, category, opts),
    legacyAliases: opts.legacyAliases || LEGACY_PRODUCT_ALIASES[id] || [],
    sortOrder: opts.sortOrder || 100,
    status: 'active',
    source: opts.source || 'marriageducation.com',
    unlocks: opts.unlocks || null,
    coverWrapImage: opts.coverWrapImage || null,
    school1Section: opts.school1Section || null,
    program: opts.program || null,
  };
}

const PRODUCTS = [
  // ── Phase 1 — Stripe-ready (functions/index.js SBD_CATALOG_SERVER) ──
  p('foundation-monthly', 'Foundation Tier', 'network_subscription', 9, {
    phase: 1, type: 'subscription', priceSuffix: '/mo', recurring: true, icon: '🟢', sortOrder: 1,
    description: 'Core courses in Schools 1 & 2, structured learning path.',
    unlocks: { type: 'tier', tier: 'foundation' },
  }),
  p('premium-monthly', 'Premium Tier', 'network_subscription', 20, {
    phase: 1, type: 'subscription', priceSuffix: '/mo', recurring: true, icon: '🔵', sortOrder: 2,
    description: 'Full Schools 1 & 2, certificates, progress boards, priority support.',
    unlocks: { type: 'tier', tier: 'premium' },
  }),
  p('elite-monthly', 'Elite Tier', 'network_subscription', 50, {
    phase: 1, type: 'subscription', priceSuffix: '/mo', recurring: true, icon: '🔴', sortOrder: 3,
    description: 'All 44 courses, MV House, advanced boards, full academy access.',
    unlocks: { type: 'tier', tier: 'elite' },
  }),
  p('teleios-blueprint', 'Teleios Blueprint (Book)', 'books_sbd_series', 247, {
    phase: 1, icon: '🎯', sortOrder: 4,
    coverImage: '/images/school1/series-a/teleios-blueprint.png',
    description: 'Foundation of identity, wholeness, and maturity.',
    unlocks: { type: 'course', courseIds: ['teleios-blueprint'] },
  }),
  p('starter-bundle', 'Starter Bundle', 'book_bundles', 37, {
    phase: 1, type: 'bundle', originalPriceUsd: 47, icon: '🚀', sortOrder: 5,
    description: 'SBD for Dummies + 1 month Premium access.',
    unlocks: { type: 'bundle', products: ['sbd-dummies'], subscription: { tier: 'premium', months: 1 } },
  }),
  p('teleios-bundle', 'The Teleios Blueprint — Book + Courseware', 'course_bundles', 300, {
    phase: 1, type: 'bundle', icon: '📘', sortOrder: 4.2,
    coverImage: '/images/school1/series-a/teleios-blueprint-bundle.png',
    description: 'The Teleios Blueprint book + the complete 6-week courseware.',
    unlocks: { type: 'bundle', products: ['teleios-blueprint', 'teleios-blueprint-full'], courses: ['teleios-blueprint'] },
  }),
  p('elite-bundle', 'Elite Formation Bundle', 'book_bundles', 497, {
    phase: 1, type: 'bundle', originalPriceUsd: 574, icon: '👑', sortOrder: 7,
    description: 'Complete library + 6 months Elite access.',
  }),
  p('sbd-dummies', 'SBD for Dummies', 'books_sbd_series', 27, {
    phase: 1, icon: '📗', sortOrder: 8,
    description: 'Entry-level guide to sexual design and covenant intimacy.',
    unlocks: { type: 'course', courseIds: ['sbd-dummies-course'] },
  }),
  p('the-woman-the-wife-the-mother-book', 'The Woman, The Wife, The Mother — Book', 'books_sbd_series', 50, {
    phase: 1, type: 'book', icon: '📕', sortOrder: 9,
    coverImage: '/images/the-woman-the-wife-the-mother-cover.png',
    description: 'Full Muliebrity Baron treatise — integrated womanhood, wifehood, and motherhood in covenant.',
    unlocks: { type: 'product', products: ['the-woman-the-wife-the-mother-book'], issueIds: ['issue-woman-wife-mother-2026'] },
  }),
  p('the-woman-the-wife-the-mother-course', 'The Woman, The Wife, The Mother — 13-Week Formation', 'course_bundles', 250, {
    phase: 1, type: 'course', icon: '📗', sortOrder: 10,
    coverImage: '/images/the-woman-the-wife-the-mother-cover.png',
    description: 'Flagship Muliebrity formation course — 13 weeks of drills, Scripture, assessment, and embodied practice. No video.',
    unlocks: { type: 'course', courseIds: ['the-woman-the-wife-the-mother'] },
  }),
  p('the-woman-the-wife-the-mother-bundle', 'The Woman, The Wife, The Mother — Book + Course', 'course_bundles', 300, {
    phase: 1, type: 'bundle', icon: '📘', sortOrder: 11,
    originalPriceUsd: 300,
    coverImage: '/images/the-woman-the-wife-the-mother-cover.png',
    coverWrapImage: '/images/the-woman-the-wife-the-mother-cover-wrap.png',
    legacyAliases: ['sex-by-design-complete-edition', 'the-woman-the-wife-the-mother'],
    description: 'Complete flagship: full book + 13-week Muliebrity Formation course + SBD Life Issue #2 access.',
    unlocks: {
      type: 'bundle',
      products: ['the-woman-the-wife-the-mother-book', 'the-woman-the-wife-the-mother-course', 'the-woman-the-wife-the-mother-bundle'],
      courseIds: ['the-woman-the-wife-the-mother'],
      issueIds: ['issue-woman-wife-mother-2026'],
    },
  }),

  // ── Phase 2 — Books & magazine (shop.html) ────────────────────────
  p('the-sex-by-design-compendium', 'The Sex by Design Compendium', 'books_sbd_series', 34.99, { phase: 2, icon: '📖', sortOrder: 10, description: 'Navigator into the full SBD book series.', source: 'marriageducation.com/shop.html' }),
  p('sbd-dummies-digital-print', 'SBD for Dummies — Digital + Print', 'books_sbd_series', 40, { phase: 2, originalPriceUsd: 47, icon: '📚', sortOrder: 12, description: 'Instant PDF plus premium print book shipped to you.' }),
  p('sbd-canonical', 'SBD Canonical', 'books_sbd_series', 29.99, { phase: 2, sortOrder: 13, description: 'Legal and societal frameworks of sexuality in marriage.' }),
  p('sbd-standard', 'SBD Standard', 'books_sbd_series', 24.99, { phase: 2, sortOrder: 14, description: 'Foundational text of the Sex by Design series.' }),
  p('sbd-real-couples', 'SBD Real Couples', 'books_sbd_series', 24.99, { phase: 2, sortOrder: 15, description: 'Real stories applying SBD principles in marriage.' }),
  p('sbd-the-heart-of-relationship', 'SBD The Heart of Relationship', 'books_sbd_series', 24.99, { phase: 2, sortOrder: 16, description: 'Emotional and spiritual core of marital relationships.' }),
  p('sbd-unequally-yoked-together', 'SBD Unequally Yoked Together', 'books_sbd_series', 24.99, { phase: 2, sortOrder: 17, description: 'Unity in marriage across different beliefs and values.' }),
  p('sbd-2-the-impregnable-assemblage', 'SBD 2 — The Impregnable Assemblage', 'books_sbd_series', 29.99, { phase: 2, sortOrder: 18, description: 'Advanced sequel on marital unity and unbreakable bond.' }),
  p('marriage-porn-beyond', 'Marriage=Porn & Beyond', 'books_sbd_series', 29.99, { phase: 2, sortOrder: 19, description: 'Marriage vs modern sexual culture — biblical wisdom.' }),
  p('naked-and-not-ashamed', 'Naked & Not Ashamed', 'books_sbd_series', 24.99, { phase: 2, sortOrder: 20, description: 'Overcoming shame and embracing vulnerability in marriage.' }),
  p('marriage-equals-sexuality', 'Marriage = Sexuality', 'books_sbd_series', 24.99, { phase: 2, sortOrder: 21, description: 'The inseparable connection between marriage and sexuality.' }),

  // ── Phase 2 — Arts of Marriage books ────────────────────────────
  p('the-arts-of-marriage', 'The Arts of Marriage', 'books_arts_of_marriage', 24.99, { phase: 2, icon: '🎨', sortOrder: 30, description: 'Master the artistry of marital intimacy.' }),
  p('the-art-of-sexuality', 'The Art of Sexuality', 'books_arts_of_marriage', 24.99, { phase: 2, sortOrder: 31, description: 'Sacred sexuality — body, mind, and spirit in covenant.' }),
  p('the-art-of-seduction', 'The Art of Seduction', 'books_arts_of_marriage', 24.99, { phase: 2, sortOrder: 32, description: 'Playful pursuit and attraction within committed marriage.' }),
  p('the-art-of-fucking', 'The Art of Fucking', 'books_arts_of_marriage', 24.99, { phase: 2, sortOrder: 33, description: 'Passionate physical intimacy and sexual mastery in marriage.' }),

  // ── Phase 2 — Magazine ──────────────────────────────────────────
  p('sbd-magazine-annual-subscription', 'SBD Magazine — Annual Subscription', 'magazine', 50, { phase: 2, type: 'subscription', priceSuffix: '/yr', icon: '📰', sortOrder: 40, description: '3 quarterly issues per year, digital + print, archive access.' }),
  p('sbd-magazine-single-issue', 'SBD Magazine — Single Issue', 'magazine', 20, { phase: 2, sortOrder: 41, description: 'Current quarterly issue, 200+ pages, digital access.' }),
  p('sbd-digital-archive-access', 'SBD Digital Archive Access', 'magazine', 30, { phase: 2, sortOrder: 42, description: 'Lifetime access to all past magazine issues.' }),

  // ── Phase 3 — Book bundles (shop.html) ──────────────────────────
  p('complete-sbd-library', 'Complete SBD Library', 'book_bundles', 5000, { phase: 3, type: 'bundle', originalPriceUsd: 5000, icon: '📚', sortOrder: 50, description: 'All 10 core SBD series books plus bonuses.' }),
  p('sbd-complete-package', 'SBD for Dummies Complete Package', 'book_bundles', 417, { phase: 3, type: 'bundle', originalPriceUsd: 450, sortOrder: 51, description: '13-module course + digital and print Dummies book.' }),
  p('arts-of-marriage-collection', 'Arts of Marriage Complete Collection', 'book_bundles', 59.99, { phase: 3, type: 'bundle', originalPriceUsd: 74.97, sortOrder: 52, description: 'Art of Sexuality, Seduction, and Fucking trilogy.' }),
  p('marriage-foundation-bundle', 'Marriage Foundation Bundle', 'book_bundles', 54.99, { phase: 3, type: 'bundle', originalPriceUsd: 69.97, sortOrder: 53, description: 'Dummies, Standard, and Naked & Not Ashamed.' }),
  p('sbd-starter-magazine', 'SBD Starter + Magazine Bundle', 'book_bundles', 89.99, { phase: 3, type: 'bundle', originalPriceUsd: 134.99, sortOrder: 54, description: 'Foundation book bundle plus annual magazine subscription.' }),
  p('newlywed-special', 'Newlywed Special Bundle', 'book_bundles', 49.99, { phase: 3, type: 'bundle', originalPriceUsd: 69.97, sortOrder: 55, description: 'Dummies, Naked & Not Ashamed, Arts of Marriage.' }),
  p('anniversary-celebration', 'Anniversary Celebration Bundle', 'book_bundles', 69.99, { phase: 3, type: 'bundle', originalPriceUsd: 84.98, sortOrder: 56, description: 'Arts collection plus Heart of Relationship.' }),

  // ── Phase 4 — Entry courses ─────────────────────────────────────
  p('sexual-literacy-101', 'Sexual Literacy 101', 'courses_entry', 25, { phase: 4, type: 'course', icon: '⭐', sortOrder: 60, description: '90-minute intro to sexuality in covenant.' }),
  p('anatomy-of-desire', 'The Anatomy of Desire', 'courses_entry', 49, { phase: 4, type: 'course', sortOrder: 61, description: 'How desire works and how to steward it in marriage.' }),
  p('teleios-blueprint-mini', 'The Teleios Blueprint (Mini)', 'courses_entry', 39, { phase: 4, type: 'course', sortOrder: 62, description: 'Fast-track intro to teleios wholeness and maturity.' }),
  p('marriage-builds-nations-intro', 'Marriage Builds Nations (Intro)', 'courses_entry', 29, { phase: 4, type: 'course', sortOrder: 63, description: 'Why your marriage shapes civilization (UDHR 16).' }),
  p('sbd-dummies-course-13wk', 'Sex By Design for Dummies — 13-Week Course', 'courses_entry', 300, { phase: 4, type: 'course', sortOrder: 64, description: 'Full 13-module course with book included.' }),
  p('sbd-dummies-core-curriculum', 'Sex By Design Core Curriculum', 'courses_entry', 497, { phase: 4, type: 'course', sortOrder: 65, description: 'Flagship 10-week guided SBD framework for couples.' }),
  p('art-of-marriage-course', 'The Art of Marriage — Course', 'courses_entry', 297, { phase: 4, type: 'course', sortOrder: 66, description: 'Covenant, nakedness, and civilization in marriage.' }),

  // ── Phase 4 — Course bundles ────────────────────────────────────
  p('sexual-mastery-bundle', 'Sexual Mastery Bundle', 'course_bundles', 399, { phase: 4, type: 'bundle', originalPriceUsd: 1192, sortOrder: 130, description: 'Art of Sexuality, Seduction, Nakedness, Sexual Imagination.' }),
  p('teleios-development-bundle', 'Teleios Development Bundle', 'course_bundles', 299, { phase: 4, type: 'bundle', originalPriceUsd: 744, sortOrder: 131, description: 'Teleios Blueprint, Identity, Heart, Four Faculties.' }),
  p('marriage-governance-bundle', 'Marriage Governance Bundle', 'course_bundles', 349, { phase: 4, type: 'bundle', originalPriceUsd: 894, sortOrder: 132, description: 'System Design, Covenant Governance, Liturgies, Communication.' }),

  // ── Phase 5 — School 1 — Teleios ────────────────────────────────
  p('teleios-blueprint-full', 'The Teleios Blueprint: Full Human Maturity — Course', 'courses_school1', 247, { phase: 1, type: 'course', schoolId: 'school1', sortOrder: 4.3, coverImage: '/images/school1/series-a/teleios-blueprint.png', school1Section: 'A', description: 'The 6-week Teleios Blueprint course — full human maturity, identity, character, relationship, and purpose.' }),
  p('anthropology-of-wholeness-book', 'The Anthropology of Wholeness — Book', 'books_sbd_series', 149, { phase: 1, type: 'book', sortOrder: 71, coverImage: '/assets/book-covers/anthropology-of-wholeness.webp', description: 'Discovering the design for full human maturity.' , unlocks: { type: 'product', products: ['anthropology-of-wholeness-book'] } }),
  p('anthropology-of-wholeness', 'The Anthropology of Wholeness: Becoming Fully Human', 'courses_school1', 149, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 72, description: 'Deep study of what it means to be human — image, likeness, design, and the full development of personality (UDHR 26:2).', coverImage: '/assets/course-covers/anthropology-of-wholeness.webp', school1Section: 'A', program: { tagline: '', badge: null, badgeStyle: 'school1', featureLabel: "You'll learn:", features: ['Deep study of what it means to be human — image, likeness, design, and the full development of personality (UDHR 26:2).', 'Video lessons and structured exercises', 'Practice drills you can repeat at home'], duration: '4 weeks', format: 'Online program', pitch: 'Deep study of what it means to be human — image, likeness, design, and the full development of personality (UDHR 26:2).', ctaLabel: 'Enroll in Course', accent: 'school1' }, unlocks: { type: 'course', courseIds: ['anthropology-of-wholeness'] } }),
  p('identity-mastery', 'Identity Mastery: Understanding Image, Likeness & Human Design', 'courses_school1', 149, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 73, description: 'Master who you are by design — not by damage, culture, or accident. Build identity from Genesis 1:26-27 forward.', coverImage: '/images/school1/series-a/identity-mastery.png', school1Section: 'A', program: { tagline: '', badge: null, badgeStyle: 'school1', featureLabel: "You'll learn:", features: ['Master who you are by design — not by damage, culture, or accident. Build identity from Genesis 1:26-27 forward.', 'Video lessons and structured exercises', 'Practice drills you can repeat at home'], duration: '4 weeks', format: 'Online program', pitch: 'Master who you are by design — not by damage, culture, or accident. Build identity from Genesis 1:26-27 forward.', ctaLabel: 'Enroll in Course', accent: 'school1' } }),
  p('four-faculties-training', 'The Four Faculties Training', 'courses_school1', 199, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 74, description: 'Steward the four human capacities: Conative, Cognitive, Psychomotor, and Affective.', coverImage: '/images/school1/series-a/four-faculties-training.png', school1Section: 'A', program: { tagline: '', badge: null, badgeStyle: 'school1', featureLabel: "You'll learn:", features: ['Steward the four human capacities: Conative, Cognitive, Psychomotor, and Affective.', 'Video lessons and structured exercises', 'Practice drills you can repeat at home'], duration: '5 weeks', format: 'Online program', pitch: 'Steward the four human capacities: Conative, Cognitive, Psychomotor, and Affective.', ctaLabel: 'Enroll in Course', accent: 'school1' } }),
  p('anthropocentric-development', 'Anthropocentric Development: How Humans Grow', 'courses_school1', 129, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 75, description: 'Study how human capacities develop in reference to human design, maturation, and intended expression.', coverImage: '/images/school1/series-a/anthropocentric-development.png', school1Section: 'A', program: { tagline: '', badge: null, badgeStyle: 'school1', featureLabel: "You'll learn:", features: ['Study how human capacities develop in reference to human design, maturation, and intended expression.', 'Video lessons and structured exercises', 'Practice drills you can repeat at home'], duration: '3 weeks', format: 'Online program', pitch: 'Study how human capacities develop in reference to human design, maturation, and intended expression.', ctaLabel: 'Enroll in Course', accent: 'school1' } }),
  p('personal-development-masterclass', 'The Personal Development MasterClass', 'courses_school1', 697, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 76, description: '12-week intensive covering all dimensions of personal development from teleios anthropology to practiced maturity.', coverImage: '/images/school1/series-a/personal-development-masterclass.png', school1Section: 'A', program: { tagline: '', badge: null, badgeStyle: 'school1', featureLabel: "You'll learn:", features: ['12-week intensive covering all dimensions of personal development from teleios anthropology to practiced maturity.', 'Video lessons and structured exercises', 'Practice drills you can repeat at home'], duration: '12 weeks', format: 'Online program', pitch: '12-week intensive covering all dimensions of personal development from teleios anthropology to practiced maturity.', ctaLabel: 'Enroll in Course', accent: 'school1' } }),
  p('science-of-self-command', 'The Science of Self-Command', 'courses_school1', 199, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 77, description: 'Teleios Self-Governance Program — master self-control, discipline, and the capacity to lead yourself before leading a family.', coverImage: '/images/school1/series-a/science-of-self-command.png', school1Section: 'A', program: { tagline: '', badge: null, badgeStyle: 'school1', featureLabel: "You'll learn:", features: ['Teleios Self-Governance Program — master self-control, discipline, and the capacity to lead yourself before leading a family.', 'Video lessons and structured exercises', 'Practice drills you can repeat at home'], duration: '5 weeks', format: 'Online program', pitch: 'Teleios Self-Governance Program — master self-control, discipline, and the capacity to lead yourself before leading a family.', ctaLabel: 'Enroll in Course', accent: 'school1' } }),
  p('heart-of-relationship-l1', 'The Heart of Relationship (Level 1)', 'courses_school1', 149, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 78, description: 'Foundational relational intelligence — how relationships work, what they require, and how to steward them.', coverImage: '', school1Section: 'B', program: { tagline: '', badge: null, badgeStyle: 'school1', featureLabel: "You'll learn:", features: ['Foundational relational intelligence — how relationships work, what they require, and how to steward them.', 'Video lessons and structured exercises', 'Practice drills you can repeat at home'], duration: '4 weeks', format: 'Online program', pitch: 'Foundational relational intelligence — how relationships work, what they require, and how to steward them.', ctaLabel: 'Enroll in Course', accent: 'school1' } }),
  p('relationship-relatednesses-l2', 'Relationship Relatednesses (Level 2)', 'courses_school1', 199, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 79, description: 'Advanced relational mastery — understanding the systems, patterns, and governance of healthy relationships.', coverImage: '', school1Section: 'B', program: { tagline: '', badge: null, badgeStyle: 'school1', featureLabel: "You'll learn:", features: ['Advanced relational mastery — understanding the systems, patterns, and governance of healthy relationships.', 'Video lessons and structured exercises', 'Practice drills you can repeat at home'], duration: '6 weeks', format: 'Online program', pitch: 'Advanced relational mastery — understanding the systems, patterns, and governance of healthy relationships.', ctaLabel: 'Enroll in Course', accent: 'school1' } }),
  p('relationship-mastery-intensive-l3', 'Relationship Mastery Intensive (Level 3)', 'courses_school1', 349, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 80, description: 'Expert-level relationship intelligence for those committed to building covenant-grade relational capacity.', coverImage: '', school1Section: 'B', program: { tagline: '', badge: null, badgeStyle: 'school1', featureLabel: "You'll learn:", features: ['Expert-level relationship intelligence for those committed to building covenant-grade relational capacity.', 'Video lessons and structured exercises', 'Practice drills you can repeat at home'], duration: '8 weeks', format: 'Online program', pitch: 'Expert-level relationship intelligence for those committed to building covenant-grade relational capacity.', ctaLabel: 'Enroll in Course', accent: 'school1' } }),
  p('perfect-self-program', 'The Perfect Self Program: Practicing From Perfection', 'courses_school1', 149, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 81, description: 'Learn to live from teleios identity, not chase it. Practice from perfection as your starting point.', coverImage: '', school1Section: 'B', program: { tagline: '', badge: null, badgeStyle: 'school1', featureLabel: "You'll learn:", features: ['Learn to live from teleios identity, not chase it. Practice from perfection as your starting point.', 'Video lessons and structured exercises', 'Practice drills you can repeat at home'], duration: '4 weeks', format: 'Online program', pitch: 'Learn to live from teleios identity, not chase it. Practice from perfection as your starting point.', ctaLabel: 'Enroll in Course', accent: 'school1' } }),
  p('emotional-literacy', 'Emotional Literacy for Couples & Singles', 'courses_school1', 129, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 82, description: 'Understand, name, and steward emotions without being controlled by them. Essential for covenant life.', coverImage: '', school1Section: 'B', program: { tagline: '', badge: null, badgeStyle: 'school1', featureLabel: "You'll learn:", features: ['Understand, name, and steward emotions without being controlled by them. Essential for covenant life.', 'Video lessons and structured exercises', 'Practice drills you can repeat at home'], duration: '4 weeks', format: 'Online program', pitch: 'Understand, name, and steward emotions without being controlled by them. Essential for covenant life.', ctaLabel: 'Enroll in Course', accent: 'school1' } }),
  p('temperament-intelligence', 'Temperament Intelligence for Marriage', 'courses_school1', 99, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 83, description: 'Master how to work with different temperaments in marriage without contempt or resentment.', coverImage: '', school1Section: 'B', program: { tagline: '', badge: null, badgeStyle: 'school1', featureLabel: "You'll learn:", features: ['Master how to work with different temperaments in marriage without contempt or resentment.', 'Video lessons and structured exercises', 'Practice drills you can repeat at home'], duration: '3 weeks', format: 'Online program', pitch: 'Master how to work with different temperaments in marriage without contempt or resentment.', ctaLabel: 'Enroll in Course', accent: 'school1' } }),

  // ── Phase 5 — School 2 — Sexual Literacy ────────────────────────
  p('sex-equals-marriage', 'Sex = Marriage: The Only Equation', 'courses_school2', 350, { phase: 5, type: 'course', schoolId: 'school2', sortOrder: 90, description: 'Sex, nakedness, desire, and conjugal joining as one.' }),
  p('sexual-self', 'The Sexual Self', 'courses_school2', 149, { phase: 5, type: 'course', schoolId: 'school2', sortOrder: 91, description: 'Understanding your unique sexual blueprint in covenant.' }),
  p('course-art-of-sexuality', 'The Art of Sexuality — Course', 'courses_school2', 397, { phase: 5, type: 'course', schoolId: 'school2', sortOrder: 92, description: 'Sexuality as lifestyle — allure, wardrobe, Song of Songs.' }),
  p('course-art-of-seduction', 'The Art of Seduction — Course', 'courses_school2', 347, { phase: 5, type: 'course', schoolId: 'school2', sortOrder: 93, description: 'Holy seduction and covenant eroticism.' }),
  p('course-art-of-nakedness', 'The Art of Nakedness — Course', 'courses_school2', 199, { phase: 5, type: 'course', schoolId: 'school2', sortOrder: 94, description: 'Steward the body as covenant holy stewardship.' }),
  p('sexual-imagination-pics-pearls', 'Sexual Imagination (Pics & Pearls)', 'courses_school2', 249, { phase: 5, type: 'course', schoolId: 'school2', sortOrder: 95, description: 'Private erotic imagination as covenant loyalty.' }),
  p('conjugal-intelligence-masterclass', 'Conjugal Intelligence MasterClass', 'courses_school2', 897, { phase: 5, type: 'course', schoolId: 'school2', sortOrder: 96, description: 'Highest level sexual literacy and conjugal training.' }),
  p('arousal-mastery', 'Arousal Mastery Program', 'courses_school2', 299, { phase: 5, type: 'course', schoolId: 'school2', sortOrder: 97, description: 'Understanding and stewarding arousal in marriage.' }),
  p('course-art-of-fucking', 'The Art of Fucking — Course', 'courses_school2', 349, { phase: 5, type: 'course', schoolId: 'school2', sortOrder: 98, description: 'Advanced sexual mastery within covenant.' }),
  p('erotic-devotion-song-of-solomon', 'Erotic Devotion: Song of Solomon', 'courses_school2', 299, { phase: 5, type: 'course', schoolId: 'school2', sortOrder: 99, description: 'Biblical eroticism as marriage liturgy.' }),
  p('nakedness-muliebrity', 'Nakedness Stewardship — Muliebrity', 'courses_school2', 249, { phase: 5, type: 'course', schoolId: 'school2', sortOrder: 100, description: 'Wives: wardrobe, scent, presence as covenant service.' }),
  p('nakedness-virility', 'Nakedness Stewardship — Virility', 'courses_school2', 249, { phase: 5, type: 'course', schoolId: 'school2', sortOrder: 101, description: 'Husbands: masculine presence and sexual authority.' }),
  p('bedroom-governance', 'Bedroom Governance & Responsibility', 'courses_school2', 199, { phase: 5, type: 'course', schoolId: 'school2', sortOrder: 102, description: 'Lead the sexual dimension of marriage with joy.' }),
  p('marriage-porn-beyond-course-individual', 'Marriage=Porn & Beyond — Individual', 'courses_school2', 447, { phase: 5, type: 'course', schoolId: 'school2', sortOrder: 103, description: 'Freedom lab for individuals addressing pornography.' }),
  p('marriage-porn-beyond-course-couple', 'Marriage=Porn & Beyond — Couple', 'courses_school2', 597, { phase: 5, type: 'course', schoolId: 'school2', sortOrder: 104, description: 'Couple freedom lab — marriage that outperforms porn.' }),

  // ── Phase 5 — School 3 — Marriage Systems ───────────────────────
  p('marriage-system-design', 'Marriage System Design', 'courses_school3', 297, { phase: 5, type: 'course', schoolId: 'school3', sortOrder: 110, description: 'Design systems and rhythms that sustain one-flesh unity.' }),
  p('covenant-governance', 'Covenant Governance', 'courses_school3', 249, { phase: 5, type: 'course', schoolId: 'school3', sortOrder: 111, description: 'Leadership, service, authority, and household order.' }),
  p('fidelity-curriculum', 'The Fidelity Curriculum', 'courses_school3', 349, { phase: 5, type: 'course', schoolId: 'school3', sortOrder: 112, description: 'Sexual loyalty and lifelong covenant devotion.' }),
  p('communication-covenant-couples', 'Communication for Covenant Couples', 'courses_school3', 199, { phase: 5, type: 'course', schoolId: 'school3', sortOrder: 113, description: 'Covenantal communication that deepens unity.' }),
  p('conflict-mastery', 'Conflict Mastery & Marital Peacekeeping', 'courses_school3', 179, { phase: 5, type: 'course', schoolId: 'school3', sortOrder: 114, description: 'Resolve conflict without damage — fight well.' }),
  p('household-management', 'Household Management Program', 'courses_school3', 199, { phase: 5, type: 'course', schoolId: 'school3', sortOrder: 115, description: 'Time, finance, and order in daily covenant life.' }),
  p('daily-liturgies-marriage', 'Daily Liturgies of Marriage', 'courses_school3', 149, { phase: 5, type: 'course', schoolId: 'school3', sortOrder: 116, description: 'Rhythms of presence, touch, worship, and sexual devotion.' }),
  p('one-flesh-intensive', 'The One-Flesh Intensive', 'courses_school3', 279, { phase: 5, type: 'course', schoolId: 'school3', sortOrder: 117, description: 'Theology and practice of becoming one flesh.' }),

  // ── Phase 5 — School 4 — Civilization ───────────────────────────
  p('marriage-builds-nations', 'Marriage Builds Nations', 'courses_school4', 299, { phase: 5, type: 'course', schoolId: 'school4', sortOrder: 120, description: 'UDHR 16, covenant governance, national stability.' }),
  p('political-theology-of-home', 'The Political Theology of Home', 'courses_school4', 249, { phase: 5, type: 'course', schoolId: 'school4', sortOrder: 121, description: 'Your home as micro-nation with laws and legacy.' }),
  p('family-systems-architecture', 'Family Systems Architecture', 'courses_school4', 279, { phase: 5, type: 'course', schoolId: 'school4', sortOrder: 122, description: 'Generational stability and cultural transmission.' }),
  p('parenting-teleios', 'Parenting Through Teleios Principles', 'courses_school4', 299, { phase: 5, type: 'course', schoolId: 'school4', sortOrder: 123, description: 'Raise covenant-ready adults from design, not damage.' }),
  p('raising-sexual-literacy-children', 'Raising Sons & Daughters Through Sexual Literacy', 'courses_school4', 249, { phase: 5, type: 'course', schoolId: 'school4', sortOrder: 124, description: 'Sexual literacy and identity from childhood forward.' }),
  p('family-culture-flourishing', 'Family Culture & Human Flourishing', 'courses_school4', 199, { phase: 5, type: 'course', schoolId: 'school4', sortOrder: 125, description: 'Teleios family culture — language, liturgies, values.' }),
  p('civilizational-intelligence-masterclass', 'Civilizational Intelligence Masterclass', 'courses_school4', 697, { phase: 5, type: 'course', schoolId: 'school4', sortOrder: 126, description: 'How marriage, family, and law create civilizations.' }),
  p('human-rights-marriage-udhr16', 'Human Rights & Marriage (UDHR 16)', 'courses_school4', 179, { phase: 5, type: 'course', schoolId: 'school4', sortOrder: 127, description: 'Covenant marriage as human right and foundation.' }),

  // ── Phase 6 — Diplomas & certifications ─────────────────────────
  p('diploma-sexual-literacy-conjugal', 'Diploma in Sexual Literacy & Conjugal Mastery', 'diplomas_certifications', 2500, { phase: 6, type: 'diploma', sortOrder: 140, description: '16-week premium certification with coaching and community.' }),
  p('diploma-teleios-personal-development', 'Diploma in Teleios Personal Development', 'diplomas_certifications', 2000, { phase: 6, type: 'diploma', sortOrder: 141, description: '14-week diploma — all School 1 core programs.' }),
  p('sbd-certified-facilitator', 'SBD Certified Facilitator Training', 'diplomas_certifications', 1497, { phase: 6, type: 'certification', sortOrder: 142, description: '12-week certification to teach SBD in churches and communities.' }),

  // ── Phase 6 — Coaching & live events ────────────────────────────
  p('private-coaching-hourly', 'SBD Private Coaching (Dr. Coach)', 'coaching_live', 150, { phase: 6, type: 'coaching', priceSuffix: '/hr', sortOrder: 150, description: '1:1 precision help — 60-minute video sessions.' }),
  p('marriage-labs-weekend', 'SBD Marriage Labs — Weekend Intensive', 'coaching_live', 899, { phase: 6, type: 'event', priceSuffix: '/couple', sortOrder: 151, description: '48-hour breakthrough intensive with follow-up calls.' }),

  // ── Phase 6 — Lifetime ──────────────────────────────────────────
  p('sbd-academy-lifetime-pass', 'SBD Academy Lifetime Access Pass', 'lifetime_pass', 5000, { phase: 6, type: 'lifetime', sortOrder: 160, description: 'All current and future courses, books, and community — one payment.' }),
];

const PRODUCTS_ENRICHED = PRODUCTS.map(enrichProductWithProgramDetails);

const catalog = {
  version: 4,
  generatedAt: new Date().toISOString(),
  currency: 'USD',
  activePhase: SHOP_ACTIVE_PHASE,
  maxPhase: PHASES.length,
  phases: PHASES,
  sections: SECTIONS,
  categories: CATEGORIES,
  products: PRODUCTS_ENRICHED,
};

const outPath = path.join(__dirname, '../public/data/shop-catalog.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2));
const visible = PRODUCTS_ENRICHED.filter((x) => x.phase <= SHOP_ACTIVE_PHASE).length;
const checkoutReady = PRODUCTS_ENRICHED.filter((x) => x.phase <= SHOP_ACTIVE_PHASE && x.stripeReady).length;
const academyPrograms = PRODUCTS_ENRICHED.filter((x) => x.section === 'academy' && x.program).length;
console.log('   Academy program cards:', academyPrograms);
console.log('✅ Wrote', outPath);
console.log('   Categories:', CATEGORIES.length);
console.log('   Products (total):', PRODUCTS.length);
console.log('   Active phase:', SHOP_ACTIVE_PHASE, '→ visible:', visible, '| checkout-ready:', checkoutReady);
syncProductAliases();
try {
  const img = syncShopImages();
  console.log('   Images synced:', img.total, 'files (', img.copied, ' copied)');
} catch (imgErr) {
  console.warn('   ⚠️  Image sync skipped:', imgErr.message);
}
console.log('   Aliases synced from data/product-aliases.json');
