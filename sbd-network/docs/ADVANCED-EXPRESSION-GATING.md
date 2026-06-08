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

## Access chain (all required unless bypass)

1. **Elite billing** — `tier === 'elite'` or active elite subscription
2. **Community groups assigned** — both advanced expression group IDs in `users.groups` (auto-added by Cloud Function when milestone met, or admin checkbox)
3. **Not admin-revoked** — `access.advancedExpressionRevoked !== true`
4. **Unlock path** — formation milestone met, `progress.advancedExpressionUnlocked === true`, or explicit staff grant

## Bypasses

- `role === 'admin'`
- **`staffAccess.advancedExpression === true`** — Admin → Manage User → Staff expression toggle

## Admin revoke

Unchecking **Advanced Muliebrity / Virility + MV House** in Admin → Manage User:

- Removes both advanced group IDs from `users.groups`
- Clears `staffAccess.advancedExpression` and `progress.advancedExpressionUnlocked`
- Sets `access.advancedExpressionRevoked = true`

The Cloud Function `onUserAdvancedExpressionUnlock` **will not re-grant** while revoked.

## Billing vs formation

- **Elite subscribe**: Schools 3–4 training groups + standard elite boards; **not** advanced expression until milestone (or admin grant).
- **Formation hub (`/learn?tier=elite`)**: MV House and AMTS tiles show locked until `hasAdvancedExpressionAccess()` passes.

## Course completion detection

Matches Firestore course doc IDs: `course-{no}-*` prefix in `users.progress.completedCourses`.

## Constants in code

- `public/js/advanced-expression-access.js` — client
- `functions/lib/advanced-expression-access.js` — Cloud Functions (keep in sync)

## Enforced on

- `boards.js`, `board.js`, `mv-house.js`, `tier-access.js`, `learn-v2.js` (formation hub tiles)
- `onUserAdvancedExpressionUnlock` — auto-grant on milestone (respects revoke flag)
