# CE2 Phase 2 — Moderation & group security floor

**Status:** Complete (May 2026)  
**Depends on:** Phase 1 governance  
**Prerequisite read:** `CE2-AGENT-GOVERNANCE.md`

---

## Purpose

Operational controls for CE2: suspend/restore messaging per member, admin audit visibility, and **group thread security floor** derived from **lowest formation tier among members**, never below the group’s `requiredTier`.

---

## Delivered

| Item | Location |
|------|----------|
| `messagingEnabled` on `users` | Admin suspend/restore; Firestore `ce2MessagingEnabled()` on message create (field **absent** = enabled; only explicit `false` suspends) |
| Client moderation helpers | `public/communication-v2/ce2-moderation.js` |
| Group floor from members | `resolveGroupSecurityFromMembers` in `openGroupThread` |
| CE2 app send guard | `communication-v2.js` — boot banner + `sendMessage` block |
| Admin UI | `public/admin.html` CE2 tab — suspend/restore + audit list |
| Admin logic | `public/js/admin.js` — `loadCe2AuditLog`, `setCe2MessagingByEmail` |

---

## Acceptance criteria

- [x] Admin can suspend messaging by email; user cannot send (client + rules).
- [x] Admin can restore messaging.
- [x] Group thread security uses lowest member tier, capped at `requiredTier` minimum.
- [x] Phase 1 direct-thread floor unchanged.
- [x] Legacy `/dm.html` untouched.

---

## Admin debug (CE2 UI)

Admins may enable verbose CE2 UI (classification chips, floor numbers):

```javascript
localStorage.setItem('ce2_debug', '1'); location.reload();
```

---

## Rollback

- Set `messagingEnabled: true` (or remove field) on affected users.
- Redeploy prior `firestore.rules` if `ce2MessagingEnabled` checks must be removed.

See `CE2-GOVERNANCE-ROLLBACK.md`.
