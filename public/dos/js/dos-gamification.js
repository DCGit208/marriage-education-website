/**
 * DOS §11 — Gamification: contest, revenue stacks, elite badges (Phase 7).
 */
(function (global) {
  'use strict';

  var BOOK_TIERS = [
    { id: 'bronze', label: 'Books 1–20 (Bronze)', perBook: 3, start: 1, end: 20, icon: '🥉' },
    { id: 'silver', label: 'Books 21–40 (Silver)', perBook: 3, start: 21, end: 40, icon: '🥈' },
    { id: 'gold', label: 'Books 41–60 (Gold)', perBook: 3, start: 41, end: 60, icon: '🥇' },
    { id: 'bonus', label: 'Completion bonus @ 60', flat: 17, start: 60, end: 60, icon: '🎁' }
  ];

  var REVENUE_STACK_KEYS = [
    { key: 'accessDeployment', label: 'Access deployment', icon: 'fa-solid fa-book' },
    { key: 'pathwayActivation', label: 'Pathway activation', icon: 'fa-solid fa-route' },
    { key: 'shopSubscriptions', label: 'Shop subscriptions', icon: 'fa-solid fa-cart-shopping' },
    { key: 'serviceRouting', label: 'Service routing', icon: 'fa-solid fa-handshake' },
    { key: 'trainingCredits', label: 'Training credits', icon: 'fa-solid fa-graduation-cap' }
  ];

  function fmtUsd(amount, opts) {
    return global.MEMoney ? global.MEMoney.formatStoredAsUSD(amount, opts) : '$' + amount;
  }

  function bookTierState(units) {
    var u = Number(units) || 0;
    return BOOK_TIERS.map(function (tier) {
      if (tier.flat) {
        var done = u >= 60;
        return { tier: tier, earned: done ? tier.flat : 0, status: done ? 'completed' : 'locked', progress: done ? '60/60' : u + '/60' };
      }
      var inTier = Math.max(0, Math.min(tier.end, u) - (tier.start - 1));
      var maxInTier = tier.end - tier.start + 1;
      var complete = u >= tier.end;
      var active = u >= tier.start - 1 && u < tier.end;
      var earned = inTier * tier.perBook;
      var status = complete ? 'completed' : (active ? 'active' : 'locked');
      return {
        tier: tier,
        earned: earned,
        status: status,
        progress: Math.min(inTier, maxInTier) + '/' + maxInTier
      };
    });
  }

  function renderRevenueStacks(container, stats) {
    if (!container) return;
    var stacks = stats.revenueStacks || stats.revenue_stacks || {};
    var cats = stats.revenue_by_category || {};
    if (!Object.keys(stacks).length && Object.keys(cats).length) {
      stacks = {
        accessDeployment: cats.books || 0,
        pathwayActivation: cats.courses || 0,
        shopSubscriptions: cats.premium || 0,
        serviceRouting: cats.corporate || 0,
        trainingCredits: cats.schools || 0
      };
    }
    var total = REVENUE_STACK_KEYS.reduce(function (s, k) { return s + (Number(stacks[k.key]) || 0); }, 0);
    var units = stats.accessUnitsDeployed || stats.sales_count || stats.booksSold || 0;
    var tiers = bookTierState(units);

    var stackRows = REVENUE_STACK_KEYS.map(function (k) {
      var val = Number(stacks[k.key]) || 0;
      var pct = total ? Math.round((val / total) * 100) : 0;
      return '<div class="dos-revenue-stack-row">' +
        '<div><i class="' + k.icon + '"></i> <strong>' + k.label + '</strong></div>' +
        '<div>' + fmtUsd(val) + ' <span style="color:#71717a;font-size:12px">(' + pct + '%)</span></div></div>';
    }).join('');

    var tierRows = tiers.map(function (t) {
      var cls = 'dos-tier-' + t.status;
      var sym = t.status === 'completed' ? '✅' : (t.status === 'active' ? '⏳' : '🔒');
      return '<div class="dos-tier-row ' + cls + '">' +
        '<div><span style="font-size:1.25rem">' + t.tier.icon + '</span> <strong>' + t.tier.label + '</strong><br>' +
        '<span style="font-size:12px;color:#71717a">' + t.progress + '</span></div>' +
        '<div><strong>' + fmtUsd(t.earned, { alreadyUsd: !!t.tier.flat }) + '</strong> ' + sym + '</div></div>';
    }).join('');

    var potential = tiers.reduce(function (s, t) { return s + (t.tier.flat || (t.tier.end - t.tier.start + 1) * t.tier.perBook); }, 0);

    container.innerHTML =
      '<div class="dos-card"><h3><i class="fa-solid fa-layer-group"></i> Revenue stacks (5 income streams)</h3>' +
      stackRows +
      '<div class="dos-kpi" style="margin-top:16px"><div class="dos-kpi-label">Total across stacks</div>' +
      '<div class="dos-kpi-value">' + fmtUsd(total) + '</div></div></div>' +
      '<div class="dos-card"><h3><i class="fa-solid fa-book"></i> Book deployment tiers</h3>' +
      tierRows +
      '<p style="font-size:13px;color:#71717a;margin-top:12px">Full potential at 60 units: <strong>' + fmtUsd(potential, { alreadyUsd: true }) + '</strong></p></div>';
  }

  function renderEliteBadges(container, stats, metrics) {
    if (!container) return;
    var units = (metrics && metrics.deployment && metrics.deployment.unitsDeployed) ||
      stats.accessUnitsDeployed || stats.sales_count || 0;
    var recruits = (metrics && metrics.network && metrics.network.recruits) || stats.recruits_count || 0;
    var crla = stats.credentialStatus === 'earned';
    var badges = [
      { id: 'ops_starter', label: 'Ops Starter', earned: units >= 1, desc: 'First unit deployed' },
      { id: 'ops_bronze', label: 'Bronze Operator', earned: units >= 50, desc: '50 units' },
      { id: 'ops_silver', label: 'Silver Operator', earned: units >= 150, desc: '150 units' },
      { id: 'ops_gold', label: 'Gold Operator', earned: units >= 300, desc: '300 units' },
      { id: 'ops_platinum', label: 'Platinum Operator', earned: units >= 500, desc: '500 units' },
      { id: 'network_builder', label: 'Network Builder', earned: recruits >= 5, desc: '5+ recruits' },
      { id: 'crla', label: 'CRLA Certified', earned: crla, desc: 'Formation complete' }
    ];
    container.innerHTML = '<div class="dos-card"><h3><i class="fa-solid fa-medal"></i> Elite ops badges</h3>' +
      '<div class="dos-badge-grid">' + badges.map(function (b) {
        return '<div class="dos-badge-chip ' + (b.earned ? 'earned' : 'locked') + '">' +
          '<strong>' + b.label + '</strong><br><span style="font-size:11px">' + b.desc + '</span></div>';
      }).join('') + '</div></div>';
  }

  async function renderContestFull(container, db, userCode) {
    if (!container || !db) return;
    container.innerHTML = '<div class="dos-empty">Loading contest…</div>';
    try {
      var snap = await db.collection('ambassadors')
        .where('status', 'in', ['active', 'approved'])
        .orderBy('sales_count', 'desc')
        .limit(8)
        .get();
      var leaders = [];
      snap.forEach(function (doc, i) {
        var d = doc.data();
        leaders.push({
          rank: i + 1,
          code: doc.id,
          name: d.fullName || d.name || doc.id,
          units: d.sales_count || d.accessUnitsDeployed || 0,
          isYou: doc.id === userCode
        });
      });
      var bonus = global.MEMoney ? global.MEMoney.formatUSD(global.MEMoney.TARGETS.contestBonusUsd) : '$17';
      var rows = leaders.length ? leaders.map(function (l) {
        return '<div class="dos-contest-row' + (l.isYou ? ' highlight' : '') + '">' +
          '<span>#' + l.rank + '</span><span>' + l.name + '</span><span>' + l.units + ' units</span></div>';
      }).join('') : '<div class="dos-empty">No leaderboard data yet.</div>';

      container.innerHTML =
        '<div class="dos-contest-banner" style="margin:0">' +
        '<div class="dos-contest-head">' +
        '<div style="font-size:1.75rem"><i class="fa-solid fa-trophy"></i></div>' +
        '<div><h4>Weekly Impact Leader</h4>' +
        '<p style="margin:0;font-size:13px">Top deployers win <strong>' + bonus + '</strong> + featured story</p></div>' +
        '<div class="dos-contest-countdown"><span>Ends in</span><strong id="dosContestCountdownFull">—</strong></div></div>' +
        '<div class="dos-contest-leaders">' + rows + '</div>' +
        '<a class="dos-btn" href="../ambassador/leaderboard.html" style="margin-top:12px"><i class="fa-solid fa-trophy"></i> Full leaderboard</a></div>';

      startContestCountdown(document.getElementById('dosContestCountdownFull'));
    } catch (e) {
      container.innerHTML = '<div class="dos-empty">Contest data unavailable.</div>';
    }
  }

  function startContestCountdown(el) {
    if (!el) return;
    function tick() {
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
      el.textContent = d + 'd ' + h + 'h ' + m + 'm';
    }
    tick();
    setInterval(tick, 60000);
  }

  global.DOSGamification = {
    renderRevenueStacks: renderRevenueStacks,
    renderEliteBadges: renderEliteBadges,
    renderContestFull: renderContestFull,
    startContestCountdown: startContestCountdown
  };
})(typeof window !== 'undefined' ? window : global);
