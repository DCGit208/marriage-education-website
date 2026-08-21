/**
 * Sync Course 07 (Science of Self-Command) into root and public catalogues.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const COURSE_ID = 'science-of-self-command';
const FILES = [
  path.join(ROOT, 'courses-catalogue.json'),
  path.join(ROOT, 'public/courses-catalogue.json'),
];

const TITLES = [
  'Self-Governance',
  'Discipline Systems',
  'Impulse & Desire',
  'Consistency',
  'Leadership of Self',
];

const REFLECTIONS = [
  [
    'Where is self-neglect currently most expensive?',
    'Whom have you recruited to supply your will?',
    'How is self-governance different from harsh self-hatred?',
    'What would your household experience if you governed yourself for 30 days?',
    'Which faculty/attribute failure most explains your drift?',
  ],
  [
    'Which domain leak costs your household the most?',
    'Where do you still wait for mood?',
    'What environmental change would make the right act easier?',
    'How does your mantra avoid worth-manufacturing?',
    'Whom might you be asking to be your system?',
  ],
  [
    'Which payoff keeps your top impulse alive?',
    'Where do you still treat desire as identity?',
    'What redirect is too vague to work at peak?',
    'How is this week continuous with sexual stewardship without reducing to it alone?',
    'Whom have you asked to be your bit and rein?',
  ],
  [
    'What excuse liturgy ends your streaks?',
    'Is your standard heroic or minimum?',
    'Where is consistency selective (easy domains only)?',
    'How does inconsistency train your household to parent you?',
    'What miss protocol will you actually use?',
  ],
  [
    'Where do you break your own word first?',
    'What accountability have you kept too vague on purpose?',
    'Which model practice will you transfer — concretely?',
    'How does Proverbs 16:32 confront your image of “strong leadership”?',
    'What household fruit should be visible by Day 30?',
  ],
];

function main() {
  const bodies = TITLES.map((_, i) => {
    const n = String(i + 1).padStart(2, '0');
    const fp = path.join(ROOT, `docs/content/science-of-self-command/course/modules/week-${n}.md`);
    if (!fs.existsSync(fp)) throw new Error('Missing ' + fp);
    return fs.readFileSync(fp, 'utf8').trim();
  });

  FILES.forEach((filePath) => {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const list = Array.isArray(data) ? data : data.courses;
    const idx = list.findIndex((c) => c && c.courseId === COURSE_ID);
    if (idx === -1) throw new Error('Course not found in ' + filePath);
    list[idx].description =
      'Teleios Self-Governance Program — self-command as responsible rule of appetite, impulse, and action before leading a family. Discipline systems, not mood; consistency as fruit, not ontology manufacture.';
    list[idx].modules = bodies.map((content, i) => ({
      title: TITLES[i],
      content,
      reflection_questions: REFLECTIONS[i],
      downloads: [],
    }));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  });
  console.log('✅ Synced science-of-self-command weeks 1–5 into both catalogues.');
}

main();
