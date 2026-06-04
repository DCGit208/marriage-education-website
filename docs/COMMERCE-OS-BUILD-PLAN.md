# Commerce OS Build Plan — Tier 1 First

**Status:** Active implementation roadmap  
**Last updated:** March 2026  
**Prerequisite docs:** Complete before Tier 1 code (this file + siblings in `docs/`)

---

## Completed (Phases 1–6) — do not rebuild

| Phase | Deliverable |
|-------|-------------|
| 1–4 | Commission policy docs + recruitment v3 + SBD recurring + no executive product % |
| 5 | Executive dashboard copy alignment |
| 6 | Ledger reconciliation script + production audit |

**Tests must stay green:**

```bash
node scripts/test-recruitment-bonus-policy.js
node scripts/test-sbd-subscription-commission.js
node scripts/reconcile-commission-ledger-phase6.js
```

---

## Tier 1 — Build now (additive only)

**Goal:** Payout profiles, unified wallet visibility, admin Finance section, audit log.  
**Duration estimate:** ~1–2 weeks focused.

| # | Feature | Deliverable | Breaks prod if… |
|---|---------|-------------|-----------------|
| 1.1 | **Payout profile** | Fields on `ambassadors` / `regional_directors` + edit UI on DOS settings or Commissions | Required fields validated server-side only |
| 1.2 | **Unified wallet API** | Callable `getWalletSummary(code)` — aggregates per WALLET-DATA-MODEL | Wrong field sums |
| 1.3 | **DOS wallet card** | Commissions tab: pending / paid / breakdown | None (read-only) |
| 1.4 | **`payout_events` collection** | Written only by admin mark-paid function | Double mark without idempotency |
| 1.5 | **Admin Finance section** | New nav item — does **not** remove Payments tab | Replacing approve flow |
| 1.6 | **Payout queue** | List payees ≥ threshold, filter country/method | — |
| 1.7 | **Wise CSV export** | Download batch for `wise_bank` payees | — |
| 1.8 | **Mark batch paid** | Cloud Function decrements pending + writes events | Mark before send |
| 1.9 | **Cursor rule** | `.cursor/rules/commerce-payout-tier1.mdc` | — |

**Tier 1 explicit non-goals:**

- CamPay on live shop checkout  
- `api.marriageducation.com` DNS  
- New `wallets/{uid}` primary ledger  
- Replacing `markRDPaymentPaid` / `approvePayment`  
- Fraud engine, full analytics suite  

---

## Tier 2 — CamPay Cameroon (collect + disburse pilot)

**Duration estimate:** ~3–5 weeks after Tier 1.

| # | Feature |
|---|---------|
| 2.1 | Formalize gateway module (`collect` / `disburse`) |
| 2.2 | CamPay live credentials, `sandbox_mode=false` for CM path |
| 2.3 | Webhook verify → orchestrator stub → existing SBD/recruitment engines |
| 2.4 | One production checkout pilot (ambassador payment **or** one SBD product) |
| 2.5 | CamPay disburse batch for `momo_cm` profiles |

---

## Tier 3 — Wise automation (optional)

| # | Feature |
|---|---------|
| 3.1 | Wise API batch (if CSV volume painful) |
| 3.2 | PayPal adapter (optional fallback) |

---

## Tier 4 — Central orchestrator

| # | Feature |
|---|---------|
| 4.1 | `paymentSucceeded()` routes all product types |
| 4.2 | Stripe webhook thin wrapper only |
| 4.3 | Deprecate duplicate commission entry points in `index.js` |
| 4.4 | Optional `api.marriageducation.com` rewrites |

---

## Tier 5 — Commerce OS admin (full)

Transactions, fraud flags, MRR analytics, webhook log viewer, refunds — **after** payout queue proven.

---

## Tier 6 — African expansion

Flutterwave (or similar) adapter for NG/GH/KE — **when** selling in those markets.

---

## Deploy checklist (any tier)

1. Run policy unit tests (above).  
2. Deploy functions touching wallet/payout.  
3. Deploy hosting for admin + DOS JS.  
4. Smoke test on **dashboard-test** URLs ([DASHBOARD-TEST.md](../public/ambassador/DASHBOARD-TEST.md)).  
5. Production cutover only after mark-paid tested with fake small amount.

---

## Success criteria — Tier 1

- [ ] Ambassador can see recruitment + SBD pending in one place  
- [ ] Admin can export Wise CSV for UK/US payees without touching Payments tab workflow  
- [ ] Every mark-paid creates immutable `payout_events` row  
- [ ] No change to Stripe webhook commission math  
- [ ] Recruitment `approvePayment` still works unchanged  

---

## Document index (pre-build pack)

| Doc | Purpose |
|-----|---------|
| [PAYOUT-OPERATIONS.md](./PAYOUT-OPERATIONS.md) | How ops runs Wise + CamPay |
| [WALLET-DATA-MODEL.md](./WALLET-DATA-MODEL.md) | Field mapping |
| [COMMERCE-OS-ARCHITECTURE-v2.md](./COMMERCE-OS-ARCHITECTURE-v2.md) | Technical shape |
| [COMMERCE-OS-ADMIN-UX.md](./COMMERCE-OS-ADMIN-UX.md) | Admin UX rules |
| This file | Build order |
