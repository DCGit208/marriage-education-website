/**
 * Sync Course 10 (Relationship Mastery Intensive L3) into catalogues.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const COURSE_ID = 'relationship-mastery-intensive-l3';
const FILES = [
  path.join(ROOT, 'courses-catalogue.json'),
  path.join(ROOT, 'public/courses-catalogue.json'),
];

const TITLES = [
  'Covenant Mindset',
  'Attachment & Stability',
  'Emotional Regulation',
  'Communication Mastery',
  'Conflict Mastery',
  'Repair & Forgiveness',
  'Intimacy & Presence',
  'Relationship Rulebook',
];

const REFLECTIONS = [
  [
    'Where is your language covenant and your reflex contract?',
    'Which non-negotiable have you been afraid to write?',
    'How does wisdom differ from convenience exit?',
    'How does better whole change covenant expectation?',
    'What foundation stone is still missing?',
  ],
  [
    'What premise turns distance into ontology panic?',
    'Where do you baptize pattern as identity?',
    'What stability act is small enough for high-load days?',
    'How does better whole change co-regulation asks?',
    'After five days, what pattern was most frequent?',
  ],
  [
    'Which trigger still owns you?',
    'Where do you confuse discharge with truth?',
    'How is numbness failing your household?',
    'What premise needs Mental interruption?',
    'Did return-times get kept this week?',
  ],
  [
    'What do people say you do mid-conversation?',
    'Which habit’s payoff are you protecting?',
    'How often is your paraphrase wrong — and do you welcome correction?',
    'Where does better whole kill mind-reading?',
    'What changed after three days of mirroring?',
  ],
  [
    'Which error is your signature move?',
    'Where did you skip the protocol for speed?',
    'How does “own 10% first” change heat?',
    'Who has power to ignore the card — and will they submit?',
    'What did 24-hour outcomes teach?',
  ],
  [
    'What backlog item have you romanticized as “just time”?',
    'Where do you confuse forgiveness with trust?',
    'What revenge are you still collecting interest on?',
    'How does better whole change reconnection terms?',
    'What structural next step makes release credible?',
  ],
  [
    'What barrier is most expensive?',
    'Where do you use pressure instead of presence?',
    'How does type confusion fake intimacy?',
    'What did seven dinners reveal?',
    'How does better whole change sexual/emotional expectation?',
  ],
  [
    'Which wish have you mistaken for a rule?',
    'Which rule will cost status but save the bond?',
    'How will you keep review from becoming court?',
    'What does Day 30 look like if the rulebook lives?',
    'How does better whole show in your five rules?',
  ],
];

function main() {
  const bodies = TITLES.map((_, i) => {
    const n = String(i + 1).padStart(2, '0');
    const fp = path.join(
      ROOT,
      `docs/content/relationship-mastery-intensive-l3/course/modules/week-${n}.md`
    );
    if (!fs.existsSync(fp)) throw new Error('Missing ' + fp);
    return fs.readFileSync(fp, 'utf8').trim();
  });

  FILES.forEach((filePath) => {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const list = Array.isArray(data) ? data : data.courses;
    const idx = list.findIndex((c) => c && c.courseId === COURSE_ID);
    if (idx === -1) throw new Error('Course not found in ' + filePath);
    list[idx].description =
      'Expert-level relationship intelligence — covenant mindset, stability patterns, emotional regulation, communication and conflict mastery, structural forgiveness, presence intimacy, and a living rulebook. Better whole throughout.';
    list[idx].modules = bodies.map((content, i) => ({
      title: TITLES[i],
      content,
      reflection_questions: REFLECTIONS[i],
      downloads: [],
    }));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  });
  console.log('✅ Synced relationship-mastery-intensive-l3 weeks 1–8 into both catalogues.');
}

main();
