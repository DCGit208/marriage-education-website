# Marriage Education — Documentation Index

## Required reading before building

| Topic | Document |
|-------|----------|
| **Master principles** | [COMMISSION-MASTER-PRINCIPLES.md](./COMMISSION-MASTER-PRINCIPLES.md) |
| **Ambassador recruitment bonuses (15,000 FCFA)** | [RECRUITMENT-BONUS-POLICY.md](./RECRUITMENT-BONUS-POLICY.md) (`2026-03-v3`) |
| **SBD subscription commissions (5,200/month)** | [SBD-SUBSCRIPTION-COMMISSION-POLICY.md](./SBD-SUBSCRIPTION-COMMISSION-POLICY.md) (`2026-04-v1`) |
| **Executive Network Director** | [EXECUTIVE-NETWORK-DIRECTOR.md](./EXECUTIVE-NETWORK-DIRECTOR.md) |
| SBD Network architecture | [../SBD-NETWORK-TECHNICAL-BRIEF.md](../SBD-NETWORK-TECHNICAL-BRIEF.md) |
| Legacy RD bonus notes (archived) | [../RD-RECRUITMENT-BONUS-IMPLEMENTATION.md](../RD-RECRUITMENT-BONUS-IMPLEMENTATION.md) |

## Implementation phases

| Phase | Scope | Status |
|-------|--------|--------|
| 1 | Docs | Done |
| 2 | Recruitment v2026-03-v3 (no Executive upline) | Done |
| 3 | SBD recurring 500+250+250 in production | **Done** |
| 4 | Remove executive product override | Done |
| 5 | Dashboards & copy alignment | Done |

## Tests

```bash
node scripts/test-recruitment-bonus-policy.js
node scripts/test-sbd-subscription-commission.js
node scripts/verify-ambassador-register-flow.mjs
```

## Deploy after recruitment policy changes

```bash
firebase deploy --only functions
# plus site deploy for admin-dashboard / registration JS
```
