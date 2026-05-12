document.addEventListener("DOMContentLoaded", function () {

  console.log("SLIDER INIT START");

  try {

    // =====================================================
    // ELEMENTS
    // =====================================================

    const track = document.getElementById("sliderTrack");
    const menuBtn = document.getElementById("menuBtn");
    const menuOverlay = document.getElementById("menuOverlay");
    const sideMenu = document.getElementById("sideMenu");

    // =====================================================
    // SLIDES
    // =====================================================

    function getVisibleSlides() {

      return Array.from(
        document.querySelectorAll(".slide-card")
      ).filter(slide => {

        return window.getComputedStyle(slide).display !== "none";

      });

    }

    let slides = getVisibleSlides();

    let total = slides.length;

    let current = 0;

    let isAnimating = false;

    // =====================================================
    // PAGINATION
    // =====================================================

    function renderPagination() {

      const pagination =
        document.getElementById("sliderPagination");

      if (!pagination) return;

      slides = getVisibleSlides();

      total = slides.length;

      pagination.innerHTML = "";

      slides.forEach((slide, index) => {

        const dot = document.createElement("span");

        dot.className = "dot";

        if (index === current) {
          dot.classList.add("active");
        }

        dot.addEventListener("click", function () {
          goTo(index);
        });

        pagination.appendChild(dot);

      });

    }

    function updatePagination(index) {

      const dots = document.querySelectorAll(".dot");

      dots.forEach(dot => {
        dot.classList.remove("active");
      });

      if (dots[index]) {
        dots[index].classList.add("active");
      }

    }

    window.updatePagination = updatePagination;

    // =====================================================
    // MENU
    // =====================================================

    function openMenu() {

      if (sideMenu) {
        sideMenu.classList.add("menu-open");
      }

      if (menuOverlay) {
        menuOverlay.classList.add("menu-overlay-visible");
      }

    }

    function closeMenu() {

      if (sideMenu) {
        sideMenu.classList.remove("menu-open");
      }

      if (menuOverlay) {
        menuOverlay.classList.remove("menu-overlay-visible");
      }

    }

    if (menuBtn) {

      menuBtn.addEventListener("click", function () {

        const isOpen =
          sideMenu &&
          sideMenu.classList.contains("menu-open");

        isOpen ? closeMenu() : openMenu();

      });

    }

    if (menuOverlay) {
      menuOverlay.addEventListener("click", closeMenu);
    }

    // =====================================================
    // GO TO SLIDE
    // =====================================================

    function goTo(index) {

      slides = getVisibleSlides();

      total = slides.length;

      if (!track || isAnimating) return;

      if (index < 0) {
        index = total - 1;
      }

      if (index >= total) {
        index = 0;
      }

      isAnimating = true;

      current = index;

      track.style.transform =
        `translate3d(-${index * 100}%,0,0)`;

      updatePagination(index);

      if (typeof window.onSlideChange === "function") {
        window.onSlideChange(index);
      }

      scheduleNextSlide();

      setTimeout(function () {

        isAnimating = false;

      }, 850);

    }

    // =====================================================
    // NEXT
    // =====================================================

    function next() {

      let n = current + 1;

      if (n >= total) {
        n = 0;
      }

      goTo(n);

    }

    // =====================================================
    // TIMER
    // =====================================================

    let sliderTimer = null;

    function scheduleNextSlide() {

      if (sliderTimer) {
        clearTimeout(sliderTimer);
      }

      slides = getVisibleSlides();

      let duration = 6000;

      if (
        current === 0 &&
        document.body.classList.contains("auth-user")
      ) {
        duration = 12000;
      }

      const curSlide = slides[current];
      if (curSlide && curSlide.dataset.card === "mv-house") {
        const v = curSlide.querySelector("video.video-bg");
        const mvCap =
          typeof window.__sbdMvLeadInCapMs === "number" &&
          window.__sbdMvLeadInCapMs > 0
            ? window.__sbdMvLeadInCapMs
            : 3800;
        const postClipMs = 6500;
        let clipMs = mvCap;
        if (v && isFinite(v.duration) && v.duration > 0.2) {
          clipMs = Math.min(mvCap, Math.ceil(v.duration * 1000));
        }
        duration = Math.min(90000, Math.max(15000, clipMs + postClipMs));
      }

      sliderTimer = setTimeout(function () {

        next();

      }, duration);

    }

    window.__sbdRescheduleAutoSlide = scheduleNextSlide;

    function stopAutoSlide() {

      if (sliderTimer) {

        clearTimeout(sliderTimer);

        sliderTimer = null;

      }

    }

    function startAutoSlide() {

      scheduleNextSlide();

    }

    // =====================================================
    // SWIPE
    // =====================================================

    let touchStartX = 0;
    let touchStartY = 0;

    if (track) {

      track.addEventListener("touchstart", function (e) {

        touchStartX =
          e.touches[0].clientX;

        touchStartY =
          e.touches[0].clientY;

        stopAutoSlide();

      }, { passive: true });

      track.addEventListener("touchend", function (e) {

        const diffX =
          touchStartX -
          e.changedTouches[0].clientX;

        const diffY =
          touchStartY -
          e.changedTouches[0].clientY;

        const isHorizontalSwipe =
          Math.abs(diffX) > Math.abs(diffY);

        if (isHorizontalSwipe && diffX > 50) {

          goTo(current + 1);

        } else if (isHorizontalSwipe && diffX < -50) {

          let prev = current - 1;

          if (prev < 0) {
            prev = total - 1;
          }

          goTo(prev);

        }

        startAutoSlide();

      });

    }

    // =====================================================
    // RESIZE
    // =====================================================

    window.addEventListener("resize", function () {

      if (!track) return;

      track.classList.add("transition-disabled");

      track.style.transform =
        `translate3d(-${current * 100}%,0,0)`;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          track.classList.remove("transition-disabled");
        });
      });

    });

    // =====================================================
    // PAGE VISIBILITY
    // =====================================================

    document.addEventListener("visibilitychange", function () {

      if (document.hidden) {

        stopAutoSlide();

      } else {

        startAutoSlide();

      }

    });

    // =====================================================
    // INIT
    // =====================================================

    if (track) {

      renderPagination();

      goTo(0);

    }

    window.goToSlide = goTo;

    console.log(
      "SLIDER INIT SUCCESS — slides:",
      total
    );

  } catch (err) {

    console.error(
      "SLIDER ERROR:",
      err
    );

  }

});