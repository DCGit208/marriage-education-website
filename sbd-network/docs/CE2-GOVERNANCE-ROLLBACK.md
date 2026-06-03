# CE2 Governance Phase 1 — Rollback Guide

Rollback is **layered**: client can be disabled in minutes; rules can be reverted without deleting data.

---

## Level 1 — Instant client disable (no deploy)

On https://sbd-network.web.app/communication-v2/ (signed in):

```javascript
Ce2Governance.setEnabled(false);
location.reload();
```

Effect: CE2 behaves as pre-governance client (classification dropdown not floor-clamped; no security fields written on new convs from client). **Server may still enforce** if rules are active and `securityLevel` exists on documents.

---

## Level 2 — Deploy client flag off (~2 min)

1. Open `public/communication-v2/ce2-governance.js`
2. Set `CE2_GOVERNANCE_V1_ENABLED = false`
3. Deploy hosting only:

```bash
cd sbd-network
firebase deploy --only hosting:sbd-network
```

---

## Level 3 — Firestore rules soft rollback (keep data)

Governance rules only apply when `securityLevel` is a non-negative int on the conversation.

**Option A — Leave data, disable enforcement:**  
Revert `firestore.rules` CE2 message `create` blocks that reference `ce2MessageAllowedAtConversationSecurity` to the previous version from git:

```bash
cd /path/to/Marriageducation
git show 61dac02b:sbd-network/firestore.rules > /tmp/rules-old.txt
# Manually merge CE2 section or full file restore, then:
firebase deploy --only firestore:rules
```

**Option B — Keep rules, strip floors on threads (admin script / console):**  
For each `ce2_conversations` doc, remove fields `securityTier`, `securityLevel` (optional; only if you need old rule path everywhere).

---

## Level 4 — Full git restore (nuclear)

Restores entire CE2 tree to last pre-governance commit (loses governance docs and module):

```bash
cd Marriageducation
git checkout 61dac02b -- \
  sbd-network/public/communication-v2/ \
  sbd-network/firestore.rules
firebase deploy --only hosting:sbd-network,firestore:rules
```

Commit hash `61dac02b` = last stable CE2 before governance integration. Update hash if your `main` has moved.

---

## What rollback does NOT do

- Does not delete `ce2_audit_log` entries (harmless; admin-readable)
- Does not remove `securityTier` / `securityLevel` from existing conversations (safe to leave)
- Does not affect legacy `/dm.html` or `conversations/`

---

## Verify after rollback

- [ ] `/communication-v2/` loads; send DM and group message works
- [ ] No new permission-denied on existing threads
- [ ] iOS: header + input fixed; message pane scrolls only
- [ ] `/dm.html` still works for legacy Messages link

---

## Re-enable governance

1. `CE2_GOVERNANCE_V1_ENABLED = true` in `ce2-governance.js`
2. Deploy rules + hosting
3. Open a direct thread (backfills `securityLevel` on older convs when opened)
