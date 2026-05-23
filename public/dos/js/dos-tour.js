/**
 * DOS dashboard guided tour — first login + replay from topbar.
 */
(function (global) {
  'use strict';

  var TOUR_VERSION = 'v1';
  var stepIndex = 0;
  var steps = [];
  var active = false;
  var userCode = null;

  function storageKey(code) {
    return 'dos_tour_' + TOUR_VERSION + '_' + (code || 'anon');
  }

  function isDone(code) {
    try {
      return localStorage.getItem(storageKey(code)) === 'done';
    } catch (e) {
      return false;
    }
  }

  function markDone(code) {
    try {
      localStorage.setItem(storageKey(code), 'done');
    } catch (e) { /* ignore */ }
  }

  function rank() {
    return document.body.getAttribute('data-dos-rank') || 'ambassador';
  }

  function guideUrl() {
    var r = rank();
    return '/dos/navigation-guide.html?rank=' + encodeURIComponent(r);
  }

  function baseSteps() {
    return [
      {
        placement: 'center',
        title: 'Welcome to Deployment Operations',
        body: 'This dashboard is your command center for deploying Marriage Education access, tracking subscribers, commissions, and team growth. This short tour shows where everything lives.'
      },
      {
        target: '#dosSidebarNav',
        placement: 'right',
        title: 'Left sidebar — your map',
        body: 'Every section of the dashboard is listed here. Tap a item to jump to that area. On mobile, use the bottom icon bar or the Menu button.'
      },
      {
        section: 'overview',
        target: '#dosOverviewKpis',
        placement: 'bottom',
        title: 'Overview — start here each day',
        body: 'See KPIs, monthly target, and quick actions. Check this first to know where you stand before you deploy in the field.'
      },
      {
        section: 'daily-ops',
        target: '[data-section="daily-ops"]',
        placement: 'top',
        title: 'Daily ops',
        body: 'Log outreach, contacts, and follow-ups. Consistent daily logging builds your pipeline and retention picture.'
      },
      {
        section: 'field-deploy',
        target: '[data-section="field-deploy"]',
        placement: 'top',
        title: 'Field deploy — scripts',
        body: 'Copy-ready scripts for in-person and phone conversations. Use these when approaching prospects or following up.'
      },
      {
        section: 'links',
        target: '#dosCopyPrimary',
        placement: 'bottom',
        title: 'Deployment links',
        body: 'Your main referral link and product-specific links live here. Use Copy main link in the top bar anytime, or open this section for WhatsApp / social sharing.'
      },
      {
        section: 'subscribers',
        target: '[data-section="subscribers"]',
        placement: 'top',
        title: 'Subscribers & pipeline',
        body: 'Track prospects and subscribers through stages — from contact to active Foundation access.'
      },
      {
        section: 'commissions',
        target: '[data-section="commissions"]',
        placement: 'top',
        title: 'Commissions',
        body: 'Commission history, recurring estimates, and earnings by product category. Verify payouts against your deployments here.'
      },
      {
        section: 'network',
        target: '[data-section="network"]',
        placement: 'top',
        title: 'Network',
        body: 'Ambassadors you recruited. Senior rank requires 10 recruits — progress shows here and on Overview.'
      },
      {
        section: 'formation',
        target: '[data-section="formation"]',
        placement: 'top',
        title: 'Formation (separate from ops)',
        body: 'Marriage Foundation School and CRLA training. Education lives here — deployment operations stay in the other sections.'
      },
      {
        section: 'performance',
        target: '[data-section="performance"]',
        placement: 'top',
        title: 'Performance',
        body: 'Leaderboard, contests, revenue stacks, and unit milestones. Use this to track gamification and recognition.'
      }
    ];
  }

  function leadershipSteps() {
    var r = rank();
    var extra = [];
    if (r === 'senior' || r === 'regional_director' || r === 'executive') {
      extra.push({
        section: 'team',
        target: '[data-section="team"]',
        placement: 'top',
        title: 'Team command',
        body: 'Monitor ambassadors on your team — activity, recruits, and who needs a follow-up. Senior leaders use this daily.'
      });
    }
    if (r === 'regional_director' || r === 'executive') {
      extra.push({
        section: 'region',
        target: '[data-section="region"]',
        placement: 'top',
        title: 'Regional command',
        body: 'Territory-wide metrics: seniors, activity, and regional deployment health.'
      });
    }
    if (r === 'executive') {
      extra.push({
        section: 'global',
        target: '[data-section="global"]',
        placement: 'top',
        title: 'Global command',
        body: 'Network-wide executive view — aggregate stats across regions and leadership tiers.'
      });
    }
    return extra;
  }

  function finalStep() {
    return {
      placement: 'center',
      title: 'You\'re ready to deploy',
      body: 'Click Guide anytime in the top bar to replay this tour. For a full written sitemap, open the Navigation Guide.',
      isFinal: true
    };
  }

  function buildSteps() {
    steps = baseSteps().concat(leadershipSteps()).concat([finalStep()]);
  }

  function ensureDom() {
    if (document.getElementById('dosTourRoot')) return;
    var root = document.createElement('div');
    root.id = 'dosTourRoot';
    root.innerHTML =
      '<div class="dos-tour-backdrop" id="dosTourBackdrop" aria-hidden="true"></div>' +
      '<div class="dos-tour-spotlight" id="dosTourSpotlight" aria-hidden="true"></div>' +
      '<div class="dos-tour-panel" id="dosTourPanel" role="dialog" aria-modal="true" aria-labelledby="dosTourTitle">' +
        '<div class="dos-tour-progress" id="dosTourProgress"></div>' +
        '<h3 id="dosTourTitle"></h3>' +
        '<p id="dosTourBody"></p>' +
        '<div class="dos-tour-actions">' +
          '<button type="button" class="dos-btn" id="dosTourSkip">Skip tour</button>' +
          '<button type="button" class="dos-btn dos-btn-primary" id="dosTourNext">Next</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);

    document.getElementById('dosTourSkip').addEventListener('click', endTour);
    document.getElementById('dosTourNext').addEventListener('click', nextStep);
    document.getElementById('dosTourBackdrop').addEventListener('click', endTour);
  }

  function bindToolbarButtons() {
    var tourBtn = document.getElementById('dosTourBtn');
    var mapBtn = document.getElementById('dosGuideDocBtn');
    if (mapBtn && !mapBtn.getAttribute('data-bound')) {
      mapBtn.setAttribute('data-bound', '1');
      if (!mapBtn.getAttribute('href') || mapBtn.getAttribute('href') === '#') {
        mapBtn.href = guideUrl();
      }
    }
    if (tourBtn && !tourBtn.getAttribute('data-bound')) {
      tourBtn.setAttribute('data-bound', '1');
      tourBtn.addEventListener('click', function () {
        var code = userCode || (global.MEAmbassadorSession && global.MEAmbassadorSession.getCode());
        startTour(code, true);
      });
    }
    injectGuideButton();
  }

  function injectGuideButton() {
    if (document.getElementById('dosTourBtn')) return;
    var actions = document.querySelector('.dos-topbar-actions');
    if (!actions) return;
    var logout = document.getElementById('dosLogout');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'dosTourBtn';
    btn.className = 'dos-btn';
    btn.title = 'Dashboard walkthrough';
    btn.innerHTML = '<i class="fa-solid fa-circle-question"></i> Guide';
    btn.addEventListener('click', function () {
      var code = userCode || (global.MEAmbassadorSession && global.MEAmbassadorSession.getCode());
      startTour(code, true);
    });
    var link = document.createElement('a');
    link.className = 'dos-btn';
    link.id = 'dosGuideDocBtn';
    link.href = guideUrl();
    link.target = '_blank';
    link.rel = 'noopener';
    link.title = 'Full navigation guide (opens in new tab)';
    link.innerHTML = '<i class="fa-solid fa-map"></i> Map';
    if (logout) {
      actions.insertBefore(link, logout);
      actions.insertBefore(btn, logout);
    } else {
      actions.appendChild(btn);
      actions.appendChild(link);
    }
  }

  function applySection(sectionId) {
    if (!sectionId) return;
    if (global.DOSRouter) {
      global.DOSRouter.setSection(sectionId);
    } else {
      location.hash = '#' + sectionId;
    }
  }

  function positionPanel(step, targetEl) {
    var panel = document.getElementById('dosTourPanel');
    var spotlight = document.getElementById('dosTourSpotlight');
    panel.classList.remove('dos-tour-panel-center');
    spotlight.style.display = 'none';

    if (step.placement === 'center' || !targetEl) {
      panel.classList.add('dos-tour-panel-center');
      panel.style.top = '';
      panel.style.left = '';
      panel.style.right = '';
      panel.style.bottom = '';
      return;
    }

    spotlight.style.display = 'block';
    var rect = targetEl.getBoundingClientRect();
    var pad = 8;
    spotlight.style.top = Math.max(0, rect.top - pad) + 'px';
    spotlight.style.left = Math.max(0, rect.left - pad) + 'px';
    spotlight.style.width = Math.min(window.innerWidth, rect.width + pad * 2) + 'px';
    spotlight.style.height = Math.min(window.innerHeight, rect.height + pad * 2) + 'px';

    var panelRect = panel.getBoundingClientRect();
    var top = rect.bottom + 12;
    var left = rect.left;

    if (step.placement === 'right') {
      top = rect.top;
      left = rect.right + 12;
    } else if (step.placement === 'left') {
      top = rect.top;
      left = rect.left - panelRect.width - 12;
    } else if (step.placement === 'top') {
      top = rect.top - panelRect.height - 12;
      left = rect.left;
    }

    if (left + panelRect.width > window.innerWidth - 12) {
      left = window.innerWidth - panelRect.width - 12;
    }
    if (left < 12) left = 12;
    if (top + panelRect.height > window.innerHeight - 12) {
      top = window.innerHeight - panelRect.height - 12;
    }
    if (top < 12) top = 12;

    panel.style.top = top + 'px';
    panel.style.left = left + 'px';
  }

  function renderStep() {
    var step = steps[stepIndex];
    if (!step) return endTour();

    applySection(step.section);

    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        var targetEl = step.target ? document.querySelector(step.target) : null;
        if (step.target && !targetEl && stepIndex < steps.length - 1) {
          stepIndex += 1;
          renderStep();
          return;
        }

        document.getElementById('dosTourTitle').textContent = step.title;
        document.getElementById('dosTourBody').textContent = step.body;
        document.getElementById('dosTourProgress').textContent =
          'Step ' + (stepIndex + 1) + ' of ' + steps.length;

        var nextBtn = document.getElementById('dosTourNext');
        if (step.isFinal) {
          nextBtn.innerHTML = '<i class="fa-solid fa-book-open"></i> Open navigation guide';
          nextBtn.onclick = function () {
            markDone(userCode);
            endTour(false);
            window.open(guideUrl(), '_blank', 'noopener');
          };
        } else {
          nextBtn.innerHTML = stepIndex === steps.length - 1 ? 'Finish' : 'Next';
          nextBtn.onclick = nextStep;
        }

        positionPanel(step, targetEl);
        document.getElementById('dosTourRoot').classList.add('active');
      });
    });
  }

  function nextStep() {
    stepIndex += 1;
    if (stepIndex >= steps.length) {
      markDone(userCode);
      endTour(false);
      return;
    }
    renderStep();
  }

  function endTour(mark) {
    if (mark !== false && userCode) markDone(userCode);
    active = false;
    stepIndex = 0;
    var root = document.getElementById('dosTourRoot');
    if (root) root.classList.remove('active');
  }

  function startTour(code, force) {
    userCode = code || userCode;
    if (active) return;
    buildSteps();
    ensureDom();
    injectGuideButton();
    if (!force && isDone(userCode)) return;

    active = true;
    stepIndex = 0;
    document.getElementById('dosTourRoot').classList.add('active');
    renderStep();
  }

  function onDashboardReady(code) {
    userCode = code;
    buildSteps();
    ensureDom();
    bindToolbarButtons();
    if (!isDone(code)) {
      setTimeout(function () {
        startTour(code, false);
      }, 1000);
    }
  }

  function initOnPageLoad() {
    buildSteps();
    bindToolbarButtons();
  }

  global.DOSTour = {
    TOUR_VERSION: TOUR_VERSION,
    onDashboardReady: onDashboardReady,
    initOnPageLoad: initOnPageLoad,
    start: function (code) { startTour(code, true); },
    reset: function (code) {
      try {
        localStorage.removeItem(storageKey(code));
      } catch (e) { /* ignore */ }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOnPageLoad);
  } else {
    initOnPageLoad();
  }
})(typeof window !== 'undefined' ? window : global);
