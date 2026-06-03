# CE2 Phase 6+ — Lifestyle messenger (6 layers)

**Status:** Layer 2 complete · Layer 3 multi-attach (v33) · Layer 4 menu + forward governance (v32–33)  
**Prerequisite:** Phases 1–5 complete  
**Master plan:** `CE2-AGENT-GOVERNANCE.md`

---

## Current deploy baseline

| Asset | Version |
|-------|---------|
| `communication-v2.js` | v33 |
| `ce2-message-actions.js` | v3 |
| `communication-v2.css` | v19 |
| `ce2-attachments.js` | v4 |

Hard refresh after deploy; confirm versions in Network tab.

---

## Layer status

| Layer | Focus | Status |
|-------|--------|--------|
| **2 — Core parity** | Typing, unread, read ticks, reply, send, load older | **Complete (beta)** |
| **3 — Rich media** | Image/video/voice, compression, **multi-attach (up to 6)** | **Complete (v33)** |
| **4 — Social depth** | Long-press menu: react, edit, forward, pin, star, search, report, block | **Shipped (v32+)**; forward **governance-hardened (v33)** |
| **5 — Lifestyle / covenant** | Prayer/check-in tags, formation notes, templates, mentor review audit | **Started** |
| **6 — PWA** | Push, badge, offline queue, share-to-messages | Planned |
| **Cutover** | Nav → CE2 from `/dm.html` | **Not approved** — explicit user sign-off required |

---

## Layer 2 — Parity

| Feature | Module |
|---------|--------|
| Typing | `ce2-presence.js` |
| Unread + mark read | `ce2-receipts.js` |
| Read receipts | `ce2-receipts.js` |
| Reply / quote | `ce2-reply.js` |
| Load older | `communication-v2.js` |
| Unsend / delete (1h, admin anytime) | rules + `ce2-message-actions.js` |

---

## Layer 3 — Rich media (v33)

| Feature | Status |
|---------|--------|
| Image compression | Done |
| Hold-to-record voice | Done |
| Video inline | Done |
| **Multi-attach** | Done — select multiple files (max 6); uploads queue; one message per attachment; caption on first only |

---

## Layer 4 — Social depth (menu)

Long-press (mobile) or right-click (desktop) on a message.

| Action | Notes |
|--------|--------|
| Reply, Copy, Copy link, Save image | Client |
| Message info | Sheet |
| React | 👍❤️🙏✨😂😮 |
| Edit | 15 min, own messages |
| Delete | Soft-delete, 1h |
| Forward | **Tier + classification floor + DM policy** (client + Firestore create rules) |
| Pin / Unpin | Thread meta |
| Star | `users/{uid}/ce2_saved` |
| Hide for me | Local storage |
| Report | `ce2_message_reports` |
| Block | `users/{uid}/ce2_blocks` |
| Share to board | Opens composer + drawer |
| @Mention | Groups |
| Find in chat | In-thread search highlight |

**Forward governance (v33):**

- Client: `canForwardToTarget()` — `canCommunicate`, group membership, classification vs thread/group floor.
- Server: `ce2MessageAllowedAtConversationSecurity` (DM), `ce2MessageAllowedInGroup` (groups) on message **create**.

---

## Layer 5 — Lifestyle / covenant (in progress)

| Feature | Status |
|---------|--------|
| Template replies | Done (menu) |
| Prayer / check-in tags | Done (`formationTag`) |
| Formation notes | Done (`ce2_formation_notes`) |
| Mentor review request | Audit log |
| Mentor filters / dashboards | Planned |
| Rich board cards in-thread | Planned |
| Scheduled formation nudges | Planned |

**Prayer** = gospel-centered intercession (not secular “meditation”). **Check-in** = formation progress / accountability update.

---

## Layer 6 — PWA (planned)

- FCM push, icon badge, offline compose queue, share-to-messages, install funnel.

---

## Governance unchanged

Discovery, tier floors, classification clamp, moderation, audit log, messaging suspend — all still enforced. Legacy `/dm.html` untouched until cutover approval.
