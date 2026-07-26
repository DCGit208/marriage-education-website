'use strict';

const { chunkText, hashContent } = require('./chunker');
const { embedText, embedBatch } = require('./embeddings');
const { collectRepoSources } = require('./sources');

const CHUNKS_COL = 'canon_chunks';
const SOURCES_COL = 'canon_index/sources';
const META_DOC = 'meta';
const META_COL = 'canon_index';

async function deleteChunksForSource(db, sourceKey) {
  const snap = await db.collection(CHUNKS_COL).where('sourceKey', '==', sourceKey).get();
  if (snap.empty) return 0;
  const batchSize = 40;
  let deleted = 0;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    docs.slice(i, i + batchSize).forEach(function (doc) {
      batch.delete(doc.ref);
      deleted++;
    });
    await batch.commit();
  }
  return deleted;
}

async function indexSourceDocument(db, source, apiKey, opts) {
  const contentHash = hashContent(source.text);
  const sourceRef = db.collection('canon_index').doc('sources').collection('items').doc(
    source.sourceKey.replace(/[/.]/g, '_').slice(0, 120)
  );

  const existing = await sourceRef.get();
  if (existing.exists && existing.data().contentHash === contentHash && !opts?.force) {
    return { skipped: true, sourceKey: source.sourceKey, chunks: existing.data().chunkCount || 0 };
  }

  await deleteChunksForSource(db, source.sourceKey);

  const pieces = chunkText(source.text);
  if (!pieces.length) return { skipped: true, sourceKey: source.sourceKey, chunks: 0 };

  const embeddings = opts?.dryRun
    ? pieces.map(function () { return []; })
    : await embedBatch(pieces.map(function (p) { return p.text; }), apiKey);

  const chunkIds = [];
  // Keep batches small: embedding vectors make large writes.
  const WRITE_BATCH = 40;
  let batch = db.batch();
  let ops = 0;

  for (let i = 0; i < pieces.length; i++) {
    const chunkId = source.sourceKey.replace(/[/.:]/g, '_').slice(0, 140) + '__' + i;
    chunkIds.push(chunkId);
    const doc = {
      id: chunkId,
      sourceKey: source.sourceKey,
      sourceType: source.sourceType || 'unknown',
      sourcePath: source.sourcePath || '',
      title: source.title || '',
      courseId: source.courseId || null,
      moduleId: source.moduleId || null,
      partId: source.partId || null,
      chunkIndex: pieces[i].index,
      chunkTotal: pieces[i].total,
      text: pieces[i].text,
      embedding: embeddings[i],
      contentHash: contentHash,
      indexedAt: new Date().toISOString(),
    };
    batch.set(db.collection(CHUNKS_COL).doc(chunkId), doc);
    ops++;
    if (ops >= WRITE_BATCH) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops) await batch.commit();

  await sourceRef.set({
    sourceKey: source.sourceKey,
    sourceType: source.sourceType,
    sourcePath: source.sourcePath,
    title: source.title,
    courseId: source.courseId || null,
    moduleId: source.moduleId || null,
    partId: source.partId || null,
    contentHash: contentHash,
    chunkCount: pieces.length,
    chunkIds: chunkIds.slice(0, 200),
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  return { skipped: false, sourceKey: source.sourceKey, chunks: pieces.length };
}

async function collectFirestoreSources(db) {
  const sources = [];
  const [coursesSnap, modulesSnap] = await Promise.all([
    db.collection('courses').get(),
    db.collection('modules').get(),
  ]);

  const courseTitles = {};
  coursesSnap.docs.forEach(function (d) {
    courseTitles[d.id] = d.data().title || d.id;
  });

  for (const modDoc of modulesSnap.docs) {
    const mod = modDoc.data();
    const moduleId = modDoc.id;
    const courseId = mod.courseId || '';
    const partsSnap = await modDoc.ref.collection('parts').get();

    if (partsSnap.empty && mod.content) {
      sources.push({
        sourceKey: 'firestore:' + moduleId,
        sourceType: 'firestore_module',
        sourcePath: 'modules/' + moduleId,
        courseId: courseId,
        moduleId: moduleId,
        title: (mod.title || moduleId) + ' — ' + (courseTitles[courseId] || courseId),
        text: mod.content,
      });
      continue;
    }

    for (const partDoc of partsSnap.docs) {
      const part = partDoc.data();
      const body = (part.content || part.draftContent || '').trim();
      if (body.length < 40) continue;
      const partMeta = (mod.parts || []).find(function (p) { return p.id === partDoc.id; });
      sources.push({
        sourceKey: 'firestore:' + moduleId + ':' + partDoc.id,
        sourceType: 'firestore_part',
        sourcePath: 'modules/' + moduleId + '/parts/' + partDoc.id,
        courseId: courseId,
        moduleId: moduleId,
        partId: partDoc.id,
        title: ((partMeta && partMeta.title) || partDoc.id) + ' — ' + (mod.title || moduleId),
        text: body,
      });
    }
  }

  return sources;
}

async function runFullIndex(db, opts) {
  const apiKey = opts?.apiKey;
  const repoRoot = opts?.repoRoot;
  const dryRun = !!opts?.dryRun;
  const force = !!opts?.force;

  const repoSources = collectRepoSources(repoRoot);
  const firestoreSources = await collectFirestoreSources(db);
  const all = repoSources.concat(firestoreSources);

  const results = {
    totalSources: all.length,
    indexed: 0,
    skipped: 0,
    chunks: 0,
    errors: [],
    startedAt: new Date().toISOString(),
  };

  for (let i = 0; i < all.length; i++) {
    const source = all[i];
    try {
      const r = await indexSourceDocument(db, source, apiKey, { force, dryRun });
      if (r.skipped) results.skipped++;
      else {
        results.indexed++;
        results.chunks += r.chunks;
      }
      if (opts?.onProgress) opts.onProgress(i + 1, all.length, source.sourceKey, r);
    } catch (err) {
      results.errors.push({ sourceKey: source.sourceKey, error: err.message || String(err) });
    }
  }

  results.finishedAt = new Date().toISOString();
  await db.collection(META_COL).doc(META_DOC).set({
    lastFullIndex: results.finishedAt,
    chunkCount: results.chunks,
    sourceCount: all.length,
    indexed: results.indexed,
    skipped: results.skipped,
    errorCount: results.errors.length,
    version: 1,
  }, { merge: true });

  return results;
}

async function runBundledBatchIndex(db, opts) {
  const repoRoot = opts.repoRoot;
  const cursor = opts.cursor || 0;
  const batchSize = opts.batchSize || 4;
  const force = !!opts.force;
  const all = collectRepoSources(repoRoot);
  const slice = all.slice(cursor, cursor + batchSize);

  const result = {
    phase: 'bundled',
    totalSources: all.length,
    cursor: cursor,
    nextCursor: cursor + slice.length,
    done: cursor + slice.length >= all.length,
    indexed: 0,
    skipped: 0,
    chunks: 0,
    errors: [],
  };

  for (const source of slice) {
    try {
      const r = await indexSourceDocument(db, source, opts.apiKey, { force });
      if (r.skipped) result.skipped++;
      else {
        result.indexed++;
        result.chunks += r.chunks;
      }
    } catch (err) {
      result.errors.push({ sourceKey: source.sourceKey, error: err.message || String(err) });
    }
  }

  return result;
}

async function listModuleIds(db, opts) {
  const courseId = opts && opts.courseId;
  if (courseId) {
    const snap = await db.collection('modules').where('courseId', '==', courseId).get();
    return snap.docs.map(function (d) { return d.id; }).sort();
  }
  // Prefer WWM formation weeks; fall back to all module ids.
  const refs = await db.collection('modules').listDocuments();
  const all = refs.map(function (ref) { return ref.id; }).sort();
  const wwm = all.filter(function (id) { return /^wwm-week-/i.test(id); });
  return wwm.length ? wwm : all;
}

async function runFirestoreModuleBatch(db, opts) {
  const moduleIndex = opts.moduleIndex || 0;
  const partIndex = opts.partIndex || 0;
  const force = !!opts.force;
  const courseIdFilter = opts.courseId || 'the-woman-the-wife-the-mother';
  const moduleIds = opts.moduleIds || await listModuleIds(db, { courseId: courseIdFilter });

  const result = {
    phase: 'firestore',
    totalModules: moduleIds.length,
    moduleIndex: moduleIndex,
    partIndex: partIndex,
    nextModuleIndex: moduleIndex,
    nextPartIndex: partIndex + 1,
    done: moduleIndex >= moduleIds.length,
    indexed: 0,
    skipped: 0,
    chunks: 0,
    errors: [],
  };

  if (result.done) {
    result.nextModuleIndex = moduleIds.length;
    result.nextPartIndex = 0;
    return result;
  }

  const moduleId = moduleIds[moduleIndex];
  const modSnap = await db.collection('modules').doc(moduleId).get();
  if (!modSnap.exists) {
    result.nextModuleIndex = moduleIndex + 1;
    result.nextPartIndex = 0;
    result.done = result.nextModuleIndex >= moduleIds.length;
    return result;
  }

  const mod = modSnap.data();
  const courseId = mod.courseId || '';
  const partsSnap = await modSnap.ref.collection('parts').get();

  const toIndex = [];
  if (partsSnap.empty && mod.content) {
    toIndex.push({
      sourceKey: 'firestore:' + moduleId,
      sourceType: 'firestore_module',
      sourcePath: 'modules/' + moduleId,
      courseId: courseId,
      moduleId: moduleId,
      title: mod.title || moduleId,
      text: mod.content,
    });
  } else {
    const sortedParts = partsSnap.docs.slice().sort(function (a, b) {
      return String(a.id).localeCompare(String(b.id));
    });
    sortedParts.forEach(function (partDoc) {
      const part = partDoc.data();
      const body = (part.content || '').trim();
      if (body.length < 40) return;
      const partMeta = (mod.parts || []).find(function (p) { return p.id === partDoc.id; });
      toIndex.push({
        sourceKey: 'firestore:' + moduleId + ':' + partDoc.id,
        sourceType: 'firestore_part',
        sourcePath: 'modules/' + moduleId + '/parts/' + partDoc.id,
        courseId: courseId,
        moduleId: moduleId,
        partId: partDoc.id,
        title: ((partMeta && partMeta.title) || partDoc.id) + ' — ' + (mod.title || moduleId),
        text: body,
      });
    });
  }

  if (!toIndex.length || partIndex >= toIndex.length) {
    result.nextModuleIndex = moduleIndex + 1;
    result.nextPartIndex = 0;
    result.done = result.nextModuleIndex >= moduleIds.length;
    result.skipped = toIndex.length ? 0 : 1;
    return result;
  }

  const source = toIndex[partIndex];
  try {
    const r = await indexSourceDocument(db, source, opts.apiKey, { force });
    if (r.skipped) result.skipped++;
    else {
      result.indexed++;
      result.chunks += r.chunks;
    }
  } catch (err) {
    console.error('[runFirestoreModuleBatch]', source.sourceKey, err.message || err);
    result.errors.push({ sourceKey: source.sourceKey, error: err.message || String(err) });
  }

  if (partIndex + 1 >= toIndex.length) {
    result.nextModuleIndex = moduleIndex + 1;
    result.nextPartIndex = 0;
  } else {
    result.nextModuleIndex = moduleIndex;
    result.nextPartIndex = partIndex + 1;
  }
  result.done = result.nextModuleIndex >= moduleIds.length;
  result.currentSource = source.sourceKey;
  result.partsInModule = toIndex.length;
  return result;
}

async function finalizeReindexMeta(db, totals) {
  await db.collection(META_COL).doc(META_DOC).set({
    lastFullIndex: new Date().toISOString(),
    chunkCount: totals.chunks,
    sourceCount: totals.sources,
    indexed: totals.indexed,
    skipped: totals.skipped,
    errorCount: totals.errors,
    version: 1,
  }, { merge: true });
}

async function indexFirestorePart(db, moduleId, partId, apiKey) {
  const partRef = db.collection('modules').doc(moduleId).collection('parts').doc(partId);
  const [partSnap, modSnap] = await Promise.all([
    partRef.get(),
    db.collection('modules').doc(moduleId).get(),
  ]);
  if (!partSnap.exists || !modSnap.exists) return { skipped: true };
  const part = partSnap.data();
  const mod = modSnap.data();
  const body = (part.content || '').trim();
  if (body.length < 40) return { skipped: true };

  const partMeta = (mod.parts || []).find(function (p) { return p.id === partId; });
  return indexSourceDocument(db, {
    sourceKey: 'firestore:' + moduleId + ':' + partId,
    sourceType: 'firestore_part',
    sourcePath: 'modules/' + moduleId + '/parts/' + partId,
    courseId: mod.courseId || null,
    moduleId: moduleId,
    partId: partId,
    title: ((partMeta && partMeta.title) || partId) + ' — ' + (mod.title || moduleId),
    text: body,
  }, apiKey, { force: true });
}

module.exports = {
  runFullIndex,
  runBundledBatchIndex,
  runFirestoreModuleBatch,
  finalizeReindexMeta,
  listModuleIds,
  indexFirestorePart,
  indexSourceDocument,
  collectFirestoreSources,
  CHUNKS_COL,
  META_DOC,
  META_COL,
};
