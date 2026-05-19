# CE2 Rollback Framework

Quick reference for restoring stable CE2 behavior before and during **UI**, **audio**, and future passes.

**Index:** `CE2-ROADMAP.md`

---

## Three layers

| Layer | Status | Rollback |
|-------|--------|----------|
| **1 — Keyboard / viewport** | **Stable (v60)** | Git tag `ce2-keyboard-stable-v60` → commit `e2e0e7f1` |
| **2 — UI composure** | Planned | Revert per-phase CSS commits (`UI-1`, `UI-2`, …) |
| **3 — Audio** | Planned | Revert audio module commits; see `PHASE-1-AUDIO-MESSAGING.md` |

**Rule:** UI and audio work must **not** break Layer 1 without a full iPhone PWA keyboard re-test.

---

## Layer 1 — Keyboard (frozen)

| Item | Value |
|------|--------|
| Tag | `ce2-keyboard-stable-v60` |
| Commit | `e2e0e7f1` |
| Rollback ID | `ce2-keyboard-stable-v60` |
| Console | `[CE2] communication-v2.js v60` · `rollback=ce2-keyboard-stable-v60` |
| Detail doc | `ROLLBACK-KEYBOARD-v60.md` |
| Lock file | `KEYBOARD-STABLE.lock` |

### Restore keyboard files + deploy

```bash
cd marriage-education   # repo root (adjust path)

git checkout ce2-keyboard-stable-v60 -- sbd-network/public/communication-v2/index.html \
  sbd-network/public/communication-v2/communication-v2.css \
  sbd-network/public/communication-v2/communication-v2.js

firebase deploy --only hosting:sbd-network
```

On iPhone PWA: force-refresh or reopen app; confirm console **v60**.

### Frozen (do not change in UI/audio passes)

- `applyViewportPanCounter`, `measureComposerKeyboardLift`, `applyComposerKeyboardInset`
- Viewport: `interactive-widget=overlays-content`
- `body.ce2-kb-active` / `body.ce2-composer-kb-active` and `--ce2-vv-offset` / `--ce2-composer-kb`
- Flex header (no `position: fixed` on `.ce2-header` / shell resize)

---

## Layer 2 — UI composure (planned)

**Doc:** `PHASE-UI-COMPOSURE-REFINEMENT.md`

### Before starting UI

1. Verify Layer 1 on device (header **A**, gap **C**).
2. Optional tag: `git tag -a ce2-pre-ui-YYYY-MM-DD main`

### During UI

- One git commit per phase: `UI-1`, `UI-2`, `UI-3`, optional `UI-4`.
- After each deploy: run [regression gate](#regression-gate-after-every-deploy).

### Revert last UI phase only

```bash
git revert <ui-phase-commit-sha>
firebase deploy --only hosting:sbd-network
```

### If keyboard regresses

1. Stop UI changes.
2. Restore Layer 1 (above) — do not stack new keyboard hacks.
3. Revert the UI commit that touched JS/viewport if any.

---

## Layer 3 — Audio (planned)

**Doc:** `PHASE-1-AUDIO-MESSAGING.md`

- Revert commits that add `ce2-audio-*.js` or voice changes in `communication-v2.js`.
- Layer 1 restore still applies if keyboard breaks.
- Do not deploy full UI + Audio 1A in one release.

---

## Regression gate (after every deploy)

1. Console: **v60** + `rollback=ce2-keyboard-stable-v60`
2. Thread → focus textarea → header stable, no large composer–keyboard gap
3. Blur keyboard; hub + send text still work
4. (Optional) hold mic 3s → send

**Fail →** revert last change or `git checkout ce2-keyboard-stable-v60 --` Layer 1 files.

---

## Hosting / cache

Rollback requires **git restore + Firebase deploy**:

```bash
cd sbd-network
firebase deploy --only hosting:sbd-network
```

Bump `version.json` / script `?v=` when shipping UI so PWA cache refreshes.

---

## Git tags (recommended)

| Tag | Points to | Purpose |
|-----|-----------|---------|
| `ce2-keyboard-stable-v60` | `e2e0e7f1` | Keyboard + gap stable |
| `ce2-pre-ui-*` | commit before first UI | Optional UI baseline |
| `ce2-ui-1-stable` | after UI-1 verified | Optional per phase |

Create tag:

```bash
git tag -a ce2-keyboard-stable-v60 e2e0e7f1 -m "CE2 keyboard: header A + gap closed (iPhone PWA)"
git push origin ce2-keyboard-stable-v60
```

---

## Related docs

- `CE2-ROADMAP.md`
- `ROLLBACK-KEYBOARD-v60.md`
- `PHASE-UI-COMPOSURE-REFINEMENT.md`
- `PHASE-1-AUDIO-MESSAGING.md`
