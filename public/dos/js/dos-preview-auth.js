/**
 * Preview page helpers (-test dashboards only). Login uses ambassador-login.html.
 */
(function (global) {
  'use strict';

  function isPreviewPage() {
    return /-test(?:\.html)?$/.test(global.location.pathname) ||
      global.location.pathname.indexOf('-test') !== -1;
  }

  global.DOSPreviewAuth = {
    isPreviewPage: isPreviewPage
  };
})(typeof window !== 'undefined' ? window : global);
