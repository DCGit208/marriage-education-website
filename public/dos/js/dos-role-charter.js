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
      ambassadorMonthlyTargetUsd: 3000,
      dailyTargets: { newSubscribers: 10 },
      promotion: { seniorRecruits: 10 }
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

  global.DOSRoleCharter = {
    renderAmbassador: renderAmbassador,
    DOC_BASE: DOC_BASE
  };
})(typeof window !== 'undefined' ? window : global);
