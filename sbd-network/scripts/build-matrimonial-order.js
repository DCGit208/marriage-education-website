#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, '../content/books/the-matrimonial-order.md');
const outputPath = path.join(__dirname, '../public/data/books/the-matrimonial-order.json');
const source = fs.readFileSync(sourcePath, 'utf8');
const headings = Array.from(source.matchAll(/^## Chapter (\d+): (.+)$/gm));

if (headings.length !== 20) {
  throw new Error(`Expected 20 chapters, found ${headings.length}.`);
}

const chapters = headings.map((heading, index) => {
  const start = heading.index + heading[0].length;
  const end = index + 1 < headings.length ? headings[index + 1].index : source.length;
  const body = source.slice(start, end).trim();
  const number = heading[1].padStart(2, '0');
  const title = `Chapter ${heading[1]} — ${heading[2]}`;

  if (!body) {
    throw new Error(`Chapter ${heading[1]} has no content.`);
  }

  return {
    id: `ch-${number}`,
    title,
    order: index + 1,
    content: `# ${title}\n\n${body}`,
  };
});

const book = {
  id: 'the-matrimonial-order',
  title: 'The Matrimonial Order: An Exhaustive Guide',
  subtitle: 'A Christian study of covenant, mutual responsibility, and Ephesians 5:21–33',
  description: 'A 20-chapter study guide with practical exercises for individuals, couples, and facilitators.',
  coverImage: '/assets/book-covers/the-matrimonial-order.png',
  author: 'Dr. Coach Achu Gustave',
  source: 'SBD Network digital edition',
  chapterCount: chapters.length,
  chapters,
};

fs.writeFileSync(outputPath, `${JSON.stringify(book, null, 2)}\n`, 'utf8');
console.log(`Built ${chapters.length} chapters → ${path.relative(process.cwd(), outputPath)}`);
