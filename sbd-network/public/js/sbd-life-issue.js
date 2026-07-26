(function () {
  var params = new URLSearchParams(window.location.search);
  var slug = params.get('slug') || params.get('id') || '';
  var root = document.getElementById('issueRoot');
  if (!root) return;

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function hubUrl() {
    return window.SbdLifeRoutes ? window.SbdLifeRoutes.hub() : '/labs/sbd-life/';
  }

  function articleUrl(id) {
    return window.SbdLifeRoutes
      ? window.SbdLifeRoutes.article(id)
      : '/labs/sbd-life/article.html?slug=' + encodeURIComponent(id);
  }

  function renderPaywall(required) {
    var checkout =
      window.SbdLifeEntitlements && window.SbdLifeEntitlements.SHOP_PRODUCTS
        ? '<a class="btn-secondary" href="' +
          window.SbdLifeEntitlements.checkoutUrl(
            window.SbdLifeEntitlements.SHOP_PRODUCTS.singleIssue
          ) +
          '">Purchase issue</a>' +
          '<a class="btn-secondary" href="' +
          window.SbdLifeEntitlements.checkoutUrl(
            window.SbdLifeEntitlements.SHOP_PRODUCTS.annual
          ) +
          '">Annual subscription</a>'
        : '';
    root.innerHTML =
      '<section class="life-paywall">' +
      '<p class="kicker">Entitlement required</p>' +
      '<h1>Quarterly issue</h1>' +
      '<p>This issue requires <strong>' +
      esc(required) +
      '</strong> access, subscription, or issue purchase.</p>' +
      checkout +
      '<a class="btn-secondary" href="' + hubUrl() + '">Back</a></section>';
  }

  async function loadFeaturedArticles(ids) {
    var html = '';
    for (var i = 0; i < ids.length; i++) {
      var res = await window.SbdLifeData.getArticle(ids[i]);
      if (!res.data) continue;
      html +=
        '<a class="life-issue-card" href="' +
        articleUrl(res.id) +
        '">' +
        '<span class="life-issue-card-kicker">' +
        esc(res.data.contentType) +
        '</span>' +
        '<span class="life-issue-card-title">' +
        esc(res.data.title) +
        '</span></a>';
    }
    return html;
  }

  async function renderIssue(id, data) {
    var themeColor = data.issueColorTheme || '#c7a45b';
    document.documentElement.style.setProperty('--issue-accent', themeColor);
    var featuredHtml = '';
    if (Array.isArray(data.featuredArticles) && data.featuredArticles.length) {
      featuredHtml = await loadFeaturedArticles(data.featuredArticles);
    }
    root.innerHTML =
      '<article class="life-issue">' +
      (data.coverImage
        ? '<div class="life-cover-frame"><img class="life-cover-img" src="' +
          esc(data.coverImage) +
          '" alt="' +
          esc(data.title) +
          ' cover" /></div>'
        : '') +
      '<header class="life-issue-cover">' +
      '<p class="kicker">SBD Life Quarterly · Issue ' + esc(String(data.issueNumber)) + '</p>' +
      '<h1>' + esc(data.title) + '</h1>' +
      '<p class="life-issue-theme">' + esc(data.theme) + '</p>' +
      '</header>' +
      '<section class="life-issue-letter">' +
      '<h2>Editor\'s letter</h2>' +
      '<p>' + esc(data.editorLetter || data.description) + '</p>' +
      '</section>' +
      (featuredHtml
        ? '<section class="life-issue-section"><h2>In this issue</h2><div class="life-issue-grid">' + featuredHtml + '</div></section>'
        : '') +
      (window.SbdLifeEntitlements
        ? window.SbdLifeEntitlements.renderBookCta(data, esc)
        : '') +
      '<div class="life-actions-row">' +
      '<button type="button" class="btn-secondary" disabled>Print edition (Phase 4)</button>' +
      '<a class="btn-secondary life-back" href="' + hubUrl() + '">' +
      (window.SbdLifeRoutes && window.SbdLifeRoutes.isProduction() ? 'SBD Life home' : 'Labs hub') +
      '</a>' +
      '</div></article>';
  }

  async function init() {
    if (!slug) {
      root.innerHTML = '<p class="life-error">Missing ?slug= parameter.</p>';
      return;
    }
    root.innerHTML = '<p class="life-loading">Loading issue…</p>';
    firebase.auth().onAuthStateChanged(async function (user) {
      if (!user) {
        window.location.href = '/auth?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
        return;
      }
      if (
        window.SbdLifeRoutes &&
        window.SbdLifeRoutes.isProduction() &&
        window.SbdLifeProduction
      ) {
        var allowed = await window.SbdLifeProduction.ensureAccess();
        if (!allowed) return;
      }
      try {
        var result = await window.SbdLifeData.getIssue(slug);
        if (result.error === 'tier') return renderPaywall(result.required);
        if (result.error === 'not_found') {
          root.innerHTML = '<p class="life-error">Issue not found. Seed demo content from labs hub.</p>';
          return;
        }
        if (result.error) {
          root.innerHTML = '<p class="life-error">Unable to load issue.</p>';
          return;
        }
        document.title =
          (result.data.title || 'Issue') +
          ' | SBD Life' +
          (window.SbdLifeRoutes && window.SbdLifeRoutes.isLabs() ? ' Labs' : '');
        await renderIssue(result.id, result.data);
      } catch (err) {
        console.error(err);
        root.innerHTML = '<p class="life-error">' + esc(err.message) + '</p>';
      }
    });
  }

  init();
})();
