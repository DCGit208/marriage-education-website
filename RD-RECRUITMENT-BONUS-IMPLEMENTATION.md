# RD Recruitment Bonus — Superseded

> **This document is archived.** The authoritative specification is:
>
> **[docs/COMMISSION-MASTER-PRINCIPLES.md](./docs/COMMISSION-MASTER-PRINCIPLES.md)**  
> **[docs/RECRUITMENT-BONUS-POLICY.md](./docs/RECRUITMENT-BONUS-POLICY.md)** (policy `2026-03-v3`)

## What changed (March 2026)

| Legacy | Current (`2026-03-v3`) |
|--------|----------------------|
| 1,500 direct recruiter only | 1,500 direct recruiter (unchanged) |
| 750 RD network override only | Up to 1,500 upline pool shared by all uplines (750 / 750+750 / ÷N) |
| Upline ambassadors often 0 | Glory, Evelyn, etc. receive upline shares |
| RD direct = 1,500 + no override | RD direct = 1,500; second 1,500 retained by org |

## Implementation files

- `functions/recruitment-bonus-policy.js` — math & upline resolution
- `functions/recruitment-bonus-service.js` — Firestore credits
- `functions/index.js` → `activateAmbassador()`, `markRDPaymentPaid()`
- `public/admin-dashboard.html` → Recruitment Bonuses table

Deploy functions after changes: `firebase deploy --only functions`
