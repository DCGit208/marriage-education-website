/**
 * Phase 6 — production gate + home experience (/sbd-life).
 */
(function () {
  var shell = document.getElementById('lifeProductionShell');
  var gateEl = document.getElementById('lifeProductionGate');
  if (!shell && !gateEl) return;

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  async function loadFlags() {
    var snap = await firebase.firestore().collection('admin').doc('flags').get();
    if (!snap.exists) return { sbdLifeEnabled: false };
    var d = snap.data();
    return { sbdLifeEnabled: Boolean(d.sbdLifeEnabled) };
  }

  async function ensureAccess() {
    var user = firebase.auth().currentUser;
    if (!user) {
      window.location.href =
        '/auth?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
      return false;
    }
    var ctx = await window.SbdLifeData.getViewerContext();
    var flags = await loadFlags();
    if (flags.sbdLifeEnabled || ctx.isAdmin) {
      if (gateEl) gateEl.style.display = 'none';
      if (shell) shell.style.display = '';
      var readerRoot = document.getElementById('readerRoot');
      var issueRoot = document.getElementById('issueRoot');
      if (readerRoot) readerRoot.style.display = '';
      if (issueRoot) issueRoot.style.display = '';
      return true;
    }
    if (shell) shell.style.display = 'none';
    var readerRoot = document.getElementById('readerRoot');
    var issueRoot = document.getElementById('issueRoot');
    if (readerRoot) readerRoot.style.display = 'none';
    if (issueRoot) issueRoot.style.display = 'none';
    if (gateEl) {
      gateEl.style.display = '';
      gateEl.innerHTML =
        '<section class="blueprint-card">' +
        '<p class="kicker">SBD Life</p>' +
        '<h1>Coming soon</h1>' +
        '<p>SBD Life is rolling out to members in phases. You will see it in Lifestyle when your cohort is enabled.</p>' +
        '<a class="btn-secondary" href="/dashboard.html">Return to dashboard</a>' +
        '</section>';
    }
    return false;
  }

  async function renderFeaturedIssue() {
    var mount = document.getElementById('lifeFeaturedIssue');
    if (!mount) return;
    try {
      var snap = await firebase.firestore().collection('sbdLifeTrending').doc('featured').get();
    if (!snap.exists) {
      mount.innerHTML = '';
      return;
    }
    var issueIds = snap.data().issueIds || [];
    var articleIds = snap.data().articleIds || [];
    var issueId = issueIds[0];
    if (!issueId && articleIds.length) {
      var art = await window.SbdLifeData.getArticle(articleIds[0]);
      if (art.data && art.data.issueId) issueId = art.data.issueId;
    }
    if (!issueId) {
      mount.innerHTML = '';
      return;
    }
    var issue = await window.SbdLifeData.getIssue(issueId);
    if (!issue.data) {
      mount.innerHTML = '';
      return;
    }
    mount.innerHTML =
      '<section class="blueprint-card life-featured-issue">' +
      '<p class="kicker">Current issue</p>' +
      '<h2>' +
      esc(issue.data.title) +
      '</h2>' +
      '<p>' +
      esc(issue.data.description || issue.data.theme || '') +
      '</p>' +
      '<a class="btn-secondary" href="' +
      window.SbdLifeRoutes.issue(issue.id) +
      '">Open issue</a></section>';
    } catch (err) {
      console.warn('featured issue', err);
      mount.innerHTML = '';
    }
  }

  async function bootHome() {
    var ok = await ensureAccess();
    if (!ok || !shell) return;
    if (window.SbdLifeDiscovery && document.getElementById('lifeDiscovery')) {
      /* discovery module self-mounts */
    }
    await renderFeaturedIssue();
  }

  window.SbdLifeProduction = {
    ensureAccess: ensureAccess,
    bootHome: bootHome
  };

  if (shell || gateEl) {
    firebase.auth().onAuthStateChanged(function (user) {
      if (!user) {
        window.location.href =
          '/auth?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
        return;
      }
      if (shell) bootHome();
      else ensureAccess();
    });
  }
})();
