/**
 * DOS dashboard guided tour — rank-specific, first login + replay (Guide button).
 */
(function (global) {
  'use strict';

  var TOUR_VERSION = 'v3';
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

  function rankTitle() {
    var r = rank();
    if (r === 'senior') return 'Senior Ambassador';
    if (r === 'regional_director') return 'Regional Director';
    if (r === 'executive') return 'Executive Network Director';
    return 'Ambassador';
  }

  function guideUrl() {
    return '/dos/navigation-guide.html?rank=' + encodeURIComponent(rank());
  }

  function welcomeStep() {
    var r = rank();
    var body =
      'This is your ' + rankTitle() + ' Deployment Operations dashboard. ' +
      'The tour covers every sidebar section, where to start Foundation School, and links to Resources and Leaderboard.';
    if (r === 'ambassador' && document.querySelector('[data-section="role-targets"]')) {
      body += ' New ambassadors: open Role & targets first — your operational blueprint, targets, commission, and PDF download.';
    }
    if (r === 'senior') {
      body += ' You also have Team command for your downline.';
    } else if (r === 'regional_director') {
      body += ' You also have Team command and Regional command for your territory.';
    } else if (r === 'executive') {
      body += ' You also have Team, Regional, and Global command for the full network.';
    }
    return {
      placement: 'center',
      title: 'Welcome, ' + rankTitle(),
      body: body
    };
  }

  function sectionStep(sectionId, title, body, target) {
    return {
      section: sectionId,
      target: target || '[data-section="' + sectionId + '"]',
      placement: 'top',
      title: title,
      body: body
    };
  }

  function coreSectionSteps() {
    var r = rank();
    var networkBody =
      'Ambassadors you recruited. Ten recruits qualifies for Senior Ambassador (auto-promotion).';
    if (r === 'senior' || r === 'regional_director' || r === 'executive') {
      networkBody =
        'Your personal recruits and network growth. Use Team command for full downline oversight; this section is your own recruitment record.';
    }

    var overviewBody =
      'Check KPIs, monthly target, and quick actions before field work. This is your deployment snapshot — not your training progress.';
    if (r === 'ambassador' && document.querySelector('[data-section="role-targets"]')) {
      overviewBody =
        'Your live numbers and quick actions. Read Role & targets first if you have not studied your blueprint yet — then return here each day for KPIs.';
    }

    return [
      sectionStep('overview', 'Overview — deployment snapshot', overviewBody),
      {
        section: 'formation',
        target: '#dosFormationBody',
        placement: 'top',
        title: 'Formation — your training track (start here for school)',
        body: 'Shows Foundation School / CRLA progress. If not enrolled, click Start Foundation School. ' +
          'For full lessons, also use Foundation School in the sidebar footer (opens the course viewer). Training is separate from deployment ops.'
      },
      sectionStep('daily-ops', 'Daily ops',
        'Log today’s outreach, contacts, and follow-ups. Build the habit: Overview → Daily ops → Field deploy.'),
      sectionStep('field-deploy', 'Field deploy — scripts',
        'Ready-made scripts for approach, close, follow-up, and objections. Use in the field or on calls.'),
      sectionStep('links', 'Deployment links',
        'Your referral URLs by product plus SBD app panel. Copy main link from the top bar anytime.'),
      sectionStep('subscribers', 'Subscribers & pipeline',
        'Prospects and subscribers by stage, plus recent deployments.'),
      sectionStep('retention', 'Retention',
        'Subscribers at risk of dropping off — prioritize follow-up here.'),
      sectionStep('commissions', 'Commissions',
        'Commission history, recurring estimates, and earnings by product category.'),
      sectionStep('social-deploy', 'Social deploy',
        'Caption library for WhatsApp, Facebook, and Instagram — paste and add your link.'),
      sectionStep('reporting', 'Reports',
        'Export deployment summaries for your records or leadership.'),
      sectionStep('network', 'Network', networkBody),
      sectionStep('performance', 'Performance',
        'Leaderboard position, contests, revenue stacks, and unit milestones (Bronze → Platinum).')
    ];
  }

  function externalLinkSteps() {
    return [
      {
        target: '.dos-sidebar-footer',
        placement: 'right',
        title: 'Sidebar footer — courses & site links',
        body: 'Foundation School opens your course viewer (lessons & CRLA). Resources = ambassador tools and PDFs. Leaderboard = rankings. Marriage Education home = main public site.'
      },
      {
        target: '.dos-topbar-links',
        placement: 'bottom',
        title: 'Top bar shortcuts',
        body: 'Home (public site), School (Foundation School), and Leaderboard — same destinations as the sidebar footer, always visible while you work.'
      },
      {
        target: '#dosTourBtn',
        placement: 'bottom',
        title: 'Guide & Map (anytime)',
        body: 'Guide replays this tour. Map opens the full written navigation guide in a new tab.'
      }
    ];
  }

  function ambassadorRoleTargetsSteps() {
    if (rank() !== 'ambassador') return [];
    if (!document.querySelector('[data-section="role-targets"]')) return [];
    return [
      {
        section: 'role-targets',
        target: '[data-dos-nav="role-targets"]',
        placement: 'right',
        title: 'Role & targets — start here',
        body: 'Sidebar item #2. Your official Ambassador blueprint: role, 10/day & 200/month targets, 10% commission, daily rhythm, Senior promotion (10 recruits), and PDF download.'
      },
      {
        section: 'role-targets',
        target: '#dosRoleTargetsMount',
        placement: 'top',
        title: 'Study your charter',
        body: 'Scroll this section anytime. Download the PDF to study offline. Use the buttons at the bottom to jump to Daily ops, Network, Commissions, and other work areas.'
      }
    ];
  }

  function leadershipSteps() {
    var r = rank();
    var extra = [];
    if (r === 'senior' || r === 'regional_director' || r === 'executive') {
      extra.push(sectionStep('team', 'Team command',
        'Your downline ambassadors: activity, recruits, and who needs support. Check this daily as a Senior+ leader.'));
    }
    if (r === 'regional_director' || r === 'executive') {
      extra.push(sectionStep('region', 'Regional command',
        'Territory view: seniors in your region, regional KPIs, and inactive leaders needing attention.'));
    }
    if (r === 'executive') {
      extra.push(sectionStep('global', 'Global command',
        'Network-wide executive metrics and aggregates across all regions.'));
    }
    return extra;
  }

  function finalStep() {
    var body =
      'Daily rhythm: Overview → Daily ops → deploy with Links / Social → check Subscribers & Retention → Commissions. ' +
      'For training: Formation section or Foundation School in the sidebar. Click Guide to replay; Map for the full sitemap.';
    if (rank() === 'ambassador' && document.querySelector('[data-section="role-targets"]')) {
      body =
        'First time: Role & targets (blueprint + PDF). Then daily: Overview → Daily ops → Links / Field deploy → Subscribers & Retention → Commissions. ' +
        'Training: Formation or Foundation School in the sidebar footer. Guide replays this tour; Map opens the written guide.';
    }
    return {
      placement: 'center',
      title: rankTitle() + ' — tour complete',
      body: body,
      isFinal: true
    };
  }

  function sidebarIntroStep() {
    var body =
      'Every deployment module is listed here — ops, pipeline, commissions, network, formation, performance' +
      (rank() !== 'ambassador' ? ', plus leadership sections for your rank.' : '.');
    if (rank() === 'ambassador' && document.querySelector('[data-dos-nav="role-targets"]')) {
      body =
        'Deployment modules are listed here. New ambassadors: open Role & targets (2nd item) before heavy field work — then Overview, Daily ops, and the rest.';
    }
    return {
      target: '#dosSidebarNav',
      placement: 'right',
      title: 'Main sections (left sidebar)',
      body: body
    };
  }

  function buildSteps() {
    steps = [welcomeStep()]
      .concat([sidebarIntroStep()])
      .concat(ambassadorRoleTargetsSteps())
      .concat(externalLinkSteps())
      .concat(coreSectionSteps())
      .concat(leadershipSteps())
      .concat([finalStep()]);
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
    btn.className = 'dos-btn dos-btn-guide';
    btn.title = 'Dashboard walkthrough';
    btn.innerHTML = '<i class="fa-solid fa-circle-question"></i> Guide';
    btn.addEventListener('click', function () {
      var code = userCode || (global.MEAmbassadorSession && global.MEAmbassadorSession.getCode());
      startTour(code, true);
    });
    var link = document.createElement('a');
    link.className = 'dos-btn dos-btn-guide';
    link.id = 'dosGuideDocBtn';
    link.href = guideUrl();
    link.target = '_blank';
    link.rel = 'noopener';
    link.title = 'Full navigation guide';
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
    if (global.DOSRouter) global.DOSRouter.setSection(sectionId);
    else location.hash = '#' + sectionId;
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
    if (left + panelRect.width > window.innerWidth - 12) left = window.innerWidth - panelRect.width - 12;
    if (left < 12) left = 12;
    if (top + panelRect.height > window.innerHeight - 12) top = window.innerHeight - panelRect.height - 12;
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
          'Step ' + (stepIndex + 1) + ' of ' + steps.length + ' · ' + rankTitle();

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
    bindToolbarButtons();
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
