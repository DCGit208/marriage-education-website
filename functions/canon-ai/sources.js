'use strict';

const fs = require('fs');
const path = require('path');

function safeRead(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return null;
  }
}

function walkMarkdown(dir, out, repoRoot, sourceType) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach(function (ent) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkMarkdown(full, out, repoRoot, sourceType);
      return;
    }
    if (!ent.name.endsWith('.md')) return;
    const text = safeRead(full);
    if (!text || text.length < 40) return;
    const rel = path.relative(repoRoot, full).replace(/\\/g, '/');
    out.push({
      sourceKey: 'repo:' + rel,
      sourceType: sourceType || 'repo_markdown',
      sourcePath: rel,
      title: ent.name.replace(/\.md$/, ''),
      text: text,
    });
  });
}

function extractCatalogueModules(cataloguePath) {
  const raw = safeRead(cataloguePath);
  if (!raw) return [];
  let data;
  try { data = JSON.parse(raw); } catch (e) { return []; }
  const out = [];
  if (!Array.isArray(data)) return out;

  data.forEach(function (course) {
    const courseId = course.courseId || course.id || 'unknown';
    const courseTitle = course.title || courseId;
    if (course.description) {
      out.push({
        sourceKey: 'catalogue:' + courseId + ':meta',
        sourceType: 'course_catalogue',
        sourcePath: 'courses-catalogue.json',
        courseId: courseId,
        title: courseTitle + ' (overview)',
        text: '# ' + courseTitle + '\n\n' + course.description,
      });
    }
    (course.modules || []).forEach(function (mod, idx) {
      if (!mod.content || mod.content.length < 80) return;
      out.push({
        sourceKey: 'catalogue:' + courseId + ':week-' + (idx + 1),
        sourceType: 'course_catalogue',
        sourcePath: 'courses-catalogue.json',
        courseId: courseId,
        title: (mod.title || ('Week ' + (idx + 1))) + ' — ' + courseTitle,
        text: mod.content,
      });
    });
  });
  return out;
}

function extractSchoolCourses(schoolPath) {
  const raw = safeRead(schoolPath);
  if (!raw) return [];
  let data;
  try { data = JSON.parse(raw); } catch (e) { return []; }
  const out = [];
  if (!Array.isArray(data)) return out;

  data.forEach(function (course) {
    const courseId = course.id || course.courseId || course.slug;
    if (!courseId) return;
    const bits = [
      '# ' + (course.title || courseId),
      course.description || '',
      course.summary || '',
      course.objectives ? 'Objectives: ' + JSON.stringify(course.objectives) : '',
    ].filter(Boolean).join('\n\n');
    if (bits.length < 60) return;
    out.push({
      sourceKey: 'school:' + courseId,
      sourceType: 'school_master',
      sourcePath: 'schoolcourses.json',
      courseId: courseId,
      title: course.title || courseId,
      text: bits,
    });
  });
  return out;
}

function extractShopCatalog(shopPath) {
  const raw = safeRead(shopPath);
  if (!raw) return [];
  let data;
  try { data = JSON.parse(raw); } catch (e) { return []; }
  const products = data.products || data;
  if (!Array.isArray(products)) return [];
  return products.map(function (p) {
    const id = p.id || p.productId;
    const text = [
      '# ' + (p.name || p.title || id),
      p.tagline || '',
      p.description || '',
      p.longDescription || '',
    ].filter(Boolean).join('\n\n');
    return {
      sourceKey: 'shop:' + id,
      sourceType: 'shop_product',
      sourcePath: 'sbd-network/public/data/shop-catalog.json',
      title: p.name || p.title || id,
      text: text,
    };
  }).filter(function (s) { return s.text && s.text.length > 50; });
}

function collectRepoSources(repoRoot) {
  const defaultRoot = path.resolve(__dirname, '../..');
  const root = repoRoot || defaultRoot;
  const sources = [];
  const seen = new Set();

  function pushSource(source) {
    if (!source || !source.sourceKey || seen.has(source.sourceKey)) return;
    seen.add(source.sourceKey);
    sources.push(source);
  }

  function pushAll(list) {
    (list || []).forEach(pushSource);
  }

  const canonFile = path.join(root, 'SBD-UNIFIED-CANON.md');
  const canonText = safeRead(canonFile);
  if (canonText) {
    pushSource({
      sourceKey: 'canon:unified',
      sourceType: 'canon',
      sourcePath: 'SBD-UNIFIED-CANON.md',
      title: 'SBD Unified Canon',
      text: canonText,
      priority: 1,
    });
  }

  const fromWalk = [];
  walkMarkdown(path.join(root, 'docs/canon'), fromWalk, root, 'canon');
  walkMarkdown(path.join(root, 'docs/content'), fromWalk, root, 'course_repo');
  pushAll(fromWalk);

  // Only walk the local bundled mirror when indexing from the full repo root.
  // Cloud reindex already passes functions/canon-ai/bundled as repoRoot.
  const bundledDir = path.join(__dirname, 'bundled');
  if (path.resolve(root) !== path.resolve(bundledDir) && fs.existsSync(bundledDir)) {
    const bundled = [];
    walkMarkdown(bundledDir, bundled, bundledDir, 'canon');
    pushAll(bundled);
  }

  if (fs.existsSync(root)) {
    fs.readdirSync(root).filter(function (f) {
      return /^WEEK-.+\.md$/i.test(f);
    }).forEach(function (f) {
      const text = safeRead(path.join(root, f));
      if (text) {
        pushSource({
          sourceKey: 'repo:' + f,
          sourceType: 'repo_markdown',
          sourcePath: f,
          title: f.replace(/\.md$/, ''),
          text: text,
        });
      }
    });
  }

  pushAll(extractCatalogueModules(path.join(root, 'courses-catalogue.json')));
  pushAll(extractSchoolCourses(path.join(root, 'schoolcourses.json')));
  pushAll(extractShopCatalog(path.join(root, 'sbd-network/public/data/shop-catalog.json')));

  const aiPlan = safeRead(path.join(root, 'AI-CHATBOT-IMPLEMENTATION-PLAN.md'));
  if (aiPlan && aiPlan.length > 500) {
    pushSource({
      sourceKey: 'repo:AI-CHATBOT-IMPLEMENTATION-PLAN.md',
      sourceType: 'ops_docs',
      sourcePath: 'AI-CHATBOT-IMPLEMENTATION-PLAN.md',
      title: 'AI Chatbot Plan',
      text: aiPlan.slice(0, 120000),
    });
  }

  return sources;
}

module.exports = {
  collectRepoSources,
  safeRead,
  walkMarkdown,
};
