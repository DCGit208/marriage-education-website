# CE2 (Messaging V2) — Implementation roadmap index

Central index for **planned and frozen** CE2 work. Use this when requesting features so scope stays isolated.

**Live:** `https://sbd-network.web.app/communication-v2/`

---

## Current production baseline

| Area | Status | Reference |
|------|--------|-----------|
| **Keyboard / header / composer gap** | **Stable (shipped)** | `ROLLBACK-KEYBOARD-v60.md` · tag `ce2-keyboard-stable-v60` · JS **v60** |
| Core messaging beta | Shipped | `communication-v2.js` + `ce2-*.js` modules |
| Media upload | Shipped | R2 via `ce2-attachments.js` (`dm_audio`, etc.) |

**Console check:** `[CE2] communication-v2.js v60` · `rollback=ce2-keyboard-stable-v60`

---

## Frozen — do not break without re-test plan

```
ce2-keyboard-stable-v60
├── ROLLBACK-KEYBOARD-v60.md
├── KEYBOARD-STABLE.lock
└── Frozen: applyViewportPanCounter, measureComposerKeyboardLift,
    overlays-content, body/composer transform classes
```

---

## Planned passes (not started unless noted)

| Priority | Document | Scope | Depends on |
|----------|----------|-------|------------|
| 1 | [`PHASE-UI-COMPOSURE-REFINEMENT.md`](./PHASE-UI-COMPOSURE-REFINEMENT.md) | Header, search, bubbles, composer **visuals** (UI-1→UI-4) | v60 frozen |
| 2 | [`PHASE-1-AUDIO-MESSAGING.md`](./PHASE-1-AUDIO-MESSAGING.md) | Voice PTT, playback, retry, waveforms (1A→1D) | v60 frozen |
| — | [`ROLLBACK-KEYBOARD-v59.md`](./ROLLBACK-KEYBOARD-v59.md) | Historical (header-only) | Superseded by v60 |

---

## Recommended execution order

```
1. UI-1  →  test v60  →  deploy
2. UI-2  →  test v60  →  deploy
3. UI-3  →  test v60  →  deploy
4. (optional UI-4 trim)
5. Audio 1A  →  test v60  →  deploy
6. Audio 1B, 1C, …
```

**Do not** combine UI-4 keyboard trim + Audio 1A + UI-3 in one deploy.

---

## Quick request phrases

| You say | Implementer does |
|---------|------------------|
| UI composure UI-1 only | `PHASE-UI-COMPOSURE-REFINEMENT.md` § UI-1 |
| UI full (no UI-4) | UI-1 + UI-2 + UI-3 |
| Audio Phase 1A only | `PHASE-1-AUDIO-MESSAGING.md` § 1A |
| Audio MVP | 1A + 1C |
| Fix keyboard only | `ROLLBACK-KEYBOARD-v60.md` — revert to tag |

---

## Git references

| Tag / commit | Meaning |
|--------------|---------|
| `ce2-keyboard-stable-v60` | Recommended tag after keyboard commit on `main` |
| `e2e0e7f1` | Keyboard v60 commit (May 2026) |

---

## Document history

| Date | Change |
|------|--------|
| 2026-05 | Roadmap index created |
