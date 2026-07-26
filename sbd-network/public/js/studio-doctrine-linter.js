/**
 * Course Studio doctrine linter — formation rules, integration law, WWM spine.
 */
(function (global) {
  'use strict';

  const FORMATION_PART_HINTS = {
    'part-1': ['ontology', 'what this week is'],
    'part-2': ['consciousness', 'what you must see'],
    'part-3': ['discipline', 'what you must train'],
    'part-4': ['practice', 'covenant action'],
    'part-5': ['reading', 'definitions', 'scripture'],
    'part-6': ['reflection', 'exercises'],
    'part-7': ['discussion', 'assessment', 'prayer', 'liturgy'],
  };

  function wordCount(text) {
    return String(text || '').split(/\s+/).filter(Boolean).length;
  }

  function lintMarkdown(md, ctx) {
    const issues = [];
    const text = md || '';
    const lower = text.toLowerCase();
    const courseId = (ctx && ctx.courseId) || '';
    const moduleId = (ctx && ctx.moduleId) || '';
    const partId = (ctx && ctx.partId) || '';
    const weekNum = parseWeek(moduleId);

    if (/ephesians?\s*5|eph\.?\s*5/i.test(text)) {
      const isWwm = courseId === 'the-woman-the-wife-the-mother';
      if (isWwm && weekNum !== 11) {
        issues.push({
          severity: 'error',
          code: 'eph5-spine',
          message: 'Ephesians 5 belongs in WWM Week 11 only (§F1 spine).',
        });
      }
    }

    if (/wife\s+without\s+woman|mother\s+without\s+wife/i.test(lower)) {
      issues.push({
        severity: 'warning',
        code: 'integration-order',
        message: 'Possible integration-order violation — Woman → Wife → Mother.',
      });
    }

    if (/functionalism|function\s+defines\s+identity/i.test(lower)) {
      issues.push({
        severity: 'warning',
        code: 'functionalism',
        message: 'Functionalism language detected — check ontology vs role.',
      });
    }

    const hints = FORMATION_PART_HINTS[partId];
    if (hints && text.length > 80) {
      const hasSection = hints.some(function (h) { return lower.includes(h); });
      const hasH2 = /^##\s+/m.test(text);
      if (!hasSection && !hasH2) {
        issues.push({
          severity: 'warning',
          code: 'formation-section',
          message: 'Expected formation heading for ' + partId + ' (e.g. ' + hints[0] + ').',
        });
      }
    }

    if (partId === 'part-5' && text.includes('## Core Definitions') && !/\|.+\|/.test(text)) {
      issues.push({
        severity: 'info',
        code: 'definitions-table',
        message: 'Core Definitions section has no table rows yet.',
      });
    }

    const wc = wordCount(text);
    if (courseId === 'the-woman-the-wife-the-mother' && partId === 'part-7' && ctx && ctx.weekWordCount != null) {
      if (ctx.weekWordCount < 3500) {
        issues.push({
          severity: 'info',
          code: 'flagship-length',
          message: 'Week total ~' + ctx.weekWordCount + ' words (flagship target ≥3,500).',
        });
      }
    }

    if (wc > 0 && wc < 50 && partId.startsWith('part-')) {
      issues.push({
        severity: 'info',
        code: 'short-part',
        message: 'Part is very short (' + wc + ' words).',
      });
    }

    return issues;
  }

  function parseWeek(moduleId) {
    const m = String(moduleId || '').match(/week-(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function renderLintPanel(issues, container) {
    if (!container) return;
    if (!issues.length) {
      container.innerHTML = '<p class="acs-lint-ok">✓ No doctrine issues</p>';
      return;
    }
    container.innerHTML = issues.map(function (i) {
      return '<div class="acs-lint-item acs-lint-item--' + i.severity + '" data-severity="' + i.severity + '">' +
        '<span class="acs-lint-badge">' + i.severity + '</span> ' + esc(i.message) + '</div>';
    }).join('');
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function countBySeverity(issues) {
    const c = { error: 0, warning: 0, info: 0 };
    issues.forEach(function (i) { if (c[i.severity] != null) c[i.severity]++; });
    return c;
  }

  global.StudioDoctrineLinter = {
    lintMarkdown: lintMarkdown,
    renderLintPanel: renderLintPanel,
    countBySeverity: countBySeverity,
    wordCount: wordCount,
  };
})(typeof window !== 'undefined' ? window : global);
