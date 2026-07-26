'use strict';

const crypto = require('crypto');

const DEFAULT_CHUNK = 3200;
const OVERLAP = 280;

function hashContent(text) {
  return crypto.createHash('sha256').update(text || '', 'utf8').digest('hex').slice(0, 24);
}

function chunkText(text, opts = {}) {
  const maxLen = opts.maxLen || DEFAULT_CHUNK;
  const overlap = opts.overlap || OVERLAP;
  const raw = String(text || '').trim();
  if (!raw) return [];

  if (raw.length <= maxLen) {
    return [{ text: raw, index: 0, total: 1 }];
  }

  const chunks = [];
  let start = 0;
  while (start < raw.length) {
    let end = Math.min(start + maxLen, raw.length);
    if (end < raw.length) {
      const slice = raw.slice(start, end);
      const breakAt = Math.max(
        slice.lastIndexOf('\n\n'),
        slice.lastIndexOf('\n## '),
        slice.lastIndexOf('. ')
      );
      if (breakAt > maxLen * 0.45) end = start + breakAt + 1;
    }
    const piece = raw.slice(start, end).trim();
    if (piece) chunks.push({ text: piece, index: chunks.length });
    if (end >= raw.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks.map(function (c, i) {
    return { text: c.text, index: i, total: chunks.length };
  });
}

module.exports = { chunkText, hashContent, DEFAULT_CHUNK, OVERLAP };
