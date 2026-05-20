# CE2 Audio Phase 1A — preflight guardrails

**Read before implementing** `PHASE-1-AUDIO-MESSAGING.md` § Phase 1A.

**Do not start Audio 1A until this checklist is satisfied.**

---

## Frozen baselines (do not break)

| Layer | Tag / ID | Restore doc |
|-------|----------|-------------|
| Keyboard + gap | `ce2-keyboard-stable-v60` | `ROLLBACK-KEYBOARD-v60.md` |
| UI composure | `ce2-ui-composure-stable` | `ROLLBACK-UI-COMPOSURE.md` |

**Console must show:** `[CE2] communication-v2.js v60` · `rollback=ce2-keyboard-stable-v60`

---

## Hard rules for Audio 1A

1. **New modules only** — `ce2-audio-recorder.js` (and wire in `index.html`); do not rewrite keyboard functions.
2. **Do not change** `applyViewportPanCounter`, `measureComposerKeyboardLift`, viewport meta, `body.ce2-kb-active` / composer transform CSS.
3. **Do not change** UI-1–3 CSS except optional `.ce2-msg-audio` bubble hooks (no layout shift).
4. **R2 only** — `uploadCe2Media` / folder `dm_audio` via `ce2-attachments.js`; no Firebase Storage migration.
5. **One deploy** — Audio 1A only; no UI-4 + 1A together.
6. **Extract voice logic** from `communication-v2.js` into recorder module; shrink inline `startVoiceCapture` — do not duplicate.
7. **iPhone PWA test** after deploy — regression gate below.

---

## Allowed touch surfaces (1A)

| File | Allowed |
|------|---------|
| `ce2-audio-recorder.js` | **New** |
| `communication-v2.js` | Remove inline voice; thin `init` + callbacks only |
| `index.html` | Script tag for recorder module |
| `communication-v2.css` | Recording overlay in composer area only (no shell/header) |
| `ce2-attachments.js` | Unchanged unless mime helper needed |

---

## Forbidden (1A)

- `position: fixed` on header, shell, or composer for keyboard
- `interactive-widget=resizes-content`
- Resizing `.ce2-shell` with `visualViewport`
- Replacing v60 composer lift math
- IndexedDB outbox (that's **1B**)
- Waveforms (that's **1D**)
- `GlobalAudioPlaybackManager` overhaul (that's **1C**)

---

## Regression gate (mandatory after 1A deploy)

Run on **iPhone PWA** (Home Screen):

1. [ ] Console: **v60** + `ce2-keyboard-stable-v60`
2. [ ] Header **A** — open keyboard, no jump
3. [ ] Gap **C** — composer flush on keyboard
4. [ ] UI intact — compact header, ⌕ search, message spacing
5. [ ] Hold mic → record 3s → release → one message sent (no duplicate)
6. [ ] Slide/cancel behavior if implemented — no send on cancel
7. [ ] Focus text after voice — keyboard still stable
8. [ ] Hub mode ← thread — no layout break

**If any fail:** revert Audio 1A commit; restore `ce2-ui-composure-stable` if CSS was touched; do not patch keyboard.

---

## Rollback Audio 1A only

```bash
git revert <audio-1a-commit-sha>
cd sbd-network && firebase deploy --only hosting:sbd-network
```

## Rollback to pre-audio (UI + keyboard stable)

```bash
git checkout ce2-ui-composure-stable -- sbd-network/public/communication-v2/
# redeploy hosting
```

---

## Request phrase for implementer

> Implement CE2 Audio Phase 1A per `PHASE-1-AUDIO-MESSAGING.md` and `AUDIO-PHASE-1A-GUARDRAILS.md`.  
> Do not modify v60 keyboard or UI composure CSS except composer recording overlay.  
> Run full regression gate before calling done.

---

## Document history

| Date | Change |
|------|--------|
| 2026-05 | Created before Audio 1A |
