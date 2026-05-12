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

  function playMvHouseVideo(slide) {
    const video = slide && slide.querySelector('video.video-bg');
    if (!video) return;

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

    /* Preload=auto on the MV <video> (dashboard.html) helps iOS/PWA buffer before play() */
    if (video.readyState === 0) {
      try {
        video.load();
      } catch (e) {
        /* ignore */
      }
    }

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

    attemptPlay();
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
      const p = video.play();
      if (p && typeof p.then === 'function') {
        p.catch(function () {
          video.addEventListener(
            'canplay',
            function once() {
              video.removeEventListener('canplay', once);
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

    if (index <= 3) {
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
      isAuthenticated = !!user;
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
