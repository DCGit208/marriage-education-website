(function () {
  var list = document.getElementById('readinessList');
  var gateMessage = document.getElementById('gateMessage');
  var probeLog = document.getElementById('probeLog');
  var transitionTable = document.getElementById('transitionTable');
  if (!list || !gateMessage) return;

  var CONTRACTS_VERSION = 'phase1b';
  var state = { user: null, isAdmin: false, flagEnabled: false };

  function setState(key, pass, text) {
    var row = list.querySelector('li[data-key="' + key + '"]');
    if (!row) return;
    row.textContent = text;
    row.classList.remove('pass', 'fail');
    row.classList.add(pass ? 'pass' : 'fail');
  }

  function logProbe(message, pass) {
    if (!probeLog) return;
    var line = document.createElement('div');
    line.className = 'probe-line ' + (pass ? 'pass' : 'fail');
    line.textContent = message;
    probeLog.appendChild(line);
    probeLog.scrollTop = probeLog.scrollHeight;
  }

  function renderTransitions() {
    if (!transitionTable || !window.SbdLifeContracts) return;
    var rows = window.SbdLifeContracts.STATUS_TRANSITIONS;
    transitionTable.innerHTML = '';
    Object.keys(rows).forEach(function (from) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + from + '</td><td>' + rows[from].join(', ') + '</td>';
      transitionTable.appendChild(tr);
    });
  }

  async function loadUserRole(uid) {
    try {
      var snap = await firebase.firestore().collection('users').doc(uid).get();
      if (!snap.exists) return '';
      return String(snap.data().role || '').toLowerCase();
    } catch (err) {
      console.error('[SBD Life Labs] role load error', err);
      return '';
    }
  }

  async function loadFlag() {
    try {
      var snap = await firebase.firestore().collection('admin').doc('flags').get();
      if (!snap.exists) return false;
      return Boolean(snap.data().sbdLifeLabsEnabled);
    } catch (err) {
      console.error('[SBD Life Labs] flag load error', err);
      return false;
    }
  }

  function contractsShapeValid(json) {
    var hasCollections =
      json && json.collections && Object.keys(json.collections).length >= 5;
    var hasEnums = json && json.enums && Array.isArray(json.enums.articleStatus);
    var hasTransitions =
      json && json.statusTransitions && json.statusTransitions.draft;
    return Boolean(hasCollections && hasEnums && hasTransitions);
  }

  function embeddedContractsValid() {
    return Boolean(
      window.SbdLifeContracts &&
        window.SbdLifeContracts.STATUS_TRANSITIONS &&
        window.SbdLifeContracts.STATUS_TRANSITIONS.draft
    );
  }

  async function loadContracts() {
    var url =
      '/docs/sbd-life-phase1-contracts.json?v=' +
      encodeURIComponent(CONTRACTS_VERSION);
    try {
      var res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        if (embeddedContractsValid()) {
          return { ok: true, reason: 'contracts via embedded module (json unreachable)' };
        }
        return { ok: false, reason: 'contracts file not reachable' };
      }
      var json = await res.json();
      if (contractsShapeValid(json)) {
        return {
          ok: true,
          reason: 'contracts + transitions loaded (' + (json.version || CONTRACTS_VERSION) + ')'
        };
      }
      if (embeddedContractsValid()) {
        return {
          ok: true,
          reason: 'contracts via embedded module (json stale: ' + (json.version || 'unknown') + ')'
        };
      }
      return { ok: false, reason: 'contracts invalid shape' };
    } catch (err) {
      console.error('[SBD Life Labs] contract load error', err);
      if (embeddedContractsValid()) {
        return { ok: true, reason: 'contracts via embedded module (fetch error)' };
      }
      return { ok: false, reason: 'contracts load failed' };
    }
  }

  function runClientValidationProbe() {
    if (!window.SbdLifeContracts) {
      setState('validation', false, 'Client validation probe: SbdLifeContracts missing');
      return;
    }
    var bad = window.SbdLifeContracts.validateArticlePayload(
      {
        title: 'Probe',
        slug: 'probe',
        contentType: 'feature_article',
        tierRequired: 'public',
        status: 'published',
        authorId: 'x',
        updatedAt: new Date()
      },
      { isUpdate: false }
    );
    var good = window.SbdLifeContracts.validateArticlePayload(
      {
        title: 'Probe',
        slug: 'probe-draft',
        contentType: 'feature_article',
        tierRequired: 'public',
        status: 'draft',
        authorId: 'x',
        updatedAt: new Date()
      },
      { isUpdate: false }
    );
    var transitionBad = window.SbdLifeContracts.validateArticlePayload(
      {
        title: 'Probe',
        slug: 'probe',
        contentType: 'feature_article',
        tierRequired: 'public',
        status: 'published',
        authorId: 'x',
        updatedAt: new Date()
      },
      { isUpdate: true, previousStatus: 'draft' }
    );
    var ok =
      !bad.ok &&
      good.ok &&
      !transitionBad.ok &&
      !window.SbdLifeContracts.canTransition('draft', 'published');
    setState(
      'validation',
      ok,
      ok ? 'Client validation probe: passed' : 'Client validation probe: failed'
    );
    logProbe(
      ok ? 'Client-side transition matrix behaves as expected.' : 'Client validation mismatch.',
      ok
    );
  }

  async function runFirestoreProbe() {
    if (!state.user || !state.isAdmin) {
      logProbe('Firestore probe skipped (admin required).', false);
      return;
    }
    try {
      var listSnap = await firebase.firestore().collection('sbdLifeArticles').limit(3).get();
      logProbe('Admin list sbdLifeArticles: allowed (' + listSnap.size + ' docs).', true);

      var invalidPayload = {
        title: 'Invalid Transition Probe',
        slug: 'invalid-transition-probe-' + Date.now(),
        contentType: 'feature_article',
        tierRequired: 'public',
        status: 'published',
        authorId: state.user.uid,
        updatedAt: firebase.firestore.Timestamp.now(),
        publishedAt: firebase.firestore.Timestamp.now()
      };
      try {
        await firebase.firestore().collection('sbdLifeArticles').add(invalidPayload);
        logProbe('Expected create rejection for published-on-create failed (rule not enforced).', false);
      } catch (err) {
        logProbe('Create published-on-create correctly rejected by rules.', true);
      }

      var draftPayload = Object.assign({}, invalidPayload, {
        status: 'draft',
        slug: 'draft-probe-' + Date.now()
      });
      var created = await firebase.firestore().collection('sbdLifeArticles').add(draftPayload);
      logProbe('Create draft article allowed: ' + created.id, true);

      try {
        await created.update({ status: 'published', updatedAt: firebase.firestore.Timestamp.now() });
        logProbe('Expected draft->published rejection failed (rule not enforced).', false);
      } catch (err2) {
        logProbe('draft -> published transition correctly rejected.', true);
      }

      await created.update({
        status: 'review',
        updatedAt: firebase.firestore.Timestamp.now()
      });
      logProbe('draft -> review transition allowed.', true);
    } catch (err) {
      console.error('[SBD Life Labs] firestore probe error', err);
      logProbe('Firestore probe error: ' + (err.message || err.code || 'unknown'), false);
    }
  }

  function wireProbeButtons() {
    var runClientBtn = document.getElementById('runClientProbeBtn');
    var runRulesBtn = document.getElementById('runRulesProbeBtn');
    if (runClientBtn) {
      runClientBtn.addEventListener('click', function () {
        if (probeLog) probeLog.innerHTML = '';
        runClientValidationProbe();
      });
    }
    if (runRulesBtn) {
      runRulesBtn.addEventListener('click', function () {
        if (probeLog) probeLog.innerHTML = '';
        runFirestoreProbe();
      });
    }
  }

  firebase.auth().onAuthStateChanged(async function (user) {
    state.user = user;
    renderTransitions();
    wireProbeButtons();

    if (!user) {
      setState('auth', false, 'Auth session check: failed (not signed in)');
      setState('role', false, 'Admin gate check: blocked');
      setState('flag', false, 'SBD Life feature flag check: blocked');
      setState('contracts', false, 'Phase 1 contracts: blocked');
      setState('validation', false, 'Client validation probe: blocked');
      gateMessage.textContent = 'Sign in to access this isolated staging route.';
      return;
    }

    setState('auth', true, 'Auth session check: passed');

    var role = await loadUserRole(user.uid);
    state.isAdmin = role === 'admin';
    setState('role', state.isAdmin, state.isAdmin ? 'Admin gate check: passed' : 'Admin gate check: failed (admin only)');

    state.flagEnabled = await loadFlag();
    setState(
      'flag',
      state.flagEnabled,
      state.flagEnabled ? 'SBD Life feature flag check: passed' : 'SBD Life feature flag check: disabled'
    );

    var contracts = await loadContracts();
    setState(
      'contracts',
      contracts.ok,
      contracts.ok ? 'Phase 1 contracts: loaded and valid' : 'Phase 1 contracts: ' + contracts.reason
    );

    if (state.isAdmin && contracts.ok) {
      runClientValidationProbe();
    } else {
      setState('validation', false, 'Client validation probe: waiting for admin + contracts');
    }

    if (!state.isAdmin) {
      gateMessage.textContent = 'Sandbox access is currently restricted to admin accounts.';
      return;
    }

    gateMessage.textContent = state.flagEnabled
      ? 'Phase 1 governance active. Run probes below, then proceed to Phase 2 sandbox UX.'
      : 'Enable admin.flags.sbdLifeLabsEnabled for full staging flows.';
  });
})();
