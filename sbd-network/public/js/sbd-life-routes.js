/**
 * SBD Life — route helpers (labs sandbox vs production).
 */
(function (global) {
  var LABS_PREFIX = '/labs/sbd-life';
  var PROD_PREFIX = '/sbd-life';

  function isLabsContext() {
    return global.location.pathname.indexOf(LABS_PREFIX) === 0;
  }

  function isProductionContext() {
    return global.location.pathname.indexOf(PROD_PREFIX) === 0;
  }

  function hub() {
    return isLabsContext() ? LABS_PREFIX + '/' : PROD_PREFIX + '/';
  }

  function article(slug) {
    var base = isLabsContext() ? LABS_PREFIX + '/article.html' : PROD_PREFIX + '/article.html';
    return base + '?slug=' + encodeURIComponent(slug || '');
  }

  function issue(slug) {
    var base = isLabsContext() ? LABS_PREFIX + '/issue.html' : PROD_PREFIX + '/issue.html';
    return base + '?slug=' + encodeURIComponent(slug || '');
  }

  global.SbdLifeRoutes = {
    LABS_PREFIX: LABS_PREFIX,
    PROD_PREFIX: PROD_PREFIX,
    isLabs: isLabsContext,
    isProduction: isProductionContext,
    hub: hub,
    article: article,
    issue: issue
  };
})(window);
