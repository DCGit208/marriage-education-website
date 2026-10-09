/**
 * Dashboard marketing layer: tier CTAs, signup sheet, intro/tier/MV slide animations,
 * and auth chrome (floating button + bell). Loaded before dashboard-slider.js so
 * window.onSlideChange exists when the slider boots.
 */
(function () {
  'use strict';

  /** Background lead-in: reveal UI after this cap or `ended`, whichever is first (short clips use full play). */
  const MV_LEAD_IN_CAP_MS = 3800;
  window.__sbdMvLeadInCapMs = MV_LEAD_IN_CAP_MS;

  let isAuthenticated = false;
  let hasShownSignupPrompt = false;

  function buildAuthUrl(source, tier) {
    const url = new URL('/auth', window.location.origin);
    url.searchParams.set('next', '/learn');
    if (source) url.searchParams.set('src', source);
    if (tier) url.searchParams.set('tier', tier);
    return `${url.pathname}${url.search}`;
  }

  function routeTierIntent(tier, source) {
    if (!tier) return;
    sessionStorage.setItem('selectedTier', tier);

    if (!isAuthenticated) {
      window.location.href = buildAuthUrl(source || 'slide5', tier);
      return;
    }

    const target = new URL('/learn', window.location.origin);
    target.searchParams.set('tier', tier);
    if (source) target.searchParams.set('src', source);
    window.location.href = `${target.pathname}${target.search}`;
  }

  function maybeShowSignupPrompt(index) {
    const visibleSlides = Array.from(document.querySelectorAll('.slide-card')).filter(
      (slide) => window.getComputedStyle(slide).display !== 'none'
    );

    const lastIndex = visibleSlides.length - 1;

    if (index !== lastIndex || isAuthenticated || hasShownSignupPrompt) return;

    if (localStorage.getItem('sbd-slide9-signup-prompt-seen') === '1') {
      hasShownSignupPrompt = true;
      return;
    }

    const sheet = document.getElementById('signupPromptSheet');
    if (!sheet) return;

    hasShownSignupPrompt = true;
    localStorage.setItem('sbd-slide9-signup-prompt-seen', '1');
    sheet.classList.add('open');
  }

  // Video sources are stored in data-src so guests can render the dashboard without
  // requesting the large Hosting MP4s. Only the currently needed authenticated video
  // is hydrated into a real src attribute.
  function hydrateVideo(video) {
    let changed = false;
    video.querySelectorAll('source[data-src]').forEach(function (source) {
      if (!source.getAttribute('src')) {
        source.setAttribute('src', source.getAttribute('data-src'));
        changed = true;
      }
    });
    if (changed) {
      try { video.load(); } catch (e) { /* ignore */ }
    }
    return changed || !!video.currentSrc;
  }

  function dehydrateVideo(video) {
    if (!video) return;
    try { video.pause(); } catch (e) { /* ignore */ }
    video.querySelectorAll('source[src]').forEach(function (source) {
      const dataSrc = source.getAttribute('data-src');
      if (dataSrc) source.removeAttribute('src');
    });
    try { video.load(); } catch (e) { /* ignore */ }
  }

  function dehydrateAllBackgroundVideos() {
    document.querySelectorAll('video.video-bg, video.intro-slide-video').forEach(dehydrateVideo);
  }

  /**
   * Intro slides approved for video backgrounds (add one id at a time).
   * Rollback: remove card id here + matching HTML/CSS blocks for that slide.
   */
  const INTRO_VIDEO_SLIDES = ['intro-1', 'intro-2', 'intro-3', 'intro-4'];

  function syncIntroSlideVideos(activeSlide) {
    const activeCard = activeSlide && activeSlide.dataset.card;
    const reduced = prefersReducedMotion();

    INTRO_VIDEO_SLIDES.forEach(function (cardId) {
      const slide = document.querySelector('[data-card="' + cardId + '"]');
      if (!slide) return;

      const video = slide.querySelector('video.intro-slide-video');
      if (!video) return;

      if (reduced || !isAuthenticated) {
        video.pause();
        if (!isAuthenticated) dehydrateVideo(video);
        return;
      }

      if (activeCard === cardId) {
        hydrateVideo(video);
        playIntroSlideVideo(video);
      } else {
        video.pause();
        try {
          video.currentTime = 0;
        } catch (eSeek) {
          /* ignore */
        }
      }
    });
  }

  function playIntroSlideVideo(video, opts) {
    hydrateVideo(video);

    const fromUserGesture = !!(opts && opts.fromUserGesture);

    try {
      video.muted = true;
      video.defaultMuted = true;
      video.setAttribute('muted', '');
      try {
        video.volume = 0;
      } catch (eVol) {
        /* ignore */
      }
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
    } catch (e) {
      /* ignore */
    }

    function armCanPlayRetry() {
      video.addEventListener(
        'canplay',
        function retry() {
          video.removeEventListener('canplay', retry);
          const p2 = video.play();
          if (p2 && typeof p2.catch === 'function') {
            p2.catch(function () {});
          }
        },
        { once: true }
      );
    }

    function attemptPlay() {
      const p = video.play();
      if (p && typeof p.then === 'function') {
        p.catch(function () {
          armCanPlayRetry();
        });
      } else {
        armCanPlayRetry();
      }
    }

    if (fromUserGesture) {
      attemptPlay();
    } else if (isLikelyIOSWebKit()) {
      requestAnimationFrame(function () {
        requestAnimationFrame(attemptPlay);
      });
    } else {
      attemptPlay();
    }
  }

  function playActiveIntroSlideVideo(opts) {
    if (prefersReducedMotion() || !isAuthenticated) return;
    const getSlides = window.__sbdSliderGetVisibleSlides;
    const getCurrent = window.__sbdSliderGetCurrent;
    if (typeof getSlides !== 'function' || typeof getCurrent !== 'function') return;
    const slides = getSlides();
    const slide = slides[getCurrent()];
    if (!slide || slide.dataset.type !== 'intro') return;
    const video = slide.querySelector('video.intro-slide-video');
    playIntroSlideVideo(video, opts);
  }

  function prepareIntroSlideWords() {
    document.querySelectorAll('.slide-card[data-type="intro"] .word').forEach(function (w) {
      w.classList.add('intro-word-hidden');
      w.classList.remove('intro-word-visible');
    });
  }

  /** Force same-origin boards images to paint inside CSS-transform sliders (iOS PWA). */
  function warmBoardsSlideImages(slide) {
    if (!slide || slide.dataset.card !== 'boards') return;
    slide.classList.add('bb-images-ready');
    slide.querySelectorAll('img').forEach(function (img) {
      try {
        img.removeAttribute('loading');
        img.loading = 'eager';
        const src = img.getAttribute('data-src') || img.getAttribute('src');
        if (!src) return;
        // Re-assign src to kick Safari if the first paint was deferred off-screen
        if (!img.complete || img.naturalWidth === 0) {
          img.setAttribute('src', src);
        }
        if (typeof img.decode === 'function') {
          img.decode().then(function () {
            img.classList.add('bb-img-loaded');
          }).catch(function () {
            img.classList.add('bb-img-loaded');
          });
        } else {
          img.classList.add('bb-img-loaded');
        }
      } catch (e) {
        /* ignore */
      }
    });
  }

  function preloadBoardsSlideImages() {
    const slide = document.querySelector('.slide-card[data-card="boards"]');
    if (!slide) return;
    warmBoardsSlideImages(slide);
    // Also warm via Image() so files are in HTTP cache before the user reaches slide 6
    slide.querySelectorAll('img[src]').forEach(function (img) {
      try {
        const warm = new Image();
        warm.src = img.getAttribute('src');
      } catch (e) {
        /* ignore */
      }
    });
  }

  function animateIntroSlide(slide) {
    if (!slide) return;

    const words = slide.querySelectorAll('.word');
    if (!words.length) return;

    words.forEach((w) => {
      w.classList.remove('intro-word-visible');
      w.classList.add('intro-word-hidden');
    });

    setTimeout(() => {
      let delay = 0;
      words.forEach((w) => {
        setTimeout(() => {
          w.classList.remove('intro-word-hidden');
          w.classList.add('intro-word-visible');
        }, delay);
        delay += 420;
      });
    }, 900);
  }

  function animateTierSlide(slide) {
    if (!slide) return;

    const cards = slide.querySelectorAll('.membership-card');
    if (!cards.length) return;

    cards.forEach((card) => {
      card.classList.remove('tier-card-visible', 'tier-card-floating');
      card.classList.add('tier-card-hidden');
    });

    void slide.offsetHeight;

    setTimeout(() => {
      cards.forEach((card, i) => {
        setTimeout(() => {
          card.classList.remove('tier-card-hidden');
          card.classList.add('tier-card-visible');
        }, i * 180);
      });
    }, 600);

    setTimeout(() => {
      cards.forEach((card) => {
        card.classList.add('tier-card-floating');
        setTimeout(() => {
          card.classList.remove('tier-card-floating');
        }, 2000);
      });
    }, 1600);
  }

  function animateMVSlide(slide) {
    if (!slide) return;
    const items = slide.querySelectorAll('.mv-item');
    if (!items.length) return;

    items.forEach((item, i) => {
      item.classList.remove('mv-item-visible');
      item.classList.add('mv-item-hidden');

      setTimeout(() => {
        item.classList.remove('mv-item-hidden');
        item.classList.add('mv-item-visible');
      }, i * 130);
    });
  }

  function prefersReducedMotion() {
    return (
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  /** WebKit iOS / iPadOS — different scheduling + Range behavior than desktop Chrome */
  function isLikelyIOSWebKit() {
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    if (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1) return true;
    return false;
  }

  function detachMvHouseVideoEndListeners(slide, video) {
    if (!video) return;
    if (slide._mvOnEnded) {
      video.removeEventListener('ended', slide._mvOnEnded);
      video.removeEventListener('timeupdate', slide._mvOnTimeUpdate);
      video.removeEventListener('loadedmetadata', slide._mvOnLoadedMeta);
      video.removeEventListener('error', slide._mvOnError);
    }
    if (slide._mvOnLoadedData) {
      video.removeEventListener('loadeddata', slide._mvOnLoadedData);
      slide._mvOnLoadedData = null;
    }
    slide._mvOnEnded = null;
    slide._mvOnTimeUpdate = null;
    slide._mvOnLoadedMeta = null;
    slide._mvOnError = null;
  }

  function resetMvHouseSlide(slide) {
    if (!slide || slide.dataset.card !== 'mv-house') return;
    clearTimeout(slide._mvRevealT1);
    clearTimeout(slide._mvRevealT2);
    if (slide._mvFallbackT) {
      clearTimeout(slide._mvFallbackT);
      slide._mvFallbackT = null;
    }
    if (slide._mvSafetyT) {
      clearTimeout(slide._mvSafetyT);
      slide._mvSafetyT = null;
    }
    detachMvHouseGestureUnlock(slide);
    slide._mvRevealPhaseDone = false;
    slide.classList.remove('mv-slide-phase-bg', 'mv-slide-reveal-done');
    const video = slide.querySelector('video.video-bg');
    if (video) {
      detachMvHouseVideoEndListeners(slide, video);
      if (slide._mvVideoLoopOrig !== undefined) {
        video.loop = slide._mvVideoLoopOrig;
        slide._mvVideoLoopOrig = undefined;
      }
      video.pause();
      try {
        video.currentTime = 0;
      } catch (e) {
        /* ignore */
      }
    }
    slide.querySelectorAll('.mv-item').forEach((item) => {
      item.classList.remove('mv-item-visible');
      item.classList.add('mv-item-hidden');
    });
  }

  function playMvHouseVideo(slide, opts) {
    const video = slide && slide.querySelector('video.video-bg');
    if (!video) return;
    hydrateVideo(video);

    const fromUserGesture = !!(opts && opts.fromUserGesture);

    /* iOS / PWA: inline muted playback + explicit flags (autoplay policy) */
    try {
      video.muted = true;
      video.defaultMuted = true;
      video.setAttribute('muted', '');
      try {
        video.volume = 0;
      } catch (eVol) {
        /* ignore */
      }
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
    } catch (e) {
      /* ignore */
    }

    /* Never call video.load() here: it resets the media element and routinely breaks
       muted inline play() on iOS Safari / home-screen PWA (especially after SW/cache). */

    function armCanPlayRetry() {
      const retry = function () {
        video.removeEventListener('canplay', retry);
        const p2 = video.play();
        if (p2 && typeof p2.catch === 'function') {
          p2.catch(function () {
            /* ignore */
          });
        }
      };
      video.addEventListener('canplay', retry, { once: true });
    }

    function attemptPlay() {
      const p = video.play();
      if (p && typeof p.then === 'function') {
        p.catch(function () {
          armCanPlayRetry();
        });
      } else {
        armCanPlayRetry();
      }
    }

    /* iOS: when triggered from a user gesture (touch unlock) we MUST call
       play() synchronously — the gesture context is lost across rAF and
       Safari will reject the play() with NotAllowedError. Only defer to
       the next paint when this is an autoplay/visibility-driven call. */
    if (fromUserGesture) {
      attemptPlay();
    } else if (isLikelyIOSWebKit()) {
      requestAnimationFrame(function () {
        requestAnimationFrame(attemptPlay);
      });
    } else {
      attemptPlay();
    }
  }

  function tryPlayMvHouseSlide(opts) {
    const slide = document.querySelector('.slide-card[data-card="mv-house"]');
    if (!slide || !slide.isConnected) return;
    playMvHouseVideo(slide, opts);
  }

  /** iOS / PWA: first touch anywhere satisfies user-gesture for muted play()
      if autoplay was deferred. Re-arms after the MV video stops/ends so that
      a later tap can still resurrect playback (Safari pauses background videos
      aggressively in standalone mode). */
  function armMvGlobalPlaybackUnlock() {
    if (document.body.dataset.sbdMvGlobalUnlock === '1') return;
    document.body.dataset.sbdMvGlobalUnlock = '1';

    function unlock() {
      if (!isAuthenticated) return;
      /* Only unlock the video the authenticated user can currently see. */
      tryPlayMvHouseSlide({ fromUserGesture: true });
      playActiveIntroSlideVideo({ fromUserGesture: true });
    }

    document.addEventListener('touchstart', unlock, { capture: true, passive: true });
    document.addEventListener('touchend', unlock, { capture: true, passive: true });
    document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    document.addEventListener('click', unlock, { capture: true, passive: true });
  }

  function detachMvHouseGestureUnlock(slide) {
    if (!slide || !slide._mvGestureUnlockAttached) return;
    slide.removeEventListener('touchstart', slide._mvGestureUnlockAttached, true);
    slide.removeEventListener('touchend', slide._mvGestureUnlockAttached, true);
    slide.removeEventListener('pointerdown', slide._mvGestureUnlockAttached, true);
    slide._mvGestureUnlockAttached = null;
  }

  function bumpMvHouseSliderTimer() {
    if (typeof window.__sbdRescheduleAutoSlide === 'function') {
      window.__sbdRescheduleAutoSlide();
    }
  }

  function finishMvHouseVideoPhase(slide) {
    if (!slide || slide.dataset.card !== 'mv-house' || slide._mvRevealPhaseDone) {
      return;
    }
    slide._mvRevealPhaseDone = true;

    clearTimeout(slide._mvRevealT1);
    slide._mvRevealT1 = null;

    const video = slide.querySelector('video.video-bg');
    detachMvHouseVideoEndListeners(slide, video);
    if (slide._mvFallbackT) {
      clearTimeout(slide._mvFallbackT);
      slide._mvFallbackT = null;
    }
    if (slide._mvSafetyT) {
      clearTimeout(slide._mvSafetyT);
      slide._mvSafetyT = null;
    }

    detachMvHouseGestureUnlock(slide);

    if (video) {
      if (slide._mvVideoLoopOrig !== undefined) {
        video.loop = slide._mvVideoLoopOrig;
      } else {
        video.loop = true;
      }
      slide._mvVideoLoopOrig = undefined;
    }

    slide.classList.remove('mv-slide-phase-bg');
    slide.classList.add('mv-slide-reveal-done');

    slide._mvRevealT2 = setTimeout(function () {
      animateMVSlide(slide);
    }, 520);

    if (video) {
      try {
        video.muted = true;
        video.playsInline = true;
      } catch (e) {
        /* ignore */
      }
      try {
        if (video.ended || (isFinite(video.duration) && video.currentTime >= video.duration - 0.05)) {
          video.currentTime = 0;
        }
      } catch (e) {
        /* ignore */
      }
      function finishAttemptPlay() {
        const p = video.play();
        if (p && typeof p.then === 'function') {
          p.catch(function () {
            video.addEventListener(
              'canplay',
              function onceCp() {
                video.removeEventListener('canplay', onceCp);
                const p2 = video.play();
                if (p2 && typeof p2.catch === 'function') {
                  p2.catch(function () {
                    /* ignore */
                  });
                }
              },
              { once: true }
            );
          });
        }
      }

      if (isLikelyIOSWebKit()) {
        requestAnimationFrame(function () {
          requestAnimationFrame(finishAttemptPlay);
        });
      } else {
        finishAttemptPlay();
      }
    }

    bumpMvHouseSliderTimer();
  }

  function applyMvHouseReveal(slide) {
    if (!slide || slide.dataset.card !== 'mv-house') return;

    slide.querySelectorAll('.mv-item').forEach((item) => {
      item.classList.remove('mv-item-visible');
      item.classList.add('mv-item-hidden');
    });

    slide.classList.remove('mv-slide-reveal-done', 'mv-slide-phase-bg');
    clearTimeout(slide._mvRevealT1);
    clearTimeout(slide._mvRevealT2);
    if (slide._mvFallbackT) {
      clearTimeout(slide._mvFallbackT);
      slide._mvFallbackT = null;
    }
    if (slide._mvSafetyT) {
      clearTimeout(slide._mvSafetyT);
      slide._mvSafetyT = null;
    }
    detachMvHouseGestureUnlock(slide);
    slide._mvRevealPhaseDone = false;

    const video = slide.querySelector('video.video-bg');

    if (prefersReducedMotion()) {
      if (video) {
        detachMvHouseVideoEndListeners(slide, video);
      }
      playMvHouseVideo(slide);
      slide.classList.add('mv-slide-reveal-done');
      animateMVSlide(slide);
      bumpMvHouseSliderTimer();
      return;
    }

    if (video) {
      detachMvHouseVideoEndListeners(slide, video);
      slide._mvVideoLoopOrig = video.loop;
      video.loop = false;

      slide._mvOnEnded = function () {
        finishMvHouseVideoPhase(slide);
      };
      slide._mvOnTimeUpdate = function () {
        if (slide._mvRevealPhaseDone) return;
        const d = video.duration;
        const capS = MV_LEAD_IN_CAP_MS / 1000;
        let thresholdS;
        if (isFinite(d) && d > 0.25) {
          thresholdS = Math.min(d, capS);
        } else {
          return;
        }
        if (video.currentTime >= thresholdS - 0.08) {
          finishMvHouseVideoPhase(slide);
        }
      };
      slide._mvOnLoadedMeta = function () {
        if (slide._mvRevealPhaseDone) return;
        if (slide._mvFallbackT) {
          clearTimeout(slide._mvFallbackT);
        }
        slide._mvFallbackT = setTimeout(function () {
          if (!slide._mvRevealPhaseDone) {
            finishMvHouseVideoPhase(slide);
          }
        }, MV_LEAD_IN_CAP_MS + 3200);
        bumpMvHouseSliderTimer();
      };
      slide._mvOnError = function () {
        if (slide._mvRevealPhaseDone) return;
        clearTimeout(slide._mvRevealT1);
        slide._mvRevealT1 = setTimeout(function () {
          finishMvHouseVideoPhase(slide);
        }, 2800);
      };

      video.addEventListener('ended', slide._mvOnEnded);
      video.addEventListener('timeupdate', slide._mvOnTimeUpdate);
      video.addEventListener('loadedmetadata', slide._mvOnLoadedMeta);
      video.addEventListener('error', slide._mvOnError);

      slide._mvOnLoadedData = function () {
        if (slide._mvRevealPhaseDone) return;
        playMvHouseVideo(slide);
      };
      video.addEventListener('loadeddata', slide._mvOnLoadedData);

      try {
        video.currentTime = 0.001;
      } catch (eSeek) {
        try {
          video.currentTime = 0;
        } catch (eSeek2) {
          /* ignore */
        }
      }

      if (video.readyState >= 1) {
        slide._mvOnLoadedMeta();
      }
    }

    slide.classList.add('mv-slide-phase-bg');

    if (!prefersReducedMotion()) {
      detachMvHouseGestureUnlock(slide);
      const g = function () {
        detachMvHouseGestureUnlock(slide);
        playMvHouseVideo(slide);
      };
      slide._mvGestureUnlockAttached = g;
      slide.addEventListener('touchstart', g, { capture: true, passive: true });
      slide.addEventListener('touchend', g, { capture: true, passive: true });
      slide.addEventListener('pointerdown', g, { capture: true, passive: true });
    }

    playMvHouseVideo(slide);

    slide._mvRevealT1 = setTimeout(function () {
      if (!slide._mvRevealPhaseDone) {
        finishMvHouseVideoPhase(slide);
      }
    }, MV_LEAD_IN_CAP_MS + 450);

    bumpMvHouseSliderTimer();

    slide._mvSafetyT = setTimeout(function () {
      if (!slide._mvRevealPhaseDone) {
        finishMvHouseVideoPhase(slide);
      }
    }, 45000);
  }

  window.onSlideChange = function (index) {
    const slides = Array.from(document.querySelectorAll('.slide-card')).filter(
      (slide) => window.getComputedStyle(slide).display !== 'none'
    );

    slides.forEach(function (s, i) {
      if (s.dataset.card === 'mv-house' && i !== index) {
        resetMvHouseSlide(s);
      }
    });

    const currentSlide = slides[index];

    syncIntroSlideVideos(currentSlide);

    if (currentSlide && currentSlide.dataset.card === 'boards') {
      warmBoardsSlideImages(currentSlide);
    }

    if (currentSlide && currentSlide.dataset.type === 'intro') {
      animateIntroSlide(currentSlide);
    }

    if (currentSlide && currentSlide.dataset.card === 'tiers') {
      animateTierSlide(currentSlide);
    }

    if (currentSlide && currentSlide.dataset.card === 'mv-house') {
      applyMvHouseReveal(currentSlide);
    }

    maybeShowSignupPrompt(index);
  };

  document.addEventListener('DOMContentLoaded', () => {
    prepareIntroSlideWords();
    preloadBoardsSlideImages();
    armMvGlobalPlaybackUnlock();

    function resumeMvVideoIfPaused() {
      if (!isAuthenticated || document.visibilityState !== 'visible') return;
      const slide = document.querySelector('.slide-card[data-card="mv-house"]');
      if (!slide || !slide.isConnected) return;
      const v = slide.querySelector('video.video-bg');
      if (!v || v.error) return;
      if (v.paused && !v.ended) {
        playMvHouseVideo(slide);
      }
    }

    document.addEventListener('visibilitychange', resumeMvVideoIfPaused);
    window.addEventListener('pageshow', function (ev) {
      if (ev.persisted) resumeMvVideoIfPaused();
    });

    const authBtn = document.getElementById('onboardingAuthBtn');
    const bellBtn = document.getElementById('dashboardBellBtn');
    const tierCards = document.querySelectorAll('[data-card="tiers"] .membership-card');
    const promptSheet = document.getElementById('signupPromptSheet');
    const promptClose = document.getElementById('signupPromptClose');
    const promptButtons = document.querySelectorAll('[data-signup-source]');

    tierCards.forEach((card) => {
      card.addEventListener('click', () => {
        const selectedTier = (card.dataset.tier || '').toLowerCase();
        tierCards.forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');

        setTimeout(() => {
          routeTierIntent(selectedTier, 'slide5');
        }, 120);
      });
    });

    if (promptClose && promptSheet) {
      promptClose.addEventListener('click', () => {
        promptSheet.classList.remove('open');
      });
    }

    promptButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const source = btn.getAttribute('data-signup-source') || 'slide9';
        window.location.href = buildAuthUrl(source, 'foundation');
      });
    });

    if (authBtn) {
      authBtn.addEventListener('click', () => {
        if (isAuthenticated) {
          window.location.href = '/profile';
          return;
        }
        window.location.href = buildAuthUrl('fab');
      });
    }

    function applyAuthUi(user) {
      const nextAuthenticated = !!user;
      const authChanged = nextAuthenticated !== isAuthenticated;
      isAuthenticated = nextAuthenticated;
      document.body.classList.toggle('auth-user', isAuthenticated);
      document.body.classList.toggle('auth-guest', !isAuthenticated);

      if (authBtn) {
        authBtn.textContent = isAuthenticated ? 'Profile' : 'Sign up';
        authBtn.setAttribute(
          'aria-label',
          isAuthenticated ? 'Open profile' : 'Sign up or sign in'
        );
      }

      if (bellBtn) {
        bellBtn.classList.toggle('notif-hidden', !isAuthenticated);
      }

      if (isAuthenticated && promptSheet) {
        promptSheet.classList.remove('open');
      }

      if (authChanged && typeof window.refreshSliderLayout === 'function') {
        window.requestAnimationFrame(function () {
          window.refreshSliderLayout(isAuthenticated ? 0 : undefined);
          if (isAuthenticated) {
            playActiveIntroSlideVideo();
            tryPlayMvHouseSlide();
          }
        });
      }
    }

    window.addEventListener('sbd-auth-state', (event) => {
      applyAuthUi(event.detail && event.detail.user ? event.detail.user : null);
    });

    (function waitForAuthObserver() {
      if (typeof auth === 'undefined' || !auth.onAuthStateChanged) {
        setTimeout(waitForAuthObserver, 120);
        return;
      }
      auth.onAuthStateChanged((user) => {
        applyAuthUi(user);
      });
    })();
  });
})();
