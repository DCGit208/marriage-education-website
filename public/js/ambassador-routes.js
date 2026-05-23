/**
 * Role-based dashboard URLs for ambassador login flows.
 */
(function (global) {
  'use strict';

  var PREVIEW_SESSION_KEY = 'dos_preview_path';

  function getDashboardPathForType(ambassadorType) {
    var type = (ambassadorType || 'regular').toString().toLowerCase();
    if (type === 'executive') return '/executive/dashboard.html';
    if (type === 'regional_director') return '/regional-director/rd-dashboard.html';
    if (type === 'senior') return '/ambassador/senior-dashboard.html';
    return '/ambassador/dashboard.html';
  }

  function getPreviewDashboardPathForType(ambassadorType) {
    var type = (ambassadorType || 'regular').toString().toLowerCase();
    if (type === 'executive') return '/executive/dashboard-test.html';
    if (type === 'regional_director') return '/regional-director/rd-dashboard-test.html';
    if (type === 'senior') return '/ambassador/senior-dashboard-test.html';
    return '/ambassador/dashboard-test.html';
  }

  function normalizePath(path) {
    if (!path) return '';
    return path.split('?')[0].replace(/\.html$/, '').replace(/\/$/, '');
  }

  /** Parse ?next= safely (supports encoded paths with slashes). */
  function parseSafeNextFromSearch(search) {
    if (!search) search = global.location && global.location.search;
    if (!search) return null;
    var q = search.charAt(0) === '?' ? search.slice(1) : search;
    var match = q.match(/(?:^|&)next=([^&]*)/);
    if (!match) return null;
    var raw = match[1];
    try {
      raw = decodeURIComponent(raw.replace(/\+/g, ' '));
    } catch (e) { /* use raw */ }
    if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
    return null;
  }

  function rememberPreviewDestination(path) {
    if (!path || path.indexOf('-test') === -1) return;
    try {
      sessionStorage.setItem(PREVIEW_SESSION_KEY, path.split('?')[0]);
    } catch (e) { /* ignore */ }
  }

  function clearPreviewDestination() {
    try {
      sessionStorage.removeItem(PREVIEW_SESSION_KEY);
    } catch (e) { /* ignore */ }
  }

  function isPreviewDestinationActive() {
    try {
      var want = sessionStorage.getItem(PREVIEW_SESSION_KEY);
      if (!want) return false;
      var path = global.location && global.location.pathname;
      return normalizePath(path) === normalizePath(want);
    } catch (e) {
      return false;
    }
  }

  function resolveLoginRedirect(ambassadorData, search) {
    var safeNext = parseSafeNextFromSearch(search);
    if (safeNext) {
      rememberPreviewDestination(safeNext);
      return safeNext;
    }
    return getDashboardPathForType(ambassadorData && ambassadorData.ambassador_type);
  }

  function getWelcomeMessageForType(ambassadorType) {
    var type = (ambassadorType || 'regular').toString().toLowerCase();
    if (type === 'executive') return '🏆 Welcome, Executive Network Director! Redirecting...';
    if (type === 'regional_director') return '👑 Welcome, Regional Director! Redirecting...';
    if (type === 'senior') return '🎉 Welcome, Senior Ambassador! Redirecting...';
    return '✅ Login successful! Redirecting to dashboard...';
  }

  function redirectToDashboard(ambassadorData, replace, explicitPath) {
    var path = explicitPath || getDashboardPathForType(ambassadorData && ambassadorData.ambassador_type);
    if (replace) {
      global.location.replace(path);
    } else {
      global.location.href = path;
    }
  }

  /**
   * Login entry URL after logout (or unauthenticated redirect).
   * RD uses rd-login.html (branded); all roles can also use ambassador-login.html.
   */
  function getLoginPathForRank(rank, opts) {
    var options = opts || {};
    var type = (rank || 'ambassador').toString().toLowerCase();
    if (type === 'regional_director') {
      return '/rd-login.html?logged_out=1';
    }
    var next = options.next || getDashboardPathForType(type === 'executive' ? 'executive' : type === 'senior' ? 'senior' : 'regular');
    return '/ambassador-login.html?logged_out=1&next=' + encodeURIComponent(next);
  }

  function performLogoutForRank(rank) {
    var loginPath = getLoginPathForRank(rank);
    if (global.MEAmbassadorSession && global.MEAmbassadorSession.performLogout) {
      return global.MEAmbassadorSession.performLogout(loginPath);
    }
    clearPreviewDestination();
    try {
      localStorage.removeItem('ambassadorCode');
      localStorage.removeItem('ambassadorEmail');
      localStorage.removeItem('ambassadorData');
      localStorage.removeItem('rdCode');
      localStorage.removeItem('rdEmail');
      localStorage.removeItem('rdName');
      localStorage.removeItem('rdData');
    } catch (e) { /* ignore */ }
    global.location.replace(loginPath);
  }

  global.MEAmbassadorRoutes = {
    PREVIEW_SESSION_KEY: PREVIEW_SESSION_KEY,
    getDashboardPathForType: getDashboardPathForType,
    getPreviewDashboardPathForType: getPreviewDashboardPathForType,
    parseSafeNextFromSearch: parseSafeNextFromSearch,
    resolveLoginRedirect: resolveLoginRedirect,
    rememberPreviewDestination: rememberPreviewDestination,
    clearPreviewDestination: clearPreviewDestination,
    isPreviewDestinationActive: isPreviewDestinationActive,
    getWelcomeMessageForType: getWelcomeMessageForType,
    getLoginPathForRank: getLoginPathForRank,
    performLogoutForRank: performLogoutForRank,
    redirectToDashboard: redirectToDashboard
  };
})(typeof window !== 'undefined' ? window : global);
