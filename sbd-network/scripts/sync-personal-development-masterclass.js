/**
 * Sync Course 06 Weeks 1–12 markdown into root and public catalogues.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const COURSE_ID = 'personal-development-masterclass';

const FILES = [
  path.join(ROOT, 'courses-catalogue.json'),
  path.join(ROOT, 'public/courses-catalogue.json'),
];

const TITLES = [
  'Teleios Vision',
  'Identity & Calling',
  'Mental Discipline',
  'Emotional Formation',
  'Temperament Training',
  'Habit Systems',
  'Time & Order',
  'Money & Stewardship',
  'Speech & Presence',
  'Relationships & Repair',
  'Sexual Stewardship',
  'Covenant Readiness',
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
  [
    'Which “that’s just me” sentence has cost your household the most?',
    'How is temperament different from identity — and where have you fused them?',
    'What counter-habit would protect trust this month?',
    'Where are you using a spouse’s opposite style as a substitute for your own governance?',
    'What would predictable virtue look like on a tired Tuesday?',
  ],
  [
    'Which habit have you used as proof you are “becoming someone”?',
    'What destructive habit’s payoff are you still addicted to?',
    'How does Law of Repetition correct both streak vanity and anti-structure pride?',
    'Where is conative refusal hiding inside “I’m still designing my system”?',
    'What one rhythm would your household feel within 21 days?',
  ],
  [
    'What do you fund with hours that design would defund?',
    'How does first-hour capture explain your Mental/Emotional failures?',
    'Where is “busy” covering refusal of a hard conversation?',
    'What margin are you missing that guarantees threshold failure?',
    'How would ordered time change your spouse’s or household’s experience of you?',
  ],
  [
    'What illegal premise about money still runs your choices?',
    'Which leak is actually an Emotional or Mental failure in costume?',
    'How does Week 1 vision constrain what you are allowed to buy?',
    'Where have you outsourced or monopolized money truth in the household?',
    'What would contentment require you to stop chasing — and what would diligence require you to start?',
  ],
  [
    'Which phrase has most damaged trust in your closest relationship?',
    'Where is absence disguised as busyness?',
    'How does Week 3 premise work show up in your sarcasm?',
    'What would your household’s atmosphere be if you removed complaint for 30 days?',
    'Where do you still recruit someone else to regulate your tone?',
  ],
  [
    'What unrepaired harm still taxes your closest relationship?',
    'Do you delay repair from shame or from pride?',
    'Where have you used “we” language to avoid “I”?',
    'How is repair different from people-pleasing?',
    'What act would make this week’s apology believable?',
  ],
  [
    'Where have you treated desire as ontology?',
    'What compromise’s payoff are you still protecting?',
    'How does better whole change sexual expectation of a spouse?',
    'What device or context is your highest-risk cue?',
    'What would 14 days of loyalty evidence change in your household’s trust?',
  ],
  [
    'What have you been calling “readiness” that was only desire?',
    'Which capacity is evidenced — and which is still branding?',
    'How does better whole change your marriage timeline or marriage practice?',
    'What frontier, if ignored, would most damage a household?',
    'What will Day 30 look like if you keep today’s plan?',
  ],
];

function main() {
  const bodies = TITLES.map((_, i) => {
    const n = String(i + 1).padStart(2, '0');
    const fp = path.join(ROOT, `docs/content/personal-development-masterclass/course/modules/week-${n}.md`);
    if (!fs.existsSync(fp)) throw new Error('Missing ' + fp);
    return fs.readFileSync(fp, 'utf8').trim();
  });

  FILES.forEach(function (filePath) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const list = Array.isArray(data) ? data : data.courses;
    const idx = list.findIndex(c => c && c.courseId === COURSE_ID);
    if (idx === -1) throw new Error('Course not found in ' + filePath);
    list[idx].description =
      '12-week intensive: personal development as responsible expression of design — vision, identity, attributes, habits, order, speech, repair, sexuality, and covenant readiness. Teleios is not manufactured; it is espoused and lived.';
    list[idx].modules = bodies.map((content, i) => ({
      title: TITLES[i],
      content,
      reflection_questions: REFLECTIONS[i],
      downloads: [],
    }));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  });
  console.log('✅ Synced personal-development-masterclass weeks 1–12 into both catalogues.');
}

main();
