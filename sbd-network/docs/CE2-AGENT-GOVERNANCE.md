# CE2 Agent Governance — Mandatory Read Before Messaging Work

**Product name in UI:** Messages V2 (Beta)  
**Code / URL:** Communication Engine V2 (CE2) → `/communication-v2/`  
**Status:** Active beta — Phases **1–5** implemented; production deploy after Phase 5 device QA.

---

## Hard rules (violations break production testing)

1. **DO NOT** create `/messaging-v2/` or any parallel messenger app.
2. **DO NOT** redirect `/communication-v2/` away from CE2.
3. **DO NOT** change hamburger **Messages** (`/dm.html`) unless the user explicitly approves cutover.
4. **DO NOT** rewrite `communication-v2.css` for **governance-only** work (Phases 1–4). **Phase 5** may change layout/CSS per `CE2-GOVERNANCE-PHASE5.md`.
5. **DO NOT** delete `communication-v2.js` state/render architecture — integrate via modules.
6. **DO NOT** migrate or delete legacy `conversations/` or CE2 `ce2_*` data without a written migration plan.

This work is **governance integration**, not a messenger rebuild.

---

## What CE2 is

Formation-governed messaging beta:

- **Groups:** `communicationGroups/{id}` + `members/{uid}` + `ce2_messages`
- **Direct:** `ce2_conversations/{id}` + `ce2_messages`
- **Policy:** Higher tiers may message lower; lower cannot browse up (filtered discovery)
- **Content (legacy):** Per-message `classification` + Firestore rules
- **Content (governance v1):** Conversation **security floor** = lowest participant tier (direct threads)

---

## Governance module (Phase 1 — complete)

| File | Role |
|------|------|
| `public/communication-v2/ce2-governance.js` | `calculateConversationSecurityLevel`, feature flag, classification floor helpers |
| `public/communication-v2/communication-v2.js` | UI integration only — calls `Ce2Governance` |
| `firestore.rules` | Server enforcement when `securityLevel` is set |
| `ce2_audit_log` | Client-written audit entries (admin-read) |

### Feature flag (instant client rollback)

```javascript
// public/communication-v2/ce2-governance.js
var CE2_GOVERNANCE_V1_ENABLED = true;  // set false + redeploy hosting to disable client floor UX
```

Or in browser console on beta page:

```javascript
Ce2Governance.setEnabled(false); location.reload();
```

### Server rollback

Rules are **backward compatible**: if `ce2_conversations.securityLevel` is **missing**, message rules use the **pre-governance** path only. Removing governance rule blocks (see `CE2-GOVERNANCE-ROLLBACK.md`) restores old enforcement.

---

## Core principle

**People may communicate downward. Content may not flow downward.**

- Mentorship / recruit / onboard: allowed by tier policy.
- Elite-classified text in a foundation-floor thread: **blocked** (client + rules when governance active).

---

## Phase roadmap

| Phase | Status | Scope | Touch layout? |
|-------|--------|--------|----------------|
| **1** | **Complete** | `securityTier`/`securityLevel` on direct convs; client floor clamp; audit log; flag; Firestore rules | Governance hooks only (beta shell fixes allowed for testing) |
| **2** | **Complete** | Admin freeze/suspend; audit UI; lowest-member group floor | Minimal admin HTML |
| **3** | **Complete** | Board share tokens, attachments, link validator | Additive UI only |
| **4** | **Complete** | Full tier enum (ambassador, senior_ambassador, rd) | Data/rules first |
| **5** | **Polish + QA** | Production messaging UX — see `CE2-GOVERNANCE-PHASE5.md`; deploy when signed off | **Yes** |

**Phase 1 details:** `CE2-GOVERNANCE-PHASE1.md`  
**Phase 2 details:** `CE2-GOVERNANCE-PHASE2.md`  
**Phase 3 details:** `CE2-GOVERNANCE-PHASE3.md`  
**Phase 4 details:** `CE2-GOVERNANCE-PHASE4.md`  
**Phase 5 details:** `CE2-GOVERNANCE-PHASE5.md`

---

## Files you may edit for governance

- `public/communication-v2/ce2-governance.js`
- `public/communication-v2/communication-v2.js` (logic hooks only)
- `public/communication-v2/index.html` (script tags only)
- `firestore.rules` (CE2 `match` blocks + `ce2_audit_log`)
- `public/js/admin.js` (Messages V2 tab — moderation only)
- `docs/*`

## Files you must not edit without explicit approval

- `communication-v2.css` — **except Phase 5** UX work (`CE2-GOVERNANCE-PHASE5.md`)
- `public/js/dm.js`, `public/dm.html` (legacy) — until Phase 5 cutover sign-off
- `src/partials/nav.html` (routing) — until Phase 5 cutover sign-off
- `firebase.json` redirects

---

## Consultant / QA checklist

See `docs/CE2-CONSULTANT-BRIEF.md` (if present) and governance checklist in `CE2-GOVERNANCE-ROLLBACK.md`.

---

## Naming map (avoid confusion)

| User says | Means |
|-----------|--------|
| Messaging V2 beta | CE2 `/communication-v2/` |
| Communication Engine V2 | Same |
| Legacy Messages | `/dm.html` |
| messaging-v2 folder | **Abandoned experiment** — do not extend |
