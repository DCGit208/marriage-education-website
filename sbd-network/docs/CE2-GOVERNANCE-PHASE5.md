# CE2 Phase 5 — Production Messaging UX

**Status:** Polish pass (May 2026) — deploy to production after device QA; nav cutover still pending approval  
**Depends on:** Phases 1–4 complete.  
**Prerequisite read:** `CE2-AGENT-GOVERNANCE.md`

---

## Purpose

Deliver the **consumer-grade** SBD communication experience on top of the CE2 engine (formation-gated discovery, security floor, Firestore model). Phase 1 proved governance; Phase 5 proves **product quality** (layout, density, keyboard, polish) — target parity or better than mainstream messengers on usability, while keeping formation governance as the differentiator.

This is **not** a new backend or a parallel app. It is a production shell + UX pass on `/communication-v2/`.

---

## In scope

### Thread & list UX

- Compact composer: message field + send on one row; classification / shareable in overflow (+) sheet or advanced panel.
- Hide debug strings in UI (conversation IDs, raw floor integers) — optional admin “debug” toggle only.
- Simplified message bubbles (no always-visible PUBLIC/SHAREABLE chips for normal users).
- Consumer thread list (avatars, preview line, time, unread when supported).
- Single clear back navigation (no duplicate affordances).
- Remove or replace “isolated test shell” copy with production branding.

### Mobile / PWA

- Chat-first layout: messages use maximum height above keyboard.
- Stable header + composer (visualViewport / keyboard patterns documented in CSS).
- Hub navigation polished (Groups | Direct | Discover) — may move to bottom nav if approved.

### Desktop

- Side-by-side inbox + thread (enhance current 720px+ layout, do not break).

### Cutover (explicit approval required)

- Nav: when ready, point main **Messages** to CE2 instead of `/dm.html`.
- Migration plan for legacy `conversations/` if needed (separate doc).

---

## Out of scope (other phases)

| Item | Phase |
|------|--------|
| Admin freeze/suspend, audit viewer UI | 2 |
| Attachments, board share tokens, link validator | 3 |
| Ambassador / RD tier enum in rules | 4 |
| Cloud Function `validateSend` | Optional hardening (any phase) |

---

## Files agents may edit (Phase 5 only)

- `public/communication-v2/communication-v2.css` — **allowed** for Phase 5 UX
- `public/communication-v2/index.html` — structure/classes for new shell
- `public/communication-v2/communication-v2.js` — render/composer hooks (keep state/render architecture)
- New optional modules e.g. `ce2-composer.js`, `ce2-shell.css` if split is approved
- `docs/*`, `src/partials/nav.html` — only after cutover approval

## Files still protected

- `public/js/dm.js`, `public/dm.html` — until cutover sign-off
- `/messaging-v2/` experiment — do not revive

---

## Acceptance criteria (sign-off)

- [x] Compact composer (message row + overflow drawer for classification/shareable).
- [x] No raw Firestore doc IDs in default thread header (admin `ce2_debug` only).
- [x] Simplified bubbles (no PUBLIC/SHAREABLE chips for normal users).
- [x] Consumer list rows (avatar + name + meta).
- [x] Production header copy (“Messages”, formation-gated sub).
- [x] Thread list shows last message preview line.
- [x] Photo attachment preview in composer; image + board-share cards in thread.
- [ ] Full iOS PWA sign-off checklist (QA on device) — **required before production deploy**.
- [ ] Legacy `/dm.html` unchanged until explicit cutover ticket.

---

## Suggested implementation order

1. Compact composer + hide debug meta (highest visual impact).
2. Message bubble simplification + thread list cards.
3. Branding copy + navigation cleanup.
4. Cutover checklist + nav change (separate deploy).
