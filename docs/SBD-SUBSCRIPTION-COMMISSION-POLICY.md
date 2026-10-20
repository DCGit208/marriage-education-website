# SBD Subscription Commission Policy

**Policy version:** `2026-10-v3`
**Status:** Approved policy; implementation updated in Cloud Functions and pending deployment
**Last updated:** October 2026

> **Read [COMMISSION-MASTER-PRINCIPLES.md](./COMMISSION-MASTER-PRINCIPLES.md) first.**

---

## 1. Purpose

When a user purchases **Foundation Access** on **sbd-network.web.app** (and related checkout paths), ambassadors and eligible uplines earn commission on qualifying charges — separate from the Ambassador onboarding recruitment bonus. General-outreach USD equivalents below use the plan's 600:1 XAF/USD reference rate; the commission ledger and Mobile Money collection remain in XAF.

Two Foundation billing paths exist:

| Path | Product ID | Role |
|------|------------|------|
| **Official yearly deployment program** | `foundation-yearly` ($144.17 one-time / 12 months) | Primary operator challenge (10/day × 20 days) |
| **Monthly enrollment provision** | `foundation-monthly` ($9.77/mo) | Alternate path — does not replace yearly |

---

## 2. Foundation Yearly — official deployment program

| Field | Value |
|-------|-------|
| Product ID | `foundation-yearly` |
| Customer charge | **$144.17 USD one-time / 12 months** |
| Mobile Money collection amount | **86,502 XAF** (the $144.17 retail charge at 600 XAF/USD) |
| Commissionable unit basis | **80,000 XAF** (approximately **$133.33 USD**) |

### Commission stack (each paid yearly charge)

| Role | Rate of commissionable unit basis | USD equivalent per unit | XAF ledger amount per unit |
|------|-------------------------------------|--------------------------|---------------------------|
| **Direct** (SBD referral code owner) | 10% | **$13.33** | **8,000 XAF** |
| **Senior override** | 5% | **$6.67** | **4,000 XAF** |
| **RD override** | 5% | **$6.67** | **4,000 XAF** |

**Full eligible stack:** 20% of the 80,000 XAF commission basis = **$26.67 USD equivalent** (16,000 XAF). Commissions are not calculated from the $144.17 retail price.

The retail amount collected and the commission basis are intentionally different. `YEARLY_REVENUE_BASE_FCFA` remains the retail-charge amount used by existing Mobile Money checkout flows. Commission plans and `sbd_sales.revenueBaseFCFA` use `YEARLY_COMMISSION_BASE_FCFA` (80,000 XAF). A one-time 12-month purchase is credited on its qualifying deployment; it does not generate a recurring commission each month.

### Operator challenge math (planning targets)

| Cadence | Deployments | Direct commission |
|---------|-------------|-------------------|
| Ambassador / day | 10 units | **Approximately $133.33 USD** |
| Ambassador / month (20 days) | 200 units | **Approximately $2,666.67 USD** |
| Senior team / month (10 Ambassadors at full target) | 2,000 units | **Approximately $13,333.33 USD** override |
| Regional network / month (50 Senior teams / 500 Ambassadors) | 100,000 units | **Approximately $666,666.67 USD** override |

These are full-target scenarios, not guaranteed income. They assume every target unit is successfully deployed, attributed, and eligible. Senior and RD figures show team overrides only; they exclude any direct commissions those leaders may earn on their own qualifying deployments. USD values are rounded to cents after calculation using the 600:1 reference rate.

Dashboard tracks paid yearly sales via `sbdReferrals.yearlyByDay` / `yearlyByMonth` / `foundationYearly`.

---

## 3. Foundation Monthly — alternate provision

| Field | Value |
|-------|-------|
| Product ID | `foundation-monthly` (premium/elite monthly use same % rules on their base) |
| Customer charge | **Approximately $9.77 USD/month** (5,200 XAF at the policy reference rate; catalog pricing may vary) |
| Commissionable base | **Approximately $8.33 USD** (5,000 XAF) |
| OPEX (platform) | **Approximately $0.33 USD** (200 XAF; not commissionable) |

### Commission stack (every qualifying monthly charge)

| Role | % of 5,000 XAF base | USD equivalent per qualifying charge | XAF ledger amount |
|------|---------------------|-----------------------------------|--------------------|
| **Direct** | 10% | **Approximately $0.83** | **500 XAF** |
| **Senior override** | 5% | **Approximately $0.42** | **250 XAF** |
| **RD override** | 5% | **Approximately $0.42** | **250 XAF** |

**Total commission per monthly charge (full stack):** **Approximately $1.67 USD** (1,000 XAF).

Commissions apply on **each successful monthly subscription charge**, not first month only. This recurring monthly-product behavior is separate from the one-time Foundation Yearly deployment.

---

## 4. Attribution

1. Subscriber `users/{uid}.referredBy` = SBD referral code at signup/checkout (including guest Foundation Yearly landing `?ref=`).
2. Resolve seller via `sbdReferralCode` on `ambassadors/{AMB-…}` or `regional_directors/{RD-…}`.
3. **Senior override:** walk `recruitedBy` / `senior_code` from selling ambassador — **not** `regional_director` alone.
4. **RD override:** `rdCode` or `regional_director_code` on the selling branch.

### Edge cases

| Case | Direct | Senior | RD |
|------|--------|--------|-----|
| Ambassador sells (full chain) | Yes | Yes | Yes |
| Senior sells own code | Yes | 0 | Yes if in region |
| RD sells own code | Yes | 0 | 0 |
| No referral code | 0 | 0 | 0 |

One payee per role per charge. No walking Executive via `sponsor_code`.

---

## 5. Mature RD economics (planning model)

**Structure per RD network:**

- 50 Senior Ambassadors × 10 Ambassadors = **500 ambassadors**
- Planning deployment: **10 yearly subs/day × 20 days** = **200 new yearly deployments/month per ambassador**

Label all mature-scale figures **planning targets** — actuals depend on deployment, retention, and activation rates.

---

## 6. Firestore

| Collection / field | Purpose |
|--------------------|---------|
| `sbd_sales` | One row per commission event; includes `program`, `productId`, `challengeDayKey` |
| Seller `sbdReferrals.foundationYearly` | Count of yearly deployments |
| Seller `sbdReferrals.yearlyByDay.{YYYY-MM-DD}` | Daily challenge progress |
| Seller `sbdReferrals.yearlyByMonth.{YYYY-MM}` | Monthly challenge progress |

**Policy version tag:** `2026-10-v3`

---

## 7. Related systems

| System | Relationship |
|--------|----------------|
| [RECRUITMENT-BONUS-POLICY.md](./RECRUITMENT-BONUS-POLICY.md) | One-time Ambassador signup bonus — separate |
| DTC landing | `public/foundation-access.html` → `createSbdGuestCheckoutSession` |
| `functions/commerce/` | Sandbox CamPay engine — mirror these rules; not production checkout yet |
| Product / book sales | **Done** — 10/5/5 only; no executive override |

---

## 8. Code map

| Concern | File |
|---------|------|
| Policy & crediting | `functions/sbd-subscription-commission.js` |
| Stripe invoice + checkout hook | `functions/index.js` → `handleSbdStripeInvoice()`, `unlockSbdContent()`, `stripeWebhook` |
| Auth checkout | `functions/index.js` → `createSbdCheckoutSession()` |
| Guest yearly checkout | `functions/index.js` → `createSbdGuestCheckoutSession()` |
| Tests | `scripts/test-sbd-subscription-commission.js` |

**Production:** commissions on `invoice.payment_succeeded` + checkout invoice idempotency.

---

## 9. Quick reference

```
FOUNDATION ACCESS ($144.17 USD one-time / 12 months):
  Retail charge = 86,502 XAF at 600 XAF/USD
  Commission basis = 80,000 XAF (~$133.33 USD)
  Direct  = 8,000 XAF (~$13.33 USD)
  Senior  = 4,000 XAF (~$6.67 USD)
  RD      = 4,000 XAF (~$6.67 USD)
  Full eligible stack = 16,000 XAF (~$26.67 USD)

MONTHLY (5,200 XAF charge / 5,000 XAF base):
  Direct  = 500 XAF (~$0.83 USD)
  Senior  = 250 XAF (~$0.42 USD)
  RD      = 250 XAF (~$0.42 USD)
  Full stack = 1,000 XAF (~$1.67 USD)

Executive = 0 on both stacks
```
