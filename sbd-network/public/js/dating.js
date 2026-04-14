/*
 * COVENANT MATCHING SYSTEM — dating.js v249
 * ==========================================
 * Formation-gated matching system for SBD Network.
 *
 * SYSTEM LAWS (non-negotiable):
 *   1. NO FORMATION → NO DATING ACCESS (ever)
 *   2. NO OPEN BROWSING — system-controlled matching only
 *   3. NO FREE CHAT — structured interaction stages only
 *   4. DATING = PRIVILEGE unlocked after measurable formation progress
 *   5. ELITE = FULL / PREMIUM = LIMITED + UPGRADE PRESSURE
 *
 * ACCESS RULES:
 *   Free / Foundation → fully locked (blurred teasers visible)
 *   Premium (qualified): formationScore ≥ 60 + school1 ≥ 70% + school2 ≥ 70%
 *     → 3 view-only profiles, NO messaging
 *   Elite:              formationScore ≥ 70
 *     → full dashboard: matches, tokens, coaching, marriage track
 *
 * FORMATION SCORE FORMULA:
 *   (courseCompletion × 0.40)
 * + (boardParticipation × 0.25)
 * + (consistency × 0.15)
 * + (assessmentScores × 0.20)
 *
 * Depends on: firebase.js (global db, auth), upgrade-tracker.js
 */

// ── STAGE PROMPTS (Stage 1 — structured only, no free text) ────
const STAGE_1_PROMPTS = [
  "What drew you to formation at SBD Network?",
  "How do you understand the role of covenant in marriage?",
  "What is your vision for family in the next 5 years?",
  "How has your formation journey changed your understanding of Muliebrity / Virility?",
];

// ── THRESHOLDS ──────────────────────────────────────────────────
const THRESH = {
  premiumScore:   60,  // Formation score required for Premium limited access
  eliteScore:     70,  // Formation score required for Elite full access
  school1Pct:     70,  // School 1 completion % for Premium gate
  school2Pct:     70,  // School 2 completion % for Premium gate
};

// ── STATE ───────────────────────────────────────────────────────
let _currentUid     = null;
let _userData       = null;
let _formationScore = null;
let _v2Profile      = null;   // formationProfile_v2 — parallel system
let _tokens         = { monthly: 3, extra: 0 };
let _boost          = null;

// ── ENTRY POINT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = '/index.html';
      return;
    }
    _currentUid = user.uid;
    await init(user.uid);
  });
});

// ── INIT ─────────────────────────────────────────────────────────
async function init(uid) {
  try {
    // Load user document
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      window.location.href = '/index.html';
      return;
    }
    _userData = userSnap.data();

    // Load or calculate formation score
    _formationScore = await loadFormationScore(uid, _userData);

    // Load v2 profile (parallel system — does NOT replace formationScore)
    _v2Profile = _userData.formationProfile_v2 || null;
    if (!_v2Profile || _isV2Stale(_v2Profile)) {
      // Background calculation — non-blocking, updates on next render cycle
      if (window.FIS_V2) {
        FIS_V2.calculateAndSave(uid, _userData)
          .then(p => { _v2Profile = p; })
          .catch(() => {});
      }
    }

    // Determine access level
    const access = canAccessDating(_userData, _formationScore);

    // Load supplemental data based on access
    let matches   = [];
    let suggested = [];

    if (access.level === 'full') {
      _tokens = await loadTokens(uid);
      _boost  = await loadBoost(uid);
      [matches, suggested] = await Promise.all([
        loadMatches(uid),
        loadSuggested(uid, _formationScore),
      ]);
    } else if (access.level === 'limited') {
      suggested = await loadLimitedProfiles(uid);
    }

    renderState(access, _formationScore, matches, suggested);
  } catch (err) {
    console.error('[dating.js] init error:', err);
    showError();
  }
}

// ── FORMATION SCORE ──────────────────────────────────────────────
/**
 * Load cached formation score from user doc.
 * If missing or stale (>24h), recalculate client-side and cache.
 */
async function loadFormationScore(uid, userData) {
  const cached = userData.formationScore;
  const now    = Date.now();
  const staleMs = 24 * 60 * 60 * 1000;

  if (cached && cached.calculatedAt) {
    const calcMs = cached.calculatedAt.toMillis
      ? cached.calculatedAt.toMillis()
      : new Date(cached.calculatedAt).getTime();
    if (now - calcMs < staleMs) return cached;
  }

  // Recalculate
  return await calculateAndCacheFormationScore(uid, userData);
}

async function calculateAndCacheFormationScore(uid, userData) {
  try {
    // ── Course completion ──────────────────────────────────────
    // School 1 = 'school-1-teleios', School 2 = 'school-2-sexual-literacy'
    const progressSnap = await db.collection('userProgress')
      .where('userId', '==', uid)
      .get();

    let school1Total = 0, school1Done = 0;
    let school2Total = 0, school2Done = 0;
    let assessTotal  = 0, assessDone  = 0;

    progressSnap.forEach(doc => {
      const d = doc.data();
      const school = d.schoolId || '';
      if (school.includes('school-1') || school.includes('teleios')) {
        school1Total++;
        if (d.status === 'complete' || d.completed) school1Done++;
      } else if (school.includes('school-2') || school.includes('sexual-literacy')) {
        school2Total++;
        if (d.status === 'complete' || d.completed) school2Done++;
      }
      // Assessment tracking
      if (typeof d.assessmentScore === 'number') {
        assessTotal++;
        assessDone += Math.min(d.assessmentScore, 100) / 100;
      }
    });

    const school1Pct = school1Total > 0 ? Math.round((school1Done / school1Total) * 100) : 0;
    const school2Pct = school2Total > 0 ? Math.round((school2Done / school2Total) * 100) : 0;
    const courseCompletion = Math.round((school1Pct + school2Pct) / 2);
    const assessmentScore  = assessTotal > 0 ? Math.round((assessDone / assessTotal) * 100) : 0;

    // ── Board participation ────────────────────────────────────
    const activity = userData.activity || {};
    const posts    = activity.postsCount   || 0;
    const boards   = activity.boardVisits  || 0;
    const boardParticipation = Math.min(100, Math.round((posts * 5) + (boards * 1)));

    // ── Consistency ────────────────────────────────────────────
    const loginStreak   = activity.loginStreak  || 0;
    const weeklyActive  = activity.weeklyActive || 0;
    const consistency   = Math.min(100, Math.round((loginStreak * 2) + (weeklyActive * 5)));

    // ── Composite formula ──────────────────────────────────────
    const totalScore = Math.round(
      (courseCompletion  * 0.40) +
      (boardParticipation * 0.25) +
      (consistency        * 0.15) +
      (assessmentScore    * 0.20)
    );

    const score = {
      courseCompletion,
      school1Pct,
      school2Pct,
      boardParticipation,
      consistency,
      assessmentScore,
      totalScore,
      calculatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    // Cache on user doc (best-effort — don't block render on failure)
    db.collection('users').doc(uid).update({ formationScore: score }).catch(() => {});

    return score;
  } catch (err) {
    console.error('[dating.js] calculateFormationScore error:', err);
    // Return a zero-score object rather than crashing
    return {
      courseCompletion: 0, school1Pct: 0, school2Pct: 0,
      boardParticipation: 0, consistency: 0, assessmentScore: 0,
      totalScore: 0, calculatedAt: null,
    };
  }
}

// ── ACCESS GATE ──────────────────────────────────────────────────
/**
 * Determine dating access level for the user.
 * @returns {{ level: 'none'|'limited'|'full', reason: string, tier: string }}
 */
function canAccessDating(userData, formationScore) {
  const role       = userData.role || '';
  const tier       = userData.tier || userData.subscription?.tier || 'free';
  const score      = formationScore?.totalScore   || 0;
  const school1Pct = formationScore?.school1Pct   || 0;
  const school2Pct = formationScore?.school2Pct   || 0;

  // Admin always gets full access regardless of tier or score
  if (role === 'admin') {
    return { level: 'full', reason: '', tier };
  }

  // Elite members get full access without formation score gate
  if (tier === 'elite') {
    return { level: 'full', reason: '', tier };
  }

  if (tier === 'free' || tier === 'foundation') {
    return {
      level: 'none',
      reason: 'Complete Foundation School and upgrade to Premium to unlock Covenant Matching.',
      tier,
    };
  }

  if (tier === 'premium') {
    if (score >= THRESH.premiumScore && school1Pct >= THRESH.school1Pct && school2Pct >= THRESH.school2Pct) {
      return {
        level: 'limited',
        reason: 'Premium — Limited View. Upgrade to Elite to unlock messaging and full matching.',
        tier,
      };
    }
    return {
      level: 'none',
      reason: `Formation score or school progress below threshold. Score: ${score}/100.`,
      tier,
      showProgress: true,
    };
  }

  return { level: 'none', reason: 'Unknown tier.', tier };
}

// ── STATE RENDER ─────────────────────────────────────────────────
function renderState(access, formationScore, matches, suggested) {
  // Hide loading
  const loading = document.getElementById('dtLoading');
  if (loading) loading.style.display = 'none';

  // Update access badge in topbar
  const badge = document.getElementById('dtAccessBadge');
  if (badge) {
    if (access.level === 'full') {
      const covenantReady = _v2Profile && _v2Profile.totalScore >= 85;
      badge.textContent = covenantReady ? '🏅 Covenant Ready' : 'Elite';
      badge.className   = 'dt-access-badge dt-badge--compat';
    } else if (access.level === 'limited') {
      badge.textContent = 'Premium';
      badge.className   = 'dt-access-badge';
    } else {
      badge.textContent = 'Locked';
      badge.className   = 'dt-access-badge dt-badge--stage';
    }
  }

  if (access.level === 'none') {
    showState('stateLocked');
    renderLockedState(formationScore, access.tier);
  } else if (access.level === 'limited') {
    showState('statePremium');
    renderPremiumState(formationScore, suggested, access);
  } else {
    showState('stateElite');
    renderEliteState(formationScore, matches, suggested, _tokens, _boost);
  }
}

function showState(id) {
  document.querySelectorAll('.dt-state').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

// ── LOCKED STATE ─────────────────────────────────────────────────
function renderLockedState(fs, tier) {
  setBar('lockBar1',    fs.school1Pct,   'lockVal1',    `${fs.school1Pct}%`);
  setBar('lockBar2',    fs.school2Pct,   'lockVal2',    `${fs.school2Pct}%`);
  setBar('lockBar3',    fs.boardParticipation, 'lockVal3', `${fs.boardParticipation}%`);
  setBar('lockBarScore', fs.totalScore,  'lockValScore', `${fs.totalScore}/100`);

  // Mark met bars
  ['lockBar1', 'lockBar2'].forEach((id, i) => {
    const bar = document.getElementById(id);
    const pct = i === 0 ? fs.school1Pct : fs.school2Pct;
    if (bar) bar.classList.toggle('met', pct >= THRESH.school1Pct);
  });
  const scoreBar = document.getElementById('lockBarScore');
  if (scoreBar) scoreBar.classList.toggle('met', fs.totalScore >= THRESH.premiumScore);

  // v2 dimensional breakdown
  const bkLk = document.getElementById('v2BreakdownLocked');
  if (bkLk) {
    const src = _v2Profile || fs;
    bkLk.innerHTML = _buildV2BreakdownHTML(src, !!_v2Profile);
    bkLk.style.display = 'block';
  }

  // Upgrade button
  const btn = document.getElementById('lockUpgradeBtn');
  if (btn) {
    btn.href = tier === 'premium' ? '/learn.html' : '/payment?tier=premium';
    btn.textContent = tier === 'premium'
      ? 'Continue Formation →'
      : 'Upgrade to Premium →';
  }

  // Track lock hit
  if (typeof UpgradeTracker !== 'undefined') {
    UpgradeTracker.trackLockHit('dating', tier);
  }
}

// ── PREMIUM STATE (LIMITED VIEW) ──────────────────────────────────
async function renderPremiumState(fs, profiles, access) {
  // Score ring
  setText('premiumScore', fs.totalScore);
  setText('premiumScoreMsg', access.reason);

  // Profile list (3 max, view-only)
  const list = document.getElementById('premiumProfilesList');
  if (list) {
    if (profiles.length === 0) {
      list.innerHTML = '<p class="dt-empty">Building your curated matches... check back tomorrow.</p>';
    } else {
      list.innerHTML = profiles.slice(0, 3).map(p => buildPremiumProfileCard(p)).join('');
    }
  }

  // Social proof counts
  try {
    const eliteSnap = await db.collection('users')
      .where('tier', '==', 'elite')
      .where('datingActive', '==', true)
      .get();
    setText('eliteMatchCount', eliteSnap.size);
    setText('totalEliteCount', eliteSnap.size + Math.floor(eliteSnap.size * 0.4));
  } catch (_) {
    setText('eliteMatchCount', '—');
    setText('totalEliteCount', '—');
  }

  // Upgrade button
  const upgradeBtn = document.getElementById('premiumUpgradeBtn');
  if (upgradeBtn) upgradeBtn.href = '/payment?tier=elite';

  // Track pressure touch
  if (typeof UpgradeTracker !== 'undefined') {
    UpgradeTracker.trackLockHit('dating-premium-view', access.tier);
  }
}

function buildPremiumProfileCard(profile) {
  const first = escHtml(profile.displayName?.split(' ')[0] || 'Member');
  const score = profile.formationScore?.totalScore || 0;
  return `
    <div class="dt-premium-profile">
      <div class="dt-pp-avatar">${first[0]}</div>
      <div class="dt-pp-info">
        <div class="dt-pp-name">${first}</div>
        <div class="dt-pp-score">Formation ${score}/100</div>
        <div class="dt-pp-school">${escHtml(profile.school || 'School 1 + 2')}</div>
      </div>
      <span class="dt-badge dt-badge--formed">Qualified</span>
    </div>`;
}

// ── ELITE STATE (FULL DASHBOARD) ───────────────────────────────────
function renderEliteState(fs, matches, suggested, tokens, boost) {
  // Stats — prefer v2 totalScore when available
  const displayScore = _v2Profile ? _v2Profile.totalScore : fs.totalScore;
  setText('eliteStatScore',   displayScore);
  setText('eliteStatMatches', matches.length);
  const totalTok = (tokens.monthly || 0) + (tokens.extra || 0);
  setText('eliteStatTokens', totalTok);
  setText('eliteTokenCount', totalTok);

  // v2 dimensional breakdown in elite state
  const bkEl = document.getElementById('v2BreakdownElite');
  if (bkEl && _v2Profile) {
    bkEl.innerHTML = _buildV2BreakdownHTML(_v2Profile, true);
    bkEl.style.display = 'block';
  }

  // Boost strip
  renderBoostStrip(boost);

  // Active matches
  const matchList = document.getElementById('eliteMatchesList');
  if (matchList) {
    if (matches.length === 0) {
      matchList.innerHTML = `
        <div class="dt-empty">
          <p>No active matches yet.</p>
          <button class="dt-btn dt-btn--rose" onclick="requestNewMatches()">Find My Matches →</button>
        </div>`;
    } else {
      matchList.innerHTML = matches.map(m => buildMatchCard(m, _currentUid)).join('');
    }
  }

  // Suggested
  const sugList = document.getElementById('eliteSuggestedList');
  if (sugList) {
    if (suggested.length === 0) {
      sugList.innerHTML = '<p class="dt-empty">No new suggestions right now — your coach will curate more soon.</p>';
    } else {
      sugList.innerHTML = suggested.map(p => buildSuggestedCard(p, _currentUid, totalTok)).join('');
    }
  }
}

function renderBoostStrip(boost) {
  const status = document.getElementById('boostStatus');
  const btn    = document.getElementById('boostBtn');
  if (!status || !btn) return;

  if (boost && boost.active && boost.expiresAt) {
    const expiresAt = boost.expiresAt.toMillis ? boost.expiresAt.toMillis() : new Date(boost.expiresAt).getTime();
    if (expiresAt > Date.now()) {
      const hrs = Math.ceil((expiresAt - Date.now()) / (1000 * 3600));
      status.textContent = `Priority Boost active — ${hrs}h remaining`;
      btn.textContent    = 'Boost Active';
      btn.disabled       = true;
      return;
    }
  }
  status.textContent = 'No active boost — boost your profile to be seen first';
  btn.textContent    = 'Activate Boost';
  btn.disabled       = false;
}

// ── MATCH CARD ────────────────────────────────────────────────────
function buildMatchCard(match, uid) {
  // Determine partner info
  const isA     = match.userA === uid;
  const pUid    = isA ? match.userB : match.userA;
  const pName   = isA ? (match.userBName || 'Partner') : (match.userAName || 'Partner');
  const stage   = match.stage || 1;
  const stagePct = Math.round(((stage - 1) / 3) * 100);

  const promptsHtml = stage === 1
    ? `<div class="dt-prompts">
        ${STAGE_1_PROMPTS.map((p, i) => `<div class="dt-prompt" onclick="openPromptReply('${escHtml(match.id)}',${i})">${escHtml(p)}</div>`).join('')}
       </div>`
    : `<button class="dt-btn dt-btn--rose" onclick="openConversation('${escHtml(match.id)}')">Open Conversation →</button>`;

  return `
    <div class="dt-match-card" data-match-id="${escHtml(match.id)}">
      <div class="dt-match-header">
        <div class="dt-match-avatar">${escHtml(pName[0])}</div>
        <div class="dt-match-meta">
          <div class="dt-match-name">${escHtml(pName)}</div>
          <div class="dt-match-stage">Stage ${stage} of 3</div>
        </div>
        <span class="dt-badge dt-badge--compat">Active</span>
      </div>
      <div class="dt-stage-bar-wrap">
        <div class="dt-stage-bar" style="width:${stagePct}%"></div>
      </div>
      ${promptsHtml}
    </div>`;
}

// ── SUGGESTED CARD ─────────────────────────────────────────────────
function buildSuggestedCard(profile, uid, tokens) {
  const name  = escHtml(profile.displayName?.split(' ')[0] || 'Member');
  const score = profile.formationScore?.totalScore || 0;
  const noTok = tokens <= 0;

  return `
    <div class="dt-match-card">
      <div class="dt-match-header">
        <div class="dt-match-avatar">${name[0]}</div>
        <div class="dt-match-meta">
          <div class="dt-match-name">${name}</div>
          <div class="dt-match-stage">Formation ${score}/100</div>
        </div>
      </div>
      <button
        class="dt-btn dt-btn--rose"
        ${noTok ? 'disabled title="Purchase tokens to connect"' : ''}
        onclick="connectWithProfile('${escHtml(profile.uid)}')">
        ${noTok ? 'Get Tokens to Connect' : 'Connect (1 token)'}
      </button>
    </div>`;
}

// ── LOAD MATCHES ──────────────────────────────────────────────────
async function loadMatches(uid) {
  try {
    const [snapA, snapB] = await Promise.all([
      db.collection('matches').where('userA', '==', uid).where('status', '==', 'active').get(),
      db.collection('matches').where('userB', '==', uid).where('status', '==', 'active').get(),
    ]);
    const results = [];
    snapA.forEach(d => results.push({ id: d.id, ...d.data() }));
    snapB.forEach(d => results.push({ id: d.id, ...d.data() }));
    return results;
  } catch (err) {
    console.error('[dating.js] loadMatches error:', err);
    return [];
  }
}

// ── LOAD SUGGESTED ─────────────────────────────────────────────────
async function loadSuggested(uid, fs) {
  try {
    const userData = _userData;
    const gender   = userData.gender || '';
    const opposite = gender === 'male' ? 'female' : gender === 'female' ? 'male' : '';
    const minScore = Math.max(0, (fs.totalScore || 0) - 15);
    const maxScore = Math.min(100, (fs.totalScore || 0) + 15);

    // Already-matched UIDs to exclude
    const matches = await loadMatches(uid);
    const matchedUids = new Set(matches.flatMap(m => [m.userA, m.userB]).filter(u => u !== uid));
    matchedUids.add(uid); // exclude self

    let q = db.collection('users')
      .where('tier', '==', 'elite')
      .where('datingActive', '==', true)
      .limit(20);

    if (opposite) q = q.where('gender', '==', opposite);

    const snap = await q.get();
    const results = [];
    snap.forEach(d => {
      if (matchedUids.has(d.id)) return;
      const score = d.data().formationScore?.totalScore || 0;
      if (score >= minScore && score <= maxScore) {
        results.push({ uid: d.id, ...d.data() });
      }
    });
    return results.slice(0, 5);
  } catch (err) {
    console.error('[dating.js] loadSuggested error:', err);
    return [];
  }
}

// ── LOAD LIMITED PROFILES (Premium 3 view-only) ───────────────────
async function loadLimitedProfiles(uid) {
  try {
    const snap = await db.collection('users')
      .where('tier', '==', 'elite')
      .where('datingActive', '==', true)
      .limit(3)
      .get();
    const results = [];
    snap.forEach(d => {
      if (d.id !== uid) results.push({ uid: d.id, ...d.data() });
    });
    return results.slice(0, 3);
  } catch (err) {
    return [];
  }
}

// ── TOKENS ────────────────────────────────────────────────────────
async function loadTokens(uid) {
  try {
    const snap = await db.collection('users').doc(uid).get();
    const data = snap.data() || {};
    return {
      monthly: typeof data.tokensMonthly === 'number' ? data.tokensMonthly : 3,
      extra:   typeof data.tokensExtra   === 'number' ? data.tokensExtra   : 0,
    };
  } catch (_) {
    return { monthly: 3, extra: 0 };
  }
}

async function useToken(uid) {
  const tokens = _tokens;
  if (tokens.monthly > 0) {
    tokens.monthly--;
    await db.collection('users').doc(uid).update({ tokensMonthly: tokens.monthly });
  } else if (tokens.extra > 0) {
    tokens.extra--;
    await db.collection('users').doc(uid).update({ tokensExtra: tokens.extra });
  } else {
    throw new Error('No tokens available');
  }
  _tokens = tokens;
  setText('eliteTokenCount', tokens.monthly + tokens.extra);
  setText('eliteStatTokens', tokens.monthly + tokens.extra);
}

// ── BOOST ─────────────────────────────────────────────────────────
async function loadBoost(uid) {
  try {
    const snap = await db.collection('users').doc(uid).get();
    return snap.data()?.boost || null;
  } catch (_) {
    return null;
  }
}

// ── CONNECT ACTION ─────────────────────────────────────────────────
async function connectWithProfile(targetUid) {
  if (!_currentUid) return;
  try {
    await useToken(_currentUid);
    // Create a connection request (matching handled by Cloud Function, until then store request)
    await db.collection('connectionRequests').add({
      fromUid:    _currentUid,
      toUid:      targetUid,
      status:     'pending',
      createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('Connection request sent! Your coach will review and confirm.');
    // Re-render suggested to reflect updated token count
    const suggested = await loadSuggested(_currentUid, _formationScore);
    renderEliteState(_formationScore, await loadMatches(_currentUid), suggested, _tokens, _boost);
  } catch (err) {
    if (err.message === 'No tokens available') {
      openTokenModal();
    } else {
      showToast('Error sending connection request. Please try again.', true);
    }
  }
}

// ── STRUCTURED CONVERSATION ────────────────────────────────────────
function openPromptReply(matchId, promptIndex) {
  const prompt = STAGE_1_PROMPTS[promptIndex];
  if (!prompt) return;

  // Build inline reply UI
  const card = document.querySelector(`[data-match-id="${matchId}"]`);
  if (!card) return;

  // Remove existing reply form if present
  const existing = card.querySelector('.dt-reply-form');
  if (existing) { existing.remove(); return; }

  const form = document.createElement('div');
  form.className = 'dt-reply-form';
  form.innerHTML = `
    <p class="dt-reply-prompt">${escHtml(prompt)}</p>
    <textarea class="dt-reply-input" maxlength="500" placeholder="Your response (max 500 characters)..." rows="4"></textarea>
    <div style="display:flex;gap:8px;margin-top:8px;">
      <button class="dt-btn dt-btn--rose" onclick="submitPromptReply('${escHtml(matchId)}',${promptIndex},this)">Send Response</button>
      <button class="dt-btn" onclick="this.closest('.dt-reply-form').remove()">Cancel</button>
    </div>`;
  card.appendChild(form);
}

async function submitPromptReply(matchId, promptIndex, btn) {
  const form  = btn.closest('.dt-reply-form');
  const input = form.querySelector('.dt-reply-input');
  const text  = input.value.trim();
  if (!text) return;

  btn.disabled     = true;
  btn.textContent  = 'Sending…';

  try {
    await db.collection('matches').doc(matchId)
      .collection('messages').add({
        uid:          _currentUid,
        type:         'prompt_reply',
        promptIndex,
        prompt:       STAGE_1_PROMPTS[promptIndex],
        message:      text,
        createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
      });
    form.innerHTML = '<p style="color:var(--gold);font-size:0.85rem;padding:8px 0;">Response sent ✓</p>';
    setTimeout(() => form.remove(), 2000);
  } catch (err) {
    console.error('[dating.js] submitPromptReply error:', err);
    btn.disabled    = false;
    btn.textContent = 'Send Response';
    showToast('Error sending response. Please try again.', true);
  }
}

function openConversation(matchId) {
  // Stage 2+ — message overlay (future expansion)
  showToast('Opening conversation… (Stage 2 messaging coming soon)');
}

// ── REQUEST NEW MATCHES ────────────────────────────────────────────
async function requestNewMatches() {
  try {
    showToast('Requesting new matches — your coach will review soon…');
    await db.collection('matchRequests').add({
      uid:       _currentUid,
      score:     _formationScore?.totalScore || 0,
      status:    'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[dating.js] requestNewMatches error:', err);
  }
}

// ── COACH & MARRIAGE TRACK ─────────────────────────────────────────
async function submitCoachingRequest() {
  const btn = document.getElementById('coachingSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }

  try {
    await db.collection('coachingRequests').add({
      userId:    _currentUid,
      matchId:   null,
      type:      'relationship',
      status:    'pending',
      notes:     '',
      score:     _formationScore?.totalScore || 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    closeModal('coachingModal');
    showToast("Coaching request submitted! Dr. Coach Achu's team will reach out within 24 hours.");
  } catch (err) {
    console.error('[dating.js] submitCoachingRequest error:', err);
    if (btn) { btn.disabled = false; btn.textContent = 'Submit Request'; }
    showToast('Error submitting request. Please try again.', true);
  }
}

async function submitMarriageTrackRequest() {
  const btn = document.getElementById('marriageSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }

  try {
    await db.collection('marriageTrack').add({
      userId:       _currentUid,
      partnerId:    null,
      coachAssigned: null,
      stage:        1,
      status:       'requested',
      score:        _formationScore?.totalScore || 0,
      createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
    });
    closeModal('marriageModal');
    showToast('Marriage track request submitted! Your advisor will contact you within 48 hours.');
  } catch (err) {
    console.error('[dating.js] submitMarriageTrackRequest error:', err);
    if (btn) { btn.disabled = false; btn.textContent = 'Request Marriage Track'; }
    showToast('Error submitting request. Please try again.', true);
  }
}

// ── MODALS ──────────────────────────────────────────────────────────
function openTokenModal()        { document.getElementById('tokenModal')?.classList.remove('hidden'); }
function openBoostModal()        { document.getElementById('boostModal')?.classList.remove('hidden'); }
function openCoachingModal()     { document.getElementById('coachingModal')?.classList.remove('hidden'); }
function openMarriageTrackModal(){ document.getElementById('marriageModal')?.classList.remove('hidden'); }

function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('dt-modal-overlay')) {
    e.target.classList.add('hidden');
  }
});

// Close modal on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.dt-modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
  }
});

// ── UTILITIES ────────────────────────────────────────────────────────
function setBar(barId, pct, valId, label) {
  const bar = document.getElementById(barId);
  const val = document.getElementById(valId);
  if (bar) bar.style.width = Math.min(100, Math.max(0, pct || 0)) + '%';
  if (val) val.textContent = label || `${pct || 0}%`;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '';
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let _toastTimer = null;
function showToast(message, isError = false) {
  let toast = document.getElementById('dt-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'dt-toast';
    toast.style.cssText = [
      'position:fixed', 'bottom:80px', 'left:50%', 'transform:translateX(-50%)',
      'padding:12px 24px', 'border-radius:8px', 'font-size:0.85rem',
      'z-index:9999', 'pointer-events:none', 'max-width:90vw', 'text-align:center',
    ].join(';');
    document.body.appendChild(toast);
  }
  toast.textContent    = message;
  toast.style.background = isError ? '#7f1d1d' : 'var(--gold, #C6A96B)';
  toast.style.color      = isError ? '#fecaca'  : '#0D0D0D';
  toast.style.opacity    = '1';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 3500);
}

function showError() {
  const loading = document.getElementById('dtLoading');
  if (loading) loading.innerHTML = '<p style="color:#ef4444;padding:40px 20px;text-align:center;">Error loading data. Please refresh.</p>';
}

// ── V2 HELPERS ──────────────────────────────────────────────────────
function _isV2Stale(p) {
  if (!p || !p.lastUpdated) return true;
  const ms = p.lastUpdated.toMillis ? p.lastUpdated.toMillis() : new Date(p.lastUpdated).getTime();
  return Date.now() - ms > 24 * 60 * 60 * 1000;
}

function _buildV2BreakdownHTML(profile, isV2) {
  const score  = profile.totalScore  || profile.totalScore  || 0;
  const form   = profile.formation   || profile.courseCompletion || 0;
  const eng    = profile.engagement  || profile.boardParticipation || 0;
  const expr   = profile.expression  || 0;
  const cons   = profile.consistency || profile.consistency || 0;
  const valid  = profile.validation  || profile.assessmentScore || 0;

  const readyLabel = score >= 85
    ? '🏅 Covenant Ready'
    : `You are ${score}% Ready`;

  const scoreColor = score >= 85 ? 'var(--gold)' : score >= 70 ? '#4ade80' : 'var(--text-sec)';

  const row = (icon, label, val, warn) => `
    <div class="dt-req-row" style="${warn ? 'background:rgba(239,68,68,0.06);border-radius:8px;' : ''}">
      <span class="dt-req-icon" style="font-size:0.7rem;min-width:18px;text-align:center;">${icon}</span>
      <div class="dt-req-body">
        <p class="dt-req-name" style="font-size:0.76rem;">${escHtml(label)}</p>
        <div class="dt-progress-bar">
          <div class="dt-progress-fill${val >= 70 ? ' met' : ''}" style="width:${Math.min(100,val)}%"></div>
        </div>
      </div>
      <span class="dt-req-val">${val}%</span>
    </div>`;

  return `
    <p style="font-size:0.82rem;font-weight:700;color:${scoreColor};margin-bottom:0.5rem;">${readyLabel}</p>
    ${row('📖', 'Formation (Schools)',        form)}
    ${row('💬', 'Engagement (Boards)',        eng)}
    ${row(expr < 20 ? '⚠️' : '👗', 'Expression (MV House)' + (expr < 20 ? ' — needs attention' : ''), expr, expr < 20)}
    ${row('📅', 'Consistency',                cons)}
    ${row('🏅', 'Validation (Certs/Coaching)',valid)}
    ${!isV2 ? '<p style="font-size:0.68rem;color:var(--text-sec);margin-top:0.4rem;">v1 scores shown — v2 profile loading…</p>' : ''}
    ${expr < 20 ? '<p style="font-size:0.72rem;color:#ef4444;margin-top:0.5rem;padding:0.5rem;background:rgba(239,68,68,0.06);border-radius:6px;line-height:1.5;">Add looks to your <a href="/mv-house.html" style="color:#ef4444;font-weight:700;">MV House wardrobe</a> to meet the Expression requirement for matching.</p>' : ''}
  `;
}
