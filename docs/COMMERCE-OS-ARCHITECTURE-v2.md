# Commerce OS Architecture v2

**Status:** Approved direction (pre–Tier 1 code)  
**Last updated:** March 2026  
**Supersedes:** Ad-hoc “CamPay-only Commerce OS” master prompt — this doc aligns with production policy Phases 1–6.

---

## Objective

One **financial nervous system** for Marriage Education + SBD Network:

- Central **commission accrual** (policy-driven, server-only)
- Central **wallet read model** (pending / paid)
- Central **payout orchestration** (CamPay + Wise + manual)
- **No** duplicate commission math in frontends

---

## What stays unchanged (guardrails)

| System | Rule |
|--------|------|
| Messenger V2 / CE2 | Do not modify for Commerce OS |
| Dating | Out of scope |
| MV House | Out of scope |
| Firebase Auth architecture | Out of scope |
| Commission policies | [COMMISSION-MASTER-PRINCIPLES.md](./COMMISSION-MASTER-PRINCIPLES.md) — **no Executive % on transactions** |
| Production Stripe checkout | Remains until explicitly migrated |

---

## Two layers (never confuse)

| Layer | Responsibility | Providers |
|-------|----------------|-----------|
| **Collect** | Customer pays for product/subscription/signup | **Stripe** (global cards), **CamPay** (Cameroon MoMo) |
| **Disburse** | Platform pays ambassadors/seniors/RDs | **CamPay** (CM MoMo), **Wise** (intl bank), manual |

Stripe is **not** the default disbursement rail.

---

## Gateway abstraction (required)

```text
functions/commerce-os/
  gateways/
    collect/
      stripeAdapter.js    ← existing stripeWebhook logic (wrap, don’t fork)
      campayAdapter.js    ← from functions/commerce/campayAdapter.js
    disburse/
      campayAdapter.js
      wiseAdapter.js      ← Tier 1: CSV export + record; API later
  orchestrator.js         ← route by productType + policy version
  policy/
    recruitment.js        ← wraps recruitment-bonus-policy.js
    sbdSubscription.js    ← wraps sbd-subscription-commission.js
    productDeployment.js  ← wraps processProductDeployment splits
```

**Interface (conceptual):**

```javascript
collectPayment({ gateway, amount, currency, metadata })
verifyWebhook({ gateway, headers, body })
disbursePayout({ gateway, payee, amount, reference })
```

**Today:** Stripe + manual MoMo live in `index.js`. CamPay in sandbox.  
**Tomorrow:** Orchestrator calls adapters; `index.js` becomes thin wrappers.

---

## Policy engine (not admin sliders)

Percentages come from **versioned policy modules**, not Firestore UI config:

| productType | Policy module | Version |
|-------------|---------------|---------|
| `ambassador_registration` | recruitment | `2026-03-v3` |
| `foundation_subscription` | sbd | `2026-04-v1` |
| `book_purchase` / product | product | 10+5+5 (20%) |

**Executive:** `executiveId` must **not** appear in commission breakdown rows (replication doctrine).

---

## API surface (logical routes)

Physical hosting: Firebase Functions (1st gen or Express-on-Functions).

**Optional DNS:** `api.marriageducation.com` → rewrite to `commerceApi`  
**Not required for Tier 1** — Firebase `httpsCallable` + existing HTTP webhooks OK.

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /payments/webhook/stripe` | Stripe signature | Existing + orchestrator |
| `POST /payments/webhook/campay` | CamPay HMAC | Sandbox → production |
| `POST /payments/initiate` | User | Start checkout (stripe or campay) |
| `GET /wallets/balance` | Payee | Aggregated pending/paid |
| `GET /wallets/history` | Payee | `payout_events` + credits |
| `POST /payouts/runBatch` | Admin | CamPay batch + Wise export trigger |
| `GET /payouts/history` | Admin / payee | Audit |

Frontends (SBD shop, ambassador payment, DOS dashboards) **call APIs or callables** — they do not calculate commissions.

---

## Firestore strategy (phased)

### Tier 1 (now)

- **Read** existing ambassador/RD fields ([WALLET-DATA-MODEL.md](./WALLET-DATA-MODEL.md))  
- **Write** `payout_profile`, `payout_events` only  
- **No** migration to `commerce_v1_*` collections

### Tier 2–4 (later)

Optional normalized collections:

`transactions`, `commissions`, `wallets`, `payoutBatches`, `webhookLogs`, `auditLogs`

**Migration rule:** dual-write period OR one-time backfill script — never two sources of truth without sync.

### Sandbox today (isolated)

`commerce_v1_*` + `commerce.sandbox_mode=true` — **must not** receive production traffic until cutover checklist passes.

---

## Payment success flow (target)

```text
Verified webhook (Stripe or CamPay)
        ↓
orchestrator.paymentSucceeded({ productType, paymentRef, attribution })
        ↓
├── ambassador_registration → creditRecruitmentBonusesV2
├── foundation_subscription → creditSbdSubscriptionCommissions
└── product_sale → creditCommissionsToUpline
        ↓
Update existing pending fields (no new math path)
        ↓
Optional: notify (Telegram / email)
```

**Never** trust frontend payment success.

---

## Payout flow (target)

```text
Nightly or monthly schedule (configurable per rail)
        ↓
Query payees: total pending ≥ threshold AND payout_profile complete
        ↓
├── method=momo_cm  → CamPay disburse batch
└── method=wise_bank → Wise CSV / API
        ↓
payout_events + decrement pending fields
        ↓
Notify payee
```

**No instant payout at checkout.**

---

## Admin: Commerce OS vs existing tabs

See [COMMERCE-OS-ADMIN-UX.md](./COMMERCE-OS-ADMIN-UX.md).

---

## African expansion

| Country | Collect | Disburse |
|---------|---------|----------|
| Cameroon | CamPay | CamPay |
| Nigeria, Ghana, Kenya, etc. | Future: Flutterwave / DusuPay adapter | Same aggregator family |
| UK / US / EU diaspora | Stripe (collect) | Wise |

CamPay is **not** pan-African.

---

## Relationship to master Cursor prompt

| Master prompt idea | v2 decision |
|--------------------|-------------|
| CamPay only | **Rejected** — Stripe collect + Wise disburse |
| Executive configurable % | **Rejected** — doctrine locked |
| New wallet collections day one | **Deferred** — read existing fields Tier 1 |
| 15 admin tabs day one | **Phased** — Finance section first |
| Daily 8 PM CamPay batch | **Configurable** — Wise monthly, CamPay weekly/monthly |
| Fraud ML day one | **Tier 5+** |

---

## Code map (current → target)

| Current | Target |
|---------|--------|
| `functions/commerce/*` | Evolve into `commerce-os/gateways` |
| `functions/commerceEngine.js` | `commerceV1*` until renamed |
| `functions/index.js` (stripe, approve, SBD) | Thin → orchestrator |
| `functions/recruitment-bonus-*.js` | Unchanged logic, called by orchestrator |
| `functions/sbd-subscription-commission.js` | Unchanged logic, called by orchestrator |

---

## Required reading before implementation

1. [COMMISSION-MASTER-PRINCIPLES.md](./COMMISSION-MASTER-PRINCIPLES.md)  
2. [WALLET-DATA-MODEL.md](./WALLET-DATA-MODEL.md)  
3. [PAYOUT-OPERATIONS.md](./PAYOUT-OPERATIONS.md)  
4. [COMMERCE-OS-BUILD-PLAN.md](./COMMERCE-OS-BUILD-PLAN.md)
