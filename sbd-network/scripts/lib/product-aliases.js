/**
 * Shared product-id alias helpers (Node).
 * Source: sbd-network/data/product-aliases.json
 */
const fs = require('fs');
const path = require('path');

const ALIASES_PATH = path.join(__dirname, '../../data/product-aliases.json');

function loadProductAliases() {
  const raw = JSON.parse(fs.readFileSync(ALIASES_PATH, 'utf8'));
  return raw.aliases || {};
}

function legacyAliasesByCanonical(aliases) {
  const map = {};
  Object.entries(aliases || {}).forEach(function (entry) {
    const alias = entry[0];
    const canonical = entry[1];
    if (!map[canonical]) map[canonical] = [];
    map[canonical].push(alias);
  });
  return map;
}

function resolveProductId(rawProductId, aliases) {
  const table = aliases || loadProductAliases();
  const normalized = typeof rawProductId === 'string' ? rawProductId.trim() : '';
  if (!normalized) return '';
  return table[normalized] || normalized;
}

module.exports = {
  ALIASES_PATH,
  loadProductAliases,
  legacyAliasesByCanonical,
  resolveProductId,
};
