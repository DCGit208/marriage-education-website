/**
 * SBD Life — editorial narration cues (browser Speech Synthesis, no API cost).
 * Respects article structure: title → lede → paragraphs → headings (isolated) → pull quotes.
 *
 * Pause/rate calibration derived from reference human read analysis (May 2026):
 * - breath p50 ≈ 566ms, p75 ≈ 813ms, section pauses ≈ 1.28–1.82s
 * - speech ratio ≈ 70% (slower, more breath than default browser pacing)
 */
(function (global) {
  var VOICE_PREF_KEY = 'sbdLifeTtsVoiceUri';

  /** Measured from editorial reference recording (Human Voice.m4a, ~62s, 28 pauses). */
  var HUMAN_CALIBRATION = {
    source: 'human-reference-m4a-2026-05',
    pauseMs: {
      breath: 450,
      sentence: 570,
      paragraphEnd: 820,
      lede: 900,
      pullQuote: 950,
      title: 1200,
      heading: 1750,
      attribution: 820
    },
    rate: {
      title: 0.76,
      lede: 0.82,
      paragraph: 0.86,
      heading: 0.7,
      pull_quote: 0.78,
      attribution: 0.84,
      breath: 0.86
    }
  };

  var ROLE = {
    title: {
      rate: HUMAN_CALIBRATION.rate.title,
      pitch: 1.02,
      pauseAfter: HUMAN_CALIBRATION.pauseMs.title
    },
    lede: {
      rate: HUMAN_CALIBRATION.rate.lede,
      pitch: 1,
      pauseAfter: HUMAN_CALIBRATION.pauseMs.lede
    },
    paragraph: {
      rate: HUMAN_CALIBRATION.rate.paragraph,
      pitch: 1,
      pauseAfter: HUMAN_CALIBRATION.pauseMs.paragraphEnd
    },
    heading: {
      rate: HUMAN_CALIBRATION.rate.heading,
      pitch: 0.95,
      pauseAfter: HUMAN_CALIBRATION.pauseMs.heading
    },
    pull_quote: {
      rate: HUMAN_CALIBRATION.rate.pull_quote,
      pitch: 0.92,
      pauseAfter: HUMAN_CALIBRATION.pauseMs.pullQuote
    },
    attribution: {
      rate: HUMAN_CALIBRATION.rate.attribution,
      pitch: 1,
      pauseAfter: HUMAN_CALIBRATION.pauseMs.attribution
    },
    breath: {
      rate: HUMAN_CALIBRATION.rate.breath,
      pitch: 1,
      pauseAfter: HUMAN_CALIBRATION.pauseMs.breath
    }
  };

  function normalize(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cue(role, text, overrides) {
    var preset = ROLE[role] || ROLE.paragraph;
    var c = {
      role: role,
      text: text,
      rate: preset.rate,
      pitch: preset.pitch,
      pauseAfter: preset.pauseAfter
    };
    if (overrides) {
      Object.keys(overrides).forEach(function (k) {
        c[k] = overrides[k];
      });
    }
    return c;
  }

  /** Split body copy on sentences and em-dash breath marks — never merge blocks. */
  function splitBodySentences(text, role) {
    var normalized = normalize(text);
    if (!normalized) return [];

    var breathSegments = normalized.split(/\s*[—–]\s*/);
    var out = [];

    breathSegments.forEach(function (segment, segIdx) {
      segment = segment.trim();
      if (!segment) return;

      var sentences = segment.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [segment];
      sentences.forEach(function (sentence, sentIdx) {
        sentence = sentence.trim();
        if (!sentence) return;
        var isLastInSegment = sentIdx === sentences.length - 1;
        var isLastSegment = segIdx === breathSegments.length - 1;
        var pauseAfter = HUMAN_CALIBRATION.pauseMs.sentence;
        if (!isLastInSegment) {
          pauseAfter = HUMAN_CALIBRATION.pauseMs.breath;
        } else if (!isLastSegment) {
          pauseAfter = HUMAN_CALIBRATION.pauseMs.breath;
        } else if (sentIdx === sentences.length - 1) {
          pauseAfter = ROLE[role] ? ROLE[role].pauseAfter : HUMAN_CALIBRATION.pauseMs.paragraphEnd;
        }
        out.push(
          cue(role, sentence, {
            pauseAfter: pauseAfter,
            rate: ROLE[role] ? ROLE[role].rate : HUMAN_CALIBRATION.rate.paragraph
          })
        );
      });
    });

    return out;
  }

  /**
   * Build editorial read cues from article — mirrors how a human narrator would structure the piece.
   */
  function compileCues(article) {
    if (!article) return [];
    var cues = [];

    if (article.title) {
      cues.push(cue('title', normalize(article.title)));
    }

    if (article.excerpt) {
      splitBodySentences(article.excerpt, 'lede').forEach(function (c) {
        cues.push(c);
      });
    }

    if (Array.isArray(article.contentBlocks)) {
      article.contentBlocks.forEach(function (block) {
        if (!block || !block.text) return;
        var text = normalize(block.text);
        if (!text) return;

        if (block.type === 'heading') {
          cues.push(cue('heading', text.replace(/\.$/, '')));
          return;
        }

        if (block.type === 'pull_quote') {
          cues.push(cue('pull_quote', text));
          if (block.attribution) {
            cues.push(cue('attribution', normalize(block.attribution)));
          }
          return;
        }

        var sentences = splitBodySentences(text, 'paragraph');
        sentences.forEach(function (c, idx) {
          if (idx === sentences.length - 1) {
            c.pauseAfter = Math.max(c.pauseAfter, HUMAN_CALIBRATION.pauseMs.paragraphEnd);
          }
          cues.push(c);
        });
      });
    } else if (article.content) {
      splitBodySentences(article.content, 'paragraph').forEach(function (c) {
        cues.push(c);
      });
    }

    return cues;
  }

  function compileScript(article) {
    return compileCues(article)
      .map(function (c) {
        return c.text;
      })
      .join('\n\n');
  }

  function waitForVoices() {
    return new Promise(function (resolve) {
      function collect() {
        return (speechSynthesis.getVoices() || []).filter(function (v) {
          return v && v.name;
        });
      }

      var voices = collect();
      if (voices.length) {
        resolve(voices);
        return;
      }

      var settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        resolve(collect());
      }

      speechSynthesis.onvoiceschanged = finish;
      setTimeout(finish, 800);
      setTimeout(finish, 1600);
    });
  }

  function scoreVoice(v) {
    var name = (v.name || '').toLowerCase();
    var score = 0;
    if (/neural|natural|premium|enhanced|wavenet/.test(name)) score += 140;
    if (
      /samantha|ava|allison|nicky|daniel|karen|moira|tessa|serena|jenny|guy|aria|sonia|libby|ryan/.test(
        name
      )
    )
      score += 70;
    if (/google us english|google uk english/.test(name)) score += 80;
    if (/microsoft.*online.*natural/.test(name)) score += 120;
    if (/compact|espeak|bad|robot|zira|david|fred/.test(name)) score -= 120;
    if (v.lang && /^en-US/i.test(v.lang)) score += 25;
    else if (v.lang && /^en-/i.test(v.lang)) score += 12;
    if (!v.localService && /natural|neural|google|microsoft/.test(name)) score += 30;
    return score;
  }

  function rankVoices(voices) {
    return voices
      .filter(function (v) {
        return v.lang && /^en/i.test(v.lang);
      })
      .sort(function (a, b) {
        return scoreVoice(b) - scoreVoice(a);
      });
  }

  function pickVoice(voices, preferredUri) {
    if (!voices || !voices.length) return null;
    if (preferredUri) {
      var saved = voices.find(function (v) {
        return v.voiceURI === preferredUri;
      });
      if (saved) return saved;
    }
    var ranked = rankVoices(voices);
    return ranked[0] || voices[0];
  }

  function loadVoicePref() {
    try {
      return localStorage.getItem(VOICE_PREF_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function saveVoicePref(uri) {
    try {
      if (uri) localStorage.setItem(VOICE_PREF_KEY, uri);
    } catch (e) {}
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function roleLabel(role) {
    var labels = {
      title: 'Title',
      lede: 'Opening',
      heading: 'Section',
      paragraph: 'Body',
      pull_quote: 'Quote',
      attribution: 'Attribution',
      breath: 'Body'
    };
    return labels[role] || 'Body';
  }

  function createQueuePlayer(options) {
    var cues = options.cues;
    var statusEl = options.statusEl;
    var progressEl = options.progressEl;
    var roleEl = options.roleEl;
    var getVoice = options.getVoice;
    var index = 0;
    var running = false;
    var paused = false;

    function setStatus(msg) {
      if (statusEl) statusEl.textContent = msg;
    }

    function setProgress() {
      if (!progressEl || !cues.length) return;
      progressEl.style.width = Math.round((index / cues.length) * 100) + '%';
    }

    function stop() {
      running = false;
      paused = false;
      index = 0;
      speechSynthesis.cancel();
      setProgress();
      if (roleEl) roleEl.textContent = '';
    }

    function speakNext() {
      if (!running || paused) return;
      if (index >= cues.length) {
        running = false;
        setStatus('Finished');
        if (progressEl) progressEl.style.width = '100%';
        if (roleEl) roleEl.textContent = '';
        return;
      }

      var item = cues[index];
      var voice = getVoice();
      var utterance = new SpeechSynthesisUtterance(item.text);
      utterance.rate = item.rate;
      utterance.pitch = item.pitch;
      utterance.volume = 1;
      if (voice) utterance.voice = voice;

      utterance.onstart = function () {
        if (roleEl) {
          roleEl.textContent = roleLabel(item.role) + ': “' + item.text.slice(0, 72) + '…”';
        }
        setStatus(
          'Cue ' + (index + 1) + ' of ' + cues.length + (voice ? ' · ' + voice.name : '')
        );
        setProgress();
      };

      utterance.onend = function () {
        index += 1;
        if (!running) return;
        setTimeout(speakNext, item.pauseAfter || 500);
      };

      utterance.onerror = function (evt) {
        if (evt && evt.error === 'interrupted') return;
        index += 1;
        if (running) setTimeout(speakNext, item.pauseAfter || 500);
      };

      speechSynthesis.speak(utterance);
    }

    return {
      play: function () {
        if (paused) {
          paused = false;
          speechSynthesis.resume();
          setStatus('Resuming…');
          return;
        }
        stop();
        running = true;
        index = 0;
        speechSynthesis.cancel();
        setTimeout(speakNext, 150);
      },
      pause: function () {
        if (!running) return;
        paused = true;
        speechSynthesis.pause();
        setStatus('Paused');
      },
      stop: stop
    };
  }

  function resolveCues(meta, articleData) {
    if (articleData) {
      var live = compileCues(articleData);
      if (live.length) return live;
    }
    if (meta && Array.isArray(meta.audioCues) && meta.audioCues.length) {
      return meta.audioCues;
    }
    if (meta && meta.audioScript) {
      return splitBodySentences(meta.audioScript, 'paragraph');
    }
    return [];
  }

  function mountBrowserPlayer(container, articleId, meta, articleData) {
    if (!container || !('speechSynthesis' in window)) {
      container.innerHTML =
        '<p class="life-reflections-note">Listen mode is not supported in this browser.</p>';
      return;
    }

    var cues = resolveCues(meta, articleData);
    if (!cues.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML =
      '<section class="life-audio life-audio-tts">' +
      '<h2 class="life-body-heading">Listen (optional)</h2>' +
      '<p class="life-reflections-note">' +
      'Opt-in device narration — free, no API. Pause and pace calibrated from your editorial reference recording; voice timbre still depends on browser.' +
      '</p>' +
      '<details class="life-tts-pattern"><summary>How this reads</summary>' +
      '<ul class="life-tts-pattern-list">' +
      '<li><strong>Title</strong> — read alone, then a pause.</li>' +
      '<li><strong>Section headings</strong> — separate from the paragraph below.</li>' +
      '<li><strong>Body</strong> — sentence by sentence with breath pauses.</li>' +
      '<li><strong>Pull quotes</strong> — own cue, then attribution if present.</li>' +
      '</ul></details>' +
      '<label class="life-tts-voice-label" for="lifeTtsVoice">Voice (pick Natural / Samantha if listed)</label>' +
      '<select id="lifeTtsVoice" class="life-tts-voice-select" aria-label="Narration voice"></select>' +
      '<div class="life-tts-controls">' +
      '<button type="button" class="btn-secondary" id="lifeTtsPlay">Play</button>' +
      '<button type="button" class="btn-secondary" id="lifeTtsPause">Pause</button>' +
      '<button type="button" class="btn-secondary" id="lifeTtsStop">Stop</button>' +
      '</div>' +
      '<div class="life-audio-progress"><div id="lifeTtsBar" class="life-audio-bar"></div></div>' +
      '<p id="lifeTtsRole" class="life-tts-role" aria-live="polite"></p>' +
      '<p id="lifeTtsStatus" class="life-tts-status">Ready · ' +
      cues.length +
      ' editorial cues</p>' +
      '<details class="life-audio-transcript"><summary>Cue map</summary><ol id="lifeTtsCueList" class="life-tts-cue-list"></ol></details>' +
      '</section>';

    var status = container.querySelector('#lifeTtsStatus');
    var roleEl = container.querySelector('#lifeTtsRole');
    var playBtn = container.querySelector('#lifeTtsPlay');
    var pauseBtn = container.querySelector('#lifeTtsPause');
    var stopBtn = container.querySelector('#lifeTtsStop');
    var voiceSelect = container.querySelector('#lifeTtsVoice');
    var cueList = container.querySelector('#lifeTtsCueList');
    var bar = container.querySelector('#lifeTtsBar');
    var allVoices = [];
    var player = null;

    if (cueList) {
      cueList.innerHTML = cues
        .map(function (c, i) {
          return (
            '<li><span class="life-tts-cue-role">' +
            esc(roleLabel(c.role)) +
            '</span> ' +
            esc(c.text) +
            '</li>'
          );
        })
        .join('');
    }

    function getSelectedVoice() {
      if (!voiceSelect || !allVoices.length) return null;
      var uri = voiceSelect.value;
      return (
        allVoices.find(function (v) {
          return v.voiceURI === uri;
        }) || pickVoice(allVoices, loadVoicePref())
      );
    }

    function populateVoices(voices) {
      allVoices = voices;
      var ranked = rankVoices(voices);
      if (!ranked.length) ranked = voices.slice();
      if (!voiceSelect) return;

      voiceSelect.innerHTML = '';
      ranked.forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent =
          v.name + ' (' + v.lang + ', ' + (v.localService ? 'local' : 'network') + ')';
        voiceSelect.appendChild(opt);
      });

      var preferred = loadVoicePref();
      var best = pickVoice(ranked, preferred);
      if (best) voiceSelect.value = best.voiceURI;

      voiceSelect.addEventListener('change', function () {
        saveVoicePref(voiceSelect.value);
      });
    }

    waitForVoices().then(function (voices) {
      populateVoices(voices);
      player = createQueuePlayer({
        cues: cues,
        statusEl: status,
        roleEl: roleEl,
        progressEl: bar,
        getVoice: getSelectedVoice
      });
    });

    if (playBtn) playBtn.addEventListener('click', function () { if (player) player.play(); });
    if (pauseBtn) pauseBtn.addEventListener('click', function () { if (player) player.pause(); });
    if (stopBtn) stopBtn.addEventListener('click', function () { if (player) player.stop(); });
  }

  async function enableBrowserNarration(articleId, articleData, tierRequired) {
    var cues = compileCues(articleData);
    if (!cues.length) throw new Error('No text to narrate');
    var script = compileScript(articleData);
    var now = firebase.firestore.Timestamp.now();
    await firebase
      .firestore()
      .collection('sbdLifeAudio')
      .doc(articleId)
      .set({
        articleId: articleId,
        narrationMode: 'browser',
        audioCues: cues,
        audioScript: script,
        audioUrl: '',
        narrator: 'SBD Life Editorial Voice',
        tierRequired: tierRequired || articleData.tierRequired || 'public',
        transcript: script.slice(0, 5000),
        updatedAt: now,
        generatedBy: 'browser-tts-v3-editorial',
        cost: 'free'
      });
    await firebase.firestore().collection('sbdLifeArticles').doc(articleId).update({
      audioVersionAvailable: true
    });
    return cues.length;
  }

  global.SbdLifeTts = {
    HUMAN_CALIBRATION: HUMAN_CALIBRATION,
    compileCues: compileCues,
    compileScript: compileScript,
    mountBrowserPlayer: mountBrowserPlayer,
    enableBrowserNarration: enableBrowserNarration
  };
})(window);
