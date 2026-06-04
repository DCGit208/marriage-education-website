# Payout Operations — CamPay + Wise

**Status:** Active operations doctrine (pre–Tier 1 build)  
**Last updated:** March 2026  
**Related:** [COMMISSION-MASTER-PRINCIPLES.md](./COMMISSION-MASTER-PRINCIPLES.md), [WALLET-DATA-MODEL.md](./WALLET-DATA-MODEL.md), [COMMERCE-OS-BUILD-PLAN.md](./COMMERCE-OS-BUILD-PLAN.md)

---

## Core rule

**Commissions are calculated automatically when customers pay.**  
**Cash is sent manually or in batches** — only after money leaves your account do you **Mark paid** in admin.

Stripe collects from customers. Stripe does **not** pay ambassadors.

---

## Two rails (by payee location)

| Rail | Use for | How cash leaves |
|------|---------|-----------------|
| **CamPay** | Cameroon — MTN / Orange MoMo | CamPay disburse API (Tier 2+) or manual MoMo until live |
| **Wise Business** | UK, US, EU, and other bank destinations | Wise batch transfer (CSV export in Tier 1) |
| **Manual exception** | Edge cases, corrections | Bank wire / PayPal — logged in `payout_events` |

**Do not** use CamPay to pay UK/US ambassadors. **Do not** use Wise for Cameroon MoMo wallets.

---

## What gets paid (three ledger types)

| Type | When earned | Pending fields (see WALLET-DATA-MODEL) |
|------|-------------|----------------------------------------|
| **Recruitment** | Once on ambassador activation | `recruitment_bonus_pending` |
| **SBD subscription** | Each successful monthly charge | `sbdReferrals.*Pending` |
| **Product / deployment** | Per sale (`processProductDeployment`) | `commissionEarned`, overrides |

Tier 1 **reads** these fields. Tier 1 does **not** create a parallel wallet collection.

---

## Recommended schedule

| Rail | Suggested frequency | Notes |
|------|---------------------|-------|
| **Wise (international)** | Monthly (e.g. 1st or 15th) | Batch FX; align with finance calendar |
| **CamPay / MoMo (Cameroon)** | Weekly or monthly | Daily batch optional at high volume |
| **Recruitment bonuses** | With monthly run or within 7 days of activation | Communicate SLA to network |

---

## Minimum payout threshold

**Configurable** — recommended starting points:

| Audience | Suggested minimum |
|----------|-------------------|
| Cameroon (MoMo) | 25,000–50,000 FCFA |
| International (Wise) | Equivalent ~$25–50 USD in FCFA ledger |

Balances below threshold stay **pending** until the next cycle.

---

## Wise setup (operations, not code)

1. Open **Wise Business** account and complete verification.  
2. Fund from your business bank.  
3. Collect payee **bank details** via payout profile (Tier 1).  
4. On payout day: export CSV from admin Finance section → upload to Wise → confirm transfers.  
5. Only then: **Mark paid** in admin for each payee/batch.

Wise API automation is **optional** (Tier 3+). CSV batch is sufficient for Tier 1.

---

## CamPay setup (operations)

1. Production credentials in Firebase Functions config (`campay.*`).  
2. Webhook URL: `commerceV1CampayWebhook` (sandbox today) or Commerce OS router (future).  
3. `commerce.sandbox_mode=false` only when ready for live CM money.  
4. Test: one small collection + one disbursement to your own MoMo.  
5. Payout batch respects threshold and `payout_method=momo_cm`.

See [COMMERCE-OS-ARCHITECTURE-v2.md](./COMMERCE-OS-ARCHITECTURE-v2.md) for technical wiring.

---

## Mark paid discipline

| Step | Requirement |
|------|-------------|
| 1 | Verify payee payout profile is complete |
| 2 | Send money via Wise or CamPay (or manual) |
| 3 | Record external reference (Wise transfer ID, MoMo ref) |
| 4 | Mark paid in admin → writes `payout_events` + decrements pending |

**Never** mark paid before funds are sent.

For recruitment, existing **`markRDPaymentPaid`** remains authoritative until unified batch migrates (match `ambassador_code` + amount).

---

## Currency display

- **Ledger of record:** FCFA for commission accrual.  
- **Wise payouts:** Convert at Wise spot rate on payout day; store `amount_fcfa` and `amount_paid_currency` in `payout_events`.  
- **Ambassador UI:** Show FCFA pending; optional USD estimate via existing `DOSEconomics` helpers.

---

## Communication template (network)

> Commissions accrue when customers pay. Payouts are processed **[monthly]** to your registered MoMo (Cameroon) or bank via Wise (international) once your pending balance reaches **[threshold]**. Update payout details in your dashboard.

---

## Out of scope (this document)

- Commission percentage math — see policy docs  
- Customer checkout (Stripe vs CamPay collect) — see BUILD-PLAN Tier 2  
- Executive replication economics — [EXECUTIVE-NETWORK-DIRECTOR.md](./EXECUTIVE-NETWORK-DIRECTOR.md)
