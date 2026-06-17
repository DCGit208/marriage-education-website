# CE2 message delivery — **current stable rollback point (v90)**

**Status:** Verified acceptable (June 2026)  
- **Send:** message writes first; meta async; `confirmSentMessage` clears "Sending…"  
- **Receive:** meta doc fast path + subcollection listener  
- **Typing UI:** **disabled** (phantom dots removed)  
- **Firestore cache:** IndexedDB persistence **off** (`firebase.js?v=rt2`)

**Live:** `https://sbd-network.web.app/communication-v2/`  
**Console:** `[CE2] delivery stable v90 rollback=ce2-delivery-stable-v90`

> **Do not change delivery/send/receive paths** without reading `DELIVERY-PERF-GUARDRAILS.md` first.  
> New speed work must use `?ce2_delivery_fast=1` until it passes the regression gate.

---

## Rollback identifiers

| Artifact | Value |
|----------|--------|
| Rollback constant | `ce2-delivery-stable-v90` |
| Git tag (recommended) | `ce2-delivery-stable-v90` |
| Lock file | `DELIVERY-STABLE.lock` |
| JS | `communication-v2.js?v=90` |
| CSS | `communication-v2.css?v=65` |
| Presence | `ce2-presence.js?v=4` |
| Firebase init | `firebase.js?v=rt2` |

**In-repo markers:** `STABLE_ROLLBACK`, `ce2-delivery-stable-v90`, `DELIVERY-STABLE.lock`.

---

## Files in this rollback

| File | Role |
|------|------|
| `communication-v2.js` | Send, listeners, render, `CE2_DELIVERY_STABLE_VERSION` |
| `ce2-presence.js` | Typing mute; no pulse on empty input |
| `ce2-pwa.js` | Foreground push ingest |
| `communication-v2.css` | Typing line hidden |
| `index.html` | Cache-bust query strings |
| `public/js/firebase.js` | No IndexedDB persistence |
| `public/js/notifications.js` | `ingestIncomingNotif` hook (optional) |

---

## Restore delivery stable (git)

```bash
cd /path/to/Marriageducation
git checkout ce2-delivery-stable-v90 -- \
  sbd-network/public/communication-v2/communication-v2.js \
  sbd-network/public/communication-v2/ce2-presence.js \
  sbd-network/public/communication-v2/ce2-pwa.js \
  sbd-network/public/communication-v2/communication-v2.css \
  sbd-network/public/communication-v2/index.html \
  sbd-network/public/communication-v2/DELIVERY-STABLE.lock \
  sbd-network/public/communication-v2/ROLLBACK-DELIVERY-v90.md \
  sbd-network/public/communication-v2/DELIVERY-PERF-GUARDRAILS.md \
  sbd-network/public/js/firebase.js \
  sbd-network/public/js/notifications.js
cd sbd-network && firebase deploy --only hosting:sbd-network
```

If the tag does not exist yet, pin assets in `index.html` to the versions in `DELIVERY-STABLE.lock` and deploy.

---

## Emergency rollback (no git)

1. Set `communication-v2.js?v=90` (and other versions in lock file) in `index.html`.
2. Remove `?ce2_delivery_fast=1` from any test URLs.
3. `firebase deploy --only hosting:sbd-network`
4. Hard refresh both clients (close PWA and reopen).

---

## What v90 fixed (do not regress)

1. Message `createdAt` uses **client timestamp** (query sees new docs immediately).
2. **No batch** blocking send on meta/notification failure.
3. **`confirmSentMessage`** after successful write (no stuck "Sending…").
4. **Meta listener** shows `lastPreview` before subcollection catches up.
5. **Typing indicator off** — was misleading during slow delivery.
6. **IndexedDB persistence off** — was delaying listener updates.

---

## Tag this baseline (once)

```bash
cd /path/to/Marriageducation
git add sbd-network/public/communication-v2/ sbd-network/public/js/firebase.js sbd-network/public/js/notifications.js
git commit -m "CE2 delivery stable v90 — rollback point before perf pass"
git tag ce2-delivery-stable-v90
git push origin HEAD --tags
```
