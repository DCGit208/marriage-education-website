/**
 * Ambassador dashboard v2 — Deployment Operations System (production + preview).
 */
(function (global) {
  'use strict';

  var state = {
    code: null,
    stats: null,
    metrics: null,
    name: 'Ambassador',
    primaryLink: ''
  };

  var SENIOR_TARGET = 10;

  function getRank() {
    return document.body.getAttribute('data-dos-rank') || 'ambassador';
  }

  function isSeniorPreview() {
    return getRank() === 'senior';
  }

  function isRdPreview() {
    return getRank() === 'regional_director';
  }

  function isExecutivePreview() {
    return getRank() === 'executive';
  }

  function isLeadershipPreview() {
    return isSeniorPreview() || isRdPreview() || isExecutivePreview();
  }

  function isDosPreviewHostPage() {
    return /-test(?:\.html)?$/.test(window.location.pathname) ||
      window.location.pathname.indexOf('-test') !== -1;
  }

  /** On -test leadership pages, stay put for UI review; production always enforces rank routing. */
  function skipRankRedirectOnThisPage() {
    if (isDosPreviewHostPage() && (isRdPreview() || isSeniorPreview() || isExecutivePreview())) {
      return true;
    }
    var params = new URLSearchParams(window.location.search);
    if (params.get('preview') === 'force') return true;
    return false;
  }

  function dashboardPathForType(ambassadorType) {
    var routes = global.MEAmbassadorRoutes;
    if (!routes) {
      var t = (ambassadorType || 'regular').toString().toLowerCase();
      if (t === 'executive') return '/executive/dashboard.html';
      if (t === 'regional_director') return '/regional-director/rd-dashboard.html';
      if (t === 'senior') return '/ambassador/senior-dashboard.html';
      return '/ambassador/dashboard.html';
    }
    if (isDosPreviewHostPage()) {
      return routes.getPreviewDashboardPathForType(ambassadorType);
    }
    return routes.getDashboardPathForType(ambassadorType);
  }

  function redirectToRankDashboard(ambassadorType) {
    window.location.replace(dashboardPathForType(ambassadorType));
  }

  function rankLabel() {
    if (isExecutivePreview()) return 'Executive Network Director';
    if (isRdPreview()) return 'Regional Director';
    if (isSeniorPreview()) return 'Senior Ambassador';
    return 'Ambassador';
  }

  function loginNextPath() {
    if (isExecutivePreview()) return dashboardPathForType('executive');
    if (isRdPreview()) return dashboardPathForType('regional_director');
    if (isSeniorPreview()) return dashboardPathForType('senior');
    return dashboardPathForType('regular');
  }

  var PORTFOLIO_CATEGORIES = [
    { key: 'books', label: 'Books', icon: 'fa-solid fa-book' },
    { key: 'schools', label: 'Schools', icon: 'fa-solid fa-school' },
    { key: 'courses', label: 'Courses', icon: 'fa-solid fa-book-open' },
    { key: 'premium', label: 'Premium', icon: 'fa-solid fa-briefcase' },
    { key: 'corporate', label: 'Corporate', icon: 'fa-solid fa-building' },
    { key: 'community', label: 'Community', icon: 'fa-solid fa-handshake' },
    { key: 'recruitment', label: 'Recruitment', icon: 'fa-solid fa-user-plus' }
  ];

  function db() {
    return firebase.firestore();
  }

  function money() {
    return global.MEMoney;
  }

  function fmtUsd(amount, opts) {
    return money() ? money().formatStoredAsUSD(amount, opts) : '$' + (Number(amount) || 0);
  }

  function formatUsdValue(usd) {
    return money() ? money().formatUSD(usd) : '$' + Math.round(usd).toLocaleString();
  }

  function getCampaignLink(code) {
    return 'https://marriageducation.com/sbd-campaign.html?ref=' + encodeURIComponent(code || '');
  }

  function getPortfolioLinks(code) {
    var safe = encodeURIComponent(code || '');
    return [
      { key: 'books', label: 'Books', icon: 'fa-solid fa-book', url: 'https://marriageducation.com/sbd-campaign.html?ref=' + safe + '&category=books' },
      { key: 'schools', label: 'Schools', icon: 'fa-solid fa-school', url: 'https://marriageducation.com/schools.html?ref=' + safe + '&category=schools' },
      { key: 'courses', label: 'Courses', icon: 'fa-solid fa-book-open', url: 'https://marriageducation.com/courses.html?ref=' + safe + '&category=courses' },
      { key: 'premium', label: 'Premium', icon: 'fa-solid fa-briefcase', url: 'https://marriageducation.com/payment.html?ref=' + safe + '&category=premium' },
      { key: 'corporate', label: 'Corporate', icon: 'fa-solid fa-building', url: 'https://marriageducation.com/corporate.html?ref=' + safe + '&category=corporate' },
      { key: 'community', label: 'Community', icon: 'fa-solid fa-handshake', url: 'https://marriageducation.com/resources.html?ref=' + safe + '&category=community' },
      { key: 'recruitment', label: 'Recruitment', icon: 'fa-solid fa-user-plus', url: 'https://marriageducation.com/ambassador-register.html?ref=' + safe + '&category=recruitment' }
    ];
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).then(function () {
      alert('Copied to clipboard');
    }).catch(function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('Copied to clipboard');
    });
  }

  function resolveName(stats, stored) {
    if (stats.name) return stats.name;
    if (stats.firstName && stats.lastName) return stats.firstName + ' ' + stats.lastName;
    if (stats.firstName) return stats.firstName;
    if (stored) {
      try {
        var p = JSON.parse(stored);
        if (p.name) return p.name;
        if (p.firstName && p.lastName) return p.firstName + ' ' + p.lastName;
      } catch (e) { /* ignore */ }
    }
    return 'Ambassador';
  }

  function unitsDeployed(stats) {
    return stats.accessUnitsDeployed || stats.sales_count || stats.booksSold || 0;
  }

  function kpi(label, value, sub) {
    return '<div class="dos-kpi"><div class="dos-kpi-label">' + label + '</div>' +
      '<div class="dos-kpi-value">' + value + '</div>' +
      (sub ? '<div class="dos-kpi-sub">' + sub + '</div>' : '') + '</div>';
  }

  function renderMonthlyTarget(stats) {
    var mount = document.getElementById('dosMonthlyTargetMount');
    if (!mount) return;

    var now = new Date();
    var monthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    var monthlyXaf = (stats.monthly_earnings && stats.monthly_earnings[monthKey])
      ? stats.monthly_earnings[monthKey].total : 0;
    var monthlyUsd = money() ? money().toUsd(monthlyXaf) : monthlyXaf / 600;
    var targetUsd = money()
      ? (isRdPreview()
        ? money().TARGETS.rdMonthlyUsd
        : (isSeniorPreview() ? money().TARGETS.seniorMonthlyUsd : money().TARGETS.ambassadorMonthlyUsd))
      : (isRdPreview() ? 750000 : (isSeniorPreview() ? 18000 : 3000));
    var remainingUsd = Math.max(0, targetUsd - monthlyUsd);
    var progress = Math.min(100, targetUsd ? (monthlyUsd / targetUsd) * 100 : 0);
    var lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var daysLeft = lastDay - now.getDate();

    mount.innerHTML =
      '<div class="dos-monthly-target">' +
      '<div class="dos-monthly-target-head">' +
      '<div><h3><i class="fa-solid fa-bullseye"></i> Monthly Target</h3>' +
      '<p style="margin:0;opacity:0.95;font-size:14px">Monthly target: ' + formatUsdValue(targetUsd) + ' USD</p></div>' +
      '<div class="dos-monthly-earned" id="dosMonthlyEarnings">' + formatUsdValue(monthlyUsd) + '</div></div>' +
      '<div class="dos-monthly-bar"><div class="dos-monthly-bar-fill" id="dosMonthlyProgressFill" style="width:' +
      progress.toFixed(1) + '%">' + progress.toFixed(0) + '%</div></div>' +
      '<div class="dos-monthly-stats">' +
      '<div><div class="label">Remaining</div><div class="val" id="dosMonthlyRemaining">' + formatUsdValue(remainingUsd) + '</div></div>' +
      '<div><div class="label">Progress</div><div class="val" id="dosMonthlyProgress">' + progress.toFixed(1) + '%</div></div>' +
      '<div><div class="label">Days left</div><div class="val" id="dosDaysLeft">' + daysLeft + '</div></div>' +
      '</div></div>';
  }

  function renderContestBanner() {
    var mount = document.getElementById('dosContestMount');
    if (!mount) return;

    var now = new Date();
    var day = now.getDay();
    var daysUntilSunday = day === 0 ? 7 : 7 - day;
    var end = new Date(now);
    end.setDate(now.getDate() + daysUntilSunday);
    end.setHours(23, 59, 59, 999);
    var ms = end - now;
    var d = Math.floor(ms / 86400000);
    var h = Math.floor((ms % 86400000) / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    var bonus = money() ? formatUsdValue(money().TARGETS.contestBonusUsd) : '$17';

    mount.innerHTML =
      '<div class="dos-contest-banner">' +
      '<div class="dos-contest-head">' +
      '<div style="font-size:1.75rem"><i class="fa-solid fa-trophy"></i></div>' +
      '<div><h4>Weekly Recognition: Impact Leader</h4>' +
      '<p style="margin:0;font-size:13px;opacity:0.9">Most access units deployed this week wins <strong>' + bonus + ' bonus + featured story</strong></p></div>' +
      '<div class="dos-contest-countdown"><span>Ends in</span><strong id="dosContestCountdown">' + d + 'd ' + h + 'h ' + m + 'm</strong></div>' +
      '</div>' +
      '</div>';
  }

  function renderMilestones(stats) {
    var list = document.getElementById('dosMilestoneList');
    if (!list || !global.DOSConfig) return;

    var units = unitsDeployed(stats);
    var milestones = global.DOSConfig.UNIT_MILESTONES;
    var next = milestones.find(function (m) { return m.threshold > units; });

    list.innerHTML = milestones.map(function (m) {
      var achieved = units >= m.threshold;
      var current = !achieved && next && next.level === m.level;
      var cls = achieved ? 'achieved' : (current ? 'current' : 'locked');
      var sub = achieved
        ? 'Achieved at ' + m.threshold + ' units'
        : (current ? (m.threshold - units) + ' units to go' : 'Unlock at ' + m.threshold + ' units');
      return '<div class="dos-milestone-row ' + cls + '">' +
        '<div class="dos-milestone-ico"><i class="fa-solid ' + m.icon + '"></i></div>' +
        '<div><strong>' + m.level + ' (' + m.threshold + ' units)</strong><br>' +
        '<span style="font-size:12px;color:#71717a">' + sub + '</span></div></div>';
    }).join('');

  }

  function getMetrics(stats, code) {
    if (state.metrics) return state.metrics;
    if (global.DOSMetrics) return global.DOSMetrics.buildFromAmbassador(code, stats);
    return null;
  }

  function renderSeniorOverview(stats, code, teamStats) {
    var m = getMetrics(stats, code);
    var ts = teamStats || { count: 0, active: 0, inactive: 0, totalUnits: 0, totalOverrideUsd: 0, teamSubs: 0 };
    var units = m ? m.deployment.unitsDeployed : unitsDeployed(stats);
    var earnings = m ? m.commissions.allTimeXaf : (stats.commission_earned || stats.commissionEarned || 0);
    var activeSubs = m ? m.subscribers.active : ((stats.sbdReferrals || {}).subscribers || 0);
    var mrrUsd = m && m.commissions.estimatedMrrUsd != null ? m.commissions.estimatedMrrUsd : null;
    var seniorsRecruited = stats.seniors_recruited || 0;
    var rdTarget = global.DOSConfig ? global.DOSConfig.RD_SENIOR_TARGET : 50;
    var rdPct = Math.min(100, Math.round((seniorsRecruited / rdTarget) * 100));
    var overrideLabel = global.DOSEconomics
      ? global.DOSEconomics.formatUsd(ts.totalOverrideUsd)
      : formatUsdValue(ts.totalOverrideUsd);

    var el = document.getElementById('dosOverviewKpis');
    if (!el) return;

    el.innerHTML =
      kpi('Team ambassadors', String(ts.count), ts.active + ' active · ' + ts.inactive + ' need attention') +
      kpi('Team units deployed', String(ts.totalUnits), 'Across your team') +
      kpi('Est. team override (5%)', overrideLabel, 'From team deployment revenue') +
      kpi('Your SBD subscribers', String(activeSubs), 'Your direct recurring base') +
      kpi('Your access units', String(units), 'Personal deployments') +
      kpi('Your total commissions', fmtUsd(earnings), 'All-time earned (USD)') +
      kpi('Path to RD', seniorsRecruited + ' / ' + rdTarget, rdPct + '% toward Regional Director');
  }

  function renderRdOverview(stats, code, regionStats) {
    var m = getMetrics(stats, code);
    var rs = regionStats || {
      seniorCount: 0, totalAmbassadors: 0, totalUnits: 0,
      networkOverrideUsd: 0, activeSeniors: 0, inactiveSeniors: 0, seniorTarget: 50, seniorPct: 0
    };
    var units = m ? m.deployment.unitsDeployed : unitsDeployed(stats);
    var earnings = m ? m.commissions.allTimeXaf : (stats.commission_earned || stats.commissionEarned || 0);
    var activeSubs = m ? m.subscribers.active : ((stats.sbdReferrals || {}).subscribers || 0);
    var overrideLabel = global.DOSEconomics
      ? global.DOSEconomics.formatUsd(rs.networkOverrideUsd)
      : formatUsdValue(rs.networkOverrideUsd);

    var el = document.getElementById('dosOverviewKpis');
    if (!el) return;

    el.innerHTML =
      kpi('Senior ambassadors', String(rs.seniorCount) + ' / ' + rs.seniorTarget, rs.seniorPct + '% regional target') +
      kpi('Network ambassadors', String(rs.totalAmbassadors), 'Across senior teams') +
      kpi('Network units', String(rs.totalUnits), 'Regional deployment volume') +
      kpi('Est. network override', overrideLabel, '5% on senior team volume') +
      kpi('Seniors on track', String(rs.activeSeniors), rs.inactiveSeniors + ' need coaching') +
      kpi('Your SBD subscribers', String(activeSubs), 'Personal recurring base') +
      kpi('Your total commissions', fmtUsd(earnings), 'All-time earned (USD)');
  }

  function renderOverview(stats, code) {
    if (isRdPreview()) {
      renderRdOverview(stats, code, state.regionStats);
      return;
    }
    if (isSeniorPreview()) {
      renderSeniorOverview(stats, code, state.teamStats);
      return;
    }
    var m = getMetrics(stats, code);
    var recruits = m ? m.network.recruits : (stats.recruits_count || 0);
    var seniorTarget = m ? m.network.seniorTarget : SENIOR_TARGET;
    var recruitPct = Math.min(100, Math.round((recruits / seniorTarget) * 100));
    var units = m ? m.deployment.unitsDeployed : unitsDeployed(stats);
    var earnings = m ? m.commissions.allTimeXaf : (stats.commission_earned || stats.commissionEarned || 0);
    var activeSubs = m ? m.subscribers.active : ((stats.sbdReferrals || {}).subscribers || 0);
    var level = m ? (m.formation.level || stats.level) : (stats.level || 'Starter');
    var mrrUsd = m && m.commissions.estimatedMrrUsd != null ? m.commissions.estimatedMrrUsd : null;

    var el = document.getElementById('dosOverviewKpis');
    if (!el) return;

    var mrrLabel = mrrUsd != null
      ? (global.DOSEconomics ? global.DOSEconomics.formatUsd(mrrUsd) : formatUsdValue(mrrUsd)) + ' est. MRR'
      : 'From SBD recurring subs';

    el.innerHTML =
      kpi('Active subscribers (SBD)', String(activeSubs), 'SBD Network app referrals') +
      kpi('Access units deployed', String(units), 'Books & product deployments') +
      kpi('Total commissions', fmtUsd(earnings), 'All-time earned (USD)') +
      kpi('Est. recurring (DOS)', mrrUsd != null ? (global.DOSEconomics ? global.DOSEconomics.formatUsd(mrrUsd) : formatUsdValue(mrrUsd)) : '—', mrrLabel) +
      kpi('Deployment level', level, 'See Performance for milestones') +
      kpi('Recruits', recruits + ' / ' + seniorTarget, 'Ambassadors → Senior rank') +
      kpi('CRLA', (m && m.formation.credentialStatus === 'earned') || stats.credentialStatus === 'earned' ? 'Certified' : 'In progress', 'Formation section');

    var prog = document.getElementById('dosSeniorProgress');
    if (prog) {
      prog.innerHTML =
        '<div class="dos-progress"><div class="dos-progress-fill" style="width:' + recruitPct + '%"></div></div>' +
        '<p style="margin:8px 0 0;font-size:13px;color:#71717a;">' + recruits + ' of ' + seniorTarget +
        ' ambassadors recruited (' + recruitPct + '%)</p>';
    }
  }

  function renderLinks(stats, code) {
    var primary = getCampaignLink(code);
    state.primaryLink = primary;
    var primaryEl = document.getElementById('dosPrimaryLink');
    if (primaryEl) primaryEl.textContent = primary;

    var grid = document.getElementById('dosPortfolioGrid');
    if (grid) {
      grid.innerHTML = getPortfolioLinks(code).map(function (item) {
        return '<div class="dos-portfolio-item">' +
          '<h4><i class="' + item.icon + '"></i> ' + item.label + '</h4>' +
          '<div class="dos-portfolio-url">' + item.url + '</div>' +
          '<button type="button" class="dos-btn dos-btn-primary" data-copy-url="' + encodeURIComponent(item.url) + '"><i class="fa-solid fa-copy"></i> Copy</button> ' +
          '<a class="dos-btn" href="' + item.url + '" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open</a></div>';
      }).join('');
      grid.querySelectorAll('[data-copy-url]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          copyText(decodeURIComponent(btn.getAttribute('data-copy-url')));
        });
      });
    }

    renderSbdPanel(stats);
  }

  function renderSbdPanel(stats) {
    var body = document.getElementById('dosSbdBody');
    if (!body) return;

    var sbdCode = stats.sbdReferralCode;
    if (!sbdCode) {
      body.innerHTML =
        '<p class="dos-sbd-empty"><i class="fa-solid fa-circle-info"></i> SBD Network referral code not provisioned on your account yet. ' +
        'When enabled, your app link and signup stats appear here (same as live dashboard).</p>';
      return;
    }

    var sbdUrl = 'https://sbd-network.web.app/auth?ref=' + sbdCode;
    var refs = stats.sbdReferrals || {};
    body.innerHTML =
      '<p class="dos-sbd-empty" style="margin-bottom:12px">Share this link for SBD Network app signups and subscriptions:</p>' +
      '<div class="dos-sbd-panel">' +
      '<div class="dos-link-row">' +
      '<div class="dos-link-box" id="dosSbdLink">' + sbdUrl + '</div>' +
      '<button type="button" class="dos-btn dos-btn-primary" id="dosCopySbd"><i class="fa-solid fa-copy"></i> Copy</button>' +
      '<a class="dos-btn" href="https://sbd-network.web.app" target="_blank" rel="noopener"><i class="fa-solid fa-external-link-alt"></i> Open app</a>' +
      '</div></div>' +
      '<div class="dos-kpi-grid" style="margin-top:16px">' +
      kpi('Signups', String(refs.signups || 0), '') +
      kpi('Subscribers', String(refs.subscribers || 0), '') +
      kpi('Foundation', String(refs.foundation || 0), '') +
      kpi('Premium', String(refs.premium || 0), '') +
      kpi('Elite', String(refs.elite || 0), '') +
      '</div>';

    var copySbd = document.getElementById('dosCopySbd');
    if (copySbd) {
      copySbd.addEventListener('click', function () {
        copyText(sbdUrl);
      });
    }
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function showLoadError(message) {
    var el = document.getElementById('dosLoadError');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = '<strong>Could not load dashboard:</strong> ' + message +
      ' <a href="/ambassador-login.html?next=' + encodeURIComponent(loginNextPath()) + '">Log in again</a>';
  }

  function clearLoadError() {
    var el = document.getElementById('dosLoadError');
    if (el) el.style.display = 'none';
  }

  function renderFormation(stats) {
    var el = document.getElementById('dosFormationBody');
    if (!el) return;
    var enrollment = stats.school_enrollment && stats.school_enrollment.foundation_school;

    if (!enrollment) {
      el.innerHTML =
        '<div class="dos-empty">Not enrolled in Foundation School yet.</div>' +
        '<p style="margin-top:12px"><a class="dos-btn dos-btn-primary" href="../course-viewer.html?courseId=foundation-school">' +
        '<i class="fa-solid fa-play"></i> Start Foundation School</a></p>';
      return;
    }

    var currentWeek = enrollment.current_week || 1;
    var totalWeeks = 6;
    var progressPercent = enrollment.progress_percent;
    if (progressPercent == null) {
      var tele = enrollment.teleios_progress || 0;
      var adv = enrollment.advocacy_progress || 0;
      progressPercent = Math.round((tele + adv) / 2);
    }
    var completedModules = enrollment.completed_modules || {};
    var modulesCompleted = Object.keys(completedModules).filter(function (key) {
      return completedModules[key] && completedModules[key].completed === true;
    }).length;

    var crlaHtml = enrollment.exam_passed
      ? '<span style="color:#00b894"><i class="fa-solid fa-circle-check"></i> CRLA Certified</span>'
      : (modulesCompleted > 0 || currentWeek > 1
        ? '<span style="color:#d97706"><i class="fa-solid fa-clock"></i> In progress</span>'
        : '<span style="color:#71717a"><i class="fa-regular fa-circle"></i> Not started</span>');

    el.innerHTML =
      '<div class="dos-formation-card">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:14px">' +
      '<div><h4 style="margin:0 0 6px;color:#00b894">Week ' + currentWeek + ' of ' + totalWeeks + '</h4>' +
      '<p style="margin:0;font-size:13px;color:#636e72">Dual track: Teleios Blueprint + Advocacy Training</p></div>' +
      '<div style="text-align:right"><div style="font-size:2rem;font-weight:800;color:#00b894">' + progressPercent + '%</div>' +
      '<small style="color:#636e72">Complete</small></div></div>' +
      '<div class="dos-progress"><div class="dos-progress-fill" style="width:' + progressPercent + '%;background:var(--dos-accent)"></div></div>' +
      '<div style="margin-top:16px;font-size:14px"><strong>Weeks completed:</strong> ' + modulesCompleted + '/' + totalWeeks +
      ' &nbsp;·&nbsp; <strong>CRLA:</strong> ' + crlaHtml + '</div></div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">' +
      '<a class="dos-btn dos-btn-primary" href="../course-viewer.html?courseId=foundation-school"><i class="fa-solid fa-play-circle"></i> Continue learning</a>' +
      '<a class="dos-btn" href="../course-viewer.html?courseId=foundation-school"><i class="fa-solid fa-list"></i> Course outline</a></div>';
  }

  function renderPortfolioTable(stats) {
    var tbody = document.getElementById('dosPortfolioTableBody');
    if (!tbody) return;
    var totalRev = 0;
    var totalEarn = 0;
    var rows = '';
    PORTFOLIO_CATEGORIES.forEach(function (cat) {
      var units = (stats.deployment_by_category && stats.deployment_by_category[cat.key]) || 0;
      var earn = (stats.revenue_by_category && stats.revenue_by_category[cat.key]) || 0;
      var rev = cat.key === 'recruitment' ? earn : earn * 10;
      totalRev += rev;
      totalEarn += earn;
      rows += '<tr><td><i class="' + cat.icon + '"></i> ' + cat.label + '</td><td>' + units + '</td><td>' + fmtUsd(rev) +
        '</td><td><strong>' + fmtUsd(earn) + '</strong></td></tr>';
    });
    tbody.innerHTML = rows;
    setText('dosPortfolioTotalRev', fmtUsd(totalRev));
    setText('dosPortfolioTotalEarn', fmtUsd(totalEarn));
  }

  async function fetchSalesForCommission(code) {
    var rows = [];
    var queries = [
      db().collection('sales').where('source_ambassador', '==', code).orderBy('sale_date', 'desc').limit(25),
      db().collection('sales').where('ambassador_code', '==', code).orderBy('sale_date', 'desc').limit(25)
    ];
    for (var i = 0; i < queries.length; i++) {
      try {
        var snap = await queries[i].get();
        snap.forEach(function (doc) {
          if (rows.some(function (r) { return r.id === doc.id; })) return;
          var sale = doc.data();
          var d = sale.sale_date && sale.sale_date.toDate ? sale.sale_date.toDate() : new Date(0);
          rows.push({
            id: doc.id,
            date: d,
            source: sale.customer_name || sale.customer_email || 'Customer',
            product: sale.product_name || 'Sale',
            commission: (sale.commissions && sale.commissions.ambassador) || sale.ambassador_commission || 0
          });
        });
        if (rows.length) return rows;
      } catch (e) {
        console.warn('Commission query attempt', i, e);
      }
    }
    try {
      var fallback = await db().collection('sales').where('source_ambassador', '==', code).limit(25).get();
      fallback.forEach(function (doc) {
        var sale = doc.data();
        rows.push({
          id: doc.id,
          date: sale.sale_date && sale.sale_date.toDate ? sale.sale_date.toDate() : new Date(0),
          source: sale.customer_name || sale.customer_email || 'Customer',
          product: sale.product_name || 'Sale',
          commission: (sale.commissions && sale.commissions.ambassador) || sale.ambassador_commission || 0
        });
      });
    } catch (e2) {
      console.warn('Commission fallback', e2);
    }
      rows.sort(function (a, b) { return b.date - a.date; });
    state.commissionRows = rows.slice(0, 25);
    return state.commissionRows;
  }

  async function loadCommissionHistory(code) {
    var tbody = document.getElementById('dosCommissionBody');
    if (!tbody) return;
    try {
      var rows = await fetchSalesForCommission(code);
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="dos-empty">No commissions yet. Deploy your links to start earning.</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(function (r) {
        return '<tr><td>' + r.date.toLocaleDateString() + '</td><td>' + r.source + '</td><td>' + r.product +
          '</td><td><strong>' + fmtUsd(r.commission) + '</strong></td></tr>';
      }).join('');
    } catch (err) {
      console.error(err);
      tbody.innerHTML = '<tr><td colspan="4" class="dos-empty">Unable to load commission history.</td></tr>';
    }
  }

  async function loadRecruits(code, stats) {
    var list = document.getElementById('dosRecruitList');
    var countEl = document.getElementById('dosRecruitCount');
    if (!list) return;
    var recruits = [];
    try {
      var queries = [
        db().collection('ambassadors').where('recruitedBy', '==', code).get(),
        db().collection('ambassadors').where('senior_code', '==', code).get(),
        db().collection('ambassadors').where('rdCode', '==', code).get()
      ];
      var snaps = await Promise.all(queries);
      var seen = {};
      snaps.forEach(function (snap) {
        snap.forEach(function (doc) {
          if (!seen[doc.id]) {
            seen[doc.id] = true;
            recruits.push({ id: doc.id, data: doc.data() });
          }
        });
      });
    } catch (e) {
      console.warn('Recruit queries', e);
    }

    var count = stats.recruits_count != null ? stats.recruits_count : recruits.length;
    if (countEl) countEl.textContent = count;

    if (!recruits.length) {
      list.innerHTML = '<div class="dos-empty">No ambassadors recruited yet. Use your <strong>Recruitment</strong> link under Deployment links.</div>';
      return;
    }
    list.innerHTML = '<div class="dos-recruit-grid">' + recruits.map(function (r) {
      var d = r.data;
      var name = d.fullName || d.name || d.email || r.id;
      return '<div class="dos-recruit-card"><div class="dos-avatar">' + name.charAt(0).toUpperCase() +
        '</div><div><strong>' + name + '</strong><br><span style="font-size:12px;color:#71717a">' + r.id + '</span></div></div>';
    }).join('') + '</div>';
  }

  async function loadRecentSales(code) {
    var el = document.getElementById('dosRecentSales');
    if (!el) return;
    try {
      var snap = await db().collection('sales').where('ambassador_code', '==', code)
        .orderBy('sale_date', 'desc').limit(8).get();
      if (snap.empty) {
        el.innerHTML = '<div class="dos-empty">No recent deployments recorded.</div>';
        return;
      }
      el.innerHTML = '<div class="dos-table-wrap"><table class="dos-table"><thead><tr><th>Date</th><th>Product</th><th>Commission</th></tr></thead><tbody>' +
        snap.docs.map(function (doc) {
          var s = doc.data();
          var d = s.sale_date && s.sale_date.toDate ? s.sale_date.toDate() : new Date();
          return '<tr><td>' + d.toLocaleDateString() + '</td><td>' + (s.product_name || 'Product') +
            '</td><td>' + fmtUsd(s.ambassador_commission || 0) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    } catch (e) {
      el.innerHTML = '<div class="dos-empty">Could not load recent activity.</div>';
    }
  }

  async function loadLeaderboard(code) {
    var el = document.getElementById('dosLeaderboard');
    if (!el) return;
    try {
      var snap = await db().collection('ambassadors')
        .where('status', 'in', ['active', 'approved'])
        .orderBy('sales_count', 'desc')
        .limit(100)
        .get();
      var rank = '—';
      var i = 0;
      snap.forEach(function (doc) {
        i++;
        if (doc.id === code || (doc.data().code === code)) rank = String(i);
      });
      el.innerHTML = '<p style="font-size:28px;font-weight:800;margin:0">#' + rank + '</p>' +
        '<p style="color:#71717a">Among active ambassadors by units deployed</p>' +
        '<a class="dos-btn" href="leaderboard.html" style="margin-top:12px"><i class="fa-solid fa-trophy"></i> Full leaderboard</a>';
    } catch (e) {
      el.innerHTML = '<p>Leaderboard unavailable</p><a class="dos-btn" href="leaderboard.html">Open leaderboard</a>';
    }
  }

  function initAnnouncements() {
    var bellBtn = document.getElementById('dosNotifBtn');
    var panel = document.getElementById('dosNotifPanel');
    var badge = document.getElementById('dosNotifBadge');
    var list = document.getElementById('dosNotifList');
    var markAll = document.getElementById('dosNotifMarkAll');
    if (!bellBtn || !panel || !list) return;

    var unreadCount = 0;
    var readIds = JSON.parse(localStorage.getItem('me_read_notifs') || '[]');

    function updateBadge() {
      if (!badge) return;
      if (unreadCount > 0) {
        badge.style.display = 'flex';
        badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
      } else {
        badge.style.display = 'none';
      }
    }

    function timeAgo(ts) {
      if (!ts) return '';
      var d = ts.toDate ? ts.toDate() : new Date(ts);
      var diff = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diff < 60) return 'just now';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      return Math.floor(diff / 86400) + 'd ago';
    }

    bellBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      panel.classList.toggle('open');
    });
    document.addEventListener('click', function (e) {
      var wrap = document.getElementById('dosNotifWrap');
      if (wrap && !wrap.contains(e.target)) panel.classList.remove('open');
    });

    if (markAll) {
      markAll.addEventListener('click', function () {
        list.querySelectorAll('.dos-notif-item').forEach(function (item) {
          var id = item.dataset.id;
          if (id && readIds.indexOf(id) === -1) readIds.push(id);
          item.classList.remove('unread');
        });
        localStorage.setItem('me_read_notifs', JSON.stringify(readIds));
        unreadCount = 0;
        updateBadge();
      });
    }

    if (!firebase.apps.length) return;
    db().collection('announcements')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .onSnapshot(function (snap) {
        if (snap.empty) {
          list.innerHTML = '<div class="dos-empty" style="padding:20px">No announcements yet</div>';
          unreadCount = 0;
          updateBadge();
          return;
        }
        unreadCount = 0;
        list.innerHTML = '';
        snap.forEach(function (doc) {
          var d = doc.data();
          var isUnread = readIds.indexOf(doc.id) === -1;
          if (isUnread) unreadCount++;
          var item = document.createElement('div');
          item.className = 'dos-notif-item' + (isUnread ? ' unread' : '');
          item.dataset.id = doc.id;
          item.innerHTML = '<strong>' + (d.title || 'Announcement') + '</strong>' +
            (d.body || d.message || '') +
            '<div class="dos-notif-time">' + timeAgo(d.createdAt) + '</div>';
          item.addEventListener('click', function () {
            if (readIds.indexOf(doc.id) === -1) {
              readIds.push(doc.id);
              localStorage.setItem('me_read_notifs', JSON.stringify(readIds));
              if (unreadCount > 0) unreadCount--;
              updateBadge();
            }
            item.classList.remove('unread');
          });
          list.appendChild(item);
        });
        updateBadge();
      }, function () { /* collection may not exist */ });
  }

  function bindShareButtons() {
    var link = function () { return state.primaryLink || ''; };
    var wa = document.getElementById('dosShareWhatsApp');
    var fb = document.getElementById('dosShareFacebook');
    var ig = document.getElementById('dosShareInstagram');
    if (wa) {
      wa.addEventListener('click', function () {
        var message = 'Transform your marriage with Marriage Education resources.\n\nGet started: ' + link();
        window.open('https://wa.me/?text=' + encodeURIComponent(message), '_blank');
      });
    }
    if (fb) {
      fb.addEventListener('click', function () {
        window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(link()), '_blank');
      });
    }
    if (ig) {
      ig.addEventListener('click', function () {
        var caption = 'Marriage Education — resources that strengthen your marriage.\n\nDM me or use my link:\n' + link();
        copyText(caption);
      });
    }
  }

  function updateTopbar() {
    setText('dosUserName', state.name);
    setText('dosUserCode', state.code);
    var meta = document.getElementById('dosTopbarMeta');
    var m = state.metrics;
    if (meta) {
      meta.textContent = rankLabel() + ' · Deployment Operations' +
        (m && m.source ? ' · metrics: ' + m.source : '');
    }
    var pill = document.getElementById('dosPhasePill');
    if (pill && global.DOSConfig && global.DOSConfig.PHASE) {
      if (isDosPreviewHostPage()) {
        pill.textContent = 'Phase ' + global.DOSConfig.PHASE.current + ' of ' + global.DOSConfig.PHASE.total + ' · preview';
        pill.style.display = '';
      } else {
        pill.style.display = 'none';
      }
    }
  }

  function isPreviewDashboardPage() {
    return global.DOSPreviewAuth && global.DOSPreviewAuth.isPreviewPage();
  }

  function getStoredCode() {
    if (global.MEAmbassadorSession) return global.MEAmbassadorSession.getCode();
    return localStorage.getItem('ambassadorCode');
  }

  async function loadAll() {
    if (global.MEAmbassadorSession) {
      await global.MEAmbassadorSession.unregisterServiceWorkers();
      global.MEAmbassadorSession.touchSession();
    }

    var code = getStoredCode();
    if (!code) {
      var dest = global.MEAmbassadorSession
        ? global.MEAmbassadorSession.loginUrlForPath(loginNextPath())
        : '/ambassador-login.html?next=' + encodeURIComponent(loginNextPath());
      window.location.replace(dest);
      return;
    }
    if (global.MEAmbassadorSession) global.MEAmbassadorSession.touchSession();
    state.code = code;
    clearLoadError();

    if (typeof firebase === 'undefined' || !firebase.apps.length) {
      showLoadError('Firebase did not load. Check your connection or disable ad blockers.');
      return;
    }

    var stats;
    var accountId = code;
    try {
      if (global.MEAmbassadorAccountResolve) {
        var resolved = await global.MEAmbassadorAccountResolve.resolveAccount(db(), code, null);
        if (resolved) {
          accountId = resolved.id;
          stats = resolved.stats;
          state.accountSource = resolved.source;
        }
      }
      if (!stats) {
        var doc = await db().collection('ambassadors').doc(code).get();
        if (!doc.exists) {
          var rdDoc = await db().collection('regional_directors').doc(code).get();
          if (rdDoc.exists && global.MEAmbassadorAccountResolve) {
            accountId = rdDoc.id;
            stats = global.MEAmbassadorAccountResolve.normalizeRdStats(rdDoc.id, rdDoc.data());
            state.accountSource = 'regional_directors';
          } else {
            showLoadError('Account not found for code ' + code + '. RD accounts use RD-… codes.');
            return;
          }
        } else {
          accountId = doc.id;
          stats = doc.data();
        }
      }
    } catch (err) {
      console.error(err);
      showLoadError(err.message || 'Firestore request failed.');
      return;
    }
    code = accountId;
    state.code = code;
    state.stats = stats;
    state.name = resolveName(stats, localStorage.getItem('ambassadorData'));
    if (global.MEAmbassadorSession) {
      global.MEAmbassadorSession.saveSession(code, localStorage.getItem('ambassadorEmail'), stats);
    }

    if (global.DOSMetrics) {
      state.metrics = await global.DOSMetrics.persist(db(), code, stats);
    }

    if (!skipRankRedirectOnThisPage()) {
      if (!isLeadershipPreview()) {
        if (stats.ambassador_type === 'senior') {
          redirectToRankDashboard('senior');
          return;
        }
        if (stats.ambassador_type === 'executive') {
          redirectToRankDashboard('executive');
          return;
        }
        if (stats.ambassador_type === 'regional_director') {
          redirectToRankDashboard('regional_director');
          return;
        }
      } else if (isSeniorPreview()) {
        if (stats.ambassador_type === 'regional_director') {
          redirectToRankDashboard('regional_director');
          return;
        }
        if (stats.ambassador_type === 'executive') {
          redirectToRankDashboard('executive');
          return;
        }
        if (stats.ambassador_type !== 'senior') {
          redirectToRankDashboard('regular');
          return;
        }
      } else if (isRdPreview()) {
        if (stats.ambassador_type === 'executive') {
          redirectToRankDashboard('executive');
          return;
        }
        if (stats.ambassador_type !== 'regional_director') {
          redirectToRankDashboard(stats.ambassador_type === 'senior' ? 'senior' : 'regular');
          return;
        }
      } else if (isExecutivePreview()) {
        if (stats.ambassador_type !== 'executive') {
          if (stats.ambassador_type === 'regional_director') {
            redirectToRankDashboard('regional_director');
          } else if (stats.ambassador_type === 'senior') {
            redirectToRankDashboard('senior');
          } else {
            redirectToRankDashboard('regular');
          }
          return;
        }
      }
    }

    updateTopbar();
    renderMonthlyTarget(stats);
    if (isExecutivePreview()) {
      await loadPhase6Executive(code, stats);
      await loadPhase4Team(code, stats);
      await loadPhase5Region(code, stats);
    } else if (isRdPreview()) {
      await loadPhase4Team(code, stats);
      await loadPhase5Region(code, stats);
    } else if (isSeniorPreview()) {
      await loadPhase4Team(code, stats);
    } else {
      renderOverview(stats, code);
    }
    renderLinks(stats, code);
    renderFormation(stats);
    renderPortfolioTable(stats);
    renderMilestones(stats);
    await loadPhase2Sections(code);
    await loadPhase3Sections(code, stats);
    await loadPhase7Sections(code, stats);

    try {
      await Promise.all([
        loadCommissionHistory(code),
        loadRecruits(code, stats),
        loadRecentSales(code),
        loadLeaderboard(code)
      ]);
    } catch (err) {
      console.error(err);
      showLoadError('Some sections failed to load. Try refreshing the page.');
    }

    maybeStartDashboardTour(code);
  }

  var pipelineCache = [];

  async function refreshPipelineUI(code) {
    if (!global.DOSPipeline) return;
    pipelineCache = await global.DOSPipeline.loadPipeline(db(), code);
    var stats = global.DOSPipeline.computeRetentionStats(pipelineCache);
    global.DOSPipeline.renderAlertsBanner(document.getElementById('dosAlertsOverview'), stats);
    var pipeEl = document.getElementById('dosPipelineBody');
    if (pipeEl) {
      global.DOSPipeline.renderPipeline(pipeEl, code, pipelineCache, db(), function () {
        refreshPipelineUI(code);
      });
    }
    var retEl = document.getElementById('dosRetentionBody');
    if (retEl) {
      global.DOSPipeline.renderRetention(retEl, pipelineCache, state.metrics);
    }
  }

  async function loadPhase3Sections(code, stats) {
    if (!global.DOSPipeline) return;
    await refreshPipelineUI(code);
    var recEl = document.getElementById('dosRecurringBody');
    if (recEl) {
      global.DOSPipeline.renderRecurringCommissions(recEl, state.metrics, stats);
    }
  }

  async function loadPhase5Region(code, stats) {
    if (!isRdPreview() || !global.DOSRegion) {
      renderRdOverview(stats, code, null);
      return;
    }
    try {
      var seniors = await global.DOSRegion.loadRegionSeniors(db(), code);
      var regionStats = global.DOSRegion.computeRegionStats(seniors, stats);
      state.regionSeniors = seniors;
      state.regionStats = regionStats;
      var cmd = document.getElementById('dosRegionCommandBody');
      var table = document.getElementById('dosRegionSeniorTable');
      if (cmd) global.DOSRegion.renderRegionalCommand(cmd, regionStats, stats);
      if (table) global.DOSRegion.renderSeniorOversightTable(table, seniors);
      renderRdOverview(stats, code, regionStats);
    } catch (err) {
      console.error('Regional command load', err);
      renderRdOverview(stats, code, null);
    }
  }

  function renderExecutiveOverview(stats, code, globalStats) {
    var g = globalStats || {};
    var el = document.getElementById('dosOverviewKpis');
    if (!el) return;
    el.innerHTML =
      kpi('Network ambassadors', String(g.ambassadors), 'Active deployment operators') +
      kpi('Senior ambassadors', String(g.seniors), 'Team leaders') +
      kpi('Regional directors', String(g.rds), 'Regional command') +
      kpi('Network units', String(g.totalUnits), 'All-time deployment volume') +
      kpi('Your rank', 'Executive', 'Global oversight') +
      kpi('Reports', 'Export ready', 'See Reports section');
  }

  async function loadPhase6Executive(code, stats) {
    if (!isExecutivePreview() || !global.DOSExecutive) return;
    try {
      var gStats = await global.DOSExecutive.loadGlobalStats(db());
      state.globalStats = gStats;
      var el = document.getElementById('dosGlobalCommandBody');
      if (el) global.DOSExecutive.renderGlobalCommand(el, stats, gStats);
      renderExecutiveOverview(stats, code, gStats);
    } catch (err) {
      console.error('Executive global command', err);
      renderExecutiveOverview(stats, code, null);
    }
  }

  async function loadPhase7Sections(code, stats) {
    if (global.DOSSocial) {
      var social = document.getElementById('dosSocialBody');
      if (social) global.DOSSocial.renderSocialDeploy(social, state.primaryLink || getCampaignLink(code));
    }
    if (global.DOSReporting) {
      var rep = document.getElementById('dosReportingBody');
      if (rep) {
        global.DOSReporting.renderReporting(rep, state, {
          getPipeline: function () { return pipelineCache; },
          getCommissions: function () { return state.commissionRows || []; },
          exportTeam: isLeadershipPreview() ? function () {
            if (!global.DOSReporting || !state.teamMembers) return;
            var rows = [['Code', 'Name', 'Units', 'Status']];
            state.teamMembers.forEach(function (m) {
              var d = m.data;
              rows.push([m.id, d.fullName || d.name || '', d.sales_count || 0, '']);
            });
            global.DOSReporting.downloadCsv('dos-team-' + code + '.csv', rows);
          } : null
        });
      }
    }
    if (global.DOSGamification) {
      var contest = document.getElementById('dosContestFullMount');
      if (contest) await global.DOSGamification.renderContestFull(contest, db(), code);
      var stacks = document.getElementById('dosRevenueStacksMount');
      if (stacks) global.DOSGamification.renderRevenueStacks(stacks, stats);
      var badges = document.getElementById('dosEliteBadgesMount');
      if (badges) global.DOSGamification.renderEliteBadges(badges, stats, state.metrics);
    }
  }

  async function loadPhase4Team(code, stats) {
    if (!isLeadershipPreview() || !global.DOSTeam) {
      if (isSeniorPreview()) renderSeniorOverview(stats, code, null);
      return;
    }
    try {
      var members = await global.DOSTeam.loadTeamMembers(db(), code);
      var teamStats = global.DOSTeam.computeTeamStats(members);
      state.teamMembers = members;
      state.teamStats = teamStats;
      var cmd = document.getElementById('dosTeamCommandBody');
      var table = document.getElementById('dosTeamTableBody');
      if (cmd) global.DOSTeam.renderTeamCommand(cmd, teamStats, stats);
      if (table) global.DOSTeam.renderTeamTable(table, members);
      renderSeniorOverview(stats, code, teamStats);
    } catch (err) {
      console.error('Team command load', err);
      renderSeniorOverview(stats, code, null);
    }
  }

  async function loadPhase2Sections(code) {
    if (!global.DOSDailyOps) return;
    var dailyEl = document.getElementById('dosDailyOpsBody');
    var fieldEl = document.getElementById('dosFieldDeployBody');
    var log = await global.DOSDailyOps.loadLog(db(), code);
    if (dailyEl) {
      global.DOSDailyOps.renderDailyOps(dailyEl, code, log, function (updated) {
        return global.DOSDailyOps.saveLog(db(), code, updated);
      });
    }
    if (fieldEl) {
      global.DOSDailyOps.renderFieldDeploy(fieldEl, state.primaryLink || getCampaignLink(code));
    }
  }

  function bindActions() {
    var copyPrimary = document.getElementById('dosCopyPrimary');
    var copyPrimary2 = document.getElementById('dosCopyPrimary2');
    function doCopyPrimary() {
      var el = document.getElementById('dosPrimaryLink');
      if (el) copyText(el.textContent.trim());
    }
    if (copyPrimary) copyPrimary.addEventListener('click', doCopyPrimary);
    if (copyPrimary2) copyPrimary2.addEventListener('click', doCopyPrimary);

    var logout = document.getElementById('dosLogout');
    if (logout) {
      logout.addEventListener('click', function () {
        var rank = getRank();
        if (global.MEAmbassadorRoutes && global.MEAmbassadorRoutes.performLogoutForRank) {
          global.MEAmbassadorRoutes.performLogoutForRank(rank);
          return;
        }
        if (global.MEAmbassadorSession) global.MEAmbassadorSession.clearSession();
        window.location.replace('/ambassador-login.html?logged_out=1');
      });
    }

    bindShareButtons();
  }

  function maybeStartDashboardTour(code) {
    if (global.DOSTour && global.DOSTour.onDashboardReady) {
      global.DOSTour.onDashboardReady(code);
    }
  }

  var sessionKeepAliveId = null;

  function startSessionKeepAlive() {
    if (!isPreviewDashboardPage() || !global.MEAmbassadorSession) return;
    if (sessionKeepAliveId) clearInterval(sessionKeepAliveId);
    sessionKeepAliveId = setInterval(function () {
      global.MEAmbassadorSession.touchSession();
    }, 45000);
  }

  function init() {
    bindActions();
    initAnnouncements();
    if (global.DOSRouter) global.DOSRouter.init();
    loadAll();
    startSessionKeepAlive();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.DOSAmbassadorV2 = { reload: loadAll, getState: function () { return state; } };
})(typeof window !== 'undefined' ? window : global);
