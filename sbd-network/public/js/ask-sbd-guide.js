/**
 * ASK SBD — lightweight guided help for the PWA.
 *
 * This MVP is intentionally not AI. It gives approved, deterministic answers
 * and routes visitors to existing surfaces without crowding the dashboard.
 */
(function (root) {
  'use strict';

  var VERSION = 4;

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

  var ADVANCED_TOPICS = [
    {
      id: 'marriage-communication',
      label: 'Marriage communication',
      prompt: 'Help with marriage communication',
      keywords: ['marriage', 'married', 'spouse', 'wife', 'husband', 'communication', 'conflict', 'argue', 'argument'],
      title: 'Start with communication formation',
      body:
        'If the pain point is marriage communication, begin with Learn and choose the communication or relationship formation path. Use Boards for reflection and CE2/messages when you need in-context support from a group or facilitator.',
      details:
        'A simple path is: learn the communication framework, notice the pattern you keep repeating, then practice one better conversation. If you are in a group, use Messages so the support stays inside SBD Network.',
      ctas: [
        { label: 'Open Learn', href: '/learn.html' },
        { label: 'Open Messages', href: '/communication-v2/' },
      ],
    },
    {
      id: 'membership-fit',
      label: 'Membership fit',
      prompt: 'Which plan fits me?',
      keywords: ['plan', 'price', 'pricing', 'membership', 'tier', 'premium', 'elite', 'foundation', 'free', 'pay'],
      title: 'Choose the tier by the level of structure you need',
      body:
        'Explore is best for a free preview. Foundation is best for starting structured formation. Premium fits users who want deeper access, certificates, progress boards, and support. Elite is for the fullest SBD and MV ecosystem.',
      details:
        'If you are unsure, start with the free preview. Choose Foundation when you want a structured entry point, Premium when you want deeper learning and certificates, and Elite when you want the fullest SBD and MV experience.',
      ctas: [
        { label: 'Compare Plans', href: '/pricing.html' },
        { label: 'Start Free', href: '/auth?next=/learn&src=ask-sbd-advanced' },
      ],
    },
    {
      id: 'where-start',
      label: 'Where to start',
      prompt: 'Where should I start?',
      keywords: ['start', 'begin', 'new', 'first', 'lost', 'confused', 'onboarding'],
      title: 'Start with one clear next step',
      body:
        'If you are new, go to Learn first. Choose the path closest to your current season, then use Boards to reflect and ASK SBD when you need help deciding what to open next.',
      details:
        'Start with one clear area instead of trying to understand everything at once. If you want structure, begin in Learn. If you want community context, open Boards. If access is confusing, compare the membership plans.',
      ctas: [
        { label: 'Begin in Learn', href: '/learn.html' },
        { label: 'Create Account', href: '/auth?next=/learn&src=ask-sbd-start' },
      ],
    },
    {
      id: 'boards-community',
      label: 'Boards and community',
      prompt: 'Explain Boards',
      keywords: ['board', 'boards', 'community', 'conversation', 'story', 'stories', 'prompt', 'prompts'],
      title: 'Boards move the learning into practice',
      body:
        'Boards are the community and reflection layer of SBD. Courses teach structure; Boards help users process, discuss, and practice formation through conversations, stories, and prompts.',
      details:
        'Use Boards alongside the courses. Courses give you structure; Boards help you reflect, respond, and see how the work shows up in real conversations and stories.',
      ctas: [
        { label: 'Open Boards', href: '/boards.html' },
        { label: 'Open Messages', href: '/communication-v2/' },
      ],
    },
    {
      id: 'mv-house-expression',
      label: 'MV House',
      prompt: 'Explain MV House',
      keywords: ['mv', 'house', 'fashion', 'expression', 'masculine', 'feminine', 'presence', 'muliebrity', 'virility'],
      title: 'MV House is the expression layer',
      body:
        'MV House connects inner formation to outward presentation: masculine presence, feminine expression, image, fashion, and embodied identity. It is not just appearance; it is formation made visible.',
      details:
        'Use MV House when you want the expression side of formation: presence, image, fashion, and embodied identity. It is not just about appearance; it is about what your presentation communicates.',
      ctas: [{ label: 'Visit MV House', href: '/mv-house.html' }],
    },
    {
      id: 'courses-certificates',
      label: 'Courses and certificates',
      prompt: 'Courses and certificates',
      keywords: ['course', 'courses', 'school', 'lesson', 'certificate', 'certificates', 'learn', 'training'],
      title: 'Courses give the structured path',
      body:
        'Use Learn when you want the organized path: schools, courses, lessons, and certificates. If a course is locked, compare membership tiers to see which access level fits your goal.',
      details:
        'Choose Courses when you want sequence and progress. Certificates help mark completed formation work and can show where you have already invested attention and discipline.',
      ctas: [
        { label: 'Open Courses', href: '/learn.html' },
        { label: 'View Certificates', href: '/certificates.html' },
      ],
    },
    {
      id: 'shop-resources',
      label: 'Shop and resources',
      prompt: 'Shop and resources',
      keywords: ['shop', 'buy', 'book', 'books', 'resource', 'resources', 'materials', 'product'],
      title: 'Use Shop and Resources for practical tools',
      body:
        'The Shop and resource library support the formation journey with books, products, and practical materials. Courses give the path; resources help you apply it.',
      details:
        'If you are not ready for a full course path, resources can give you a practical starting point. When you want a more structured journey, return to Learn.',
      ctas: [
        { label: 'Browse Shop', href: '/shop.html' },
        { label: 'Open Resources', href: '/resources.html' },
      ],
    },
    {
      id: 'facilitator-help',
      label: 'Facilitator support',
      prompt: 'Help for facilitators',
      keywords: ['coach', 'facilitator', 'host', 'cohort', 'group', 'nudge', 'quiet', 'member'],
      title: 'Facilitators should use CE2 staff tools',
      body:
        'If you host or facilitate a group, use CE2 and the coach inbox to see who may need a nudge, then reply inside the SBD Network. Staff tools stay behind the existing role checks.',
      details:
        'If you are a host or facilitator, open Messages and use the staff tools available to your role. If you do not see those tools, your account may not have facilitator access.',
      ctas: [{ label: 'Open Messages', href: '/communication-v2/?hub=coach' }],
    },
    {
      id: 'locked-content',
      label: 'Locked content',
      prompt: 'Why is something locked?',
      keywords: ['locked', 'unlock', 'access', 'upgrade', 'paywall', 'open', 'blocked', 'subscription'],
      title: 'Locked content usually means a higher access level is needed',
      body:
        'If a course, certificate, or feature is locked, compare the membership plans to see which level opens the path you want.',
      details:
        'Start by naming what you want to access: courses, certificates, Boards, MV House, or support. Then choose the plan that unlocks that part of the journey instead of upgrading blindly.',
      ctas: [
        { label: 'Compare Plans', href: '/pricing.html' },
        { label: 'Open Learn', href: '/learn.html' },
      ],
    },
    {
      id: 'relationship-season',
      label: 'Relationship season',
      prompt: 'Is this for my season?',
      keywords: ['single', 'dating', 'engaged', 'married', 'marriage', 'relationship', 'season', 'preparing'],
      title: 'SBD can meet you at your current relationship season',
      body:
        'SBD is useful whether you are single, dating, engaged, married, or rebuilding clarity. The best starting point depends on the question you are carrying right now.',
      details:
        'If you are single or dating, start with identity and preparation. If you are married, start with communication and formation. If you are unsure, begin in Learn and choose the path closest to your present season.',
      ctas: [
        { label: 'Open Learn', href: '/learn.html' },
        { label: 'Compare Plans', href: '/pricing.html' },
      ],
    },
  ];

  var PAGE_CONTEXTS = {
    dashboard: {
      match: ['/', '/dashboard.html'],
      intro: 'Quick answers for understanding the platform. Choose a topic, or ask something more specific.',
      promptIds: ['where-start', 'membership-fit', 'marriage-communication', 'boards-community', 'mv-house-expression', 'courses-certificates'],
    },
    pricing: {
      match: ['/pricing.html'],
      intro: 'Quick help choosing the right membership and understanding access.',
      promptIds: ['membership-fit', 'locked-content', 'where-start', 'courses-certificates', 'relationship-season', 'shop-resources'],
    },
    learn: {
      match: ['/learn.html', '/courses.html', '/schools.html'],
      intro: 'Quick help finding the right course, certificate, or next lesson.',
      promptIds: ['courses-certificates', 'where-start', 'locked-content', 'relationship-season', 'marriage-communication', 'membership-fit'],
    },
    boards: {
      match: ['/boards.html', '/board.html'],
      intro: 'Quick help understanding community, reflection, and group conversations.',
      promptIds: ['boards-community', 'marriage-communication', 'where-start', 'facilitator-help', 'relationship-season', 'membership-fit'],
    },
    mvHouse: {
      match: ['/mv-house.html'],
      intro: 'Quick help with expression, presence, image, and identity.',
      promptIds: ['mv-house-expression', 'relationship-season', 'membership-fit', 'where-start', 'courses-certificates', 'shop-resources'],
    },
    shop: {
      match: ['/shop.html', '/resources.html'],
      intro: 'Quick help choosing resources, products, and practical next steps.',
      promptIds: ['shop-resources', 'courses-certificates', 'membership-fit', 'where-start', 'locked-content', 'mv-house-expression'],
    },
  };

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

  function normalize(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
  }

  function topicScore(topic, query) {
    var haystack = normalize(query);
    var score = 0;
    (topic.keywords || []).forEach(function (keyword) {
      if (haystack.indexOf(keyword) !== -1) score += keyword.length > 5 ? 2 : 1;
    });
    return score;
  }

  function findAdvancedAnswer(query) {
    var fallback = {
      id: 'fallback',
      label: 'General guidance',
      title: 'Start with the closest SBD path',
      body:
        'I can help best when you name the area: membership, marriage communication, Boards, MV House, courses, certificates, shop, or facilitator support. For now, start with Learn if you want structure, Pricing if you need access clarity, or Boards if you want community context.',
      details:
        'If you are not sure what to ask yet, start with one of the main paths: Learn for structure, Pricing for access, Boards for community, or MV House for expression.',
      ctas: [
        { label: 'Open Learn', href: '/learn.html' },
        { label: 'Compare Plans', href: '/pricing.html' },
        { label: 'Open Boards', href: '/boards.html' },
      ],
    };
    var best = null;
    var bestScore = 0;
    ADVANCED_TOPICS.forEach(function (topic) {
      var score = topicScore(topic, query);
      if (score > bestScore) {
        best = topic;
        bestScore = score;
      }
    });
    return best || fallback;
  }

  function findAdvancedTopic(id) {
    for (var i = 0; i < ADVANCED_TOPICS.length; i += 1) {
      if (ADVANCED_TOPICS[i].id === id) return ADVANCED_TOPICS[i];
    }
    return null;
  }

  function detectPageContext(pathname) {
    var path = String(pathname || '/').replace(/\/index\.html$/, '/');
    var keys = Object.keys(PAGE_CONTEXTS);
    for (var i = 0; i < keys.length; i += 1) {
      var context = PAGE_CONTEXTS[keys[i]];
      for (var j = 0; j < context.match.length; j += 1) {
        if (path === context.match[j]) return context;
      }
    }
    return PAGE_CONTEXTS.dashboard;
  }

  function advancedTopicsForContext(context) {
    var seen = {};
    var ordered = [];
    (context && context.promptIds ? context.promptIds : []).forEach(function (id) {
      var topic = findAdvancedTopic(id);
      if (topic && !seen[topic.id]) {
        seen[topic.id] = true;
        ordered.push(topic);
      }
    });
    ADVANCED_TOPICS.forEach(function (topic) {
      if (!seen[topic.id]) {
        seen[topic.id] = true;
        ordered.push(topic);
      }
    });
    return ordered;
  }

  function isDashboardContext(context) {
    return context === PAGE_CONTEXTS.dashboard;
  }

  function quickItemsForContext(context) {
    if (isDashboardContext(context)) return QUESTIONS;
    return advancedTopicsForContext(context).slice(0, 6);
  }

  function quickItemHtml(item) {
    if (item && item.details) return advancedAnswerHtml(item);
    return answerHtml(item || QUESTIONS[0]);
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

  function moreHtml(details) {
    if (!details) return '';
    return (
      '<details class="ask-sbd-more">' +
      '<summary>Show more</summary>' +
      '<p>' +
      escapeHtml(details) +
      '</p>' +
      '</details>'
    );
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

  function advancedAnswerHtml(result, query) {
    result = result || findAdvancedAnswer(query);
    return (
      '<article class="ask-sbd-answer ask-sbd-advanced-answer" aria-live="polite">' +
      '<p class="ask-sbd-answer-kicker">Recommended guidance</p>' +
      '<h3>' +
      escapeHtml(result.title) +
      '</h3>' +
      '<p>' +
      escapeHtml(result.body) +
      '</p>' +
      '<div class="ask-sbd-ctas">' +
      ctaHtml(result.ctas) +
      '</div>' +
      moreHtml(result.details) +
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
      '<p class="ask-sbd-intro" id="askSbdIntro">Quick answers for understanding the platform. Choose a topic, or ask something more specific.</p>' +
      '<div class="ask-sbd-quick" id="askSbdQuick">' +
      '<div class="ask-sbd-questions" id="askSbdQuestions" role="list"></div>' +
      '<div class="ask-sbd-answer-slot" id="askSbdAnswerSlot"></div>' +
      '<div class="ask-sbd-deeper">' +
      '<p>Need something more specific?</p>' +
      '<button type="button" class="ask-sbd-advanced-open" id="askSbdAdvancedOpen">Ask Anything</button>' +
      '</div>' +
      '</div>' +
      '<div class="ask-sbd-advanced" id="askSbdAdvanced" hidden>' +
      '<button type="button" class="ask-sbd-back-to-quick" id="askSbdBackToQuick">← Quick guide</button>' +
      '<p class="ask-sbd-advanced-copy">Ask directly, or swipe the prompts for ideas.</p>' +
      '<div class="ask-sbd-prompts" id="askSbdPrompts" role="list"></div>' +
      '<form class="ask-sbd-form" id="askSbdForm">' +
      '<label class="ask-sbd-input-label" for="askSbdInput">Ask SBD a question</label>' +
      '<div class="ask-sbd-input-row">' +
      '<input id="askSbdInput" class="ask-sbd-input" type="text" autocomplete="off" placeholder="Example: Which plan fits me?">' +
      '<button type="submit" class="ask-sbd-submit">Ask</button>' +
      '</div>' +
      '</form>' +
      '<div class="ask-sbd-advanced-output" id="askSbdAdvancedOutput"></div>' +
      '</div>' +
      '</section>' +
      '</div>'
    );
  }

  function setMode(mode, els) {
    var advanced = mode === 'advanced';
    els.panel.classList.toggle('is-advanced', advanced);
    els.quick.hidden = advanced;
    els.advanced.hidden = !advanced;
    if (advanced) {
      window.setTimeout(function () {
        els.input.focus();
      }, 0);
    }
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
    var pageContext = opts.pageContext || detectPageContext(root.location && root.location.pathname);
    var host = document.createElement('div');
    host.className = 'ask-sbd-root';
    host.innerHTML = mountHtml();
    document.body.appendChild(host);

    var els = {
      root: host,
      launcher: document.getElementById('askSbdLauncher'),
      sheet: document.getElementById('askSbdSheet'),
      panel: host.querySelector('.ask-sbd-panel'),
      backdrop: document.getElementById('askSbdBackdrop'),
      close: document.getElementById('askSbdClose'),
      intro: document.getElementById('askSbdIntro'),
      quick: document.getElementById('askSbdQuick'),
      questions: document.getElementById('askSbdQuestions'),
      answer: document.getElementById('askSbdAnswerSlot'),
      advancedOpen: document.getElementById('askSbdAdvancedOpen'),
      advanced: document.getElementById('askSbdAdvanced'),
      backToQuick: document.getElementById('askSbdBackToQuick'),
      prompts: document.getElementById('askSbdPrompts'),
      form: document.getElementById('askSbdForm'),
      input: document.getElementById('askSbdInput'),
      advancedOutput: document.getElementById('askSbdAdvancedOutput'),
    };

    var quickItems = quickItemsForContext(pageContext);
    els.intro.textContent = pageContext.intro || PAGE_CONTEXTS.dashboard.intro;

    quickItems.forEach(function (q, index) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ask-sbd-question' + (index === 0 ? ' is-active' : '');
      btn.textContent = q.prompt || q.label;
      btn.dataset.askSbdQuick = q.id;
      btn.setAttribute('role', 'listitem');
      els.questions.appendChild(btn);
    });

    advancedTopicsForContext(pageContext).slice(0, 6).forEach(function (topic) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ask-sbd-prompt';
      btn.textContent = topic.prompt || topic.label;
      btn.dataset.askSbdPrompt = topic.prompt || topic.label;
      btn.setAttribute('role', 'listitem');
      els.prompts.appendChild(btn);
    });

    function select(id) {
      var q = quickItems.filter(function (item) {
        return item.id === id;
      })[0] || quickItems[0] || QUESTIONS[0];
      els.answer.innerHTML = quickItemHtml(q);
      els.questions.querySelectorAll('.ask-sbd-question').forEach(function (btn) {
        btn.classList.toggle('is-active', btn.dataset.askSbdQuick === q.id);
      });
    }

    function answerAdvanced(query) {
      var cleanQuery = String(query || '').trim();
      if (!cleanQuery) {
        els.advancedOutput.innerHTML =
          '<p class="ask-sbd-empty">Ask about membership, where to start, courses, Boards, MV House, shop, or facilitator support.</p>';
        return;
      }
      els.advancedOutput.innerHTML = advancedAnswerHtml(findAdvancedAnswer(cleanQuery), cleanQuery);
    }

    select((opts.initialQuestion || (quickItems[0] && quickItems[0].id) || QUESTIONS[0].id));

    els.launcher.addEventListener('click', function () {
      setOpen(true, els);
    });
    els.close.addEventListener('click', function () {
      setOpen(false, els);
      setMode('quick', els);
    });
    els.backdrop.addEventListener('click', function () {
      setOpen(false, els);
      setMode('quick', els);
    });
    els.questions.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-ask-sbd-quick]');
      if (!btn) return;
      select(btn.dataset.askSbdQuick);
    });
    els.advancedOpen.addEventListener('click', function () {
      setMode('advanced', els);
      els.advancedOutput.innerHTML = '';
    });
    els.backToQuick.addEventListener('click', function () {
      setMode('quick', els);
    });
    els.prompts.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-ask-sbd-prompt]');
      if (!btn) return;
      els.input.value = btn.dataset.askSbdPrompt || '';
      answerAdvanced(els.input.value);
    });
    els.form.addEventListener('submit', function (event) {
      event.preventDefault();
      answerAdvanced(els.input.value);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !els.sheet.hidden) {
        setOpen(false, els);
        setMode('quick', els);
      }
    });
  }

  root.SbdAskGuide = {
    VERSION: VERSION,
    QUESTIONS: QUESTIONS,
    ADVANCED_TOPICS: ADVANCED_TOPICS,
    PAGE_CONTEXTS: PAGE_CONTEXTS,
    answerHtml: answerHtml,
    advancedAnswerHtml: advancedAnswerHtml,
    ctaHtml: ctaHtml,
    findQuestion: findQuestion,
    findAdvancedAnswer: findAdvancedAnswer,
    findAdvancedTopic: findAdvancedTopic,
    detectPageContext: detectPageContext,
    advancedTopicsForContext: advancedTopicsForContext,
    quickItemsForContext: quickItemsForContext,
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
