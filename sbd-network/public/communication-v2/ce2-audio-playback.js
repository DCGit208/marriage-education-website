/**
 * CE2 Audio Phase 1C — single global voice playback (one at a time).
 */
(function (global) {
  'use strict';

  var audio = null;
  var activeId = null;
  var activeUrl = null;
  var tickCbs = [];
  var positionMap = Object.create(null);
  var durationMap = Object.create(null);
  var rafId = 0;

  function ensureAudio() {
    if (!audio) {
      audio = new Audio();
      audio.preload = 'metadata';
      audio.setAttribute('playsinline', '');
      audio.addEventListener('timeupdate', scheduleSync);
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('loadedmetadata', scheduleSync);
      audio.addEventListener('pause', scheduleSync);
      audio.addEventListener('play', scheduleSync);
      audio.addEventListener('error', onAudioError);
    }
    return audio;
  }

  function formatTime(sec) {
    var s = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function guessMime(url, mime) {
    if (mime) return mime;
    if (!url) return '';
    var raw = String(url);
    try {
      var parsed = new URL(raw, 'https://sbd-upload-signer.sbdnetwork.workers.dev');
      var key = parsed.searchParams.get('key');
      if (key) raw = key;
    } catch (_) {}
    var u = raw.split('?')[0].toLowerCase();
    if (u.indexOf('.m4a') >= 0 || u.indexOf('.mp4') >= 0) return 'audio/mp4';
    if (u.indexOf('.webm') >= 0) return 'audio/webm';
    if (u.indexOf('.ogg') >= 0) return 'audio/ogg';
    if (u.indexOf('.mp3') >= 0) return 'audio/mpeg';
    if (u.indexOf('blob:') === 0) return 'audio/webm';
    return 'audio/mp4';
  }

  function isFormatSupported(url, mime) {
    var probe = document.createElement('audio');
    var types = [guessMime(url, mime), 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mpeg'];
    var seen = Object.create(null);
    for (var i = 0; i < types.length; i++) {
      var t = types[i];
      if (!t || seen[t]) continue;
      seen[t] = true;
      var r = probe.canPlayType(t);
      if (r === 'probably' || r === 'maybe') return true;
    }
    return false;
  }

  function getDuration(messageId, fallbackMs) {
    if (activeId === messageId && audio && isFinite(audio.duration) && audio.duration > 0) {
      return audio.duration;
    }
    if (durationMap[messageId]) return durationMap[messageId];
    if (fallbackMs) return fallbackMs / 1000;
    return 0;
  }

  function scheduleSync() {
    if (rafId) return;
    rafId = global.requestAnimationFrame(function () {
      rafId = 0;
      syncAll();
      notifyTick();
    });
  }

  function notifyTick() {
    var payload = {
      messageId: activeId,
      current: audio && activeId ? audio.currentTime : 0,
      duration: audio && activeId ? audio.duration || 0 : 0,
      playing: !!(audio && activeId && !audio.paused),
    };
    tickCbs.forEach(function (cb) {
      try {
        cb(payload);
      } catch (_) {}
    });
  }

  function onEnded() {
    if (activeId) {
      positionMap[activeId] = 0;
    }
    scheduleSync();
  }

  function onAudioError() {
    scheduleSync();
  }

  function updatePlayerEl(player) {
    if (!player) return;
    var messageId = player.getAttribute('data-ce2-audio-id');
    var fallbackMs = parseInt(player.getAttribute('data-duration-ms') || '0', 10) || 0;
    var timeEl = player.querySelector('.ce2-voice-player-time');
    var bar = player.querySelector('.ce2-voice-player-bar');
    var seek = player.querySelector('.ce2-voice-player-seek');
    var icon = player.querySelector('.ce2-voice-play-icon');
    var isActive = messageId && messageId === activeId;
    var playing = isActive && audio && !audio.paused;
    var duration = getDuration(messageId, fallbackMs);
    var current = isActive && audio ? audio.currentTime : positionMap[messageId] || 0;

    if (isActive && audio && isFinite(audio.duration) && audio.duration > 0) {
      durationMap[messageId] = audio.duration;
      duration = audio.duration;
    }

    player.classList.toggle('is-playing', playing);
    player.classList.toggle('is-active', isActive);
    player.classList.toggle('is-paused', isActive && audio && audio.paused);

    if (icon) icon.textContent = playing ? '⏸' : '▶';
    if (timeEl) {
      timeEl.textContent =
        formatTime(current) + (duration > 0 ? ' / ' + formatTime(duration) : '');
    }
    var pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
    if (bar) bar.style.width = pct + '%';
    if (seek) seek.value = String(Math.round(pct * 10));
    if (seek) {
      seek.setAttribute('aria-valuenow', String(Math.round(pct)));
      seek.disabled = !duration;
    }
    var prog = player.querySelector('.ce2-voice-player-progress');
    if (prog) prog.setAttribute('aria-valuenow', String(Math.round(pct)));
  }

  function syncAll() {
    var nodes = document.querySelectorAll('.ce2-voice-player[data-ce2-audio-id]');
    for (var i = 0; i < nodes.length; i++) {
      updatePlayerEl(nodes[i]);
    }
  }

  function resolvePlayUrl(url) {
    if (typeof resolveR2MediaUrl === 'function') return resolveR2MediaUrl(url);
    return Promise.resolve(url);
  }

  function play(messageId, url, opts) {
    opts = opts || {};
    if (!messageId || !url) return Promise.resolve();
    if (!isFormatSupported(url, opts.mime)) {
      return Promise.reject(new Error('This device cannot play this voice format.'));
    }

    return resolvePlayUrl(url).then(function (playUrl) {
      if (!playUrl) {
        throw new Error('Could not load voice note.');
      }
      var a = ensureAudio();

      if (activeId && activeId !== messageId && !a.paused) {
        positionMap[activeId] = a.currentTime;
      }

      var sameTrack = activeId === messageId && activeUrl === playUrl;
      if (!sameTrack) {
        a.pause();
        activeId = messageId;
        activeUrl = playUrl;
        a.src = playUrl;
        var resumeAt = positionMap[messageId];
        if (typeof resumeAt === 'number' && resumeAt > 0) {
          a.currentTime = resumeAt;
        }
      }

      return a.play().then(function () {
        scheduleSync();
      });
    });
  }

  function pause() {
    if (!audio || !activeId) return;
    positionMap[activeId] = audio.currentTime;
    audio.pause();
    scheduleSync();
  }

  function stop() {
    if (audio) {
      if (activeId) {
        positionMap[activeId] = 0;
      }
      audio.pause();
      try {
        audio.removeAttribute('src');
        audio.load();
      } catch (_) {}
    }
    activeId = null;
    activeUrl = null;
    scheduleSync();
  }

  function toggle(messageId, url, opts) {
    if (activeId === messageId && audio && !audio.paused) {
      pause();
      return Promise.resolve();
    }
    return play(messageId, url, opts);
  }

  function seek(messageId, ratio) {
    var r = Math.max(0, Math.min(1, ratio || 0));
    var player = document.querySelector(
      '.ce2-voice-player[data-ce2-audio-id="' + messageId + '"]'
    );
    var fallbackMs = player
      ? parseInt(player.getAttribute('data-duration-ms') || '0', 10)
      : 0;
    var dur = getDuration(messageId, fallbackMs);
    if (!dur) return;
    var t = r * dur;
    positionMap[messageId] = t;
    if (activeId === messageId && audio) {
      audio.currentTime = t;
    }
    scheduleSync();
  }

  function attachBubble(parent, meta) {
    meta = meta || {};
    var messageId = meta.id || meta.messageId;
    var url = meta.url;
    if (!parent || !messageId || !url) return null;

    if (!isFormatSupported(url, meta.mime)) {
      var err = document.createElement('p');
      err.className = 'ce2-voice-unsupported';
      err.textContent = 'This device cannot play this voice format.';
      parent.appendChild(err);
      return err;
    }

    var player = document.createElement('div');
    player.className = 'ce2-voice-player';
    player.setAttribute('data-ce2-audio-id', messageId);
    player.setAttribute('data-ce2-audio-url', url);
    if (meta.durationMs) {
      player.setAttribute('data-duration-ms', String(meta.durationMs));
    }

    player.innerHTML =
      '<button type="button" class="ce2-voice-play-btn" aria-label="Play voice message">' +
      '<span class="ce2-voice-play-icon" aria-hidden="true">▶</span></button>' +
      '<div class="ce2-voice-player-body">' +
      '<div class="ce2-voice-player-wave" aria-hidden="true"></div>' +
      '<div class="ce2-voice-player-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
      '<span class="ce2-voice-player-bar"></span></div>' +
      '<input type="range" class="ce2-voice-player-seek" min="0" max="1000" value="0" step="1" aria-label="Seek voice message">' +
      '</div>' +
      '<span class="ce2-voice-player-time">0:00</span>';

    var waveHost = player.querySelector('.ce2-voice-player-wave');
    if (waveHost && meta.peaks && meta.peaks.length && global.Ce2AudioWaveform) {
      global.Ce2AudioWaveform.renderStatic(waveHost, meta.peaks);
    }

    var playBtn = player.querySelector('.ce2-voice-play-btn');
    var seekInput = player.querySelector('.ce2-voice-player-seek');

    playBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggle(messageId, url, { mime: meta.mime }).catch(function () {
        scheduleSync();
      });
    });

    seekInput.addEventListener('input', function () {
      var ratio = parseInt(seekInput.value, 10) / 1000;
      seek(messageId, ratio);
    });

    parent.appendChild(player);
    updatePlayerEl(player);
    return player;
  }

  global.Ce2AudioPlayback = {
    play: play,
    pause: pause,
    stop: stop,
    toggle: toggle,
    seek: seek,
    getActiveId: function () {
      return activeId;
    },
    getProgress: function () {
      return {
        current: audio && activeId ? audio.currentTime : 0,
        duration: audio && activeId ? audio.duration || 0 : 0,
      };
    },
    onTick: function (cb) {
      if (typeof cb !== 'function') return function () {};
      tickCbs.push(cb);
      return function () {
        tickCbs = tickCbs.filter(function (x) {
          return x !== cb;
        });
      };
    },
    attachBubble: attachBubble,
    syncAll: syncAll,
    isFormatSupported: isFormatSupported,
    destroy: function () {
      stop();
      tickCbs = [];
      if (rafId) {
        global.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
    VERSION: 3,
  };
})(typeof window !== 'undefined' ? window : global);
