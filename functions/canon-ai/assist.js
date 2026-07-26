'use strict';

const functions = require('firebase-functions');
const { retrieveChunks, formatCitations, buildContextBlock } = require('./retrieval');
const { generateMarkdown } = require('./embeddings');
const { buildSystemPrompt, buildUserPrompt } = require('./prompts');

async function assertContentDesigner(db, context) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required');
  }
  const uid = context.auth.uid;
  const snap = await db.collection('users').doc(uid).get();
  const ud = snap.exists ? snap.data() : {};
  const role = String(ud.role || '').toLowerCase();
  const isDesigner =
    role === 'admin' ||
    role === 'designer' ||
    ud.isAdmin === true ||
    (ud.roles && ud.roles.includes('designer')) ||
    (ud.staffAccess && ud.staffAccess.contentDesigner === true);
  if (!isDesigner) {
    throw new functions.https.HttpsError('permission-denied', 'Content Designer access required');
  }
  return { uid, email: ud.email || context.auth.token.email || '' };
}

async function assertAdmin(db, context) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required');
  }
  if (context.auth.token.admin === true) return { uid: context.auth.uid };
  const snap = await db.collection('users').doc(context.auth.uid).get();
  const ud = snap.exists ? snap.data() : {};
  if (String(ud.role || '').toLowerCase() === 'admin' || ud.isAdmin === true) {
    return { uid: context.auth.uid };
  }
  throw new functions.https.HttpsError('permission-denied', 'Admin access required');
}

async function runStudioAssist(db, data, context) {
  await assertContentDesigner(db, context);

  const action = String(data?.action || 'draft').toLowerCase();
  const courseId = data?.courseId || '';
  const moduleId = data?.moduleId || '';
  const partId = data?.partId || '';
  const partTitle = data?.partTitle || '';
  const selection = data?.selection || '';
  const currentDraft = data?.currentDraft || '';
  const instruction = data?.instruction || '';

  const queryParts = [
    partTitle,
    partId,
    moduleId,
    courseId,
    instruction,
    selection.slice(0, 500),
    currentDraft.slice(0, 800),
  ].filter(Boolean);

  const chunks = await retrieveChunks(db, queryParts.join(' — '), {
    courseId,
    moduleId,
    partId,
    limit: 14,
  });

  const canonContext = buildContextBlock(chunks);
  const userPrompt = buildUserPrompt({
    action,
    courseId,
    moduleId,
    partId,
    partTitle,
    selection,
    currentDraft,
    instruction,
    canonContext,
    wordTarget: data?.wordTarget || 700,
  });

  const markdown = await generateMarkdown(buildSystemPrompt(), userPrompt);

  return {
    markdown: markdown,
    action: action,
    citations: formatCitations(chunks),
    chunkCount: chunks.length,
    retrievedTitles: chunks.map(function (c) { return c.title || c.sourcePath; }),
  };
}

module.exports = { runStudioAssist, assertContentDesigner, assertAdmin };
