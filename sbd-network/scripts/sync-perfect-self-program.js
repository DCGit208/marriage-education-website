/**
 * Sync Course 11 Perfect Self Program into catalogues.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const COURSE_ID = 'perfect-self-program';
const FILES = [path.join(ROOT, 'courses-catalogue.json'), path.join(ROOT, 'public/courses-catalogue.json')];
const TITLES = ['Teleios Starting Point', 'Identity Practice', 'Holiness & Joy', 'Sustainable Growth'];
const REFLECTIONS = [
  ['Where is chase still your default religion?', 'What would change if teleios were truly starting point tomorrow morning?', 'How does seed/tree confront self-hatred growth?', 'Where do you confuse passivity with resting in design?', 'How does better whole kill completion-chase?'],
  ['Which leak costs your household most?', 'What practice is small enough for fatigue?', 'How does sharing change private mythology?', 'Where do you still try to invent identity?', 'What did Day 7 reveal vs Day 1?'],
  ['Where did you learn shame=holy?', 'What joy feels “illegal” to you — and why?', 'How does state language change repentance?', 'What ritual cue will survive busy weeks?', 'How does joy serve covenant presence?'],
  ['Which “growth” habit is actually punishment?', 'What 30-day goal is small enough to keep?', 'How will you treat Day-10 miss?', 'What does rooted look like in your household?', 'What charter line must never be renegotiated?'],
];
function main() {
  const bodies = TITLES.map((_, i) => {
    const fp = path.join(ROOT, `docs/content/perfect-self-program/course/modules/week-${String(i + 1).padStart(2, '0')}.md`);
    if (!fs.existsSync(fp)) throw new Error('Missing ' + fp);
    return fs.readFileSync(fp, 'utf8').trim();
  });
  FILES.forEach((filePath) => {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const list = Array.isArray(data) ? data : data.courses;
    const idx = list.findIndex((c) => c && c.courseId === COURSE_ID);
    if (idx === -1) throw new Error('Course not found in ' + filePath);
    list[idx].description = 'Learn to live from teleios identity, not chase it. Practice from perfection as your starting point — holiness as state, joy as fruit, growth without self-hatred.';
    list[idx].modules = bodies.map((content, i) => ({ title: TITLES[i], content, reflection_questions: REFLECTIONS[i], downloads: [] }));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  });
  console.log('✅ Synced perfect-self-program weeks 1–4');
}
main();
