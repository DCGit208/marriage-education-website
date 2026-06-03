# Phase 6 — Commission ledger backfill & reconciliation

**Policy tag:** `2026-03-phase6`  
**Status:** Complete (March 2026)

---

## What was checked

| Check | Production result |
|-------|-------------------|
| Sales with `commissions.executive > 0` | **0** — no legacy executive override payouts |
| Ambassadors with `executive_override_earned > 0` | **0** — no balances to reverse |
| Executives (`role_level === 4`) | **0** |
| Sales where `commissions.total` ≠ credited sum | **2** (test sales, `AMB-X-001`, no senior/RD attribution) |

---

## Actions taken

1. **Tagged** 2 sale records with `commission_ledger_phase6_tagged` (audit trail only).
2. **Corrected** `commissions.total` on those 2 sales to match amounts actually credited (10% ambassador only).  
   - Did **not** change ambassador balances (already correct).  
   - Did **not** reverse any executive payouts (none existed).

---

## Script

```bash
# Read-only audit
node scripts/reconcile-commission-ledger-phase6.js

# Safe writes (idempotent fields)
node scripts/reconcile-commission-ledger-phase6.js --apply --tag-only
node scripts/reconcile-commission-ledger-phase6.js --apply --fix-sale-totals

# Only if explicit commissions.executive > 0 ever appear
node scripts/reconcile-commission-ledger-phase6.js --apply --reverse-executive-balances
```

Migration audit rows (if reversals ever needed): `commission_policy_migrations/{2026-03-phase6_exec_*}`

---

## Notes

- **Do not** infer executive override from `total − ambassador − senior − rd` when upline fields are null — that gap is unfilled Senior/RD slots, not Executive.
- Future product sales use **20% max** (10+5+5) per [COMMISSION-MASTER-PRINCIPLES.md](./COMMISSION-MASTER-PRINCIPLES.md).
