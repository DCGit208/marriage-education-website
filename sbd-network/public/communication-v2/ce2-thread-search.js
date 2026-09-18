/**
 * CE2 in-thread search — word / person / day, bounded to the open conversation.
 * Does not scan other threads or the inbox.
 */
(function (global) {
  'use strict';

  var VERSION = 1;
  var MAX_HITS = 40;
  var PAGE_SIZE = 80;
  var DATE_PAGE_SIZE = 120;
  var MAX_SCAN = 480;
  var DATE_MAX_SCAN = 240;
  var DEBOUNCE_MS = 280;
  var SNIPPET_LEN = 88;
  var SEARCH_FIELD_IDS = [
    'ce2ThreadSearchInput',
    'ce2ThreadSearchPerson',
    'ce2ThreadSearchDay',
  ];

  var deps = null;
  var searchTimer = 0;
  var searchGen = 0;
  var wired = false;

  function el(id) {
    return deps && deps.el ? deps.el(id) : document.getElementById(id);
  }

  function state() {
    return deps && deps.getState ? deps.getState() : null;
  }

  function createdAtMs(ts) {
    if (ts == null || ts === '') return 0;
    if (deps && deps.messageTimeMs) {
      var fromDep = deps.messageTimeMs({ createdAt: ts });
      if (fromDep) return fromDep;
    }
    try {
      if (typeof ts.toMillis === 'function') return ts.toMillis();
      if (typeof ts.toDate === 'function') return ts.toDate().getTime();
      if (typeof ts.seconds === 'number') {
        return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
      }
      if (ts instanceof Date) return ts.getTime();
      if (typeof ts === 'number' && isFinite(ts)) {
        return ts < 1e12 ? ts * 1000 : ts;
      }
    } catch (_) {}
    return 0;
  }

  function searchableText(m) {
    if (!m || m.deleted) return '';
    var parts = [];
    if (m.content) parts.push(String(m.content));
    var bs = m.boardShare;
    if (bs) {
      if (bs.title) parts.push(String(bs.title));
      if (bs.note) parts.push(String(bs.note));
      if (bs.excerpt) parts.push(String(bs.excerpt));
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function dayBounds(isoDay) {
    var s = String(isoDay || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var parts = s.split('-');
    var start = new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2]),
      0,
      0,
      0,
      0
    );
    var startMs = start.getTime();
    if (!isFinite(startMs)) return null;
    return { startMs: startMs, endMs: startMs + 86400000 };
  }

  function isFromMeToken(raw) {
    var s = String(raw || '')
      .trim()
      .toLowerCase();
    return s === 'me' || s === 'from me' || s === 'myself' || s === 'from:me';
  }

  function resolvePersonFilter(raw, people, meUid) {
    var s = String(raw || '').trim();
    if (!s) return { uid: '', label: '' };
    people = people || [];
    if (isFromMeToken(s) || (meUid && s === meUid)) {
      return { uid: meUid || '', label: 'me' };
    }
    var low = s.toLowerCase();
    var i;
    for (i = 0; i < people.length; i++) {
      if (people[i].uid === s) {
        return { uid: people[i].uid, label: people[i].name || '' };
      }
    }
    var matches = [];
    for (i = 0; i < people.length; i++) {
      var name = String(people[i].name || '').toLowerCase();
      if (name && name.indexOf(low) >= 0) matches.push(people[i]);
    }
    if (matches.length === 1) {
      return { uid: matches[0].uid, label: matches[0].name || '' };
    }
    if (matches.length > 1) {
      return { uid: matches[0].uid, label: matches[0].name || '', ambiguous: true };
    }
    return { uid: '', unmatched: true, query: s };
  }

  function searchPlan(query) {
    query = query || {};
    var dated = !!(query.startMs && query.endMs);
    return {
      senderId: query.senderId || '',
      startMs: query.startMs || 0,
      endMs: query.endMs || 0,
      word: String(query.word || '').trim(),
      pageSize: dated ? DATE_PAGE_SIZE : PAGE_SIZE,
      maxScan: dated ? DATE_MAX_SCAN : MAX_SCAN,
      maxHits: MAX_HITS,
    };
  }

  function hasActiveFilters(query) {
    query = query || {};
    return !!(query.word || query.senderId || query.startMs || query.unmatched);
  }

  function messageMatches(m, query) {
    query = query || {};
    if (!m || m.deleted) return false;
    if (query.unmatched) return false;
    if (!hasActiveFilters(query)) return false;
    if (query.senderId && m.senderId !== query.senderId) return false;
    if (query.startMs || query.endMs) {
      var t = createdAtMs(m.createdAt);
      if (query.startMs && t < query.startMs) return false;
      if (query.endMs && t >= query.endMs) return false;
    }
    if (query.word) {
      var hay = searchableText(m).toLowerCase();
      if (hay.indexOf(String(query.word).toLowerCase()) < 0) return false;
    }
    return true;
  }

  function snippet(text, word, maxLen) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    maxLen = maxLen || SNIPPET_LEN;
    if (!t) return '';
    var q = String(word || '').trim();
    if (!q) {
      return t.length > maxLen ? t.slice(0, maxLen - 1) + '…' : t;
    }
    var low = t.toLowerCase();
    var at = low.indexOf(q.toLowerCase());
    var start = at < 0 ? 0 : Math.max(0, at - 22);
    var out = t.slice(start, start + maxLen);
    if (start > 0) out = '…' + out;
    if (start + maxLen < t.length) out += '…';
    return out;
  }

  function hitLabel(m) {
    var t = searchableText(m);
    if (t) return t;
    if (m.messageType === 'voice' || m.audioUrl) return 'Voice message';
    if (m.imageUrl) return 'Photo';
    if (m.videoUrl) return 'Video';
    if (m.messageType === 'board_share') return 'Board post';
    return 'Message';
  }

  function toHit(m, namesByUid, meUid, word) {
    var uid = m.senderId || '';
    var sender =
      meUid && uid === meUid
        ? 'You'
        : (namesByUid && namesByUid[uid]) || 'Member';
    var text = hitLabel(m);
    return {
      id: m.id,
      senderId: uid,
      senderLabel: sender,
      snippet: snippet(text, word, SNIPPET_LEN) || text.slice(0, SNIPPET_LEN),
      createdAt: m.createdAt,
      createdAtMs: createdAtMs(m.createdAt),
      timeLabel: deps && deps.fmtTime ? deps.fmtTime(m.createdAt) : '',
    };
  }

  function collectHits(messages, query, namesByUid, meUid, maxHits) {
    var cap = maxHits || MAX_HITS;
    var hits = [];
    var i;
    for (i = 0; i < (messages || []).length; i++) {
      var m = messages[i];
      if (!messageMatches(m, query)) continue;
      hits.push(toHit(m, namesByUid, meUid, query.word));
      if (hits.length >= cap) break;
    }
    return hits;
  }

  function tsFromMs(ms) {
    if (global.firebase && firebase.firestore && firebase.firestore.Timestamp) {
      return firebase.firestore.Timestamp.fromMillis(ms);
    }
    return new Date(ms);
  }

  function defaultQueryPage(col, plan, cursorDoc) {
    if (!col) return Promise.resolve({ docs: [] });
    var q = col;
    if (plan.senderId) q = q.where('senderId', '==', plan.senderId);
    if (plan.startMs) q = q.where('createdAt', '>=', tsFromMs(plan.startMs));
    if (plan.endMs) q = q.where('createdAt', '<', tsFromMs(plan.endMs));
    q = q.orderBy('createdAt', 'desc').limit(plan.pageSize);
    if (cursorDoc) q = q.startAfter(cursorDoc);
    return q.get();
  }

  function mapSnapDocs(snap) {
    if (!snap || !snap.docs) return [];
    return snap.docs.map(function (d) {
      return Object.assign({ id: d.id }, d.data ? d.data() : d);
    });
  }

  function runSearch(opts) {
    opts = opts || {};
    var query = opts.query || {};
    var plan = searchPlan(query);
    var loaded = opts.loadedMessages || [];
    var names = opts.namesByUid || {};
    var meUid = opts.meUid || '';
    var hidden = opts.isHidden || function () {
      return false;
    };

    if (query.unmatched) {
      return Promise.resolve({
        status: 'empty',
        reason: 'person',
        hits: [],
        scanned: 0,
        truncated: false,
      });
    }
    if (!hasActiveFilters(query)) {
      return Promise.resolve({
        status: 'idle',
        hits: [],
        scanned: 0,
        truncated: false,
      });
    }

    var seen = {};
    var hits = [];

    function consider(m) {
      if (!m || !m.id || seen[m.id] || m.deleted) return;
      if (hidden(m)) return;
      if (!messageMatches(m, query)) return;
      seen[m.id] = true;
      hits.push(toHit(m, names, meUid, query.word));
    }

    loaded.forEach(consider);

    var queryPage = opts.queryPage || defaultQueryPage;
    var col = opts.messagesCol;
    var scanned = loaded.length;
    var cursor = null;

    function nextPage() {
      if (!col || scanned >= plan.maxScan) {
        return Promise.resolve();
      }
      return queryPage(col, plan, cursor).then(function (snap) {
        var docs = snap && snap.docs ? snap.docs : [];
        if (!docs.length) return;
        var newHitsBefore = hits.length;
        mapSnapDocs(snap).forEach(function (m) {
          scanned += 1;
          consider(m);
        });
        cursor = docs[docs.length - 1];
        if (docs.length < plan.pageSize) return;
        // Descending pages are newest-first; enough newest hits means stop.
        if (hits.length >= plan.maxHits && hits.length > newHitsBefore) {
          return;
        }
        return nextPage();
      });
    }

    return nextPage().then(function () {
      hits.sort(function (a, b) {
        return (b.createdAtMs || 0) - (a.createdAtMs || 0);
      });
      var sliced = hits.slice(0, plan.maxHits);
      return {
        status: sliced.length ? 'ok' : 'empty',
        hits: sliced,
        scanned: scanned,
        truncated: hits.length > plan.maxHits || scanned >= plan.maxScan,
      };
    });
  }

  function needsHistoryLoad(hit, loadedIds) {
    if (!hit || !hit.id) return false;
    loadedIds = loadedIds || [];
    return loadedIds.indexOf(hit.id) < 0;
  }

  function idleCopy() {
    return 'Type a word, pick a person, or choose a day.';
  }

  function emptyCopy(result) {
    if (result && result.reason === 'person') {
      return 'No participant matches that name.';
    }
    return 'No messages match in this chat.';
  }

  function statusCopy(result) {
    if (!result || result.status === 'idle') return idleCopy();
    if (result.status === 'empty') return emptyCopy(result);
    if (result.truncated && result.hits && result.hits.length >= MAX_HITS) {
      return 'Showing the first ' + MAX_HITS + ' matches.';
    }
    var n = (result.hits && result.hits.length) || 0;
    return n === 1 ? '1 match' : n + ' matches';
  }

  function currentQueryFromUi() {
    var st = state();
    var me = st && st.me;
    var people = deps && deps.listParticipants ? deps.listParticipants() : [];
    var input = el('ce2ThreadSearchInput');
    var personEl = el('ce2ThreadSearchPerson');
    var dayEl = el('ce2ThreadSearchDay');
    var word = input ? String(input.value || '').trim() : '';
    var personRaw = personEl ? String(personEl.value || '').trim() : '';
    var person = resolvePersonFilter(personRaw, people, me && me.uid);
    var bounds = dayBounds(dayEl ? dayEl.value : '');
    var query = {
      word: word,
      senderId: person.uid || '',
      unmatched: !!person.unmatched,
      startMs: bounds ? bounds.startMs : 0,
      endMs: bounds ? bounds.endMs : 0,
    };
    if (st) {
      st.threadSearchQuery = word.toLowerCase();
      st.threadSearchSenderId = query.senderId;
      st.threadSearchStartMs = query.startMs;
      st.threadSearchEndMs = query.endMs;
    }
    return query;
  }

  function namesMap() {
    var people = deps && deps.listParticipants ? deps.listParticipants() : [];
    var map = {};
    people.forEach(function (p) {
      if (p.uid) map[p.uid] = p.name || (p.isMe ? 'You' : 'Member');
    });
    return map;
  }

  function setStatus(text, kind) {
    var status = el('ce2ThreadSearchStatus');
    if (!status) return;
    status.hidden = !text;
    status.textContent = text || '';
    status.classList.toggle('is-empty', kind === 'empty');
    status.classList.toggle('is-idle', kind === 'idle');
  }

  function renderHits(result) {
    var list = el('ce2ThreadSearchHits');
    if (!list) return;
    list.innerHTML = '';
    var hits = (result && result.hits) || [];
    if (!hits.length) {
      list.hidden = true;
      return;
    }
    list.hidden = false;
    hits.forEach(function (hit) {
      var li = document.createElement('li');
      li.className = 'ce2-thread-search-hit';
      li.setAttribute('role', 'button');
      li.tabIndex = 0;
      li.dataset.messageId = hit.id || '';
      li.dataset.createdAtMs = String(hit.createdAtMs || '');
      var meta = document.createElement('div');
      meta.className = 'ce2-thread-search-hit-meta';
      var who = document.createElement('span');
      who.className = 'ce2-thread-search-hit-who';
      who.textContent = hit.senderLabel || 'Member';
      var when = document.createElement('span');
      when.className = 'ce2-thread-search-hit-when';
      when.textContent = hit.timeLabel || '';
      meta.appendChild(who);
      meta.appendChild(when);
      var snip = document.createElement('div');
      snip.className = 'ce2-thread-search-hit-snip';
      snip.textContent = hit.snippet || '';
      li.appendChild(meta);
      li.appendChild(snip);
      list.appendChild(li);
    });
  }

  function fillPersonSelect() {
    var select = el('ce2ThreadSearchPerson');
    if (!select) return;
    var prev = select.value;
    var people = deps && deps.listParticipants ? deps.listParticipants() : [];
    var st = state();
    var meUid = st && st.me ? st.me.uid : '';
    select.innerHTML = '';
    var anyone = document.createElement('option');
    anyone.value = '';
    anyone.textContent = 'Anyone';
    select.appendChild(anyone);
    var fromMe = document.createElement('option');
    fromMe.value = meUid || '__me__';
    fromMe.textContent = 'From me';
    select.appendChild(fromMe);
    people.forEach(function (p) {
      if (!p || !p.uid || p.isMe || p.uid === meUid) return;
      var opt = document.createElement('option');
      opt.value = p.uid;
      opt.textContent = p.name || 'Member';
      select.appendChild(opt);
    });
    if (prev && Array.prototype.some.call(select.options, function (o) {
      return o.value === prev;
    })) {
      select.value = prev;
    }
  }

  function syncLatestButton() {
    var btn = el('ce2ThreadSearchLatest');
    var st = state();
    if (!btn) return;
    var jump = !!(st && st.searchJumpMessages && st.searchJumpMessages.length);
    btn.hidden = !jump;
  }

  function applyResult(result) {
    var kind =
      !result || result.status === 'idle'
        ? 'idle'
        : result.status === 'empty'
          ? 'empty'
          : 'ok';
    setStatus(statusCopy(result), kind);
    renderHits(result);
    syncLatestButton();
  }

  function scheduleSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      searchTimer = 0;
      runUiSearch();
    }, DEBOUNCE_MS);
    if (deps && deps.requestRender) deps.requestRender({ threadOnly: true });
  }

  function runUiSearch() {
    var st = state();
    var ac = st && st.activeConversation;
    var bar = el('ce2ThreadSearch');
    if (!bar || bar.hidden || !ac || ac.needsJoin) {
      applyResult({ status: 'idle', hits: [] });
      return;
    }
    var query = currentQueryFromUi();
    var gen = ++searchGen;
    setStatus(hasActiveFilters(query) ? 'Searching this chat…' : idleCopy(), hasActiveFilters(query) ? 'ok' : 'idle');
    if (!hasActiveFilters(query)) {
      renderHits({ hits: [] });
      if (deps && deps.requestRender) deps.requestRender({ threadOnly: true });
      return;
    }
    var loaded = (st.searchJumpMessages && st.searchJumpMessages.length
      ? st.searchJumpMessages
      : st.messages) || [];
    var col =
      deps && deps.messagesCollection ? deps.messagesCollection(ac) : null;
    runSearch({
      query: query,
      loadedMessages: loaded,
      messagesCol: col,
      namesByUid: namesMap(),
      meUid: st.me && st.me.uid,
      isHidden: function (m) {
        return deps && deps.isMessageHidden ? deps.isMessageHidden(m, ac) : false;
      },
    })
      .then(function (result) {
        if (gen !== searchGen) return;
        applyResult(result);
        if (deps && deps.requestRender) deps.requestRender({ threadOnly: true });
      })
      .catch(function () {
        if (gen !== searchGen) return;
        setStatus('Could not search this chat.', 'empty');
      });
  }

  function onHitActivate(hitEl) {
    if (!hitEl || !hitEl.dataset.messageId) return;
    var st = state();
    var loaded = st && st.messages ? st.messages : [];
    var jump = st && st.searchJumpMessages ? st.searchJumpMessages : [];
    var ids = loaded.concat(jump).map(function (m) {
      return m.id;
    });
    var hit = {
      id: hitEl.dataset.messageId,
      createdAtMs: Number(hitEl.dataset.createdAtMs || 0),
    };
    if (deps && deps.jumpToHit) deps.jumpToHit(hit, needsHistoryLoad(hit, ids));
  }

  function resetUi() {
    searchGen += 1;
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = 0;
    }
    var input = el('ce2ThreadSearchInput');
    var person = el('ce2ThreadSearchPerson');
    var day = el('ce2ThreadSearchDay');
    var st = state();
    if (st) {
      st.threadSearchQuery = '';
      st.threadSearchSenderId = '';
      st.threadSearchStartMs = 0;
      st.threadSearchEndMs = 0;
    }
    if (input) input.value = '';
    if (person) person.value = '';
    if (day) day.value = '';
    applyResult({ status: 'idle', hits: [] });
  }

  function onOpen() {
    fillPersonSelect();
    applyResult({ status: 'idle', hits: [] });
    syncLatestButton();
    if (deps && deps.hydrateParticipants) {
      Promise.resolve(deps.hydrateParticipants()).then(function () {
        fillPersonSelect();
      }).catch(function () {});
    }
    var query = currentQueryFromUi();
    if (hasActiveFilters(query)) scheduleSearch();
    if (deps && deps.syncFocusableInputs) deps.syncFocusableInputs();
  }

  function onClose() {
    resetUi();
    if (deps && deps.syncFocusableInputs) deps.syncFocusableInputs();
  }

  function wireUi() {
    if (wired) return;
    wired = true;
    var person = el('ce2ThreadSearchPerson');
    var day = el('ce2ThreadSearchDay');
    var hits = el('ce2ThreadSearchHits');
    var latest = el('ce2ThreadSearchLatest');
    var input = el('ce2ThreadSearchInput');
    if (person) {
      person.addEventListener('change', function () {
        scheduleSearch();
      });
    }
    if (day) {
      day.addEventListener('change', function () {
        scheduleSearch();
      });
    }
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (searchTimer) {
            clearTimeout(searchTimer);
            searchTimer = 0;
          }
          runUiSearch();
        }
      });
      input.addEventListener('focus', function () {
        if (deps && deps.syncFocusableInputs) deps.syncFocusableInputs();
      });
    }
    if (person) {
      person.addEventListener('focus', function () {
        if (deps && deps.syncFocusableInputs) deps.syncFocusableInputs();
      });
    }
    if (day) {
      day.addEventListener('focus', function () {
        if (deps && deps.syncFocusableInputs) deps.syncFocusableInputs();
      });
    }
    if (hits) {
      hits.addEventListener('click', function (e) {
        var li = e.target && e.target.closest ? e.target.closest('.ce2-thread-search-hit') : null;
        onHitActivate(li);
      });
      hits.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var li = e.target && e.target.closest ? e.target.closest('.ce2-thread-search-hit') : null;
        if (!li) return;
        e.preventDefault();
        onHitActivate(li);
      });
    }
    if (latest) {
      latest.addEventListener('click', function () {
        if (deps && deps.clearSearchJump) deps.clearSearchJump();
        syncLatestButton();
      });
    }
  }

  function init(d) {
    deps = d || {};
    wireUi();
  }

  global.Ce2ThreadSearch = {
    VERSION: VERSION,
    MAX_HITS: MAX_HITS,
    PAGE_SIZE: PAGE_SIZE,
    MAX_SCAN: MAX_SCAN,
    DATE_MAX_SCAN: DATE_MAX_SCAN,
    SEARCH_FIELD_IDS: SEARCH_FIELD_IDS,
    init: init,
    onOpen: onOpen,
    onClose: onClose,
    resetUi: resetUi,
    scheduleSearch: scheduleSearch,
    fillPersonSelect: fillPersonSelect,
    syncLatestButton: syncLatestButton,
    searchableText: searchableText,
    messageMatches: messageMatches,
    resolvePersonFilter: resolvePersonFilter,
    dayBounds: dayBounds,
    searchPlan: searchPlan,
    hasActiveFilters: hasActiveFilters,
    snippet: snippet,
    collectHits: collectHits,
    runSearch: runSearch,
    needsHistoryLoad: needsHistoryLoad,
    statusCopy: statusCopy,
    idleCopy: idleCopy,
    createdAtMs: createdAtMs,
    toHit: toHit,
  };
})(typeof window !== 'undefined' ? window : global);
