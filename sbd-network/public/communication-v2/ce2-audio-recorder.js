/**
 * CE2 Phase 1A — voice recorder (PTT, slide-to-cancel, MediaRecorder hardening).
 * Does not touch keyboard / viewport (v60 frozen).
 */
(function (global) {
  'use strict';

  var TIMESLICE_MS = 250;
  var MIN_DURATION_MS = 500;
  var MAX_DURATION_MS = 5 * 60 * 1000;
  var CANCEL_SLIDE_PX = 52;

  var deps = {};
  var session = null;
  var timerId = null;
  var bound = false;

  function el(id) {
    return document.getElementById(id);
  }

  function state() {
    return deps.getState ? deps.getState() : null;
  }

  function requestRender(opts) {
    if (deps.requestRender) deps.requestRender(opts || { threadOnly: true });
  }

  function setRecordingUi(active, cancelArmed) {
    var st = state();
    if (st) {
      st.voiceRecording = !!active;
      st.voiceRecordingCancel = !!cancelArmed;
    }
    var bar = el('ce2VoiceRecordBar');
    var timerNode = el('ce2VoiceRecordTimer');
    if (bar) {
      bar.hidden = !active;
      bar.classList.toggle('ce2-voice-record-bar--cancel', !!cancelArmed);
    }
    if (timerNode && session) {
      timerNode.textContent = formatDuration(session.durationMs || 0);
    }
    var voiceBtn = el('ce2VoiceBtn');
    if (voiceBtn) {
      voiceBtn.classList.toggle('is-recording', !!active);
      voiceBtn.classList.toggle('is-cancel-armed', !!cancelArmed);
    }
    requestRender();
  }

  function formatDuration(ms) {
    var totalSec = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(totalSec / 60);
    var s = totalSec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function pickMime() {
    if (typeof MediaRecorder === 'undefined') return '';
    if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
    if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
    return '';
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
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
    session = null;
    setRecordingUi(false, false);
  }

  function canStart() {
    var st = state();
    if (!st || st.voiceRecording || session) return false;
    var ac = st.activeConversation;
    return !!(ac && !ac.needsJoin);
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
    cleanupStream(s.stream);
    s.recorder = null;
    s.stream = null;

    var durationMs = Date.now() - s.startedAt;
    var send = s.shouldSend && !s.cancelArmed && durationMs >= MIN_DURATION_MS;

    if (!send || !s.chunks.length) {
      resetSession();
      return;
    }

    s.uploadDispatched = true;
    var mime = s.mime || 'audio/webm';
    var blob = new Blob(s.chunks, { type: mime });
    s.chunks = [];
    var ext = mime.indexOf('mp4') >= 0 ? 'm4a' : 'webm';
    var file = new File([blob], 'voice-' + Date.now() + '.' + ext, { type: mime });

    resetSession();

    if (deps.onFileReady) {
      deps.onFileReady(file, { durationMs: durationMs });
    }
  }

  function startRecorder(stream) {
    var mime = pickMime();
    var recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    var recordedMime = mime || recorder.mimeType || 'audio/webm';

    session.stream = stream;
    session.recorder = recorder;
    session.mime = recordedMime;
    session.chunks = [];

    recorder.ondataavailable = function (e) {
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
    setRecordingUi(true, false);

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

  function beginCapture(pointerId, clientX) {
    if (!canStart()) return;
    if (!navigator.mediaDevices || typeof MediaRecorder === 'undefined') {
      if (deps.onError) deps.onError(new Error('Voice notes are not supported in this browser.'));
      return;
    }

    session = {
      pointerId: pointerId,
      startX: clientX,
      cancelArmed: false,
      finalized: false,
      uploadDispatched: false,
      shouldSend: false,
      startedAt: 0,
      durationMs: 0,
    };

    var st = state();
    if (st) st.error = null;

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
        if (deps.onError) deps.onError(err);
      });
  }

  function onPointerMove(e) {
    if (!session || session.finalized || e.pointerId !== session.pointerId) return;
    var cancel = e.clientX < session.startX - CANCEL_SLIDE_PX;
    if (cancel !== session.cancelArmed) {
      session.cancelArmed = cancel;
      setRecordingUi(true, cancel);
    }
  }

  function onPointerEnd(e, send) {
    if (!session || session.finalized || e.pointerId !== session.pointerId) return;
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

    voiceBtn.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.pointerType !== 'touch') return;
      e.preventDefault();
      try {
        voiceBtn.setPointerCapture(e.pointerId);
      } catch (_) {}
      beginCapture(e.pointerId, e.clientX);
    });

    voiceBtn.addEventListener('pointermove', function (e) {
      onPointerMove(e);
    });

    voiceBtn.addEventListener('pointerup', function (e) {
      e.preventDefault();
      onPointerEnd(e, true);
    });

    voiceBtn.addEventListener('pointercancel', function (e) {
      e.preventDefault();
      if (session) session.cancelArmed = true;
      onPointerEnd(e, false);
    });

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', function (e) {
      if (!session || session.finalized || e.pointerId !== session.pointerId) return;
      if (e.target && e.target.closest && e.target.closest('#ce2VoiceBtn')) return;
      onPointerEnd(e, true);
    });
  }

  function bindVisibility() {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && session && !session.finalized) {
        session.cancelArmed = true;
        finishStop(false);
      }
    });
  }

  global.Ce2AudioRecorder = {
    init: function (d) {
      deps = d || {};
      if (bound) return;
      bound = true;
      bindVoiceButton();
      bindVisibility();
    },
    reset: resetSession,
  };
})(typeof window !== 'undefined' ? window : global);
