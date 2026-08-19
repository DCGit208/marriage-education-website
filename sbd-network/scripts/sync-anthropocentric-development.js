/**
 * Sync Course 05 (Anthropocentric Development) markdown modules
 * into root and public course catalogues.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const COURSE_ID = 'anthropocentric-development';

const FILES = [
  path.join(ROOT, 'courses-catalogue.json'),
  path.join(ROOT, 'public/courses-catalogue.json'),
];

const MODULE_FILES = [
  path.join(ROOT, 'docs/content/anthropocentric-development/course/modules/week-01.md'),
  path.join(ROOT, 'docs/content/anthropocentric-development/course/modules/week-02.md'),
  path.join(ROOT, 'docs/content/anthropocentric-development/course/modules/week-03.md'),
];

const TITLES = [
  'Stages of Growth',
  'Maturation Laws',
  'Repairing Developmental Gaps',
];

const REFLECTIONS = [
  [
    'Which stage of your development is most verbally claimed but least behaviorally evidenced?',
    'Where are you using success in one domain to hide disorder in another?',
    'What stage did you expect marriage, ministry, or career to solve for you?',
    'How does distinguishing ontology from development reduce shame and increase accountability?',
    'What is the first structural repair your household will feel within two weeks?',
  ],
  [
    'Which maturation law do you most often violate while claiming maturity?',
    'How has speed culture distorted your view of development?',
    'Where are you disciplined but misaligned?',
    'What accountability architecture do you avoid, and why?',
    'What one law, if restored, would improve your entire household climate?',
  ],
  [
    'Which is more tempting for you: denial or despair?',
    'What language do you use to avoid naming gaps specifically?',
    'What is your most repeated explanation pattern that substitutes for repair?',
    'How has one unrepaired gap affected a key relationship?',
    'What does humility require from you this month in practical terms?',
  ],
];

function readText(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8').trim();
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function syncOneCatalogue(filePath, modules) {
  const data = loadJson(filePath);
  const list = Array.isArray(data) ? data : data.courses;
  if (!Array.isArray(list)) {
    throw new Error(`Unexpected catalogue shape: ${filePath}`);
  }

  const idx = list.findIndex(c => c && c.courseId === COURSE_ID);
  if (idx === -1) {
    throw new Error(`Course not found (${COURSE_ID}) in ${filePath}`);
  }

  list[idx].description =
    'Study developmental order, maturation laws, and practical repair protocols for full human formation aligned to design.';
  list[idx].duration_weeks = 3;
  list[idx].badge = 'Mini Certificate';
  list[idx].modules = modules;

  saveJson(filePath, data);
}

function main() {
  const moduleBodies = MODULE_FILES.map(readText);
  const modules = moduleBodies.map((content, i) => ({
    title: TITLES[i],
    content,
    reflection_questions: REFLECTIONS[i],
    downloads: [],
  }));

  FILES.forEach(fp => syncOneCatalogue(fp, modules));
  console.log('✅ Synced anthropocentric-development into both catalogues.');
}

main();
