# CE2 Premium Structural / Composure Refinement Pass

**Implementation reference** for SBD Network Messaging V2 (Communication Engine V2).  
Use this document when requesting a **visual + structural UX** pass — even if deferred.

| Field | Value |
|-------|--------|
| **Status** | **UI-1–3 shipped** · rollback `ce2-ui-composure-stable` |
| **Rollback** | `ROLLBACK-UI-COMPOSURE.md` · `UI-COMPOSURE-STABLE.lock` |
| **Scope** | Composure, spacing, hierarchy, premium feel — **CSS + light UX only** |
| **Keyboard dependency** | **Frozen** — `ce2-keyboard-stable-v60` (`ROLLBACK-KEYBOARD-v60.md`) |
| **Audio dependency** | Defer recorder/playback to `PHASE-1-AUDIO-MESSAGING.md` |
| **Live app** | `https://sbd-network.web.app/communication-v2/` |

---

## Table of contents

1. [Critical instructions](#critical-instructions)
2. [Primary objective](#primary-objective)
3. [What is already fixed (v60)](#what-is-already-fixed-v60)
4. [Current problems vs safe fixes](#current-problems-vs-safe-fixes)
5. [Frozen zones (do not touch)](#frozen-zones-do-not-touch)
6. [DOM layout model](#dom-layout-model)
7. [Phased delivery (UI-1 → UI-4)](#phased-delivery-ui-1--ui-4)
8. [Design tokens](#design-tokens)
9. [Section mapping (original brief → implementation)](#section-mapping-original-brief--implementation)
10. [iOS PWA rules](#ios-pwa-rules)
11. [Validation checklist](#validation-checklist)
12. [Keyboard v60 regression gate](#keyboard-v60-regression-gate)
13. [How to request implementation](#how-to-request-implementation)
14. [Explicitly out of scope](#explicitly-out-of-scope)
15. [Appendix: composure principles](#appendix-composure-principles)

**Index of all CE2 plans:** `CE2-ROADMAP.md`

---

## Critical instructions

1. **DO NOT** rebuild Messaging V2.
2. **DO NOT** rewrite routing, navigation, state, Firestore, or governance.
3. **DO NOT** destabilize **iOS PWA keyboard fixes** (v60).
4. This is a **PREMIUM STRUCTURAL REFINEMENT PASS** — visual hierarchy, spacing, calm, native feel.
5. Prefer **CSS + small DOM toggles** over new viewport/keyboard JavaScript.
6. **DO NOT** run audio Phase 1 and UI pass on the same deploy without separate regression tests.

### North star

The UI must feel **composed** — grounded, intentional, stable — not floating, reactive, or web-janky.

---

## Primary objective

Transform perception from **“unstable premium beta”** to **“premium, emotionally grounded communication infrastructure.”**

The **visual direction is already strong** (dark, gold, cinematic). This pass fixes:

- Structural tension and stacked chrome
- Header / search consuming conversation space
- Visual density and metadata noise
- Composer **appearance** (docked, fused, premium) — **without** replacing v60 keyboard engine
- Message rhythm and bubble discipline

**Not in scope:** new features, calls, routing rewrites, keyboard architecture changes.

---

## What is already fixed (v60)

Verified on iPhone PWA (May 2026):

| Issue | Status |
|-------|--------|
| Header jump when keyboard opens | **Fixed** — `applyViewportPanCounter()` |
| Large black gap composer ↔ keyboard | **Fixed** — `measureComposerKeyboardLift()` |
| Layout viewport shrink | **Avoided** — `interactive-widget=overlays-content` |

**Console marker:** `[CE2] communication-v2.js v60` · `rollback=ce2-keyboard-stable-v60`

Any brief that says “remove large keyboard gap” or “stop floating offsets” means:

- **Do not** replace v60 logic with `resizes-content`, fixed composer, or shell resizing.
- **May** tune visual fusion (CSS) or `CE2_COMPOSER_KB_TRIM` (1–2px) in the **composer lift path only** (UI-4).

---

## Current problems vs safe fixes

| Problem (product brief) | Safe approach | Phase | Risk |
|-------------------------|---------------|-------|------|
| Header stack too tall | Reduce padding/margins on `.ce2-header`, `.ce2-main-header` | UI-1 | Low |
| Search dominates | Collapsed icon state; lighter bar when open | UI-1 | Low |
| Conversation starts too low | UI-1 chrome compression | UI-1 | Low |
| Composer feels “inserted” | Background, border, bar rhythm — **not** position:fixed | UI-3 | Low |
| Keyboard gap (if returns) | **v60 regression** first; UI-4 trim only | UI-4 | Medium |
| Layering chaos | z-index audit; single scroll owner (`.ce2-messages`) | UI-1 | Low |
| Compressed messages | Bubble spacing, metadata opacity | UI-2 | Low |
| Buttons oversized / playful | Composer + send control sizing | UI-3 | Low |
| Audio bubble prep | Reserved min-height only — no recorder | — | Defer to audio doc |

---

## Frozen zones (do not touch)

Unless fixing a **proven regression** with full iPhone PWA keyboard re-test:

### Files / logic

| Item | Reason |
|------|--------|
| `applyViewportPanCounter()` | Header stability |
| `applyComposerKeyboardLift()` / `measureComposerKeyboardLift()` | Gap fix |
| `applyComposerKeyboardInset()` orchestration | v60 pipeline |
| `bindCe2ComposerKeyboard()` listeners | v60 |
| `index.html` viewport `interactive-widget=overlays-content` | Layout stability |
| `body.ce2-kb-active` transform + `--ce2-vv-offset` | Pan counter |
| `body.ce2-composer-kb-active` transform + `--ce2-composer-kb` | Composer lift |
| `.ce2-shell` / `.ce2-header` flex model | No `position: fixed` on header |

See: `ROLLBACK-KEYBOARD-v60.md`, `KEYBOARD-STABLE.lock`.

### Forbidden patterns (historical regressions v48–v58)

- `interactive-widget=resizes-content`
- `position: fixed` on `html`, `body`, `.ce2-header`, `.ce2-composer`
- Resizing `.ce2-shell` from `visualViewport` height/top
- Stacking new keyboard hacks on top of v60 transforms
- New `visualViewport` listeners for layout (composer lift already has them)

### Allowed (composer keyboard micro-tune — UI-4 only)

- `CE2_COMPOSER_KB_TRIM` constant (currently `2` px)
- Composer `padding-bottom: 0` when `ce2-composer-kb-active` (already in CSS)
- Visual border/background on `.ce2-composer` only

---

## DOM layout model

### Mobile thread open (target mental model)

```
.ce2-shell
├── .ce2-header              ← app chrome (Messages + tier)
├── .ce2-workspace.ce2-thread-open
│   └── .ce2-main
│       ├── .ce2-main-header ← thread title + back
│       ├── .ce2-thread-search (hidden | collapsed | open)
│       ├── .ce2-messages    ← ONLY vertical scroll for conversation
│       ├── .ce2-typing-line
│       └── .ce2-composer    ← flex child, lifted via v60 transform when typing
```

**Rule:** HEADER → CONVERSATION → COMPOSER → (keyboard overlays).  
Composer is **docked** as flex child; v60 **transform** lifts it over the keyboard — that is not “floating” in the broken sense.

### Two headers (spec must distinguish)

| Class | When visible | Refinement focus |
|-------|----------------|------------------|
| `.ce2-header` | Always | Compress subtitle; safe-area top |
| `.ce2-main-header` | Thread open | Primary vertical savings on thread view |

**Optional UI-1:** When `.ce2-thread-open`, hide `.ce2-sub` or reduce app header padding to give thread more room (test tier pill still visible).

---

## Phased delivery (UI-1 → UI-4)

Ship in order. **Run keyboard regression after each phase.**

### UI-1 — Header + search composure

**Goal:** Conversation starts higher; search feels secondary.

**CSS targets:**

| Selector | Current (approx) | Direction |
|----------|------------------|-----------|
| `.ce2-header` padding | `12px + safe-area` vertical | Reduce to `8px + safe-area` |
| `.ce2-sub` | `margin: 2px 0 0` | Tighter or hide in thread-open |
| `.ce2-main-header` | `padding: 12px 14px` | `8px 12px` |
| `.ce2-thread-title` | `1.05rem` | `1rem` |
| `.ce2-thread-meta` | `margin: 6px 0 0` | `2px 0 0`, lower opacity |
| `.ce2-thread-search` | full bar | Shorter padding, subtler border |
| `.ce2-thread-search-input` | default | Reduce padding / font-size |

**UX (light JS optional):**

- Collapsed search: icon button in `.ce2-main-header` opens bar
- Bar remains `hidden` by default; `dismissThreadSearch()` on composer focus (existing)

**Exit criteria:**

- ~24–40px more message area on iPhone thread view
- Search open/close does not shift header unexpectedly
- v60 regression pass

**Files:** `communication-v2.css` primarily; optional small change in `ce2-message-actions.js` for search toggle UI.

---

### UI-2 — Message composure

**Goal:** Calmer reading rhythm; quieter metadata.

**CSS targets:**

| Selector | Direction |
|----------|-----------|
| `.ce2-row` | `margin-bottom: 12px` → `14px` or consistent 12px |
| `.ce2-bubble` | Consistent radius; padding discipline |
| `.ce2-msg-foot` | Lower opacity (~0.35–0.4), smaller font |
| `.ce2-messages` | Padding `12px 14px` → balanced vertical rhythm |

**Exit criteria:**

- Metadata readable but not competing with content
- No scroll jump on new messages
- v60 regression pass

**Files:** `communication-v2.css` only.

---

### UI-3 — Composer visual language

**Goal:** Composer feels **fused** to the bottom layer — premium, restrained.

**CSS only (no keyboard JS):**

| Area | Direction |
|------|-----------|
| `.ce2-composer` | Unified background; subtle top border; no “card floating” shadow |
| `.ce2-composer-bar` | Tighter gap; align attach / mic / send baselines |
| `.ce2-btn-send` | Confident size — not oversized; gold restraint |
| `.ce2-composer-attach`, `.ce2-composer-voice` | Quieter borders, 40px touch targets |
| `.ce2-input` | Line-height, min-height for single-line composure |

**Reserve for audio (no implementation here):**

```css
.ce2-msg-audio-bubble { min-height: 44px; } /* placeholder for waveform row */
```

**Exit criteria:**

- Composer visually integrated when keyboard **closed**
- v60 regression pass with keyboard **open**

**Files:** `communication-v2.css` only.

---

### UI-4 — Keyboard visual micro-tune (optional)

**Goal:** iMessage-tight **only if** v60 tests show sub-pixel gap or visual disconnect.

**Allowed:**

- Adjust `CE2_COMPOSER_KB_TRIM` in `communication-v2.js` (composer path constant)
- Composer border-radius / bottom edge styling when `body.ce2-composer-kb-active`

**Forbidden:**

- New viewport meta, fixed positioning, shell height JS, removing transforms

**Exit criteria:**

- User confirms gap still closed; header still A
- 10× focus/blur composer on iPhone PWA

---

## Design tokens

Add to `:root` or `.ce2-shell` in CSS for consistent refinement:

```css
.ce2-shell {
  --ce2-chrome-pad-y: 8px;
  --ce2-chrome-pad-x: 12px;
  --ce2-meta-opacity: 0.38;
  --ce2-border-subtle: rgba(255, 255, 255, 0.06);
  --ce2-gold-muted: rgba(201, 184, 146, 0.35);
  --ce2-bubble-radius: 14px;
  --ce2-row-gap: 12px;
}
```

Refactor existing values toward tokens incrementally (UI-1/UI-2).

---

## Section mapping (original brief → implementation)

| Original section | Phase | Notes |
|------------------|-------|-------|
| 1 Structural composure | UI-1 | Flex discipline, z-index |
| 2 Header refinement | UI-1 | Both `.ce2-header` + `.ce2-main-header` |
| 3 Search refinement | UI-1 | Collapse / lighten |
| 4 Input bar / keyboard | UI-3 + UI-4 | **v60 frozen**; visual + trim only |
| 5 Composer visual language | UI-3 | CSS |
| 6 Message composure | UI-2 | CSS |
| 7 Message metadata | UI-2 | CSS |
| 8 Audio messaging UI | — | `PHASE-1-AUDIO-MESSAGING.md` |
| 9 Motion refinement | UI-2–3 | CSS transitions only; no keyboard motion |
| 10 Visual density | UI-1–2 | Tokens + spacing |
| 11 Safe area | UI-1, UI-3 | `env(safe-area-inset-*)`; avoid fighting v60 composer padding |
| 12 Typography | UI-2 | line-height, weights |
| 13 Dark mode | UI-2–3 | contrast discipline |
| 14 Interaction feel | All | deliberate, not hyper-reactive |
| 15 Mobile composure | All | iPhone PWA test matrix |
| 16 Technical discipline | Frozen zones | see above |

---

## iOS PWA rules

### Prefer

- `height: 100%` on `html` / `body` (current v60)
- `flex` + `min-height: 0` on scroll containers
- `env(safe-area-inset-*)` on header top and composer bottom (when keyboard closed)
- `overflow: hidden` on shell; scroll only in `.ce2-messages`

### Avoid unless proven necessary

- Switching shell to `100dvh` without regression test (can interact with v60)
- Extra `position: fixed` layers
- JS height recalculation on `resize`

### Test surfaces

- iPhone Safari
- iPhone Home Screen PWA
- Portrait primary; one landscape smoke test

---

## Validation checklist

### Composure (this pass)

- [ ] Conversation starts visibly higher on thread view (iPhone)
- [ ] Header + thread header feel compact, not noisy
- [ ] Search secondary; collapsed or lightweight when open
- [ ] Message metadata quieter
- [ ] Composer feels docked / fused (keyboard closed)
- [ ] Buttons balanced; send feels confident, not cartoonish
- [ ] UI calmer; no new visual chaos or z-index fights
- [ ] No clipped UI (notch, home indicator)

### Keyboard (v60 — mandatory)

- [ ] Console: v60 + `ce2-keyboard-stable-v60`
- [ ] Header stable when keyboard opens (**A**)
- [ ] No large black gap composer ↔ keyboard (**C**)
- [ ] No “floating” header jump on focus/blur
- [ ] Search dismisses on composer focus; layout still stable

### Regression

- [ ] Hub mode (groups/direct) unchanged
- [ ] Desktop `min-width: 720px` layout acceptable
- [ ] Send text, attach image, voice note still work

---

## Keyboard v60 regression gate

Run after **UI-1, UI-2, UI-3, and UI-4** (if done):

1. Force-refresh PWA; open thread.
2. Tap textarea → keyboard up → observe header (must not jump).
3. Observe composer against keyboard (no large gap).
4. Dismiss keyboard; hold mic 3s → send (smoke test).
5. Open “Find in chat” → focus composer → search closes.

**Stop ship** if any step fails — revert last UI phase before touching v60 logic.

---

## How to request implementation

> Implement CE2 UI composure per `PHASE-UI-COMPOSURE-REFINEMENT.md`.  
> Start with **UI-1 only**. Do not modify v60 keyboard functions or viewport meta.  
> Run keyboard regression after deploy. Do not implement audio in this pass.

| Request | Meaning |
|---------|---------|
| `UI-1 only` | Headers + search |
| `UI-1 + UI-2` | + messages/metadata |
| `UI full` | UI-1 through UI-3 (+ optional UI-4) |
| `UI-4 only` | Micro-tune trim after visual pass |

### Suggested commit messages

```
style(ce2): UI-1 header and search composure (v60 keyboard frozen)
style(ce2): UI-2 message bubble and metadata rhythm
style(ce2): UI-3 composer visual language
fix(ce2): UI-4 composer keyboard trim tune (v60 path only)
```

### Rollback

- UI-only: `git revert <commit>` for CSS changes.
- If keyboard breaks: restore from tag `ce2-keyboard-stable-v60` per `ROLLBACK-KEYBOARD-v60.md`.

---

## Explicitly out of scope

- Messaging V2 rebuild
- Navigation / routing / state rewrite
- Firestore or governance changes
- Audio recorder, waveform, playback (`PHASE-1-AUDIO-MESSAGING.md`)
- Live / video calls
- Gimmick animations, bounce, excessive scale
- New keyboard architecture or `resizes-content`
- `100dvh` migration without dedicated regression doc

---

## Appendix: composure principles

From product brief — preserved as design intent.

### Should feel

- Grounded, intentional, stable, cinematic, emotionally safe, premium, native-app quality

### Should not feel

- Floating, reactive, compressed, randomly layered, web-like, fragile, hyper-reactive

### Final vision

Premium formation communication for the SBD ecosystem — **architecturally disciplined**, not “a web app trying to be a messenger.”

**Acceptance** is the [validation checklist](#validation-checklist) + v60 regression gate — not competitor marketing comparisons.

---

## Document history

| Date | Change |
|------|--------|
| 2026-05 | Initial reference (post v60 keyboard + gap verified; audio plan separate) |

**Related docs:**

- `CE2-ROADMAP.md` — index
- `ROLLBACK-KEYBOARD-v60.md` — frozen keyboard
- `PHASE-1-AUDIO-MESSAGING.md` — audio Phase 1
