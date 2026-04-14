# HOME Slider Build Plan - Beyond Apple Premium

## Vision
**6 cards. 6 nav items. Continuous sliding. Card 1 animated text. Super powerful animations beyond any app.**

---

## Phase 1: Animation Foundation (15 min)
**Status:** Ready to build  
**Goal:** Set up GSAP animation library and core infrastructure

### Tasks:
1. Add GSAP CDN (core + SplitText plugin)
2. Set up animation timeline controller
3. Add continuous auto-slide mechanism (6 cards loop)
4. Implement smooth swipe with momentum

### Technical Stack:
```html
<!-- GSAP Core -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<!-- ScrollTrigger (for scroll-based effects) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<!-- SplitText (for text animations) -->
<script src="https://unpkg.com/split-type"></script>
```

### Key Animations:
- **Auto-slide**: 5s per card, continuous loop
- **Swipe**: Elastic momentum, snap-back
- **Transitions**: Cubic bezier with anticipation

---

## Phase 2: Card 1 - Animated Text (20 min)
**Status:** Ready to build  
**Goal:** Create jaw-dropping text animation for hero card

### Animation Sequence:
```javascript
// Split text into characters/words
const title = new SplitType('.card-title', { types: 'chars, words' })

// Stagger animation timeline
gsap.timeline({ defaults: { ease: 'power4.out' } })
  .from('.section-label', { opacity: 0, y: 20, duration: 0.6 })
  .from(title.chars, { 
    opacity: 0, 
    y: 50, 
    rotateX: -90,
    stagger: 0.02,
    duration: 0.8 
  }, '-=0.3')
  .from('.card-cta', { 
    opacity: 0, 
    scale: 0.8, 
    duration: 0.6 
  }, '-=0.4')
```

### Effects:
- **Label**: Fade + slide up (0.6s)
- **Title**: Character stagger with 3D rotation (0.8s, 0.02s stagger)
- **Button**: Scale + fade (0.6s)
- **Background**: Slow parallax zoom (10s)

### Polish:
- Chiaroscuro hands photo with slow Ken Burns zoom
- Gradient text shimmer on title
- Button glow pulse on hover
- Touch ripple feedback

---

## Phase 3: Cards 2-3 Content Enhancement (15 min)
**Status:** Ready to build  
**Goal:** Polish membership tiers and discussion boards

### Card 2: Learning Tiers
**Enhancements:**
- Stagger tier reveal (0.15s between tiers)
- POPULAR badge pulse animation
- Hover states: Gold border glow
- Feature list fade-in cascade
- Premium tier highlights with spotlight effect

**Animation Timeline:**
```javascript
gsap.timeline()
  .from('.tier-row', {
    opacity: 0,
    x: -50,
    stagger: 0.15,
    duration: 0.6
  })
  .from('.popular-badge', {
    scale: 0,
    rotate: -15,
    duration: 0.4
  })
```

### Card 3: Discussion Boards
**Enhancements:**
- Community stats counter animation
- Live activity indicators (fake pulse dots)
- Topic tags with hover effects
- "JOIN" button with magnetic cursor follow

---

## Phase 4: Cards 4-6 Advanced Features (20 min)
**Status:** Ready to build  
**Goal:** Premium lock, shop showcase, analytics visualization

### Card 4: MV House (Locked)
**Premium Exclusivity:**
- Lock icon: Breathing glow animation
- Unlock animation when user has premium
- Keyhole light beam effect
- Shake on tap (haptic-like)

```javascript
gsap.to('.lock-icon', {
  boxShadow: '0 0 30px rgba(198, 163, 132, 0.8)',
  duration: 2,
  repeat: -1,
  yoyo: true
})
```

### Card 5: Shop
**Product Showcase:**
- Product cards slide in from bottom
- Hover: 3D tilt effect (perspective transform)
- Price highlight with gold shimmer
- Quick-add button with spring animation

### Card 6: Analytics
**Data Visualization:**
- Line chart draws progressively (2s)
- Stats count up animation (number tween)
- Stat cards cascade in (0.12s stagger)
- Progress bars animate to values

```javascript
// Chart line animation
gsap.from('.growth-chart polyline', {
  strokeDashoffset: 1000,
  strokeDasharray: 1000,
  duration: 2,
  ease: 'power2.inOut'
})

// Number count-up
gsap.to('.stat-value', {
  innerText: targetValue,
  duration: 1.5,
  snap: { innerText: 1 },
  ease: 'power1.out'
})
```

---

## Phase 5: Continuous Auto-Slide (10 min)
**Status:** Ready to build  
**Goal:** Smooth infinite looping with user control

### Auto-Advance Logic:
```javascript
const SLIDE_DURATION = 5000 // 5s per card
let currentCard = 0
let autoSlideTimer = null
let isPaused = false

function autoSlide() {
  if (!isPaused) {
    currentCard = (currentCard + 1) % 6 // Loop 0→5→0
    goToSlide(currentCard)
  }
  autoSlideTimer = setTimeout(autoSlide, SLIDE_DURATION)
}

// Pause on user interaction
sliderTrack.addEventListener('touchstart', () => {
  isPaused = true
  clearTimeout(autoSlideTimer)
})

// Resume after 3s of no interaction
let resumeTimer
sliderTrack.addEventListener('touchend', () => {
  clearTimeout(resumeTimer)
  resumeTimer = setTimeout(() => {
    isPaused = false
    autoSlide()
  }, 3000)
})
```

### Transition Polish:
- Elastic easing: `cubic-bezier(0.68, -0.55, 0.27, 1.55)`
- Momentum swipe with velocity calculation
- Snap to nearest card (threshold: 15% width)
- Pagination dots update with scale animation

---

## Phase 6: Beyond Apple Premium (15 min)
**Status:** Final polish  
**Goal:** Micro-interactions that feel magical

### Advanced Techniques:

#### 1. Parallax Depth Layers
```css
.card-bg {
  transform: translateZ(-100px) scale(1.1);
}
.card-content {
  transform: translateZ(0);
}
```

#### 2. Magnetic Buttons
```javascript
button.addEventListener('mousemove', (e) => {
  const rect = button.getBoundingClientRect()
  const x = e.clientX - rect.left - rect.width / 2
  const y = e.clientY - rect.top - rect.height / 2
  
  gsap.to(button, {
    x: x * 0.3,
    y: y * 0.3,
    duration: 0.3
  })
})
```

#### 3. Text Shimmer Effect
```css
.card-title {
  background: linear-gradient(
    90deg,
    #fff 0%,
    #C6A384 40%,
    #fff 60%,
    #C6A384 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shimmer 3s linear infinite;
}

@keyframes shimmer {
  to { background-position: 200% 0; }
}
```

#### 4. Glassmorphism Navigation
```css
.bottom-nav {
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  background: rgba(10, 10, 10, 0.8);
  border-top: 1px solid rgba(198, 163, 132, 0.1);
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.5);
}
```

#### 5. Haptic Feedback (iOS)
```javascript
if (navigator.vibrate) {
  navigator.vibrate(10) // 10ms vibration
}
```

#### 6. Smooth State Transitions
```javascript
// Card entrance animation on slide change
function animateCardEntrance(card) {
  const tl = gsap.timeline()
  
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
  .from(card.querySelectorAll('.tier-row, .product-item, .stat-card'), {
    opacity: 0,
    y: 30,
    stagger: 0.12,
    duration: 0.6
  }, '-=0.6')
}
```

---

## Phase 7: Mobile Optimization (10 min)
**Status:** Final testing  
**Goal:** Perfect on iOS Safari (primary device)

### Optimizations:
- **Touch area**: 44x44px minimum (Apple HIG)
- **Viewport height**: 100vh → 100dvh (avoid address bar)
- **Fonts**: preload SF Pro Display
- **Images**: WebP format, lazy loading
- **Performance**: GPU acceleration, will-change

### iOS-Specific:
```css
body {
  /* Prevent bounce scroll */
  overscroll-behavior: none;
  
  /* Safe area padding */
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  
  /* Disable text selection */
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
```

---

## Success Metrics

### Performance:
- **60fps animations** (no dropped frames)
- **First paint**: < 1.5s
- **Lighthouse score**: 95+ (Performance)
- **Bundle size**: < 200KB (excluding images)

### User Experience:
- **Text legibility**: WCAG AAA (4.5:1 contrast)
- **Touch targets**: 44x44px minimum
- **Animation smoothness**: Butter-smooth on iPhone 12+
- **Load time**: < 3s on 4G

### Quality Bar:
- ✅ Better than Apple.com homepage
- ✅ Better than Tesla.com transitions
- ✅ Better than Stripe.com animations
- ✅ Unique to our brand (not generic)

---

## File Structure

```
sbd-network/public/
├── home-premium.html           ← Main HTML (update)
├── css/
│   └── home-premium.css        ← Styles (enhance)
├── js/
│   ├── home-slider.js          ← NEW: Slider logic
│   ├── home-animations.js      ← NEW: GSAP animations
│   └── home-interactions.js    ← NEW: Micro-interactions
└── assets/
    └── images/
        └── hands-chiaroscuro.png ← Card 1 (exists)
```

---

## Build Order (Time-Boxed)

| Phase | Duration | Deliverable | Test Point |
|-------|----------|-------------|------------|
| **1** | 15 min | GSAP setup + auto-slide | Continuous sliding works |
| **2** | 20 min | Card 1 animated text | Text stagger perfect |
| **3** | 15 min | Cards 2-3 enhanced | Tiers + boards animated |
| **4** | 20 min | Cards 4-6 advanced | Lock glow, chart draw works |
| **5** | 10 min | Auto-slide polish | Smooth infinite loop |
| **6** | 15 min | Premium micro-interactions | Magnetic buttons, shimmer |
| **7** | 10 min | Mobile testing | Perfect on iOS Safari |

**Total**: 105 minutes (~1h 45m)

---

## Next Action

**START PHASE 1**: Add GSAP library, set up slider controller, implement continuous auto-slide.

Would you like me to proceed with Phase 1 now?
