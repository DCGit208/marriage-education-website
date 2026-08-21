/**
 * Sync Course 09 (Relationship Relatednesses L2) into catalogues.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const COURSE_ID = 'relationship-relatednesses-l2';
const FILES = [
  path.join(ROOT, 'courses-catalogue.json'),
  path.join(ROOT, 'public/courses-catalogue.json'),
];

const TITLES = [
  'Relatedness Framework',
  'Boundaries & Honor',
  'Power & Responsibility',
  'Conflict Patterns',
  'Rebuilding Trust',
  'Covenant Governance',
];

const REFLECTIONS = [
  [
    'Which node is overloaded?',
    'Where is access beyond type?',
    'What function are you demanding illegally?',
    'How does better whole change your network expectations?',
    'What edge needs clearer labeling this week?',
  ],
  [
    'Whose “no” do you still resent?',
    'Where is your love still access-hungry?',
    'How does honor differ from people-pleasing?',
    'What fence would protect your household most?',
    'Where have you used boundaries as revenge?',
  ],
  [
    'Where is your unowned power?',
    'Where is your voiceless responsibility?',
    'How does better whole confront parentalizing a spouse?',
    'What one clarification would reduce resentment most?',
    'After three audit days, what pattern surprised you?',
  ],
  [
    'What cue starts your worst pattern?',
    'How does “winning” cost trust?',
    'What replacement is still too vague for peak heat?',
    'Where does power distort your conflict moves?',
    'What did the journal reveal that memory hid?',
  ],
  [
    'Which break still has no name?',
    'What brick is hardest because it costs status?',
    'How do you pressure for premature “I trust you”?',
    'If injured, where are goalposts moving as revenge?',
    'What does “rebuilt enough” look like in behavior — not feelings?',
  ],
  [
    'Where has “organic” been a cover for drift?',
    'What rule was hardest to write — and why?',
    'How will you keep meetings from becoming court?',
    'What structure gap, if ignored, will cost most in 90 days?',
    'What 30-day governance rhythm will you keep?',
  ],
];

function main() {
  const bodies = TITLES.map((_, i) => {
    const n = String(i + 1).padStart(2, '0');
    const fp = path.join(ROOT, `docs/content/relationship-relatednesses-l2/course/modules/week-${n}.md`);
    if (!fs.existsSync(fp)) throw new Error('Missing ' + fp);
    return fs.readFileSync(fp, 'utf8').trim();
  });

  FILES.forEach((filePath) => {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const list = Array.isArray(data) ? data : data.courses;
    const idx = list.findIndex((c) => c && c.courseId === COURSE_ID);
    if (idx === -1) throw new Error('Course not found in ' + filePath);
    list[idx].description =
      'Advanced relational mastery — relatedness as design system: boundaries and honor, power with responsibility, conflict patterns, structural trust rebuild, and covenant governance. Better whole throughout.';
    list[idx].modules = bodies.map((content, i) => ({
      title: TITLES[i],
      content,
      reflection_questions: REFLECTIONS[i],
      downloads: [],
    }));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  });
  console.log('✅ Synced relationship-relatednesses-l2 weeks 1–6 into both catalogues.');
}

main();
