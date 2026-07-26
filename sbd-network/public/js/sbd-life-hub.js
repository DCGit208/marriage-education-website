(function () {
  var catalog = document.getElementById('lifeCatalog');
  var seedBtn = document.getElementById('seedDemoBtn');
  var seedStatus = document.getElementById('seedStatus');
  var publishCrisisBtn = document.getElementById('publishCrisisBtn');
  var publishCrisisStatus = document.getElementById('publishCrisisStatus');
  var publishWwmBtn = document.getElementById('publishWwmBtn');
  var publishWwmStatus = document.getElementById('publishWwmStatus');
  var syncDiscoveryBtn = document.getElementById('syncDiscoveryBtn');
  var syncDiscoveryStatus = document.getElementById('syncDiscoveryStatus');
  if (!catalog) return;

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function articleUrl(id) {
    return window.SbdLifeRoutes
      ? window.SbdLifeRoutes.article(id)
      : '/labs/sbd-life/article.html?slug=' + encodeURIComponent(id);
  }

  function issueUrl(id) {
    return window.SbdLifeRoutes
      ? window.SbdLifeRoutes.issue(id)
      : '/labs/sbd-life/issue.html?slug=' + encodeURIComponent(id);
  }

  function renderCatalog(articles, issues) {
    var html = '';
    if (issues.length) {
      html += '<h3 class="life-catalog-heading">Issues</h3><div class="life-catalog-grid">';
      issues.forEach(function (item) {
        var cover = item.data.coverImage || '';
        html +=
          '<a class="life-catalog-card' +
          (cover ? ' life-catalog-card--cover' : '') +
          '" href="' +
          issueUrl(item.id) +
          '">' +
          (cover
            ? '<img class="life-catalog-cover" src="' + esc(cover) + '" alt="" />'
            : '') +
          '<span class="life-catalog-kicker">Issue ' +
          esc(String(item.data.issueNumber)) +
          '</span><span class="life-catalog-title">' +
          esc(item.data.title) +
          '</span></a>';
      });
      html += '</div>';
    }
    if (articles.length) {
      html += '<h3 class="life-catalog-heading">Articles</h3><div class="life-catalog-grid">';
      articles.forEach(function (item) {
        var cover = item.data.coverImage || '';
        html +=
          '<a class="life-catalog-card' +
          (cover ? ' life-catalog-card--cover' : '') +
          '" href="' +
          articleUrl(item.id) +
          '">' +
          (cover
            ? '<img class="life-catalog-cover" src="' + esc(cover) + '" alt="" />'
            : '') +
          '<span class="life-catalog-kicker">' +
          esc(item.data.status) +
          ' · ' +
          esc(item.data.contentType) +
          '</span><span class="life-catalog-title">' +
          esc(item.data.title) +
          '</span></a>';
      });
      html += '</div>';
    }
    if (!html) {
      html = '<p class="gate-message">No SBD Life content yet. Seed demo content to preview Phase 2 reading UI.</p>';
    }
    catalog.innerHTML = html;
  }

  async function refreshCatalog() {
    try {
      var articles = await window.SbdLifeData.listArticlesAdmin(20);
      var issues = await window.SbdLifeData.listIssuesAdmin(10);
      if (articles.error && issues.error) {
        catalog.innerHTML = '<p class="gate-message">Catalog requires admin access.</p>';
        return;
      }
      renderCatalog(articles.items || [], issues.items || []);
    } catch (err) {
      console.error('[SBD Life Hub] catalog error', err);
      catalog.innerHTML =
        '<p class="gate-message">Could not load catalog: ' + (err.message || err.code) + '</p>';
    }
  }

  if (syncDiscoveryBtn) {
    syncDiscoveryBtn.addEventListener('click', async function () {
      syncDiscoveryBtn.disabled = true;
      if (syncDiscoveryStatus) syncDiscoveryStatus.textContent = 'Syncing member discovery rails…';
      try {
        var ctx = await window.SbdLifeData.getViewerContext();
        if (!ctx.user || !ctx.isAdmin) {
          if (syncDiscoveryStatus) syncDiscoveryStatus.textContent = 'Admin required.';
          syncDiscoveryBtn.disabled = false;
          return;
        }
        var ids = await window.SbdLifeData.syncMemberDiscoveryRails();
        if (syncDiscoveryStatus) {
          syncDiscoveryStatus.textContent =
            'Member rails updated for ' + ids.articleId + '. Non-admin accounts should see it now.';
        }
      } catch (err) {
        console.error(err);
        if (syncDiscoveryStatus) {
          syncDiscoveryStatus.textContent = 'Sync failed: ' + (err.message || err.code);
        }
      }
      syncDiscoveryBtn.disabled = false;
    });
  }

  if (publishWwmBtn) {
    publishWwmBtn.addEventListener('click', async function () {
      publishWwmBtn.disabled = true;
      if (publishWwmStatus) publishWwmStatus.textContent = 'Publishing Woman / Wife / Mother…';
      try {
        var ctx = await window.SbdLifeData.getViewerContext();
        if (!ctx.user || !ctx.isAdmin) {
          if (publishWwmStatus) publishWwmStatus.textContent = 'Admin required.';
          publishWwmBtn.disabled = false;
          return;
        }
        var ids = await window.SbdLifeData.publishWomanWifeMotherEditorial(ctx.user.uid);
        if (publishWwmStatus) {
          publishWwmStatus.textContent =
            'Published. Article: ' +
            ids.articleId +
            ' · Issue: ' +
            ids.issueId +
            ' — featured on discovery rails.';
        }
        await refreshCatalog();
      } catch (err) {
        console.error(err);
        if (publishWwmStatus) {
          publishWwmStatus.textContent = 'Publish failed: ' + (err.message || err.code);
        }
      }
      publishWwmBtn.disabled = false;
    });
  }

  if (publishCrisisBtn) {
    publishCrisisBtn.addEventListener('click', async function () {
      publishCrisisBtn.disabled = true;
      if (publishCrisisStatus) publishCrisisStatus.textContent = 'Publishing editorial…';
      try {
        var ctx = await window.SbdLifeData.getViewerContext();
        if (!ctx.user || !ctx.isAdmin) {
          if (publishCrisisStatus) publishCrisisStatus.textContent = 'Admin required.';
          publishCrisisBtn.disabled = false;
          return;
        }
        var ids = await window.SbdLifeData.publishCrisisEditorial(ctx.user.uid);
        if (publishCrisisStatus) {
          publishCrisisStatus.textContent =
            'Published. Article: ' +
            ids.articleId +
            ' · Issue: ' +
            ids.issueId +
            ' — open production link above.';
        }
        await refreshCatalog();
      } catch (err) {
        console.error(err);
        if (publishCrisisStatus) {
          publishCrisisStatus.textContent = 'Publish failed: ' + (err.message || err.code);
        }
      }
      publishCrisisBtn.disabled = false;
    });
  }

  if (seedBtn) {
    seedBtn.addEventListener('click', async function () {
      seedBtn.disabled = true;
      if (seedStatus) seedStatus.textContent = 'Seeding…';
      try {
        var ctx = await window.SbdLifeData.getViewerContext();
        if (!ctx.user || !ctx.isAdmin) {
          if (seedStatus) seedStatus.textContent = 'Admin required.';
          seedBtn.disabled = false;
          return;
        }
        var ids = await window.SbdLifeData.seedDemoContent(ctx.user.uid);
        if (seedStatus) {
          seedStatus.textContent =
            'Seeded article & issue. Open article: ' + ids.articleId;
        }
        await refreshCatalog();
      } catch (err) {
        console.error(err);
        var hint =
          err && err.code === 'permission-denied'
            ? ' (check admin role in users/{uid}.role)'
            : '';
        if (seedStatus) {
          seedStatus.textContent = 'Seed failed: ' + (err.message || err.code) + hint;
        }
      }
      seedBtn.disabled = false;
    });
  }

  firebase.auth().onAuthStateChanged(function (user) {
    if (!user) return;
    refreshCatalog();
  });

  global.SbdLifeHub = { refreshCatalog: refreshCatalog };
})();
