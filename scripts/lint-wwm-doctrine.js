#!/usr/bin/env node
/**
 * Doctrine linter for The Woman, The Wife, The Mother courseware.
 * Fails build on banned anti-covenant / therapeutic / woke phrasing.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MODULES_DIR = path.join(ROOT, 'docs/content/woman-wife-mother/course/modules');
const MIN_WORDS = 3500;

/** @type {{ pattern: RegExp; label: string; allowInComment?: boolean }[]} */
const BANNED = [
  { pattern: /domestic reduction/i, label: 'domestic reduction' },
  { pattern: /cosmic in scope/i, label: 'cosmic in scope' },
  { pattern: /identity before roles?/i, label: 'identity before roles' },
  { pattern: /before any covenant (role|title|status)/i, label: 'before any covenant role/title/status' },
  { pattern: /teleios before covenant/i, label: 'teleios before covenant' },
  { pattern: /role strip/i, label: 'role strip' },
  { pattern: /roles are stripped away/i, label: 'roles are stripped away' },
  { pattern: /alone before God/i, label: 'alone before God' },
  { pattern: /I am woman first/i, label: 'I am woman first' },
  { pattern: /before roles activate/i, label: 'before roles activate' },
  { pattern: /outsourced identity/i, label: 'outsourced identity' },
  { pattern: /deferred identity/i, label: 'deferred identity' },
  { pattern: /flesh, not function/i, label: 'flesh, not function' },
  { pattern: /make my home/i, label: 'make my home (petition)' },
  { pattern: /authentic self/i, label: 'authentic self' },
  { pattern: /(?<!not )endless becoming/i, label: 'endless becoming (affirmative)' },
  { pattern: /co-ordinate bearer.*before roles/i, label: 'co-ordinate before roles' },
  { pattern: /teleios wholeness before roles/i, label: 'teleios wholeness before roles' },
  { pattern: /renounce deferred/i, label: 'renounce deferred' },
  { pattern: /\bfunctionalism\b/i, label: 'functionalism (use fragmentation — function flows from design)' },
  { pattern: /\bfunctionalist\b/i, label: 'functionalist (use fragmented)' },
  { pattern: /sex-only|helper-only|logistics-only|maid-only/i, label: 'invented either/or reduction (state wifehood positively from design)' },
  { pattern: /Reduce .+ to .+-only/i, label: 'invented reduction framing' },
];

const REQUIRED_HEADINGS = [
  '## I. Ontology',
  '## II. Consciousness',
  '## III. Discipline',
  '## IV. Practice',
  '## Reading Assignment',
  '## Core Definitions',
  '## Scripture Study',
  '## Formation Exercises',
  '## Prayer / Liturgy',
];

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function lintFile(filePath) {
  const rel = path.relative(ROOT, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const errors = [];
  const warnings = [];

  for (const { pattern, label } of BANNED) {
    const m = content.match(pattern);
    if (m) {
      const line = content.slice(0, m.index).split('\n').length;
      errors.push(`${rel}:${line} — banned: ${label}`);
    }
  }

  for (const heading of REQUIRED_HEADINGS) {
    if (!content.includes(heading)) {
      errors.push(`${rel} — missing required section: ${heading}`);
    }
  }

  const words = wordCount(content);
  if (words < MIN_WORDS) {
    warnings.push(`${rel} — ${words} words (flagship minimum ${MIN_WORDS})`);
  }

  return { errors, warnings, words };
}

function main() {
  const strictWords = process.argv.includes('--strict-words');
  const files = fs
    .readdirSync(MODULES_DIR)
    .filter((f) => /^week-\d{2}\.md$/.test(f))
    .sort()
    .map((f) => path.join(MODULES_DIR, f));

  if (!files.length) {
    console.error('No module files found.');
    process.exit(1);
  }

  const allErrors = [];
  const allWarnings = [];

  for (const file of files) {
    const { errors, warnings } = lintFile(file);
    allErrors.push(...errors);
    allWarnings.push(...warnings);
  }

  if (allWarnings.length) {
    console.warn('⚠️  Warnings:');
    allWarnings.forEach((w) => console.warn(`   ${w}`));
  }

  if (allErrors.length) {
    console.error('❌ Doctrine lint failed:');
    allErrors.forEach((e) => console.error(`   ${e}`));
    process.exit(1);
  }

  if (strictWords && allWarnings.length) {
    console.error('❌ Strict word-count check failed (use without --strict-words during batch upgrade).');
    process.exit(1);
  }

  console.log(`✅ Doctrine lint passed (${files.length} modules)`);
}

main();
