# CE2 Rollback Framework

Quick reference for restoring stable CE2 behavior before and during **UI**, **audio**, and future passes.

**Index:** `CE2-ROADMAP.md`

---

## Layers (current)

| Layer | Status | Tag | Commit |
|-------|--------|-----|--------|
| **1 — Keyboard / gap** | **Stable** | `ce2-keyboard-stable-v60` | `e2e0e7f1` |
| **2 — UI composure (1–3)** | **Stable** | `ce2-ui-composure-stable` | `0ac45906` |
| **3 — Audio** | Not started | — | — |

**Rule:** Audio must not break layers 1–2 without full iPhone PWA re-test.

---

## Layer 1 — Keyboard (frozen)

| Item | Value |
|------|--------|
| Tag | `ce2-keyboard-stable-v60` |
| Doc | `ROLLBACK-KEYBOARD-v60.md` · `KEYBOARD-STABLE.lock` |
| Console | `[CE2] communication-v2.js v60` |

### Restore keyboard only

```bash
git checkout ce2-keyboard-stable-v60 -- \
  sbd-network/public/communication-v2/index.html \
  sbd-network/public/communication-v2/communication-v2.css \
  sbd-network/public/communication-v2/communication-v2.js
cd sbd-network && firebase deploy --only hosting:sbd-network
```

### Frozen functions / CSS

`applyViewportPanCounter`, `measureComposerKeyboardLift`, viewport `overlays-content`, body/composer transform classes.

---

## Layer 2 — UI composure (frozen)

| Item | Value |
|------|--------|
| Tag | `ce2-ui-composure-stable` |
| Doc | `ROLLBACK-UI-COMPOSURE.md` · `UI-COMPOSURE-STABLE.lock` |
| CSS | `communication-v2.css?v=46` |

### Restore UI 1–3 (+ files from that commit)

```bash
git checkout ce2-ui-composure-stable -- \
  sbd-network/public/communication-v2/communication-v2.css \
  sbd-network/public/communication-v2/index.html \
  sbd-network/public/communication-v2/communication-v2.js \
  sbd-network/public/communication-v2/ce2-message-actions.js
cd sbd-network && firebase deploy --only hosting:sbd-network
```

### Revert single UI phase

```bash
git revert 21b3920d   # example: UI-2 only
firebase deploy --only hosting:sbd-network
```

---

## Layer 3 — Audio (before starting)

**Preflight:** `AUDIO-PHASE-1A-GUARDRAILS.md`  
**Spec:** `PHASE-1-AUDIO-MESSAGING.md`

---

## Regression gate (after every deploy)

1. Console **v60** + keyboard rollback id  
2. Header **A**, gap **C**  
3. UI-1–3 visual smoke (header, search, composer, messages)  
4. Phase-specific test (voice for 1A)

---

## Git tags

| Tag | Purpose |
|-----|---------|
| `ce2-keyboard-stable-v60` | Keyboard + gap |
| `ce2-ui-composure-stable` | UI-1 + UI-2 + UI-3 on top of v60 |

```bash
git push origin ce2-keyboard-stable-v60 ce2-ui-composure-stable
```

---

## Related docs

- `CE2-ROADMAP.md`
- `ROLLBACK-KEYBOARD-v60.md`
- `ROLLBACK-UI-COMPOSURE.md`
- `PHASE-UI-COMPOSURE-REFINEMENT.md`
- `PHASE-1-AUDIO-MESSAGING.md`
- `AUDIO-PHASE-1A-GUARDRAILS.md`
