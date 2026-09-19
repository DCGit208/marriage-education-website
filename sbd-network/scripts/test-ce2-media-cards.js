/**
 * Unit tests for CE2 board-share cards + in-thread media bubbles.
 * Usage: node scripts/test-ce2-media-cards.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');

function loadIife(relPath, extras) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const sandbox = Object.assign(
    {
      console: console,
      Date: Date,
      Number: Number,
      String: String,
      Math: Math,
      Array: Array,
      Object: Object,
      Error: Error,
      URL: URL,
      URLSearchParams: URLSearchParams,
      location: { origin: 'https://sbd.marriageducation.com' },
    },
    extras || {}
  );
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.runInNewContext(code, sandbox, { filename: relPath });
  return sandbox;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function createDom() {
  const created = [];
  function matches(el, selector) {
    if (!el || el.nodeType !== 1) return false;
    const parts = selector.split(',').map(function (s) {
      return s.trim();
    });
    return parts.some(function (sel) {
      let rest = sel;
      const notMatch = rest.match(/^(.*):not\(([^)]+)\)$/);
      let notSel = '';
      if (notMatch) {
        rest = notMatch[1];
        notSel = notMatch[2];
      }
      if (notSel && matches(el, notSel)) return false;
      if (rest.charAt(0) === '.') {
        return el.classList.contains(rest.slice(1).split('.')[0]) &&
          rest
            .slice(1)
            .split('.')
            .every(function (c) {
              return el.classList.contains(c);
            });
      }
      return false;
    });
  }

  function walk(node, out) {
    if (!node || !node.childNodes) return;
    node.childNodes.forEach(function (child) {
      out.push(child);
      walk(child, out);
    });
  }

  function node(tag) {
    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      className: '',
      childNodes: [],
      attributes: {},
      parentNode: null,
      textContent: '',
      src: '',
      alt: '',
      complete: false,
      naturalWidth: 1,
      listeners: {},
      classList: {
        contains: function (c) {
          return (' ' + el.className + ' ').indexOf(' ' + c + ' ') >= 0;
        },
        add: function (c) {
          if (!this.contains(c)) el.className = (el.className + ' ' + c).trim();
        },
        remove: function (c) {
          el.className = el.className
            .split(/\s+/)
            .filter(function (x) {
              return x && x !== c;
            })
            .join(' ');
        },
      },
      setAttribute: function (k, v) {
        this.attributes[k] = String(v);
      },
      getAttribute: function (k) {
        return Object.prototype.hasOwnProperty.call(this.attributes, k)
          ? this.attributes[k]
          : null;
      },
      removeAttribute: function (k) {
        delete this.attributes[k];
        if (k === 'src') this.src = '';
      },
      appendChild: function (c) {
        c.parentNode = this;
        this.childNodes.push(c);
        return c;
      },
      querySelector: function (sel) {
        return this.querySelectorAll(sel)[0] || null;
      },
      querySelectorAll: function (sel) {
        const found = [];
        const all = [];
        walk(this, all);
        all.forEach(function (child) {
          if (matches(child, sel)) found.push(child);
        });
        found.forEach = Array.prototype.forEach;
        return found;
      },
      closest: function (sel) {
        let cur = this;
        while (cur) {
          if (matches(cur, sel)) return cur;
          cur = cur.parentNode;
        }
        return null;
      },
      addEventListener: function (type, fn) {
        (this.listeners[type] || (this.listeners[type] = [])).push(fn);
      },
      replaceWith: function (n) {
        if (!this.parentNode) return;
        const kids = this.parentNode.childNodes;
        const i = kids.indexOf(this);
        if (i >= 0) {
          kids[i] = n;
          n.parentNode = this.parentNode;
        }
      },
    };
    created.push(el);
    return el;
  }

  return {
    createElement: node,
    body: node('body'),
    __created: created,
  };
}

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  ok  ' + name);
  } catch (err) {
    failed += 1;
    console.error('  FAIL  ' + name);
    console.error('       ' + (err && err.stack ? err.stack.split('\n')[0] : err));
  }
}

console.log('\nCE2 media cards + board-share polish\n');

const share = loadIife('public/communication-v2/ce2-share.js').Ce2Share;
assert.ok(share, 'Ce2Share did not load');

test('Ce2Share VERSION is 5', function () {
  assert.strictEqual(share.VERSION, 5);
});

test('boardShareThumbUrl prefers thumbnailUrl then thumbUrl then imageUrl', function () {
  assert.strictEqual(
    share.boardShareThumbUrl({ thumbnailUrl: 'a', thumbUrl: 'b', imageUrl: 'c' }),
    'a'
  );
  assert.strictEqual(share.boardShareThumbUrl({ thumbUrl: 'b', imageUrl: 'c' }), 'b');
  assert.strictEqual(share.boardShareThumbUrl({ imageUrl: 'c' }), 'c');
  assert.strictEqual(share.boardShareThumbUrl({}), '');
});

test('card hierarchy is kicker → title → excerpt → note → CTA', function () {
  const html = share.renderBoardShareHtml(
    {
      content: 'fallback excerpt',
      boardShare: {
        boardId: 'b1',
        postId: 'p1',
        token: 'tok',
        title: 'Sunday formation',
        excerpt: 'Short excerpt',
        note: 'Worth reading',
        thumbnailUrl: 'https://cdn.example/t.jpg',
        url: 'https://sbd.marriageducation.com/board.html?boardId=b1&post=p1&ce2token=tok',
      },
    },
    escapeHtml,
    { type: 'group', id: 'g1' }
  );
  const kicker = html.indexOf('ce2-board-share-kicker');
  const title = html.indexOf('ce2-board-share-title');
  const excerpt = html.indexOf('ce2-board-share-excerpt');
  const note = html.indexOf('ce2-board-share-note');
  const cta = html.indexOf('ce2-board-share-cta');
  assert.ok(kicker < title && title < excerpt && excerpt < note && note < cta);
  assert.ok(/<span class="ce2-board-share-cta">Open post<\/span>/.test(html));
  assert.ok(!/Open post\s*→/.test(html));
  assert.ok(/from=ce2/.test(html));
  assert.ok(/group=g1/.test(html));
  assert.ok(!/conv=/.test(html));
});

test('missing thumb still renders a reply button with placeholder', function () {
  const html = share.renderBoardShareHtml(
    { boardShare: { boardId: 'b1', postId: 'p1', title: 'Text only' } },
    escapeHtml,
    { type: 'direct', id: 'd_a_b' }
  );
  assert.ok(/ce2-board-share-thumb is-fallback/.test(html));
  assert.ok(/aria-label="Reply to this message"/.test(html));
  const thumbClose = html.indexOf('</button>');
  assert.ok(html.indexOf('ce2-board-share-body') > thumbClose);
  assert.ok(/from=ce2/.test(html));
  assert.ok(/conv=d_a_b/.test(html));
});

test('legacy thumbUrl still paints the card image', function () {
  const html = share.renderBoardShareHtml(
    {
      boardShare: {
        boardId: 'b1',
        postId: 'p1',
        thumbUrl: 'https://cdn.example/legacy.jpg',
      },
    },
    escapeHtml
  );
  assert.ok(/data-ce2-src="https:\/\/cdn\.example\/legacy\.jpg"/.test(html));
  assert.ok(!/\ssrc="https:\/\/cdn\.example\/legacy\.jpg"/.test(html));
  assert.ok(/ce2-board-share-thumb is-deferred/.test(html));
  assert.ok(!/is-fallback/.test(html));
});

const css = fs.readFileSync(
  path.join(ROOT, 'public/communication-v2/communication-v2.css'),
  'utf8'
);

test('board-share CSS keeps a cover-crop thumb frame', function () {
  const thumb = css.match(/\.ce2-board-share-thumb\s*\{[^}]+\}/);
  const img = css.match(/\.ce2-board-share-thumb-img\s*\{[^}]+\}/);
  assert.ok(thumb && /aspect-ratio:\s*16\s*\/\s*10/.test(thumb[0]));
  assert.ok(img && /object-fit:\s*cover/.test(img[0]));
  assert.ok(/\.ce2-board-share-thumb-img\.is-broken/.test(css));
  assert.ok(/\.ce2-board-share-thumb-ph/.test(css));
});

test('media bubble CSS letterboxes the opened image and covers thumbs', function () {
  const tapImg = css.match(/\.ce2-media-tap--image\s*\{[^}]+\}/);
  const full = css.match(/\.ce2-media-full\s*\{[^}]+\}/);
  assert.ok(tapImg && /aspect-ratio:\s*4\s*\/\s*3/.test(tapImg[0]));
  assert.ok(tapImg && /min-height:\s*132px/.test(tapImg[0]));
  assert.ok(full && /object-fit:\s*contain/.test(full[0]));
  assert.ok(full && /min-height:\s*132px/.test(full[0]));
  assert.ok(/\.ce2-media-tap\.is-fallback \.ce2-media-ph/.test(css));
});

test('messenger cache-bust is above live for changed card/media assets', function () {
  const html = fs.readFileSync(
    path.join(ROOT, 'public/communication-v2/index.html'),
    'utf8'
  );
  const cssVer = html.match(/communication-v2\.css\?v=(\d+)/);
  const shareVer = html.match(/ce2-share\.js\?v=(\d+)/);
  const mediaVer = html.match(/ce2-media-view\.js\?v=(\d+)/);
  assert.ok(cssVer && Number(cssVer[1]) >= 92, 'css cache-bust must be above live v=91');
  assert.ok(shareVer && Number(shareVer[1]) >= 12, 'ce2-share cache-bust must be above live v=11');
  assert.ok(mediaVer && Number(mediaVer[1]) >= 5, 'ce2-media-view cache-bust must be above live v=4');
  const jsVer = html.match(/communication-v2\.js\?v=(\d+)/);
  assert.ok(jsVer && Number(jsVer[1]) >= 126, 'communication-v2.js cache-bust must be above live v=125');
  const actionsVer = html.match(/ce2-message-actions\.js\?v=(\d+)/);
  assert.ok(actionsVer && Number(actionsVer[1]) >= 23, 'ce2-message-actions.js cache-bust must stay at or above live v=23');
});

const document = createDom();
const mediaSandbox = loadIife('public/communication-v2/ce2-media-view.js', {
  document: document,
});
const media = mediaSandbox.Ce2MediaView;
assert.ok(media, 'Ce2MediaView did not load');

test('Ce2MediaView VERSION is 5', function () {
  assert.strictEqual(media.VERSION, 5);
});

test('image bubble keeps a fallback frame when thumb is missing', function () {
  const bubble = document.createElement('div');
  media.appendChatImage(bubble, { imageUrl: 'https://cdn.example/full.jpg' });
  const btn = bubble.childNodes[0];
  assert.ok(btn.classList.contains('ce2-media-tap--image'));
  assert.ok(btn.classList.contains('is-fallback'));
  assert.strictEqual(btn.getAttribute('data-full-url'), 'https://cdn.example/full.jpg');
  const ph = btn.querySelector('.ce2-media-ph');
  assert.ok(ph);
  assert.strictEqual(ph.textContent, 'Photo');
  assert.ok(!btn.querySelector('.ce2-media-thumb'));
  const hint = btn.querySelector('.ce2-media-tap-hint');
  assert.strictEqual(hint.textContent, 'Tap to load');
});

test('image bubble uses a deferred cover thumb until hydrate', function () {
  const bubble = document.createElement('div');
  media.appendChatImage(bubble, {
    imageUrl: 'https://cdn.example/full.jpg',
    imageThumbUrl: 'https://cdn.example/thumb.jpg',
  });
  const btn = bubble.childNodes[0];
  assert.ok(btn.classList.contains('is-deferred'));
  assert.ok(!btn.classList.contains('is-fallback'));
  const img = btn.querySelector('.ce2-media-thumb');
  assert.strictEqual(img.getAttribute('data-ce2-src'), 'https://cdn.example/thumb.jpg');
  assert.ok(!img.src, 'thumb src must not be assigned at paint');
  assert.strictEqual(btn.querySelector('.ce2-media-tap-hint').textContent, 'Tap to load');
});

test('broken thumb marks the media frame as fallback', function () {
  const bubble = document.createElement('div');
  media.appendChatImage(bubble, {
    imageUrl: 'https://cdn.example/full.jpg',
    imageThumbUrl: 'https://cdn.example/missing.jpg',
  });
  const img = bubble.childNodes[0].querySelector('.ce2-media-thumb');
  img.complete = true;
  img.naturalWidth = 0;
  img.src = 'https://cdn.example/missing.jpg';
  media.bindBrokenMedia(bubble);
  assert.ok(img.classList.contains('is-broken'));
  assert.ok(bubble.childNodes[0].classList.contains('is-fallback'));
});

test('failed full-image open keeps the tap target for retry', function () {
  const bubble = document.createElement('div');
  media.appendChatImage(bubble, {
    imageUrl: 'https://cdn.example/full.jpg',
    imageThumbUrl: 'https://cdn.example/thumb.jpg',
  });
  const btn = bubble.childNodes[0];
  const before = document.__created.length;
  media.activateMediaTap(btn);
  assert.ok(btn.classList.contains('is-opening'));
  const fullImg = document.__created.slice(before).find(function (el) {
    return el.classList.contains('ce2-media-full');
  });
  assert.ok(fullImg, 'expected a full-image element while opening');
  (fullImg.listeners.error || []).forEach(function (fn) {
    fn({ target: fullImg });
  });
  assert.ok(!btn.classList.contains('is-opening'));
  assert.ok(btn.classList.contains('is-fallback'));
  assert.strictEqual(btn.querySelector('.ce2-media-tap-hint').textContent, 'Tap to retry');
  assert.strictEqual(bubble.childNodes[0], btn);
});

test('successful image open replaces the tap button with a letterboxed full image', function () {
  const bubble = document.createElement('div');
  media.appendChatImage(bubble, {
    imageUrl: 'https://cdn.example/full.jpg',
    imageThumbUrl: 'https://cdn.example/thumb.jpg',
  });
  const btn = bubble.childNodes[0];
  const before = document.__created.length;
  media.activateMediaTap(btn);
  const fullImg = document.__created.slice(before).find(function (el) {
    return el.classList.contains('ce2-media-full');
  });
  (fullImg.listeners.load || []).forEach(function (fn) {
    fn({ target: fullImg });
  });
  assert.strictEqual(bubble.childNodes[0], fullImg);
  assert.ok(fullImg.classList.contains('ce2-media-full'));
});

test('video bubble always has a placeholder behind the poster', function () {
  const bubble = document.createElement('div');
  media.appendChatVideo(bubble, { videoUrl: 'https://cdn.example/clip.mp4' });
  const btn = bubble.childNodes[0];
  assert.ok(btn.classList.contains('ce2-media-tap--video'));
  assert.ok(btn.classList.contains('is-fallback'));
  assert.strictEqual(btn.querySelector('.ce2-media-ph').textContent, 'Video');
  assert.ok(btn.querySelector('.ce2-media-play-icon'));
});

const interactiveSrc = fs.readFileSync(
  path.join(ROOT, 'public/communication-v2/communication-v2.js'),
  'utf8'
);

test('thumb reply + media tap stay excluded from interactive-target skip', function () {
  assert.ok(
    interactiveSrc.indexOf(
      "node.closest('.ce2-media-tap, .ce2-board-share-thumb, .ce2-link-preview-thumb')"
    ) !== -1
  );
  assert.ok(
    interactiveSrc.indexOf(
      "e.target.closest('.ce2-board-share-thumb, .ce2-link-preview-thumb')"
    ) !== -1
  );
  assert.ok(interactiveSrc.indexOf('setReply(shareMsg)') !== -1);
});

test('voice / delivery / keyboard frozen markers are still present', function () {
  const index = fs.readFileSync(
    path.join(ROOT, 'public/communication-v2/index.html'),
    'utf8'
  );
  assert.ok(index.indexOf('ce2-keyboard-stable-v60') !== -1);
  assert.ok(index.indexOf('ce2-audio-stable-1d') !== -1);
  assert.ok(index.indexOf('ce2-delivery-stable-v90') !== -1);
  assert.ok(interactiveSrc.indexOf('function bindCe2VoiceUploadActions') !== -1);
});

test('reaction chips and swipe-to-reply from main remain wired', function () {
  assert.ok(/\.ce2-swipe-reply-icon/.test(css));
  assert.ok(/\.ce2-msg-reaction\.is-mine/.test(css));
  const actions = fs.readFileSync(
    path.join(ROOT, 'public/communication-v2/ce2-message-actions.js'),
    'utf8'
  );
  assert.ok(actions.indexOf('function decideSwipeReply') !== -1);
  assert.ok(actions.indexOf('ce2-msg-reaction-add') !== -1);
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed\n');
  process.exit(1);
}
console.log('\n✅ CE2 media card tests passed\n');
