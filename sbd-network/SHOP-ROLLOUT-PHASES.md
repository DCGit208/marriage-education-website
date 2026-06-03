# SBD Network Shop — Phased Rollout

The shop sells the full marriageducation.com catalog in **six phases** so checkout never breaks on products that lack Stripe prices or unlock rules.

## Current state (Phase 1)

**8 products** are visible and checkout-ready — the same IDs wired in `functions/index.js` (`SBD_CATALOG_SERVER` / `SBD_UNLOCK_RULES`):

| Product ID | Name |
|------------|------|
| `foundation-monthly` | Foundation Tier |
| `premium-monthly` | Premium Tier |
| `elite-monthly` | Elite Tier |
| `sbd-dummies` | SBD for Dummies |
| `teleios-blueprint` | Teleios Blueprint (Book) |
| `starter-bundle` | Starter Bundle |
| `teleios-bundle` | Teleios Bundle |
| `elite-bundle` | Elite Formation Bundle |

The shop UI only shows products with `phase <= activePhase`. Checkout is blocked unless `stripeReady: true`.

## Phase map

| Phase | Content | Before bumping |
|-------|---------|----------------|
| **1** | Membership, SBD for Dummies, Teleios Blueprint, 3 bundles | Already live in Stripe |
| **2** | Remaining books + magazine | Add Stripe prices + unlock rules for each SKU |
| **3** | Book bundles (Complete Library, Newlywed, etc.) | Same |
| **4** | Entry courses + course bundles | Same |
| **5** | Academy schools 1–4 (44 programs) | Same |
| **6** | Diplomas, coaching, lifetime pass | Same |

Source of truth for product definitions: `scripts/generate-shop-catalog.js`.

Legacy slug aliases (e.g. `sbd-for-dummies` → `sbd-dummies`): edit **only** `data/product-aliases.json`, then run `node scripts/generate-shop-catalog.js` (syncs browser + public JSON) and redeploy functions. Validate with `node scripts/audit-product-ids.js`.

## How to advance a phase

### 1. Add Stripe + unlock rules (required)

In `functions/index.js`, extend:

- `SBD_CATALOG_SERVER` — price, name, mode for each new product ID
- `SBD_UNLOCK_RULES` — what the purchase unlocks (tier, courses, bundles)

Deploy Cloud Functions before opening checkout for new SKUs.

### 2. Mark products Stripe-ready

In `scripts/generate-shop-catalog.js`, add new product IDs to `STRIPE_READY_IDS` once the backend supports them.

### 3. Regenerate catalog JSON

From `sbd-network/`:

```bash
# Phase 1 (default)
node scripts/generate-shop-catalog.js

# Phase 2 example
SHOP_ACTIVE_PHASE=2 node scripts/generate-shop-catalog.js
```

This writes `public/data/shop-catalog.json` with updated `activePhase`.

### 4. Build and deploy hosting

```bash
node build.js
firebase deploy --only hosting:sbd-network --project marriage-education
```

### 5. Optional — seed Firestore

If you use Firestore `shopProducts/` for admin or analytics:

```bash
node scripts/seed-shop-catalog.js
```

## Safety checks

- **Shop** (`public/js/shop.js`): filters by `activePhase`; “Coming soon” when `!stripeReady`
- **Checkout** (`public/js/checkout.js`): rejects products not in phase or not stripe-ready
- **Server** (`createSbdCheckoutSession`): must know the product ID or checkout fails at Stripe

Never set `SHOP_ACTIVE_PHASE` higher than the Stripe backend supports.

## Quick verification

After regenerating Phase 1:

```bash
node scripts/generate-shop-catalog.js
# Expect: visible: 8 | checkout-ready: 8
```

All 8 visible products should have `"stripeReady": true` and `"phase": 1` in `shop-catalog.json`.
