/**
 * COURSES PAGE - My Learning Dashboard
 * ====================================
 * Displays user's course progress and current module
 */

let currentUserId = null;
let userTier = 'free';       // actual billing tier
let _viewTier = null;        // tier being VIEWED (from ?viewTier= param) — may differ from userTier
let userProgress = null;
let allCourses = [];
let _unlockedCourses  = [];   // users/{uid}.progress.unlockedCourses
let _completedCourses = [];   // users/{uid}.progress.completedCourses

const _TIER_ORDER = { free: 0, foundation: 1, premium: 2, elite: 3 };

// School display order — used to sort courses into correct sequence across ALL tiers
const _SCHOOL_ORDER = {
  'school-1-teleios':                    1,
  'school-2-sexual-literacy':            2,
  'school-3-marriage-systems':           3,
  'school-4-civilization-leadership':    4,
  // short/legacy IDs
  'teleios':         1,
  'sexual-literacy': 2,
  'muliebrity':      3,
  'virility':        4,
};

const _SCHOOL_META = {
  'school-1-teleios':                  { name: 'Teleios Identity',           icon: '🧠' },
  'school-2-sexual-literacy':          { name: 'Sexual Literacy',            icon: '📐' },
  'school-3-marriage-systems':         { name: 'Marriage Systems',           icon: '💍' },
  'school-4-civilization-leadership':  { name: 'Civilization Leadership',    icon: '🌍' },
  'teleios':         { name: 'Teleios Identity',   icon: '🧠' },
  'sexual-literacy': { name: 'Sexual Literacy',    icon: '📐' },
  'muliebrity':      { name: 'Muliebrity',         icon: '👗' },
  'virility':        { name: 'Virility',            icon: '🎯' },
  '__standalone':    { name: 'SBD Flagship Course', icon: '📖' },
};

// Sort any course array: by school order first, then courseNo within each school
function _sortCourses(courses) {
  return [...courses].sort((a, b) => {
    const ao = _SCHOOL_ORDER[a.schoolId] ?? 98;
    const bo = _SCHOOL_ORDER[b.schoolId] ?? 98;
    // null schoolId (standalone SBD) goes after schools but before total unknown
    const as = (a.schoolId == null) ? 97 : ao;
    const bs = (b.schoolId == null) ? 97 : bo;
    if (as !== bs) return as - bs;
    return (a.courseNo ?? 999) - (b.courseNo ?? 999);
  });
}

// Returns access result using TierAccess progression logic.
// When a viewTier filter is active, access is evaluated AS IF the user is on that tier —
// so Elite users viewing the Foundation path see exactly what a Foundation user sees.
function _accessResult(course) {
  const effectiveTier = _viewTier || userTier;
  if (window.TierAccess) {
    return TierAccess.canAccessCourse(course.id, effectiveTier, _unlockedCourses, _completedCourses, course.accessLevel);
  }
  // Fallback: simple tier check
  const required = course.accessLevel || 'foundation';
  const ok = (_TIER_ORDER[effectiveTier] ?? 0) >= (_TIER_ORDER[required] ?? 0);
  return { canAccess: ok };
}
function _canAccess(course) { return _accessResult(course).canAccess; }

// ==================================================================
// INITIALIZATION
// ==================================================================

firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = '/auth';
    return;
  }
  
  currentUserId = user.uid;
  await loadData();
  await renderDashboard();
});

// ==================================================================
// DATA LOADING
// ==================================================================

async function loadData() {
  try {
    const params = new URLSearchParams(window.location.search);

    // viewTier: show this page as-if user is on that tier (e.g. Elite viewing Foundation path)
    const requestedViewTier = params.get('viewTier');
    _viewTier = (requestedViewTier && _TIER_ORDER[requestedViewTier] !== undefined)
      ? requestedViewTier
      : null;

    // Get user tier and progress
    userTier = await FormationAccess.getUserTier(currentUserId);
    userProgress = await FormationAccess.getUserProgress(currentUserId);
    _unlockedCourses  = userProgress?.unlockedCourses  || [];
    _completedCourses = userProgress?.completedCourses || [];

    // Load courses — filter by school if URL param present
    const schoolId = params.get('school');
    let coursesQuery = db.collection('courses');
    if (schoolId) {
      coursesQuery = coursesQuery.where('schoolId', '==', schoolId);
    }
    const coursesSnapshot = await coursesQuery.get();
    allCourses = coursesSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(c => c.isActive !== false);

    console.log('[Courses] User tier:', userTier, '| View tier:', _viewTier || '(own)');
    console.log('[Courses] All courses:', allCourses.length);
  } catch (error) {
    console.error('[Courses] Error loading data:', error);
  }
}

// ==================================================================
// RENDERING
// ==================================================================

// Show a sticky banner when an Elite/Premium user is viewing a lower tier path
function renderViewTierBanner() {
  const existing = document.getElementById('viewTierBanner');
  if (existing) existing.remove();
  if (!_viewTier) return;

  const tierMeta = {
    free:       { label: 'Free',       icon: '🌱', back: '/learn?tier=free' },
    foundation: { label: 'Foundation', icon: '🏗',  back: '/learn?tier=foundation' },
    premium:    { label: 'Premium',    icon: '⚡',  back: '/learn?tier=premium' },
    elite:      { label: 'Elite',      icon: '👑',  back: '/learn?tier=elite' },
  };
  const meta = tierMeta[_viewTier] || { label: _viewTier, icon: '📖', back: '/learn' };

  const banner = document.createElement('div');
  banner.id = 'viewTierBanner';
  banner.style.cssText = [
    'position:sticky;top:0;z-index:200',
    'background:#1a1a1a',
    'border-bottom:1px solid rgba(0,188,212,0.25)',
    'padding:10px 16px',
    'display:flex;align-items:center;gap:10px',
    'font-size:0.82rem',
  ].join(';');
  banner.innerHTML = `
    <button onclick="window.location.href='${meta.back}'"
      style="background:none;border:none;color:#aaa;cursor:pointer;font-size:1rem;padding:0;line-height:1;" aria-label="Back">←</button>
    <span style="color:#aaa;">Viewing</span>
    <span style="font-weight:700;color:#00bcd4;">${meta.icon} ${meta.label} Formation Path</span>
    <span style="margin-left:auto;font-size:0.72rem;color:#666;">Your tier: ${userTier}</span>
  `;

  // Insert at top of main content area
  const app = document.querySelector('.courses-main') || document.querySelector('main') || document.body;
  app.insertBefore(banner, app.firstChild);
}

async function renderDashboard() {
  // If viewing a specific tier path, show a context banner so user knows
  // they're seeing the Foundation/Premium/Elite content structure
  renderViewTierBanner();

  // Render continue learning section (async — checks currentModuleId)
  await renderContinueLearning();
  
  // Categorize courses
  const activeCourses = [];
  const progressionLockedCourses = [];
  const tierLockedCourses = [];
  const completedCourses = [];
  
  for (const course of allCourses) {
    const isCompleted = _completedCourses.includes(course.id);
    if (isCompleted) {
      completedCourses.push(course);
    } else if (_canAccess(course)) {
      activeCourses.push(course);
    } else {
      const access = _accessResult(course);
      if (access.progressionLocked) {
        progressionLockedCourses.push(course);
      } else {
        tierLockedCourses.push(course);
      }
    }
  }
  
  // Sort all arrays by school order + courseNo before rendering
  const sortedActive      = _sortCourses(activeCourses);
  const sortedProgLocked  = _sortCourses(progressionLockedCourses);
  const sortedTierLocked  = _sortCourses(tierLockedCourses);
  const sortedCompleted   = _sortCourses(completedCourses);

  // ── Apply tier-appropriate section labels ────────────────────
  const effectiveTier = _viewTier || userTier;
  _applyTierUX(effectiveTier);

  // ── Elite full view → Formation Roadmap ─────────────────────
  if (effectiveTier === 'elite' && !_viewTier) {
    renderEliteRoadmap(sortedActive);
    document.getElementById('progressionSection').style.display = 'none';
    document.getElementById('upgradeSection').style.display     = 'none';
    renderCompletedCourses(sortedCompleted);
    return;
  }

  // ── Guided path (Foundation / Premium / viewTier) ─────────
  renderActiveCourses(sortedActive, effectiveTier);
  renderProgressionLockedCourses(sortedProgLocked);
  renderTierLockedCourses(sortedTierLocked);
  renderCompletedCourses(sortedCompleted);
}

async function renderContinueLearning() {
  const continueSection = document.getElementById('continueSection');
  
  if (!userProgress || !userProgress.currentModuleId) {
    continueSection.style.display = 'none';
    return;
  }
  
  try {
    // Get current module
    const moduleDoc = await db.collection('modules').doc(userProgress.currentModuleId).get();
    if (!moduleDoc.exists) {
      continueSection.style.display = 'none';
      return;
    }
    
    const moduleData = moduleDoc.data();
    
    // Get course for progress calculation
    const courseDoc = await db.collection('courses').doc(moduleData.courseId).get();
    const courseData = courseDoc.data();
    
    const weekNum    = moduleData.week || 1;
    const totalWeeks = courseData.totalModules || 6;

    document.getElementById('currentModuleTitle').textContent = moduleData.title;
    document.getElementById('currentModuleProgress').textContent =
      `Week ${weekNum} of ${totalWeeks}`;
    
    continueSection.style.display = 'block';
  } catch (error) {
    console.error('[Courses] Error rendering continue learning:', error);
    continueSection.style.display = 'none';
  }
}

function renderActiveCourses(courses, tier) {
  const container = document.getElementById('activeCoursesContainer');

  if (courses.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📚</div>
        <p class="empty-state-text">No active courses yet. Start your journey!</p>
      </div>
    `;
    return;
  }

  // Tier-specific intro card
  let introHtml = '';
  if (tier === 'foundation') {
    introHtml = `
      <div class="path-intro-card">
        <span class="path-intro-icon">🏗</span>
        <div class="path-intro-text">
          <p class="path-intro-title">Foundation — Two Entry Points</p>
          <p class="path-intro-sub">Start <strong>Course 1</strong> for identity formation, or begin <strong>SBD For Dummies</strong> for your sexual literacy foundation. Both are live now.</p>
        </div>
      </div>`;
  } else if (tier === 'premium') {
    introHtml = `
      <div class="path-intro-card">
        <span class="path-intro-icon">⚡</span>
        <div class="path-intro-text">
          <p class="path-intro-title">Premium — Schools 1 &amp; 2 Unlocked</p>
          <p class="path-intro-sub">28 courses across Teleios Identity and Sexual Literacy. Progress through School 1 in sequence, then enter School 2 when ready.</p>
        </div>
      </div>`;
  }

  // Group courses by school — preserving the sorted order
  const groups = [];   // [{ schoolId, meta, courses[] }]
  const seen   = new Map(); // schoolId → group index

  for (const course of courses) {
    const sid = course.schoolId || '__standalone';
    if (!seen.has(sid)) {
      seen.set(sid, groups.length);
      groups.push({ schoolId: sid, meta: _SCHOOL_META[sid] || { name: 'Courses', icon: '📖' }, courses: [] });
    }
    groups[seen.get(sid)].courses.push(course);
  }

  const courseHtml = groups.map(group => {
    const courseCards = group.courses.map(course => {
      const progress  = userProgress?.progressPercent?.[course.id] || 0;
      const courseNo  = course.courseNo ? `Course ${course.courseNo}` : null;
      const meta      = [courseNo, course.totalModules ? `${course.totalModules} modules` : null, course.duration || null].filter(Boolean).join(' · ');
      const progressEl = progress > 0
        ? `<div class="progress-circle" style="--progress: ${progress}%"><span class="progress-text">${Math.round(progress)}%</span></div>`
        : `<div class="start-btn">Start →</div>`;
      return `
        <div class="course-card" onclick="openCourse('${course.id}')">
          <div class="course-icon">${getSchoolIcon(course.schoolId)}</div>
          <div class="course-info">
            <h3 class="course-name">${escHtml(course.title)}</h3>
            ${meta ? `<p class="course-meta">${meta}</p>` : ''}
          </div>
          <div class="course-progress">${progressEl}</div>
        </div>`;
    }).join('');

    // Only show school header if there are multiple schools visible
    const header = groups.length > 1
      ? `<div class="school-group-header"><span class="school-group-icon">${group.meta.icon}</span>${escHtml(group.meta.name)}</div>`
      : '';

    return `<div class="school-group">${header}${courseCards}</div>`;
  }).join('');

  container.innerHTML = introHtml + courseHtml;
}

// ── Applies tier-appropriate section labels ──────────────────────
function _applyTierUX(tier) {
  const qTitle = (containerId) => {
    const cont = document.getElementById(containerId);
    return cont?.closest('.learning-section')?.querySelector('.section-title');
  };
  if (tier === 'foundation') {
    const t = qTitle('activeCoursesContainer');
    if (t) t.textContent = 'Your Formation Path';
    const tp = document.getElementById('progressionSection')?.querySelector('.section-title');
    if (tp) tp.textContent = 'Build Step by Step 🔓';
    const tu = document.getElementById('upgradeSection')?.querySelector('.section-title');
    if (tu) tu.textContent = 'Formation Horizons — What\'s Ahead 🔒';
  } else if (tier === 'premium') {
    const t = qTitle('activeCoursesContainer');
    if (t) t.textContent = 'Your Schools';
    const tu = document.getElementById('upgradeSection')?.querySelector('.section-title');
    if (tu) tu.textContent = 'Formation Horizons — Schools 3 & 4 🔒';
  } else if (tier === 'elite') {
    const t = qTitle('activeCoursesContainer');
    if (t) t.textContent = 'Formation Roadmap';
  }
}

// ── Elite Formation Roadmap ──────────────────────────────────────
// SBD Dummies (featured) → School 1 (expanded) → Schools 2–4 (collapsed)
function renderEliteRoadmap(activeCourses) {
  const container = document.getElementById('activeCoursesContainer');

  // SBD Dummies (schoolId: null) — feature at top; rest grouped by school
  const sbdDummies    = activeCourses.find(c => c.schoolId == null);
  const schoolCourses = activeCourses.filter(c => c.schoolId != null);

  const schools   = [];
  const schoolMap = new Map();
  for (const course of schoolCourses) {
    const sid = course.schoolId;
    if (!schoolMap.has(sid)) {
      schoolMap.set(sid, schools.length);
      schools.push({ sid, meta: _SCHOOL_META[sid] || { name: 'Courses', icon: '📖' }, courses: [] });
    }
    schools[schoolMap.get(sid)].courses.push(course);
  }

  let html = '';

  // Formation Arc Banner
  html += `
    <div class="formation-arc-banner">
      <p class="formation-arc-title">👑 Elite Formation Arc</p>
      <p class="formation-arc-sub">All 4 schools unlocked · ${activeCourses.length} courses · No drip gate</p>
      <div class="formation-arc-schools">
        <span class="arc-school">🧠 Teleios</span>
        <span class="arc-arrow">→</span>
        <span class="arc-school">📐 Sexual Literacy</span>
        <span class="arc-arrow">→</span>
        <span class="arc-school">💍 Marriage Systems</span>
        <span class="arc-arrow">→</span>
        <span class="arc-school">🌍 Civilization</span>
      </div>
    </div>`;

  // SBD Dummies — Featured Entry Card
  if (sbdDummies) {
    const progress = userProgress?.progressPercent?.[sbdDummies.id] || 0;
    const progressEl = progress > 0
      ? `<div class="fec-progress"><div class="fec-progress-bar" style="width:${progress}%"></div></div>
         <p class="fec-progress-label">${Math.round(progress)}% complete</p>`
      : `<button class="fec-cta">Start Now →</button>`;
    html += `
      <div class="featured-entry-card" onclick="openCourse('${sbdDummies.id}')">
        <div class="fec-badge">📖 SBD Flagship Course</div>
        <h3 class="fec-title">${escHtml(sbdDummies.title)}</h3>
        <p class="fec-sub">${sbdDummies.totalModules ? sbdDummies.totalModules + ' modules' : '13 weeks'} · Foundation of the SBD formation</p>
        ${progressEl}
      </div>`;
  }

  // School sections — School 1 expanded by default, Schools 2–4 collapsed
  for (let i = 0; i < schools.length; i++) {
    const school        = schools[i];
    const isSchool1     = school.sid === 'school-1-teleios' || school.sid === 'teleios';
    const startExpanded = isSchool1;
    const sKey          = school.sid.replace(/[^a-z0-9]/g, '-');

    const courseCards = school.courses.map((course, idx) => {
      const progress   = userProgress?.progressPercent?.[course.id] || 0;
      const courseNo   = course.courseNo ? 'Course ' + course.courseNo : null;
      const courseMeta = [courseNo, course.totalModules ? course.totalModules + ' modules' : null, course.duration || null].filter(Boolean).join(' · ');
      const isFirst    = isSchool1 && idx === 0;
      const progressEl = progress > 0
        ? `<div class="progress-circle" style="--progress:${progress}%"><span class="progress-text">${Math.round(progress)}%</span></div>`
        : `<div class="start-btn">Start →</div>`;
      const nameSuffix = isFirst ? ' <span class="start-here-badge">Recommended Start</span>' : '';
      return `
        <div class="course-card${isFirst ? ' course-card--featured' : ''}" onclick="openCourse('${course.id}')">
          <div class="course-icon">${getSchoolIcon(course.schoolId)}</div>
          <div class="course-info">
            <h3 class="course-name">${escHtml(course.title)}${nameSuffix}</h3>
            ${courseMeta ? `<p class="course-meta">${courseMeta}</p>` : ''}
          </div>
          <div class="course-progress">${progressEl}</div>
        </div>`;
    }).join('');

    html += `
      <div class="roadmap-school-section" id="rs-${sKey}">
        <div class="roadmap-school-header" onclick="toggleSchoolSection('${sKey}')">
          <span class="roadmap-school-icon">${school.meta.icon}</span>
          <span class="roadmap-school-name">${escHtml(school.meta.name)}</span>
          <span class="roadmap-school-count">${school.courses.length} courses</span>
          <span class="roadmap-school-chevron" id="rsc-${sKey}">${startExpanded ? '▼' : '▶'}</span>
        </div>
        <div class="roadmap-school-courses${startExpanded ? '' : ' collapsed'}" id="rscourses-${sKey}">
          ${courseCards}
        </div>
      </div>`;
  }

  container.innerHTML = html;
}

function toggleSchoolSection(sKey) {
  const coursesEl = document.getElementById('rscourses-' + sKey);
  const chevron   = document.getElementById('rsc-' + sKey);
  if (!coursesEl) return;
  const collapsed = coursesEl.classList.toggle('collapsed');
  if (chevron) chevron.textContent = collapsed ? '▶' : '▼';
}

function renderProgressionLockedCourses(courses) {
  const section = document.getElementById('progressionSection');
  const container = document.getElementById('progressionCoursesContainer');
  if (!section || !container) return;

  if (courses.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  const effectiveTier = _viewTier || userTier;

  // Foundation/free: show only the NEXT course to unlock + a summary of the rest
  // This prevents a wall of 12 locked School 1 cards
  if (effectiveTier === 'foundation' || effectiveTier === 'free') {
    // Sort by courseNo so we show the immediately next one
    const sorted   = [...courses].sort((a, b) => (a.courseNo ?? 999) - (b.courseNo ?? 999));
    const nextUp   = sorted[0];
    const remaining = sorted.length - 1;

    const access = _accessResult(nextUp);
    const prevNo = access.requiredCourseNo || '?';
    const meta   = [nextUp.courseNo ? `Course ${nextUp.courseNo}` : null, nextUp.totalModules ? `${nextUp.totalModules} modules` : null].filter(Boolean).join(' · ');

    let html = `
      <div class="course-card locked progression-locked" onclick="showProgressionLockMsg('${escHtml(nextUp.title)}', ${prevNo})">
        <div class="course-icon">${getSchoolIcon(nextUp.schoolId)}</div>
        <div class="course-info">
          <h3 class="course-name">${escHtml(nextUp.title)}</h3>
          ${meta ? `<p class="course-meta">${meta}</p>` : ''}
          <p class="course-meta lock-hint">Complete Course ${prevNo} to unlock</p>
        </div>
        <div class="course-progress">
          <div class="lock-badge progression">🔓 Next</div>
        </div>
      </div>`;

    if (remaining > 0) {
      html += `<p style="font-size:0.75rem;color:var(--text-muted,#666);text-align:center;padding:8px 0 4px;">+ ${remaining} more course${remaining > 1 ? 's' : ''} unlock as you progress through School 1</p>`;
    }

    container.innerHTML = html;
    return;
  }

  // Premium/Elite: show full list grouped by school
  const groups = [];
  const seen   = new Map();
  for (const course of courses) {
    const sid = course.schoolId || '__standalone';
    if (!seen.has(sid)) { seen.set(sid, groups.length); groups.push({ sid, meta: _SCHOOL_META[sid] || { name: 'Courses', icon: '📖' }, courses: [] }); }
    groups[seen.get(sid)].courses.push(course);
  }

  container.innerHTML = groups.map(group => {
    const cards = group.courses.map(course => {
      const meta    = [course.courseNo ? `Course ${course.courseNo}` : null, course.totalModules ? `${course.totalModules} modules` : null, course.duration || null].filter(Boolean).join(' · ');
      const access  = _accessResult(course);
      const prevNo  = access.requiredCourseNo || '?';
      return `
      <div class="course-card locked progression-locked" onclick="showProgressionLockMsg('${escHtml(course.title)}', ${prevNo})">
        <div class="course-icon">${getSchoolIcon(course.schoolId)}</div>
        <div class="course-info">
          <h3 class="course-name">${escHtml(course.title)}</h3>
          ${meta ? `<p class="course-meta">${meta}</p>` : ''}
          <p class="course-meta lock-hint">Complete Course ${prevNo} to unlock</p>
        </div>
        <div class="course-progress">
          <div class="lock-badge progression">🔓 Soon</div>
        </div>
      </div>`;
    }).join('');
    const header = groups.length > 1 ? `<div class="school-group-header"><span class="school-group-icon">${group.meta.icon}</span>${escHtml(group.meta.name)}</div>` : '';
    return `<div class="school-group">${header}${cards}</div>`;
  }).join('');
}

function renderTierLockedCourses(courses) {
  const section = document.getElementById('upgradeSection');
  const container = document.getElementById('upgradeCoursesContainer');
  if (!section || !container) return;

  if (courses.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  const effectiveTier = _viewTier || userTier;

  // Foundation & Premium: show collapsed school banners instead of 30+ individual locked cards
  if (effectiveTier === 'foundation' || effectiveTier === 'free') {
    container.innerHTML = _renderLockedSchoolBanners(courses, 'premium');
    return;
  }
  if (effectiveTier === 'premium') {
    container.innerHTML = _renderLockedSchoolBanners(courses, 'elite');
    return;
  }

  // Elite / fallback: full individual card list
  const groups = [];
  const seen   = new Map();
  for (const course of courses) {
    const sid = course.schoolId || '__standalone';
    if (!seen.has(sid)) { seen.set(sid, groups.length); groups.push({ sid, meta: _SCHOOL_META[sid] || { name: 'Courses', icon: '📖' }, courses: [] }); }
    groups[seen.get(sid)].courses.push(course);
  }

  container.innerHTML = groups.map(group => {
    const cards = group.courses.map(course => {
      const meta         = [course.courseNo ? `Course ${course.courseNo}` : null, course.totalModules ? `${course.totalModules} modules` : null, course.duration || null].filter(Boolean).join(' · ');
      const requiredTier = course.accessLevel ? (course.accessLevel.charAt(0).toUpperCase() + course.accessLevel.slice(1)) : 'Premium';
      return `
      <div class="course-card locked" onclick="showCoursePaywall('${course.id}')">
        <div class="course-icon">${getSchoolIcon(course.schoolId)}</div>
        <div class="course-info">
          <h3 class="course-name">${escHtml(course.title)}</h3>
          ${meta ? `<p class="course-meta">${meta}</p>` : ''}
          <p class="course-meta lock-hint">${requiredTier} plan required</p>
        </div>
        <div class="course-progress">
          <div class="lock-badge">🔒 Upgrade</div>
        </div>
      </div>`;
    }).join('');
    const header = groups.length > 1 ? `<div class="school-group-header"><span class="school-group-icon">${group.meta.icon}</span>${escHtml(group.meta.name)}</div>` : '';
    return `<div class="school-group">${header}${cards}</div>`;
  }).join('');
}

// Renders tier-locked content as collapsed school banners (Foundation & Premium UX)
function _renderLockedSchoolBanners(courses, upgradeTarget) {
  // Group by school
  const groups = new Map();
  for (const course of courses) {
    const sid = course.schoolId || '__standalone';
    if (!groups.has(sid)) groups.set(sid, []);
    groups.get(sid).push(course);
  }

  const tierMeta = {
    premium: { label: 'Premium', icon: '⚡', color: '#00bcd4', price: '$20/mo' },
    elite:   { label: 'Elite',   icon: '👑', color: '#ffc107', price: '$50/mo' },
  };
  const t = tierMeta[upgradeTarget] || tierMeta['premium'];

  let html = `
    <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:14px;overflow:hidden;margin-bottom:10px;">
      <div style="padding:14px 16px 10px;border-bottom:1px solid rgba(255,255,255,0.06);">
        <p style="margin:0 0 2px;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${t.color}">${t.icon} ${t.label} — ${t.price}</p>
        <p style="margin:0;font-size:0.8rem;color:var(--text-secondary,#aaa);">${courses.length} courses unlocked when you upgrade</p>
      </div>`;

  for (const [sid, schoolCourses] of groups) {
    const meta = _SCHOOL_META[sid] || { name: 'Courses', icon: '📖' };
    const reqTier = schoolCourses[0]?.accessLevel || upgradeTarget;
    html += `
      <div style="display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;" onclick="showUpgradeModal('${reqTier}')">
        <span style="font-size:1.2rem;">${meta.icon}</span>
        <div style="flex:1;">
          <p style="margin:0 0 2px;font-size:0.88rem;font-weight:600;color:var(--text-primary,#fff)">${escHtml(meta.name)}</p>
          <p style="margin:0;font-size:0.75rem;color:var(--text-secondary,#aaa)">${schoolCourses.length} courses · ${reqTier.charAt(0).toUpperCase() + reqTier.slice(1)} required</p>
        </div>
        <span style="font-size:0.8rem;color:${t.color};font-weight:700;">Unlock →</span>
      </div>`;
  }

  html += `
      <div style="padding:14px 16px;">
        <button onclick="showUpgradeModal('${upgradeTarget}')" style="width:100%;background:${t.color};color:${upgradeTarget === 'elite' ? '#000' : '#000'};border:none;font-weight:700;font-size:0.9rem;padding:12px;border-radius:10px;cursor:pointer;">Upgrade to ${t.label} — ${t.price} →</button>
      </div>
    </div>`;

  return html;
}

function showUpgradeModal(tier) {
  FormationAccess.showPaywallModal({
    title: `Unlock ${tier.charAt(0).toUpperCase() + tier.slice(1)} Formation`,
    message: `Upgrade to ${tier} to access these courses.`,
    requiredTier: tier,
    currentTier: userTier,
  });
}

function showProgressionLockMsg(courseTitle, prevCourseNo) {
  // Show a non-intrusive toast — no upgrade prompt, just an explanation
  const existing = document.getElementById('progression-lock-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'progression-lock-toast';
  toast.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;border:1px solid #444;border-radius:12px;padding:14px 20px;font-size:14px;z-index:9999;max-width:340px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.5)';
  toast.innerHTML = `🔒 Complete <strong>Course ${prevCourseNo}</strong> first to unlock this course.`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function renderCompletedCourses(courses) {
  const section = document.getElementById('completedSection');
  const container = document.getElementById('completedCoursesContainer');
  
  if (courses.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  section.style.display = 'block';

  // Group by school
  const groups = [];
  const seen   = new Map();
  for (const course of courses) {
    const sid = course.schoolId || '__standalone';
    if (!seen.has(sid)) { seen.set(sid, groups.length); groups.push({ sid, meta: _SCHOOL_META[sid] || { name: 'Courses', icon: '📖' }, courses: [] }); }
    groups[seen.get(sid)].courses.push(course);
  }

  container.innerHTML = groups.map(group => {
    const cards = group.courses.map(course => `
      <div class="course-card" onclick="openCourse('${course.id}')">
        <div class="course-icon">${getSchoolIcon(course.schoolId)}</div>
        <div class="course-info">
          <h3 class="course-name">${escHtml(course.title)}</h3>
          <p class="course-meta">✅ Completed${course.courseNo ? ` · Course ${course.courseNo}` : ''}</p>
        </div>
        <div class="course-progress">
          <div class="progress-circle" style="--progress: 100%">
            <span class="progress-text">✓</span>
          </div>
        </div>
      </div>
    `).join('');
    const header = groups.length > 1 ? `<div class="school-group-header"><span class="school-group-icon">${group.meta.icon}</span>${escHtml(group.meta.name)}</div>` : '';
    return `<div class="school-group">${header}${cards}</div>`;
  }).join('');
}

// ==================================================================
// HELPERS
// ==================================================================

function getSchoolIcon(schoolId) {
  const icons = {
    // long IDs
    'school-1-teleios':                  '🧠',
    'school-2-sexual-literacy':          '📐',
    'school-3-marriage-systems':         '💍',
    'school-4-civilization-leadership':  '🌍',
    // short/legacy IDs
    'teleios':         '🧠',
    'sexual-literacy': '📐',
    'muliebrity':      '👗',
    'virility':        '🎯',
  };
  return icons[schoolId] || '📖';
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ==================================================================
// ACTIONS
// ==================================================================

function continueModule() {
  if (!userProgress?.currentModuleId) return;
  window.location.href = `/lesson.html?moduleId=${userProgress.currentModuleId}`;
}

async function openCourse(courseId) {
  const course = allCourses.find(c => c.id === courseId);
  if (course && !_canAccess(course)) { showCoursePaywall(courseId); return; }
  await showCourseSheet(courseId, course);
}

async function showCourseSheet(courseId, course) {
  document.getElementById('sheetCourseTitle').textContent = course?.title || 'Course';
  document.getElementById('sheetWeekList').innerHTML = '<div class="sheet-loading">Loading weeks…</div>';

  const backdrop = document.getElementById('courseSheetBackdrop');
  const panel    = document.getElementById('courseSheetPanel');
  backdrop.style.display = 'block';
  panel.style.display    = 'block';
  backdrop.getBoundingClientRect(); // force reflow for CSS transition
  backdrop.classList.add('active');
  panel.classList.add('active');
  document.body.style.overflow = 'hidden';

  try {
    const snap  = await db.collection('modules').where('courseId', '==', courseId).get();
    const weeks = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? a.week ?? 0) - (b.order ?? b.week ?? 0));

    if (weeks.length === 0) {
      document.getElementById('sheetWeekList').innerHTML = '<div class="sheet-loading">No weeks available yet.</div>';
      return;
    }

    const completedMods = userProgress?.completedModules || [];
    const currentModId  = userProgress?.currentCourseId === courseId
      ? (userProgress?.currentModuleId || null) : null;

    document.getElementById('sheetWeekList').innerHTML = weeks.map((mod, idx) => {
      const weekNum     = mod.week || mod.order || 1;
      const isCompleted = completedMods.includes(mod.id);
      const isCurrent   = mod.id === currentModId && !isCompleted;

      // Tier lock
      const reqTier   = mod.requiredTier || mod.accessLevel || 'free';
      const tierLock  = (_TIER_ORDER[userTier] ?? 0) < (_TIER_ORDER[reqTier] ?? 0);

      // Completion lock: week N (idx>0) requires week N-1 completed
      const prevMod       = idx > 0 ? weeks[idx - 1] : null;
      const completionLock = prevMod && !completedMods.includes(prevMod.id) && !isCompleted;

      const isLocked  = tierLock || completionLock;
      const partCount = Array.isArray(mod.parts) ? mod.parts.length : null;

      let rowClass = 'week-row';
      let arrow    = '→';
      if (isCompleted)          { rowClass += ' completed'; arrow = '✅'; }
      else if (isCurrent)       { rowClass += ' current'; }
      if (tierLock)             { rowClass += ' locked';  arrow = '🔒'; }
      else if (completionLock)  { rowClass += ' locked';  arrow = '🔒'; }

      const metaBits = [];
      if (partCount)        metaBits.push(`${partCount} parts`);
      if (isCurrent)        metaBits.push('<strong style="color:var(--accent-primary,#00bcd4)">In progress</strong>');
      if (isCompleted)      metaBits.push('<span style="color:#00c864">Done ✓</span>');
      if (completionLock)   metaBits.push('Complete previous week first');
      if (tierLock)         metaBits.push(`Requires ${reqTier} access`);

      const lockReason = tierLock
        ? `showCoursePaywall('${courseId}')`
        : `showCompletionLockMsg(${weekNum})`;

      const clickAttr = isLocked
        ? `onclick="${lockReason}"`
        : `onclick="openWeek('${mod.id}')"`;

      return `
        <div class="${rowClass}" ${clickAttr}>
          <div class="week-num-pill">W${weekNum}</div>
          <div class="week-row-info">
            <p class="week-row-title">${escHtml(mod.title || `Week ${weekNum}`)}</p>
            ${metaBits.length ? `<p class="week-row-meta">${metaBits.join(' · ')}</p>` : ''}
          </div>
          <span class="week-row-arrow">${arrow}</span>
        </div>`;
    }).join('');
  } catch (e) {
    console.error('[Courses] showCourseSheet:', e);
    document.getElementById('sheetWeekList').innerHTML =
      '<div class="sheet-loading" style="color:#f66">Failed to load weeks. Please try again.</div>';
  }
}

function closeCourseSheet() {
  const backdrop = document.getElementById('courseSheetBackdrop');
  const panel    = document.getElementById('courseSheetPanel');
  backdrop.classList.remove('active');
  panel.classList.remove('active');
  document.body.style.overflow = '';
  setTimeout(() => { backdrop.style.display = 'none'; panel.style.display = 'none'; }, 350);
}

function openWeek(moduleId) {
  window.location.href = `/lesson.html?moduleId=${moduleId}`;
}

function showCompletionLockMsg(weekNum) {
  // Brief shake on the panel + message — no alert()
  const list = document.getElementById('sheetWeekList');
  const msg  = document.createElement('div');
  msg.style.cssText = 'position:fixed;bottom:calc(env(safe-area-inset-bottom)+90px);left:50%;transform:translateX(-50%);background:#1a1a1a;border:1px solid rgba(255,255,255,0.15);color:#fff;font-size:13px;padding:10px 18px;border-radius:30px;z-index:999;white-space:nowrap;pointer-events:none';
  msg.textContent = `Complete Week ${weekNum - 1} first to unlock Week ${weekNum}`;
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 2800);
}

async function showCoursePaywall(courseId) {
  const course = allCourses.find(c => c.id === courseId);
  if (!course) return;
  
  FormationAccess.showPaywallModal({
    title: `Unlock ${course.title}`,
    message: `This course requires a ${course.accessLevel} subscription.`,
    requiredTier: course.accessLevel,
    currentTier: userTier
  });
}

// ==================================================================
// BACK BUTTON
// ==================================================================

document.querySelector('.back-btn')?.addEventListener('click', () => {
  window.history.back();
});

console.log('[Courses] Page loaded');
