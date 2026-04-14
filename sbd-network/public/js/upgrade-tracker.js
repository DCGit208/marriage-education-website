/**
 * UPGRADE TRACKER v248
 * =====================
 * Tracks lock-hit events during a session and nudges users toward upgrade
 * after repeated encounters with tier-locked content.
 *
 * Usage:
 *   - tier-access.js calls window.UpgradeTracker.trackLockHit(tier, context) on every lock modal show.
 *   - After 3 hits in one session → soft upgrade nudge modal fires automatically.
 *   - All hits written to Firestore: upgradeEvents/{uid}_{timestamp}
 *
 * Window API:
 *   window.UpgradeTracker.trackLockHit(lockedTier, context)
 *   window.UpgradeTracker.getSessionHits()
 *   window.UpgradeTracker.resetSession()
 */

(function () {
  'use strict';

  const SESSION_KEY     = 'sbd_upgrade_hits';
  const NUDGE_THRESHOLD = 3;      // nudge modal fires on Nth hit
  const NUDGE_COOLDOWN  = 10 * 60 * 1000; // 10 minutes between auto-nudges

  // ── Session storage helpers ───────────────────────────────────

  function getSessionData() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') || {
        hits: 0,
        lastNudge: 0,
        events: [],
      };
    } catch (_) {
      return { hits: 0, lastNudge: 0, events: [] };
    }
  }

  function saveSessionData(data) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  // ── Firestore write ───────────────────────────────────────────

  async function writeEvent(lockedTier, context) {
    try {
      const user = firebase.auth().currentUser;
      if (!user) return;

      const db  = firebase.firestore();
      const now = Date.now();

      await db.collection('upgradeEvents').add({
        uid:        user.uid,
        lockedTier: lockedTier || 'unknown',
        context:    context    || 'unknown',
        page:       window.location.pathname,
        ts:         firebase.firestore.FieldValue.serverTimestamp(),
        sessionId:  getOrCreateSessionId(),
      });
    } catch (_) {
      // Silent — analytics should never block UX
    }
  }

  function getOrCreateSessionId() {
    const key = 'sbd_session_id';
    let sid = sessionStorage.getItem(key);
    if (!sid) {
      sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(key, sid);
    }
    return sid;
  }

  // ── Nudge modal ───────────────────────────────────────────────

  function showNudgeModal(lockedTier) {
    // Don't stack on an existing open modal
    if (document.getElementById('upgradeNudgeModal')) return;

    const tierLabels = {
      foundation: { label: 'Foundation',  price: '$9/mo',  href: '/payment?tier=foundation' },
      premium:    { label: 'Premium',      price: '$20/mo', href: '/payment?tier=premium' },
      elite:      { label: 'Elite',        price: '$50/mo', href: '/payment?tier=elite' },
    };

    const target  = tierLabels[lockedTier] || tierLabels.foundation;
    const overlay = document.createElement('div');
    overlay.id    = 'upgradeNudgeModal';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9999',
      'background:rgba(0,0,0,0.72)',
      'display:flex', 'align-items:flex-end', 'justify-content:center',
      'padding:1rem',
    ].join(';');

    overlay.innerHTML = `
      <div style="
        background:#181818;
        border:1px solid rgba(198,169,107,0.3);
        border-radius:18px 18px 14px 14px;
        padding:1.75rem 1.5rem 1.5rem;
        max-width:420px;
        width:100%;
        font-family:'Georgia',serif;
        color:#EAE3D2;
        box-shadow: 0 -16px 48px rgba(0,0,0,0.6);
        animation: nudgeSlideUp 0.32s ease;
      ">
        <style>
          @keyframes nudgeSlideUp {
            from { transform: translateY(60px); opacity:0; }
            to   { transform: translateY(0);    opacity:1; }
          }
        </style>
        <p style="font-size:0.62rem;letter-spacing:0.14em;text-transform:uppercase;color:#A8A29E;margin-bottom:0.5rem;">
          You've hit a few locked areas
        </p>
        <h3 style="font-size:1.25rem;font-weight:700;margin-bottom:0.5rem;color:#EAE3D2;">
          Ready to go deeper?
        </h3>
        <p style="font-size:0.82rem;color:#A8A29E;line-height:1.6;margin-bottom:1.5rem;">
          ${target.label} unlocks the content you keep running into — and much more. 
          Start at ${target.price} and cancel anytime.
        </p>
        <div style="display:flex;gap:0.75rem;">
          <a href="${target.href}"
             style="flex:1;background:#C6A96B;color:#0D0D0D;font-weight:700;font-size:0.85rem;
                    text-align:center;padding:0.75rem 1rem;border-radius:10px;text-decoration:none;
                    font-family:'Georgia',serif;">
            Upgrade to ${target.label} →
          </a>
          <button id="nudgeCloseBtn"
                  style="flex-shrink:0;background:transparent;border:1px solid rgba(255,255,255,0.12);
                         color:#A8A29E;font-size:0.8rem;padding:0.75rem 1rem;border-radius:10px;cursor:pointer;
                         font-family:'Georgia',serif;">
            Later
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    // Close handlers
    document.getElementById('nudgeCloseBtn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); }
    });
  }

  // ── Public API ────────────────────────────────────────────────

  function trackLockHit(lockedTier, context) {
    const data  = getSessionData();
    const now   = Date.now();

    data.hits += 1;
    data.events.push({ lockedTier, context, ts: now });
    saveSessionData(data);

    // Fire analytics write (non-blocking)
    writeEvent(lockedTier, context);

    // Auto nudge after threshold, with cooldown
    if (data.hits >= NUDGE_THRESHOLD && (now - data.lastNudge) >= NUDGE_COOLDOWN) {
      data.lastNudge = now;
      saveSessionData(data);

      // Slight delay so the lock modal appears first
      setTimeout(() => showNudgeModal(lockedTier), 800);
    }
  }

  function getSessionHits() {
    return getSessionData().hits;
  }

  function resetSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  // ── Expose globally ───────────────────────────────────────────

  window.UpgradeTracker = { trackLockHit, getSessionHits, resetSession };

  console.log('[UpgradeTracker] v248 ready. Session hits:', getSessionHits());
})();
