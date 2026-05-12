/**
 * migrate-weeks-to-parts.js
 * 
 * Splits weeks 2-6 plain content into proper `parts` arrays,
 * matching the Week 1 parts schema. All content is single-track (teleios)
 * since weeks 2-6 in Firestore contain only the Teleios formation track.
 *
 * Run: node scripts/migrate-weeks-to-parts.js
 */

const admin = require('firebase-admin');
const sa    = require('../../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// ── Split helpers ───────────────────────────────────────────────

/**
 * Split markdown content by `## Part N:` headings (weeks 2 & 3).
 * Returns [{id, title, order, track, content}]
 */
function splitByPartHeadings(content) {
  const lines  = content.split('\n');
  const partRx = /^## (Part \d+[:\s—–-]+.+)$/;
  const segments = [];
  let cur = null;

  for (const line of lines) {
    const m = line.match(partRx);
    if (m) {
      if (cur) segments.push(cur);
      const rawTitle = m[1].replace(/^Part \d+[:\s—–-]+/, '').trim();
      cur = { title: rawTitle, lines: [`## ${m[1]}`] };
    } else {
      if (cur) cur.lines.push(line);
      // content before first Part heading: skip (week overview, intro header)
    }
  }
  if (cur) segments.push(cur);
  return segments;
}

/**
 * Split markdown content by `## SECTION N:` headings (weeks 4, 5, 6).
 * Intro content (before first SECTION) becomes Part 1.
 * Returns [{id, title, order, track, content}]
 */
function splitBySectionHeadings(content, introTitle) {
  const lines   = content.split('\n');
  const sectRx  = /^## (SECTION \d+[:\s—–-]+.+)$/i;
  const segments = [];
  let cur = { title: introTitle, lines: [] };

  for (const line of lines) {
    const m = line.match(sectRx);
    if (m) {
      if (cur.lines.some(l => l.trim())) segments.push(cur);
      const rawTitle = m[1].replace(/^SECTION \d+[:\s—–-]+/i, '').trim();
      cur = { title: rawTitle, lines: [`## ${m[1]}`] };
    } else {
      cur.lines.push(line);
    }
  }
  if (cur.lines.some(l => l.trim())) segments.push(cur);
  return segments;
}

/**
 * Group trailing "appendix" segments (Daily Practices, Tools, Reflection,
 * Summary, Final Word, Checklist, Key Takeaway) into the last content part.
 */
const APPENDIX_HEADINGS = [
  /^## (DAILY PRACTICES|Daily Practice|DOWNLOADABLE TOOLS|Downloadable Tools)/i,
  /^## (Self-Study Checklist|Reflection Questions|REFLECTION QUESTIONS)/i,
  /^## (Week \d+ Key Takeaway|SUMMARY MAXIM|FINAL WORD|COURSE COMPLETION)/i,
  /^## (Faculty Integration Exercise|Personal Development Plan)/i,
];

function isAppendix(title) {
  return APPENDIX_HEADINGS.some(rx => rx.test('## ' + title));
}

function mergeAppendix(segs) {
  // Find the last real content part (before appendix-only segments)
  let lastRealIdx = segs.length - 1;
  while (lastRealIdx > 0 && isAppendix(segs[lastRealIdx].title)) lastRealIdx--;

  // Everything from lastRealIdx+1 onward gets appended to lastRealIdx
  const trailing = segs.slice(lastRealIdx + 1);
  if (trailing.length === 0) return segs;

  const merged = segs[lastRealIdx].lines.concat(
    ['', '---', ''],
    ...trailing.map(s => s.lines)
  );
  segs[lastRealIdx].lines = merged;
  return segs.slice(0, lastRealIdx + 1);
}

/**
 * Convert raw segments into Firestore parts array.
 */
function toParts(segs) {
  return segs.map((seg, i) => ({
    id:      `part-${i + 1}`,
    title:   seg.title,
    order:   i + 1,
    track:   'teleios',
    content: seg.lines.join('\n').trim(),
  }));
}

// ── Week-specific configs ───────────────────────────────────────

async function migrateWeek(weekId, splitter) {
  const ref  = db.collection('modules').doc(weekId);
  const snap = await ref.get();
  if (!snap.exists) { console.error(weekId + ': not found'); return; }

  const content = snap.data().content || '';
  let segs      = splitter(content);
  segs          = mergeAppendix(segs);

  if (segs.length === 0) { console.error(weekId + ': no segments found'); return; }

  const parts = toParts(segs);
  console.log(`${weekId}: ${parts.length} parts`);
  parts.forEach(p => console.log(`  ${p.id} [${p.track}]: "${p.title}" (${p.content.length} chars)`));

  await ref.update({ parts });
  console.log(`  ✅ Updated Firestore\n`);
}

// ── Run all migrations ──────────────────────────────────────────

async function run() {
  // Week 2: ## Part N: headings (8 parts)
  await migrateWeek('teleios-week-2', splitByPartHeadings);

  // Week 3: ## Part N: headings (9 parts)
  await migrateWeek('teleios-week-3', splitByPartHeadings);

  // Week 4: ## SECTION N: headings (Intro + 7 sections → grouped to 7 parts)
  await migrateWeek('teleios-week-4', c => splitBySectionHeadings(c, 'Introduction — From Who You Are to How You See'));

  // Week 5: ## SECTION N: headings (Intro + 7 sections → grouped to 7 parts)
  await migrateWeek('teleios-week-5', c => splitBySectionHeadings(c, 'Introduction — From Personal Wholeness to Civilizational Impact'));

  // Week 6: ## SECTION N: headings (Intro + 6 sections → grouped to 7 parts)
  await migrateWeek('teleios-week-6', c => splitBySectionHeadings(c, 'Introduction — The Readiness Question'));

  console.log('All weeks migrated.');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
