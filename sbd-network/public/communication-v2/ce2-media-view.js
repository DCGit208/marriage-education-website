/**
 * CE2 — data-light media in chat: thumbnails in thread, full file only on tap.
 */
(function (global) {
  'use strict';

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
    btn.className = 'ce2-media-tap ce2-media-tap--image';
    btn.setAttribute('data-ce2-media', 'image');
    btn.setAttribute('data-full-url', m.imageUrl);
    if (m.imageThumbUrl) btn.setAttribute('data-thumb-url', m.imageThumbUrl);

    btn.appendChild(makePlaceholder(m.imageThumbUrl ? '' : 'Photo'));

    if (m.imageThumbUrl) {
      var img = document.createElement('img');
      img.className = 'ce2-msg-image ce2-media-thumb';
      img.alt = 'Photo';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.draggable = false;
      img.src = m.imageThumbUrl;
      btn.appendChild(img);
    } else {
      btn.classList.add('is-fallback');
    }

    var hint = document.createElement('span');
    hint.className = 'ce2-media-tap-hint';
    hint.textContent = m.imageThumbUrl ? 'Tap to open' : 'Tap to load';
    btn.appendChild(hint);
    bubble.appendChild(btn);
  }

  function appendChatVideo(bubble, m) {
    if (!bubble || !m || !m.videoUrl) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ce2-media-tap ce2-media-tap--video';
    btn.setAttribute('data-ce2-media', 'video');
    btn.setAttribute('data-full-url', m.videoUrl);
    if (m.videoPosterUrl) btn.setAttribute('data-poster-url', m.videoPosterUrl);

    btn.appendChild(makePlaceholder('Video'));

    if (m.videoPosterUrl) {
      var poster = document.createElement('img');
      poster.className = 'ce2-media-video-poster';
      poster.alt = '';
      poster.loading = 'lazy';
      poster.decoding = 'async';
      poster.draggable = false;
      poster.src = m.videoPosterUrl;
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

  function activateMediaTap(btn) {
    if (!btn || btn.classList.contains('is-opening') || btn.classList.contains('is-loaded')) return;
    var kind = btn.getAttribute('data-ce2-media');
    var full = btn.getAttribute('data-full-url');
    if (!full) return;

    if (kind === 'image') {
      btn.classList.add('is-opening');
      btn.classList.remove('is-fallback');
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
      img.src = full;
      return;
    }

    if (kind === 'video') {
      btn.classList.add('is-loaded');
      var poster = btn.getAttribute('data-poster-url') || '';
      var wrap = document.createElement('div');
      wrap.className = 'ce2-msg-video-wrap is-playing';
      var vid = document.createElement('video');
      vid.className = 'ce2-msg-video';
      vid.controls = true;
      vid.preload = 'auto';
      vid.playsInline = true;
      vid.setAttribute('playsinline', '');
      if (poster) vid.poster = poster;
      vid.src = full;
      wrap.appendChild(vid);
      btn.replaceWith(wrap);
      vid.play().catch(function () {});
    }
  }

  function markBrokenMedia(img) {
    if (!img || !img.classList) return;
    img.classList.add('is-broken');
    var frame =
      img.closest && img.closest('.ce2-board-share-thumb, .ce2-media-tap');
    if (frame && frame.classList) frame.classList.add('is-fallback');
  }

  function bindBrokenMedia(root) {
    if (!root || !root.querySelectorAll) return;
    root
      .querySelectorAll(
        '.ce2-board-share-thumb-img:not([data-ce2-err]), .ce2-media-thumb:not([data-ce2-err]), .ce2-media-video-poster:not([data-ce2-err]), .ce2-media-full:not([data-ce2-err])'
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
    if (e.target.closest('a, button:not(.ce2-media-tap):not(.ce2-board-share-thumb), audio, video')) return;
    var btn = e.target.closest('.ce2-media-tap');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    activateMediaTap(btn);
  }

  function observeMessageMedia(scroll) {
    if (!scroll || typeof IntersectionObserver === 'undefined') return;
    if (!scroll.__ce2MediaIo) {
      scroll.__ce2MediaIo = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            scroll.__ce2MediaIo.unobserve(entry.target);
          });
        },
        { root: scroll, rootMargin: '80px', threshold: 0.01 }
      );
    }
    scroll.querySelectorAll('.ce2-media-tap:not([data-ce2-io])').forEach(function (node) {
      node.setAttribute('data-ce2-io', '1');
      scroll.__ce2MediaIo.observe(node);
    });
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
    VERSION: 3,
  };
})(typeof window !== 'undefined' ? window : globalThis);
