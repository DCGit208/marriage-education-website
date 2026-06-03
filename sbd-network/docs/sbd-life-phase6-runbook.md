# SBD Life Phase 6 — Production Rollout Runbook

## Enable for members

1. Open Firebase Console → Firestore → `admin/flags`
2. Set **`sbdLifeEnabled`** to `true`
3. Confirm **`sbdLifeLabsEnabled`** stays `true` only if admins still need `/labs/sbd-life` diagnostics

## What goes live

| Route | Purpose |
|-------|---------|
| `/sbd-life/` | Production home — discovery rails, featured issue, membership |
| `/sbd-life/article.html?slug=…` | Editorial reader |
| `/sbd-life/issue.html?slug=…` | Quarterly issue shell |
| `/labs/sbd-life/` | Admin/staging sandbox (unchanged) |

## Hamburger

When `sbdLifeEnabled` is true, **SBD Life** appears as the **first item** under **Lifestyle** on pages using `ham-nav.js`.

Dashboard uses **Expression** section — SBD Life injects there until dashboard nav is aligned with Lifestyle.

## Rollback (instant)

Set `admin/flags.sbdLifeEnabled` to **`false`**.

- Hamburger link disappears on next page load
- Production routes show “Coming soon” (admins can still access for QA)

## Admin QA before enabling

1. Seed demo content from `/labs/sbd-life` (admin)
2. Visit `/sbd-life/` as admin with flag **off** — should still load
3. Visit as non-admin with flag **off** — should see Coming soon
4. Enable flag — non-admin sees home + discovery
5. Open article, issue, reflections, optional listen
6. Confirm Messaging share links use `/sbd-life/article.html?slug=…`

## Shop → SBD Life entitlements (wired)

When Stripe checkout completes for:

| Shop product | Firestore grant |
|--------------|-----------------|
| `sbd-magazine-annual-subscription` | `sbdLifeSubscriptions/{uid}` active + archive |
| `sbd-magazine-single-issue` | `users/{uid}/sbdLifePurchasedIssues/{currentIssueId}` |
| `sbd-digital-archive-access` | `sbdLifeSubscriptions/{uid}` archive plan |

**Server:** `functions/index.js` → `grantSbdLifeEntitlements()` inside `unlockSbdContent()` (Stripe webhook).

**Backup:** `checkout-success.html` calls `syncSbdLifeShopEntitlement` if webhook is delayed.

**Deploy functions** (required for shop wiring):

```bash
cd "/Users/achugustave/Documents/Marriageducation"
firebase deploy --only functions:syncSbdLifeShopEntitlement,functions:stripeWebhook
```

## No regression checklist

- [ ] Dating, MV House, Messages load normally
- [ ] Dashboard hamburger opens/closes
- [ ] Shop checkout links from SBD Life commerce panel work
- [ ] Firestore rules still block unauthorized tier reads
