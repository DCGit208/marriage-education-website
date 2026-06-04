# Marriage Education — Documentation Index

## Required reading before building

| Topic | Document |
|-------|----------|
| **Master principles** | [COMMISSION-MASTER-PRINCIPLES.md](./COMMISSION-MASTER-PRINCIPLES.md) |
| **Ambassador recruitment bonuses (15,000 FCFA)** | [RECRUITMENT-BONUS-POLICY.md](./RECRUITMENT-BONUS-POLICY.md) (`2026-03-v3`) |
| **SBD subscription commissions (5,200/month)** | [SBD-SUBSCRIPTION-COMMISSION-POLICY.md](./SBD-SUBSCRIPTION-COMMISSION-POLICY.md) (`2026-04-v1`) |
| **Executive Network Director** | [EXECUTIVE-NETWORK-DIRECTOR.md](./EXECUTIVE-NETWORK-DIRECTOR.md) |
| **Phase 6 backfill report** | [COMMISSION-BACKFILL-PHASE6.md](./COMMISSION-BACKFILL-PHASE6.md) |
| SBD Network architecture | [../SBD-NETWORK-TECHNICAL-BRIEF.md](../SBD-NETWORK-TECHNICAL-BRIEF.md) |
| Legacy RD bonus notes (archived) | [../RD-RECRUITMENT-BONUS-IMPLEMENTATION.md](../RD-RECRUITMENT-BONUS-IMPLEMENTATION.md) |

## Commerce OS & payouts (Tier 1 — read before building)

| Topic | Document |
|-------|----------|
| **Payout operations (Wise + CamPay)** | [PAYOUT-OPERATIONS.md](./PAYOUT-OPERATIONS.md) |
| **Wallet field mapping (no new ledger)** | [WALLET-DATA-MODEL.md](./WALLET-DATA-MODEL.md) |
| **Architecture v2** | [COMMERCE-OS-ARCHITECTURE-v2.md](./COMMERCE-OS-ARCHITECTURE-v2.md) |
| **Build plan (tiers 1–6)** | [COMMERCE-OS-BUILD-PLAN.md](./COMMERCE-OS-BUILD-PLAN.md) |
| **Tier 2 CamPay runbook** | [COMMERCE-OS-TIER2-RUNBOOK.md](./COMMERCE-OS-TIER2-RUNBOOK.md) |
| **Admin Finance UX** | [COMMERCE-OS-ADMIN-UX.md](./COMMERCE-OS-ADMIN-UX.md) |

Cursor rule for Tier 1 work: `.cursor/rules/commerce-payout-tier1.mdc`

## Implementation phases

| Phase | Scope | Status |
|-------|--------|--------|
| 1 | Docs | Done |
| 2 | Recruitment v2026-03-v3 (no Executive upline) | Done |
| 3 | SBD recurring 500+250+250 in production | **Done** |
| 4 | Remove executive product override | Done |
| 5 | Dashboards & copy alignment | Done |
| 6 | Ledger backfill & reconciliation | Done |
| **Tier 1** | Payout profiles, wallet UI, `payout_events`, admin Finance | Done |
| **Tier 2** | CamPay collect/disburse pilot (ambassador registration) | **Code ready — enable via config** |

## Tests

```bash
node scripts/test-recruitment-bonus-policy.js
node scripts/test-sbd-subscription-commission.js
node scripts/reconcile-commission-ledger-phase6.js
node scripts/test-wallet-payout-tier1.js
node scripts/verify-ambassador-register-flow.mjs
```

## Deploy after recruitment policy changes

```bash
firebase deploy --only functions
# plus site deploy for admin-dashboard / registration JS
```
