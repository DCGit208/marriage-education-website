/**
 * RD Network explorer (Scale 2–3) — search, rollups, exports, open in tree.
 */
(function (global) {
  'use strict';

  var SENIOR_TARGET = (global.DOSConfig && global.DOSConfig.SENIOR_RECRUIT_TARGET) ||
    (global.DOSRdNetwork && global.DOSRdNetwork.SENIOR_RECRUIT_TARGET) || 10;

  function normCode(c) {
    if (global.DOSRdNetwork && global.DOSRdNetwork.normCode) return global.DOSRdNetwork.normCode(c);
    return String(c || '').trim().toUpperCase();
  }

  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function rankLabel(m) {
    if (m.isSenior) return 'Senior';
    if (m.isDeveloping) return 'Developing';
    return 'Ambassador';
  }

  function rankSortKey(m) {
    if (m.isSenior) return 0;
    if (m.isDeveloping) return 1;
    return 2;
  }

  function filterMembers(members, rdCode, filterId, query) {
    var rd = normCode(rdCode);
    var q = String(query || '').trim().toLowerCase();
    return members.filter(function (m) {
      if (filterId === 'direct' && normCode(m.recruitedBy) !== rd) return false;
      if (filterId === 'leaders' && !(m.recruits > 0)) return false;
      if (filterId === 'senior' && !m.isSenior) return false;
      if (filterId === 'developing' && !m.isDeveloping) return false;
      if (q) {
        var hay = (m.name + ' ' + m.id + ' ' + (m.recruitedBy || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function sortMembers(list, sortId) {
    var sorted = list.slice();
    if (sortId === 'name') {
      sorted.sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id));
      });
    } else if (sortId === 'units') {
      sorted.sort(function (a, b) {
        return (b.units - a.units) || (b.recruits - a.recruits) || String(a.name).localeCompare(String(b.name));
      });
    } else if (sortId === 'rank') {
      sorted.sort(function (a, b) {
        var r = rankSortKey(a) - rankSortKey(b);
        if (r) return r;
        return (b.recruits - a.recruits) || String(a.name).localeCompare(String(b.name));
      });
    } else {
      sorted.sort(function (a, b) {
        if (a.isSenior !== b.isSenior) return a.isSenior ? -1 : 1;
        if (a.tier === 'direct_rd' && b.tier !== 'direct_rd') return -1;
        if (b.tier === 'direct_rd' && a.tier !== 'direct_rd') return 1;
        return (b.recruits - a.recruits) || String(a.name).localeCompare(String(b.name));
      });
    }
    return sorted;
  }

  function recruiterLabel(m, rdCode) {
    var parent = normCode(m.recruitedBy);
    if (!parent || parent === normCode(rdCode)) return 'You';
    return parent;
  }

  function renderRows(members, rdCode) {
    if (!members.length) {
      return '<tr><td colspan="7" class="dos-net-explorer-empty">No ambassadors match your search or filter.</td></tr>';
    }
    return members.map(function (m) {
      var rank = rankLabel(m);
      var rankClass = m.isSenior ? 'is-senior' : (m.isDeveloping ? 'is-developing' : 'is-amb');
      var progress = '';
      if (m.isDeveloping && !m.isSenior) {
        progress = ' <span class="dos-net-explorer-progress">' + m.recruits + '/' + SENIOR_TARGET + '</span>';
      }
      var linkLabel = m.tier === 'direct_rd' ? 'Direct' : 'Chain';
      return '<tr data-member-id="' + escapeHtml(m.id) + '">' +
        '<td class="dos-net-explorer-name" data-label="Ambassador">' +
        '<strong>' + escapeHtml(m.name) + '</strong>' +
        '<code>' + escapeHtml(m.id) + '</code></td>' +
        '<td data-label="Link"><span class="dos-net-explorer-pill">' + escapeHtml(linkLabel) + '</span></td>' +
        '<td data-label="Recruited by"><code>' + escapeHtml(recruiterLabel(m, rdCode)) + '</code></td>' +
        '<td data-label="Recruits"><strong>' + m.recruits + '</strong></td>' +
        '<td data-label="Units">' + m.units + '</td>' +
        '<td data-label="Rank"><span class="dos-net-explorer-rank ' + rankClass + '">' + rank + progress + '</span></td>' +
        '<td class="dos-net-explorer-actions" data-label="">' +
        '<button type="button" class="dos-net-explorer-tree-btn" data-open-tree="' + escapeHtml(m.id) + '">' +
        '<i class="fa-solid fa-sitemap" aria-hidden="true"></i> Open in tree</button></td></tr>';
    }).join('');
  }

  function renderCards(members, rdCode) {
    if (!members.length) {
      return '<p class="dos-net-explorer-empty">No ambassadors match your search or filter.</p>';
    }
    return members.map(function (m) {
      var rank = rankLabel(m);
      return '<article class="dos-net-explorer-card" data-member-id="' + escapeHtml(m.id) + '">' +
        '<div class="dos-net-explorer-card-head">' +
        '<div><strong>' + escapeHtml(m.name) + '</strong><code>' + escapeHtml(m.id) + '</code></div>' +
        '<span class="dos-net-explorer-rank ' + (m.isSenior ? 'is-senior' : (m.isDeveloping ? 'is-developing' : 'is-amb')) + '">' +
        rank + '</span></div>' +
        '<dl class="dos-net-explorer-card-meta">' +
        '<div><dt>Recruited by</dt><dd><code>' + escapeHtml(recruiterLabel(m, rdCode)) + '</code></dd></div>' +
        '<div><dt>Recruits</dt><dd><strong>' + m.recruits + '</strong></dd></div>' +
        '<div><dt>Units</dt><dd>' + m.units + '</dd></div>' +
        '</dl>' +
        '<button type="button" class="dos-net-explorer-tree-btn" data-open-tree="' + escapeHtml(m.id) + '">' +
        '<i class="fa-solid fa-sitemap" aria-hidden="true"></i> Open in tree</button></article>';
    }).join('');
  }

  function readState(container) {
    return {
      query: (container.querySelector('.dos-net-explorer-search') || {}).value || '',
      filter: (container.querySelector('.dos-net-explorer-filter') || {}).value || 'all',
      sort: (container.querySelector('.dos-net-explorer-sort') || {}).value || 'recruits'
    };
  }

  function renderRollupRows(rollups, rdCode) {
    if (!rollups.length) {
      return '<tr><td colspan="6" class="dos-net-explorer-empty">No recruitment leaders yet.</td></tr>';
    }
    return rollups.map(function (r) {
      var rank = r.isSenior ? 'Senior' : (r.isDeveloping ? 'Developing' : 'Ambassador');
      var rankClass = r.isSenior ? 'is-senior' : (r.isDeveloping ? 'is-developing' : 'is-amb');
      return '<tr>' +
        '<td class="dos-net-explorer-name"><strong>' + escapeHtml(r.name) + '</strong>' +
        '<code>' + escapeHtml(r.id) + '</code></td>' +
        '<td><code>' + escapeHtml(r.recruitedBy) + '</code></td>' +
        '<td><strong>' + r.recruits + '</strong></td>' +
        '<td><strong>' + r.downlineSize + '</strong></td>' +
        '<td>' + r.units + '</td>' +
        '<td><span class="dos-net-explorer-rank ' + rankClass + '">' + rank + '</span> ' +
        '<button type="button" class="dos-net-explorer-tree-btn dos-net-explorer-tree-btn--sm" data-open-tree="' +
        escapeHtml(r.id) + '">Tree</button></td></tr>';
    }).join('');
  }

  function paint(container, members, rdCode) {
    var state = readState(container);
    var filtered = filterMembers(members, rdCode, state.filter, state.query);
    var sorted = sortMembers(filtered, state.sort);
    var countEl = container.querySelector('.dos-net-explorer-count');
    if (countEl) {
      countEl.textContent = sorted.length + ' of ' + members.length + ' ambassador' +
        (members.length === 1 ? '' : 's');
    }
    var tbody = container.querySelector('.dos-net-explorer-tbody');
    if (tbody) tbody.innerHTML = renderRows(sorted, rdCode);
    var cards = container.querySelector('.dos-net-explorer-cards');
    if (cards) cards.innerHTML = renderCards(sorted, rdCode);
    var rollupBody = container.querySelector('.dos-net-explorer-rollup-tbody');
    if (rollupBody && container._dosExplorerRollups) {
      rollupBody.innerHTML = renderRollupRows(container._dosExplorerRollups, rdCode);
    }
  }

  function updateCacheBadge(container, options) {
    var el = container.querySelector('.dos-net-explorer-cache');
    if (!el || !global.DOSRdNetwork) return;
    var age = '';
    if (options.fromCache && options.cachedAt) {
      age = global.DOSRdNetwork.formatCacheAge(options.cachedAt);
      el.textContent = 'Cached · refreshed ' + age;
      el.hidden = false;
    } else if (options.cachedAt) {
      el.textContent = 'Live data · just now';
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  function render(container, members, options) {
    if (!container) return;
    options = options || {};
    var rdCode = options.rdCode || '';
    var rdName = options.rdName || rdCode;
    var graph = options.graph || null;
    var allMembers = members || [];
    var rollups = [];
    if (global.DOSRdNetwork && global.DOSRdNetwork.computeLeaderRollups) {
      rollups = global.DOSRdNetwork.computeLeaderRollups(allMembers, graph, rdCode);
    }

    if (!allMembers.length) {
      container.innerHTML =
        '<div class="dos-empty">No ambassadors linked to your RD code yet. Share your <strong>Recruitment</strong> link ' +
        'so new ambassadors get <code>rdCode</code> on activation.</div>';
      return;
    }

    container.innerHTML =
      '<div class="dos-net-explorer">' +
      '<div class="dos-net-explorer-head">' +
      '<div class="dos-net-explorer-head-row">' +
      '<div><h4><i class="fa-solid fa-list-ul" aria-hidden="true"></i> Network explorer</h4>' +
      '<p>Search your region · exports for coaching reports</p></div>' +
      '<span class="dos-net-explorer-cache" hidden aria-live="polite"></span></div>' +
      '<div class="dos-net-explorer-exports">' +
      '<button type="button" class="dos-net-explorer-export-btn" data-export="csv-members">' +
      '<i class="fa-solid fa-file-csv" aria-hidden="true"></i> CSV — all</button>' +
      '<button type="button" class="dos-net-explorer-export-btn" data-export="csv-leaders">' +
      '<i class="fa-solid fa-file-csv" aria-hidden="true"></i> CSV — leaders</button>' +
      '<button type="button" class="dos-net-explorer-export-btn" data-export="png-tree">' +
      '<i class="fa-solid fa-image" aria-hidden="true"></i> PNG — tree</button>' +
      '<button type="button" class="dos-net-explorer-export-btn dos-net-explorer-export-btn--muted" data-export="refresh">' +
      '<i class="fa-solid fa-rotate" aria-hidden="true"></i> Refresh data</button></div></div>' +
      (rollups.length ? (
        '<details class="dos-net-explorer-rollups" open>' +
        '<summary>Leader rollups <em>(' + rollups.length + ')</em></summary>' +
        '<p class="dos-net-explorer-rollups-sub">Direct recruits and total verified downline per recruitment leader.</p>' +
        '<div class="dos-net-explorer-table-wrap dos-table-wrap">' +
        '<table class="dos-table dos-net-explorer-rollup-table"><thead><tr>' +
        '<th>Leader</th><th>Recruited by</th><th>Direct</th><th>Downline</th><th>Units</th><th></th>' +
        '</tr></thead><tbody class="dos-net-explorer-rollup-tbody"></tbody></table></div></details>'
      ) : '') +
      '<div class="dos-net-explorer-tools">' +
      '<label class="dos-net-explorer-search-wrap">' +
      '<span class="visually-hidden">Search ambassadors</span>' +
      '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>' +
      '<input type="search" class="dos-net-explorer-search" placeholder="Name or AMB- code" autocomplete="off">' +
      '</label>' +
      '<label class="dos-net-explorer-field"><span>Filter</span>' +
      '<select class="dos-net-explorer-filter" aria-label="Filter list">' +
      '<option value="all">All ambassadors</option>' +
      '<option value="direct">Direct to me</option>' +
      '<option value="leaders">Leaders (has recruits)</option>' +
      '<option value="senior">Senior only</option>' +
      '<option value="developing">Developing only</option>' +
      '</select></label>' +
      '<label class="dos-net-explorer-field"><span>Sort</span>' +
      '<select class="dos-net-explorer-sort" aria-label="Sort list">' +
      '<option value="recruits">Recruits (high first)</option>' +
      '<option value="name">Name A–Z</option>' +
      '<option value="units">Units (high first)</option>' +
      '<option value="rank">Rank</option>' +
      '</select></label>' +
      '<span class="dos-net-explorer-count" aria-live="polite"></span></div>' +
      '<div class="dos-net-explorer-table-wrap dos-net-explorer-list-table-wrap dos-table-wrap">' +
      '<table class="dos-table dos-net-explorer-table"><thead><tr>' +
      '<th>Ambassador</th><th>Link</th><th>Recruited by</th><th>Recruits</th><th>Units</th><th>Rank</th><th></th>' +
      '</tr></thead><tbody class="dos-net-explorer-tbody"></tbody></table></div>' +
      '<div class="dos-net-explorer-cards" aria-label="Ambassador list"></div></div>';

    container._dosExplorerMembers = allMembers;
    container._dosExplorerRdCode = rdCode;
    container._dosExplorerRdName = rdName;
    container._dosExplorerRollups = rollups;
    container._dosExplorerOptions = options;

    if (container._dosExplorerClick) {
      container.removeEventListener('click', container._dosExplorerClick);
    }
    if (container._dosExplorerInput) {
      container.removeEventListener('input', container._dosExplorerInput);
      container.removeEventListener('change', container._dosExplorerInput);
    }

    container._dosExplorerClick = function (ev) {
      var exportBtn = ev.target.closest('[data-export]');
      if (exportBtn) {
        ev.preventDefault();
        var kind = exportBtn.getAttribute('data-export');
        if (kind === 'csv-members' && global.DOSRdNetwork) {
          global.DOSRdNetwork.exportMembersCsv(
            container._dosExplorerMembers, rdCode, container._dosExplorerRdName);
        } else if (kind === 'csv-leaders' && global.DOSRdNetwork) {
          global.DOSRdNetwork.exportLeaderRollupsCsv(
            container._dosExplorerRollups, rdCode, container._dosExplorerRdName);
        } else if (kind === 'png-tree' && global.DOSRdNetworkTree && global.DOSRdNetworkTree.exportDiagramPng) {
          global.DOSRdNetworkTree.exportDiagramPng(exportBtn);
        } else if (kind === 'refresh' && typeof options.onRefresh === 'function') {
          options.onRefresh();
        }
        return;
      }
      var btn = ev.target.closest('[data-open-tree]');
      if (!btn) return;
      ev.preventDefault();
      var id = btn.getAttribute('data-open-tree');
      if (global.DOSRdNetworkTree && global.DOSRdNetworkTree.openAmbassadorInTree) {
        global.DOSRdNetworkTree.openAmbassadorInTree(id);
      } else if (global.DOSRdNetworkTree && global.DOSRdNetworkTree.focusSubtree) {
        global.DOSRdNetworkTree.focusSubtree(id);
      }
    };

    container._dosExplorerInput = function () {
      paint(container, container._dosExplorerMembers, container._dosExplorerRdCode);
    };

    container.addEventListener('click', container._dosExplorerClick);
    container.addEventListener('input', container._dosExplorerInput);
    container.addEventListener('change', container._dosExplorerInput);

    updateCacheBadge(container, options);
    paint(container, allMembers, rdCode);
  }

  global.DOSRdNetworkExplorer = { render: render };
})(typeof window !== 'undefined' ? window : global);
