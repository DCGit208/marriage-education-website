'use strict';

const { embedText, cosineSimilarity } = require('./embeddings');
const { CHUNKS_COL } = require('./indexer');

async function retrieveChunks(db, query, opts) {
  const limit = opts?.limit || 12;
  const courseId = opts?.courseId || null;
  const moduleId = opts?.moduleId || null;
  const partId = opts?.partId || null;
  const apiKey = opts?.apiKey;

  const queryVec = await embedText(query, apiKey);
  const col = db.collection(CHUNKS_COL);
  const queries = [
    col.where('sourceType', '==', 'canon').limit(100).get(),
  ];
  if (courseId) {
    queries.push(col.where('courseId', '==', courseId).limit(100).get());
  }
  if (moduleId) {
    queries.push(col.where('moduleId', '==', moduleId).limit(60).get());
  }

  const snaps = await Promise.all(queries);
  const byId = new Map();

  snaps.forEach(function (snap) {
    snap.docs.forEach(function (doc) {
      byId.set(doc.id, doc.data());
    });
  });

  if (!byId.size) {
    const fallback = await col.limit(150).get();
    fallback.docs.forEach(function (doc) {
      byId.set(doc.id, doc.data());
    });
  }

  const scored = [];
  byId.forEach(function (d, id) {
    if (!Array.isArray(d.embedding) || !d.embedding.length) return;

    let boost = 0;
    if (d.sourceType === 'canon') boost += 0.08;
    if (courseId && d.courseId === courseId) boost += 0.12;
    if (moduleId && d.moduleId === moduleId) boost += 0.1;
    if (partId && d.partId === partId) boost += 0.05;

    scored.push({
      id: id,
      score: cosineSimilarity(queryVec, d.embedding) + boost,
      text: d.text,
      title: d.title,
      sourceType: d.sourceType,
      sourcePath: d.sourcePath,
      courseId: d.courseId,
      moduleId: d.moduleId,
      partId: d.partId,
    });
  });

  scored.sort(function (a, b) { return b.score - a.score; });
  return scored.slice(0, limit);
}

function formatCitations(chunks) {
  return chunks.map(function (c, i) {
    return '[' + (i + 1) + '] ' + (c.title || c.sourcePath) + ' (' + c.sourceType + ')';
  });
}

function buildContextBlock(chunks) {
  return chunks.map(function (c, i) {
    return '--- CANON EXCERPT ' + (i + 1) + ': ' + (c.title || c.sourcePath) + ' ---\n' + c.text;
  }).join('\n\n');
}

module.exports = { retrieveChunks, formatCitations, buildContextBlock };
