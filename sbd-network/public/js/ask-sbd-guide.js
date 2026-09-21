/**
 * ASK SBD — lightweight guided help for the PWA.
 *
 * This MVP is intentionally not AI. It gives approved, deterministic answers
 * and routes visitors to existing surfaces without crowding the dashboard.
 */
(function (root) {
  'use strict';

  var VERSION = 5;

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
    {
      id: 'shop-first-buy',
      label: 'Shop first buy',
      prompt: 'What should I buy first?',
      keywords: ['buy first', 'first buy', 'purchase first', 'what should i buy', 'shop first'],
      title: 'Start with the resource that matches your current need',
      body:
        'If you need structure, begin with Learn first. If you need practical support, choose a resource that matches the issue in front of you: communication, identity, expression, or preparation.',
      details:
        'A resource is most useful when it supports a real next step. Choose something you can apply this week, then return to Learn or Boards when you want structure and reflection around it.',
      ctas: [
        { label: 'Browse Shop', href: '/shop.html' },
        { label: 'Open Learn', href: '/learn.html' },
      ],
    },
    {
      id: 'shop-season-resource',
      label: 'Shop by season',
      prompt: 'What resource fits my season?',
      keywords: ['resource fits', 'my season', 'single resource', 'married resource', 'dating resource'],
      title: 'Choose resources by the season you are in',
      body:
        'If you are preparing, choose resources that build identity and clarity. If you are married, choose resources that support communication, formation, and consistent practice.',
      details:
        'Your season matters because the right resource should meet the question you are already carrying. Start with the most present need, not the biggest catalog item.',
      ctas: [
        { label: 'Browse Shop', href: '/shop.html' },
        { label: 'Find Courses', href: '/learn.html' },
      ],
    },
    {
      id: 'shop-course-tie',
      label: 'Shop and courses',
      prompt: 'Are these tied to courses?',
      keywords: ['tied to courses', 'course resource', 'resources with courses', 'shop learn'],
      title: 'Shop resources support the course journey',
      body:
        'Some resources stand on their own, while others work best alongside Learn. Use courses for sequence, then use Shop resources to apply, reinforce, or deepen the work.',
      details:
        'If you want a complete path, start in Learn. If you want a practical tool for one area, start in Shop and connect it back to the course or Board that matches that topic.',
      ctas: [
        { label: 'Open Learn', href: '/learn.html' },
        { label: 'Browse Shop', href: '/shop.html' },
      ],
    },
    {
      id: 'shop-marriage-communication',
      label: 'Shop communication',
      prompt: 'What helps with communication?',
      keywords: ['communication resource', 'marriage communication resource', 'argue', 'conflict resource'],
      title: 'Choose a resource that helps you practice better conversations',
      body:
        'For communication, look for resources that help you name patterns, prepare a better conversation, and reflect afterward. Pair the resource with Learn when you want a fuller formation path.',
      details:
        'Do not look for a quick script only. The stronger move is to understand the pattern, change the posture, and practice one conversation differently.',
      ctas: [
        { label: 'Browse Shop', href: '/shop.html' },
        { label: 'Open Messages', href: '/communication-v2/' },
      ],
    },
    {
      id: 'shop-expression',
      label: 'Shop expression',
      prompt: 'What supports identity or expression?',
      keywords: ['identity resource', 'expression resource', 'fashion resource', 'mv resource'],
      title: 'Use expression resources when formation needs to become visible',
      body:
        'If your focus is image, presence, or expression, start with MV House and use Shop resources that support how identity becomes embodied and presented.',
      details:
        'Expression resources should help connect what is happening internally with how you show up outwardly: presence, image, speech, styling, and confidence.',
      ctas: [
        { label: 'Visit MV House', href: '/mv-house.html' },
        { label: 'Browse Shop', href: '/shop.html' },
      ],
    },
    {
      id: 'shop-use-resources',
      label: 'Use resources',
      prompt: 'How should I use these resources?',
      keywords: ['use resources', 'how use resource', 'apply resource', 'practice resource'],
      title: 'Use each resource with one clear action',
      body:
        'Pick one resource, decide what it should help you practice, and apply it before collecting more. SBD works best when learning becomes practice.',
      details:
        'A simple rhythm is: read or use the resource, write one reflection, practice one action, then return to Learn or Boards to keep the formation moving.',
      ctas: [
        { label: 'Browse Shop', href: '/shop.html' },
        { label: 'Open Boards', href: '/boards.html' },
      ],
    },
    {
      id: 'learn-course-start',
      label: 'Course start',
      prompt: 'Which course should I start with?',
      keywords: ['which course', 'start course', 'course start', 'study first'],
      title: 'Start with the course closest to your present question',
      body:
        'Choose the course that matches what you are actively trying to understand or repair. If you need clarity first, begin with the foundational path before jumping ahead.',
      details:
        'The best course is not always the most advanced one. Start where you can practice immediately, then move deeper as the framework becomes clear.',
      ctas: [
        { label: 'Open Learn', href: '/learn.html' },
        { label: 'Compare Plans', href: '/pricing.html' },
      ],
    },
    {
      id: 'learn-school-fit',
      label: 'School fit',
      prompt: 'What school fits my season?',
      keywords: ['which school', 'school fits', 'school start', 'my season school'],
      title: 'Choose a school by your formation focus',
      body:
        'If your focus is relationship clarity, start with the relationship path. If your focus is expression and identity, MV House may be the better doorway.',
      details:
        'Let the question choose the school: communication, preparation, identity, expression, sexuality, marriage, or leadership. Then follow the sequence instead of sampling randomly.',
      ctas: [{ label: 'Open Learn', href: '/learn.html' }],
    },
    {
      id: 'learn-certificates',
      label: 'Certificates',
      prompt: 'How do certificates work?',
      keywords: ['certificate', 'certificates', 'certification', 'completion'],
      title: 'Certificates mark completed formation work',
      body:
        'Certificates help you see and show completed progress. They matter most when they represent real attention, practice, and completion inside a course path.',
      details:
        'Treat certificates as evidence of completed work, not just badges. Use them to track what you have finished and what formation area may need attention next.',
      ctas: [
        { label: 'View Certificates', href: '/certificates.html' },
        { label: 'Open Learn', href: '/learn.html' },
      ],
    },
    {
      id: 'learn-next',
      label: 'Next study',
      prompt: 'What should I study after this?',
      keywords: ['after this', 'next lesson', 'next course', 'what next study'],
      title: 'Move to the next course that deepens the same work',
      body:
        'After finishing a lesson or course, choose the next step that continues the same formation thread. Do not jump topics unless your current question has changed.',
      details:
        'If the work was communication, continue into relationship practice. If it was identity, continue into expression. If it was preparation, move toward marriage and commitment formation.',
      ctas: [
        { label: 'Open Learn', href: '/learn.html' },
        { label: 'Open Boards', href: '/boards.html' },
      ],
    },
    {
      id: 'learn-boards-link',
      label: 'Learn and Boards',
      prompt: 'How do courses connect to Boards?',
      keywords: ['courses connect boards', 'learn boards', 'course board', 'reflection board'],
      title: 'Courses teach; Boards help you process',
      body:
        'Use Learn for structure and Boards for reflection. When a lesson raises a question, Boards help you process it through prompts, stories, and community context.',
      details:
        'This keeps formation from staying theoretical. Learn gives the framework; Boards help you notice what it means in real life.',
      ctas: [
        { label: 'Open Boards', href: '/boards.html' },
        { label: 'Open Learn', href: '/learn.html' },
      ],
    },
    {
      id: 'boards-what-post',
      label: 'Board posts',
      prompt: 'What should I post?',
      keywords: ['what post', 'what should i post', 'board post', 'post boards'],
      title: 'Post what helps you reflect, not what performs',
      body:
        'A good Board post names what you are noticing, learning, or practicing. It can be a question, reflection, story, or response to a prompt.',
      details:
        'Keep it honest and useful. You do not need to sound finished. Boards work best when the post helps formation become visible and discussable.',
      ctas: [{ label: 'Open Boards', href: '/boards.html' }],
    },
    {
      id: 'boards-how-work',
      label: 'How Boards work',
      prompt: 'How do Boards work?',
      keywords: ['how boards work', 'boards work', 'what are boards'],
      title: 'Boards are for reflection and applied formation',
      body:
        'Boards give you a place to process lessons, stories, prompts, and conversations. They help the course work move into practice.',
      details:
        'Use Boards when you need context, examples, reflection, or community around what you are learning. Use Learn when you need sequence.',
      ctas: [
        { label: 'Open Boards', href: '/boards.html' },
        { label: 'Open Learn', href: '/learn.html' },
      ],
    },
    {
      id: 'boards-join-conversation',
      label: 'Join conversation',
      prompt: 'How do I join a conversation?',
      keywords: ['join conversation', 'reply board', 'comment board', 'conversation'],
      title: 'Join by responding to the prompt or the formation question',
      body:
        'Read the prompt, notice the formation question underneath it, then respond with a reflection, story, or clarifying question.',
      details:
        'You do not need a perfect answer. A useful response shows what you are noticing and invites better reflection.',
      ctas: [{ label: 'Open Boards', href: '/boards.html' }],
    },
    {
      id: 'boards-course-link',
      label: 'Boards and courses',
      prompt: 'Are Boards connected to courses?',
      keywords: ['boards connected courses', 'boards courses', 'course boards'],
      title: 'Boards extend the course work into conversation',
      body:
        'Courses give the structured teaching. Boards help you reflect on it, compare stories, and practice the ideas in community.',
      details:
        'If a lesson feels important, bring the question to Boards. If a Board conversation exposes confusion, return to Learn for structure.',
      ctas: [
        { label: 'Open Boards', href: '/boards.html' },
        { label: 'Open Learn', href: '/learn.html' },
      ],
    },
    {
      id: 'boards-reflection',
      label: 'Reflection',
      prompt: 'What is a good reflection?',
      keywords: ['good reflection', 'reflect', 'reflection', 'journal'],
      title: 'A good reflection names what changed or became clear',
      body:
        'Start with what you noticed, what challenged you, and what you want to practice next. Keep it grounded in your real life.',
      details:
        'A strong reflection does not need to be long. It should help you see yourself more clearly and choose one next action.',
      ctas: [{ label: 'Open Boards', href: '/boards.html' }],
    },
    {
      id: 'boards-groups',
      label: 'Groups',
      prompt: 'How do I find my group?',
      keywords: ['find group', 'my group', 'cohort', 'group boards'],
      title: 'Your groups appear through your SBD access and memberships',
      body:
        'If you belong to a group or cohort, open Boards or Messages to find the conversations tied to your access.',
      details:
        'If you expected a group and do not see it, check your account access or open Messages. Group visibility depends on your current membership and role.',
      ctas: [
        { label: 'Open Boards', href: '/boards.html' },
        { label: 'Open Messages', href: '/communication-v2/' },
      ],
    },
    {
      id: 'pricing-plan-fit',
      label: 'Plan fit',
      prompt: 'Which plan fits me?',
      keywords: ['which plan', 'plan fits', 'membership fit', 'choose plan'],
      title: 'Choose the plan by how much structure and access you need',
      body:
        'Start free if you are exploring. Choose Foundation for structured entry, Premium for deeper course access and certificates, and Elite for the fullest SBD and MV experience.',
      details:
        'If the decision feels unclear, name what you want to unlock first: courses, certificates, MV House, support, or the full ecosystem.',
      ctas: [
        { label: 'Compare Plans', href: '/pricing.html' },
        { label: 'Start Free', href: '/auth?next=/learn&src=ask-sbd-pricing' },
      ],
    },
    {
      id: 'pricing-premium',
      label: 'Premium',
      prompt: 'What do I get in Premium?',
      keywords: ['premium', 'premium get', 'what premium', 'premium includes'],
      title: 'Premium is for deeper learning and progress',
      body:
        'Premium is the better fit when you want fuller course access, certificates, progress boards, and stronger support around the formation journey.',
      details:
        'Choose Premium when you are ready to move beyond previewing and want a more serious path through SBD learning.',
      ctas: [{ label: 'Compare Plans', href: '/pricing.html' }],
    },
    {
      id: 'pricing-elite',
      label: 'Elite',
      prompt: 'Why choose Elite?',
      keywords: ['elite', 'why elite', 'elite includes', 'full access'],
      title: 'Elite is for the fullest SBD ecosystem',
      body:
        'Elite is for users who want the deepest access across schools, advanced formation, MV House, and the broader SBD experience.',
      details:
        'Choose Elite when you do not want to keep deciding what to unlock next and you want the broadest path available.',
      ctas: [{ label: 'Compare Plans', href: '/pricing.html' }],
    },
    {
      id: 'pricing-start-free',
      label: 'Start free',
      prompt: 'Can I start free?',
      keywords: ['start free', 'free', 'try free', 'free plan'],
      title: 'Yes, start free if you want to explore first',
      body:
        'The free entry lets you preview SBD before choosing a deeper membership. Start there if you want clarity before committing.',
      details:
        'Use the free path to understand the platform, then upgrade when you know which formation path matters most right now.',
      ctas: [{ label: 'Start Free', href: '/auth?next=/learn&src=ask-sbd-start-free' }],
    },
    {
      id: 'pricing-mv-unlock',
      label: 'MV access',
      prompt: 'What unlocks MV House?',
      keywords: ['unlock mv', 'mv access', 'mv house access', 'fashion access'],
      title: 'MV House access depends on your membership level',
      body:
        'If MV House or advanced expression content is locked, compare plans to choose the access level that includes the expression path you want.',
      details:
        'MV House is part of the broader formation ecosystem, so the right plan depends on whether you only want to browse or want deeper access.',
      ctas: [
        { label: 'Compare Plans', href: '/pricing.html' },
        { label: 'Visit MV House', href: '/mv-house.html' },
      ],
    },
    {
      id: 'mv-what',
      label: 'MV House meaning',
      prompt: 'What is MV House?',
      keywords: ['what mv house', 'mv house', 'what is mv'],
      title: 'MV House is where formation meets expression',
      body:
        'MV House connects identity, presence, image, fashion, and embodied expression. It helps what is forming inside become visible outside.',
      details:
        'Use MV House when your question is not only what to learn, but how to show up with clearer presence, style, posture, and expression.',
      ctas: [{ label: 'Visit MV House', href: '/mv-house.html' }],
    },
    {
      id: 'mv-fashion-formation',
      label: 'Fashion and formation',
      prompt: 'Is this fashion or formation?',
      keywords: ['fashion formation', 'just fashion', 'appearance', 'style formation'],
      title: 'It is fashion serving formation',
      body:
        'MV House is not appearance for its own sake. The goal is expression that agrees with identity, presence, and formation.',
      details:
        'Style becomes meaningful when it reveals what is being formed: confidence, softness, structure, authority, grace, or clarity.',
      ctas: [{ label: 'Visit MV House', href: '/mv-house.html' }],
    },
    {
      id: 'mv-start',
      label: 'MV start',
      prompt: 'Where should I start in MV House?',
      keywords: ['start mv', 'mv start', 'start expression', 'where mv'],
      title: 'Start with the expression question you feel most',
      body:
        'If you want presence, begin with masculine or feminine expression. If you want outward alignment, begin with image, style, and identity cues.',
      details:
        'Do not begin with everything. Pick one expression area and let that reveal the next step.',
      ctas: [
        { label: 'Visit MV House', href: '/mv-house.html' },
        { label: 'Open Learn', href: '/learn.html' },
      ],
    },
    {
      id: 'mv-masculine-presence',
      label: 'Masculine presence',
      prompt: 'What is masculine presence?',
      keywords: ['masculine presence', 'masculinity', 'presence', 'authority'],
      title: 'Masculine presence is structured, calm, and clear',
      body:
        'Masculine presence is not noise or force. It is clarity, steadiness, structure, restraint, and the ability to carry responsibility with calm.',
      details:
        'In MV House, masculine expression should feel embodied: posture, speech, grooming, styling, and emotional steadiness all communicate presence.',
      ctas: [{ label: 'Visit MV House', href: '/mv-house.html' }],
    },
    {
      id: 'mv-feminine-expression',
      label: 'Feminine expression',
      prompt: 'What is feminine expression?',
      keywords: ['feminine expression', 'femininity', 'softness', 'grace'],
      title: 'Feminine expression is grace with intelligence and depth',
      body:
        'Feminine expression is not performance. It is softness, discernment, beauty, receptivity, emotional intelligence, and embodied confidence.',
      details:
        'In MV House, feminine expression can show through styling, movement, speech, posture, and the atmosphere a woman carries.',
      ctas: [{ label: 'Visit MV House', href: '/mv-house.html' }],
    },
    {
      id: 'mv-image-identity',
      label: 'Image and identity',
      prompt: 'How does image connect to identity?',
      keywords: ['image identity', 'identity image', 'presentation', 'appearance identity'],
      title: 'Image should reveal identity, not replace it',
      body:
        'Your image becomes stronger when it reflects what is true, formed, and intentional. MV House helps connect inner identity to outward presentation.',
      details:
        'The goal is not to copy a look. The goal is to become more precise about what your presence communicates.',
      ctas: [{ label: 'Visit MV House', href: '/mv-house.html' }],
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
      promptIds: ['pricing-plan-fit', 'pricing-premium', 'pricing-elite', 'pricing-start-free', 'locked-content', 'pricing-mv-unlock'],
    },
    learn: {
      match: ['/learn.html', '/courses.html', '/schools.html'],
      intro: 'Quick help finding the right course, certificate, or next lesson.',
      promptIds: ['learn-course-start', 'learn-school-fit', 'locked-content', 'learn-certificates', 'learn-next', 'learn-boards-link'],
    },
    boards: {
      match: ['/boards.html', '/board.html'],
      intro: 'Quick help understanding community, reflection, and group conversations.',
      promptIds: ['boards-what-post', 'boards-how-work', 'boards-join-conversation', 'boards-course-link', 'boards-reflection', 'boards-groups'],
    },
    mvHouse: {
      match: ['/mv-house.html'],
      intro: 'Quick help with expression, presence, image, and identity.',
      promptIds: ['mv-what', 'mv-fashion-formation', 'mv-start', 'mv-masculine-presence', 'mv-feminine-expression', 'mv-image-identity'],
    },
    shop: {
      match: ['/shop.html', '/resources.html'],
      intro: 'Quick help choosing resources, products, and practical next steps.',
      promptIds: ['shop-first-buy', 'shop-season-resource', 'shop-course-tie', 'shop-marriage-communication', 'shop-expression', 'shop-use-resources'],
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
