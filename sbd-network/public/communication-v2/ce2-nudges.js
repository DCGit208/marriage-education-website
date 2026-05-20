/**
 * CE2 — formation nudges (daily check-in / prayer reminders)
 */
(function (global) {
  'use strict';

  function dayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function showBanner(id, html, onDismiss) {
    if (document.getElementById(id)) return;
    var bar = document.createElement('div');
    bar.id = id;
    bar.className = 'ce2-nudge-banner';
    bar.innerHTML = html;
    var app = document.getElementById('ce2App');
    var alert = document.getElementById('ce2Alert');
    if (app) {
      if (alert && alert.parentNode === app) {
        app.insertBefore(bar, alert.nextSibling);
      } else {
        app.insertBefore(bar, app.children[1] || null);
      }
    } else {
      document.body.appendChild(bar);
    }
    bar.querySelector('[data-nudge-dismiss]')?.addEventListener('click', function () {
      bar.remove();
      if (onDismiss) onDismiss();
    });
    bar.querySelector('[data-nudge-action]')?.addEventListener('click', function () {
      var input = document.getElementById('ce2Input');
      if (input) {
        input.value = 'Formation check-in: ';
        input.focus();
      }
      bar.remove();
      if (onDismiss) onDismiss();
    });
  }

  function maybeFormationNudge(me) {
    if (!me) return;
    var key = 'ce2_nudge_' + dayKey();
    if (localStorage.getItem(key)) return;
    showBanner(
      'ce2-formation-nudge',
      '<span>Weekly formation check-in — share a brief update with your circle.</span>' +
        '<button type="button" class="ce2-btn ce2-btn-ghost" data-nudge-action>Draft</button>' +
        '<button type="button" class="ce2-nudge-x" data-nudge-dismiss aria-label="Dismiss">×</button>',
      function () {
        localStorage.setItem(key, '1');
      }
    );
  }

  function init(me) {
    if (!me || me.isAdmin) return;
    window.setTimeout(function () {
      maybeFormationNudge(me);
    }, 1200);
  }

  global.Ce2Nudges = { init: init };
})(typeof window !== 'undefined' ? window : global);
