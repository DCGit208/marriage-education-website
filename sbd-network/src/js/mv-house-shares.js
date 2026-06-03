/**
 * MV House — Elite wardrobe sharing (read-only grants).
 * Phases 0–2: create/revoke shares, shared-with-me viewer, tier checks.
 */
(function () {
  'use strict';

  const SHAREABLE_CATEGORIES = ['corporate', 'casual-day', 'casual-night', 'casual-home', 'official'];
  const CATEGORY_LABELS = {
    corporate: '💼 Corporate',
    'casual-day': '☀️ Casual Day',
    'casual-night': '🌙 Casual Night',
    'casual-home': '🏡 Casual at Home',
    official: '👑 Official',
  };

  let incomingShares = [];
  let outgoingShares = [];
  let viewMode = 'mine'; // mine | shared-list | shared-view
  let activeShare = null;

  function db() {
    return firebase.firestore();
  }

  function isEliteUser(data) {
    if (!data) return false;
    if (data.role === 'admin') return true;
    const tier = data.subscription?.tier || data.tier || 'free';
    return tier === 'elite';
  }

  function shareDocId(ownerUid, viewerUid) {
    return `${ownerUid}_${viewerUid}`;
  }

  function categoriesAllowAll(categories) {
    return Array.isArray(categories) && (categories.includes('*') || categories.includes('all'));
  }

  function filterItemsByShare(items, categories) {
    if (!items || !categories) return items;
    if (categoriesAllowAll(categories)) return items;
    const allowed = new Set(categories.map((c) => String(c).toLowerCase()));
    return items.filter((i) => allowed.has((i.category || '').toLowerCase()));
  }

  function getMvApi() {
    return window._mvHouseApi || null;
  }

  async function fetchElitePeers() {
    const api = getMvApi();
    if (!api?.fetchDmPeers) return [];
    const peers = await api.fetchDmPeers();
    const elite = [];
    for (const p of peers) {
      try {
        const snap = await db().collection('users').doc(p.id).get();
        const data = snap.exists ? snap.data() : {};
        if (isEliteUser(data)) elite.push({ ...p, tier: 'elite' });
      } catch (_) { /* skip */ }
    }
    return elite;
  }

  async function loadShares() {
    const uid = getMvApi()?.currentUid;
    if (!uid) return;

    const [inSnap, outSnap] = await Promise.all([
      db().collection('wardrobeShares').where('viewerUid', '==', uid).where('status', '==', 'active').get(),
      db().collection('wardrobeShares').where('ownerUid', '==', uid).where('status', '==', 'active').get(),
    ]);

    incomingShares = inSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    outgoingShares = outSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    updateShareBadges();
  }

  function updateShareBadges() {
    const btn = document.getElementById('mvSharedTabBtn');
    if (btn) {
      const n = incomingShares.length;
      btn.textContent = n ? `Shared with me (${n})` : 'Shared with me';
    }
    const outCount = document.getElementById('mvOutgoingShareCount');
    if (outCount) outCount.textContent = String(outgoingShares.length);
  }

  async function loadWardrobeForOwner(ownerUid) {
    const snap = await db().collection('wardrobes').doc(ownerUid).collection('items').get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async function enterSharedView(share) {
    const api = getMvApi();
    if (!api || !share) return;

    viewMode = 'shared-view';
    activeShare = share;
    window.wardrobeViewMode = 'shared-view';
    window.sharedWardrobeContext = share;

    const banner = document.getElementById('mvSharedBanner');
    if (banner) {
      banner.style.display = 'flex';
      banner.querySelector('.mv-shared-banner-name').textContent =
        share.ownerName || 'Member';
      const catLabel = categoriesAllowAll(share.categories)
        ? 'all categories'
        : (share.categories || []).map((c) => CATEGORY_LABELS[c] || c).join(', ');
      banner.querySelector('.mv-shared-banner-meta').textContent =
        `Read-only · ${catLabel}`;
    }

    document.getElementById('mvLoading').style.display = 'block';
    try {
      let items = await loadWardrobeForOwner(share.ownerUid);
      items = filterItemsByShare(items, share.categories);
      api.setAllItems(items);
      api.refreshUi();
    } catch (err) {
      console.error('[MV Shares] load shared wardrobe:', err);
      api.showToast('Could not load shared wardrobe');
    } finally {
      document.getElementById('mvLoading').style.display = 'none';
    }

    setModeButtons();
    document.getElementById('mvShareActions')?.style.setProperty('display', 'none');
    document.querySelector('.mv-cta-strip')?.style.setProperty('display', 'none');
    document.querySelector('.mv-style-cta')?.style.setProperty('display', 'none');
  }

  function exitSharedView() {
    viewMode = 'mine';
    activeShare = null;
    window.wardrobeViewMode = 'mine';
    window.sharedWardrobeContext = null;

    document.getElementById('mvSharedBanner')?.style.setProperty('display', 'none');
    document.getElementById('mvShareActions')?.style.setProperty('display', '');
    document.querySelector('.mv-cta-strip')?.style.setProperty('display', '');
    document.querySelector('.mv-style-cta')?.style.setProperty('display', '');

    const api = getMvApi();
    if (api?.reloadWardrobe) api.reloadWardrobe();
    setModeButtons();
  }

  function showSharedList() {
    viewMode = 'shared-list';
    window.wardrobeViewMode = 'shared-list';
    activeShare = null;

    document.getElementById('mvSharedBanner')?.style.setProperty('display', 'none');
    document.getElementById('mvShareActions')?.style.setProperty('display', 'none');
    document.querySelector('.mv-cta-strip')?.style.setProperty('display', 'none');
    document.querySelector('.mv-style-cta')?.style.setProperty('display', 'none');
    document.getElementById('mvLoading').style.display = 'none';

    document.querySelectorAll('[id^="panel-"]').forEach((p) => { p.style.display = 'none'; });
    document.getElementById('completenessWrap')?.style.setProperty('display', 'none');
    document.querySelectorAll('.mv-tab').forEach((t) => t.classList.remove('active'));

    const panel = document.getElementById('panel-shared-list');
    if (!panel) return;
    panel.style.display = 'block';

    const list = document.getElementById('mvSharedList');
    if (!list) return;

    if (!incomingShares.length) {
      list.innerHTML = `
        <div class="mv-empty" style="grid-column:1/-1;">
          <div class="mv-empty-icon">👥</div>
          <p>No wardrobes shared with you yet.</p>
          <p>When an Elite member shares their MV House collection, it will appear here.</p>
        </div>`;
      return;
    }

    list.innerHTML = incomingShares.map((s) => {
      const cats = categoriesAllowAll(s.categories)
        ? 'All categories'
        : (s.categories || []).map((c) => CATEGORY_LABELS[c] || c).join(' · ');
      return `
        <button type="button" class="mv-shared-card" data-share-id="${s.id}">
          <span class="mv-shared-card-avatar">${(s.ownerName || 'M').charAt(0).toUpperCase()}</span>
          <span class="mv-shared-card-body">
            <strong>${esc(s.ownerName || 'Member')}</strong>
            <span>${esc(cats)}</span>
          </span>
          <span class="mv-shared-card-arrow">→</span>
        </button>`;
    }).join('');

    list.querySelectorAll('.mv-shared-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const share = incomingShares.find((s) => s.id === btn.dataset.shareId);
        if (share) enterSharedView(share);
      });
    });

    setModeButtons();
  }

  function showMyWardrobe() {
    if (viewMode === 'shared-view') exitSharedView();
    viewMode = 'mine';
    window.wardrobeViewMode = 'mine';
    document.getElementById('panel-shared-list')?.style.setProperty('display', 'none');
    document.getElementById('mvShareActions')?.style.setProperty('display', '');
    document.querySelector('.mv-cta-strip')?.style.setProperty('display', '');
    document.querySelector('.mv-style-cta')?.style.setProperty('display', '');
    const api = getMvApi();
    if (api?.switchTab) api.switchTab('saved', document.querySelector('.mv-tab[data-tab="saved"]'));
    setModeButtons();
  }

  function setModeButtons() {
    document.getElementById('mvMyWardrobeBtn')?.classList.toggle('active', viewMode === 'mine');
    document.getElementById('mvSharedTabBtn')?.classList.toggle('active', viewMode === 'shared-list' || viewMode === 'shared-view');
  }

  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function openModal(id) {
    document.getElementById(id)?.classList.add('open');
  }

  function closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
  }

  async function createShare(viewer, categories) {
    const api = getMvApi();
    const ownerUid = api?.currentUid;
    if (!ownerUid || !viewer?.id) return;

    if (!isEliteUser(api.currentUserData)) {
      api.showToast('Only Elite members can share wardrobes');
      return;
    }

    const viewerSnap = await db().collection('users').doc(viewer.id).get();
    if (!isEliteUser(viewerSnap.data())) {
      api.showToast(`${viewer.name} must be Elite to view your wardrobe`);
      return;
    }

    const ownerName = api.currentUserData?.name || 'Member';
    const payload = {
      ownerUid,
      viewerUid: viewer.id,
      ownerName,
      viewerName: viewer.name,
      categories,
      status: 'active',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    await db().collection('wardrobeShares').doc(shareDocId(ownerUid, viewer.id)).set(payload, { merge: true });
    await loadShares();
    api.showToast(`Shared with ${viewer.name}`);
  }

  async function revokeShare(share) {
    if (!share?.id) return;
    await db().collection('wardrobeShares').doc(share.id).update({
      status: 'revoked',
      revokedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await loadShares();
    getMvApi()?.showToast('Access revoked');
    renderOutgoingList();
  }

  function renderOutgoingList() {
    const list = document.getElementById('mvOutgoingShareList');
    if (!list) return;
    if (!outgoingShares.length) {
      list.innerHTML = '<p class="mv-share-empty">You have not shared your wardrobe with anyone yet.</p>';
      return;
    }
    list.innerHTML = outgoingShares.map((s) => {
      const cats = categoriesAllowAll(s.categories)
        ? 'All categories'
        : (s.categories || []).map((c) => CATEGORY_LABELS[c] || c).join(', ');
      return `
        <div class="mv-outgoing-row">
          <div>
            <strong>${esc(s.viewerName || 'Member')}</strong>
            <span>${esc(cats)}</span>
          </div>
          <button type="button" class="mv-revoke-btn" data-share-id="${esc(s.id)}">Revoke</button>
        </div>`;
    }).join('');

    list.querySelectorAll('.mv-revoke-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const share = outgoingShares.find((s) => s.id === btn.dataset.shareId);
        if (share && confirm(`Revoke wardrobe access for ${share.viewerName}?`)) revokeShare(share);
      });
    });
  }

  function openShareWardrobeModal() {
    openModal('shareWardrobeModal');
    const list = document.getElementById('shareWardrobeUserList');
    const search = document.getElementById('shareWardrobeSearch');
    list.innerHTML = '<div class="mv-share-loading">Loading Elite members…</div>';
    search.value = '';

    let peers = [];
    fetchElitePeers().then((p) => {
      peers = p;
      renderShareUserList(peers);
    }).catch(() => {
      list.innerHTML = '<p class="mv-share-empty">Could not load members.</p>';
    });

    search.oninput = () => {
      const q = search.value.toLowerCase();
      renderShareUserList(peers.filter((u) => u.name.toLowerCase().includes(q)));
    };

    document.querySelectorAll('#shareWardrobeCats input[type="checkbox"]').forEach((cb) => {
      cb.checked = cb.dataset.cat === 'all';
    });
  }

  function renderShareUserList(peers) {
    const list = document.getElementById('shareWardrobeUserList');
    if (!peers.length) {
      list.innerHTML = '<p class="mv-share-empty">No Elite members found in your groups.</p>';
      return;
    }
    list.innerHTML = peers.map((u) => `
      <button type="button" class="mvh-dm-row share-wardrobe-user" data-uid="${esc(u.id)}">
        <div class="mvh-dm-avatar">${(u.name || 'M').charAt(0).toUpperCase()}</div>
        <span class="mvh-dm-name">${esc(u.name)} <span class="mv-elite-pill">Elite</span></span>
      </button>
    `).join('');

    list.querySelectorAll('.share-wardrobe-user').forEach((row) => {
      row.addEventListener('click', async () => {
        const viewer = peers.find((p) => p.id === row.dataset.uid);
        if (!viewer) return;

        const cats = [];
        const allCb = document.querySelector('#shareWardrobeCats input[data-cat="all"]');
        if (allCb?.checked) {
          cats.push('*');
        } else {
          document.querySelectorAll('#shareWardrobeCats input[data-cat]:not([data-cat="all"])').forEach((cb) => {
            if (cb.checked) cats.push(cb.dataset.cat);
          });
        }
        if (!cats.length) {
          getMvApi()?.showToast('Select at least one category');
          return;
        }
        row.disabled = true;
        try {
          await createShare(viewer, cats);
          closeModal('shareWardrobeModal');
        } catch (err) {
          console.error(err);
          getMvApi()?.showToast(err.message || 'Could not share');
          row.disabled = false;
        }
      });
    });
  }

  function attachUI() {
    document.getElementById('mvMyWardrobeBtn')?.addEventListener('click', showMyWardrobe);
    document.getElementById('mvSharedTabBtn')?.addEventListener('click', () => {
      if (viewMode === 'shared-view') exitSharedView();
      showSharedList();
    });
    document.getElementById('mvSharedBannerBack')?.addEventListener('click', showSharedList);
    document.getElementById('mvShareWardrobeBtn')?.addEventListener('click', openShareWardrobeModal);
    document.getElementById('mvManageSharesBtn')?.addEventListener('click', () => {
      renderOutgoingList();
      openModal('manageSharesModal');
    });
    document.getElementById('shareWardrobeModalClose')?.addEventListener('click', () => closeModal('shareWardrobeModal'));
    document.getElementById('manageSharesModalClose')?.addEventListener('click', () => closeModal('manageSharesModal'));

    document.querySelector('#shareWardrobeCats input[data-cat="all"]')?.addEventListener('change', (e) => {
      const on = e.target.checked;
      document.querySelectorAll('#shareWardrobeCats input:not([data-cat="all"])').forEach((cb) => {
        cb.checked = false;
        cb.disabled = on;
      });
    });
    document.querySelectorAll('#shareWardrobeCats input:not([data-cat="all"])').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          const all = document.querySelector('#shareWardrobeCats input[data-cat="all"]');
          if (all) all.checked = false;
          document.querySelectorAll('#shareWardrobeCats input:not([data-cat="all"])').forEach((x) => { x.disabled = false; });
        }
      });
    });
  }

  async function init() {
    window.wardrobeViewMode = 'mine';
    await loadShares();
    attachUI();
  }

  window.MvHouseShares = {
    init,
    loadShares,
    isSharedView: () => viewMode === 'shared-view',
    reload: loadShares,
  };
})();
