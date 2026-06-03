# CE2 Phase 4 — Full formation tier enum

**Status:** Complete (May 2026)  
**Depends on:** Phase 1 governance  
**Prerequisite read:** `CE2-AGENT-GOVERNANCE.md`

---

## Tier ladder (low → high)

| Tier | Level |
|------|-------|
| foundation / free | 0 |
| premium | 1 |
| elite | 2 |
| ambassador | 3 |
| senior_ambassador | 4 |
| rd (Regional Director) | 5 |
| admin (role, policy only) | 6 |

---

## Delivered

| Item | Location |
|------|----------|
| Client tier math | `ce2-governance.js` v4 — `TIER_RANK`, discovery helpers |
| Firestore policy ranks | `firestore.rules` — `ce2TierRankFromString`, `tierLevel` on user docs |
| Discovery queries | `communication-v2.js` — peers / lower tiers include ambassador+ |
| Classification options | `index.html` — ambassador, senior_ambassador, rd |
| Group eligibility | `loadGroupsForUser` uses `tiersAtOrBelowRank` |

---

## Acceptance criteria

- [x] Ambassador / RD users discoverable at same tier when profile `tier` matches.
- [x] Lower-tier discovery respects full ladder.
- [x] DM policy: higher tier may message lower; upward blocked unless mentor (unchanged).
- [x] Admin role bypasses messaging suspend; highest policy rank for discovery.

---

## Data note

Set `users.tier` to `ambassador`, `senior_ambassador`, or `rd` in Admin. Optional `tierLevel` int overrides string mapping.
