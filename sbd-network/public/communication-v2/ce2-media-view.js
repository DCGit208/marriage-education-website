/**
 * CE2 — data-light media in chat: placeholders first, signed URLs on demand.
 * Thumbs/posters hydrate when visible (or on tap / reply-jump). Full files stay tap-to-open.
 */
(function (global) {
  'use strict';

  var DEFERRED_HOST_SEL =
    '.ce2-media-tap, .ce2-board-share-thumb, .ce2-link-preview-thumb';
  var DEFERRED_IMG_SEL =
    'img[data-ce2-src]:not([data-ce2-hydrated]), .ce2-media-thumb, .ce2-media-video-poster, .ce2-board-share-thumb-img, .ce2-link-preview-thumb-img';

  function isPrivateLocator(url) {
    return typeof isCe2PrivateMediaLocator === 'function' && isCe2PrivateMediaLocator(url);
  }

  function playableUrl(stored) {
    if (typeof resolveR2MediaUrl === 'function') return resolveR2MediaUrl(stored);
    return Promise.resolve(stored);
  }

  function connectionPrefersTapToLoad(conn) {
    if (!conn && typeof navigator !== 'undefined') {
      conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    }
    if (!conn) return false;
    if (conn.saveData) return true;
    var t = String(conn.effectiveType || '').toLowerCase();
    return t === 'slow-2g' || t === '2g';
  }

  /**
   * When to call resolveR2MediaUrl / assign img src.
   * Off-screen rows never resolve. 2G/save-data waits for tap (or force, e.g. reply-jump).
   */
  function shouldResolveMediaUrl(opts) {
    opts = opts || {};
    if (opts.tapped || opts.force || opts.playing) return true;
    if (!opts.visible) return false;
    if (opts.preferTap === true) return false;
    if (opts.preferTap == null && connectionPrefersTapToLoad(opts.connection)) return false;
    return true;
  }

  function assignMediaSrc(el, stored, onError) {
    if (!el) return;
    if (!isPrivateLocator(stored)) {
      el.src = stored;
      return;
    }
    playableUrl(stored)
      .then(function (src) {
        if (src) el.src = src;
        else if (typeof onError === 'function') onError();
      })
      .catch(function () {
        if (typeof onError === 'function') onError();
      });
  }

  function markDeferredSrc(el, stored) {
    if (!el || !stored) return el;
    el.setAttribute('data-ce2-src', stored);
    el.setAttribute('loading', 'lazy');
    el.setAttribute('decoding', 'async');
    if (el.removeAttribute) el.removeAttribute('src');
    else el.src = '';
    return el;
  }

  function hydrateMediaElement(el, onError) {
    if (!el) return false;
    if (el.getAttribute('data-ce2-hydrated') === '1') return false;
    var stored = el.getAttribute('data-ce2-src');
    if (!stored) return false;
    el.setAttribute('data-ce2-hydrated', '1');
    assignMediaSrc(el, stored, onError);
    return true;
  }

  function makePlaceholder(label) {
    var ph = document.createElement('span');
    ph.className = 'ce2-media-ph';
    ph.setAttribute('aria-hidden', 'true');
    ph.textContent = label || '';
    return ph;
  }

  function appendChatImage(bubble, m) {
    if (!bubble || !m || !m.imageUrl) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ce2-media-tap ce2-media-tap--image is-deferred';
    btn.setAttribute('data-ce2-media', 'image');
    btn.setAttribute('data-full-url', m.imageUrl);
    if (m.imageThumbUrl) btn.setAttribute('data-thumb-url', m.imageThumbUrl);

    btn.appendChild(makePlaceholder(m.imageThumbUrl ? '' : 'Photo'));

    if (m.imageThumbUrl) {
      var img = document.createElement('img');
      img.className = 'ce2-msg-image ce2-media-thumb';
      img.alt = 'Photo';
      img.draggable = false;
      markDeferredSrc(img, m.imageThumbUrl);
      btn.appendChild(img);
    } else {
      btn.classList.add('is-fallback');
    }

    var hint = document.createElement('span');
    hint.className = 'ce2-media-tap-hint';
    hint.textContent = 'Tap to load';
    btn.appendChild(hint);
    bubble.appendChild(btn);
  }

  function appendChatVideo(bubble, m) {
    if (!bubble || !m || !m.videoUrl) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ce2-media-tap ce2-media-tap--video is-deferred';
    btn.setAttribute('data-ce2-media', 'video');
    btn.setAttribute('data-full-url', m.videoUrl);
    if (m.videoPosterUrl) btn.setAttribute('data-poster-url', m.videoPosterUrl);

    btn.appendChild(makePlaceholder('Video'));

    if (m.videoPosterUrl) {
      var poster = document.createElement('img');
      poster.className = 'ce2-media-video-poster';
      poster.alt = '';
      poster.draggable = false;
      markDeferredSrc(poster, m.videoPosterUrl);
      btn.appendChild(poster);
    } else {
      btn.classList.add('is-fallback');
    }

    var play = document.createElement('span');
    play.className = 'ce2-media-play-icon';
    play.setAttribute('aria-hidden', 'true');
    btn.appendChild(play);

    var hint = document.createElement('span');
    hint.className = 'ce2-media-tap-hint';
    hint.textContent = 'Tap to play';
    btn.appendChild(hint);
    bubble.appendChild(btn);
  }

  function setHint(btn, text) {
    var hint = btn && btn.querySelector ? btn.querySelector('.ce2-media-tap-hint') : null;
    if (hint) hint.textContent = text;
  }

  function onThumbHydrateError(host) {
    return function () {
      if (!host || !host.classList) return;
      host.classList.add('is-fallback');
      host.classList.remove('is-deferred');
      if (host.getAttribute('data-ce2-media') === 'image') setHint(host, 'Tap to load');
    };
  }

  function hydrateMediaHost(host, opts) {
    opts = opts || {};
    if (!host) return false;
    if (
      !shouldResolveMediaUrl({
        visible: opts.visible,
        tapped: opts.tapped,
        force: opts.force,
        playing: opts.playing,
        preferTap: opts.preferTap,
        connection: opts.connection,
      })
    ) {
      return false;
    }
    if (host.classList) host.classList.remove('is-deferred');
    var hydrated = false;
    if (host.getAttribute && host.getAttribute('data-ce2-src')) {
      hydrated = hydrateMediaElement(host, opts.onError) || hydrated;
    }
    if (host.querySelectorAll) {
      var imgs = host.querySelectorAll('img[data-ce2-src]');
      var err = opts.onError || onThumbHydrateError(host);
      for (var i = 0; i < imgs.length; i++) {
        hydrated = hydrateMediaElement(imgs[i], err) || hydrated;
      }
    }
    if (host.getAttribute && host.getAttribute('data-ce2-media') === 'image' && host.getAttribute('data-thumb-url')) {
      setHint(host, 'Tap to open');
    }
    return hydrated;
  }

  function hydrateMessageRow(row, opts) {
    if (!row || !row.querySelectorAll) return 0;
    var n = 0;
    var hosts = row.querySelectorAll(DEFERRED_HOST_SEL);
    for (var i = 0; i < hosts.length; i++) {
      if (hydrateMediaHost(hosts[i], opts || { force: true, visible: true })) n += 1;
    }
    return n;
  }

  function activateMediaTap(btn) {
    if (!btn || btn.classList.contains('is-opening') || btn.classList.contains('is-loaded')) return;
    var kind = btn.getAttribute('data-ce2-media');
    var full = btn.getAttribute('data-full-url');
    if (!full) return;

    if (kind === 'image') {
      btn.classList.add('is-opening');
      btn.classList.remove('is-fallback');
      btn.classList.remove('is-deferred');
      setHint(btn, 'Loading');
      var img = document.createElement('img');
      img.className = 'ce2-msg-image ce2-media-full';
      img.alt = 'Photo';
      img.decoding = 'async';
      img.addEventListener('error', function () {
        btn.classList.remove('is-opening');
        btn.classList.add('is-fallback');
        setHint(btn, 'Tap to retry');
      });
      img.addEventListener('load', function () {
        btn.classList.add('is-loaded');
        btn.replaceWith(img);
      });
      assignMediaSrc(img, full, function () {
        btn.classList.remove('is-opening');
        btn.classList.add('is-fallback');
        setHint(btn, 'Tap to retry');
      });
      return;
    }

    if (kind === 'video') {
      btn.classList.add('is-opening');
      btn.classList.remove('is-deferred');
      setHint(btn, 'Loading');
      var poster = btn.getAttribute('data-poster-url') || '';
      playableUrl(full)
        .then(function (src) {
          return Promise.all([
            src,
            poster && isPrivateLocator(poster) ? playableUrl(poster) : Promise.resolve(poster),
          ]);
        })
        .then(function (pair) {
          var src = pair[0];
          var posterSrc = pair[1];
          btn.classList.remove('is-opening');
          btn.classList.add('is-loaded');
          var wrap = document.createElement('div');
          wrap.className = 'ce2-msg-video-wrap is-playing';
          var vid = document.createElement('video');
          vid.className = 'ce2-msg-video';
          vid.controls = true;
          vid.preload = 'auto';
          vid.playsInline = true;
          vid.setAttribute('playsinline', '');
          if (posterSrc) vid.poster = posterSrc;
          vid.src = src;
          wrap.appendChild(vid);
          btn.replaceWith(wrap);
          vid.play().catch(function () {});
        })
        .catch(function () {
          btn.classList.remove('is-opening');
          btn.classList.add('is-fallback');
          setHint(btn, 'Tap to retry');
        });
    }
  }

  function markBrokenMedia(img) {
    if (!img || !img.classList) return;
    img.classList.add('is-broken');
    var frame =
      img.closest && img.closest('.ce2-board-share-thumb, .ce2-media-tap, .ce2-link-preview-thumb');
    if (frame && frame.classList) {
      frame.classList.add('is-fallback');
      frame.classList.remove('is-deferred');
    }
  }

  function bindBrokenMedia(root) {
    if (!root || !root.querySelectorAll) return;
    root
      .querySelectorAll(
        '.ce2-board-share-thumb-img:not([data-ce2-err]), .ce2-media-thumb:not([data-ce2-err]), .ce2-media-video-poster:not([data-ce2-err]), .ce2-media-full:not([data-ce2-err]), .ce2-link-preview-thumb-img:not([data-ce2-err])'
      )
      .forEach(function (img) {
        img.setAttribute('data-ce2-err', '1');
        img.addEventListener('error', function () {
          markBrokenMedia(img);
        });
        if (img.complete && img.naturalWidth === 0 && (img.currentSrc || img.src)) {
          markBrokenMedia(img);
        }
      });
  }

  function onMessageScrollClick(e) {
    if (e.target.closest('a, button:not(.ce2-media-tap):not(.ce2-board-share-thumb):not(.ce2-link-preview-thumb), audio, video')) {
      return;
    }
    var btn = e.target.closest('.ce2-media-tap');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    activateMediaTap(btn);
  }

  function observeMessageMedia(scroll) {
    if (!scroll) return;
    var nodes = scroll.querySelectorAll(
      '.ce2-media-tap:not([data-ce2-io]), .ce2-board-share-thumb:not([data-ce2-io]), .ce2-link-preview-thumb:not([data-ce2-io])'
    );
    if (!nodes.length) return;
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }
    if (!scroll.__ce2MediaIo) {
      scroll.__ce2MediaIo = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            hydrateMediaHost(entry.target, { visible: true });
            if (scroll.__ce2MediaIo) scroll.__ce2MediaIo.unobserve(entry.target);
          });
        },
        { root: scroll, rootMargin: '80px', threshold: 0.01 }
      );
    }
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].setAttribute('data-ce2-io', '1');
      scroll.__ce2MediaIo.observe(nodes[i]);
    }
  }

  function wireMessageScroll(scroll) {
    if (!scroll || scroll.__ce2MediaClickWired) return;
    scroll.__ce2MediaClickWired = true;
    scroll.addEventListener('click', onMessageScrollClick, true);
  }

  function afterMessagePanelRender(scroll) {
    wireMessageScroll(scroll);
    observeMessageMedia(scroll);
    bindBrokenMedia(scroll);
  }

  global.Ce2MediaView = {
    appendChatImage: appendChatImage,
    appendChatVideo: appendChatVideo,
    afterMessagePanelRender: afterMessagePanelRender,
    activateMediaTap: activateMediaTap,
    bindBrokenMedia: bindBrokenMedia,
    shouldResolveMediaUrl: shouldResolveMediaUrl,
    connectionPrefersTapToLoad: connectionPrefersTapToLoad,
    markDeferredSrc: markDeferredSrc,
    hydrateMediaElement: hydrateMediaElement,
    hydrateMediaHost: hydrateMediaHost,
    hydrateMessageRow: hydrateMessageRow,
    assignMediaSrc: assignMediaSrc,
    DEFERRED_HOST_SEL: DEFERRED_HOST_SEL,
    DEFERRED_IMG_SEL: DEFERRED_IMG_SEL,
    VERSION: 5,
  };
})(typeof window !== 'undefined' ? window : globalThis);
