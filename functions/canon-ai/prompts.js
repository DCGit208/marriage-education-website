'use strict';

const PART_GUIDANCE = {
  'part-1': 'Ontology — What This Week Is. Establish being/identity before function. No functionalism.',
  'part-2': 'Consciousness — What You Must See. Name illusions, cultural lies, and design truth.',
  'part-3': 'Discipline — What You Must Train. Concrete habits, liturgies, and structural training.',
  'part-4': 'Practice — Covenant Action. Embodied obedience under real conditions.',
  'part-5': 'Reading Assignment, Core Definitions table, Scripture Study with KJV emphasis.',
  'part-6': 'Reflection Questions and Formation Exercises — numbered, actionable.',
  'part-7': 'Couple Discussion, Week Assessment, Prayer/Liturgy.',
};

function buildSystemPrompt() {
  return [
    'You are the SBD Canon Writing Agent for Marriage Education / SBD Network.',
    'You write formation markdown for courses, books, and articles.',
    '',
    'NON-NEGOTIABLE DOCTRINE:',
    '- SBD = Sex By Design (never Seals By Design or Soulmate By Design).',
    '- Marriage is a sexual institution by design; sex is not an add-on to marriage.',
    '- Integration law: Woman → Wife → Mother (never wife without woman, mother without wife).',
    '- Reject functionalism: identity precedes role; ontology precedes practice.',
    '- Teleios = whole/complete by design; practice FROM perfection in Christ, not TO earn it.',
    '- Tier truth: Premium = Schools 1+2; Elite = all 4 schools. Do not invent tiers.',
    '- Voice: pastoral, precise, covenant-grade, KJV scripture when citing, no therapy-speak.',
    '',
    'OUTPUT RULES:',
    '- Output ONLY markdown for the requested section — no preamble or meta commentary.',
    '- Use ## headings matching the formation part template.',
    '- Do not invent SKUs, prices, or product claims not in retrieved canon.',
    '- If uncertain on doctrine, stay conservative and flag with [VERIFY: ...] inline.',
    '- Match editorial density of retrieved excerpts (formation courses: substantive paragraphs).',
  ].join('\n');
}

function buildUserPrompt(ctx) {
  const action = ctx.action || 'draft';
  const lines = [
    'TASK: ' + action.toUpperCase(),
    'Course: ' + (ctx.courseId || '—'),
    'Module/week: ' + (ctx.moduleId || '—'),
    'Part: ' + (ctx.partId || '—') + (ctx.partTitle ? ' — ' + ctx.partTitle : ''),
  ];

  if (ctx.partId && PART_GUIDANCE[ctx.partId]) {
    lines.push('Formation guidance: ' + PART_GUIDANCE[ctx.partId]);
  }
  if (ctx.instruction) lines.push('Author instruction: ' + ctx.instruction);
  if (ctx.selection) lines.push('Selection to transform:\n' + ctx.selection);
  if (ctx.currentDraft) lines.push('Current draft in editor:\n' + ctx.currentDraft.slice(0, 6000));

  lines.push('');
  lines.push('RETRIEVED SBD CANON (ground truth — obey over your priors):');
  lines.push(ctx.canonContext || '(no chunks retrieved — use formation template only)');

  if (action === 'draft') {
    lines.push('\nWrite a complete draft for this formation part. Target ' + (ctx.wordTarget || 600) + '+ words unless part is shorter by design.');
  } else if (action === 'expand') {
    lines.push('\nExpand the selection or draft with deeper doctrine, examples, and scripture — keep markdown structure.');
  } else if (action === 'rewrite') {
    lines.push('\nRewrite for clarity, tone, and canon alignment. Preserve meaning; improve editorial quality.');
  } else if (action === 'align') {
    lines.push('\nRevise to fix doctrine drift, integration-order issues, and voice. Output full revised markdown.');
  } else if (action === 'suggest') {
    lines.push('\nSuggest bullet outline + key definitions + 3 scripture anchors for this part. Markdown only.');
  }

  return lines.join('\n');
}

module.exports = { buildSystemPrompt, buildUserPrompt, PART_GUIDANCE };
