/**
 * SBD Life — audio essay player (file MP3 or zero-cost browser narration).
 */
(function (global) {
  var PROGRESS_KEY = 'sbdLifeAudioProgress';

  function loadProgress(articleId) {
    try {
      var raw = localStorage.getItem(PROGRESS_KEY);
      var map = raw ? JSON.parse(raw) : {};
      return map[articleId] || 0;
    } catch (e) {
      return 0;
    }
  }

  function saveProgress(articleId, seconds) {
    try {
      var raw = localStorage.getItem(PROGRESS_KEY);
      var map = raw ? JSON.parse(raw) : {};
      map[articleId] = seconds;
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  async function loadAudio(articleId) {
    var snap = await firebase.firestore().collection('sbdLifeAudio').doc(articleId).get();
    if (!snap.exists) return null;
    return snap.data();
  }

  function mountFilePlayer(container, articleId, data) {
    var saved = loadProgress(articleId);
    container.innerHTML =
      '<section class="life-audio">' +
      '<h2 class="life-body-heading">Audio essay</h2>' +
      '<p class="life-reflections-note">Narrated by ' +
      esc(data.narrator || 'SBD Life') +
      (data.duration ? ' · ' + Math.round(data.duration / 60) + ' min' : '') +
      ' · Hosted audio file</p>' +
      '<audio id="lifeAudioPlayer" class="life-audio-player" controls preload="metadata" src="' +
      esc(data.audioUrl) +
      '"></audio>' +
      '<div class="life-audio-progress"><div id="lifeAudioBar" class="life-audio-bar"></div></div>' +
      (data.transcript
        ? '<details class="life-audio-transcript"><summary>Transcript</summary><p>' +
          esc(data.transcript) +
          '</p></details>'
        : '') +
      '</section>';

    var audio = container.querySelector('#lifeAudioPlayer');
    var bar = container.querySelector('#lifeAudioBar');
    if (!audio) return;

    audio.addEventListener('loadedmetadata', function () {
      if (saved > 0 && saved < audio.duration) {
        audio.currentTime = saved;
      }
    });

    audio.addEventListener('timeupdate', function () {
      if (!audio.duration) return;
      var pct = (audio.currentTime / audio.duration) * 100;
      if (bar) bar.style.width = pct + '%';
      if (Math.floor(audio.currentTime) % 5 === 0) {
        saveProgress(articleId, audio.currentTime);
      }
    });
  }

  async function mount(container, articleId, articleData) {
    if (!container) return;
    container.innerHTML = '<p class="life-loading">Loading audio…</p>';
    var data = null;
    try {
      data = await loadAudio(articleId);
    } catch (err) {
      console.warn('[SBD Life Audio] load skipped:', err.message || err.code);
      container.innerHTML = '';
      return;
    }
    if (!data) {
      container.innerHTML = '';
      return;
    }

    if (data.narrationMode === 'browser' && global.SbdLifeTts) {
      global.SbdLifeTts.mountBrowserPlayer(container, articleId, data, articleData);
      return;
    }

    if (data.audioUrl) {
      mountFilePlayer(container, articleId, data);
      return;
    }

    container.innerHTML = '';
  }

  global.SbdLifeAudio = { mount: mount, loadAudio: loadAudio };
})(window);
