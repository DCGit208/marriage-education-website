/**
 * MV HOUSE — Wardrobe System v256
 * ================================
 * Features:
 *  1. Tab count badges per category
 *  2. Completeness bar per category (10 looks = 100%)
 *  3. Re-categorize look via bottom sheet modal
 *  4. Personal style notes on each look
 *  5. Share look to DM
 *  6. Background migration of legacy saves → new path
 */

const CATEGORIES = ['corporate', 'casual-day', 'casual-night', 'casual-home', 'official'];
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
};
const TARGET_LOOKS = 10; // looks needed for 100% completeness

let currentUid      = null;
let currentUserData = {};
let currentTab      = 'saved';
let allItems        = [];
let activeItemId    = null; // item being acted on in a modal

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
    const tier = currentUserData?.subscription?.tier || currentUserData?.tier || 'free';

    const badge = document.getElementById('tierBadge');
    if (badge) {
      badge.textContent = tier.charAt(0).toUpperCase() + tier.slice(1);
      if (tier !== 'elite') { badge.style.background = 'rgba(255,255,255,0.05)'; badge.style.color = '#A8A29E'; }
    }

    if (tier !== 'elite' && currentUserData?.role !== 'admin') {
      document.getElementById('mvGate').style.display = 'block';
      document.getElementById('mvLoading').style.display = 'none';
      return;
    }

    document.getElementById('mvGate').style.display = 'none';
    document.getElementById('mvContent').style.display = 'block';

    await loadWardrobeItems();
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

function buildLookCard(item) {
  const mediaHtml = buildMediaHtml(item);
  let savedDate = '';
  if (item.savedAt) {
    try {
      const d = item.savedAt.toDate ? item.savedAt.toDate() : new Date((item.savedAt.seconds || 0) * 1000);
      savedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (_) {}
  }
  const safeId   = escHtml(item.id);
  const note     = item.note || '';
  const noteHtml = `<div class="look-note${note ? ' has-note' : ''}" id="note-${safeId}">${escHtml(note) || ''}</div>`;

  return `
    <div class="look-card" onclick="openLook('${safeId}')">
      ${mediaHtml}
      <div class="look-card-body">
        <p class="look-card-caption">${escHtml(item.caption || item.content || 'MV House Look')}</p>
        ${savedDate ? `<p class="look-card-meta">Saved ${savedDate} · ${CATEGORY_ICONS[item.category] || ''} ${item.category || ''}</p>` : ''}
      </div>
      ${noteHtml}
      <div class="look-card-actions" onclick="event.stopPropagation()">
        <button class="lca-btn" onclick="openNotesModal('${safeId}')">✏️ Note</button>
        <button class="lca-btn" onclick="openRecatModal('${safeId}')">📂 Move</button>
        <button class="lca-btn share" onclick="openShareModal('${safeId}')">💬 Share</button>
        <button class="lca-btn" onclick="removeLook(event,'${safeId}')" style="color:#ff5a5a;">✕</button>
      </div>
    </div>`;
}

function buildEmptyState(tab) {
  const boardLink = `/boards.html`;
  const label     = CATEGORY_LABELS[tab] || 'MV House boards';
  return `
    <div class="mv-empty" style="grid-column:1/-1;">
      <div class="mv-empty-icon">👗</div>
      <p>No looks saved yet.</p>
      <p>Browse <a href="${boardLink}">${label}</a> and tap <strong>Save to Wardrobe</strong> on any post.</p>
    </div>`;
}

// ─── LOOK NAVIGATION ──────────────────────────────────────────────

async function openLook(itemId) {
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;
  let postId  = item.postId  || null;
  let boardId = item.boardId || null;
  if (postId) {
    try {
      const snap = await firebase.firestore().collection('posts').doc(postId).get();
      if (snap.exists && snap.data().boardId) boardId = snap.data().boardId;
    } catch (_) {}
  }
  if (boardId && postId) { window.location.href = `/board.html?boardId=${encodeURIComponent(boardId)}&post=${encodeURIComponent(postId)}`; }
  else if (boardId)      { window.location.href = `/board.html?boardId=${encodeURIComponent(boardId)}`; }
  else                   { window.location.href = '/boards.html'; }
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
    ['recatModal','notesModal','shareDmModal'].forEach(id => closeModal(id));
  }
});

console.log('[MV House] v256 loaded.');
