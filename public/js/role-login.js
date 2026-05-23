/**
 * Shared Firestore login for role-specific pages (ambassador, senior, RD, executive).
 * Each HTML page calls MERoleLogin.init({ role: 'senior', ... }).
 */
(function (global) {
  'use strict';

  var ROLE_CONFIG = {
    ambassador: {
      title: 'Ambassador Login',
      subtitle: 'Marriage Literacy Ambassador · code format <strong>AMB-…</strong>',
      codeLabel: 'Ambassador Code',
      codePlaceholder: 'AMB-YOURNAME-1234',
      buttonText: 'Login to Ambassador Dashboard',
      allowedTypes: ['regular', 'ambassador', ''],
      dashboardPath: '/ambassador/dashboard.html',
      loginPath: '/ambassador-login.html',
      otherLogins: [
        { href: '/senior-login.html', icon: 'fa-star', label: 'Senior Ambassador Login (AMB-…)' },
        { href: '/rd-login.html', icon: 'fa-crown', label: 'Regional Director Login (RD-…)' }
      ]
    },
    senior: {
      title: 'Senior Ambassador Login',
      subtitle: 'Team leadership dashboard · code format <strong>AMB-…</strong>',
      codeLabel: 'Senior Ambassador Code',
      codePlaceholder: 'AMB-YOURNAME-1234',
      buttonText: 'Login to Senior Dashboard',
      allowedTypes: ['senior'],
      dashboardPath: '/ambassador/senior-dashboard.html',
      loginPath: '/senior-login.html',
      otherLogins: [
        { href: '/ambassador-login.html', icon: 'fa-user', label: 'Ambassador Login' },
        { href: '/rd-login.html', icon: 'fa-crown', label: 'Regional Director Login (RD-…)' }
      ]
    },
    regional_director: {
      title: 'Regional Director Login',
      subtitle: 'Regional command · code format <strong>RD-…</strong>',
      codeLabel: 'Regional Director Code',
      codePlaceholder: 'RD-YOURNAME-1234',
      buttonText: 'Login to RD Dashboard',
      allowedTypes: ['regional_director'],
      dashboardPath: '/regional-director/rd-dashboard.html',
      loginPath: '/rd-login.html',
      codeFieldId: 'rdCode',
      otherLogins: [
        { href: '/ambassador-login.html', icon: 'fa-user', label: 'Ambassador Login (AMB-…)' },
        { href: '/senior-login.html', icon: 'fa-star', label: 'Senior Ambassador Login' }
      ]
    },
    executive: {
      title: 'Executive Login',
      subtitle: 'Network executive command · <strong>AMB-…</strong> executive account',
      codeLabel: 'Executive Code',
      codePlaceholder: 'AMB-YOURNAME-1234',
      buttonText: 'Login to Executive Dashboard',
      allowedTypes: ['executive'],
      dashboardPath: '/executive/dashboard.html',
      loginPath: '/executive-login.html',
      otherLogins: [
        { href: '/rd-login.html', icon: 'fa-crown', label: 'Regional Director Login' },
        { href: '/senior-login.html', icon: 'fa-star', label: 'Senior Ambassador Login' },
        { href: '/ambassador-login.html', icon: 'fa-user', label: 'Ambassador Login' }
      ]
    }
  };

  function normType(t) {
    var type = (t || 'regular').toString().toLowerCase();
    return type || 'regular';
  }

  function typeAllowed(type, allowed) {
    if (allowed.indexOf(type) !== -1) return true;
    if (allowed.indexOf('regular') !== -1 && (type === 'regular' || type === 'ambassador')) return true;
    return false;
  }

  function wrongRoleMessage(type, cfg) {
    if (type === 'senior') {
      return 'This is a Senior Ambassador account. Please use <a href="/senior-login.html">Senior Ambassador Login</a>.';
    }
    if (type === 'regional_director') {
      return 'This is a Regional Director account (RD-… code). Please use <a href="/rd-login.html">Regional Director Login</a>.';
    }
    if (type === 'executive') {
      return 'This is an Executive account. Please use <a href="/executive-login.html">Executive Login</a>.';
    }
    return 'This account is not an Ambassador login. Use <a href="/senior-login.html">Senior</a> or <a href="/rd-login.html">RD Login</a> if applicable.';
  }

  function init(pageRole) {
    var cfg = ROLE_CONFIG[pageRole];
    if (!cfg) return;

    var errorMsg = document.getElementById('errorMessage');
    var successMsg = document.getElementById('successMessage');
    var loggedOutNote = document.getElementById('loggedOutNote');
    var codeInputId = cfg.codeFieldId || 'loginCode';
    var form = document.getElementById('loginForm');
    if (!form) return;

    function hideMessages() {
      if (errorMsg) errorMsg.style.display = 'none';
      if (successMsg) successMsg.style.display = 'none';
    }
    function showError(message, html) {
      if (!errorMsg) return;
      if (html) errorMsg.innerHTML = message;
      else errorMsg.textContent = message;
      errorMsg.style.display = 'block';
      if (successMsg) successMsg.style.display = 'none';
    }
    function showSuccess(message) {
      if (!successMsg) return;
      successMsg.textContent = message;
      successMsg.style.display = 'block';
      if (errorMsg) errorMsg.style.display = 'none';
    }

    var urlParams = new URLSearchParams(global.location.search);
    var codeParam = urlParams.get('code');
    if (codeParam) {
      var codeEl = document.getElementById(codeInputId);
      if (codeEl) codeEl.value = codeParam.toUpperCase();
    }

    if (urlParams.get('logged_out') === '1') {
      if (loggedOutNote) loggedOutNote.style.display = 'block';
      if (global.MEAmbassadorSession) global.MEAmbassadorSession.clearSession();
    } else {
      var storedCode = global.localStorage.getItem('ambassadorCode');
      var storedData = global.localStorage.getItem('ambassadorData');
      if (storedCode && storedData) {
        try {
          var parsed = JSON.parse(storedData);
          var st = (parsed.status || '').toString().toLowerCase();
          var type = normType(parsed.ambassador_type);
          if (['active', 'approved', 'activated', 'confirmed'].includes(st) &&
              typeAllowed(type, cfg.allowedTypes)) {
            global.location.replace(cfg.dashboardPath);
            return;
          }
        } catch (e) { /* ignore */ }
      }
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var codeEl = document.getElementById(codeInputId);
      var emailEl = document.getElementById('email');
      var code = (codeEl && codeEl.value || '').toUpperCase().trim();
      var email = (emailEl && emailEl.value || '').toLowerCase().trim();
      var submitBtn = form.querySelector('.btn-login');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
      hideMessages();

      try {
        if (typeof db === 'undefined') {
          throw new Error('Database connection failed. Please refresh the page.');
        }

        if (pageRole === 'ambassador' && code.indexOf('RD-') === 0) {
          throw new Error('RD codes cannot be used here. Open Regional Director Login.');
        }
        if (pageRole === 'regional_director' && code.indexOf('RD-') !== 0) {
          throw new Error('Regional Directors must sign in with an RD-… code on this page.');
        }

        var ambassadorData;
        var sessionCode = code;

        if (global.MEAmbassadorAccountResolve) {
          var resolved = await global.MEAmbassadorAccountResolve.resolveAccount(db, code, email);
          if (!resolved) {
            throw new Error('Code not found. Check your code and email, or use the correct login page for your role.');
          }
          sessionCode = resolved.id;
          ambassadorData = resolved.stats;
        } else {
          var doc = await db.collection('ambassadors').doc(code).get();
          if (!doc.exists) throw new Error('Account not found.');
          ambassadorData = doc.data();
          if (ambassadorData.email && ambassadorData.email.toLowerCase() !== email) {
            throw new Error('Email does not match this code.');
          }
        }

        var accountType = normType(ambassadorData.ambassador_type);
        if (!typeAllowed(accountType, cfg.allowedTypes)) {
          showError(wrongRoleMessage(accountType, cfg), true);
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> ' + cfg.buttonText;
          return;
        }

        var validStatuses = ['active', 'approved', 'activated', 'confirmed'];
        var accountStatus = (ambassadorData.status || '').toString().toLowerCase();
        if (!validStatuses.includes(accountStatus)) {
          throw new Error('Your account is pending approval. Please wait for admin confirmation.');
        }

        if (global.MEAmbassadorSession) {
          global.MEAmbassadorSession.saveSession(sessionCode, email, ambassadorData);
        } else {
          localStorage.setItem('ambassadorCode', sessionCode);
          localStorage.setItem('ambassadorEmail', email);
          localStorage.setItem('ambassadorData', JSON.stringify(ambassadorData));
        }

        var welcome = global.MEAmbassadorRoutes
          ? global.MEAmbassadorRoutes.getWelcomeMessageForType(ambassadorData.ambassador_type)
          : 'Login successful! Redirecting…';
        showSuccess(welcome);

        setTimeout(function () {
          var dest = cfg.dashboardPath;
          if (global.MEAmbassadorRoutes) {
            var next = global.MEAmbassadorRoutes.parseSafeNextFromSearch(global.location.search);
            if (next && next.indexOf('-test') !== -1) dest = next;
            else dest = global.MEAmbassadorRoutes.getDashboardPathForType(accountType);
          }
          global.location.replace(dest);
        }, 600);
      } catch (err) {
        console.error('Login error:', err);
        showError(err.message || 'Login failed. Please try again.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> ' + cfg.buttonText;
      }
    });

    var forgot = document.getElementById('forgotCodeLink');
    if (forgot && pageRole !== 'regional_director') {
      forgot.addEventListener('click', async function (ev) {
        ev.preventDefault();
        var email = prompt('Enter your email address:');
        if (!email) return;
        try {
          var snapshot = await db.collection('ambassadors').where('email', '==', email.toLowerCase()).get();
          if (snapshot.empty) throw new Error('No ambassador found with this email.');
          var ambassador = snapshot.docs[0].data();
          showSuccess('Your code is: ' + (ambassador.code || snapshot.docs[0].id));
        } catch (err) {
          showError(err.message || 'Could not retrieve code.');
        }
      });
    }
  }

  function getLoginPathForRole(role) {
    var cfg = ROLE_CONFIG[role] || ROLE_CONFIG.ambassador;
    return cfg.loginPath + '?logged_out=1';
  }

  global.MERoleLogin = {
    ROLE_CONFIG: ROLE_CONFIG,
    init: init,
    getLoginPathForRole: getLoginPathForRole
  };
})(typeof window !== 'undefined' ? window : global);
