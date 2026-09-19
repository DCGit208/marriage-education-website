/**
 * CE2 lighter inbox first paint + deferred thread media.
 * Usage: node scripts/test-ce2-deferred-media.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function loadIife(relPath, extras) {
  const code = read(relPath);
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
      navigator: {},
    },
    extras || {}
  );
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.runInNewContext(code, sandbox, { filename: relPath });
  return sandbox;
}

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
    const attr = rest.match(/^([a-z][\w-]*)?\[([^\]]+)\]$/i);
    if (attr) {
      const tag = attr[1];
      const raw = attr[2];
      if (tag && el.tagName !== tag.toUpperCase()) return false;
      const eq = raw.match(/^([^=]+)=["']?([^"']+)["']?$/);
      if (eq) return el.getAttribute(eq[1]) === eq[2];
      return el.getAttribute(raw) != null;
    }
    if (rest.charAt(0) === '.') {
      return rest
        .slice(1)
        .split('.')
        .every(function (c) {
          return el.classList.contains(c);
        });
    }
    if (rest.indexOf('.') > 0) {
      const bits = rest.split('.');
      if (el.tagName !== bits[0].toUpperCase()) return false;
      return bits.slice(1).every(function (c) {
        return el.classList.contains(c);
      });
    }
    return el.tagName === rest.toUpperCase();
  });
}

function walk(node, out) {
  if (!node || !node.childNodes) return;
  node.childNodes.forEach(function (child) {
    out.push(child);
    walk(child, out);
  });
}

function createDom() {
  const created = [];
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
      canPlayType: function () {
        return 'probably';
      },
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
        if (k === 'src') this.src = String(v);
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
  return { createElement: node, body: node('body'), __created: created };
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

const html = read('public/communication-v2/index.html');
const v2Src = read('public/communication-v2/communication-v2.js');
const mediaSrc = read('public/communication-v2/ce2-media-view.js');
const audioSrc = read('public/communication-v2/ce2-audio-playback.js');
const css = read('public/communication-v2/communication-v2.css');
const pkg = JSON.parse(read('package.json'));
const PRIVATE =
  'https://sbd-upload-signer.sbdnetwork.workers.dev/media?key=ce2%2Fdm_image%2Fd_a_b%2Ffull.jpg';
const PRIVATE_THUMB =
  'https://sbd-upload-signer.sbdnetwork.workers.dev/media?key=ce2%2Fdm_image%2Fd_a_b%2Fthumb.jpg';

console.log('\nCE2 deferred media + inbox first paint\n');

test('detect helpers: off-screen media never resolves; tap/jump always does', function () {
  const document = createDom();
  const sandbox = loadIife('public/communication-v2/ce2-media-view.js', { document: document });
  const media = sandbox.Ce2MediaView;
  assert.strictEqual(media.shouldResolveMediaUrl({ visible: false }), false);
  assert.strictEqual(media.shouldResolveMediaUrl({ visible: true }), true);
  assert.strictEqual(media.shouldResolveMediaUrl({ visible: true, preferTap: true }), false);
  assert.strictEqual(media.shouldResolveMediaUrl({ visible: false, tapped: true }), true);
  assert.strictEqual(media.shouldResolveMediaUrl({ visible: false, force: true }), true);
  assert.strictEqual(media.shouldResolveMediaUrl({ visible: false, playing: true }), true);
  assert.ok(media.connectionPrefersTapToLoad({ saveData: true }));
  assert.ok(media.connectionPrefersTapToLoad({ effectiveType: 'slow-2g' }));
  assert.ok(!media.connectionPrefersTapToLoad({ effectiveType: '4g' }));
});

test('appending image/video bubbles does not assign src or resolve URLs', function () {
  const calls = [];
  const document = createDom();
  const sandbox = loadIife('public/communication-v2/ce2-media-view.js', {
    document: document,
    resolveR2MediaUrl: function (url) {
      calls.push(url);
      return Promise.resolve(url + '?sig=1');
    },
    isCe2PrivateMediaLocator: function () {
      return true;
    },
  });
  const media = sandbox.Ce2MediaView;
  const bubble = document.createElement('div');
  media.appendChatImage(bubble, { imageUrl: PRIVATE, imageThumbUrl: PRIVATE_THUMB });
  media.appendChatVideo(bubble, { videoUrl: PRIVATE, videoPosterUrl: PRIVATE_THUMB });
  assert.strictEqual(calls.length, 0, 'no eager resolveR2MediaUrl on append');
  const img = bubble.querySelector('.ce2-media-thumb');
  const poster = bubble.querySelector('.ce2-media-video-poster');
  assert.strictEqual(img.getAttribute('data-ce2-src'), PRIVATE_THUMB);
  assert.strictEqual(poster.getAttribute('data-ce2-src'), PRIVATE_THUMB);
  assert.ok(!img.src);
  assert.ok(!poster.src);
  assert.ok(bubble.querySelector('.ce2-media-tap--image').classList.contains('is-deferred'));
  assert.strictEqual(
    bubble.querySelector('.ce2-media-tap--image').querySelector('.ce2-media-tap-hint').textContent,
    'Tap to load'
  );
});

test('visible hydrate resolves the thumb locator; off-screen does not', function () {
  const calls = [];
  const document = createDom();
  const sandbox = loadIife('public/communication-v2/ce2-media-view.js', {
    document: document,
    resolveR2MediaUrl: function (url) {
      calls.push(url);
      return Promise.resolve(url + '?sig=1');
    },
    isCe2PrivateMediaLocator: function () {
      return true;
    },
  });
  const media = sandbox.Ce2MediaView;
  const bubble = document.createElement('div');
  media.appendChatImage(bubble, { imageUrl: PRIVATE, imageThumbUrl: PRIVATE_THUMB });
  const btn = bubble.childNodes[0];
  assert.strictEqual(media.hydrateMediaHost(btn, { visible: false }), false);
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(media.hydrateMediaHost(btn, { visible: true, preferTap: true }), false);
  assert.strictEqual(calls.length, 0);
  assert.ok(media.hydrateMediaHost(btn, { visible: true }));
  assert.deepStrictEqual(calls, [PRIVATE_THUMB]);
  assert.ok(!btn.classList.contains('is-deferred'));
  assert.strictEqual(btn.querySelector('.ce2-media-tap-hint').textContent, 'Tap to open');
});

test('reply-jump force hydrates a row even when it would otherwise stay deferred', function () {
  const calls = [];
  const document = createDom();
  const sandbox = loadIife('public/communication-v2/ce2-media-view.js', {
    document: document,
    resolveR2MediaUrl: function (url) {
      calls.push(url);
      return Promise.resolve('signed');
    },
    isCe2PrivateMediaLocator: function () {
      return true;
    },
  });
  const media = sandbox.Ce2MediaView;
  const row = document.createElement('div');
  media.appendChatImage(row, { imageUrl: PRIVATE, imageThumbUrl: PRIVATE_THUMB });
  assert.strictEqual(media.hydrateMessageRow(row, { visible: false }), 0);
  assert.strictEqual(calls.length, 0);
  assert.ok(media.hydrateMessageRow(row, { force: true, visible: true }) >= 1);
  assert.ok(calls.indexOf(PRIVATE_THUMB) >= 0);
});

test('tap-to-open still resolves the full file, not every off-screen thumb', function () {
  const calls = [];
  const document = createDom();
  const sandbox = loadIife('public/communication-v2/ce2-media-view.js', {
    document: document,
    resolveR2MediaUrl: function (url) {
      calls.push(url);
      return Promise.resolve(url);
    },
    isCe2PrivateMediaLocator: function () {
      return true;
    },
  });
  const media = sandbox.Ce2MediaView;
  const bubble = document.createElement('div');
  media.appendChatImage(bubble, { imageUrl: PRIVATE, imageThumbUrl: PRIVATE_THUMB });
  media.activateMediaTap(bubble.childNodes[0]);
  assert.ok(calls.indexOf(PRIVATE) >= 0, 'full locator resolved on tap');
  assert.ok(calls.indexOf(PRIVATE_THUMB) < 0, 'thumb must not resolve just because full was opened');
});

test('board-share and link-preview HTML keep locators on data-ce2-src', function () {
  const share = loadIife('public/communication-v2/ce2-share.js').Ce2Share;
  const links = loadIife('public/communication-v2/ce2-links.js').Ce2Links;
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }
  const board = share.renderBoardShareHtml(
    { boardShare: { boardId: 'b1', postId: 'p1', thumbnailUrl: PRIVATE_THUMB } },
    esc
  );
  assert.ok(board.indexOf('data-ce2-src="' + PRIVATE_THUMB.replace(/"/g, '&quot;') + '"') >= 0);
  assert.ok(!/ce2-board-share-thumb-img"[^>]*\ssrc=/.test(board));
  assert.ok(/ce2-board-share-thumb is-deferred/.test(board));
  const preview = links.renderLinkPreviewHtml('https://sbd.marriageducation.com/learn', esc);
  assert.ok(/data-ce2-src="\/images\//.test(preview));
  const imgTag = preview.match(/<img class="ce2-link-preview-thumb-img"[^>]*>/)[0];
  assert.ok(imgTag.indexOf(' src=') < 0);
});

test('voice attachBubble stores the locator and does not resolve until play', function () {
  const attach = audioSrc.slice(
    audioSrc.indexOf('function attachBubble'),
    audioSrc.indexOf('global.Ce2AudioPlayback')
  );
  assert.ok(attach.indexOf('resolvePlayUrl') < 0, 'attach must not resolve signed URLs');
  assert.ok(attach.indexOf('data-ce2-audio-url') >= 0);
  assert.ok(audioSrc.indexOf('function resolvePlayUrl') >= 0);
  assert.ok(audioSrc.indexOf('return resolvePlayUrl(url).then') >= 0);
});

test('inbox first paint is not serialized behind prefs, presence, or entry params', function () {
  assert.ok(v2Src.indexOf('function paintThreadRowsFromSnap') >= 0);
  assert.ok(v2Src.indexOf('function hydrateThreadPeerNames') >= 0);
  assert.ok(v2Src.indexOf('function schedulePresenceWatches') >= 0);
  assert.ok(v2Src.indexOf('requestRender({ inboxOnly: true })') >= 0);
  assert.ok(v2Src.indexOf('render({ inboxOnly: true })') >= 0);
  assert.ok(v2Src.indexOf('listPaintMode') >= 0);
  assert.ok(v2Src.indexOf('peerLabelFromList') >= 0);
  assert.ok(
    v2Src.indexOf('loadInboxPrefs(user.uid).then(function () {\n          return Promise.all([') < 0,
    'inbox prefs must not block groups/threads first paint'
  );
  assert.ok(v2Src.indexOf('Promise.all([groupsP, threadsP])') >= 0);
  assert.ok(v2Src.indexOf('applyCe2EntryParams(user.uid).catch') >= 0);
  const boot = v2Src.slice(v2Src.indexOf('async function boot(user)'));
  const listsIdx = boot.indexOf('Promise.all([groupsP, threadsP])');
  const entryIdx = boot.indexOf('applyCe2EntryParams(user.uid)');
  assert.ok(listsIdx >= 0 && entryIdx > listsIdx, 'deep-link open must wait for lists, not block them');
  assert.ok(v2Src.indexOf('hydrateThreadPeerNames(uid, otherUids)') >= 0);
  const loadThreadsFn = v2Src.slice(
    v2Src.indexOf('async function loadThreads'),
    v2Src.indexOf('async function loadSavedItems')
  );
  const successPath = loadThreadsFn.slice(loadThreadsFn.indexOf('paintThreadRowsFromSnap'));
  assert.ok(successPath.indexOf('requestRender({ inboxOnly: true })') >= 0);
  assert.ok(
    successPath.indexOf('requestRender({ inboxOnly: true })') <
      successPath.indexOf('hydrateThreadPeerNames')
  );
  assert.ok(successPath.indexOf('await Promise.all') < 0);
});

test('thread media observe/jump hooks stay compatible with incremental paint and migrate UI', function () {
  assert.ok(v2Src.indexOf('tryIncrementalMessageRender') >= 0);
  assert.ok(v2Src.indexOf('function jumpToLatestMessage') >= 0);
  assert.ok(html.indexOf('id="ce2JumpLatest"') >= 0);
  assert.ok(v2Src.indexOf('hydrateMessageRow(row, { force: true, visible: true })') >= 0);
  assert.ok(v2Src.indexOf('afterMessagePanelRender(scroll)') >= 0);
  assert.ok(v2Src.indexOf('appendLegacyMediaNotice') >= 0);
  assert.ok(v2Src.indexOf('ce2-media-migrate') >= 0);
  assert.ok(v2Src.indexOf("aud.preload = 'none'") >= 0);
  assert.ok(v2Src.indexOf("aud.setAttribute('data-ce2-src', playSrc)") >= 0);
  assert.ok(mediaSrc.indexOf('observeMessageMedia') >= 0);
  assert.ok(mediaSrc.indexOf('hydrateMediaHost(entry.target, { visible: true })') >= 0);
  assert.ok(audioSrc.indexOf('play() calls resolveR2MediaUrl when the user taps') >= 0);
});

test('frozen keyboard + delivery markers are untouched', function () {
  assert.ok(html.indexOf('ce2-keyboard-stable-v60') >= 0);
  assert.ok(html.indexOf('ce2-audio-stable-1d') >= 0);
  assert.ok(html.indexOf('ce2-delivery-stable-v90') >= 0);
  assert.ok(css.indexOf('ce2-keyboard-v60') >= 0);
  assert.ok(v2Src.indexOf('function bindCe2VoiceUploadActions') >= 0);
});

test('CSS shows placeholders until deferred thumbs get a src', function () {
  assert.ok(/\.ce2-media-tap\.is-deferred \.ce2-media-ph/.test(css));
  assert.ok(/\.ce2-media-thumb:not\(\[src\]\)/.test(css));
  assert.ok(/\.ce2-board-share-thumb-img:not\(\[src\]\)/.test(css));
  assert.ok(/\.ce2-link-preview-thumb-img:not\(\[src\]\)/.test(css));
  assert.ok(/\.ce2-link-preview-thumb\.is-deferred \.ce2-link-preview-thumb-ph/.test(css));
});

test('cache-bust moved forward for changed CE2 first-paint assets', function () {
  const jsVer = html.match(/communication-v2\.js\?v=(\d+)/);
  const cssVer = html.match(/communication-v2\.css\?v=(\d+)/);
  const mediaVer = html.match(/ce2-media-view\.js\?v=(\d+)/);
  const inboxVer = html.match(/ce2-inbox\.js\?v=(\d+)/);
  const shareVer = html.match(/ce2-share\.js\?v=(\d+)/);
  const linksVer = html.match(/ce2-links\.js\?v=(\d+)/);
  const audioVer = html.match(/ce2-audio-playback\.js\?v=(\d+)/);
  assert.ok(jsVer && Number(jsVer[1]) >= 125);
  assert.ok(cssVer && Number(cssVer[1]) >= 91);
  assert.ok(mediaVer && Number(mediaVer[1]) >= 5);
  assert.ok(inboxVer && Number(inboxVer[1]) >= 3);
  assert.ok(shareVer && Number(shareVer[1]) >= 11);
  assert.ok(linksVer && Number(linksVer[1]) >= 4);
  assert.ok(audioVer && Number(audioVer[1]) >= 4);
  assert.ok(pkg.scripts.validate.indexOf('test-ce2-deferred-media.js') >= 0);
});

test('inbox helper module exports first-paint APIs', function () {
  const inbox = loadIife('public/communication-v2/ce2-inbox.js').Ce2Inbox;
  assert.strictEqual(inbox.VERSION, 3);
  assert.strictEqual(inbox.listPaintMode({ listPending: true, rowCount: 2 }), 'loading');
  assert.strictEqual(inbox.listPaintMode({ listPending: false, rowCount: 2 }), 'rows');
  assert.strictEqual(inbox.peerLabelFromList('xyzxyzxyz', { label: 'Ada' }), 'Ada');
});

if (failed) {
  console.error('\n' + failed + ' test(s) failed\n');
  process.exit(1);
}
console.log('\n✅ CE2 deferred media tests passed\n');
