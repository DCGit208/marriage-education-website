/* ═══════════════════════════════════════════════════════════════════
 * Admin Formation & Matching Control Tab
 * Handles: scoring weights, user override, match monitoring, reports.
 * Depends on global `db` and `auth` from firebase.js.
 * ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const SETTINGS_PATH = 'admin/settings/scoringWeights/current';
  let _adminUid     = null;
  let _targetUid    = null;  // UID of user currently being overridden

  // ── INIT: wire up the Match tab when it becomes active ───────────
  document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(user => {
      if (!user) return;
      _adminUid = user.uid;
      _wireMatchTab();
    });
  });

  function _wireMatchTab() {
    // Tab activation
    const matchTabBtn = document.querySelector('[data-tab="match"]');
    if (matchTabBtn) {
      matchTabBtn.addEventListener('click', () => {
        _loadWeights();
      });
    }

    // Scoring weights
    document.getElementById('fmSaveWeightsBtn')?.addEventListener('click', _saveWeights);

    // Track weight sum live
    ['fmWFormation', 'fmWEngagement', 'fmWExpression', 'fmWConsistency', 'fmWValidation']
      .forEach(id => {
        document.getElementById(id)?.addEventListener('input', _updateWeightSum);
      });

    // User lookup
    document.getElementById('fmUserLookupBtn')?.addEventListener('click', _lookupUser);
    document.getElementById('fmUserLookup')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') _lookupUser();
    });

    // Override actions
    document.getElementById('fmSetScoreBtn')?.addEventListener('click', _setScoreOverride);
    document.getElementById('fmClearOverrideBtn')?.addEventListener('click', _clearScoreOverride);
    document.getElementById('fmBanDatingBtn')?.addEventListener('click', () => _setDatingFlag('datingBanned', true));
    document.getElementById('fmUnbanDatingBtn')?.addEventListener('click', () => _setDatingFlag('datingBanned', false));
    document.getElementById('fmVerifyBtn')?.addEventListener('click', () => _setDatingFlag('datingVerified', true));
    document.getElementById('fmUnverifyBtn')?.addEventListener('click', () => _setDatingFlag('datingVerified', false));

    // Match monitoring
    document.getElementById('fmLoadMatchesBtn')?.addEventListener('click', _loadMatches);

    // Reports
    document.getElementById('fmLoadReportsBtn')?.addEventListener('click', _loadReports);
  }

  // ── SCORING WEIGHTS ───────────────────────────────────────────────
  async function _loadWeights() {
    try {
      const ref  = db.doc(SETTINGS_PATH);
      const snap = await ref.get();
      if (snap.exists) {
        const d = snap.data();
        _setInputVal('fmWFormation',  d.formation   ?? 0.35);
        _setInputVal('fmWEngagement', d.engagement  ?? 0.25);
        _setInputVal('fmWExpression', d.expression  ?? 0.20);
        _setInputVal('fmWConsistency',d.consistency ?? 0.10);
        _setInputVal('fmWValidation', d.validation  ?? 0.10);
        if (d.thresholds) {
          _setInputVal('fmThreshLimited',  d.thresholds.limited   ?? 60);
          _setInputVal('fmThreshFull',     d.thresholds.full      ?? 70);
          _setInputVal('fmThreshCovenant', d.thresholds.covenant  ?? 85);
        }
      }
      _updateWeightSum();
    } catch (err) {
      console.warn('[admin-formation] loadWeights:', err.code);
    }
  }

  function _updateWeightSum() {
    const ids = ['fmWFormation', 'fmWEngagement', 'fmWExpression', 'fmWConsistency', 'fmWValidation'];
    const sum = ids.reduce((s, id) => s + (parseFloat(document.getElementById(id)?.value) || 0), 0);
    const el  = document.getElementById('fmWeightSum');
    if (el) {
      el.innerHTML = `Sum: <strong style="color:${Math.abs(sum - 1) < 0.001 ? '#4ade80' : '#ef4444'}">${sum.toFixed(2)}</strong>`;
    }
  }

  async function _saveWeights() {
    if (!_adminUid) return;
    const formation   = parseFloat(document.getElementById('fmWFormation')?.value)  || 0.35;
    const engagement  = parseFloat(document.getElementById('fmWEngagement')?.value) || 0.25;
    const expression  = parseFloat(document.getElementById('fmWExpression')?.value) || 0.20;
    const consistency = parseFloat(document.getElementById('fmWConsistency')?.value)|| 0.10;
    const validation  = parseFloat(document.getElementById('fmWValidation')?.value) || 0.10;
    const sum = formation + engagement + expression + consistency + validation;

    if (Math.abs(sum - 1) > 0.01) {
      alert(`Weights must sum to 1.00 (currently ${sum.toFixed(2)}). Adjust before saving.`);
      return;
    }

    const thresholds = {
      limited:  parseInt(document.getElementById('fmThreshLimited')?.value)  || 60,
      full:     parseInt(document.getElementById('fmThreshFull')?.value)      || 70,
      covenant: parseInt(document.getElementById('fmThreshCovenant')?.value) || 85,
    };

    try {
      await db.doc(SETTINGS_PATH).set({
        formation, engagement, expression, consistency, validation,
        thresholds,
        updatedBy:  _adminUid,
        updatedAt:  firebase.firestore.FieldValue.serverTimestamp(),
      });
      alert('Scoring weights saved. Daily batch will use these on next run.');
    } catch (err) {
      alert('Save failed: ' + (err.code || err.message));
    }
  }

  // ── USER LOOKUP + OVERRIDE ────────────────────────────────────────
  async function _lookupUser() {
    const query  = (document.getElementById('fmUserLookup')?.value || '').trim();
    const panel  = document.getElementById('fmUserOverridePanel');
    const nameEl = document.getElementById('fmUserOverrideName');
    if (!query || !panel || !nameEl) return;

    _targetUid = null;
    panel.style.display = 'none';

    try {
      let userDoc = null;

      // Try as UID first
      const uidSnap = await db.collection('users').doc(query).get();
      if (uidSnap.exists) {
        userDoc = { uid: uidSnap.id, ...uidSnap.data() };
      } else {
        // Try as email
        const emailSnap = await db.collection('users')
          .where('email', '==', query)
          .limit(1)
          .get();
        if (!emailSnap.empty) userDoc = { uid: emailSnap.docs[0].id, ...emailSnap.docs[0].data() };
      }

      if (!userDoc) { alert('User not found.'); return; }

      _targetUid = userDoc.uid;
      const v2 = userDoc.formationProfile_v2;
      const overrideActive = !!userDoc.formationOverride_v2;

      nameEl.textContent = `${userDoc.name || userDoc.email || _targetUid} — v2 Score: ${v2?.totalScore ?? '—'} | Banned: ${userDoc.datingBanned ? 'YES' : 'no'} | Verified: ${userDoc.datingVerified ? 'YES' : 'no'} | Override: ${overrideActive ? 'ACTIVE' : 'none'}`;
      _setInputVal('fmOverrideScore', v2?.totalScore || 0);
      panel.style.display = 'block';
      _setStatus('');
    } catch (err) {
      alert('Lookup error: ' + (err.code || err.message));
    }
  }

  async function _setScoreOverride() {
    if (!_targetUid) return;
    const score = parseInt(document.getElementById('fmOverrideScore')?.value);
    if (isNaN(score) || score < 0 || score > 100) { alert('Score must be 0-100.'); return; }

    try {
      // Build a minimal override profile that _computeV2Profile on the server will respect
      await db.collection('users').doc(_targetUid).update({
        formationOverride_v2: {
          formation: score, engagement: score, expression: score,
          consistency: score, validation: score,
          totalScore: score,
          school1Progress: score, school2Progress: score,
          expressionGated: score < 20,
          version: 2,
          overriddenByAdmin: true,
        },
      });
      _setStatus(`Score override set to ${score}.`);
    } catch (err) {
      _setStatus('Error: ' + (err.code || err.message));
    }
  }

  async function _clearScoreOverride() {
    if (!_targetUid) return;
    try {
      await db.collection('users').doc(_targetUid).update({
        formationOverride_v2: firebase.firestore.FieldValue.delete(),
      });
      _setStatus('Override cleared. System will recalculate on next trigger or daily run.');
    } catch (err) {
      _setStatus('Error: ' + (err.code || err.message));
    }
  }

  async function _setDatingFlag(field, value) {
    if (!_targetUid) return;
    try {
      await db.collection('users').doc(_targetUid).update({ [field]: value });
      _setStatus(`${field} set to ${value}.`);
    } catch (err) {
      _setStatus('Error: ' + (err.code || err.message));
    }
  }

  // ── MATCH MONITORING ──────────────────────────────────────────────
  async function _loadMatches() {
    const list = document.getElementById('fmMatchesList');
    if (!list) return;
    list.innerHTML = '<p style="font-size:13px;color:var(--text-secondary);">Loading…</p>';

    try {
      const snap = await db.collection('matches')
        .where('generatedBy', '==', 'daily-engine-v2')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      let total = snap.size, accepted = 0, rejected = 0;
      snap.forEach(d => {
        const fb = d.data().feedback;
        if (fb === 'accepted') accepted++;
        if (fb === 'rejected') rejected++;
      });

      _setText('fmStatTotal',    total);
      _setText('fmStatAccepted', accepted);
      _setText('fmStatRejected', rejected);

      if (snap.empty) { list.innerHTML = '<p style="font-size:13px;">No v2 matches yet.</p>'; return; }

      list.innerHTML = snap.docs.map(d => {
        const m = d.data();
        const date = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString() : '—';
        const fb   = m.feedback ? `<span style="color:${m.feedback==='accepted'?'#4ade80':'#ef4444'}">${m.feedback}</span>` : '<span style="color:var(--text-secondary)">pending</span>';
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;flex-wrap:wrap;">
          <span style="font-family:monospace;font-size:10px;color:var(--text-secondary);">${d.id.slice(0,8)}</span>
          <span>${_esc(m.userA?.slice(0,8))}… ↔ ${_esc(m.userB?.slice(0,8))}…</span>
          <span>Compat: <strong>${m.compatScore ?? '—'}</strong></span>
          <span>Scores: ${m.scoreA}/${m.scoreB}</span>
          <span>Stage: ${m.stage}</span>
          <span>${fb}</span>
          <span style="color:var(--text-secondary);">${date}</span>
          <button onclick="fmRemoveMatch('${d.id}')" class="btn btn-sm btn-danger" style="margin-left:auto;font-size:11px;padding:3px 8px;">Remove</button>
        </div>`;
      }).join('');
    } catch (err) {
      list.innerHTML = `<p style="color:#ef4444;font-size:13px;">Error: ${_esc(err.message)}</p>`;
    }
  }

  window.fmRemoveMatch = async function (matchId) {
    if (!confirm('Remove this match? It will be hidden from both users.')) return;
    try {
      await db.collection('matches').doc(matchId).update({ status: 'removed', removedByAdmin: true });
      _loadMatches();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // ── SAFETY — REPORTS ──────────────────────────────────────────────
  async function _loadReports() {
    const list = document.getElementById('fmReportsList');
    if (!list) return;
    list.innerHTML = '<p style="font-size:13px;color:var(--text-secondary);">Loading…</p>';

    try {
      const snap = await db.collection('reports')
        .orderBy('createdAt', 'desc')
        .limit(30)
        .get();

      if (snap.empty) { list.innerHTML = '<p style="font-size:13px;">No reports yet.</p>'; return; }

      list.innerHTML = snap.docs.map(d => {
        const r    = d.data();
        const date = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString() : '—';
        return `<div style="padding:10px 0;border-bottom:1px solid var(--border);font-size:12px;">
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <span style="font-weight:700;">Report #${d.id.slice(0,8)}</span>
            <span style="color:var(--text-secondary);">${date}</span>
            <span style="margin-left:auto;padding:2px 8px;background:${r.status==='resolved'?'#166534':'#7f1d1d'};border-radius:4px;color:#fff;">${r.status || 'open'}</span>
          </div>
          <div style="margin-top:4px;">By: <code style="font-size:11px;">${_esc(r.reportedBy?.slice(0,10))}…</code></div>
          <div style="margin-top:2px;">Against: <code style="font-size:11px;">${_esc(r.reportedUid?.slice(0,10))}…</code></div>
          <div style="margin-top:4px;color:var(--text-secondary);">${_esc(r.reason || '').slice(0,120)}</div>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
            <button onclick="fmResolveReport('${d.id}')" class="btn btn-sm btn-secondary" style="font-size:11px;">Mark Resolved</button>
            <button onclick="fmBanFromReport('${r.reportedUid}')" class="btn btn-sm btn-danger" style="font-size:11px;">Ban from Dating</button>
          </div>
        </div>`;
      }).join('');
    } catch (err) {
      list.innerHTML = `<p style="color:#ef4444;font-size:13px;">Error: ${_esc(err.message)}</p>`;
    }
  }

  window.fmResolveReport = async function (reportId) {
    try {
      await db.collection('reports').doc(reportId).update({ status: 'resolved', resolvedAt: firebase.firestore.FieldValue.serverTimestamp() });
      _loadReports();
    } catch (err) { alert('Error: ' + err.message); }
  };

  window.fmBanFromReport = async function (uid) {
    if (!uid || !confirm(`Ban UID ${uid} from dating?`)) return;
    try {
      await db.collection('users').doc(uid).update({ datingBanned: true });
      alert('User banned from dating.');
    } catch (err) { alert('Error: ' + err.message); }
  };

  // ── UTILITIES ─────────────────────────────────────────────────────
  function _setInputVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '';
  }

  function _setStatus(msg) {
    const el = document.getElementById('fmOverrideStatus');
    if (el) el.textContent = msg;
  }

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
})();
