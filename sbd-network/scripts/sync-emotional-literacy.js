/**
 * Sync Course 12 Emotional Literacy into catalogues.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const COURSE_ID = 'emotional-literacy';
const FILES = [path.join(ROOT, 'courses-catalogue.json'), path.join(ROOT, 'public/courses-catalogue.json')];
const TITLES = ['Naming Emotions', 'Regulation', 'Emotion in Conflict', 'Emotional Repair'];
const REFLECTIONS = [
  ['Which emotion is most illegal in your story?', 'What do you lose by staying at “fine”?', 'How does naming protect better whole?', 'Couples: what happens when you name without fixing?', 'What word was hardest to admit?'],
  ['Where does reaction still win?', 'Is your “regulation” actually freeze?', 'What cue needs environmental help (leave room)?', 'How does pause honor the other?', 'What failed pause taught you most?'],
  ['Which conflict emotion is your captain?', 'Where does blame protect you from ownership?', 'What happens when you name mid-storm?', 'How does this serve covenant readiness?', 'What journal line surprised you?'],
  ['Which repair failure repeats?', 'What emotion do you still refuse to name in apology?', 'How does mending differ from self-erasure?', 'What will you carry into temperament work?', 'What proves literacy in your household this month?'],
];
function main() {
  const bodies = TITLES.map((_, i) => {
    const fp = path.join(ROOT, `docs/content/emotional-literacy/course/modules/week-${String(i + 1).padStart(2, '0')}.md`);
    if (!fs.existsSync(fp)) throw new Error('Missing ' + fp);
    return fs.readFileSync(fp, 'utf8').trim();
  });
  FILES.forEach((filePath) => {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const list = Array.isArray(data) ? data : data.courses;
    const idx = list.findIndex((c) => c && c.courseId === COURSE_ID);
    if (idx === -1) throw new Error('Course not found in ' + filePath);
    list[idx].description = 'Understand, name, and steward emotions without being controlled by them. Essential for covenant life — couples and singles.';
    list[idx].modules = bodies.map((content, i) => ({ title: TITLES[i], content, reflection_questions: REFLECTIONS[i], downloads: [] }));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  });
  console.log('✅ Synced emotional-literacy weeks 1–4');
}
main();
