# Commerce OS — Admin UX (Non-Disruptive)

**Status:** Active — apply before Tier 1 admin UI work  
**Last updated:** March 2026  
**Surface:** `public/admin-dashboard.html` (and `-test.html` first)

---

## Principle

**Add a Finance / Commerce OS section. Do not replace existing workflows.**

Operators already know:

| Existing section | Purpose | Keep? |
|------------------|---------|-------|
| **Payments** | Approve pending MoMo/Stripe **customer** payments → activate ambassadors | **Yes — unchanged** |
| **Recruitment bonuses** (within Payments or dedicated table) | Pay recruitment **upline** via `markRDPaymentPaid` | **Yes — until Tier 1 batch subsumes** |
| **Ambassadors / RDs / CRM** | User management | Yes |

New section handles **paying earned commissions** across all types in one queue.

---

## New sidebar item

**Label:** `Finance` or `Commerce OS`  
**Icon:** coins / wallet  
**Id:** `data-section="finance"` (or `commerce`)

Placed after **Payments**, before **RDs** (or at bottom of operational group).

---

## Sub-tabs (Tier 1 only)

| Sub-tab | v1 behavior |
|---------|-------------|
| **Payout queue** | Payees with pending ≥ threshold; columns: code, name, country, method, recruitment pending, SBD pending, total, profile complete |
| **Run payout** | Select rows → Export Wise CSV **or** queue CamPay batch (Tier 2) → Confirm dialog |
| **Mark paid** | Enter external ref → call `markPayoutBatchPaid` |
| **Payout history** | Read `payout_events` |

**Deferred sub-tabs (do not build in Tier 1):**

Transactions, Fraud, Webhook logs, MRR analytics, Refunds, Settings sliders for %

---

## Payments tab — unchanged responsibilities

```text
Payments tab = CUSTOMER money IN
  - pending_payments approve/reject
  - ambassador activation trigger
  - NOT the primary place for commission payout batch (Phase 2 messaging)
```

Add a **hint banner** on Payments tab (Tier 1, copy only):

> Customer payments are approved here. To pay ambassador **commissions**, use **Finance → Payout queue**.

---

## Recruitment bonuses table

Keep existing **Pay** button calling `markRDPaymentPaid` until Finance batch is proven.

Optional Tier 1: Finance queue **includes** same rows sourced from `admin_notifications` + aggregated pending — single view, dual actions allowed temporarily.

**Guardrail:** Same payee + amount cannot be marked paid twice (idempotency key on `payout_events`).

---

## Wise export UX (Tier 1)

1. Filter `payout_profile.method === 'wise_bank'` and `profile_complete === true`.  
2. Button: **Export Wise CSV** — columns: name, email/IBAN, amount, currency, reference, payee_code.  
3. Admin uploads to Wise externally.  
4. Checkbox per row or batch **Mark paid** after confirmation.

No Wise API in Tier 1.

---

## CamPay batch UX (Tier 2)

Button: **Run CamPay disbursement** — only enabled when:

- `commerce.sandbox_mode === false`  
- Payee `method === 'momo_cm'`  
- Profile has `momo_number`

Tier 1: show disabled stub with tooltip “CamPay live — Tier 2”.

---

## Mobile / responsive

- Tables scroll horizontally on mobile  
- Primary actions sticky on payout queue  
- No realtime Firestore listeners on full `ambassadors` collection — paginate or query pending only

---

## Auth (known gap)

Several admin callables have admin auth **commented out** for testing.

**Tier 1 requirement:** Re-enable `permission-denied` for:

- `markPayoutBatchPaid` (new)  
- `exportPayoutQueue` (new)  
- Existing `markRDPaymentPaid` when touching Finance (recommended)

Document admin allowlist in Firebase custom claims or hardcoded admin emails — **ops decision**, not UI.

---

## Test vs production

| Environment | File |
|-------------|------|
| Staging | `admin-dashboard-test.html` |
| Production | `admin-dashboard.html` |

Ship Finance section to **test** first; mirror to prod after payout dry run.

---

## What operators should not see (Tier 1)

- Commerce sandbox `commerce_v1_*` data  
- Raw Stripe webhook payloads  
- Commission % configuration sliders  
- Executive override tier

---

## Related

- [PAYOUT-OPERATIONS.md](./PAYOUT-OPERATIONS.md)  
- [COMMERCE-OS-BUILD-PLAN.md](./COMMERCE-OS-BUILD-PLAN.md)  
- [WALLET-DATA-MODEL.md](./WALLET-DATA-MODEL.md)
