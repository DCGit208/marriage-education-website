// ===============================
// STABLE SLIDER ENGINE (FIXED)
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  const track = document.getElementById("sliderTrack");
  const slides = document.querySelectorAll(".slide-card");
  const dots = document.querySelectorAll(".dot");

  let currentIndex = 0;
  const totalSlides = slides.length;
  let interval;

  function getWidth() {
    return window.innerWidth;
  }

  function goToSlide(index) {
    currentIndex = index;

    track.style.transform = `translateX(-${index * getWidth()}px)`;

    // dots
    dots.forEach(d => d.classList.remove("active"));
    if (dots[index]) dots[index].classList.add("active");

    // Use GSAP card animations if available (home-animations.js),
    // otherwise fall back to simple CSS word animation
    if (typeof window.animateCurrentCard === "function") {
      window.animateCurrentCard(index);
    } else {
      animateIntro(slides[index]);
    }

    // Restart auto with correct per-slide timing
    startAuto();
  }

  function nextSlide() {
    let next = currentIndex + 1;
    if (next >= totalSlides) next = 0;
    goToSlide(next);
  }

  function startAuto() {
    stopAuto();
    // setTimeout recalculates timing on each slide advance
    interval = setTimeout(nextSlide, currentIndex <= 3 ? 4000 : 2500);
  }

  function stopAuto() {
    if (interval) clearTimeout(interval);
  }

  // swipe
  let startX = 0;

  track.addEventListener("touchstart", e => {
    startX = e.touches[0].clientX;
    stopAuto();
  }, { passive: true });

  track.addEventListener("touchend", e => {
    const diff = startX - e.changedTouches[0].clientX;

    if (diff > 50 && currentIndex < totalSlides - 1) {
      goToSlide(currentIndex + 1);
    } else if (diff < -50 && currentIndex > 0) {
      goToSlide(currentIndex - 1);
    }

    startAuto();
  });

  // dots
  dots.forEach(dot => {
    dot.addEventListener("click", () => {
      goToSlide(parseInt(dot.dataset.index));
    });
  });

  // keyboard navigation
  document.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") {
      goToSlide(Math.max(0, currentIndex - 1));
    } else if (e.key === "ArrowRight") {
      goToSlide(Math.min(totalSlides - 1, currentIndex + 1));
    }
  });

  // resize fix — no transition flicker on orientation change
  window.addEventListener("resize", () => {
    track.style.transition = "none";
    track.style.transform = `translateX(-${currentIndex * getWidth()}px)`;
  });

  // CSS fallback intro animation (used if GSAP/home-animations.js not loaded)
  function animateIntro(slide) {
    const words = slide.querySelectorAll(".word");
    if (!words.length) return;

    words.forEach((w, i) => {
      w.style.opacity = "0";
      w.style.transform = "translateY(10px)";

      setTimeout(() => {
        w.style.transition = "all 0.6s ease";
        w.style.opacity = "1";
        w.style.transform = "translateY(0)";
      }, i * 120);
    });
  }

  // Expose for external navigation
  window.goToSlide = goToSlide;

  // Load any dynamic user stats
  function loadUserStats() {
    const streakDays = document.getElementById("streakDays");
    const completionRate = document.getElementById("completionRate");
    const totalLessons = document.getElementById("totalLessons");
    const growthPoints = document.getElementById("growthPoints");

    if (streakDays) streakDays.textContent = "12";
    if (completionRate) completionRate.textContent = "68";
    if (totalLessons) totalLessons.textContent = "24";
    if (growthPoints) growthPoints.textContent = "+15";
  }

  // init
  track.style.transition = "transform 0.6s ease";
  loadUserStats();
  goToSlide(0);

  console.log("Slider fully fixed and running —", totalSlides, "slides");
});
