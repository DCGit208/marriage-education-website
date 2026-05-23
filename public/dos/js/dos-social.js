/**
 * DOS §8 — Social deployment center (Phase 7).
 */
(function (global) {
  'use strict';

  var PLATFORMS = [
    { id: 'whatsapp', label: 'WhatsApp', icon: 'fa-brands fa-whatsapp', color: '#25D366' },
    { id: 'facebook', label: 'Facebook', icon: 'fa-brands fa-facebook', color: '#1877F2' },
    { id: 'instagram', label: 'Instagram', icon: 'fa-brands fa-instagram', color: '#E4405F' },
    { id: 'tiktok', label: 'TikTok', icon: 'fa-brands fa-tiktok', color: '#000' },
    { id: 'linkedin', label: 'LinkedIn', icon: 'fa-brands fa-linkedin', color: '#0A66C2' }
  ];

  var CAPTIONS = [
    {
      id: 'foundation',
      title: 'Foundation access invite',
      text: 'Strong marriages build strong communities. Marriage Education Foundation access — structured, affordable, mobile-friendly.\n\nStart here: [LINK]\n\nMessage me if you want help activating this week.'
    },
    {
      id: 'sbd',
      title: 'SBD Network app',
      text: 'The SBD Network app puts marriage literacy in your pocket — modules, tools, and ongoing support.\n\nJoin with my link: [LINK]'
    },
    {
      id: 'ambassador',
      title: 'Recruit ambassadors',
      text: 'We are expanding deployment ambassadors in our region. If you are serious about community impact and recurring income, let us talk.\n\nLearn more: [LINK]'
    },
    {
      id: 'testimony',
      title: 'Impact story',
      text: 'Every couple we equip is a household stabilized. I am deploying Marriage Education access in my network — ask me how to get started: [LINK]'
    }
  ];

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { alert('Copied to clipboard'); });
    }
    return Promise.resolve();
  }

  function renderSocialDeploy(container, primaryLink) {
    if (!container) return;
    var link = primaryLink || '';

    var platformBtns = PLATFORMS.map(function (p) {
      return '<button type="button" class="dos-btn dos-social-platform" data-platform="' + p.id + '" ' +
        'style="border-left:4px solid ' + p.color + '"><i class="' + p.icon + '"></i> ' + p.label + '</button>';
    }).join('');

    var captions = CAPTIONS.map(function (c) {
      var text = c.text.replace(/\[LINK\]/g, link);
      return '<div class="dos-script-card">' +
        '<h4>' + c.title + '</h4>' +
        '<p class="dos-script-body" style="white-space:pre-wrap">' + text + '</p>' +
        '<button type="button" class="dos-btn dos-btn-primary dos-copy-caption" data-caption="' +
        encodeURIComponent(text) + '"><i class="fa-solid fa-copy"></i> Copy caption</button></div>';
    }).join('');

    container.innerHTML =
      '<div class="dos-card dos-recurring-card">' +
      '<h3><i class="fa-solid fa-share-nodes"></i> Social deployment center</h3>' +
      '<p style="font-size:13px;color:#71717a;margin:0 0 16px">Deploy on social with ready captions. Daily ops target: <strong>1 post/day</strong> (log in Daily ops).</p>' +
      '<div class="dos-link-row" style="margin-bottom:16px">' +
      '<div class="dos-link-box" style="flex:1;font-size:12px">' + (link || 'Set your link in Deployment links') + '</div></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">' + platformBtns + '</div></div>' +
      '<div class="dos-card"><h3><i class="fa-solid fa-pen"></i> Caption library</h3>' + captions + '</div>';

    container.querySelectorAll('.dos-copy-caption').forEach(function (btn) {
      btn.addEventListener('click', function () {
        copyText(decodeURIComponent(btn.getAttribute('data-caption')));
      });
    });

    container.querySelectorAll('.dos-social-platform').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-platform');
        var cap = CAPTIONS[0].text.replace(/\[LINK\]/g, link);
        if (id === 'whatsapp') {
          window.open('https://wa.me/?text=' + encodeURIComponent(cap), '_blank');
        } else if (id === 'facebook') {
          window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(link), '_blank');
        } else {
          copyText(cap);
        }
      });
    });
  }

  global.DOSSocial = { renderSocialDeploy: renderSocialDeploy };
})(typeof window !== 'undefined' ? window : global);
