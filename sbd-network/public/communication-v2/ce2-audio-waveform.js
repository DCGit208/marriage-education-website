/**
 * CE2 Audio Phase 1D — live + static waveforms (fixed height, throttled paint).
 */
(function (global) {
  'use strict';

  var PEAK_COUNT = 64;
  var LIVE_BAR_COUNT = 32;
  var PAINT_INTERVAL_MS = 66;

  function downsamplePeaks(samples, targetCount) {
    targetCount = targetCount || PEAK_COUNT;
    if (!samples || !samples.length) {
      var empty = [];
      for (var z = 0; z < targetCount; z++) empty.push(0);
      return empty;
    }
    var out = [];
    var bucket = samples.length / targetCount;
    for (var i = 0; i < targetCount; i++) {
      var start = Math.floor(i * bucket);
      var end = Math.max(start + 1, Math.floor((i + 1) * bucket));
      var max = 0;
      for (var j = start; j < end && j < samples.length; j++) {
        if (samples[j] > max) max = samples[j];
      }
      out.push(Math.min(255, Math.round(max)));
    }
    return out;
  }

  function normalizePeaks(peaks) {
    if (!peaks || !peaks.length) return downsamplePeaks([], PEAK_COUNT);
    if (peaks.length === PEAK_COUNT) return peaks.slice();
    return downsamplePeaks(peaks, PEAK_COUNT);
  }

  function renderStatic(parent, peaks, opts) {
    if (!parent) return null;
    opts = opts || {};
    var normalized = normalizePeaks(peaks);
    var maxVal = 1;
    normalized.forEach(function (v) {
      if (v > maxVal) maxVal = v;
    });

    var wrap = document.createElement('div');
    wrap.className = 'ce2-voice-wave-static';
    wrap.setAttribute('aria-hidden', 'true');
    var bars = document.createElement('div');
    bars.className = 'ce2-voice-wave-bars';

    normalized.forEach(function (v) {
      var bar = document.createElement('span');
      bar.className = 'ce2-voice-wave-bar';
      var pct = Math.max(8, Math.round((v / maxVal) * 100));
      bar.style.height = pct + '%';
      bars.appendChild(bar);
    });

    wrap.appendChild(bars);
    parent.appendChild(wrap);
    return wrap;
  }

  function paintLiveCanvas(canvas, levels) {
    if (!canvas || !levels.length) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    var barW = Math.max(2, Math.floor(w / LIVE_BAR_COUNT) - 1);
    var gap = 1;
    var count = Math.min(LIVE_BAR_COUNT, levels.length);
    var start = levels.length - count;
    for (var i = 0; i < count; i++) {
      var level = levels[start + i] || 0;
      var bh = Math.max(2, Math.round((level / 255) * (h - 2)));
      var x = i * (barW + gap);
      var y = h - bh;
      ctx.fillStyle = 'rgba(201, 184, 146, 0.85)';
      ctx.fillRect(x, y, barW, bh);
    }
  }

  function createLiveAnalyser(stream) {
    var audioCtx = null;
    var analyser = null;
    var source = null;
    var peakSamples = [];
    var liveLevels = [];
    var running = false;

    function start() {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC || !stream) return false;
      try {
        audioCtx = new AC();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.6;
        source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        peakSamples = [];
        liveLevels = [];
        running = true;
        return true;
      } catch (_) {
        return false;
      }
    }

    function tick() {
      if (!analyser || !running) return 0;
      var data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      var sum = 0;
      for (var i = 0; i < data.length; i++) {
        var v = (data[i] - 128) / 128;
        sum += v * v;
      }
      var rms = Math.sqrt(sum / data.length);
      var level = Math.min(255, Math.round(rms * 420));
      peakSamples.push(level);
      liveLevels.push(level);
      if (liveLevels.length > LIVE_BAR_COUNT) {
        liveLevels.shift();
      }
      return level;
    }

    function stop() {
      running = false;
      try {
        if (source) source.disconnect();
      } catch (_) {}
      if (audioCtx && audioCtx.close) {
        audioCtx.close().catch(function () {});
      }
      audioCtx = null;
      analyser = null;
      source = null;
      return downsamplePeaks(peakSamples, PEAK_COUNT);
    }

    return {
      start: start,
      tick: tick,
      stop: stop,
      getLiveLevels: function () {
        return liveLevels.slice();
      },
    };
  }

  function startLivePaint(canvas, getAnalyser) {
    var lastPaint = 0;
    var rafId = 0;

    function frame(ts) {
      rafId = 0;
      if (!getAnalyser()) return;
      if (ts - lastPaint >= PAINT_INTERVAL_MS) {
        lastPaint = ts;
        var a = getAnalyser();
        a.tick();
        paintLiveCanvas(canvas, a.getLiveLevels());
      }
      rafId = global.requestAnimationFrame(frame);
    }

    rafId = global.requestAnimationFrame(frame);

    return function stopPaint() {
      if (rafId) {
        global.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };
  }

  global.Ce2AudioWaveform = {
    PEAK_COUNT: PEAK_COUNT,
    LIVE_BAR_COUNT: LIVE_BAR_COUNT,
    downsamplePeaks: downsamplePeaks,
    normalizePeaks: normalizePeaks,
    renderStatic: renderStatic,
    createLiveAnalyser: createLiveAnalyser,
    startLivePaint: startLivePaint,
    paintLiveCanvas: paintLiveCanvas,
    VERSION: 1,
  };
})(typeof window !== 'undefined' ? window : global);
