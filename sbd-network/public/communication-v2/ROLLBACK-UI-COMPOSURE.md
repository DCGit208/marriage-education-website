# CE2 UI composure — stable rollback point (UI-1–3)

**Status:** Shipped to `main` (May 2026)  
**Stacked on:** `ce2-keyboard-stable-v60` (keyboard + gap must remain stable)

**Live:** `https://sbd-network.web.app/communication-v2/`  
**CSS:** `communication-v2.css?v=46` · **JS:** `communication-v2.js?v=60` (unchanged by UI)

---

## Rollback identifiers

| Artifact | Value |
|----------|--------|
| Git tag | `ce2-ui-composure-stable` |
| Commit | `0ac45906` (UI-3; includes UI-1 + UI-2) |
| Rollback ID | `ce2-ui-composure-stable` |
| Lock file | `UI-COMPOSURE-STABLE.lock` |
| Spec | `PHASE-UI-COMPOSURE-REFINEMENT.md` |

### Per-phase commits (revert one at a time if needed)

| Phase | Commit | Message |
|-------|--------|---------|
| UI-1 | `aed23b62` | header + search |
| UI-2 | `21b3920d` | message rhythm |
| UI-3 | `0ac45906` | composer visual |

Keyboard baseline (below UI): `e2e0e7f1` · tag `ce2-keyboard-stable-v60`

---

## Files in this rollback

| File | UI phases |
|------|-----------|
| `communication-v2.css` | UI-1, UI-2, UI-3 |
| `index.html` | cache bust, search toggle (UI-1) |
| `ce2-message-actions.js` | search toggle wiring (UI-1) |
| `communication-v2.js` | search toggle visibility only (UI-1) — **no keyboard logic** |

**Not changed by UI:** `applyViewportPanCounter`, `measureComposerKeyboardLift`, viewport meta.

---

## Restore full UI + keyboard baseline

```bash
cd marriage-education   # repo root

git checkout ce2-ui-composure-stable -- \
  sbd-network/public/communication-v2/communication-v2.css \
  sbd-network/public/communication-v2/index.html \
  sbd-network/public/communication-v2/communication-v2.js \
  sbd-network/public/communication-v2/ce2-message-actions.js \
  sbd-network/public/version.json \
  sbd-network/public/service-worker.js

cd sbd-network && firebase deploy --only hosting:sbd-network
```

## Restore keyboard only (keep or drop UI)

```bash
git checkout ce2-keyboard-stable-v60 -- \
  sbd-network/public/communication-v2/index.html \
  sbd-network/public/communication-v2/communication-v2.css \
  sbd-network/public/communication-v2/communication-v2.js
# redeploy
```

---

## Document history

| Date | Change |
|------|--------|
| 2026-05 | UI-1–3 stable; tag before Audio Phase 1A |
