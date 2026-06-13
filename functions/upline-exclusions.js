/**
 * Production upline codes that must never appear in recruitment or commission walks.
 * See scripts/fix-rd-gust-test-upline.js
 */

const EXCLUDED_UPLINE_CODES = new Set(['RD-GUST-4230']);

function normalizeExcludedCode(raw) {
  let c = String(raw || '').trim().toUpperCase();
  if (!c) return '';
  if (/^(AMB|RD|SNR)([_-]|$)/.test(c)) c = c.replace(/_/g, '-');
  return c.replace(/-+/g, '-');
}

function isExcludedUplineCode(raw) {
  const code = normalizeExcludedCode(raw);
  return code ? EXCLUDED_UPLINE_CODES.has(code) : false;
}

module.exports = {
  EXCLUDED_UPLINE_CODES,
  normalizeExcludedCode,
  isExcludedUplineCode
};
