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

// Timing: Intro slides are faster (4.5s), main cards are standard (5s)
const INTRO_SLIDE_DURATION = 6000;  // 6s for text slides — cinematic hold time
const MAIN_CARD_DURATION = 5000;     // 5s for main cards
const RESUME_DELAY = 3000;           // Resume after 3s of no interaction

function getSlideDuration(slideIndex) {
  // Intro slides (0-3) are faster
  return slideIndex < 4 ? INTRO_SLIDE_DURATION : MAIN_CARD_DURATION;
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
  
  autoSlideTimer = setTimeout(() => {
    if (!isPaused && !isDragging) {
      const nextSlide = (currentSlide + 1) % totalSlides; // Loop 0→8→0
      goToSlide(nextSlide);
      scheduleNextSlide(); // Schedule next transition
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

  // Restart auto-slide timer with new duration
  if (!isPaused && !isDragging) {
    stopAutoSlide();
    scheduleNextSlide();
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
