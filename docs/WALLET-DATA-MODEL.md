# Wallet Data Model — Read-First (Tier 1)

**Status:** Active — maps existing Firestore fields to unified wallet UI  
**Last updated:** March 2026  
**Policy:** Tier 1 is **read/aggregate only**. No new primary ledger collection until Tier 4 migration plan.

---

## Design principle

```
Accrual (automatic)     →  existing profile fields + sbd_sales + sales
Payout (manual/batch)   →  payout_events (NEW in Tier 1) + mark paid functions
Display (dashboard)     →  computed sums — never client-side commission math
```

---

## Collections by role

| Role | Primary document |
|------|----------------|
| Ambassador, Senior | `ambassadors/{code}` |
| Regional Director | `regional_directors/{code}` |
| Executive | `ambassadors/{code}` with `role_level=4` |

Seniors and ambassadors share the `ambassadors` collection.

---

## Recruitment wallet (15,000 FCFA signup)

**Policy:** [RECRUITMENT-BONUS-POLICY.md](./RECRUITMENT-BONUS-POLICY.md) (`2026-03-v3`)

| Field | Meaning |
|-------|---------|
| `recruitment_bonus_earned` | Lifetime credited (direct + upline shares) |
| `recruitment_bonus_pending` | Owed, not yet sent |
| `recruitment_bonus_paid` | Lifetime sent to payee |
| `recruitment_history[]` | Line items: `amount`, `status`, `ambassador_code`, dates |

**Pending (recruitment):** `recruitment_bonus_pending`  
**Paid (recruitment):** `recruitment_bonus_paid`

**Admin queue:** `admin_notifications` where `type=rd_recruitment_bonus`, `status=pending`

**Mark paid:** `markRDPaymentPaid` — must match `ambassador_code` + `amount`

---

## SBD subscription wallet (5,200 FCFA / month)

**Policy:** [SBD-SUBSCRIPTION-COMMISSION-POLICY.md](./SBD-SUBSCRIPTION-COMMISSION-POLICY.md) (`2026-04-v1`)

Nested object: **`sbdReferrals`** on ambassador or RD doc.

| Field | Role |
|-------|------|
| `commissionPending` | Direct referrer pending |
| `commissionEarned` | Direct referrer lifetime credited |
| `overrideCommissionPending` | Senior override pending |
| `overrideCommissionEarned` | Senior override lifetime |
| `rdOverrideCommissionPending` | RD override pending |
| `rdOverrideCommissionEarned` | RD override lifetime |
| `subscribers` | Count (active subs) |

**Pending (SBD total):**

```
commissionPending
+ overrideCommissionPending
+ rdOverrideCommissionPending
```

**Audit trail:** `sbd_sales` — `idempotencyKey`, `policy_version`, per-role FCFA amounts

---

## Product / deployment wallet

**Policy:** [COMMISSION-MASTER-PRINCIPLES.md](./COMMISSION-MASTER-PRINCIPLES.md) — 10% + 5% + 5%

| Field | Typical role |
|-------|----------------|
| `commissionEarned` | Personal / direct advocacy |
| `team_override_earned` | Senior 5% override |
| `network_override_earned` | RD 5% override (on `regional_directors`) |
| `revenue_by_category.{category}` | Breakdown by product category |
| `monthly_earnings.{YYYY-MM}.total` | Month rollup |

**Note:** Product earnings are mixed into `commissionEarned` on ambassadors. Tier 1 shows **category table** from `revenue_by_category` / portfolio section (already in DOS Commissions tab).

**Pending for product:** There is **no separate** `product_commission_pending` today. Tier 1 treats product as **earned unless** you introduce explicit pending split later. Optional Phase: add `product_commission_pending` — **not in Tier 1**.

---

## Unified wallet summary (Tier 1 UI formulas)

| Bucket | Formula (FCFA) |
|--------|----------------|
| **Recruitment pending** | `recruitment_bonus_pending` |
| **SBD pending** | sum of three `sbdReferrals.*Pending` |
| **Product earned (info)** | portion of `commissionEarned` not double-counted with recruitment — show portfolio table separately |
| **Total pending (payout eligible)** | recruitment pending + SBD pending |
| **Total paid (lifetime)** | `recruitment_bonus_paid` + SBD earned fields (treat earned as credited; paid out tracked via `payout_events`) |

After Tier 1, **`payout_events`** becomes source of truth for “cash sent”:

```javascript
// payout_events/{id} — NEW Tier 1
{
  payee_code: 'AMB-…',
  payee_collection: 'ambassadors' | 'regional_directors',
  amount_fcfa: 50000,
  amount_display: '48.20',
  currency_paid: 'GBP',
  method: 'wise' | 'campay' | 'manual_momo',
  external_reference: 'WISE-…',
  status: 'completed' | 'failed',
  breakdown: { recruitment: 1500, sbd: 48500 },
  created_at,
  created_by_admin: 'uid or email'
}
```

---

## Payout profile (NEW Tier 1 — on payee doc)

```javascript
payout_profile: {
  country: 'CM' | 'GB' | 'US' | …,
  method: 'momo_cm' | 'wise_bank' | 'paypal',
  currency_preference: 'XAF' | 'GBP' | 'USD',
  momo_number: '+237…',           // momo_cm only
  account_holder_name: '…',
  wise_email: '…',                // wise_bank
  iban: '…',
  sort_code: '…',
  routing_number: '…',
  profile_complete: true,
  updated_at: Timestamp
}
```

**Guardrail:** Payout batch must not run if `profile_complete !== true`.

---

## What Tier 1 must NOT do

- Create `wallets/{uid}` as primary ledger (Commerce OS sandbox `commerce_v1_wallets` stays isolated)  
- Decrement pending without a matching `payout_events` row  
- Infer executive override from sale totals  
- Write commission amounts from browser/admin client without Cloud Function

---

## Code references

| Concern | File |
|---------|------|
| Recruitment credit | `functions/recruitment-bonus-service.js` |
| SBD credit | `functions/sbd-subscription-commission.js` |
| Product credit | `functions/index.js` → `processProductDeployment`, `creditCommissionsToUpline` |
| Mark recruitment paid | `functions/index.js` → `markRDPaymentPaid` |
| Reconciliation | `scripts/reconcile-commission-ledger-phase6.js` |
