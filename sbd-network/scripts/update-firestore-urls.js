#!/usr/bin/env node
// ================================================================
// UPDATE FIRESTORE POSTS WITH R2 URLs
// ================================================================
// Run AFTER upload-to-r2.js has created url-map.json.
//
// For every post in Firestore that has a local file reference
// (e.g. "photos/photo_N@..." or "video_files/IMG_N.MP4"),
// this script looks up the R2 URL from url-map.json and writes
// imageUrl / thumbUrl / videoUrl back to the Firestore document.
//
// Usage:
//   node update-firestore-urls.js [--dry-run]
// ================================================================

'use strict';

const path    = require('path');
const fs      = require('fs');
const admin   = require('/Users/achugustave/Documents/Marriageducation/node_modules/firebase-admin');

const SERVICE_ACCOUNT = '/Users/achugustave/Documents/Marriageducation/serviceAccountKey.json';
const URL_MAP_FILE    = path.join(__dirname, 'url-map.json');
const DRY_RUN         = process.argv.includes('--dry-run');
const BATCH_SIZE      = 400;   // Firestore batch limit
const DELAY_MS        = 800;

// ── Init Firebase ────────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(SERVICE_ACCOUNT)),
  });
}
const db = admin.firestore();

// ── Load URL map ─────────────────────────────────────────────────
if (!fs.existsSync(URL_MAP_FILE)) {
  console.error('url-map.json not found. Run upload-to-r2.js first.');
  process.exit(1);
}
const urlMap = JSON.parse(fs.readFileSync(URL_MAP_FILE, 'utf8'));
console.log(`\nLoaded ${Object.keys(urlMap).length} URL mappings.\n`);

// Extract base filename from a stored path like "photos/photo_N@..." or a full URL
function resolveUrl(storedPath) {
  if (!storedPath) return null;
  const fname = path.basename(storedPath);
  return urlMap[fname] || null;
}

// ── Process all posts ────────────────────────────────────────────
async function main() {
  // Iterate boards from cache
  const cacheFile = path.join(__dirname, '.seed-cache.json');
  if (!fs.existsSync(cacheFile)) {
    console.error('.seed-cache.json not found. Cannot resolve board IDs.');
    process.exit(1);
  }
  const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const boardIds = Object.values(cache.boardIds);

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const boardId of boardIds) {
    process.stdout.write(`Processing board ${boardId}...`);
    let lastDoc = null;
    let boardUpdated = 0;
    let ops = [];

    const flush = async () => {
      if (!ops.length) return;
      const batches = [];
      for (let i = 0; i < ops.length; i += BATCH_SIZE) {
        batches.push(ops.slice(i, i + BATCH_SIZE));
      }
      for (const batch of batches) {
        if (DRY_RUN) { boardUpdated += batch.length; continue; }
        const fbBatch = db.batch();
        batch.forEach(({ ref, updates }) => fbBatch.update(ref, updates));
        await fbBatch.commit();
        boardUpdated += batch.length;
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
      ops = [];
    };

    // Page through posts (no orderBy to avoid composite index requirement)
    let query = db.collection('posts')
      .where('boardId', '==', boardId)
      .limit(500);

    while (true) {
      if (lastDoc) query = db.collection('posts')
        .where('boardId', '==', boardId)
        .limit(500)
        .startAfter(lastDoc);
      const snap = await query.get();
      if (snap.empty) break;
      lastDoc = snap.docs[snap.docs.length - 1];

      snap.forEach(doc => {
        const data = doc.data();
        const updates = {};

        // imageUrl
        const newImage = resolveUrl(data.imageUrl);
        if (newImage && newImage !== data.imageUrl) updates.imageUrl = newImage;

        // thumbUrl
        const newThumb = resolveUrl(data.thumbUrl);
        if (newThumb && newThumb !== data.thumbUrl) updates.thumbUrl = newThumb;

        // videoUrl
        const newVideo = resolveUrl(data.videoUrl || data.localVideo);
        if (newVideo && newVideo !== data.videoUrl) updates.videoUrl = newVideo;

        // allPhotos array
        if (Array.isArray(data.allPhotos) && data.allPhotos.length) {
          const newPhotos = data.allPhotos.map(p => resolveUrl(p) || p);
          if (newPhotos.some((p, i) => p !== data.allPhotos[i])) {
            updates.allPhotos = newPhotos;
          }
        }

        if (Object.keys(updates).length) {
          ops.push({ ref: doc.ref, updates });
        } else {
          totalSkipped++;
        }
      });

      await flush();
      if (snap.docs.length < 500) break;
    }

    await flush();
    totalUpdated += boardUpdated;
    console.log(` ${boardUpdated} updated.`);
  }

  console.log(`\nFinished. Updated: ${totalUpdated}, Skipped (already correct): ${totalSkipped}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
