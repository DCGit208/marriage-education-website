# Commerce Engine V1 (Sandbox)

Isolated financial event architecture for SBD Network. **Not wired to production checkout.**

## Collections (sandbox prefix)

- `commerce_v1_transactions`
- `commerce_v1_commissions`
- `commerce_v1_wallets`
- `commerce_v1_payouts`
- `commerce_v1_webhook_logs`
- `commerce_v1_access_grants`

## Config

```bash
firebase functions:config:set commerce.sandbox_mode="true" \
  campay.app_id="YOUR_APP_ID" \
  campay.app_username="YOUR_USERNAME" \
  campay.app_password="YOUR_PASSWORD" \
  campay.access_token="YOUR_TOKEN" \
  campay.webhook_secret="YOUR_WEBHOOK_SECRET"
```

## Functions

| Export | Type | Purpose |
|--------|------|---------|
| `commerceV1InitiateCheckout` | Callable | Start CamPay collection |
| `commerceV1SimulatePayment` | Callable | Sandbox: complete payment + commissions |
| `commerceV1GetDashboard` | Callable | Sandbox dashboard data |
| `commerceV1CampayWebhook` | HTTP | CamPay webhook (idempotent) |
| `commerceV1ProcessPayoutBatch` | Scheduled | Daily payout processor |
| `commerceV1RunPayoutBatch` | Callable | Manual payout batch (sandbox) |

## Webhook URL (after deploy)

`https://us-central1-marriage-education.cloudfunctions.net/commerceV1CampayWebhook`

## Sandbox UI

- SBD: `/commerce-v1/index.html` on sbd-network hosting
- Main site: `/commerce-v1/index.html` on marriageducation hosting

## Commission (Foundation)

- 5,200 FCFA total → 5,000 commissionable, 200 OPEX
- Ambassador: 500 FCFA | Senior: 250 FCFA
- Wallets updated as **pending**; payouts queued separately
