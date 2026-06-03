# Marriage Education — Documentation Index

## Required reading before building

| Topic | Document |
|-------|----------|
| **Ambassador recruitment bonuses** | [RECRUITMENT-BONUS-POLICY.md](./RECRUITMENT-BONUS-POLICY.md) |
| SBD Network architecture | [../SBD-NETWORK-TECHNICAL-BRIEF.md](../SBD-NETWORK-TECHNICAL-BRIEF.md) |
| Legacy RD bonus notes (archived) | [../RD-RECRUITMENT-BONUS-IMPLEMENTATION.md](../RD-RECRUITMENT-BONUS-IMPLEMENTATION.md) |

## Tests

```bash
node scripts/test-recruitment-bonus-policy.js
node scripts/verify-ambassador-register-flow.mjs
```

## Deploy after bonus policy changes

```bash
firebase deploy --only functions
# plus site deploy for admin-dashboard / registration JS
```
