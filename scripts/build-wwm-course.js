#!/usr/bin/env node
/**
 * Build The Woman, The Wife, The Mother course entry for courses-catalogue.json
 * Source: docs/content/woman-wife-mother/course/modules/week-NN.md
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MODULES_DIR = path.join(ROOT, 'docs/content/woman-wife-mother/course/modules');
const CATALOGUE_PATH = path.join(ROOT, 'courses-catalogue.json');

const COURSE_ID = 'the-woman-the-wife-the-mother';

const WEEK_TITLES = [
  'The Crisis of Fragmented Womanhood',
  'Teleios Womanhood',
  'Muliebrity Explained',
  'Body, Nakedness, and Stewardship',
  'Lifestyle Sexuality',
  'Attraction Is Meritorious',
  'Attitude',
  'Attire',
  'Allure',
  'Fitness, Form, and Shape',
  'The Woman, The Wife, The Mother',
  'Failure, Drift, and Restoration',
  'Walking According to Design',
];

function loadModules() {
  const modules = [];
  for (let wk = 1; wk <= 13; wk++) {
    const file = path.join(MODULES_DIR, `week-${String(wk).padStart(2, '0')}.md`);
    if (!fs.existsSync(file)) {
      throw new Error(`Missing module file: ${file}`);
    }
    const content = fs.readFileSync(file, 'utf8');
    const title = WEEK_TITLES[wk - 1];
    modules.push({
      moduleId: wk,
      title: `Week ${wk}: ${title}`,
      chapter: `Formation Week ${wk}`,
      duration: '1 week',
      duration_hours: 6,
      content,
      topics: [title],
      keyTerms: extractSection(content, '## Core Definitions'),
      exercises: extractListItems(content, '## Formation Exercises'),
      readings: extractReadingAssignment(content),
      reflection_questions: extractNumbered(content, '## Reflection Questions'),
      downloads: [],
      learning_objectives: [
        `State the ontology of ${title.toLowerCase()}`,
        'Apply Identity → Consciousness → Discipline → Practice',
        'Complete weekly formation exercises and covenant action steps',
      ],
      core_teachings: [title],
      design_frameworks: [],
      lessons: [],
    });
  }
  return modules;
}

function extractSection(md, heading) {
  const idx = md.indexOf(heading);
  if (idx === -1) return [];
  const rest = md.slice(idx + heading.length);
  const end = rest.search(/\n## /);
  const block = end === -1 ? rest : rest.slice(0, end);
  return block
    .split('\n')
    .map((l) => l.replace(/^[-*]\s*\*\*([^*]+)\*\*.*/, '$1').trim())
    .filter((l) => l.startsWith('-') || l.startsWith('**'))
    .slice(0, 8);
}

function extractListItems(md, heading) {
  const idx = md.indexOf(heading);
  if (idx === -1) return [];
  const rest = md.slice(idx + heading.length);
  const end = rest.search(/\n## /);
  const block = end === -1 ? rest : rest.slice(0, end);
  return block
    .split('\n')
    .filter((l) => /^\d+\.|^[-*]/.test(l.trim()))
    .map((l) => l.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 6);
}

function extractReadingAssignment(md) {
  const idx = md.indexOf('## Reading Assignment');
  if (idx === -1) return [];
  const rest = md.slice(idx + '## Reading Assignment'.length);
  const end = rest.search(/\n## /);
  const block = end === -1 ? rest : rest.slice(0, end);
  return block
    .split('\n')
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

function extractNumbered(md, heading) {
  const idx = md.indexOf(heading);
  if (idx === -1) return [];
  const rest = md.slice(idx + heading.length);
  const end = rest.search(/\n## /);
  const block = end === -1 ? rest : rest.slice(0, end);
  return block
    .split('\n')
    .filter((l) => /^\d+\./.test(l.trim()))
    .map((l) => l.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);
}

function buildCourse(modules) {
  return {
    courseId: COURSE_ID,
    title: 'The Woman, The Wife, The Mother',
    subtitle: 'Muliebrity, Covenant, and the Integrated Life of Womanhood — 13-Week Formation',
    instructor: 'Dr. Coach Achu Gustave',
    duration: '13 weeks',
    duration_weeks: 13,
    level: 'Muliebrity Baron — Flagship Formation',
    price: 250,
    currency: 'USD',
    schoolId: 'standalone',
    school_name: 'SBD Flagship — Muliebrity Formation',
    description:
      'The flagship 13-week Muliebrity formation program: teleios womanhood, integrated woman/wife/mother life, A³ operational discipline, psychomotor covenant fidelity, and covenant flourishing. Paid enrollment required. No video — formation through reading, drills, assessment, and embodied practice.',
    learningOutcomes: [
      'Reject fragmented functional womanhood; restore integrated muliebrity',
      'Operate from teleios womanhood as foundation—wifehood and motherhood express wholeness in covenant',
      'Train psychomotor, behavioral, and axiomatic capacity for covenant sexuality',
      'Deploy A³ (Attitude, Attire, Allure) and form stewardship as lifestyle',
      'Diagnose structural drift and rebuild muliebrity with measurable practice',
    ],
    prerequisites: [
      'Covenant marriage or engaged commitment to covenant formation',
      'Willingness to train body, presentation, and sexual intention as design stewardship',
      'No entitlement to attraction without meritorious discipline',
    ],
    format: 'Self-paced weekly modules — text, drills, Scripture, exercises, assessments (no video)',
    certification: 'Certificate of Completion — Muliebrity & Covenant Formation',
    modules,
    tags: [
      'muliebrity',
      'womanhood',
      'covenant',
      'SBD Life',
      'the woman the wife the mother',
      'formation',
      'psychomotor',
    ],
    featured: true,
    published: true,
    purchaseOnly: true,
    createdDate: new Date().toISOString().slice(0, 10),
    lastUpdated: new Date().toISOString().slice(0, 10),
    certificate: {
      enabled: true,
      title: 'Muliebrity & Covenant Formation',
      subtitle: 'The Woman, The Wife, The Mother — 13-Week Program',
      full_name: 'Certificate of Completion in Muliebrity & Covenant Formation',
      requirements: {
        all_modules_passed: true,
        minimum_average_score: 80,
        all_assignments_submitted: true,
        minimum_total_hours: 78,
      },
      issued_by: 'Dr. Coach Achu Gustave',
      organization: 'SBD Life / Marriage Education',
    },
  };
}

function main() {
  const { execSync } = require('child_process');
  const lintScript = path.join(__dirname, 'lint-wwm-doctrine.js');
  console.log('Running doctrine lint…');
  execSync(`node "${lintScript}"`, { stdio: 'inherit', cwd: ROOT });

  const modules = loadModules();
  const course = buildCourse(modules);
  const catalogue = JSON.parse(fs.readFileSync(CATALOGUE_PATH, 'utf8'));
  const idx = catalogue.findIndex((c) => c.courseId === COURSE_ID);
  if (idx >= 0) {
    catalogue[idx] = course;
    console.log(`Updated existing course at index ${idx}`);
  } else {
    catalogue.push(course);
    console.log('Appended new course to catalogue');
  }
  fs.writeFileSync(CATALOGUE_PATH, JSON.stringify(catalogue, null, 2) + '\n');
  console.log(`✅ Wrote ${COURSE_ID} with ${modules.length} modules → ${CATALOGUE_PATH}`);
}

main();
