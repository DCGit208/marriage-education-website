#!/usr/bin/env node
/**
 * seed-shop-catalog.js
 * Writes marriageducation.com shop catalog to Firestore `shopProducts` collection.
 * Safe to re-run — uses merge on doc id.
 *
 * Run from sbd-network/: node scripts/seed-shop-catalog.js
 * Requires: ../../serviceAccountKey.json
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');
const CATALOG_PATH = path.resolve(__dirname, '../public/data/shop-catalog.json');

if (!fs.existsSync(SERVICE_ACCOUNT)) {
  console.error('❌ serviceAccountKey.json not found at', SERVICE_ACCOUNT);
  process.exit(1);
}
if (!fs.existsSync(CATALOG_PATH)) {
  console.error('❌ Run node scripts/generate-shop-catalog.js first');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT)) });
const db = admin.firestore();
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));

async function seed() {
  console.log('\n📦 Seeding shop catalog to Firestore shopProducts/\n');
  let n = 0;
  const batchSize = 400;
  let batch = db.batch();

  for (const product of catalog.products) {
    const ref = db.collection('shopProducts').doc(product.id);
    batch.set(ref, {
      ...product,
      priceUsd: product.priceUsd,
      currency: catalog.currency || 'USD',
      catalogVersion: catalog.version,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    n++;
    if (n % batchSize === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();

  await db.collection('shopMeta').doc('catalog').set({
    version: catalog.version,
    productCount: catalog.products.length,
    categories: catalog.categories,
    currency: catalog.currency,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log('✅ Seeded', n, 'products to shopProducts/');
  console.log('✅ Updated shopMeta/catalog\n');
  process.exit(0);
}

seed().catch(function (err) {
  console.error(err);
  process.exit(1);
});
