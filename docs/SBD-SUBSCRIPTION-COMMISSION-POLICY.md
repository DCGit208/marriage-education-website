# SBD Subscription Commission Policy

**Policy version:** `2026-04-v1`  
**Status:** Active — implemented in Cloud Functions (`handleSbdStripeInvoice`, `unlockSbdContent`)  
**Last updated:** March 2026  

> **Read [COMMISSION-MASTER-PRINCIPLES.md](./COMMISSION-MASTER-PRINCIPLES.md) first.**

---

## 1. Purpose

When a user subscribes to **Foundation Access** on **sbd-network.web.app** (and related checkout paths), ambassadors and uplines earn **recurring commission** on each successful monthly charge — separate from the **15,000 FCFA ambassador onboarding** recruitment bonus.

---

## 2. Product & pricing

| Field | Value |
|-------|-------|
| Product ID | `foundation-monthly` (also premium/elite tiers use same % rules on their base) |
| Customer charge | **5,200 FCFA/month** |
| Commissionable base | **5,000 FCFA** |
| OPEX (platform) | **200 FCFA** (not commissionable) |

Educational access value is scholarship-tier (~2,500 USD equivalent infrastructure on sbd-network.web.app).

---

## 3. Commission stack (every qualifying monthly charge)

| Role | % of 5,000 base | FCFA/month | When paid |
|------|-----------------|------------|-----------|
| **Direct** (SBD referral code owner) | 10% | **500** | Subscriber used their `SBD-…` code |
| **Senior override** | 5% | **250** | Direct seller is a **downline ambassador**; senior = immediate upline |
| **RD override** | 5% | **250** | Sale occurs in that RD’s region |
| **Executive** | — | **0** | No tier — see [EXECUTIVE-NETWORK-DIRECTOR.md](./EXECUTIVE-NETWORK-DIRECTOR.md) |

**Total commission per charge (full stack):** **1,000 FCFA** (20% of 5,000 base).

**Platform per charge:** 4,000 from base + 200 OPEX = **4,200 FCFA** (~80.8% of 5,200).

---

## 4. Recurring rule (confirmed)

Commissions apply on **each successful monthly subscription charge**, not first month only.

- Month 1: 500 + 250 + 250 (if full chain exists)
- Month 2, 3, … while subscription stays active and attributed: same amounts repeat

**Do not** re-credit on failed payments, refunds, or duplicate webhook events (idempotency required in Phase 3).

---

## 5. Attribution

1. Subscriber `users/{uid}.referredBy` = SBD referral code at signup/checkout.
2. Resolve seller via `sbdReferralCode` on `ambassadors/{AMB-…}` or `regional_directors/{RD-…}`.
3. **Senior override:** walk `recruitedBy` / `senior_code` from selling ambassador — **not** `regional_director` alone.
4. **RD override:** `rdCode` or `regional_director_code` on the selling branch.

### Edge cases

| Case | Direct | Senior | RD |
|------|--------|--------|-----|
| Ambassador sells (full chain) | 500 | 250 | 250 |
| Senior sells own code | 500 | 0 | 250 if in region |
| RD sells own code | 500 | 0 | 0 |
| No referral code | 0 | 0 | 0 |

One payee per role per charge. No walking Executive via `sponsor_code`.

---

## 6. Mature RD economics (planning model)

**Structure per RD network:**

- 50 Senior Ambassadors × 10 Ambassadors = **500 ambassadors**
- Planning deployment: 10 subs/day × 20 days = **200 new subs/month per ambassador**
- With retention modeling, mature retained subs drive recurring override

**RD override only:**

```
1,000,000 retained subs × 250 FCFA = 250,000,000 FCFA/month per mature RD network
```

This is **RD’s 5% slice**, not total network commission. Full stack at 1M subs = **1B FCFA/month** total commission pool.

Label all figures **planning targets** — actuals depend on deployment, retention, and activation rates.

---

## 7. Firestore (Phase 3 target)

| Collection | Purpose |
|------------|---------|
| `sbd_sales` | One row per commission event; fields: `ambassadorCommission`, `seniorAmbassadorCommission`, `rdCommission`, `policy_version`, `chargePeriod` |
| Seller docs | `sbdReferrals.commissionPending`, `overrideCommissionPending`, etc. |

**Policy version tag:** `2026-04-v1`

---

## 8. Related systems

| System | Relationship |
|--------|----------------|
| [RECRUITMENT-BONUS-POLICY.md](./RECRUITMENT-BONUS-POLICY.md) | One-time 15,000 FCFA signup — separate |
| `functions/commerce/` | Sandbox CamPay engine — mirror these rules; not production checkout yet |
| Product / book sales | **Done** — 10/5/5 only; no executive override (Phase 4) |

---

## 9. Code map (Phase 3)

| Concern | File |
|---------|------|
| Policy & crediting | `functions/sbd-subscription-commission.js` |
| Stripe invoice + checkout hook | `functions/index.js` → `handleSbdStripeInvoice()`, `unlockSbdContent()`, `stripeWebhook` |
| Checkout metadata | `functions/index.js` → `createSbdCheckoutSession()` |
| Sandbox mirror | `functions/commerce/config.js` |
| Tests | `scripts/test-sbd-subscription-commission.js` |

**Production:** recurring commissions on `invoice.payment_succeeded` + checkout invoice idempotency.

---

## 10. Deployment checklist (Phase 3)

1. Implement recurring idempotent commission crediting
2. Add RD 250 + fix senior/RD attribution fields
3. Add `scripts/test-sbd-subscription-commission.js`
4. `firebase deploy --only functions`
5. Stripe webhook endpoint must subscribe to **`invoice.payment_succeeded`** (renewals) — configured on `we_1TL50G…` → `stripeWebhook` (May 2026)
6. Verify test sub month 1 and simulated renewal

---

## 11. Quick reference

```
CHARGE     = 5200 FCFA/month
BASE       = 5000 FCFA (commissionable)
OPEX       = 200 FCFA

EACH successful monthly charge:
  Direct ambassador  = 500
  Senior override    = 250  (downline ambassador sales only)
  RD override        = 250  (regional sales)
  Executive          = 0

Executive earns via replicated RD infrastructure — not this stack.
```
