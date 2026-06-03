# Advanced Expression Gating (MV House + Advanced Boards)

## Rule (single gate)

**Advanced Muliebrity / Virility boards** and **MV House** unlock together when formation milestones are met — not on Elite payment alone.

## Milestones

| Step | Requirement |
|------|-------------|
| Premium arc | All **School 1** (courses 1–13) + **School 2** (courses 14–28) complete |
| School 3 | All **8** courses (29–36) complete |
| School 4 | **≥ 4 of 8** courses (37–44) complete (~50%) |

School 4 threshold implies School 3 is complete.

## Bypasses

- `role === 'admin'`
- Admin-granted Elite (`subscription.source === 'admin'` or staff grant end date ≥ 2090)
- **`staffAccess.advancedExpression === true`** — explicit toggle in Admin → Manage User (staff MV House / advanced boards)
- `progress.advancedExpressionUnlocked === true` (set when formation milestone met)

## Billing vs formation

- **Elite subscribe**: Schools 3–4 training groups; **not** advanced expression groups until milestone.
- **Ambassador / RD**: No automatic advanced access without Elite grant + milestone (or admin bypass).

## Course completion detection

Matches Firestore course doc IDs: `course-{no}-*` prefix in `users.progress.completedCourses`.

## Constants in code

- `public/js/advanced-expression-access.js` — client
- `functions/lib/advanced-expression-access.js` — Cloud Functions (keep in sync)
