# CE2 (Messaging V2) — Implementation roadmap index

Central index for **planned and frozen** CE2 work. Use this when requesting features so scope stays isolated.

**Live:** `https://sbd-network.web.app/communication-v2/`

---

## Current production baseline

| Area | Status | Reference |
|------|--------|-----------|
| **Keyboard / header / composer gap** | **Stable** | `ce2-keyboard-stable-v60` · `e2e0e7f1` |
| **UI composure (1–3)** | **Stable** | `ce2-ui-composure-stable` · `0ac45906` · CSS **v46** |
| Core messaging beta | Shipped | `communication-v2.js` v60 + `ce2-*.js` |
| Media upload | Shipped | R2 · `dm_audio` |
| **Audio Phase 1** | **Not started** | Preflight: `AUDIO-PHASE-1A-GUARDRAILS.md` |

**Console check:** `[CE2] communication-v2.js v60` · `rollback=ce2-keyboard-stable-v60`

---

## Rollback framework

**Start here:** [`ROLLBACK-FRAMEWORK.md`](./ROLLBACK-FRAMEWORK.md) — layers, tags, revert commands, regression gate.

## Frozen — do not break without re-test plan

```
ce2-keyboard-stable-v60  → e2e0e7f1
└── ce2-ui-composure-stable  → 0ac45906  (UI-1, UI-2, UI-3)
    ├── ROLLBACK-FRAMEWORK.md
    ├── ROLLBACK-KEYBOARD-v60.md
    ├── ROLLBACK-UI-COMPOSURE.md
    └── AUDIO-PHASE-1A-GUARDRAILS.md  ← read before audio
```

---

## Planned passes

| Priority | Document | Scope | Status |
|----------|----------|-------|--------|
| UI | [`PHASE-UI-COMPOSURE-REFINEMENT.md`](./PHASE-UI-COMPOSURE-REFINEMENT.md) | UI-1–3 | **Shipped** |
| UI-4 | Same doc | Optional keyboard trim | Optional |
| Audio | [`PHASE-1-AUDIO-MESSAGING.md`](./PHASE-1-AUDIO-MESSAGING.md) + [`AUDIO-PHASE-1A-GUARDRAILS.md`](./AUDIO-PHASE-1A-GUARDRAILS.md) | 1A→1D | **Next** |
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
| `ce2-keyboard-stable-v60` | Keyboard + gap |
| `ce2-ui-composure-stable` | UI-1–3 (current visual baseline) |
| `e2e0e7f1` | Keyboard only |
| `0ac45906` | UI-1–3 tip |
| `aed23b62` / `21b3920d` / `0ac45906` | UI-1 / UI-2 / UI-3 individually |

---

## Document history

| Date | Change |
|------|--------|
| 2026-05 | Roadmap index created |
