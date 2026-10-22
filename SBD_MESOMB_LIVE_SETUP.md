# SBD-Network — MeSomb Live Mobile Money Setup

This document configures the **SBD-Network MeSomb application** for automated Mobile Money payments.

## Important: SBD-Network has its own MeSomb credentials

Do **not** use the MeSomb credentials from Q4-Life Urban Community Connect or another application.

The MeSomb application shown in the SBD account is:

- **Application:** SBD-Network
- **Website:** https://marriageeducation.com
- **Firebase project:** marriage-education
- **Purpose:** SBD-Network / Marriage Education payments

MeSomb applications have their own API credentials. The webhook signing secret is also unique to the webhook endpoint.

## Credentials we need

You will enter four secrets into Firebase:

1. `MESOMB_APPLICATION_KEY`
   - SBD-Network application's **Application Key**

2. `MESOMB_ACCESS_KEY`
   - SBD-Network application's **Access Key**

3. `MESOMB_SECRET_KEY`
   - SBD-Network application's **Secret Key**

4. `MESOMB_WEBHOOK_SECRET`
   - The **Webhook Signing Secret** generated for the SBD-Network webhook endpoint
   - This is NOT the same thing as the MeSomb API Secret Key.

Never put any of these values in GitHub source code.

## Step 1 — Confirm the Firebase project

From the repository root:

```bash
firebase use marriage-education
firebase use
```

The active project must be:

```
marriage-education
```

## Step 2 — Store the SBD-Network Application Key

Run:

```bash
firebase functions:secrets:set MESOMB_APPLICATION_KEY
```

Firebase will ask for the value.

Paste the **Application Key from the SBD-Network MeSomb application**.

Do not paste it into GitHub, this document, or chat.

## Step 3 — Store the SBD-Network Access Key

Run:

```bash
firebase functions:secrets:set MESOMB_ACCESS_KEY
```

Paste the **Access Key from SBD-Network** when prompted.

## Step 4 — Store the SBD-Network Secret Key

Run:

```bash
firebase functions:secrets:set MESOMB_SECRET_KEY
```

Paste the **Secret Key from SBD-Network** when prompted.

## Step 5 — Configure the MeSomb webhook URL

After the Firebase function is deployed, the endpoint will be:

```
https://us-central1-marriage-education.cloudfunctions.net/sbdMeSombWebhook
```

In the **SBD-Network** application in MeSomb:

1. Open the application's webhook/developer configuration.
2. Add the URL above.
3. Subscribe to successful payment transaction events.
4. Make sure the endpoint is configured for the SBD-Network application.
5. Save the webhook.
6. MeSomb will provide/generate the webhook signing secret.

The exact webhook signing secret is specific to this endpoint.

## Step 6 — Store the webhook signing secret in Firebase

Run:

```bash
firebase functions:secrets:set MESOMB_WEBHOOK_SECRET
```

Paste the **webhook signing secret** from the SBD-Network MeSomb webhook configuration.

Do not confuse:

- API Secret Key → `MESOMB_SECRET_KEY`
- Webhook Signing Secret → `MESOMB_WEBHOOK_SECRET`

They are separate credentials.

## Step 7 — Deploy only the SBD MeSomb functions

Once all four secrets have been entered:

```bash
firebase deploy --only functions:createSbdMeSombPayment,functions:checkSbdMeSombPayment,functions:createSbdGuestMeSombPayment,functions:checkSbdGuestMeSombPayment,functions:sbdMeSombWebhook
```

The code binds the secrets only to the functions that need them.

## Step 8 — Verify the deployed functions

Run:

```bash
firebase functions:list
```

You should see:

- `createSbdMeSombPayment`
- `createSbdGuestMeSombPayment` (Foundation Access page, guest checkout)
- `checkSbdGuestMeSombPayment`- `checkSbdMeSombPayment`
- `sbdMeSombWebhook`

## Step 9 — Verify the secrets exist without exposing their values

Use:

```bash
firebase functions:secrets:get MESOMB_APPLICATION_KEY
firebase functions:secrets:get MESOMB_ACCESS_KEY
firebase functions:secrets:get MESOMB_SECRET_KEY
firebase functions:secrets:get MESOMB_WEBHOOK_SECRET
```

These commands show secret metadata/version information. **Do not use commands that print the secret values into a screen recording, GitHub issue, or chat.**

## Step 10 — Test the complete SBD payment

Use a real SBD product with a small amount that you are comfortable testing.

The expected flow is:

1. Customer signs in to SBD-Network.
2. Customer chooses **Mobile Money**.
3. Customer selects MTN or Orange.
4. Customer enters their Mobile Money number.
5. SBD-Network calls `createSbdMeSombPayment`.
6. Firebase uses the **SBD-Network MeSomb credentials**.
7. MeSomb sends the payment request to the customer's phone.
8. Customer approves the payment on the phone.
9. MeSomb marks the transaction successful.
10. MeSomb sends the signed webhook to `sbdMeSombWebhook`.
11. Firebase verifies the webhook signature.
12. Firebase matches the MeSomb reference to the SBD payment record.
13. Firebase verifies the amount/currency.
14. `unlockSbdContent()` grants the purchased SBD access.
15. The customer gets access immediately.
16. The browser's status polling also sees SUCCESS and moves the customer to the success page.

The webhook is therefore the **server-to-server fulfillment authority**. Browser polling remains a customer-experience fallback; it is not the security mechanism that decides whether the customer has paid.

## Security model

The SBD-Network API credentials are server-side only.

The browser never receives:

- Application Key
- Access Key
- Secret Key
- Webhook Signing Secret

The browser only calls Firebase callable functions.

The webhook endpoint:

- requires POST;
- verifies MeSomb's HMAC-SHA256 signature;
- rejects stale signatures older than five minutes;
- uses the event ID for deduplication;
- matches the webhook to a pending SBD payment;
- checks the expected amount and XAF currency;
- fulfills only successful transactions.

## If you already created the webhook

If MeSomb has already generated the webhook signing secret for the SBD-Network endpoint, **do not create another webhook just because we are adding the Firebase function**.

Simply use the existing SBD-Network webhook URL configuration and put its signing secret into:

```bash
firebase functions:secrets:set MESOMB_WEBHOOK_SECRET
```

Then point that existing webhook endpoint to:

```
https://us-central1-marriage-education.cloudfunctions.net/sbdMeSombWebhook
```

## Do not do these things

- Do not use the Community Connect MeSomb keys.
- Do not put MeSomb keys in `checkout.js`.
- Do not put MeSomb keys in `index.html`.
- Do not commit a `.env` containing production keys.
- Do not send production keys through WhatsApp, GitHub Issues, or pull requests.
- Do not ask customers to provide screenshots for automated Mobile Money.
- Do not require admin approval for automated Mobile Money success.

## Current implementation

The SBD checkout now has three customer-facing choices:

- **Card**
- **Mobile Money**
- **Manual Mobile Money**

The customer does not see the internal provider name.

Automated Mobile Money uses the SBD catalog and the SBD-Network MeSomb application. Manual Mobile Money remains a separate verification path.
