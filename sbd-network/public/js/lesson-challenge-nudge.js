/**
 * WWM 30-Day Challenge — Day 0 onboarding nudge after Week 13 / course complete.
 */
(function (global) {
  'use strict';

  const NUDGE_KEY = 'wwm-challenge-nudge-v1';
  const SCORECARD_KEY = 'wwm-30day-challenge-v1';
  const WWM_COURSE = 'the-woman-the-wife-the-mother';
  const WEEK_13 = 'wwm-week-13';
  const SCORECARD_URL = '/downloads/wwm-30-day-challenge-scorecard.html';

  function readNudge() {
    try {
      return JSON.parse(localStorage.getItem(NUDGE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function writeNudge(data) {
    localStorage.setItem(NUDGE_KEY, JSON.stringify(data));
  }

  function challengeStarted() {
    try {
      const d = JSON.parse(localStorage.getItem(SCORECARD_KEY) || '{}');
      if (d.startDate) return true;
      for (let day = 1; day <= 30; day++) {
        if (d['d' + day + '_w'] || d['d' + day + '_a'] || d['d' + day + '_wi'] || d['d' + day + '_m']) {
          return true;
        }
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function markEligible() {
    const data = readNudge();
    data.eligible = true;
    data.eligibleAt = Date.now();
    writeNudge(data);
  }

  function dismiss() {
    const data = readNudge();
    data.dismissed = true;
    data.dismissedAt = Date.now();
    writeNudge(data);
    hideBanner();
  }

  function hideBanner() {
    const el = document.getElementById('wwmChallengeNudge');
    if (el) el.style.display = 'none';
  }

  function renderBanner() {
    let el = document.getElementById('wwmChallengeNudge');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wwmChallengeNudge';
      el.className = 'wwm-challenge-nudge';
      el.setAttribute('role', 'region');
      el.setAttribute('aria-label', '30-Day Challenge reminder');
      const bar = document.getElementById('wwmChallengeBar');
      if (bar && bar.parentNode) {
        bar.parentNode.insertBefore(el, bar.nextSibling);
      } else {
        document.body.insertBefore(el, document.getElementById('lessonBody'));
      }
    }

    el.innerHTML =
      '<div class="wwm-challenge-nudge-inner">' +
      '<p class="wwm-challenge-nudge-title">Day 0 — launch your 30-Day Challenge</p>' +
      '<p class="wwm-challenge-nudge-text">Complete a full rehearsal on the scorecard (all four pillars) before Day 1 begins.</p>' +
      '<div class="wwm-challenge-nudge-actions">' +
      '<a href="' + SCORECARD_URL + '" target="_blank" rel="noopener" class="wwm-challenge-link">Open scorecard →</a>' +
      '<button type="button" class="wwm-challenge-nudge-dismiss" id="wwmChallengeNudgeDismiss">Dismiss</button>' +
      '</div></div>';
    el.style.display = 'block';

    const btn = document.getElementById('wwmChallengeNudgeDismiss');
    if (btn) btn.onclick = dismiss;
  }

  function maybeShow(moduleId, completedModules, courseId) {
    if (moduleId !== WEEK_13 && courseId !== WWM_COURSE) return;
    if (challengeStarted()) {
      hideBanner();
      return;
    }

    const data = readNudge();
    const weekDone = Array.isArray(completedModules) && completedModules.includes(WEEK_13);
    const eligible = data.eligible || weekDone;

    if (!eligible || data.dismissed) {
      hideBanner();
      return;
    }

    renderBanner();
  }

  global.WwmChallengeNudge = {
    markEligible: markEligible,
    maybeShow: maybeShow,
    dismiss: dismiss,
    challengeStarted: challengeStarted,
    WEEK_13: WEEK_13,
    WWM_COURSE: WWM_COURSE,
  };
})(typeof window !== 'undefined' ? window : global);
