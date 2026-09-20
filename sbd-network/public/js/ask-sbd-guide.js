/**
 * ASK SBD — lightweight guided help for the PWA.
 *
 * This MVP is intentionally not AI. It gives approved, deterministic answers
 * and routes visitors to existing surfaces without crowding the dashboard.
 */
(function (root) {
  'use strict';

  var VERSION = 1;

  var QUESTIONS = [
    {
      id: 'what-is',
      label: 'What is SBD Network?',
      title: 'What is SBD Network?',
      body:
        'SBD Network is a private formation platform for relationships, identity, sexuality, expression, and marriage education. You can learn through courses, join boards, message in context, and track your growth.',
      ctas: [
        { label: 'Explore membership', href: '/pricing.html' },
        { label: 'Start free', href: '/auth?next=/learn&src=ask-sbd-start-free' },
      ],
    },
    {
      id: 'membership',
      label: 'Which membership fits me?',
      title: 'Which membership fits me?',
      body:
        'Start with Explore if you want a free preview. Foundation gives core structured learning. Premium adds fuller access, certificates, progress boards, and support. Elite is for the full school and MV ecosystem.',
      ctas: [
        { label: 'Compare plans', href: '/pricing.html' },
        { label: 'Open courses', href: '/learn.html' },
      ],
    },
    {
      id: 'start',
      label: 'Where should I start?',
      title: 'Where should I start?',
      body:
        'If you are new, begin with the free Explore path, then move into Foundation when you want structure. If you already know the problem you want to solve, open Learn and choose the school or course that matches your season.',
      ctas: [
        { label: 'Begin in Learn', href: '/learn.html' },
        { label: 'Create account', href: '/auth?next=/learn&src=ask-sbd-start' },
      ],
    },
    {
      id: 'boards',
      label: 'What are Boards?',
      title: 'What are Boards?',
      body:
        'Boards are the community layer: conversations, stories, prompts, and applied reflection around formation topics. They help the work move from private learning into lived practice.',
      ctas: [
        { label: 'Preview boards', href: '/boards.html' },
        { label: 'Open messages', href: '/communication-v2/' },
      ],
    },
    {
      id: 'mv-house',
      label: 'What is MV House?',
      title: 'What is MV House?',
      body:
        'MV House is the expression layer of SBD: masculine presence, feminine expression, fashion, image, and embodied identity. It connects inner formation to outward presentation.',
      ctas: [{ label: 'Visit MV House', href: '/mv-house.html' }],
    },
    {
      id: 'shop',
      label: 'What can I buy?',
      title: 'What can I buy?',
      body:
        'The Shop holds resources, materials, and products that support your formation journey. Browse the catalog when you want practical tools alongside the courses and community.',
      ctas: [{ label: 'Browse shop', href: '/shop.html' }],
    },
  ];

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function findQuestion(id) {
    for (var i = 0; i < QUESTIONS.length; i += 1) {
      if (QUESTIONS[i].id === id) return QUESTIONS[i];
    }
    return QUESTIONS[0];
  }

  function ctaHtml(ctas) {
    return (ctas || [])
      .map(function (cta) {
        return (
          '<a class="ask-sbd-cta" href="' +
          escapeHtml(cta.href) +
          '">' +
          escapeHtml(cta.label) +
          '</a>'
        );
      })
      .join('');
  }

  function answerHtml(question) {
    question = question || QUESTIONS[0];
    return (
      '<article class="ask-sbd-answer" aria-live="polite">' +
      '<p class="ask-sbd-answer-kicker">Guided answer</p>' +
      '<h3>' +
      escapeHtml(question.title) +
      '</h3>' +
      '<p>' +
      escapeHtml(question.body) +
      '</p>' +
      '<div class="ask-sbd-ctas">' +
      ctaHtml(question.ctas) +
      '</div>' +
      '</article>'
    );
  }

  function mountHtml() {
    return (
      '<button type="button" class="ask-sbd-launcher" id="askSbdLauncher" aria-haspopup="dialog" aria-controls="askSbdSheet" aria-expanded="false">' +
      '<span class="ask-sbd-launcher-mark" aria-hidden="true">?</span>' +
      '<span>ASK SBD</span>' +
      '</button>' +
      '<div class="ask-sbd-sheet" id="askSbdSheet" hidden role="dialog" aria-modal="false" aria-labelledby="askSbdTitle">' +
      '<button type="button" class="ask-sbd-backdrop" id="askSbdBackdrop" aria-label="Close ASK SBD"></button>' +
      '<section class="ask-sbd-panel">' +
      '<div class="ask-sbd-grab" aria-hidden="true"></div>' +
      '<header class="ask-sbd-head">' +
      '<div>' +
      '<p class="ask-sbd-eyebrow">SBD Guide</p>' +
      '<h2 id="askSbdTitle">ASK SBD</h2>' +
      '</div>' +
      '<button type="button" class="ask-sbd-close" id="askSbdClose" aria-label="Close ASK SBD">×</button>' +
      '</header>' +
      '<p class="ask-sbd-intro">Quick answers for understanding the platform. This guide is scripted, not AI.</p>' +
      '<div class="ask-sbd-questions" id="askSbdQuestions" role="list"></div>' +
      '<div class="ask-sbd-answer-slot" id="askSbdAnswerSlot"></div>' +
      '</section>' +
      '</div>'
    );
  }

  function setOpen(open, els) {
    els.sheet.hidden = !open;
    els.launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('ask-sbd-open', open);
    if (open) {
      window.setTimeout(function () {
        if (els.close) els.close.focus();
      }, 0);
    } else if (document.activeElement && els.sheet.contains(document.activeElement)) {
      els.launcher.focus();
    }
  }

  function init(opts) {
    opts = opts || {};
    if (document.getElementById('askSbdLauncher')) return;
    var host = document.createElement('div');
    host.className = 'ask-sbd-root';
    host.innerHTML = mountHtml();
    document.body.appendChild(host);

    var els = {
      root: host,
      launcher: document.getElementById('askSbdLauncher'),
      sheet: document.getElementById('askSbdSheet'),
      backdrop: document.getElementById('askSbdBackdrop'),
      close: document.getElementById('askSbdClose'),
      questions: document.getElementById('askSbdQuestions'),
      answer: document.getElementById('askSbdAnswerSlot'),
    };

    QUESTIONS.forEach(function (q, index) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ask-sbd-question' + (index === 0 ? ' is-active' : '');
      btn.textContent = q.label;
      btn.dataset.askSbdQuestion = q.id;
      btn.setAttribute('role', 'listitem');
      els.questions.appendChild(btn);
    });

    function select(id) {
      var q = findQuestion(id);
      els.answer.innerHTML = answerHtml(q);
      els.questions.querySelectorAll('.ask-sbd-question').forEach(function (btn) {
        btn.classList.toggle('is-active', btn.dataset.askSbdQuestion === q.id);
      });
    }

    select((opts.initialQuestion || QUESTIONS[0].id));

    els.launcher.addEventListener('click', function () {
      setOpen(true, els);
    });
    els.close.addEventListener('click', function () {
      setOpen(false, els);
    });
    els.backdrop.addEventListener('click', function () {
      setOpen(false, els);
    });
    els.questions.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-ask-sbd-question]');
      if (!btn) return;
      select(btn.dataset.askSbdQuestion);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !els.sheet.hidden) setOpen(false, els);
    });
  }

  root.SbdAskGuide = {
    VERSION: VERSION,
    QUESTIONS: QUESTIONS,
    answerHtml: answerHtml,
    ctaHtml: ctaHtml,
    findQuestion: findQuestion,
    init: init,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        init();
      });
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : this);
