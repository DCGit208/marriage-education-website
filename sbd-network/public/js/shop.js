/**
 * SHOP PAGE — phased marriageducation.com catalog
 * Loads /data/shop-catalog.json; section layouts: membership tiers, books, academy, bundles.
 */

let currentUserId = null;
let shopCurrentUser = null;
let PRODUCT_CATALOG = {};
let SHOP_CATEGORIES = [];
let SHOP_PRODUCTS = [];
let SHOP_ACTIVE_PHASE = 1;
let SHOP_PHASES = [];
let SHOP_SECTIONS = [];
let activeCategory = 'all';
let activeSection = 'all';
let activeSchool1Series = 'all';
let shopSearchQuery = '';

const MEMBERSHIP_TIER_IDS = ['foundation-monthly', 'premium-monthly', 'elite-monthly'];

const MEMBERSHIP_TIER_META = {
  'foundation-monthly': {
    slug: 'foundation',
    icon: '🟢',
    featured: false,
    yearlyId: 'foundation-yearly',
    features: [
      'Partial Teleios Identity (Weeks 1–4)',
      'Partial Sexual Literacy intro',
      '5 discussion boards',
      'Progress tracking',
      'Community access',
    ],
  },
  'premium-monthly': {
    slug: 'premium',
    icon: '🔵',
    featured: true,
    badge: 'Popular',
    features: [
      'Full Teleios Identity',
      'Full Sexual Literacy course',
      '10 discussion boards',
      'Quizzes & certificates',
      'Assignment submissions',
      'Priority support',
    ],
  },
  'elite-monthly': {
    slug: 'elite',
    icon: '🔴',
    featured: false,
    badge: 'Elite',
    features: [
      'Everything in Premium',
      'Muliebrity & Virility schools',
      '20 elite discussion boards',
      'Advanced content library',
      'Full academy access',
      'Coaching pathways',
    ],
  },
};

const SCHOOL_VISUAL = {
  school1: { from: '#1a3a52', to: '#0d1f2e', label: 'School 1 — Teleios' },
  school2: { from: '#1a3d2e', to: '#0f2418', label: 'School 2 — Sexual Literacy' },
  school3: { from: '#3d2e1a', to: '#24180f', label: 'School 3 — Marriage Systems' },
  school4: { from: '#3d281a', to: '#1f150d', label: 'School 4 — Civilization' },
};

const SECTION_INTROS = {
  membership: 'Subscribe for structured learning across the academy. Cancel anytime.',
  books_magazine: 'Purchase to own — digital and print formats from the Marriage Education library.',
  academy: 'Programs match marriageducation.com — full details, duration, and what you will master before checkout.',
  bundles_diplomas: 'Save with curated bundles, diplomas, coaching, and lifetime passes.',
};

const HERO_COPY = {
  all: {
    title: 'Own Your Formation',
    subtitle: 'Membership for learning. Purchase to own books, courses, and bundles forever.',
  },
  membership: {
    title: 'Choose Your Membership Tier',
    subtitle: 'Subscribe for structured learning pathways and ongoing access across the academy.',
  },
  books_magazine: {
    title: 'Build Your Library',
    subtitle: 'Own digital and print resources that support covenant life, sexuality, and family development.',
  },
  academy: {
    title: 'Academy Programs That Transform',
    subtitle: 'Structured courses with clear outcomes, practical drills, and direct path to checkout.',
  },
  bundles_diplomas: {
    title: 'Bundles, Diplomas, and Intensive Paths',
    subtitle: 'Accelerate growth with high-impact packages, certifications, coaching, and lifetime access.',
  },
};

const BUNDLE_BANNER_PRIORITY = [
  'complete-sbd-library',
  'marriage-foundation-bundle',
  'academy-complete-bundle',
];

// Hero preview switch:
// 'current' | 'editorial-split' | 'cinematic-story' | 'luxury-minimal'
const HERO_STYLE_OPTIONS = ['fullwidth-slider', 'editorial-split', 'cinematic-story', 'luxury-minimal', 'current'];
const DEFAULT_HERO_STYLE = 'fullwidth-slider';
let shopHeroStyle = (function () {
  try {
    var saved = localStorage.getItem('shopHeroStyle');
    if (saved && HERO_STYLE_OPTIONS.indexOf(saved) >= 0) return saved;
  } catch (_) {}
  return DEFAULT_HERO_STYLE;
})();
let heroCarouselTimer = null;
let heroCarouselIndex = 0;

// Quick rollback switch:
// - 'apple'   => colorful App Store-inspired program cards
// - 'classic' => previous text-heavy dark cards
const SHOP_PROGRAM_CARD_STYLE = 'apple';

function resolveShopProductId(productId) {
  var idsApi = (typeof window !== 'undefined' ? window : global).SBDShopProductIds;
  if (idsApi && typeof idsApi.resolve === 'function') {
    return idsApi.resolve(productId);
  }
  var normalized = typeof productId === 'string' ? productId.trim() : '';
  return normalized || '';
}

firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = '/auth?next=' + encodeURIComponent('/shop.html');
    return;
  }
  currentUserId = user.uid;
  shopCurrentUser = user;
  try {
    const userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
    if (userDoc.exists) {
      shopCurrentUser = { ...user, ...userDoc.data() };
    }
  } catch (e) {
    console.warn('[Shop] user doc load failed:', e);
  }
  await loadShopCatalog();
  renderShopPage();
});

async function loadShopCatalog() {
  const res = await fetch('/data/shop-catalog.json?v=5');
  if (!res.ok) throw new Error('Could not load shop catalog');
  const data = await res.json();
  SHOP_ACTIVE_PHASE = Number(data.activePhase) || 1;
  SHOP_PHASES = data.phases || [];
  SHOP_SECTIONS = [{ id: 'all', label: 'All products' }].concat(data.sections || []);
  SHOP_CATEGORIES = [{ id: 'all', label: 'All', icon: '◇', sort: 0 }].concat(data.categories || []);
  SHOP_PRODUCTS = (data.products || []).filter(function (p) {
    return p.status !== 'inactive' && (p.phase || 1) <= SHOP_ACTIVE_PHASE;
  });
  PRODUCT_CATALOG = {};
  SHOP_PRODUCTS.forEach(function (p) {
    PRODUCT_CATALOG[p.id] = normalizeCatalogProduct(p);
  });
  await mergeStudioShopProducts();
  applyShopUrlParams();
  console.log('[Shop] Catalog loaded: phase', SHOP_ACTIVE_PHASE, '→', SHOP_PRODUCTS.length, 'visible products');
}

function applyShopUrlParams() {
  var params = new URLSearchParams(window.location.search || '');
  var section = params.get('section');
  var category = params.get('category');
  var series = params.get('series');
  var q = params.get('q') || params.get('search');
  if (section && SHOP_SECTIONS.some(function (item) { return item.id === section; })) {
    activeSection = section;
  }
  if (category && SHOP_CATEGORIES.some(function (item) { return item.id === category; })) {
    activeCategory = category;
  }
  if (series === 'A' || series === 'B') activeSchool1Series = series;
  if (q) {
    shopSearchQuery = q;
  }
}

/** Merge Course Studio–published books from Firestore into the static catalog. */
async function mergeStudioShopProducts() {
  if (typeof db === 'undefined' || !db) return;
  try {
    const snap = await db.collection('shopProducts')
      .where('studioPublished', '==', true)
      .limit(200)
      .get();
    if (snap.empty) return;
    snap.forEach(function (doc) {
      const raw = doc.data() || {};
      if (raw.status === 'inactive') return;
      if (!raw.studioManaged && !raw.studioPublished) return;
      const p = Object.assign({}, raw, { id: doc.id });
      if ((p.phase || 1) > SHOP_ACTIVE_PHASE) return;
      const normalized = normalizeCatalogProduct(p);
      const existingIdx = SHOP_PRODUCTS.findIndex(function (x) { return x.id === normalized.id; });
      if (existingIdx >= 0) {
        SHOP_PRODUCTS[existingIdx] = Object.assign({}, SHOP_PRODUCTS[existingIdx], normalized);
      } else {
        SHOP_PRODUCTS.push(normalized);
      }
      PRODUCT_CATALOG[normalized.id] = normalized;
    });
    console.log('[Shop] Merged studio products from Firestore');
  } catch (err) {
    console.warn('[Shop] Studio product merge skipped:', err.message || err);
  }
}

function normalizeCatalogProduct(p) {
  return {
    id: p.id,
    name: p.name,
    description: p.description || '',
    price: p.priceUsd,
    priceUsd: p.priceUsd,
    priceSuffix: p.priceSuffix || '',
    originalPrice: p.originalPriceUsd,
    currency: 'USD',
    type: p.type || 'book',
    category: p.category,
    icon: p.icon || '📘',
    recurring: !!p.recurring,
    stripeReady: !!p.stripeReady,
    phase: p.phase || 1,
    unlocks: p.unlocks || null,
    schoolId: p.schoolId || null,
    school1Section: p.school1Section || null,
    section: p.section || inferSectionFromCategory(p.category),
    subcategory: p.subcategory || null,
    coverImage: p.coverImage || '',
    coverWrapImage: p.coverWrapImage || '',
    visualKey: p.visualKey || '',
    sourceUrl: p.sourceUrl || '',
    requiredTier: p.requiredTier || 'free',
    priceDisplay: p.priceDisplay || '',
    program: p.program || null,
  };
}

function shouldUseCourseProgramLayout() {
  if (shopSearchQuery.trim()) return false;
  if (activeSection === 'academy' || activeSection === 'bundles_diplomas') return true;
  if (activeCategory.startsWith('courses_') || activeCategory === 'course_bundles') return true;
  if (
    activeCategory === 'diplomas_certifications' ||
    activeCategory === 'coaching_live' ||
    activeCategory === 'lifetime_pass'
  ) return true;
  return false;
}

function shouldRenderAsProgramCard(product) {
  if (!product || !product.program) return false;
  if (shouldUseCourseProgramLayout()) return true;
  if (activeSection !== 'all') return false;
  return (
    product.section === 'academy' ||
    product.category === 'diplomas_certifications' ||
    product.category === 'coaching_live' ||
    product.category === 'lifetime_pass'
  );
}

function computeSavingsPercent(price, original) {
  if (!original || original <= price) return 0;
  return Math.round((1 - price / original) * 100);
}

function inferSectionFromCategory(categoryId) {
  if (categoryId === 'network_subscription') return 'membership';
  if (categoryId === 'book_bundles' || categoryId === 'diplomas_certifications' || categoryId === 'coaching_live' || categoryId === 'lifetime_pass') {
    return 'bundles_diplomas';
  }
  if (categoryId === 'courses_entry' || categoryId === 'courses_school1' || categoryId === 'courses_school2' || categoryId === 'courses_school3' || categoryId === 'courses_school4' || categoryId === 'course_bundles') {
    return 'academy';
  }
  return 'books_magazine';
}

function formatPrice(product) {
  if (product.priceDisplay) return product.priceDisplay;
  var amount = '$' + (Number(product.priceUsd) % 1 === 0 ? product.priceUsd : product.priceUsd.toFixed(2));
  return amount + (product.priceSuffix || '');
}

function encodeCoverPath(coverPath) {
  if (!coverPath) return '';
  if (coverPath.indexOf('http://') === 0 || coverPath.indexOf('https://') === 0) return coverPath;
  var parts = coverPath.split('/').filter(function (seg) { return seg.length > 0; });
  return '/' + parts.map(function (seg) { return encodeURIComponent(seg); }).join('/');
}

function getVisualStyle(product) {
  if (product.schoolId && SCHOOL_VISUAL[product.schoolId]) {
    var s = SCHOOL_VISUAL[product.schoolId];
    return { from: s.from, to: s.to, label: s.label };
  }
  var defaults = {
    bundle: { from: '#1a3a4a', to: '#0a1520', label: 'Bundle' },
    diploma: { from: '#3d2e5a', to: '#1a1028', label: 'Certification' },
    coaching: { from: '#2e3d1a', to: '#151f0d', label: 'Coaching' },
    lifetime: { from: '#4a3d1a', to: '#281f0d', label: 'Lifetime' },
    magazine: { from: '#2a2a3a', to: '#121218', label: 'Magazine' },
    course: { from: '#1a2a4a', to: '#0d1528', label: 'Course' },
    book: { from: '#2a1f1a', to: '#140f0d', label: 'Book' },
    default: { from: '#1a2a3a', to: '#0a0a0a', label: '' },
  };
  var key = product.visualKey || 'default';
  if (key.indexOf('membership-') === 0) return defaults.course;
  return defaults[key] || defaults.default;
}

const SHOP_SEARCH_STOPWORDS = [
  'a', 'an', 'and', 'about', 'around', 'for', 'from', 'me', 'my', 'of', 'on', 'or', 'the', 'to', 'with',
  'book', 'books', 'course', 'courses', 'resource', 'resources', 'recommend', 'recommendation', 'suggest',
  'show', 'find', 'give', 'need', 'want',
];

const SHOP_TOPIC_ALIASES = [
  { id: 'sexuality', terms: ['sex', 'sexual', 'sexuality', 'intimacy', 'intimate', 'conjugal', 'arousal', 'desire', 'erotic', 'bedroom', 'nakedness'] },
  { id: 'communication', terms: ['communication', 'communicate', 'conversation', 'conflict', 'argue', 'argument', 'peacekeeping', 'relationship', 'relatedness'] },
  { id: 'identity', terms: ['identity', 'personal', 'development', 'growth', 'maturity', 'formation', 'teleios', 'self', 'wholeness'] },
  { id: 'leadership', terms: ['leadership', 'civilization', 'nation', 'governance', 'family', 'parenting', 'culture', 'political', 'human rights'] },
  { id: 'membership', terms: ['membership', 'subscription', 'tier', 'foundation', 'premium', 'elite', 'access', 'unlock'] },
  { id: 'expression', terms: ['expression', 'fashion', 'image', 'presence', 'masculine', 'feminine', 'muliebrity', 'virility', 'mv house'] },
  { id: 'marriage', terms: ['marriage', 'covenant', 'spouse', 'couple', 'husband', 'wife', 'home'] },
];

const SHOP_PRODUCT_TOPIC_HINTS = {
  'sbd-the-heart-of-relationship': ['communication', 'marriage', 'relationship'],
  'communication-covenant-couples': ['communication', 'marriage'],
  'conflict-mastery': ['communication', 'conflict', 'marriage'],
  'sbd-dummies': ['sexuality', 'marriage', 'covenant'],
  'the-art-of-sexuality': ['sexuality', 'intimacy'],
  'marriage-equals-sexuality': ['sexuality', 'marriage'],
  'sexual-literacy-101': ['sexuality', 'course'],
  'sex-equals-marriage': ['sexuality', 'marriage'],
  'course-art-of-sexuality': ['sexuality', 'expression'],
  'teleios-blueprint': ['identity', 'formation'],
  'personal-development-masterclass': ['identity', 'formation'],
  'identity-mastery': ['identity', 'formation'],
  'civilizational-intelligence-masterclass': ['leadership', 'civilization'],
  'marriage-builds-nations': ['leadership', 'civilization', 'marriage'],
};

function normalizeShopSearchText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseShopSearchIntent(query) {
  var normalized = normalizeShopSearchText(query);
  var words = normalized.split(/\s+/).filter(Boolean);
  var type = '';
  if (/\b(books?|read|library)\b/.test(normalized)) type = 'book';
  if (/\b(courses?|classes?|study|learn|programs?)\b/.test(normalized)) type = 'course';
  if (/\b(membership|subscription|tier|plan|premium|elite|foundation)\b/.test(normalized)) type = 'membership';
  if (/\b(bundle|bundles|diploma|certification|certified|lifetime|coaching)\b/.test(normalized)) type = 'bundle';

  var topics = SHOP_TOPIC_ALIASES.filter(function (topic) {
    return topic.terms.some(function (term) { return normalized.indexOf(term) !== -1; });
  }).map(function (topic) { return topic.id; });

  var tokens = words.filter(function (word) {
    return word.length > 2 && SHOP_SEARCH_STOPWORDS.indexOf(word) === -1;
  });

  return { raw: normalized, type: type, topics: topics, tokens: tokens };
}

function productTypeForSearch(product) {
  var section = product.section || inferSectionFromCategory(product.category);
  if (section === 'membership' || product.category === 'network_subscription') return 'membership';
  if (section === 'academy' || product.category === 'course_bundles') return 'course';
  if (section === 'books_magazine' || product.category === 'book_bundles') return 'book';
  if (section === 'bundles_diplomas') return 'bundle';
  return product.type || '';
}

function productTopicsForSearch(product) {
  var topics = [];
  function add(topic) {
    if (topic && topics.indexOf(topic) === -1) topics.push(topic);
  }
  (SHOP_PRODUCT_TOPIC_HINTS[product.id] || []).forEach(add);
  if (product.schoolId === 'school1') add('identity');
  if (product.schoolId === 'school2') add('sexuality');
  if (product.schoolId === 'school3') {
    add('marriage');
    add('communication');
  }
  if (product.schoolId === 'school4') add('leadership');
  if (product.category === 'network_subscription') add('membership');
  if (product.category === 'books_arts_of_marriage') {
    add('sexuality');
    add('marriage');
  }
  var searchable = buildShopSearchText(product);
  SHOP_TOPIC_ALIASES.forEach(function (topic) {
    if (topic.terms.some(function (term) { return searchable.indexOf(term) !== -1; })) add(topic.id);
  });
  return topics;
}

function buildShopSearchText(product) {
  var category = SHOP_CATEGORIES.find(function (c) { return c.id === product.category; });
  var sectionId = product.section || inferSectionFromCategory(product.category);
  var section = SHOP_SECTIONS.find(function (s) { return s.id === sectionId; });
  var program = product.program || {};
  var features = Array.isArray(program.features) ? program.features.join(' ') : '';
  return normalizeShopSearchText([
    product.id,
    product.name,
    product.description,
    product.type,
    product.visualKey,
    product.category,
    category && category.label,
    section && section.label,
    product.schoolId,
    product.requiredTier,
    program.tagline,
    program.pitch,
    program.featureLabel,
    features,
    program.duration,
    program.format,
    program.badge,
    program.ctaLabel,
    productTopicsForSearchShallow(product).join(' '),
  ].filter(Boolean).join(' '));
}

function productTopicsForSearchShallow(product) {
  var topics = [];
  function add(topic) {
    if (topic && topics.indexOf(topic) === -1) topics.push(topic);
  }
  (SHOP_PRODUCT_TOPIC_HINTS[product.id] || []).forEach(add);
  if (product.schoolId === 'school1') add('identity');
  if (product.schoolId === 'school2') add('sexuality');
  if (product.schoolId === 'school3') add('communication');
  if (product.schoolId === 'school4') add('leadership');
  if (product.category === 'network_subscription') add('membership');
  return topics;
}

function shopSearchScore(product, intent) {
  if (!intent.raw) return 1;
  var productType = productTypeForSearch(product);
  if (intent.type && productType !== intent.type) return 0;

  var text = buildShopSearchText(product);
  var topics = productTopicsForSearch(product);
  var score = intent.type ? 12 : 0;

  if (text.indexOf(intent.raw) !== -1) score += 30;
  intent.topics.forEach(function (topic) {
    if (topics.indexOf(topic) !== -1) score += 18;
  });
  intent.tokens.forEach(function (token) {
    if ((product.name || '').toLowerCase().indexOf(token) !== -1) score += 12;
    else if (text.indexOf(token) !== -1) score += 5;
  });

  if (!intent.tokens.length && !intent.topics.length && intent.type) score += 5;
  return score;
}

function getFilteredProducts() {
  var intent = parseShopSearchIntent(shopSearchQuery);
  var scored = SHOP_PRODUCTS.map(function (p) {
    return { product: p, score: intent.raw ? shopSearchScore(p, intent) : 1 };
  }).filter(function (entry) {
    var p = entry.product;
    if (activeSection !== 'all' && inferSectionFromCategory(p.category) !== activeSection) return false;
    if (activeCategory !== 'all' && p.category !== activeCategory) return false;
    if (activeCategory === 'courses_school1' && activeSchool1Series !== 'all' && p.school1Section !== activeSchool1Series) return false;
    return !intent.raw || entry.score > 0;
  }).sort(function (a, b) {
    if (intent.raw && b.score !== a.score) return b.score - a.score;
    return (a.product.sortOrder || 999) - (b.product.sortOrder || 999);
  });
  return scored.map(function (entry) { return entry.product; });
}

function shouldShowMembershipGrid() {
  if (shopSearchQuery.trim()) return false;
  if (activeCategory !== 'all' && activeCategory !== 'network_subscription') return false;
  return activeSection === 'membership' || activeSection === 'all';
}

function getGridProducts() {
  var products = getFilteredProducts().map(function (p) {
    return PRODUCT_CATALOG[p.id] || normalizeCatalogProduct(p);
  });
  if (shouldShowMembershipGrid()) {
    products = products.filter(function (p) {
      return p.category !== 'network_subscription';
    });
  }
  return products;
}

function getGridLayoutClass() {
  if (shouldUseCourseProgramLayout()) return 'product-grid product-grid--programs';
  if (activeSection === 'books_magazine') return 'product-grid product-grid--books';
  if (activeSection === 'membership') return 'product-grid product-grid--hidden';
  return 'product-grid';
}

function renderShopPage() {
  var searchInput = document.getElementById('shopSearchInput');
  if (searchInput && searchInput.value !== shopSearchQuery) {
    searchInput.value = shopSearchQuery;
  }
  renderHeroContent();
  renderPhaseBanner();
  renderSectionFilters();
  renderCategoryFilters();
  renderSchool1SeriesBar();
  renderSchool1CollectionHero();
  renderBundleBanner();
  renderSectionIntro();
  renderMembershipGrid();
  renderProgramRail();
  renderProductGrid();
  var countEl = document.getElementById('shopProductCount');
  if (countEl) countEl.textContent = getFilteredProducts().length + ' items';
  renderSearchInsights();
}

function labelForSearchType(type) {
  if (type === 'book') return 'Books';
  if (type === 'course') return 'Courses';
  if (type === 'membership') return 'Membership';
  if (type === 'bundle') return 'Bundles & high-ticket';
  return '';
}

function labelForSearchTopic(topic) {
  var labels = {
    sexuality: 'Sexuality',
    communication: 'Communication',
    identity: 'Identity & growth',
    leadership: 'Leadership',
    membership: 'Membership',
    expression: 'Expression',
    marriage: 'Marriage',
  };
  return labels[topic] || topic;
}

function searchSuggestionChips(intent) {
  var chips = [];
  if (intent.type) chips.push({ label: labelForSearchType(intent.type), kind: 'type' });
  intent.topics.forEach(function (topic) {
    chips.push({ label: labelForSearchTopic(topic), kind: 'topic' });
  });
  intent.tokens.slice(0, 3).forEach(function (token) {
    var label = token.charAt(0).toUpperCase() + token.slice(1);
    if (!chips.some(function (chip) { return chip.label.toLowerCase() === label.toLowerCase(); })) {
      chips.push({ label: label, kind: 'term' });
    }
  });
  return chips;
}

function searchSuggestionLinks(intent) {
  var links = [];
  if (intent.type !== 'book') links.push({ label: 'Books', section: 'books_magazine', q: intent.tokens.join(' ') || '' });
  if (intent.type !== 'course') links.push({ label: 'Courses', section: 'academy', q: intent.tokens.join(' ') || '' });
  if (intent.type !== 'membership') links.push({ label: 'Membership', section: 'membership', q: '' });
  links.push({ label: 'Ask SBD', ask: true });
  return links.slice(0, 4);
}

function renderSearchInsights() {
  var panel = document.getElementById('shopSearchInsights');
  if (!panel) return;
  var intent = parseShopSearchIntent(shopSearchQuery);
  if (!intent.raw) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  var products = getFilteredProducts();
  var chips = searchSuggestionChips(intent);
  var chipHtml = chips.map(function (chip) {
    return '<span class="shop-search-chip shop-search-chip--' + escapeShopHtml(chip.kind) + '">' + escapeShopHtml(chip.label) + '</span>';
  }).join('');
  panel.hidden = false;
  panel.innerHTML =
    '<div class="shop-search-insights__copy">' +
    '<strong>' + escapeShopHtml(products.length + ' result' + (products.length === 1 ? '' : 's')) + '</strong>' +
    '<span>for “' + escapeShopHtml(intent.raw) + '”</span>' +
    '</div>' +
    (chipHtml ? '<div class="shop-search-insights__chips" aria-label="Detected search intent">' + chipHtml + '</div>' : '');
}

function renderHeroContent() {
  var hero = document.getElementById('shopHero');
  var mount = document.getElementById('shopHeroMount');
  if (!hero || !mount) return;

  var key = activeSection in HERO_COPY ? activeSection : 'all';
  var copy = HERO_COPY[key] || HERO_COPY.all;
  var filtered = getFilteredProducts();
  var ready = filtered.filter(function (p) { return p.stripeReady; }).length;
  var products = filtered.length;
  var sections = Math.max((SHOP_SECTIONS.length || 1) - 1, 1);
  var featured = getHeroFeaturedProducts(filtered);
  clearHeroCarousel();

  hero.className = 'shop-hero shop-hero--' + shopHeroStyle;
  if (shopHeroStyle === 'fullwidth-slider') {
    mount.innerHTML = buildFullwidthSliderHero(copy, filtered, ready, products);
    wireFullwidthSlider();
  } else if (shopHeroStyle === 'cinematic-story') {
    mount.innerHTML = buildCinematicHero(copy, featured, ready, products, sections);
    wireHeroCarousel(featured);
  } else if (shopHeroStyle === 'luxury-minimal') {
    mount.innerHTML = buildLuxuryHero(copy, featured, ready, products);
  } else if (shopHeroStyle === 'editorial-split') {
    mount.innerHTML = buildEditorialHero(copy, featured, ready, products);
  } else {
    mount.innerHTML =
      '<div class="shop-hero-current">' +
      '<p class="shop-hero__eyebrow">SBD Network Commerce</p>' +
      '<h1>' + escapeShopHtml(copy.title) + '</h1>' +
      '<p>' + escapeShopHtml(copy.subtitle) + '</p>' +
      '<div class="shop-hero__chips"><span>Instant unlocks</span><span>Secure checkout</span><span>Lifetime ownership</span></div>' +
      '<div class="shop-hero__stats"><div><strong>' + products + '</strong><small>Products</small></div><div><strong>' + ready + '</strong><small>Ready now</small></div><div><strong>' + sections + '</strong><small>Shop areas</small></div></div>' +
      '</div>';
  }

  mount.querySelector('#heroPrimaryCta')?.addEventListener('click', function () {
    activeSection = 'academy';
    activeCategory = 'all';
    renderShopPage();
  });
  mount.querySelector('#heroSecondaryCta')?.addEventListener('click', function () {
    activeSection = 'membership';
    activeCategory = 'all';
    renderShopPage();
  });
}

function buildFullwidthSliderHero(copy, filtered, ready, products) {
  var slides = getSliderProducts(filtered);
  var htmlSlides = slides.map(function (p) {
    var src = p.coverImage ? encodeCoverPath(p.coverImage) : '';
    var categoryLabel = getCategoryLabel(p.category);
    var badge = (p.category === 'magazine') ? 'Magazine' : categoryLabel;
    return (
      '<article class="hero-slide-card' +
      (src ? ' hero-slide-card--artwork' : '') +
      (p.id === 'teleios-blueprint' || p.id === 'teleios-blueprint-full' ? ' hero-slide-card--teleios-cover' : '') +
      (p.id === 'teleios-bundle' ? ' hero-slide-card--teleios-bundle' : '') +
      '" data-hero-product="' + escapeShopHtml(p.id) + '">' +
      '<div class="hero-slide-card__media">' +
      (src ? '<img class="hero-slide-card__artwork" loading="lazy" src="' + escapeShopHtml(src) + '" alt="' + escapeShopHtml(p.name) + ' artwork">' : '') +
      '<span class="hero-slide-card__badge">' + escapeShopHtml(badge) + '</span>' +
      '</div>' +
      '<div class="hero-slide-card__body">' +
      '<h3>' + escapeShopHtml(p.name) + '</h3>' +
      '<p>' + escapeShopHtml((p.program && p.program.tagline) || p.description || '') + '</p>' +
      '<div class="hero-slide-card__meta"><strong>' + escapeShopHtml(formatPrice(p)) + '</strong><button type="button" class="hero-slide-card__cta" data-buy="' + escapeShopHtml(p.id) + '">View</button></div>' +
      '</div></article>'
    );
  }).join('');

  return (
    '<div class="shop-hero-slider">' +
    '<div class="shop-hero-slider__viewport-wrap">' +
    '<button type="button" class="shop-hero-slider__nav shop-hero-slider__nav--prev" aria-label="Previous">‹</button>' +
    '<div class="shop-hero-slider__viewport" id="shopHeroSliderViewport">' + htmlSlides + '</div>' +
    '<button type="button" class="shop-hero-slider__nav shop-hero-slider__nav--next" aria-label="Next">›</button>' +
    '</div></div>'
  );
}

function getSliderProducts(filtered) {
  var preferredOrder = ['courses_entry', 'magazine', 'books_sbd_series', 'course_bundles', 'diplomas_certifications', 'book_bundles'];
  var byCategory = {};
  (filtered || []).forEach(function (p) {
    if (!p.stripeReady) return;
    var normalized = PRODUCT_CATALOG[p.id] || p;
    if (!byCategory[p.category]) byCategory[p.category] = [];
    byCategory[p.category].push(normalized);
  });
  var out = [];
  preferredOrder.forEach(function (cat) {
    var list = byCategory[cat] || [];
    if (list.length) out.push(list[0]);
  });
  var fallback = (filtered || []).filter(function (p) { return p.stripeReady; }).map(function (p) { return PRODUCT_CATALOG[p.id] || p; });
  for (var i = 0; i < fallback.length && out.length < 8; i++) {
    if (!out.some(function (x) { return x.id === fallback[i].id; })) out.push(fallback[i]);
  }
  return out.slice(0, 8);
}

function getCategoryLabel(categoryId) {
  var cat = SHOP_CATEGORIES.find(function (c) { return c.id === categoryId; });
  return cat ? cat.label : 'Featured';
}

function wireFullwidthSlider() {
  var viewport = document.getElementById('shopHeroSliderViewport');
  if (!viewport) return;
  var prev = document.querySelector('.shop-hero-slider__nav--prev');
  var next = document.querySelector('.shop-hero-slider__nav--next');
  var cards = Array.from(viewport.querySelectorAll('.hero-slide-card'));
  if (!cards.length) return;

  function slideBy(direction) {
    var cardWidth = cards[0].getBoundingClientRect().width + 14;
    viewport.scrollBy({ left: direction * cardWidth, behavior: 'smooth' });
  }

  prev?.addEventListener('click', function () { slideBy(-1); });
  next?.addEventListener('click', function () { slideBy(1); });

  viewport.querySelectorAll('[data-buy]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var id = btn.getAttribute('data-buy');
      if (id) buyProduct(id);
    });
  });
  cards.forEach(function (card) {
    card.addEventListener('click', function () {
      var id = card.getAttribute('data-hero-product');
      if (id) buyProduct(id);
    });
  });

  heroCarouselTimer = setInterval(function () {
    var maxScroll = viewport.scrollWidth - viewport.clientWidth - 4;
    if (viewport.scrollLeft >= maxScroll) viewport.scrollTo({ left: 0, behavior: 'smooth' });
    else slideBy(1);
  }, 5000);
}

function getHeroFeaturedProducts(list) {
  var arr = (list || []).filter(function (p) {
    return p.stripeReady && p.coverImage;
  });
  if (!arr.length) arr = (list || []).filter(function (p) { return p.stripeReady; });
  arr = arr.slice(0, 6).map(function (p) { return PRODUCT_CATALOG[p.id] || p; });
  if (!arr.length) return [];
  return arr;
}

function buildEditorialHero(copy, featured, ready, products) {
  var media = featured.slice(0, 3).map(function (p, i) {
    var src = p.coverImage ? encodeCoverPath(p.coverImage) : '';
    return '<button type="button" class="hero-editorial-media__item" data-hero-product="' + escapeShopHtml(p.id) + '" style="--delay:' + (i * 90) + 'ms">' +
      (src ? '<img src="' + escapeShopHtml(src) + '" alt="' + escapeShopHtml(p.name) + '" loading="lazy">' : '<span>' + escapeShopHtml(p.icon || '📘') + '</span>') +
      '</button>';
  }).join('');
  return '<div class="shop-hero-editorial">' +
    '<div class="shop-hero-editorial__left">' +
    '<p class="shop-hero__eyebrow">Curated Formation Commerce</p>' +
    '<h1>' + escapeShopHtml(copy.title) + '</h1>' +
    '<p>' + escapeShopHtml(copy.subtitle) + '</p>' +
    '<div class="shop-hero-cta-row">' +
    '<button type="button" class="btn btn-primary" id="heroPrimaryCta">Explore Programs</button>' +
    '<button type="button" class="btn btn-secondary" id="heroSecondaryCta">Membership Tiers</button>' +
    '</div></div>' +
    '<aside class="shop-hero-editorial__spotlight">' +
    '<div class="hero-editorial-media">' + media + '</div>' +
    '<div class="hero-editorial-meta"><strong>' + products + '</strong><small>curated programs</small><strong>' + ready + '</strong><small>ready now</small></div>' +
    '</aside></div>';
}

function buildCinematicHero(copy, featured, ready, products, sections) {
  var first = featured[0] || null;
  var bg = first && first.coverImage ? encodeCoverPath(first.coverImage) : '';
  var rail = featured.slice(0, 4).map(function (p, i) {
    var src = p.coverImage ? encodeCoverPath(p.coverImage) : '';
    return '<button type="button" class="hero-cinematic-rail__item' + (i === 0 ? ' active' : '') + '" data-hero-index="' + i + '">' +
      (src ? '<img src="' + escapeShopHtml(src) + '" alt="' + escapeShopHtml(p.name) + '" loading="lazy">' : '<span>' + escapeShopHtml(p.icon || '📘') + '</span>') +
      '<small>' + escapeShopHtml(p.name) + '</small></button>';
  }).join('');
  return '<div class="shop-hero-cinematic">' +
    '<div class="shop-hero-cinematic__backdrop"' + (bg ? ' style="background-image:url(\'' + escapeShopHtml(bg) + '\')"' : '') + '></div>' +
    '<div class="shop-hero-cinematic__content">' +
    '<p class="shop-hero__eyebrow">Spotlight Collection</p>' +
    '<h1>' + escapeShopHtml(copy.title) + '</h1>' +
    '<p>' + escapeShopHtml(copy.subtitle) + '</p>' +
    '<div class="shop-hero-cta-row">' +
    '<button type="button" class="btn btn-primary" id="heroPrimaryCta">Explore Academy</button>' +
    '<button type="button" class="btn btn-secondary" id="heroSecondaryCta">View Membership</button>' +
    '</div></div>' +
    '<div class="shop-hero-cinematic__stats"><div><strong>' + ready + '</strong><small>ready now</small></div><div><strong>' + products + '</strong><small>programs</small></div><div><strong>' + sections + '</strong><small>areas</small></div></div>' +
    '<div class="hero-cinematic-rail">' + rail + '</div>' +
    '</div>';
}

function buildLuxuryHero(copy, featured, ready, products) {
  var first = featured[0] || null;
  var src = first && first.coverImage ? encodeCoverPath(first.coverImage) : '';
  return '<div class="shop-hero-luxury">' +
    '<div class="shop-hero-luxury__line"></div>' +
    '<p class="shop-hero__eyebrow">SBD Signature Collection</p>' +
    '<h1>' + escapeShopHtml(copy.title) + '</h1>' +
    '<p>' + escapeShopHtml(copy.subtitle) + '</p>' +
    '<div class="shop-hero-luxury__proof"><span>' + products + ' premium programs</span><span>' + ready + ' ready now</span></div>' +
    '<div class="shop-hero-cta-row"><button type="button" class="btn btn-primary" id="heroPrimaryCta">Start Here</button></div>' +
    (src ? '<figure class="shop-hero-luxury__cover"><img src="' + escapeShopHtml(src) + '" alt="' + escapeShopHtml(first.name) + '" loading="lazy"></figure>' : '') +
    '</div>';
}

function wireHeroCarousel(featured) {
  var hero = document.getElementById('shopHero');
  if (!hero) return;
  var backdrop = hero.querySelector('.shop-hero-cinematic__backdrop');
  var items = Array.from(hero.querySelectorAll('.hero-cinematic-rail__item'));
  if (!backdrop || !items.length || !featured.length) return;

  function setActive(index) {
    heroCarouselIndex = index % items.length;
    items.forEach(function (el, i) { el.classList.toggle('active', i === heroCarouselIndex); });
    var p = featured[heroCarouselIndex];
    if (p && p.coverImage) backdrop.style.backgroundImage = 'url("' + encodeCoverPath(p.coverImage) + '")';
  }

  items.forEach(function (el) {
    el.addEventListener('click', function () {
      var idx = Number(el.getAttribute('data-hero-index'));
      if (!Number.isNaN(idx)) setActive(idx);
    });
  });

  setActive(0);
  heroCarouselTimer = setInterval(function () {
    setActive(heroCarouselIndex + 1);
  }, 4500);
}

function clearHeroCarousel() {
  if (heroCarouselTimer) {
    clearInterval(heroCarouselTimer);
    heroCarouselTimer = null;
  }
}

function renderPhaseBanner() {
  var note = document.getElementById('shopCatalogNote');
  var checkoutReady = SHOP_PRODUCTS.filter(function (p) { return p.stripeReady; }).length;
  var withCovers = SHOP_PRODUCTS.filter(function (p) { return p.coverImage; }).length;
  if (note) {
    note.textContent = SHOP_PRODUCTS.length + ' products · ' + checkoutReady + ' ready to checkout · ' + withCovers + ' with cover art.';
  }
}

function renderSectionIntro() {
  var el = document.getElementById('shopSectionIntro');
  if (!el) return;
  var key = activeSection === 'all' ? null : activeSection;
  var text = key ? SECTION_INTROS[key] : '';
  if (text && !shopSearchQuery.trim()) {
    el.textContent = text;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

function renderBundleBanner() {
  var banner = document.getElementById('shopBundleBanner');
  if (!banner) return;
  if (shopSearchQuery.trim() || (activeSection !== 'all' && activeSection !== 'bundles_diplomas')) {
    banner.hidden = true;
    return;
  }
  var flagship = null;
  for (var i = 0; i < BUNDLE_BANNER_PRIORITY.length; i++) {
    var id = BUNDLE_BANNER_PRIORITY[i];
    if (PRODUCT_CATALOG[id] && PRODUCT_CATALOG[id].stripeReady) {
      flagship = PRODUCT_CATALOG[id];
      break;
    }
  }
  if (!flagship) {
    var bundles = getFilteredProducts().filter(function (p) {
      return p.type === 'bundle' || p.category === 'book_bundles' || p.category === 'course_bundles';
    });
    if (bundles.length) flagship = PRODUCT_CATALOG[bundles[0].id];
  }
  if (!flagship) {
    banner.hidden = true;
    return;
  }
  var cover = flagship.coverImage ? encodeCoverPath(flagship.coverImage) : '';
  var savings = flagship.originalPrice
    ? '<p class="savings-text">Save vs buying separately — was $' + flagship.originalPrice + '</p>'
    : '';
  banner.innerHTML =
    '<h3>Featured bundle</h3>' +
    '<p>' + escapeShopHtml(flagship.description || flagship.name) + '</p>' +
    '<div class="shop-bundle-highlights">' +
    '<span>One checkout</span><span>Own forever</span><span>Instant unlock</span>' +
    '</div>' +
    savings +
    '<div class="shop-bundle-row">' +
    (cover ? '<img class="shop-bundle-cover" src="' + escapeShopHtml(cover) + '" alt="" loading="lazy">' : '') +
    '<div><p class="product-price">' + escapeShopHtml(formatPrice(flagship)) + '</p>' +
    '<button type="button" class="btn btn-primary" id="shopBundleCta">View bundle</button></div></div>';
  banner.hidden = false;
  banner.querySelector('#shopBundleCta').addEventListener('click', function () {
    buyProduct(flagship.id);
  });
}

function renderMembershipGrid() {
  var grid = document.getElementById('shopMembershipGrid');
  if (!grid) return;
  if (!shouldShowMembershipGrid()) {
    grid.hidden = true;
    grid.innerHTML = '';
    return;
  }
  grid.hidden = false;
  grid.innerHTML = '';
  MEMBERSHIP_TIER_IDS.forEach(function (tierId) {
    var product = PRODUCT_CATALOG[tierId];
    if (!product) return;
    if (activeSection === 'all' || activeSection === 'membership') {
      if (activeCategory === 'all' || activeCategory === 'network_subscription') {
        grid.appendChild(buildTierCard(product));
      }
    }
  });
}

function shouldShowProgramRail() {
  if (shopSearchQuery.trim()) return false;
  if (!shouldUseCourseProgramLayout()) return false;
  if (!(activeSection === 'academy' || activeSection === 'all')) return false;
  return activeCategory === 'all' || activeCategory === 'courses_entry';
}

function getProgramRailItems() {
  return getFilteredProducts().filter(function (p) {
    return p.category === 'courses_entry' && p.program;
  }).slice(0, 6).map(function (p) {
    return PRODUCT_CATALOG[p.id] || p;
  });
}

function renderProgramRail() {
  var rail = document.getElementById('shopProgramRail');
  if (!rail) return;
  if (!shouldShowProgramRail()) {
    rail.hidden = true;
    rail.innerHTML = '';
    return;
  }
  var items = getProgramRailItems();
  if (!items.length) {
    rail.hidden = true;
    rail.innerHTML = '';
    return;
  }
  rail.hidden = false;
  rail.innerHTML = '<h3 class="shop-program-rail__title">Start Here</h3><div class="shop-program-rail__track"></div>';
  var track = rail.querySelector('.shop-program-rail__track');
  items.forEach(function (p) {
    track.appendChild(buildProgramRailCard(p));
  });
}

function buildProgramRailCard(p) {
  var prog = p.program || {};
  var card = document.createElement('article');
  var accent = prog.accent || 'entry';
  card.className = 'shop-program-rail-card shop-program-rail-card--' + accent;
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  card.innerHTML =
    '<div class="shop-program-rail-card__poster"></div>' +
    '<div class="shop-program-rail-card__body">' +
    '<h4>' + escapeShopHtml(p.name) + '</h4>' +
    '<p>' + escapeShopHtml(prog.tagline || prog.pitch || p.description || '') + '</p>' +
    '<div class="shop-program-rail-card__meta"><span>' + escapeShopHtml(formatPrice(p)) + '</span><span>View</span></div>' +
    '</div>';
  function go() { buyProduct(p.id); }
  card.addEventListener('click', go);
  card.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
  });
  return card;
}

function buildTierCard(product) {
  var meta = MEMBERSHIP_TIER_META[product.id] || { slug: 'foundation', icon: product.icon, featured: false, features: [] };
  var card = document.createElement('article');
  card.className = 'tier-card tier-card--' + meta.slug + (meta.featured ? ' tier-card--featured' : '');
  if (product.stripeReady) {
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
  }
  var badge = meta.badge ? '<span class="tier-card__badge">' + escapeShopHtml(meta.badge) + '</span>' : '';
  var featuresHtml = meta.features.map(function (f) {
    return '<li>' + escapeShopHtml(f) + '</li>';
  }).join('');
  var yearly = meta.yearlyId ? PRODUCT_CATALOG[meta.yearlyId] : null;
  var yearlyHtml = yearly && yearly.stripeReady
    ? '<button type="button" class="product-btn-yearly btn btn-secondary">Pay yearly — ' +
      escapeShopHtml(formatPrice(yearly)) + '</button>'
    : '';
  card.innerHTML =
    badge +
    '<div class="tier-card__icon">' + escapeShopHtml(meta.icon || product.icon) + '</div>' +
    '<h3 class="tier-card__name">' + escapeShopHtml(product.name) + '</h3>' +
    '<p class="tier-card__desc">' + escapeShopHtml(product.description) + '</p>' +
    '<ul class="tier-card__features">' + featuresHtml + '</ul>' +
    '<p class="tier-card__price">' + escapeShopHtml(formatPrice(product)) + '</p>' +
    '<button type="button" class="product-btn btn btn-primary">Subscribe</button>' +
    yearlyHtml;

  if (product.stripeReady) {
    function go() { buyProduct(product.id); }
    card.addEventListener('click', go);
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
    card.querySelector('.product-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      go();
    });
    var yearlyBtn = card.querySelector('.product-btn-yearly');
    if (yearlyBtn) {
      yearlyBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        buyProduct(meta.yearlyId);
      });
    }
  }
  return card;
}

function renderCategoryFilters() {
  var bar = document.getElementById('shopCategoryBar');
  if (!bar) return;
  bar.innerHTML = '';
  var visibleCats = {};
  SHOP_PRODUCTS.forEach(function (p) {
    if (activeSection === 'all' || inferSectionFromCategory(p.category) === activeSection) {
      visibleCats[p.category] = true;
    }
  });
  SHOP_CATEGORIES.filter(function (cat) {
    return cat.id === 'all' || visibleCats[cat.id];
  }).forEach(function (cat) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shop-cat-btn' + (activeCategory === cat.id ? ' active' : '');
    btn.textContent = (cat.icon ? cat.icon + ' ' : '') + cat.label;
    btn.addEventListener('click', function () {
      activeCategory = cat.id;
      if (cat.id !== 'courses_school1') activeSchool1Series = 'all';
      renderShopPage();
    });
    bar.appendChild(btn);
  });
}

function renderSchool1SeriesBar() {
  var bar = document.getElementById('shopSchool1SeriesBar');
  if (!bar) return;
  if (activeCategory !== 'courses_school1' || shopSearchQuery.trim()) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }
  bar.hidden = false;
  bar.innerHTML = '';
  [
    { id: 'all', label: 'All School 1' },
    { id: 'A', label: 'Series A — Core Personal Development' },
    { id: 'B', label: 'Series B — Relationship Psychology & Self-Formation' }
  ].forEach(function (series) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shop-series-btn' + (activeSchool1Series === series.id ? ' active' : '');
    btn.textContent = series.label;
    btn.addEventListener('click', function () {
      activeSchool1Series = series.id;
      renderShopPage();
    });
    bar.appendChild(btn);
  });
}

function renderSchool1CollectionHero() {
  var el = document.getElementById('shopSchool1CollectionHero');
  if (!el) return;
  if (activeCategory !== 'courses_school1' || activeSchool1Series !== 'A' || shopSearchQuery.trim()) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.innerHTML =
    '<div class="school1-collection-hero__art">' +
      '<img src="/images/school1/series-a/collection-series-a.png" alt="School 1 Series A — Core Personal Development Programs" loading="eager">' +
    '</div>' +
    '<div class="school1-collection-hero__copy">' +
      '<span>School 1 · Series A</span>' +
      '<h2>Core Personal Development Programs</h2>' +
      '<p>Seven programs forming the core personal-development pathway of the Teleios School.</p>' +
      '<strong>Explore the seven programs below.</strong>' +
    '</div>';
}

function renderSectionFilters() {
  var bar = document.getElementById('shopSectionBar');
  if (!bar) return;
  bar.innerHTML = '';
  SHOP_SECTIONS.forEach(function (section) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shop-section-btn' + (activeSection === section.id ? ' active' : '');
    btn.textContent = section.label;
    btn.addEventListener('click', function () {
      activeSection = section.id;
      activeCategory = 'all';
      renderShopPage();
    });
    bar.appendChild(btn);
  });
}

function renderProductGrid() {
  var grid = document.getElementById('shopProductGrid');
  if (!grid) return;
  var products = getGridProducts();
  if (shouldShowProgramRail() && activeCategory === 'all') {
    var railIds = new Set(getProgramRailItems().map(function (p) { return p.id; }));
    products = products.filter(function (p) { return !railIds.has(p.id); });
  }
  var layoutClass = getGridLayoutClass();
  grid.className = layoutClass;
  grid.innerHTML = '';

  if (activeSection === 'membership' && shouldShowMembershipGrid()) {
    return;
  }

  if (products.length === 0) {
    grid.innerHTML = emptyShopSearchHtml();
    return;
  }
  var useProgramCards = shouldUseCourseProgramLayout();
  products.forEach(function (p, idx) {
    if ((useProgramCards && p.program) || shouldRenderAsProgramCard(p)) {
      grid.appendChild(buildCourseProgramCard(p, idx));
    } else {
      grid.appendChild(buildProductCard(p));
    }
  });
}

function emptyShopSearchHtml() {
  var intent = parseShopSearchIntent(shopSearchQuery);
  if (!intent.raw) return '<p class="shop-empty">No products match your filter.</p>';
  var links = searchSuggestionLinks(intent).map(function (link) {
    if (link.ask) {
      return '<button type="button" class="shop-empty-action" data-shop-empty-ask>Ask SBD</button>';
    }
    var q = link.q ? '&q=' + encodeURIComponent(link.q) : '';
    return '<button type="button" class="shop-empty-action" data-shop-empty-section="' +
      escapeShopHtml(link.section) +
      '" data-shop-empty-q="' +
      escapeShopHtml(link.q || '') +
      '">' +
      escapeShopHtml(link.label) +
      '</button>';
  }).join('');
  return (
    '<div class="shop-empty shop-empty--rich">' +
    '<strong>No strong match yet</strong>' +
    '<span>Try a broader area, or ask ASK SBD to recommend a path.</span>' +
    '<div class="shop-empty-actions">' + links + '</div>' +
    '</div>'
  );
}

function buildCourseProgramCard(p, idx) {
  if (SHOP_PROGRAM_CARD_STYLE === 'classic') {
    return buildCourseProgramCardClassic(p);
  }
  return buildCourseProgramCardApple(p, idx || 0);
}

function buildCourseProgramCardApple(p, idx) {
  var prog = p.program;
  var canCheckout = !!p.stripeReady;
  var card = document.createElement('article');
  var accent = prog.accent || 'default';
  var isFeatured = prog.badgeStyle === 'featured' || prog.badge === '⭐ BEST VALUE';
  var isHero = isFeatured || (idx === 0 && activeCategory === 'all' && activeSection === 'academy');
  var posterClass = 'course-program-poster course-program-poster--' + accent + (p.coverImage ? ' course-program-poster--art' : '');
  var posterImageHtml = p.coverImage
    ? '<img class="course-program-poster__image" loading="lazy" src="' + escapeShopHtml(encodeCoverPath(p.coverImage)) + '" alt="' + escapeShopHtml(p.name) + ' artwork" onerror="this.style.display=\'none\';this.parentNode.classList.remove(\'course-program-poster--art\')">'
    : '';
  var isSchool1Artwork = p.schoolId === 'school1' && !!p.coverImage;
  card.className = 'course-program-card course-program-card--apple course-program-card--' + accent +
    (isHero ? ' course-program-card--hero' : '') +
    (isSchool1Artwork ? ' course-program-card--school1-artwork' : '') +
    (canCheckout ? '' : ' course-program-card--soon');

  if (canCheckout) {
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
  }

  var badgeHtml = prog.badge
    ? '<span class="course-program-card__badge">' + escapeShopHtml(prog.badge) + '</span>'
    : '';
  var taglineHtml = prog.tagline
    ? '<p class="course-program-card__tagline">' + escapeShopHtml(prog.tagline) + '</p>'
    : '';
  var featuresHtml = (prog.features || []).slice(0, 3).map(function (line) {
    return '<li>' + escapeShopHtml(line) + '</li>';
  }).join('');
  var savingsHtml = '';
  if (p.originalPrice && p.originalPrice > p.priceUsd) {
    var pct = computeSavingsPercent(p.priceUsd, p.originalPrice);
    savingsHtml =
      '<p class="course-program-card__value">Total value: <s>$' + escapeShopHtml(String(p.originalPrice)) + '</s></p>' +
      '<p class="course-program-card__savings">Save $' + escapeShopHtml(String(Math.round(p.originalPrice - p.priceUsd))) +
      (pct ? ' (' + pct + '% off)' : '') + '</p>';
  }
  var schoolLine = '';
  if (p.schoolId && SCHOOL_VISUAL[p.schoolId]) {
    schoolLine = '<p class="course-program-card__school">' + escapeShopHtml(SCHOOL_VISUAL[p.schoolId].label) + '</p>';
  }
  var ctaLabel = prog.ctaLabel || (canCheckout ? 'Enroll in Course' : 'Coming soon');
  ctaLabel = compactProgramCtaLabel(ctaLabel);
  var btnClass = canCheckout ? 'course-program-card__cta btn btn-primary' : 'course-program-card__cta btn btn-secondary';

  var school1BodyHeaderHtml = isSchool1Artwork
    ? badgeHtml +
      '<h3 class="course-program-card__title">' + escapeShopHtml(p.name) + '</h3>' +
      taglineHtml +
      schoolLine
    : '';
  var posterContentHtml = isSchool1Artwork
    ? ''
    : '<div class="course-program-poster__content">' +
      badgeHtml +
      '<h3 class="course-program-card__title">' + escapeShopHtml(p.name) + '</h3>' +
      taglineHtml +
      schoolLine +
      '</div>';

  card.innerHTML =
    '<div class="' + posterClass + '">' +
    posterImageHtml +
    posterContentHtml +
    '</div>' +
    '<div class="course-program-card__body">' +
    school1BodyHeaderHtml +
    '<p class="course-program-card__pitch">' + escapeShopHtml(prog.pitch || p.description) + '</p>' +
    '<div class="course-program-features">' +
    '<strong>' + escapeShopHtml(prog.featureLabel || "You'll learn:") + '</strong>' +
    '<ul>' + featuresHtml + '</ul></div>' +
    '<p class="course-program-card__meta"><strong>Duration:</strong> ' + escapeShopHtml(prog.duration) +
    ' &nbsp;|&nbsp; <strong>Format:</strong> ' + escapeShopHtml(prog.format) + '</p>' +
    savingsHtml +
    '<div class="course-program-card__footer">' +
    '<p class="course-program-card__price">' + escapeShopHtml(formatPrice(p)) + '</p>' +
    '<button type="button" class="' + btnClass + '"' + (canCheckout ? '' : ' disabled') + '>' +
    escapeShopHtml(ctaLabel) + '</button>' +
    '</div></div>';

  if (canCheckout) {
    function go() { buyProduct(p.id); }
    card.addEventListener('click', function (e) {
      if (e.target.closest('button')) return;
      go();
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
    card.querySelector('.course-program-card__cta').addEventListener('click', function (e) {
      e.stopPropagation();
      go();
    });
  }
  return card;
}

function compactProgramCtaLabel(label) {
  var normalized = String(label || '').trim();
  var map = {
    'Buy Now': 'Buy',
    'Apply for Coaching': 'Apply',
    'Join Marriage Lab': 'Join',
    'Get Complete Bundle': 'Bundle',
    'Get Lifetime Access': 'Lifetime',
    'Apply for Diploma': 'Apply',
    'Enroll in Course': 'Enroll',
    'Start Learning': 'Start',
    'Discover Your Impact': 'Discover',
    'Begin Journey': 'Begin',
    'Subscribe': 'Subscribe',
    'Coming soon': 'Soon',
  };
  if (map[normalized]) return map[normalized];
  if (normalized.length > 13) return normalized.split(' ')[0];
  return normalized || 'View';
}

function buildCourseProgramCardClassic(p) {
  var prog = p.program;
  var canCheckout = !!p.stripeReady;
  var card = document.createElement('article');
  var accent = prog.accent || 'default';
  var isFeatured = prog.badgeStyle === 'featured' || prog.badge === '⭐ BEST VALUE';
  card.className = 'course-program-card course-program-card--' + accent +
    (isFeatured ? ' course-program-card--featured' : '') +
    (canCheckout ? '' : ' course-program-card--soon');

  if (canCheckout) {
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
  }

  var badgeHtml = prog.badge
    ? '<span class="course-program-card__badge">' + escapeShopHtml(prog.badge) + '</span>'
    : '';
  var taglineHtml = prog.tagline
    ? '<p class="course-program-card__tagline">' + escapeShopHtml(prog.tagline) + '</p>'
    : '';
  var featuresHtml = (prog.features || []).map(function (line) {
    return '<li>' + escapeShopHtml(line) + '</li>';
  }).join('');
  var savingsHtml = '';
  if (p.originalPrice && p.originalPrice > p.priceUsd) {
    var pct = computeSavingsPercent(p.priceUsd, p.originalPrice);
    savingsHtml =
      '<p class="course-program-card__value">Total value: <s>$' + escapeShopHtml(String(p.originalPrice)) + '</s></p>' +
      '<p class="course-program-card__savings">Save $' + escapeShopHtml(String(Math.round(p.originalPrice - p.priceUsd))) +
      (pct ? ' (' + pct + '% off)' : '') + '</p>';
  }
  var schoolLine = '';
  if (p.schoolId && SCHOOL_VISUAL[p.schoolId]) {
    schoolLine = '<p class="course-program-card__school">' + escapeShopHtml(SCHOOL_VISUAL[p.schoolId].label) + '</p>';
  }
  var ctaLabel = prog.ctaLabel || (canCheckout ? 'Enroll in Course' : 'Coming soon');
  var btnClass = canCheckout ? 'course-program-card__cta btn btn-primary' : 'course-program-card__cta btn btn-secondary';

  card.innerHTML =
    badgeHtml +
    '<h3 class="course-program-card__title">' + escapeShopHtml(p.name) + '</h3>' +
    taglineHtml +
    schoolLine +
    '<p class="course-program-card__pitch">' + escapeShopHtml(prog.pitch || p.description) + '</p>' +
    '<div class="course-program-features">' +
    '<strong>' + escapeShopHtml(prog.featureLabel || "You'll learn:") + '</strong>' +
    '<ul>' + featuresHtml + '</ul></div>' +
    '<p class="course-program-card__meta"><strong>Duration:</strong> ' + escapeShopHtml(prog.duration) +
    ' &nbsp;|&nbsp; <strong>Format:</strong> ' + escapeShopHtml(prog.format) + '</p>' +
    savingsHtml +
    '<p class="course-program-card__price">' + escapeShopHtml(formatPrice(p)) + '</p>' +
    '<button type="button" class="' + btnClass + '"' + (canCheckout ? '' : ' disabled') + '>' +
    escapeShopHtml(ctaLabel) + '</button>';

  if (canCheckout) {
    function go() { buyProduct(p.id); }
    card.addEventListener('click', function (e) {
      if (e.target.closest('button')) return;
      go();
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
    card.querySelector('.course-program-card__cta').addEventListener('click', function (e) {
      e.stopPropagation();
      go();
    });
  }
  return card;
}

function buildProductCard(p) {
  var card = document.createElement('div');
  var canCheckout = !!p.stripeReady;
  var isBookLayout = activeSection === 'books_magazine' ||
    (activeSection === 'all' && p.section === 'books_magazine' && p.category !== 'network_subscription');
  var isTeleiosCover = p.id === 'teleios-blueprint' || p.id === 'teleios-blueprint-full';
  var isTeleiosBundle = p.id === 'teleios-bundle';
  var isAnthropologyBook = p.id === 'anthropology-of-wholeness-book';
  var isAnthropologyCourse = p.id === 'anthropology-of-wholeness';
  var isAnthropologyBundle = p.id === 'anthropology-of-wholeness-bundle';
  var isSchool1Artwork = p.schoolId === 'school1' && !!p.coverImage;
  card.className = 'product-card' +
    (canCheckout ? '' : ' product-card--soon') +
    (isBookLayout && p.coverImage ? ' product-card--book' : '') +
    (isTeleiosCover && p.coverImage ? ' product-card--teleios-cover' : '') +
    (isTeleiosBundle && p.coverImage ? ' product-card--teleios-bundle' : '') +
    (isAnthropologyBook && p.coverImage ? ' product-card--anthropology-book' : '') +
    (isAnthropologyCourse && p.coverImage ? ' product-card--anthropology-course' : '') +
    (isAnthropologyBundle && p.coverImage ? ' product-card--anthropology-bundle' : '') +
    (isSchool1Artwork ? ' product-card--school1-artwork' : '');

  if (canCheckout) {
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
  }

  var badges = '';
  if (p.type === 'bundle') badges += '<span class="bundle-badge">Bundle</span>';
  if (p.schoolId && SCHOOL_VISUAL[p.schoolId]) {
    badges += '<span class="school-badge">' + escapeShopHtml(SCHOOL_VISUAL[p.schoolId].label) + '</span>';
  }
  if (!canCheckout) badges += '<span class="soon-badge">Coming soon</span>';

  var savings = p.originalPrice
    ? '<p class="savings-text">Was $' + escapeShopHtml(String(p.originalPrice)) + '</p>'
    : '';

  var btnLabel = canCheckout
    ? compactProgramCtaLabel(p.type === 'subscription' ? 'Subscribe' : 'Buy Now')
    : 'Soon';
  var btnClass = canCheckout ? 'product-card__cta btn btn-primary' : 'product-card__cta btn btn-secondary';

  var coverSrc = p.coverImage ? encodeCoverPath(p.coverImage) : '';
  var visual = getVisualStyle(p);
  var imageStyle = coverSrc
    ? ''
    : ' style="--visual-from:' + visual.from + ';--visual-to:' + visual.to + '"';
  var imageClass = 'product-image' + (coverSrc ? '' : ' product-image--visual cover-fallback');

  var imageHtml =
    '<div class="' + imageClass + '"' + imageStyle + '>' +
    (coverSrc
      ? '<img class="product-cover" loading="lazy" src="' + escapeShopHtml(coverSrc) + '" alt="' + escapeShopHtml(p.name) + ' cover" onerror="this.style.display=\'none\';this.parentNode.classList.add(\'cover-fallback\',\'product-image--visual\')">'
      : '') +
    '<span class="product-icon-fallback">' + escapeShopHtml(p.icon || '📘') + '</span></div>';

  var bodyHtml =
    (badges ? '<div class="product-card__badges">' + badges + '</div>' : '') +
    '<h3 class="product-name">' + escapeShopHtml(p.name) + '</h3>' +
    '<p class="product-description">' + escapeShopHtml(p.description || '') + '</p>' +
    savings +
    '<div class="product-card__footer">' +
    '<p class="product-card__price">' + escapeShopHtml(formatPrice(p)) + '</p>' +
    '<button type="button" class="' + btnClass + '"' + (canCheckout ? '' : ' disabled') + '>' +
    escapeShopHtml(btnLabel) + '</button>' +
    '</div>';

  card.innerHTML = imageHtml + '<div class="product-card__body">' + bodyHtml + '</div>' +
    (p.coverWrapImage
      ? '<div class="product-cover-wrap">' +
        '<p class="product-cover-wrap-label">Front &amp; back cover</p>' +
        '<img class="product-cover-wrap-img" loading="lazy" src="' +
        escapeShopHtml(encodeCoverPath(p.coverWrapImage)) +
        '" alt="' + escapeShopHtml(p.name) + ' — full cover wrap" />' +
        '</div>'
      : '');

  if (canCheckout) {
    function go() { buyProduct(p.id); }
    card.addEventListener('click', function (e) {
      if (e.target.closest('button')) return;
      go();
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
    card.querySelector('.product-card__cta').addEventListener('click', function (e) {
      e.stopPropagation();
      go();
    });
  }
  return card;
}

function escapeShopHtml(text) {
  if (!text) return '';
  var d = document.createElement('div');
  d.textContent = String(text);
  return d.innerHTML;
}

document.getElementById('shopSearchInput')?.addEventListener('input', function (e) {
  shopSearchQuery = e.target.value || '';
  renderShopPage();
});

document.getElementById('shopProductGrid')?.addEventListener('click', function (event) {
  var sectionBtn = event.target.closest('[data-shop-empty-section]');
  if (sectionBtn) {
    activeSection = sectionBtn.dataset.shopEmptySection || 'all';
    activeCategory = 'all';
    shopSearchQuery = sectionBtn.dataset.shopEmptyQ || '';
    renderShopPage();
    return;
  }
  if (event.target.closest('[data-shop-empty-ask]')) {
    var askButton = document.getElementById('askSbdLauncher');
    if (askButton) askButton.click();
  }
});

async function buyProduct(productId) {
  var canonicalProductId = resolveShopProductId(productId);
  var product = PRODUCT_CATALOG[canonicalProductId];
  if (!product) {
    alert('Product not found. Refresh the shop page.');
    return;
  }
  if (!product.stripeReady) {
    alert('Checkout for this item is not available yet. It will open in a later shop phase.');
    return;
  }
  if (!currentUserId) {
    window.location.href = '/auth?next=' + encodeURIComponent('/shop.html');
    return;
  }
  window.location.href = '/checkout.html?product=' + encodeURIComponent(canonicalProductId);
}

async function subscribeToTier(tierId) {
  buyProduct(tierId);
}

(function exposeShopSearchHelpers(root) {
  if (!root) return;
  root.SBDShopSearch = {
    normalize: normalizeShopSearchText,
    parseIntent: parseShopSearchIntent,
    productTypeForSearch: productTypeForSearch,
    productTopicsForSearch: productTopicsForSearch,
    buildSearchText: buildShopSearchText,
    score: shopSearchScore,
    chips: searchSuggestionChips,
    links: searchSuggestionLinks,
    emptyHtml: emptyShopSearchHtml,
    emptyHtmlForQuery: function (query) {
      var previous = shopSearchQuery;
      shopSearchQuery = query || '';
      var html = emptyShopSearchHtml();
      shopSearchQuery = previous;
      return html;
    },
  };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null));

async function createOrder(orderData) {
  try {
    const orderRef = await firebase.firestore().collection('orders').add({
      userId: currentUserId,
      userEmail: shopCurrentUser.email,
      productId: orderData.productId,
      productName: orderData.productName,
      productType: orderData.productType,
      amount: orderData.amount,
      currency: orderData.currency || 'USD',
      paymentMethod: orderData.paymentMethod || 'stripe',
      status: 'completed',
      stripeSessionId: orderData.stripeSessionId || null,
      stripePaymentIntentId: orderData.stripePaymentIntentId || null,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      metadata: orderData.metadata || {},
    });
    await firebase.firestore().collection('users').doc(currentUserId).update({
      purchases: firebase.firestore.FieldValue.arrayUnion(orderRef.id),
    });
    return orderRef.id;
  } catch (error) {
    console.error('[Shop] Order creation failed:', error);
    throw error;
  }
}

async function _creditAmbassadorReferral(userRef, tier, wasAlreadySubscribed) {
  if (wasAlreadySubscribed) return;
  try {
    const userSnap = await userRef.get();
    const referralCode = userSnap.exists ? userSnap.data().referredBy : null;
    if (!referralCode) return;
    const ambSnap = await firebase.firestore().collection('ambassadors')
      .where('sbdReferralCode', '==', referralCode).limit(1).get();
    if (ambSnap.empty) return;
    const tierKey = tier || 'foundation';
    await ambSnap.docs[0].ref.update({
      'sbdReferrals.subscribers': firebase.firestore.FieldValue.increment(1),
      ['sbdReferrals.' + tierKey]: firebase.firestore.FieldValue.increment(1),
    });
  } catch (_) {}
}

async function unlockContent(productId) {
  const canonicalProductId = resolveShopProductId(productId);
  const product = PRODUCT_CATALOG[canonicalProductId];
  if (!product || !product.unlocks) return;
  try {
    const userRef = firebase.firestore().collection('users').doc(currentUserId);
    const preSnap = await userRef.get();
    const preData = preSnap.exists ? preSnap.data() : {};
    const wasAlreadySubscribed = preData.subscription?.status === 'active';

    if (product.unlocks.type === 'tier') {
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);
      await userRef.update({
        tier: product.unlocks.tier,
        'subscription.tier': product.unlocks.tier,
        'subscription.status': 'active',
        'subscription.startDate': firebase.firestore.FieldValue.serverTimestamp(),
        'subscription.endDate': firebase.firestore.Timestamp.fromDate(endDate),
        'subscription.lastPayment': firebase.firestore.FieldValue.serverTimestamp(),
      });
      await _creditAmbassadorReferral(userRef, product.unlocks.tier, wasAlreadySubscribed);
    } else if (product.unlocks.type === 'course' && product.unlocks.courseIds) {
      await userRef.update({
        ownedCourses: firebase.firestore.FieldValue.arrayUnion(...product.unlocks.courseIds),
      });
    } else if (product.unlocks.type === 'bundle') {
      if (product.unlocks.products) {
        for (const prodId of product.unlocks.products) {
          const sub = PRODUCT_CATALOG[prodId];
          if (sub && sub.unlocks && sub.unlocks.courseIds) {
            await userRef.update({
              ownedCourses: firebase.firestore.FieldValue.arrayUnion(...sub.unlocks.courseIds),
            });
          }
        }
      }
      if (product.unlocks.subscription) {
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + product.unlocks.subscription.months);
        await userRef.update({
          tier: product.unlocks.subscription.tier,
          'subscription.tier': product.unlocks.subscription.tier,
          'subscription.status': 'active',
          'subscription.startDate': firebase.firestore.FieldValue.serverTimestamp(),
          'subscription.endDate': firebase.firestore.Timestamp.fromDate(endDate),
        });
        await _creditAmbassadorReferral(userRef, product.unlocks.subscription.tier, wasAlreadySubscribed);
      }
    }
    showNotification('Purchase applied! Check My Learning.', 'success');
  } catch (error) {
    console.error('[Shop] Content unlock failed:', error);
    throw error;
  }
}

function showNotification(message, type) {
  if (type === 'error') alert('❌ ' + message);
  else if (type === 'success') alert('✅ ' + message);
}

document.querySelector('.back-btn')?.addEventListener('click', () => window.history.back());

console.log('[Shop] Phased catalog shop v7 — multi-hero variants');
