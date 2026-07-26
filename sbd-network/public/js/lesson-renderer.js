/**
 * Formation lesson markdown renderer — editorial typography, scripture, doctrine callouts.
 */
(function (global) {
  'use strict';

  const FORMATION_SECTIONS = {
    'I. Ontology': { icon: '◈', label: 'Ontology', class: 'section-ontology' },
    'II. Consciousness': { icon: '◎', label: 'Consciousness', class: 'section-consciousness' },
    'III. Discipline': { icon: '◇', label: 'Discipline', class: 'section-discipline' },
    'IV. Practice': { icon: '◆', label: 'Practice', class: 'section-practice' },
    'Reading Assignment': { icon: '📖', label: 'Reading', class: 'section-reading' },
    'Core Definitions': { icon: '📋', label: 'Definitions', class: 'section-definitions' },
    'Scripture Study': { icon: '✦', label: 'Scripture', class: 'section-scripture' },
    'Reflection Questions': { icon: '◷', label: 'Reflection', class: 'section-reflection' },
    'Formation Exercises': { icon: '✓', label: 'Exercises', class: 'section-exercises' },
    'Covenant Action Steps': { icon: '→', label: 'Action', class: 'section-action' },
    'Journal Prompts': { icon: '✎', label: 'Journal', class: 'section-journal' },
    'Couple Discussion': { icon: '♡', label: 'Couple', class: 'section-couple' },
    'Week Assessment': { icon: '?', label: 'Assessment', class: 'section-assessment' },
    'Weekly Challenge': { icon: '★', label: 'Challenge', class: 'section-challenge' },
    'Prayer / Liturgy': { icon: '☩', label: 'Prayer', class: 'section-prayer' },
  };

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function inlineFormat(t) {
    return esc(t)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="lesson-inline-code">$1</code>');
  }

  function sectionMeta(title) {
    const clean = title.replace(/^##\s+/, '').replace(/^[IVX]+\.\s*/, '').trim();
    for (const [key, meta] of Object.entries(FORMATION_SECTIONS)) {
      if (title.includes(key) || clean.startsWith(key.split('.')[0])) return meta;
    }
    if (/^Week \d+:/i.test(clean)) return { icon: '◈', label: 'Formation', class: 'section-week' };
    return null;
  }

  function wrapH2(title, inner) {
    const meta = sectionMeta(title);
    if (!meta) return `<h2 class="lesson-h2">${inner}</h2>`;
    return `<header class="section-card-head ${meta.class}">
      <span class="section-icon" aria-hidden="true">${meta.icon}</span>
      <div class="section-card-text"><h2 class="lesson-h2">${inner}</h2></div>
      <span class="section-pill">${esc(meta.label)}</span>
    </header>`;
  }

  function isDoctrineDiagram(text) {
    return /WOMANHOOD|Muliebrity|Identity\s*→|Layer\s*0|§F1/i.test(text) && /→|═|──/.test(text);
  }

  function wrapPre(code) {
    const trimmed = code.trim();
    if (isDoctrineDiagram(trimmed)) {
      return `<div class="doctrine-diagram" role="img" aria-label="Formation diagram"><pre class="lesson-pre lesson-pre--diagram"><code>${esc(trimmed)}</code></pre></div>`;
    }
    return `<pre class="lesson-pre"><code>${esc(trimmed)}</code></pre>`;
  }

  function isIntegrationLawParagraph(text) {
    return /without woman, there is no wife/i.test(text) ||
      (/integration law/i.test(text) && /foundation/i.test(text));
  }

  function wrapParagraph(text, opts) {
    const { isFirst, inPrayer } = opts;
    let cls = 'lesson-p';
    if (isFirst) cls += ' lesson-p--lead';
    if (inPrayer) cls += ' lesson-p--prayer';
    if (isIntegrationLawParagraph(text)) {
      return `<aside class="doctrine-callout doctrine-callout--integration"><p class="${cls}">${inlineFormat(text)}</p></aside>`;
    }
    return `<p class="${cls}">${inlineFormat(text)}</p>`;
  }

  function parseTableRow(line) {
    return line.split('|').slice(1, -1).map((c) => c.trim());
  }

  function isTableSep(line) {
    return /^\|[\s\-:|]+\|$/.test(line.trim());
  }

  function renderTable(lines) {
    if (lines.length < 2) return '';
    const headers = parseTableRow(lines[0]);
    const bodyStart = isTableSep(lines[1]) ? 2 : 1;
    let html = '<div class="table-wrap"><table class="lesson-table"><thead><tr>';
    headers.forEach((h) => { html += `<th>${inlineFormat(h)}</th>`; });
    html += '</tr></thead><tbody>';
    for (let i = bodyStart; i < lines.length; i++) {
      if (!lines[i].trim().startsWith('|')) break;
      const cells = parseTableRow(lines[i]);
      html += '<tr>';
      cells.forEach((c) => { html += `<td>${inlineFormat(c)}</td>`; });
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
  }

  function scriptureBlocksForParagraph(text, seen, opts) {
    if (!global.ScripturePassages || (opts && opts.inlineLimit === 0)) return '';
    const maxInline = (opts && opts.inlineLimit) || 0;
    if (maxInline > 0 && seen.inlineCount >= maxInline) return '';

    const refs = global.ScripturePassages.extractRefs(text);
    let html = '';
    refs.forEach((ref) => {
      if (seen.has(ref)) return;
      if (maxInline > 0 && seen.inlineCount >= maxInline) return;
      const block = global.ScripturePassages.renderBlock(ref, { compact: maxInline > 0 });
      if (block) {
        seen.add(ref);
        if (maxInline > 0) seen.inlineCount = (seen.inlineCount || 0) + 1;
        html += block;
      }
    });
    return html;
  }

  function enrichScriptureStudyLine(line, seen) {
    if (!global.ScripturePassages) return '';
    const m = line.match(/^\*\*(?:Primary|Supporting)(?:\s+text)?\s*[—–-]\s*(.+?)\*\*\s*(.*)$/i);
    if (!m) return '';
    const refPart = m[1].replace(/[.;]\s*$/, '').trim();
    const refs = global.ScripturePassages.extractRefs(refPart);
    if (!refs.length && refPart.match(/\d+:\d+/)) {
      return global.ScripturePassages.renderBlock(refPart) || '';
    }
    let html = '';
    refs.forEach((ref) => {
      if (!seen.has(ref)) {
        const block = global.ScripturePassages.renderBlock(ref);
        if (block) {
          seen.add(ref);
          html += block;
        }
      }
    });
    return html;
  }

  function normalizeLegacyF1Blocks(text) {
    return String(text).replace(
      /```[^\n]*\n([\s\S]*?DESIGN:\s+Sexuality\s*=\s*TREE[\s\S]*?MOTHER:[^\n`]+)\n```/gi,
      '\n\n[[f1-spine]]\n\n'
    );
  }

  function expandFormationShortcodes(text) {
    let out = normalizeLegacyF1Blocks(text);
    if (global.CanonF1Spine && typeof global.CanonF1Spine.expandShortcodes === 'function') {
      out = global.CanonF1Spine.expandShortcodes(out);
    }
    return out;
  }

  function renderShortcodeLine(trimmed) {
    if (global.CanonF1Spine && typeof global.CanonF1Spine.renderShortcodeLine === 'function') {
      return global.CanonF1Spine.renderShortcodeLine(trimmed);
    }
    return null;
  }

  function renderMarkdown(md) {
    if (!md) return '';
    md = expandFormationShortcodes(md).replace(/^\*{0,2}Next:\*{0,2}[^\n]*→[^\n]*/gm, '').trim();

    const lines = md.split('\n');
    const out = [];
    const seenScripture = new Set();
    seenScripture.inlineCount = 0;
    const INLINE_SCRIPTURE_MAX = 2;
    let inCode = false;
    let codeBuf = [];
    let i = 0;
    let inScriptureStudy = false;
    let inPrayer = false;
    let firstParagraph = true;
    let chapterOpen = false;

    function closeChapter() {
      if (chapterOpen) {
        out.push('</section>');
        chapterOpen = false;
      }
    }

    function openChapter(meta) {
      closeChapter();
      const slug = meta.class.replace('section-', '');
      out.push('<section class="formation-chapter formation-chapter--' + slug + '" data-chapter="' + esc(meta.label) + '">');
      chapterOpen = true;
    }

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('```')) {
        if (inCode) {
          out.push(wrapPre(codeBuf.join('\n')));
          codeBuf = [];
          inCode = false;
        } else {
          inCode = true;
        }
        i++;
        continue;
      }
      if (inCode) {
        codeBuf.push(line);
        i++;
        continue;
      }

      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const tableLines = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tableLines.push(lines[i]);
          i++;
        }
        out.push(renderTable(tableLines));
        continue;
      }

      if (/^---+$/.test(trimmed)) {
        out.push('<div class="lesson-ornament" aria-hidden="true"><span></span></div>');
        i++;
        continue;
      }

      if (/^## /.test(line)) {
        const title = line.replace(/^## /, '');
        const meta = sectionMeta(line);
        if (meta) openChapter(meta);
        inScriptureStudy = /scripture study/i.test(title);
        inPrayer = /prayer\s*\/\s*liturgy/i.test(title);
        out.push(wrapH2(line, inlineFormat(title)));
        i++;
        continue;
      }

      if (/^### /.test(line)) {
        const h3 = line.replace(/^### /, '');
        const cls = /integration law|§f1|guard the foundation/i.test(h3)
          ? 'lesson-h3 lesson-h3--doctrine' : 'lesson-h3';
        out.push(`<h3 class="${cls}">${inlineFormat(h3)}</h3>`);
        i++;
        continue;
      }

      if (/^# /.test(line)) {
        out.push(`<h2 class="lesson-h2 lesson-h2--title">${inlineFormat(line.replace(/^# /, ''))}</h2>`);
        i++;
        continue;
      }

      if (/^> /.test(line)) {
        const quoteLines = [];
        while (i < lines.length && /^> /.test(lines[i])) {
          quoteLines.push(lines[i].replace(/^> /, ''));
          i++;
        }
        const q = quoteLines.join(' ');
        const isPull = q.length > 60 || /Psalm|Isaiah|Genesis|Ephesians/i.test(q);
        out.push(isPull
          ? `<blockquote class="lesson-pull-quote"><p>${inlineFormat(q)}</p></blockquote>`
          : `<blockquote class="lesson-quote">${inlineFormat(q)}</blockquote>`);
        continue;
      }

      if (/^[-*] /.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^[-*] /.test(lines[i].trim())) {
          items.push(`<li>${inlineFormat(lines[i].trim().replace(/^[-*] /, ''))}</li>`);
          i++;
        }
        out.push(`<ul class="lesson-ul">${items.join('')}</ul>`);
        continue;
      }

      if (/^\d+\.\s/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
          items.push(`<li>${inlineFormat(lines[i].trim().replace(/^\d+\.\s/, ''))}</li>`);
          i++;
        }
        out.push(`<ol class="lesson-ol">${items.join('')}</ol>`);
        continue;
      }

      if (!trimmed) {
        i++;
        continue;
      }

      const shortcodeHtml = renderShortcodeLine(trimmed);
      if (shortcodeHtml) {
        out.push(shortcodeHtml);
        i++;
        continue;
      }

      if (inScriptureStudy && /^\*\*(?:Primary|Supporting)/i.test(trimmed)) {
        out.push(`<p class="lesson-p scripture-study-label">${inlineFormat(trimmed)}</p>`);
        const block = enrichScriptureStudyLine(trimmed, seenScripture);
        if (block) out.push(block);
        i++;
        while (i < lines.length && lines[i].trim() && !/^## |^### |^\*\*(?:Primary|Supporting)/i.test(lines[i].trim())) {
          const commentary = lines[i].trim();
          if (commentary) out.push(`<p class="lesson-p scripture-commentary">${inlineFormat(commentary)}</p>`);
          i++;
        }
        continue;
      }

      if (trimmed) {
        out.push(wrapParagraph(trimmed, { isFirst: firstParagraph, inPrayer }));
        firstParagraph = false;
        if (inScriptureStudy) {
          const blocks = scriptureBlocksForParagraph(trimmed, seenScripture, { inlineLimit: 0 });
          if (blocks) out.push(blocks);
        } else if (seenScripture.inlineCount < INLINE_SCRIPTURE_MAX) {
          const blocks = scriptureBlocksForParagraph(trimmed, seenScripture, { inlineLimit: INLINE_SCRIPTURE_MAX });
          if (blocks) out.push(blocks);
        }
      }
      i++;
    }

    closeChapter();

    return `<article class="lesson-article">${out.join('\n')}</article>`;
  }

  global.LessonRenderer = {
    renderMarkdown,
    inlineFormat,
    esc,
    estimateWords: (md) => String(md || '').split(/\s+/).filter(Boolean).length,
  };

  const _htmlCache = new Map();
  const CACHE_MAX = 24;

  function renderMarkdownCached(md) {
    if (!md) return '';
    const key = 'ch2:' + String(md.length) + ':' + md.charCodeAt(0) + ':' + md.charCodeAt(md.length - 1);
    if (_htmlCache.has(key)) return _htmlCache.get(key);
    const html = renderMarkdown(md);
    if (_htmlCache.size >= CACHE_MAX) _htmlCache.clear();
    _htmlCache.set(key, html);
    return html;
  }

  global.LessonRenderer.renderMarkdownCached = renderMarkdownCached;
})(typeof window !== 'undefined' ? window : global);
