# CE2 iPhone PWA keyboard — **current stable rollback point (v60)**

**Status:** Verified on iPhone PWA (May 2026)  
- **Header:** stable (**A**) — from v59  
- **Composer–keyboard gap:** closed (**success**) — v60 geometry lift  

**Live:** `https://sbd-network.web.app/communication-v2/`  
**Console:** `[CE2] communication-v2.js v60` and `rollback=ce2-keyboard-stable-v60`

> **Supersedes** `ROLLBACK-KEYBOARD-v59.md` (header-only stable). Keep v59 doc for history; restore to **v60** for full keyboard fix.

---

## Rollback identifiers (use these exactly)

| Artifact | Value |
|----------|--------|
| Git tag (after commit) | `ce2-keyboard-stable-v60` |
| Rollback constant | `ce2-keyboard-stable-v60` |
| JS | `communication-v2.js?v=60` |
| CSS | `communication-v2.css?v=43` |
| Build meta | `1779250000000` |
| Service worker | `sbd-network-v1779250000000` |
| Prior header-only tag | `ce2-keyboard-stable-v59` |

**In-repo markers:** search `STABLE_ROLLBACK`, `ce2-keyboard-stable-v60`, or `KEYBOARD-STABLE.lock`.

---

## Files that define this rollback (do not edit casually)

| File | Role |
|------|------|
| `ROLLBACK-KEYBOARD-v60.md` | This document |
| `KEYBOARD-STABLE.lock` | Machine-readable version lock |
| `index.html` | Viewport meta, cache bust |
| `communication-v2.css` | Body pan + composer transform only |
| `communication-v2.js` | Split keyboard pipeline (see below) |

---

## Architecture: two isolated paths (never merge)

```
keyboard open
    │
    ├─► HEADER PATH (v59 — FROZEN)
    │     applyViewportPanCounter()
    │     --ce2-vv-offset  ← visualViewport.offsetTop
    │     body.ce2-kb-active { transform: translateY(-vv-offset) }
    │     .ce2-header unchanged (flex child, never fixed)
    │
    └─► COMPOSER PATH (v60)
          applyComposerKeyboardLift()
          measureComposerKeyboardLift()  ← geometry, not formula-only
          --ce2-composer-kb
          body.ce2-composer-kb-active .ce2-composer { transform: translateY(-kb) }
          composer padding-bottom: 0 while keyboard up
```

Orchestrator: `applyComposerKeyboardInset()` calls both paths in one `requestAnimationFrame`.

---

## What fixed the header (v59 — do not change)

1. **`interactive-widget=overlays-content`** — keyboard overlays; layout viewport does not shrink.
2. **Beta flex shell** — `.ce2-header` is `flex-shrink: 0` in `.ce2-shell`; never `position: fixed`.
3. **`html/body`** — `height: 100%`, `overflow: hidden` (not `position: fixed` on body).
4. **Body pan counter** — cancels iOS `visualViewport` scroll/pan so header stays visually still.

---

## What closed the gap (v60 — composer only)

### Problem (v59)

`--ce2-composer-kb` used only:

`innerHeight - visualViewport.height - offsetTop`

That **over-lifted** the composer after the body already applied `-vv-offset`, leaving a black band above the keyboard.

### Fix (v60)

1. **Split functions** — header logic in `applyViewportPanCounter()`; composer in `applyComposerKeyboardLift()`.
2. **Geometry lift** — `measureComposerKeyboardLift()`:
   - Temporarily clears composer `transform`
   - `keyboardTop = vv.offsetTop + vv.height`
   - `lift = composerBottom - keyboardTop - CE2_COMPOSER_KB_TRIM` (2px)
   - Clamps: `lift = min(lift, kbOccluded)` so never lifts more than occluded height
3. **Re-measure** — `scheduleComposerKeyboardInsetBurst()` at 0, 120, 320ms after focus (keyboard animation).
4. **CSS** — `padding-bottom: 0` on composer while `ce2-composer-kb-active` (no double safe-area under keyboard).

### Escape hatches (no redeploy)

| URL param | Effect |
|-----------|--------|
| `?ce2_kb_legacy=1` | v59 formula lift for composer only (header path unchanged) |
| `?ce2_kb_debug=1` | Console logs lift + viewport metrics |

---

## Hard rules for future keyboard work

1. **Never** change header/shell/viewport meta when tuning composer gap.
2. **Never** `position: fixed` on `.ce2-header`, `.ce2-shell`, or resize shell with `visualViewport`.
3. **Never** use `interactive-widget=resizes-content`.
4. **Never** stack strategies (resize + fixed composer + body fixed + double insets).
5. **Composer-only** tuning: `--ce2-composer-kb`, `CE2_COMPOSER_KB_TRIM`, `measureComposerKeyboardLift()`.
6. Test order: **header A first**, then gap — if A fails, revert composer changes only.

---

## Git: commit and tag this state

```bash
cd sbd-network
git add public/communication-v2/index.html \
        public/communication-v2/communication-v2.css \
        public/communication-v2/communication-v2.js \
        public/communication-v2/ROLLBACK-KEYBOARD-v60.md \
        public/communication-v2/ROLLBACK-KEYBOARD-v59.md \
        public/communication-v2/KEYBOARD-STABLE.lock \
        public/version.json \
        public/service-worker.js
git commit -m "fix(ce2): stable iPhone PWA keyboard v60 — header A + gap closed"
git tag -a ce2-keyboard-stable-v60 -m "CE2 keyboard: header stable + composer gap closed (iPhone PWA)"
```

## Restore this rollback later

```bash
git checkout ce2-keyboard-stable-v60 -- public/communication-v2/
git checkout ce2-keyboard-stable-v60 -- public/version.json public/service-worker.js
firebase deploy --only hosting:sbd-network
```

---

## History (do not re-apply)

| Version | Result |
|---------|--------|
| v48–v57 | Header jump, gap experiments |
| v58 | Header **B** (`position: fixed` body + composer) |
| v59 | Header **A**; gap remained (formula over-lift) |
| **v60** | Header **A** + gap **closed** ← **current stable** |
