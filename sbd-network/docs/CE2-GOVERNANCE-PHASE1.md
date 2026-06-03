# CE2 Governance Phase 1 — Complete

**Ship date:** May 2026  
**Status:** **Complete** (governance + beta operability)  
**Rollback:** `CE2-GOVERNANCE-ROLLBACK.md`  
**Next:** Phase 2 (moderation) and/or Phase 5 (production UX) per priority

---

## Sign-off summary

Phase 1 is **done** when formation governance works end-to-end in CE2 beta:

| Criterion | Status |
|-----------|--------|
| Direct threads get `securityTier` / `securityLevel` (lowest participant tier) | Done |
| Client clamps/blocks classification above thread floor | Done |
| Send/receive DMs and group messages in production beta | Done (user verified) |
| Feature flag + Firestore rules + `ce2_audit_log` | Done |
| Legacy `/dm.html` untouched | Done |

**Not required for Phase 1 close:** consumer polish, compact composer, hiding debug IDs, attachments, admin moderation UI — those are **Phase 5** and **Phases 2–3**.

---

## What shipped

### Conversation security floor (direct messages)

- On DM create/open, `ce2_conversations` receives:
  - `securityTier` (string)
  - `securityLevel` (int, 0=foundation … 2=elite; admin role does **not** raise floor)
- Computed via `Ce2Governance.calculateConversationSecurityLevel(participants)` = **lowest** participant formation tier.
- Older threads **backfill** `securityLevel` when opened (`set` merge).

### Groups (phase 1 simplification)

- Group content floor = `requiredTier` on `communicationGroups` (not lowest member yet).
- **Phase 2** will add lowest-member group floor scan.

### Client (`ce2-governance.js` + hooks in `communication-v2.js`)

- Feature flag: `CE2_GOVERNANCE_V1_ENABLED` (default `true`).
- Classification dropdown disabled above floor.
- Send blocked with user-facing message + `ce2_audit_log` write.
- In-thread read: messages above floor show *"This space unlocks through formation progression."* (sender still sees own).
- Optimistic send (message appears immediately; Firestore confirms in background).

### Firestore rules

- `ce2_audit_log`: authenticated create; admin read.
- **Backward compatible:** conversations **without** `securityLevel` use legacy path (`floor < 0`).
- **Pragmatic beta adjustments:** message read rules allow participants to load threads (UI masks over-floor content); create-time floor enforced primarily on **client** to avoid permission loops during beta.

### Beta operability (not governance logic, but shipped for testing)

- Mobile hub tabs: Groups | Direct | Discover
- Thread-fullscreen on mobile; scroll lock; visualViewport keyboard handling
- These do **not** constitute Phase 5 production UX

---

## What did not ship (later phases)

| Item | Phase |
|------|--------|
| Production UI / compact composer / hide debug meta | **5** |
| Board share tokens, attachments, link validator | 3 |
| Admin freeze/suspend UI | 2 |
| Cloud Function `validateSend` | Optional |
| Lowest-member group floor | 2 |
| Production cutover from `/dm.html` | 5 (with approval) |

---

## QA quick test (regression before Phase 2/5)

1. Admin quick setup → CE2 beta.
2. Elite/admin opens foundation user via Discovery → Lower tiers.
3. Thread shows foundation-level security (floor enforced on send).
4. Classification `elite` disabled or clamped; over-floor send blocked + audit log when applicable.
5. `Ce2Governance.setEnabled(false)` → client clamp off (rules may still apply if `securityLevel` set on docs).

---

## Phase 1 complete — Phase 5 is separate

The current UI (“isolated test shell”, visible classification tags, debug thread meta) is **expected** until **Phase 5 — Production Messaging UX** (`CE2-GOVERNANCE-PHASE5.md`).
