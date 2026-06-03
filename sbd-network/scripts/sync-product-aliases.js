#!/usr/bin/env node
/**
 * Copies data/product-aliases.json to public/ and emits browser helper shop-product-ids.js.
 * Run automatically from generate-shop-catalog.js and build.js.
 */
const fs = require('fs');
const path = require('path');
const { loadProductAliases, ALIASES_PATH } = require('./lib/product-aliases');

const ROOT = path.join(__dirname, '..');
const PUBLIC_JSON = path.join(ROOT, 'public/data/product-aliases.json');
const PUBLIC_JS = path.join(ROOT, 'public/js/shop-product-ids.js');
const FUNCTIONS_JSON = path.join(ROOT, '../functions/sbd-product-aliases.json');

function syncProductAliases() {
  const source = JSON.parse(fs.readFileSync(ALIASES_PATH, 'utf8'));
  const aliases = source.aliases || {};

  fs.mkdirSync(path.dirname(PUBLIC_JSON), { recursive: true });
  fs.writeFileSync(PUBLIC_JSON, JSON.stringify(source, null, 2));
  fs.mkdirSync(path.dirname(FUNCTIONS_JSON), { recursive: true });
  fs.writeFileSync(FUNCTIONS_JSON, JSON.stringify(source, null, 2));

  const js = `/**
 * AUTO-GENERATED — do not edit. Source: data/product-aliases.json
 * Regenerate: node scripts/sync-product-aliases.js
 */
(function (global) {
  var ALIASES = ${JSON.stringify(aliases, null, 2)};

  function resolveShopProductId(productId) {
    var normalized = typeof productId === 'string' ? productId.trim() : '';
    if (!normalized) return '';
    return ALIASES[normalized] || normalized;
  }

  global.SBDShopProductIds = {
    version: ${Number(source.version) || 1},
    aliases: ALIASES,
    resolve: resolveShopProductId,
  };
})(typeof window !== 'undefined' ? window : global);
`;

  fs.mkdirSync(path.dirname(PUBLIC_JS), { recursive: true });
  fs.writeFileSync(PUBLIC_JS, js);
  return { aliasCount: Object.keys(aliases).length };
}

if (require.main === module) {
  const result = syncProductAliases();
  console.log('✅ Synced product aliases → public/data/product-aliases.json');
  console.log('✅ Synced product aliases → functions/sbd-product-aliases.json');
  console.log('✅ Generated public/js/shop-product-ids.js (' + result.aliasCount + ' aliases)');
}

module.exports = { syncProductAliases };
