/**
 * Ambassador dashboard session (localStorage + backup).
 * Use on all -test previews so review sessions are not lost on reload.
 */
(function (global) {
  'use strict';

  var SESSION_UNTIL_KEY = 'dos_session_until';
  var SESSION_BACKUP_KEY = 'dos_ambassador_session';
  var SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  function saveSession(code, email, ambassadorData) {
    if (!code) return;
    try {
      localStorage.setItem('ambassadorCode', code);
      if (email) localStorage.setItem('ambassadorEmail', email);
      if (ambassadorData) {
        localStorage.setItem(
          'ambassadorData',
          typeof ambassadorData === 'string' ? ambassadorData : JSON.stringify(ambassadorData)
        );
      }
      localStorage.setItem(SESSION_UNTIL_KEY, String(Date.now() + SESSION_TTL_MS));
      localStorage.setItem(SESSION_BACKUP_KEY, JSON.stringify({
        code: code,
        email: email || '',
        data: ambassadorData,
        savedAt: Date.now()
      }));
    } catch (e) {
      console.warn('saveSession', e);
    }
  }

  function restoreFromBackup() {
    try {
      var until = Number(localStorage.getItem(SESSION_UNTIL_KEY) || 0);
      if (until && Date.now() > until) {
        clearSession();
        return null;
      }
      var raw = localStorage.getItem(SESSION_BACKUP_KEY);
      if (!raw) return null;
      var backup = JSON.parse(raw);
      if (!backup || !backup.code) return null;
      localStorage.setItem('ambassadorCode', backup.code);
      if (backup.email) localStorage.setItem('ambassadorEmail', backup.email);
      if (backup.data) {
        localStorage.setItem(
          'ambassadorData',
          typeof backup.data === 'string' ? backup.data : JSON.stringify(backup.data)
        );
      }
      return backup.code;
    } catch (e) {
      return null;
    }
  }

  function getCode() {
    var code = localStorage.getItem('ambassadorCode');
    if (code) return code;
    return restoreFromBackup();
  }

  function touchSession() {
    try {
      if (getCode()) {
        localStorage.setItem(SESSION_UNTIL_KEY, String(Date.now() + SESSION_TTL_MS));
      }
    } catch (e) { /* ignore */ }
  }

  function clearSession() {
    try {
      localStorage.removeItem('ambassadorCode');
      localStorage.removeItem('ambassadorEmail');
      localStorage.removeItem('ambassadorData');
      localStorage.removeItem(SESSION_UNTIL_KEY);
      localStorage.removeItem(SESSION_BACKUP_KEY);
    } catch (e) { /* ignore */ }
  }

  function loginUrlForPath(path) {
    var next = path || (global.location.pathname + global.location.search);
    return '/ambassador-login.html?next=' + encodeURIComponent(next);
  }

  /** Unregister SW on preview pages — old root SW caused reloads / stale login cache. */
  function unregisterServiceWorkers() {
    if (!('serviceWorker' in navigator)) return Promise.resolve();
    return navigator.serviceWorker.getRegistrations().then(function (regs) {
      return Promise.all(regs.map(function (r) { return r.unregister(); }));
    }).catch(function () {});
  }

  global.MEAmbassadorSession = {
    saveSession: saveSession,
    getCode: getCode,
    touchSession: touchSession,
    clearSession: clearSession,
    loginUrlForPath: loginUrlForPath,
    unregisterServiceWorkers: unregisterServiceWorkers
  };
})(typeof window !== 'undefined' ? window : global);
