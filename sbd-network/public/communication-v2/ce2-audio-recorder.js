/**
 * CE2 Phase 1A–1D — voice recorder (PTT, slide-to-cancel, waveform, optional lock).
 * Does not touch keyboard / viewport (v60 frozen).
 */
(function (global) {
  'use strict';

  var TIMESLICE_MS = 250;
  var MIN_DURATION_MS = 500;
  var MAX_DURATION_MS = 5 * 60 * 1000;
  var CANCEL_SLIDE_PX = 52;
  var LOCK_SLIDE_PX = 56;

  var deps = {};
  var session = null;
  var timerId = null;
  var bound = false;
  var stopPaintFn = null;

  /** On for all users (validated iPhone PWA May 2026). Opt-out: localStorage ce2_lock_record=0 */
  var LOCK_TO_RECORD = true;

  function el(id) {
    return document.getElementById(id);
  }

  function state() {
    return deps.getState ? deps.getState() : null;
  }

  function requestRender(opts) {
    if (deps.requestRender) deps.requestRender(opts || { threadOnly: true });
  }

  function isCoarseTouch() {
    try {
      if (global.matchMedia && global.matchMedia('(pointer: coarse)').matches) return true;
    } catch (_) {}
    return 'ontouchstart' in global;
  }

  function isLockEnabled() {
    try {
      if (global.localStorage && global.localStorage.getItem('ce2_lock_record') === '0') {
        return false;
      }
    } catch (_) {}
    if (LOCK_TO_RECORD) return true;
    try {
      return global.localStorage && global.localStorage.getItem('ce2_lock_record') === '1';
    } catch (_) {
      return false;
    }
  }

  function setRecordingUi(active, cancelArmed, locked) {
    var st = state();
    if (st) {
      st.voiceRecording = !!active;
      st.voiceRecordingCancel = !!cancelArmed;
      st.voiceRecordingLocked = !!locked;
    }
    var bar = el('ce2VoiceRecordBar');
    var timerNode = el('ce2VoiceRecordTimer');
    var hintNode = el('ce2VoiceRecordHint');
    var stopBtn = el('ce2VoiceRecordStop');
    var waveCanvas = el('ce2VoiceRecordWave');
    if (bar) {
      bar.hidden = !active;
      bar.classList.toggle('ce2-voice-record-bar--cancel', !!cancelArmed);
      bar.classList.toggle('ce2-voice-record-bar--locked', !!locked);
    }
    if (timerNode && session) {
      timerNode.textContent = formatDuration(session.durationMs || 0);
    }
    if (hintNode) {
      if (!active) {
        hintNode.textContent = isCoarseTouch()
          ? 'Tap mic to record · tap Stop to send'
          : isLockEnabled()
            ? 'Slide left to cancel · slide up to lock'
            : 'Slide left to cancel';
      } else if (locked) {
        hintNode.textContent = 'Recording locked — tap Stop to send';
      } else if (cancelArmed) {
        hintNode.textContent = 'Release to cancel';
      } else {
        hintNode.textContent = isLockEnabled()
          ? 'Release to send · slide up to lock'
          : 'Release to send';
      }
    }
    if (stopBtn) stopBtn.hidden = !locked;
    if (waveCanvas) waveCanvas.hidden = !active;
    var voiceBtn = el('ce2VoiceBtn');
    if (voiceBtn) {
      voiceBtn.classList.toggle('is-recording', !!active);
      voiceBtn.classList.toggle('is-cancel-armed', !!cancelArmed);
      voiceBtn.classList.toggle('is-locked', !!locked);
    }
    requestRender();
  }

  function formatDuration(ms) {
    var totalSec = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(totalSec / 60);
    var s = totalSec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function containerMime(mime) {
    var t = String(mime || '')
      .toLowerCase()
      .split(';')[0]
      .trim();
    if (t.indexOf('audio/') === 0) return t;
    if (t.indexOf('video/webm') === 0) return 'audio/webm';
    if (t.indexOf('mp4') >= 0 || t.indexOf('m4a') >= 0) return 'audio/mp4';
    return t || 'audio/webm';
  }

  function pickMime() {
    if (typeof MediaRecorder === 'undefined') return '';
    if (!MediaRecorder.isTypeSupported) return '';
    var apple = isAppleCapture();
    var candidates = apple
      ? ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/webm']
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    for (var i = 0; i < candidates.length; i++) {
      try {
        if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
      } catch (_) {}
    }
    return '';
  }

  function isAppleCapture() {
    try {
      var nav = global.navigator || {};
      var ua = String(nav.userAgent || '');
      if (/iP(ad|hone|od)/i.test(ua)) return true;
      if (/Macintosh/i.test(ua) && nav.maxTouchPoints > 1) return true;
      if (/Safari/i.test(ua) && !/Chrome|Chromium|Android|Edg|OPR|Firefox/i.test(ua)) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  function microphoneErrorMessage(err) {
    var name = (err && err.name) || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'Microphone access was blocked. Allow the mic for this site and try again.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No microphone was found on this device.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'The microphone is in use by another app. Close it and try again.';
    }
    if (name === 'SecurityError') {
      return 'Voice notes need a secure (HTTPS) connection.';
    }
    if (name === 'NotSupportedError') {
      return 'Voice notes are not supported in this browser.';
    }
    return (err && err.message) || 'Voice recording failed.';
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function stopLivePaint() {
    if (stopPaintFn) {
      stopPaintFn();
      stopPaintFn = null;
    }
    var canvas = el('ce2VoiceRecordWave');
    if (canvas && global.Ce2AudioWaveform) {
      var ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function cleanupStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach(function (t) {
      try {
        t.stop();
      } catch (_) {}
    });
  }

  function resetSession() {
    stopTimer();
    stopLivePaint();
    session = null;
    setRecordingUi(false, false, false);
  }

  function canStart() {
    var st = state();
    if (!st || st.voiceRecording || session) return false;
    var ac = st.activeConversation;
    return !!(ac && !ac.needsJoin);
  }

  function whyCantStart() {
    var st = state();
    if (!st) return 'Messages are still loading.';
    if (st.voiceRecording || session) return null;
    var ac = st.activeConversation;
    if (!ac) return 'Open a conversation before recording a voice message.';
    if (ac.needsJoin) return 'Join this conversation before recording a voice message.';
    return null;
  }

  function surfaceHint(message) {
    if (!message) return;
    if (deps.onHint) deps.onHint(message);
    else if (deps.onError) deps.onError(new Error(message));
  }

  function isPrimaryPress(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return false;
    return true;
  }

  function finishStop(shouldSend) {
    if (!session || session.finalized) return;
    session.finalized = true;
    session.shouldSend = !!shouldSend && !session.cancelArmed;

    if (!session.recorder) {
      session.pendingCancel = true;
      cleanupStream(session.stream);
      session.stream = null;
      resetSession();
      return;
    }

    var rec = session.recorder;
    if (rec && rec.state !== 'inactive') {
      try {
        if (typeof rec.requestData === 'function') rec.requestData();
      } catch (_) {}
      try {
        rec.stop();
      } catch (_) {
        finalizeBlob();
      }
    } else {
      finalizeBlob();
    }
  }

  function finalizeBlob() {
    var s = session;
    if (!s || s.uploadDispatched) {
      resetSession();
      return;
    }

    stopTimer();
    stopLivePaint();

    var peaks = [];
    if (s.waveform) {
      try {
        peaks = s.waveform.stop();
      } catch (_) {}
      s.waveform = null;
    }

    cleanupStream(s.stream);
    s.recorder = null;
    s.stream = null;

    var durationMs = Date.now() - s.startedAt;
    var send = s.shouldSend && !s.cancelArmed && durationMs >= MIN_DURATION_MS;

    if (!send || !s.chunks.length) {
      if (s.shouldSend && durationMs < MIN_DURATION_MS) {
        surfaceHint('Hold the mic button while you speak, then release to send.');
      }
      resetSession();
      return;
    }

    s.uploadDispatched = true;
    var mime = containerMime(s.mime || 'audio/webm');
    var blob = new Blob(s.chunks, { type: mime });
    s.chunks = [];
    if (!blob.size) {
      surfaceHint('Recording was empty. Try again.');
      resetSession();
      return;
    }
    var ext = mime.indexOf('mp4') >= 0 ? 'm4a' : 'webm';
    var file = new File([blob], 'voice-' + Date.now() + '.' + ext, { type: mime });

    resetSession();

    if (deps.onFileReady) {
      deps.onFileReady(file, {
        durationMs: durationMs,
        audioWaveformPeaks: peaks,
        audioMime: mime,
      });
    }
  }

  function startLiveWaveform(stream) {
    var wf = global.Ce2AudioWaveform;
    var canvas = el('ce2VoiceRecordWave');
    if (!wf || !canvas || !stream) return null;

    var analyser = wf.createLiveAnalyser(stream);
    if (!analyser.start()) return null;

    var rect = canvas.getBoundingClientRect();
    if (rect.width > 0) {
      canvas.width = Math.floor(rect.width * (global.devicePixelRatio || 1));
      canvas.height = Math.floor(28 * (global.devicePixelRatio || 1));
    }

    stopPaintFn = wf.startLivePaint(canvas, function () {
      return session && session.waveform === analyser ? analyser : null;
    });

    return analyser;
  }

  function startRecorder(stream) {
    var mime = pickMime();
    var recorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (_) {
      try {
        recorder = new MediaRecorder(stream);
        mime = recorder.mimeType || '';
      } catch (err) {
        cleanupStream(stream);
        resetSession();
        if (deps.onError) deps.onError(err);
        return;
      }
    }
    var recordedMime = mime || recorder.mimeType || 'audio/webm';

    session.stream = stream;
    session.recorder = recorder;
    session.mime = recordedMime;
    session.chunks = [];
    session.waveform = startLiveWaveform(stream);

    recorder.ondataavailable = function (e) {
      if (!session || !session.chunks) return;
      if (e.data && e.data.size) session.chunks.push(e.data);
    };

    recorder.onerror = function () {
      if (deps.onError) deps.onError(new Error('Recording failed.'));
      finishStop(false);
    };

    recorder.onstop = function () {
      finalizeBlob();
    };

    try {
      recorder.start(TIMESLICE_MS);
    } catch (err) {
      cleanupStream(stream);
      resetSession();
      if (deps.onError) deps.onError(err);
      return;
    }

    session.startedAt = Date.now();
    session.durationMs = 0;

    if (session.touchLock) {
      session.locked = true;
      session.cancelArmed = false;
      setRecordingUi(true, false, true);
    } else {
      setRecordingUi(true, false, false);
    }

    timerId = setInterval(function () {
      if (!session || !session.recorder) return;
      session.durationMs = Date.now() - session.startedAt;
      var timerNode = el('ce2VoiceRecordTimer');
      if (timerNode) timerNode.textContent = formatDuration(session.durationMs);
      if (session.durationMs >= MAX_DURATION_MS) {
        if (deps.onError) deps.onError(new Error('Voice note reached maximum length.'));
        finishStop(true);
      }
    }, 200);
  }

  function beginCapture(pointerId, clientX, clientY, opts) {
    if (!canStart()) {
      var reason = whyCantStart();
      if (reason && deps.onError) deps.onError(new Error(reason));
      return;
    }
    if (!navigator.mediaDevices || typeof MediaRecorder === 'undefined') {
      if (deps.onError) deps.onError(new Error('Voice notes are not supported in this browser.'));
      return;
    }

    var composerInput = el('ce2Input');
    if (composerInput && document.activeElement === composerInput) {
      composerInput.blur();
    }

    session = {
      pointerId: pointerId,
      startX: clientX,
      startY: clientY,
      cancelArmed: false,
      locked: !!(opts && opts.touchLock),
      touchLock: !!(opts && opts.touchLock),
      finalized: false,
      uploadDispatched: false,
      shouldSend: false,
      startedAt: 0,
      durationMs: 0,
    };

    var st = state();
    if (st) st.error = null;
    setRecordingUi(true, false, !!session.locked);

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(function (stream) {
        if (!session || session.finalized) {
          cleanupStream(stream);
          return;
        }
        if (session.pendingCancel) {
          cleanupStream(stream);
          resetSession();
          return;
        }
        startRecorder(stream);
      })
      .catch(function (err) {
        resetSession();
        if (deps.onError) deps.onError(new Error(microphoneErrorMessage(err)));
      });
  }

  function onPointerMove(e) {
    if (!session || session.finalized || e.pointerId !== session.pointerId) return;

    if (!session.locked) {
      var cancel = e.clientX < session.startX - CANCEL_SLIDE_PX;
      if (cancel !== session.cancelArmed) {
        session.cancelArmed = cancel;
        setRecordingUi(true, cancel, false);
      }
      if (isLockEnabled() && session.startY - e.clientY > LOCK_SLIDE_PX) {
        session.locked = true;
        session.cancelArmed = false;
        try {
          var voiceBtn = el('ce2VoiceBtn');
          if (voiceBtn && voiceBtn.releasePointerCapture) {
            voiceBtn.releasePointerCapture(e.pointerId);
          }
        } catch (_) {}
        setRecordingUi(true, false, true);
      }
    }
  }

  function onPointerEnd(e, send) {
    if (!session || session.finalized || e.pointerId !== session.pointerId) return;
    if (session.locked || session.touchLock) return;
    try {
      if (e.currentTarget && e.currentTarget.releasePointerCapture) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}
    finishStop(send);
  }

  function bindVoiceButton() {
    var voiceBtn = el('ce2VoiceBtn');
    if (!voiceBtn || voiceBtn.dataset.ce2AudioRecorderBound) return;
    voiceBtn.dataset.ce2AudioRecorderBound = '1';

    function pressStart(pointerId, clientX, clientY, opts) {
      beginCapture(pointerId, clientX, clientY, opts);
    }

    function shouldKeepRecordingAfterRelease() {
      return !!(session && (session.touchLock || session.locked));
    }

    function pressEnd(pointerId, send) {
      if (!session || session.finalized || pointerId !== session.pointerId) return;
      if (session.locked || session.touchLock) return;
      try {
        if (voiceBtn.releasePointerCapture) voiceBtn.releasePointerCapture(pointerId);
      } catch (_) {}
      finishStop(send);
    }

    var hasPointerEvents = typeof global.PointerEvent === 'function';

    voiceBtn.addEventListener('pointerdown', function (e) {
      if (!isPrimaryPress(e)) return;
      if (e.cancelable) e.preventDefault();
      var touchLock = e.pointerType === 'touch' || e.pointerType === 'pen';
      if (!touchLock) {
        try {
          voiceBtn.setPointerCapture(e.pointerId);
        } catch (_) {}
      }
      pressStart(e.pointerId, e.clientX, e.clientY, { touchLock: touchLock });
    });

    voiceBtn.addEventListener('pointermove', function (e) {
      onPointerMove(e);
    });

    voiceBtn.addEventListener('pointerup', function (e) {
      if (!isPrimaryPress(e)) return;
      if (shouldKeepRecordingAfterRelease()) return;
      onPointerEnd(e, true);
    });

    voiceBtn.addEventListener('pointercancel', function (e) {
      if (session && (session.locked || session.touchLock)) return;
      if (session) session.cancelArmed = true;
      onPointerEnd(e, false);
    });

    if (!hasPointerEvents) {
      voiceBtn.addEventListener(
        'touchstart',
        function (e) {
          if (!e.touches || !e.touches.length) return;
          if (e.cancelable) e.preventDefault();
          var t = e.touches[0];
          pressStart(t.identifier, t.clientX, t.clientY, { touchLock: true });
        },
        { passive: false }
      );

      voiceBtn.addEventListener('touchmove', function (e) {
        if (!session || session.finalized || !e.touches || !e.touches.length) return;
        var t = e.touches[0];
        if (t.identifier !== session.pointerId) return;
        onPointerMove({
          pointerId: t.identifier,
          clientX: t.clientX,
          clientY: t.clientY,
        });
      });

      voiceBtn.addEventListener('touchend', function (e) {
        if (!session || session.finalized || !e.changedTouches || !e.changedTouches.length) return;
        var t = e.changedTouches[0];
        if (t.identifier !== session.pointerId) return;
        if (shouldKeepRecordingAfterRelease()) return;
        pressEnd(t.identifier, !session.cancelArmed);
      });

      voiceBtn.addEventListener('touchcancel', function (e) {
        if (!session || session.finalized || !e.changedTouches || !e.changedTouches.length) return;
        var t = e.changedTouches[0];
        if (t.identifier !== session.pointerId) return;
        if (session.locked || session.touchLock) return;
        session.cancelArmed = true;
        pressEnd(t.identifier, false);
      });
    }

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', function (e) {
      if (!session || session.finalized || e.pointerId !== session.pointerId) return;
      if (session.locked || session.touchLock) return;
      if (e.target && e.target.closest && e.target.closest('#ce2VoiceBtn')) return;
      onPointerEnd(e, true);
    });

    var voiceLabel = isCoarseTouch() ? 'Tap to record voice' : 'Hold to record voice';
    voiceBtn.title = voiceLabel;
    voiceBtn.setAttribute('aria-label', voiceLabel);

    var stopBtn = el('ce2VoiceRecordStop');
    if (stopBtn) {
      stopBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!session || session.finalized || !session.locked) return;
        finishStop(true);
      });
    }
  }

  function bindVisibility() {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'hidden' || !session || session.finalized) return;
      // Mic permission sheets / iOS PWA chrome hide the document before MediaRecorder
      // starts. Cancelling here made the recorder look dead on first tap.
      if (!session.recorder) return;
      finishStop(true);
    });
  }

  global.Ce2AudioRecorder = {
    LOCK_TO_RECORD: LOCK_TO_RECORD,
    pickMime: pickMime,
    containerMime: containerMime,
    isAppleCapture: isAppleCapture,
    microphoneErrorMessage: microphoneErrorMessage,
    init: function (d) {
      deps = d || {};
      if (bound) return;
      bound = true;
      bindVoiceButton();
      bindVisibility();
    },
    reset: resetSession,
    isLockEnabled: isLockEnabled,
  };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
