# SBD Life Deployment-Safe Implementation Blueprint

## Objective
Build and validate SBD Life as an isolated, production-grade module before any live navigation integration.

This blueprint preserves all core requirements from the master prompt while reducing regression risk to existing SBD systems.

## Non-Negotiables Preserved
- Premium cultural/identity product direction (not blog/newspaper feed)
- Mobile-first cinematic UX quality bar
- Server-side governance and tier enforcement
- Compatibility with existing Messaging, Dating, MV House, subscriptions, and Firebase architecture
- No destabilization of existing production modules

## Safe Rollout Strategy
- **Phase gate model**: no phase advances until acceptance criteria are passed
- **Isolation-first**: implement under a private staging route (`/labs/sbd-life`)
- **No live nav integration** until business and technical sign-off
- **Feature flag control**: rollout is disabled by default in production navigation
- **Explicit rollback**: route can be disabled by removing link exposure while preserving tested code

## Build Location
- Frontend staging route: `public/labs/sbd-life/index.html`
- Staging scripts/styles: `public/js/sbd-life-labs.js`, `public/css/sbd-life-labs.css`
- Data model and policy implementation: Firestore collections and rules (introduced in phases)

## Phase Plan

### Phase 0 — Sandbox Foundation (No Live Integration)
Deliverables:
- Isolated SBD Life shell route with premium visual baseline
- Authenticated access + optional admin-only gate for staging
- Runtime diagnostics panel for readiness checks
- No hamburger/menu references to SBD Life

Acceptance criteria:
- Accessible only via direct URL
- Existing pages/routes unchanged
- No new runtime errors in console for baseline load

### Phase 1 — Canonical Data Contract + Governance Skeleton
Status: **complete** (contracts, transitions, field validation, sandbox probes)

### Phase 2 — Reading + Issue Experience (Sandbox)
Status: **complete** (labs article/issue pages, cinematic reader UI, demo seed)

### Phase 3 — Reflections + Messenger (Sandbox)
Status: **complete** (structured reflections, reactions, CE2 prefill bridge, article-gated rules)

### Phase 4 — Commerce + Entitlements (Sandbox)
Status: **complete** (subscription/issue entitlements, shop checkout links, server-side access rules)

### Phase 5 — Audio + Quotes + Discovery (Sandbox)
Status: **complete** (optional free browser listen, quote share cards, curated discovery rails)

Audio policy: listen is **opt-in only** — no paid TTS API. Device Speech Synthesis with editorial cue map (headings, pauses). Hosted MP3 path remains available in schema if ever needed later.

Deliverables:
- Canonical schema contracts for:
  - `sbdLifeArticles`
  - `sbdLifeIssues`
  - `sbdLifeDiscussions`
  - `sbdLifeSubscriptions`
  - `sbdLifeIssuePurchases`
  - `sbdLifeQuotes`
  - `sbdLifeAudio`
  - supporting analytics/moderation/trending/topic collections
- Server-side rule matrix (role x tier x status x action)
- Article status lifecycle constraints (`draft -> review -> scheduled -> published -> archived/hidden`)

Acceptance criteria:
- Lower tiers cannot discover restricted content IDs/slugs
- Reads/writes are blocked by Firestore rules when unauthorized
- Admin/editor/contributor capabilities match the matrix

### Phase 2 — Reading + Issue Experience (Core UX)
Deliverables:
- `/sbd-life/article/[slug]` and `/sbd-life/issue/[slug]` in staging form
- Cinematic article hero + premium typography + pull quotes + progress indicator
- Issue shell (cover, intro module, editor letter, themed sections)

Acceptance criteria:
- Mobile UX passes iOS safe-area and viewport checks
- Public vs tier-restricted rendering behavior verified
- Performance budgets met on representative mobile device

### Phase 3 — Reflections + Messenger Inheritance
Deliverables:
- Structured reflections model (no generic comments)
- Reflection types enum and moderation statuses
- Messenger share bridge with inherited article permissions

Acceptance criteria:
- Unauthorized users cannot read/write restricted discussion entries
- Shared thread access mirrors originating article tier constraints

### Phase 4 — Commerce + Entitlements
Deliverables:
- Issue purchase and subscription entitlement checks integrated with existing checkout model
- Entitlement resolver for article/issue access decisions

Acceptance criteria:
- Entitlements block access server-side when absent
- Existing checkout and order flows remain unaffected

### Phase 5 — Audio + Quote Engine + Discovery
Deliverables:
- Audio essay player with cached playback and progress persistence
- Quote extraction/share metadata pipeline
- Curated discovery rails and weighted trending logic

Acceptance criteria:
- Ranking uses weighted engagement inputs (not recency-only)
- Discovery output remains deterministic and curated

### Phase 6 — Production Integration
Status: **complete** (production routes, Lifestyle hamburger via feature flag, rollout runbook)

Deliverables:
- Add SBD Life into hamburger under Lifestyle only after sign-off
- Controlled rollout to selected cohorts
- Operational runbook + incident rollback notes

Rollout flag: `admin/flags.sbdLifeEnabled` (default off). Labs flag: `sbdLifeLabsEnabled`.

Acceptance criteria:
- No regression in Messaging, Dating, MV House, or existing dashboard flows
- Error budgets and analytics guardrails in acceptable range

## Governance Matrix (Required Before Live)
At minimum, define and enforce:
- Roles: `admin`, `editor`, `reviewer`, `contributor`, `elite_contributor`, `ambassador_contributor`, `moderator`
- Tiers: `public`, `foundation`, `premium`, `elite`, `admin`
- Statuses: `draft`, `review`, `scheduled`, `published`, `archived`, `hidden`
- Actions:
  - discover/list
  - read full content
  - read preview
  - create/edit
  - submit for review
  - publish/schedule/archive
  - moderate reflections
  - override featured/trending

## Test Blueprint (Must Pass Before Integration)
- **Security tests**: unauthorized reads/writes blocked for all restricted collections
- **Lifecycle tests**: invalid status transitions rejected
- **Entitlement tests**: tier/subscription/issue-purchase gates enforced
- **Integration tests**: Messenger, Dating, MV House links resolve without permission leaks
- **UX tests**: mobile safe-area, scroll rhythm, typography consistency
- **Performance tests**: lazy media loading, first render speed, memory stability

## Integration Criteria for Hamburger
SBD Life enters the live Lifestyle hamburger section only when:
- All phase acceptance criteria to Phase 5 are complete
- Security and governance tests are green
- Product sign-off confirms cinematic quality target
- Rollback instructions are documented and verified
