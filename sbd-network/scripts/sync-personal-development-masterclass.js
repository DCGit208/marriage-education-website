/**
 * Sync Course 06 Weeks 1–4 markdown into root and public catalogues.
 * Weeks 5–12 remain catalogue stubs until written.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const COURSE_ID = 'personal-development-masterclass';

const FILES = [
  path.join(ROOT, 'courses-catalogue.json'),
  path.join(ROOT, 'public/courses-catalogue.json'),
];

const MODULE_FILES = [
  path.join(ROOT, 'docs/content/personal-development-masterclass/course/modules/week-01.md'),
  path.join(ROOT, 'docs/content/personal-development-masterclass/course/modules/week-02.md'),
  path.join(ROOT, 'docs/content/personal-development-masterclass/course/modules/week-03.md'),
  path.join(ROOT, 'docs/content/personal-development-masterclass/course/modules/week-04.md'),
];

const TITLES = [
  'Teleios Vision',
  'Identity & Calling',
  'Mental Discipline',
  'Emotional Formation',
];

const REFLECTIONS = [
  [
    'Where have you used “vision” to postpone obedience?',
    'Which of your aims would collapse if applause disappeared?',
    'How does “better whole” change what you are allowed to want from a spouse or future spouse?',
    'What is the difference between a small faithful vision and a small frightened one?',
    'If your vision scaled to a hundred households, what fruit would appear?',
  ],
  [
    'What do you say after “I am…” when no one impressive is listening?',
    'Which role has been allowed to eat identity?',
    'How is “waiting for my calling” functioning as conative refusal?',
    'What would better whole require of your calling hopes toward marriage?',
    'Which word in your calling sentence is fashion rather than design?',
  ],
  [
    'Which hidden premise most often impersonates “insight”?',
    'Where do you confuse Cognitive strength (cleverness) with Mental discipline (true premises)?',
    'What inner sentence would be a covenant violation if spoken to a spouse?',
    'How does “I am my thoughts” smuggle identity collapse?',
    'What next act do your loops most often prevent?',
  ],
  [
    'Do you sin more by explosion or by freeze — and how have you baptized that pattern?',
    'What claim does your most common feeling make about your ontology?',
    'Whom have you recruited as mood-regulator?',
    'How is Emotional attribute different from Affective care?',
    'What would your household experience if you became 20% more predictable this month?',
  ],
];

function readText(filePath) {
  if (!fs.existsSync(filePath)) throw new Error('Missing file: ' + filePath);
  return fs.readFileSync(filePath, 'utf8').trim();
}

function main() {
  const bodies = MODULE_FILES.map(readText);
  FILES.forEach(function (filePath) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const list = Array.isArray(data) ? data : data.courses;
    const idx = list.findIndex(c => c && c.courseId === COURSE_ID);
    if (idx === -1) throw new Error('Course not found in ' + filePath);
    list[idx].description =
      '12-week intensive: personal development as responsible expression of design — vision, identity, attributes, habits, order, and covenant readiness. Teleios is not manufactured; it is espoused and lived.';
    const mods = list[idx].modules || [];
    for (let i = 0; i < 4; i++) {
      mods[i] = {
        title: TITLES[i],
        content: bodies[i],
        reflection_questions: REFLECTIONS[i],
        downloads: mods[i] && mods[i].downloads ? mods[i].downloads : [],
      };
    }
    list[idx].modules = mods;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  });
  console.log('✅ Synced personal-development-masterclass weeks 1–4 into both catalogues.');
}

main();
