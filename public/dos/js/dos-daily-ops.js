/**
 * DOS Daily Operations + Field Deploy (Phase 2).
 */
(function (global) {
  'use strict';

  var CHECKLIST = [
    { id: 'morning_review', label: 'Review daily targets & pipeline', block: 'morning' },
    { id: 'morning_links', label: 'Copy deployment links / SBD link ready', block: 'morning' },
    { id: 'afternoon_outreach', label: 'Field conversations (campus, church, home)', block: 'afternoon' },
    { id: 'afternoon_present', label: 'Present Marriage Foundation Access', block: 'afternoon' },
    { id: 'evening_followups', label: 'Follow up prospects & new subscribers', block: 'evening' },
    { id: 'evening_log', label: 'Log counts below & save daily ops', block: 'evening' }
  ];

  var FIELD_ENVIRONMENTS = [
    { id: 'campus', label: 'Campus', icon: 'fa-solid fa-building-columns' },
    { id: 'church', label: 'Church / ministry', icon: 'fa-solid fa-church' },
    { id: 'home', label: 'Home visit', icon: 'fa-solid fa-house-user' },
    { id: 'workplace', label: 'Workplace', icon: 'fa-solid fa-briefcase' },
    { id: 'online', label: 'Online / social', icon: 'fa-solid fa-wifi' },
    { id: 'event', label: 'Event / conference', icon: 'fa-solid fa-calendar-days' }
  ];

  var FIELD_SCRIPTS = [
    {
      id: 'approach',
      title: 'Approach — open conversation',
      body: 'Good day — I represent Marriage Education. We help couples and families access practical marriage literacy through the SBD Network. May I share how someone in your circle can get Foundation access this week?'
    },
    {
      id: 'close',
      title: 'Close — Foundation Yearly ($144.17)',
      body: 'Foundation Access is one payment of $144.17 for a full year of School 1 on the SBD Network — ideal if you want to start without monthly friction. I will send you my Foundation Yearly link now; after you enroll you receive login details by email. Here is the link: [YOUR YEARLY LINK]'
    },
    {
      id: 'close_monthly',
      title: 'Close — Foundation monthly (alternate)',
      body: 'If you prefer month-to-month, Foundation is also available monthly on the SBD Network. I can send my app link for that path — but our official scholarship deployment is the annual Foundation Access.'
    },
    {
      id: 'followup',
      title: 'Follow-up (24–48h)',
      body: 'Hello — checking in on the Foundation Yearly access we discussed ($144.17 for 12 months). Do you have any questions before enrolling? I am here to help you activate your login.'
    },
    {
      id: 'recruit',
      title: 'Ambassador recruitment conversation',
      body: 'You are already deploying access well. We are expanding ambassadors who deploy Foundation access in their community. The path starts with your own deployment results — would you like to hear how the ambassador program works?'
    },
    {
      id: 'objection_time',
      title: 'Objection — time',
      body: 'The program is designed for busy couples — short modules, mobile-friendly. Foundation is less than many streaming services, and the impact compounds over months.'
    },
    {
      id: 'objection_money',
      title: 'Objection — cost',
      body: 'Foundation is positioned for accessibility. Compare it to one counseling session — this is ongoing literacy. I can walk you through exactly what is included before you decide.'
    }
  ];

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function logDocId(code) {
    return code + '_' + todayKey();
  }

  function defaultLog(code) {
    return {
      ambassadorCode: code,
      date: todayKey(),
      counts: {
        subscribers: 0,
        conversations: 0,
        followUps: 0,
        recruitConversations: 0,
        socialPosts: 0
      },
      checklist: {},
      notes: ''
    };
  }

  function getTargets() {
    var t = global.DOSEconomics && global.DOSEconomics.DOCTRINE
      ? global.DOSEconomics.DOCTRINE.dailyTargets
      : { newSubscribers: 10, foundationYearly: 10, conversations: 20, followUps: 10, recruitConversations: 1, socialPosts: 1 };
    return t;
  }

  function targetRow(label, current, target) {
    var pct = target ? Math.min(100, Math.round((current / target) * 100)) : 0;
    return '<div class="dos-daily-target-row">' +
      '<div class="dos-daily-target-head"><span>' + label + '</span><strong>' + current + ' / ' + target + '</strong></div>' +
      '<div class="dos-progress"><div class="dos-progress-fill" style="width:' + pct + '%"></div></div></div>';
  }

  async function loadLog(db, code) {
    if (!db || !code) return defaultLog(code);
    try {
      var snap = await db.collection('dos_daily_logs').doc(logDocId(code)).get();
      if (snap.exists) {
        var data = snap.data();
        return Object.assign(defaultLog(code), data, {
          counts: Object.assign(defaultLog(code).counts, data.counts || {}),
          checklist: data.checklist || {}
        });
      }
    } catch (e) {
      console.warn('[DOSDaily] load', e);
    }
    return defaultLog(code);
  }

  async function saveLog(db, code, log) {
    if (!db || !code) return;
    var payload = Object.assign({}, log, {
      ambassadorCode: code,
      date: todayKey(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('dos_daily_logs').doc(logDocId(code)).set(payload, { merge: true });
  }

  function renderDailyOps(container, code, log, onSave) {
    if (!container) return;
    var targets = getTargets();
    var c = log.counts || {};

    var checklistHtml = ['morning', 'afternoon', 'evening'].map(function (block) {
      var items = CHECKLIST.filter(function (x) { return x.block === block; });
      var title = block.charAt(0).toUpperCase() + block.slice(1);
      return '<div class="dos-checklist-block"><h4>' + title + '</h4>' +
        items.map(function (item) {
          var checked = log.checklist && log.checklist[item.id] ? ' checked' : '';
          return '<label class="dos-check-item"><input type="checkbox" data-check-id="' + item.id + '"' + checked + '> ' +
            item.label + '</label>';
        }).join('') + '</div>';
    }).join('');

    container.innerHTML =
      '<div class="dos-card"><h3><i class="fa-solid fa-sun"></i> Daily targets · ' + todayKey() + '</h3>' +
      '<p style="font-size:13px;color:#71717a;margin:0 0 16px">Official challenge: <strong>10 Foundation Yearly ($144.17)</strong> deployments / day. Self-log below; paid truth also updates Overview from Stripe.</p>' +
      targetRow('Foundation Yearly deployments', c.subscribers || 0, targets.foundationYearly || targets.newSubscribers || 10) +
      targetRow('Conversations', c.conversations || 0, targets.conversations) +
      targetRow('Follow-ups', c.followUps || 0, targets.followUps) +
      targetRow('Recruit conversations', c.recruitConversations || 0, targets.recruitConversations) +
      targetRow('Social posts', c.socialPosts || 0, targets.socialPosts) +
      '</div>' +
      '<div class="dos-card"><h3><i class="fa-solid fa-list-check"></i> Daily checklist</h3>' + checklistHtml + '</div>' +
      '<div class="dos-card"><h3><i class="fa-solid fa-pen"></i> Log today\'s activity</h3>' +
      '<div class="dos-daily-form-grid">' +
      '<label>Yearly deployments today<input type="number" min="0" id="dosCountSubs" value="' + (c.subscribers || 0) + '"></label>' +
      '<label>Conversations<input type="number" min="0" id="dosCountConv" value="' + (c.conversations || 0) + '"></label>' +
      '<label>Follow-ups<input type="number" min="0" id="dosCountFollow" value="' + (c.followUps || 0) + '"></label>' +
      '<label>Recruit convos<input type="number" min="0" id="dosCountRecruit" value="' + (c.recruitConversations || 0) + '"></label>' +
      '<label>Social posts<input type="number" min="0" id="dosCountSocial" value="' + (c.socialPosts || 0) + '"></label>' +
      '</div>' +
      '<label style="display:block;margin-top:12px;font-size:13px">Notes<textarea id="dosDailyNotes" rows="3" style="width:100%;margin-top:6px;padding:10px;border-radius:8px;border:1px solid #e4e4e7">' +
      (log.notes || '') + '</textarea></label>' +
      '<button type="button" class="dos-btn dos-btn-primary" id="dosSaveDaily" style="margin-top:12px"><i class="fa-solid fa-floppy-disk"></i> Save daily ops</button>' +
      '<span id="dosDailySaveMsg" style="margin-left:10px;font-size:13px;color:#00b894"></span></div>';

    var saveBtn = document.getElementById('dosSaveDaily');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        var checklist = {};
        container.querySelectorAll('input[data-check-id]').forEach(function (inp) {
          checklist[inp.getAttribute('data-check-id')] = inp.checked;
        });
        log.counts = {
          subscribers: Number(document.getElementById('dosCountSubs').value) || 0,
          conversations: Number(document.getElementById('dosCountConv').value) || 0,
          followUps: Number(document.getElementById('dosCountFollow').value) || 0,
          recruitConversations: Number(document.getElementById('dosCountRecruit').value) || 0,
          socialPosts: Number(document.getElementById('dosCountSocial').value) || 0
        };
        log.checklist = checklist;
        log.notes = document.getElementById('dosDailyNotes').value || '';
        if (onSave) await onSave(log);
        var msg = document.getElementById('dosDailySaveMsg');
        if (msg) {
          msg.textContent = 'Saved';
          setTimeout(function () { msg.textContent = ''; }, 2500);
        }
      });
    }
  }

  function renderFieldDeploy(container, primaryLink) {
    if (!container) return;
    var envHtml = FIELD_ENVIRONMENTS.map(function (e) {
      return '<div class="dos-env-chip"><i class="' + e.icon + '"></i> ' + e.label + '</div>';
    }).join('');

    var scriptsHtml = FIELD_SCRIPTS.map(function (s) {
      var text = s.body.replace('[YOUR LINK]', primaryLink || 'https://marriageducation.com');
      return '<div class="dos-script-card">' +
        '<h4>' + s.title + '</h4>' +
        '<p class="dos-script-body">' + text + '</p>' +
        '<button type="button" class="dos-btn dos-btn-primary dos-copy-script" data-script="' + encodeURIComponent(text) + '">' +
        '<i class="fa-solid fa-copy"></i> Copy script</button></div>';
    }).join('');

    container.innerHTML =
      '<div class="dos-card"><h3><i class="fa-solid fa-map-location-dot"></i> Field environments</h3>' +
      '<p style="font-size:13px;color:#71717a">Deploy Marriage Foundation Access in these contexts.</p>' +
      '<div class="dos-env-grid">' + envHtml + '</div></div>' +
      '<div class="dos-card"><h3><i class="fa-solid fa-file-lines"></i> Deployment scripts</h3>' +
      '<p style="font-size:13px;color:#71717a">Copy, personalize with your name, send with your deployment link.</p>' +
      scriptsHtml + '</div>';

    container.querySelectorAll('.dos-copy-script').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var text = decodeURIComponent(btn.getAttribute('data-script'));
        navigator.clipboard.writeText(text).then(function () {
          alert('Script copied');
        }).catch(function () {
          var ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          alert('Script copied');
        });
      });
    });
  }

  global.DOSDailyOps = {
    loadLog: loadLog,
    saveLog: saveLog,
    renderDailyOps: renderDailyOps,
    renderFieldDeploy: renderFieldDeploy,
    todayKey: todayKey
  };
})(typeof window !== 'undefined' ? window : global);
