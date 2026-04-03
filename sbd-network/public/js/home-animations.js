/**
 * HOME ANIMATIONS - GSAP-powered beyond-Apple-premium animations
 * Intro slides 1-4: Text reveal animations
 * Main cards 5-9: Card-specific animations
 */

// Wait for DOM ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎬 GSAP Animations initialized - 9 slides total');
  
  // Initialize animations for initial slide
  animateIntroSlide1();
});

/**
 * INTRO SLIDE 1-3: Word-by-word fade reveal (elegant)
 */
function animateIntroSlide1() {
  const slide = document.querySelector('[data-card="intro-1"]');
  if (!slide) return;
  
  const words = slide.querySelectorAll('.word');
  
  gsap.timeline({ defaults: { ease: 'power2.out' } })
    .from(words, {
      opacity: 0,
      y: 20,
      filter: 'blur(4px)',
      stagger: 0.22,
      duration: 0.9
    });
}

function animateIntroSlide2() {
  const slide = document.querySelector('[data-card="intro-2"]');
  if (!slide) return;
  
  const words = slide.querySelectorAll('.word');
  
  gsap.timeline({ defaults: { ease: 'power2.out' } })
    .from(words, {
      opacity: 0,
      y: 20,
      filter: 'blur(4px)',
      stagger: 0.22,
      duration: 0.9
    });
}

function animateIntroSlide3() {
  const slide = document.querySelector('[data-card="intro-3"]');
  if (!slide) return;
  
  const words = slide.querySelectorAll('.word');
  
  gsap.timeline({ defaults: { ease: 'power2.out' } })
    .from(words, {
      opacity: 0,
      y: 20,
      filter: 'blur(4px)',
      stagger: 0.22,
      duration: 0.9
    });
}

/**
 * INTRO SLIDE 4: POWER LINE - Same subtle style as slides 1-3
 */
function animateIntroSlide4() {
  const slide = document.querySelector('[data-card="intro-4"]');
  if (!slide) return;
  
  const words = slide.querySelectorAll('.word');
  
  gsap.timeline({ defaults: { ease: 'power2.out' } })
    .from(words, {
      opacity: 0,
      y: 20,
      filter: 'blur(4px)',
      stagger: 0.22,
      duration: 0.9
    });
}

/**
 * CARD 5: MEMBERSHIP - Vertical stack with subtle entrance
 */
function animateCard5() {
  console.log('🎬 animateCard5() FIRING');
  const card = document.querySelector('[data-card="tiers"]');
  console.log('Card element:', card);
  if (!card) {
    console.error('❌ Card [data-card="tiers"] not found!');
    return;
  }
  
  const label = card.querySelector('.membership-label');
  const title = card.querySelector('.membership-title');
  const cards = card.querySelectorAll('.membership-card');
  console.log('Found elements:', { label, title, cards: cards.length });
  
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  // Force visibility BEFORE animation (fix for hidden state)
  gsap.set([label, title, cards], { opacity: 1 });

  tl.fromTo(label, {
    opacity: 0,
    y: 20
  }, {
    opacity: 1,
    y: 0,
    duration: 0.6
  })
  .fromTo(title, {
    opacity: 0,
    y: 20
  }, {
    opacity: 1,
    y: 0,
    duration: 0.7
  }, '-=0.3')
  .fromTo(cards, {
    opacity: 0,
    y: 30
  }, {
    opacity: 1,
    y: 0,
    stagger: 0.1,
    duration: 0.6
  }, '-=0.3');
  
  console.log('✅ Animation timeline created');
}

/**
 * CARD 6: DISCUSSION BOARDS - Community engagement
 */
function animateCard6() {
  const card = document.querySelector('[data-card="boards"]');
  if (!card) return;
  
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  
  tl.from(card.querySelector('.section-label'), {
    opacity: 0,
    y: 20,
    duration: 0.6
  })
  .from(card.querySelector('.card-title'), {
    opacity: 0,
    y: 30,
    duration: 0.8
  }, '-=0.4')
  .from(card.querySelector('.card-subtitle'), {
    opacity: 0,
    y: 20,
    duration: 0.6
  }, '-=0.5')
  .from(card.querySelector('.card-cta'), {
    opacity: 0,
    scale: 0.9,
    duration: 0.5
  }, '-=0.3');
}

/**
 * CARD 7: MV HOUSE - Premium locked with breathing glow
 */
function animateCard7() {
  const card = document.querySelector('[data-card="mv-house"]');
  if (!card) return;
  
  const lockIcon = card.querySelector('.lock-icon');
  
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  
  tl.from(card.querySelector('.premium-badge'), {
    opacity: 0,
    scale: 0,
    duration: 0.5,
    ease: 'back.out(2)'
  })
  .from(card.querySelector('.card-title'), {
    opacity: 0,
    y: 30,
    duration: 0.8
  }, '-=0.3')
  .from(card.querySelector('.card-subtitle'), {
    opacity: 0,
    y: 20,
    duration: 0.6
  }, '-=0.5')
  .from(lockIcon, {
    opacity: 0,
    scale: 0.8,
    duration: 0.6
  }, '-=0.4');
  
  // Lock breathing glow (continuous)
  gsap.to(lockIcon, {
    filter: 'drop-shadow(0 0 20px rgba(198, 163, 132, 0.8))',
    duration: 2,
    repeat: -1,
    yoyo: true,
    ease: 'power1.inOut'
  });
}

/**
 * CARD 8: THE SHOP - Product showcase with stagger
 */
function animateCard8() {
  const card = document.querySelector('[data-card="shop"]');
  if (!card) return;
  
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  
  tl.from(card.querySelector('.section-label'), {
    opacity: 0,
    y: 20,
    duration: 0.6
  })
  .from(card.querySelector('.card-title'), {
    opacity: 0,
    scale: 0.95,
    duration: 0.8
  }, '-=0.4')
  .from(card.querySelectorAll('.product-item'), {
    opacity: 0,
    y: 40,
    stagger: 0.12,
    duration: 0.7
  }, '-=0.5')
  .from(card.querySelector('.browse-link'), {
    opacity: 0,
    duration: 0.5
  }, '-=0.3');
}

/**
 * CARD 9: GROWTH PROFILE - Chart draw + stat count-up
 */
function animateCard9() {
  const card = document.querySelector('[data-card="progress"]');
  if (!card) return;
  
  const chart = card.querySelector('.growth-chart polyline');
  const statValues = card.querySelectorAll('.stat-value');
  
  // Get path length for draw animation
  const pathLength = chart.getTotalLength();
  chart.style.strokeDasharray = pathLength;
  chart.style.strokeDashoffset = pathLength;
  
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  
  tl.from(card.querySelector('.section-label'), {
    opacity: 0,
    y: 20,
    duration: 0.6
  })
  .from(card.querySelector('.card-title'), {
    opacity: 0,
    scale: 0.95,
    duration: 0.8
  }, '-=0.4')
  .to(chart, {
    strokeDashoffset: 0,
    duration: 2,
    ease: 'power2.inOut'
  }, '-=0.5')
  .from(card.querySelectorAll('.stat-card'), {
    opacity: 0,
    scale: 0.9,
    stagger: 0.12,
    duration: 0.6
  }, '-=1.5');
  
  // Number count-up animation
  statValues.forEach(stat => {
    const finalValue = parseInt(stat.textContent);
    gsap.from(stat, {
      innerText: 0,
      duration: 1.5,
      snap: { innerText: 1 },
      ease: 'power1.out',
      onUpdate: function() {
        stat.textContent = Math.round(this.targets()[0].innerText);
      }
    });
  });
}

/**
 * Animate card entrance when sliding to new card
 * Called by home-premium-slider.js
 */
window.animateCurrentCard = function(cardIndex) {
  console.log(`🎬 Animating slide ${cardIndex + 1}/9`);
  // 🔒 Production-safe reset (prevents hidden/ghost states)
  gsap.set('.slide-card *', { clearProps: 'opacity,transform' });
  
  switch(cardIndex) {
    case 0: animateIntroSlide1(); break;
    case 1: animateIntroSlide2(); break;
    case 2: animateIntroSlide3(); break;
    case 3: animateIntroSlide4(); break;
    case 4: animateCard5(); break;
    case 5: animateCard6(); break;
    case 6: animateCard7(); break;
    case 7: animateCard8(); break;
    case 8: animateCard9(); break;
  }
};
