# CE2 Phase 1 — Audio Messaging Excellence

**Implementation reference** for SBD Network Messaging V2 (Communication Engine V2).  
Use this document when requesting implementation — even if work is deferred.

| Field | Value |
|-------|--------|
| **Status** | Planned (not started) |
| **Scope** | Voice notes + push-to-talk + playback + iOS PWA stability |
| **Storage** | **Cloudflare R2** (existing `uploadToR2` / `dm_audio`) — not Firebase Storage |
| **Layout dependency** | **Frozen** — `ce2-keyboard-stable-v60` (see `ROLLBACK-KEYBOARD-v60.md`) |
| **Live app** | `https://sbd-network.web.app/communication-v2/` |

---

## Table of contents

1. [Critical instructions](#critical-instructions)
2. [Primary objective](#primary-objective)
3. [Business value and expectations](#business-value-and-expectations)
4. [Cost and timeline](#cost-and-timeline)
5. [Current baseline (as of v60)](#current-baseline-as-of-v60)
6. [Architecture constraints](#architecture-constraints)
7. [Phased delivery plan](#phased-delivery-plan)
8. [Module and file plan](#module-and-file-plan)
9. [State model](#state-model)
10. [Recording engine](#recording-engine)
11. [Push-to-talk UX](#push-to-talk-ux)
12. [Playback system](#playback-system)
13. [Upload and R2 integration](#upload-and-r2-integration)
14. [Failed upload recovery](#failed-upload-recovery)
15. [Cached playback](#cached-playback)
16. [UI and audio bubble design](#ui-and-audio-bubble-design)
17. [iOS PWA rules](#ios-pwa-rules)
18. [Security and governance](#security-and-governance)
19. [Performance and limits](#performance-and-limits)
20. [Explicitly out of scope](#explicitly-out-of-scope)
21. [Validation checklist](#validation-checklist)
22. [Regression tests (keyboard v60)](#regression-tests-keyboard-v60)
23. [How to request implementation](#how-to-request-implementation)
24. [Appendix: original spec goals](#appendix-original-spec-goals)

---

## Critical instructions

1. **DO NOT** rebuild Messaging V2.
2. **DO NOT** touch stabilized layout/viewport/keyboard systems unless a regression is proven and fixed in isolation.
3. **DO NOT** rewrite navigation, hub tabs, or thread chrome.
4. This work is **AUDIO EXPERIENCE REFINEMENT ONLY**.
5. Preserve existing beta messaging architecture (`communication-v2.js` orchestrator + `ce2-*.js` modules).
6. **DO NOT** migrate audio to Firebase Storage — continue **R2** via `ce2-attachments.js` / `upload.js`.
7. **DO NOT** add live voice calls, video calls, or livestreaming in Phase 1.

### Frozen layout reference (non-negotiable)

Before and after every audio sub-phase, verify:

- Console: `[CE2] communication-v2.js v60` and `rollback=ce2-keyboard-stable-v60`
- Header stable when keyboard opens (**A**)
- Composer–keyboard gap closed (**C**)

**Do not modify** without explicit keyboard re-test plan:

- `applyViewportPanCounter()`
- `applyComposerKeyboardLift()` / `measureComposerKeyboardLift()`
- `index.html` viewport: `interactive-widget=overlays-content`
- `body.ce2-kb-active` / `body.ce2-composer-kb-active` CSS
- `.ce2-header` / `.ce2-shell` flex layout

See: `ROLLBACK-KEYBOARD-v60.md`, `KEYBOARD-STABLE.lock`.

---

## Primary objective

Transform the current microphone feature into **premium, reliable audio messaging infrastructure**:

| Should feel | Should NOT feel |
|-------------|-----------------|
| Stable | Fragile |
| Responsive | Laggy |
| Premium / intentional | Experimental |
| Reliable on iPhone PWA | Inconsistent |

**Measurable Phase 1 success** (not marketing slogans):

- Hold-to-talk works reliably on iPhone PWA (50+ trials, zero duplicate sends).
- Failed uploads can be **retried without re-recording**.
- Only **one** voice message plays at a time.
- **No** header jump or composer gap regression vs v60.

---

## Business value and expectations

### Why this matters for SBD

- **Formation / mentoring** — voice is warmer and faster than typing for encouragement, prayer, clarification.
- **Mobile-first** — members use phones; PWA voice must work as well as text.
- **Infrastructure already exists** — R2 upload, `audioUrl` on messages, governance hooks; Phase 1 completes the **experience**, not a new platform bet.

### Realistic expectations by phase

| Phase | User-visible outcome |
|-------|----------------------|
| **1A** | Trustworthy hold-to-talk: cancel, timer, no accidental double-send |
| **1B** | Failed send shows retry; recording not lost on bad network |
| **1C** | Tap to play/pause; one voice at a time; clear bubble controls |
| **1D** | Waveforms + optional lock-to-record (only if 1A–1C pass on iPhone PWA) |

### What Phase 1 is NOT promising

- “More premium than Telegram” on day one (polish is **1D + iteration**).
- Zero latency mic start on first permission (iOS requires `getUserMedia`; aim for fast feedback **after** permission).
- Studio-grade compression or transcription.

---

## Cost and timeline

### Cost (infrastructure)

| Item | Expected cost |
|------|----------------|
| New servers / APIs | **$0** |
| Firebase Storage | **Not used** for CE2 media |
| **Cloudflare R2** | Same as today: pay for storage + operations as voice volume grows; typically **~$0 at beta scale** within R2 free tier |
| Third-party waveform SaaS | **$0** (build lightweight client-side or defer to 1D) |

**Note:** Voice files are larger than text. Monitor R2 usage if adoption is high. Existing cap: **15 MB** per voice note (`ce2-attachments.js`).

### Implementation timeline (estimate)

| Scope | Dev effort | Calendar (incl. iPhone PWA testing) |
|-------|------------|--------------------------------------|
| **MVP: 1A + 1C** | ~2–3 days | ~4–7 days |
| **1A + 1B + 1C** | ~3–5 days | ~1–1.5 weeks |
| **Full 1A–1D** | ~5–9 days | ~1.5–2.5 weeks |

Recommend: ship **1A → test → 1B → test → 1C → test → 1D (optional)**.

---

## Current baseline (as of v60)

### What exists today

| Area | Location | Behavior |
|------|----------|----------|
| Mic button | `index.html` `#ce2VoiceBtn` | Hold via pointer events |
| Recording | `communication-v2.js` | `startVoiceCapture` / `stopVoiceCapture`, module globals `voiceRecorder`, `voiceStream`, `voiceChunks` |
| State flag | `CommunicationState.voiceRecording` | Boolean only |
| On stop | `voiceRecorder.onstop` | Builds `File` blob → `startComposerUpload(file)` |
| Upload | `ce2-attachments.js` | `uploadCe2Media` → R2 folder **`dm_audio`** |
| Send pipeline | `communication-v2.js` | `addComposerFiles` → `processAttachQueue` → Firestore message with `audioUrl`, `messageType: 'voice'` |
| Message UI | `renderMessages` | Plain `<audio class="ce2-msg-audio" controls>` |
| Recording UI | CSS `.ce2-composer-voice.is-recording` | Pulse animation |
| Offline queue | `ce2-offline-queue.js` | **Text only** in `localStorage` — **not suitable for audio blobs** |
| Optimistic UI | `pendingMessages`, `is-pending` | Text/media send pattern exists; voice uses same upload queue |

### Known weaknesses (why Phase 1 is needed)

- `pointerleave` on mic button **stops and sends** — conflicts with slide-to-cancel UX.
- No **slide-to-cancel** or **lock-to-record**.
- No **recording timer** or live level/waveform preview.
- Risk of **duplicate upload** if `onstop` fires twice or rapid tap.
- No `timeslice` on `MediaRecorder` — crash/background can lose data.
- Upload failure **does not preserve blob** for retry (error toast only).
- **Multiple `<audio>` elements** can play simultaneously.
- iOS: `audio/webm` record/playback may fail; mp4 fallback partially implemented for record only.
- Voice logic lives inside **3,300+ line** `communication-v2.js` — should move to dedicated modules.

---

## Architecture constraints

### Two independent systems (never merge)

```
┌─────────────────────────────────────────────────────────────┐
│  LAYOUT / KEYBOARD (v60 FROZEN)                              │
│  applyViewportPanCounter · overlays-content · flex header      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  AUDIO (Phase 1 — this document)                             │
│  ce2-audio-recorder.js · ce2-audio-playback.js · outbox      │
└─────────────────────────────────────────────────────────────┘
```

Audio UI must be confined to:

- Composer bar overlay (recording indicator, cancel hint)
- Message bubbles (playback controls)
- Optional fixed overlay **inside** `.ce2-composer` or `.ce2-main` — **must not** change shell/header height logic or keyboard CSS variables.

### Integration points (allowed touch surfaces)

| File | Allowed changes |
|------|-----------------|
| `ce2-audio-recorder.js` | **New** — primary recording logic |
| `ce2-audio-playback.js` | **New** — global playback manager |
| `ce2-audio-outbox.js` | **New** — IndexedDB failed/retry queue |
| `ce2-audio-waveform.js` | **New optional (1D)** — canvas/CSS waveform |
| `communication-v2.js` | Thin wiring: init modules, render hooks, replace inline voice functions |
| `communication-v2.css` | Audio bubble + recording overlay styles only |
| `index.html` | Script tags for new modules, cache bust |
| `ce2-attachments.js` | Minor: audio-specific upload helpers if needed |
| `ce2-offline-queue.js` | **Do not** store blobs here; reference from outbox doc |

---

## Phased delivery plan

### Phase 1A — Recording core (ship first)

**Goal:** Reliable hold-to-talk without layout changes.

**Implement:**

- [ ] `ce2-audio-recorder.js` with state machine
- [ ] Hold to record, release to send
- [ ] Slide left/down to **cancel** (do not send); replace accidental `pointerleave` = send
- [ ] Visual: recording timer, pulsing mic, “slide to cancel” hint
- [ ] `MediaRecorder` hardening:
  - [ ] `timeslice: 250` (configurable)
  - [ ] `requestData()` before `stop()` on iOS
  - [ ] Max duration (e.g. 5 min) with auto-stop + user message
  - [ ] Guard: single `onstop` → single upload (debounce / `uploadStarted` flag)
  - [ ] Always `stop()` tracks in `finally`
- [ ] Format selection: prefer `audio/mp4` on iOS when supported, else `audio/webm`
- [ ] Minimum duration (e.g. 0.5s) — discard accidental taps
- [ ] Wire to existing `startComposerUpload(file)` — **no change to R2 path**

**Exit criteria:**

- 20 consecutive record/send cycles on iPhone PWA without duplicate messages
- Cancel works 10/10 times
- Keyboard v60 regression tests pass

---

### Phase 1B — Upload resilience

**Goal:** Never lose a recording due to network failure.

**Implement:**

- [ ] Message states: `recording` | `uploading` | `sent` | `failed` | `retrying`
- [ ] Optimistic bubble for voice with upload progress %
- [ ] `ce2-audio-outbox.js` — **IndexedDB** store:
  - `conversationId`, `localId`, `blob`, `mime`, `duration`, `createdAt`, `retryCount`
- [ ] On upload failure: keep blob in outbox, show **Retry** + **Discard**
- [ ] Retry calls existing `uploadCe2Media` then sends Firestore message
- [ ] Prevent duplicate sends (`localId` dedup)
- [ ] On app reload: surface outbox items in thread or composer

**Exit criteria:**

- Airplane mode during upload → fail → retry after reconnect → message appears once
- No duplicate Firestore messages for one recording

---

### Phase 1C — Playback excellence

**Goal:** Listening feels intentional; no overlapping audio.

**Implement:**

- [ ] `ce2-audio-playback.js` — `GlobalAudioPlaybackManager` (singleton)
  - [ ] One active `HTMLAudioElement` (or small pool max 1)
  - [ ] `play(messageId, url)` stops previous
  - [ ] `pause()`, `seek()`, `onEnded` cleanup
  - [ ] Memory: revoke object URLs when done
- [ ] Custom bubble UI: play/pause button, duration, progress bar (not native controls only)
- [ ] `canPlayType` check; show friendly error if format unsupported
- [ ] Optional: resume position per message during session (in-memory Map)

**Exit criteria:**

- Play message A, then B → A stops
- Leave thread → playback stops, no leak
- Keyboard v60 regression tests pass

---

### Phase 1D — Premium polish (optional)

**Goal:** Waveforms and lock-to-record **only if stable**.

**Implement:**

- [ ] Live recording waveform via `AnalyserNode` (lightweight, throttle repaints)
- [ ] Static waveform in sent bubbles (generate on stop from peaks array stored in message metadata or derived client-side)
- [ ] Swipe up to lock recording (WhatsApp-style) — **feature flag** default off until iPhone validated

**Exit criteria:**

- No frame drops / layout shift on iPhone PWA during record
- Lock-to-record: 10/10 success or feature removed

---

## Module and file plan

### New files (recommended)

```
public/communication-v2/
  ce2-audio-recorder.js      # Recording + PTT + state machine
  ce2-audio-playback.js     # GlobalAudioPlaybackManager
  ce2-audio-outbox.js       # IndexedDB failed upload recovery (1B)
  ce2-audio-waveform.js     # Optional (1D)
  ce2-audio.css             # Optional split, or extend communication-v2.css
```

### `index.html` script order (after dependencies)

```html
<script defer src="/communication-v2/ce2-attachments.js?v=…"></script>
<script defer src="/communication-v2/ce2-audio-playback.js?v=1"></script>
<script defer src="/communication-v2/ce2-audio-outbox.js?v=1"></script>
<script defer src="/communication-v2/ce2-audio-recorder.js?v=1"></script>
<script defer src="/communication-v2/communication-v2.js?v=…"></script>
```

### `communication-v2.js` changes (minimal)

- Remove inline `voiceRecorder` / `startVoiceCapture` / `bindVoiceComposer` (move to module).
- On `wireUi()`: `Ce2AudioRecorder.init({ el, onFileReady: startComposerUpload, … })`.
- On message render: `Ce2AudioPlayback.attachBubble(rowEl, message)`.
- Export `CommunicationState` updates via recorder callbacks only.

---

## State model

### `AudioRecorderState` (in `ce2-audio-recorder.js` or extend `CommunicationState`)

| Field | Type | Description |
|-------|------|-------------|
| `isRecording` | boolean | Mic actively recording |
| `isPaused` | boolean | Optional pause (Phase 1D+ if needed) |
| `isLocked` | boolean | Lock-to-record mode (1D) |
| `recordingDurationMs` | number | Live timer |
| `uploadState` | enum | `idle` \| `uploading` \| `sent` \| `failed` \| `retrying` |
| `waveformState` | object | Peaks buffer for UI (1D) |
| `activeConversationId` | string | Prevent cross-thread bleed |
| `cancelGesture` | boolean | User slid to cancel |
| `localDraftId` | string | Dedup id until Firestore id exists |

### Message-level audio metadata (Firestore — optional fields)

```javascript
{
  messageType: 'voice',
  audioUrl: 'https://…',           // R2 URL (existing)
  audioDurationMs: 12340,          // optional, new
  audioWaveformPeaks: [0,2,5,…],   // optional, 1D — keep small (~64 samples)
  audioMime: 'audio/mp4'           // optional
}
```

Only add fields if needed for waveform/duration; **do not break** existing clients that only read `audioUrl`.

---

## Recording engine

### MediaRecorder requirements

```javascript
// Pseudocode — implement in ce2-audio-recorder.js
var mime = pickMime(); // audio/mp4 iOS, audio/webm elsewhere
var recorder = new MediaRecorder(stream, { mimeType: mime });
recorder.start(250); // timeslice ms

recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

function stopAndFinalize() {
  if (recorder.state !== 'inactive') {
    try { recorder.requestData(); } catch (_) {}
    recorder.stop();
  }
  stream.getTracks().forEach((t) => t.stop());
}
```

### Anti-patterns to fix from current code

| Current | Phase 1 fix |
|---------|-------------|
| `pointerleave` → send | Only **pointerup** in button zone sends; leave during cancel zone cancels |
| No upload guard | `if (session.finalized) return` before `startComposerUpload` |
| Globals on window scope | Encapsulate in `Ce2AudioRecorder` module |
| Immediate `getUserMedia` on every down | Optional: warm mic after first user gesture per session (document permission state) |

### Push-to-talk event model

| Event | Action |
|-------|--------|
| `pointerdown` on mic | Start session (or show “Release to cancel” if permission pending) |
| `pointermove` | If finger outside cancel threshold → show cancel state |
| `pointerup` in send zone | Stop + upload |
| `pointerup` in cancel zone | Stop + discard blob |
| `pointercancel` | Treat as cancel |

Use **pointer capture** on mic button for reliable tracking on iOS.

---

## Push-to-talk UX

### Required UX

- Hold to record
- Release to send
- Slide away to cancel
- Visual recording state (timer + mic pulse)
- Immediate visual feedback on touch (even if mic warms up 100–300ms later)

### Lock-to-record (1D, optional)

- Swipe up while holding → locked recording
- Tap stop to finish and send
- Behind feature flag: `Ce2AudioRecorder.LOCK_TO_RECORD = false` until tested

### DO NOT

- Require multiple taps to start
- Block UI thread with sync waveform on every frame
- Resize composer/header when recording overlay opens (use overlay `position: absolute` inside composer)

---

## Playback system

### `GlobalAudioPlaybackManager` API (sketch)

```javascript
// ce2-audio-playback.js
var Ce2AudioPlayback = {
  play: function (messageId, url) {},
  pause: function () {},
  stop: function () {},
  getActiveId: function () { return null; },
  getProgress: function () { return { current: 0, duration: 0 }; },
  onTick: function (cb) {}, // rAF or timeupdate
  destroy: function () {}
};
```

### Bubble behavior

- Tap play → `play(id, url)`; icon → pause
- Tap pause → `pause()`
- Progress bar from `timeupdate`
- While uploading (`_pending` / `uploadState === 'uploading'`): disabled play, show spinner

---

## Upload and R2 integration

### Storage (confirmed: R2, not Firebase Storage)

| Item | Value |
|------|--------|
| Upload function | `uploadCe2Media(file, { onProgress, signal })` in `ce2-attachments.js` |
| R2 folder | `dm_audio` via `folderForFile()` |
| Max size | 15 MB |
| URL field | `audioUrl` on Firestore message |
| Message type | `messageType: 'voice'` |

**Do not** introduce `/messages/audio/{conversationId}/{messageId}` Firebase paths from early drafts unless R2 path strategy is deliberately changed project-wide.

### Upload flow (keep existing pipeline)

```
stop recording
  → File(blob)
  → startComposerUpload(file)  // or addComposerFiles([file])
  → processAttachQueue
  → uploadCe2Media → R2
  → pendingAttachments
  → sendMessage() with audioUrl
```

Phase 1B may insert **outbox** before/after `uploadCe2Media` failure without changing R2 contract.

### Progress UI

Reuse `slot.uploadProgress` / `updateAttachPreview()` pattern or show progress on optimistic voice bubble.

---

## Failed upload recovery

### When upload fails

1. **DO NOT** delete blob.
2. Write to IndexedDB outbox (`ce2-audio-outbox.js`).
3. Show message bubble: **Failed · Retry · Discard**.
4. `retrying` state during second attempt.
5. On success: remove outbox entry, update bubble to `sent`.
6. On discard: remove outbox entry, remove optimistic bubble.

### Dedup rules

- One `localId` per recording session.
- `onstop` handler idempotent.
- Retry must not create second Firestore doc for same `localId`.

---

## Cached playback

### Lightweight cache (1C or 1B)

| Strategy | Use |
|----------|-----|
| In-memory `Map<url, blob>` | Session replay |
| `Cache API` or IndexedDB | Optional repeat play offline |

**Requirements:**

- Cap cache size (e.g. 50 MB LRU)
- Revoke `blob:` URLs on eviction
- Do not cache unbounded per thread

---

## UI and audio bubble design

### Design principles

- Intentional, elegant, not cluttered
- Match CE2 dark / gold aesthetic (`#0c0c10`, `#c9b892`)
- No layout shift when waveform animates (fixed height bar)

### Audio bubble contents

| Element | Phase |
|---------|-------|
| Play / pause | 1C |
| Duration label | 1C |
| Progress bar | 1C |
| Upload / failed / retry | 1B |
| Waveform | 1D |
| Native `<audio controls>` | Remove or hide default chrome |

### Recording overlay (composer)

- Semi-transparent bar above mic row
- Timer `0:00`
- “← Slide to cancel”
- Do not focus text input during record (avoid keyboard + mic fight)

---

## iOS PWA rules

### Test matrix (required)

- iPhone Safari (browser)
- iPhone **Home Screen PWA**
- Portrait + one landscape check

### Fix / verify

- [ ] Mic permission prompt and denial handling
- [ ] Recording after app background → foreground
- [ ] No zombie mic indicator (track stopped)
- [ ] Playback after silent switch / interruption
- [ ] **No viewport shift** when recording (keyboard closed)
- [ ] **No regression** of keyboard v60 when switching text ↔ voice

### iOS format rules

| | Preference |
|---|------------|
| Record | `audio/mp4` / m4a when `MediaRecorder.isTypeSupported` |
| Fallback | `audio/webm` |
| Playback | Test `audio.canPlayType`; fallback message if unsupported |

### Audio session note

iOS may pause Web Audio / MediaRecorder on interruptions. Recorder must listen to `visibilitychange` and end or pause session safely.

---

## Security and governance

Audio must respect **existing** CE2 rules:

- `ce2-governance.js` — tier / classification on send (unchanged `buildPatch` flow)
- Firestore rules — same as text/media messages
- Lower-tier users **must not** access restricted threads via audio URLs (URLs are still gated by conversation membership and R2 access policy as today)

**No new permission model** for Phase 1.

---

## Performance and limits

| Limit | Value |
|-------|--------|
| Max voice file size | 15 MB (existing) |
| Max duration | 5 min recommended (config constant) |
| MediaRecorder timeslice | 250 ms |
| Waveform peaks | ≤ 64–128 integers per message (1D) |
| Outbox entries | Max 10 per device (configurable) |
| Cache | 50 MB LRU (if implemented) |

### Avoid

- Memory leaks from undisposed streams / Audio elements
- Giant uncompressed recordings (future: client-side compression — not Phase 1 unless trivial)

---

## Explicitly out of scope

- Live voice calls
- Video calls
- Livestreaming
- Random audio gimmicks / unstable animations
- Firebase Storage migration
- Rewriting keyboard / viewport (v60)
- Rewriting hub navigation or thread list
- Speech-to-text / AI transcription

---

## Validation checklist

### Recording (1A)

- [ ] Stable recording sessions
- [ ] No accidental cut-offs
- [ ] No frozen recordings
- [ ] No duplicate uploads
- [ ] No corrupted blobs ( playable after send )
- [ ] Proper cleanup after recording (tracks stopped)
- [ ] Cancel gesture works

### Upload (1B)

- [ ] Upload progress visible
- [ ] Retry failed uploads
- [ ] Unsent recordings preserved
- [ ] Recover after network interruption

### Playback (1C)

- [ ] Tap play / pause
- [ ] Progress updates
- [ ] One active playback
- [ ] Cleanup on thread switch / leave

### Waveform (1D)

- [ ] No lag spikes
- [ ] No layout shifting

### iOS PWA

- [ ] Recording stable on Home Screen app
- [ ] No layout regressions
- [ ] No viewport regressions

### Keyboard regression (v60)

- [ ] Header stable (**A**)
- [ ] Composer gap closed (**C**)
- [ ] Console shows v60 rollback id

---

## Regression tests (keyboard v60)

Run after **every** sub-phase:

1. Open thread on iPhone PWA.
2. Tap text input → keyboard opens → header does not jump.
3. Dismiss keyboard.
4. Hold mic → record 3s → release → send.
5. Tap text input again → keyboard opens → header still stable.
6. Play voice message while keyboard closed.

If any step fails → **stop** and fix without touching v60 paths, or revert audio commit.

---

## How to request implementation

When ready, tell the implementer:

> Implement CE2 Phase 1 audio per `public/communication-v2/PHASE-1-AUDIO-MESSAGING.md`.  
> Start with **Phase 1A only**. Do not modify keyboard v60 files/logic.  
> Use R2 (`dm_audio`). Deploy and report iPhone PWA test results before 1B.

Optional scope shortcuts:

| Request | Meaning |
|---------|---------|
| `Phase 1 MVP` | 1A + 1C only |
| `Phase 1 full` | 1A + 1B + 1C + 1D |
| `Phase 1A only` | Smallest first step |

### Suggested commit message

```
feat(ce2): Phase 1A audio recorder — PTT, cancel, iOS-stable lifecycle
```

### Rollback

If audio work breaks messaging:

```bash
git revert <commit>
# or restore communication-v2.js voice section from ce2-keyboard-stable-v60 tag
firebase deploy --only hosting:sbd-network
```

Keyboard-only rollback remains: `ROLLBACK-KEYBOARD-v60.md`.

---

## Appendix: original spec goals

Consolidated from product brief — preserved for traceability.

### Phase 1 goals

- Perfect voice notes
- Perfect push-to-talk
- Perfect playback UX
- Perfect audio reliability on iOS PWA

### Implementation priorities (ordered)

1. Recording stability  
2. Waveform UI (1D)  
3. Playback reliability  
4. iOS microphone behavior  
5. Upload resilience  
6. Conversation audio UX  
7. Cached playback  
8. Failed upload recovery  

### Final vision

Premium, emotionally engaging, reliable audio for the SBD formation ecosystem — **without destabilizing** the existing beta messenger architecture.

### Aspirational comparison (long-term, not Phase 1 acceptance)

- More intentional than WhatsApp  
- More premium than Telegram  
- More stable on iOS PWA than typical web messengers  

**Phase 1 acceptance** is defined by the [validation checklist](#validation-checklist), not competitor marketing claims.

---

## Document history

| Date | Change |
|------|--------|
| 2026-05 | Initial implementation reference created (post v60 keyboard stable, user confirmed gap closed) |

**Related docs:**

- `CE2-ROADMAP.md` — index of all CE2 plans  
- `ROLLBACK-KEYBOARD-v60.md` — frozen layout / keyboard  
- `PHASE-UI-COMPOSURE-REFINEMENT.md` — visual pass (run before or after audio, not same deploy)  
- `KEYBOARD-STABLE.lock` — version lock  
- `ce2-attachments.js` — R2 upload  
- `ce2-governance.js` — send permissions  
