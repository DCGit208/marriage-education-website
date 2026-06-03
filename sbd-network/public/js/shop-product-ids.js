/**
 * AUTO-GENERATED — do not edit. Source: data/product-aliases.json
 * Regenerate: node scripts/sync-product-aliases.js
 */
(function (global) {
  var ALIASES = {
  "sbd-for-dummies": "sbd-dummies"
};

  function resolveShopProductId(productId) {
    var normalized = typeof productId === 'string' ? productId.trim() : '';
    if (!normalized) return '';
    return ALIASES[normalized] || normalized;
  }

  global.SBDShopProductIds = {
    version: 1,
    aliases: ALIASES,
    resolve: resolveShopProductId,
  };
})(typeof window !== 'undefined' ? window : global);
