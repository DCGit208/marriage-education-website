/**
 * Prefer flat graphic covers from /assets/book-covers (Book Covers folder),
 * never shop 3D mockup plates from /images.
 */
(function (global) {
  'use strict';

  const FLAT = {
    'marriage-porn-beyond': '/assets/book-covers/marriage-porn-beyond.png',
    'sbd-canonical': '/assets/book-covers/sbd-canonical.png',
    'sbd-dummies': '/assets/book-covers/sbd-dummies.png',
    'teleios-blueprint': '/assets/book-covers/teleios-blueprint.png',
    'teleios-blueprint-full': '/assets/book-covers/teleios-blueprint.png',
    'teleios-blueprint-course': '/assets/book-covers/teleios-blueprint.png',
    'anthropology-of-wholeness-book': '/assets/book-covers/anthropology-of-wholeness.webp',
    'teleios-bundle': '/assets/book-covers/teleios-blueprint-bundle.png',
    'sbd-dummies-digital-print': '/assets/book-covers/sbd-dummies.png',
    'the-woman-the-wife-the-mother-book': '/assets/book-covers/the-woman-the-wife-the-mother.png',
    'the-woman-the-wife-the-mother': '/assets/book-covers/the-woman-the-wife-the-mother.png',
    'the-art-of-sexuality': '/assets/book-covers/the-art-of-sexuality.jpg',
    'naked-and-not-ashamed': '/assets/book-covers/naked-and-not-ashamed.png',
    'sbd-digital-archive-access': '/assets/book-covers/sbd-digital-archive.png',
    'sbd-magazine-single-issue': '/assets/book-covers/sbd-digital-archive.png',
    'the-matrimonial-order': '/assets/book-covers/the-matrimonial-order.png',
    'the-matrimonial-rule': '/assets/book-covers/the-matrimonial-rule.png',
  };

  /** Shop /images paths that are known 3D marketing plates (two books + grey). */
  function isMockupPlate(url) {
    if (!url) return false;
    const u = String(url);
    if (u.indexOf('/assets/book-covers/') === 0) return false;
    // Landscape mockup plates commonly ~2400x1700 in /images
    if (u.indexOf('/images/') === -1) return false;
    const mockupHints = [
      'Marriage=Porn',
      'sbd-canonical.jpg',
      'sbd-canonical1',
      'naked-not-ashamed.jpg',
      'naked-not-ashamed2',
      'Sex-by-design-2',
      'the-art-of-sexuality.jpg',
      'sbd unequally',
      'sbd-unequally',
      'sbd-deluxe',
      'sbd-standard',
      'sbd-dummies.jpg',
    ];
    return mockupHints.some(function (h) { return u.indexOf(h) !== -1; });
  }

  function resolveCover(bookOrId, fallbackUrl) {
    const id = typeof bookOrId === 'string' ? bookOrId : (bookOrId && bookOrId.id) || '';
    const raw = fallbackUrl != null
      ? fallbackUrl
      : (bookOrId && (bookOrId.coverImage || bookOrId.cover || bookOrId.image)) || '';
    if (FLAT[id]) return FLAT[id];
    if (raw && String(raw).indexOf('/assets/book-covers/') === 0) return String(raw);
    if (isMockupPlate(raw)) {
      // Try id-based only; don't serve 3D plates on the shelf
      return FLAT[id] || '';
    }
    return raw || '';
  }

  global.BookCovers = {
    FLAT: FLAT,
    resolve: resolveCover,
    isMockupPlate: isMockupPlate,
  };
})(window);
