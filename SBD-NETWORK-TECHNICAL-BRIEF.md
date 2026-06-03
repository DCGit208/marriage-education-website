# SBD Network — Technical Brief for Consultants

**Project:** SBD Network (`sbd-network.web.app`)  
**Parent Organisation:** Dr. Coach Achu / Marriage Education  
**Firebase Project ID:** `marriage-education`  
**Live URL:** https://sbd-network.web.app  
**Last updated:** April 2026

---

## 1. What It Is

SBD Network is a **Progressive Web App (PWA)** — a private, members-only online community and learning platform for marriage education. It is designed to look and behave like a native mobile app (iOS/Android) while running entirely in the browser. Users can install it to their home screen via the browser's "Add to Home Screen" prompt.

The platform serves three audiences:

| Audience | Entry point |
|---|---|
| **Subscribers** | Register at `/auth.html`, pay via Stripe or Mobile Money |
| **Ambassadors** | Provisioned automatically when approved at `marriageducation.com` |
| **Admins** | `/admin.html` — full content/user management panel |

---

## 2. Subscription Tiers

All content access is gated by tier. Tiers are stored on the `users/{uid}` Firestore document.

| Tier | Price | What it unlocks |
|---|---|---|
| **Free** | $0 | Community board, Week 1 of Teleios Blueprint |
| **Foundation** | $9/mo | Foundation courses (Weeks 1–2 Teleios), SBD Dummies group |
| **Premium** | $20/mo | Sexual literacy content, advanced courses |
| **Elite** | $50/mo | All content — Marriage Systems, Civilization Leadership, private groups |

Tier is checked client-side in `learn-v2.js` and `tier-access.js`. The source of truth is always Firestore (`subscription.tier` + `subscription.status` + `subscription.endDate`).

---

## 3. Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML5 / CSS3 / JavaScript (ES2020+). No framework. |
| **Backend / Database** | Firebase (Firestore, Auth, Hosting, Cloud Functions, Storage) |
| **Payments — Card** | Stripe Checkout (server-side session creation via Cloud Function) |
| **Payments — Mobile Money** | Manual submission form → `submitManualPayment` Cloud Function → admin approval |
| **Media Storage** | Cloudflare R2 (via a Cloudflare Worker proxy — no credentials in browser) |
| **Push Notifications** | Firebase Cloud Messaging (FCM) via `notifications.js` |
| **Admin Alerts** | Telegram Bot API (`sendTelegram()` in Cloud Functions) |
| **PWA Service Worker** | `/service-worker.js` — cache-first strategy with versioned cache busting |
| **Build System** | Custom Node.js script (`build.js`) — no Webpack/Vite/bundler |
| **Deployment** | Firebase CLI — `firebase deploy --only hosting` |

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────┐
│                  BROWSER / PWA               │
│   HTML pages + vanilla JS + CSS              │
│   Service Worker for offline + caching       │
└────────────┬────────────────────────────────┘
             │  Firebase SDK (compat v9)
             │
┌────────────▼────────────────────────────────┐
│             FIREBASE SERVICES                │
│                                              │
│  Auth ──── Firestore ──── Hosting            │
│   ↑            ↑             ↓               │
│  auth.js    (rules)    /public/ files        │
│                                              │
│  Cloud Functions (Node.js 18)                │
│    ├── stripeWebhook (HTTP)                  │
│    ├── momoWebhook (HTTP)                    │
│    ├── createSbdCheckoutSession (callable)   │
│    ├── submitManualPayment (callable)        │
│    ├── approvePayment (callable)             │
│    ├── provisionSBDAccess (callable)         │
│    ├── unlockSbdContent (callable)           │
│    ├── activateAmbassador (callable)         │
│    ├── generateCourseCertificate (callable)  │
│    ├── processProductDeployment (callable)   │
│    ├── checkAmbassadorPromotion (callable)   │
│    ├── checkRDPromotion (callable)           │
│    ├── markRDPaymentPaid (callable)          │
│    ├── registerReferralCode (callable)       │
│    ├── onAmbassadorUpdate (Firestore trigger)│
│    ├── onNewAmbassadorCreated (trigger)      │
│    ├── onRDPromoted (trigger)                │
│    └── downloadBook (HTTP)                   │
└─────────────┬───────────────────────────────┘
              │
┌─────────────▼───────────────────────────────┐
│         EXTERNAL SERVICES                    │
│                                              │
│  Stripe ── payment sessions + webhooks       │
│  Cloudflare R2 ── media files (photos/video) │
│  Cloudflare Worker ── upload proxy/signer    │
│    (sbd-upload-signer.sbdnetwork.workers.dev)│
│  Telegram Bot ── admin payment alerts        │
│  Firebase FCM ── push notifications          │
└─────────────────────────────────────────────┘
```

---

## 5. Progressive Web App (PWA) Features

| Feature | Implementation |
|---|---|
| **Installable** | `manifest.json` with all icon sizes (72–512px), `display: standalone` |
| **Offline support** | `service-worker.js` — cache-first for static assets, network-first for API |
| **Push notifications** | FCM via `notifications.js`, permission requested on login |
| **App shortcuts** | Manifest shortcuts: Dashboard, Messages, Explore, Profile |
| **iOS safe-areas** | CSS env(safe-area-inset-*) in `bottom-nav.css` and `styles.css` |
| **Splash screens** | Black background + theme_color to match native app feel |
| **Cache busting** | `build.js` stamps all JS/CSS with `?v={timestamp}` on every build |
| **SW update detection** | `sw-update-checker.js` polls `version.json`, prompts user to refresh |
| **Viewport lock (iOS keyboard)** | `visualViewport` API in `dm.js` — chat stays pinned above keyboard |

---

## 6. Build System

There is **no framework** (no React, Vue, Angular, Next.js). The build is a single custom Node.js script.

### How it works

1. Source HTML pages live in `src/pages/*.html`
2. Each page has a `<!-- NAV_INJECT -->` placeholder
3. `build.js` reads each page, injects the shared bottom nav from `src/partials/nav.html` with the correct active tab, stamps all `?v=` cache-busting tokens, and writes output to `public/`
4. `firebase deploy --only hosting` uploads `public/` to Firebase CDN

### Running a deploy

```bash
# From the sbd-network/ directory:
cd /Users/achugustave/Documents/Marriageducation/sbd-network
node build.js && firebase deploy --only hosting

# Shorthand (if npm script is configured):
npm run deploy
```

> ⚠️ **Always run `node build.js` before `firebase deploy`** — the `public/` pages are generated output, not hand-edited. Editing `public/*.html` directly will be overwritten on the next build.

### Version stamping

Every deploy auto-stamps a unique version in `public/version.json` and `public/service-worker.js`. Users on old cached versions are prompted to refresh within 30 seconds of opening the app.

---

## 7. File System Structure

```
sbd-network/
├── build.js                    ← Build script (MUST RUN before deploy)
├── firebase.json               ← Hosting config, cache headers, redirects
├── firestore.rules             ← Security rules for ALL collections
├── storage.rules               ← Firebase Storage security rules
├── package.json
│
├── src/                        ← SOURCE FILES (edit these)
│   ├── pages/
│   │   ├── board.html          ← Single discussion board view
│   │   ├── boards.html         ← Boards index
│   │   ├── courses.html        ← Course catalogue
│   │   ├── dating.html         ← Marriage Vault / dating feature
│   │   ├── dm.html             ← Direct messages (1:1 and group)
│   │   ├── explore.html        ← Member discovery
│   │   ├── group.html          ← Community group view
│   │   ├── learn.html          ← Learning hub
│   │   ├── lesson.html         ← Individual lesson view
│   │   ├── member.html         ← Member profile (others)
│   │   ├── mv-house.html       ← Marriage Vault house view
│   │   ├── profile.html        ← Own profile
│   │   ├── schools.html        ← Schools list
│   │   ├── shop.html           ← Products / SBD bundles
│   │   ├── tier.html           ← Subscription upgrade page
│   │   └── what-is.html        ← Conversion/sales page
│   └── partials/
│       └── nav.html            ← Shared bottom navigation bar
│
├── public/                     ← GENERATED OUTPUT (do not hand-edit pages)
│   ├── *.html                  ← Built from src/pages/ by build.js
│   ├── admin.html              ← Admin panel (NOT in src/pages — edit directly)
│   ├── admin-course-builder.html
│   ├── auth.html               ← Login / signup
│   ├── checkout.html           ← Stripe payment flow
│   ├── checkout-success.html
│   ├── dashboard.html          ← Member home dashboard
│   ├── entry-quiz.html         ← Onboarding quiz
│   ├── index.html              ← Redirects → /auth or /dashboard
│   ├── manifest.json           ← PWA manifest
│   ├── service-worker.js       ← PWA service worker
│   ├── version.json            ← Cache-bust version file
│   │
│   ├── css/
│   │   ├── styles.css          ← Global base styles
│   │   ├── bottom-nav.css      ← Bottom navigation bar
│   │   ├── dashboard.css
│   │   ├── dm.css              ← Direct messages UI
│   │   ├── learn-v2.css        ← Learning hub
│   │   ├── boards-v2.css
│   │   ├── profile.css
│   │   ├── dating.css
│   │   ├── paywall.css
│   │   ├── tier.css
│   │   ├── quiz.css
│   │   ├── certificate.css
│   │   └── ...
│   │
│   ├── js/
│   │   ├── firebase.js         ← Firebase SDK init + config
│   │   ├── auth.js             ← Login, signup, ?ref= capture
│   │   ├── auth-guard.js       ← Page-level auth protection
│   │   ├── dashboard.js        ← Dashboard data loading
│   │   ├── learn-v2.js         ← Learning hub + tier gating
│   │   ├── tier-access.js      ← Tier check utilities
│   │   ├── shop.js             ← SBD bundles, unlock logic
│   │   ├── checkout.js         ← Stripe session creation
│   │   ├── dm.js               ← Direct messages (1:1 + group)
│   │   ├── dm-badge.js         ← Unread message badge
│   │   ├── boards-v2.js        ← Community boards
│   │   ├── board.js            ← Single board
│   │   ├── posts.js            ← Post creation/display
│   │   ├── profile.js          ← Profile editing
│   │   ├── member.js           ← View other members
│   │   ├── explore.js          ← Member search/discovery
│   │   ├── notifications.js    ← FCM push notifications
│   │   ├── upload.js           ← Media upload → Cloudflare R2
│   │   ├── admin.js            ← Admin panel (users/groups/boards)
│   │   ├── admin-formation.js  ← Admin formation scoring overrides
│   │   ├── schools.js          ← Schools list
│   │   ├── courses.js          ← Course catalogue
│   │   ├── quiz.js             ← Module quizzes
│   │   ├── assignment.js       ← Written assignments
│   │   ├── certificate.js      ← Certificate generation
│   │   ├── dating.js           ← Marriage Vault dating feature
│   │   ├── mv-house.js         ← Marriage Vault house
│   │   ├── formation-scoring-v2.js ← Formation access scoring
│   │   ├── formation-access.js ← Formation feature gating
│   │   ├── upgrade-tracker.js  ← Upgrade funnel tracking
│   │   ├── analytics.js        ← Usage analytics
│   │   ├── sw-update-checker.js ← Service worker update prompt
│   │   ├── service-worker.js   ← PWA service worker
│   │   ├── mentions.js         ← @mention autocomplete
│   │   ├── search.js           ← Site-wide search
│   │   ├── transitions.js      ← Page transition animations
│   │   ├── ptr.js              ← Pull-to-refresh
│   │   ├── swipe-back.js       ← Swipe-back gesture
│   │   ├── install-prompt.js   ← PWA install banner
│   │   ├── offline.js          ← Offline state UI
│   │   ├── ham-nav.js          ← Hamburger navigation
│   │   ├── image-editor.js     ← In-browser image crop/edit
│   │   ├── home-premium.js     ← Homepage premium content
│   │   └── video-preview.js    ← Video thumbnail preview
│   │
│   └── assets/
│       ├── icons/              ← PWA icons (72px–512px)
│       └── images/             ← Static images (MV house, etc.)
│
├── scripts/                    ← Admin/maintenance Node.js scripts
│   ├── backfill-sbd-referral-codes.js
│   ├── reset-user-tiers.js
│   ├── seed-teleios-free.js
│   ├── fix-sbd-access.js
│   └── ...
│
└── workers/
    └── upload-signer/          ← Cloudflare Worker (deployed separately)
        └── ...                 ← Signs R2 uploads, verifies Firebase tokens
```

---

## 8. Firestore Collections

| Collection | Purpose |
|---|---|
| `users/{uid}` | Member profile, tier, subscription, groups, SBD referral code |
| `conversations/{id}` | DM/group chat metadata (participants, last message, unread counts) |
| `conversations/{id}/messages` | Individual chat messages |
| `groups/{id}` | Community groups (access gated by requiredTier) |
| `modules/{id}` | Learning modules (week content, tier lock) |
| `courses/{id}` | Course catalogue entries |
| `schools/{id}` | Schools |
| `posts/{id}` | Board posts |
| `boards/{id}` | Discussion boards |
| `comments/{id}` | Post comments |
| `notifications/{id}` | In-app notifications per user |
| `ambassador_registrations` | Raw form submissions from marriageducation.com |
| `ambassadors/{code}` | Ambassador accounts (AMB-XXXX-NNNN) |
| `regional_directors/{code}` | RD accounts |
| `pending_payments/{id}` | Manual Mobile Money payment submissions |
| `sales/{id}` | Completed product sales (commission tracking) |
| `referral_codes/{id}` | SBD referral codes (SBD-XXXX-NNNN) |
| `admin_notifications/{id}` | Admin action items (e.g. rd_recruitment_bonus) |
| `dating_profiles/{uid}` | Marriage Vault dating profiles |
| `mv_houses/{id}` | Marriage Vault virtual house |
| `formation_scores/{uid}` | Formation assessment scores |
| `certificates/{id}` | Earned certificates |
| `analytics/{id}` | Usage event tracking |

---

## 9. Key Features

### Learning System
- Tiered content access (Free / Foundation / Premium / Elite)
- Video lessons, text modules, quizzes, written assignments
- Progress tracking per module
- Certificate generation on course completion
- Drip content (week-by-week unlock)

### Community
- Discussion boards (public + tier-gated)
- Post creation with images/video
- @mentions, reactions, comments
- Pull-to-refresh, infinite scroll

### Direct Messages
- 1:1 and group chats
- Image/video attachments (stored in Cloudflare R2)
- Voice messages
- Quote-reply, emoji reactions, message editing/deletion
- Read receipts, typing indicators
- Push notifications via FCM

### Marriage Vault (Dating Feature)
- Formation scoring system (v2)
- Profile matching
- Virtual "house" metaphor for relationship stages

### Ambassador System (marriageducation.com integration)
- Ambassadors approved on `marriageducation.com` are auto-provisioned with SBD Network access via `provisionSBDAccess` Cloud Function
- Each ambassador gets a unique `SBD-XXXX-NNNN` referral code
- Referral tracking: `?ref=SBD-XXXX-NNNN` on signup captured by `auth.js`
- Ambassador dashboard panel shows referral signups/subscribers
- **Recruitment bonuses** on ambassador signup: see **[docs/COMMISSION-MASTER-PRINCIPLES.md](../docs/COMMISSION-MASTER-PRINCIPLES.md)** and **[docs/RECRUITMENT-BONUS-POLICY.md](../docs/RECRUITMENT-BONUS-POLICY.md)** (`2026-03-v3`)
- **SBD subscription commissions:** **[docs/SBD-SUBSCRIPTION-COMMISSION-POLICY.md](../docs/SBD-SUBSCRIPTION-COMMISSION-POLICY.md)** (`2026-04-v1`, recurring 500+250+250)

### Payments
- **Stripe**: Card payments via Checkout Sessions, webhook at `stripeWebhook`
- **Mobile Money (MoMo)**: Manual submission → admin approves via `approvePayment` Cloud Function
- Payment approval auto-unlocks the correct tier on `users/{uid}`

### Admin Panel (`/admin.html`)
- User management (tier override, role assignment, suspend/delete)
- Group management (create/archive, set requiredTier)
- Board management
- Content moderation (hide/delete posts)
- Broadcast announcements to all members or a group
- Formation override (manual score set, dating ban/unban, verified badge)
- Analytics dashboard

---

## 10. How to Update & Deploy

### Standard content/feature change

```bash
# 1. Edit source files in src/pages/ or public/js/ or public/css/

# 2. Build (injects nav, version-stamps all assets)
cd /Users/achugustave/Documents/Marriageducation/sbd-network
node build.js

# 3. Deploy to Firebase Hosting
firebase deploy --only hosting
```

### Updating Cloud Functions

```bash
cd /Users/achugustave/Documents/Marriageducation
firebase deploy --only functions
```

### Updating Firestore security rules

```bash
cd /Users/achugustave/Documents/Marriageducation
firebase deploy --only firestore:rules
```

### Full deploy (hosting + functions + rules)

```bash
firebase deploy
```

### Running maintenance scripts

```bash
cd /Users/achugustave/Documents/Marriageducation/sbd-network
node scripts/backfill-sbd-referral-codes.js
node scripts/reset-user-tiers.js
```

> ⚠️ Maintenance scripts require `serviceAccountKey.json` in `/Users/achugustave/Documents/Marriageducation/` — never commit this file.

---

## 11. Two Separate Sites, One Firebase Project

Both `sbd-network.web.app` and `marriageducation.com` share the **same Firebase project** (`marriage-education`) and therefore the same Firestore database, Auth system, and Cloud Functions.

| Site | Hosting | Deploy method | Users |
|---|---|---|---|
| `sbd-network.web.app` | Firebase Hosting (target: `sbd-network`) | `firebase deploy --only hosting` | Members, subscribers |
| `marriageducation.com` | FTP server (via GitHub Actions) | `git push origin main` → auto-FTP | Ambassadors, public |

Ambassadors register and are managed on `marriageducation.com`. When approved, the `provisionSBDAccess` Cloud Function creates their account on `sbd-network.web.app`.

---

## 12. Environment Configuration

Firebase Functions configuration (set via `firebase functions:config:set`):

| Key | Purpose |
|---|---|
| `stripe.secret_key` | Stripe API secret |
| `stripe.webhook_secret` | Stripe webhook signature verification |
| `telegram.bot_token` | Telegram Bot API token |
| `telegram.chat_id` | Telegram chat ID for admin alerts |

Cloudflare Worker is deployed separately with its own `wrangler.toml` and environment variables (R2 bucket name, Firebase service account credentials for token verification).

---

## 13. Known Architecture Notes for Consultants

1. **No bundler/transpiler.** All JS is written in vanilla ES2020 and served as-is. No TypeScript, no Babel, no tree-shaking. This keeps the build simple but means no automatic dead-code elimination.

2. **Firebase compat SDK (v8-style API).** The app uses `firebase.firestore()`, `firebase.auth()` syntax — the v9 compat layer. A migration to the modular v9 SDK would enable tree-shaking and reduce bundle size.

3. **Single Firestore rules file covers both sites.** `firestore.rules` in `sbd-network/` covers collections from both `marriageducation.com` and `sbd-network.web.app`. Changes must be deployed from `sbd-network/`: `firebase deploy --only firestore:rules`.

4. **Media stored in Cloudflare R2, not Firebase Storage.** Images and videos sent in DMs or posted to boards go to R2 via a Cloudflare Worker. Firebase Storage is used only for book PDFs and course assets. This reduces Firebase egress costs.

5. **No CI/CD for sbd-network.** Deploys are manual (`node build.js && firebase deploy`). `marriageducation.com` has a GitHub Actions FTP pipeline, but `sbd-network` does not.

6. **Service worker versioning.** `build.js` auto-stamps `service-worker.js` with a new cache version on every build. `sw-update-checker.js` polls `version.json` every 60 seconds and prompts users to reload when a new version is detected.

7. **Admin panel is NOT built via build.js.** `public/admin.html` is edited directly and deployed as-is. The bottom nav is not injected into it.

---

## 14. Recommended Improvements (for Consultant Review)

- **Add CI/CD for sbd-network** — GitHub Actions pipeline to auto-run `node build.js && firebase deploy` on push to `main`
- **Migrate to Firebase v9 modular SDK** — reduces initial JS payload by ~30%
- **Add TypeScript** — currently all vanilla JS with no type safety; significant risk surface as codebase grows
- **Centralise tier-check logic** — tier/subscription checks are duplicated across `learn-v2.js`, `tier-access.js`, `shop.js`, `tier.js`. A single `auth-context` module would reduce drift
- **Replace manual payment approval with proper MoMo API integration** — currently a human approves every Mobile Money payment manually
- **Add automated testing** — zero test coverage currently; recommend Playwright for E2E on auth/payment flows
- **Rate-limit Cloud Functions** — `submitManualPayment`, `registerReferralCode` have no rate limiting, potential abuse vector
- **Consolidate two sites** — `marriageducation.com` ambassador system and `sbd-network.web.app` share a database but have no unified codebase; merging or properly separating them would reduce maintenance complexity
