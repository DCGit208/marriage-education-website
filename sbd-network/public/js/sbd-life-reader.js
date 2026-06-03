(function () {
  var params = new URLSearchParams(window.location.search);
  var slug = params.get('slug') || params.get('id') || '';
  var root = document.getElementById('readerRoot');
  var progressBar = document.getElementById('readProgress');
  if (!root) return;

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function renderBlocks(blocks, fallbackContent) {
    if (Array.isArray(blocks) && blocks.length) {
      return blocks
        .map(function (b) {
          if (b.type === 'pull_quote') {
            return (
              '<blockquote class="life-pull-quote"><p>' +
              esc(b.text) +
              '</p>' +
              (b.attribution ? '<cite>' + esc(b.attribution) + '</cite>' : '') +
              '</blockquote>'
            );
          }
          if (b.type === 'heading') {
            return '<h2 class="life-body-heading">' + esc(b.text) + '</h2>';
          }
          return '<p class="life-body-p">' + esc(b.text) + '</p>';
        })
        .join('');
    }
    if (!fallbackContent) return '';
    return String(fallbackContent)
      .split(/\n\n+/)
      .map(function (p) {
        return '<p class="life-body-p">' + esc(p.trim()) + '</p>';
      })
      .join('');
  }

  function hubUrl() {
    return window.SbdLifeRoutes ? window.SbdLifeRoutes.hub() : '/labs/sbd-life/';
  }

  function renderPaywall(required, slug) {
    var checkout =
      window.SbdLifeEntitlements && window.SbdLifeEntitlements.SHOP_PRODUCTS
        ? '<a class="btn-secondary" href="' +
          window.SbdLifeEntitlements.checkoutUrl(
            window.SbdLifeEntitlements.SHOP_PRODUCTS.annual
          ) +
          '">SBD Life annual</a>' +
          '<a class="btn-secondary" href="' +
          window.SbdLifeEntitlements.checkoutUrl(
            window.SbdLifeEntitlements.SHOP_PRODUCTS.singleIssue
          ) +
          '">Single issue</a>'
        : '';
    root.innerHTML =
      '<section class="life-paywall">' +
      '<p class="kicker">Entitlement required</p>' +
      '<h1>Premium editorial</h1>' +
      '<p>This piece requires <strong>' +
      esc(required) +
      '</strong> access, an active SBD Life subscription, or issue purchase.</p>' +
      checkout +
      '<a class="btn-secondary" href="/tier.html">Formation tiers</a>' +
      '<a class="btn-secondary life-back" href="' +
      hubUrl() +
      '">' +
      (window.SbdLifeRoutes && window.SbdLifeRoutes.isProduction() ? 'Back to SBD Life' : 'Back to labs') +
      '</a>' +
      (slug === 'labs-demo-elite-covenant'
        ? '<p class="life-messenger-note">Labs: admin can grant annual access from the hub to unlock this essay.</p>'
        : '') +
      '</section>';
  }

  function renderArticle(id, data) {
    var issueHref =
      data.issueId && window.SbdLifeRoutes
        ? window.SbdLifeRoutes.issue(data.issueId)
        : window.SbdLifeRoutes
          ? window.SbdLifeRoutes.issue('labs-demo-q1-presence')
          : '/labs/sbd-life/issue.html?slug=labs-demo-q1-presence';
    var heroStyle = data.coverImage
      ? ' style="background-image:url(' + esc(data.coverImage) + ')"'
      : '';
    root.innerHTML =
      '<article class="life-article">' +
      '<header class="life-hero"' +
      heroStyle +
      '>' +
      '<div class="life-hero-overlay"></div>' +
      '<div class="life-hero-inner">' +
      '<p class="kicker">' +
      esc(data.contentType || 'feature') +
      '</p>' +
      '<h1>' +
      esc(data.title) +
      '</h1>' +
      '<p class="life-hero-meta">' +
      esc(data.authorName || 'SBD Life') +
      (data.estimatedReadTime ? ' · ' + data.estimatedReadTime + ' min read' : '') +
      '</p>' +
      '</div></header>' +
      '<div class="life-article-body">' +
      (data.excerpt ? '<p class="life-dek">' + esc(data.excerpt) + '</p>' : '') +
      renderBlocks(data.contentBlocks, data.content) +
      '<div class="life-actions-row">' +
      (data.issueId
        ? '<a class="btn-secondary" href="' + issueHref + '">View issue</a>'
        : '') +
      '<a class="btn-secondary life-back" href="' +
      hubUrl() +
      '">' +
      (window.SbdLifeRoutes && window.SbdLifeRoutes.isProduction() ? 'SBD Life home' : 'Labs hub') +
      '</a>' +
      '</div>' +
      '<div id="lifeAudioMount"></div>' +
      '<div id="lifeQuotesMount"></div>' +
      '<div id="lifeReflectionsMount"></div></div></article>';

    var articleEl = root.querySelector('.life-article');
    if (articleEl && progressBar) {
      window.addEventListener(
        'scroll',
        function () {
          var rect = articleEl.getBoundingClientRect();
          var total = articleEl.offsetHeight - window.innerHeight;
          var scrolled = Math.min(Math.max(-rect.top, 0), total);
          var pct = total > 0 ? (scrolled / total) * 100 : 0;
          progressBar.style.width = pct + '%';
        },
        { passive: true }
      );
    }
  }

  async function init() {
    if (!slug) {
      root.innerHTML = '<p class="life-error">Missing ?slug= parameter.</p>';
      return;
    }
    root.innerHTML = '<p class="life-loading">Loading editorial…</p>';
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
        var result = await window.SbdLifeData.getArticle(slug);
        if (result.error === 'tier') return renderPaywall(result.required, slug);
        if (result.error === 'not_found') {
          root.innerHTML =
            '<p class="life-error">Article not found.</p>';
          return;
        }
        if (result.error === 'unpublished' && !result.ctx.isAdmin) {
          root.innerHTML = '<p class="life-error">This article is not published yet.</p>';
          return;
        }
        if (result.error) {
          root.innerHTML = '<p class="life-error">Unable to load article.</p>';
          return;
        }
        document.title =
          (result.data.title || 'Article') +
          ' | SBD Life' +
          (window.SbdLifeRoutes && window.SbdLifeRoutes.isLabs() ? ' Labs' : '');
        renderArticle(result.id, result.data);
        var audioEl = document.getElementById('lifeAudioMount');
        if (audioEl && window.SbdLifeAudio) {
          window.SbdLifeAudio.mount(audioEl, result.id, result.data);
        }
        var quotesEl = document.getElementById('lifeQuotesMount');
        if (quotesEl && window.SbdLifeQuotes) {
          window.SbdLifeQuotes.mount(quotesEl, result.id, result.data);
        }
        var mountEl = document.getElementById('lifeReflectionsMount');
        if (mountEl && window.SbdLifeReflections) {
          window.SbdLifeReflections.mount(mountEl, result.id, result.data, result.ctx);
        }
      } catch (err) {
        console.error(err);
        root.innerHTML = '<p class="life-error">Load failed: ' + esc(err.message) + '</p>';
      }
    });
  }

  init();
})();
