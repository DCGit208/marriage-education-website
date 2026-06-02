/**
 * RD regional network — full-tree load for Deployment Operations System.
 * Queries all ambassadors tied to an RD (rdCode / regional_director_code / direct recruitedBy).
 */
(function (global) {
  'use strict';

  var SENIOR_RECRUIT_TARGET = (global.DOSConfig && global.DOSConfig.SENIOR_RECRUIT_TARGET) || 10;
  var RD_SENIOR_TARGET = (global.DOSRegion && global.DOSRegion.RD_SENIOR_TARGET) || 50;
  var NETWORK_CACHE_TTL_MS = 5 * 60 * 1000;
  var NETWORK_CACHE_PREFIX = 'dos_rd_network_v1_';

  function normCode(c) {
    return String(c || '').trim().toUpperCase();
  }

  function resolveRecruiterCode(d) {
    return normCode(
      d.recruitedBy ||
      d.recruited_by ||
      d.recruiter_code ||
      d.regional_director ||
      d.referral_code ||
      ''
    );
  }

  function memberUnits(d) {
    return Number(d.accessUnitsDeployed || d.sales_count || d.booksSold || d.units_deployed || 0);
  }

  function storedRecruitCount(d) {
    return Number(d.recruits_count != null ? d.recruits_count : d.directAmbassadorCount || 0);
  }

  function isSeniorType(d) {
    return String(d.ambassador_type || '').toLowerCase() === 'senior' ||
      String(d.ambassador_type || '').toLowerCase() === 'regional_director';
  }

  function normEmail(d) {
    return String((d && (d.email || d.contactEmail)) || '').trim().toLowerCase();
  }

  function normPhone(d) {
    return String((d && (d.phoneE164 || d.phone || d.phoneNumber)) || '').replace(/\D/g, '');
  }

  function normName(d) {
    return String((d && (d.fullName || d.name)) || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function memberScore(m) {
    var score = 0;
    if (String(m.id || '').indexOf('AMB-') === 0) score += 10000;
    score += (m.recruits || 0) * 100;
    score += (m.units || 0) * 10;
    if (String(m.data && m.data.status || '').toLowerCase() === 'active') score += 500;
    if (String(m.data && m.data.status || '').toLowerCase() === 'approved') score += 200;
    var created = m.data && m.data.createdAt;
    if (created && created.toDate) score += created.toDate().getTime() / 1e10;
    return score;
  }

  function dedupeKeyForMember(m) {
    var phone = normPhone(m.data);
    var personName = normName(m.data) || String(m.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (phone.length >= 8 && personName) return 'person:' + phone + '|' + personName;
    var email = normEmail(m.data);
    if (email) return 'email:' + email;
    if (phone.length >= 8) return 'phone:' + phone;
    if (personName) return 'name:' + personName;
    return 'id:' + m.id;
  }

  /** Collapse repeat signups (same email/phone) to one canonical ambassador per person. */
  function dedupeNetworkMembers(members) {
    var groups = {};
    members.forEach(function (m) {
      var key = dedupeKeyForMember(m);
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    });
    var unique = [];
    var duplicateRecordCount = 0;
    Object.keys(groups).forEach(function (key) {
      var group = groups[key];
      if (group.length === 1) {
        unique.push(group[0]);
        return;
      }
      duplicateRecordCount += group.length - 1;
      group.sort(function (a, b) { return memberScore(b) - memberScore(a); });
      unique.push(group[0]);
    });
    return { members: unique, duplicateRecordCount: duplicateRecordCount };
  }

  function classifyMember(docId, d, rdCode) {
    var rd = normCode(rdCode);
    var recruitedBy = resolveRecruiterCode(d);
    var seniorCode = normCode(d.senior_code || d.recruited_by_senior);
    var tier = 'under_ambassador';
    if (recruitedBy === rd) tier = 'direct_rd';
    else if (seniorCode === rd) tier = 'mislinked_senior_field';
    var senior = isSeniorType(d);
    return {
      id: docId,
      data: d,
      tier: tier,
      isSenior: senior,
      isDeveloping: false,
      recruits: 0,
      recruitsStored: storedRecruitCount(d),
      directRecruitList: [],
      units: memberUnits(d),
      sbdSubs: Number((d.sbdReferrals && d.sbdReferrals.subscribers) || 0),
      name: d.fullName || d.name || d.email || docId,
      recruitedBy: recruitedBy,
      seniorCode: seniorCode
    };
  }

  /** Count only activated AMB- recruits in this region (recruitedBy link), not inflated profile counters. */
  function attachRecruitmentGraph(members, rdCode) {
    var rd = normCode(rdCode);
    var byId = {};
    members.forEach(function (m) { byId[m.id] = m; });

    var children = {};
    members.forEach(function (m) {
      var parentId = normCode(m.recruitedBy);
      if (!parentId) return;
      if (parentId === rd || byId[parentId]) {
        if (!children[parentId]) children[parentId] = [];
        children[parentId].push(m);
      }
    });

    members.forEach(function (m) {
      var directs = children[m.id] || [];
      m.directRecruitList = directs.map(function (c) {
        return { id: c.id, name: c.name, email: c.data.email || '' };
      });
      m.recruits = directs.length;
      m.isDeveloping = !m.isSenior && m.recruits > 0 && m.recruits < SENIOR_RECRUIT_TARGET;
    });

    var recruiters = members.filter(function (m) { return m.recruits > 0; })
      .sort(function (a, b) { return b.recruits - a.recruits; });

    return { children: children, recruiters: recruiters, byId: byId };
  }

  function buildRdExcludeSet(rdCode, options) {
    options = options || {};
    var excludeIds = {};
    var excludeEmails = {};
    function addId(c) {
      var v = normCode(c);
      if (v) excludeIds[v] = true;
    }
    function addEmail(e) {
      var v = String(e || '').trim().toLowerCase();
      if (v) excludeEmails[v] = true;
    }
    addId(rdCode);
    addId(rdCode.replace(/^RD-/, 'AMB-'));
    (options.excludeIds || []).forEach(addId);
    (options.linkedAmbassadorCodes || []).forEach(addId);
    if (options.linkedAmbassadorCode) addId(options.linkedAmbassadorCode);
    addEmail(options.rdEmail);
    (options.excludeEmails || []).forEach(addEmail);
    return { ids: excludeIds, emails: excludeEmails };
  }

  /** Paid ambassadors use document id AMB-… and activated_at from payment flow. */
  function isActivatedAmbassador(docId, d) {
    if (!docId || docId.indexOf('AMB-') !== 0) return false;
    if (d.activated_at || d.activatedAt || d.activation_date || d.activatedOn) return true;
    var status = String(d.status || '').toLowerCase();
    return status === 'active' || status === 'approved';
  }

  function isRdSelfRecord(docId, d, rdCode, exclude) {
    if (!docId || !d) return false;
    if (d.is_rd_linked_account || d.rd_linked_account) return true;
    if (exclude.ids[normCode(docId)]) return true;
    var email = normEmail(d);
    if (email && exclude.emails[email]) return true;
    if (String(d.ambassador_type || '').toLowerCase() === 'regional_director') return true;
    var recruitedBy = resolveRecruiterCode(d);
    if (recruitedBy === normCode(rdCode) && email && exclude.emails[email]) return true;
    return false;
  }

  function plainFirestoreData(d) {
    if (!d || typeof d !== 'object') return d || {};
    var out = {};
    Object.keys(d).forEach(function (key) {
      var v = d[key];
      if (v && typeof v.toDate === 'function') {
        out[key] = v.toDate().toISOString();
      } else if (v && typeof v === 'object' && v.seconds != null) {
        out[key] = new Date(Number(v.seconds) * 1000).toISOString();
      } else {
        out[key] = v;
      }
    });
    return out;
  }

  function serializeMember(m) {
    return {
      id: m.id,
      data: plainFirestoreData(m.data),
      tier: m.tier,
      isSenior: m.isSenior,
      isDeveloping: m.isDeveloping,
      recruits: m.recruits,
      recruitsStored: m.recruitsStored,
      directRecruitList: (m.directRecruitList || []).slice(),
      units: m.units,
      sbdSubs: m.sbdSubs,
      name: m.name,
      recruitedBy: m.recruitedBy,
      seniorCode: m.seniorCode
    };
  }

  function cacheKey(rdCode) {
    return NETWORK_CACHE_PREFIX + normCode(rdCode);
  }

  function readNetworkCache(rdCode) {
    try {
      var raw = sessionStorage.getItem(cacheKey(rdCode));
      if (!raw) return null;
      var packed = JSON.parse(raw);
      if (!packed || !packed.cachedAt || !packed.rdCode) return null;
      if (Date.now() - packed.cachedAt > NETWORK_CACHE_TTL_MS) {
        sessionStorage.removeItem(cacheKey(rdCode));
        return null;
      }
      var members = (packed.members || []).map(function (m) {
        return {
          id: m.id,
          data: m.data || {},
          tier: m.tier,
          isSenior: !!m.isSenior,
          isDeveloping: !!m.isDeveloping,
          recruits: Number(m.recruits) || 0,
          recruitsStored: Number(m.recruitsStored) || 0,
          directRecruitList: m.directRecruitList || [],
          units: Number(m.units) || 0,
          sbdSubs: Number(m.sbdSubs) || 0,
          name: m.name,
          recruitedBy: m.recruitedBy,
          seniorCode: m.seniorCode
        };
      });
      var graph = attachRecruitmentGraph(members, packed.rdCode);
      return {
        rdCode: packed.rdCode,
        members: members,
        stats: packed.stats || emptyStats(),
        graph: graph,
        loadError: packed.loadError || null,
        fromCache: true,
        cachedAt: packed.cachedAt
      };
    } catch (e) {
      console.warn('[DOSRdNetwork] cache read failed', e);
      return null;
    }
  }

  function writeNetworkCache(rdCode, net) {
    try {
      var packed = {
        cachedAt: Date.now(),
        rdCode: net.rdCode,
        members: (net.members || []).map(serializeMember),
        stats: net.stats,
        loadError: net.loadError || null
      };
      sessionStorage.setItem(cacheKey(rdCode), JSON.stringify(packed));
    } catch (e) {
      console.warn('[DOSRdNetwork] cache write failed', e);
    }
  }

  function clearNetworkCache(rdCode) {
    try {
      if (rdCode) sessionStorage.removeItem(cacheKey(rdCode));
      else {
        Object.keys(sessionStorage).forEach(function (k) {
          if (k.indexOf(NETWORK_CACHE_PREFIX) === 0) sessionStorage.removeItem(k);
        });
      }
    } catch (e) { /* ignore */ }
  }

  async function loadRdNetworkCached(db, rdCode, options) {
    options = options || {};
    var rd = normCode(rdCode);
    if (!options.forceRefresh) {
      var cached = readNetworkCache(rd);
      if (cached) return cached;
    }
    var net = await loadRdNetwork(db, rd, options);
    if (!options.skipCache && net && !net.loadError) writeNetworkCache(rd, net);
    net.fromCache = false;
    net.cachedAt = Date.now();
    return net;
  }

  function countDescendants(id, children, byId) {
    var total = 0;
    (children[id] || []).forEach(function (c) {
      if (!byId[c.id]) return;
      total += 1 + countDescendants(c.id, children, byId);
    });
    return total;
  }

  function computeLeaderRollups(members, graph, rdCode) {
    var children = (graph && graph.children) || {};
    var byId = (graph && graph.byId) || {};
    var rd = normCode(rdCode);
    return members.filter(function (m) { return m.recruits > 0; }).map(function (m) {
      return {
        id: m.id,
        name: m.name,
        recruitedBy: normCode(m.recruitedBy) === rd ? 'You' : m.recruitedBy,
        recruits: m.recruits,
        units: m.units,
        downlineSize: countDescendants(m.id, children, byId),
        isSenior: !!m.isSenior,
        isDeveloping: !!m.isDeveloping
      };
    }).sort(function (a, b) {
      return (b.recruits - a.recruits) || (b.downlineSize - a.downlineSize) ||
        String(a.name).localeCompare(String(b.name));
    });
  }

  function csvEscape(val) {
    var s = String(val == null ? '' : val);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function downloadTextFile(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function memberRankLabel(m) {
    if (m.isSenior) return 'Senior';
    if (m.isDeveloping) return 'Developing';
    return 'Ambassador';
  }

  function exportMembersCsv(members, rdCode, rdName) {
    var code = normCode(rdCode) || 'region';
    var headers = [
      'ambassador_id', 'name', 'recruited_by', 'link_tier', 'direct_recruits',
      'units', 'sbd_subs', 'rank', 'regional_director', 'exported_at'
    ];
    var exportedAt = new Date().toISOString();
    var rows = members.map(function (m) {
      return [
        m.id,
        m.name,
        m.recruitedBy || '',
        m.tier === 'direct_rd' ? 'direct' : 'chain',
        m.recruits,
        m.units,
        m.sbdSubs,
        memberRankLabel(m),
        code,
        exportedAt
      ].map(csvEscape).join(',');
    });
    var csv = headers.join(',') + '\n' + rows.join('\n');
    var safeName = String(rdName || code).replace(/[^\w\-]+/g, '_').slice(0, 40);
    downloadTextFile('rd-network-' + safeName + '-' + code + '.csv', csv, 'text/csv;charset=utf-8');
  }

  function exportLeaderRollupsCsv(rollups, rdCode, rdName) {
    var code = normCode(rdCode) || 'region';
    var headers = [
      'leader_id', 'leader_name', 'recruited_by', 'direct_recruits',
      'total_downline', 'units', 'rank', 'regional_director', 'exported_at'
    ];
    var exportedAt = new Date().toISOString();
    var rows = (rollups || []).map(function (r) {
      var rank = r.isSenior ? 'Senior' : (r.isDeveloping ? 'Developing' : 'Ambassador');
      return [
        r.id, r.name, r.recruitedBy, r.recruits, r.downlineSize, r.units, rank, code, exportedAt
      ].map(csvEscape).join(',');
    });
    var csv = headers.join(',') + '\n' + rows.join('\n');
    var safeName = String(rdName || code).replace(/[^\w\-]+/g, '_').slice(0, 40);
    downloadTextFile('rd-leader-rollups-' + safeName + '-' + code + '.csv', csv, 'text/csv;charset=utf-8');
  }

  function formatCacheAge(cachedAt) {
    if (!cachedAt) return '';
    var sec = Math.max(0, Math.floor((Date.now() - cachedAt) / 1000));
    if (sec < 60) return sec + 's ago';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + ' min ago';
    return Math.floor(min / 60) + 'h ago';
  }

  async function loadRdNetwork(db, rdCode, options) {
    var rd = normCode(rdCode);
    if (!rd || rd.indexOf('RD-') !== 0) {
      return { rdCode: rd, members: [], stats: emptyStats() };
    }

    var exclude = buildRdExcludeSet(rd, options);
    var seen = {};
    var members = [];

    function addDoc(doc) {
      if (!doc || !doc.id) return;
      if (doc.exists === false) return;
      var id = doc.id;
      if (seen[id]) return;
      var d = doc.data();
      if (String(d.status || '').toLowerCase() === 'merged_duplicate') return;
      if (d.merged_into || d.mergedInto) return;
      if (d.is_form_intake_only) return;
      if (isRdSelfRecord(id, d, rd, exclude)) return;
      if (!isActivatedAmbassador(id, d)) return;
      var linked = normCode(d.rdCode) === rd ||
        normCode(d.regional_director_code) === rd ||
        resolveRecruiterCode(d) === rd ||
        normCode(d.senior_code) === rd;
      if (!linked) return;
      seen[id] = true;
      members.push(classifyMember(id, d, rd));
    }

    var queries = [
      db.collection('ambassadors').where('rdCode', '==', rd).get(),
      db.collection('ambassadors').where('regional_director_code', '==', rd).get(),
      db.collection('ambassadors').where('recruitedBy', '==', rd).get(),
      db.collection('ambassadors').where('recruited_by', '==', rd).get()
    ];

    var queryErrors = [];
    var snaps = await Promise.all(queries.map(function (q) {
      return q.catch(function (err) {
        console.error('[DOSRdNetwork] query failed', err);
        queryErrors.push(err.message || String(err));
        return { forEach: function () {}, empty: true, size: 0 };
      });
    }));

    if (queryErrors.length === queries.length) {
      return {
        rdCode: rd,
        members: [],
        stats: emptyStats(),
        loadError: 'Could not load ambassadors: ' + queryErrors[0] +
          '. Ask your admin to deploy Firestore rules (dos_metrics, ambassadors read).'
      };
    }

    snaps.forEach(function (snap) {
      if (!snap || !snap.forEach) return;
      snap.forEach(function (doc) { addDoc(doc); });
    });

    var rawRecordCount = members.length;
    var deduped = dedupeNetworkMembers(members);
    members = deduped.members;
    var graph = attachRecruitmentGraph(members, rd);
    var stats = computeNetworkStats(members, rd);
    stats.rawRecordCount = rawRecordCount;
    stats.duplicateRecordCount = deduped.duplicateRecordCount;
    stats.uniqueAmbassadors = members.length;
    stats.recruitmentLeaders = graph.recruiters.length;

    return {
      rdCode: rd,
      members: members,
      stats: stats,
      graph: graph,
      loadError: queryErrors.length ? queryErrors[0] : null
    };
  }

  function emptyStats() {
    return {
      totalAmbassadors: 0,
      directToRd: 0,
      underAmbassadors: 0,
      seniorCount: 0,
      developingCount: 0,
      activeDeveloping: 0,
      totalUnits: 0,
      totalSbdSubs: 0,
      seniorTarget: RD_SENIOR_TARGET,
      seniorPct: 0,
      avgRecruitsDeveloping: 0
    };
  }

  function computeNetworkStats(members, rdCode) {
    var stats = emptyStats();
    if (!members.length) return stats;

    members.forEach(function (m) {
      stats.totalAmbassadors++;
      stats.totalUnits += m.units;
      stats.totalSbdSubs += m.sbdSubs;
      if (m.tier === 'direct_rd') stats.directToRd++;
      else stats.underAmbassadors++;
      if (m.isSenior) stats.seniorCount++;
      if (m.isDeveloping) {
        stats.developingCount++;
        if (m.units > 0 || m.recruits > 0) stats.activeDeveloping++;
      }
    });

    stats.seniorPct = Math.min(100, Math.round((stats.seniorCount / stats.seniorTarget) * 100));
    if (stats.developingCount) {
      var sumR = members.filter(function (m) { return m.isDeveloping; })
        .reduce(function (s, m) { return s + m.recruits; }, 0);
      stats.avgRecruitsDeveloping = Math.round((sumR / stats.developingCount) * 10) / 10;
    }
    stats.rdCode = rdCode;
    return stats;
  }

  function mergeWithRegionStats(networkStats, regionStats) {
    regionStats = regionStats || {};
    return {
      seniorCount: Math.max(networkStats.seniorCount, regionStats.seniorCount || 0),
      totalAmbassadors: networkStats.totalAmbassadors,
      directToRd: networkStats.directToRd,
      underAmbassadors: networkStats.underAmbassadors,
      developingCount: networkStats.developingCount,
      activeDeveloping: networkStats.activeDeveloping,
      totalUnits: Math.max(networkStats.totalUnits, regionStats.totalUnits || 0),
      totalSbdSubs: networkStats.totalSbdSubs,
      networkOverrideUsd: regionStats.networkOverrideUsd || 0,
      networkOverrideXaf: regionStats.networkOverrideXaf || 0,
      activeSeniors: regionStats.activeSeniors || 0,
      inactiveSeniors: regionStats.inactiveSeniors || 0,
      seniorTarget: networkStats.seniorTarget,
      seniorPct: networkStats.seniorPct,
      avgRecruitsDeveloping: networkStats.avgRecruitsDeveloping
    };
  }

  function renderNetworkSummary(container, stats, rdDoc) {
    if (!container) return;
    var downline = (rdDoc && (rdDoc.downline_count || rdDoc.team_ambassadors)) || 0;
    var ledgerOverride = (rdDoc && rdDoc.network_override_earned) || 0;

    container.innerHTML =
      '<div class="dos-kpi-grid" style="margin-bottom:16px">' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Ambassadors in region</div><div class="dos-kpi-value">' +
      stats.totalAmbassadors + '</div><div class="dos-kpi-sub">' + stats.directToRd +
      ' direct · ' + stats.underAmbassadors + ' in chains' +
      (stats.duplicateRecordCount ? ' · ' + stats.duplicateRecordCount + ' duplicate signup(s) hidden' : '') +
      '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Senior ambassadors</div><div class="dos-kpi-value">' +
      stats.seniorCount + ' / ' + stats.seniorTarget + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Developing leaders</div><div class="dos-kpi-value">' +
      stats.developingCount + '</div><div class="dos-kpi-sub">Building toward Senior (' +
      SENIOR_RECRUIT_TARGET + ' recruits)</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Network units</div><div class="dos-kpi-value">' +
      stats.totalUnits + '</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">SBD subs (network)</div><div class="dos-kpi-value">' +
      stats.totalSbdSubs + '</div></div>' +
      (downline ? '<div class="dos-kpi"><div class="dos-kpi-label">RD ledger recruits</div><div class="dos-kpi-value">' +
      downline + '</div><div class="dos-kpi-sub">Direct recruitment counter</div></div>' : '') +
      '</div>' +
      (stats.developingCount ? (
        '<div class="dos-overview-hint" style="margin-bottom:14px">' +
        '<strong>' + stats.developingCount + ' ambassador(s)</strong> are actively building teams (' +
        stats.avgRecruitsDeveloping + ' avg recruits) but are not Senior yet — they appear below with progress.</div>'
      ) : '');
  }

  function renderNetworkList(container, members) {
    if (!container) return;
    if (!members.length) {
      container.innerHTML =
        '<div class="dos-empty">No ambassadors linked to your RD code yet. Share your <strong>Recruitment</strong> link ' +
        '(Deployment links) so new ambassadors get <code>rdCode</code> and <code>regional_director_code</code> on activation.</div>';
      return;
    }

    var sorted = members.slice().sort(function (a, b) {
      if (a.isSenior !== b.isSenior) return a.isSenior ? -1 : 1;
      if (a.tier === 'direct_rd' && b.tier !== 'direct_rd') return -1;
      if (b.tier === 'direct_rd' && a.tier !== 'direct_rd') return 1;
      return b.recruits - a.recruits;
    });

    container.innerHTML = '<div class="dos-table-wrap"><table class="dos-table"><thead><tr>' +
      '<th>Ambassador</th><th>Link</th><th>Recruits</th><th>Units</th><th>SBD subs</th><th>Status</th>' +
      '</tr></thead><tbody>' +
      sorted.map(function (m) {
        var linkLabel = m.tier === 'direct_rd' ? 'Direct to you' : ('Via ' + (m.recruitedBy || '—'));
        var status;
        if (m.isSenior) status = '<span style="color:#6c5ce7;font-weight:600">Senior</span>';
        else if (m.isDeveloping) {
          var pct = Math.min(100, Math.round((m.recruits / SENIOR_RECRUIT_TARGET) * 100));
          status = '<span style="color:#e17055;font-weight:600">Developing ' + m.recruits + '/' +
            SENIOR_RECRUIT_TARGET + ' (' + pct + '%)</span>';
        } else status = '<span style="color:#71717a">Ambassador</span>';
        var recruitNames = m.directRecruitList.length
          ? '<div style="font-size:11px;color:#52525b;margin-top:4px">' +
            m.directRecruitList.map(function (c) {
              return escapeHtml(c.name) + ' <code>' + escapeHtml(c.id) + '</code>';
            }).join('<br>') + '</div>'
          : '';
        var recruitCell = '<strong>' + m.recruits + '</strong>' + recruitNames;
        return '<tr><td><strong>' + escapeHtml(m.name) + '</strong><br><code style="font-size:11px">' +
          escapeHtml(m.id) + '</code></td><td style="font-size:12px">' + escapeHtml(linkLabel) +
          '</td><td>' + recruitCell + '</td><td>' + m.units + '</td><td>' + m.sbdSubs +
          '</td><td>' + status + '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /** Filter members for genealogy tree view: full | leaders | direct (root = RD or leader AMB). */
  function filterMembersByView(members, graph, rootCode, viewId) {
    var root = normCode(rootCode);
    var view = viewId || 'leaders';
    if (!members || !members.length) return [];
    if (view === 'full') return members.slice();

    var children = (graph && graph.children) || {};
    var byId = (graph && graph.byId) || {};

    if (view === 'direct') {
      return members.filter(function (m) { return normCode(m.recruitedBy) === root; });
    }

    var visible = {};
    function markSubtree(parentId) {
      (children[parentId] || []).forEach(function (m) {
        if (!byId[m.id]) return;
        visible[m.id] = true;
        markSubtree(m.id);
      });
    }
    function markPathToRoot(nodeId) {
      var m = byId[nodeId];
      if (!m) return;
      visible[nodeId] = true;
      var parent = normCode(m.recruitedBy);
      if (parent && parent !== root && byId[parent]) markPathToRoot(parent);
    }
    members.forEach(function (m) {
      if (m.recruits > 0 && !m.isPipeline) {
        markPathToRoot(m.id);
        markSubtree(m.id);
      }
    });
    return members.filter(function (m) { return visible[m.id]; });
  }

  function filterSubtreeMembers(allMembers, graph, rootCode) {
    var root = normCode(rootCode);
    var children = (graph && graph.children) || {};
    var byId = (graph && graph.byId) || {};
    var visible = {};
    function markDesc(id) {
      if (byId[id]) visible[id] = true;
      (children[id] || []).forEach(function (c) { markDesc(c.id); });
    }
    markDesc(root);
    return allMembers.filter(function (m) { return visible[m.id]; });
  }

  function isAmbassadorRegistrationPayment(d) {
    if (!d) return false;
    return d.type === 'ambassador' || d.product_id === 'ambassador-registration' ||
      !!(d.ambassador_code || d.ambassador_data);
  }

  function classifyPipelinePayment(docId, d) {
    var recruiter = normCode(
      d.regional_director || d.referral_code || d.recruiter_code ||
      (d.ambassador_data && (d.ambassador_data.recruitedBy || d.ambassador_data.recruited_by)) || ''
    );
    var name = (d.ambassador_data && (d.ambassador_data.fullName || d.ambassador_data.firstName ||
      d.ambassador_data.name)) || d.email || docId;
    return {
      id: 'PIPE-' + String(docId).replace(/[^\w-]/g, '_'),
      pipelineRef: docId,
      name: String(name).trim() || 'Pending signup',
      email: d.email || '',
      phone: d.phone || '',
      recruitedBy: recruiter,
      isPipeline: true,
      pipelineStatus: d.status || 'pending',
      recruits: 0,
      units: 0,
      sbdSubs: 0,
      isSenior: false,
      isDeveloping: false,
      tier: 'pipeline',
      data: d
    };
  }

  function isRecruiterInSubtree(recruiterCode, rootCode, graph) {
    var cur = normCode(recruiterCode);
    var root = normCode(rootCode);
    var byId = (graph && graph.byId) || {};
    var seen = {};
    while (cur && !seen[cur]) {
      seen[cur] = true;
      if (cur === root) return true;
      var m = byId[cur];
      cur = m ? normCode(m.recruitedBy) : '';
    }
    return false;
  }

  function mergePipelineGraph(members, graph, pipelineMembers, rootCode) {
    var byId = Object.assign({}, (graph && graph.byId) || {});
    var children = Object.assign({}, (graph && graph.children) || {});
    Object.keys(children).forEach(function (k) {
      children[k] = children[k].slice();
    });
    pipelineMembers.forEach(function (p) {
      byId[p.id] = p;
      var parent = normCode(p.recruitedBy);
      if (!parent) return;
      if (parent !== normCode(rootCode) && !byId[parent]) return;
      if (!children[parent]) children[parent] = [];
      if (!children[parent].some(function (c) { return c.id === p.id; })) {
        children[parent].push(p);
      }
    });
    return {
      children: children,
      byId: byId,
      recruiters: (graph && graph.recruiters) || []
    };
  }

  async function loadPipelineRecruits(db, options) {
    options = options || {};
    var rootCode = normCode(options.rootCode);
    var rdCode = normCode(options.rdCode);
    var scope = options.scope || 'leader';
    var graph = options.graph || { byId: {}, children: {} };
    var activatedCodes = options.activatedCodes || {};
    var pipeline = [];

    var snap;
    try {
      snap = await db.collection('pending_payments').where('status', '==', 'pending').limit(250).get();
    } catch (e) {
      snap = await db.collection('pending_payments').limit(250).get();
    }

    snap.forEach(function (doc) {
      var d = doc.data();
      if (String(d.status || '').toLowerCase() !== 'pending') return;
      if (!isAmbassadorRegistrationPayment(d)) return;
      var recruiter = normCode(
        d.regional_director || d.referral_code || d.recruiter_code ||
        (d.ambassador_data && (d.ambassador_data.recruitedBy || d.ambassador_data.recruited_by)) || ''
      );
      var paymentRd = normCode(d.rd_code || (d.ambassador_data && d.ambassador_data.rdCode) || '');
      var ambCode = normCode(d.ambassador_code || doc.id);
      if (activatedCodes[ambCode]) return;

      var inScope = false;
      if (scope === 'rd') {
        inScope = paymentRd === rdCode || recruiter === rdCode || isRecruiterInSubtree(recruiter, rdCode, graph);
      } else {
        inScope = recruiter === rootCode || isRecruiterInSubtree(recruiter, rootCode, graph);
      }
      if (!inScope) return;
      pipeline.push(classifyPipelinePayment(doc.id, d));
    });
    return pipeline;
  }

  function isActivatedRecruitData(d) {
    if (!d) return false;
    if (d.activated_at || d.activatedAt || d.activation_date || d.activatedOn) return true;
    var status = String(d.status || '').toLowerCase();
    return status === 'active' || status === 'approved';
  }

  function isDisplayableRecruitDoc(docId, d, loose) {
    if (!docId || docId.indexOf('AMB-') !== 0 || !d) return false;
    if (String(d.status || '').toLowerCase() === 'merged_duplicate') return false;
    if (d.merged_into || d.mergedInto || d.is_form_intake_only) return false;
    if (loose) return true;
    return isActivatedRecruitData(d);
  }

  function buildCodeVariants(leaderCode) {
    var rawCode = String(leaderCode || '').trim();
    var code = normCode(rawCode);
    var codeVariants = {};
    [rawCode, code, rawCode.toLowerCase()].forEach(function (v) {
      var key = String(v || '').trim();
      if (key) codeVariants[key] = true;
    });
    return { code: code, codeVariants: codeVariants };
  }

  function recruiterMatchesLeader(d, leaderCode, codeVariants) {
    var leader = normCode(leaderCode);
    var fields = [
      'recruitedBy', 'recruited_by', 'senior_code', 'recruited_by_senior',
      'recruiter_code', 'regional_director', 'sponsor_code', 'upline_code'
    ];
    for (var i = 0; i < fields.length; i++) {
      var v = normCode(d[fields[i]]);
      if (!v) continue;
      if (v === leader || codeVariants[v]) return true;
    }
    return false;
  }

  /** Scan all ambassadors in region and match recruiter fields client-side (Firestore index-safe fallback). */
  async function loadDirectRecruitsFromRegion(db, leaderCode, rdCode, options) {
    options = options || {};
    var leader = normCode(leaderCode);
    var rd = normCode(rdCode);
    if (!leader || rd.indexOf('RD-') !== 0) return [];
    var cv = buildCodeVariants(leaderCode);
    var byId = {};
    var queries = [
      db.collection('ambassadors').where('rdCode', '==', rd).get(),
      db.collection('ambassadors').where('regional_director_code', '==', rd).get()
    ];
    var snaps = await Promise.all(queries.map(function (q) {
      return q.catch(function () { return { forEach: function () {} }; });
    }));
    snaps.forEach(function (snap) {
      if (!snap || !snap.forEach) return;
      snap.forEach(function (doc) {
        if (!doc || !doc.id || doc.id === leader || byId[doc.id]) return;
        var d = doc.data();
        if (!isDisplayableRecruitDoc(doc.id, d, options.loose)) return;
        if (!recruiterMatchesLeader(d, leader, cv.codeVariants)) return;
        byId[doc.id] = { id: doc.id, data: d };
      });
    });
    return Object.keys(byId).map(function (k) { return byId[k]; });
  }

  /** Direct recruits of a leader (verified), across recruiter field variants. */
  async function loadDirectRecruits(db, leaderCode, options) {
    options = options || {};
    var cv = buildCodeVariants(leaderCode);
    var code = cv.code;
    if (!code) return [];
    var recruiterFields = [
      'recruitedBy',
      'recruited_by',
      'senior_code',
      'recruited_by_senior',
      'recruiter_code',
      'regional_director'
    ];
    var byId = {};
    function includeDoc(doc) {
      if (!doc || !doc.id || byId[doc.id]) return;
      var d = doc.data();
      if (!isDisplayableRecruitDoc(doc.id, d, options.loose)) return;
      byId[doc.id] = { id: doc.id, data: d };
    }
    var queries = [];
    recruiterFields.forEach(function (field) {
      Object.keys(cv.codeVariants).forEach(function (variant) {
        queries.push(
          db.collection('ambassadors').where(field, '==', variant).get()
            .catch(function () { return { forEach: function () {} }; })
        );
      });
    });
    var snaps = await Promise.all(queries);
    snaps.forEach(function (snap) {
      if (!snap || !snap.forEach) return;
      snap.forEach(includeDoc);
    });
    var results = Object.keys(byId).map(function (k) { return byId[k]; });
    if (!results.length && options.rdCode) {
      results = await loadDirectRecruitsFromRegion(db, leaderCode, options.rdCode, options);
    }
    return results;
  }

  function mergeDirectRecruitsIntoMembers(members, recruitDocs, leaderCode, rdCode) {
    var leader = normCode(leaderCode);
    var rd = normCode(rdCode);
    var seen = {};
    members.forEach(function (m) { seen[m.id] = true; });
    recruitDocs.forEach(function (r) {
      if (!r || !r.id || seen[r.id]) return;
      var m = classifyMember(r.id, r.data, rd || leader);
      if (normCode(m.recruitedBy) !== leader) {
        m.recruitedBy = leader;
      }
      members.push(m);
      seen[r.id] = true;
    });
  }

  function computeLeaderNetworkStats(members, leaderCode) {
    var leader = normCode(leaderCode);
    var direct = 0;
    var downline = members.length;
    var developing = 0;
    members.forEach(function (m) {
      if (normCode(m.recruitedBy) === leader) direct++;
      if (m.isDeveloping) developing++;
    });
    return {
      totalInOrg: downline,
      directRecruits: direct,
      developingCount: developing,
      pipelineCount: 0
    };
  }

  function renderLeaderNetworkSummary(container, stats, leaderName) {
    if (!container) return;
    container.innerHTML =
      '<div class="dos-kpi-grid" style="margin-bottom:16px">' +
      '<div class="dos-kpi"><div class="dos-kpi-label">In your organization</div><div class="dos-kpi-value">' +
      stats.totalInOrg + '</div><div class="dos-kpi-sub">' + stats.directRecruits + ' direct</div></div>' +
      '<div class="dos-kpi"><div class="dos-kpi-label">Developing leaders</div><div class="dos-kpi-value">' +
      stats.developingCount + '</div></div>' +
      (stats.pipelineCount ? '<div class="dos-kpi"><div class="dos-kpi-label">Onboarding (pending)</div><div class="dos-kpi-value">' +
      stats.pipelineCount + '</div><div class="dos-kpi-sub">Awaiting payment / approval</div></div>' : '') +
      '</div>';
  }

  async function loadLeaderNetwork(db, leaderCode, options) {
    options = options || {};
    var leader = normCode(leaderCode);
    if (!leader || leader.indexOf('AMB-') !== 0) {
      return { leaderCode: leader, members: [], graph: { children: {}, byId: {} }, loadError: 'Invalid leader code' };
    }

    var ambSnap = await db.collection('ambassadors').doc(leader).get();
    if (!ambSnap.exists) {
      return { leaderCode: leader, members: [], graph: { children: {}, byId: {} }, loadError: 'Ambassador record not found' };
    }
    var ambData = ambSnap.data();
    var rdCode = normCode(ambData.rdCode || ambData.regional_director_code || '');
    var regional = { members: [], graph: { children: {}, byId: {} }, loadError: null };

    if (rdCode && rdCode.indexOf('RD-') === 0) {
      var loader = loadRdNetworkCached || loadRdNetwork;
      regional = await loader(db, rdCode, options);
      if (regional.loadError && !regional.members.length) {
        return {
          leaderCode: leader,
          rdCode: rdCode,
          members: [],
          pipeline: [],
          graph: { children: {}, byId: {} },
          stats: computeLeaderNetworkStats([], leader),
          loadError: regional.loadError
        };
      }
    } else {
      regional.members = [];
      var visited = {};
      var discovered = {};
      var queue = [leader];
      discovered[leader] = true;
      while (queue.length) {
        var pid = queue.shift();
        if (visited[pid]) continue;
        visited[pid] = true;
        var qsnaps = await Promise.all([
          db.collection('ambassadors').where('recruitedBy', '==', pid).get(),
          db.collection('ambassadors').where('recruited_by', '==', pid).get(),
          db.collection('ambassadors').where('senior_code', '==', pid).get(),
          db.collection('ambassadors').where('recruited_by_senior', '==', pid).get(),
          db.collection('ambassadors').where('recruiter_code', '==', pid).get()
        ]);
        qsnaps.forEach(function (q) {
          q.forEach(function (doc) {
            if (!isActivatedAmbassador(doc.id, doc.data())) return;
            if (discovered[doc.id]) return;
            discovered[doc.id] = true;
            regional.members.push(classifyMember(doc.id, doc.data(), rdCode || leader));
            queue.push(doc.id);
          });
        });
      }
      regional.graph = attachRecruitmentGraph(regional.members, leader);
    }

    // RD regional query misses downline linked only via recruitedBy AMB-* — merge direct recruits.
    var directRecruitDocs = await loadDirectRecruits(db, leader, { rdCode: rdCode, loose: true });
    if (directRecruitDocs.length) {
      mergeDirectRecruitsIntoMembers(regional.members, directRecruitDocs, leader, rdCode);
    }
    regional.graph = attachRecruitmentGraph(regional.members, leader);

    var subtree = filterSubtreeMembers(regional.members, regional.graph, leader);
    if (!subtree.some(function (m) { return m.id === leader; })) {
      if (regional.graph.byId[leader]) {
        subtree.unshift(regional.graph.byId[leader]);
      } else {
        subtree.unshift(classifyMember(leader, ambData, rdCode || leader));
      }
    }

    var subGraph = attachRecruitmentGraph(subtree, leader);
    var activatedCodes = {};
    regional.members.forEach(function (m) { activatedCodes[m.id] = true; });
    activatedCodes[leader] = true;

    var pipeline = await loadPipelineRecruits(db, {
      rootCode: leader,
      rdCode: rdCode,
      scope: 'leader',
      graph: subGraph,
      activatedCodes: activatedCodes
    });

    var mergedGraph = mergePipelineGraph(subtree, subGraph, pipeline, leader);
    var stats = computeLeaderNetworkStats(subtree, leader);
    stats.pipelineCount = pipeline.length;

    return {
      leaderCode: leader,
      leaderName: ambData.fullName || ambData.name || leader,
      rdCode: rdCode,
      members: subtree,
      pipeline: pipeline,
      graph: mergedGraph,
      stats: stats,
      loadError: regional.loadError
    };
  }

  async function enrichRdNetworkWithPipeline(db, net) {
    if (!net || !net.rdCode) return net;
    var activatedCodes = {};
    (net.members || []).forEach(function (m) { activatedCodes[m.id] = true; });
    var pipeline = await loadPipelineRecruits(db, {
      rootCode: net.rdCode,
      rdCode: net.rdCode,
      scope: 'rd',
      graph: net.graph,
      activatedCodes: activatedCodes
    });
    net.pipeline = pipeline;
    net.graph = mergePipelineGraph(net.members, net.graph, pipeline, net.rdCode);
    if (net.stats) net.stats.pipelineCount = pipeline.length;
    return net;
  }

  function renderRdTeamNote(container) {
    if (!container) return;
    container.innerHTML =
      '<div class="dos-overview-hint">' +
      '<strong>Regional Directors</strong> develop <strong>Senior Ambassadors</strong>, not a personal “team” like Seniors do. ' +
      'Use <button type="button" class="dos-btn dos-btn-primary" data-dos-nav="network" style="margin:0 4px;padding:4px 10px;font-size:12px">Network</button> ' +
      'for your full regional tree and <button type="button" class="dos-btn dos-btn-primary" data-dos-nav="region" style="margin:0 4px;padding:4px 10px;font-size:12px">Regional command</button> ' +
      'to coach Seniors.</div>';
  }

  global.DOSRdNetwork = {
    SENIOR_RECRUIT_TARGET: SENIOR_RECRUIT_TARGET,
    NETWORK_CACHE_TTL_MS: NETWORK_CACHE_TTL_MS,
    normCode: normCode,
    loadRdNetwork: loadRdNetwork,
    loadRdNetworkCached: loadRdNetworkCached,
    clearNetworkCache: clearNetworkCache,
    readNetworkCache: readNetworkCache,
    formatCacheAge: formatCacheAge,
    computeLeaderRollups: computeLeaderRollups,
    exportMembersCsv: exportMembersCsv,
    exportLeaderRollupsCsv: exportLeaderRollupsCsv,
    dedupeNetworkMembers: dedupeNetworkMembers,
    computeNetworkStats: computeNetworkStats,
    mergeWithRegionStats: mergeWithRegionStats,
    renderNetworkSummary: renderNetworkSummary,
    renderNetworkList: renderNetworkList,
    filterMembersByView: filterMembersByView,
    filterSubtreeMembers: filterSubtreeMembers,
    loadLeaderNetwork: loadLeaderNetwork,
    loadDirectRecruits: loadDirectRecruits,
    mergeDirectRecruitsIntoMembers: mergeDirectRecruitsIntoMembers,
    loadPipelineRecruits: loadPipelineRecruits,
    mergePipelineGraph: mergePipelineGraph,
    enrichRdNetworkWithPipeline: enrichRdNetworkWithPipeline,
    renderLeaderNetworkSummary: renderLeaderNetworkSummary,
    attachRecruitmentGraph: attachRecruitmentGraph,
    renderRdTeamNote: renderRdTeamNote
  };
})(typeof window !== 'undefined' ? window : global);
