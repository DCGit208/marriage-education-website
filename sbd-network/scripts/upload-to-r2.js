#!/usr/bin/env node
// ================================================================
// UPLOAD TELEGRAM MEDIA TO CLOUDFLARE R2
// ================================================================
// Usage:
//   node upload-to-r2.js [--dry-run] [--photos-only] [--videos-only]
//
// Environment variables required (or set via .env file):
//   R2_ACCOUNT_ID      — Cloudflare account ID
//   R2_ACCESS_KEY_ID   — R2 access key
//   R2_SECRET_KEY      — R2 secret key
//   R2_BUCKET          — bucket name (default: sbd-media)
//   R2_PUBLIC_URL      — public custom domain or R2 dev URL
//                        e.g. https://pub-XXXX.r2.dev
//
// After running, the script writes url-map.json which maps every
// local filename to its public R2 URL. Run update-firestore-urls.js
// next to patch Firestore posts with the new URLs.
// ================================================================

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Load env from .env file if present ──────────────────────────
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const [k, ...rest] = line.split('=');
    if (k && rest.length) process.env[k.trim()] = rest.join('=').trim();
  });
}

const ACCOUNT_ID   = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY   = process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY   = process.env.R2_SECRET_KEY;
const BUCKET       = process.env.R2_BUCKET || 'sbd-media';
const PUBLIC_URL   = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

// Source media root
const MEDIA_ROOT = '/Users/achugustave/Documents/BTH 2018/2024 SBD BookS/Book Project/Telegram/DataExport_2026-03-13/chats/chat_01';

// Flags
const DRY_RUN      = process.argv.includes('--dry-run');
const PHOTOS_ONLY  = process.argv.includes('--photos-only');
const VIDEOS_ONLY  = process.argv.includes('--videos-only');
const CONCURRENCY  = 6;   // parallel uploads

// Output map written after upload
const URL_MAP_FILE = path.join(__dirname, 'url-map.json');

// ── Validate config ──────────────────────────────────────────────
function validateConfig() {
  if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY) {
    console.error('\nMissing R2 credentials. Create scripts/.env with:');
    console.error('  R2_ACCOUNT_ID=...');
    console.error('  R2_ACCESS_KEY_ID=...');
    console.error('  R2_SECRET_KEY=...');
    console.error('  R2_BUCKET=sbd-media');
    console.error('  R2_PUBLIC_URL=https://pub-XXX.r2.dev\n');
    process.exit(1);
  }
  if (!PUBLIC_URL) {
    console.error('\nR2_PUBLIC_URL is required so Firestore URLs can be built.\n');
    process.exit(1);
  }
}

// ── Collect files to upload ──────────────────────────────────────
function collectFiles() {
  const files = [];

  if (!VIDEOS_ONLY) {
    // photos/ — .jpg files (including thumbnails)
    const photosDir = path.join(MEDIA_ROOT, 'photos');
    if (fs.existsSync(photosDir)) {
      fs.readdirSync(photosDir)
        .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
        .forEach(f => files.push({
          localPath: path.join(photosDir, f),
          r2Key: `photos/${f}`,
          contentType: guessContentType(f),
        }));
    }
  }

  if (!PHOTOS_ONLY) {
    // video_files/ — videos + their _thumb.jpg files
    const videoDir = path.join(MEDIA_ROOT, 'video_files');
    if (fs.existsSync(videoDir)) {
      fs.readdirSync(videoDir).forEach(f => {
        const isVideo = /\.(mp4|mov|m4v|avi|webm)$/i.test(f);
        const isThumb = /_thumb\.jpg$/i.test(f);
        if (isVideo || isThumb) {
          files.push({
            localPath: path.join(videoDir, f),
            r2Key: `video_files/${f}`,
            contentType: guessContentType(f),
          });
        }
      });
    }
  }

  return files;
}

function guessContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png',  '.webp': 'image/webp',
    '.mp4': 'video/mp4',  '.mov': 'video/quicktime',
    '.m4v': 'video/mp4',  '.avi': 'video/x-msvideo',
    '.webm': 'video/webm',
  };
  return map[ext] || 'application/octet-stream';
}

// ── S3-compatible PUT to R2 ──────────────────────────────────────
async function uploadFile(item, S3Client, PutObjectCommand) {
  const fileBuffer = fs.readFileSync(item.localPath);
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: item.r2Key,
    Body: fileBuffer,
    ContentType: item.contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  });
  await S3Client.send(cmd);
  return `${PUBLIC_URL}/${item.r2Key}`;
}

// ── Upload batch with concurrency limit ──────────────────────────
async function uploadBatch(batch, S3Client, PutObjectCommand) {
  return Promise.all(batch.map(item => uploadFile(item, S3Client, PutObjectCommand)));
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  validateConfig();

  // Dynamically require @aws-sdk/client-s3 (install if missing)
  let S3Client, PutObjectCommand;
  try {
    const sdk = require('@aws-sdk/client-s3');
    S3Client       = sdk.S3Client;
    PutObjectCommand = sdk.PutObjectCommand;
  } catch {
    console.error('\n@aws-sdk/client-s3 not found. Install it:');
    console.error('  cd /Users/achugustave/Documents/Marriageducation && npm install @aws-sdk/client-s3\n');
    process.exit(1);
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    forcePathStyle: true,
  });

  const files = collectFiles();
  console.log(`\nFiles to upload: ${files.length}`);
  if (DRY_RUN) { console.log('[DRY RUN] Exiting without uploading.'); return; }

  // Load existing URL map to allow resume
  const urlMap = fs.existsSync(URL_MAP_FILE)
    ? JSON.parse(fs.readFileSync(URL_MAP_FILE, 'utf8'))
    : {};

  const pending = files.filter(f => !urlMap[path.basename(f.localPath)]);
  console.log(`Already uploaded: ${files.length - pending.length}`);
  console.log(`Uploading now:    ${pending.length}\n`);

  let done = 0;
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    try {
      const urls = await uploadBatch(batch, client, PutObjectCommand);
      batch.forEach((item, idx) => {
        const fname = path.basename(item.localPath);
        urlMap[fname] = urls[idx];
      });
      done += batch.length;
      process.stdout.write(`\r  ${done}/${pending.length} uploaded...`);
      // Save progress every 100 files
      if (done % 100 === 0) fs.writeFileSync(URL_MAP_FILE, JSON.stringify(urlMap, null, 2));
    } catch (err) {
      console.error(`\nUpload error on batch starting at ${batch[0].r2Key}:`, err.message);
      // save progress and continue
      fs.writeFileSync(URL_MAP_FILE, JSON.stringify(urlMap, null, 2));
    }
  }

  fs.writeFileSync(URL_MAP_FILE, JSON.stringify(urlMap, null, 2));
  console.log(`\n\nDone! url-map.json written with ${Object.keys(urlMap).length} entries.`);
  console.log('Next: node update-firestore-urls.js');
}

main().catch(err => { console.error(err); process.exit(1); });
