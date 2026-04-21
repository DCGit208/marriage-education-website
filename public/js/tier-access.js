// ================================================================
// TIER ACCESS & FORMATION SYSTEM — Sex By Design For Dummies
// Non-breaking extension — does NOT conflict with existing LMS
// ================================================================

// ── Formation Score Thresholds ────────────────────────────────
const FORMATION_THRESHOLDS = {
  boards: 50,       // Community boards access
  mv_house: 60,     // MV House wardrobe system
  dating: 70        // Dating feature access
};

// ── Drip Access ───────────────────────────────────────────────
/**
 * Check if a module week (1-indexed) is available based on the
 * user's subscription start date (drip: 1 new week every 7 days).
 * Always open if subscriptionStartDate is null/unknown.
 */
function checkDripAccess(moduleWeek, subscriptionStartDate) {
  if (!subscriptionStartDate) return true; // no lock when unknown
  try {
    const start = new Date(subscriptionStartDate);
    const now = new Date();
    const daysElapsed = Math.max(0, Math.floor((now - start) / 86400000));
    const weeksElapsed = Math.floor(daysElapsed / 7) + 1;
    return moduleWeek <= weeksElapsed;
  } catch (e) {
    return true; // fail open — never block on parse errors
  }
}

// ── Formation Score Loader ────────────────────────────────────
/**
 * Load formation data from Firestore (ambassadors/{code}).
 * Returns { score: Number, tier: String } or null.
 */
async function loadFormationData(ambassadorCode) {
  if (!ambassadorCode) return null;
  try {
    const doc = await firebase.firestore()
      .collection('ambassadors').doc(ambassadorCode).get();
    if (!doc.exists) return null;
    const data = doc.data();
    const formation = data && data.formation;
    if (!formation) return null;
    return {
      score: formation.teleiosProgress || 0,
      tier: formation.tier || 'foundation',
      subscriptionStart: data.subscription_start || null
    };
  } catch (e) {
    console.error('[TierAccess] Error loading formation data:', e);
    return null;
  }
}

// ── Formation Score Writer ────────────────────────────────────
/**
 * Update formation score in Firestore when a module is completed.
 * Score = (completedModules / totalModules) * 100, capped at 100.
 */
async function updateFormationScore(ambassadorCode, completedCount, totalModules) {
  if (!ambassadorCode || totalModules === 0) return;
  try {
    const newScore = Math.min(100, Math.round((completedCount / totalModules) * 100));
    await firebase.firestore()
      .collection('ambassadors').doc(ambassadorCode).update({
        'formation.teleiosProgress': newScore,
        'formation.lastUpdated': firebase.firestore.FieldValue.serverTimestamp()
      });
    console.log('[TierAccess] Formation score updated:', newScore);
    // Refresh UI
    renderFormationScoreUI(newScore);
    // Check for feature unlocks
    checkFeatureUnlocks(newScore);
  } catch (e) {
    console.error('[TierAccess] Error updating formation score:', e);
  }
}

// ── Access Enforcement ────────────────────────────────────────
/**
 * Check if a feature is accessible given the current formation score.
 * Opens the system gate modal with context if access is denied.
 */
function enforceAccess(feature, formationScore) {
  const threshold = FORMATION_THRESHOLDS[feature];
  if (threshold === undefined) return true; // unknown feature — allow
  if (formationScore >= threshold) return true;

  const messages = {
    mv_house: `MV House unlocks when your Formation Score reaches 60. You are currently at ${formationScore}. Complete more weeks to gain access.`,
    dating: `The Dating Feature unlocks at Formation Score 70. You are at ${formationScore}. Keep building your formation.`,
    boards: `Community Boards unlock at Formation Score 50. You are at ${formationScore}. Complete the next module to progress.`
  };
  openSystemGate(messages[feature] || `This feature requires a higher Formation Score.`);
  return false;
}

// ── System Gate Modal ─────────────────────────────────────────
function openSystemGate(reason) {
  const modal = document.getElementById('systemGateModal');
  const reasonEl = document.getElementById('gateReason');
  if (!modal) return;
  if (reasonEl) reasonEl.textContent = reason;
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}
function closeSystemGate() {
  const modal = document.getElementById('systemGateModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

// ── Upgrade Banner ────────────────────────────────────────────
/**
 * Show upgrade banner when a foundation-tier user reaches 50% progress.
 * Only shown once per session.
 */
let upgradeBannerShown = false;
function maybeShowUpgradeBanner(formationScore, tier) {
  if (upgradeBannerShown) return;
  if (tier !== 'foundation') return;
  if (formationScore < 50) return;

  upgradeBannerShown = true;
  const banner = document.createElement('div');
  banner.id = 'upgradeBanner';
  banner.style.cssText = [
    'position:fixed;bottom:80px;left:50%;transform:translateX(-50%)',
    'background:linear-gradient(135deg,#7c3aed,#4f46e5)',
    'color:white;padding:16px 28px;border-radius:14px',
    'box-shadow:0 8px 32px rgba(124,58,237,0.5)',
    'display:flex;align-items:center;gap:16px',
    'z-index:500;max-width:520px;width:90%'
  ].join(';');
  banner.innerHTML = `
    <span style="font-size:1.8rem">🏆</span>
    <div style="flex:1">
      <strong style="display:block;margin-bottom:4px">You've hit 50% Formation!</strong>
      <span style="font-size:0.85rem;opacity:0.9">Upgrade to Premium to unlock MV House, Dating, and Advanced Boards</span>
    </div>
    <a href="ambassador-payment.html" style="background:white;color:#7c3aed;padding:10px 20px;border-radius:8px;font-weight:700;text-decoration:none;white-space:nowrap;font-size:0.9rem">Upgrade →</a>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:rgba(255,255,255,0.7);font-size:1.2rem;cursor:pointer;padding:0 4px">×</button>
  `;
  document.body.appendChild(banner);
  setTimeout(() => { if (banner.parentElement) banner.remove(); }, 15000);
}

// ── MV House Navigation ───────────────────────────────────────
function goToMVHouse() {
  const ambassadorCode = localStorage.getItem('ambassadorCode');
  const scoreEl = document.getElementById('formationScoreValue');
  const score = scoreEl ? parseInt(scoreEl.textContent) || 0 : 0;

  if (!enforceAccess('mv_house', score)) return;
  window.location.href = 'mv-house.html';
}

// ── Feature Unlock Check ──────────────────────────────────────
function checkFeatureUnlocks(score) {
  const scoreEl = document.getElementById('formationScoreValue');
  if (scoreEl) scoreEl.textContent = score;

  // Update feature lock indicators if they exist
  ['boards', 'mv_house', 'dating'].forEach(feature => {
    const el = document.getElementById(`lock-${feature}`);
    if (!el) return;
    const unlocked = score >= FORMATION_THRESHOLDS[feature];
    el.textContent = unlocked ? '✓ Unlocked' : `🔒 Score ${FORMATION_THRESHOLDS[feature]}`;
    el.style.color = unlocked ? '#10b981' : '#94a3b8';
  });
}

// ── Formation Score UI Renderer ───────────────────────────────
function renderFormationScoreUI(score) {
  const widget = document.getElementById('formationScoreWidget');
  if (!widget) return;
  widget.innerHTML = `
    <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:6px">Formation Score</div>
    <div style="font-size:1.4rem;font-weight:700;color:${score >= 60 ? '#7c3aed' : '#0f172a'};margin-bottom:8px" id="formationScoreValue">${score}</div>
    <div style="background:#e2e8f0;height:6px;border-radius:3px;overflow:hidden;margin-bottom:8px">
      <div style="background:linear-gradient(90deg,#7c3aed,#4f46e5);height:100%;width:${score}%;transition:width 0.6s ease"></div>
    </div>
    <div style="font-size:0.72rem;color:#94a3b8">
      <span id="lock-boards" style="display:block">${score >= 50 ? '✓ Boards Unlocked' : '🔒 Boards: Score 50'}</span>
      <span id="lock-mv_house" style="display:block">${score >= 60 ? '✓ MV House Unlocked' : '🔒 MV House: Score 60'}</span>
      <span id="lock-dating" style="display:block">${score >= 70 ? '✓ Dating Unlocked' : '🔒 Dating: Score 70'}</span>
    </div>
  `;
}

// ── Initialization ────────────────────────────────────────────
/**
 * Call this once when the LMS boots. For SBD only.
 */
async function initTierAccessSystem() {
  const ambassadorCode = localStorage.getItem('ambassadorCode');
  if (!ambassadorCode) return;

  // Only active for sex-by-design-for-dummies
  const currentCourseId = (typeof courseId !== 'undefined') ? courseId : '';
  if (currentCourseId !== 'sex-by-design-for-dummies') return;

  console.log('[TierAccess] Initializing for SBD course...');

  const formation = await loadFormationData(ambassadorCode);
  const score = formation ? formation.score : 0;
  const tier = formation ? formation.tier : 'foundation';

  renderFormationScoreUI(score);
  maybeShowUpgradeBanner(score, tier);
  console.log('[TierAccess] Formation score loaded:', score, '| Tier:', tier);
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTierAccessSystem);
} else {
  initTierAccessSystem();
}
