/**
 * DOS Role & targets — operational blueprints (Phase 3+).
 * Static charter content; optional live progress via render options.
 */
(function (global) {
  'use strict';

  var DOC_BASE = '../documents/sbd-ops/';

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtUsd(n) {
    if (global.DOSEconomics && global.DOSEconomics.formatUsd) {
      return global.DOSEconomics.formatUsd(n);
    }
    return '$' + Math.round(Number(n) || 0).toLocaleString();
  }

  function doctrine() {
    return (global.DOSEconomics && global.DOSEconomics.DOCTRINE) || {
      subscriptionMonthlyUsd: 9,
      ambassadorRecurringPercent: 0.1,
      seniorOverridePercent: 0.05,
      ambassadorMonthlyTargetUsd: 3000,
      seniorMonthlyTargetUsd: 18000,
      dailyTargets: { newSubscribers: 10 },
      promotion: { seniorRecruits: 10, rdSeniors: 50, ambassadorsPerSenior: 10 }
    };
  }

  function bindSectionLinks(root) {
    if (!root) return;
    root.querySelectorAll('[data-dos-nav]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-dos-nav');
        if (global.DOSRouter && global.DOSRouter.setSection) global.DOSRouter.setSection(id);
      });
    });
  }

  function targetsTable(d) {
    var pct = Math.round((d.ambassadorRecurringPercent || 0.1) * 100);
    var perSub = (d.subscriptionMonthlyUsd || 9) * (d.ambassadorRecurringPercent || 0.1);
    return (
      '<div class="dos-table-wrap"><table class="dos-table dos-charter-table">' +
      '<thead><tr><th>Metric</th><th>Target</th></tr></thead><tbody>' +
      '<tr><td>Daily subscribers</td><td><strong>' + esc(d.dailyTargets.newSubscribers) + ' / day</strong></td></tr>' +
      '<tr><td>Deployment days / month</td><td><strong>20 days</strong></td></tr>' +
      '<tr><td>Monthly subscribers</td><td><strong>200 / month</strong> (10 × 20)</td></tr>' +
      '<tr><td>Product</td><td>Foundation Access · <strong>' + fmtUsd(d.subscriptionMonthlyUsd) + '/mo</strong> recurring</td></tr>' +
      '<tr><td>Your commission</td><td><strong>' + pct + '%</strong> on recurring retained subscriptions</td></tr>' +
      '<tr><td>Per retained subscriber</td><td><strong>' + fmtUsd(perSub) + '/mo</strong></td></tr>' +
      '<tr><td>Senior promotion</td><td><strong>' + esc(d.promotion.seniorRecruits) + ' active ambassadors</strong> + consistency</td></tr>' +
      '</tbody></table></div>'
    );
  }

  function renderAmbassador(mountEl, options) {
    if (!mountEl) return;
    options = options || {};
    var d = doctrine();
    var pct = Math.round((d.ambassadorRecurringPercent || 0.1) * 100);
    var perSub = (d.subscriptionMonthlyUsd || 9) * (d.ambassadorRecurringPercent || 0.1);
    var dailySubs = d.dailyTargets.newSubscribers || 10;
    var blueprintMonthly = 200 * perSub;
    var blueprintDaily = dailySubs * perSub;

    var progressHtml = '';
    if (options.recruits != null || options.activeSubscribers != null) {
      var recruits = Number(options.recruits) || 0;
      var targetRecruits = d.promotion.seniorRecruits || 10;
      progressHtml =
        '<div class="dos-card dos-charter-progress">' +
        '<h3><i class="fa-solid fa-chart-line"></i> Your progress (live)</h3>' +
        '<div class="dos-charter-stat-row">' +
        '<div><span class="dos-charter-stat-label">Ambassadors recruited</span>' +
        '<span class="dos-charter-stat-value">' + recruits + ' / ' + targetRecruits + '</span></div>' +
        (options.activeSubscribers != null
          ? '<div><span class="dos-charter-stat-label">Active subscribers</span>' +
            '<span class="dos-charter-stat-value">' + (Number(options.activeSubscribers) || 0) + '</span></div>'
          : '') +
        (options.recurringCommissionUsd != null
          ? '<div><span class="dos-charter-stat-label">Recurring commission (est.)</span>' +
            '<span class="dos-charter-stat-value">' + fmtUsd(options.recurringCommissionUsd) + '/mo</span></div>'
          : '') +
        '</div></div>';
    }

    mountEl.innerHTML =
      '<div class="dos-charter">' +
      '<div class="dos-card dos-charter-hero">' +
      '<h3><i class="fa-solid fa-book-open"></i> Ambassador — Role &amp; targets</h3>' +
      '<p class="dos-charter-lead">You are a <strong>Marriage Foundation Access deployment operator</strong> — not a passive promoter or one-time salesperson.</p>' +
      '<p class="dos-charter-muted">Deploy recurring educational access daily via <strong>sbd-network.web.app</strong>. Dashboard: <strong>marriageducation.com</strong>.</p>' +
      '<div class="dos-charter-actions">' +
      '<a class="dos-btn dos-btn-primary" href="' + DOC_BASE + 'AMBASSADOR.pdf" download><i class="fa-solid fa-file-pdf"></i> Download blueprint (PDF)</a>' +
      '<a class="dos-btn" href="' + DOC_BASE + 'AMBASSADOR.html" target="_blank" rel="noopener"><i class="fa-solid fa-book"></i> Read full charter</a>' +
      '</div></div>' +

      progressHtml +

      '<div class="dos-card">' +
      '<h3><i class="fa-solid fa-bullseye"></i> Targets at a glance</h3>' +
      targetsTable(d) +
      '</div>' +

      '<div class="dos-charter-duo">' +
      '<div class="dos-card">' +
      '<h3><i class="fa-solid fa-coins"></i> Blueprint economics</h3>' +
      '<p class="dos-charter-muted">From your operational blueprint — recurring retained subscribers at steady deployment pace.</p>' +
      '<ul class="dos-charter-list">' +
      '<li><strong>' + dailySubs + '/day</strong> × ' + fmtUsd(perSub) + ' = <strong>' + fmtUsd(blueprintDaily) + '/day</strong> recurring value</li>' +
      '<li><strong>200/month</strong> retained × ' + fmtUsd(perSub) + ' = <strong>' + fmtUsd(blueprintMonthly) + '/month</strong> recurring</li>' +
      '<li>Retention compounds: 200 → 400 → 1,000+ retained over time when deployment discipline holds</li>' +
      '</ul></div>' +
      '<div class="dos-card">' +
      '<h3><i class="fa-solid fa-gauge-high"></i> Dashboard deployment target</h3>' +
      '<p class="dos-charter-muted">Overview KPI monthly target (multi-product portfolio — not the same as blueprint recurring above).</p>' +
      '<p class="dos-charter-stat-value" style="font-size:1.5rem;margin:8px 0">' + fmtUsd(d.ambassadorMonthlyTargetUsd) + '<span style="font-size:14px;font-weight:500;color:#71717a"> / month</span></p>' +
      '<p class="dos-charter-muted">Track both: subscriber deployment rhythm (10/day, 200/mo) and portfolio performance in Overview &amp; Commissions.</p>' +
      '</div></div>' +

      '<div class="dos-card">' +
      '<h3><i class="fa-solid fa-percent"></i> Commission &amp; product</h3>' +
      '<p><strong>' + pct + '%</strong> commission on <strong>recurring retained</strong> Foundation Access subscriptions (' + fmtUsd(d.subscriptionMonthlyUsd) + '/mo). ' +
      'Equivalent access value: <strong>$2,500+</strong> (Marriage Foundation School, Teleios, Advocacy, literacy, leadership, community).</p>' +
      '</div>' +

      '<div class="dos-card">' +
      '<h3><i class="fa-solid fa-sun"></i> Daily operations rhythm</h3>' +
      '<div class="dos-charter-rhythm">' +
      '<div><strong>Morning</strong><p>Review targets, prepare outreach, WhatsApp status, plan the day.</p></div>' +
      '<div><strong>Afternoon</strong><p>Field outreach — campus, church, community; follow-up conversations.</p></div>' +
      '<div><strong>Evening</strong><p>Close subscribers, complete follow-ups, log activity, retention check-ins.</p></div>' +
      '</div></div>' +

      '<div class="dos-card">' +
      '<h3><i class="fa-solid fa-list-check"></i> Your responsibilities</h3>' +
      '<ol class="dos-charter-list">' +
      '<li><strong>Daily deployment</strong> — Foundation Access, prospects, growth</li>' +
      '<li><strong>Outreach</strong> — community, church, campus, WhatsApp, social, referrals</li>' +
      '<li><strong>Subscriber operations</strong> — onboarding, renewals, engagement</li>' +
      '<li><strong>Leadership development</strong> — consistency, Senior path, duplication</li>' +
      '</ol></div>' +

      '<div class="dos-card">' +
      '<h3><i class="fa-solid fa-arrow-up"></i> Promotion to Senior Ambassador</h3>' +
      '<p class="dos-charter-lead">Recruit <strong>' + esc(d.promotion.seniorRecruits) + ' active ambassadors</strong> and maintain operational consistency.</p>' +
      '<button type="button" class="dos-btn dos-btn-primary" data-dos-nav="network"><i class="fa-solid fa-sitemap"></i> Open Network</button>' +
      '</div>' +

      '<div class="dos-card">' +
      '<h3><i class="fa-solid fa-map"></i> Where to work in this dashboard</h3>' +
      '<div class="dos-charter-nav-grid">' +
      navBtn('daily-ops', 'fa-sun', 'Daily ops') +
      navBtn('field-deploy', 'fa-map-location-dot', 'Field deploy') +
      navBtn('links', 'fa-link', 'Deployment links') +
      navBtn('subscribers', 'fa-user-group', 'Subscribers') +
      navBtn('retention', 'fa-heart-pulse', 'Retention') +
      navBtn('commissions', 'fa-coins', 'Commissions') +
      navBtn('network', 'fa-sitemap', 'Network') +
      navBtn('formation', 'fa-graduation-cap', 'Formation') +
      '</div></div>' +

      '<div class="dos-card dos-charter-mandate">' +
      '<h3><i class="fa-solid fa-flag"></i> Final mandate</h3>' +
      '<p class="dos-charter-lead">Deploy Marriage Foundation Access daily through recurring acquisition, retention, operational consistency, and continuous educational access expansion.</p>' +
      '</div></div>';

    bindSectionLinks(mountEl);
    mountEl.setAttribute('data-charter-built', '1');
  }

  function navBtn(id, icon, label) {
    return '<button type="button" class="dos-btn" data-dos-nav="' + esc(id) + '">' +
      '<i class="fa-solid ' + esc(icon) + '"></i> ' + esc(label) + '</button>';
  }

  function seniorTargetsTable(d) {
    var ambPerDay = d.dailyTargets.newSubscribers || 10;
    var overridePct = Math.round((d.seniorOverridePercent || 0.05) * 100);
    var perSub = (d.subscriptionMonthlyUsd || 9) * (d.seniorOverridePercent || 0.05);
    var ambPerSenior = d.promotion.ambassadorsPerSenior || 10;
    var subsPerAmb = ambPerDay * 20;
    var teamSubs = ambPerSenior * subsPerAmb;
    return (
      '<div class="dos-table-wrap"><table class="dos-table dos-charter-table">' +
      '<thead><tr><th>Metric</th><th>Target</th></tr></thead><tbody>' +
      '<tr><td>Ambassadors per Senior</td><td><strong>' + ambPerSenior + ' active ambassadors</strong></td></tr>' +
      '<tr><td>Per Ambassador</td><td><strong>' + ambPerDay + '/day</strong> × 20 days = <strong>' + subsPerAmb + '/month</strong></td></tr>' +
      '<tr><td>Team subscribers</td><td><strong>' + teamSubs.toLocaleString() + '/month</strong> (at full model)</td></tr>' +
      '<tr><td>Product</td><td>Foundation Access · <strong>' + fmtUsd(d.subscriptionMonthlyUsd) + '/mo</strong></td></tr>' +
      '<tr><td>Senior override</td><td><strong>' + overridePct + '%</strong> on team recurring retained</td></tr>' +
      '<tr><td>Per retained team sub</td><td><strong>' + fmtUsd(perSub) + '/mo</strong></td></tr>' +
      '<tr><td>RD progression (dashboard)</td><td><strong>' + esc(d.promotion.rdSeniors) + ' seniors</strong> in network + operational structure</td></tr>' +
      '</tbody></table></div>'
    );
  }

  function renderSenior(mountEl, options) {
    if (!mountEl) return;
    options = options || {};
    var d = doctrine();
    var overridePct = Math.round((d.seniorOverridePercent || 0.05) * 100);
    var perSub = (d.subscriptionMonthlyUsd || 9) * (d.seniorOverridePercent || 0.05);
    var ambPerSenior = d.promotion.ambassadorsPerSenior || 10;
    var teamSubsModel = ambPerSenior * (d.dailyTargets.newSubscribers || 10) * 20;
    var blueprintMonthly = teamSubsModel * perSub;
    var blueprintDaily = (teamSubsModel / 20) * perSub;

    var progressHtml = '';
    if (options.teamAmbassadors != null || options.teamSubscribers != null) {
      progressHtml =
        '<div class="dos-card dos-charter-progress">' +
        '<h3><i class="fa-solid fa-chart-line"></i> Your team progress (live)</h3>' +
        '<div class="dos-charter-stat-row">' +
        (options.teamAmbassadors != null
          ? '<div><span class="dos-charter-stat-label">Team ambassadors</span>' +
            '<span class="dos-charter-stat-value">' + (Number(options.teamAmbassadors) || 0) +
            ' / ' + ambPerSenior + '</span></div>'
          : '') +
        (options.teamSubscribers != null
          ? '<div><span class="dos-charter-stat-label">Team subscribers (tracked)</span>' +
            '<span class="dos-charter-stat-value">' + (Number(options.teamSubscribers) || 0) + '</span></div>'
          : '') +
        (options.teamOverrideUsd != null
          ? '<div><span class="dos-charter-stat-label">Est. team override</span>' +
            '<span class="dos-charter-stat-value">' + fmtUsd(options.teamOverrideUsd) + '</span></div>'
          : '') +
        (options.seniorsRecruited != null
          ? '<div><span class="dos-charter-stat-label">Seniors recruited (RD path)</span>' +
            '<span class="dos-charter-stat-value">' + (Number(options.seniorsRecruited) || 0) +
            ' / ' + (d.promotion.rdSeniors || 50) + '</span></div>'
          : '') +
        '</div></div>';
    }

    mountEl.innerHTML =
      '<div class="dos-charter">' +
      '<div class="dos-card dos-charter-hero">' +
      '<h3><i class="fa-solid fa-book-open"></i> Senior Ambassador — Role &amp; targets</h3>' +
      '<p class="dos-charter-lead">You are a <strong>team deployment leader</strong> — scale recurring access through Ambassador duplication, not passive recruiting.</p>' +
      '<p class="dos-charter-muted">Supervise <strong>' + ambPerSenior + ' ambassadors</strong> · deploy via <strong>sbd-network.web.app</strong> · dashboard: <strong>marriageducation.com</strong>.</p>' +
      '<div class="dos-charter-actions">' +
      '<a class="dos-btn dos-btn-primary" href="' + DOC_BASE + 'SENIOR_AMBASSADOR.pdf" download><i class="fa-solid fa-file-pdf"></i> Download blueprint (PDF)</a>' +
      '<a class="dos-btn" href="' + DOC_BASE + 'SENIOR_AMBASSADOR.html" target="_blank" rel="noopener"><i class="fa-solid fa-book"></i> Read full charter</a>' +
      '</div></div>' +

      progressHtml +

      '<div class="dos-card">' +
      '<h3><i class="fa-solid fa-bullseye"></i> Team targets at a glance</h3>' +
      seniorTargetsTable(d) +
      '</div>' +

      '<div class="dos-charter-duo">' +
      '<div class="dos-card">' +
      '<h3><i class="fa-solid fa-coins"></i> Blueprint team economics</h3>' +
      '<p class="dos-charter-muted">Full team model — recurring retained team subscribers.</p>' +
      '<ul class="dos-charter-list">' +
      '<li><strong>' + teamSubsModel.toLocaleString() + '/month</strong> team subs × ' + fmtUsd(perSub) + ' = <strong>' + fmtUsd(blueprintMonthly) + '/month</strong></li>' +
      '<li>~<strong>' + Math.round(teamSubsModel / 20) + '/day</strong> team pace × ' + fmtUsd(perSub) + ' ≈ <strong>' + fmtUsd(blueprintDaily) + '/day</strong></li>' +
      '<li>Retention compounds team economics over time (2k → 4k → 10k+ retained)</li>' +
      '</ul></div>' +
      '<div class="dos-card">' +
      '<h3><i class="fa-solid fa-gauge-high"></i> Dashboard deployment target</h3>' +
      '<p class="dos-charter-muted">Overview monthly target (multi-product portfolio — separate from blueprint recurring above).</p>' +
      '<p class="dos-charter-stat-value" style="font-size:1.5rem;margin:8px 0">' + fmtUsd(d.seniorMonthlyTargetUsd) +
      '<span style="font-size:14px;font-weight:500;color:#71717a"> / month</span></p>' +
      '</div></div>' +

      '<div class="dos-card">' +
      '<h3><i class="fa-solid fa-percent"></i> Override &amp; product</h3>' +
      '<p><strong>' + overridePct + '%</strong> override on <strong>recurring retained</strong> team Foundation Access (' + fmtUsd(d.subscriptionMonthlyUsd) + '/mo). ' +
      'You still run personal deployment; Team command shows downline activity and overrides.</p>' +
      '</div>' +

      '<div class="dos-card">' +
      '<h3><i class="fa-solid fa-sun"></i> Daily senior operations</h3>' +
      '<div class="dos-charter-rhythm">' +
      '<div><strong>Team monitoring</strong><p>Activity, deployment numbers, growth, consistency.</p></div>' +
      '<div><strong>Leadership</strong><p>Support ambassadors, resolve ops issues, strengthen discipline.</p></div>' +
      '<div><strong>Expansion &amp; retention</strong><p>Grow outreach environments; monitor renewals and churn.</p></div>' +
      '</div></div>' +

      '<div class="dos-card">' +
      '<h3><i class="fa-solid fa-list-check"></i> Your responsibilities</h3>' +
      '<ol class="dos-charter-list">' +
      '<li><strong>Team building</strong> — recruit and duplicate ambassadors</li>' +
      '<li><strong>Supervision</strong> — monitor, coach, replace inactive ambassadors</li>' +
      '<li><strong>Deployment ops</strong> — improve team performance and growth</li>' +
      '<li><strong>Retention</strong> — renewals, engagement, recurring economics</li>' +
      '<li><strong>Leadership development</strong> — culture, duplication, future seniors</li>' +
      '</ol></div>' +

      '<div class="dos-card">' +
      '<h3><i class="fa-solid fa-arrow-up"></i> Promotion to Regional Director</h3>' +
      '<p class="dos-charter-lead">Build and sustain a <strong>fully operational deployment structure</strong>.</p>' +
      '<p class="dos-charter-muted">Dashboard tracks <strong>' + esc(d.promotion.rdSeniors) + ' seniors</strong> recruited toward RD eligibility.</p>' +
      '<button type="button" class="dos-btn dos-btn-primary" data-dos-nav="team"><i class="fa-solid fa-bolt"></i> Open Team command</button>' +
      '</div>' +

      '<div class="dos-card">' +
      '<h3><i class="fa-solid fa-map"></i> Where to work in this dashboard</h3>' +
      '<div class="dos-charter-nav-grid">' +
      navBtn('team', 'fa-bolt', 'Team command') +
      navBtn('daily-ops', 'fa-sun', 'Daily ops') +
      navBtn('subscribers', 'fa-user-group', 'Subscribers') +
      navBtn('retention', 'fa-heart-pulse', 'Retention') +
      navBtn('commissions', 'fa-coins', 'Commissions') +
      navBtn('network', 'fa-sitemap', 'Network') +
      navBtn('reporting', 'fa-file-export', 'Reports') +
      navBtn('formation', 'fa-graduation-cap', 'Formation') +
      '</div></div>' +

      '<div class="dos-card dos-charter-mandate">' +
      '<h3><i class="fa-solid fa-flag"></i> Final mandate</h3>' +
      '<p class="dos-charter-lead">Scale Marriage Foundation Access through disciplined team deployment, recurring retention, operational duplication, and continuous educational access expansion.</p>' +
      '</div></div>';

    bindSectionLinks(mountEl);
    mountEl.setAttribute('data-charter-built', '1');
  }

  global.DOSRoleCharter = {
    renderAmbassador: renderAmbassador,
    renderSenior: renderSenior,
    DOC_BASE: DOC_BASE
  };
})(typeof window !== 'undefined' ? window : global);
