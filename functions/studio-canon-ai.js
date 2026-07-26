'use strict';

const functions = require('firebase-functions');
const {
  runBundledBatchIndex,
  runFirestoreModuleBatch,
  finalizeReindexMeta,
  listModuleIds,
  indexFirestorePart,
} = require('./canon-ai/indexer');
const { runStudioAssist, assertContentDesigner } = require('./canon-ai/assist');

const CALL_OPTS = { timeoutSeconds: 540, memory: '2GB' };

function registerStudioCanonAi(db, exportsObj) {
  exportsObj.studioCanonAssist = functions
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .https.onCall(async (data, context) => {
      try {
        return await runStudioAssist(db, data || {}, context);
      } catch (err) {
        if (err instanceof functions.https.HttpsError) throw err;
        console.error('[studioCanonAssist]', err);
        throw new functions.https.HttpsError('internal', err.message || 'Canon assist failed');
      }
    });

  exportsObj.reindexSbdCanon = functions
    .runWith(CALL_OPTS)
    .https.onCall(async (data, context) => {
      await assertContentDesigner(db, context);
      const path = require('path');
      const { getApiKey } = require('./canon-ai/embeddings');
      const bundledRoot = path.join(__dirname, 'canon-ai/bundled');
      const force = !!data?.force;
      const phase = data?.phase || 'bundled';
      const apiKey = getApiKey();

      if (!apiKey) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Gemini API key not configured. Set: firebase functions:config:set gemini.api_key="YOUR_KEY"'
        );
      }

      try {
        if (phase === 'firestore') {
          let moduleIds = data?.moduleIds;
          if (!moduleIds || !moduleIds.length) {
            moduleIds = await listModuleIds(db, {
              courseId: data?.courseId || 'the-woman-the-wife-the-mother',
            });
          }
          const result = await runFirestoreModuleBatch(db, {
            moduleIndex: data?.moduleIndex || 0,
            partIndex: data?.partIndex || 0,
            moduleIds: moduleIds,
            force: force,
            apiKey: apiKey,
            courseId: data?.courseId || 'the-woman-the-wife-the-mother',
          });
          if (result.done && data?.finalize) {
            await finalizeReindexMeta(db, {
              chunks: data.totals?.chunks || 0,
              sources: data.totals?.sources || 0,
              indexed: data.totals?.indexed || 0,
              skipped: data.totals?.skipped || 0,
              errors: data.totals?.errors || 0,
            });
          }
          // Only send moduleIds on the first firestore response to keep payloads small.
          if (!data?.moduleIds || !data.moduleIds.length) {
            return Object.assign(result, { moduleIds: moduleIds });
          }
          return result;
        }

        const result = await runBundledBatchIndex(db, {
          repoRoot: bundledRoot,
          cursor: data?.cursor || 0,
          batchSize: data?.batchSize || 1,
          force: force,
          apiKey: apiKey,
        });
        return result;
      } catch (err) {
        if (err instanceof functions.https.HttpsError) throw err;
        console.error('[reindexSbdCanon]', err);
        const msg = (err && err.message) || 'Reindex failed';
        if (/api key not configured/i.test(msg)) {
          throw new functions.https.HttpsError('failed-precondition', msg);
        }
        // Use unavailable/resource-exhausted style codes when recognizable.
        if (/timeout|ETIMEDOUT|deadline/i.test(msg)) {
          throw new functions.https.HttpsError('deadline-exceeded', msg);
        }
        throw new functions.https.HttpsError('internal', msg.slice(0, 500));
      }
    });

  exportsObj.getCanonIndexStatus = functions.https.onCall(async (data, context) => {
    await assertContentDesigner(db, context);
    const meta = await db.collection('canon_index').doc('meta').get();
    const chunkSnap = await db.collection('canon_chunks').limit(1).get();
    return {
      meta: meta.exists ? meta.data() : null,
      hasChunks: !chunkSnap.empty,
    };
  });

  exportsObj.onCanonPartPublished = functions.firestore
    .document('modules/{moduleId}/parts/{partId}')
    .onWrite(async (change, context) => {
      const after = change.after.exists ? change.after.data() : null;
      if (!after) return null;
      const before = change.before.exists ? change.before.data() : null;
      const published = String(after.content || '').trim();
      if (!published || published.length < 50) return null;
      if (before && before.content === after.content) return null;

      try {
        await indexFirestorePart(db, context.params.moduleId, context.params.partId);
        console.log('[onCanonPartPublished] indexed', context.params.moduleId, context.params.partId);
      } catch (err) {
        console.error('[onCanonPartPublished]', err.message);
      }
      return null;
    });
}

module.exports = { registerStudioCanonAi };
