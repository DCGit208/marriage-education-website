# SBD Subscription Commission Policy

**Policy version:** `2026-07-v2`  
**Status:** Active — implemented in Cloud Functions (`handleSbdStripeInvoice`, `unlockSbdContent`, `creditSbdSubscriptionCommissions`)  
**Last updated:** July 2026  

> **Read [COMMISSION-MASTER-PRINCIPLES.md](./COMMISSION-MASTER-PRINCIPLES.md) first.**

---

## 1. Purpose

When a user subscribes to **Foundation Access** on **sbd-network.web.app** (and related checkout paths), ambassadors and uplines earn commission on each qualifying charge — separate from the **15,000 FCFA ambassador onboarding** recruitment bonus.

Two Foundation billing paths exist:

| Path | Product ID | Role |
|------|------------|------|
| **Official yearly deployment program** | `foundation-yearly` ($144.17/year) | Primary operator challenge (10/day × 20 days) |
| **Monthly enrollment provision** | `foundation-monthly` (~$9.77/mo) | Alternate path — does not replace yearly |

---

## 2. Foundation Access — official deployment program

| Field | Value |
|-------|-------|
| Product ID | `foundation-yearly` |
| Customer charge | **$144.17 USD / year** |
| FX ledger rate | **600 XAF / USD** |
| Commissionable base | **86,502 FCFA** ($144.17 × 600) |

### Commission stack (each paid yearly charge)

| Role | % of $144.17 | USD | FCFA |
|------|-----------|-----|------|
| **Direct** (SBD referral code owner) | 10% | **$14.417** | **8,650** |
| **Senior override** | 5% | **$7.2085** | **4,325** |
| **RD override** | 5% | **$7.2085** | **4,325** |

**Full stack:** 20% of $144.17 = **$28.834** (17,300 FCFA).

### Operator challenge math (planning + DOS)

| Cadence | Deployments | Direct commission |
|---------|-------------|-------------------|
| Day | 10 × $144.17 | **$144.17 / day** |
| Month (20 days) | 200 | **$2,883.40 / month** |
| Senior (10 ambassadors at full target) | 5% of network revenue | **$11,800 / month** |

Dashboard tracks paid yearly sales via `sbdReferrals.yearlyByDay` / `yearlyByMonth` / `foundationYearly`.

---

## 3. Foundation Monthly — alternate provision

| Field | Value |
|-------|-------|
| Product ID | `foundation-monthly` (premium/elite monthly use same % rules on their base) |
| Customer charge | **5,200 FCFA/month** (catalog USD may show ~$9.77) |
| Commissionable base | **5,000 FCFA** |
| OPEX (platform) | **200 FCFA** (not commissionable) |

### Commission stack (every qualifying monthly charge)

| Role | % of 5,000 base | FCFA/month |
|------|-----------------|------------|
| **Direct** | 10% | **500** |
| **Senior override** | 5% | **250** |
| **RD override** | 5% | **250** |

**Total commission per monthly charge (full stack):** **1,000 FCFA**.

Commissions apply on **each successful monthly subscription charge**, not first month only.

---

## 4. Attribution

1. Subscriber `users/{uid}.referredBy` = SBD referral code at signup/checkout (including guest Foundation Access landing `?ref=`).
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
- Planning deployment: **10 12-month access sales/day × 20 days** = **200 new 12-month deployments/month per ambassador**

Label all mature-scale figures **planning targets** — actuals depend on deployment, retention, and activation rates.

---

## 6. Firestore

| Collection / field | Purpose |
|--------------------|---------|
| `sbd_sales` | One row per commission event; includes `program`, `productId`, `challengeDayKey` |
| Seller `sbdReferrals.foundationYearly` | Count of 12-month deployments |
| Seller `sbdReferrals.yearlyByDay.{YYYY-MM-DD}` | Daily challenge progress |
| Seller `sbdReferrals.yearlyByMonth.{YYYY-MM}` | Monthly challenge progress |

**Policy version tag:** `2026-07-v2`

---

## 7. Related systems

| System | Relationship |
|--------|----------------|
| [RECRUITMENT-BONUS-POLICY.md](./RECRUITMENT-BONUS-POLICY.md) | One-time 15,000 FCFA signup — separate |
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
YEARLY ($144.17):
  Direct  = 8,650 FCFA (~$14.42)
  Senior  = 4,325 FCFA (~$7.21)
  RD      = 3,540 FCFA ($5.90)

MONTHLY (5,200 charge / 5,000 base):
  Direct  = 500
  Senior  = 250
  RD      = 250

Executive = 0 on both stacks
```
