# CE2 delivery performance — guardrails

**Baseline:** `ce2-delivery-stable-v90` · `ROLLBACK-DELIVERY-v90.md` · `DELIVERY-STABLE.lock`

Read this **before** any send/receive/storage/render speed work.

---

## Rule 1 — Do not break frozen layers

| Layer | Tag | Must still pass |
|-------|-----|-----------------|
| Keyboard / gap | `ce2-keyboard-stable-v60` | Header A, gap closed |
| UI composure | `ce2-ui-composure-stable` | Composer, search, layout |
| Audio | `ce2-audio-stable-1d` | Voice record/play |
| **Delivery** | **`ce2-delivery-stable-v90`** | **DM send/receive < 5s on good network** |

---

## Rule 2 — Experimental flag required

All new delivery logic must be behind **`CE2_DELIVERY_EXPERIMENTAL`**, enabled only via:

```
https://sbd-network.web.app/communication-v2/?ce2_delivery_fast=1
```

Default for all users: **off** (v90 behavior).

To disable mid-test: remove `ce2_delivery_fast=1` or set `?ce2_delivery_fast=0`.

---

## Rule 3 — One change at a time

| Pass | Allowed change | Not allowed in same deploy |
|------|----------------|----------------------------|
| A | Meta-first render only | Schema change |
| B | Denormalized `recentMessages` on conv doc | Typing re-enable |
| C | Transport tuning (long poll / region) | Full render rewrite |

Deploy → regression gate → then next pass.

---

## Rule 4 — Regression gate (both users, hard refresh)

After **every** deploy touching delivery:

1. Console shows `delivery stable v90` and correct `rollback=ce2-delivery-stable-v90`
2. **User A** sends short text → **Delivered** on A within 3s (not stuck Sending…)
3. **User B** (thread open) sees text within **5s** on good Wi‑Fi
4. No typing dots at bottom (still disabled unless explicitly re-enabled in a later pass)
5. Keyboard + voice smoke test (30s each)
6. If any step fails → **rollback** (below), do not stack more changes

---

## Rule 5 — Rollback triggers (automatic stop)

Rollback immediately if:

- Messages stuck on **Sending…** > 10s
- Incoming text **> 15s** with both apps open on Wi‑Fi
- Duplicate messages in thread
- Send errors / permission denied for normal Elite DM
- Keyboard or voice regression

**Rollback command:** see `ROLLBACK-DELIVERY-v90.md` or run:

```bash
./sbd-network/scripts/rollback-ce2-delivery-v90.sh
```

---

## Rule 6 — Storage boundaries

| Data | Store | Do not |
|------|--------|--------|
| Text body | Firestore `ce2_messages` | R2 |
| Thread preview / `lastMessageId` | Firestore conv meta doc | Duplicate-only in notifications |
| Media bytes | R2 | Firestore |

---

## Rule 7 — Render boundaries

- **Do:** append one row on `docChanges('added')` or meta fast path  
- **Do not:** full `renderMessagePanel()` on every snapshot  
- **Do not:** re-enable typing until delivery gate passes with **< 2s** receive consistently  

---

## Planned passes (not started until baseline tagged)

1. **Meta-primary** — render new text only from conv meta listener; query for history  
2. **Recent messages on conv doc** — optional schema; requires rules + migration  
3. **Transport** — WebSocket vs long-poll profiling per platform  

Each pass gets its own subsection in this file when started.
