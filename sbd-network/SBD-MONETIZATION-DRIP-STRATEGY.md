# SBD Network — Monetization & Content Delivery Strategy
> **Prepared:** April 13, 2026  
> **Author:** GitHub Copilot (Claude Sonnet 4.6) — for Dr. Coach Achu Gustave  
> **Status:** ✅ ALL THREE DECISIONS LOCKED — April 13, 2026. Master Prompt canonical. Ready for build.  
> **Source documents:** `SBD-ACADEMY-LEARNING-SYSTEM.md`, `FORMATION-SYSTEM-BUILD-GUIDE.md`, `tier-access.js`

---

## ⚡ DECISIONS UPDATE — April 13, 2026

| Decision | Status | Choice |
|----------|--------|--------|
| 1 — Foundation drip scope | ✅ **LOCKED** | **Full drip — Teleios 6wks + SBD 13wks. LIMITED School 1 preview. All else VISIBLE + LOCKED.** |
| 2 — Premium upgrade incentive | ✅ **LOCKED** | **More parallel courses, same 7–10 day drip pace. Upgrades = more lanes, never faster speed.** |
| 3 — Re-subscribe clock | ✅ **LOCKED** | **Resume — pick up exactly where they left off** |

---

## 1. What's Already Decided & Deployed

### Cancellation Policy (Live in Code — v244)
- **1-month grace period** after subscription lapses — content in progress stays readable
- **After 1 month:** user drops to Free tier, progress is lost
- **Stripe webhook:** `customer.subscription.deleted` → sets user to `tier: free` in Firestore (deployed)

### Stripe Pricing (Live)
| Tier | Price | Stripe Status |
|------|-------|---------------|
| Foundation | $9/mo | ✅ Live |
| Premium | $20/mo | ✅ Live |
| Elite | $50/mo | ✅ Live |

---

## 2. Content Per Tier — Full Breakdown

| | 🌱 Free | 🏗 Foundation | ⚡ Premium | 👑 Elite |
|--|:-------:|:-------------:|:---------:|:--------:|
| **Price** | $0 | $9/mo | $20/mo | $50/mo |
| Teleios Blueprint | Week 1 only | ✅ 6 weeks | ✅ 6 weeks | ✅ 6 weeks |
| SBD For Dummies | ❌ | ✅ 13 weeks | ✅ 13 weeks | ✅ 13 weeks |
| School 1 — Teleios (13 courses) | ❌ | Progressive | ✅ Full | ✅ Full |
| School 2 — Sexual Literacy (15 courses) | ❌ | ❌ | ✅ Full | ✅ Full |
| School 3 — Marriage Systems (8 courses) | ❌ | ❌ | ❌ | ✅ Full |
| School 4 — Civilization (8 courses) | ❌ | ❌ | ❌ | ✅ Full |
| MV House + Advanced Boards (AMTS/Virility) | ❌ | ❌ | ❌ | ✅ |
| **Total courses accessible** | preview | 2 courses | 28 courses | 44 courses |
| **Total portfolio value streaming** | — | $644 | $7,149 | $11,499 |

### School Breakdown for Reference
| School | Courses | Avg Weeks/Course | Total Weeks | Tier |
|--------|---------|-----------------|-------------|------|
| 🟦 School 1 — Teleios | 13 | 5.3 | ~69 | Foundation (progressive) / Premium (full) |
| 🟩 School 2 — Sexual Literacy | 15 | 6.5 | ~98 | Premium+ |
| 🟧 School 3 — Marriage Systems | 8 | 5.5 | ~44 | Elite only |
| 🟫 School 4 — Civilization | 8 | 6.0 | ~48 | Elite only |
| **Total** | **44** | — | **~259 weeks** | — |

---

## 3. The Core Problem: Time-Drip Is NOT Built Yet

> **This is the critical gap.** The course labels ("6-week course", "13-week course") describe design intent — but the code does NOT enforce time-based delivery.

### What the documents say should happen:
- Foundation gets "subscription-dependent weekly access" — 1 new week unlocks per week of subscription
- Teleios Blueprint: 6-week course = 6 weeks of subscription to complete
- SBD For Dummies: 13-week course = 13 weeks of subscription to complete

### What the code actually does right now:
- `tier-access.js` uses a **tier-partition model only** — Foundation sees weeks 1–2 of Teleios and weeks 1–3 of SBD Dummies. Weeks 3–6 of Teleios and 4–13 of SBD Dummies are locked behind **Premium** (not time)
- **No calendar-based drip exists in code** — a subscriber who runs up to Premium can read all 28 courses in one sitting and cancel in month 2

### The Business Risk:
A Foundation subscriber at $9/mo gets 3 SBD Dummies weeks and 2 Teleios weeks in the current code. They could consume all accessible content in **one weekend** for $9 total — then either cancel or perceive no continued value.

---

## 4. The Three Content Delivery Models (Choose One)

### Option A — Tier-Partition Only (Current Code)
- Foundation = only preview content (weeks 1–3 of SBD, weeks 1–2 of Teleios)
- Must upgrade to Premium to access the rest
- **Revenue logic:** Force upgrade, not sustain subscription
- **Problem:** Premium subscribers can still binge-complete all 28 courses Month 1 and cancel

### Option B — Time-Based Drip (What the Docs Say)
- Week N of any course unlocks when `subscriptionDays >= (N-1) × 7`
- Week 1: immediate | Week 2: day 7 | Week 3: day 14 | Week 6: day 35 | Week 13: day 84
- "Teleios Blueprint is a 6-week course" becomes a **technical enforcement**, not just a label
- **Revenue clock:** Foundation subscriber needs minimum ~13 weeks (parallel Teleios + SBD) = **$27 before finishing Foundation content**

### Option C — Hybrid Drip (Recommended)
- All tiers: time-drip at 1 week per 7 days (content pace enforced)
- **Upgrade incentive = more concurrent courses, not faster speed**
  - Foundation: 2 courses dripping in parallel
  - Premium: 28 courses dripping — study 3–4 simultaneously without waiting
  - Elite: 44 courses — full formation running concurrently
- The value of upgrading is **breadth and depth**, not skipping the queue

---

## 5. Revenue Modeling Under Time-Drip (Option B or C)

### Foundation ($9/mo) — Minimum Revenue Per User Journey

| Phase | Content Running | Parallel Weeks | Real-Time Months | Min Revenue |
|-------|----------------|---------------|-----------------|-------------|
| Teleios Blueprint (6 wks) + SBD Dummies (13 wks) parallel | 2 courses | 13 weeks | **3.25 months** | **$29.25** |
| School 1 progressive unlock — 13 courses, avg 5.3 wks each | Sequential | 69 weeks | **16 months** | **$144** |
| **Foundation complete journey** | | | **~19 months** | **$171** |

### Premium ($20/mo) — Minimum Revenue Per User Journey

| Schools | Courses | Total Weeks | Running 3 Parallel | Real Months | Min Revenue |
|---------|---------|-------------|-------------------|-------------|-------------|
| School 1 (13 courses) | 13 | 69 | — | — | — |
| School 2 (15 courses) | 15 | 98 | — | — | — |
| Schools 1 + 2 combined | 28 | 167 | ÷3 parallel = 56 wks | **13 months** | **$260** |

### Elite ($50/mo) — Minimum Revenue Per User Journey

| All Schools | Courses | Total Weeks | Running 4 Parallel | Real Months | Min Revenue |
|-------------|---------|-------------|---------------------|-------------|-------------|
| All 4 schools | 44 | ~259 | ÷4 parallel = 65 wks | **15 months** | **$750** |

> **Portfolio value streaming through Elite:** $11,499 worth of content at $50/mo = 230 months to match value if they paid à la carte. The subscription is the correct business model.

---

## 6. What the Drip Engine Requires (Technical — Brief)

One new field written at subscription creation time:

```javascript
// Written to Firestore users/{uid} when subscription activates
subscription: {
  tier: 'foundation',
  startDate: Timestamp.now(),   // ← drip origin clock
  endDate: ...,
  status: 'active'
}
```

One calculation added to `canAccessModule()` in `tier-access.js`:

```javascript
const subscriptionDays = (Date.now() - sub.startDate.toMillis()) / (1000 * 60 * 60 * 24);
const weeksElapsed = Math.floor(subscriptionDays / 7) + 1;

if (module.week > weeksElapsed) {
  const unlockDate = new Date(sub.startDate.toMillis() + (module.week - 1) * 7 * 24 * 60 * 60 * 1000);
  return {
    canAccess: false,
    reason: `Week ${module.week} unlocks on ${unlockDate.toLocaleDateString()}`
  };
}
```

**Impact:** ~20 lines of code change. No schema changes. No new Firestore collections. Deployable in one session.

---

## 7. Cancellation & Re-Subscribe Behavior (Undecided)

| Scenario | Option A — Reset Clock | Option B — Resume Progress |
|----------|----------------------|--------------------------|
| User cancels month 4, resubscribes month 7 | Drip clock resets — they restart from week 1 and re-pay for all weeks | They resume at week 17 (month 4 progress preserved) |
| **Revenue impact** | Higher — user re-subscribes and re-drips from week 1 | Lower — returning users pick up mid-content |
| **User experience** | Can feel punishing; risk of churn at re-subscribe decision point | Feels fair; lower re-subscribe friction |
| **Recommended** | ✅ Reset clock (stronger revenue, matches Netflix model — cancel = lose your place) | |

> **Suggested rule:** 1-month grace period (already coded) = progress preserved. After 1 month lapsed = reset. This already matches the doc: "After 1 month: progress is lost."

---

## 8. Decisions Required Before Build

> **These three questions must be answered before the drip engine can be coded.**

---

### Decision 1 — Foundation Drip Scope ✅ LOCKED

**Decision:** Full drip — Foundation gets ALL of Teleios Blueprint (6 weeks) + ALL of SBD For Dummies (13 weeks), dripped at 1 module per 7–10 days. PLUS limited School 1 preview (first course only accessible). Everything else is **VISIBLE and LOCKED** — School 2, 3, 4, Advanced Boards, MV House are always on screen but always behind a paywall.

**Foundation UX intent (non-negotiable):**
> User must feel: *"This is powerful… but I am blocked."* — NOT: *"This is enough."*

**Mandatory visible locks on Foundation:**
- 🔒 "15 courses waiting in Sexual Literacy School — upgrade to Premium"
- 🔒 "Advanced discussions happening in Premium boards"
- 🔒 "MV House — apply what you learn" (teaser visible, access denied)
- 🔒 School 3, 4 previews always visible in navigation

**Revenue logic:** The drip pace (7–10 days/module) is the revenue lock — NOT the content wall. Partial walls drive churn. Drip pace drives LTV. The visible locks drive upgrade desire.

---

### Decision 2 — Premium Upgrade Incentive Structure ✅ LOCKED

**Decision:** More content, same drip pace. Upgrades NEVER accelerate content delivery — they unlock MORE LANES (more courses dripping in parallel).

| Tier | Parallel Courses | Drip Pace | What's Locked |
|------|-----------------|-----------|---------------|
| Foundation | 2 (Teleios + SBD Dummies) | 1 per 7–10 days | School 2, 3, 4, MV House |
| Premium | 4 (Schools 1 + 2 simultaneously) | 1 per 7–10 days | School 3, 4, MV House, Advanced Boards |
| Elite | 6 (All 4 schools + MV House) | 1 per 7–10 days | Nothing — full access |

**Premium UX intent (non-negotiable):**
> User must feel: *"I understand the knowledge… but I cannot yet APPLY it."*

**Mandatory visible locks on Premium:**
- 🔒 School 3 — Marriage Systems & Fidelity ("8 courses")
- 🔒 School 4 — Civilization & Family Leadership ("8 courses")
- 🔒 MV House ("Apply your identity — Elite only")
- 🔒 Advanced Muliebrity & Virility boards

**Law:** Drip pace is IDENTICAL across all tiers. Upgrading is about WIDTH, never SPEED.

---

### Decision 3 — Re-Subscribe Clock Behavior ✅ LOCKED

**Decision:** Resume — user picks up exactly where their drip left off.

**How this works in code:**
- Drip position is stored as `subscription.dripWeeksUnlocked` in Firestore
- On re-subscribe: read that field, resume from that week
- Grace period (1 month) preserves this automatically — it was already coded
- After grace period lapses: position still saved, but content inaccessible until they resubscribe
- On resubscribe: content resumes at saved position, drip clock continues forward from there

**Revenue note:** This still earns recurring revenue on every resubscription — users still need to pay monthly to receive the next dripped week. "Resume" doesn't skip payment; it skips repeating content they already paid for.

---

## 11. Revenue-First Revised Analysis

> **Priority declared by Dr. Coach Achu:** Revenue protection is #1. Decisions must maximize Lifetime Value (LTV) per subscriber. Users should NOT be able to complete courses faster than the revenue justifies, but should also not wait so long they cancel out of frustration.

---

### The Right Frame: Portfolio Value vs. Subscription LTV

These are what subscribers pay à la carte vs. what they pay monthly:

| Tier | À La Carte Value | Monthly Price | Months to "Earn" It | Master Prompt LTV Target |
|------|-----------------|--------------|--------------------|--------------------------|
| Foundation | **$644** | $9/mo | 71 months (impossible) | **$40–$100** (subscription only) |
| Premium | **$7,149** | $20/mo | 357 months (impossible) | **$240–$400** (subscription only) |
| Elite | **$11,499** | $50/mo | 230 months (impossible) | **$900–$1,800** (subscription only) |
| MV House | recurring purchases | $80+/order | — | **$2,000–$5,000+** (product sales) |
| **Total per serious user** | — | — | — | **$3,000–$5,000+** |

> **Takeaway:** The subscription model is not designed to deliver equal value to price. It is designed to deliver PERCEIVED massive value while the business earns sustainable recurring revenue. The drip pace is the mechanism that controls how long a subscriber stays before they can "complete" their tier.

---

### The Drip Pace Decision (Core of Everything)

This is the single most important variable. Every revenue number flows from this.

| Drip Pace | Feel | Foundation Journey | Premium Journey | Elite Journey |
|-----------|------|--------------------|-----------------|---------------|
| 1 module per 7 days | Fast — like a real class | 13 weeks = 3 months = **$27** | ~14 months = **$280** | ~17 months = **$850** |
| 1 module per 10 days | Deliberate — room to apply | 19 weeks = 4.5 months = **$40** | ~20 months = **$400** | ~24 months = **$1,200** |
| 1 module per 14 days | Slow — risks frustration | 27 weeks = 6 months = **$54** | ~29 months = **$580** | ~33 months = **$1,650** |

**Locked pace: 1 module per 7–10 days** (master prompt locked this range).
- 7 days = faster feel, like a real weekly class, lower LTV floor
- 10 days = deliberate pace, application time between modules, higher LTV
- **Implementation:** Start at 7 days. Add admin override to tune per course if needed.
- Fast enough: users feel real progress — not imprisoned
- Slow enough: cannot binge and cancel
- Pedagogically valid: mirrors real coursework pacing
- Revenue sweet spot: Foundation 4–24 months, Premium 14–20 months, Elite 17–24 months

---

### Full LTV Model at 10-Day Drip Pace

#### Foundation ($9/mo)

| Phase | Courses | Modules | Days | Months | Revenue |
|-------|---------|---------|------|--------|--------|
| Teleios Blueprint (parallel with SBD) | 6 modules | 6 | 60 | — | — |
| SBD For Dummies (parallel with Teleios) | 13 modules | 13 | 130 | **4.3 months** | **$38.70** |
| School 1 progressive (12 remaining courses, avg 5 modules) | ~60 modules | 60 | 600 | **20 months** | **$180** |
| **Foundation total if they stay** | | | | **~24 months** | **~$216** |

> At $9/mo with 24 months of dripped content, you earn $216 from a Foundation subscriber who goes the full journey. They can NEVER consume faster than 10 days/module regardless of how engaged they are. That is the revenue lock.

#### Premium ($20/mo)

| Phase | Schools | Courses | Modules | Running Parallel | Months | Revenue |
|-------|---------|---------|---------|-----------------|--------|--------|
| Schools 1 + 2 | 2 | 28 | ~167 | 4 courses simultaneously | **~14 months** | **~$280** |
| **Premium total** | | | | | **14–17 months** | **$280–340** |

> Users running 4 courses simultaneously, each at 10-day pace, still can't skip ahead. The UPGRADE from Foundation to Premium doesn't speed up content — it unlocks **more lanes**. This is the key to the Premium upgrade pitch.

#### Elite ($50/mo)

| Phase | Schools | Courses | Modules | Running Parallel | Months | Revenue |
|-------|---------|---------|---------|-----------------|--------|--------|
| All 4 schools + MV House | 4 | 44 | ~259 | 5–6 simultaneously | **~17–20 months** | **$850–1,000** |

---

### The Upgrade Architecture — How Tiers Drive Revenue

The commercial engine is **tier upgrades**, not just monthly renewals.

```
FREE → FOUNDATION → PREMIUM → ELITE
 $0      $9/mo       $20/mo    $50/mo

Upgrade revenue jump:
  Free → Foundation:  +$9/mo
  Foundation → Premium: +$11/mo  
  Premium → Elite:    +$30/mo
```

**What triggers an upgrade (by design):**

| User is on | They see | Upgrade trigger |
|-----------|---------|----------------|
| Foundation | School 2 courses (locked) | "15 courses on Sexual Literacy waiting — upgrade to Premium" |
| Foundation | School 1 courses beyond Teleios (locked) | Progressive unlock keeps them paying to access more |
| Premium | Schools 3 + 4 (locked) | "8 Marriage Systems + 8 Civilization courses — Elite only" |
| Premium | MV House, AMTS boards | Community FOMO drives Elite upgrade |

> **The drip does NOT create upgrade desire by being frustratingly slow.** It creates upgrade desire by making more content VISIBLE but behind a tier wall, while the current tier content drips at a satisfying but controlled pace.

---

### Revised Decisions 1 & 2 (Revenue-First)

#### Decision 1 — Foundation Drip Scope (**Revised Recommendation**)

**Revenue-first recommendation: Full drip (Option A) — BECAUSE of the revenue math, not despite it.**

| | Foundation gets PARTIAL (current code) | Foundation gets FULL (recommended) |
|--|---------------------------------------|-------------------------------------|
| Content | Weeks 1–2 Teleios + 1–3 SBD (forever locked) | All 6 Teleios + all 13 SBD (dripped over time) |
| Revenue from Foundation drip alone | User hits wall fast → may churn | 4.3 months minimum before both courses complete → **$38.70 guaranteed** |
| After initial courses | Nothing left to drip | School 1 progressive (20 more months of drip) |
| Total Foundation LTV | $9–18 before upgrade or cancel | **$216 if they stay the journey** |
| Risk | Frustration → churn | Satisfaction → loyalty → upgrade at own pace |

**Recommendation: Option A (Full drip).**
Reason: The drip pace (10 days/module) is the revenue protector — NOT the partial content wall. The partial wall drives churn. The drip pace drives LTV.

---

#### Decision 2 — Premium Upgrade Incentive (**Revised Recommendation**)

| | Option A: More content, same pace | Option B: Faster pace | Option C: Instant access |
|--|-----------------------------------|-----------------------|--------------------------|
| Premium LTV | **$280–340** (14–17 months) | **$180–220** (9–11 months) | **$20–40** (cancel after bingeing) |
| Upgrade pitch | "28 courses across 2 schools, all dripping" | "Get content faster" | "Get everything now" |
| Revenue risk | Low | Medium | Very high |

**Recommendation: Option A (More content, same 10-day drip).**
Reason: Faster drip shortens the revenue timeline. Instant access collapses it entirely.

---

### The Complete Revenue-First System (Final Model)

```
TIER          DRIP PACE      COURSES RUNNING    UPGRADE DRIVER
──────────────────────────────────────────────────────────────
Free          (preview only)   1 course, 1 week   "Unlock Foundation"
Foundation    1 per 10 days    2 parallel         See School 2 (locked)
                               Teleios + SBD      School 1 progressive
Premium       1 per 10 days    4 parallel         See Schools 3+4 (locked)
                               Schools 1+2        MV House (locked)
Elite         1 per 10 days    6 parallel         Full access, no gap
                               All 4 schools +
                               MV House unlocked
```

**LTV Summary (10-day drip, resume on re-subscribe):**

| Tier | Minimum LTV (subscription) | Master Prompt Target LTV | MV House Add-On | Total LTV Potential |
|------|--------------------------|------------------------|-----------------|--------------------|
| Foundation | $38.70 | **$40–$100** | — | $100 |
| Premium | $100 | **$240–$400** | — | $400 |
| Elite | $200 | **$900–$1,800** | **$2,000–$5,000+** | **$3,000–$5,000+** |

> **MV House is the LTV engine.** Subscription revenue is the foundation. Product sales through MV House (wardrobe, customization) is where the $3,000–$5,000+ per serious user comes from.
> Example: $80/order × 2 orders/month × 24 months = **$3,840 per Elite user from MV House alone.**

---

## 9. Full Build Scope (All Decisions Locked)

This is no longer a "minimum build" — decisions are locked. This is the **complete implementation plan** for v245+.

### Phase 1 — Drip Engine (v245)
1. **Write `subscription.startDate` to Firestore** at checkout — 1 line in `unlockSbdContent()` in `functions/index.js`
2. **Add drip check to `canAccessModule()`** in `tier-access.js` — read `startDate`, calculate `weeksElapsed = floor(daysSinceStart / 7) + 1`, block if `module.week > weeksElapsed`
3. **Show unlock countdown UI** in `lesson.html` — "Week 4 unlocks in 3 days (April 16)"
4. **Expand Foundation access** in `tier-access.js` — remove the partial week caps (1–2 Teleios, 1–3 SBD), replace with drip gate on ALL weeks
5. On re-subscribe: restore `startDate` from saved `subscription.dripWeeksUnlocked` position

### Phase 2 — Locked UI System (v246)
6. **Visible locked schools** on every page — Foundation users always see School 2, 3, 4 with lock icons and course counts
7. **Upgrade prompt embeds** in lesson pages — triggered at end of each dripped module
8. **Foundation pressure triggers** — "15 courses waiting in Sexual Literacy" banner visible at all times
9. **Premium pressure triggers** — School 3, 4 teasers + MV House lock visible
10. **Board-level locked states** — Advanced boards show post previews but require Elite

### Phase 3 — MV House Build (v247)
11. **MV House page** — wardrobe system: Corporate / Casual / Official / Night sections
12. **"Add to Wardrobe" button** — on every MV House board post
13. **Wardrobe curation page** — saved items per category, Elite-only
14. **Purchase / Customization CTA** — checkout flow from wardrobe
15. **MV House lock** — visible on Foundation + Premium, full access on Elite

### Phase 4 — Upgrade Engine (v248)
16. **Upgrade conversion tracking** — log every time user hits a lock
17. **Automated upgrade nudges** — after 3 lock events in a session → show upgrade modal
18. **Upgrade conversion targets** — Foundation→Premium 40%+, Premium→Elite 20–30%

**No new Firestore collections needed for Phase 1. MV House wardrobe needs 1 new collection (`wardrobes/{uid}`) for Phase 3.**

---

## 10. Key Files for Developers

| File | Purpose | Location |
|------|---------|----------|
| `tier-access.js` | All tier/module access logic | `sbd-network/public/js/tier-access.js` |
| `lesson.html` | Content delivery UI, lock messages | `sbd-network/public/lesson.html` |
| `functions/index.js` | `unlockSbdContent()` — subscription write | `functions/index.js` (line ~4000+) |
| `SBD-ACADEMY-LEARNING-SYSTEM.md` | Canonical product spec | `sbd-network/SBD-ACADEMY-LEARNING-SYSTEM.md` |
| `FORMATION-SYSTEM-BUILD-GUIDE.md` | Formation architecture | `sbd-network/FORMATION-SYSTEM-BUILD-GUIDE.md` |

---

---

## 12. Master Prompt — Canonical System Design (April 13, 2026)

> This section captures the governing philosophy from Dr. Coach Achu's Master Prompt. All code decisions must comply with this intent.

### What This System IS and IS NOT

| ❌ NOT This | ✅ This |
|------------|--------|
| A course platform | A PROGRESSION SYSTEM |
| Content library | Identity Transformation Engine |
| Students | Transforming Identities |
| Buyers | People moving through a formation system |

### The 5-Stage Identity Path

| Stage | Tier | Role | System Job |
|-------|------|------|------------|
| 1 | Free | Curious | Create desire, show locked power |
| 2 | Foundation | Believer | Deliver transformation + create limitation feeling |
| 3 | Premium | Committed | Full immersion + block application layer |
| 4 | Elite | Embodied | Full identity formation + MV House access |
| 5 | MV House | Monetized Lifestyle | Wardrobe purchases, customization, recurring orders |

### The 5 Non-Negotiable Laws

1. **NEVER** deliver full perceived value at Foundation
2. **ALWAYS** show locked content (visible everywhere, always)
3. **ALWAYS** create upward pressure toward next tier
4. **NEVER** allow "completion satisfaction" at lower tiers
5. **ALWAYS** expose the next level — the gap must be visible, not hidden

### MV HOUSE — The Monetization Engine

```
MV HOUSE = THE WARDROBE SYSTEM OF COVENANT EXPRESSION

Transforms:
  Identity → Visible Expression
  Knowledge → Lifestyle
  Learning → Embodiment
```

**MV House Architecture:**

| Layer | Function | Revenue |
|-------|----------|---------|
| Boards (Discovery) | Muliebrity / Virility themed posts | Community value → buy intent |
| Wardrobe Page (Curation) | Corporate / Casual / Official / Night sections | Saves → purchases |
| Action Layer | "Purchase Wardrobe" + "Request Customization" buttons | Direct revenue |

**Each board post must include:** → "Add to Wardrobe" action

**MV House LTV model:**
- $80/order × 2 orders/month × 24 months = **$3,840 per Elite user**
- Customization requests = premium pricing above base order

### Psychological Pressure Architecture

| Trigger | Mechanism | Effect |
|---------|-----------|--------|
| Incomplete access | Never full satisfaction at any tier | Upward desire |
| Visible locks | Show locked content everywhere | FOMO + upgrade intent |
| Progression tension | "You started something — finish it" | Engagement + retention |
| Social proof | Advanced boards showing activity | Elite FOMO |
| Identity gap | "You are not fully formed yet" | Emotional driver |

### Upgrade Conversion Targets

| Conversion | Target Rate | Primary Trigger |
|-----------|------------|----------------|
| Free → Foundation | 15–25% | Week 1 content quality |
| Foundation → Premium | **40%+** | Visible School 2 + drip wall |
| Premium → Elite | **20–30%** | MV House + School 3/4 lock |

---

*All decisions locked. Document ready for developer handoff. Build starts at Phase 1 — Drip Engine (v245).*
