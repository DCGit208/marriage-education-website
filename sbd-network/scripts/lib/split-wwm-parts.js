'use strict';

/**
 * Split WWM (and similar) markdown modules into sequenced lesson parts.
 * @param {string} markdown
 * @param {{ courseId?: string }} [opts]
 * @returns {Array<{ id: string, order: number, track: string, title: string, content: string, estimatedMinutes: number }>}
 */
function splitWwmModuleIntoParts(markdown, opts = {}) {
  const PARTS_SPEC = [
    { id: 'part-1', key: '## I. Ontology', title: 'Ontology — What This Week Is', minutes: 25 },
    { id: 'part-2', key: '## II. Consciousness', title: 'Consciousness — What You Must See', minutes: 20 },
    { id: 'part-3', key: '## III. Discipline', title: 'Discipline — What You Must Train', minutes: 20 },
    { id: 'part-4', key: '## IV. Practice', title: 'Practice — Covenant Action', minutes: 20 },
    { id: 'part-5', key: '## Reading Assignment', title: 'Reading, Definitions & Scripture', minutes: 25 },
    { id: 'part-6', key: '## Reflection Questions', title: 'Reflection & Exercises', minutes: 25 },
    { id: 'part-7', key: '## Couple Discussion', title: 'Discussion, Assessment & Prayer', minutes: 20 },
  ];

  const indices = PARTS_SPEC.map((spec) => ({
    spec,
    index: markdown.indexOf(spec.key),
  })).filter((x) => x.index >= 0);

  if (indices.length < 3) {
    return null;
  }

  const track = opts.track || 'formation';
  const parts = [];

  for (let i = 0; i < indices.length; i++) {
    const start = indices[i].index;
    const end = i < indices.length - 1 ? indices[i + 1].index : markdown.length;
    const content = markdown.slice(start, end).trim();
    if (!content) continue;
    parts.push({
      id: indices[i].spec.id,
      order: parts.length + 1,
      track,
      title: indices[i].spec.title,
      content,
      estimatedMinutes: indices[i].spec.minutes,
    });
  }

  return parts.length >= 4 ? parts : null;
}

module.exports = { splitWwmModuleIntoParts };
