#!/usr/bin/env node
// ================================================================
// SET COVER PHOTO URL ON EACH BOARD DOCUMENT
// ================================================================
// Reads seed-data.json to find the first photo in each board,
// then writes coverUrl + postCount to every board document in
// Firestore. Run once after seeding (no R2 needed yet; updates
// again after upload-to-r2 + update-firestore-urls).
//
// Usage:  node set-board-covers.js [--dry-run]
// ================================================================

'use strict';

const path  = require('path');
const fs    = require('fs');
const admin = require('/Users/achugustave/Documents/Marriageducation/node_modules/firebase-admin');

const SERVICE_ACCOUNT = '/Users/achugustave/Documents/Marriageducation/serviceAccountKey.json';
const SEED_DATA       = path.join(__dirname, 'seed-data.json');
const CACHE_FILE      = path.join(__dirname, '.seed-cache.json');
const URL_MAP_FILE    = path.join(__dirname, 'url-map.json');
const DRY_RUN         = process.argv.includes('--dry-run');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT)) });
}
const db = admin.firestore();

// Load R2 URL map if available
const urlMap = fs.existsSync(URL_MAP_FILE)
  ? JSON.parse(fs.readFileSync(URL_MAP_FILE, 'utf8'))
  : {};

function resolveUrl(localPath) {
  if (!localPath) return null;
  const fname = path.basename(localPath);
  return urlMap[fname] || null;
}

async function main() {
  const seedData  = JSON.parse(fs.readFileSync(SEED_DATA, 'utf8'));
  const cache     = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  const boardIds  = cache.boardIds;   // { slug: firestoreId }

  for (const board of seedData.boards) {
    const firestoreId = boardIds[board.key];
    if (!firestoreId) { console.log(`Skip ${board.key} — no Firestore ID in cache`); continue; }

    // Find first post with a photo
    const firstPhotoPost = board.posts.find(p => p.photos && p.photos.length > 0);
    const coverLocalPath = firstPhotoPost && firstPhotoPost.photos[0];
    const coverUrl = resolveUrl(coverLocalPath);

    const updates = {
      postCount: board.posts.length,
    };

    if (coverUrl) {
      updates.coverUrl = coverUrl;
    } else if (coverLocalPath) {
      updates.coverLocalPath = coverLocalPath;
    }

    if (DRY_RUN) {
      console.log(`[DRY] ${board.title} → postCount=${updates.postCount}, coverUrl=${coverUrl || 'pending R2'}`);
    } else {
      await db.collection('boards').doc(firestoreId).update(updates);
      console.log(`Updated: ${board.title} (${updates.postCount} posts, cover=${coverUrl ? 'R2 ✓' : 'pending'})`);
    }
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
