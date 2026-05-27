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

/** Products visible in shop = phase <= SHOP_ACTIVE_PHASE. Start at 1. */
const SHOP_ACTIVE_PHASE = parseInt(process.env.SHOP_ACTIVE_PHASE || '1', 10);

/** IDs with Stripe checkout + unlock rules in functions/index.js (Phase 1). */
const STRIPE_READY_IDS = new Set([
  'foundation-monthly',
  'premium-monthly',
  'elite-monthly',
  'sbd-dummies',
  'teleios-blueprint',
  'starter-bundle',
  'teleios-bundle',
  'elite-bundle',
]);

const PHASES = [
  { id: 1, label: 'Membership & proven bundles', note: '8 SKUs — Stripe live today' },
  { id: 2, label: 'Books & magazine', note: 'Add Stripe prices before setting activePhase ≥ 2' },
  { id: 3, label: 'Book bundles (shop.html)', note: 'Complete library, newlywed, etc.' },
  { id: 4, label: 'Entry courses & course bundles', note: 'Sexual Literacy 101, mastery bundles' },
  { id: 5, label: 'Academy schools 1–4', note: '44 school programs' },
  { id: 6, label: 'Diplomas, coaching, lifetime', note: 'High-ticket — manual review OK' },
];
const CATEGORIES = [
  { id: 'network_subscription', label: 'Membership', icon: '◆', sort: 1 },
  { id: 'books_sbd_series', label: 'SBD Books', icon: '📖', sort: 2 },
  { id: 'books_arts_of_marriage', label: 'Arts of Marriage', icon: '🎨', sort: 3 },
  { id: 'magazine', label: 'Magazine', icon: '📰', sort: 4 },
  { id: 'book_bundles', label: 'Book Bundles', icon: '📦', sort: 5 },
  { id: 'courses_entry', label: 'Start Here', icon: '🎯', sort: 6 },
  { id: 'courses_school1', label: 'School 1 — Teleios', icon: '🟦', sort: 7 },
  { id: 'courses_school2', label: 'School 2 — Sexual Literacy', icon: '🟩', sort: 8 },
  { id: 'courses_school3', label: 'School 3 — Marriage Systems', icon: '🟧', sort: 9 },
  { id: 'courses_school4', label: 'School 4 — Civilization', icon: '🟫', sort: 10 },
  { id: 'course_bundles', label: 'Course Bundles', icon: '🎁', sort: 11 },
  { id: 'diplomas_certifications', label: 'Diplomas & Certs', icon: '🎓', sort: 12 },
  { id: 'coaching_live', label: 'Coaching & Events', icon: '🤝', sort: 13 },
  { id: 'lifetime_pass', label: 'Lifetime Access', icon: '∞', sort: 14 },
];

function p(id, name, category, priceUsd, opts = {}) {
  const phase = opts.phase ?? 6;
  return {
    id,
    name,
    category,
    phase,
    stripeReady: STRIPE_READY_IDS.has(id),
    type: opts.type || 'book',
    priceUsd,
    priceSuffix: opts.priceSuffix || '',
    originalPriceUsd: opts.originalPriceUsd || null,
    description: opts.description || '',
    icon: opts.icon || '📘',
    recurring: !!opts.recurring,
    schoolId: opts.schoolId || null,
    sortOrder: opts.sortOrder || 100,
    status: 'active',
    source: opts.source || 'marriageducation.com',
    unlocks: opts.unlocks || null,
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
    description: 'Foundation of identity, wholeness, and maturity.',
    unlocks: { type: 'course', courseIds: ['teleios-blueprint'] },
  }),
  p('starter-bundle', 'Starter Bundle', 'book_bundles', 37, {
    phase: 1, type: 'bundle', originalPriceUsd: 47, icon: '🚀', sortOrder: 5,
    description: 'SBD for Dummies + 1 month Premium access.',
    unlocks: { type: 'bundle', products: ['sbd-dummies'], subscription: { tier: 'premium', months: 1 } },
  }),
  p('teleios-bundle', 'Teleios Bundle', 'book_bundles', 297, {
    phase: 1, type: 'bundle', originalPriceUsd: 347, icon: '🎓', sortOrder: 6,
    description: 'Teleios Blueprint + 3 months Premium + coaching session.',
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
  p('complete-sbd-library', 'Complete SBD Library', 'book_bundles', 189.99, { phase: 3, type: 'bundle', originalPriceUsd: 254.91, icon: '📚', sortOrder: 50, description: 'All 10 core SBD series books plus bonuses.' }),
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
  p('teleios-blueprint-full', 'The Teleios Blueprint: Full Human Maturity', 'courses_school1', 247, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 70, description: 'Foundational certificate — identity, maturity, human design.' }),
  p('teleios-level-2', 'Teleios Level 2: Advanced Development', 'courses_school1', 397, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 71, description: 'Epistemology, axiology, ontology for marriage readiness.' }),
  p('anthropology-of-wholeness', 'The Anthropology of Wholeness', 'courses_school1', 149, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 72, description: 'Becoming fully human — image, likeness, UDHR 26:2.' }),
  p('identity-mastery', 'Identity Mastery', 'courses_school1', 149, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 73, description: 'Who you are by design from Genesis 1:26-27.' }),
  p('four-faculties-training', 'The Four Faculties Training', 'courses_school1', 199, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 74, description: 'Behavioral, temperamental, emotional, mental maturity.' }),
  p('anthropocentric-development', 'Anthropocentric Development', 'courses_school1', 129, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 75, description: 'How humans are designed to grow whole over time.' }),
  p('personal-development-masterclass', 'Personal Development MasterClass', 'courses_school1', 697, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 76, description: '12-week intensive — all dimensions of teleios maturity.' }),
  p('science-of-self-command', 'The Science of Self-Command', 'courses_school1', 199, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 77, description: 'Self-governance before leading a family.' }),
  p('heart-of-relationship-l1', 'The Heart of Relationship (Level 1)', 'courses_school1', 149, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 78, description: 'Foundational relational intelligence.' }),
  p('relationship-relatednesses-l2', 'Relationship Relatednesses (Level 2)', 'courses_school1', 199, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 79, description: 'Advanced relational systems and governance.' }),
  p('relationship-mastery-intensive-l3', 'Relationship Mastery Intensive (Level 3)', 'courses_school1', 349, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 80, description: 'Expert covenant-grade relational capacity.' }),
  p('perfect-self-program', 'The Perfect Self Program', 'courses_school1', 149, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 81, description: 'Practice from perfection as starting point.' }),
  p('emotional-literacy', 'Emotional Literacy for Couples & Singles', 'courses_school1', 129, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 82, description: 'Steward emotions without being controlled by them.' }),
  p('temperament-intelligence', 'Temperament Intelligence for Marriage', 'courses_school1', 99, { phase: 5, type: 'course', schoolId: 'school1', sortOrder: 83, description: 'Work with temperament differences without contempt.' }),

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
  p('sbd-academy-lifetime-pass', 'SBD Academy Lifetime Access Pass', 'lifetime_pass', 1997, { phase: 6, type: 'lifetime', sortOrder: 160, description: 'All current and future courses, books, and community — one payment.' }),
];

const catalog = {
  version: 3,
  generatedAt: new Date().toISOString(),
  currency: 'USD',
  activePhase: SHOP_ACTIVE_PHASE,
  maxPhase: PHASES.length,
  phases: PHASES,
  categories: CATEGORIES,
  products: PRODUCTS,
};

const outPath = path.join(__dirname, '../public/data/shop-catalog.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2));
const visible = PRODUCTS.filter((x) => x.phase <= SHOP_ACTIVE_PHASE).length;
const checkoutReady = PRODUCTS.filter((x) => x.phase <= SHOP_ACTIVE_PHASE && x.stripeReady).length;
console.log('✅ Wrote', outPath);
console.log('   Categories:', CATEGORIES.length);
console.log('   Products (total):', PRODUCTS.length);
console.log('   Active phase:', SHOP_ACTIVE_PHASE, '→ visible:', visible, '| checkout-ready:', checkoutReady);
