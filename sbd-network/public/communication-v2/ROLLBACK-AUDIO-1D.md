# CE2 Audio Phase 1A–1D — stable rollback point

**Status:** Shipped to `main` and Firebase hosting (May 2026)  
**Stacked on:** `ce2-keyboard-stable-v60` + `ce2-ui-composure-stable` (layers 1–2 must stay stable)

**Live:** https://sbd-network.web.app/communication-v2/

---

## Rollback identifiers

| Artifact | Value |
|----------|--------|
| Git tag | `ce2-audio-stable-1d` (commit `44d194d6`) |
| Audio code tip | `0f4e7f53` (1D; includes 1A + 1B + 1C) |
| Rollback ID | `ce2-audio-stable-1d` |
| Lock file | `AUDIO-STABLE.lock` |
| Spec | `PHASE-1-AUDIO-MESSAGING.md` |

### Per-phase commits (revert one at a time if needed)

| Phase | Commit | Scope |
|-------|--------|--------|
| 1A | `4fe1d22c` | `ce2-audio-recorder.js`, PTT, slide-to-cancel |
| Modules | `343daa0a` | `ce2-attachments.js` + other `ce2-*.js` tracked in git |
| 1B | `de3cd161` | `ce2-audio-outbox.js`, upload resilience |
| 1C | `73b034e9` | `ce2-audio-playback.js`, custom player |
| 1D | `0f4e7f53` | `ce2-audio-waveform.js`, live/static waveform, lock flag |

**Keyboard (frozen):** `e2e0e7f1` · `ce2-keyboard-stable-v60`  
**UI composure (frozen):** `0ac45906` · `ce2-ui-composure-stable`

---

## Live asset versions (this rollback)

| Asset | Version |
|-------|---------|
| `communication-v2.js` | v60 (keyboard unchanged) |
| `communication-v2.css` | v50 |
| `ce2-audio-waveform.js` | v1 |
| `ce2-audio-playback.js` | v2 |
| `ce2-audio-outbox.js` | v1 |
| `ce2-audio-recorder.js` | v3 |

**Console check:**

- `[CE2] communication-v2.js v60` · `rollback=ce2-keyboard-stable-v60`
- `[CE2] ce2-audio-recorder.js Phase 1A`
- `[CE2] ce2-audio-outbox.js Phase 1B`
- `[CE2] ce2-audio-playback.js Phase 1C`
- `[CE2] ce2-audio-waveform.js Phase 1D`
- `[CE2] audio rollback=ce2-audio-stable-1d`

---

## Files in this rollback

| File | Phases |
|------|--------|
| `ce2-audio-recorder.js` | 1A, 1D (lock flag) |
| `ce2-audio-outbox.js` | 1B |
| `ce2-audio-playback.js` | 1C, 1D (static waveform in bubble) |
| `ce2-audio-waveform.js` | 1D |
| `communication-v2.js` | 1A–1D wiring (voice upload pipeline, playback hooks) |
| `communication-v2.css` | 1B–1D bubble/player/record bar styles |
| `index.html` | script tags, record bar canvas, cache bust |
| `ce2-attachments.js` | R2 `dm_audio` upload (required) |

**Not changed:** `applyViewportPanCounter`, `measureComposerKeyboardLift`, viewport meta, v60 composer lift.

---

## Restore full audio stack (1A–1D)

```bash
cd marriage-education   # repo root

git checkout ce2-audio-stable-1d -- sbd-network/public/communication-v2/

cd sbd-network && firebase deploy --only hosting:sbd-network
```

## Restore audio only (keep keyboard + UI from current `main`)

Same as above — audio modules live under `communication-v2/` only.

## Revert audio only (stay on current branch)

```bash
git revert 0f4e7f53   # 1D only
# or revert in reverse order: 0f4e7f53, 73b034e9, de3cd161, 4fe1d22c
cd sbd-network && firebase deploy --only hosting:sbd-network
```

## Restore pre-audio (keyboard + UI only)

```bash
git checkout ce2-ui-composure-stable -- sbd-network/public/communication-v2/
cd sbd-network && firebase deploy --only hosting:sbd-network
```

---

## Regression gate (after any audio change)

1. Console: **v60** + `ce2-keyboard-stable-v60` + `ce2-audio-stable-1d`
2. Header **A**, gap **C** (keyboard)
3. UI-1–3 intact
4. Hold mic → record → send (1A)
5. Upload fail → Retry/Discard (1B)
6. Play A then B → A stops (1C)
7. Live waveform while recording; static waveform in bubble (1D)
8. Lock-to-record: only if `localStorage ce2_lock_record=1` (off by default)

---

## Lock-to-record (1D)

**On for all users** (`LOCK_TO_RECORD = true` in `ce2-audio-recorder.js` v4+).

Opt-out for debugging:

```javascript
localStorage.setItem('ce2_lock_record', '0');
location.reload();
```

---

## Document history

| Date | Change |
|------|--------|
| 2026-05 | Audio 1A–1D stable; tag `ce2-audio-stable-1d` |
