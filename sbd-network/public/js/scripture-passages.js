/**
 * KJV scripture lookup for lesson reader — public domain text.
 * Keys: "book chapter:verse" (lowercase, normalized book name).
 */
(function (global) {
  'use strict';

  const BOOK_ALIASES = {
    gen: 'genesis', genesis: 'genesis',
    ex: 'exodus', exod: 'exodus', exodus: 'exodus',
    ps: 'psalm', psa: 'psalm', psalm: 'psalm', psalms: 'psalm',
    prov: 'proverbs', proverbs: 'proverbs',
    isa: 'isaiah', isaiah: 'isaiah',
    matt: 'matthew', matthew: 'matthew',
    '1 cor': '1 corinthians', '1cor': '1 corinthians', '1 corinthians': '1 corinthians',
    '2 cor': '2 corinthians', '2cor': '2 corinthians', '2 corinthians': '2 corinthians',
    gal: 'galatians', galatians: 'galatians',
    eph: 'ephesians', ephesians: 'ephesians',
    phil: 'philippians', philippians: 'philippians',
    col: 'colossians', colossians: 'colossians',
    '1 thess': '1 thessalonians', '1 thessalonians': '1 thessalonians',
    '1 tim': '1 timothy', '1 timothy': '1 timothy',
    heb: 'hebrews', hebrews: 'hebrews',
    jas: 'james', james: 'james',
    '1 pet': '1 peter', '1 peter': '1 peter',
    '1 john': '1 john',
    rev: 'revelation', revelation: 'revelation',
    song: 'song of solomon', sos: 'song of solomon', 'song of solomon': 'song of solomon',
    titus: 'titus', deut: 'deuteronomy', deuteronomy: 'deuteronomy',
  };

  /** @type {Record<string, string>} */
  const VERSES = {
    'genesis 1:27': 'So God created man in his own image, in the image of God created he him; male and female created he them.',
    'genesis 1:28': 'And God blessed them, and God said unto them, Be fruitful, and multiply, and replenish the earth, and subdue it.',
    'genesis 2:18': 'And the LORD God said, It is not good that the man should be alone; I will make him an help meet for him.',
    'genesis 2:24': 'Therefore shall a man leave his father and his mother, and shall cleave unto his wife: and they shall be one flesh.',
    'genesis 2:25': 'And they were both naked, the man and his wife, and were not ashamed.',
    'genesis 3:21': 'Unto Adam also and to his wife did the LORD God make coats of skins, and clothed them.',
    'deuteronomy 22:5': 'The woman shall not wear that which pertaineth unto a man, neither shall a man put on a woman\'s garment.',
    'psalm 11:3': 'If the foundations be destroyed, what can the righteous do?',
    'psalm 139:13': 'For thou hast possessed my reins: thou hast covered me in my mother\'s womb.',
    'psalm 139:14': 'I will praise thee; for I am fearfully and wonderfully made: marvellous are thy works; and that my soul knoweth right well.',
    'psalm 139:15': 'My substance was not hid from thee, when I was made in secret, and curiously wrought in the lowest parts of the earth.',
    'psalm 139:16': 'Thine eyes did see my substance, yet being unperfect; and in thy book all my members were written.',
    'proverbs 5:18': 'Let thy fountain be blessed: and rejoice with the wife of thy youth.',
    'proverbs 5:19': 'Let her be as the loving hind and pleasant roe; let her breasts satisfy thee at all times; and be thou ravished always with her love.',
    'proverbs 31:10': 'Who can find a virtuous woman? for her price is far above rubies.',
    'proverbs 31:17': 'She girdeth her loins with strength, and strengtheneth her arms.',
    'proverbs 31:22': 'She maketh herself coverings of tapestry; her clothing is silk and purple.',
    'proverbs 31:25': 'Strength and honour are her clothing; and she shall rejoice in time to come.',
    'proverbs 31:26': 'She openeth her mouth with wisdom; and in her tongue is the law of kindness.',
    'isaiah 1:18': 'Come now, and let us reason together, saith the LORD: though your sins be as scarlet, they shall be as white as snow.',
    'isaiah 61:10': 'I will greatly rejoice in the LORD, my soul shall be joyful in my God; for he hath clothed me with the garments of salvation.',
    'matthew 5:48': 'Be ye therefore perfect, even as your Father which is in heaven is perfect.',
    '1 corinthians 3:17': 'If any man defile the temple of God, him shall God destroy; for the temple of God is holy, which temple ye are.',
    '1 corinthians 6:16': 'What? know ye not that he which is joined to an harlot is one body? for two, saith he, shall be one flesh.',
    '1 corinthians 6:19': 'What? know ye not that your body is the temple of the Holy Ghost which is in you, which ye have of God, and ye are not your own?',
    '1 corinthians 6:20': 'For ye are bought with a price: therefore glorify God in your body, and in your spirit, which are God\'s.',
    '1 corinthians 7:3': 'Let the husband render unto the wife due benevolence: and likewise also the wife unto the husband.',
    '1 corinthians 7:4': 'The wife hath not power of her own body, but the husband: and likewise also the husband hath not power of his own body, but the wife.',
    '1 corinthians 7:5': 'Defraud ye not one the other, except it be with consent for a time, that ye may give yourselves to fasting and prayer.',
    '1 corinthians 9:27': 'But I keep under my body, and bring it into subjection: lest that by any means, when I have preached to others, I myself should be a castaway.',
    'ephesians 5:22': 'Wives, submit yourselves unto your own husbands, as unto the Lord.',
    'ephesians 5:23': 'For the husband is the head of the wife, even as Christ is the head of the church: and he is the saviour of the body.',
    'ephesians 5:24': 'Therefore as the church is subject unto Christ, so let the wives be to their own husbands in every thing.',
    'ephesians 5:25': 'Husbands, love your wives, even as Christ also loved the church, and gave himself for it.',
    'colossians 2:10': 'And ye are complete in him, which is the head of all principality and power.',
    '1 timothy 4:8': 'For bodily exercise profiteth little: but godliness is profitable unto all things.',
    '1 peter 3:3': 'Whose adorning let it not be that outward adorning of plaiting the hair, and of wearing of gold, or of putting on of apparel;',
    '1 peter 3:4': 'But let it be the hidden man of the heart, in that which is not corruptible, even the ornament of a meek and quiet spirit.',
    'hebrews 13:4': 'Marriage is honourable in all, and the bed undefiled: but whoremongers and adulterers God will judge.',
    'titus 2:3': 'The aged women likewise, that they be in behaviour as becometh holiness, not false accusers, not given to much wine, teachers of good things;',
    'titus 2:4': 'That they may teach the young women to be sober, to love their husbands, to love their children,',
    'titus 2:5': 'To be discreet, chaste, keepers at home, good, obedient to their own husbands, that the word of God be not blasphemed.',
    'revelation 19:8': 'And to her was granted that she should be arrayed in fine linen, clean and white: for the fine linen is the righteousness of saints.',
    'song of solomon 1:2': 'Let him kiss me with the kisses of his mouth: for thy love is better than wine.',
    'song of solomon 1:3': 'Because of the savour of thy good ointments thy name is as ointment poured forth, therefore do the virgins love thee.',
    'song of solomon 1:5': 'I am black, but comely, O ye daughters of Jerusalem, as the tents of Kedar, as the curtains of Solomon.',
    'song of solomon 1:6': 'Look not upon me, because I am black, because the sun hath looked upon me.',
    'song of solomon 4:1': 'Behold, thou art fair, my love; behold, thou art fair; thou hast doves\' eyes within thy locks.',
    'song of solomon 4:16': 'Awake, O north wind; and come, thou south; blow upon my garden, that the spices thereof may flow out.',
  };

  function normalizeBook(raw) {
    const key = String(raw || '').toLowerCase().replace(/\./g, '').trim();
    return BOOK_ALIASES[key] || key;
  }

  function parseRef(ref) {
    const m = String(ref).trim().match(/^(.+?)\s+(\d+)\s*:\s*(\d+)(?:\s*[–-]\s*(\d+))?$/);
    if (!m) return null;
    return {
      book: normalizeBook(m[1]),
      chapter: parseInt(m[2], 10),
      verseStart: parseInt(m[3], 10),
      verseEnd: m[4] ? parseInt(m[4], 10) : parseInt(m[3], 10),
      label: ref.trim(),
    };
  }

  function lookupVerse(book, chapter, verse) {
    const key = `${book} ${chapter}:${verse}`;
    return VERSES[key] || null;
  }

  function lookupRange(ref) {
    const p = parseRef(ref);
    if (!p) return null;
    const lines = [];
    for (let v = p.verseStart; v <= p.verseEnd; v++) {
      const text = lookupVerse(p.book, p.chapter, v);
      if (text) lines.push({ verse: v, text });
    }
    if (!lines.length) return null;
    const refLabel = p.verseStart === p.verseEnd
      ? `${capitalizeBook(p.book)} ${p.chapter}:${p.verseStart}`
      : `${capitalizeBook(p.book)} ${p.chapter}:${p.verseStart}–${p.verseEnd}`;
    return { ref: refLabel, verses: lines };
  }

  function capitalizeBook(book) {
    return book.split(' ').map((w, i) => {
      if (w === 'of') return w;
      if (/^\d+$/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  const _refCache = new Map();

  function extractRefs(text) {
    const key = text.length > 120 ? text.slice(0, 120) : text;
    if (_refCache.has(key)) return _refCache.get(key);

    const found = new Set();
    const re = /\(?\b((?:\d\s+)?[A-Za-z]+(?:\s+(?:of\s+)?[A-Za-z]+)?)\s+(\d+)\s*:\s*(\d+)(?:\s*[–-]\s*(\d+))?\)?/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const book = normalizeBook(m[1]);
      const chapter = m[2];
      const v1 = m[3];
      const v2 = m[4] || m[3];
      const label = `${capitalizeBook(book)} ${chapter}:${v1}${v2 !== v1 ? '–' + v2 : ''}`;
      if (lookupRange(label)) found.add(label);
    }
    const out = [...found];
    if (_refCache.size > 200) _refCache.clear();
    _refCache.set(key, out);
    return out;
  }

  function renderBlock(ref, opts) {
    const data = lookupRange(ref);
    if (!data) return '';
    const compact = opts && opts.compact;
    const body = data.verses.map((v) =>
      `<span class="scripture-verse"><sup>${v.verse}</sup> ${escapeHtml(v.text)}</span>`
    ).join(' ');
    return `<figure class="scripture-block${compact ? ' scripture-block--compact' : ''}" role="group" aria-label="Scripture: ${escapeHtml(data.ref)}">
      <figcaption class="scripture-ref">${escapeHtml(data.ref)} <span class="scripture-version">KJV</span></figcaption>
      <blockquote class="scripture-text">${body}</blockquote>
    </figure>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  global.ScripturePassages = {
    lookupRange,
    extractRefs,
    renderBlock,
    parseRef,
  };
})(typeof window !== 'undefined' ? window : global);
