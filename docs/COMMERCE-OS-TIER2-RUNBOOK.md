# Commerce OS Tier 2 — CamPay Runbook

**Status:** Implemented (pilot)  
**Policy:** Production ledgers unchanged (Phases 1–6). `commerce_v1_*` sandbox stays isolated.

---

## What Tier 2 adds

| Piece | Function / path |
|-------|-----------------|
| Gateway module | `functions/commerce-os/gateways/campay.js` |
| Orchestrator | `functions/commerce-os/orchestrator.js` → `fulfillPendingPayment` |
| Collect (pilot) | `initiateCampayCheckout` |
| Webhook | `campayProductionWebhook` |
| Disburse batch | `runCampayDisburseBatch` |
| Pilot UI | `public/ambassador-payment.html` (CamPay tab, Cameroon) |
| Admin | Finance → CamPay dry run / CamPay disburse |

---

## Firebase config (required for live)

```bash
firebase functions:config:set \
  commerce.campay_live_enabled="true" \
  commerce.campay_auto_fulfill="true" \
  commerce.campay_pilot_products="ambassador_registration" \
  campay.app_username="YOUR_USERNAME" \
  campay.app_password="YOUR_PASSWORD" \
  campay.access_token="YOUR_TOKEN" \
  campay.webhook_secret="YOUR_WEBHOOK_SECRET" \
  campay.api_base="https://www.campay.net/api"
```

Keep `commerce.sandbox_mode="true"` so **commerce_v1** sandbox UI stays off production data.

Deploy:

```bash
firebase deploy --only functions:initiateCampayCheckout,functions:campayProductionWebhook,functions:getCampayPilotStatus,functions:runCampayDisburseBatch,firestore:rules,hosting:main,hosting:marriageducation
```

---

## CamPay webhook URL (production)

`https://us-central1-marriage-education.cloudfunctions.net/campayProductionWebhook`

Configure in CamPay dashboard with the same `campay.webhook_secret`.

---

## Pilot flow — ambassador registration (Cameroon)

1. User completes registration → lands on `ambassador-payment.html` with country CM / XAF.
2. If `getCampayPilotStatus` reports live or credentials, **CamPay MoMo** tab appears.
3. User enters phone + email → **Pay with CamPay MoMo**:
   - `submitManualPayment` creates `pending_payments/{reference}`
   - `initiateCampayCheckout` starts CamPay collect
4. User approves MoMo on phone.
5. CamPay webhook → orchestrator → `fulfillPendingPayment` (same as admin approve) when `commerce.campay_auto_fulfill=true`.

Manual MoMo + admin approve still works if CamPay is off.

---

## Disburse (pay ambassadors — Cameroon MoMo)

Finance tab → **CamPay dry run** (no money) or **CamPay disburse** (live).

- Only payees with `payout_profile.method === momo_cm'` and `profile_complete === true`
- Calls CamPay `withdraw`, then `markPayoutBatchPaid` with `method: campay`

---

## Guardrails

- Do not enable Tier 2 on SBD shop until a second pilot is scoped.
- Do not set `commerce.sandbox_mode=false` for commerce_v1 unless migrating that UI.
- Stripe remains default for international card payments.
- Executive commission doctrine unchanged.

---

## Tests

```bash
node scripts/test-recruitment-bonus-policy.js
node scripts/test-sbd-subscription-commission.js
node scripts/test-wallet-payout-tier1.js
```

---

## Recommended next step (ops)

1. Set config with **CamPay sandbox** first (`campay.api_base` demo URL, `campay_live_enabled=false` uses simulated collect).
2. One test registration with CamPay tab on staging.
3. Enable live + webhook + one real small ambassador payment.
4. Finance → dry run CamPay disburse on a test payee with `momo_cm` profile.
