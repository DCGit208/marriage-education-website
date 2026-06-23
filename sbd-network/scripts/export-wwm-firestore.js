#!/usr/bin/env node
/**
 * Export WWM course from Firestore → repo markdown (canonical backup).
 *
 * Reads published `content` from modules/{wwm-week-N}/parts/* by default.
 * Use --draft to export draftContent where hasDraft is true.
 *
 * Usage:
 *   node sbd-network/scripts/export-wwm-firestore.js
 *   node sbd-network/scripts/export-wwm-firestore.js --dry-run
 *   node sbd-network/scripts/export-wwm-firestore.js --week 8
 *   node sbd-network/scripts/export-wwm-firestore.js --draft
 */
'use strict';

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const COURSE_ID = 'the-woman-the-wife-the-mother';
const TOTAL_WEEKS = 13;
const SA = path.resolve(__dirname, '../../serviceAccountKey.json');
const OUT_DIR = path.resolve(__dirname, '../../docs/content/woman-wife-mother/course/modules');

const DRY = process.argv.includes('--dry-run');
const USE_DRAFT = process.argv.includes('--draft');
const weekArg = process.argv.find((a) => a.startsWith('--week='));
const singleWeek = weekArg ? parseInt(weekArg.split('=')[1], 10) : null;

if (!fs.existsSync(SA)) {
  console.error('❌ serviceAccountKey.json not found at', SA);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(require(SA)) });
}
const db = admin.firestore();

function wordCount(text) {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

async function loadWeekMarkdown(weekNum) {
  const moduleId = `wwm-week-${weekNum}`;
  const modSnap = await db.collection('modules').doc(moduleId).get();
  if (!modSnap.exists) {
    throw new Error('Module not found: ' + moduleId);
  }
  const mod = modSnap.data();
  const parts = Array.isArray(mod.parts) ? mod.parts.slice() : [];
  parts.sort((a, b) => (a.order || 0) - (b.order || 0));

  if (!parts.length) {
    if (mod.content) return mod.content;
    throw new Error(moduleId + ' has no parts and no legacy content');
  }

  const chunks = [];
  for (const p of parts) {
    const partSnap = await db.collection('modules').doc(moduleId)
      .collection('parts').doc(p.id).get();
    const data = partSnap.exists ? partSnap.data() : {};
    let md = '';
    if (USE_DRAFT && data.hasDraft && data.draftContent != null) {
      md = data.draftContent;
    } else {
      md = data.content || data.draftContent || '';
    }
    if (md.trim()) chunks.push(md.trim());
  }

  const weekTitle = mod.title || `Week ${weekNum}`;
  const header = weekTitle.startsWith('#') ? weekTitle : `# ${weekTitle}`;
  const body = chunks.join('\n\n');
  return body.startsWith('#') ? body : header + '\n\n' + body.replace(/^# Week \d+:[^\n]*\n+/i, '');
}

async function exportWeek(weekNum) {
  const md = await loadWeekMarkdown(weekNum);
  const wc = wordCount(md);
  const outFile = path.join(OUT_DIR, `week-${String(weekNum).padStart(2, '0')}.md`);

  if (DRY) {
    console.log(`DRY week-${String(weekNum).padStart(2, '0')}.md — ${wc} words → ${outFile}`);
    return { weekNum, wc, outFile };
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outFile, md.endsWith('\n') ? md : md + '\n', 'utf8');
  console.log(`✓ ${path.basename(outFile)} (${wc} words)${USE_DRAFT ? ' [draft]' : ''}`);
  return { weekNum, wc, outFile };
}

async function main() {
  console.log(`\n📤 Export ${COURSE_ID} Firestore → repo markdown`);
  console.log(`   Source: ${USE_DRAFT ? 'draftContent (where hasDraft)' : 'published content'}\n`);

  const weeks = singleWeek ? [singleWeek] : Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1);
  const results = [];

  for (const w of weeks) {
    try {
      results.push(await exportWeek(w));
    } catch (err) {
      console.error(`✗ Week ${w}:`, err.message);
    }
  }

  const total = results.reduce((n, r) => n + r.wc, 0);
  console.log(`\n${DRY ? '🔍 Dry run' : '✅ Export'} complete — ${results.length} week(s), ~${total} words total.\n`);
  console.log('Next: node scripts/build-wwm-course.js  (refresh catalogue)');
  console.log('      node sbd-network/scripts/seed-wwm-course.js --dry-run  (verify seed)\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
