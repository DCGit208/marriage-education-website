/**
 * MV HOUSE — Wardrobe System v257
 * ================================
 * Features:
 *  1. Tab count badges per category
 *  2. Completeness bar per category (10 looks = 100%)
 *  3. Re-categorize look via bottom sheet modal
 *  4. Personal style notes on each look
 *  5. Share look to DM
 *  6. Background migration of legacy saves → new path
 */

const CATEGORIES = ['corporate', 'casual-day', 'casual-night', 'casual-home', 'official', 'private'];
const CATEGORY_LABELS = {
  'corporate':    '💼 Corporate',
  'casual-day':   '☀️ Casual Day',
  'casual-night': '🌙 Casual Night',
  'casual-home':  '🏡 Home',
  'official':     '👑 Official',
};
const CATEGORY_ICONS = {
  'corporate':    '💼',
  'casual-day':   '☀️',
  'casual-night': '🌙',
  'casual-home':  '🏡',
  'official':     '👑',
  'private':      '🔥',
};

// ─── A3 EXPRESSION GUIDANCE — DEFAULT BANK ───────────────────────
// Real data is loaded from Firestore mv_guidance/{category}.
// This serves as fallback if Firestore is unavailable.
const GUIDANCE_DEFAULTS = {
  'corporate': {
    context:  'Corporate — Structured Authority',
    attitude: 'Carry sexual authority beneath composure. Your movement must communicate that you are fully present in your body — controlled, not suppressed. Maneuverability here is precision: every gesture deliberate, every posture governed.',
    attire:   'Structure must frame nakedness, not bury it. Blazers, fitted lines, defined necklines — the dressing scores high on formal nakedness genre. Clothing must outline what it covers.',
    allure:   'The undeniable impact is controlled attraction. Your spouse sees authority on the outside and nakedness underneath — the combination creates irresistible intrigue.',
    warning:  'If your structure kills your nakedness, you become invisible.',
  },
  'casual-day': {
    context:  'Casual Day — Effortless Expression',
    attitude: 'Your body speaks naturally. Carry yourself with open, unhurried sexuality. Maneuverability is ease — clothes that move with you, not against you. Casual does not mean asexual.',
    attire:   'Light fabrics, soft fits, natural skin presence. Rates high on relaxed nakedness genre — the body is present, not hidden. Movement reveals and breathes.',
    allure:   'Effortless pull. Your spouse is drawn without effort on your part — the relaxed expression creates approachability combined with unmistakable sexuality.',
    warning:  'If your casual kills your sexuality, you are practising asexuality.',
  },
  'casual-night': {
    context:  'Casual Night — Sexual Invitation',
    attitude: 'You are fully active in your sexuality. Movement must invite — cuts, silhouette, and revelation are handled with intention. You control what is seen and when.',
    attire:   'High nakedness genre score. Cuts, openings, and silhouette create "seeing without fully seeing". The dressing is a stage — it performs before you speak.',
    allure:   'The pull is undeniable and directional. Your spouse is activated — not passively attracted but magnetically drawn into engagement with you.',
    warning:  'If you go out at night dressed asexually, you are misaligned with your purpose.',
  },
  'casual-home': {
    context:  'Home — Intimate Nakedness Stewardship',
    attitude: 'At home your sexuality is never on pause. Carry softness and availability — maneuverability means immediate transition into full nakedness is always possible.',
    attire:   'Minimal dressing. Maximum nakedness genre rating. Comfort that does not obstruct — your attire must serve intimate access, not delay it.',
    allure:   'Direct and constant. The everyday presence of your nakedness at home is the most powerful allure in marriage — it builds a continuous atmosphere of intimacy.',
    warning:  'If your home dressing is asexual, your marriage becomes structurally weak.',
  },
  'official': {
    context:  'Official — Elevated Nakedness Under Refinement',
    attitude: 'Refined posture, deliberate movement. You carry authority and nakedness simultaneously — neither cancels the other. Maneuverability is precision and grace.',
    attire:   'Elegance with deliberate revelation points. Nakedness genre is present beneath elevated structure — it is refined, not removed. Precision in fit is non-negotiable.',
    allure:   'Your spouse sees the whole picture: elevated on the outside, sexually present beneath. The impact is deep and sustained — sophistication combined with nakedness.',
    warning:  'If elegance removes sexuality, it becomes decoration, not expression.',
  },
  'private': {
    context:  'Private — Full Sexual Expression',
    attitude: 'Nothing is held back. Your attitude is completely sexually active — you inhabit your nakedness fully. Maneuverability means immediate, unrestricted access to every part of you.',
    attire:   'Maximum nakedness genre score. Dressing exists only to serve the expression of nakedness — it enhances, frames, or reveals. Nothing obstructs.',
    allure:   'Total impact. Your spouse is fully activated — every element of the encounter is designed to serve complete sexual engagement. This is the peak of the A3 system.',
    warning:  'If your dressing blocks access to your nakedness, it is working against you.',
  },
};

// Live guidance loaded from Firestore (overrides defaults per category)
let GUIDANCE = { ...GUIDANCE_DEFAULTS };

async function loadFirestoreGuidance() {
  try {
    const snap = await firebase.firestore().collection('mv_guidance').get();
    snap.docs.forEach(doc => {
      if (GUIDANCE_DEFAULTS[doc.id] !== undefined || doc.data().context) {
        GUIDANCE[doc.id] = { ...GUIDANCE_DEFAULTS[doc.id], ...doc.data() };
      }
    });
    console.log(`[MV House] Loaded ${snap.size} guidance docs from Firestore`);
  } catch (err) {
    console.warn('[MV House] Could not load Firestore guidance — using defaults:', err.message);
  }
}

const DEFAULT_NOTE_PLACEHOLDER = 'When to wear it, how it makes you feel, what occasions it suits. How does your nakedness stay present?';
const TARGET_LOOKS = 10; // looks needed for 100% completeness

let currentUid      = null;
let currentUserData = {};
let currentTab      = 'saved';
let allItems        = [];
let activeItemId    = null; // item being acted on in a modal
window.wardrobeViewMode = 'mine';
window.sharedWardrobeContext = null;

function isSharedWardrobeView() {
  return window.wardrobeViewMode === 'shared-view' ||
    (typeof window.MvHouseShares !== 'undefined' && window.MvHouseShares.isSharedView?.());
}

/** MV House gate — formation tone; hide Elite paywall when user is already Elite but gated. */
async function applyMvHouseGate(access) {
  const gateEl = document.getElementById('mvGate');
  if (!gateEl) return;

  const gateTitle = gateEl.querySelector('.mv-gate-title');
  const gateSub = gateEl.querySelector('.mv-gate-sub');
  const gateFeats = gateEl.querySelector('.mv-gate-feats');
  const gateBtn = gateEl.querySelector('.mv-upgrade-btn');
  const supportBtn = gateEl.querySelector('.mv-support-btn');

  const isPaywall = access.showPaywall === true;
  const title = access.message || (isPaywall ? 'MV House is Elite' : 'MV House');
  const detail = access.detail || access.reason || '';

  if (gateTitle) gateTitle.textContent = title;
  if (gateSub) gateSub.textContent = detail;

  if (gateFeats) {
    gateFeats.style.display = isPaywall ? '' : 'none';
  }

  if (gateBtn) {
    if (isPaywall) {
      gateBtn.textContent = 'Unlock MV House — Elite $50/mo →';
      gateBtn.href = access.ctaUrl || '/payment?tier=elite';
      gateBtn.style.display = '';
    } else {
      gateBtn.textContent = access.ctaLabel || 'Continue Formation →';
      gateBtn.href = access.ctaUrl || '/courses.html';
      gateBtn.style.display = detail ? '' : 'none';
    }
  }

  if (supportBtn) {
    if (!isPaywall && access.showSupportDm && window.SbdPlatform?.buildSupportDmUrl) {
      const url = await SbdPlatform.buildSupportDmUrl({
        prefill: access.supportPrefill || 'Hi — I need help with MV House access.',
      });
      if (url) {
        supportBtn.href = url;
        supportBtn.style.display = '';
      } else {
        supportBtn.style.display = 'none';
      }
    } else {
      supportBtn.style.display = 'none';
    }
  }
}

// ─── INIT ─────────────────────────────────────────────────────────

firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = '/auth'; return; }
  currentUid = user.uid;
  await init();
});

async function init() {
  try {
    const userSnap = await firebase.firestore().collection('users').doc(currentUid).get();
    currentUserData = userSnap.exists ? userSnap.data() : {};

    const FA = window.FormationAccess;
    let tier = 'free';
    if (FA?.getUserTier) {
      tier = await FA.getUserTier(currentUid);
    } else if (FA?.resolveEffectiveTier) {
      tier = FA.resolveEffectiveTier(currentUserData);
    } else {
      tier = currentUserData?.subscription?.tier || currentUserData?.tier || 'free';
    }

    const badge = document.getElementById('tierBadge');
    if (badge) {
      const label = String(tier).replace(/_/g, ' ');
      badge.textContent = label.charAt(0).toUpperCase() + label.slice(1);
      const hasAdv =
        typeof AdvancedExpressionAccess !== 'undefined'
          ? AdvancedExpressionAccess.hasAdvancedExpressionAccess(currentUserData)
          : (FA?.hasEliteTier ? FA.hasEliteTier(currentUserData) : tier === 'elite');
      if (!hasAdv) { badge.style.background = 'rgba(255,255,255,0.05)'; badge.style.color = '#A8A29E'; }
    }

    const access = FA?.getMvHouseAccess
      ? FA.getMvHouseAccess(currentUserData)
      : { allowed: tier === 'elite' || currentUserData?.role === 'admin' };

    if (!access.allowed) {
      await applyMvHouseGate(access);
      document.getElementById('mvGate').style.display = 'block';
      document.getElementById('mvLoading').style.display = 'none';
      return;
    }

    document.getElementById('mvGate').style.display = 'none';
    document.getElementById('mvContent').style.display = 'block';

    await loadFirestoreGuidance();
    await loadWardrobeItems();

    window._mvHouseApi = {
      currentUid,
      currentUserData,
      fetchDmPeers,
      showToast,
      setAllItems(items) {
        allItems = items;
        updateTabCounts();
      },
      refreshUi() {
        updateTabCounts();
        switchTab(currentTab, document.querySelector(`.mv-tab[data-tab="${currentTab}"]`));
      },
      reloadWardrobe: loadWardrobeItems,
      switchTab,
    };
    if (window.MvHouseShares) await window.MvHouseShares.init();
  } catch (err) {
    console.error('[MV House] init error:', err);
    document.getElementById('mvLoading').textContent = 'Could not load wardrobe. Refresh to retry.';
  }
}

// ─── LOAD (dual-path) ──────────────────────────────────────────────

async function loadWardrobeItems() {
  document.getElementById('mvLoading').style.display = 'block';
  try {
    // PATH 1: new — wardrobes/{uid}/items/{postId}
    let newItems = [];
    try {
      const snap = await firebase.firestore()
        .collection('wardrobes').doc(currentUid).collection('items').get();
      newItems = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) { console.warn('[MV House] new-path error:', e.code); }

    // PATH 2: legacy — users/{uid}/wardrobes/{context} → looks[]
    let oldItems = [];
    try {
      const oldSnaps = await Promise.all(
        CATEGORIES.map(ctx =>
          firebase.firestore().collection('users').doc(currentUid)
            .collection('wardrobes').doc(ctx).get()
        )
      );
      oldSnaps.forEach(doc => {
        if (!doc.exists) return;
        (doc.data().looks || []).forEach((look, idx) => {
          oldItems.push({
            id:      look.postId || `${doc.id}-${idx}`,
            category: look.expressionType || doc.id,
            caption:  look.content || '',
            mediaUrl: look.mediaUrl || null,
            boardId:  look.boardId  || null,
            postId:   look.postId   || null,
            savedAt:  look.savedAt  || null,
            note:     look.note     || '',
            _source:  'legacy',
            _legacyCtx: doc.id,
          });
        });
      });
    } catch (e) { console.warn('[MV House] legacy-path error:', e.code); }

    // Merge + deduplicate
    const seen = new Set(newItems.map(i => i.postId || i.id));
    const merged = [
      ...newItems,
      ...oldItems.filter(i => !seen.has(i.postId || i.id)),
    ];
    merged.sort((a, b) => {
      const ta = a.savedAt?.toMillis?.() || (a.savedAt?.seconds || 0) * 1000;
      const tb = b.savedAt?.toMillis?.() || (b.savedAt?.seconds || 0) * 1000;
      return tb - ta;
    });

    allItems = merged;
    console.log(`[MV House] Loaded ${allItems.length} items (${newItems.length} new + ${oldItems.length} legacy)`);

    document.getElementById('mvLoading').style.display = 'none';
    updateTabCounts();
    switchTab(currentTab, document.querySelector('.mv-tab.active'));

    // Feature 6: background migrate legacy → new path (fire-and-forget)
    migrateLegacyItems(oldItems, newItems);

  } catch (err) {
    console.error('[MV House] load error:', err);
    document.getElementById('mvLoading').textContent = 'Error loading wardrobe.';
  }
}

// ─── FEATURE 1: TAB COUNT BADGES ──────────────────────────────────

function updateTabCounts() {
  const el = id => document.getElementById(id);
  el('cnt-saved').textContent    = allItems.length || '';
  CATEGORIES.forEach(cat => {
    const count = allItems.filter(i => (i.category || '').toLowerCase() === cat).length;
    const el2 = el(`cnt-${cat}`);
    if (el2) el2.textContent = count || '';
  });
}

// ─── FEATURE 3: COMPLETENESS BAR ──────────────────────────────────

function updateCompletenessBar(tab) {
  const wrap    = document.getElementById('completenessWrap');
  const label   = document.getElementById('completenessLabel');
  const fill    = document.getElementById('completenessFill');
  const percent = document.getElementById('completenessPercent');

  if (tab === 'saved') { wrap.style.display = 'none'; return; }

  const items   = allItems.filter(i => (i.category || '').toLowerCase() === tab);
  const pct     = Math.min(Math.round((items.length / TARGET_LOOKS) * 100), 100);
  wrap.style.display    = 'block';
  label.textContent     = `${CATEGORY_LABELS[tab] || tab} Wardrobe`;
  fill.style.width      = `${pct}%`;
  percent.textContent   = `${pct}%`;
}

// ─── TABS ──────────────────────────────────────────────────────────

function switchTab(tab, btn) {
  currentTab = tab;
  document.querySelectorAll('.mv-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('[id^="panel-"]').forEach(p => p.style.display = 'none');
  const panel = document.getElementById(`panel-${tab}`);
  if (panel) panel.style.display = 'block';
  updateCompletenessBar(tab);
  renderGrid(tab);
}

function renderGrid(tab) {
  const grid = document.getElementById(`grid-${tab}`);
  if (!grid) return;
  const items = tab === 'saved'
    ? allItems
    : allItems.filter(i => (i.category || '').toLowerCase() === tab);
  if (items.length === 0) { grid.innerHTML = buildEmptyState(tab); return; }
  grid.innerHTML = items.map(item => buildLookCard(item)).join('');
  // Stagger entrance — reveal each card with a 55ms column-offset delay
  const cards = grid.querySelectorAll('.look-card');
  cards.forEach((card, i) => {
    setTimeout(() => card.classList.add('card-visible'), i * 55);
  });
}

// ─── CARD BUILDER ─────────────────────────────────────────────────

function isVideoUrl(url) {
  return url && /\.(mp4|mov|webm|m4v|ogv)(\?|$)/i.test(url);
}

function buildMediaHtml(item) {
  if (!item.mediaUrl) {
    return `<div class="look-card-image">${CATEGORY_ICONS[item.category] || '👗'}</div>`;
  }
  if (isVideoUrl(item.mediaUrl)) {
    return `<div class="look-card-image">
      <div class="look-card-video-wrap">
        <video src="${escHtml(item.mediaUrl)}" autoplay muted loop playsinline></video>
        <span class="look-card-video-badge">▶ VIDEO</span>
      </div>
    </div>`;
  }
  return `<div class="look-card-image"><img src="${escHtml(item.mediaUrl)}" alt="" loading="lazy"></div>`;
}

function buildA3Dots(rating) {
  // rating 1-5, dots filled up to rating
  const r = Math.min(5, Math.max(0, rating || 0));
  return Array.from({length: 5}, (_, i) =>
    `<span class="a3-dot${i < r ? ' filled' : ''}"></span>`
  ).join('');
}

function buildGuidanceCard(item) {
  const g = GUIDANCE[item.category];
  if (!g) return '';
  const safeId = escHtml(item.id);
  const ratings = item.a3Ratings || {};
  return `
    <button class="mvg-toggle-btn" onclick="event.stopPropagation(); toggleGuidance('${safeId}', this)" aria-expanded="false">
      ✦ A3 Expression Guide
      <span class="mvg-arrow">▼</span>
    </button>
    <div class="mv-guidance-card" id="guidance-${safeId}" onclick="event.stopPropagation()">
      <div class="mvg-context">${escHtml(g.context)}</div>
      <div class="mvg-a3-row">
        <div class="mvg-a3-header"><span class="mvg-a3-label">Attitude</span><span class="mvg-a3-dots">${buildA3Dots(ratings.attitude)}</span></div>
        <p class="mvg-a3-value">${escHtml(g.attitude)}</p>
      </div>
      <div class="mvg-a3-row">
        <div class="mvg-a3-header"><span class="mvg-a3-label">Attire</span><span class="mvg-a3-dots">${buildA3Dots(ratings.attire)}</span></div>
        <p class="mvg-a3-value">${escHtml(g.attire)}</p>
      </div>
      <div class="mvg-a3-row">
        <div class="mvg-a3-header"><span class="mvg-a3-label">Allure</span><span class="mvg-a3-dots">${buildA3Dots(ratings.allure)}</span></div>
        <p class="mvg-a3-value">${escHtml(g.allure)}</p>
      </div>
      <div class="mvg-warning">${escHtml(g.warning)}</div>
    </div>`;
}

function buildLookCard(item) {
  const mediaHtml    = buildMediaHtml(item);
  let savedDate = '';
  if (item.savedAt) {
    try {
      const d = item.savedAt.toDate ? item.savedAt.toDate() : new Date((item.savedAt.seconds || 0) * 1000);
      savedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (_) {}
  }
  const safeId       = escHtml(item.id);
  const note         = item.note || '';
  const noteHtml     = `<div class="look-note${note ? ' has-note' : ''}" id="note-${safeId}">${escHtml(note) || ''}</div>`;
  const guidanceHtml = buildGuidanceCard(item);

  // Caption — Facebook-style inline "...see more" when long
  const rawCaption = item.caption || item.content || 'MV House Look';
  const CAP_LIMIT  = 110;
  let captionHtml;
  if (rawCaption.length <= CAP_LIMIT) {
    captionHtml = `<p class="look-card-caption">${escHtml(rawCaption)}</p>`;
  } else {
    // Trim to last word boundary so we don't cut mid-word
    const cut = rawCaption.slice(0, CAP_LIMIT).replace(/\s+\S*$/, '');
    captionHtml = `<p class="look-card-caption" id="cap-${safeId}">
      <span class="cap-short">${escHtml(cut)}<span class="cap-ellipsis">... </span><button class="cap-see-more" onclick="event.stopPropagation(); toggleCaption('${safeId}')">see more</button></span>
      <span class="cap-full" hidden>${escHtml(rawCaption)} <button class="cap-see-more cap-see-less" onclick="event.stopPropagation(); toggleCaption('${safeId}')">see less</button></span>
    </p>`;
  }

  // A3 dots on card face (from saved ratings)
  const ratings = item.a3Ratings || {};
  const hasFaceRatings = ratings.attitude || ratings.attire || ratings.allure;
  const faceRatingsHtml = hasFaceRatings ? `
    <div class="a3-face-ratings" onclick="event.stopPropagation()">
      <span class="a3-face-item"><span class="a3-face-lbl">A</span>${buildA3Dots(ratings.attitude)}</span>
      <span class="a3-face-sep">·</span>
      <span class="a3-face-item"><span class="a3-face-lbl">T</span>${buildA3Dots(ratings.attire)}</span>
      <span class="a3-face-sep">·</span>
      <span class="a3-face-item"><span class="a3-face-lbl">L</span>${buildA3Dots(ratings.allure)}</span>
    </div>` : '';

  const sharedView = isSharedWardrobeView();
  const actionsHtml = sharedView
    ? `<div class="look-card-actions look-card-actions--readonly" onclick="event.stopPropagation()">
        <button class="lca-btn" onclick="openLook('${safeId}')">↗ View post</button>
      </div>`
    : `<div class="look-card-actions" onclick="event.stopPropagation()">
        <button class="lca-btn" onclick="openNotesModal('${safeId}')">✏️ Note</button>
        <button class="lca-btn" onclick="openRecatModal('${safeId}')">📂 Move</button>
        <button class="lca-btn share" onclick="openShareModal('${safeId}')">💬 Share</button>
        <button class="lca-btn lca-expand" onclick="expandExpression('${safeId}')">⊕ Expand</button>
        <button class="lca-btn" onclick="removeLook(event,'${safeId}')" style="color:#ff5a5a;">✕</button>
      </div>`;

  return `
    <div class="look-card" onclick="openLook('${safeId}')">
      ${mediaHtml}
      <div class="look-card-body">
        ${captionHtml}
        ${faceRatingsHtml}
        ${savedDate ? `<p class="look-card-meta">Saved ${savedDate} · ${CATEGORY_ICONS[item.category] || ''} ${item.category || ''}</p>` : ''}
      </div>
      ${sharedView ? '' : noteHtml}
      ${sharedView ? '' : guidanceHtml}
      ${actionsHtml}
    </div>`;
}

function buildEmptyState(tab) {
  const boardLink = `/boards.html`;
  const label     = CATEGORY_LABELS[tab] || 'MV House boards';
  const g         = GUIDANCE[tab];
  const doctrineHtml = g
    ? `<p class="mv-empty-doctrine">${escHtml(g.context)}</p>`
    : '';
  return `
    <div class="mv-empty" style="grid-column:1/-1;">
      <div class="mv-empty-icon">👗</div>
      ${doctrineHtml}
      <p>This category is waiting for your first look.</p>
      <p>Browse <a href="${boardLink}">${label}</a> and tap <strong>Save to Wardrobe</strong> on any post.</p>
    </div>`;
}

// Category → canonical boardId fallback (used when item has no boardId stored)
const CATEGORY_BOARD_MAP = {
  'corporate':    'mv-house-corporate',
  'casual-day':   'mv-house-casual-day',
  'casual-night': 'mv-house-casual-night',
  'casual-home':  'mv-house-casual-home',
  'official':     'mv-house-official',
  'saved':        'mv-house-general',
};

// ─── LOOK NAVIGATION ──────────────────────────────────────────────

async function openLook(itemId) {
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;

  // For new-path items: item.id === doc.id === postId, so this covers both
  let postId  = item.postId  || (item._source !== 'legacy' ? item.id : null);
  let boardId = item.boardId || null;

  // If boardId missing, try to pull it from the post document
  if (postId && !boardId) {
    try {
      const snap = await firebase.firestore().collection('posts').doc(postId).get();
      if (snap.exists && snap.data().boardId) {
        boardId = snap.data().boardId;
      }
    } catch (err) {
      console.warn('[MV House] openLook: could not fetch post boardId:', err.message);
    }
  }

  // Last resort: derive boardId from the saved category
  if (!boardId && item.category) {
    boardId = CATEGORY_BOARD_MAP[item.category] || null;
  }

  if (boardId && postId) {
    window.location.href = `/board.html?boardId=${encodeURIComponent(boardId)}&post=${encodeURIComponent(postId)}`;
  } else if (boardId) {
    window.location.href = `/board.html?boardId=${encodeURIComponent(boardId)}`;
  } else {
    window.location.href = '/boards.html';
  }
}

// ─── REMOVE ───────────────────────────────────────────────────────

async function removeLook(evt, itemId) {
  evt.stopPropagation();
  if (!confirm('Remove this look from your wardrobe?')) return;
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;
  try {
    if (item._source === 'legacy') {
      const ref = firebase.firestore().collection('users').doc(currentUid)
        .collection('wardrobes').doc(item._legacyCtx || item.category);
      const doc = await ref.get();
      if (doc.exists) {
        const filtered = (doc.data().looks || []).filter(l => l.postId !== item.postId);
        await ref.update({ looks: filtered });
      }
    } else {
      await firebase.firestore().collection('wardrobes').doc(currentUid)
        .collection('items').doc(itemId).delete();
    }
    allItems = allItems.filter(i => i.id !== itemId);
    updateTabCounts();
    updateCompletenessBar(currentTab);
    renderGrid(currentTab);
    showToast('Look removed.');
  } catch (err) {
    console.error('[MV House] remove error:', err);
    alert('Could not remove look. Try again.');
  }
}

// ─── FEATURE: EXPAND EXPRESSION ──────────────────────────────────

function expandExpression(itemId) {
  const item = allItems.find(i => i.id === itemId);
  if (!item || !item.category) return;
  const tabBtn = document.querySelector(`.mv-tab[data-tab="${item.category}"]`);
  if (tabBtn) {
    switchTab(item.category, tabBtn);
    tabBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ─── FEATURE: GUIDANCE TOGGLE ────────────────────────────────────

function toggleGuidance(itemId, btn) {
  const card = document.getElementById(`guidance-${itemId}`);
  if (!card) return;
  const isOpen = card.classList.toggle('open');
  btn.classList.toggle('open', isOpen);
  btn.setAttribute('aria-expanded', isOpen);
}

// ─── FEATURE: CAPTION REVEAL ─────────────────────────────────────

function toggleCaption(itemId) {
  const p     = document.getElementById(`cap-${itemId}`);
  if (!p) return;
  const short = p.querySelector('.cap-short');
  const full  = p.querySelector('.cap-full');
  const expanded = !full.hidden;
  short.hidden = !expanded;
  full.hidden  = expanded;
}



function searchExpression(query) {
  const q = (query || '').trim().toLowerCase();
  const clearBtn = document.getElementById('mvSearchClear');
  if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';
  if (!q) {
    const activeTab = document.querySelector('.mv-tab.active');
    switchTab(currentTab, activeTab);
    return;
  }
  const results = allItems.filter(item => {
    const haystack = [item.note, item.caption, item.content, item.boardName, item.category]
      .filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  });
  // Show results in the saved panel reused as search results container
  document.querySelectorAll('.mv-section').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.mv-tab').forEach(t => t.classList.remove('active'));
  // Use whichever panel is first as the results container
  const panels = ['saved','corporate','casual-day','casual-night','casual-home','official','private'];
  let panel, grid;
  for (const id of panels) {
    panel = document.getElementById(`panel-${id}`);
    grid  = document.getElementById(`grid-${id}`);
    if (panel && grid) break;
  }
  if (!panel || !grid) return;
  panel.style.display = 'block';
  const label = panel.querySelector('.mv-section-label');
  if (label) label.textContent = `🔍 Results for "${query}"`;
  grid.innerHTML = results.length
    ? results.map(buildLookCard).join('')
    : `<div class="mv-empty" style="grid-column:1/-1;"><div class="mv-empty-icon">🔍</div><p>No looks found for "${escHtml(query)}"</p><p>Try: "corporate", "night", "home"</p></div>`;
}

// ─── FEATURE 2: RE-CATEGORIZE ─────────────────────────────────────

function openRecatModal(itemId) {
  activeItemId = itemId;
  const item   = allItems.find(i => i.id === itemId);
  if (!item) return;
  const grid = document.getElementById('recatGrid');
  grid.innerHTML = CATEGORIES.map(cat => `
    <button class="recat-btn${(item.category || '') === cat ? ' active' : ''}"
            onclick="applyRecat('${escHtml(cat)}')">
      <span class="recat-icon">${CATEGORY_ICONS[cat]}</span>
      ${cat.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
    </button>`).join('');
  openModal('recatModal');
}

async function applyRecat(newCategory) {
  const item = allItems.find(i => i.id === activeItemId);
  if (!item) return;
  const old = item.category;
  item.category = newCategory;

  try {
    if (item._source === 'legacy') {
      // Update inside looks array in old legacy doc
      const ref = firebase.firestore().collection('users').doc(currentUid)
        .collection('wardrobes').doc(item._legacyCtx || old);
      const doc = await ref.get();
      if (doc.exists) {
        const looks = (doc.data().looks || []).map(l =>
          l.postId === item.postId ? { ...l, expressionType: newCategory } : l
        );
        await ref.update({ looks });
      }
    } else {
      await firebase.firestore().collection('wardrobes').doc(currentUid)
        .collection('items').doc(activeItemId)
        .update({ category: newCategory });
    }
    closeModal('recatModal');
    updateTabCounts();
    updateCompletenessBar(currentTab);
    renderGrid(currentTab);
    showToast(`Moved to ${CATEGORY_LABELS[newCategory] || newCategory}`);
  } catch (err) {
    console.error('[MV House] recat error:', err);
    showToast('Could not move look. Try again.');
  }
}

// ─── FEATURE 4: STYLE NOTES ───────────────────────────────────────

function openNotesModal(itemId) {
  activeItemId = itemId;
  const item   = allItems.find(i => i.id === itemId);
  if (!item) return;
  const ta    = document.getElementById('notesTextarea');
  const count = document.getElementById('notesCharCount');
  ta.value    = item.note || '';
  count.textContent = `${ta.value.length} / 400`;
  ta.oninput  = () => { count.textContent = `${ta.value.length} / 400`; };

  // Dynamic placeholder + subtitle based on wardrobe category
  const guidance = GUIDANCE[item.category];
  ta.placeholder = guidance ? guidance.notePlaceholder : DEFAULT_NOTE_PLACEHOLDER;
  const subtitle = document.getElementById('notesSubtitle');
  if (subtitle) subtitle.textContent = guidance ? guidance.context : 'When to wear it, how it makes you feel, what occasions it suits.';

  document.getElementById('notesSaveBtn').onclick = () => saveNote(ta.value.trim());
  openModal('notesModal');
}

async function saveNote(noteText) {
  const item = allItems.find(i => i.id === activeItemId);
  if (!item) return;
  item.note = noteText;
  try {
    if (item._source === 'legacy') {
      const ref = firebase.firestore().collection('users').doc(currentUid)
        .collection('wardrobes').doc(item._legacyCtx || item.category);
      const doc = await ref.get();
      if (doc.exists) {
        const looks = (doc.data().looks || []).map(l =>
          l.postId === item.postId ? { ...l, note: noteText } : l
        );
        await ref.update({ looks });
      }
    } else {
      await firebase.firestore().collection('wardrobes').doc(currentUid)
        .collection('items').doc(activeItemId)
        .update({ note: noteText });
    }
    closeModal('notesModal');
    // Update inline note display without full re-render
    const noteEl = document.getElementById(`note-${activeItemId}`);
    if (noteEl) {
      noteEl.textContent = noteText;
      noteEl.className = `look-note${noteText ? ' has-note' : ''}`;
    }
    showToast(noteText ? '✓ Note saved.' : 'Note cleared.');
  } catch (err) {
    console.error('[MV House] note save error:', err);
    showToast('Could not save note.');
  }
}

// ─── FEATURE 5: SHARE TO DM ───────────────────────────────────────

async function openShareModal(itemId) {
  activeItemId = itemId;
  const item   = allItems.find(i => i.id === itemId);
  if (!item) return;

  openModal('shareDmModal');
  const list    = document.getElementById('dmUserList');
  const search  = document.getElementById('dmSearchInput');
  list.innerHTML = '<div style="padding:1rem;color:var(--text-sec);font-size:0.82rem;">Loading members…</div>';
  search.value   = '';

  let peers = [];
  try {
    peers = await fetchDmPeers();
  } catch (err) {
    list.innerHTML = `<div style="padding:1rem;color:#f55;font-size:0.82rem;">${err.message}</div>`;
    return;
  }

  function renderPeers(p) {
    if (!p.length) { list.innerHTML = '<div style="padding:1rem;color:var(--text-sec);font-size:0.82rem;">No members found.</div>'; return; }
    list.innerHTML = '';
    p.forEach(u => {
      const row = document.createElement('div');
      row.className = 'mvh-dm-row';
      const initials = u.name.charAt(0).toUpperCase();
      row.innerHTML = `
        <div class="mvh-dm-avatar">${u.photoUrl ? `<img src="${escHtml(u.photoUrl)}" alt="">` : initials}</div>
        <span class="mvh-dm-name">${escHtml(u.name)}</span>`;
      row.addEventListener('click', async () => {
        row.style.opacity = '0.4';
        row.style.pointerEvents = 'none';
        try {
          await sendLookAsDm(u, item);
          closeModal('shareDmModal');
          showToast(`Shared with ${u.name} 💬`);
        } catch (e) {
          showToast('Could not share. Try again.');
          row.style.opacity = '';
          row.style.pointerEvents = '';
        }
      });
      list.appendChild(row);
    });
  }

  renderPeers(peers);
  search.oninput = () => {
    const q = search.value.toLowerCase();
    renderPeers(peers.filter(u => u.name.toLowerCase().includes(q)));
  };
}

async function fetchDmPeers() {
  const db2 = firebase.firestore();
  const myGroups = currentUserData.groups || [];
  const isAdmin  = currentUserData.role === 'admin';
  if (isAdmin) {
    const snap = await db2.collection('users').get();
    return snap.docs
      .filter(d => d.id !== currentUid)
      .map(d => ({ id: d.id, name: d.data().name || d.data().email || 'Member', photoUrl: d.data().photoUrl || null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  if (!myGroups.length) return [];
  const snaps = await Promise.all(myGroups.map(gid =>
    db2.collection('users').where('groups', 'array-contains', gid).get()
  ));
  const seen = new Map();
  snaps.forEach(s => s.forEach(d => { if (d.id !== currentUid) seen.set(d.id, d); }));
  return Array.from(seen.values())
    .map(d => ({ id: d.id, name: d.data().name || d.data().email || 'Member', photoUrl: d.data().photoUrl || null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function sendLookAsDm(otherUser, item) {
  const db2   = firebase.firestore();
  const now   = firebase.firestore.Timestamp.fromDate(new Date());
  const myName = currentUserData.name || 'Member';
  let postId  = item.postId || item.id;
  let boardId = item.boardId || null;
  try {
    const pSnap = await db2.collection('posts').doc(postId).get();
    if (pSnap.exists && pSnap.data().boardId) boardId = pSnap.data().boardId;
  } catch (_) {}

  const postUrl = boardId && postId
    ? `${location.origin}/board.html?boardId=${encodeURIComponent(boardId)}&post=${encodeURIComponent(postId)}`
    : `${location.origin}/mv-house.html`;
  const caption = item.caption || item.content || 'MV House Look';
  const msgText = `🏠 Shared a look from MV House:\n"${caption.slice(0, 120)}"\n${postUrl}`;

  const snap = await db2.collection('conversations')
    .where('participantIds', 'array-contains', currentUid).get();
  const existing = snap.docs.find(d => d.data().participantIds.includes(otherUser.id));

  let convId;
  if (existing) {
    convId = existing.id;
  } else {
    const ref = await db2.collection('conversations').add({
      participantIds:    [currentUid, otherUser.id],
      participantNames:  { [currentUid]: myName, [otherUser.id]: otherUser.name },
      participantPhotos: { [currentUid]: currentUserData.photoUrl || null, [otherUser.id]: otherUser.photoUrl },
      lastMessage: '', lastMessageAt: now,
      lastRead: { [currentUid]: now, [otherUser.id]: null },
      createdAt: now,
    });
    convId = ref.id;
  }
  await db2.collection('conversations').doc(convId).collection('messages').add({ senderId: currentUid, text: msgText, timestamp: now });
  await db2.collection('conversations').doc(convId).update({ lastMessage: msgText.slice(0, 100), lastMessageAt: now, [`lastRead.${currentUid}`]: now });
}

// ─── FEATURE 6: BACKGROUND LEGACY MIGRATION ───────────────────────

async function migrateLegacyItems(oldItems, existingNew) {
  const existingIds = new Set(existingNew.map(i => i.postId || i.id));
  const toMigrate   = oldItems.filter(i => i.postId && !existingIds.has(i.postId));
  if (!toMigrate.length) return;

  console.log(`[MV House] Migrating ${toMigrate.length} legacy items to new path…`);
  const batch = firebase.firestore().batch();
  toMigrate.forEach(item => {
    const ref = firebase.firestore()
      .collection('wardrobes').doc(currentUid)
      .collection('items').doc(item.postId);
    batch.set(ref, {
      postId:    item.postId,
      boardId:   item.boardId  || null,
      category:  item.category || 'saved',
      caption:   item.caption  || item.content || '',
      mediaUrl:  item.mediaUrl || null,
      note:      item.note     || '',
      savedAt:   item.savedAt  || firebase.firestore.FieldValue.serverTimestamp(),
      _migrated: true,
    }, { merge: true });
  });
  try {
    await batch.commit();
    console.log(`[MV House] Migration complete.`);
  } catch (e) {
    console.warn('[MV House] Migration batch error:', e.code);
  }
}

// ─── CTA ACTIONS ───────────────────────────────────────────────────

function purchaseWardrobe() {
  if (allItems.length === 0) { alert('Save at least one look from MV House boards to start a purchase order.'); return; }
  const count = allItems.length;
  alert(`Order Summary\n\n${count} look${count !== 1 ? 's' : ''} selected\nEstimated: 80,000 FCFA\n\nFull checkout experience coming shortly.`);
}

function requestStyling() {
  alert('Custom Styling Consultation\n\nOur Muliebrity/Virility consultants will curate your complete expression wardrobe.\n\nBooking system coming shortly. Email: styling@sbdnetwork.com');
}

// ─── MODAL HELPERS ─────────────────────────────────────────────────

function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('open'); document.body.style.overflow = 'hidden'; }
  // Close on backdrop click
  el.onclick = e => { if (e.target === el) closeModal(id); };
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
  document.body.style.overflow = '';
}

// ─── TOAST ─────────────────────────────────────────────────────────

let _toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('mvhToast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ─── ESC HELPER ────────────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── ESC KEY CLOSES MODALS ─────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['recatModal', 'notesModal', 'shareDmModal', 'shareWardrobeModal', 'manageSharesModal'].forEach(id => closeModal(id));
  }
});

console.log('[MV House] v257 loaded.');
