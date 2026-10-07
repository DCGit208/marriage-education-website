// Learn V2 — Formation Hub
// /learn          → Tier selector  (choose your formation path)
// /learn?tier=X   → Tier page      (content for that specific tier)
// Access: admin = elite. Only subscription grants tier above free.

let userTier = 'free';
let userData = null;

const FORMATION_GATE_LABEL = 'Complete formation arc →';

const TIER_ORDER  = { free: 0, foundation: 1, premium: 2, elite: 3 };

const TIER_META = {
  free:       { label: 'Free',       price: '$0',      icon: '🌱', priceLabel: 'Free forever' },
  foundation: { label: 'Foundation', price: '$11+',   icon: '🏗',  priceLabel: '$11/month · $15/month for 1 year · $11/month for 2 years · $144.17 one-time' },
  premium:    { label: 'Premium',    price: '$20',     icon: '⚡',  priceLabel: '$20 / month' },
  elite:      { label: 'Elite',      price: '$50',     icon: '👑',  priceLabel: '$50 / month' },
};

const TIER_HIGHLIGHTS = {
  free:       ['Teleios Week 1 — You Were Created Teleios', 'Free resource library', 'Community read access'],
  foundation: ['Teleios Blueprint (6 weeks)', 'Sex By Design For Dummies (13 weeks)', 'Foundation boards + resources'],
  premium:    ['Full School 1 — 13 courses', 'Full School 2 — 15 courses', 'School certificates'],
  elite:      ['Schools 3–4 training', 'Advanced boards + MV House unlock through formation', 'Mastery cert'],
};

// ── Boot ─────────────────────────────────────────────────────────
firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = '/auth?next=/learn'; return; }
  await loadUserTier(user);

  const viewTier = new URLSearchParams(window.location.search).get('tier');
  if (viewTier && TIER_META[viewTier]) {
    renderTierPage(viewTier);
  } else {
    renderSelector();
  }
});

// ── User tier ────────────────────────────────────────────────────
async function loadUserTier(user) {
  try {
    const doc = await firebase.firestore().collection('users').doc(user.uid).get();
    if (doc.exists) {
      userData = doc.data();
      const data = userData;
      const sub  = data.subscription || {};
      const now  = Date.now();
      const subEnd = sub.endDate?.toMillis ? sub.endDate.toMillis() : 0;
      const activeSub = sub.status === 'active' && subEnd > now ? (sub.tier || '') : '';
      const docTier = (data.tier || 'free').toLowerCase();
      userTier = window.CourseAccess
        ? CourseAccess.resolveEffectiveTier(userData)
        : (data.role === 'admin' ? 'elite' : (activeSub || docTier || 'free'));
    }
  } catch (e) { console.error('loadUserTier:', e); }
}

// ── SELECTOR VIEW ────────────────────────────────────────────────
function renderSelector() {
  const userLevel = TIER_ORDER[userTier] ?? 0;
  const app = document.getElementById('learnApp');

  app.innerHTML = `
    <header class="learn-selector-header">
      <h1>Formation</h1>
      <p class="learn-selector-sub">Choose your path · <span class="learn-selector-tier">${TIER_META[userTier].label} tier</span></p>
    </header>
    <div class="tier-selector-grid">
      ${Object.entries(TIER_META).map(([tier, meta]) => {
        const level      = TIER_ORDER[tier] ?? 0;
        const isCurrent  = tier === userTier;
        const isOpen     = userLevel >= level;
        return buildSelectorCard(tier, meta, isCurrent, isOpen);
      }).join('')}
    </div>`;
}

function buildSelectorCard(tier, meta, isCurrent, isOpen) {
  const highlights = TIER_HIGHLIGHTS[tier] || [];

  if (!isOpen) {
    return `
      <div class="ts-card ts-card--locked" onclick="window.location.href='/payment?tier=${tier}'">
        <div class="ts-top">
          <span class="ts-icon">${meta.icon}</span>
          <span class="ts-lock-icon">🔒</span>
        </div>
        <h3 class="ts-title">${meta.label}</h3>
        <p class="ts-price">${meta.priceLabel}</p>
        <ul class="ts-highlights">
          ${highlights.map(h => `<li>${h}</li>`).join('')}
        </ul>
        <span class="ts-cta">Unlock →</span>
      </div>`;
  }

  return `
    <div class="ts-card ts-card--open${isCurrent ? ' ts-card--current' : ''}"
         onclick="window.location.href='/learn?tier=${tier}'">
      <div class="ts-top">
        <span class="ts-icon">${meta.icon}</span>
        <span class="ts-badge${isCurrent ? '' : ' ts-badge--access'}">${isCurrent ? 'Current' : 'Access'}</span>
      </div>
      <h3 class="ts-title">${meta.label}</h3>
      <p class="ts-price">${meta.priceLabel}</p>
      <ul class="ts-highlights">
        ${highlights.map(h => `<li>${h}</li>`).join('')}
      </ul>
      <span class="ts-cta ts-cta--enter">Enter →</span>
    </div>`;
}

// ── TIER PAGE VIEW ───────────────────────────────────────────────
function renderTierPage(viewTier) {
  const meta      = TIER_META[viewTier];
  const userLevel = TIER_ORDER[userTier] ?? 0;
  const pageLevel = TIER_ORDER[viewTier] ?? 0;
  const hasAccess = userLevel >= pageLevel;
  const app       = document.getElementById('learnApp');

  app.innerHTML = `
    <header class="learn-tier-header">
      <button class="learn-back-btn" onclick="window.location.href='/learn'">← Formation</button>
      <div class="learn-tier-title-row">
        <span class="learn-tier-icon">${meta.icon}</span>
        <h1 class="learn-tier-name">${meta.label}</h1>
        ${hasAccess ? `<span class="tier-badge-hero">${userTier === viewTier ? 'Current' : 'Access'}</span>` : ''}
      </div>
    </header>
    <div id="tierPageContent" class="tier-page-content">
      <div class="tier-loading">Loading…</div>
    </div>`;

  if (!hasAccess) {
    document.getElementById('tierPageContent').innerHTML = `
      <div class="tier-upgrade-wall">
        <span class="tuw-icon">${meta.icon}</span>
        <h3>${meta.label}</h3>
        <p class="tuw-price">${meta.priceLabel}</p>
        <p class="tuw-sub">Upgrade to unlock this formation path.</p>
        <button class="btn-unlock" onclick="window.location.href='/payment?tier=${viewTier}'">
          Unlock ${meta.label} →
        </button>
        <button class="tuw-back-btn" onclick="window.location.href='/learn'">← Back to Formation</button>
      </div>`;
    return;
  }

  renderTierHub(viewTier);
}

// ── Free tier content (live from Firestore) ──────────────────────
async function loadFreeTierContent() {
  const container = document.getElementById('tierPageContent');
  try {
    const doc = await firebase.firestore().collection('modules').doc('teleios-week-1').get();
    if (!doc.exists) {
      container.innerHTML = `<p class="tier-empty">Content coming soon. Check back shortly.</p>`;
      return;
    }
    const module = doc.data();
    const intro  = extractIntro(module.content || '');
    container.innerHTML = `
      <div class="module-card">
        <div class="module-card-header">
          <h3>${escHtml(module.title)}</h3>
          <span class="module-badge">Week 1 · Free</span>
        </div>
        <p>${escHtml(intro)}</p>
        <div class="lesson-row" onclick="openLesson('teleios-week-1','part-1')">
          <span class="lesson-title">Part 1 — You Were Created Teleios</span>
          <span class="lesson-arrow">→</span>
        </div>
        <div class="lesson-row" onclick="openLesson('teleios-week-1','part-2')">
          <span class="lesson-title">Part 2 — The Etymology of "Be Perfect"</span>
          <span class="lesson-arrow">→</span>
        </div>
        <div class="continue-block">
          <p>You've reached the free limit. Continue your formation.</p>
          <button class="btn-unlock" onclick="window.location.href='/learn?tier=foundation'">
            See Foundation →
          </button>
        </div>
      </div>`;
  } catch (e) {
    console.error('loadFreeTierContent:', e);
    container.innerHTML = `<p class="tier-empty">Failed to load. Refresh to try again.</p>`;
  }
}

// ── Tier Hub Pages ───────────────────────────────────────────────
// Each tier gets a feature hub with locked sections ALWAYS VISIBLE.
// Master Prompt law: locked content must always be shown — never hidden.
// Pressure triggers fire upward desire. DO NOT REMOVE locked items.

const TIER_HUB = {
  free: [
    {
      icon: '📖',
      title: 'Teleios Week 1',
      sub: 'You Were Created Teleios — 8 parts across Teleios + Advocacy tracks',
      href: '/lesson.html?moduleId=teleios-week-1',
      locked: false,
    },
    {
      icon: '💬',
      title: 'Community',
      sub: 'Browse boards and read posts — read-only access',
      href: '/boards.html',
      locked: false,
    },
    {
      icon: '🗂',
      title: 'Resources',
      sub: 'Free public resource library',
      href: '/resources.html',
      locked: false,
    },
    // ── PRESSURE TRIGGERS (always visible, always locked) ──
    {
      icon: '🏗',
      title: 'Foundation — Start Your Formation',
      sub: 'Teleios Blueprint (6 weeks) + SBD For Dummies (13 weeks) — dripped weekly',
      href: '/payment?tier=foundation',
      locked: true,
      lockLabel: '$9.77/mo or $144.17 one-time / 12 months — Unlock →',
      pressure: true,
    },
    {
      icon: '⚡',
      title: 'Premium — Schools 1 + 2',
      sub: '28 courses across Teleios School + Sexual Literacy School',
      href: '/payment?tier=premium',
      locked: true,
      lockLabel: '$20/mo',
    },
    {
      icon: '👑',
      title: 'Elite — All 4 Schools + MV House',
      sub: 'Elite billing unlocks Schools 3–4; advanced boards + MV House unlock when formation milestones are met',
      href: '/payment?tier=elite',
      locked: true,
      lockLabel: '$50/mo',
    },
  ],

  foundation: [
    {
      icon: '📚',
      title: 'My Library',
      sub: 'Purchased programs and courses included in your plan',
      href: '/library.html',
      locked: false,
    },
    {
      icon: '📖',
      title: 'Learning',
      sub: 'Teleios Blueprint (6 weeks) + Sex By Design For Dummies (13 weeks) — dripped weekly',
      href: '/courses.html?viewTier=foundation',
      locked: false,
    },
    {
      icon: '💬',
      title: 'Community',
      sub: 'Foundation discussion boards — post, reply, and connect',
      href: '/boards.html',
      locked: false,
    },
    {
      icon: '🗂',
      title: 'Resources',
      sub: 'Downloadable workbooks, worksheets, and planning templates',
      href: '/resources.html',
      locked: false,
    },
    {
      icon: '🏅',
      title: 'Certificates',
      sub: 'Foundation Certificate on course completion',
      href: '/schools.html',
      locked: false,
    },
    // ── PRESSURE TRIGGERS ──────────────────────────────────
    {
      icon: '💒',
      title: 'Covenant Matching — Formation Required',
      sub: 'Dating access unlocks after formation. Complete Schools 1 + 2 to qualify.',
      href: '/dating.html',
      locked: true,
      lockLabel: 'Premium + Formation Score',
      pressure: true,
    },
    {
      icon: '⚡',
      title: '15 Courses Waiting — Sexual Literacy School',
      sub: 'Art of Sexuality · Art of Seduction · Conjugal Intelligence MasterClass · and 12 more',
      href: '/payment?tier=premium',
      locked: true,
      lockLabel: 'Upgrade to Premium $20/mo →',
      pressure: true,
    },
    {
      icon: '📚',
      title: 'School 1 — 12 More Teleios Courses',
      sub: 'Anthropology of Wholeness · Identity Mastery · The Four Faculties Training · and more',
      href: '/payment?tier=premium',
      locked: true,
      lockLabel: 'Premium $20/mo',
    },
    {
      icon: '👑',
      title: 'School 3 — Marriage Systems',
      sub: '8 courses: Covenant Governance · Fidelity Curriculum · Conflict Mastery · and more',
      href: '/payment?tier=elite',
      locked: true,
      lockLabel: 'Elite $50/mo',
    },
    {
      icon: '🌍',
      title: 'School 4 — Civilization Leadership',
      sub: '8 courses: Marriage Builds Nations · Family Systems Architecture · and more',
      href: '/payment?tier=elite',
      locked: true,
      lockLabel: 'Elite $50/mo',
    },
    {
      icon: '🏠',
      title: 'MV House — Identity Becomes Expression',
      sub: 'Corporate · Casual · Official · Night wardrobes — build + purchase your covenant identity',
      href: '/payment?tier=elite',
      locked: true,
      lockLabel: 'Elite only',
    },
  ],

  premium: [
    {
      icon: '📚',
      title: 'My Library',
      sub: 'Purchased programs and courses included in your plan',
      href: '/library.html',
      locked: false,
    },
    {
      icon: '📖',
      title: 'Learning',
      sub: 'Full School 1 (13 courses) + Full School 2 (15 courses) — dripped weekly',
      href: '/courses.html?viewTier=premium',
      locked: false,
    },
    {
      icon: '💬',
      title: 'Community',
      sub: 'All standard community boards — full posting access',
      href: '/boards.html',
      locked: false,
    },
    {
      icon: '🗂',
      title: 'Resources',
      sub: 'Complete resource library — all downloadable materials',
      href: '/resources.html',
      locked: false,
    },
    {
      icon: '🏅',
      title: 'Certificates',
      sub: 'School 1 + School 2 completion certificates',
      href: '/schools.html',
      locked: false,
    },
    // ── PRESSURE TRIGGERS ──────────────────────────────────
    {
      icon: '👑',
      title: 'School 3 — Marriage Systems + Fidelity',
      sub: '8 courses: Covenant Governance · Fidelity Curriculum · Conflict Mastery · and more',
      href: '/payment?tier=elite',
      locked: true,
      lockLabel: 'Upgrade to Elite $50/mo →',
      pressure: true,
    },
    {
      icon: '🌍',
      title: 'School 4 — Civilization Leadership',
      sub: '8 courses: Marriage Builds Nations · Political Theology of Home · and more',
      href: '/payment?tier=elite',
      locked: true,
      lockLabel: 'Elite $50/mo',
    },
    {
      icon: '🏠',
      title: 'MV House — Your Covenant Wardrobe',
      sub: 'The expression system of Muliebrity + Virility — style, identity, lifestyle. Curate and purchase your wardrobe.',
      href: '/payment?tier=elite',
      locked: true,
      lockLabel: 'Elite only',
      pressure: true,
    },
    {
      icon: '🛡',
      title: 'Advanced Muliebrity + Virility Boards',
      sub: 'Elite-only expression community — active discussions happening now',
      href: '/payment?tier=elite',
      locked: true,
      lockLabel: 'Elite $50/mo',
    },
    {
      icon: '💒',
      title: 'Covenant Matching — Formation Required',
      sub: 'Check your formation score and dating eligibility. Messaging unlocks at Elite.',
      href: '/dating.html',
      locked: false,
      lockLabel: 'Limited Access',
    },
  ],

  elite: [
    {
      icon: '📚',
      title: 'My Library',
      sub: 'Purchased flagship programs and courses in your formation plan',
      href: '/library.html',
      locked: false,
    },
    {
      icon: '📖',
      title: 'Learning',
      sub: 'All 4 schools — 44 courses across every formation discipline',
      href: '/courses.html',
      locked: false,
    },
    {
      icon: '💬',
      title: 'Community',
      sub: 'Marriage Systems, Civilization Leadership, and standard elite discussion boards',
      href: '/boards.html',
      locked: false,
    },
    {
      icon: '✨',
      title: 'Advanced Muliebrity & Virility Boards',
      sub: 'AMTS + Virility elite media boards — unlock after Schools 1–2, full School 3, and 4 of 8 School 4 courses',
      href: '/boards.html',
      locked: false,
      formationGate: 'advancedExpression',
    },
    {
      icon: '🗂',
      title: 'Resources',
      sub: 'Complete resource library — all downloadable materials',
      href: '/resources.html',
      locked: false,
    },
    {
      icon: '🏅',
      title: 'Certificates',
      sub: 'All school certs + Mastery Certification (apex credential)',
      href: '/schools.html',
      locked: false,
    },
    {
      icon: '🏠',
      title: 'MV House',
      sub: 'Identity expression wardrobes — Corporate, Casual, Official, Night',
      href: '/mv-house.html',
      locked: false,
      formationGate: 'advancedExpression',
    },
    {
      icon: '👤',
      title: 'Direct Access',
      sub: 'Dr. Coach Achu — direct communication channel',
      href: '/community.html',
      locked: false,
    },
    {
      icon: '💒',
      title: 'Covenant Matching',
      sub: 'Full matching system — active matches, coaching, stage conversations, marriage track',
      href: '/dating.html',
      locked: false,
    },
  ],
};

function resolveHubCard(card) {
  if (!card.formationGate || card.locked) return card;
  if (!userData || userData.role === 'admin' || (window.CourseAccess && CourseAccess.isContentDesigner(userData))) return card;
  if (typeof AdvancedExpressionAccess === 'undefined') {
    return Object.assign({}, card, {
      locked: true,
      lockLabel: FORMATION_GATE_LABEL,
      href: '/courses.html',
      pressure: true,
    });
  }
  if (AdvancedExpressionAccess.hasAdvancedExpressionAccess(userData)) return card;
  const access = AdvancedExpressionAccess.getAdvancedExpressionAccess(userData);
  return Object.assign({}, card, {
    locked: true,
    lockLabel: access.message || FORMATION_GATE_LABEL,
    sub: access.detail || card.sub,
    href: access.ctaUrl || '/courses.html',
    pressure: true,
  });
}

function renderTierHub(tier) {
  const container = document.getElementById('tierPageContent');
  let cards = (TIER_HUB[tier] || []).map(resolveHubCard);
  if (userData && window.CourseAccess && CourseAccess.isContentDesigner(userData)) {
    cards = [{
      icon: '🛠',
      title: 'Course Studio',
      sub: 'Full LMS catalog — search every course, week, and part',
      href: '/admin-courses.html',
      locked: false,
    }].concat(cards);
  }
  if (!cards.length) { container.innerHTML = ''; return; }

  container.innerHTML = `
    <div class="tier-hub-grid">
      ${cards.map(card => buildHubCard(card)).join('')}
    </div>`;
}

function buildHubCard(card) {
  if (card.locked) {
    // pressure: true = primary upgrade CTA card — highlighted border + bold badge
    const cls = card.pressure
      ? 'thub-card thub-card--locked thub-card--pressure'
      : 'thub-card thub-card--locked';
    return `
      <a class="${cls}" href="${escHtml(card.href)}">
        <div class="thub-icon-row">
          <span class="thub-icon">${card.icon}</span>
          <span class="thub-lock-badge${card.pressure ? ' thub-lock-badge--cta' : ''}">${escHtml(card.lockLabel || 'Locked')}</span>
        </div>
        <p class="thub-title">${escHtml(card.title)}</p>
        <p class="thub-sub">${escHtml(card.sub)}</p>
      </a>`;
  }
  return `
    <a class="thub-card" href="${escHtml(card.href)}">
      <div class="thub-icon-row">
        <span class="thub-icon">${card.icon}</span>
        <span class="thub-arrow">→</span>
      </div>
      <p class="thub-title">${escHtml(card.title)}</p>
      <p class="thub-sub">${escHtml(card.sub)}</p>
    </a>`;
}

// ── Helpers ──────────────────────────────────────────────────────
function openLesson(moduleId, part) {
  window.location.href = `/lesson.html?moduleId=${moduleId}&part=${part}`;
}

function extractIntro(markdown) {
  const lines = markdown.split('\n')
    .filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('>') && !l.startsWith('-') && !l.startsWith('*'));
  const text = lines.slice(0, 3).join(' ').replace(/\*\*/g, '').replace(/\*/g, '').trim();
  return text.length > 220 ? text.substring(0, 220) + '…' : text;
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

