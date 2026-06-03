/**
 * SBD Life Phase 4 — commerce / entitlements panel (labs sandbox).
 */
(function () {
  var panel = document.getElementById('lifeCommercePanel');
  if (!panel) return;

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  async function render() {
    var user = firebase.auth().currentUser;
    if (!user || !window.SbdLifeEntitlements) {
      panel.innerHTML = '<p class="gate-message">Sign in to view entitlements.</p>';
      return;
    }
    var ctx = await window.SbdLifeData.getViewerContext();
    var ent = await window.SbdLifeEntitlements.loadEntitlements(user.uid);
    var products = window.SbdLifeEntitlements.SHOP_PRODUCTS;

    panel.innerHTML =
      '<h3 class="life-catalog-heading">Your entitlements</h3>' +
      '<ul class="life-ent-list">' +
      '<li>Formation tier: <strong>' +
      esc(ctx.tier) +
      '</strong></li>' +
      '<li>Annual subscription: <strong>' +
      (ent.annualActive ? 'active' : 'inactive') +
      '</strong></li>' +
      '<li>Issue purchases: <strong>' +
      Object.keys(ent.purchasedIssueIds).length +
      '</strong></li>' +
      '</ul>' +
      '<div class="probe-actions">' +
      '<a class="btn-secondary" href="' +
      window.SbdLifeEntitlements.checkoutUrl(products.annual) +
      '">Buy annual (Shop)</a>' +
      '<a class="btn-secondary" href="' +
      window.SbdLifeEntitlements.checkoutUrl(products.singleIssue) +
      '">Buy single issue</a>' +
      '<a class="btn-secondary" href="' +
      window.SbdLifeEntitlements.checkoutUrl(products.archive) +
      '">Buy archive</a>' +
      '</div>' +
      (ctx.isAdmin
        ? '<div class="probe-actions" style="margin-top:12px">' +
          '<button type="button" class="btn-secondary" id="grantAnnualBtn">Admin: grant annual</button>' +
          '<button type="button" class="btn-secondary" id="grantIssueBtn">Admin: grant Q1 issue</button>' +
          '</div><p id="commerceGrantStatus" class="gate-message"></p>'
        : '') +
      (window.SbdLifeRoutes && window.SbdLifeRoutes.isLabs()
        ? '<p class="life-messenger-note">Test paywall: open <a href="' +
          (window.SbdLifeRoutes
            ? window.SbdLifeRoutes.article('labs-demo-elite-covenant')
            : '/labs/sbd-life/article.html?slug=labs-demo-elite-covenant') +
          '">elite essay</a> without grant.</p>'
        : '');

    if (ctx.isAdmin) {
      var grantAnnual = document.getElementById('grantAnnualBtn');
      var grantIssue = document.getElementById('grantIssueBtn');
      var status = document.getElementById('commerceGrantStatus');
      if (grantAnnual) {
        grantAnnual.addEventListener('click', async function () {
          try {
            await window.SbdLifeEntitlements.grantAnnualSubscription(user.uid, 'annual');
            if (status) status.textContent = 'Annual subscription granted for your account.';
            render();
          } catch (err) {
            if (status) status.textContent = err.message || err.code;
          }
        });
      }
      if (grantIssue) {
        grantIssue.addEventListener('click', async function () {
          try {
            await window.SbdLifeEntitlements.grantIssuePurchase(user.uid, 'labs-demo-q1-presence');
            if (status) status.textContent = 'Issue purchase granted for Q1 demo issue.';
            render();
          } catch (err) {
            if (status) status.textContent = err.message || err.code;
          }
        });
      }
    }
  }

  firebase.auth().onAuthStateChanged(function () {
    render();
  });
})();
