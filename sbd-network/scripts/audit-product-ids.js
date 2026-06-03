#!/usr/bin/env node
/**
 * Validates product id consistency across catalog, aliases, and functions backend map.
 * Exit code 1 on errors (for CI).
 */
const fs = require('fs');
const path = require('path');
const { loadProductAliases, resolveProductId } = require('./lib/product-aliases');

const ROOT = path.join(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'public/data/shop-catalog.json');
const FUNCTIONS_PATH = path.join(ROOT, '../functions/index.js');

function extractCatalogIds(catalog) {
  return new Set((catalog.products || []).map(function (p) { return p.id; }));
}

function extractServerCatalogIds(functionsSource) {
  const ids = new Set();
  const match = functionsSource.match(/const SBD_CATALOG_SERVER = \{([\s\S]*?)\};\n\nconst SBD_UNLOCK_RULES/);
  if (!match) return ids;
  const block = match[1];
  const re = /'([^']+)':\s*\{/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    ids.add(m[1]);
  }
  return ids;
}

function runAudit() {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(CATALOG_PATH)) {
    console.error('❌ Missing catalog. Run: node scripts/generate-shop-catalog.js');
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const catalogIds = extractCatalogIds(catalog);
  const aliases = loadProductAliases();

  Object.entries(aliases).forEach(function (entry) {
    const alias = entry[0];
    const canonical = entry[1];
    if (alias === canonical) {
      errors.push('Alias maps to itself: ' + alias);
    }
    if (!catalogIds.has(canonical)) {
      errors.push('Alias "' + alias + '" points to missing catalog id: ' + canonical);
    }
    if (catalogIds.has(alias)) {
      warnings.push('Alias "' + alias + '" is also a catalog product id (prefer canonical only): ' + canonical);
    }
  });

  (catalog.products || []).forEach(function (p) {
    (p.legacyAliases || []).forEach(function (legacy) {
      if (aliases[legacy] !== p.id) {
        errors.push('legacyAliases mismatch for ' + p.id + ': ' + legacy + ' should map via product-aliases.json');
      }
    });
  });

  if (fs.existsSync(FUNCTIONS_PATH)) {
    const functionsSource = fs.readFileSync(FUNCTIONS_PATH, 'utf8');
    const serverIds = extractServerCatalogIds(functionsSource);
    catalogIds.forEach(function (id) {
      if (!serverIds.has(id)) {
        errors.push('Catalog id missing from SBD_CATALOG_SERVER: ' + id);
      }
    });
    serverIds.forEach(function (id) {
      if (!catalogIds.has(id)) {
        warnings.push('SBD_CATALOG_SERVER id not in shop catalog: ' + id);
      }
    });
  } else {
    warnings.push('functions/index.js not found — skipped backend map check');
  }

  console.log('\n🔎 Product ID audit');
  console.log('   Catalog products:', catalogIds.size);
  console.log('   Aliases:', Object.keys(aliases).length);
  console.log('   Sample resolve(sbd-for-dummies):', resolveProductId('sbd-for-dummies', aliases));

  if (warnings.length) {
    console.log('\n⚠️  Warnings (' + warnings.length + '):');
    warnings.forEach(function (w) { console.log('   -', w); });
  }

  if (errors.length) {
    console.log('\n❌ Errors (' + errors.length + '):');
    errors.forEach(function (e) { console.log('   -', e); });
    process.exit(1);
  }

  console.log('\n✅ Product ID audit passed\n');
}

runAudit();
