#!/usr/bin/env node
/**
 * seed-firestore.js
 *
 * Seeds Firestore with the AM-RD group, all 18 boards, and all posts
 * parsed from the Telegram export. Also uploads photo files to Firebase
 * Storage (videos are referenced by local path only — too large for upload).
 *
 * Usage:
 *   node scripts/seed-firestore.js [--dry-run] [--no-media] [--board <key>]
 *
 * Options:
 *   --dry-run    Print what would be written without touching Firestore/Storage
 *   --no-media   Skip photo uploads (just write text posts)
 *   --board key  Seed only one board (e.g. --board muliebrity-casual-home)
 *   --posts-only Skip group/board creation (use when they already exist)
 */

const admin  = require('firebase-admin');
const fs     = require('fs');
const path   = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');
const SEED_DATA       = path.resolve(__dirname, 'seed-data.json');
const TELEGRAM_BASE   = '/Users/achugustave/Documents/BTH 2018/2024 SBD BookS/Book Project/Telegram/DataExport_2026-03-13/chats/chat_01';
const STORAGE_BUCKET  = 'marriage-education.firebasestorage.app';

// Write-rate limiter: Firestore allows ~500 writes/batch, ~1 batch/sec safely
const BATCH_SIZE      = 400;
const BATCH_DELAY_MS  = 1200;   // pause between batches

// ── Parse CLI args ───────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const NO_MEDIA   = args.includes('--no-media');
const POSTS_ONLY = args.includes('--posts-only');
const boardFilter = (() => {
  const i = args.indexOf('--board');
  return i >= 0 ? args[i + 1] : null;
})();

// ── Firebase init ────────────────────────────────────────────────────────────
if (!DRY_RUN) {
  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: STORAGE_BUCKET,
  });
}

const db      = DRY_RUN ? null : admin.firestore();
const bucket  = DRY_RUN ? null : admin.storage().bucket();

// ── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function log(msg) { console.log(msg); }
function warn(msg) { console.warn('⚠️ ', msg); }

/**
 * Upload a local file to Firebase Storage and return its public download URL.
 * Returns null if the file doesn't exist or upload fails.
 */
async function uploadPhoto(relativePath) {
  const localPath = path.join(TELEGRAM_BASE, relativePath);
  if (!fs.existsSync(localPath)) {
    warn(`Photo not found: ${localPath}`);
    return null;
  }
  const destination = `am-rd/${relativePath}`;
  try {
    await bucket.upload(localPath, {
      destination,
      metadata: { contentType: 'image/jpeg' },
    });
    const file = bucket.file(destination);
    await file.makePublic();
    return `https://storage.googleapis.com/${STORAGE_BUCKET}/${destination}`;
  } catch (err) {
    warn(`Upload failed for ${relativePath}: ${err.message}`);
    return null;
  }
}

/**
 * Commit a batch of Firestore writes, with retries.
 */
async function commitBatch(batch, label) {
  if (DRY_RUN) {
    log(`  [DRY-RUN] would commit batch: ${label}`);
    return;
  }
  let attempts = 0;
  while (attempts < 3) {
    try {
      await batch.commit();
      return;
    } catch (err) {
      attempts++;
      warn(`Batch commit failed (attempt ${attempts}): ${err.message}`);
      if (attempts >= 3) throw err;
      await sleep(2000 * attempts);
    }
  }
}

/**
 * Parse a Telegram date string "DD.MM.YYYY" into a JS Date.
 */
function parseDate(str) {
  if (!str) return new Date();
  const [d, m, y] = str.split('.').map(Number);
  return new Date(y, m - 1, d);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log(`\n🚀 SBD Network — Firestore Seeder`);
  log(`   Dry run  : ${DRY_RUN}`);
  log(`   No media : ${NO_MEDIA}`);
  log(`   Posts only: ${POSTS_ONLY}`);
  log(`   Board filter: ${boardFilter || 'ALL'}\n`);

  // Load seed data
  const data = JSON.parse(fs.readFileSync(SEED_DATA, 'utf8'));
  const boards = boardFilter
    ? data.boards.filter(b => b.key === boardFilter)
    : data.boards;

  if (boards.length === 0) {
    log('No boards matched filter. Exiting.');
    return;
  }

  // ── Step 1: Create the Group ───────────────────────────────────────────────
  let groupId;

  if (POSTS_ONLY) {
    log('⏭  --posts-only: skipping group/board creation');
    // Load existing group id from a local cache if available
    const cachePath = path.resolve(__dirname, '.seed-cache.json');
    if (fs.existsSync(cachePath)) {
      const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      groupId = cache.groupId;
      log(`   Using cached groupId: ${groupId}`);
    } else {
      log('❌ No cache found. Run without --posts-only first.');
      process.exit(1);
    }
  } else {
    log('📁 Creating group AM-RD...');
    const groupData = {
      title:       data.group.title,
      description: data.group.description,
      createdAt:   DRY_RUN ? new Date() : admin.firestore.FieldValue.serverTimestamp(),
      createdBy:   'seeder',
    };

    if (DRY_RUN) {
      groupId = 'dry-run-group-id';
      log(`  [DRY-RUN] group: ${JSON.stringify(groupData)}`);
    } else {
      const groupRef = await db.collection('groups').add(groupData);
      groupId = groupRef.id;
    }
    log(`  ✅ Group created: ${groupId}`);
  }

  // ── Step 2: Create Boards and seed Posts ─────────────────────────────────
  const boardIdMap = {};   // board.key → Firestore doc ID
  const cachePath  = path.resolve(__dirname, '.seed-cache.json');

  // Load existing board IDs from cache (for --posts-only or resume)
  if (fs.existsSync(cachePath)) {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    Object.assign(boardIdMap, cache.boardIds || {});
  }

  for (const board of boards) {
    log(`\n📋 Board: "${board.title}" (${board.postCount} posts)`);

    // Create board doc
    let boardId = boardIdMap[board.key];
    if (!boardId || !POSTS_ONLY) {
      const boardData = {
        groupId:     groupId,
        title:       board.title,
        description: `AM-RD board: ${board.title}`,
        createdAt:   DRY_RUN ? new Date() : admin.firestore.FieldValue.serverTimestamp(),
        createdBy:   'seeder',
        postCount:   board.postCount,
      };

      if (DRY_RUN) {
        boardId = `dry-run-${board.key}`;
        log(`  [DRY-RUN] board: ${JSON.stringify(boardData)}`);
      } else {
        const boardRef = await db.collection('boards').add(boardData);
        boardId = boardRef.id;
      }
      boardIdMap[board.key] = boardId;
      log(`  ✅ Board created: ${boardId}`);
    } else {
      log(`  ↩️  Reusing existing boardId: ${boardId}`);
    }

    // Save cache after each board creation so we can resume
    if (!DRY_RUN) {
      fs.writeFileSync(cachePath, JSON.stringify({ groupId, boardIds: boardIdMap }, null, 2));
    }

    // Seed posts in batches
    log(`  📝 Seeding ${board.posts.length} posts...`);
    let batchCount = 0;
    let postsWritten = 0;
    let currentBatch = DRY_RUN ? null : db.batch();
    let opsInBatch = 0;

    for (const post of board.posts) {
      // Upload photo if present and media is enabled
      let photoUrl = null;
      let thumbUrl = null;

      if (!NO_MEDIA && post.photos && post.photos.length > 0) {
        const mainPhoto = post.photos[0];
        photoUrl = DRY_RUN
          ? `https://storage.googleapis.com/${STORAGE_BUCKET}/am-rd/${mainPhoto}`
          : await uploadPhoto(mainPhoto);

        // Derive thumbnail path (Telegram exports _thumb.jpg alongside)
        const thumbPath = mainPhoto.replace('.jpg', '_thumb.jpg');
        if (!DRY_RUN) {
          thumbUrl = await uploadPhoto(thumbPath);
        }
      }

      // Build post document
      const postData = {
        boardId:      boardId,
        authorName:   post.authorName,
        content:      post.content || '',
        imageUrl:     photoUrl || null,
        thumbUrl:     thumbUrl || null,
        videoUrl:     null,   // videos stay local for now
        localVideo:   (post.videos && post.videos.length > 0) ? post.videos[0] : null,
        allPhotos:    (post.photos && post.photos.length > 1) ? post.photos.slice(1) : [],
        timestamp:    DRY_RUN ? parseDate(post.timestamp) : admin.firestore.Timestamp.fromDate(parseDate(post.timestamp)),
        sourceMsgId:  post.msgId,
        isPinned:     false,
        commentCount: 0,
        importedAt:   DRY_RUN ? new Date() : admin.firestore.FieldValue.serverTimestamp(),
      };

      if (DRY_RUN) {
        // Just log first 3 posts per board
        if (postsWritten < 3) log(`  [DRY-RUN] post: ${JSON.stringify(postData).slice(0, 200)}`);
      } else {
        const postRef = db.collection('posts').doc();
        currentBatch.set(postRef, postData);
        opsInBatch++;
      }

      postsWritten++;

      // Commit batch when full
      if (!DRY_RUN && opsInBatch >= BATCH_SIZE) {
        batchCount++;
        await commitBatch(currentBatch, `${board.title} batch #${batchCount} (${postsWritten} posts so far)`);
        log(`    batch #${batchCount} committed (${postsWritten}/${board.posts.length})`);
        await sleep(BATCH_DELAY_MS);
        currentBatch = db.batch();
        opsInBatch = 0;
      }
    }

    // Commit remaining
    if (!DRY_RUN && opsInBatch > 0) {
      batchCount++;
      await commitBatch(currentBatch, `${board.title} final batch #${batchCount}`);
      log(`    final batch #${batchCount} committed`);
    }

    log(`  ✅ ${postsWritten} posts seeded for "${board.title}"`);
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  log(`\n🎉 Done! Group: ${groupId}`);
  log(`   Board IDs:`);
  for (const [key, id] of Object.entries(boardIdMap)) {
    log(`     ${key}: ${id}`);
  }
  log(`\n💡 Next step: In the admin panel, assign your users to the AM-RD group (id: ${groupId})`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
