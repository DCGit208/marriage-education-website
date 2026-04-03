/* ============================================
   CINEMATIC SLIDER - SWIPE, AUTO-SLIDE & ANIMATIONS
   9 Slides: 4 intro text + 5 main cards
   ============================================ */

let currentSlide = 0;
const sliderTrack = document.getElementById('sliderTrack');
const dots = document.querySelectorAll('.dot');
const totalSlides = 9; // 4 intro + 5 main cards

let startX = 0;
let currentX = 0;
let isDragging = false;
let startTransform = 0;

// Auto-slide variables
let autoSlideTimer = null;
let resumeTimer = null;
let isPaused = false;

const RESUME_DELAY = 3000; // Resume after 3s of no interaction
const INTRO_SLIDE_COUNT = 4; // Slides 0–3 are intro slides

/* ============================================
   INTELLIGENT BEHAVIOR-BASED PACING
   Only applies to intro slides (0–3)
   ============================================ */

let userBehavior = {
  swipeSpeed: 0,
  slidesViewed: 0,
  startTime: Date.now()
};

// Load returning user profile from previous session
(function loadSavedProfile() {
  const savedType = localStorage.getItem('user_pacing_type');
  if (savedType) {
    userBehavior.swipeSpeed = savedType === 'fast'   ? 1500 :
                              savedType === 'normal' ? 3000 :
                              5000; // slow
  }
}());

function getUserType() {
  if (userBehavior.slidesViewed < 2) return 'new';
  if (userBehavior.swipeSpeed < 2000) return 'fast';
  if (userBehavior.swipeSpeed < 4000) return 'normal';
  return 'slow';
}

function getSlideDuration(slideIndex) {
  if (slideIndex >= INTRO_SLIDE_COUNT) return null; // product slides: no auto-advance
  const type = getUserType();
  if (type === 'new')    return 6500;
  if (type === 'slow')   return 6000;
  if (type === 'normal') return 4500;
  if (type === 'fast')   return 2500;
  return 4500;
}

/* ============================================
   AUTO-SLIDE (CONTINUOUS LOOP WITH VARIABLE TIMING)
   ============================================ */

function startAutoSlide() {
  stopAutoSlide();
  scheduleNextSlide();
  console.log('🔄 Auto-slide started (variable timing)');
}

function scheduleNextSlide() {
  const duration = getSlideDuration(currentSlide);

  // Stop auto-advance once past intro slides
  if (duration === null) {
    stopAutoSlide();
    return;
  }

  autoSlideTimer = setTimeout(() => {
    if (!isPaused && !isDragging) {
      const nextSlide = currentSlide + 1;
      // Only auto-advance within intro slides
      if (nextSlide < INTRO_SLIDE_COUNT) {
        goToSlide(nextSlide);
        scheduleNextSlide();
      } else {
        // Reached end of intro — advance once to first product slide then stop
        goToSlide(nextSlide);
        stopAutoSlide();
        // Persist pacing profile for returning visits
        localStorage.setItem('user_pacing_type', getUserType());
      }
    }
  }, duration);
}

function stopAutoSlide() {
  if (autoSlideTimer) {
    clearTimeout(autoSlideTimer);
    autoSlideTimer = null;
  }
}

function pauseAutoSlide() {
  isPaused = true;
  stopAutoSlide();
  console.log('⏸️ Auto-slide paused');
}

function resumeAutoSlide() {
  clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => {
    isPaused = false;
    scheduleNextSlide();
    console.log('▶️ Auto-slide resumed');
  }, RESUME_DELAY);
}

/* ============================================
   SWIPE DETECTION (with auto-slide pause)
   ============================================ */

sliderTrack.addEventListener('touchstart', handleTouchStart, { passive: true });
sliderTrack.addEventListener('touchmove', handleTouchMove, { passive: false });
sliderTrack.addEventListener('touchend', handleTouchEnd);

sliderTrack.addEventListener('mousedown', handleMouseDown);
sliderTrack.addEventListener('mousemove', handleMouseMove);
sliderTrack.addEventListener('mouseup', handleMouseEnd);
sliderTrack.addEventListener('mouseleave', handleMouseEnd);

function handleTouchStart(e) {
  startX = e.touches[0].clientX;
  isDragging = true;
  startTransform = currentSlide * -100;
  sliderTrack.style.transition = 'none';
  
  // Pause auto-slide on user interaction
  pauseAutoSlide();
}

function handleTouchMove(e) {
  if (!isDragging) return;
  e.preventDefault();
  
  currentX = e.touches[0].clientX;
  const diffX = currentX - startX;
  const diffPercent = (diffX / window.innerWidth) * 100;
  const newTransform = startTransform + diffPercent;
  
  // Limit drag at edges
  const maxTransform = -(totalSlides - 1) * 100;
  const limitedTransform = Math.max(maxTransform, Math.min(0, newTransform));
  
  sliderTrack.style.transform = `translateX(${limitedTransform}%)`;
}

function handleTouchEnd(e) {
  if (!isDragging) return;
  isDragging = false;
  
  const diffX = currentX - startX;
  const threshold = window.innerWidth * 0.25;
  
  if (Math.abs(diffX) > threshold) {
    if (diffX > 0) {
      goToSlide(Math.max(0, currentSlide - 1));
    } else {
      goToSlide(Math.min(totalSlides - 1, currentSlide + 1));
    }
  } else {
    goToSlide(currentSlide);
  }
  
  // Resume auto-slide after delay
  resumeAutoSlide();
}

function handleMouseDown(e) {
  startX = e.clientX;
  isDragging = true;
  startTransform = currentSlide * -100;
  sliderTrack.style.transition = 'none';
  sliderTrack.style.cursor = 'grabbing';
  
  // Pause auto-slide
  pauseAutoSlide();
}

function handleMouseMove(e) {
  if (!isDragging) return;
  
  currentX = e.clientX;
  const diffX = currentX - startX;
  const diffPercent = (diffX / window.innerWidth) * 100;
  const newTransform = startTransform + diffPercent;
  
  const maxTransform = -(totalSlides - 1) * 100;
  const limitedTransform = Math.max(maxTransform, Math.min(0, newTransform));
  
  sliderTrack.style.transform = `translateX(${limitedTransform}%)`;
}

function handleMouseEnd(e) {
  if (!isDragging) return;
  isDragging = false;
  sliderTrack.style.cursor = 'grab';
  
  const diffX = currentX - startX;
  const threshold = window.innerWidth * 0.25;
  
  if (Math.abs(diffX) > threshold) {
    if (diffX > 0) {
      goToSlide(Math.max(0, currentSlide - 1));
    } else {
      goToSlide(Math.min(totalSlides - 1, currentSlide + 1));
    }
  } else {
    goToSlide(currentSlide);
  }
  
  // Resume auto-slide after delay
  resumeAutoSlide();
}

/* ============================================
   NAVIGATION (with animation triggers)
   ============================================ */

function goToSlide(index) {
  // Track user interaction for behavior-based pacing
  userBehavior.slidesViewed++;
  const now = Date.now();
  const timeSpent = now - userBehavior.startTime;
  userBehavior.swipeSpeed = timeSpent / userBehavior.slidesViewed;

  // Step 6: Subtle exit fade for continuity
  if (typeof gsap !== 'undefined') {
    gsap.to('.slide-card', {
      opacity: 0.92,
      duration: 0.3,
      overwrite: true
    });
  }

  currentSlide = index;
  // Step 5: Smoother spring-like transition easing
  sliderTrack.style.transition = 'transform 1s cubic-bezier(0.22, 1, 0.36, 1)';
  sliderTrack.style.transform = `translateX(-${index * 100}%)`;
  updateDots();

  // Step 6: Re-fade after slide settles
  setTimeout(() => {
    if (typeof gsap !== 'undefined') {
      gsap.to('.slide-card', {
        opacity: 1,
        duration: 0.5
      });
    }
  }, 300);

  // Trigger card entrance animation (if home-animations.js loaded)
  if (typeof window.animateCurrentCard === 'function') {
    window.animateCurrentCard(index);
  }

  // Restart auto-slide timer only for intro slides
  if (!isPaused && !isDragging) {
    stopAutoSlide();
    if (index < INTRO_SLIDE_COUNT) {
      scheduleNextSlide();
    }
  }
}

// Expose for external navigation
window.goToSlide = goToSlide;

function updateDots() {
  dots.forEach((dot, idx) => {
    if (idx === currentSlide) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
}

/* ============================================
   DOT CLICK NAVIGATION
   ============================================ */

dots.forEach((dot, idx) => {
  dot.addEventListener('click', () => {
    pauseAutoSlide(); // Pause on manual navigation
    goToSlide(idx);
    resumeAutoSlide(); // Resume after delay
  });
});

/* ============================================
   KEYBOARD NAVIGATION
   ============================================ */

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') {
    pauseAutoSlide();
    goToSlide(Math.max(0, currentSlide - 1));
    resumeAutoSlide();
  } else if (e.key === 'ArrowRight') {
    pauseAutoSlide();
    goToSlide(Math.min(totalSlides - 1, currentSlide + 1));
    resumeAutoSlide();
  }
});

/* ============================================
   DYNAMIC USER DATA (CARD 6 STATS)
   ============================================ */

function loadUserStats() {
  // This will be populated from Firebase later
  const streakDays = document.getElementById('streakDays');
  const completionRate = document.getElementById('completionRate');
  const totalLessons = document.getElementById('totalLessons');
  const growthPoints = document.getElementById('growthPoints');
  
  // Placeholder values (replace with Firebase auth data)
  if (streakDays) streakDays.textContent = '12';
  if (completionRate) completionRate.textContent = '68';
  if (totalLessons) totalLessons.textContent = '24';
  if (growthPoints) growthPoints.textContent = '+15';
}

/* ============================================
   INITIALIZATION
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  loadUserStats();
  updateDots();
  sliderTrack.style.cursor = 'grab';
  
  // Start auto-slide after 1.5s delay (let intro animation complete)
  setTimeout(() => {
    startAutoSlide();
  }, 1500);
  
  console.log('✅ Premium slider initialized - 9 slides with auto-advance');
});
