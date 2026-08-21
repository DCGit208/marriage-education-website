/**
 * Sync Course 08 (Heart of Relationship L1) into root and public catalogues.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const COURSE_ID = 'heart-of-relationship-l1';
const FILES = [
  path.join(ROOT, 'courses-catalogue.json'),
  path.join(ROOT, 'public/courses-catalogue.json'),
];

const TITLES = [
  'What Relationships Are',
  'Trust & Safety',
  'Communication Basics',
  'Repair Basics',
];

const REFLECTIONS = [
  [
    'Where do you still call accident “chemistry”?',
    'Which bond has no named purpose — only habit?',
    'How does better whole change what you ask of people?',
    'What type confusion is costing you trust?',
    'What would designed relatedness look like for 30 days in one bond?',
  ],
  [
    'Where have you confused intensity with trust?',
    'Which subtle break is still unpaid?',
    'What ritual is small enough for fatigue days?',
    'How does predictability honor better whole?',
    'Where do you retaliate when truth is told?',
  ],
  [
    'Which destructive pattern has the highest payoff for you?',
    'Where do you confuse volume with honesty?',
    'What would “one issue, one ask” change this week?',
    'How does better whole kill mind-reading demands?',
    'After three days without interrupting, what did you notice?',
  ],
  [
    'Which repair failure mode is your default?',
    'What rupture are you still riding flat?',
    'How does better whole change your apology script?',
    'What next act would make this week’s repair believable?',
    'What must remain true for 30 days after this course?',
  ],
];

function main() {
  const bodies = TITLES.map((_, i) => {
    const n = String(i + 1).padStart(2, '0');
    const fp = path.join(ROOT, `docs/content/heart-of-relationship-l1/course/modules/week-${n}.md`);
    if (!fs.existsSync(fp)) throw new Error('Missing ' + fp);
    return fs.readFileSync(fp, 'utf8').trim();
  });

  FILES.forEach((filePath) => {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const list = Array.isArray(data) ? data : data.courses;
    const idx = list.findIndex((c) => c && c.courseId === COURSE_ID);
    if (idx === -1) throw new Error('Course not found in ' + filePath);
    list[idx].description =
      'Foundational relational intelligence — relationships as design systems, trust as structure, communication as oxygen, and repair as maintenance. Better whole, not better half.';
    list[idx].modules = bodies.map((content, i) => ({
      title: TITLES[i],
      content,
      reflection_questions: REFLECTIONS[i],
      downloads: [],
    }));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  });
  console.log('✅ Synced heart-of-relationship-l1 weeks 1–4 into both catalogues.');
}

main();
