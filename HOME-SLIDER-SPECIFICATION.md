# HOME Slider Complete Specification
**Source:** Home video.mov analysis  
**Video Duration:** 25.55s | **Resolution:** 2240x1306 | **FPS:** 59.84  
**Total Cards:** 7 (CONFIRMED via motion detection)

---

## Design System

### Colors
```css
--bg-primary: #0A0A0A      /* Deep black background */
--bg-card: #1A1A1A         /* Card backgrounds */
--gold: #C6A384            /* Gold accent */
--text-primary: #FFFFFF    /* Headlines, main text */
--text-secondary: #9B9B9B  /* Subtitles, descriptions */
--text-muted: #6B6B6B      /* Labels, metadata */
```

### Typography
- **Font Family:** SF Pro Display (Apple system font)
- **Section Labels:** 11px, 0.15em letter-spacing, uppercase, #6B6B6B
- **Headlines:** 52px, weight 400, #FFFFFF
- **Subtitles:** 16px, #9B9B9B
- **Button Text:** 14px, uppercase, white on gold gradient

### Components
- **Button Style:** 18px padding, 12px border-radius
- **Card Padding:** 40px
- **Card Border Radius:** 16px
- **Transition Curves:** cubic-bezier(0.4, 0, 0.2, 1)

---

## Timeline & Animation Data

| Card | Start | End | Duration | Frames | Key Characteristics |
|------|-------|-----|----------|--------|---------------------|
| **1** | 0.00s | 1.10s | **1.10s** | 0-66 | Shortest - Entry card |
| **2** | 1.10s | 7.42s | **6.32s** | 66-444 | **LONGEST** - Has interactions |
| **3** | 7.42s | 10.98s | **3.56s** | 444-657 | Medium duration |
| **4** | 10.98s | 16.09s | **5.11s** | 657-963 | Second longest |
| **5** | 16.09s | 18.55s | **2.46s** | 963-1110 | Quick view |
| **6** | 18.55s | 21.86s | **3.31s** | 1110-1308 | Medium duration |
| **7** | 21.86s | 25.55s | **3.69s** | 1308-1529 | Final card |

### Transition Motion Intensity
- **Card 2:** 10.10 (strongest swipe)
- **Card 4:** 8.79 (second strongest)
- **Card 3:** 6.70
- **Card 6:** 6.80
- **Card 5:** 6.47 (gentlest swipe)

---

## Card 1: THE AWAKENING
**Duration:** 1.10s | **Frame:** 0

### Known Structure (from current build):
- **Label:** "THE AWAKENING" (section-label style)
- **Headline:** "BEGIN YOUR ASCENT"
- **Subtitle:** "Your transformation starts with a single step"
- **Button:** "ENTER THE JOURNEY" (gold gradient CTA)

### Visual Elements:
- Background: Chiaroscuro hands photo (hands-chiaroscuro.png)
- Style: Editorial photography, dramatic lighting
- Layout: Centered content with large photo backdrop

### Animation (Entry):
- Duration: 1.10s before swipe
- Fade-in headline: 0.6s delay
- Fade-in button: 0.8s delay
- Photo zoom: Subtle 1.05x scale on load

---

## Card 2: MEMBERSHIP TIERS
**Duration:** 6.32s (LONGEST) | **Frame:** 66

### Known Structure:
```html
<div class="tier-list">
  <div class="tier-item">
    <div class="tier-name">EXPLORER</div>
    <div class="tier-price">$27</div>
  </div>
  <div class="tier-item tier-featured">
    <div class="tier-name">PREMIUM</div>
    <div class="tier-price">$300</div>
    <span class="popular-badge">POPULAR</span>
  </div>
  <div class="tier-item">
    <div class="tier-name">ELITE</div>
    <div class="tier-price">$997</div>
  </div>
</div>
```

### Visual Elements:
- Vertical list of 3 membership tiers
- PREMIUM tier highlighted with gold border
- "POPULAR" badge (gold, 8px border-radius)
- Pricing displayed prominently

### Animation Hypothesis (6.32s suggests interactions):
- Staggered fade-in of tiers: 0.2s, 0.4s, 0.6s
- POPULAR badge pulse animation?
- Hover states on desktop?
- Possible micro-interactions during long display time

### TODO - Verify from Frame 66:
- [ ] Exact headline text
- [ ] Button text/presence
- [ ] Additional features listed per tier
- [ ] Photo/background treatment
- [ ] Why 6.32s? (longest card - user studying pricing?)

---

## Card 3: DISCUSSION BOARDS
**Duration:** 3.56s | **Frame:** 444

### Known Structure (from current build):
- **Theme:** Community engagement
- **Label:** "DISCUSSION BOARDS" (inferred)
- **Headline:** [NEED TO VERIFY]
- **Button:** "JOIN THE CONVERSATION" (inferred)

### TODO - Extract from Frame 444:
- [ ] Exact label text
- [ ] Headline copy
- [ ] Subtitle/description
- [ ] Visual elements (icons, photos)
- [ ] Layout structure
- [ ] Community stats displayed?

---

## Card 4: MV HOUSE (LOCKED)
**Duration:** 5.11s (second longest) | **Frame:** 657

### Known Structure:
```html
<div class="lock-icon">
  <svg viewBox="0 0 24 24">
    <path d="M18,8h-1V6c0-2.76-2.24-5-5-5S7,3.24,7,6v2H6c-1.1,0-2,0.9-2,2v10c0,1.1,0.9,2,2,2h12c1.1,0,2-0.9,2-2V10C20,8.9,19.1,8,18,8z M12,17c-1.1,0-2-0.9-2-2s0.9-2,2-2s2,0.9,2,2S13.1,17,12,17z M15.1,8H8.9V6c0-1.71,1.39-3.1,3.1-3.1c1.71,0,3.1,1.39,3.1,3.1V8z"/>
  </svg>
</div>
```

### Visual Elements:
- Lock icon (SVG, likely gold color)
- "LOCKED" or "COMING SOON" messaging
- Premium/exclusive positioning

### Animation (5.11s - curiosity/exclusivity):
- Lock icon pulse or glow effect?
- Shake on interaction attempt?
- Gold shimmer effect?

### TODO - Verify from Frame 657:
- [ ] Exact headline ("MV HOUSE" or different?)
- [ ] Subtitle explaining exclusivity
- [ ] Unlock requirements messaging
- [ ] Photo background (house/mansion?)
- [ ] Color scheme variations

---

## Card 5: THE SHOP
**Duration:** 2.46s (quickest view) | **Frame:** 963

### Known Structure:
```html
<div class="product-list">
  <div class="product-item">
    <img src="product-1.jpg">
    <div class="product-name">SBD FRAMEWORK BUNDLE</div>
    <div class="product-price">$97</div>
  </div>
  <div class="product-item">
    <img src="product-2.jpg">
    <div class="product-name">ELITE COACHING SESSION</div>
    <div class="product-price">$297</div>
  </div>
  <div class="product-item">
    <img src="product-3.jpg">
    <div class="product-name">MARRIAGE MASTERY COURSE</div>
    <div class="product-price">$497</div>
  </div>
</div>
```

### Visual Elements:
- 3 product cards with images
- Product names and pricing
- Grid or vertical layout

### Animation (2.46s - quick browse):
- Fast stagger: 0.1s between products
- Button: "BROWSE SHOP"

### TODO - Verify from Frame 963:
- [ ] Actual product names/images
- [ ] Exact pricing
- [ ] Layout: horizontal or vertical grid?
- [ ] Background photo/treatment

---

## Card 6: GROWTH PROFILE
**Duration:** 3.31s | **Frame:** 1110

### Known Structure:
```html
<svg class="growth-chart">
  <polyline points="0,80 25,60 50,40 75,30 100,20"/>
</svg>

<div class="stats-grid">
  <div class="stat-item">
    <div class="stat-value">2,847</div>
    <div class="stat-label">Active Members</div>
  </div>
  <div class="stat-item">
    <div class="stat-value">94%</div>
    <div class="stat-label">Success Rate</div>
  </div>
  <div class="stat-item">
    <div class="stat-value">$12.4M</div>
    <div class="stat-label">Revenue Generated</div>
  </div>
  <div class="stat-item">
    <div class="stat-value">156</div>
    <div class="stat-label">Countries</div>
  </div>
</div>
```

### Visual Elements:
- SVG line chart (growth trajectory)
- 2x2 stats grid
- Data visualization theme

### Animation:
- Chart line draw animation (2s)
- Stats count-up animation
- Stagger: 0.15s between stats

### TODO - Verify from Frame 1110:
- [ ] Exact stat values
- [ ] Headline text
- [ ] Chart style (color, stroke width)
- [ ] Additional data points

---

## Card 7: [TITLE TBD]
**Duration:** 3.69s | **Frame:** 1308  
**Status:** ⚠️ NOT YET BUILT - Missing from current HTML

### Frame Extracted:
- ✅ card_7.png available (639KB)
- ⏳ Awaiting visual analysis

### TODO - Complete Specification from Frame 1308:
- [ ] Section label text
- [ ] Headline copy
- [ ] Subtitle/description
- [ ] Button text and action
- [ ] Visual elements (photos, icons, graphics)
- [ ] Layout structure
- [ ] Color scheme variations
- [ ] Animation choreography
- [ ] Purpose in slider sequence (closing card?)

### Hypotheses (to validate):
- **Closing/CTA Card?** (last in sequence, moderate duration)
- **Call-to-Action:** "GET STARTED NOW" or similar
- **Summary Card:** Recap of journey/offerings
- **Contact/Support:** Help resources
- **Social Proof:** Testimonials or community size

---

## Slider Mechanics

### Swipe Behavior
```javascript
// Touch/Mouse Detection
let startX, currentX;
const threshold = 50; // px minimum swipe

// Snap Animation
transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);

// Card Width: 100vw
// Total Width: 700vw (7 cards)
```

### Navigation
- Dots: 7 dots (one per card)
- Active dot: Gold color (#C6A384)
- Inactive dots: #6B6B6B
- Auto-advance: Optional (disable for user control)

### Performance
- Hardware acceleration: `transform: translateZ(0);`
- Will-change: `will-change: transform;`
- 60fps target on 59.84fps source material

---

## Implementation Checklist

### Phase 1: Visual Specification (CURRENT)
- [x] Extract all 7 card frames
- [x] Analyze timing data
- [x] Document known structures (Cards 1-6)
- [ ] **Complete Card 7 specification** ⬅️ IMMEDIATE
- [ ] Verify all cards match extracted frames
- [ ] Document all text content exactly
- [ ] Note all visual elements per card

### Phase 2: HTML Structure
- [ ] Add Card 7 to home-premium.html
- [ ] Verify all cards match specifications
- [ ] Update pagination (6 dots → 7 dots)
- [ ] Ensure semantic HTML structure
- [ ] Add proper ARIA labels

### Phase 3: CSS Refinement
- [ ] Add Card 7 styles to home-premium.css
- [ ] Verify all measurements match video
- [ ] Add transition timing from motion data
- [ ] Implement responsive breakpoints
- [ ] Add mobile-specific optimizations

### Phase 4: Animation Implementation
- [ ] Add GSAP library
- [ ] Implement card entrance animations:
  - Card 1: 1.10s choreography
  - Card 2: 6.32s with interactions
  - Card 3: 3.56s timing
  - Card 4: 5.11s with lock effects
  - Card 5: 2.46s quick browse
  - Card 6: 3.31s with chart draw
  - Card 7: 3.69s closing sequence
- [ ] Add transition animations between cards
- [ ] Implement swipe feedback (elastic bounce)
- [ ] Add button hover/press micro-interactions

### Phase 5: Photo Sourcing
- [x] Card 1: Chiaroscuro hands ✅
- [ ] Card 2: Membership background
- [ ] Card 3: Discussion boards visual
- [ ] Card 4: MV House photo
- [ ] Card 5: 3 product images
- [ ] Card 6: Growth/data background
- [ ] Card 7: Final card background
- [ ] Optimize all as WebP format

### Phase 6: Testing & Deployment
- [ ] Test all 7 cards locally
- [ ] Verify animations at 60fps
- [ ] Test swipe on iOS Safari (primary)
- [ ] Test on Android Chrome
- [ ] Test on desktop (Chrome, Safari, Firefox)
- [ ] Performance audit (Lighthouse)
- [ ] Deploy to Firebase
- [ ] User acceptance testing

---

## Animation Timing Reference

### Entrance Choreography (per card load)
```javascript
// Example for Card 1
timeline.to('.label', { opacity: 1, y: 0, duration: 0.4, delay: 0.2 })
        .to('.headline', { opacity: 1, y: 0, duration: 0.6, delay: 0.3 }, '<0.2')
        .to('.subtitle', { opacity: 1, y: 0, duration: 0.4, delay: 0.2 }, '<0.1')
        .to('.button', { opacity: 1, scale: 1, duration: 0.5 }, '<0.2');
```

### Transition Timing (between cards)
- **Base Duration:** 0.6s cubic-bezier(0.4, 0, 0.2, 1)
- **Motion Intensity Mapping:**
  - 6.0-7.0: Gentle swipe (0.6s)
  - 7.0-9.0: Medium swipe (0.5s)
  - 9.0+: Strong swipe (0.4s faster response)

### Card 2 Special Timing (6.32s analysis)
Hypothesis: Longest duration suggests user interaction or multiple states
- **State 1 (0-2s):** Tier list reveal
- **State 2 (2-4s):** Feature comparison highlights
- **State 3 (4-6s):** Pricing emphasis / decision time
- Consider: Hover states, tooltip reveals, or animated feature badges

---

## Critical Questions for Frame Analysis

### Card 7 (Frame 1308) - PRIORITY
1. What is the section label?
2. What is the headline text?
3. What is the subtitle/description?
4. What is the button text?
5. What visual elements are present?
6. What is the background photo/color?
7. What is the purpose/message of this card?
8. Is it a closing CTA, summary, or something else?

### All Cards - Verification
1. Do text elements match what's in current HTML?
2. Are there additional elements not yet captured?
3. What are the exact typography sizes and weights?
4. Are there animations visible in video (text reveals, icon movements)?
5. How do photos integrate with content?
6. Are there overlay effects (gradients, vignettes)?
7. Do any cards have background videos or motion?

---

## Files & Resources

### Video Source
- **Path:** `/Users/achugustave/Documents/Marriageducation/homeimages/Home video.mov`
- **Size:** 38MB
- **Format:** QuickTime H.264 + AAC

### Extracted Frames
- `card_1.png` - 0.00s (Frame 0)
- `card_2.png` - 1.10s (Frame 66)
- `card_3.png` - 7.42s (Frame 444)
- `card_4.png` - 10.98s (Frame 657)
- `card_5.png` - 16.09s (Frame 963)
- `card_6.png` - 18.55s (Frame 1110)
- `card_7.png` - 21.86s (Frame 1308) ⬅️ NEW

### Data Files
- `slider_timing.json` - Complete timing and transition data
- `analyze_slider.py` - Motion detection script (working)
- `analyze_video.py` - Scene detection script (not suitable for smooth transitions)

### Production Files
- `public/home-premium.html` - Main slider markup
- `public/css/home-premium.css` - All styling
- `public/js/home-premium-slider.js` - Swipe mechanics
- `public/assets/images/hands-chiaroscuro.png` - Card 1 background

---

## Next Actions

### IMMEDIATE (RIGHT NOW)
1. **Review extracted card frames** (opened in Preview.app)
2. **Document Card 7 complete specification**
3. **Verify Cards 2-6 match current HTML**
4. **Note any discrepancies between video and code**

### AFTER SPECIFICATION COMPLETE
5. Add Card 7 to HTML
6. Implement animation timing from motion data
7. Source remaining photos
8. Test and deploy complete 7-card slider

---

**STATUS:** Specification in progress | 6/7 cards documented | Card 7 awaiting analysis  
**BLOCKER:** None - all frames extracted and viewable  
**READY TO BUILD:** After Card 7 specification and verification of Cards 2-6
