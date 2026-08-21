/**
 * Sync Course 13 Temperament Intelligence into catalogues.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const COURSE_ID = 'temperament-intelligence';
const FILES = [path.join(ROOT, 'courses-catalogue.json'), path.join(ROOT, 'public/courses-catalogue.json')];
const TITLES = ['Temperament Basics', 'Temperament in Conflict', 'Temperament Harmony'];
const REFLECTIONS = [
  ['What contempt word do you use for their flavor?', 'Where do you excuse yourself with temperament?', 'What strength of theirs have you refused to honor?', 'How does better whole change “make them like me”?', 'What did the log show under fatigue?'],
  ['Which contempt label do you reach for first?', 'What question would have saved last month’s fight?', 'Where is “curiosity” avoiding decision?', 'How do your flavors collide at 10pm?', 'What changed when you asked instead of accused?'],
  ['Which difference have you treated as a defect to erase?', 'What honor act costs you pride?', 'How does gratitude change the downside ask?', 'What does Day 30 of honor look like?', 'How will temperament intelligence serve your rulebook?'],
];
function main() {
  const bodies = TITLES.map((_, i) => {
    const fp = path.join(ROOT, `docs/content/temperament-intelligence/course/modules/week-${String(i + 1).padStart(2, '0')}.md`);
    if (!fs.existsSync(fp)) throw new Error('Missing ' + fp);
    return fs.readFileSync(fp, 'utf8').trim();
  });
  FILES.forEach((filePath) => {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const list = Array.isArray(data) ? data : data.courses;
    const idx = list.findIndex((c) => c && c.courseId === COURSE_ID);
    if (idx === -1) throw new Error('Course not found in ' + filePath);
    list[idx].description = 'Master how to work with different temperaments in marriage without contempt or resentment — understand, honor, and steward difference.';
    list[idx].modules = bodies.map((content, i) => ({ title: TITLES[i], content, reflection_questions: REFLECTIONS[i], downloads: [] }));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  });
  console.log('✅ Synced temperament-intelligence weeks 1–3');
}
main();
