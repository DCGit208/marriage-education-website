# Commission Master Principles

**Status:** Active — read before any commission, bonus, or payout change  
**Last updated:** March 2026  

> Single source of truth. Detailed rules live in linked policy docs.

---

## Two separate economic events

| Event | Customer pays | Policy doc |
|-------|---------------|------------|
| **Ambassador onboarding** | ~15,000 FCFA signup | [RECRUITMENT-BONUS-POLICY.md](./RECRUITMENT-BONUS-POLICY.md) |
| **Foundation Yearly (official deployment)** | $144.17 one-time / 12 months | [SBD-SUBSCRIPTION-COMMISSION-POLICY.md](./SBD-SUBSCRIPTION-COMMISSION-POLICY.md) |
| **Foundation Monthly (alternate provision)** | 5,200 FCFA/month (5,000 commissionable + 200 OPEX) | [SBD-SUBSCRIPTION-COMMISSION-POLICY.md](./SBD-SUBSCRIPTION-COMMISSION-POLICY.md) |

These never share the same payout engine as recruitment. Recruitment bonuses fire **once on admin approval**. SBD commissions fire on each qualifying subscription charge.

---

## Three commission roles (no fourth tier)

### Foundation Access ($144.17 one-time / 12 months)

| Role | Rate | USD | FCFA (@ 600) |
|------|------|-----|--------------|
| Direct ambassador | 10% | $11.80 | 7,080 |
| Senior override | 5% | $5.90 | 3,540 |
| RD override | 5% | $5.90 | 3,540 |

### Foundation Monthly (5,000 FCFA base)

| Role | Rate (of 5,000 FCFA base) | FCFA |
|------|---------------------------|------|
| Direct ambassador (SBD referral owner) | 10% | 500 |
| Senior override (downline sale) | 5% | 250 |
| RD override (regional sale) | 5% | 250 |

**Maximum stack:** 20% of the commissionable base for that product.

---

## Executive Network Director — replication, not extraction

The Executive receives:

- **No** executive override %
- **No** executive recruitment upline share
- **No** fourth commission layer on subscriptions or onboarding

The Executive earns by **reproducing full RD infrastructure** (multiple regional deployment civilizations). See [EXECUTIVE-NETWORK-DIRECTOR.md](./EXECUTIVE-NETWORK-DIRECTOR.md).

At mature scale, **one full RD network** targets on the order of **~250M FCFA/month** recurring from RD’s **5% × 5,000 FCFA** on retained subscribers — not from a special Executive rate.

---

## Recruitment onboarding (15,000 FCFA)

| Pool | FCFA | Who |
|------|------|-----|
| Direct | 1,500 | Recruiter on payment |
| Upline pool | up to 1,500 | Ambassador · Senior · **RD only** — walk stops at RD |

**Executive:** 0 FCFA on signup. Policy version **2026-03-v3**.

---

## Implementation phases

| Phase | Scope | Status |
|-------|--------|--------|
| 1 | Docs (this file + policies) | Done |
| 2 | Recruitment v2026-03-v3 (no Executive upline) | Done |
| 3 | SBD recurring 500+250+250 in production code | Done |
| 4 | Remove 6.67% executive override on product sales | Done |
| 5 | Dashboards & copy alignment | Done |
| 6 | Ledger backfill & reconciliation | Done |

---

## Required reading index

| Document | Purpose |
|----------|---------|
| [RECRUITMENT-BONUS-POLICY.md](./RECRUITMENT-BONUS-POLICY.md) | 15,000 FCFA signup bonuses |
| [SBD-SUBSCRIPTION-COMMISSION-POLICY.md](./SBD-SUBSCRIPTION-COMMISSION-POLICY.md) | Monthly Foundation subscription |
| [EXECUTIVE-NETWORK-DIRECTOR.md](./EXECUTIVE-NETWORK-DIRECTOR.md) | Executive = RD replication |
| [README.md](./README.md) | Tests & deploy checklist |

---

## Tests

```bash
node scripts/test-recruitment-bonus-policy.js
node scripts/test-sbd-subscription-commission.js
node scripts/verify-ambassador-register-flow.mjs
```
