/* ============================================
   CINEMATIC SLIDER - SWIPE & SNAP MECHANICS
   ============================================ */

let currentSlide = 0;
const sliderTrack = document.getElementById('sliderTrack');
const dots = document.querySelectorAll('.dot');
const totalSlides = 6;

let startX = 0;
let currentX = 0;
let isDragging = false;
let startTransform = 0;

/* ============================================
   SWIPE DETECTION
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
}

function handleMouseDown(e) {
  startX = e.clientX;
  isDragging = true;
  startTransform = currentSlide * -100;
  sliderTrack.style.transition = 'none';
  sliderTrack.style.cursor = 'grabbing';
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
}

/* ============================================
   NAVIGATION
   ============================================ */

function goToSlide(index) {
  currentSlide = index;
  sliderTrack.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
  sliderTrack.style.transform = `translateX(-${index * 100}%)`;
  updateDots();
}

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
    goToSlide(idx);
  });
});

/* ============================================
   KEYBOARD NAVIGATION
   ============================================ */

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') {
    goToSlide(Math.max(0, currentSlide - 1));
  } else if (e.key === 'ArrowRight') {
    goToSlide(Math.min(totalSlides - 1, currentSlide + 1));
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
  
  // Placeholder values (replace with Firebase auth data)
  if (streakDays) streakDays.textContent = '7';
  if (completionRate) completionRate.textContent = '42%';
  if (totalLessons) totalLessons.textContent = '12';
}

document.addEventListener('DOMContentLoaded', () => {
  loadUserStats();
  updateDots();
  sliderTrack.style.cursor = 'grab';
});
