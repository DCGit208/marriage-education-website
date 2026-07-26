/**
 * SBD Life Phase 5 — curated discovery rails (sandbox hub).
 */
(function () {
  var root = document.getElementById('lifeDiscovery');
  if (!root) return;

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  var KNOWN_RAIL_IDS = ['featured', 'culture'];

  async function loadTrendingRails() {
    var db = firebase.firestore();
    var rails = [];
    for (var i = 0; i < KNOWN_RAIL_IDS.length; i++) {
      var railId = KNOWN_RAIL_IDS[i];
      var snap = await db.collection('sbdLifeTrending').doc(railId).get();
      if (snap.exists) rails.push({ id: snap.id, data: snap.data() });
    }
    if (rails.length) return rails;
    var listSnap = await db.collection('sbdLifeTrending').get();
    listSnap.forEach(function (doc) {
      if (KNOWN_RAIL_IDS.indexOf(doc.id) === -1) {
        rails.push({ id: doc.id, data: doc.data() });
      }
    });
    return rails;
  }

  async function resolveCatalog(catalog) {
    if (!Array.isArray(catalog) || !catalog.length) return [];
    var ctx = await window.SbdLifeData.getViewerContext();
    var ent = { annualActive: false, purchasedIssueIds: {} };
    if (window.SbdLifeEntitlements && ctx.user) {
      try {
        ent = await window.SbdLifeEntitlements.loadEntitlements(ctx.user.uid);
      } catch (err) {
        console.warn('discovery entitlements', err);
      }
    }
    var out = [];
    for (var i = 0; i < catalog.length; i++) {
      var item = catalog[i];
      if (!item || !item.id) continue;
      if (ctx.isAdmin) {
        out.push({ id: item.id, data: item });
        continue;
      }
      var probe = {
        status: 'published',
        visibility: 'public',
        tierRequired: item.tierRequired || 'public',
        issueId: item.issueId || null
      };
      if (window.SbdLifeEntitlements) {
        var access = window.SbdLifeEntitlements.canAccessArticle(probe, ctx, ent);
        if (access.allowed) out.push({ id: item.id, data: item });
      } else if (window.SbdLifeData.canReadTier(probe.tierRequired, ctx.tier, false)) {
        out.push({ id: item.id, data: item });
      }
    }
    return out;
  }

  async function resolveArticles(ids) {
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      try {
        var res = await window.SbdLifeData.getArticle(id);
        if (res && res.data) out.push({ id: id, data: res.data });
      } catch (err) {
        if (err && err.code !== 'permission-denied') console.warn('discovery article', id, err);
      }
    }
    return out;
  }

  async function resolveRailArticles(rail) {
    var articles = await resolveCatalog(rail.data.catalog);
    if (articles.length) return articles;
    var ids = Array.isArray(rail.data.articleIds) ? rail.data.articleIds : [];
    return resolveArticles(ids);
  }

  function renderRail(title, articles) {
    if (!articles.length) return '';
    var cards = articles
      .map(function (a) {
        var cover = a.data.coverImage || '';
        return (
          '<a class="life-catalog-card' +
          (cover ? ' life-catalog-card--cover' : '') +
          '" href="' +
          (window.SbdLifeRoutes ? window.SbdLifeRoutes.article(a.id) : '/labs/sbd-life/article.html?slug=' + encodeURIComponent(a.id)) +
          '">' +
          (cover
            ? '<img class="life-catalog-cover" src="' + esc(cover) + '" alt="" />'
            : '') +
          '<span class="life-catalog-kicker">' +
          esc(a.data.contentType) +
          '</span><span class="life-catalog-title">' +
          esc(a.data.title) +
          '</span></a>'
        );
      })
      .join('');
    return (
      '<h3 class="life-catalog-heading">' +
      esc(title) +
      '</h3><div class="life-catalog-grid life-discovery-rail">' +
      cards +
      '</div>'
    );
  }

  async function render() {
    root.innerHTML = '<p class="life-loading">Loading discovery…</p>';
    try {
      var rails = await loadTrendingRails();
      if (!rails.length) {
        root.innerHTML = '<p class="gate-message">No discovery rails yet. Re-seed demo content.</p>';
        return;
      }
      var html = '';
      for (var r = 0; r < rails.length; r++) {
        var rail = rails[r];
        var articles = await resolveRailArticles(rail);
        html += renderRail(rail.data.title || rail.id, articles);
      }
      root.innerHTML =
        html ||
        '<p class="gate-message">No articles at your formation tier yet. New editorial is added to discovery as it publishes.</p>';
    } catch (err) {
      console.error(err);
      var msg =
        err && err.code === 'permission-denied'
          ? 'Discovery is temporarily unavailable. Try refreshing, or contact support if this persists.'
          : err.message || 'Could not load discovery.';
      root.innerHTML = '<p class="life-error">' + esc(msg) + '</p>';
    }
  }

  firebase.auth().onAuthStateChanged(function (user) {
    if (!user) return;
    user.getIdToken().then(function () {
      render();
    });
  });
})();
