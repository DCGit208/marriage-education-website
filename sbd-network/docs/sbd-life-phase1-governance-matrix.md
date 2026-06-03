# SBD Life Phase 1 — Governance Matrix

## Article status transitions (enforced in Firestore)

| From | Allowed next |
|------|----------------|
| draft | draft, review |
| review | review, draft, scheduled |
| scheduled | scheduled, review, published |
| published | published, archived, hidden |
| archived | archived, published, hidden |
| hidden | hidden, published, archived |

New articles may only be created with status `draft` or `review`.

## Read access (Phase 1)

| Actor | List articles | Get article |
|-------|---------------|-------------|
| Admin | Yes | Any status |
| Member | No (list blocked) | `published` + tier met + not hidden |
| Lower tier | No | Cannot read above `tierRequired` |

## Write access (Phase 1)

| Collection | Create | Update | Delete |
|------------|--------|--------|--------|
| sbdLifeArticles | Admin + valid fields | Admin + valid transition | Admin |
| sbdLifeIssues | Admin + valid fields | Admin | Admin |
| sbdLifeDiscussions | Owner + pending | Owner or admin | Owner or admin |
| sbdLifeReactions | Owner + valid type | Owner | Owner |

## Tier ranks (read gate)

`public` (0) < `foundation` (1) < `premium` (2) < `elite` (3) < `admin` (4)

Admin users are treated as rank 4 for policy checks.
