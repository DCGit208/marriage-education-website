# CE2 Phase 3 — Attachments, board share, link validator

**Status:** Complete (May 2026) — ready for production QA with Phase 5 polish  
**Depends on:** Phases 1–2  
**Prerequisite read:** `CE2-AGENT-GOVERNANCE.md`

---

## Delivered

| Item | Location |
|------|----------|
| Image attachments (R2) | `ce2-attachments.js`, composer 📷 button, `imageUrl` + `messageType: image` on messages |
| Board post share tokens | `ce2-share.js`, `ce2_share_tokens` collection, drawer URL field |
| Link validator (SBD allowlist) | `ce2-links.js` — blocks external URLs in message text |
| Firestore optional fields | `firestore.rules` — `messageType`, `imageUrl`, `boardShare` |
| Rich message render | `communication-v2.js` — images, board cards, safe linkify |

---

## Usage

- **Photo:** tap 📷, select image (max 10 MB), then Send.
- **Board share:** open + drawer → paste `board.html?boardId=…&post=…` → optional caption → Send.
- **Links:** only `sbd-network.web.app`, `marriageducation.com`, and localhost in dev.

---

## Acceptance criteria

- [x] Image send + display in DM and group threads.
- [x] Board share creates `ce2_share_tokens` doc and renders link card.
- [x] External URLs blocked at send with clear error.
- [x] Formation classification floor still enforced (Phase 1).

---

## Rollback

Remove script tags for `ce2-links.js`, `ce2-attachments.js`, `ce2-share.js` from `index.html` and redeploy hosting. Legacy text-only messages remain valid.
