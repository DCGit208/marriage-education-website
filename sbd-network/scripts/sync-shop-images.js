#!/usr/bin/env node
/**
 * Copies marriageducation.com book/cover images into sbd-network/public/images/
 * so shop coverImage paths resolve on sbd-network.web.app.
 *
 * Source: ../../public/images (Marriage Education site assets)
 */
const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.resolve(__dirname, '../../public/images');
const DEST_DIR = path.resolve(__dirname, '../public/images');
const MANIFEST_PATH = path.join(DEST_DIR, 'manifest.json');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function syncShopImages() {
  if (!fs.existsSync(SOURCE_DIR)) {
    throw new Error('Source images not found: ' + SOURCE_DIR);
  }

  fs.mkdirSync(DEST_DIR, { recursive: true });
  const files = fs.readdirSync(SOURCE_DIR).filter(function (name) {
    if (name.startsWith('.')) return false;
    return IMAGE_EXT.has(path.extname(name).toLowerCase());
  });

  let copied = 0;
  let skipped = 0;
  const manifest = { syncedAt: new Date().toISOString(), files: [] };

  files.forEach(function (name) {
    const src = path.join(SOURCE_DIR, name);
    const dest = path.join(DEST_DIR, name);
    const stat = fs.statSync(src);
    if (!stat.isFile()) return;

    const needsCopy = !fs.existsSync(dest) ||
      fs.statSync(dest).mtimeMs < stat.mtimeMs ||
      fs.statSync(dest).size !== stat.size;

    if (needsCopy) {
      fs.copyFileSync(src, dest);
      copied++;
    } else {
      skipped++;
    }
    manifest.files.push({ name, url: '/images/' + name.split('/').map(encodeURIComponent).join('/') });
  });

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  return { copied, skipped, total: files.length };
}

if (require.main === module) {
  const result = syncShopImages();
  console.log('✅ Shop images synced →', DEST_DIR);
  console.log('   Files:', result.total, '| copied:', result.copied, '| unchanged:', result.skipped);
}

module.exports = { syncShopImages, SOURCE_DIR, DEST_DIR };
